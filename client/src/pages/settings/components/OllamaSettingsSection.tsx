/**
 * Ollama 本地引擎设置区块（状态/开关/模型管理）
 *
 * @ai-context: 从 AIProviderSettings 拆出。仅 Electron 环境渲染
 * （window.electronAPI.ollama 缺失时返回 null）。状态四态：未安装/未运行/
 * 已就绪/已启用，仅"运行中"允许开启本地优先。开启后 AI 优先走本地推理，
 * 失败自动降级云端（本地优先原则）。镜像配置与删除确认见 OllamaModelDialogs。
 */
import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
  CheckCircle, RefreshCw, Cpu, Download, HardDrive, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import { OLLAMA_RECOMMENDED_MODELS } from '@/types/ollama';
import { MirrorConfigSection, DeleteModelDialog } from './OllamaModelDialogs';

export function OllamaSettingsSection() {
  const { toast } = useToast();
  const { status, config, loading, refresh, setConfig, pullModel, deleteModel, pullProgress } = useOllamaStatus();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 非 Electron 环境不显示
  if (typeof window === 'undefined' || !window.electronAPI?.ollama) return null;

  const isEnabled = config?.enabled ?? false;
  const isInstalled = status?.installed ?? false;
  const isRunning = status?.running ?? false;
  const models = status?.models ?? [];

  const handleToggle = async () => {
    if (!isInstalled) {
      toast({ type: 'info', message: '请先安装 Ollama：https://ollama.com/download' });
      return;
    }
    if (!isRunning) {
      toast({ type: 'info', message: 'Ollama 服务未运行，请启动 Ollama 后再开启' });
      return;
    }
    await setConfig({ enabled: !isEnabled });
    toast({ type: 'success', message: isEnabled ? '已关闭本地推理' : '已开启本地推理，AI 功能将优先使用本地模型' });
  };

  const handlePull = async (modelName: string) => {
    try {
      await pullModel(modelName);
      toast({ type: 'success', message: `模型 ${modelName} 下载完成` });
    } catch {
      toast({ type: 'error', message: `模型 ${modelName} 下载失败` });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteModel(deleteTarget);
      toast({ type: 'success', message: `模型 ${deleteTarget} 已删除` });
      setDeleteTarget(null);
    } catch {
      toast({ type: 'error', message: `模型 ${deleteTarget} 删除失败` });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">本地 AI 引擎</h2>
        </div>
        {/* 状态指示 */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              isRunning && isEnabled && 'bg-semantic-success',
              isRunning && !isEnabled && 'bg-semantic-warning',
              !isRunning && isInstalled && 'bg-text-quaternary',
              !isInstalled && 'bg-semantic-error',
            )}
          />
          <span className="text-c1 text-text-tertiary">
            {!isInstalled && '未安装'}
            {isInstalled && !isRunning && '未运行'}
            {isRunning && !isEnabled && '已就绪'}
            {isRunning && isEnabled && '已启用'}
          </span>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={loading}
            className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
            title="刷新状态"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 未安装引导 */}
      {!isInstalled && (
        <div className="p-3 rounded-kb-md bg-bg-elevated border border-border-default">
          <p className="text-b3 text-text-secondary mb-2">
            安装 Ollama 后即可使用本地模型，完全免费、无调用限制、离线可用。
          </p>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-b3 text-accent-default hover:underline"
          >
            <Download className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
            下载 Ollama
          </a>
        </div>
      )}

      {/* 已安装：开关 + 模型管理 */}
      {isInstalled && (
        <>
          {/* 启用开关 */}
          <div className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated">
            <div>
              <p className="text-b3 font-medium text-text-primary">优先使用本地模型</p>
              <p className="text-c1 text-text-tertiary mt-0.5">开启后 AI 功能将优先调用本地 Ollama，失败时自动降级到云端</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled && isRunning}
              aria-label={isEnabled ? '关闭本地推理' : '开启本地推理'}
              onClick={handleToggle}
              disabled={!isRunning}
              className={cn(
                // 类名必须用默认 spacing 刻度存在的值（h-6/w-11/h-4/w-4），
                // h-5.5/w-4.5 不在刻度内会静默不生效，开关高度归零只剩文字
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0',
                // 开启态用品牌主色 + 品牌微光，与深色底拉开对比（与 ASR 开关同一视觉语言）
                isEnabled && isRunning ? 'bg-brand-500 shadow-brand' : 'bg-bg-inverted/20',
                !isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  isEnabled && isRunning ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {/* 已有模型列表 */}
          {models.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-c1 font-medium text-text-tertiary">已拉取模型</p>
              {models.map((m) => (
                <div key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-kb-sm bg-bg-elevated group">
                  <HardDrive className="w-icon-xs h-icon-xs text-text-quaternary" strokeWidth={1.5} />
                  <span className="text-b3 text-text-secondary font-mono flex-1">{m}</span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    disabled={!isRunning}
                    className={cn(
                      'p-1 rounded-kb-sm text-text-quaternary transition-colors',
                      'hover:text-semantic-error hover:bg-semantic-error/10',
                      'opacity-0 group-hover:opacity-100',
                      !isRunning && 'cursor-not-allowed opacity-0',
                    )}
                    title="删除模型"
                  >
                    <Trash2 className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 下载加速（镜像配置） */}
          <MirrorConfigSection config={config} setConfig={setConfig} />

          {/* 推荐模型下载 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-c1 font-medium text-text-tertiary">推荐模型</p>
            {OLLAMA_RECOMMENDED_MODELS.map((model) => {
              const alreadyPulled = models.some((m) => m.startsWith(model.name.split(':')[0]));
              const isPulling = pullProgress?.model === model.name && pullProgress.status === 'downloading';
              return (
                <div key={model.name} className="flex items-center justify-between px-3 py-2 rounded-kb-md bg-bg-elevated border border-border-default">
                  <div>
                    <p className="text-b3 text-text-primary">{model.label}</p>
                    <p className="text-c1 text-text-quaternary">{model.size} · {model.requirement}</p>
                  </div>
                  {alreadyPulled ? (
                    <span className="text-c1 text-semantic-success flex items-center gap-1">
                      <CheckCircle className="w-icon-xs h-icon-xs" strokeWidth={1.5} /> 已就绪
                    </span>
                  ) : isPulling ? (
                    <span className="text-c1 text-accent-default">{pullProgress?.percent ?? 0}%</span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handlePull(model.name)} disabled={!isRunning}>
                      <Download className="w-icon-xs h-icon-xs mr-1" strokeWidth={1.5} />
                      下载
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <DeleteModelDialog
          target={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </Card>
  );
}
