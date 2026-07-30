/**
 * 存储配额查询（Storage Manager API）
 *
 * @ai-context: navigator.storage.estimate 在 Electron/部分浏览器不可用，
 * 返回 null 时 UI 须隐藏配额展示而非报错。纯读取，无副作用。
 */
export interface StorageInfo {
  used: number;       // 已使用字节数
  quota: number;      // 配额字节数
  percent: number;    // 使用百分比
  formatted: {
    used: string;     // 如 '12.5 MB'
    quota: string;    // 如 '1.2 GB'
  };
}

/** 格式化字节数为人类可读格式 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** 获取存储信息（使用 Storage Manager API） */
export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    return {
      used,
      quota,
      percent: quota > 0 ? (used / quota) * 100 : 0,
      formatted: {
        used: formatBytes(used),
        quota: formatBytes(quota),
      },
    };
  } catch {
    return null;
  }
}
