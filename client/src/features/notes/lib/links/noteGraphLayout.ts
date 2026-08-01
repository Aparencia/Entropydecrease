/**
 * 笔记图谱布局（纯函数）
 * Note graph layout (pure function)
 *
 * @ai-context: 阶段二图谱视图。将笔记（节点）+ 链接（边）经 @dagrejs/dagre
 * 横向层级布局投影为 React Flow nodes/edges。忽略指向不存在笔记的悬空链接。
 * 与导图布局同栈（dagre），但有向图可能含环（A→B→A），dagre 仍可层级化。
 * @ai-context: Projects notes (nodes) + links (edges) to React Flow via dagre
 * LR layout; drops dangling links whose endpoints don't exist.
 */
import dagre from '@dagrejs/dagre';
import { type Node, type Edge } from '@xyflow/react';

export interface GraphNote {
  id: string;
  title: string;
}

export interface GraphLink {
  fromId: string;
  toId: string;
}

export const GRAPH_NODE_WIDTH = 184;
export const GRAPH_NODE_HEIGHT = 48;

/** 计算笔记图谱布局，返回 React Flow nodes/edges */
export function layoutNoteGraph(
  notes: GraphNote[],
  links: GraphLink[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 104, marginx: 24, marginy: 24 });

  for (const note of notes) {
    g.setNode(note.id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  }

  const noteIds = new Set(notes.map((n) => n.id));
  const edges: Edge[] = [];
  for (const link of links) {
    // 跳过悬空链接（端点笔记不存在） / skip dangling links
    if (!noteIds.has(link.fromId) || !noteIds.has(link.toId)) continue;
    g.setEdge(link.fromId, link.toId);
    edges.push({ id: `${link.fromId}->${link.toId}`, source: link.fromId, target: link.toId });
  }

  dagre.layout(g);

  const nodes: Node[] = notes.map((note) => {
    const pos = g.node(note.id);
    return {
      id: note.id,
      type: 'noteGraph',
      position: pos ? { x: pos.x - GRAPH_NODE_WIDTH / 2, y: pos.y - GRAPH_NODE_HEIGHT / 2 } : { x: 0, y: 0 },
      data: { label: note.title || '未命名笔记' },
    };
  });

  return { nodes, edges };
}
