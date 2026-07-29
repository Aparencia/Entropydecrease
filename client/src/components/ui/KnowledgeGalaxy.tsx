/**
 * 知识星河组件
 *
 * Dashboard 横向区域展示已掌握的知识点，
 * 每个星点代表一个已掌握的闪卡。
 * 鼠标悬浮显示闪卡标题。
 *
 * 动效：
 * - 入场 stagger（opacity + scale，每星点延迟 40ms）
 * - 悬浮放大 + 发光（scale 1.5，box-shadow glow，200ms）
 * - 呼吸闪烁（随机 opacity 脉动，2-4s 周期）
 * - prefers-reduced-motion 时禁用所有动效
 *
 * @ai-context: UI 基础组件（shadcn/radix 封装）：KnowledgeGalaxy。
 */
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface StarPoint {
  id: string;
  title: string;
  color: 'brand' | 'accent' | 'purple'; // 橙=独立闪卡、青=笔记关联、紫=费曼关联
}

export interface KnowledgeGalaxyProps {
  points: StarPoint[];
  className?: string;
}

const colorMap = {
  brand: 'bg-brand-400',
  accent: 'bg-accent-400',
  purple: 'bg-purple-400',
};

const glowColorMap = {
  brand: '0 0 8px 2px rgba(251, 146, 60, 0.6)',
  accent: '0 0 8px 2px rgba(34, 211, 238, 0.6)',
  purple: '0 0 8px 2px rgba(192, 132, 252, 0.6)',
};

/** 用确定性哈希为每个星点生成稳定的随机值 */
function stableRandom(id: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

export default function KnowledgeGalaxy({ points, className }: KnowledgeGalaxyProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();

  const hoveredPoint = useMemo(
    () => points.find((p) => p.id === hoveredId),
    [points, hoveredId],
  );

  return (
    <div className={cn('relative', className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between mb-kb-sm">
        <h3 className="text-h3 font-medium text-text-primary">知识星河</h3>
        <span className="text-b3 text-text-tertiary">
          已掌握 {points.length} 个知识点
        </span>
      </div>

      {/* 星点区域 */}
      <div className="relative h-24 bg-bg-secondary rounded-kb-lg overflow-hidden border border-border">
        {/* 背景微光效果 */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white rounded-full"
              style={{
                left: `${(i * 37 + 13) % 100}%`,
                top: `${(i * 23 + 7) % 100}%`,
              }}
            />
          ))}
        </div>

        {/* 知识星点 */}
        <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-2 p-kb-sm">
          {points.map((point, index) => {
            const shouldTwinkle = stableRandom(point.id, 42) > 0.5;
            const twinkleDuration = 2 + stableRandom(point.id, 7) * 2; // 2-4s
            const twinkleDelay = stableRandom(point.id, 13) * 3; // 0-3s
            const entranceDelay = index * 40; // stagger 40ms

            return (
              <div
                key={point.id}
                className={cn(
                  'w-3 h-3 rounded-full cursor-pointer',
                  colorMap[point.color],
                )}
                style={{
                  // 入场 stagger：opacity 0→1 + scale 0→1
                  animation: prefersReduced
                    ? 'none'
                    : shouldTwinkle
                      ? `kb-galaxy-enter 300ms ease-out ${entranceDelay}ms both, kb-galaxy-twinkle ${twinkleDuration}s ease-in-out ${twinkleDelay}s infinite`
                      : `kb-galaxy-enter 300ms ease-out ${entranceDelay}ms both`,
                  // 悬浮交互：scale + glow，200ms 过渡
                  transition: 'transform 200ms ease, box-shadow 200ms ease, filter 200ms ease',
                }}
                onMouseEnter={(e) => {
                  setHoveredId(point.id);
                  const el = e.currentTarget;
                  el.style.transform = 'scale(1.5)';
                  el.style.boxShadow = glowColorMap[point.color];
                  el.style.filter = 'brightness(1.3)';
                }}
                onMouseLeave={(e) => {
                  setHoveredId(null);
                  const el = e.currentTarget;
                  el.style.transform = '';
                  el.style.boxShadow = '';
                  el.style.filter = '';
                }}
              />
            );
          })}
        </div>

        {/* 悬浮提示 */}
        {hoveredPoint && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-bg-elevated text-b3 text-text-secondary rounded-kb-sm shadow-kb-md border border-border whitespace-nowrap z-10 animate-fade-in-up">
            {hoveredPoint.title}
          </div>
        )}

        {/* 空状态 */}
        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-b3 text-text-tertiary">开始学习，点亮你的知识星河 ✨</span>
          </div>
        )}
      </div>
    </div>
  );
}
