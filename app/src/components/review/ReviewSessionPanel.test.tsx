// @vitest-environment jsdom
/**
 * ReviewSessionPanel.test.tsx — 复习会话面板关键路径（v0.20.10 批 5 全页化）。
 *
 * @ai-context: 由 ReviewSessionOverlay 迁移（模态→页面主体形态）；复习流语义
 *              不变：front→回忆完成→back→四档评分（review_card）→队列推进→
 *              完成收尾回总览。invoke 全 mock（list_due_cards/review_card）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Flashcard } from "../../types/notes";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import ReviewSessionPanel from "./ReviewSessionPanel";
import { intervalToScale } from "./useScaleGrowth";

function card(id: number, front: string, back: string, kind = "fact"): Flashcard {
  return {
    id, groupId: 1, noteId: null, fragmentId: null, front, back,
    kind, stateJson: "", dueAt: 0, createdAt: 0, intervalDays: 0,
  };
}

const DUE_CARDS = [card(11, "隔离霜作用", "打底隔离彩妆与污染", "fact"), card(12, "FSRS 是什么", "自由间隔重复调度", "fact")];

function renderPanel(overrides: Partial<Parameters<typeof ReviewSessionPanel>[0]> = {}) {
  const props = {
    groupId: null, groupName: "全部组", onExit: vi.fn(),
    ...overrides,
  };
  return { onExit: props.onExit, ...render(<ReviewSessionPanel {...props} />) };
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_due_cards": return DUE_CARDS;
      case "review_card": return true;
      default:
        throw new Error(`unexpected: ${cmd}`);
    }
  });
});

afterEach(() => cleanup());

describe("ReviewSessionPanel 复习流", () => {
  it("挂载即拉取到期队列（limit=200 后端全量批）；front→回忆完成→back 呈现", async () => {
    renderPanel();
    expect(invokeMock).toHaveBeenCalledWith("list_due_cards", { groupId: null, limit: 200 });
    // 首卡 front 线索 + 进度
    expect(await screen.findByText("隔离霜作用")).toBeTruthy();
    expect(screen.getByTestId("session-progress").textContent).toBe("1/2");
    // back 默认隐藏——回忆完成后展开
    expect(screen.queryByText("打底隔离彩妆与污染")).toBeNull();
    fireEvent.click(screen.getByText("回忆完成 · 查看答案"));
    expect(await screen.findByText("打底隔离彩妆与污染")).toBeTruthy();
  });

  it("四档评分调 review_card 推进队列；评分完两卡进入完成态并可回总览", async () => {
    const { onExit } = renderPanel();
    fireEvent.click(await screen.findByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("忘了"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("review_card", { cardId: 11, rating: "again" }));
    // 队列推进到第二张
    expect(await screen.findByText("FSRS 是什么")).toBeTruthy();
    expect(screen.getByTestId("session-progress").textContent).toBe("2/2");
    // 第二张评分 → 完成收尾
    fireEvent.click(screen.getByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("记得"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("review_card", { cardId: 12, rating: "good" }));
    expect(await screen.findByText("本轮复习完成：2 张卡片")).toBeTruthy();
    fireEvent.click(screen.getByTestId("session-back-overview"));
    expect(onExit).toHaveBeenCalled();
  });

  it("空队列 → 完成态空态文案（防御性收尾，不卡死）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_due_cards") return [];
      if (cmd === "review_card") return true;
      throw new Error(`unexpected: ${cmd}`);
    });
    renderPanel();
    expect(await screen.findByText("当前没有到期卡片")).toBeTruthy();
    expect(screen.getByTestId("session-back-overview")).toBeTruthy();
  });

  it("ESC 与头部「✕ 退出本轮」均触发 onExit（原模态语义延续）", async () => {
    const { onExit } = renderPanel();
    await screen.findByText("隔离霜作用");
    fireEvent.click(screen.getByTestId("session-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("评分返回值被接住：review_card 的精确 intervalDays 落到回执读数上（PB2 ①域——今天被整份丢弃）", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_due_cards") return [card(21, "隔离霜作用", "打底", "fact")];
      // 精确域：非整数天（整天粒度的行派生路径不可能给出这个值 —— 两个域必须可区分）
      if (cmd === "review_card") return { ...card(21, "隔离霜作用", "打底", "fact"), intervalDays: 12.5 };
      throw new Error(`unexpected: ${cmd}`);
    });
    renderPanel();
    // 评分前无回执（缺失 ≠ 0：不猜、不预先显示 0 天）
    expect(screen.queryByTestId("session-last-interval")).toBeNull();
    fireEvent.click(await screen.findByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("记得"));
    await waitFor(() =>
      expect(screen.getByTestId("session-last-interval").textContent).toBe("上一张下次间隔 12.5 天"),
    );
  });

  it("active=false（页面隐藏保活期）→ ESC 不退出会话；active=true 后 ESC 恢复生效（审查 P2-11）", async () => {
    const { onExit, rerender } = renderPanel({ active: false });
    await screen.findByText("隔离霜作用");
    // 隐藏期：别页 ESC 属他页语义，不得静默结束本会话
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).not.toHaveBeenCalled();
    // 切回可见 → 监听随 active 重新注册
    rerender(<ReviewSessionPanel groupId={null} groupName="全部组" active={true} onExit={onExit} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewSessionPanel · 刻度生长（批 6 T30 · §8.6 #4 · PB2 精确域）", () => {
  /** 生长刻度的**受控目标回声**（`DueScale` 根上的 `data-grow-to`）—— 由 `review_card` 的精确值换算 */
  const growToAttr = (): string | null =>
    screen.getByTestId("session-interval-scale").getAttribute("data-grow-to");
  const scaleTick = (): HTMLElement =>
    screen.getByTestId("session-interval-scale").querySelector("[data-tick]") as HTMLElement;
  /** 两张卡的队列 + 按 cardId 给不同的精确 `intervalDays`（模拟「记得 ⇒ 变长 / 忘了 ⇒ 回缩」） */
  const mockExact = (byCard: Readonly<Record<number, number>>): void => {
    invokeMock.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      const id = Number(args.cardId);
      if (cmd === "list_due_cards") return [card(41, "甲卡", "甲背"), card(42, "乙卡", "乙背")];
      if (cmd === "review_card") return { ...card(id, "卡", "背"), intervalDays: byCard[id] ?? 1 };
      throw new Error(`unexpected: ${cmd}`);
    });
  };

  it("R1 · 目标由精确 intervalDays 驱动（不是 due 计数）：返回 10 ⇒ data-grow-to == intervalToScale(10)", async () => {
    mockExact({ 41: 10, 42: 10 });
    renderPanel();
    // 评分前：没有精确值 ⇒ 零目标（不猜、不预置 0）
    expect(await screen.findByTestId("session-interval-scale")).toBeTruthy();
    expect(growToAttr()).toBeNull();
    expect(scaleTick().getAttribute("data-tier")).toBe("none");
    fireEvent.click(screen.getByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("记得"));
    await waitFor(() => expect(growToAttr()).toBe(String(intervalToScale(10))));
    expect(growToAttr(), "若目标由 due（=1）驱动，读数会等于 intervalToScale(1)").not.toBe(
      String(intervalToScale(1)),
    );
    expect(screen.getByTestId("session-interval-scale").getAttribute("data-granularity")).toBe("exact");
    expect(screen.getByTestId("session-interval-scale").getAttribute("data-due")).toBe("1");
    expect(scaleTick().getAttribute("data-interval"), "精确域：10 天（行派生的整天近似冒充不了它）").toBe("10");
    expect(scaleTick().getAttribute("title"), "精确域的标签不带「约…整天粒度」").toBe("第 1 段 · 10 天");
  });

  it("R2 · 答「忘了」⇒ 目标回缩（30 → 1：终值 < 起始值的 1/2，方向断言）", async () => {
    mockExact({ 41: 30, 42: 1 });
    renderPanel();
    fireEvent.click(await screen.findByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("记得"));
    await waitFor(() => expect(growToAttr()).toBe(String(intervalToScale(30))));
    const grown = Number(growToAttr());
    fireEvent.click(await screen.findByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("忘了"));
    await waitFor(() => expect(growToAttr()).toBe(String(intervalToScale(1))));
    const shrunk = Number(growToAttr());
    expect(shrunk, "防空真：两个目标必须不同").toBeLessThan(grown);
    expect(shrunk, "回缩方向：终值必须不到起始值的一半").toBeLessThan(grown / 2);
    expect(shrunk).toBeGreaterThan(0);
  });

  it("R3 · 缺 intervalDays（后端只回 true）⇒ 不生长、不抛、不猜（「缺失」≠「间隔为 0」）", async () => {
    renderPanel();
    fireEvent.click(await screen.findByText("回忆完成 · 查看答案"));
    fireEvent.click(screen.getByText("记得"));
    await waitFor(() => expect(screen.getByTestId("session-progress").textContent).toBe("2/2"));
    expect(growToAttr(), "缺字段 ⇒ 零目标（把它当 0 天就会把刻度清零）").toBeNull();
    expect(scaleTick().getAttribute("data-tier")).toBe("none");
    expect(screen.queryByTestId("session-last-interval")).toBeNull();
  });
});
