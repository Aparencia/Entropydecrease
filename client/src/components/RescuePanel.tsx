/**
 * @ai-context: 通用组件：RescuePanel。
 */
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, HelpCircle, Lightbulb, Layers, BookOpen,
  Coffee, RotateCcw, ArrowRight, Sparkles,
} from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import { cn } from '@/lib/utils';
import { useAIRescue } from '@/lib/ai/useAI';
import type { RescueContext } from '@/lib/ai/types';

type RescueLevel = 1 | 2 | 3;

interface RescuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    topic: string;
    relatedContent?: string;
    mode?: string;
  };
  /** 孵化建议回调 */
  onSuggestion?: (action: string) => void;
}

const LEVEL_CONFIG: Record<RescueLevel, { label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>; desc: string }> = {
  1: { label: '简化解释', icon: Lightbulb, desc: '换个方式重新理解' },
  2: { label: '拆解子概念', icon: Layers, desc: '分解复杂概念' },
  3: { label: '前置知识', icon: BookOpen, desc: '补充基础知识' },
};

const SUGGESTIONS = [
  { key: 'pomodoro', label: '开始深潜休息', icon: Coffee, desc: '休息5分钟再继续' },
  { key: 'flashcard', label: '切换反衰减呼吸复习', icon: RotateCcw, desc: '换个学习方式' },
  { key: 'switch', label: '换个科目', icon: ArrowRight, desc: '转换思路' },
];

