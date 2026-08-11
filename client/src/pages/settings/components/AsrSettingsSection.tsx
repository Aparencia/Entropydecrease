/**
 * 本地语音识别（ASR）模型设置区块
 *
 * @ai-context: 展示 sherpa-onnx 本地 ASR 模型的下载状态与管理。
 * 位于设置页「本地 AI 引擎」区块之后，与 Ollama 推荐模型同级。
 * 通过 IPC local_asr_get_models / local_asr_download_model / local_asr_delete_model
 * 与主进程交互，下载进度经 local_asr_download_progress 事件推送。
 * 下载源自动降级：GitHub Releases → hf-mirror.com（国内镜像）。
 * @ai-context: 启用开关（local_asr_update_config）是本地 ASR 生效的唯一闸门：
 * 主进程 isStreamingAsrAvailable / isLocalAsrEnabled 都要求 enabled=true，
 * 开关缺失曾导致真流式转写永远不激活（2026-08 排查案例）。克隆
 * OllamaSettingsSection 的开关范式：至少一个模型就绪才允许开启。
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
  Mic, Download, CheckCircle, Trash2, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

// ── 类型 ──

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

// ── 组件 ──

export function AsrSettingsSection() {
  const { toast } = useToast();
  const [models, setModels] = useState<AsrModelInfo[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  // 加载模型列表
  const refreshModels = useCallback(() => {
    if (!window.electronAPI) return;
    window.electronAPI.invoke('local_asr_get_models').then((result: unknown) => {
      const data = result as { models: AsrModelInfo[] };
      if (data?.models) setModels(data.models);
    }).catch(() => { /* sherpa-onnx 未编译时静默跳过 */ });
  }, []);

  // 加载启用状态（enabled 是本地转写与课堂真流式的唯一闸门）
  const refreshEnabled = useCallback(() => {
    if (!window.electronAPI) return;
    window.electronAPI.invoke('local_asr_get_config').then((result: unknown) => {
      const config = result as { enabled?: boolean };
      setEnabled(!!config?.enabled);
    }).catch(() => { /* 静默 */ });
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    refreshModels();
    refreshEnabled();
  }, [isElectron, refreshModels, refreshEnabled]);

  /** 切换启用状态：至少一个模型就绪才允许开启（否则开关无效） */
  const handleToggle = useCallback(async () => {
    if (!window.electronAPI) return;
    const anyReady = models.some((m) => m.ready);
    if (!enabled && !anyReady) {
      toast({ type: 'info', message: '请先下载至少一个识别模型再启用本地语音识别' });
      return;
    }
    try {
      soundPlayer.play(enabled ? 'ui_toggle_off' : 'ui_toggle_on');
      await window.electronAPI.invoke('local_asr_update_config', { enabled: !enabled });
      setEnabled(!enabled);
      toast({
        type: 'success',
        message: enabled
          ? '已关闭本地语音识别，将使用云端转写'
          : '已启用本地语音识别，课堂实时转写与离线转写将优先本地推理',
      });
    } catch {
      toast({ type: 'error', message: '本地语音识别开关切换失败，请重试' });
    }
  }, [enabled, models, toast]);

  // 监听下载进度
  useEffect(() => {
    if (!window.electronAPI) return;
    const off = window.electronAPI.on('local_asr_download_progress', (...args: unknown[]) => {
      const data = args[0] as DownloadProgress;
      setProgress(data.progress);
      if (data.progress >= 100) {
        setDownloading(null);
        setProgress(0);
        refreshModels();
        toast({ type: 'success', message: 'ASR 模型下载完成' });
      }
    });
    return off;
  }, [refreshModels, toast]);

  const anyModelReady = models.some((m) => m.ready);

  const handleDownload = useCallback(async (engine: string) => {
    if (!window.electronAPI || downloading) return;
    setDownloading(engine);
    setProgress(0);
    try {
      await window.electronAPI.invoke('local_asr_download_model', { engine });
    } catch (err) {
      toast({ type: 'error', message: `ASR 模型下载失败：${err instanceof Error ? err.message : String(err)}` });
      setDownloading(null);
    }
  }, [downloading, toast]);

  const handleDelete = useCallback(async (engine: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.invoke('local_asr_delete_model', { engine });
      toast({ type: 'success', message: 'ASR 模型已删除' });
      setDeleteTarget(null);
      refreshModels();
    } catch {
      toast({ type: 'error', message: 'ASR 模型删除失败' });
    }
  }, [refreshModels, toast]);

  // 非 Electron 环境或无模型数据时不渲染
  if (!isElectron || models.length === 0) return null;

  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <Mic className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
        <h2 className="text-b1 font-semibold text-text-primary">本地语音识别</h2>
      </div>

      <p className="text-c1 text-text-tertiary -mt-2">
        下载后可完全离线转写语音，零 API 费用。未下载时自动使用云端转写。
      </p>
      <div className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated">
        <div>
          <p className="text-b3 font-medium text-text-primary">启用本地语音识别</p>
          <p className="text-c1 text-text-tertiary mt-0.5">
            开启后课堂实时转写（真流式）与离线转写优先本地推理，失败自动降级云端
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? '关闭本地语音识别' : '启用本地语音识别'}
          onClick={handleToggle}
          disabled={!anyModelReady}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0',
            // 开启态用品牌主色 + 品牌微光（shadow-brand 设计令牌），
            // 与深色底拉开对比（accent-default 偏灰，开启感不明显）
            enabled && anyModelReady
              ? 'bg-brand-500 shadow-brand'
              : 'bg-bg-inverted/20',
            !anyModelReady && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
              enabled && anyModelReady ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {/* 模型列表 */}
      <div className="flex flex-col gap-1.5">
        <p className="text-c1 font-medium text-text-tertiary">识别模型</p>
        {models.map((model) => (
          <div
            key={model.id}
            className="flex items-center justify-between px-3 py-2 rounded-kb-md bg-bg-elevated border border-border-default group"
          >
            <div className="min-w-0">
              <p className="text-b3 text-text-primary">{model.label}</p>
              <p className="text-c1 text-text-quaternary">{model.description} · {model.size}</p>
            </div>

            {model.ready ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-c1 text-semantic-success flex items-center gap-1">
                  <CheckCircle className="w-icon-xs h-icon-xs" strokeWidth={1.5} /> 已就绪
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(model.engine)}
                  className="p-1 rounded-kb-sm text-text-quaternary transition-colors hover:text-semantic-error hover:bg-semantic-error/10 opacity-0 group-hover:opacity-100"
                  title="删除模型"
                >
                  <Trash2 className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
                </button>
              </div>
            ) : downloading === model.engine ? (
              <span className="flex items-center gap-1.5 text-c1 text-accent-default flex-shrink-0">
                <Loader2 className="w-icon-xs h-icon-xs animate-spin" strokeWidth={1.5} />
                {progress}%
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(model.engine)}
                disabled={!!downloading}
                className="flex-shrink-0"
              >
                <Download className="w-icon-xs h-icon-xs mr-1" strokeWidth={1.5} />
                下载
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* 下载进度条 */}
      {downloading && (
        <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-accent-default transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-bg-primary rounded-kb-lg p-5 shadow-kb-lg w-80">
            <p className="text-b2 font-medium text-text-primary">确认删除</p>
            <p className="text-b3 text-text-secondary mt-2">
              删除后需重新下载才能使用本地语音识别，确定继续？
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(deleteTarget)}
              >
                <Trash2 className="w-icon-xs h-icon-xs mr-1" strokeWidth={1.5} />
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
