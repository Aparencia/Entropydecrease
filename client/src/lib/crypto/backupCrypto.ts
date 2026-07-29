/**
 * 备份加密模块
 * v0.9.0: 基于 AES-256-GCM + PBKDF2 的备份文件加密/解密
 *
 * 使用 Web Crypto API，支持用户密码派生密钥
 * - 密钥派生：PBKDF2（310,000 次迭代，SHA-256，OWASP 2023 推荐值）
 * - 加密模式：AES-256-GCM（authenticated encryption）
 * - salt：每次加密随机生成 16 字节
 * - IV：每次加密随机生成 12 字节
 *
 * 输出格式：JSON 字符串 { salt, iv, ciphertext }，均为 base64 编码
 *
 * 纯函数设计，无副作用，便于单元测试
 *
 * @ai-context: 310,000 迭代参数已固化进历史备份文件的派生逻辑，修改会使旧备份无法用原密码解密。备份文件自包含（salt/iv 随文件存储），与 CryptoManager 的设备密钥体系相互独立。
 */

const PBKDF2_ITERATIONS = 310_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/** 加密后的备份数据结构 */
export interface EncryptedBackup {
  /** base64 编码的 salt（16 字节） */
  salt: string;
  /** base64 编码的 IV（12 字节） */
  iv: string;
  /** base64 编码的密文 */
  ciphertext: string;
}

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

import { toBase64, fromBase64 } from './utils';

/**
 * 从密码和 salt 派生 AES-256-GCM 密钥
 */
async function deriveBackupKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 加密备份数据
 *
 * @param plaintext 明文备份内容（通常是 JSON.stringify 后的字符串）
 * @param password  用户密码（用于密钥派生）
 * @returns EncryptedBackup 对象，可 JSON.stringify 后存储
 *
 * @example
 * ```ts
 * const backup = JSON.stringify(myData);
 * const encrypted = await encryptBackup(backup, 'my-password');
 * // 存储 JSON.stringify(encrypted)
 * ```
 */
export async function encryptBackup(
  plaintext: string,
  password: string
): Promise<EncryptedBackup> {
  if (!password) {
    throw new Error('[backupCrypto] password is required');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveBackupKey(password, salt);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encryptedBuffer)),
  };
}

/**
 * 解密备份数据
 *
 * @param encrypted EncryptedBackup 对象（通常从 JSON.parse 得到）
 * @param password  用户密码（必须与加密时使用相同密码）
 * @returns 解密后的明文备份内容
 * @throws 密码错误或数据损坏时抛出解密失败异常
 *
 * @example
 * ```ts
 * const encrypted: EncryptedBackup = JSON.parse(storedData);
 * const plaintext = await decryptBackup(encrypted, 'my-password');
 * const myData = JSON.parse(plaintext);
 * ```
 */
export async function decryptBackup(
  encrypted: EncryptedBackup,
  password: string
): Promise<string> {
  if (!password) {
    throw new Error('[backupCrypto] password is required');
  }

  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);

  const key = await deriveBackupKey(password, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}
