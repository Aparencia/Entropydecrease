// @vitest-environment jsdom
/**
 * KnowledgeTreeView.test.tsx — 问题树渲染交互测试（v0.13.1 §六）。
 *
 * @ai-context: 覆盖 §五 树组件关键路径——折叠/展开（默认整树可见，三角为显式
 *              动作）、节点类型中文标签（问题/场景/领域入口）、选中回调、删除
 *              二次确认（invoke 全 mock；confirm 同步 mock，断言命令参数契约）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeNode, KnowledgeLink } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));

import KnowledgeTreeView from "./KnowledgeTreeView";

const nodes: KnowledgeNode[] = [
  { id: 1, systemId: 5, parentId: null, type: "question", text: "如何练好化妆", orderIdx: 0, status: "active", createdAt: 0 },
  { id: 2, systemId: 5, parentId: 1, type: "scenario", text: "画好一个日常眼影", orderIdx: 0, status: "active", createdAt: 0 },
  { id: 3, systemId: 5, parentId: null, type: "domain_entry", text: "色彩理论", orderIdx: 1, status: "active", createdAt: 0 },
];

const links: KnowledgeLink[] = [
  { id: 8, systemId: 5, nodeId: 1, conceptId: null, modelId: null, targetType: "note", targetId: 99, createdAt: 0 },
];

beforeEach(() => {
  invokeMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "delete_knowledge_node") return true;
    if (cmd === "add_knowledge_node") return { id: 66, systemId: 5, parentId: null, type: "question", text: "", orderIdx: 0, status: "active", createdAt: 0 };
    if (cmd === "update_knowledge_node") return { id: 1, systemId: 5, parentId: null, type: "question", text: "", orderIdx: 0, status: "active", createdAt: 0 };
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function renderTree(onSelectNode = vi.fn(), onChanged = vi.fn()) {
  return render(
    <KnowledgeTreeView systemId={5} nodes={nodes} links={links} selectedNodeId={null} onSelectNode={onSelectNode} onChanged={onChanged} />,
  );
}

describe("KnowledgeTreeView 问题树", () => {
  it("折叠/展开：默认整树可见，点三角折叠子节点，再点展开", async () => {
    renderTree();
    // 默认展开（父节点 1 有子节点 2 → 初始可见）
    expect(screen.getByTestId("node-2")).toBeTruthy();
    // 折叠节点 1 → 子节点 2 隐藏
    fireEvent.click(screen.getByTestId("node-toggle-1"));
    expect(screen.queryByTestId("node-2")).toBeNull();
    // 再点展开 → 子节点 2 重新可见
    fireEvent.click(screen.getByTestId("node-toggle-1"));
    expect(screen.getByTestId("node-2")).toBeTruthy();
  });

  it("节点类型中文标签渲染：问题/场景/领域入口", async () => {
    renderTree();
    await screen.findByTestId("node-type-1");
    expect(screen.getByTestId("node-type-1").textContent).toBe("问题");
    expect(screen.getByTestId("node-type-2").textContent).toBe("场景");
    expect(screen.getByTestId("node-type-3").textContent).toBe("领域入口");
  });

  it("v0.13.9 层级缩进：子节点 paddingLeft 随 depth 递增（16px/层），引导线渲染", async () => {
    // Arrange + Act：node1 根（depth 0）、node2 是 node1 子（depth 1）、node3 根（depth 0）
    renderTree();
    await screen.findByTestId("node-1");
    // Assert：仅子节点多缩进 16px；根节点不受影响
    expect(screen.getByTestId("node-1").style.paddingLeft).toBe("8px");
    expect(screen.getByTestId("node-2").style.paddingLeft).toBe("24px");
    expect(screen.getByTestId("node-3").style.paddingLeft).toBe("8px");
    // 引导线：子节点行有水平短线
    expect(screen.getByTestId("node-guide-2")).toBeTruthy();
    expect(screen.queryByTestId("node-guide-3")).toBeNull(); // 根节点无引导线
  });

  it("v0.13.9 折叠后引导线随子树隐藏", async () => {
    // Arrange + Act
    renderTree();
    await screen.findByTestId("node-guide-2");
    fireEvent.click(screen.getByTestId("node-toggle-1"));
    // Assert：子树（含引导线）整体不渲染
    expect(screen.queryByTestId("node-2")).toBeNull();
    expect(screen.queryByTestId("node-guide-2")).toBeNull();
  });

  it("节点选中回调：点击节点 → onSelectNode 携带 id", async () => {
    const onSelectNode = vi.fn();
    renderTree(onSelectNode);
    await screen.findByTestId("node-1");
    fireEvent.click(screen.getByTestId("node-1"));
    expect(onSelectNode).toHaveBeenCalledWith(1);
  });

  it("删除二次确认：确认后调用 delete_knowledge_node 并触发刷新", async () => {
    const onChanged = vi.fn();
    renderTree(vi.fn(), onChanged);
    await screen.findByTestId("node-del-1");
    fireEvent.click(screen.getByTestId("node-del-1"));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_knowledge_node", { id: 1 }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("零节点空态：显示「从子问题开始」引导且不注入示例节点", async () => {
    render(
      <KnowledgeTreeView systemId={5} nodes={[]} links={[]} selectedNodeId={null} onSelectNode={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(await screen.findByTestId("tree-add-root")).toBeTruthy();
    expect(screen.getByText("从子问题开始")).toBeTruthy();
  });

  it("空态点击「添加根问题」后显示输入表单（Bug 修复：此前无反应）", async () => {
    render(
      <KnowledgeTreeView systemId={5} nodes={[]} links={[]} selectedNodeId={null} onSelectNode={vi.fn()} onChanged={vi.fn()} />,
    );
    const btn = await screen.findByTestId("tree-add-root");
    fireEvent.click(btn);
    // 点击后应显示输入表单（此前 Bug：空态早返回导致表单不渲染）
    expect(await screen.findByTestId("node-add-input")).toBeTruthy();
    expect(screen.getByTestId("node-add-confirm")).toBeTruthy();
    expect(screen.getByTestId("node-add-cancel")).toBeTruthy();
  });
});