export function RescuePanel({ isOpen, onClose, context, onSuggestion }: RescuePanelProps) {
  const [activeLevel, setActiveLevel] = useState<RescueLevel>(1);
  const [showIncubation, setShowIncubation] = useState(false);
  const { loading, data, error, needsConfig, streamingText, rescueStream } = useAIRescue();
  const navigate = useNavigate();

  // 面板打开时触发救援请求（P5 流式：打字机渐进展示，失败自动降级非流式）
  useEffect(() => {
    if (isOpen && context.topic) {
      const rescueCtx: RescueContext = {
        topic: context.topic,
        relatedContent: context.relatedContent,
        mode: (context.mode as RescueContext['mode']) ?? 'general',
      };
      rescueStream(rescueCtx);
    }
  }, [isOpen, context.topic, context.relatedContent, context.mode, rescueStream]);

  // 卡壳超10分钟显示孵化建议（由外部 useStuckTimer 触发）
  useEffect(() => {
    if (!isOpen) setShowIncubation(false);
  }, [isOpen]);

  const handleShowIncubation = useCallback(() => {
    setShowIncubation(true);
  }, []);

  // 暴露给父组件的触发方法（通过自定义事件）
  useEffect(() => {
    const handler = () => handleShowIncubation();
    window.addEventListener('rescue:show-incubation', handler);
    return () => window.removeEventListener('rescue:show-incubation', handler);
  }, [handleShowIncubation]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* 滑出面板 */}
          <motion.aside
            className={cn(
              'fixed top-0 right-0 h-full w-96 z-50',
              'backdrop-blur-xl bg-bg-elevated/90',
              'border-l border-border/40 shadow-kb-lg',
              'flex flex-col',
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* 头部 */}
            <div className="flex items-center gap-2 px-kb-md py-4 border-b border-border/40 flex-shrink-0">
              <div className="w-8 h-8 rounded-kb-full bg-brand-50 flex items-center justify-center">
                <HelpCircle className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-b1 font-semibold text-text-primary">学习救援</h2>
                <p className="text-c1 text-text-tertiary truncate">{context.topic}</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
              >
                <X className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
              </button>
            </div>

            {/* 三级标签 */}
            <div className="flex border-b border-border/40 flex-shrink-0">
              {([1, 2, 3] as RescueLevel[]).map((level) => {
                const config = LEVEL_CONFIG[level];
                const Icon = config.icon;
                const isActive = activeLevel === level;
                return (
                  <button
                    key={level}
                    onClick={() => setActiveLevel(level)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-3 text-b2 font-medium',
                      'border-b-2 transition-all duration-kb-fast',
                      isActive
                        ? 'border-focus text-focus'
                        : 'border-transparent text-text-tertiary hover:text-text-secondary',
                    )}
                  >
                    <Icon className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-kb-md py-kb-md">
              {loading && (
                <div className="flex items-center gap-2 text-b2 text-text-secondary py-8 justify-center">
                  {/* P5 流式：首 chunk 到达前显示思考动画，之后打字机渐进展示 */}
                  {streamingText ? (
                    <p className="text-b2 text-text-secondary leading-relaxed whitespace-pre-wrap">{streamingText}</p>
                  ) : (
                    <>
                      <AIThinkingIndicator size={4} gap={3} />
                      AI 正在思考救援方案…
                    </>
                  )}
                </div>
              )}

              {error && !loading && (
                <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                  {error}
                  {needsConfig && (
                    <button
                      onClick={() => navigate('/settings')}
                      className="mt-2 block text-b3 underline hover:no-underline"
                    >
                      前往设置页配置 API Key
                    </button>
                  )}
                </div>
              )}

              {!loading && !error && data && (
                <motion.div
                  key={activeLevel}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Level 1: 简化解释 */}
                  {activeLevel === 1 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-b2 text-text-tertiary italic">让我换个方式解释…</p>
                      {data.hints.length > 0 ? (
                        data.hints.map((hint, i) => (
                          <div key={i} className="p-3 rounded-kb-lg bg-bg-secondary shadow-kb-sm">
                            <p className="text-b2 text-text-secondary leading-relaxed">{hint}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-b2 text-text-tertiary">暂无简化解释</p>
                      )}
                      {data.alternativeApproach && (
                        <div className="p-3 rounded-kb-lg bg-brand-50 border border-brand-200/30">
                          <p className="text-b3 font-medium text-brand-600 mb-1">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            另一种思路
                          </p>
                          <p className="text-b2 text-text-secondary">{data.alternativeApproach}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Level 2: 拆解子概念 */}
                  {activeLevel === 2 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-b2 text-text-tertiary">将概念拆解为更小的部分：</p>
                      {data.hints.length > 0 ? (
                        data.hints.map((hint, i) => (
                          <div key={i} className="p-3 rounded-kb-lg bg-bg-secondary shadow-kb-sm">
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded-kb-full bg-brand-100 text-brand-600 text-c1 font-semibold flex items-center justify-center">
                                {i + 1}
                              </span>
                              <p className="text-b2 text-text-secondary leading-relaxed flex-1">{hint}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-b2 text-text-tertiary">暂无子概念拆解</p>
                      )}
                    </div>
                  )}

                  {/* Level 3: 前置知识 */}
                  {activeLevel === 3 && (
                    <div className="flex flex-col gap-3">
                      <p className="text-b2 text-text-tertiary">建议先掌握这些知识：</p>
                      {data.resources.length > 0 ? (
                        data.resources.map((res, i) => (
                          <a
                            key={i}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 rounded-kb-lg bg-bg-secondary shadow-kb-sm hover:bg-bg-tertiary transition-colors block"
                          >
                            <p className="text-b2 text-text-primary font-medium">{res.title}</p>
                            {res.description && (
                              <p className="text-c1 text-text-tertiary mt-1">{res.description}</p>
                            )}
                          </a>
                        ))
                      ) : data.hints.length > 0 ? (
                        data.hints.map((hint, i) => (
                          <div key={i} className="p-3 rounded-kb-lg bg-bg-secondary shadow-kb-sm">
                            <p className="text-b2 text-text-secondary leading-relaxed">{hint}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-b2 text-text-tertiary">暂无前置知识推荐</p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* 孵化建议区域 */}
              {showIncubation && (
                <motion.div
                  className="mt-6 pt-4 border-t border-border/40"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-b3 font-medium text-text-tertiary uppercase tracking-wide mb-3">
                    卡壳超过10分钟，试试这些
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.key}
                          onClick={() => onSuggestion?.(s.key)}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-kb-lg text-left',
                            'bg-bg-secondary hover:bg-bg-tertiary shadow-kb-sm',
                            'transition-all duration-kb-fast active:scale-[0.98]',
                          )}
                        >
                          <div className="w-8 h-8 rounded-kb-full bg-accent-50 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-icon-sm h-icon-sm text-accent-500" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="text-b2 text-text-primary font-medium">{s.label}</p>
                            <p className="text-c1 text-text-tertiary">{s.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
