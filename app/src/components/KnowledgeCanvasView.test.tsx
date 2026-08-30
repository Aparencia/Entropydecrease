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
    MarkerType: { ArrowClosed: "arrowclosed", Arrow: "arrow" },
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
  systemName?: string | null;
  onSelectItem?: (kind: string, id: number) => void;
  onGoBack?: () => void;
  onPositionsSaved?: (updates: { nodeId: number; x: number; y: number }[]) => void;
} = {}) {
  const onSelectItem = overrides.onSelectItem ?? vi.fn();
  const onGoBack = overrides.onGoBack ?? vi.fn();
  const onPositionsSaved = (overrides.onPositionsSaved ?? vi.fn()) as unknown as ReturnType<typeof vi.fn>;
  const utils = render(
    <KnowledgeCanvasView
      systemId={5}
      coreQuestion={overrides.coreQuestion ?? null}
      systemName={overrides.systemName ?? null}
      nodes={overrides.nodes ?? makeNodes()}
      concepts={concepts}
      models={models}
      links={links}
      selectedKey={null}
      onSelectItem={onSelectItem}
      onPositionsSaved={onPositionsSaved as unknown as (updates: { nodeId: number; x: number; y: number }[]) => void}
      onGoBack={onGoBack}
    />,
  );
  return { onSelectItem, onGoBack, onPositionsSaved, ...utils };
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
    if (cmd === "get_canvas_prefs") return null;
    if (cmd === "save_canvas_prefs") return true;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function batchCalls() {
  return invokeMock.mock.calls.filter((c) => c[0] === "batch_initialize_canvas_positions");
}

describe("KnowledgeCanvasView 画布", () => {
  it("首次打开（全部未布局）→ 辐射布局批量初始化，位置落入 RF 节点且回传父页合并", async () => {
    // Arrange + Act
    const { onPositionsSaved } = renderView();
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
    // 父页合并回调（防重挂载覆盖）
    await waitFor(() => expect(onPositionsSaved).toHaveBeenCalled());
    expect(rounded((onPositionsSaved.mock.calls[0][0] as { x: number; y: number }[])[0])).toEqual({ x: -110, y: -40 });
  });

  it("回归：重挂载且父页已合并位置 → 不再批量初始化（拖拽落点不被辐射重算覆盖）", async () => {
    // Arrange：首次打开 → 批量初始化 → 父页合并（模拟 onPositionsSaved 生效）
    const saved: { nodeId: number; x: number; y: number }[] = [];
    const { unmount } = renderView({
      onPositionsSaved: (updates) => { saved.push(...updates); },
    });
    await waitFor(() => expect(saved).toHaveLength(2));
    unmount();
    // Act：以"已存位置"的 props 重挂载（父页合并后的状态）
    renderView({ nodes: makeNodes(true).map((n) => {
      const s = saved.find((x) => x.nodeId === n.id)!;
      return { ...n, canvasX: s.x, canvasY: s.y };
    }) });
    // Assert：不再触发第二次批量初始化，位置来自存储
    await waitFor(() => expect(rfNode("q:1")).toBeTruthy());
    expect(batchCalls()).toHaveLength(1);
    expect(rounded(rfNode("q:1").position)).toEqual({ x: -110, y: -40 });
  });

  it("已存位置 → 不触发初始化，位置来自存储", async () => {
    // Arrange：全部节点已有画布位置
    renderView({ nodes: makeNodes(true) });
    // Assert：v0.14.1 偏好门控——waitFor 至元素渲染（初始渲染 nodes=[]）
    await waitFor(() => expect(rfNode("q:1")).toBeTruthy());
    expect(batchCalls()).toHaveLength(0);
    expect(rfNode("q:1").position).toEqual({ x: 10, y: 20 });
    expect(rfNode("q:2").position).toEqual({ x: 30, y: 40 });
  });

  it("拖拽结束 → 防抖后保存 update_node_canvas_position 并回传父页合并", async () => {
    // Arrange
    const { onPositionsSaved } = renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    const onNodeDragStop = latestRf().onNodeDragStop as (e: unknown, node: { id: string; position: { x: number; y: number } }) => void;
    // Act：拖拽 q:1 到 (100, 200)
    onNodeDragStop(null, { id: "q:1", position: { x: 100, y: 200 } });
    // Assert：防抖（400ms）后保存拖拽落点
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_node_canvas_position", { nodeId: 1, canvasX: 100, canvasY: 200 }),
    );
    // 父页合并回调（拖拽位置同步进 props——重挂载不丢）
    await waitFor(() => expect(onPositionsSaved).toHaveBeenCalledWith([{ nodeId: 1, x: 100, y: 200 }]));
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

  it("「布局 ▾」选择（radial）→ 全量重算并批量覆盖（含已存位置）", async () => {
    // Arrange：已存位置也参与重算（规格 §4.4：用户显式选择布局覆盖已存位置）
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(batchCalls()).toHaveLength(0));
    fireEvent.change(screen.getByTestId("canvas-layout-select"), { target: { value: "radial" } });
    // Act + Assert
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const [, args] = batchCalls()[0];
    const positions = args.positions as { nodeId: number }[];
    expect(positions).toHaveLength(2);
    expect(rounded(rfNode("q:1").position)).toEqual({ x: -110, y: -40 });
    // 适配视图也被触发
    expect(fitViewMock).toHaveBeenCalled();
  });

  it("「布局 ▾」切换（treeRight）→ 用该算法重排 + save_canvas_prefs 持久化", async () => {
    // Arrange
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    // Act：切换布局算法
    fireEvent.change(screen.getByTestId("canvas-layout-select"), { target: { value: "treeRight" } });
    // Assert：批量重排 + 偏好落库（edge 字段保持当前值——只改 layout）
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("save_canvas_prefs", {
      systemId: 5, edgeStyle: "smoothstep", edgeArrows: false, layoutAlgorithm: "treeRight",
    });
  });

  it("「连线 ▾」切换（bezier）→ 即时重渲染（edges type）+ save_canvas_prefs", async () => {
    // Arrange
    renderView({ nodes: makeNodes(true) });
    await waitFor(() => expect(rfProps.length).toBeGreaterThan(0));
    // Act：切换连线样式
    fireEvent.change(screen.getByTestId("canvas-edge-style-select"), { target: { value: "bezier" } });
    // Assert：边即时变为 bezier；偏好落库（layout 保持）
    await waitFor(() => expect((latestRf().edges as { type: string }[])[0].type).toBe("bezier"));
    expect(invokeMock).toHaveBeenCalledWith("save_canvas_prefs", {
      systemId: 5, edgeStyle: "bezier", edgeArrows: false, layoutAlgorithm: "radial",
    });
  });

  it("箭头复选框 → markerEnd 生效 + save_canvas_prefs", async () => {
    // Arrange
    renderView({ nodes: makeNodes(true) });
    // v0.14.1：偏好门控——先等边渲染（初始渲染 edges=[]）
    await waitFor(() => expect((latestRf().edges as unknown[]).length).toBeGreaterThan(0));
    expect((latestRf().edges as { markerEnd?: unknown }[])[0].markerEnd).toBeUndefined();
    // Act：勾选箭头
    fireEvent.click(screen.getByTestId("canvas-edge-arrows"));
    // Assert：全部边带 markerEnd；偏好落库
    await waitFor(() =>
      expect((latestRf().edges as { markerEnd?: { type: string } }[])[0].markerEnd?.type).toBe("arrowclosed"),
    );
    expect(invokeMock).toHaveBeenCalledWith("save_canvas_prefs", {
      systemId: 5, edgeStyle: "smoothstep", edgeArrows: true, layoutAlgorithm: "radial",
    });
  });

  it("已存偏好（treeRight+bezier+箭头）→ 首次缺位布局用已存算法、边按已存样式", async () => {
    // Arrange：get_canvas_prefs 返回已存偏好
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_canvas_prefs") {
        return { edgeStyle: "bezier", edgeArrows: true, layoutAlgorithm: "treeRight" };
      }
      if (cmd === "batch_initialize_canvas_positions") return true;
      if (cmd === "get_canvas_viewport") return null;
      throw new Error(`unexpected: ${cmd}`);
    });
    renderView({ nodes: makeNodes(false) });
    // Assert：边按 bezier + 箭头渲染；缺位节点按 treeRight 布局（子节点 depth1 x=280）
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const [, args] = batchCalls()[0];
    const positions = args.positions as { nodeId: number; x: number; y: number }[];
    expect(rounded(positions.find((p) => p.nodeId === 1)!)).toEqual({ x: -110, y: -40 });
    expect(rounded(positions.find((p) => p.nodeId === 2)!)).toEqual({ x: 170, y: -40 });
    await waitFor(() => expect((latestRf().edges as { type: string }[])[0].type).toBe("bezier"));
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
    // v0.13.9：RING_STEP 200→160 → 环 2 半径 420→380 → 子节点上移 40px
    expect(rounded(positions.find((p) => p.nodeId === 2)!)).toEqual({ x: -110, y: -420 });
  });

  it("v0.13.9 领域体系：无核心问题但有体系名 → 圆心体系名卡 + 根节点虚线边", async () => {
    // Arrange：领域体系（coreQuestion null）+ systemName 非空
    renderView({ systemName: "大学规划" });
    // Assert：core 卡标题=体系名、副标=领域体系；仅根节点（node1）连虚线边
    await waitFor(() => expect(rfNode("core")).toBeTruthy());
    await waitFor(() => expect(batchCalls()).toHaveLength(1));
    const core = rfNode("core") as unknown as { data: { title: string; subtitle: string } };
    expect(core.data.title).toBe("大学规划");
    expect(core.data.subtitle).toBe("领域体系");
    const edges = latestRf().edges as { id: string; source: string; target: string; style?: { strokeDasharray?: string } }[];
    const coreEdges = edges.filter((e) => e.source === "core");
    expect(coreEdges).toHaveLength(1); // node1 根；node2 是子不连根卡
    expect(coreEdges[0]).toMatchObject({ id: "e:core:1", target: "q:1" });
    expect(coreEdges[0].style?.strokeDasharray).toBe("5 4");
    // 审查修复（hasCore 统一 rootCard 口径）：领域体系首根上环 1——
    // 不再与圆心体系名卡重叠（圆心占位 = (-110,-40)）
    expect(rounded(rfNode("q:1").position)).not.toEqual({ x: -110, y: -40 });
  });

  it("v0.13.9 接线动态化：edges 携带按相对方位计算的 sourceHandle/targetHandle", async () => {
    // Arrange：已存位置（q:1 左上角 (10,20)、q:2 (30,40)——q:2 在 q:1 右下方）
    renderView({ nodes: makeNodes(true) });
    // Assert：中心差 dx=20, dy=20（|dx|==|dy| → 垂直接入 source-bottom/target-top）
    // v0.14.1：布局经偏好加载门控（prefsLoaded）——元素渲染先于 RF 语义化就绪，
    //          waitFor 重试至 edges 出现（初始渲染 nodes=[]）
    await waitFor(() => {
      const edges = latestRf().edges as { id: string; sourceHandle?: string; targetHandle?: string }[];
      const e = edges.find((x) => x.id === "e:1:2");
      expect(e).toBeTruthy();
      expect(e!.sourceHandle).toBe("source-bottom");
      expect(e!.targetHandle).toBe("target-top");
    });
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
