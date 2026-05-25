import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as nodeScrypt,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

interface ParsedScryptHash {
  salt: string;
  hash: string;
  params: {
    N: number;
    r: number;
    p: number;
  };
}

@Injectable()
export class PasswordService {
  private readonly keyLength = 64;
  private readonly params = {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  };

  // 使用 scrypt 对明文密码生成带参数和盐值的哈希。
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url');
    const derivedKey = await this.deriveKey(
      password,
      salt,
      this.keyLength,
      this.params,
    );

    return [
      'scrypt',
      'v1',
      `N=${this.params.N},r=${this.params.r},p=${this.params.p}`,
      salt,
      derivedKey.toString('base64url'),
    ].join('$');
  }

  // 使用存储哈希中的参数校验明文密码是否匹配。
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parsedHash = this.parseScryptHash(storedHash);

    if (!parsedHash) {
      return false;
    }

    const expected = Buffer.from(parsedHash.hash, 'base64url');
    const actual = await this.deriveKey(
      password,
      parsedHash.salt,
      expected.length,
      {
        ...parsedHash.params,
        maxmem: this.params.maxmem,
      },
    );

    if (actual.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(actual, expected);
  }

  // 解析项目自定义的 scrypt 哈希字符串。
  private parseScryptHash(storedHash: string): ParsedScryptHash | null {
    const [algorithm, version, rawParams, salt, hash] = storedHash.split('$');

    if (
      algorithm !== 'scrypt' ||
      version !== 'v1' ||
      !rawParams ||
      !salt ||
      !hash
    ) {
      return null;
    }

    const params = Object.fromEntries(
      rawParams.split(',').map((pair) => {
        const [key, value] = pair.split('=');
        return [key, Number(value)];
      }),
    );

    if (!params.N || !params.r || !params.p) {
      return null;
    }

    return {
      salt,
      hash,
      params: {
        N: params.N,
        r: params.r,
        p: params.p,
      },
    };
  }

  // 调用 Node scrypt 派生密码密钥。
  private deriveKey(
    password: string,
    salt: string,
    keyLength: number,
    options: ScryptOptions,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      });
    });
  }
}
