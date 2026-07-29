/**
 * Ollama 镜像加速配置与删除确认对话框
 *
 * @ai-context: 从 OllamaSettingsSection 拆出。镜像仅改 Ollama 配置，实际
 * 生效还需用户设置系统环境变量 OLLAMA_REGISTRY 并重启 Ollama（故 UI 明确
 * 提示）。删除模型不可撤销，走二次确认对话框。
 */
import { useState } from 'react';
import { Button } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OllamaConfig } from '@/types/ollama';

/** 镜像加速配置（保存后需重启 Ollama 生效） */
export function MirrorConfigSection({ config, setConfig }: {
  config: OllamaConfig | null;
  setConfig: (partial: Partial<OllamaConfig>) => Promise<void>;
}) {
  const [mirrorInput, setMirrorInput] = useState(config?.registryMirror ?? '');
  const [saved, setSaved] = useState(false);

  const handleSaveMirror = async () => {
    await setConfig({ registryMirror: mirrorInput.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-kb-md bg-bg-elevated border border-border-default">
      <p className="text-b3 font-medium text-text-primary">下载加速（国内镜像）</p>
      <p className="text-c1 text-text-tertiary">
        模型下载慢？填写国内镜像地址加速。保存后需重启 Ollama 生效。
      </p>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          value={mirrorInput}
          onChange={(e) => setMirrorInput(e.target.value)}
          placeholder="https://ollama-registry.aifree.site"
          className={cn(
            'flex-1 px-2.5 py-1.5 rounded-kb-sm text-b3 font-mono',
            'bg-bg-default border border-border-default',
            'text-text-primary placeholder:text-text-quaternary',
            'focus:outline-none focus:border-accent-default',
            'transition-colors duration-kb-fast',
          )}
        />
        <Button variant="secondary" size="sm" onClick={handleSaveMirror}>
          {saved ? '已保存' : '保存'}
        </Button>
      </div>
      {mirrorInput.trim() && (
        <p className="text-c1 text-text-quaternary mt-0.5">
          需设置系统环境变量：<code className="px-1 py-0.5 rounded bg-bg-default text-accent-default">OLLAMA_REGISTRY={mirrorInput.trim()}</code>，然后重启 Ollama
        </p>
      )}
    </div>
  );
}

/** 删除模型二次确认对话框 */
export function DeleteModelDialog({ target, deleting, onCancel, onConfirm }: {
  target: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-kb-lg bg-bg-elevated border border-border-default shadow-kb-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-semantic-error/10">
            <AlertTriangle className="w-5 h-5 text-semantic-error" strokeWidth={1.5} />
          </span>
          <h3 className="text-b1 font-semibold text-text-primary">删除模型</h3>
        </div>
        <p className="text-b3 text-text-secondary mb-2">
          确定要删除本地模型 <code className="px-1.5 py-0.5 rounded bg-bg-default font-mono text-accent-default">{target}</code> 吗？
        </p>
        <p className="text-c1 text-text-tertiary mb-6">
          删除后模型文件将从磁盘移除，如需再次使用需重新下载。此操作不可撤销。
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="md" onClick={onCancel} disabled={deleting}>
            取消
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} loading={deleting} disabled={deleting}>
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </div>
    </div>
  );
}
