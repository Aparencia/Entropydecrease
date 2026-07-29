/**
 * 更新通知组件
 *
 * 监听 autoUpdater 的 update-status 事件，
 * 显示更新状态（发现更新 → 下载进度 → 安装确认）。
 * 发现新版本时额外展示 releaseNotes 折叠面板。
 *
 * @ai-context: UI 基础组件（shadcn/radix 封装）：UpdateNotification。
 */
import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Download, RefreshCw, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
  releaseNotes?: string | null;
  /** 重试剩余等待毫秒数（下载重试中） */
  retryIn?: number;
  /** 当前重试次数 */
  retryCount?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

export default function UpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.on) return;

    const cleanup = window.electronAPI.on('update-status', (data: unknown) => {
      setUpdateStatus(data as UpdateStatus);
      setDismissed(false);
    });

    return cleanup;
  }, []);

  if (!updateStatus || dismissed) return null;
  if (updateStatus.status === 'not-available' || updateStatus.status === 'checking') return null;

  const handleDownload = () => {
    window.electronAPI?.invoke('update:download');
  };

  const handleInstall = () => {
    window.electronAPI?.invoke('update:install');
  };

  /** 简易 Markdown → HTML（仅处理常见格式，不做完整解析） */
  const renderReleaseNotes = (notes: string): string => {
    return notes
      // h2 / h3
      .replace(/^### (.+)$/gm, '<h3 class="text-b3 font-semibold text-text-primary mt-2 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-b2 font-semibold text-text-primary mt-2 mb-1">$1</h2>')
      // 无序列表
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-b3 text-text-secondary">$1</li>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-bg-tertiary text-b3 font-mono">$1</code>')
      // 粗体
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      // 换行
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-bg-elevated border border-border rounded-kb-lg shadow-kb-lg p-kb-md animate-fade-in-up">
      <div className="flex items-start justify-between gap-kb-sm">
        <div className="flex-1">
          {updateStatus.status === 'available' && (
            <>
              <p className="text-b1 font-medium text-text-primary">
                发现新版本 v{updateStatus.version}
              </p>
              <p className="text-b3 text-text-secondary mt-1">点击下方按钮开始下载</p>

              {/* releaseNotes 折叠面板 */}
              {updateStatus.releaseNotes && (
                <div className="mt-2">
                  <button
                    onClick={() => setNotesOpen(!notesOpen)}
                    className={cn(
                      'flex items-center gap-1 text-b3 text-text-tertiary hover:text-text-secondary transition-colors',
                    )}
                  >
                    <ChevronDown className={cn('w-icon-xs h-icon-xs transition-transform', notesOpen && 'rotate-180')} />
                    {notesOpen ? '收起更新内容' : '查看更新内容'}
                  </button>
                  {notesOpen && (
                    <div
                      className="mt-1.5 p-2.5 rounded-kb-md bg-bg-card text-text-secondary text-b3 leading-relaxed max-h-48 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderReleaseNotes(String(updateStatus.releaseNotes))) }}
                    />
                  )}
                </div>
              )}

              <button onClick={handleDownload} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-brand-500 text-white rounded-kb-md text-b3 hover:bg-brand-600 transition-colors">
                <Download className="w-icon-xs h-icon-xs" /> 下载更新
              </button>
            </>
          )}
          {updateStatus.status === 'downloading' && (
            <>
              <p className="text-b1 font-medium text-text-primary">
                {updateStatus.retryCount ? `下载失败，正在重试 (${updateStatus.retryCount}/${updateStatus.maxRetries})...` : '正在下载更新...'}
              </p>
              <div className="mt-2 w-full bg-bg-tertiary rounded-kb-full h-2">
                <div className="h-full bg-brand-500 rounded-kb-full transition-all" style={{ width: `${updateStatus.percent || 0}%` }} />
              </div>
              <p className="text-b3 text-text-secondary mt-1">{updateStatus.percent || 0}%</p>
            </>
          )}
          {updateStatus.status === 'downloaded' && (
            <>
              <p className="text-b1 font-medium text-text-primary">更新已就绪 v{updateStatus.version}</p>
              <button onClick={handleInstall} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-brand-500 text-white rounded-kb-md text-b3 hover:bg-brand-600 transition-colors">
                <RefreshCw className="w-icon-xs h-icon-xs" /> 安装并重启
              </button>
            </>
          )}
          {updateStatus.status === 'error' && (
            <p className="text-b3 text-semantic-error">更新检查失败：{updateStatus.message}</p>
          )}
        </div>
        <button onClick={() => setDismissed(true)} className="text-text-tertiary hover:text-text-secondary">
          <X className="w-icon-sm h-icon-sm" />
        </button>
      </div>
    </div>
  );
}
