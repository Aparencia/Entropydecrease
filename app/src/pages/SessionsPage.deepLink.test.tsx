// @vitest-environment jsdom
/**
 * SessionsPage.deepLink.test.tsx — `[[ts:ms]]` 深链**落到会话页之后的那一跳**（批 7 T17）。
 *
 * @ai_context 这条判据补的是 §C27.4 的 M3（「`focusSeekMs` 链今天**是死的**」）在**页面层**的缺口：
 *   `App.goSessions(sessionId, ms)` 写入的 ms 载体要经 `SessionsPage` →（配对目标会话）→
 *   `SessionDetailPanel` → `SessionViewHost` → 三轨视图，最终**可见为播放头**。
 *   本件用**状态级/命令级代理**判它（真机 WebView2 冒烟由用户裁决跳过 ⇒ §C6.4）：
 *   ① `get_session_detail` 被以目标 id 调用；② 三轨视图出现且播放头 `data-ms` == 深链的 ms；
 *   ③ 消费回调恰 1 次（App 靠它复位焦点）；④ `localStorage` 的视图记忆**逐字未变**（§C11.2）。
 *   🔴 逐字登记：**这是代理判据**，不证明真机上「视频真的跳到了那一帧」（定位精度还受音频对齐
 *   块粒度 ±200 ms 限制）。
 * @ai_context 第二条用例钉**配对**（`SessionsPage` 的 `seekFor`）：面板在 `detail` 到达前仍显示
 *   上一个会话 ⇒ 若把 ms 无条件下传，它会被旧会话的面板消费掉、换到新会话时焦点已清空
 *   （深链静默失效）。该用例把「旧会话在位 + 新会话详情挂起」这一瞬态**构造出来**。
 * 仪器边界：只 mock 模块边界（三个 Tauri 模块）；真 `SessionsPage` + 真 `SessionDetailPanel` +
 *   真 `SessionViewHost` + 真惰性三轨视图（与 `SessionDetailPanel.test.tsx` 同一形态）。
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn(() => Promise.resolve(true)) }));

import SessionsPage from "./SessionsPage";

const noop = (): void => {};
const MEMORY = "view:default:session";

function detailOf(id: number, title: string): SessionDetail {
  return {
    session: { id, title, source_window: "Chrome", started_at: 0, ended_at: 8000, status: "finished", kind: null },
    segments: [{ id: id * 10 + 1, session_id: id, start_ms: 0, end_ms: 4000, text: `${title} 第一段`, source: "asr", confidence: 0.9 }],
    ocr_blocks: [],
    screens: [],
  };
}

/** 详情响应的可控延迟（第二条用例要「新会话详情仍在飞」这一瞬态） */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function install(details: Record<number, SessionDetail | Promise<SessionDetail>>): void {
  invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    const id = args?.id as number | undefined;
    if (cmd === "get_session_detail") {
      const hit = id === undefined ? undefined : details[id];
      return hit === undefined ? Promise.reject(new Error("未登记的会话")) : Promise.resolve(hit);
    }
    if (cmd === "session_audio_path") return Promise.resolve({ path: "C:/tmp/a.wav", aligned: true, durationMs: 8000 });
    if (cmd === "get_feature_flags") return Promise.resolve({ feedCapture: true });
    if (cmd.startsWith("list_") || cmd.startsWith("note_versions")) return Promise.resolve([]);
    return Promise.reject(new Error(`invoke not mocked: ${cmd}`));
  });
}

const snapshot = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k !== null) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
};
const playheads = (c: HTMLElement): (string | null)[] =>
  [...c.querySelectorAll('[data-testid="session-timerail-playhead"]')].map((el) => el.getAttribute("data-ms"));

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SessionsPage · [[ts:ms]] 深链（T17 · C27.4 的 M3 的页面层闭合）", () => {
  it("① 深链到达：目标会话被打开 ∧ 视图切三轨 ∧ 播放头 = ms ∧ 消费恰 1 次 ∧ 视图记忆未变", async () => {
    install({ 1042: detailOf(1042, "会话甲") });
    localStorage.setItem(MEMORY, "proof"); // 用户既有记忆：深链**不许**改它
    const onFocusSeekConsumed = vi.fn();
    const { container } = render(
      <SessionsPage
        active
        focusSessionId={1042}
        focusSeekMs={{ ms: 5000, key: 1 }}
        onFocusSeekConsumed={onFocusSeekConsumed}
        onOpenNote={noop}
      />,
    );
    await screen.findByTestId("session-tritrack-view");
    expect(invokeMock.mock.calls.filter((c) => c[0] === "get_session_detail"), "深链必须拉目标会话详情")
      .toEqual([["get_session_detail", { id: 1042 }]]);
    expect(playheads(container), "深链的 ms 没落到播放头上（「定位到 ms」不可感知）").toEqual(["5000"]);
    expect(onFocusSeekConsumed, "消费回调必须恰一次（App 靠它复位焦点，防陈旧 ms 复触发）").toHaveBeenCalledTimes(1);
    // 视图记忆是**逐字未变**（本页的列布局键 `layout:*` 不属视图记忆 ⇒ 只钉记忆前缀这一个面）
    expect(localStorage.getItem(MEMORY), "一次深链把用户的默认视图改掉了（§C11.2 禁止持久化）").toBe("proof");
    expect(Object.keys(snapshot()).filter((k) => k.startsWith("view:default:")), "深链不得新增视图记忆键")
      .toEqual([MEMORY]);
  });

  it("② 配对：新会话详情仍在飞时，ms **不被**上一个会话的面板消费；到达后才消费恰 1 次", async () => {
    const pending = deferred<SessionDetail>();
    install({ 1042: detailOf(1042, "会话甲"), 2043: pending.promise });
    const onFocusSeekConsumed = vi.fn();
    const view = render(
      <SessionsPage active focusSessionId={1042} onFocusSeekConsumed={onFocusSeekConsumed} onOpenNote={noop} />,
    );
    await screen.findByText("会话甲 第一段"); // 旧会话的面板已就位
    view.rerender(
      <SessionsPage
        active
        focusSessionId={2043}
        focusSeekMs={{ ms: 5000, key: 2 }}
        onFocusSeekConsumed={onFocusSeekConsumed}
        onOpenNote={noop}
      />,
    );
    await act(async () => {});
    expect(onFocusSeekConsumed, "目标会话还没到达就消费了 ms（换到新会话时焦点已清空 ⇒ 深链静默失效）").toHaveBeenCalledTimes(0);
    expect(screen.queryByTestId("session-tritrack-view"), "ms 把**旧**会话的视图切走了").toBeNull();

    await act(async () => {
      pending.resolve(detailOf(2043, "会话乙"));
    });
    await screen.findByTestId("session-tritrack-view");
    expect(onFocusSeekConsumed).toHaveBeenCalledTimes(1);
    expect(playheads(view.container)).toEqual(["5000"]);
  });
});
