/**
 * @ai-context: 设置页 Hook：useEncryptedBackup。
 */
import { useState, useRef } from 'react';
import { exportAllData, downloadExport, importData, readFileAsText } from '@/lib/storage';
import { encryptBackup, decryptBackup, type EncryptedBackup } from '@/lib/crypto/backupCrypto';
import { useToast } from '@/components/ui/Toast';

/**
 * 加密备份 Hook
 * 管理加密备份创建和备份恢复逻辑。
 */
export function useEncryptedBackup() {
  const { toast } = useToast();
  const [backupPassword, setBackupPassword] = useState('');
  const [creatingEncryptedBackup, setCreatingEncryptedBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

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
        a.href = url; a.download = `entropy-decrease-backup-encrypted-${Date.now()}.json`; a.click();
        URL.revokeObjectURL(url);
        toast({ type: 'success', message: '加密备份已下载' });
      } else {
        downloadExport(json);
        toast({ type: 'success', message: '数据导出成功（未加密）' });
      }
    } catch {
      toast({ type: 'error', message: '备份失败，请重试' });
    } finally {
      setCreatingEncryptedBackup(false);
    }
  };

  const handleBackupFileClick = () => { backupFileInputRef.current?.click(); };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      setRestoringBackup(true);
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      if (parsed.salt && parsed.iv && parsed.ciphertext) {
        if (!restorePassword.trim()) {
          toast({ type: 'error', message: '这是加密备份，请输入解密密码' });
          setRestoringBackup(false);
          return;
        }
        const plaintext = await decryptBackup(parsed as EncryptedBackup, restorePassword);
        const result = await importData(plaintext);
        if (result.success) { toast({ type: 'success', message: result.message }); setTimeout(() => window.location.reload(), 800); }
        else { toast({ type: 'error', message: result.message }); }
      } else {
        const result = await importData(text);
        if (result.success) { toast({ type: 'success', message: result.message }); setTimeout(() => window.location.reload(), 800); }
        else { toast({ type: 'error', message: result.message }); }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('decrypt')) toast({ type: 'error', message: '解密失败，请检查密码是否正确' });
      else toast({ type: 'error', message: '恢复失败，请检查文件格式' });
    } finally {
      setRestoringBackup(false);
    }
  };

  return {
    backupPassword, setBackupPassword,
    creatingEncryptedBackup,
    restoringBackup,
    restorePassword, setRestorePassword,
    backupFileInputRef,
    handleEncryptedBackup, handleBackupFileClick, handleBackupFileChange,
  };
}
