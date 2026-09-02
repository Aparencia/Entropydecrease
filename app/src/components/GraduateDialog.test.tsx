// @vitest-environment jsdom
/**
 * GraduateDialog.test.tsx — 毕业仪式确认流测试（v0.18.1 验收 5）。
 *
 * @ai-context: 确认前呈现现算信号预览；确认调用 goal_settle 并渲染报告快照
 *              结果（里程碑/结算/复习统计/成果物）；失败信息可读。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GraduateDialog from "./GraduateDialog";
import type { GraduationReport } from "../types/goals";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const report: GraduationReport = {
  goalId: 10,
  goalName: "学会 Python",
  graduatedAt: 1753000000,
  milestones: [
    { title: "基础入门", status: "done", completedAt: 100 },
    { title: "应用练习", status: "skipped", completedAt: null },
  ],
  groupSettlements: [{ groupId: 3, groupName: "Python 组", settlementCount: 2, lastSettledAt: 200 }],
  reviewStats: { cardTotal: 40, reviewLogsTotal: 120, reviewDays90: 7, weakCards: 6 },
  artifacts: { groups: 1, notes: 8, cards: 40, concepts: 5 },
  criteriaStatement: "完成全部里程碑 + 组结算 1 次",
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_goal_detail") {
      return {
        goal: { id: 10, name: "学会 Python", domainTag: null, status: "active", horizonEnd: null, successCriteriaJson: "{}", intentJson: "{}", createdAt: 0, completedAt: null, updatedAt: 0 },
        criteria: [{ label: "里程碑", met: true, detail: "1 / 1 已完成" }, { label: "组结算", met: true, detail: "2 / 1 次" }],
        progress: { progress: { milestoneTotal: 1, milestoneDone: 1, percent: 100, settlementsCount: 2, contractDone: 0, contractTotal: 0, reviewDays90: 7, applicationsCount: 0, selfTestPassedRate: null, weakGroups: [] }, statement: "100% · 里程碑 1/1", ready: true, checks: [] },
        milestones: [{ id: 1, goalId: 10, title: "基础入门", dueAt: null, orderIdx: 0, status: "done", criteriaType: "manual", refGroupId: null, completedAt: 100, createdAt: 0 }],
        groups: [{ id: 3, name: "Python 组" }],
        declaration: "用3 个月学会 Python，达成标准：…",
      };
    }
    if (cmd === "get_goal_progress") {
      return { progress: { milestoneTotal: 1, milestoneDone: 1, percent: 100, settlementsCount: 2, contractDone: 0, contractTotal: 0, reviewDays90: 7, applicationsCount: 0, selfTestPassedRate: null, weakGroups: [] }, statement: "100% · 里程碑 1/1", ready: true, checks: [{ label: "里程碑", met: true, detail: "1 / 1 已完成" }] };
    }
    if (cmd === "goal_settle") return report;
    throw new Error(`unexpected: ${cmd}`);
  });
});

afterEach(() => cleanup());

describe("GraduateDialog 毕业仪式", () => {
  it("确认调用 goal_settle 并渲染报告快照（里程碑/结算/复习/成果物）", async () => {
    const onGraduated = vi.fn();
    render(<GraduateDialog goalId={10} onClose={vi.fn()} onGraduated={onGraduated} />);
    await screen.findByTestId("confirm-graduate");
    fireEvent.click(screen.getByTestId("confirm-graduate"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("goal_settle", { id: 10 }));
    await screen.findByTestId("graduate-result");
    expect(screen.getByText(/已毕业——「学会 Python」/)).toBeTruthy();
    expect(screen.getByText(/完成全部里程碑 \+ 组结算 1 次/)).toBeTruthy();
    expect(screen.getByText(/Python 组：2 次/)).toBeTruthy();
    expect(screen.getByText(/40 卡 · 120 次复习/)).toBeTruthy();
    expect(screen.getByText(/8 笔记 · 40 卡 · 5 概念/)).toBeTruthy();
    expect(onGraduated).toHaveBeenCalledTimes(1);
  });

  it("确认失败：错误信息展示且不关闭（回退再等等）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_goal_detail" || cmd === "get_goal_progress") throw new Error("x");
      if (cmd === "goal_settle") throw new Error("毕业判据未全部满足：里程碑（0 / 1）");
      throw new Error(`unexpected: ${cmd}`);
    });
    const onGraduated = vi.fn();
    render(<GraduateDialog goalId={10} onClose={vi.fn()} onGraduated={onGraduated} />);
    // 预览加载失败但确认按钮仍在（信号明细缺失不阻断确认流——后端守卫兜底）
    const btn = await screen.findByTestId("confirm-graduate");
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByTestId("graduate-error").textContent).toContain("毕业判据未全部满足"));
    expect(onGraduated).not.toHaveBeenCalled();
  });
});
