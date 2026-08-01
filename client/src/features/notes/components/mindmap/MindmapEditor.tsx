/**
 * 思维导图编辑器（React Flow + dagre 自动布局）
 * Mindmap editor (React Flow + dagre auto-layout)
 *
 * @ai-context: 导图树（data.root）为单一数据源；nodes/edges 由 treeToFlow 投影
 * （useMemo），选中态由 selectedId 计算（受控）。结构增删改走 mindmapOps 更新树
 * 后回传 onChange；视图拖拽禁用（布局自动），平移缩放由 React Flow 内建。
 * 键盘：Tab=子节点、Enter=同级、Delete=删除、F2=编辑（窗口级监听，编辑态/其他
 * 输入框聚焦时不拦截）。deleteKeyCode 置 null 以接管删除，避免与 React Flow 冲突。
 * @ai-context: Tree is the single source of truth; nodes/edges are a memoized
 * projection. Structure edits go through mindmapOps; node drag disabled (auto layout).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  type NodeMouseHandler, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MindmapData, MindmapNode } from '@/types/models';
import { treeToFlow, type MindmapFlowNode } from '../../lib/mindmap/mindmapConvert';
import {
  addChild, addSibling, deleteNode, updateText, toggleCollapse,
} from '../../lib/mindmap/mindmapOps';
import { MindmapContext, type MindmapActions } from './MindmapContext';
import { MindmapNodeCard } from './MindmapNodeCard';

const nodeTypes = { mindmapNode: MindmapNodeCard };

interface MindmapEditorProps {
  data: MindmapData;
  onChange: (data: MindmapData) => void;
}

function MindmapEditorInner({ data, onChange }: MindmapEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => treeToFlow(data.root), [data.root]);
  // 由 selectedId 计算选中态（受控渲染） / derive selected flag from selectedId
  const flowNodes = useMemo<MindmapFlowNode[]>(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );

  const mutate = useCallback(
    (fn: (root: MindmapNode) => MindmapNode) => onChange({ ...data, root: fn(data.root) }),
    [data, onChange],
  );

  const actions = useMemo<MindmapActions>(() => ({
    selectedId,
    editingId,
    onSelect: setSelectedId,
    onAddChild: (id) => {
      const newId = crypto.randomUUID();
      mutate((r) => addChild(r, id, '新节点', newId));
      setSelectedId(newId);
      setEditingId(newId);
    },
    onAddSibling: (id) => {
      const newId = crypto.randomUUID();
      mutate((r) => addSibling(r, id, '新节点', newId));
      setSelectedId(newId);
      setEditingId(newId);
    },
    onDelete: (id) => { mutate((r) => deleteNode(r, id)); setSelectedId(null); },
    onToggleCollapse: (id) => mutate((r) => toggleCollapse(r, id)),
    onStartEdit: (id) => setEditingId(id),
    onCommitEdit: (id, text) => { mutate((r) => updateText(r, id, text)); setEditingId(null); },
    onCancelEdit: () => setEditingId(null),
  }), [selectedId, editingId, mutate]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => setSelectedId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);
  // 受控节点需响应变更；此处仅同步选择态 / controlled nodes: sync selection only
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'select') setSelectedId(c.selected ? c.id : null);
    }
  }, []);

  // 窗口级键盘快捷键（编辑态或其他输入框聚焦时不拦截）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!selectedId) return;
      if (e.key === 'Tab') { e.preventDefault(); actions.onAddChild(selectedId); }
      else if (e.key === 'Enter') { e.preventDefault(); actions.onAddSibling(selectedId); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.onDelete(selectedId); }
      else if (e.key === 'F2') { e.preventDefault(); actions.onStartEdit(selectedId); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingId, selectedId, actions]);

  return (
    <MindmapContext.Provider value={actions}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </MindmapContext.Provider>
  );
}

export function MindmapEditor(props: MindmapEditorProps) {
  return (
    <ReactFlowProvider>
      <MindmapEditorInner {...props} />
    </ReactFlowProvider>
  );
}
