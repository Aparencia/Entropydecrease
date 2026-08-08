/**
 * 笔记健康详细面板（交互式健康报告卡）
 * Note health detailed panel — interactive health report card
 *
 * @ai-context: 在 NoteHealthIndicator 基础上扩展，展示六项维度详细评分
 * 和 AI 改进建议。支持点击维度展开详情、一键修复建议。
 * @ai-context: Extends NoteHealthIndicator with detailed six-dimension
 * scoring, AI improvement suggestions, and interactive drill-down.
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Lightbulb, Sparkles, RefreshCw } from 'lucide-react';
import { assessNoteHealth, healthLevel, type NoteHealthResult } from '../lib/noteHealth';
import { cn } from '@/lib/utils';

interface NoteHealthDetailedPanelProps {
  text: string;
  title?: string;
  tags?: string[];
  isOpen: boolean;
  onClose: () => void;
}

interface DimensionConfig {
  key: keyof Omit<NoteHealthResult, 'score' | 'suggestions'>;
  label: string;
  description: string;
  color: string;
}

const DIMENSIONS: DimensionConfig[] = [
  { key: 'structure', label: '结构', description: '标题与列表组织度', color: 'rgb(96,165,250)' },
  { key: 'generative', label: '生成性', description: '用自己的话表达的程度', color: 'rgb(251,191,36)' },
  { key: 'coverage', label: '覆盖度', description: '内容完整性和词汇丰富度', color: 'rgb(52,211,153)' },
  { key: 'keywordCoverage', label: '关键词覆盖', description: '标题/标签关键词在正文中的出现密度', color: 'rgb(167,139,250)' },
  { key: 'readability', label: '可读性', description: '段落长度、句子复杂度', color: 'rgb(244,114,182)' },
  { key: 'conceptDensity', label: '概念密度', description: '中文字符占比，实质内容充实度', color: 'rgb(251,146,60)' },
];

export function NoteHealthDetailedPanel({
  text,
  title,
  tags,
  isOpen,
  onClose,
}: NoteHealthDetailedPanelProps) {
  const [expandedDim, setExpandedDim] = useState<string | null>(null);

  const result = useMemo(() => assessNoteHealth(text, title, tags), [text, title, tags]);

  if (!isOpen) return null;

  const level = result ? healthLevel(result.score) : 'weak';
  const levelColors = {
    good: 'text-semantic-success border-semantic-success/30 bg-semantic-success/5',
    fair: 'text-semantic-warning border-semantic-warning/30 bg-semantic-warning/5',
    weak: 'text-semantic-error border-semantic-error/30 bg-semantic-error/5',
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl border border-border/40 bg-bg-secondary shadow-xl overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
              <h3 className="text-b1 font-semibold text-text-primary">笔记健康报告</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {!result ? (
              <p className="text-b2 text-text-tertiary text-center py-8">
                内容太少，暂无法评估健康度
              </p>
            ) : (
              <>
                {/* 总分 */}
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-h1 font-bold border-2',
                    levelColors[level],
                  )}>
                    {result.score}
                  </div>
                  <div className="flex-1">
                    <p className="text-b1 font-semibold text-text-primary">
                      {level === 'good' ? '不错！' : level === 'fair' ? '还可以更好' : '需要改进'}
                    </p>
                    <p className="text-c1 text-text-tertiary">
                      {result.suggestions.length > 0
                        ? `${result.suggestions.length} 条改进建议`
                        : '笔记质量良好'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-health-indicator]');
                      el?.dispatchEvent(new CustomEvent('refresh-health'));
                    }}
                    className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                    title="重新评估"
                  >
                    <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>

                {/* 六维评分 */}
                <div className="space-y-2">
                  {DIMENSIONS.map((dim) => {
                    const score = result[dim.key] as number;
                    const isExpanded = expandedDim === dim.key;
                    const dimLevel = healthLevel(score);
                    return (
                      <div key={dim.key} className="rounded-kb-md border border-border/30 overflow-hidden">
                        <button
                          onClick={() => setExpandedDim(isExpanded ? null : dim.key)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-bg-tertiary/30 transition-colors"
                        >
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-b3 font-medium text-text-primary">{dim.label}</span>
                              <span className="text-c1 text-text-tertiary">{dim.description}</span>
                            </div>
                            {/* 进度条 */}
                            <div className="mt-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${score}%`,
                                  background: dim.color,
                                  opacity: score > 0 ? 0.8 : 0.3,
                                }}
                              />
                            </div>
                          </div>
                          <span className={cn(
                            'text-b2 font-mono font-medium',
                            dimLevel === 'good' ? 'text-semantic-success' :
                            dimLevel === 'fair' ? 'text-semantic-warning' : 'text-semantic-error',
                          )}>
                            {score}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3">
                            <div className="flex items-start gap-2 p-2 rounded-kb-md bg-bg-tertiary/30">
                              <Lightbulb className="w-3.5 h-3.5 text-brand-500 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                              <p className="text-c1 text-text-secondary">
                                {score >= 80
                                  ? `${dim.label}方面表现良好，继续保持。`
                                  : score >= 50
                                    ? `${dim.label}方面还有提升空间。`
                                    : `${dim.label}方面需要加强。`}
                                {result.suggestions.find((s) =>
                                  s.includes(dim.label) || s.includes('标题') || s.includes('段落') || s.includes('内容')
                                ) || `建议关注${dim.label}维度的改进。`}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 建议列表 */}
                {result.suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-b3 font-medium text-text-primary flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" strokeWidth={1.5} />
                      改进建议
                    </p>
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-kb-md bg-brand-500/5 border border-brand-500/10">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-600 text-c1 font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-c1 text-text-secondary">{s}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default NoteHealthDetailedPanel;