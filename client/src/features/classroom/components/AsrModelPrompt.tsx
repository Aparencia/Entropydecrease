/**
 * 本地 ASR 模型下载引导卡片
 *
 * 首次进入课堂助手时检测本地 ASR 模型是否已下载，
 * 未下载则显示引导卡片供用户选择下载（可选增强，不阻断使用）。
 * 用户关闭后记录 localStorage 不再重复弹出。
 *
 * @ai-context: 可选增强组件：检测 local_asr_check_available IPC，
 * 未下载时展示模型选择与下载进度；关闭后持久化到 localStorage。
 * 下载进度经 local_asr_download_progress 事件推送。
 */
import { useState, useEffect, useCallback } from 'react';
import { Download, X, HardDrive, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'kb_asr_model_prompt_dismissed';

interface AsrModelInfo {
  engine: string;
  id: string;
  label: string;
  description: string;
  size: string;
  ready: boolean;
}

interface DownloadProgress {
  engine: string;
  progress: number;
}

export function AsrModelPrompt() {
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<AsrModelInfo[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // 初始检测：是否已关闭过 / 模型是否已下载
  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!window.electronAPI) return;

    window.electronAPI.invoke('local_asr_get_models').then((result: unknown) => {
      const data = result as { models: AsrModelInfo[] };
      if (data?.models) {
        setModels(data.models);
        // 至少有一个模型已下载则不再提示
        const anyDownloaded = data.models.some((m) => m.ready);
        if (!anyDownloaded) setVisible(true);
      }
    }).catch(() => { /* sherpa-onnx 未安装时静默跳过 */ });
  }, []);

  // 监听下载进度事件
  useEffect(() => {
    if (!window.electronAPI) return;
    const off = window.electronAPI.on('local_asr_download_progress', (...args: unknown[]) => {
      const data = args[0] as DownloadProgress;
      setProgress(data.progress);
      if (data.progress >= 100) {
        setDownloading(null);
        setProgress(0);
        // 刷新模型状态
        window.electronAPI.invoke('local_asr_get_models').then((result: unknown) => {
          const d = result as { models: AsrModelInfo[] };
          if (d?.models) setModels(d.models);
        }).catch((err) => {
          console.debug('[AsrModelPrompt] refresh ASR models failed', err);
        });
      }
    });
    return off;
  }, []);

  const handleDownload = useCallback(async (engine: string) => {
    if (!window.electronAPI || downloading) return;
    setDownloading(engine);
    setProgress(0);
    try {
      await window.electronAPI.invoke('local_asr_download_model', { engine });
    } catch (err) {
      console.warn('[AsrModelPrompt] 下载失败:', err);
      setDownloading(null);
    }
  }, [downloading]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-4 mt-3 p-4 rounded-kb-lg bg-bg-elevated border border-border/40 shadow-kb-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-b2 font-medium text-text-primary">下载本地语音识别模型</span>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-secondary transition-colors"
          aria-label="关闭提示"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <p className="mt-1.5 text-c1 text-text-tertiary">
        下载后可完全离线转写语音，无需联网、零 API 费用。不下载也可正常使用（云端转写）。
      </p>
        {models.map((model) => (
          <div key={model.id} className="flex items-center gap-3 p-2.5 rounded-kb-md bg-bg-secondary/50">
            <div className="flex-1 min-w-0">
              <p className="text-b3 font-medium text-text-primary truncate">{model.label}</p>
              <p className="text-c1 text-text-tertiary mt-0.5">{model.description} · {model.size}</p>
            </div>
            {model.ready ? (
              <span className="flex items-center gap-1 text-c1 text-emerald-600 flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                已下载
              </span>
            ) : downloading === model.engine ? (
              <span className="flex items-center gap-1.5 text-c1 text-brand-600 flex-shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                {progress}%
              </span>
            ) : (
              <button
                onClick={() => handleDownload(model.engine)}
                disabled={!!downloading}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-kb-sm text-c1 font-medium transition-colors flex-shrink-0',
                  downloading
                    ? 'bg-bg-secondary text-text-tertiary cursor-not-allowed'
                    : 'bg-brand-600 text-white hover:bg-brand-700',
                )}
              >
                <Download className="w-3 h-3" strokeWidth={1.5} />
                下载
              </button>
            )}
          </div>
        ))}

      {/* 下载进度条 */}
      {downloading && (
        <div className="mt-3 h-1.5 rounded-full bg-bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
