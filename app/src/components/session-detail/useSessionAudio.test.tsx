// @vitest-environment jsdom
/**
 * useSessionAudio.test.tsx — 批 6 T24 的**过桥判据面**：音频引用的唯一取数点 + 唯一 URL 构造点。
 *
 * @ai-context 被测对象 = 容器侧的**桥**：`invoke("session_audio_path")` → `convertFileSrc(path)`
 *   → `SessionAudioState`。jsdom 里 `convertFileSrc` **不存在**（它是 `window.__TAURI_INTERNALS__`
 *   的方法，见 `@tauri-apps/api/core.js` 的 `convertFileSrc` 本体）⇒ **必须注入桩**；桩按 Tauri 的
 *   **真实形态**实现（`tauri-2.11.5/scripts/core.js:13-20`：Windows + `use_https_scheme: false`
 *   ⇒ `` http://asset.localhost/${encodeURIComponent(filePath)} ``）⇒ 判据钉在**真实 URL 形态**上，
 *   而不是「等于桩自己」的空真。**不连真 Tauri**（只 mock 模块边界）。
 * @ai-context 断言一律走 DOM 属性（`data-*`）而不是读组件内部 state ⇒ 判据落在**真实渲染路径**上
 *   （含「失败不阻断页面」）。**无 jest-dom / 无 user-event** ⇒ 原生 DOM API；**不挂 `performance`**
 *   （R8.3：jsdom 的 `performance` 自调用会栈溢出）。
 * @ai-context 本件**不能**证明什么（诚实边界）：① asset 协议下的**真实播放 / seek 不可验证**
 *   （jsdom 无媒体栈、headless Edge 不说 `asset:` 协议、真机/WebView2 用户已裁决跳过）⇒ 本件
 *   **不声称**「播放已可用」；② 对齐的**毫秒级精度**不可判（T23 登记的残余 = **块粒度 ±200 ms**）；
 *   ③ 真机返回值（`durationMs` 的真值）不可判 —— 本件只判**契约与透传**。
 *   ⚠️ 本件不渲染 `<audio>`：播放器归 T25（T24 只交付过桥）。
 * 副作用：无（每个用例清 mock；不写盘、不发网络、不连 Tauri）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { invokeMock, convertFileSrcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  convertFileSrcMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: convertFileSrcMock }));

import { NO_AUDIO, SESSION_AUDIO_COMMAND, toSessionAudioState, useSessionAudio } from "./useSessionAudio";
import type { SessionAudioRef } from "../../types/sessionAudio";

/** 会话 WAV 的真实路径形态（`{data_dir}/session-audio/{id}.wav`；Windows 反斜杠 + 空格） */
const WAV_A = "C:\\Users\\x\\AppData\\Roaming\\com.entropydecrease.app\\session-audio\\42.wav";
const WAV_B = "C:\\Users\\x\\AppData\\Roaming\\com.entropydecrease.app\\session-audio\\43.wav";
/** Tauri 的真实 asset URL 形态（`scripts/core.js:13-20`）——期望值独立写在断言侧，不借被测模块构造 */
const assetUrl = (p: string): string => `http://asset.localhost/${encodeURIComponent(p)}`;

/** 探针：把 hook 的返回值渲染成属性（`data-pending` = **尚未取到**；`none` = 值为 `null`） */
function Probe({ sessionId }: { sessionId: number }) {
  const audio = useSessionAudio(sessionId);
  if (audio === undefined) return <div data-testid="page" data-pending="1" />;
  return (
    <div
      data-testid="page"
      data-url={audio.url ?? "none"}
      data-aligned={String(audio.aligned)}
      data-playable={String(audio.playable)}
      data-duration={audio.durationMs === null ? "none" : String(audio.durationMs)}
    />
  );
}
const attr = (name: string): string | null => screen.getByTestId("page").getAttribute(name);
const pending = (): boolean => attr("data-pending") === "1";

beforeEach(() => {
  invokeMock.mockReset();
  convertFileSrcMock.mockReset();
  // 桩 = Tauri 的真实形态（Windows + use_https_scheme:false）
  convertFileSrcMock.mockImplementation((p: string) => assetUrl(p));
});
afterEach(() => cleanup());

