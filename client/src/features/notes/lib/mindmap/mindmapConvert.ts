/**
 * 导图树 ↔ React Flow 节点/边 转换（含 dagre 自动布局）
 * Mindmap tree <-> React Flow nodes/edges conversion (with dagre layout)
 *
 * @ai-context: 纯函数。深度优先展平树为 React Flow nodes/edges，折叠节点跳过
 * 其子树（不渲染）；用 @dagrejs/dagre 横向层级布局（rankdir:'LR'）计算坐标，
 * dagre 输出节点中心坐标，转换为 React Flow 的左上角坐标。结构变更不在此处理
 * （走 mindmapOps），本模块只负责"树 → 视图数据"的投影。
 * @ai-context: Pure projection from tree to view data. Collapsed subtrees are
 * skipped; dagre (LR rankdir) computes center coords, converted to top-left.
 * Also provides text-to-mindmap conversion for AI-generated mindmaps.
 */
import { type Node, type Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { MindmapNode } from '@/types/models';
import { createDefaultMindmap } from './mindmapOps';

/** 节点尺寸（供 dagre 布局与坐标换算） / Node size for layout & coord conversion */
export const MINDMAP_NODE_WIDTH = 168;
export const MINDMAP_NODE_HEIGHT = 44;

/** 自定义节点携带的数据 / Data carried by each custom node */
export type MindmapFlowNodeData = {
  text: string;
  collapsed: boolean;
  hasChildren: boolean;
  isRoot: boolean;
  [key: string]: unknown;
};

export type MindmapFlowNode = Node<MindmapFlowNodeData>;

/**
 * 将导图树投影为 React Flow nodes/edges（含布局坐标）。
 * Project the mindmap tree to React Flow nodes/edges with laid-out positions.
 */
export function treeToFlow(root: MindmapNode): { nodes: MindmapFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 88, marginx: 24, marginy: 24 });

  const nodes: MindmapFlowNode[] = [];
  const edges: Edge[] = [];

  const walk = (node: MindmapNode, parentId: string | null, isRoot: boolean): void => {
    g.setNode(node.id, { width: MINDMAP_NODE_WIDTH, height: MINDMAP_NODE_HEIGHT });
    if (parentId) {
      g.setEdge(parentId, node.id);
      edges.push({ id: `${parentId}->${node.id}`, source: parentId, target: node.id });
    }
    nodes.push({
      id: node.id,
      type: 'mindmapNode',
      position: { x: 0, y: 0 },
      data: {
        text: node.text,
        collapsed: !!node.collapsed,
        hasChildren: node.children.length > 0,
        isRoot,
      },
    });
    // 折叠节点不展开子树 / collapsed nodes hide their subtree
    if (!node.collapsed) {
      for (const child of node.children) walk(child, node.id, false);
    }
  };
  walk(root, null, true);

  dagre.layout(g);
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - MINDMAP_NODE_WIDTH / 2,
        y: pos.y - MINDMAP_NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges };
}

/**
 * 将文本大纲解析为思维导图树结构。
 * Parse text outline into mindmap tree structure.
 *
 * 输入格式：每行一个节点，缩进表示层级，支持 Markdown 标题语法。
 * Input format: one node per line, indentation indicates depth.
 *
 * 示例：
 *   中心主题
 *     子主题1
 *       子子主题1
 *     子主题2
 */
export function textToMindmapTree(text: string, rootLabel?: string): MindmapNode {
  const lines = text.split('\n').filter((l) => l.trim());
  // 空输入回退默认导图根节点（createDefaultMindmap 返回 MindmapData 包装，取其 root）
  if (lines.length === 0) return createDefaultMindmap().root;

  // 构建根节点 / build root node
  const root: MindmapNode = {
    id: crypto.randomUUID(),
    text: rootLabel || lines[0].replace(/^#+\s*/, '').trim() || '思维导图',
    children: [],
    collapsed: false,
  };

  // 解析缩进层级 / parse indentation depth
  const stack: { node: MindmapNode; depth: number }[] = [{ node: root, depth: -1 }];

  for (const line of lines) {
    const trimmed = line.replace(/^[-*+]\s+/, '').trim();
    if (!trimmed) continue;

    // 计算缩进深度 / calculate indentation depth
    const indent = line.search(/\S|$/);
    const depth = Math.floor(indent / 2);

    const newNode: MindmapNode = {
      id: crypto.randomUUID(),
      text: trimmed.replace(/^#+\s*/, '').slice(0, 50),
      children: [],
      collapsed: false,
    };

    // 找到合适的父节点 / find the right parent
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].node;
    parent.children.push(newNode);
    stack.push({ node: newNode, depth });
  }

  return root;
}
