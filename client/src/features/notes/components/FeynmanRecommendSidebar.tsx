/**
 * 笔记→费曼自动引导（N4）——AI 概念提取增强版
 *
 * @ai-context: 笔记编辑时基于 AI 概念提取识别核心概念（标题优先，回退规则式），
 * 展示概念列表并推荐最适合费曼讲解的概念。点击跳转 /feynman/new?concept=xxx。
 * 内容过少（<80 字）时不推荐，避免打断浅层记录。
 * @ai-context: AI-powered concept extraction for Feynman recommendation.
 * Shows concept list, recommends the best one for Feynman teaching.
 */
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';
import { Tip } from '@/components/ui/Tip';
import { useConceptExtractor } from '../hooks/useConceptExtractor';

interface FeynmanRecommendSidebarProps {
  noteContent: string;
  noteTitle: string;
  noteId?: string;
}

/** 内容少于该字数不推荐 */
export const FEYNMAN_RECOMMEND_MIN_CONTENT = 80;

export function FeynmanRecommendSidebar({ noteContent, noteTitle, noteId }: FeynmanRecommendSidebarProps) {
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);
  const { loading, concepts, extract } = useConceptExtractor();

  // 当笔记内容足够时，异步提取概念
  useEffect(() => {
    if (!noteId || noteContent.trim().length < FEYNMAN_RECOMMEND_MIN_CONTENT) return;
    const timer = setTimeout(() => {
      extract(noteId, noteContent, noteTitle);
    }, 2000); // 编辑暂停 2 秒后提取
    return () => clearTimeout(timer);
  }, [noteId, noteContent, noteTitle, extract]);

  // 规则式兜底概念（当 AI 提取结果为空或加载中时使用）
  const fallbackConcept = useMemo(() => {
    const title = noteTitle.trim();
    if (title && title !== '无标题') return title.slice(0, 30);
    const firstLine = noteContent
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find((l) => l.length > 2);
    return firstLine ? firstLine.slice(0, 30) : null;
  }, [noteTitle, noteContent]);

  // 最佳概念：AI 提取中 relevance 最高的，或 fallback
  const bestConcept = useMemo(() => {
    if (concepts.length > 0) {
      return concepts.reduce((best, c) => (c.relevance > best.relevance ? c : best), concepts[0]);
    }
    return fallbackConcept ? { name: fallbackConcept, relevance: 0.5, context: '' } : null;
  }, [concepts, fallbackConcept]);

  if (!noteId || noteContent.trim().length < FEYNMAN_RECOMMEND_MIN_CONTENT) return null;

  const handleStart = (conceptName: string) => {
    setNavigating(true);
    navigate(`/feynman/new?concept=${encodeURIComponent(conceptName)}`);
  };

  const handleRefresh = () => {
    if (noteId) extract(noteId, noteContent, noteTitle);
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/30 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-2">
        <GraduationCap className="w-3.5 h-3.5 text-feynman" strokeWidth={1.5} />
        <span className="text-b3 font-medium text-text-primary">费曼讲解推荐</span>
        {loading && (
          <RefreshCw className="w-3 h-3 text-text-tertiary animate-spin" strokeWidth={1.5} />
        )}
        <Tip
          text="通过「讲给完全不懂的人听」检验理解，能暴露笔记里说不清的概念盲点"
          side="bottom"
          className="ml-auto"
        >
          <button className="p-0.5 text-text-tertiary hover:text-text-primary transition-colors" aria-label="为什么推荐">
            ?
          </button>
        </Tip>
      </div>

      {bestConcept && (
        <div className="rounded-kb-md p-2.5 bg-bg-elevated border border-border/30 shadow-kb-sm">
          <div className="flex items-center gap-1 mb-1.5">
            {concepts.length > 0 && (
              <Sparkles className="w-3 h-3 text-feynman/60" strokeWidth={1.5} />
            )}
            <span className="text-c1 text-text-secondary">
              {concepts.length > 0 ? 'AI 识别到核心概念' : '推荐概念'}
            </span>
            {!loading && concepts.length > 0 && (
              <button
                onClick={handleRefresh}
                className="ml-auto p-0.5 text-text-tertiary hover:text-feynman transition-colors"
                title="重新提取概念"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
              </button>
            )}
          </div>
          <p className="text-c1 text-text-secondary leading-relaxed">
            「<span className="text-text-primary font-medium">{bestConcept.name}</span>」
            {bestConcept.relevance >= 0.7 && (
              <span className="ml-1 text-c1 text-feynman/70">(高度相关)</span>
            )}
          </p>
          {concepts.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {concepts.slice(0, 5).map((c) => (
                <button
                  key={c.name}
                  onClick={() => handleStart(c.name)}
                  disabled={navigating}
                  className="px-2 py-0.5 rounded-kb-full text-c1 bg-feynman/5 text-feynman/70 hover:bg-feynman/15 transition-colors"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => handleStart(bestConcept.name)}
            disabled={navigating}
            className="mt-1.5 flex items-center gap-1 px-2.5 py-1 rounded-kb-full text-c1 font-medium bg-feynman/10 text-feynman hover:bg-feynman/20 disabled:opacity-60 transition-colors duration-kb-fast"
          >
            <GraduationCap className="w-3 h-3" strokeWidth={1.5} />
            {navigating ? '正在进入…' : `费曼讲解：${bestConcept.name}`}
            <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}

export default FeynmanRecommendSidebar;