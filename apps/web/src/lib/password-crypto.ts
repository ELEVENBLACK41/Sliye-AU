// 密码加密相关的工具函数，使用 Web Crypto API 实现 RSA-OAEP 加密。addBy Sliye on 2025-0523



import type { PasswordPayload, PasswordPublicKey } from '@/features/auth/types/auth.type';
import { requestData } from '@/services/request';

export async function encryptPasswordForTransport(password: string): Promise<PasswordPayload> {
  // 先拿一次性公钥 + nonce，密码只把密文传给 BFF，避免明文出现在请求体里。
  const publicKey = await requestData<PasswordPublicKey>('/api/auth/password-public-key', {
    method: 'GET',
    credentials: 'same-origin',
    errorMessage: '无法获取密码加密公钥',
  });

  const key = await importRsaOaepPublicKey(publicKey.publicKeyPem);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(password));

  return {
    passwordCiphertext: arrayBufferToBase64(encrypted),
    passwordKeyId: publicKey.keyId,
    nonce: publicKey.nonce,
  };
}

async function importRsaOaepPublicKey(publicKeyPem: string) {
  const keyBuffer = pemToArrayBuffer(publicKeyPem);

  return crypto.subtle.importKey(
    'spki',
    keyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt'],
  );
}

function pemToArrayBuffer(publicKeyPem: string) {
  const base64 = publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
