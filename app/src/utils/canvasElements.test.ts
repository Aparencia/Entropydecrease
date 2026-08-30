// @vitest-environment node
/**
 * canvasElements.test.ts — 知识实体 → React Flow 元素纯转换单测（v0.13.8 §六）。
 *
 * @ai-context: 断言契约——key 带类型前缀（q/c/m，三表 id 空间独立）；边只连
 *              同树 parent（孤儿不连——§二.4 连线只反映既有关系）；问题节点
 *              徽标 = links 的 concept_id/model_id 引用名 + 引用计数（与树视图
 *              同口径）；概念/模型 = 本质/主张 + 状态/学科徽标。
 */
import { describe, expect, it } from "vitest";
import type { KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode } from "../types/knowledge";
import { buildCanvasElements, canvasKey, entityIdFromKey, resolveEdgeHandles, type CanvasElementsInput } from "./canvasElements";

const node = (id: number, parentId: number | null, text: string): KnowledgeNode => ({
  id, systemId: 5, parentId, type: "question", text, orderIdx: 0, status: "active", createdAt: 0,
});

const concept = (id: number, name: string): KnowledgeConcept => ({
  id, systemId: 5, name, essence: "本质", boundary: null, relation: null, status: "core",
  lastAppliedAt: null, createdAt: 0, updatedAt: 0,
});

const model = (id: number, name: string): KnowledgeModel => ({
  id, systemId: 5, name, disciplines: ["摄影"], claim: "主张", validWhen: null, invalidWhen: null,
  crossChecks: null, status: "active", createdAt: 0, updatedAt: 0,
});

const link = (nodeId: number | null, conceptId: number | null, modelId: number | null): KnowledgeLink => ({
  id: nodeId ?? conceptId ?? modelId ?? 1, systemId: 5, nodeId, conceptId, modelId,
  targetType: "note", targetId: 99, createdAt: 0,
});

function build(overrides?: Partial<CanvasElementsInput>) {
  return buildCanvasElements({
    nodes: [node(1, null, "如何练好化妆")],
    concepts: [concept(10, "曝光三角")],
    models: [model(20, "黄金时刻法则")],
    links: [link(1, 10, 20)],
    positions: new Map([[canvasKey("question", 1), { x: 100, y: 200 }]]),
    selectedKey: null,
    rootCard: null,
    ...overrides,
  });
}

