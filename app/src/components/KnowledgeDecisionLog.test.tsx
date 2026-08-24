// @vitest-environment jsdom
/**
 * KnowledgeDecisionLog.test.tsx — 决策/应用日志测试（v0.13.3 §六）。
 *
 * @ai-context: 覆盖分 tab 呈现与徽标计数、删除调 invoke（二次确认→delete_decision）、
 *              空态文案。invoke/confirm 全 mock（list_decisions 数据为假数据）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeDecision } from "../types/knowledge";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: confirmMock }));

import KnowledgeDecisionLog from "./KnowledgeDecisionLog";

const decision = (id: number, kind: KnowledgeDecision["kind"], usedRefs: string): KnowledgeDecision => ({
  id, kind, systemId: 1, questionId: null, usedRefs, content: `记录 ${id}`,
  expectation: null, actual: null, reflection: null, decidedAt: 0, createdAt: 0,
});

const d1 = decision(1, "decision", JSON.stringify({ conceptIds: [3] }));
const d2 = decision(2, "decision", JSON.stringify({ nodeIds: [4] }));
const app1 = decision(3, "application", JSON.stringify({ conceptIds: [3] }));

beforeEach(() => {
  invokeMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "list_decisions") return [d1, d2, app1];
    if (cmd === "delete_decision") return true;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

describe("KnowledgeDecisionLog 分 tab / 删除 / 空态", () => {
  it("分 tab 渲染：决策默认 tab（2 条），应用 tab 徽标计数（1 条），切换显示应用行", async () => {
    render(<KnowledgeDecisionLog systemId={1} />);
    await screen.findByTestId("decision-row-1");
    // 默认决策 tab：徽标计数
    expect(screen.getByTestId("decision-count-decision").textContent).toBe("(2)");
    expect(screen.getByTestId("decision-count-application").textContent).toBe("(1)");
    // 决策 tab 显示两条决策
    expect(screen.getByTestId("decision-row-1")).toBeTruthy();
    expect(screen.getByTestId("decision-row-2")).toBeTruthy();
    expect(screen.getByTestId("decision-kind-1").textContent).toBe("🧭");
    // 切到应用 tab：显示应用行
    fireEvent.click(screen.getByTestId("decision-tab-application"));
    await screen.findByTestId("decision-row-3");
    expect(screen.getByTestId("decision-kind-3").textContent).toBe("🛠");
  });

  it("删除：二次确认后调 delete_decision，并刷新 list_decisions", async () => {
    render(<KnowledgeDecisionLog systemId={1} />);
    await screen.findByTestId("decision-row-1");
    fireEvent.click(screen.getByTestId("decision-delete-1"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("delete_decision", { id: 1 }));
    await waitFor(() => {
      const listCalls = invokeMock.mock.calls.filter((c) => c[0] === "list_decisions");
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("空态：无记录时决策 tab 显示空态文案", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_decisions") return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    render(<KnowledgeDecisionLog systemId={1} />);
    expect((await screen.findByTestId("decision-log-empty")).textContent).toContain("暂无决策记录");
  });
});
