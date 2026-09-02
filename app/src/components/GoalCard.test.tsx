// @vitest-environment jsdom
/**
 * GoalCard.test.tsx — 目标卡状态徽标测试（v0.18.0 验收 2：单行折叠 + 徽标）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GoalCard from "./GoalCard";
import type { Goal, GoalCardView } from "../types/goals";

function card(partial: Partial<Goal> & { id: number }, ready = false): GoalCardView {
  const goal: Goal = {
    name: "学会 Python", domainTag: null, status: "active", horizonEnd: null,
    successCriteriaJson: "{}", intentJson: "{}", createdAt: 0, completedAt: null,
    updatedAt: 0, ...partial,
  };
  return { goal, statement: "50% · 里程碑 1/2", percent: 50, milestoneDone: 1, milestoneTotal: 2, ready };
}

afterEach(() => cleanup());

describe("GoalCard 状态徽标", () => {
  it("进行中：显示状态徽标 + 一句话进度，无可毕业徽标", () => {
    render(<GoalCard card={card({ id: 1 }, false)} onClick={() => {}} />);
    expect(screen.getByTestId("goal-status-badge").textContent).toBe("进行中");
    expect(screen.getByText("50% · 里程碑 1/2")).toBeTruthy();
    expect(screen.queryByTestId("goal-ready-badge")).toBeNull();
  });

  it("可毕业：active + ready → 🎓 徽标亮起", () => {
    render(<GoalCard card={card({ id: 2 }, true)} onClick={() => {}} />);
    expect(screen.getByTestId("goal-ready-badge").textContent).toContain("可毕业");
  });

  it("已毕业：状态徽标 + 完成日期，不显示可毕业", () => {
    const c = card({ id: 3, status: "graduated", completedAt: 1753084800 }, true);
    render(<GoalCard card={c} onClick={() => {}} />);
    expect(screen.getByTestId("goal-status-badge").textContent).toBe("已毕业");
    expect(screen.getByText("2025-07-21")).toBeTruthy();
    expect(screen.queryByTestId("goal-ready-badge")).toBeNull();
  });

  it("已暂停与已放弃：文案正确（零叙事元素——无排名/无激励话术）", () => {
    const { unmount } = render(<GoalCard card={card({ id: 4, status: "paused" })} onClick={() => {}} />);
    expect(screen.getByTestId("goal-status-badge").textContent).toBe("已暂停");
    unmount();
    render(<GoalCard card={card({ id: 5, status: "abandoned" })} onClick={() => {}} />);
    expect(screen.getByTestId("goal-status-badge").textContent).toBe("已放弃");
  });

  it("点击回调：整卡可点（列表是导航）", () => {
    let clicked = false;
    render(<GoalCard card={card({ id: 6 })} onClick={() => { clicked = true; }} />);
    screen.getByTestId("goal-card").click();
    expect(clicked).toBe(true);
  });
});