describe("buildCanvasElements 数据转换", () => {
  it("key 带类型前缀（q/c/m）且 position/selected 透传", () => {
    // Arrange + Act
    const { nodes } = build({ selectedKey: canvasKey("question", 1) });
    // Assert
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("q:1")!.data.kind).toBe("question");
    expect(byId.get("q:1")!.position).toEqual({ x: 100, y: 200 });
    expect(byId.get("q:1")!.selected).toBe(true);
    expect(byId.get("c:10")!.data.kind).toBe("concept");
    expect(byId.get("m:20")!.data.kind).toBe("model");
    // 缺失位置 → (0,0) 兜底（React Flow position 必填）
    expect(byId.get("c:10")!.position).toEqual({ x: 0, y: 0 });
  });

  it("问题节点徽标：links 的 concept/model 引用名 + 引用计数（与树视图同口径）", () => {
    // Arrange：node1 挂概念 10 + 模型 20 + 2 条引用（含重复 link）
    const { nodes } = build({
      links: [link(1, 10, 20), link(1, null, null)],
    });
    // Assert
    const q1 = nodes.find((n) => n.id === "q:1")!;
    expect(q1.data.badges).toEqual([
      { kind: "concept", text: "曝光三角" },
      { kind: "model", text: "黄金时刻法则" },
    ]);
    expect(q1.data.refCount).toBe(2);
    expect(q1.data.title).toBe("如何练好化妆");
  });

  it("概念/模型节点：摘要行 + 状态/学科徽标", () => {
    // Arrange + Act
    const { nodes } = build();
    // Assert
    const c10 = nodes.find((n) => n.id === "c:10")!;
    expect(c10.data.title).toBe("曝光三角");
    expect(c10.data.subtitle).toBe("本质");
    expect(c10.data.statusText).toBe("核心");
    expect(c10.data.statusColor).toBe("#0f766e");
    const m20 = nodes.find((n) => n.id === "m:20")!;
    expect(m20.data.title).toBe("黄金时刻法则");
    expect(m20.data.subtitle).toBe("主张");
    expect(m20.data.badges).toEqual([{ kind: "discipline", text: "摄影" }]);
  });

  it("边：parent_id → smoothstep；孤儿（父缺失）不连线", () => {
    // Arrange：1 根 + 1 子 + 1 孤儿（父不在节点表）
    const { edges } = build({
      nodes: [node(1, null, "根"), node(2, 1, "子"), node(3, 999, "孤儿")],
    });
    // Assert
    expect(edges).toEqual([{ id: "e:1:2", source: "q:1", target: "q:2", type: "smoothstep" }]);
  });

  it("v0.13.9 根卡：rootCard 存在 → 圆心 core 节点 + 根节点虚线边（子节点/孤儿不连）", () => {
    // Arrange：1 根 + 1 子 + 1 孤儿
    const { nodes, edges } = build({
      nodes: [node(1, null, "根"), node(2, 1, "子"), node(3, 999, "孤儿")],
      rootCard: { title: "大学规划", subtitle: "领域体系" },
    });
    // Assert：core 节点（不可拖/不可选，标题=体系名，副标=领域体系）
    const core = nodes.find((n) => n.id === "core")!;
    expect(core.type).toBe("core");
    expect(core.draggable).toBe(false);
    expect(core.data.title).toBe("大学规划");
    expect(core.data.subtitle).toBe("领域体系");
    // Assert：仅根节点（parentId=null）连虚线边到 core；子节点连父；孤儿不连
    const coreEdges = edges.filter((e) => e.source === "core");
    expect(coreEdges).toEqual([
      { id: "e:core:1", source: "core", target: "q:1", type: "smoothstep", style: { stroke: "#cbd5e1", strokeDasharray: "5 4" } },
    ]);
    expect(edges).toHaveLength(2); // 根卡虚边 + 父子边
    expect(edges.some((e) => e.id === "e:core:3")).toBe(false); // 孤儿不连根卡
  });

  it("v0.13.9 根卡缺失（rootCard null）→ 无 core 节点、无虚边（旧行为）", () => {
    // Arrange + Act
    const { nodes, edges } = build({ nodes: [node(1, null, "根")] });
    // Assert
    expect(nodes.find((n) => n.id === "core")).toBeUndefined();
    expect(edges.some((e) => e.source === "core")).toBe(false);
  });

  it("v0.13.9 问题节点 data.nodeType 透传（概念/模型恒 null）", () => {
    // Arrange：根 + 子 + 概念 + 模型
    const { nodes } = build({
      nodes: [node(1, null, "根"), node(2, 1, "子")],
      concepts: [concept(10, "曝光三角")],
      models: [model(20, "黄金时刻法则")],
    });
    // Assert
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("q:1")!.data.nodeType).toBe("question");
    expect(byId.get("q:2")!.data.nodeType).toBe("question");
    expect(byId.get("c:10")!.data.nodeType).toBeNull();
    expect(byId.get("m:20")!.data.nodeType).toBeNull();
  });

  it("被选态：selectedKey 匹配才置 selected", () => {
    // Arrange + Act
    const { nodes } = build({ selectedKey: "m:20" });
    // Assert
    expect(nodes.find((n) => n.id === "m:20")!.selected).toBe(true);
    expect(nodes.find((n) => n.id === "q:1")!.selected).toBe(false);
  });
});

describe("resolveEdgeHandles 接线方向", () => {
  it("目标在源下方 → 垂直接入（source-bottom / target-top）", () => {
    // Arrange + Act：源 (0,0)、目标 (20, 100)
    const h = resolveEdgeHandles({ x: 0, y: 0 }, { x: 20, y: 100 });
    // Assert
    expect(h).toEqual({ sourceHandle: "source-bottom", targetHandle: "target-top" });
  });

  it("目标在源上方 → 反向垂直接入（source-top / target-bottom）", () => {
    // Act：目标在 (-10, -80)
    const h = resolveEdgeHandles({ x: 0, y: 0 }, { x: -10, y: -80 });
    // Assert
    expect(h).toEqual({ sourceHandle: "source-top", targetHandle: "target-bottom" });
  });

  it("目标在源右侧（|dx|>|dy|）→ 水平接入（source-right / target-left）", () => {
    // Act：目标 (100, 30)
    const h = resolveEdgeHandles({ x: 0, y: 0 }, { x: 100, y: 30 });
    // Assert
    expect(h).toEqual({ sourceHandle: "source-right", targetHandle: "target-left" });
  });

  it("目标在源左侧 → 水平反向接入（source-left / target-right）", () => {
    // Act：目标 (-100, 30)
    const h = resolveEdgeHandles({ x: 0, y: 0 }, { x: -100, y: 30 });
    // Assert
    expect(h).toEqual({ sourceHandle: "source-left", targetHandle: "target-right" });
  });

  it("对角线（|dx|==|dy|）→ 归入垂直接入（dy 优先）", () => {
    // Act：目标 (50, 50)
    const h = resolveEdgeHandles({ x: 0, y: 0 }, { x: 50, y: 50 });
    // Assert
    expect(h).toEqual({ sourceHandle: "source-bottom", targetHandle: "target-top" });
  });
});

