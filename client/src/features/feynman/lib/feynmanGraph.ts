/**
 * 费曼概念网络图构建（纯函数）
 * Feynman concept graph builder (pure functions)
 *
 * @ai-context: E3 跨费曼会话概念网络。节点为已完成费曼概念，边为
 * concept+explanation 摘录的分词（ASCII 词 + 中文 bigram）Jaccard 相似度
 * 超阈值的启发式连接，经 dagre LR 布局投影为 React Flow nodes/edges。
 * 纯本地计算，零 AI 依赖。
 * @ai-context: Nodes = completed Feynman concepts; edges = Jaccard similarity
 * of tokenized concept+explanation above threshold (local heuristic, dagre LR).
 */
import dagre from '@dagrejs/dagre';
import { type Node, type Edge } from '@xyflow/react';

export interface FeynmanGraphNote {
  id: string;
  concept: string;
  explanation: string;
}

/** 相似度高于此阈值才生成边 */
export const SIMILARITY_THRESHOLD = 0.15;
/** 参与分词的讲解截断长度（控制 O(n²) 比对性能） */
export const EXPLANATION_SLICE_LEN = 500;

export const GRAPH_NODE_WIDTH = 184;
export const GRAPH_NODE_HEIGHT = 48;

/** 分词：ASCII 字母数字词 + 中文连续段 bigram */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9]+/g)) tokens.add(m[0]);
  const cjk = lower.replace(/[^一-龥]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk.slice(i, i + 2));
  return tokens;
}

/** 两个 token 集合的 Jaccard 相似度（任一为空返回 0） */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 计算费曼概念网络布局，返回 React Flow nodes/edges */
export function layoutFeynmanGraph(notes: FeynmanGraphNote[]): { nodes: Node[]; edges: Edge[] } {
  const tokens = notes.map((n) =>
    tokenize(`${n.concept} ${n.explanation.slice(0, EXPLANATION_SLICE_LEN)}`),
  );

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 104, marginx: 24, marginy: 24 });
  for (const note of notes) {
    g.setNode(note.id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  }

  // 两两比对，相似度超阈值连边（无向，仅取 i<j 避免重复）
  const edges: Edge[] = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (jaccard(tokens[i], tokens[j]) >= SIMILARITY_THRESHOLD) {
        g.setEdge(notes[i].id, notes[j].id);
        edges.push({ id: `${notes[i].id}<->${notes[j].id}`, source: notes[i].id, target: notes[j].id });
      }
    }
  }

  dagre.layout(g);

  const nodes: Node[] = notes.map((note) => {
    const pos = g.node(note.id);
    return {
      id: note.id,
      type: 'feynmanGraph',
      position: pos
        ? { x: pos.x - GRAPH_NODE_WIDTH / 2, y: pos.y - GRAPH_NODE_HEIGHT / 2 }
        : { x: 0, y: 0 },
      data: { label: note.concept || '未命名概念' },
    };
  });

  return { nodes, edges };
}
