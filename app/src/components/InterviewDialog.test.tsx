// @vitest-environment jsdom
/**
 * InterviewDialog.test.tsx — 访谈对话框流程测试（v0.18.0 验收 1/5）。
 *
 * @ai-context: 覆盖双展开（快速=名称+期限；访谈=四步+宣言）、必答拦截、
 *              折叠跳过、宣言草案预填与删改、创建契约（invoke 参数形态）。
 *              invoke 全 mock（不触碰真实后端）。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewDialog from "./InterviewDialog";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const drafts = [
  { title: "基础入门：掌握核心概念并做完配套练习", dueWeeks: 4 },
  { title: "应用练习：动手完成一个完整实例并记录应用", dueWeeks: 8 },
  { title: "项目实战：独立完成一个小项目并复盘", dueWeeks: 12 },
];

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
    if (cmd === "suggest_goal_milestones") return drafts;
    if (cmd === "create_goal") {
      return { id: 10, name: (args as { input: { name: string } }).input.name, status: "active", domainTag: null, horizonEnd: null, successCriteriaJson: "{}", intentJson: "{}", createdAt: 0, completedAt: null, updatedAt: 0 };
    }
    throw new Error(`unexpected invoke: ${cmd}`);
  });
});

afterEach(() => cleanup());

describe("InterviewDialog 快速模式（同一组件双展开）", () => {
  it("只展开名称+期限，两步确认创建（tier/scenario 缺省=默认档）", async () => {
    const onCreated = vi.fn();
    render(<InterviewDialog mode="quick" groups={[]} onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.queryByTestId("next-step")).toBeNull();
    fireEvent.change(screen.getByTestId("quick-name"), { target: { value: "学乐理" } });
    fireEvent.click(screen.getByTestId("confirm-create"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create_goal", {
      input: { name: "学乐理", horizon: "3m", groupIds: [], milestones: [] },
    }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("名称为空时创建按钮禁用", () => {
    render(<InterviewDialog mode="quick" groups={[]} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect((screen.getByTestId("confirm-create") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("InterviewDialog 访谈模式（四步 + 宣言）", () => {
  const renderInterview = (onCreated = vi.fn()) =>
    render(<InterviewDialog mode="interview" groups={[{ id: 3, name: "Python 组" }]} onClose={vi.fn()} onCreated={onCreated} />);

  it("第 1 问必答：空场景点下一步被拦截", () => {
    renderInterview();
    fireEvent.click(screen.getByTestId("next-step"));
    expect(screen.getByTestId("dialog-error").textContent).toContain("用它做什么");
    expect(screen.getByTestId("scenario-input")).toBeTruthy();
  });

  it("第 3 问必答：判据档位未选被拦截", () => {
    renderInterview();
    fireEvent.change(screen.getByTestId("scenario-input"), { target: { value: "工作自动化" } });
    fireEvent.click(screen.getByTestId("next-step"));
    fireEvent.click(screen.getByTestId("next-step")); // 进入第 3 步
    fireEvent.click(screen.getByTestId("next-step")); // 未选 tier → 拦截
    expect(screen.getByTestId("dialog-error").textContent).toContain("必答");
  });

  it("第 2/4 问可跳过（折叠可选路径）", async () => {
    renderInterview();
    fireEvent.change(screen.getByTestId("scenario-input"), { target: { value: "考试通关" } });
    fireEvent.click(screen.getByTestId("next-step"));
    // 第 2 步：跳过
    fireEvent.click(screen.getByTestId("skip-step"));
    // 第 3 步：选 tier + 之后跳过第 4 步
    fireEvent.click(screen.getByTestId("tier-chip-hands_on"));
    fireEvent.click(screen.getByTestId("next-step"));
    fireEvent.click(screen.getByTestId("skip-step"));
    // 宣言页：草案加载（skip 后 level/commitment 为空 → 默认节奏）
    await waitFor(() => expect(screen.getByTestId("declaration-preview").textContent).toContain("考试通关"));
    expect(screen.getByTestId("draft-title-0")).toBeTruthy();
  });

  it("宣言页：草案预填可删改，创建契约携带删改后草案", async () => {
    const onCreated = vi.fn();
    render(<InterviewDialog mode="interview" groups={[{ id: 3, name: "Python 组" }]} onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByTestId("interview-name"), { target: { value: "学会 Python" } });
    fireEvent.change(screen.getByTestId("scenario-input"), { target: { value: "独立项目" } });
    fireEvent.click(screen.getByTestId("next-step"));
    fireEvent.click(screen.getByTestId("skip-step")); // 现状跳过
    fireEvent.click(screen.getByTestId("tier-chip-solo_project"));
    fireEvent.click(screen.getByTestId("next-step"));
    fireEvent.click(screen.getByTestId("skip-step")); // 素材跳过
    await waitFor(() => expect(screen.getByTestId("draft-title-0")).toBeTruthy());
    // 删掉第一条 + 改第二条标题
    fireEvent.click(screen.getByTestId("draft-remove-0"));
    fireEvent.change(screen.getByTestId("draft-title-0"), { target: { value: "应用：自己写一个小脚本" } });
    fireEvent.click(screen.getByTestId("confirm-create"));
    await waitFor(() => {
      const call = invokeMock.mock.calls.find((c) => c[0] === "create_goal");
      expect(call).toBeTruthy();
      const milestones = (call![1] as { input: { milestones: { title: string; dueWeeks: number }[] } }).input.milestones;
      expect(milestones).toHaveLength(2);
      expect(milestones[0].title).toBe("应用：自己写一个小脚本");
      expect(milestones[0].dueWeeks).toBe(8);
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
