/**
 * 笔记→费曼自动引导（N4）——编辑侧边栏推荐卡片
 *
 * @ai-context: 笔记编辑时基于内容规则式提取候选概念（标题优先，回退首个
 * 非空行），提示"这个概念适合用费曼学习法讲解"，一键跳转
 * /feynman/new?concept=xxx（FeynmanSessionPage 消费该参数自动建会话）。
 * 内容过少（<80 字）时不推荐，避免打断浅层记录。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight } from 'lucide-react';
import { Tip } from '@/components/ui/Tip';

interface FeynmanRecommendSidebarProps {
  /** 笔记正文（编辑器实时文本） */
  noteContent: string;
  /** 笔记标题 */
  noteTitle: string;
}

/** 内容少于该字数不推荐（内容过少无讲解价值） */
export const FEYNMAN_RECOMMEND_MIN_CONTENT = 80;

/** 规则式概念提取：标题 > 首个非空行（去除 Markdown 标题符号） */
function extractConcept(noteTitle: string, content: string): string | null {
  const title = noteTitle.trim();
  if (title && title !== '无标题') return title.slice(0, 30);
  const firstLine = content
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 2);
  return firstLine ? firstLine.slice(0, 30) : null;
}

export function FeynmanRecommendSidebar({ noteContent, noteTitle }: FeynmanRecommendSidebarProps) {
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);

  const concept = useMemo(
    () => extractConcept(noteTitle, noteContent),
    [noteTitle, noteContent],
  );

  if (!concept || noteContent.trim().length < FEYNMAN_RECOMMEND_MIN_CONTENT) return null;

  const handleStart = () => {
    setNavigating(true);
    navigate(`/feynman/new?concept=${encodeURIComponent(concept)}`);
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/30 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-2">
        <GraduationCap className="w-3.5 h-3.5 text-feynman" strokeWidth={1.5} />
        <span className="text-b3 font-medium text-text-primary">费曼讲解推荐</span>
        {/* N4: "为什么推荐" tooltip——讲清推荐依据，降低打扰感 */}
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
      <div className="rounded-kb-md p-2.5 bg-bg-elevated border border-border/30 shadow-kb-sm">
        <p className="text-c1 text-text-secondary leading-relaxed">
          「<span className="text-text-primary font-medium">{concept}</span>」这个概念适合用费曼学习法讲解
        </p>
        <button
          onClick={handleStart}
          disabled={navigating}
          className="mt-1.5 flex items-center gap-1 px-2.5 py-1 rounded-kb-full text-c1 font-medium bg-feynman/10 text-feynman hover:bg-feynman/20 disabled:opacity-60 transition-colors duration-kb-fast"
        >
          <GraduationCap className="w-3 h-3" strokeWidth={1.5} />
          {navigating ? '正在进入…' : '开始费曼学习'}
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export default FeynmanRecommendSidebar;
