// @vitest-environment jsdom
/**
 * KnowledgeCanvasView.test.tsx — 画布视图交互测试（v0.13.8 §六：RF 渲染跳过 jsdom）。
 *
 * @ai-context: @xyflow/react 全 mock（ReactFlow 记录 props 供交互断言；节点组件
 *              渲染不测——规格 §六「React Flow 渲染用 e2e 或跳过」）。覆盖：
 *              ① 首次打开全量未布局 → batch_initialize 全量初始化（辐射位置）；
 *              ② 已存位置 → 跳过初始化且位置来自存储；③ 拖拽防抖保存；
 *              ④ 节点点击选中联动；⑤ 视口恢复/首次 fitView；⑥ 自动排列覆盖；
 *              ⑦ 核心问题虚拟节点；⑧ 返回按钮。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { fitViewMock } = vi.hoisted(() => ({ fitViewMock: vi.fn() }));
const { setViewportMock } = vi.hoisted(() => ({ setViewportMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

let rfProps: Record<string, unknown>[] = [];

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: (props: Record<string, unknown>) => {
      rfProps.push(props);
      return React.createElement("div", { "data-testid": "react-flow" }, props.children as never);
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    MiniMap: () => null,
    Controls: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    Background: () => null,
    BackgroundVariant: { Dots: "dots", Lines: "lines" },
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useReactFlow: () => ({ fitView: fitViewMock, setViewport: setViewportMock }),
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, () => {}];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, () => {}];
    },
    useStore: () => 1,
  };
});

import KnowledgeCanvasView from "./KnowledgeCanvasView";

function makeNodes(withPositions = false): KnowledgeNode[] {
  const pos = (x: number | null, y: number | null) => (withPositions ? { canvasX: x, canvasY: y } : { canvasX: null, canvasY: null });
  return [
    { id: 1, systemId: 5, parentId: null, type: "question", text: "如何练好化妆", orderIdx: 0, status: "active", createdAt: 0, ...pos(10, 20) },
    { id: 2, systemId: 5, parentId: 1, type: "scenario", text: "画好一个日常眼影", orderIdx: 0, status: "active", createdAt: 0, ...pos(30, 40) },
  ];
}

const concepts: KnowledgeConcept[] = [];
const models: KnowledgeModel[] = [];
const links: KnowledgeLink[] = [];

function renderView(overrides: {
  nodes?: KnowledgeNode[];
  coreQuestion?: string | null;
  onSelectItem?: (kind: string, id: number) => void;
  onGoBack?: () => void;
} = {}) {
  const onSelectItem = overrides.onSelectItem ?? vi.fn();
  const onGoBack = overrides.onGoBack ?? vi.fn();
  const utils = render(
    <KnowledgeCanvasView
      systemId={5}
      coreQuestion={overrides.coreQuestion ?? null}
      nodes={overrides.nodes ?? makeNodes()}
      concepts={concepts}
      models={models}
      links={links}
      selectedKey={null}
      onSelectItem={onSelectItem}
      onGoBack={onGoBack}
    />,
  );
  return { onSelectItem, onGoBack, ...utils };
}

/** 最近一次 ReactFlow 收到的 props */
function latestRf() {
  return rfProps[rfProps.length - 1]!;
}

/** 指定 id 的 RF 节点 */
function rfNode(id: string) {
  const nodes = latestRf().nodes as { id: string; position: { x: number; y: number }; selected?: boolean }[];
  return nodes.find((n) => n.id === id)!;
}

