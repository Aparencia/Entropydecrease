/**
 * canvasElements.ts — 知识实体 → React Flow 元素纯转换（v0.13.8 §六）。
 *
 * @ai-context: 画布只展示既有关系（规格 §二.4）——连线源于 knowledge_nodes.parent_id，
 *               概念/模型徽标源于 knowledge_links 的 concept_id/model_id 引用，
 *               用户不能画线即建引用。三表 id 空间独立，节点 key 带类型前缀
 *               （`q:1`/`c:2`/`m:3`，与 layoutRadial 同源）。
 * @ai-context: 本函数纯数据转换（零 React 依赖，仅 type-only import @xyflow/react——
 *               类型擦除后单测可直接运行），供 KnowledgeCanvasView 与单测共用
 *               （规格 §六：画布组件仅测数据转换，RF 渲染跳过 jsdom）。
 */
import type { Edge, Node } from "@xyflow/react";
import type { KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode } from "../types/knowledge";
import { conceptStatusLabel, type KnowledgeConceptStatus } from "../types/knowledge";
import type { CanvasPoint } from "./layoutRadial";

/** 画布节点实体类别（与 CanvasNodeData.kind 同枚举，仅少 core——核心问题单独渲染） */
export type CanvasEntityKind = "question" | "concept" | "model";

/** 画布选中分派类别（与 KnowledgeSelection.type "node"/"concept"/"model" 对齐）
 *  @ai-context: 画布内部用 question 区分树实体（key/布局），对外回调统一用 node
 *              语义（与树视图/右栏面板契约一致）。 */
export type CanvasSelectKind = "node" | "concept" | "model";

/** 画布节点数据（三个自定义节点组件共用；渲染差异按 kind 分支）
 *  @ai-context: type 别名（非 interface）——React Flow `Node<Data>` 要求 data 满足
 *               Record<string, unknown>，interface 无隐式索引签名会触发 TS2344。 */
export type CanvasNodeData = {
  kind: CanvasEntityKind;
  /** 实体 id（与 key 前缀拼回实体：`q:${entityId}`） */
  entityId: number;
  /** 标题（问题文本 / 概念名 / 模型名） */
  title: string;
  /** 摘要行（概念本质 / 模型主张；问题节点 null） */
  subtitle: string | null;
  /** 徽标行（概念/模型引用名、学科标签；问题节点为关联概念/模型） */
  badges: { kind: "concept" | "model" | "discipline"; text: string }[];
  /** 状态指示文本（概念/模型；问题节点 null） */
  statusText: string | null;
  /** 状态指示颜色（与状态徽标同口径） */
  statusColor: string | null;
  /** 挂载引用数（问题节点；概念/模型恒 0——引用走节点侧） */
  refCount: number;
};

/** 节点 key 前缀（三表 id 空间独立，必须区分） */
export const CANVAS_KEY_PREFIX: Record<CanvasEntityKind, string> = {
  question: "q",
  concept: "c",
  model: "m",
};

/** 实体 → 画布 key（`q:1` / `c:2` / `m:3`） */
export function canvasKey(kind: CanvasEntityKind, entityId: number): string {
  return `${CANVAS_KEY_PREFIX[kind]}:${entityId}`;
}

