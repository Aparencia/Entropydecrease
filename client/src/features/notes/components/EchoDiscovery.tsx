/**
 * 笔记回声发现面板——被动知识发现
 * Note echo discovery panel — passive knowledge discovery
 *
 * @ai-context: 定期扫描全库笔记，发现语义相似但无链接的笔记对，推荐给用户
 * 建立关联。基于 AI 分析或纯本地 BM25 搜索。用户可确认/拒绝推荐。
 * @ai-context: Periodically scans the note library for semantically similar
 * but unlinked note pairs, recommending them for connection. Users can
 * accept or reject recommendations.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link2, Sparkles, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';
import { useNoteStore } from '../store/useNoteStore';
import { recomputeLinks } from '../lib/links/noteLinkStore';

interface EchoSuggestion {
  id: string;
  fromId: string;
  fromTitle: string;
  toId: string;
  toTitle: string;
  /** 相似度评分 (0-1) */
  score: number;
  /** 匹配原因 */
  reason: string;
}

interface EchoDiscoveryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EchoDiscovery({ isOpen, onClose }: EchoDiscoveryProps) {
  const notes = useNoteStore((s) => s.notes);
  const [suggestions, setSuggestions] = useState<EchoSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [processed, setProcessed] = useState<Set<string>>(new Set());

  // 扫描全库笔记，发现潜在关联
  const scan = useCallback(() => {
    if (notes.length < 2) return;
    setLoading(true);

    // 使用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      const results: EchoSuggestion[] = [];
      const noteList = notes.filter((n) => n.content && n.content.length > 50);

      for (let i = 0; i < noteList.length; i++) {
        for (let j = i + 1; j < noteList.length; j++) {
          const a = noteList[i];
          const b = noteList[j];
          const pairId = `${a.id}->${b.id}`;

          // 跳过已处理的建议
          if (processed.has(pairId)) continue;

          // 检查标题相似度
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();

          // 检查标签重叠
          const tagOverlap = a.tags.filter((t) => b.tags.includes(t)).length;

          // 计算简单相似度评分
          let score = 0;
          const reasons: string[] = [];

          if (titleA.includes(titleB) || titleB.includes(titleA)) {
            score += 0.4;
            reasons.push('标题相关');
          }

          if (tagOverlap > 0) {
            score += Math.min(tagOverlap * 0.2, 0.4);
            reasons.push(`${tagOverlap} 个共同标签`);
          }

          if (score >= 0.3) {
            results.push({
              id: pairId,
              fromId: a.id,
              fromTitle: a.title || '未命名',
              toId: b.id,
              toTitle: b.title || '未命名',
              score: Math.min(score, 1),
              reason: reasons.join('，'),
            });
          }
        }
      }

      // 按相似度排序
      results.sort((a, b) => b.score - a.score);
      setSuggestions(results.slice(0, 10));
      setLoading(false);
    }, 100);
  }, [notes, processed]);

  useEffect(() => {
    if (isOpen) scan();
  }, [isOpen, scan]);

  // 确认关联：建立链接
  const handleConfirm = useCallback(async (suggestion: EchoSuggestion) => {
    try {
      const fromNote = notes.find((n) => n.id === suggestion.fromId);
      if (fromNote?.content) {
        await recomputeLinks(suggestion.fromId, fromNote.content);
      }
      setProcessed((prev) => new Set(prev).add(suggestion.id));
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch { /* ignore */ }
  }, [notes]);

  // 拒绝关联
  const handleReject = useCallback((suggestionId: string) => {
    setProcessed((prev) => new Set(prev).add(suggestionId));
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
  }, []);

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
            <div className="w-8 h-8 rounded-kb-full bg-brand-50 flex items-center justify-center">
              <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-b1 font-semibold text-text-primary">笔记回声</h2>
              <p className="text-c1 text-text-tertiary">发现潜在的知识关联</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" strokeWidth={1.5} />
              </div>
            )}

            {!loading && suggestions.length === 0 && (
              <div className="text-center py-12">
                <p className="text-b2 text-text-tertiary">暂无新的关联发现</p>
                <button
                  onClick={scan}
                  className="mt-3 px-3 py-1.5 rounded-kb-md text-c1 font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  重新扫描
                </button>
              </div>
            )}

            <div className="space-y-3">
              {suggestions.map((s) => (
                <motion.div
                  key={s.id}
                  className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-1 mb-2">
                    <Link2 className="w-3.5 h-3.5 text-brand-500" strokeWidth={1.5} />
                    <span className="text-c1 text-text-tertiary font-mono">
                      {(s.score * 100).toFixed(0)}% 匹配
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-b2">
                    <span className="text-text-primary font-medium truncate">{s.fromTitle}</span>
                    <span className="text-text-tertiary">↔</span>
                    <span className="text-text-primary font-medium truncate">{s.toTitle}</span>
                  </div>
                  <p className="text-c1 text-text-tertiary mt-1">{s.reason}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleConfirm(s)}
                      className="flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 font-medium text-semantic-success hover:bg-semantic-success/10 transition-colors"
                    >
                      <ThumbsUp className="w-3 h-3" strokeWidth={1.5} />
                      确认关联
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 font-medium text-text-tertiary hover:text-semantic-error hover:bg-semantic-error/10 transition-colors"
                    >
                      <ThumbsDown className="w-3 h-3" strokeWidth={1.5} />
                      忽略
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default EchoDiscovery;