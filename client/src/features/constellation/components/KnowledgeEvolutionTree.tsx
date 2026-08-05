/**
 * 知识进化树（4.10）
 * Knowledge evolution tree
 *
 * @ai-context: React Flow 树形布局（dagre TB，仿 noteGraphLayout 栈）：
 * 概念生命周期五阶段 种子→萌芽→成长→开花→结果，阶段色随生命周期递进
 * （灰→绿→紫→金，种子用圆点表示避免无 Seed 图标）。parentId 主干边为
 * 实线，grafts 嫁接关系为紫色虚线（跨分支授粉），wilted 枯萎预警挂
 * AlertTriangle 徽标（只对已生长节点生效，种子不算枯萎）。数据由
 * lib/evolutionData.ts 纯函数派生，组件只消费、不做派生。空态由宿主引导。
 *
 * @ai-context: React Flow tree (dagre TB) mapping the concept lifecycle
 * stages (seed→sprout→growing→bloom→fruit) with per-stage colors,
 * dashed graft edges, and wilt warning badges.
 */
import { useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, BaseEdge, getBezierPath,
  type NodeProps, type EdgeProps, type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Apple, Flower2, Sprout, TreePine } from 'lucide-react';
import type { EvolutionData, EvolutionStage } from '../lib/mapTypes';

/** 节点宽高（dagre 布局输入）/ Node size */
const NODE_W = 150;
const NODE_H = 58;

/** 五阶段视觉元数据（色随生命周期递进） / Per-stage visuals */
const STAGE_META: Record<EvolutionStage, { label: string; color: string }> = {
  seed: { label: '种子', color: '#94a3b8' },
  sprout: { label: '萌芽', color: '#4ade80' },
  growing: { label: '成长', color: '#22c55e' },
  bloom: { label: '开花', color: '#a78bfa' },
  fruit: { label: '结果', color: '#fbbf24' },
};

/** 枯萎预警徽标色 / Wilt badge color */
const WILT_COLOR = '#f87171';
/** 嫁接边色（虚线）/ Graft edge color */
const GRAFT_COLOR = '#c084fc';
/** 主干边色 / Trunk edge color */
const TRUNK_COLOR = '#64748b';

/** 节点 payload / Node payload */
interface EvolutionNodeData {
  title: string;
  stage: EvolutionStage;
  wilted: boolean;
}

/** 阶段图标：种子=空心圆点，其余用阶段意象图标 */
function StageIcon({ stage }: { stage: EvolutionStage }) {
  const color = STAGE_META[stage].color;
  if (stage === 'seed') {
    return <span className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: color }} />;
  }
  if (stage === 'growing') {
    return <Sprout className="w-4 h-4" style={{ color }} strokeWidth={2} />;
  }
  if (stage === 'sprout') {
    return <Sprout className="w-4 h-4" style={{ color }} strokeWidth={1.8} />;
  }
  if (stage === 'bloom') {
    return <Flower2 className="w-4 h-4" style={{ color }} strokeWidth={1.8} />;
  }
  return <Apple className="w-4 h-4" style={{ color }} strokeWidth={1.8} />;
}

/** 树节点：阶段色边框 + 图标 + 标题 + 枯萎徽标 */
function EvolutionTreeNode({ data }: NodeProps) {
  const { title, stage, wilted } = data as unknown as EvolutionNodeData;
  const meta = STAGE_META[stage];
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-1 rounded-kb-md border bg-bg-elevated px-2 text-center shadow-kb-sm"
      style={{ width: NODE_W, height: NODE_H, borderColor: `${meta.color}66` }}
      title={`${title}（${meta.label}${wilted ? ' · 枯萎预警' : ''}）`}
    >
      {wilted && (
        <span className="absolute -top-2.5 -right-2.5 flex items-center gap-0.5 rounded-full border border-red-400/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
          <AlertTriangle className="w-3 h-3" />
          枯萎
        </span>
      )}
      <StageIcon stage={stage} />
      <span className="text-c1 text-text-primary leading-tight line-clamp-2">{title}</span>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

/** 主干边：父子实线 */
function TreeEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{ stroke: TRUNK_COLOR, strokeWidth: 1.5, opacity: 0.55 }}
    />
  );
}

/** 嫁接边：跨分支紫色虚线 */
function GraftEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{ stroke: GRAFT_COLOR, strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.85 }}
    />
  );
}

const nodeTypes = { evolutionNode: EvolutionTreeNode };
const edgeTypes = { treeEdge: TreeEdge, graftEdge: GraftEdge };

function EvolutionInner({ data }: { data: EvolutionData }) {
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 88, marginx: 24, marginy: 24 });

    for (const n of data.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
    const ids = new Set(data.nodes.map((n) => n.id));

    // 主干边（父子）+ 嫁接边（跨分支）；悬空端点跳过
    const edges: Edge[] = [];
    for (const n of data.nodes) {
      if (!n.parentId || !ids.has(n.parentId)) continue;
      g.setEdge(n.parentId, n.id);
      edges.push({
        id: `trunk:${n.parentId}->${n.id}`,
        source: n.parentId,
        target: n.id,
        type: 'treeEdge',
      });
    }
    for (const graft of data.grafts) {
      if (!ids.has(graft.from) || !ids.has(graft.to)) continue;
      edges.push({
        id: `graft:${graft.from}->${graft.to}`,
        source: graft.from,
        target: graft.to,
        type: 'graftEdge',
        zIndex: 5,
      });
    }

    dagre.layout(g);

    const nodes: Node[] = data.nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        id: n.id,
        type: 'evolutionNode',
        position: pos ? { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } : { x: 0, y: 0 },
        data: { title: n.title, stage: n.stage, wilted: n.wilted },
      };
    });
    return { nodes, edges };
  }, [data]);

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-kb-md text-center text-text-secondary">
        <TreePine className="w-10 h-10 text-text-tertiary/40" strokeWidth={1.2} />
        <p className="text-b2">知识树还是一片空地</p>
        <p className="text-c1 text-text-tertiary max-w-sm">
          学习并复习概念后，它们会在这里按生命周期生长。
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
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {/* 图例（DOM 覆盖层）：五阶段 + 嫁接 + 枯萎预警 */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 px-3 py-2 rounded-kb-sm bg-bg-elevated/85 backdrop-blur border border-border/40 text-c1">
        {(Object.keys(STAGE_META) as EvolutionStage[]).map((s) => (
          <span key={s} className="flex items-center gap-2 text-text-secondary">
            <StageIcon stage={s} />
            {STAGE_META[s].label}
          </span>
        ))}
        <span className="flex items-center gap-2 text-text-secondary">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: GRAFT_COLOR }} />
          嫁接
        </span>
        <span className="flex items-center gap-2 text-text-secondary">
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: WILT_COLOR }} />
          枯萎预警
        </span>
      </div>
    </div>
  );
}

/** 知识进化树 / Knowledge evolution tree */
export function KnowledgeEvolutionTree({ data }: { data: EvolutionData }) {
  return (
    <ReactFlowProvider>
      <EvolutionInner data={data} />
    </ReactFlowProvider>
  );
}
