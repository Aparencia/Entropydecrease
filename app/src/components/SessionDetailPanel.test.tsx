// @vitest-environment jsdom
/**
 * SessionDetailPanel.test.tsx — 拆件 A 的**安全网判据**（批 5 · T2 Step 1 · C9 逐字
 * 「无测试面的被拆文件先补行为级判据再拆」）。
 *
 * @ai-context: 该文件在批 5 开工时**无同名测试、全仓 0 处 import**（计划 §Task 2 的
 *              实测结论）⇒ 后面的「行为等价抽件」没有任何既有判据可依靠。本文件钉住
 *              四条**用户可见**的面板行为，抽件前后都必须逐字绿：
 *              P1 默认视图是原文（每段一个 `seg-{sessionId}-{segId}` 锚点，计数 ==
 *                 `segments.length`；**含会话切换复位** `:64` 的 `useEffect` —— 变异
 *                 M1 实测证明：只把 `useState` 初值改成 `preview` **不会红**，因为该
 *                 effect 在挂载后立刻复位，把初值变异吞掉了 ⇒ 「默认视图是原文」这条
 *                 行为的真身在 effect，不在初值）· P2 切换器存在且互斥切换（本任务仍是互斥渲染；
 *                 T10 会改成「默认视图常驻」）· P3 web 会话早退（无切换器、走
 *                 `WebArticleView`）· P4 工作台深链（`autoRefineTaskId` 到达即切预览，
 *                 且 `onAutoTaskConsumed` **恰 1 次**）。
 *
 * @ai-context 仪器边界：只 mock **模块边界**（Tauri IPC 两模块 + 五个带 IPC 的子组件 +
 *              `SessionScreenCards`），**不 mock `useSessionDetailData`** —— 真 hook 在
 *              `viewMode` 变化时重渲、懒触发判定是真代码路径，正是 P1/P2 要覆盖的东西。
 *              `invoke` 一律 reject（文案含 "not mocked"）：真 hook 的三条取数走 catch
 *              降级分支（`quality` 保持 null、`glossary` 变 `[]`），**渲染结果确定且无
 *              异步 setState 竞态**（resolve 型桩会在用例结束后才 setState ⇒ act 噪声）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { SessionDetail } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));

// 带 IPC / 重渲染面的子组件（各自有测试或不属本任务判据）→ 冻成薄桩
vi.mock("./NotePreviewView", () => ({
  default: () => <div data-testid="note-preview-view" />,
}));
vi.mock("./WebArticleView", () => ({
  default: () => <div data-testid="web-article-view" />,
}));
vi.mock("./ImageGallery", () => ({ default: () => <div data-testid="image-gallery" /> }));
vi.mock("./SecondPassPanel", () => ({
  default: () => <div data-testid="second-pass-panel" />,
}));
vi.mock("./ProofreadPanel", () => ({
  default: () => <div data-testid="proofread-panel" />,
}));
vi.mock("./session-detail/SessionScreenCards", () => ({
  default: () => <div data-testid="screen-cards" />,
}));

import SessionDetailPanel from "./SessionDetailPanel";

function detailOf(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: 1042,
      title: "化学反应速率",
      source_window: "Chrome",
      started_at: 1_700_000_000_000,
      ended_at: 1_700_000_600_000,
      status: "finished",
      kind: null,
    },
    segments: [
      { id: 7001, session_id: 1042, start_ms: 0, end_ms: 2500, text: "第一段讲述", source: "subtitle", confidence: 0.9 },
      { id: 7002, session_id: 1042, start_ms: 2500, end_ms: 5000, text: "第二段讲述", source: "asr", confidence: 0.7 },
      { id: 7003, session_id: 1042, start_ms: 5000, end_ms: 8000, text: "第三段讲述", source: "fused", confidence: 0.8 },
    ],
    ocr_blocks: [],
    screens: [],
    ...over,
  };
}

const noop = () => {};
function propsOf(detail: SessionDetail, over: Record<string, unknown> = {}) {
  return {
    detail,
    fusing: false,
    degradedBanner: null,
    onToNote: noop,
    onRemove: noop,
    onRefreshDetail: noop,
    ...over,
  };
}

/** 段锚点集合：`seg-{sessionId}-{segId}` 形态的 id（屏卡锚点是 `ocr-…`，天然不混） */
const segAnchors = (): string[] =>
  [...document.querySelectorAll("[id^='seg-']")].map((el) => el.id).sort();

