/**
 * 认知深度指示器
 * Cognitive depth indicator
 *
 * @ai-context: 展示当前笔记的认知深度等级（海面→海沟），基于字数、概念密度、
 * 链接数等指标 AI 计算。视觉上以深海深度计的形式呈现，与品牌深海叙事一致。
 * @ai-context: Displays the cognitive depth level of the current note
 * (surface → trench), calculated from word count, concept density, and
 * link count. Presented as a deep-sea depth gauge.
 */
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DepthIndicatorProps {
  /** 字数 */
  wordCount: number;
  /** 概念密度 (0-1) */
  conceptDensity: number;
  /** 链接数 */
  linkCount: number;
  /** 是否垂直显示（默认 false） */
  vertical?: boolean;
}

const DEPTH_LEVELS = [
  { max: 0.2, label: '海面', desc: '浅层记录', color: 'text-sky-400', bar: 'bg-sky-400' },
  { max: 0.4, label: '浅海', desc: '初步理解', color: 'text-blue-400', bar: 'bg-blue-400' },
  { max: 0.6, label: '中层', desc: '深入思考', color: 'text-indigo-400', bar: 'bg-indigo-400' },
  { max: 0.8, label: '深海', desc: '深度分析', color: 'text-violet-400', bar: 'bg-violet-400' },
  { max: 1.0, label: '海沟', desc: '极致洞察', color: 'text-purple-400', bar: 'bg-purple-400' },
];

export function DepthIndicator({
  wordCount,
  conceptDensity,
  linkCount,
  vertical = false,
}: DepthIndicatorProps) {
  // 综合深度评分 (0-1)
  const depthScore = useMemo(() => {
    const wordScore = Math.min(wordCount / 500, 1) * 0.4;
    const densityScore = conceptDensity * 0.35;
    const linkScore = Math.min(linkCount / 10, 1) * 0.25;
    return Math.min(wordScore + densityScore + linkScore, 1);
  }, [wordCount, conceptDensity, linkCount]);

  const currentLevel = DEPTH_LEVELS.find((l) => depthScore <= l.max) || DEPTH_LEVELS[DEPTH_LEVELS.length - 1];
  const levelIndex = DEPTH_LEVELS.indexOf(currentLevel);

  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-2">
        {/* 垂直深度计 */}
        <div className="relative h-40 w-3 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className="absolute bottom-0 w-full rounded-full transition-all duration-700 ease-out"
            style={{
              height: `${depthScore * 100}%`,
              background: 'linear-gradient(to top, rgb(124,58,237), rgb(96,165,250))',
            }}
          />
        </div>
        <span className={cn('text-c1 font-medium', currentLevel.color)}>
          {currentLevel.label}
        </span>
        <span className="text-c1 text-text-tertiary">{currentLevel.desc}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-2">
      {/* 水平深度计 */}
      <div className="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${depthScore * 100}%`,
            background: 'linear-gradient(to right, rgb(96,165,250), rgb(124,58,237))',
          }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        {DEPTH_LEVELS.map((level, i) => (
          <span
            key={level.label}
            className={cn(
              'text-c1 transition-colors',
              i === levelIndex ? level.color : 'text-text-tertiary/40',
              i < levelIndex && 'text-text-tertiary/60',
            )}
          >
            {level.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DepthIndicator;