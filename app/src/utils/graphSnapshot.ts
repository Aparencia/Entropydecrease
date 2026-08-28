/**
 * graphSnapshot.ts — 多关系分层图谱纯函数层（v0.14 C2）。
 *
 * @ai-context: spec §4.2 数据契约——graph_snapshot() 返回 { nodes, edges }，
 *              三类边（link 引用 / trace 溯源 / belong 归属）前端按图层开关过滤，
 *              避免毛线球（A' 多关系分层，默认仅引用层）。
 * @ai-context: 节点 id 跨表前缀（`note:1`/`concept:2`/`model:3`/`group:4`——
 *              四表 id 空间独立，与 canvasElements 同款前缀策略）。
 *              focusSubgraph 局部聚焦（BFS 1~2 度邻居）与 filterEdges 图层过滤
 *              均为纯函数——组件层只做状态编排，算法可单测。
 */
import type { ColorId } from "./colorPalette";

/** 图谱节点类型（spec §4.2：笔记 / 概念 / 模型 / 组——四类，无会话/问题节点） */
export type GraphNodeKind = "note" | "concept" | "model" | "group";

/** 图谱边类型：link 引用（体系实体→内容）/ trace 溯源（同源会话）/ belong 归属（笔记→组） */
export type GraphEdgeType = "link" | "trace" | "belong";

/** 图谱节点（id 带类型前缀；color 为 B 子项目色板 id，null → 按 kind 类型色） */
export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  color: string | null;
  /** 实体原始 id（跳转笔记页/过滤组用——不依赖解析 id 前缀） */
  entityId: number;
  /** 体系归属（concept/model 跳转体系页用；note/group 为 null） */
  systemId?: number | null;
}

/** 图谱边（type 三选一——图层开关过滤依据） */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
}

/** graph_snapshot() 返回契约（spec §4.2） */
export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** 图层开关态（Record<GraphEdgeType, boolean>） */
export type GraphLayers = Record<GraphEdgeType, boolean>;

/** 默认图层（spec §3.2：默认仅引用层） */
export const DEFAULT_LAYERS: GraphLayers = { link: true, trace: false, belong: false };

/** 图层元数据（开关按钮文案） */
export const LAYER_META: Record<GraphEdgeType, { label: string; icon: string }> = {
  link: { label: "引用", icon: "🔗" },
  trace: { label: "溯源", icon: "🧬" },
  belong: { label: "归属", icon: "📁" },
};

/** 节点类型 → 色板 id（B 子项目 12 色语义色板；spec §3.2 按类型着色） */
export const NODE_KIND_COLOR: Record<GraphNodeKind, ColorId> = {
  note: "blue",
  concept: "purple",
  model: "orange",
  group: "teal",
};

/** 节点唯一键（kind:entityId——四表 id 空间独立必须带类型前缀） */
export function graphNodeKey(kind: GraphNodeKind, id: number): string {
  return `${kind}:${id}`;
}

/** 解析节点键 → {kind, entityId}；非法键返回 null（数据损坏防御） */
export function parseGraphNodeKey(key: string): { kind: GraphNodeKind; id: number } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as GraphNodeKind;
  const id = Number(key.slice(idx + 1));
  if (!["note", "concept", "model", "group"].includes(kind)) return null;
  if (!Number.isInteger(id) || id <= 0) return null;
  return { kind, id };
}

/** 边图层过滤（spec §4.2：前端按图层开关过滤；layers 全 false → 空边集） */
export function filterEdges(edges: GraphEdge[], layers: GraphLayers): GraphEdge[] {
  return edges.filter((e) => layers[e.type]);
}

/**
 * 局部聚焦（spec §3.2：选中节点 → 1~2 度邻居展开，其余淡出）。
 * BFS 度数 ≤ degree；返回聚焦节点子集 + 两端都在子集内的边。
 * centerId=null → 全量（组件初始态无聚焦——聚焦是用户交互结果）。
 */
export function focusSubgraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerId: string | null,
  degree: number = 2,
): { nodes: GraphNode[]; edges: GraphEdge[]; nodeIds: Set<string> } {
  if (centerId == null) {
    return { nodes, edges, nodeIds: new Set(nodes.map((n) => n.id)) };
  }
  // 中心不存在 → 空聚焦（防悬空中心渲染孤立高亮）
  if (!nodes.some((n) => n.id === centerId)) {
    return { nodes: [], edges: [], nodeIds: new Set() };
  }
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    (adjacency.get(e.source) ?? adjacency.set(e.source, []).get(e.source)!).push(e.target);
    (adjacency.get(e.target) ?? adjacency.set(e.target, []).get(e.target)!).push(e.source);
  }
  const visited = new Set<string>([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < degree; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adjacency.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  const nodeIds = visited;
  const keptNodes = nodes.filter((n) => nodeIds.has(n.id));
  const keptEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { nodes: keptNodes, edges: keptEdges, nodeIds };
}

// ── 图谱布局（浏览/导航视图——范围外：拖拽编辑；确定性布局，测试可断言）──

/** 节点类型 → 列 x（group 左 / note 中 / concept / model 右——边横向为主不交叉） */
const COL_X: Record<GraphNodeKind, number> = { group: 0, note: 320, concept: 640, model: 960 };

/** 列内行距（px） */
const ROW_Y = 88;

/** 图谱布局（按 kind 分列、列内按 entityId 升序——确定性；返回左上角坐标） */
export function layoutGraph(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const byKind = new Map<GraphNodeKind, GraphNode[]>();
  for (const n of nodes) {
    const list = byKind.get(n.kind) ?? [];
    list.push(n);
    byKind.set(n.kind, list);
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const [kind, list] of byKind) {
    list.sort((a, b) => a.entityId - b.entityId);
    list.forEach((n, i) => { out[n.id] = { x: COL_X[kind], y: i * ROW_Y }; });
  }
  return out;
}
