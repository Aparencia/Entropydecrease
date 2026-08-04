/**
 * 加密备份与恢复区块
 *
 * @ai-context: 从 DataSettings 拆出。创建备份：有密码走 AES-256-GCM
 * 加密（backupCrypto），无密码走明文导出；恢复时按 salt+iv+ciphertext
 * 字段自动检测加密/明文格式。下载文件名前缀 entropy-decrease-backup。
 */
import { useState, useRef } from 'react';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Lock, Shield, Upload } from 'lucide-react';
import { exportAllData, downloadExport, importData, readFileAsText } from '@/lib/storage';
import { encryptBackup, decryptBackup, type EncryptedBackup } from '@/lib/crypto/backupCrypto';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

export function EncryptedBackupSection() {
  const { toast } = useToast();
  const [backupPassword, setBackupPassword] = useState('');
  const [creatingEncryptedBackup, setCreatingEncryptedBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // 创建加密备份
  const handleEncryptedBackup = async () => {
    try {
      setCreatingEncryptedBackup(true);
      const json = await exportAllData();
      const plaintext = JSON.stringify(json);

      if (backupPassword.trim()) {
        const encrypted = await encryptBackup(plaintext, backupPassword);
        const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `entropy-decrease-backup-encrypted-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        soundPlayer.play('data_export');
        toast({ type: 'success', message: '加密备份已下载', silent: true });
      } else {
        downloadExport(json);
        soundPlayer.play('data_export');
        toast({ type: 'success', message: '数据导出成功（未加密）', silent: true });
      }
    } catch {
      toast({ type: 'error', message: '备份失败，请重试' });
    } finally {
      setCreatingEncryptedBackup(false);
    }
  };

  // 从备份文件恢复（自动检测加密/明文）
  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setRestoringBackup(true);
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);

      // Auto-detect: if parsed has salt+iv+ciphertext, it's encrypted
      if (parsed.salt && parsed.iv && parsed.ciphertext) {
        if (!restorePassword.trim()) {
          toast({ type: 'error', message: '这是加密备份，请输入解密密码' });
          setRestoringBackup(false);
          return;
        }
        const plaintext = await decryptBackup(parsed as EncryptedBackup, restorePassword);
        const result = await importData(plaintext);
        if (result.success) {
          soundPlayer.play('data_import');
          toast({ type: 'success', message: result.message, silent: true });
          setTimeout(() => window.location.reload(), 800);
        } else {
          toast({ type: 'error', message: result.message });
        }
      } else {
        // Plain JSON backup
        const result = await importData(text);
        if (result.success) {
          soundPlayer.play('data_import');
          toast({ type: 'success', message: result.message, silent: true });
          setTimeout(() => window.location.reload(), 800);
        } else {
          toast({ type: 'error', message: result.message });
        }
      }
    } catch (err) {
      // 判断是否为解密失败（AES-GCM 密码错误抛出 DOMException OperationError）
      if (err instanceof DOMException && err.name === 'OperationError') {
        toast({ type: 'error', message: '解密失败，请检查密码是否正确' });
      } else if (err instanceof Error && err.message.includes('DECRYPT_FAILED')) {
        toast({ type: 'error', message: '解密失败，请检查密码是否正确' });
      } else {
        toast({ type: 'error', message: '恢复失败，请检查文件格式' });
      }
    } finally {
      setRestoringBackup(false);
    }
  };

  return (
    <>
      {/* 本地加密备份 */}
      <div className="border-t border-border/30 pt-kb-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">本地加密备份</h3>
        </div>
        <p className="text-c1 text-text-tertiary">
          使用 AES-256-GCM 加密你的备份数据，设置密码保护隐私。
        </p>
        <Input
          size="sm"
          type="password"
          placeholder="设置备份密码（可选，留空则不加密）"
          value={backupPassword}
          onChange={(e) => setBackupPassword(e.target.value)}
        />
        <Button
          variant="primary"
          size="md"
          icon={<Shield className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleEncryptedBackup}
          disabled={creatingEncryptedBackup}
        >
          {creatingEncryptedBackup
            ? '创建中…'
            : backupPassword.trim()
              ? '创建加密备份'
              : '创建备份（未加密）'}
        </Button>
      </div>

      {/* 恢复数据 */}
      <div className="border-t border-border/30 pt-kb-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">恢复数据</h3>
        </div>
        <p className="text-c1 text-text-tertiary">
          支持普通备份和加密备份文件，自动检测文件格式。
        </p>
        <Input
          size="sm"
          type="password"
          placeholder="解密密码（仅加密备份需要）"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
        />
        <Button
          variant="secondary"
          size="md"
          icon={<Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={() => backupFileInputRef.current?.click()}
          disabled={restoringBackup}
        >
          {restoringBackup ? '恢复中…' : '选择备份文件'}
        </Button>
        <input
          ref={backupFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleBackupFileChange}
        />
      </div>
    </>
  );
}
