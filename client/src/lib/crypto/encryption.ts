/**
 * AES-GCM 256 位加密模块
 * 使用 Web Crypto API 实现本地数据加密
 * - 密钥派生：PBKDF2（100,000 次迭代，SHA-256）
 * - 加密模式：AES-GCM（authenticated encryption）
 * - IV：12 字节随机数（每次加密重新生成）
 *
 * @ai-context: PBKDF2 迭代次数（100,000）与 CryptoManager 存量密钥派生绑定，提高迭代次数会使历史密文无法解密，禁止单独修改。
 * @ai-context: 密钥不可导出（extractable=false），仅存内存。除随机数生成外为纯函数。
 */

import { toBase64, fromBase64 } from './utils';

const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * 生成随机 salt（16 字节）
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * 从密码（或设备密钥）派生 AES-256 密钥
 * 使用 PBKDF2 + SHA-256，100,000 次迭代
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // 先将密码导入为原始密钥材料
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // 派生 AES-GCM 密钥
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // 不可导出，仅内存可用
    ['encrypt', 'decrypt']
  );
}

/**
 * AES-GCM 加密
 * 自动生成 12 字节 IV，返回 base64 编码的 ciphertext 和 iv
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded
  );

  return {
    ciphertext: toBase64(new Uint8Array(encryptedBuffer)),
    iv: toBase64(iv),
  };
}

/**
 * AES-GCM 解密
 * 接收 base64 编码的 ciphertext 和 iv，返回明文字符串
 */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
    key,
    fromBase64(ciphertext) as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}
