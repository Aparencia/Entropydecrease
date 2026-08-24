// @vitest-environment jsdom
/**
 * KnowledgePage.test.tsx — 体系页空态示例入口 + 全局向导联动（v0.13.7 具象化）
 * + v0.13.8 画布双入口接线。
 *
 * @ai-context: 空态（systems.length === 0）渲染 KnowledgeSampleView——示例≠预填
 *              （纪律裁决 2026-08-24）：浏览是被动参照；复制需先有全局体系，
 *              无全局时 onNeedGlobal 打开全局创建向导（既有 handleCreated 流）。
 * @ai-context: v0.13.8 画布——中栏「🗺 画布」标签与树视图「🎨 画布」浮钮两个
 *              入口都切 middleView="canvas"（画布激活才挂载，§4.5）；本测试只
 *              断言挂载接线（React Flow 渲染跳过——KnowledgeCanvasView.test 覆盖）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn().mockResolvedValue(true) }));
// v0.13.8：页面级测试只断言接线——画布视图本身 mock（RF 渲染跳过 jsdom，规格 §六；
// 画布内部行为由 KnowledgeCanvasView.test 覆盖）
vi.mock("../components/KnowledgeCanvasView", () => ({
  default: ({ onGoBack }: { onGoBack: () => void }) => (
    <div data-testid="canvas-view">
      <button data-testid="canvas-back" onClick={onGoBack}>← 树视图</button>
    </div>
  ),
}));

import KnowledgePage from "./KnowledgePage";

const GLOBAL_SYSTEM = {
  id: 1, parentSystemId: null, name: "摄影体系", kind: "global",
  coreQuestion: "如何拍出好照片", status: "active", createdAt: 0, updatedAt: 0,
  nodeCount: 1, conceptCount: 0, modelCount: 0,
};
const aNode = {
  id: 9, systemId: 1, parentId: null, type: "question", text: "照片为什么发灰",
  orderIdx: 0, status: "active", createdAt: 0, canvasX: null, canvasY: null,
};

/** 有体系 + 画布命令的 mock（画布激活时需要的命令回路） */
function withSystemMock() {
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_knowledge_systems": return [GLOBAL_SYSTEM];
      case "list_knowledge_nodes": return [aNode];
      case "list_knowledge_concepts": return [];
      case "list_knowledge_models": return [];
      case "list_knowledge_links": return [];
      case "get_canvas_viewport": return null;
      case "batch_initialize_canvas_positions": return true;
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_knowledge_systems": return [];
      case "list_knowledge_nodes": return [];
      case "list_knowledge_concepts": return [];
      case "list_knowledge_models": return [];
      case "list_knowledge_links": return [];
      default: throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("KnowledgePage 空态", () => {
  it("空态显示示例体系入口", async () => {
    render(<KnowledgePage />);
    const sample = await screen.findByTestId("sample-view");
    expect(sample.textContent).toContain("摄影");
    expect(screen.getByTestId("sample-copy")).toBeTruthy();
  });

  it("空态点示例复制（无全局）→ 打开全局创建向导", async () => {
    render(<KnowledgePage />);
    fireEvent.click(await screen.findByTestId("sample-copy"));
    await waitFor(() => expect(screen.getByTestId("knowledge-wizard")).toBeTruthy());
  });
});

describe("KnowledgePage 画布入口（v0.13.8）", () => {
  it("中栏「🗺 画布」标签 → 挂载画布视图", async () => {
    // Arrange：有体系并选中（画布需体系上下文）
    withSystemMock();
    render(<KnowledgePage />);
    fireEvent.click(await screen.findByTestId("system-global"));
    // Act：点「画布」标签
    fireEvent.click(await screen.findByText("🗺 画布"));
    // Assert：画布挂载（该标签在激活前不挂载——§4.5 首次切换语义）
    expect(await screen.findByTestId("canvas-view")).toBeTruthy();
  });

  it("树视图「🎨 画布」浮钮 → 同一画布视图（双入口互通，返回可切回树视图）", async () => {
    // Arrange
    withSystemMock();
    render(<KnowledgePage />);
    await screen.findByTestId("system-global");
    fireEvent.click(screen.getByTestId("system-global"));
    // Act：树视图顶部浮钮
    fireEvent.click(await screen.findByTestId("tree-open-canvas"));
    // Assert：画布视图挂载
    expect(await screen.findByTestId("canvas-view")).toBeTruthy();
    // 画布「← 树视图」返回按钮 → 切回树视图（浮钮回显）
    fireEvent.click(screen.getByTestId("canvas-back"));
    expect(await screen.findByTestId("tree-open-canvas")).toBeTruthy();
  });
});
