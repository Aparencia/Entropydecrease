// @vitest-environment jsdom
/**
 * KnowledgeGraphView.test.tsx — 图谱视图交互测试（v0.14 C2 spec §6 组件层）。
 *
 * @ai-context: @xyflow/react 全 mock（ReactFlow 记录 props 供交互断言；节点组件
 *              渲染不测——KnowledgeCanvasView.test 同款纪律「RF 渲染跳过 jsdom」）。
 *              覆盖：① 加载后默认仅引用层；② 图层开关过滤；③ 单击聚焦（范围外
 *              淡出）；④ 双击跳转三路由（笔记/组/体系）；⑤ 空态 + 重试；⑥ 加载失败。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GraphSnapshot } from "../utils/graphSnapshot";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

let rfProps: Record<string, unknown>[] = [];
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: (props: Record<string, unknown>) => {
      rfProps.push(props);
      return React.createElement("div", { "data-testid": "rf-canvas" });
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    Controls: () => null,
    useReactFlow: () => ({ fitView: vi.fn() }),
  };
});

import KnowledgeGraphView from "./KnowledgeGraphView";

/** 全场景快照 fixture：5 节点 + 4 边（2 link + 1 trace + 1 belong） */
const snapshot: GraphSnapshot = {
  nodes: [
    { id: "note:1", kind: "note", label: "底妆笔记", color: "blue", entityId: 1, systemId: null },
    { id: "note:2", kind: "note", label: "眼妆笔记", color: null, entityId: 2, systemId: null },
    { id: "concept:1", kind: "concept", label: "妆前保湿", color: null, entityId: 1, systemId: 10 },
    { id: "model:1", kind: "model", label: "三庭五眼", color: null, entityId: 1, systemId: 10 },
    { id: "group:1", kind: "group", label: "化妆课", color: "red", entityId: 1, systemId: null },
  ],
  edges: [
    { id: "link:1:c", source: "concept:1", target: "note:1", type: "link" },
    { id: "link:2:m", source: "model:1", target: "group:1", type: "link" },
    { id: "trace:1:1:2", source: "note:1", target: "note:2", type: "trace" },
    { id: "belong:1", source: "note:1", target: "group:1", type: "belong" },
  ],
};

function renderGraph(props: Partial<React.ComponentProps<typeof KnowledgeGraphView>> = {}) {
  return render(
    <KnowledgeGraphView
      onOpenNote={vi.fn()}
      onOpenGroup={vi.fn()}
      onOpenSystem={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  rfProps = [];
  invokeMock.mockResolvedValue(snapshot);
});

afterEach(() => cleanup());

describe("KnowledgeGraphView 加载与图层", () => {
  it("加载后默认仅引用层（spec §3.2）——2 条 link 边", async () => {
    renderGraph();
    await waitFor(() => {
      const edges = rfProps[rfProps.length - 1].edges as unknown[];
      expect(edges).toHaveLength(2);
    }, { timeout: 5000 });
    const edges = rfProps[rfProps.length - 1].edges as unknown[];
    expect(edges.every((e) => (e as { id: string }).id.startsWith("link:"))).toBe(true);
    // 节点全集渲染（5 个）
    expect((rfProps[rfProps.length - 1].nodes as unknown[]).length).toBe(5);
    // 计数显示
    expect(screen.getByTestId("graph-counts").textContent).toContain("5 节点 · 2 边");
  });

  it("开溯源层 → trace 边进入画布", async () => {
    renderGraph();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    fireEvent.click(screen.getByTestId("graph-layer-trace"));
    await waitFor(() => {
      const edges = rfProps[rfProps.length - 1].edges as unknown[];
      expect(edges).toHaveLength(3);
    }, { timeout: 5000 });
    // 再开归属层 → 4 边全量
    fireEvent.click(screen.getByTestId("graph-layer-belong"));
    await waitFor(() => {
      const edges = rfProps[rfProps.length - 1].edges as unknown[];
      expect(edges).toHaveLength(4);
    }, { timeout: 5000 });
  });

  it("关引用层 → link 边消失", async () => {
    renderGraph();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    fireEvent.click(screen.getByTestId("graph-layer-link"));
    await waitFor(() => {
      const edges = rfProps[rfProps.length - 1].edges as unknown[];
      expect(edges).toHaveLength(0);
    }, { timeout: 5000 });
  });
});

describe("KnowledgeGraphView 局部聚焦", () => {
  it("单击节点 → 1~2 度邻居展开、范围外淡出", async () => {
    renderGraph();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onNodeClick = rfProps[0].onNodeClick as (e: unknown, node: { id: string }) => void;
    onNodeClick(null, { id: "note:1" });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(1), { timeout: 5000 });
    const nodes = rfProps[rfProps.length - 1].nodes as { id: string; style?: { opacity?: number } }[];
    const dimmed = nodes.filter((n) => n.style?.opacity === 0.15).map((n) => n.id);
    // note:1 的邻居：concept:1（link）、note:2（trace——图层默认关）、group:1（belong 关）
    // 默认仅引用层 → 聚焦集 = {note:1, concept:1}；其余淡出
    expect(dimmed).toEqual(expect.arrayContaining(["model:1", "note:2", "group:1"]));
    expect(dimmed).not.toContain("concept:1");
    expect(dimmed).not.toContain("note:1");
  });

  it("点击空白取消聚焦（全部恢复实显）", async () => {
    renderGraph();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onNodeClick = rfProps[0].onNodeClick as (e: unknown, node: { id: string }) => void;
    onNodeClick(null, { id: "note:1" });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(1), { timeout: 5000 });
    const onPaneClick = rfProps[rfProps.length - 1].onPaneClick as () => void;
    onPaneClick();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(2), { timeout: 5000 });
    const nodes = rfProps[rfProps.length - 1].nodes as { style?: { opacity?: number } }[];
    expect(nodes.every((n) => !n.style || n.style.opacity !== 0.15)).toBe(true);
  });

  it("再点同一节点取消聚焦（toggle）", async () => {
    renderGraph();
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onNodeClick = rfProps[0].onNodeClick as (e: unknown, node: { id: string }) => void;
    onNodeClick(null, { id: "note:1" });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(1), { timeout: 5000 });
    const handler2 = rfProps[rfProps.length - 1].onNodeClick as (e: unknown, node: { id: string }) => void;
    handler2(null, { id: "note:1" });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(2), { timeout: 5000 });
    const nodes = rfProps[rfProps.length - 1].nodes as { style?: { opacity?: number } }[];
    expect(nodes.every((n) => !n.style || n.style.opacity !== 0.15)).toBe(true);
  });
});

