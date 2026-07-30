/**
 * backupCrypto 备份加密单元测试
 *
 * 使用 jsdom 环境提供的 Web Crypto API
 */
import { describe, it, expect } from 'vitest';
import { encryptBackup, decryptBackup, type EncryptedBackup } from './backupCrypto';

describe('encryptBackup + decryptBackup', () => {
  const testPassword = 'test-password-123!';
  const testPlaintext = JSON.stringify({
    notes: [{ id: '1', title: '学习笔记', content: 'SM-2 算法...' }],
    flashcards: [{ id: '2', front: '什么是间隔重复？', back: '一种记忆方法' }],
  });

  it('加密后能成功解密还原原文', async () => {
    const encrypted = await encryptBackup(testPlaintext, testPassword);
    const decrypted = await decryptBackup(encrypted, testPassword);
    expect(decrypted).toBe(testPlaintext);
  });

  it('加密结果包含 salt、iv、ciphertext 三个字段', async () => {
    const encrypted = await encryptBackup(testPlaintext, testPassword);
    expect(encrypted.salt).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();
    // 均为 base64 字符串
    expect(typeof encrypted.salt).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.ciphertext).toBe('string');
  });

  it('每次加密产生不同的 salt 和 iv（随机性）', async () => {
    const enc1 = await encryptBackup(testPlaintext, testPassword);
    const enc2 = await encryptBackup(testPlaintext, testPassword);
    // salt 或 iv 至少有一个不同
    expect(enc1.salt !== enc2.salt || enc1.iv !== enc2.iv).toBe(true);
  });

  it('错误密码解密失败（抛出异常）', async () => {
    const encrypted = await encryptBackup(testPlaintext, testPassword);
    await expect(decryptBackup(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('空密码抛出异常', async () => {
    await expect(encryptBackup(testPlaintext, '')).rejects.toThrow('password is required');
    const encrypted: EncryptedBackup = { salt: 'a', iv: 'b', ciphertext: 'c' };
    await expect(decryptBackup(encrypted, '')).rejects.toThrow('password is required');
  });

  it('Unicode 内容能正确加解密', async () => {
    const unicode = '你好世界 🎉 Hello World! Ñoño café';
    const encrypted = await encryptBackup(unicode, testPassword);
    const decrypted = await decryptBackup(encrypted, testPassword);
    expect(decrypted).toBe(unicode);
  });

  it('大文本加解密正确', async () => {
    const largeText = 'a'.repeat(100_000);
    const encrypted = await encryptBackup(largeText, testPassword);
    const decrypted = await decryptBackup(encrypted, testPassword);
    expect(decrypted).toBe(largeText);
  });
});
