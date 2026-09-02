// @vitest-environment jsdom
/**
 * GoalPlanApprovalDialog.test.tsx — 草案确认流关键交互（v0.18.2 审查修复回归：
 * 标题编辑不回弹（展开顺序）/勾选排除/确认提交契约）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GoalPlanApprovalDialog from "./GoalPlanApprovalDialog";
import type { GoalPlanView } from "../types/goals";

const view: GoalPlanView = {
  proposal: {
    milestones: [
      { title: "基础入门", dueWeeks: 4, criteriaType: "manual", refGroupId: null, note: "" },
      { title: "项目实战", dueWeeks: 12, criteriaType: "group_settled", refGroupId: 5, note: "" },
    ],
    groups: [{ groupId: 5, reason: "素材命中" }],
    systems: [{ action: "create", systemId: null, name: "Python 基础", coreQuestion: "怎么把语法变成工具？", domainEntries: ["语言基础"], concepts: [], reason: "" }],
    weeklyContract: { targetDays: 3, targetCards: 20 },
    summary: "8 周从基础到项目",
  },
  dropped: { droppedMilestones: [], droppedGroups: [], droppedSystems: [] },
  honestNote: "",
  costYuan: 0.1,
  model: "m",
};

afterEach(() => cleanup());

describe("GoalPlanApprovalDialog 确认流", () => {
  it("标题编辑不回弹（仅修改 draft 对应项）", () => {
    render(<GoalPlanApprovalDialog view={view} onConfirm={vi.fn()} onClose={vi.fn()} onUseRules={vi.fn()} />);
    const input = screen.getByTestId("plan-milestone-0") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "修改后的标题" } });
    expect((screen.getByTestId("plan-milestone-0") as HTMLInputElement).value).toBe("修改后的标题");
    expect((screen.getByTestId("plan-milestone-1") as HTMLInputElement).value).toBe("项目实战");
  });

  it("取消勾选后确认提交排除该项", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<GoalPlanApprovalDialog view={view} onConfirm={onConfirm} onClose={vi.fn()} onUseRules={vi.fn()} />);
    // 取消第 2 条里程碑
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByTestId("plan-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const req = onConfirm.mock.calls[0][0];
    expect(req.milestones).toHaveLength(1);
    expect(req.milestones[0].title).toBe("基础入门");
    expect(req.weeklyContract.targetDays).toBe(3);
  });

  it("「改用规则草案」回调可用（不关闭——调用方决定）", () => {
    const onUseRules = vi.fn();
    render(<GoalPlanApprovalDialog view={view} onConfirm={vi.fn()} onClose={vi.fn()} onUseRules={onUseRules} />);
    fireEvent.click(screen.getByText("改用规则草案"));
    expect(onUseRules).toHaveBeenCalledTimes(1);
  });
});
