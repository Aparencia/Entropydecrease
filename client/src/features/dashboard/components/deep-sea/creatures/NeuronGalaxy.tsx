/**
 * @file 发光神经元集群 -- 知识星图
 * @description 升级自 KnowledgeGalaxy，以 SVG 神经元节点 + 引力连线呈现知识网络
 * @ai-context: 替代原 KnowledgeGalaxy 组件，兼容 StarPoint 数据接口
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { StarPoint } from '@/components/ui/KnowledgeGalaxy';

interface Props {
  points: StarPoint[];
  className?: string;
}

/** 确定性哈希位置 */
function stablePosition(id: string, index: number, width: number, height: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const rng = Math.abs(hash % 1000) / 1000;
  const rng2 = Math.abs((hash * 7 + 13) % 1000) / 1000;
  return {
    x: 20 + rng * (width - 40),
    y: 10 + rng2 * (height - 20),
  };
}

/** 颜色映射 */
const nodeColors = {
  brand: { fill: '#fb923c', glow: 'rgba(251,146,60,0.6)' },
  accent: { fill: '#22d3ee', glow: 'rgba(34,211,238,0.6)' },
  purple: { fill: '#c084fc', glow: 'rgba(192,132,252,0.6)' },
};

export default function NeuronGalaxy({ points, className }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();

  const width = 400;
  const height = 140;

  /** 预计算节点位置 */
  const nodes = useMemo(() => {
    return points.map((p, i) => ({
      ...p,
      ...stablePosition(p.id, i, width, height),
      color: nodeColors[p.color],
    }));
  }, [points]);

  /** 计算连线（距离 < 60px 的节点之间） */
  const connections = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; opacity: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) {
          lines.push({
            x1: nodes[i].x, y1: nodes[i].y,
            x2: nodes[j].x, y2: nodes[j].y,
            opacity: Math.max(0.05, 0.2 - dist / 400),
          });
        }
      }
    }
    return lines;
  }, [nodes]);

  const hoveredPoint = useMemo(() => nodes.find((n) => n.id === hoveredId), [nodes, hoveredId]);

  return (
    <motion.div
      className={`relative rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/20 backdrop-blur-sm overflow-hidden ${className ?? ''}`}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label={`知识星图，${points.length} 个知识点`}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h3 className="text-[10px] font-medium text-cyan-200/60">神经元星图</h3>
        <span className="text-[9px] text-cyan-300/40">{points.length} 个节点</span>
      </div>

      {/* SVG 星图区域 */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[140px]">
        <defs>
          <filter id="neuron-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 引力连线（渐细渐隐） */}
        {connections.map((c, i) => (
          <line
            key={i}
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke="rgba(34, 211, 238, 0.15)"
            strokeWidth={0.5}
            opacity={c.opacity}
          />
        ))}

        {/* 背景微光 */}
        {Array.from({ length: 20 }).map((_, i) => (
          <circle
            key={`bg-${i}`}
            cx={(i * 37 + 13) % width}
            cy={(i * 23 + 7) % height}
            r={0.5}
            fill="white"
            opacity={0.1}
          />
        ))}

        {/* 知识节点 */}
        {nodes.map((node, index) => {
          const isHovered = hoveredId === node.id;
          const r = isHovered ? 5 : 3;
          return (
            <g key={node.id}>
              {/* 发光光晕 */}
              <circle
                cx={node.x} cy={node.y} r={r + 3}
                fill={node.color.glow}
                opacity={isHovered ? 0.4 : 0.15}
                filter="url(#neuron-glow)"
              />
              {/* 核心节点 */}
              <motion.circle
                cx={node.x} cy={node.y} r={r}
                fill={node.color.fill}
                opacity={isHovered ? 1 : 0.7}
                initial={prefersReduced ? {} : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.02, duration: 0.3 }}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* 悬浮提示 */}
      {hoveredPoint && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-bg-elevated/90 backdrop-blur-sm text-[9px] text-text-secondary rounded-kb-sm border border-cyan-400/20 whitespace-nowrap z-10">
          {hoveredPoint.title}
        </div>
      )}

      {/* 空状态 */}
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] text-cyan-200/30">开始学习，点亮你的神经元星图</span>
        </div>
      )}
    </motion.div>
  );
}
