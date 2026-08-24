// @vitest-environment jsdom
/**
 * CanvasNodes.test.tsx — 画布自定义节点组件测试（v0.13.8 §七 缩放分级）。
 *
 * @ai-context: 只测纯展示分支——zoom >0.7 完整内容 / 0.4~0.7 仅标题 /
 *              <0.4 缩略卡片（图标 + 名称缩写）；选中态高亮。节点交互
 *              （拖拽/点击）由 KnowledgeCanvasView 测试覆盖；React Flow
 *              内部渲染跳过（§六）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasNodeData } from "../utils/canvasElements";
import type { QuestionRfNode } from "./CanvasNodeQuestion";
import type { ConceptRfNode } from "./CanvasNodeConcept";
import type { ModelRfNode } from "./CanvasNodeModel";

let zoomValue = 1;
vi.mock("@xyflow/react", () => ({
  useStore: () => zoomValue,
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import CanvasNodeQuestion from "./CanvasNodeQuestion";
import CanvasNodeConcept from "./CanvasNodeConcept";
import CanvasNodeModel from "./CanvasNodeModel";

function data(partial: Partial<CanvasNodeData>): CanvasNodeData {
  return {
    kind: "question", entityId: 1, title: "", subtitle: null, badges: [],
    statusText: null, statusColor: null, refCount: 0, ...partial,
  };
}

/** NodeProps 全字段假 props（组件只消费 data/selected——其余为 RF 框架字段） */
function qp(d: CanvasNodeData, selected = false) {
  return { id: "q:1", data: d, type: "question" as const, dragging: false, zIndex: 0, selectable: true, deletable: false, selected, draggable: true, isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, sourcePosition: "top" as const, targetPosition: "bottom" as const } as unknown as NodeProps<QuestionRfNode>;
}
function cp(d: CanvasNodeData, selected = false) {
  return { id: "c:1", data: d, type: "concept" as const, dragging: false, zIndex: 0, selectable: true, deletable: false, selected, draggable: true, isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, sourcePosition: "top" as const, targetPosition: "bottom" as const } as unknown as NodeProps<ConceptRfNode>;
}
function mp(d: CanvasNodeData, selected = false) {
  return { id: "m:1", data: d, type: "model" as const, dragging: false, zIndex: 0, selectable: true, deletable: false, selected, draggable: false, isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, sourcePosition: "top" as const, targetPosition: "bottom" as const } as unknown as NodeProps<ModelRfNode>;
}

afterEach(() => cleanup());

describe("画布节点缩放分级", () => {
  it("zoom>0.7：问题节点显示标题+徽标+引用计数（完整内容）", () => {
    // Arrange + Act
    zoomValue = 1;
    render(<CanvasNodeQuestion {...qp(data({ entityId: 1, title: "照片为什么发灰", badges: [{ kind: "concept", text: "曝光三角" }], refCount: 2 }))} />);
    // Assert
    expect(screen.getByText("照片为什么发灰")).toBeTruthy();
    // 徽标为「🧬 曝光三角」多文本节点——正则匹配
    expect(screen.getByText(/曝光三角/)).toBeTruthy();
    // 「📋 N 条笔记」为单文本节点（emoji 前缀）——正则匹配
    expect(screen.getByText(/2 条笔记/)).toBeTruthy();
  });

  it("zoom 0.4~0.7：仅标题（徽标/计数隐藏）", () => {
    // Arrange + Act
    zoomValue = 0.5;
    render(<CanvasNodeQuestion {...qp(data({ entityId: 1, title: "照片为什么发灰", badges: [{ kind: "concept", text: "曝光三角" }], refCount: 2 }))} />);
    // Assert
    expect(screen.getByText("照片为什么发灰")).toBeTruthy();
    expect(screen.queryByText("曝光三角")).toBeNull();
    expect(screen.queryByText("2 条笔记")).toBeNull();
  });

  it("zoom<0.4：缩略卡片（图标 + 名称缩写）", () => {
    // Arrange + Act
    zoomValue = 0.2;
    render(<CanvasNodeQuestion {...qp(data({ entityId: 1, title: "照片为什么发灰" }))} />);
    // Assert：前 4 字 + 省略号，完整标题不出现
    expect(screen.getByText("照片为什…")).toBeTruthy();
    expect(screen.queryByText("照片为什么发灰")).toBeNull();
  });

  it("概念节点：称呼 + 本质摘要 1 行 + 状态指示", () => {
    // Arrange + Act
    zoomValue = 1;
    render(<CanvasNodeConcept {...cp(data({ kind: "concept", entityId: 10, title: "曝光三角", subtitle: "光圈/快门/ISO 决定曝光", statusText: "核心", statusColor: "#0f766e" }))} />);
    // Assert
    expect(screen.getByText("曝光三角")).toBeTruthy();
    expect(screen.getByText("本质：光圈/快门/ISO 决定曝光")).toBeTruthy();
    expect(screen.getByText("● 核心")).toBeTruthy();
  });

  it("模型节点：称呼 + 主张摘录 + 学科标签", () => {
    // Arrange + Act
    zoomValue = 1;
    render(<CanvasNodeModel {...mp(data({ kind: "model", entityId: 20, title: "黄金时刻法则", subtitle: "日出日落前后 1 小时", badges: [{ kind: "discipline", text: "摄影" }] }))} />);
    // Assert
    expect(screen.getByText("黄金时刻法则")).toBeTruthy();
    expect(screen.getByText("日出日落前后 1 小时")).toBeTruthy();
    // 「🏷 摄影」为单文本节点（emoji 前缀）——正则匹配
    expect(screen.getByText(/摄影/)).toBeTruthy();
  });

  it("选中态：边框高亮（selected=true 样式切换）", () => {
    // Arrange + Act
    zoomValue = 1;
    const { container } = render(<CanvasNodeQuestion {...qp(data({ entityId: 1, title: "照片为什么发灰" }), true)} />);
    // Assert
    const box = container.firstChild as HTMLElement;
    expect(box.style.border).toContain("2px solid rgb(20, 184, 166)");
    expect(box.style.background).toBe("rgb(240, 253, 250)");
  });
});