const findButton = (label: string): HTMLButtonElement => {
  const hit = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!hit) throw new Error(`找不到文案含「${label}」的按钮：实测 ${[...document.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return hit as HTMLButtonElement;
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => Promise.reject(new Error(`invoke not mocked: ${cmd}`)));
});
afterEach(() => cleanup());

describe("SessionDetailPanel · 安全网（批 5 T2 Step 1；抽件前后逐字不变）", () => {
  it("P1 默认视图是原文：不点任何按钮，每段都在 DOM 里；切到预览后换会话 ⇒ 复位回原文", () => {
    const detail = detailOf();
    const view = render(<SessionDetailPanel {...propsOf(detail)} />);
    expect(segAnchors()).toEqual(["seg-1042-7001", "seg-1042-7002", "seg-1042-7003"]);
    expect(document.querySelectorAll("[id^='seg-']")).toHaveLength(detail.segments.length);
    // 原文视图的正文文本逐字在 DOM 里（不是"渲染不报错"这种弱判据）
    for (const seg of detail.segments) {
      expect(document.body.textContent).toContain(seg.text);
    }
    // `:64` 的复位 effect（裁决 D1：viewMode 状态留面板）—— 没有它，用户切到预览后
    // 换会话会停在预览视图（原文不默认可见）。这条是「默认视图是原文」的另一半。
    fireEvent.click(findButton("笔记预览"));
    expect(document.querySelector('[data-testid="note-preview-view"]')).not.toBeNull();
    const next = detailOf();
    next.session.id = 2043;
    next.segments = [{ id: 9001, session_id: 2043, start_ms: 0, end_ms: 1200, text: "新会话第一段", source: "asr", confidence: 0.5 }];
    view.rerender(<SessionDetailPanel {...propsOf(next)} />);
    expect(segAnchors()).toEqual(["seg-2043-9001"]);
  });

  it("P2 切换器存在且会切：点「笔记预览」⇒ NotePreviewView 渲染 且 原文区不再可见（本任务仍是互斥渲染）", () => {
    render(<SessionDetailPanel {...propsOf(detailOf())} />);
    expect(document.querySelector('[data-testid="note-preview-view"]')).toBeNull();
    expect(document.querySelectorAll("[id^='seg-']").length).toBeGreaterThan(0);

    fireEvent.click(findButton("笔记预览"));

    expect(document.querySelector('[data-testid="note-preview-view"]')).not.toBeNull();
    expect(document.querySelectorAll("[id^='seg-']")).toHaveLength(0);
    // 切回原文：锚点全回来（互斥渲染的两个方向都判）
    fireEvent.click(findButton("原料视图"));
    expect(segAnchors()).toEqual(["seg-1042-7001", "seg-1042-7002", "seg-1042-7003"]);
  });

  it("P3 web 会话早退：kind==='web' ⇒ 渲染 WebArticleView 且**切换器 0 个**（也没有段锚点）", () => {
    const detail = detailOf();
    detail.session.kind = "web";
    render(<SessionDetailPanel {...propsOf(detail)} />);
    expect(document.querySelector('[data-testid="web-article-view"]')).not.toBeNull();
    expect(findButtonSafe("笔记预览")).toBeNull();
    expect(findButtonSafe("原料视图")).toBeNull();
    expect(document.querySelectorAll("[id^='seg-']")).toHaveLength(0);
  });

  it("P4 工作台深链：autoRefineTaskId 非空 ⇒ 切到 preview 且 onAutoTaskConsumed **恰 1 次**", () => {
    const onAutoTaskConsumed = vi.fn();
    render(<SessionDetailPanel {...propsOf(detailOf(), { autoRefineTaskId: 88, onAutoTaskConsumed })} />);
    expect(document.querySelector('[data-testid="note-preview-view"]')).not.toBeNull();
    expect(document.querySelectorAll("[id^='seg-']")).toHaveLength(0);
    expect(onAutoTaskConsumed).toHaveBeenCalledTimes(1);
  });
});

/** P3 用：找不到按钮时返回 null（与 `findButton` 的"找不到即抛"刻意分开） */
function findButtonSafe(label: string): HTMLButtonElement | null {
  return ([...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined) ?? null;
}
