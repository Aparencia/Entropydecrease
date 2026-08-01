/**
 * 思维导图编辑器上下文（编辑器 ↔ 自定义节点 的动作通道）
 * Mindmap editor context (action channel between editor and custom nodes)
 *
 * @ai-context: React Flow 自定义节点经 nodeTypes 静态注册，无法直接接收 props
 * 回调；用 Context 下发动作与选中/编辑状态，避免把函数塞进 node.data。
 * @ai-context: React Flow custom nodes are registered statically, so callbacks
 * are delivered via context instead of node.data.
 */
import { createContext, useContext } from 'react';

/** 编辑器下发给节点的动作与状态 / Actions & state provided to nodes */
export interface MindmapActions {
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
}

export const MindmapContext = createContext<MindmapActions | null>(null);

/** 节点侧消费上下文（缺失时抛错以尽早暴露接线问题） / Consume context in nodes */
export function useMindmapActions(): MindmapActions {
  const ctx = useContext(MindmapContext);
  if (!ctx) throw new Error('MindmapNodeCard 必须在 MindmapEditor 内使用');
  return ctx;
}