/** 画布 key → 实体 id（拖拽/点击回调反解；格式异常返回 null——防御损坏 key） */
export function entityIdFromKey(key: string): number | null {
  const [prefix, idStr] = key.split(":");
  if (!prefix || !idStr) return null;
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 转换输入（positions 为 key → 左上角坐标；React Flow position 语义） */
export interface CanvasElementsInput {
  nodes: KnowledgeNode[];
  concepts: KnowledgeConcept[];
  models: KnowledgeModel[];
  links: KnowledgeLink[];
  positions: Map<string, CanvasPoint>;
  selectedKey: string | null;
}

/** 概念状态徽标颜色（与概念列表同口径） */
function conceptStatusColor(status: KnowledgeConceptStatus): string {
  if (status === "core") return "#0f766e";
  if (status === "watching") return "#b45309";
  return "#9ca3af";
}

/**
 * 知识实体 → React Flow nodes/edges（纯转换）。
 *
 * @ai-context: 问题节点 = 树实体（id/被选态/位置直传）；概念/模型 = 浮动参照
 *              （无画布位置列——positions 里只有每次打开重排的临时值，缺失即 (0,0)）；
 *              边只连「父存在且同树」的 parent_id（孤儿不连——布局层兜底处理）。
 */
export function buildCanvasElements(input: CanvasElementsInput): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const { nodes, concepts, models, links, positions, selectedKey } = input;

  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  // 问题节点：关联概念/模型徽标 + 引用计数（links 按 nodeId 聚合，与树视图同口径）
  const conceptRefs = new Map<number, string[]>();
  const modelRefs = new Map<number, string[]>();
  const refCounts = new Map<number, number>();
  for (const l of links) {
    if (l.nodeId == null) continue;
    if (l.conceptId != null) {
      const name = conceptById.get(l.conceptId)?.name;
      if (name) {
        const arr = conceptRefs.get(l.nodeId) ?? [];
        arr.push(name);
        conceptRefs.set(l.nodeId, arr);
      }
    }
    if (l.modelId != null) {
      const name = modelById.get(l.modelId)?.name;
      if (name) {
        const arr = modelRefs.get(l.nodeId) ?? [];
        arr.push(name);
        modelRefs.set(l.nodeId, arr);
      }
    }
    refCounts.set(l.nodeId, (refCounts.get(l.nodeId) ?? 0) + 1);
  }

  const rfNodes: Node<CanvasNodeData>[] = [];

  for (const n of nodes) {
    const key = canvasKey("question", n.id);
    rfNodes.push({
      id: key,
      type: "question",
      position: positions.get(key) ?? { x: 0, y: 0 },
      selected: selectedKey === key,
      data: {
        kind: "question",
        entityId: n.id,
        title: n.text,
        subtitle: null,
        badges: [
          ...(conceptRefs.get(n.id) ?? []).map((text) => ({ kind: "concept" as const, text })),
          ...(modelRefs.get(n.id) ?? []).map((text) => ({ kind: "model" as const, text })),
        ],
        statusText: null,
        statusColor: null,
        refCount: refCounts.get(n.id) ?? 0,
      },
    });
  }

  for (const c of concepts) {
    const key = canvasKey("concept", c.id);
    rfNodes.push({
      id: key,
      type: "concept",
      position: positions.get(key) ?? { x: 0, y: 0 },
      // 浮动参照不可拖（无画布列——拖了不持久，禁拖防"拖了没反应"的困惑）
      draggable: false,
      selected: selectedKey === key,
      data: {
        kind: "concept",
        entityId: c.id,
        title: c.name,
        subtitle: c.essence,
        badges: [],
        statusText: conceptStatusLabel[c.status],
        statusColor: conceptStatusColor(c.status),
        refCount: 0,
      },
    });
  }

  for (const m of models) {
    const key = canvasKey("model", m.id);
    rfNodes.push({
      id: key,
      type: "model",
      position: positions.get(key) ?? { x: 0, y: 0 },
      // 浮动参照不可拖（无画布列——同概念）
      draggable: false,
      selected: selectedKey === key,
      data: {
        kind: "model",
        entityId: m.id,
        title: m.name,
        subtitle: m.claim,
        badges: m.disciplines.map((text) => ({ kind: "discipline" as const, text })),
        statusText: null,
        statusColor: null,
        refCount: 0,
      },
    });
  }

  // 边：parent_id 映射（父必须在同树——孤儿/跨体系不连，§二.4 连线只反映既有关系）
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  for (const n of nodes) {
    if (n.parentId == null || !ids.has(n.parentId)) continue;
    edges.push({
      id: `e:${n.parentId}:${n.id}`,
      source: canvasKey("question", n.parentId),
      target: canvasKey("question", n.id),
      type: "smoothstep",
    });
  }

  return { nodes: rfNodes, edges };
}