describe("key 工具", () => {
  it("canvasKey 与 entityIdFromKey 可逆", () => {
    // Arrange + Act + Assert
    expect(canvasKey("concept", 10)).toBe("c:10");
    expect(entityIdFromKey("c:10")).toBe(10);
    expect(entityIdFromKey("q:66")).toBe(66);
  });

  it("entityIdFromKey 防御损坏 key → null", () => {
    // Arrange + Act + Assert
    expect(entityIdFromKey("")).toBeNull();
    expect(entityIdFromKey("q")).toBeNull();
    expect(entityIdFromKey("q:abc")).toBeNull();
    expect(entityIdFromKey("q:0")).toBeNull();
    expect(entityIdFromKey("q:-3")).toBeNull();
  });
});

describe("v0.14.1 连线样式与箭头", () => {
  const parentEdge = (edges: { id: string; type?: string }[]) => edges.find((e) => e.id === "e:1:2")!;

  it("edgeStyle 四枚举 → RF edge type 映射（缺省 smoothstep）", () => {
    // Arrange
    const input = {
      nodes: [node(1, null, "根"), node(2, 1, "子")],
      concepts: [], models: [], links: [], positions: new Map<string, { x: number; y: number }>(),
      selectedKey: null, rootCard: null,
    };
    // Act/Assert：逐一映射
    expect(parentEdge(buildCanvasElements({ ...input, edgeStyle: "straight" }).edges).type).toBe("straight");
    expect(parentEdge(buildCanvasElements({ ...input, edgeStyle: "bezier" }).edges).type).toBe("bezier");
    expect(parentEdge(buildCanvasElements({ ...input, edgeStyle: "step" }).edges).type).toBe("step");
    expect(parentEdge(buildCanvasElements({ ...input, edgeStyle: "smoothstep" }).edges).type).toBe("smoothstep");
    // 缺省（未传）→ smoothstep（旧调用兼容）
    expect(parentEdge(buildCanvasElements(input).edges).type).toBe("smoothstep");
  });

  it("edgeArrows=true → 全部边带 ArrowClosed markerEnd（父子边与根卡虚边一致）", () => {
    // Arrange：父子 + 根卡虚边
    const { edges } = build({
      nodes: [node(1, null, "根"), node(2, 1, "子")],
      edgeArrows: true,
      edgeStyle: "bezier",
    });
    // Assert：所有边都带 markerEnd（无箭头时缺省无此键——保持旧测试等价）
    expect(edges.every((e) => (e.markerEnd as { type?: string } | undefined)?.type === "arrowclosed")).toBe(true);
    expect(edges).toHaveLength(1); // 无 rootCard 时仅父子边
    // 根卡边：样式继承 + 虚线保持 + 箭头
    const withRoot = build({
      nodes: [node(1, null, "根")],
      rootCard: { title: "体系", subtitle: "领域体系" },
      edgeArrows: true,
      edgeStyle: "straight",
    }).edges;
    const coreEdge = withRoot.find((e) => e.source === "core")!;
    expect(coreEdge.type).toBe("straight");
    expect(coreEdge.style).toEqual({ stroke: "#cbd5e1", strokeDasharray: "5 4" });
  });

  it("未知 edgeStyle（旧库/损坏值）→ 回退 smoothstep 不炸", () => {
    // Arrange
    const { edges } = build({
      nodes: [node(1, null, "根"), node(2, 1, "子")],
      edgeStyle: "curvy" as never,
    });
    // Assert
    expect(edges[0].type).toBe("smoothstep");
  });
});
