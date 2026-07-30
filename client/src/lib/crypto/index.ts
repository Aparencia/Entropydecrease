/**
 * 加密模块导出入口
 *
 * @ai-context: 纯 re-export。加密密钥绑定设备且不可跨设备恢复，
 * 详见 CryptoManager 文件头警示。
 */

export { deriveKey, encrypt, decrypt, generateSalt } from './encryption';
export { CryptoManager, cryptoManager } from './CryptoManager';
export { encryptBackup, decryptBackup, type EncryptedBackup } from './backupCrypto';
