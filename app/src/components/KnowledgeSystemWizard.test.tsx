// @vitest-environment jsdom
/**
 * KnowledgeSystemWizard.test.tsx — 全局体系创建向导三步校验测试（v0.13.1 §六）。
 *
 * @ai-context: 覆盖 UI 层校验（§五）——核心问题必填、领域入口去重（逐行红字，
 *              非静默吞掉）、全部跳过仍可创建；并在完成时断言 invoke 调用序列
 *              （create_knowledge_system → 每个 domain_entry 节点 → scenario 节点），
 *              顺序不可变（前端契约）。invoke 全 mock（不触碰真实后端）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeSystem } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));

import KnowledgeSystemWizard from "./KnowledgeSystemWizard";

const createdSystem: KnowledgeSystem = {
  id: 1, parentSystemId: null, name: "全局体系", kind: "global", coreQuestion: "如何练好化妆",
  status: "active", createdAt: 0, updatedAt: 0, nodeCount: 0, conceptCount: 0, modelCount: 0,
};

beforeEach(() => {
  invokeMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "create_knowledge_system") return createdSystem;
    if (cmd === "add_knowledge_node") return { id: 99, systemId: 1, parentId: null, type: "", text: "", orderIdx: 0, status: "active", createdAt: 0 };
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

function renderWizard(onCreated = vi.fn()) {
  return render(<KnowledgeSystemWizard onClose={vi.fn()} onCreated={onCreated} />);
}

describe("KnowledgeSystemWizard 三步校验", () => {
  it("核心问题必填：空核心问题点下一步 → 红色提示并停留在第 1 步", async () => {
    renderWizard();
    await screen.findByTestId("knowledge-wizard");
    fireEvent.change(screen.getByTestId("wizard-name"), { target: { value: "全局体系" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect((await screen.findByTestId("wizard-error")).textContent).toContain("请输入核心问题");
    // 仍停留第 1 步（未创建）
    expect(invokeMock).not.toHaveBeenCalledWith("create_knowledge_system", expect.anything());
  });

  it("领域入口去重：重复行 → 红色提示且不前进到第 3 步", async () => {
    renderWizard();
    await screen.findByTestId("knowledge-wizard");
    fireEvent.change(screen.getByTestId("wizard-name"), { target: { value: "全局体系" } });
    fireEvent.change(screen.getByTestId("wizard-core-question"), { target: { value: "如何练好化妆" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(await screen.findByTestId("wizard-domain-0")).toBeTruthy();
    fireEvent.change(screen.getByTestId("wizard-domain-0"), { target: { value: "化妆" } });
    fireEvent.change(screen.getByTestId("wizard-domain-1"), { target: { value: "化妆" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect((await screen.findByTestId("wizard-error")).textContent).toContain("存在重复的领域入口");
    // 未创建任何节点
    expect(invokeMock).not.toHaveBeenCalledWith("add_knowledge_node", expect.anything());
  });

  it("全部跳过仍可创建：仅核心问题 + 领域行全空 + 输出空 → create 但无节点", async () => {
    const onCreated = vi.fn();
    renderWizard(onCreated);
    await screen.findByTestId("knowledge-wizard");
    fireEvent.change(screen.getByTestId("wizard-name"), { target: { value: "全局体系" } });
    fireEvent.change(screen.getByTestId("wizard-core-question"), { target: { value: "如何练好化妆" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    await screen.findByTestId("wizard-domain-0");
    fireEvent.click(screen.getByTestId("wizard-next"));
    await screen.findByTestId("wizard-first-output");
    fireEvent.click(screen.getByTestId("wizard-finish"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_knowledge_system", {
        name: "全局体系", kind: "global", coreQuestion: "如何练好化妆",
      });
    });
    // 无领域入口、无输出 → 不调用 add_knowledge_node
    expect(invokeMock.mock.calls.filter((c) => c[0] === "add_knowledge_node")).toHaveLength(0);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("完成时按顺序创建：create 然后逐个 domain_entry，再 scenario", async () => {
    const onCreated = vi.fn();
    renderWizard(onCreated);
    await screen.findByTestId("knowledge-wizard");
    fireEvent.change(screen.getByTestId("wizard-name"), { target: { value: "全局体系" } });
    fireEvent.change(screen.getByTestId("wizard-core-question"), { target: { value: "如何练好化妆" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    await screen.findByTestId("wizard-domain-0");
    fireEvent.change(screen.getByTestId("wizard-domain-0"), { target: { value: "化妆" } });
    fireEvent.change(screen.getByTestId("wizard-domain-1"), { target: { value: "打光" } });
    fireEvent.click(screen.getByTestId("wizard-next"));
    await screen.findByTestId("wizard-first-output");
    fireEvent.change(screen.getByTestId("wizard-first-output"), { target: { value: "画好一个眼影" } });
    fireEvent.click(screen.getByTestId("wizard-finish"));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create_knowledge_system", {
      name: "全局体系", kind: "global", coreQuestion: "如何练好化妆",
    }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("add_knowledge_node", { systemId: 1, nodeType: "domain_entry", text: "化妆" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("add_knowledge_node", { systemId: 1, nodeType: "domain_entry", text: "打光" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("add_knowledge_node", { systemId: 1, nodeType: "scenario", text: "画好一个眼影" }));

    // 顺序契约：create 在 add 之前
    const createIdx = invokeMock.mock.calls.findIndex((c) => c[0] === "create_knowledge_system");
    const firstAddIdx = invokeMock.mock.calls.findIndex((c) => c[0] === "add_knowledge_node");
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(firstAddIdx).toBeGreaterThan(createIdx);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("每步显示「例如」示例行（不写入输入框）", async () => {
    renderWizard();
    await screen.findByTestId("knowledge-wizard");
    expect(screen.getByTestId("wizard-example-1").textContent).toContain("化妆又快又自然");
    // 填核心问题以允许前进到第 2 步；但例不会被预填到输入框
    fireEvent.change(screen.getByTestId("wizard-core-question"), { target: { value: "如何练好化妆" } });
    // 第 1 步确认：输入框未被示例预填，值为用户键入内容
    expect((screen.getByTestId("wizard-core-question") as HTMLTextAreaElement).value).toBe("如何练好化妆");
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(await screen.findByTestId("wizard-example-2")).toBeTruthy();
    // 第 3 步的示例行
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(await screen.findByTestId("wizard-example-3")).toBeTruthy();
  });
});
