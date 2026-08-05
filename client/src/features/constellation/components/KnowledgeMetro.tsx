/**
 * 知识地铁图（4.9）
 * Knowledge metro map
 *
 * @ai-context: React Flow 地铁图：线路=课程（每条线一色），站台=核心
 * 概念（圆点尺寸随掌握度），换乘=跨课程互连（虚线边），AI 推荐路径=
 * 琥珀色醒目虚线 overlay（journey 序列，先补最薄弱车站）。自定义节点
 * metroStation（四向 Handle：左右=线路、上下=换乘）与三类自定义边
 * （metroLine/metroTransfer/journeyEdge）均在模块级定义避免重建。
 * 布局由 lib/metroData.layoutMetro 纯函数产出（线路纵向排布、站台
 * 横向铺开）。空态由宿主引导。
 *
 * @ai-context: React Flow metro map: courses as colored lines, concepts
 * as mastery-sized stations, cross-course links as dashed transfers,
 * and the AI-recommended journey as a distinct amber overlay route.
 */
import { useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, BaseEdge, getSmoothStepPath,
  type NodeProps, type EdgeProps, type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TrainFront } from 'lucide-react';
import { layoutMetro } from '../lib/metroData';
import type { MetroData } from '../lib/mapTypes';

/** 站台节点数据 / Station node payload */
interface StationData {
  title: string;
  mastery: number;
  color: string;
  inJourney: boolean;
}

/** 站台最小/最大直径（掌握度 0→1）/ Station diameter range */
const STATION_MIN = 30;
const STATION_MAX = 58;

/** 推荐路径 overlay 色（醒目琥珀）/ Journey overlay color */
const JOURNEY_COLOR = '#f59e0b';

/** 站台节点：圆点尺寸随掌握度，四向 Handle（左右=线路、上下=换乘） */
function MetroStationNode({ data }: NodeProps) {
  const { title, mastery, color, inJourney } = data as unknown as StationData;
  const size = STATION_MIN + mastery * (STATION_MAX - STATION_MIN);
  return (
    <div
      className="relative flex items-center justify-center rounded-full border-2 bg-bg-elevated text-c1 text-text-primary shadow-kb-sm transition-all"
      style={{
        width: size,
        height: size,
        borderColor: color,
        boxShadow: inJourney ? `0 0 10px ${JOURNEY_COLOR}66` : undefined,
      }}
      title={`${title}（掌握度 ${Math.round(mastery * 100)}%）`}
    >
      <Handle type="target" id="l" position={Position.Left} className="!opacity-0" />
      <Handle type="source" id="r" position={Position.Right} className="!opacity-0" />
      <Handle type="target" id="t" position={Position.Top} className="!opacity-0" />
      <Handle type="source" id="s" position={Position.Bottom} className="!opacity-0" />
      <span className="px-1 text-center leading-tight line-clamp-2" style={{ fontSize: Math.max(9, size / 6) }}>
        {title}
      </span>
    </div>
  );
}

/** 线路边：课程色平滑线段 */
function MetroLineEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 14 });
  const d = data as { color: string };
  return <BaseEdge id={id} path={path} style={{ stroke: d.color, strokeWidth: 4, opacity: 0.75 }} />;
}

/** 换乘边：跨课程虚线 */
function MetroTransferEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 10 });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.65 }}
    />
  );
}

/** 推荐路径 overlay：醒目琥珀虚线 */
function JourneyEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 8 });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: JOURNEY_COLOR, strokeWidth: 2.5, strokeDasharray: '2 8',
        strokeLinecap: 'round', opacity: 0.9,
      }}
    />
  );
}

const nodeTypes = { metroStation: MetroStationNode };
const edgeTypes = { metroLine: MetroLineEdge, metroTransfer: MetroTransferEdge, journey: JourneyEdge };

function MetroInner({ data, onSelect }: { data: MetroData; onSelect?: (conceptId: string) => void }) {
  const { nodes, edges } = useMemo(() => {
    const layout = layoutMetro(data);
    const stationIds = new Set(data.courses.flatMap((c) => c.concepts.map((s) => s.id)));
    const journeySet = new Set(data.journey);

    // 站台节点（React Flow 节点尺寸需包含握手区）
    const nodes: Node[] = [];
    for (const course of data.courses) {
      for (const station of course.concepts) {
        const pos = layout.positions.get(station.id);
        if (!pos) continue;
        nodes.push({
          id: station.id,
          type: 'metroStation',
          position: { x: pos.x - STATION_MAX / 2, y: pos.y - STATION_MAX / 2 },
          data: {
            title: station.title,
            mastery: station.mastery,
            color: course.color,
            inJourney: journeySet.has(station.id),
          },
        });
      }
    }

    // 边：线路（同课程相邻站）/ 换乘（跨课程）/ 推荐路径 overlay
    const edges: Edge[] = [];
    for (const course of data.courses) {
      for (let i = 0; i < course.concepts.length - 1; i++) {
        const a = course.concepts[i];
        const b = course.concepts[i + 1];
        edges.push({
          id: `line:${course.id}:${i}`,
          source: a.id,
          target: b.id,
          type: 'metroLine',
          sourceHandle: 'r',
          targetHandle: 'l',
          data: { color: course.color, name: course.name },
        });
      }
    }
    for (const t of data.transfers) {
      if (!stationIds.has(t.from) || !stationIds.has(t.to)) continue;
      edges.push({
        id: `transfer:${t.from}-${t.to}`,
        source: t.from,
        target: t.to,
        type: 'metroTransfer',
        sourceHandle: 's',
        targetHandle: 't',
      });
    }
    for (let i = 0; i < data.journey.length - 1; i++) {
      const a = data.journey[i];
      const b = data.journey[i + 1];
      if (!stationIds.has(a) || !stationIds.has(b)) continue;
      edges.push({
        id: `journey:${a}-${b}`,
        source: a,
        target: b,
        type: 'journey',
        sourceHandle: 's',
        targetHandle: 't',
        zIndex: 10,
      });
    }

    return { nodes, edges };
  }, [data]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-kb-md text-center text-text-secondary">
        <TrainFront className="w-10 h-10 text-text-tertiary/40" strokeWidth={1.2} />
        <p className="text-b2">还没有可乘坐的知识线路</p>
        <p className="text-c1 text-text-tertiary max-w-sm">
          带溯源（课程）的闪卡概念会在这里成为站台，跨课程互连成为换乘。
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_e, node) => onSelect?.(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {/* 图例（DOM 覆盖层）：线路色 + 推荐路径 */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 px-3 py-2 rounded-kb-sm bg-bg-elevated/85 backdrop-blur border border-border/40 text-c1">
        {data.courses.map((c) => (
          <span key={c.id} className="flex items-center gap-2 text-text-secondary">
            <span className="w-4 h-[3px] rounded-full" style={{ background: c.color }} />
            {c.name}（{c.concepts.length} 站）
          </span>
        ))}
        {data.journey.length > 1 && (
          <span className="flex items-center gap-2 text-text-secondary">
            <span className="w-4 h-[3px] rounded-full" style={{ background: JOURNEY_COLOR }} />
            AI 推荐路径
          </span>
        )}
      </div>
    </div>
  );
}

/** 知识地铁图 / Knowledge metro map */
export function KnowledgeMetro({
  data,
  onSelect,
}: {
  data: MetroData;
  onSelect?: (conceptId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <MetroInner data={data} onSelect={onSelect} />
    </ReactFlowProvider>
  );
}
