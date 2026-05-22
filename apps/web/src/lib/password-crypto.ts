import type {
  PasswordPayload,
  PasswordPublicKey,
} from "@/features/auth/types/auth.type"

export async function encryptPasswordForTransport(
  password: string,
): Promise<PasswordPayload> {
  // Avoid exposing plaintext passwords in DevTools request bodies; HTTPS is still required in production.
  const response = await fetch("/api/auth/password-public-key", {
    method: "GET",
    credentials: "same-origin",
  })
  const result = (await response.json()) as {
    code: number
    message: string
    data: PasswordPublicKey | null
  }

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(result.message || "无法获取密码加密公钥")
  }

  const key = await importRsaOaepPublicKey(result.data.publicKeyPem)
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    new TextEncoder().encode(password),
  )

  return {
    passwordCiphertext: arrayBufferToBase64(encrypted),
    passwordKeyId: result.data.keyId,
  }
}

async function importRsaOaepPublicKey(publicKeyPem: string) {
  const keyBuffer = pemToArrayBuffer(publicKeyPem)

  return crypto.subtle.importKey(
    "spki",
    keyBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"],
  )
}

function pemToArrayBuffer(publicKeyPem: string) {
  const base64 = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "")
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}
