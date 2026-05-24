import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  randomUUID,
  type KeyObject,
} from 'node:crypto';

type PasswordTransportKey = {
  keyId: string;
  publicKeyPem: string;
  privateKey: KeyObject;
  expiresAt: Date;
};

/** nonce 记录：绑定 keyId，一次性消耗 */
type NonceRecord = {
  keyId: string;
  used: boolean;
  expiresAt: Date;
};

export type PasswordPublicKeyResponse = {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  publicKeyPem: string;
  expiresAt: string;
  /** 一次性随机数，登录/注册时必须原样回传，消耗后不可重放 */
  nonce: string;
};

@Injectable()
export class PasswordCryptoService {
  private readonly logger = new Logger(PasswordCryptoService.name);
  private readonly ttlMs = 10 * 60 * 1000;
  private currentKey: PasswordTransportKey | null = null;
  private previousKey: PasswordTransportKey | null = null;

  /**
   * nonce 存储：nonce → { keyId, used, expiresAt }
   * - 与 RSA 密钥对共存于内存，服务重启时密钥和 nonce 同时失效，不会出现孤儿 nonce
   * - 过期 nonce 在 consumeNonce 时惰性清理
   */
  private readonly nonces = new Map<string, NonceRecord>();

  getPublicKey(): PasswordPublicKeyResponse {
    const key = this.getCurrentKey();

    const nonce = randomUUID();
    this.nonces.set(nonce, {
      keyId: key.keyId,
      used: false,
      expiresAt: key.expiresAt,
    });

    return {
      keyId: key.keyId,
      algorithm: 'RSA-OAEP-256',
      publicKeyPem: key.publicKeyPem,
      expiresAt: key.expiresAt.toISOString(),
      nonce,
    };
  }

  /**
   * 消耗 nonce：校验有效性后立即标记已用。
   * 必须在密码解密之前调用，确保同一密文无法被重放。
   *
   * @throws BadRequestException — nonce 不存在 / 已消耗 / 已过期 / keyId 不匹配
   */
  consumeNonce(nonce: string, keyId: string): void {
    const record = this.nonces.get(nonce);

    if (!record) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    if (record.used) {
      this.logger.warn(`Replay attack detected: nonce already consumed (keyId=${keyId})`);
      throw new BadRequestException('Nonce has already been used');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      this.cleanupNonce(nonce);
      throw new BadRequestException('Nonce has expired');
    }

    if (record.keyId !== keyId) {
      this.logger.warn(`Nonce-keyId mismatch: nonce bound to ${record.keyId}, got ${keyId}`);
      throw new BadRequestException('Nonce does not match keyId');
    }

    // 标记已用
    record.used = true;

    // 惰性清理：每次消耗时顺便清理一批过期 nonce，防止内存泄漏
    this.cleanupExpiredNonces();
  }

  decryptPassword(ciphertext: string, keyId: string): string {
    const key = this.findDecryptKey(keyId);

    try {
      const decrypted = privateDecrypt(
        {
          key: key.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(ciphertext, 'base64'),
      );

      return decrypted.toString('utf8');
    } catch {
      throw new BadRequestException('Password payload is invalid or expired');
    }
  }

  private getCurrentKey(): PasswordTransportKey {
    const now = Date.now();

    if (this.currentKey && this.currentKey.expiresAt.getTime() > now) {
      return this.currentKey;
    }

    if (this.currentKey) {
      this.previousKey = this.currentKey;
    }

    this.currentKey = this.createKey();
    return this.currentKey;
  }

  private findDecryptKey(keyId: string): PasswordTransportKey {
    const now = Date.now();
    const key =
      this.currentKey?.keyId === keyId
        ? this.currentKey
        : this.previousKey?.keyId === keyId
          ? this.previousKey
          : null;

    if (!key || key.expiresAt.getTime() <= now) {
      throw new BadRequestException('Password payload is invalid or expired');
    }

    return key;
  }

  private createKey(): PasswordTransportKey {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });

    return {
      keyId: randomUUID(),
      publicKeyPem: publicKey.export({
        format: 'pem',
        type: 'spki',
      }) as string,
      privateKey,
      expiresAt: new Date(Date.now() + this.ttlMs),
    };
  }

  /** 删除单个 nonce */
  private cleanupNonce(nonce: string): void {
    this.nonces.delete(nonce);
  }

  /** 惰性清理所有过期 nonce，限制单次扫描量避免阻塞事件循环 */
  private cleanupExpiredNonces(): void {
    const now = Date.now();
    let scanned = 0;
    const MAX_SCAN = 500;

    for (const [nonce, record] of this.nonces) {
      if (record.expiresAt.getTime() <= now) {
        this.nonces.delete(nonce);
      }
      scanned += 1;
      if (scanned >= MAX_SCAN) break;
    }
  }
}
