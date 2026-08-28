/**
 * graphSnapshot.test.ts — 图谱纯函数测试（v0.14 C2 spec §6）。
 *
 * @ai-context: 覆盖 filterEdges 图层开关、focusSubgraph 1/2 度邻居正确性、
 *              graphNodeKey/parseGraphNodeKey 前缀契约、layoutGraph 确定性。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYERS,
  filterEdges,
  focusSubgraph,
  graphNodeKey,
  layoutGraph,
  NODE_KIND_COLOR,
  parseGraphNodeKey,
  type GraphEdge,
  type GraphNode,
} from "./graphSnapshot";

const nodes: GraphNode[] = [
  { id: "group:1", kind: "group", label: "化妆课", color: null, entityId: 1 },
  { id: "note:1", kind: "note", label: "底妆笔记", color: null, entityId: 1 },
  { id: "note:2", kind: "note", label: "眼妆笔记", color: null, entityId: 2 },
  { id: "concept:1", kind: "concept", label: "妆前保湿", color: null, entityId: 1, systemId: 10 },
  { id: "model:1", kind: "model", label: "三庭五眼", color: null, entityId: 1, systemId: 10 },
];

const edges: GraphEdge[] = [
  { id: "l1", source: "concept:1", target: "note:1", type: "link" },
  { id: "l2", source: "model:1", target: "group:1", type: "link" },
  { id: "t1", source: "note:1", target: "note:2", type: "trace" },
  { id: "b1", source: "note:1", target: "group:1", type: "belong" },
];

describe("graphNodeKey / parseGraphNodeKey", () => {
  it("四类节点键带类型前缀（跨表 id 空间独立）", () => {
    expect(graphNodeKey("note", 1)).toBe("note:1");
    expect(graphNodeKey("concept", 2)).toBe("concept:2");
    expect(graphNodeKey("model", 3)).toBe("model:3");
    expect(graphNodeKey("group", 4)).toBe("group:4");
  });

  it("解析 roundtrip 一致", () => {
    expect(parseGraphNodeKey("note:1")).toEqual({ kind: "note", id: 1 });
    expect(parseGraphNodeKey("concept:22")).toEqual({ kind: "concept", id: 22 });
  });

  it("非法键回退 null（数据损坏防御）", () => {
    expect(parseGraphNodeKey("")).toBeNull();
    expect(parseGraphNodeKey("note")).toBeNull();
    expect(parseGraphNodeKey(":1")).toBeNull();
    expect(parseGraphNodeKey("card:1")).toBeNull();
    expect(parseGraphNodeKey("note:abc")).toBeNull();
    expect(parseGraphNodeKey("note:0")).toBeNull();
  });
});

describe("filterEdges 图层开关", () => {
  it("默认仅引用层（spec §3.2）", () => {
    expect(filterEdges(edges, DEFAULT_LAYERS)).toEqual([edges[0], edges[1]]);
  });

  it("全关 → 空边集", () => {
    expect(filterEdges(edges, { link: false, trace: false, belong: false })).toEqual([]);
  });

  it("只开溯源 → 仅 trace 边", () => {
    expect(filterEdges(edges, { link: false, trace: true, belong: false })).toEqual([edges[2]]);
  });

  it("引用+归属同开 → 两类边按序保留", () => {
    expect(filterEdges(edges, { link: true, trace: false, belong: true })).toEqual([edges[0], edges[1], edges[3]]);
  });
});

describe("focusSubgraph 局部聚焦", () => {
  it("无中心 → 全量返回", () => {
    const r = focusSubgraph(nodes, edges, null);
    expect(r.nodes).toHaveLength(nodes.length);
    expect(r.edges).toHaveLength(edges.length);
  });

  it("1 度邻居：中心 + 直接相连（degree=1）", () => {
    const r = focusSubgraph(nodes, edges, "note:1", 1);
    expect(r.nodeIds).toEqual(new Set(["note:1", "concept:1", "note:2", "group:1"]));
    // 仅保留两端都在聚焦集内的边
    expect(r.edges.map((e) => e.id)).toEqual(["l1", "t1", "b1"]);
  });

  it("2 度邻居：经 1 度节点可达的节点也纳入", () => {
    // note:2 的邻居只有 note:1；concept:1 无其他邻居——2 度与 1 度相同
    const r = focusSubgraph(nodes, edges, "note:2", 2);
    expect(r.nodeIds).toEqual(new Set(["note:2", "note:1", "concept:1", "group:1"]));
    expect(r.edges.map((e) => e.id)).toEqual(["l1", "t1", "b1"]);
  });

  it("2 度邻居能穿过桥接节点（链式 3 节点）", () => {
    // model:1 → group:1 → note:1：以 model:1 为中心 2 度可达 note:1
    const r = focusSubgraph(nodes, edges, "model:1", 2);
    expect(r.nodeIds.has("note:1")).toBe(true);
    // 仅保留两端都在聚焦集内的边（concept:1 不在集内 → l1 排除）
    expect(r.edges.map((e) => e.id)).toEqual(["l2", "b1"]);
  });

  it("孤立中心：仅自身（无邻居不崩）", () => {
    const lonely: GraphNode[] = [{ id: "note:9", kind: "note", label: "孤岛", color: null, entityId: 9 }];
    const r = focusSubgraph(lonely, [], "note:9", 2);
    expect(r.nodeIds).toEqual(new Set(["note:9"]));
    expect(r.edges).toEqual([]);
  });

  it("不存在的中心 → 空聚焦（无节点/边）", () => {
    const r = focusSubgraph(nodes, edges, "note:999", 2);
    expect(r.nodeIds.size).toBe(0);
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
  });

  it("聚焦不修改输入（纯函数无副作用）", () => {
    const beforeNodes = nodes.length;
    const beforeEdges = edges.length;
    focusSubgraph(nodes, edges, "note:1", 2);
    expect(nodes).toHaveLength(beforeNodes);
    expect(edges).toHaveLength(beforeEdges);
  });
});

describe("layoutGraph 确定性布局", () => {
  it("按 kind 分列、列内按 entityId 升序", () => {
    const pos = layoutGraph(nodes);
    expect(pos["group:1"].x).toBe(0);
    expect(pos["note:1"].x).toBe(pos["note:2"].x); // 同列
    expect(pos["note:1"].y).toBeLessThan(pos["note:2"].y); // 升序
    expect(pos["concept:1"].x).toBeGreaterThan(pos["note:1"].x); // 概念列在笔记右
    expect(pos["model:1"].x).toBeGreaterThan(pos["concept:1"].x);
  });

  it("空图 → 空布局", () => {
    expect(layoutGraph([])).toEqual({});
  });
});

describe("NODE_KIND_COLOR 类型色", () => {
  it("四类节点各有色板 id（B 子项目色板）", () => {
    expect(NODE_KIND_COLOR.note).toBe("blue");
    expect(NODE_KIND_COLOR.concept).toBe("purple");
    expect(NODE_KIND_COLOR.model).toBe("orange");
    expect(NODE_KIND_COLOR.group).toBe("teal");
  });
});