describe("T24 · 音频引用过桥（唯一 invoke + convertFileSrc 点）", () => {
  it("B1 URL 由 `convertFileSrc` 拼：路径逐字交给它，产物是 asset 形态（裸路径不算 URL）", async () => {
    invokeMock.mockResolvedValue({ path: WAV_A, aligned: true, durationMs: 12_345 } satisfies SessionAudioRef);
    render(<Probe sessionId={7} />);
    await waitFor(() => expect(pending()).toBe(false));
    expect(invokeMock, "`session_audio_path` 必须恰调一次（命令名 + 入参逐字）").toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(SESSION_AUDIO_COMMAND, { sessionId: 7 });
    expect(convertFileSrcMock, "URL 只能经 convertFileSrc 构造，且入参 = 后端给的路径").toHaveBeenCalledTimes(1);
    expect(convertFileSrcMock).toHaveBeenCalledWith(WAV_A);
    expect(attr("data-url")).toBe(assetUrl(WAV_A));
    expect(attr("data-url")?.startsWith("http://asset.localhost/")).toBe(true);
    expect(attr("data-url"), "裸路径被当成 URL 用了").not.toBe(WAV_A);
    expect(attr("data-url"), "分隔符没被百分号编码 ⇒ 不是 asset URL 形态").not.toContain("\\");
  });

  it("B2 失败静默降级：`invoke` 抛 ⇒ 四字段降级对象 + 页面仍渲染（不阻断）", async () => {
    invokeMock.mockRejectedValue(new Error("session_audio_path 失败：目录不可读"));
    render(<Probe sessionId={7} />);
    await waitFor(() => expect(pending()).toBe(false));
    expect(screen.getByTestId("page"), "降级不得让页面消失").not.toBeNull();
    expect([attr("data-url"), attr("data-aligned"), attr("data-playable"), attr("data-duration")])
      .toEqual(["none", "false", "false", "none"]);
    expect(convertFileSrcMock, "没有路径 ⇒ 不得构造 URL").not.toHaveBeenCalled();
    expect(JSON.stringify(NO_AUDIO), "降级常量的键集/顺序是冻结快照").toBe(
      '{"url":null,"aligned":false,"playable":false,"durationMs":null}',
    );
  });

  it("B3 `aligned` / `durationMs` 如实透传、`playable` 由 `durationMs` 派生（不恒真、不许吞掉 0）", async () => {
    invokeMock.mockResolvedValue({ path: WAV_A, aligned: false, durationMs: null } satisfies SessionAudioRef);
    const first = render(<Probe sessionId={7} />);
    await waitFor(() => expect(pending()).toBe(false));
    expect([attr("data-aligned"), attr("data-duration"), attr("data-playable")]).toEqual(["false", "none", "false"]);
    first.unmount();
    invokeMock.mockReset();
    // `durationMs: 0` = 整数除法的亚毫秒边界（data 长度 1–31 字节）⇒ 必须**逐字**透传（`|| null` 会吞掉它）
    invokeMock.mockResolvedValue({ path: WAV_A, aligned: true, durationMs: 0 } satisfies SessionAudioRef);
    render(<Probe sessionId={7} />);
    await waitFor(() => expect(pending()).toBe(false));
    expect([attr("data-aligned"), attr("data-duration"), attr("data-playable")]).toEqual(["true", "0", "true"]);
  });

  it("B4 无音频（`Ok(None)`）⇒ 与失败**同形**的降级对象（`null` ≠ 尚未取到）", async () => {
    invokeMock.mockResolvedValue(null);
    render(<Probe sessionId={7} />);
    await waitFor(() => expect(pending()).toBe(false));
    expect([attr("data-url"), attr("data-aligned"), attr("data-playable"), attr("data-duration")])
      .toEqual(["none", "false", "false", "none"]);
    expect(convertFileSrcMock).not.toHaveBeenCalled();
  });

  it("B5 幂等与新会话重取：同 `sessionId` 不重取；换 `sessionId` 先复位为「尚未取到」再取新值", async () => {
    invokeMock.mockImplementation((_cmd: string, args: { sessionId: number }) =>
      Promise.resolve(
        args.sessionId === 7
          ? ({ path: WAV_A, aligned: true, durationMs: 1_000 } satisfies SessionAudioRef)
          : ({ path: WAV_B, aligned: true, durationMs: 2_000 } satisfies SessionAudioRef),
      ),
    );
    const view = render(<Probe sessionId={7} />);
    await waitFor(() => expect(attr("data-url")).toBe(assetUrl(WAV_A)));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    view.rerender(<Probe sessionId={7} />);
    expect(invokeMock, "`sessionId` 不变却重取（幂等破功）").toHaveBeenCalledTimes(1);
    expect(attr("data-url")).toBe(assetUrl(WAV_A));
    view.rerender(<Probe sessionId={8} />);
    expect(pending(), "换会话的瞬间必须复位为「尚未取到」（不许拿上一会话的引用冒充）").toBe(true);
    await waitFor(() => expect(attr("data-url")).toBe(assetUrl(WAV_B)));
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenLastCalledWith(SESSION_AUDIO_COMMAND, { sessionId: 8 });
  });

  it("B6 纯映射的边界：`null` ⇒ 降级常量；注入的 `toUrl` 决定 URL（生产默认 = 真的 `convertFileSrc`）", () => {
    expect(toSessionAudioState(null)).toBe(NO_AUDIO);
    expect(toSessionAudioState({ path: WAV_A, aligned: true, durationMs: null }, (p) => `u:${p}`)).toEqual({
      url: `u:${WAV_A}`,
      aligned: true,
      playable: false,
      durationMs: null,
    });
    expect(toSessionAudioState({ path: WAV_A, aligned: false, durationMs: 3 }).url).toBe(assetUrl(WAV_A));
  });
});