describe("KnowledgeGraphView 双击跳转", () => {
  it("双击笔记节点 → onOpenNote", async () => {
    const onOpenNote = vi.fn();
    renderGraph({ onOpenNote });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onDouble = rfProps[0].onNodeDoubleClick as (
      e: unknown, node: { data: { kind: string; entityId: number; systemId: number | null } },
    ) => void;
    onDouble(null, { data: { kind: "note", entityId: 2, systemId: null } });
    expect(onOpenNote).toHaveBeenCalledWith(2);
  });

  it("双击组节点 → onOpenGroup", async () => {
    const onOpenGroup = vi.fn();
    renderGraph({ onOpenGroup });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onDouble = rfProps[0].onNodeDoubleClick as (
      e: unknown, node: { data: { kind: string; entityId: number; systemId: number | null } },
    ) => void;
    onDouble(null, { data: { kind: "group", entityId: 1, systemId: null } });
    expect(onOpenGroup).toHaveBeenCalledWith(1);
  });

  it("双击概念/模型节点 → onOpenSystem（体系归属）", async () => {
    const onOpenSystem = vi.fn();
    renderGraph({ onOpenSystem });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    const onDouble = rfProps[0].onNodeDoubleClick as (
      e: unknown, node: { data: { kind: string; entityId: number; systemId: number | null } },
    ) => void;
    onDouble(null, { data: { kind: "concept", entityId: 1, systemId: 10 } });
    expect(onOpenSystem).toHaveBeenCalledWith(10);
  });
});

describe("KnowledgeGraphView 空态与错误", () => {
  it("空快照 → 空态提示 + 刷新按钮", async () => {
    invokeMock.mockResolvedValue({ nodes: [], edges: [] });
    renderGraph();
    expect(await screen.findByTestId("graph-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("graph-retry"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("graph_snapshot"));
  });

  it("加载失败 → 错误提示 + 重试可恢复", async () => {
    invokeMock.mockRejectedValueOnce(new Error("db locked"));
    renderGraph();
    expect(await screen.findByTestId("graph-error")).toBeTruthy();
    // 重试成功 → 错误消失、画布出现
    fireEvent.click(screen.getByTestId("graph-retry"));
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.queryByTestId("graph-error")).toBeNull();
  });
});
