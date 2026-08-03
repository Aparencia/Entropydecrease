/**
 * ContentTierModal — N5 策略性遗忘标记
 *
 * @ai-context: 将当前笔记 AI 分层为"核心概念/支撑材料/参考细节"三层，
 * 支持"只看核心"折叠次要内容、一键复制核心概念。策略性遗忘：
 * 主动抑制不相关信息与记住核心信息同等重要。AI 不可用时显示错误提示。
 */
import { useEffect, useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { useToast } from '@/components/ui';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { Layers, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIContentTier } from '@/lib/ai/hooks/useAIContentTier';
import type { ContentTierItem } from '@/lib/ai/types';

interface ContentTierModalProps {
  open: boolean;
  onClose: () => void;
  /** 当前笔记的实时纯文本 */
  noteText: string;
}

const tierMeta = {
  core: { label: '核心概念', hint: '离开它这篇笔记就不成立', accent: 'text-brand-600 bg-brand-50' },
  support: { label: '支撑材料', hint: '帮助理解核心的解释与例证', accent: 'text-accent-600 bg-accent-50' },
  detail: { label: '参考细节', hint: '可策略性遗忘的旁支信息', accent: 'text-text-tertiary bg-bg-tertiary' },
} as const;

export function ContentTierModal({ open, onClose, noteText }: ContentTierModalProps) {
  const { tier, loading, error, analyze, reset } = useAIContentTier();
  const [focusCore, setFocusCore] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ core: true, support: true, detail: true });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setFocusCore(false);
      setExpanded({ core: true, support: true, detail: true });
      analyze(noteText);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copyCore = async () => {
    if (!tier) return;
    const text = tier.core.map((item, i) => `${i + 1}. ${item.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast({ type: 'success', message: '核心概念已复制到剪贴板' });
    } catch {
      toast({ type: 'error', message: '复制失败，请手动选择复制' });
    }
  };

  const renderTier = (key: 'core' | 'support' | 'detail', items: ContentTierItem[]) => {
    if (focusCore && key !== 'core') return null;
    const meta = tierMeta[key];
    const isOpen = expanded[key];
    return (
      <div key={key} className={cn('rounded-kb-md border border-border/30', focusCore && key === 'detail' && 'opacity-50')}>
        <button
          onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-secondary transition-colors"
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} /> : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />}
          <span className={cn('px-1.5 py-0.5 rounded-kb-full text-c1 font-medium', meta.accent)}>{meta.label}</span>
          <span className="text-c1 text-text-tertiary">{items.length} 条 · {meta.hint}</span>
        </button>
        {isOpen && (
          <ul className="px-3 pb-2.5 flex flex-col gap-1.5">
            {items.length === 0 && <li className="text-c1 text-text-tertiary pl-5">（无）</li>}
            {items.map((item, i) => (
              <li key={i} className={cn('text-b2 text-text-primary pl-5 leading-relaxed', key === 'detail' && 'text-text-secondary')}>
                {item.text}
                {key === 'core' && item.reason && (
                  <span className="block text-c1 text-text-tertiary mt-0.5">{item.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="内容分层 · 策略性遗忘" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-b2 text-text-secondary">
          AI 将笔记分为三层，帮你聚焦核心、弱化冗余细节——主动遗忘旁支，也是学习的一部分。
        </p>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <AIThinkingIndicator size={5} gap={4} />
            <p className="text-b2 text-text-secondary">正在分层分析…</p>
          </div>
        )}

        {!loading && error && <p className="text-b2 text-semantic-error">{error}</p>}

        {!loading && tier && (
          <>
            <div className="flex flex-col gap-2">
              {renderTier('core', tier.core)}
              {renderTier('support', tier.support)}
              {renderTier('detail', tier.detail)}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-b2 text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={focusCore}
                  onChange={(e) => setFocusCore(e.target.checked)}
                  className="accent-[var(--kb-brand-500)]"
                />
                只看核心概念
              </label>
              <Button variant="secondary" icon={<Copy className="w-4 h-4" strokeWidth={1.5} />} onClick={copyCore}>
                复制核心概念
              </Button>
            </div>
          </>
        )}

        {!loading && !tier && !error && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Layers className="w-6 h-6 text-text-tertiary/40" strokeWidth={1.5} />
            <p className="text-c1 text-text-tertiary">笔记内容太少，暂无法分层</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
