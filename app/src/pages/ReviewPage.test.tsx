// @vitest-environment jsdom
/**
 * ReviewPage.test.tsx — 复习域页关键路径（v0.20.10 批 5 独立顶层页）。
 *
 * @ai-context: 覆盖：组过滤器 chips（全部+各组含到期数）、开始复习挂载会话
 *              （list_due_cards 按范围）、空态引导、active 门控切回重载
 *              （TD-004——闪卡域无事件总线）、跨页深链预选（focusGroupId 消费
 *              即清空）。invoke 全 mock（list_note_groups/count_due_cards/
 *              list_due_cards）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Flashcard, NoteGroup } from "../types/notes";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ReviewPage from "./ReviewPage";

const groupA: NoteGroup = {
  id: 1, name: "化妆课 A", terrain: "container", kind: "course", domainTag: null,
  source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
  noteCount: 3, createdAt: 0, updatedAt: 0,
};
const groupB: NoteGroup = {
  id: 2, name: "手账 B", terrain: "container", kind: "standalone", domainTag: null,
  source: "route", seriesKey: null, routeReason: null, routeOverridden: 0,
  noteCount: 1, createdAt: 0, updatedAt: 0,
};
const GROUPS = [groupA, groupB];
/** 到期分布：A=3、B=1、全量=4 */
const DUE_BY_ID: Record<number, number> = { 1: 3, 2: 1 };

function card(id: number, front: string): Flashcard {
  return { id, groupId: 1, noteId: null, fragmentId: null, front, back: "b", kind: "fact", stateJson: "", dueAt: 0, createdAt: 0, intervalDays: 0 };
}

/** count_due_cards 调用次数（含全量+逐组）——active 门控/退出会话重载断言用 */
const dueCalls = () => invokeMock.mock.calls.filter((c) => c[0] === "count_due_cards").length;

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_note_groups": return GROUPS;
      case "count_due_cards": return args?.groupId == null ? 4 : (DUE_BY_ID[Number(args.groupId)] ?? 0);
      case "list_due_cards":
        return args?.groupId == null
          ? [card(1, "全量卡"), card(2, "B 卡")]
          : [card(Number(args.groupId), `组卡 ${args.groupId}`)];
      case "review_card": return true;
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("ReviewPage 总览与组过滤器", () => {
  it("打开即见到期数：全部 chip 与有到期组的 chip（含数），开始按钮按范围可用", async () => {
    render(<ReviewPage active={false} />);
    // 全量=4（组到期和）；组 chips 只列到期>0 的组
    expect(await screen.findByTestId("review-scope-all").then((el) => el.textContent)).toContain("4");
    expect(screen.getByText("化妆课 A（3）")).toBeTruthy();
    expect(screen.getByText("手账 B（1）")).toBeTruthy();
    const start = screen.getByTestId("review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain("4");
  });

  it("切组过滤 → 开始复习按该组范围挂载会话（list_due_cards 组过滤契约）", async () => {
    render(<ReviewPage active={false} />);
    fireEvent.click(await screen.findByTestId("review-scope-1"));
    const start = screen.getByTestId("review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain("3");
    fireEvent.click(start);
    // 会话面板挂载：组过滤 + limit=200（后端全量批）
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_due_cards", { groupId: 1, limit: 200 }));
    expect(screen.getByText("🎴 复习 · 化妆课 A")).toBeTruthy();
    expect(await screen.findByText("组卡 1")).toBeTruthy();
  });

  it("会话退出回总览并重载到期统计（评分改变到期分布）", async () => {
    render(<ReviewPage active={false} />);
    await waitFor(() => expect(dueCalls()).toBeGreaterThanOrEqual(3));
    fireEvent.click(screen.getByTestId("review-start"));
    await screen.findByTestId("session-exit");
    const before = dueCalls();
    fireEvent.click(screen.getByTestId("session-exit"));
    await waitFor(() => expect(dueCalls()).toBeGreaterThan(before));
    expect(await screen.findByTestId("review-scope-all")).toBeTruthy();
  });

  it("全量零到期 → 空态引导（生成入口指引文案），开始按钮禁用", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_note_groups") return GROUPS;
      if (cmd === "count_due_cards") return 0;
      if (cmd === "list_due_cards") return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    render(<ReviewPage active={false} />);
    const empty = await screen.findByTestId("review-empty");
    expect(empty.textContent).toContain("当前没有到期卡片");
    expect(empty.textContent).toContain("生成闪卡");
    expect((screen.getByTestId("review-start") as HTMLButtonElement).disabled).toBe(true);
  });

  it("已选组零到期但全量>0 → 引导换范围（不误报全局空态；深链可达零到期组）", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_note_groups") return GROUPS;
      if (cmd === "count_due_cards") return args?.groupId == null ? 1 : (Number(args.groupId) === 1 ? 1 : 0);
      if (cmd === "list_due_cards") return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    // 组 2 到期 0——chips 不列（到期>0 才可作范围），深链仍可达并显示范围空态
    render(<ReviewPage active={false} focusGroupId={2} />);
    const empty = await screen.findByTestId("review-empty");
    // 标题内嵌 scopeLabel 组名（审查 P3-5b：零到期深链只预选不弹窗，无组名时
    // 用户看不出预选到了哪一组）
    expect(empty.textContent).toContain("「手账 B」组当前没有到期卡片");
    expect(empty.textContent).toContain("其余组共 1 张到期");
  });
});

