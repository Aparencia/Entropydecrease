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

function card(id: number, front: string, back: string, kind = "fact"): Flashcard {
  return {
    id, groupId: 1, noteId: null, fragmentId: null, front, back,
    kind, stateJson: "", dueAt: 0, createdAt: 0,
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
});
