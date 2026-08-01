/**
 * AI 摘要结果浮层（半透明玻璃态）
 *
 * @ai-context: 从 NoteEditPage 拆出。三态展示：加载中/错误（含跳转设置页
 * 配置 API Key 的引导）/结果。结果区提供逐项要点转闪卡（convertedKeys
 * 记录已转化项显示对勾）、超过 2 个要点时提示一键生成，以及接受/拒绝/
 * 重试与插入位置选择等次级操作。全部行为经回调上抛，无内部业务逻辑。
 */
import { useState } from 'react';
import { Sparkles, X, Copy, RefreshCw, Download, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIButton } from '@/components/ui/AIButton';

/** AI 摘要结果数据（与 useAISummarize 返回结构一致） */
interface SummaryData {
  summary: string;
  keyPoints?: string[];
}

export interface AISummaryModalProps {
  data: SummaryData | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  /** 错误源于缺少 API Key 配置时展示设置页引导 */
  needsConfig?: boolean;
  /** P2-12 流式：是否正在流式输出 */
  isStreaming?: boolean;
  /** P2-12 流式：逐 chunk 累积的渐进文本 */
  streamingText?: string;
  flashcardLoading: boolean;
  /** 已转化为闪卡的要点下标 */
  convertedKeys: Set<number>;
  onClose: () => void;
  onGoSettings: () => void;
  onCopySummary: () => void;
  onGenerateFlashcard: (keyPoint: string, index: number) => void;
  onGenerateAllFlashcards: () => void;
  onInsertNote: (position: 'cursor' | 'start' | 'end') => void;
  onRegenerate: () => void;
  onExport: () => void;
  /** P2-12 流式：取消流式输出 */
  onCancelStream?: () => void;
}

export function AISummaryModal({
  data, loading, error, needsConfig, isStreaming, streamingText, flashcardLoading, convertedKeys,
  onClose, onGoSettings, onCopySummary, onGenerateFlashcard,
  onGenerateAllFlashcards, onInsertNote, onRegenerate, onExport, onCancelStream,
}: AISummaryModalProps) {
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const keyPointCount = data?.keyPoints?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-kb-md">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className={cn(
        'relative w-full max-w-lg bg-bg-elevated/95 dark:bg-bg-elevated/95 backdrop-blur-xl rounded-[20px_12px_18px_14px] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.4)]',
        'border border-brand-200/20 dark:border-brand-800/30 p-kb-lg',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
      )}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <X className="w-icon-md h-icon-md" />
        </button>
        <h2 className="text-h2 font-semibold text-text-primary flex items-center gap-2 pr-8">
          <Sparkles className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} />
          AI 摘要
        </h2>

        {isStreaming && (
          <div className="mt-kb-md flex flex-col gap-kb-md">
            <div className="flex items-center gap-2 text-b3 text-text-secondary">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              正在流式生成摘要…
            </div>
            <p className="text-b2 text-text-primary leading-relaxed whitespace-pre-wrap">
              {streamingText}
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-brand-500 align-middle animate-pulse" />
            </p>
            {onCancelStream && (
              <button
                onClick={onCancelStream}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-semantic-error hover:bg-semantic-error/10 transition-all duration-200"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
                停止生成
              </button>
            )}
          </div>
        )}

        {loading && !isStreaming && (
          <div className="mt-kb-md flex items-center gap-2 text-b2 text-text-primary">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            正在生成摘要…
          </div>
        )}

        {error && !loading && (
          <div className="mt-kb-md p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
            {error}
            {needsConfig && (
              <button
                onClick={onGoSettings}
                className="mt-2 block text-b3 underline hover:no-underline"
              >
                前往设置页配置 API Key
              </button>
            )}
          </div>
        )}

        {data && !loading && (
          <div className="mt-kb-md flex flex-col gap-kb-md kb-ai-result-enter">
            {/* 摘要文本 + 复制按钮 */}
            <div className="group relative">
              <p className="text-b3 font-medium text-text-secondary uppercase tracking-wide mb-1">摘要</p>
              <p className="text-b2 text-text-primary leading-relaxed pr-8">{data.summary}</p>
              <button
                onClick={onCopySummary}
                title="复制摘要"
                className="absolute top-0 right-0 p-1.5 rounded-kb-sm text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100 transition-all duration-kb-fast"
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* 关键要点 + 逐项闪卡按钮 */}
            {keyPointCount > 0 && (
              <div>
                <p className="text-b3 font-medium text-text-secondary uppercase tracking-wide mb-1">关键要点</p>
                <ul className="flex flex-col gap-1.5">
                  {data.keyPoints?.map((kp, i) => (
                    <li key={i} className="group flex items-start gap-2 text-b2 text-text-primary rounded-kb-sm px-2 py-1 -mx-2 hover:bg-bg-tertiary/50 transition-colors">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                      <span className="flex-1">{kp}</span>
                      <button
                        onClick={() => onGenerateFlashcard(kp, i)}
                        disabled={flashcardLoading}
                        title={convertedKeys.has(i) ? '已生成闪卡' : '生成闪卡'}
                        className={cn(
                          'flex-shrink-0 p-1 rounded-kb-sm transition-all duration-kb-fast',
                          convertedKeys.has(i)
                            ? 'text-semantic-success opacity-100'
                            : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100',
                          flashcardLoading && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        {convertedKeys.has(i) ? (
                          <Check className="w-3.5 h-3.5" strokeWidth={2} />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 智能建议区 */}
            {keyPointCount > 2 && (
              <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200/30 rounded-kb-md">
                <span className="text-b2 text-brand-700">
                  💡 检测到 {keyPointCount} 个核心概念，适合制作复习闪卡
                </span>
                <AIButton
                  size="sm"
                  onClick={onGenerateAllFlashcards}
                  disabled={flashcardLoading}
                  loading={flashcardLoading}
                  className="flex-shrink-0"
                >
                  一键生成
                </AIButton>
              </div>
            )}

            {/* 操作区 — 接受 / 拒绝 / 重试 三按钮 */}
            <div className="border-t border-border/30 pt-4 mt-2 flex items-center gap-3">
              <button
                onClick={() => onInsertNote('end')}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.97] transition-all duration-200 shadow-[0_2px_12px_-2px_rgba(91,138,114,0.4)]"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                接受
              </button>
              <button
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.97] transition-all duration-200"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
                拒绝
              </button>
              <button
                onClick={onRegenerate}
                disabled={loading}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.97] transition-all duration-200',
                  loading && 'opacity-60 cursor-not-allowed',
                )}
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} strokeWidth={1.5} />
                重试
              </button>
            </div>

            {/* 次级操作 */}
            <div className="flex items-center gap-2 mt-3">
              <div className="relative">
                <button
                  onClick={() => setInsertMenuOpen(!insertMenuOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
                >
                  插入到指定位置
                  <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                </button>
                {insertMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-36 bg-bg-elevated rounded-[var(--kb-radius-md)] shadow-kb-md border border-border/40 py-1 z-10">
                    {([
                      { pos: 'cursor', label: '光标位置' },
                      { pos: 'start', label: '笔记开头' },
                      { pos: 'end', label: '笔记末尾' },
                    ] as const).map(({ pos, label }) => (
                      <button
                        key={pos}
                        onClick={() => onInsertNote(pos)}
                        className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={onCopySummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
              >
                <Copy className="w-3 h-3" strokeWidth={1.5} />
                复制
              </button>

              <button
                onClick={onExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
              >
                <Download className="w-3 h-3" strokeWidth={1.5} />
                导出
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
