/**
 * 用 Web Crypto 加密 / 解密 Gist 内容。
 *
 * Gist 的 secret 只是「不被检索」，知道链接的人都能访问，所以敏感数据在推送前
 * 先本地加密：PBKDF2-SHA256 从密码派生 AES-GCM 密钥，密文里自带随机 salt 与 IV。
 *
 * 载荷格式（单行文本，便于原样写进 Gist）：
 *   firecalc-gist-enc:v1:<base64 salt>.<base64 iv>.<base64 ciphertext>
 */

const PAYLOAD_PREFIX = 'firecalc-gist-enc:v1:'
const PBKDF2_ITERATIONS = 250_000
const SALT_BYTES = 16
const IV_BYTES = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle)
    throw new Error('当前环境不支持 Web Crypto，请使用 HTTPS 或 localhost 打开')
  return subtle
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedPayload(text: string): boolean {
  return text.trim().startsWith(PAYLOAD_PREFIX)
}

export async function encryptText(password: string, plaintext: string): Promise<string> {
  if (!password)
    throw new Error('密码为空，无法加密')
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const cipher = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  return `${PAYLOAD_PREFIX}${toBase64(salt)}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

export async function decryptText(password: string, payload: string): Promise<string> {
  const raw = payload.trim()
  if (!raw.startsWith(PAYLOAD_PREFIX))
    throw new Error('内容不是加密数据')
  const parts = raw.slice(PAYLOAD_PREFIX.length).split('.')
  if (parts.length !== 3 || parts.some(p => !p))
    throw new Error('加密数据格式不正确')
  const [salt, iv, data] = parts.map(fromBase64)
  const key = await deriveKey(password, salt)
  try {
    const plain = await getSubtle().decrypt({ name: 'AES-GCM', iv }, key, data)
    return decoder.decode(plain)
  }
  catch {
    throw new Error('解密失败：密码不正确，或内容已损坏')
  }
}
