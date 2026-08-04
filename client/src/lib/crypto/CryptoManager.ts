/**
 * 加密管理器 - 单例模式
 * 管理 AES-GCM 密钥的生命周期：
 * - 使用设备级随机密钥（无需用户输入 PIN）
 * - salt 持久化到 localStorage，密钥仅在内存中
 * - 应用重启后需重新初始化
 *
 * @ai-context: 警告——keban_crypto_salt / keban_device_key 两个 localStorage 键名绝对不可改名：改名会丢失密钥派生材料，导致用户已加密数据永久无法解密。品牌统一改名任务明确豁免此文件。
 * @ai-context: encryptField/decryptField 未初始化时优雅降级返回原文，兼容未加密旧数据。
 */

import { deriveKey, encrypt, decrypt, generateSalt } from './encryption';

const SALT_STORAGE_KEY = 'keban_crypto_salt';
// 设备级随机密钥材料，每个用户设备唯一，存 localStorage 仅作密钥派生输入
const DEVICE_KEY_STORAGE_KEY = 'keban_device_key';

export class CryptoManager {
  private key: CryptoKey | null = null;
  /** FRONT2-M5: init 派生失败标记——供 UI 提示"加密未启用"，
   * 避免用户以为敏感字段已加密（原实现静默置 null 后明文写入） */
  private initFailed = false;
  private static instance: CryptoManager | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): CryptoManager {
    if (!CryptoManager.instance) {
      CryptoManager.instance = new CryptoManager();
    }
    return CryptoManager.instance;
  }

  /**
   * 初始化密钥（用户登录后调用）
   * 使用设备级随机密钥 + 持久化 salt 派生 AES-256 密钥
   * @param userId 当前用户 ID（用于隔离不同用户的密钥材料）
   */
  async init(userId: string): Promise<void> {
    try {
      // 获取或生成 salt
      let salt = this.loadSalt();
      if (!salt) {
        salt = generateSalt();
        this.saveSalt(salt);
      }

      // 获取或生成设备级随机密钥材料（Electron 环境经 safeStorage 加密落盘）
      const deviceKey = await this.getOrCreateDeviceKey(userId);

      // 派生 AES-GCM 密钥（PBKDF2，100,000 次迭代）
      this.key = await deriveKey(deviceKey, salt);
      this.initFailed = false;
    } catch (error) {
      // eslint-disable-next-line no-console -- 加密初始化失败需记录
      console.error('[CryptoManager] Failed to initialize key:', error);
      this.key = null;
      // FRONT2-M5: 显式标记初始化失败并向上抛出——原实现静默置 null 后
      // encryptField 走"未就绪"分支明文写入敏感字段，用户误以为已加密
      this.initFailed = true;
      throw error;
    }
  }

  /**
   * 检查加密管理器是否已就绪
   */
  isReady(): boolean {
    return this.key !== null;
  }

  /**
   * 检查密钥初始化是否失败（FRONT2-M5）
   * 初始化失败时加密不可用且不会静默降级为明文——UI 应据此提示用户
   */
  hasInitFailed(): boolean {
    return this.initFailed;
  }

  /**
   * 加密敏感字段
   * 返回 JSON 字符串 { ciphertext, iv }，可直接存入数据库字段
   * 若未初始化则直接返回原文（优雅降级）
   */
  async encryptField(value: string): Promise<string> {
    if (!this.key) {
      // 未初始化时优雅降级：不加密
      return value;
    }
    const { ciphertext, iv } = await encrypt(value, this.key);
    return JSON.stringify({ ciphertext, iv });
  }

  /**
   * 解密敏感字段
   * 接收 JSON 字符串 { ciphertext, iv }，返回明文
   * 若未初始化则直接返回原值（优雅降级，兼容未加密的旧数据）
   */
  async decryptField(encrypted: string): Promise<string> {
    if (!this.key) {
      // 未初始化时优雅降级：不解密
      return encrypted;
    }

    try {
      const parsed = JSON.parse(encrypted);
      // 检查是否为加密格式（含 ciphertext 和 iv 字段）
      if (parsed && typeof parsed.ciphertext === 'string' && typeof parsed.iv === 'string') {
        return await decrypt(parsed.ciphertext, parsed.iv, this.key);
      }
      // 非加密格式（旧数据），直接返回
      return encrypted;
    } catch (err) {
      // JSON 解析失败说明是未加密的旧数据，直接返回
      // 但若值看起来像加密格式（以 { 开头），可能是解密失败，记录日志
      if (encrypted.trim().startsWith('{')) {
        console.error('[Crypto] decryptField failed: ciphertext format detected but decryption failed', err);
      }
      return encrypted;
    }
  }

  /**
   * 清除密钥（用户登出时调用）
   */
  clear(): void {
    this.key = null;
  }

  // ─── 私有辅助方法 ────────────────────────────────────────────────────────

  /**
   * 从 localStorage 加载 salt
   */
  private loadSalt(): Uint8Array | null {
    try {
      const stored = localStorage.getItem(SALT_STORAGE_KEY);
      if (!stored) return null;
      const bytes = new Uint8Array(JSON.parse(stored));
      return bytes.length > 0 ? bytes : null;
    } catch {
      return null;
    }
  }

  /**
   * 将 salt 保存到 localStorage
   */
  private saveSalt(salt: Uint8Array): void {
    localStorage.setItem(SALT_STORAGE_KEY, JSON.stringify(Array.from(salt)));
  }

  /**
   * 获取或创建设备级随机密钥材料
   * 每个 userId 隔离存储，确保不同用户的密钥材料独立
   *
   * @security 此加密仅防"本地文件拷贝"场景（其他人直接复制 IndexedDB 文件
   * 无法读取加密字段）。FRONT2-M5: Electron 环境优先经 safeStorage（OS 级
   * 加密：Windows DPAPI / macOS Keychain）加密后落 localStorage，杜绝
   * XSS 直读明文密钥；Web 环境无 safeStorage 时回退明文（原行为）。
   */
  private async getOrCreateDeviceKey(userId: string): Promise<string> {
    const storageKey = `${DEVICE_KEY_STORAGE_KEY}_${userId}`;
    const encryptedKey = `${storageKey}_enc`;

    // 1) Electron 环境：优先 safeStorage 加密存储
    const api = window.electronAPI;
    if (api?.safeStorageEncrypt && api?.safeStorageDecrypt) {
      const storedEnc = localStorage.getItem(encryptedKey);
      if (storedEnc) {
        try {
          return await api.safeStorageDecrypt(storedEnc);
        } catch {
          // OS 密钥轮换/系统重装导致解密失败：回退重建新密钥材料
          console.warn('[CryptoManager] safeStorage 解密失败，重建密钥材料');
        }
      }
      const deviceKey = this.generateDeviceKey();
      try {
        const encoded = await api.safeStorageEncrypt(deviceKey);
        localStorage.setItem(encryptedKey, encoded);
        // 清理旧的明文版本（若存在）
        localStorage.removeItem(storageKey);
        return deviceKey;
      } catch (err) {
        // safeStorage 不可用（Linux 无 keyring 等）：回退明文存储
        console.warn('[CryptoManager] safeStorage 不可用，回退明文存储:', err);
        return this.getOrCreateDeviceKeyPlain(storageKey);
      }
    }

    // 2) Web 环境：回退明文存储（原行为）
    return this.getOrCreateDeviceKeyPlain(storageKey);
  }

  /** 生成 32 字节随机密钥材料（hex 字符串） */
  private generateDeviceKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** 明文 localStorage 存储（Web 环境兜底） */
  private getOrCreateDeviceKeyPlain(storageKey: string): string {
    let deviceKey = localStorage.getItem(storageKey);
    if (!deviceKey) {
      deviceKey = this.generateDeviceKey();
      localStorage.setItem(storageKey, deviceKey);
    }
    return deviceKey;
  }
}

/**
 * 导出单例实例
 */
export const cryptoManager = CryptoManager.getInstance();
