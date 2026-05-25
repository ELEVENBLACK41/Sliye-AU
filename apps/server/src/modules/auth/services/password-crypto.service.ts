import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  constants,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  randomUUID,
  type KeyObject,
} from 'node:crypto';
import type { PasswordPublicKey } from '@workspace/contracts/auth';

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

export type PasswordPublicKeyResponse = PasswordPublicKey;

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

  /**
   * 密文去重存储：keyId → Set<ciphertextHash>
   * - 同一 keyId 下，同一密文只能被解密一次（即使换了新 nonce）
   * - 防止攻击者截获密文后，获取新 nonce 搭配旧密文重放
   * - RSA-OAEP 每次加密产生不同密文，所以合法用户不会误触
   */
  private readonly usedCiphertexts = new Map<string, Set<string>>();

  // 返回当前密码传输公钥并签发一次性 nonce。
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
   * 消耗 nonce 并校验密文唯一性。
   * 必须在密码解密之前调用，确保同一密文无法被重放。
   *
   * 双重防护：
   * 1. nonce 一次性消耗 — 防止同一请求原样重放
   * 2. 密文哈希去重 — 防止截获密文后换新 nonce 重放（同一 keyId 下）
   *
   * @throws BadRequestException — nonce 无效 / 密文已被使用
   */
  // 消费 nonce 并记录密文哈希以防止重复提交。
  consumeNonce(nonce: string, keyId: string, ciphertext: string): void {
    const record = this.nonces.get(nonce);

    if (!record) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    if (record.used) {
      this.logger.warn(
        `Replay attack detected: nonce already consumed (keyId=${keyId})`,
      );
      throw new BadRequestException('Nonce has already been used');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      this.cleanupNonce(nonce);
      throw new BadRequestException('Nonce has expired');
    }

    if (record.keyId !== keyId) {
      this.logger.warn(
        `Nonce-keyId mismatch: nonce bound to ${record.keyId}, got ${keyId}`,
      );
      throw new BadRequestException('Nonce does not match keyId');
    }

    // --- 密文去重：同一 keyId 下，同一密文只能用一次 ---
    const ciphertextHash = createHash('sha256')
      .update(ciphertext)
      .digest('hex');
    const usedSet = this.usedCiphertexts.get(keyId);

    if (usedSet?.has(ciphertextHash)) {
      this.logger.warn(
        `Replay attack detected: ciphertext already used with keyId=${keyId}`,
      );
      throw new BadRequestException(
        'Password ciphertext has already been used',
      );
    }

    // 标记 nonce 已用
    record.used = true;

    // 记录密文哈希
    if (!usedSet) {
      this.usedCiphertexts.set(keyId, new Set([ciphertextHash]));
    } else {
      usedSet.add(ciphertextHash);
    }

    // 惰性清理：每次消耗时顺便清理一批过期 nonce，防止内存泄漏
    this.cleanupExpiredNonces();
  }

  // 使用指定 keyId 对应私钥解密密码密文。
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

  // 获取当前有效密钥，必要时生成新密钥并轮换旧密钥。
  private getCurrentKey(): PasswordTransportKey {
    const now = Date.now();

    if (this.currentKey && this.currentKey.expiresAt.getTime() > now) {
      return this.currentKey;
    }

    if (this.currentKey) {
      this.previousKey = this.currentKey;
    }

    this.currentKey = this.createKey();

    // 新密钥生成时，清理已过期密钥的密文记录
    if (this.previousKey && this.previousKey.expiresAt.getTime() <= now) {
      this.usedCiphertexts.delete(this.previousKey.keyId);
      this.previousKey = null;
    }

    return this.currentKey;
  }

  // 根据 keyId 查找仍可用于解密的当前或上一把私钥。
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

  // 生成新的 RSA-OAEP 密码传输密钥对。
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
  // 删除指定 nonce 记录。
  private cleanupNonce(nonce: string): void {
    this.nonces.delete(nonce);
  }

  /** 惰性清理所有过期 nonce，限制单次扫描量避免阻塞事件循环 */
  // 批量清理已过期 nonce，限制单次扫描数量。
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
