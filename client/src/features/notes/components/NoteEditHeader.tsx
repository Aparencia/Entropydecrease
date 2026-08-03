/**
 * 笔记编辑页顶栏（返回/标题/保存状态/卡壳救援/AI 摘要）
 *
 * @ai-context: 从 NoteEditPage 拆出。标题用非受控 input（defaultValue +
 * onBlur 提交）避免每字符触发保存；保存状态四态（idle 隐藏 / saving /
 * saved 伴粒子动画 / failed）。AI 摘要按钮的空内容校验与生成流程由父级
 * 通过 onSummarize 提供。
 */
import type { Ref } from 'react';
import { ArrowLeft, Save, HelpCircle, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { AIButton } from '@/components/ui/AIButton';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** 保存成功时的粒子迸发效果 */
export function SaveParticles({ show }: { show: boolean }) {
  if (!show) return null;
  const particles = Array.from({ length: 4 }, (_, i) => {
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 12 + Math.random() * 8;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      delay: i * 30,
      size: 3 + Math.random() * 2,
    };
  });
  return (
    <span className="absolute inset-0 pointer-events-none overflow-visible flex items-center justify-center">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-brand-500 animate-[particle-burst_200ms_ease-out_forwards]"
          style={{
            width: p.size,
            height: p.size,
            '--px': `${p.x}px`,
            '--py': `${p.y}px`,
            animationDelay: `${p.delay}ms`,
            opacity: 0.9,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

export interface NoteEditHeaderProps {
  title: string;
  titleRef: Ref<HTMLInputElement>;
  saveStatus: SaveStatus;
  aiLoading: boolean;
  onBack: () => void;
  onTitleBlur: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent) => void;
  onManualSave: () => void;
  onOpenRescue: () => void;
  onSummarize: () => void;
  /** 阶段四：导出当前笔记为 Markdown */
  onExportMarkdown: () => void;
}

const SECONDARY_BTN = cn(
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium',
  'bg-bg-secondary text-text-secondary border border-border/50',
  'hover:bg-bg-tertiary hover:text-text-primary',
  'active:scale-95 transition-all duration-kb-fast',
);

export function NoteEditHeader({
  title, titleRef, saveStatus, aiLoading,
  onBack, onTitleBlur, onTitleKeyDown, onManualSave, onOpenRescue, onSummarize, onExportMarkdown,
}: NoteEditHeaderProps) {
  return (
    <div className="relative z-10 flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0">
      {/* 返回按钮，带 tooltip */}
      <Tip text="返回">
      <button
        onClick={onBack}
        className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        aria-label="返回"
      >
        <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
      </button>
      </Tip>

      <input
        ref={titleRef}
        defaultValue={title}
        onBlur={onTitleBlur}
        onKeyDown={onTitleKeyDown}
        placeholder="输入笔记标题..."
        className={cn(
          'flex-1 bg-transparent outline-none text-h2 font-semibold text-text-primary',
          'placeholder:text-text-tertiary/60',
        )}
      />

      <span className={cn(
        'relative text-b3 transition-opacity duration-300 flex-shrink-0',
        saveStatus === 'idle' && 'opacity-0',
        saveStatus === 'saving' && 'text-text-tertiary opacity-100',
        saveStatus === 'saved' && 'text-semantic-success opacity-100',
        saveStatus === 'failed' && 'text-semantic-error opacity-100',
      )}>
        {saveStatus === 'saving' && '保存中...'}
        {saveStatus === 'saved' && '已保存'}
        {saveStatus === 'failed' && '保存失败'}
        <SaveParticles show={saveStatus === 'saved'} />
      </span>

      <button onClick={onManualSave} className={SECONDARY_BTN}>
        <Save className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        保存
      </button>

      <button onClick={onExportMarkdown} className={SECONDARY_BTN} title="导出为 Markdown">
        <Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        导出 Md
      </button>

      <button onClick={onOpenRescue} className={SECONDARY_BTN} title="卡壳了 (Ctrl+Shift+H)">
        <HelpCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        卡壳了
      </button>

      <AIButton
        size="sm"
        loading={aiLoading}
        disabled={aiLoading}
        tooltip="请先写一些笔记内容再生成摘要"
        onClick={onSummarize}
        title={aiLoading ? '正在生成摘要…' : 'AI 摘要'}
      >
        AI 摘要
      </AIButton>
    </div>
  );
}