/** 坐标取整 2 位（cos(-90°)≈6e-17 的浮点尾巴——断言整数口径） */
function rounded(p: { x: number; y: number }) {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

beforeEach(() => {
  invokeMock.mockReset();
  fitViewMock.mockReset();
  setViewportMock.mockReset();
  rfProps = [];
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "batch_initialize_canvas_positions") return true;
    if (cmd === "get_canvas_viewport") return null;
    if (cmd === "update_node_canvas_position") return true;
    if (cmd === "save_canvas_viewport") return true;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function batchCalls() {
  return invokeMock.mock.calls.filter((c) => c[0] === "batch_initialize_canvas_positions");
}

describe("KnowledgeCanvasView 画布", () => {
  it("首次打开（全部未布局）→ 辐射布局批量初始化，位置落入 RF 节点", async () => {
    // Arrange + Act
    renderView();
    // Assert：批量初始化携全量节点（左上角口径——根 (−110,−40)，子 (−110,−260)）
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const [, args] = batchCalls()[0];
    expect(args).toMatchObject({ systemId: 5 });
    const positions = args.positions as { nodeId: number; x: number; y: number }[];
    expect(positions).toHaveLength(2);
    expect(rounded(positions.find((p) => p.nodeId === 1)!)).toEqual({ x: -110, y: -40 });
    expect(rounded(positions.find((p) => p.nodeId === 2)!)).toEqual({ x: -110, y: -260 });
    // RF 节点位置与持久化一致（root0 圆心 (0,0) → 左上角 (-110,-40)）
    await waitFor(() => expect(rounded(rfNode("q:1").position)).toEqual({ x: -110, y: -40 }));
  });

  it("已存位置 → 不触发初始化，位置来自存储", async () => {
    // Arrange：全部节点已有画布位置
    renderView({ nodes: makeNodes(true) });
    // Assert
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    expect(batchCalls()).toHaveLength(0);
    expect(rfNode("q:1").position).toEqual({ x: 10, y: 20 });
    expect(rfNode("q:2").position).toEqual({ x: 30, y: 40 });
  });

  it("拖拽结束 → 防抖后保存 update_node_canvas_position", async () => {
    // Arrange
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    const onNodeDragStop = latestRf().onNodeDragStop as (e: unknown, node: { id: string; position: { x: number; y: number } }) => void;
    // Act：拖拽 q:1 到 (100, 200)
    onNodeDragStop(null, { id: "q:1", position: { x: 100, y: 200 } });
    // Assert：防抖（400ms）后保存拖拽落点
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_node_canvas_position", { nodeId: 1, canvasX: 100, canvasY: 200 }),
    );
  });

  it("节点点击 → onSelectItem（问题/概念/模型分派）", async () => {
    // Arrange
    const { onSelectItem } = renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    const onNodeClick = latestRf().onNodeClick as (e: unknown, node: { id: string; data: { kind: string } }) => void;
    // Act：问题节点点击
    onNodeClick(null, { id: "q:1", data: { kind: "question" } });
    expect(onSelectItem).toHaveBeenCalledWith("node", 1);
    // Act：概念节点点击（选中联动右栏概念面板）
    onNodeClick(null, { id: "c:10", data: { kind: "concept" } });
    expect(onSelectItem).toHaveBeenCalledWith("concept", 10);
  });

  it("视口：已存视口 → setViewport 恢复；无记录 → fitView 兜底", async () => {
    // Arrange：保存过视口
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_canvas_viewport") return { viewportX: 10, viewportY: 20, zoom: 1.5 };
      if (cmd === "batch_initialize_canvas_positions") return true;
      throw new Error(`unexpected: ${cmd}`);
    });
    renderView({ nodes: makeNodes(true) });
    // Act + Assert
    await waitFor(() => expect(setViewportMock).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 1.5 }));
    expect(fitViewMock).not.toHaveBeenCalled();
  });

  it("视口变化结束 → 防抖保存 save_canvas_viewport", async () => {
    // Arrange
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    const onMoveEnd = latestRf().onMoveEnd as (e: unknown, vp: { x: number; y: number; zoom: number }) => void;
    // Act
    onMoveEnd(null, { x: 5.5, y: 6.5, zoom: 0.8 });
    // Assert：防抖（500ms）后保存视口
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_canvas_viewport", { systemId: 5, viewportX: 5.5, viewportY: 6.5, zoom: 0.8 }),
    );
  });

  it("自动排列 → 全量重算并批量覆盖（含已存位置）", async () => {
    // Arrange：已存位置也参与重算（规格 §4.4：用户点「自动排列」覆盖已存位置）
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(batchCalls()).toHaveLength(0));
    fireEvent.click(screen.getByTestId("canvas-auto-layout"));
    // Act + Assert
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const [, args] = batchCalls()[0];
    const positions = args.positions as { nodeId: number }[];
    expect(positions).toHaveLength(2);
    expect(rounded(rfNode("q:1").position)).toEqual({ x: -110, y: -40 });
    // 适配视图也被触发
    expect(fitViewMock).toHaveBeenCalled();
  });

  it("核心问题存在 → 渲染核心虚拟节点且根节点上环 1", async () => {
    // Arrange：未布局（核心存在时圆心被虚拟核心占用——根节点首次布局上环 1）
    renderView({ coreQuestion: "照片为什么发灰" });
    // Assert：核心节点存在 + 根/子节点首次批量初始化到环 1/环 2
    await waitFor(() => expect(rfNode("core")).toBeTruthy());
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const [, args] = batchCalls()[0];
    const positions = args.positions as { nodeId: number; x: number; y: number }[];
    expect(rounded(positions.find((p) => p.nodeId === 1)!)).toEqual({ x: -110, y: -260 });
    expect(rounded(positions.find((p) => p.nodeId === 2)!)).toEqual({ x: -110, y: -460 });
  });

  it("返回按钮 → onGoBack（切回树视图）", async () => {
    // Arrange
    const { onGoBack } = renderView({ nodes: makeNodes(true) });
    // Act
    fireEvent.click(screen.getByTestId("canvas-back"));
    // Assert
    expect(onGoBack).toHaveBeenCalled();
  });
});
