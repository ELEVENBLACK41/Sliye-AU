import { BadRequestException, Injectable } from '@nestjs/common';
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

export type PasswordPublicKeyResponse = {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  publicKeyPem: string;
  expiresAt: string;
};

@Injectable()
export class PasswordCryptoService {
  private readonly ttlMs = 10 * 60 * 1000;
  private currentKey: PasswordTransportKey | null = null;
  private previousKey: PasswordTransportKey | null = null;

  getPublicKey(): PasswordPublicKeyResponse {
    const key = this.getCurrentKey();

    return {
      keyId: key.keyId,
      algorithm: 'RSA-OAEP-256',
      publicKeyPem: key.publicKeyPem,
      expiresAt: key.expiresAt.toISOString(),
    };
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
}
