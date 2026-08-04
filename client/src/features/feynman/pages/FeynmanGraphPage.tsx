/**
 * 费曼概念网络图谱页
 * Feynman concept network page
 *
 * @ai-context: E3 跨费曼会话概念网络。节点为已完成费曼概念，边为文本
 * 相似度启发式连接（lib/feynmanGraph.layoutFeynmanGraph，dagre LR 布局）。
 * 点击节点跳转对应费曼会话。复用笔记图谱页的 React Flow + dagre 栈。
 * @ai-context: Completed Feynman concepts as nodes, heuristic similarity edges;
 * click a node to open the session. Shares React Flow + dagre stack with notes graph.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, type NodeProps, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Network } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { useFeynmanStore } from '../store/useFeynmanStore';
import { layoutFeynmanGraph } from '../lib/feynmanGraph';

/** 自定义图谱节点（概念卡片） / Custom graph node (concept card) */
function FeynmanGraphNode({ data, selected }: NodeProps) {
  return (
    <div
      className={
        'flex items-center px-3 py-2 rounded-kb-md border bg-bg-elevated text-b2 text-text-primary shadow-kb-sm transition-all ' +
        (selected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-border/60')
      }
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-2 !h-2" />
      <span className="truncate max-w-[150px]">{(data.label as string) || '未命名概念'}</span>
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { feynmanGraph: FeynmanGraphNode };

function FeynmanGraphInner() {
  const navigate = useNavigate();
  const notes = useFeynmanStore((s) => s.notes);
  const loadNotes = useFeynmanStore((s) => s.loadNotes);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // 仅已完成的概念参与网络 / only completed concepts join the network
  const completed = useMemo(
    () => notes.filter((n) => n.status === 'completed'),
    [notes],
  );

  const { nodes, edges } = useMemo(
    () => layoutFeynmanGraph(completed.map((n) => ({
      id: n.id,
      concept: n.concept,
      explanation: n.explanation ?? '',
    }))),
    [completed],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-kb-md py-3 border-b border-border/40">
        <button
          onClick={() => navigate('/feynman')}
          className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <ModuleRitualHeader title="概念网络" sealChar="浮" sealColor="#C4956A" compact />
        <span className="text-c1 text-text-tertiary">{nodes.length} 个概念 · {edges.length} 条关联</span>
      </div>

      <div className="flex-1 min-h-0">
        {nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node: Node) => navigate(`/feynman/${node.id}`)}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-kb-md text-center">
            <Network className="w-10 h-10 text-text-tertiary/40" strokeWidth={1.2} />
            <p className="text-b2 text-text-secondary">还没有已完成的费曼概念</p>
            <p className="text-c1 text-text-tertiary max-w-sm">
              完成几次费曼学习后，这里会浮现概念之间的关联网络。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeynmanGraphPage() {
  return (
    <ReactFlowProvider>
      <FeynmanGraphInner />
    </ReactFlowProvider>
  );
}
