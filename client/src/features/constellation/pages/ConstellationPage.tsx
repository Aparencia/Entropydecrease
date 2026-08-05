/**
 * 星座大厅（阶段 4 集成页）
 * Constellation hub page
 *
 * @ai-context: 五个标签页：星座（双轨：high 档 3D KnowledgeSky，
 * 否则 DOM KnowledgeConstellation，沿用仪表盘先例）/ 三维脑图 /
 * 地铁图 / 进化树 / 记忆宫殿。所有阶段 4 数据经 useKnowledgeGraph
 * 的 raw 派生（sourceRefs 从卡片 source_ref 提取溯源模块，复习记录
 * 直传派生层），派生规则由 lib 纯函数单测覆盖。tab 用本地 state，
 * 组件 chunk 由路由层 lazy 加载。
 *
 * @ai-context: Five-tab constellation hub; phase-4 visualizations share
 * the same knowledge graph source as the classic constellation tab.
 */
import { Suspense, lazy, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { useEffectiveTier } from '@/lib/performance/usePerformanceMode';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';
import { deriveMapNodes } from '../lib/mapData';
import { deriveMetroData } from '../lib/metroData';
import { deriveEvolutionData, deriveMemoryRooms } from '../lib/evolutionData';
import { KnowledgeMap3D } from '../components/KnowledgeMap3D';
import { KnowledgeMetro } from '../components/KnowledgeMetro';
import { KnowledgeEvolutionTree } from '../components/KnowledgeEvolutionTree';
import { MemoryPalace } from '../components/MemoryPalace';
import type { EvolutionData, MetroData } from '../lib/mapTypes';

// 星座双轨：3D 轨 chunk 较大，lazy 加载（沿仪表盘先例）
const KnowledgeConstellation = lazy(() =>
  import('../components/KnowledgeConstellation').then((m) => ({ default: m.KnowledgeConstellation })),
);
const KnowledgeSky = lazy(() =>
  import('@/lib/3d/scenes/KnowledgeSky').then((m) => ({ default: m.KnowledgeSky })),
);

/** 空数据常量（避免每次渲染重建对象） */
const EMPTY_METRO: MetroData = { courses: [], transfers: [], journey: [] };
const EMPTY_EVO: EvolutionData = { nodes: [], grafts: [] };

const TABS = [
  { id: 'constellation', label: '星座' },
  { id: 'map3d', label: '三维脑图' },
  { id: 'metro', label: '地铁图' },
  { id: 'tree', label: '进化树' },
  { id: 'palace', label: '记忆宫殿' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** 星座大厅 / Constellation hub page */
export default function ConstellationPage() {
  const { graph, raw, loading, error } = useKnowledgeGraph();
  const effectiveTier = useEffectiveTier();
  const [tab, setTab] = useState<TabId>('constellation');

  // 溯源映射：卡片 id（无 card: 前缀）→ source_ref 模块
  const sourceRefs = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of raw?.cards ?? []) {
      if (c.sourceRef) m.set(c.id, c.sourceRef);
    }
    return m;
  }, [raw]);

  // 阶段 4 派生层（纯函数；reviews 内联取值，raw 引用稳定则依赖稳定）
  const mapNodes = useMemo(
    () => (graph ? deriveMapNodes(graph, sourceRefs) : []),
    [graph, sourceRefs],
  );
  const metro = useMemo(
    () => (graph ? deriveMetroData(graph, sourceRefs) : EMPTY_METRO),
    [graph, sourceRefs],
  );
  const evolution = useMemo(
    () => (graph ? deriveEvolutionData(graph, raw?.reviews ?? [], sourceRefs) : EMPTY_EVO),
    [graph, raw, sourceRefs],
  );
  const rooms = useMemo(
    () => (graph ? deriveMemoryRooms(graph, raw?.reviews ?? [], sourceRefs) : []),
    [graph, raw, sourceRefs],
  );

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-rhythm-sm">
      <ModuleRitualHeader
        title="星座大厅"
        note="知识宇宙的多种打开方式"
        sealChar="座"
        sealColor="#6366F1"
        compact
        className="mb-rhythm-sm"
      />

      {/* 标签页切换 */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-kb-sm px-3.5 py-1.5 text-c1 whitespace-nowrap transition-colors',
              tab === t.id
                ? 'bg-brand-500/15 text-text-primary font-medium border border-brand-500/30'
                : 'text-text-tertiary hover:text-text-secondary border border-transparent',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 可视化容器（固定高度，供 Canvas / React Flow 撑满） */}
      <div className="h-[560px] rounded-kb-xl border border-border/40 bg-bg-elevated/20 overflow-hidden">
        {tab === 'constellation' && (
          <Suspense fallback={<div className="h-full animate-pulse-skeleton bg-bg-elevated/30" />}>
            {/* 双轨：high 档 → 3D 星空；否则 DOM/SVG 星座（冷启动引导在其中） */}
            {effectiveTier === 'high' && graph && !graph.coldStart && graph.nodes.length > 0 ? (
              <KnowledgeSky graph={graph} />
            ) : (
              <KnowledgeConstellation graph={graph} loading={loading} error={error} />
            )}
          </Suspense>
        )}
        {tab === 'map3d' && <KnowledgeMap3D nodes={mapNodes} />}
        {tab === 'metro' && <KnowledgeMetro data={metro} />}
        {tab === 'tree' && <KnowledgeEvolutionTree data={evolution} />}
        {tab === 'palace' && <MemoryPalace rooms={rooms} />}
      </div>
    </div>
  );
}
