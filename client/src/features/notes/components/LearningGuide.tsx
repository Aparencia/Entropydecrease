/**
 * AI 学习向导栏——前瞻性学习引导
 * AI learning guide — proactive learning guidance
 *
 * @ai-context: 分析笔记内容，预测并推荐前置知识、延伸方向、常见误区，
 * 以及下一步学习路径。展示在编辑器底部非侵入式栏。
 * @ai-context: Analyzes note content to predict prerequisite knowledge,
 * extension directions, common pitfalls, and next learning steps.
 * Displayed as a non-intrusive bar at the bottom of the editor.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ArrowRight, AlertTriangle, BookOpen } from 'lucide-react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';

interface LearningGuideData {
  prerequisites: string[];
  extensions: string[];
  pitfalls: string[];
  path: string[];
}

interface LearningGuideProps {
  noteTitle: string;
  noteContent: string;
  noteId: string;
}

export function LearningGuide({ noteTitle, noteContent, noteId: _noteId }: LearningGuideProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LearningGuideData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const text = (noteContent || '').slice(0, 1500);
      const prompt = `分析以下笔记内容，返回 JSON 格式的学习建议（不要其他内容）：
{
  "prerequisites": ["前置知识1", "前置知识2"],
  "extensions": ["延伸方向1", "延伸方向2"],
  "pitfalls": ["常见误区1", "常见误区2"],
  "path": ["学习路径步骤1", "学习路径步骤2"]
}

笔记标题：${noteTitle}
笔记内容：${text}`;

      const result = await aiPluginLoader.summarizeNote(prompt, { style: 'outline' });
      const summary = result?.summary || '';

      // 尝试解析 JSON
      let parsed: LearningGuideData;
      try {
        const cleaned = summary.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx > startIdx) {
          parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        // 解析失败，使用默认结构
        parsed = {
          prerequisites: ['基础概念（待分析）'],
          extensions: ['延伸阅读（待分析）'],
          pitfalls: ['常见误区（待分析）'],
          path: ['继续学习（待分析）'],
        };
      }

      setData(parsed);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setLoading(false);
    }
  }, [noteTitle, noteContent, loading]);

  return (
    <div className="border-t border-border/30 bg-bg-elevated/50">
      {!data && !loading && (
        <button
          onClick={handleAnalyze}
          className="w-full flex items-center gap-2 px-4 py-2 text-c1 text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/30 transition-colors"
        >
          <Lightbulb className="w-3.5 h-3.5" strokeWidth={1.5} />
          AI 分析学习路径
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 px-4 py-2 text-c1 text-text-tertiary">
          <div className="w-3 h-3 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          AI 正在分析学习路径...
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-c1 text-semantic-error">
          {error}
          <button onClick={handleAnalyze} className="ml-2 underline hover:no-underline">重试</button>
        </div>
      )}

      <AnimatePresence>
        {data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: expanded ? 'auto' : 0, opacity: 1 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-3">
              {/* 前置知识 */}
              {data.prerequisites.length > 0 && (
                <div>
                  <p className="text-c1 font-medium text-text-primary flex items-center gap-1 mb-1">
                    <BookOpen className="w-3 h-3" strokeWidth={1.5} />
                    前置知识
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {data.prerequisites.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-kb-full text-c1 bg-amber-50 text-amber-700">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 延伸方向 */}
              {data.extensions.length > 0 && (
                <div>
                  <p className="text-c1 font-medium text-text-primary flex items-center gap-1 mb-1">
                    <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
                    延伸方向
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {data.extensions.map((e, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-kb-full text-c1 bg-blue-50 text-blue-700">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 常见误区 */}
              {data.pitfalls.length > 0 && (
                <div>
                  <p className="text-c1 font-medium text-text-primary flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                    常见误区
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {data.pitfalls.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-kb-full text-c1 bg-rose-50 text-rose-700">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 学习路径 */}
              {data.path.length > 0 && (
                <div>
                  <p className="text-c1 font-medium text-text-primary flex items-center gap-1 mb-1">
                    <Lightbulb className="w-3 h-3" strokeWidth={1.5} />
                    下一步
                  </p>
                  <div className="space-y-1">
                    {data.path.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-c1 text-text-secondary">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-brand-100 text-brand-600 text-[10px] font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LearningGuide;