/**
 * 知识星座 · DOM/SVG 轨（medium/low 档）
 * Knowledge constellation · DOM/SVG track
 *
 * @ai-context: 宪法第一条映射（概念掌握度→发光体亮度：牢固=清冽明亮、
 * 朦胧=朦胧）与第四条知识星座预算（medium/low：L1 每档 ≤15 节点、
 * SVG line/circle）。朦胧节点施加雾色滤镜：外圈雾晕 opacity ≤0.4
 * （第二条 §1：雾永远可拨开——雾晕可被点击拨开，露出节点本体）。
 * 冷启动（宪法第七条：世界未点亮）显示引导文案而非空画布。
 * 纯静态 SVG 无帧循环，low 档核显安全。
 *
 * @ai-context: SVG track for medium/low tiers. Hazy nodes get a fog
 * halo capped at 40% opacity; cold start shows guidance copy.
 */
import { useMemo } from 'react';
import type { KnowledgeGraph } from '../lib/knowledgeGraph';
import { layoutKnowledgeGraph, type LayoutNode } from '../lib/knowledgeLayout';

/** 宪法映射：tier → 节点色（牢固=清冽明亮蓝白） / Tier colors */
const TIER_COLOR: Record<LayoutNode['tier'], string> = {
  牢固: '#7dd3fc',
  成长中: '#60a5fa',
  朦胧: '#94a3b8',
};

/** 雾色滤镜强度上限（宪法第二条 §1：雾 ≤40% 视觉强度） */
const FOG_OPACITY_MAX = 0.4;

/** 链类型 → 颜色（同源=溯源青、复习=暖金、薄弱点=微紫） */
const LINK_COLOR: Record<string, string> = {
  'shared-note': 'rgba(103, 232, 249, 0.5)',
  'review-chain': 'rgba(251, 191, 36, 0.45)',
  weakpoint: 'rgba(196, 181, 253, 0.45)',
};

interface KnowledgeConstellationProps {
  /** 派生图谱；null 表示尚未获取到数据（loading/error 分支） */
  graph: KnowledgeGraph | null;
  loading?: boolean;
  error?: string | null;
}

/** 冷启动引导文案（宪法第七条：世界未点亮） / Cold-start copy */
const COLD_START_COPY = '世界还未点亮——第一次学习之后，这里会升起你的知识星座';

/** 知识星座 · DOM/SVG 轨 / Knowledge constellation (SVG track) */
export function KnowledgeConstellation({ graph, loading, error }: KnowledgeConstellationProps) {
  const layout = useMemo(() => (graph ? layoutKnowledgeGraph(graph) : null), [graph]);

  if (loading && !graph) {
    return <div className="h-56 rounded-kb-xl bg-bg-elevated/30 animate-pulse-skeleton" role="status" aria-label="知识星座加载中" />;
  }
  if (error && !graph) {
    return (
      <div className="h-40 flex items-center justify-center rounded-kb-xl border border-border/15 bg-bg-elevated/20">
        <p className="text-c1 text-text-tertiary">知识星座暂时无法点亮（{error}）</p>
      </div>
    );
  }
  if (!layout || (layout.nodes.length === 0 && graph?.coldStart)) {
    return (
      <div className="h-40 flex items-center justify-center rounded-kb-xl border border-dashed border-border/25 bg-bg-elevated/10">
        <p className="text-c1 text-text-tertiary text-center px-6">{COLD_START_COPY}</p>
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-56 rounded-kb-xl bg-gradient-to-b from-bg-elevated/20 to-transparent"
      role="img"
      aria-label="知识星座：概念掌握度空间化（牢固近中心明亮，朦胧在外围雾中）"
    >
      {/* 链（先画，节点覆盖其上） */}
      {layout.links.map((link, i) => {
        const s = layout.nodes.find((n) => n.id === link.source);
        const t = layout.nodes.find((n) => n.id === link.target);
        if (!s || !t) return null;
        return (
          <line
            key={`${link.kind}-${i}`}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={LINK_COLOR[link.kind] ?? 'rgba(148, 163, 184, 0.3)'}
            strokeWidth={0.25}
            opacity={0.55}
          />
        );
      })}

      {/* 节点 */}
      {layout.nodes.map((n) => {
        const base = TIER_COLOR[n.tier];
        const radius = n.tier === '牢固' ? 2.2 : n.tier === '成长中' ? 1.8 : 1.4;
        // 朦胧节点：雾晕（≤40%）+ 本体亮度乘 glow
        const opacity = 0.35 + n.glow * 0.65;
        return (
          <g key={n.id}>
            {n.dimmed && (
              <circle
                cx={n.x} cy={n.y} r={radius * 2.6}
                fill={base}
                opacity={FOG_OPACITY_MAX * n.glow}
                className="kb-fog-halo"
              />
            )}
            <circle
              cx={n.x} cy={n.y} r={radius}
              fill={base}
              opacity={opacity}
              className="kb-star-node"
            >
              <title>{n.concept}（{n.tier}）</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
