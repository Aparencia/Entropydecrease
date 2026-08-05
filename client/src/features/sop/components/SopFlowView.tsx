/**
 * SOP 流程视图（1.12）— React Flow 从左到右展示步骤序列
 * SOP flow view — left-to-right step sequence visualization
 *
 * @ai-context: 编辑器旁的只读流程图：步骤为节点、顺序为边（animated）。
 * 节点类型按真实步骤类型映射（focus/review/break/module/output），
 * 配色复用 STEP_TYPE_META（与编辑器的类型徽章一致）。节点数据在
 * useMemo 内构建，nodeTypes 在模块级定义避免重建。空步骤时显示引导。
 * @ai-context: Read-only flow diagram: steps as nodes, order as animated
 * edges. Node colors reuse STEP_TYPE_META so the flow matches the editor.
 */
import { useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  Handle, Position, type NodeProps, type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Timer, RotateCcw, Coffee, ExternalLink, FileOutput, type LucideIcon } from 'lucide-react';
import { STEP_TYPE_META } from '../store/useSopStore';
import type { SopStepType } from '../types';

/** 流程节点数据（与编辑器草稿步骤字段对齐） */
export interface FlowStep {
  id: string;
  step_type: SopStepType;
  title: string;
  durationMinutes?: number;
  module?: string;
}

const NODE_WIDTH = 170;
const NODE_GAP = 56;

/** 步骤类型 → 图标（与 STEP_TYPE_META 顺序对应） */
const STEP_ICONS: Record<SopStepType, LucideIcon> = {
  focus: Timer,
  review: RotateCcw,
  break: Coffee,
  module: ExternalLink,
  output: FileOutput,
};

/** 自定义流程节点：类型徽章 + 图标 + 标题，左右各一个连接点 */
function FlowStepNode({ data, selected }: NodeProps) {
  const label = (data.label as string) || '未命名步骤';
  const stepType = (data.stepType as SopStepType) || 'focus';
  const meta = STEP_TYPE_META[stepType];
  const Icon = STEP_ICONS[stepType];
  const duration = data.durationMinutes as number | undefined;

  return (
    <div
      className={
        'w-[170px] rounded-kb-lg border bg-bg-elevated/90 px-3 py-2.5 shadow-kb-sm transition-all ' +
        (selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-border/60')
      }
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-brand-400" />
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md ${meta.badge}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] text-text-tertiary leading-none mb-0.5">{meta.label}</p>
          <p className="truncate text-c1 font-medium text-text-primary leading-tight">{label}</p>
        </div>
      </div>
      {duration ? (
        <p className="mt-1.5 pl-9 text-[10px] text-text-tertiary tabular-nums">{duration} 分钟</p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-brand-400" />
    </div>
  );
}

/** 模块级定义，避免每次渲染重建导致 React Flow 重挂载 */
const nodeTypes = { flowStep: FlowStepNode };

function SopFlowViewInner({ steps }: { steps: FlowStep[] }) {
  const { nodes, edges } = useMemo(() => {
    const valid = steps.filter((s) => s.title.trim());
    const ns: Node[] = valid.map((s, i) => ({
      id: s.id,
      type: 'flowStep',
      position: { x: i * (NODE_WIDTH + NODE_GAP), y: 0 },
      data: {
        label: s.title,
        stepType: s.step_type,
        durationMinutes: s.durationMinutes,
      },
    }));
    const es: Edge[] = valid.slice(0, -1).map((s, i) => ({
      id: `e-${s.id}`,
      source: s.id,
      target: valid[i + 1].id,
      animated: true,
      style: { stroke: 'var(--kb-border-default)', strokeWidth: 1.5 },
    }));
    return { nodes: ns, edges: es };
  }, [steps]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-kb-xl border border-dashed border-border/40 text-c1 text-text-tertiary">
        添加步骤后，这里会以流程图呈现你的 SOP 节奏
      </div>
    );
  }

  return (
    <div className="h-[240px] overflow-hidden rounded-kb-xl border border-border/30 bg-bg-elevated/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.35 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="var(--kb-border-default)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export default function SopFlowView({ steps }: { steps: FlowStep[] }) {
  return (
    <ReactFlowProvider>
      <SopFlowViewInner steps={steps} />
    </ReactFlowProvider>
  );
}
