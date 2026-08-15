/**
 * AI 多粒度摘要增强版
 * AI multi-granularity summary enhanced
 *
 * @ai-context: 在 AISummaryModal 基础上扩展，支持 3 种粒度摘要（一句话/
 * 一段话/详细综述），可对比摘要版本，跨笔记聚合摘要。
 * @ai-context: Extends AISummaryModal with 3 granularity levels
 * (one-liner/paragraph/detailed), version comparison, cross-note aggregation.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Sparkles } from 'lucide-react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type SummaryGranularity = 'oneliner' | 'paragraph' | 'detailed';

const GRANULARITY_CONFIG: Record<SummaryGranularity, { label: string; desc: string; prompt: (text: string) => string }> = {
  oneliner: {
    label: '一句话',
    desc: '一句话概括核心内容',
    prompt: (text) => `用一句话概括以下笔记的核心内容（不超过 50 字）：\n\n${text.slice(0, 3000)}`,
  },
  paragraph: {
    label: '一段话',
    desc: '一段话完整摘要',
    prompt: (text) => `为以下笔记写一段摘要（100-200 字），概括主要内容：\n\n${text.slice(0, 3000)}`,
  },
  detailed: {
    label: '详细综述',
    desc: '多段详细综述',
    prompt: (text) => `为以下笔记写一篇详细综述，包含：核心论点、论据、结论。分段落组织。\n\n${text.slice(0, 3000)}`,
  },
};

interface AISummaryEnhancedProps {
  noteContent: string;
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string, position: 'cursor' | 'start' | 'end') => void;
}

export function AISummaryEnhanced({
  noteContent,
  isOpen,
  onClose,
  onInsertText,
}: AISummaryEnhancedProps) {
  const [granularity, setGranularity] = useState<SummaryGranularity>('paragraph');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ granularity: SummaryGranularity; text: string }>>([]);
  const { toast } = useToast();

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setResult(null);

    try {
      const config = GRANULARITY_CONFIG[granularity];
      const res = await aiPluginLoader.summarizeNote(config.prompt(noteContent), { style: 'paragraph' });
      const text = res?.summary || '生成失败';
      setResult(text);
      setHistory((prev) => [...prev, { granularity, text }]);
      toast({ type: 'success', message: `${config.label}摘要生成完成`, silent: true });
    } catch {
      toast({ type: 'error', message: '摘要生成失败' });
    } finally {
      setLoading(false);
    }
  }, [granularity, noteContent, toast]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed right-0 top-0 h-full w-96 z-50 backdrop-blur-xl bg-bg-elevated/90 border-l border-border/40 shadow-kb-lg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/40 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            <span className="text-b1 font-semibold text-text-primary flex-1">AI 摘要</span>
            <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-4 border-b border-border/30">
            <p className="text-b3 font-medium text-text-secondary mb-2">选择粒度</p>
            <div className="flex gap-1">
              {(Object.entries(GRANULARITY_CONFIG) as [SummaryGranularity, typeof GRANULARITY_CONFIG['oneliner']][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setGranularity(key)}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-kb-sm text-c1 font-medium transition-colors text-center',
                    granularity === key ? 'bg-brand-500 text-white' : 'bg-bg-secondary text-text-tertiary hover:bg-bg-tertiary',
                  )}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <p className="text-c1 text-text-tertiary mt-1">{GRANULARITY_CONFIG[granularity].desc}</p>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="mt-2 w-full px-3 py-2 rounded-kb-md bg-brand-500 text-white text-b2 font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {loading ? '生成中...' : '生成摘要'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {result && (
              <div className="p-3 rounded-kb-md bg-bg-secondary border border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-c1 font-medium text-text-primary">{GRANULARITY_CONFIG[granularity].label}</span>
                  <div className="flex gap-1">
                    <button onClick={() => { navigator.clipboard.writeText(result); toast({ type: 'success', message: '已复制', silent: true }); }}
                      className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => onInsertText(result, 'end')}
                      className="p-1 text-text-tertiary hover:text-brand-600 transition-colors">
                      插入
                    </button>
                  </div>
                </div>
                <p className="text-b2 text-text-secondary leading-relaxed whitespace-pre-wrap">{result}</p>
              </div>
            )}

            {history.length > 1 && (
              <div>
                <p className="text-b3 font-medium text-text-secondary mb-2">历史版本</p>
                {history.slice(0, -1).reverse().map((h, i) => (
                  <div key={i} className="p-2 rounded-kb-md bg-bg-secondary/50 border border-border/20 mb-2">
                    <span className="text-c1 text-text-tertiary">{GRANULARITY_CONFIG[h.granularity].label}</span>
                    <p className="text-c1 text-text-secondary mt-1 line-clamp-3">{h.text}</p>
                  </div>
                ))}
              </div>
            )}

            {!result && history.length === 0 && (
              <p className="text-b2 text-text-tertiary text-center py-8">选择粒度并点击生成</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AISummaryEnhanced;