describe("ReviewPage 刷新与深链", () => {
  it("active 门控：首挂拉取一次，false→true 切回重载（TD-004 补偿隐藏期变更）", async () => {
    const { rerender } = render(<ReviewPage active={false} />);
    await waitFor(() => expect(dueCalls()).toBeGreaterThanOrEqual(3));
    const afterMount = dueCalls();
    rerender(<ReviewPage active={true} />);
    await waitFor(() => expect(dueCalls()).toBeGreaterThan(afterMount));
    // true→false 无动作（停留无轮询）
    const before = dueCalls();
    rerender(<ReviewPage active={false} />);
    rerender(<ReviewPage active={false} />);
    expect(dueCalls()).toBe(before);
  });

  it("跨页深链：focusGroupId 预选组并消费清空（重复深链可再触发）", async () => {
    const onConsumed = vi.fn();
    const { rerender } = render(
      <ReviewPage active={false} focusGroupId={2} onFocusGroupConsumed={onConsumed} />,
    );
    // 预选 chip B——开始按钮按 B 范围（1 张）可用
    await waitFor(() => expect(onConsumed).toHaveBeenCalledTimes(1));
    await screen.findByTestId("review-scope-2");
    const start = screen.getByTestId("review-start") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain("1");
    // 消费后（父层清空 → null）无重复预选副作用
    rerender(<ReviewPage active={false} focusGroupId={null} onFocusGroupConsumed={onConsumed} />);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("深链到达时进行中会话被退出（新意图优先）并预选新组", async () => {
    const { rerender } = render(<ReviewPage active={false} />);
    // 先在全量范围开会话
    fireEvent.click(await screen.findByTestId("review-start"));
    await screen.findByTestId("session-exit");
    const before = dueCalls();
    // 深链到组 2：会话退出回总览 + 组 2 预选——退出与手动同一出口（token++
    // 重载到期统计，审查 P3-5a：裸清 session 会残留会话前的过期统计）
    rerender(<ReviewPage active={false} focusGroupId={2} />);
    await waitFor(() => expect(screen.queryByTestId("session-exit")).toBeNull());
    await waitFor(() => expect(dueCalls()).toBeGreaterThan(before));
    await screen.findByTestId("review-scope-all");
    const start = screen.getByTestId("review-start") as HTMLButtonElement;
    expect(start.textContent).toContain("1");
  });
});

describe("ReviewPage 到期刻度（批 6 T21 · R5.4 承载面）", () => {
  it("刻度接入且与既有文案同屏：段数 == 当前范围数（逐序）· 切范围即随 scopeDue 变短", async () => {
    render(<ReviewPage active={false} />);
    const scale = await screen.findByTestId("review-due-scale");
    expect(scale.getAttribute("data-due")).toBe("4");
    expect([...scale.querySelectorAll("[data-tick]")].map((el) => el.getAttribute("data-tick"))).toEqual([
      "0", "1", "2", "3",
    ]);
    // V4 只增不减：既有「共 N 张到期」文案逐字仍在
    expect(screen.getByTestId("review-total-due").textContent).toBe("共 4 张到期");
    // 切到组 1（到期 3）⇒ 刻度长度随当前范围变（同源 scopeDue，未新增任何 IPC）
    fireEvent.click(screen.getByTestId("review-scope-1"));
    await waitFor(() => expect(screen.getByTestId("review-due-scale").getAttribute("data-due")).toBe("3"));
    expect(dueCalls()).toBe(3);
  });
});
