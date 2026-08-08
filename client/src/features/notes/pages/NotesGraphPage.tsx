/**
 * 笔记图谱页（双向链接可视化 + 星图模式）
 * Notes graph page (bidirectional links + constellation mode)
 *
 * @ai-context: 阶段二图谱视图 + 认知星图双模式。图谱模式：笔记为节点、
 * wiki-link 为边，dagre 横向布局。星图模式：笔记按深度分布在4个区域。
 * 顶部按钮切换视图模式。
 * @ai-context: Dual-mode: graph (nodes=notes, edges=wiki-links, dagre LR)
 * and constellation (notes distributed across 4 depth zones).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, type NodeProps, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Share2, Stars, Network } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { useNoteStore } from '../store/useNoteStore';
import { getAllLinks } from '../lib/links/noteLinkStore';
import { layoutNoteGraph, type GraphLink } from '../lib/links/noteGraphLayout';
import { ConstellationView } from '../components/ConstellationView';
import { cn } from '@/lib/utils';

type ViewMode = 'graph' | 'constellation';

/** 自定义图谱节点（笔记卡片） / Custom graph node (note card) */
function NoteGraphNode({ data, selected }: NodeProps) {
  return (
    <div
      className={
        'flex items-center px-3 py-2 rounded-kb-md border bg-bg-elevated text-b2 text-text-primary shadow-kb-sm transition-all ' +
        (selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-border/60')
      }
    >
      <Handle type="target" position={Position.Left} className="!bg-brand-400 !w-2 !h-2" />
      <span className="truncate max-w-[150px]">{(data.label as string) || '未命名笔记'}</span>
      <Handle type="source" position={Position.Right} className="!bg-brand-400 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { noteGraph: NoteGraphNode };

function NotesGraphInner() {
  const navigate = useNavigate();
  const notes = useNoteStore((s) => s.notes);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');

  useEffect(() => { loadNotes(); }, [loadNotes]);

  useEffect(() => {
    let cancelled = false;
    getAllLinks()
      .then((ls) => { if (!cancelled) setLinks(ls.map((l) => ({ fromId: l.fromId, toId: l.toId }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [notes]);

  const { nodes, edges } = useMemo(
    () => layoutNoteGraph(notes.map((n) => ({ id: n.id, title: n.title })), links),
    [notes, links],
  );

  const hasLinks = edges.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-kb-md py-3 border-b border-border/40">
        <button
          onClick={() => navigate('/notes')}
          className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <ModuleRitualHeader title="笔记图谱" sealChar="礁" sealColor="#6B9BD2" compact />
        <span className="text-c1 text-text-tertiary">{notes.length} 篇笔记 · {edges.length} 条链接</span>

        {/* 视图切换 */}
        <div className="ml-auto flex gap-1 bg-bg-tertiary/50 rounded-kb-md p-0.5">
          <button
            onClick={() => setViewMode('graph')}
            className={cn('flex items-center gap-1 px-2.5 py-1 rounded-kb-sm text-c1 font-medium transition-colors',
              viewMode === 'graph' ? 'bg-bg-elevated text-text-primary shadow-kb-sm' : 'text-text-tertiary hover:text-text-secondary')}
          >
            <Network className="w-3.5 h-3.5" strokeWidth={1.5} />
            图谱
          </button>
          <button
            onClick={() => setViewMode('constellation')}
            className={cn('flex items-center gap-1 px-2.5 py-1 rounded-kb-sm text-c1 font-medium transition-colors',
              viewMode === 'constellation' ? 'bg-bg-elevated text-text-primary shadow-kb-sm' : 'text-text-tertiary hover:text-text-secondary')}
          >
            <Stars className="w-3.5 h-3.5" strokeWidth={1.5} />
            星图
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {viewMode === 'constellation' ? (
          <ConstellationView notes={notes} onNoteClick={(id) => navigate(`/notes/${id}`)} />
        ) : hasLinks ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node: Node) => navigate(`/notes/${node.id}`)}
            nodesDraggable
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
            <Share2 className="w-10 h-10 text-text-tertiary/40" strokeWidth={1.2} />
            <p className="text-b2 text-text-secondary">还没有笔记链接</p>
            <p className="text-c1 text-text-tertiary max-w-sm">
              在笔记中输入 <code className="px-1 rounded bg-bg-tertiary">[[</code> 选择并链接其他笔记，即可在此查看知识图谱。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotesGraphPage() {
  return (
    <ReactFlowProvider>
      <NotesGraphInner />
    </ReactFlowProvider>
  );
}