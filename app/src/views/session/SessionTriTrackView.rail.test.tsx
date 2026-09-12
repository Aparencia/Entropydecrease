// @vitest-environment jsdom
/**
 * SessionTriTrackView.rail.test.tsx — T25 在**视图层**的集成判据（时间轨 + 播放头 + 降级）。
 *
 * @ai-context 与 `SessionTriTrackView.test.tsx` 的分工：那件的 5 条判据（T1–T5，批 5 交付）
 *   **逐字不动**；本件只加 T25 新增的面 —— ① 时间轨与三轨的**结构关系**（轨在上、轨不在轨里）；
 *   ② 总长真源 `totalMsOf`（派生口径 + `durationMs` 优先）；③ 时间码点击 ⇒ 播放头回跳到该段
 *   （「时间码回跳」的可见动作）；④ 注入 `playheadMs` 的**优先级**；⑤ 音频槽在视图侧的落点与
 *   无音频时的降级可用性。
 * @ai-context **不 mock Tauri**：本件不取数（URL 由注入槽给）⇒ 没有 `@tauri-apps` 的模块边界可
 *   mock，也没有真播放（判据不点播放控件；媒体侧契约在 `TimeRail.test.tsx`）。
 * @ai-context 诚实边界：jsdom 不排版 ⇒ 「播放头看起来在正确位置」不可判，本件只判 `data-ms`
 *   与 `data-degraded` 这类**结构事实**；真实播放 / seek 在本环境不可验证（不声称）。
 * 副作用：只挂 React 树；不写盘、不发请求、不真播放。
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionAudioState, SessionDetail } from "../../types/session";
import SessionTriTrackView, { totalMsOf } from "./SessionTriTrackView";

const URL_OK = "asset://localhost/C%3A%2Fdata%2Fsession-audio%2F1042.wav";
const NO_AUDIO: SessionAudioState = { url: null, aligned: false, playable: false, durationMs: null };
const OK: SessionAudioState = { url: URL_OK, aligned: true, playable: true, durationMs: 120_000 };
const ROOT = '[data-testid="session-tritrack-view"]';
const RAIL = '[data-testid="session-timerail"]';
const PLAYHEAD = '[data-testid="session-timerail-playhead"]';

function detailOf(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: 1042,
      title: "构图与调色",
      source_window: "Chrome",
      started_at: 1_700_000_000_000,
      ended_at: 1_700_003_800_000,
      status: "finished",
      kind: null,
    },
    segments: [
      { id: 9001, session_id: 1042, start_ms: 0, end_ms: 2_500, text: "开场：构图三要素", source: "subtitle", confidence: 0.9 },
      { id: 9003, session_id: 1042, start_ms: 9_000, end_ms: 12_000, text: "第二段：色轮", source: "fused", confidence: 0.8 },
      { id: 9002, session_id: 1042, start_ms: 3_725_000, end_ms: 3_728_000, text: "一小时后的复盘", source: "asr", confidence: 0.7 },
    ],
    screens: [
      { session_id: 1042, screen_id: 1, first_seen_ms: 9_000, last_seen_ms: 12_000, title: "调色面板", body: ["色相环"], labels: [], image_ref: "full/a.webp", structure: [] },
    ],
    ocr_blocks: [{ id: 5001, session_id: 1042, timestamp_ms: 500, text: "课程封面", score: 0.81, region: "subtitle" }],
    ...over,
  };
}

interface Over {
  readonly audio?: SessionAudioState | null | undefined;
  readonly playheadMs?: number | null;
  readonly detail?: SessionDetail;
}
function mountView(over: Over = {}) {
  const onSeekMs = vi.fn();
  const view = render(
    <SessionTriTrackView
      detail={over.detail ?? detailOf()}
      audio={"audio" in over ? over.audio : OK}
      playheadMs={over.playheadMs ?? null}
      onSeekMs={onSeekMs}
    />,
  );
  return { ...view, onSeekMs };
}
function q(container: HTMLElement, sel: string): HTMLElement {
  const el = container.querySelector(sel);
  if (el === null) throw new Error(`没有渲染出 ${sel}`);
  return el as HTMLElement;
}
/** 轨条目里的时间码按钮（T25 起时间码是定位按钮 —— 键盘可达由 `Button` 原语保证） */
const codeAt = (container: HTMLElement, ms: number): HTMLElement =>
  q(container, `[data-track="transcript"] [data-ms="${ms}"] button`);

/** `totalMsOf` 的三来源小夹具（每个面只动一个来源 ⇒ 变异体的因可归） */
const seg = (end: number): SessionDetail["segments"][number] => ({ id: 1, session_id: 1, start_ms: 0, end_ms: end, text: "t", source: "asr", confidence: 1 });
const scr = (last: number): SessionDetail["screens"][number] => ({ session_id: 1, screen_id: 1, first_seen_ms: 0, last_seen_ms: last, title: null, body: [], labels: [], image_ref: null, structure: [] });
const ocr = (ts: number): SessionDetail["ocr_blocks"][number] => ({ id: 1, session_id: 1, timestamp_ms: ts, text: "o", score: 1, region: "full" });
const parts = (p: { seg?: number[]; scr?: number[]; ocr?: number[] }): SessionDetail =>
  detailOf({ segments: (p.seg ?? []).map(seg), screens: (p.scr ?? []).map(scr), ocr_blocks: (p.ocr ?? []).map(ocr) });
const audioWith = (durationMs: number | null): SessionAudioState => ({ url: URL_OK, aligned: true, playable: true, durationMs });

afterEach(cleanup);

describe("I1 结构契约：时间轨在上、三轨不在轨里（既有 T1 的条目锚不变）", () => {
  it("轨与本行两兄弟：轨在**前**、`[data-track]` 各 3/1/1 条且都不在轨子树里；轨缺席时三轨照旧", () => {
    const { container } = mountView();
    const root = q(container, ROOT);
    const rail = q(container, RAIL);
    const lane = q(container, '[data-track="transcript"]');
    expect(rail.compareDocumentPosition(lane) & Node.DOCUMENT_POSITION_FOLLOWING, "时间轨没有排在三条轨之前").not.toBe(0);
    expect(rail.contains(lane), "三条轨被塞进了时间轨里（轨就不可共享了）").toBe(false);
    expect([...container.querySelectorAll("[data-track]")].map((el) => el.children.length)).toEqual([3, 1, 1]);
    expect(root.contains(rail)).toBe(true);
  });
});

describe("I2 总长真源 `totalMsOf`：三数组取大，且有 `durationMs` 时以它为准（再对派生值取大）", () => {
  it("三个来源各自当过一次最大值；durationMs 覆盖/被兜底/缺省三条支路逐字", () => {
    expect([totalMsOf(parts({ seg: [1_000] }), NO_AUDIO), totalMsOf(parts({ scr: [2_000] }), NO_AUDIO), totalMsOf(parts({ ocr: [3_000] }), NO_AUDIO)]).toEqual([1_000, 2_000, 3_000]);
    expect(totalMsOf(parts({ seg: [9_000], ocr: [3_000] }), NO_AUDIO)).toBe(9_000);
    expect(totalMsOf(parts({}), NO_AUDIO), "三数组全空 ⇒ 0").toBe(0);
    // 音频侧：`durationMs` 是音频的真源，但**不许**把派生出来的内容挤出轨外
    expect([totalMsOf(parts({ seg: [1_000] }), audioWith(5_000)), totalMsOf(parts({ seg: [1_000] }), audioWith(500)), totalMsOf(parts({ seg: [1_000] }), audioWith(null))]).toEqual([5_000, 1_000, 1_000]);
    // 视图把真源用在了轨上：派生 3_728_000 > durationMs 120_000 ⇒ 轨宽 = 3728px（不丢内容）
    const { container } = mountView();
    expect(q(container, ".ed-timerail__track").style.width).toBe("3728px");
    // 反向面：派生值小于 `durationMs` ⇒ 轨宽由音频真源决定（120000ms ⇒ 120px）
    cleanup();
    const short = mountView({ audio: OK, detail: parts({ seg: [1_000] }) });
    expect(q(short.container, ".ed-timerail__track").style.width, "有 durationMs 时没用上它").toBe("120px");
  });
});

describe("I3 时间码回跳：点时间码 ⇒ 上行请求**恰一次**且播放头滑到该段", () => {
  it("点 9000ms 的时间码 ⇒ onSeekMs(9000) 恰 1 次 + 播放头 data-ms=9000；点另一段 ⇒ 逐字跟随", () => {
    const { container, onSeekMs } = mountView({ audio: NO_AUDIO });
    fireEvent.click(codeAt(container, 9_000));
    expect(onSeekMs.mock.calls.length, "点击没有（或重复）上报").toBe(1);
    expect(onSeekMs.mock.calls[0][0]).toBe(9_000);
    expect(q(container, PLAYHEAD).dataset.ms, "播放头没有跟到点过的那一段").toBe("9000");
    fireEvent.click(codeAt(container, 3_725_000));
    expect(container.querySelector(PLAYHEAD)?.getAttribute("data-ms")).toBe("3725000");
    // 反例守卫：不点 ⇒ 无播放头（位置不是常量、也不是「第一段」）
    cleanup();
    const fresh = mountView({ audio: NO_AUDIO });
    expect(fresh.container.querySelector(PLAYHEAD)).toBeNull();
    expect(fresh.onSeekMs.mock.calls.length).toBe(0);
  });
});

describe("I4 注入 `playheadMs` 优先于本地聚焦（T26 深链的先后次序）", () => {
  it("注入 52500 后点 9000 的时间码 ⇒ 上行仍收到 9000，但播放头停在注入值", () => {
    const { container, onSeekMs } = mountView({ audio: OK, playheadMs: 52_500 });
    expect(q(container, PLAYHEAD).dataset.ms).toBe("52500");
    fireEvent.click(codeAt(container, 9_000));
    expect(onSeekMs.mock.calls[0][0]).toBe(9_000);
    expect(q(container, PLAYHEAD).dataset.ms, "本地点击把注入的播放头覆盖掉了（深链会被旧聚焦吞掉）").toBe("52500");
  });
});

describe("I5 音频槽在视图侧的落点与降级可用性（无音频 ⇒ 只读时间轨）", () => {
  it("有音频 ⇒ `<audio src>` = 注入 URL；无音频 ⇒ 轨仍在 + 恰一行 error + 点时间码仍能定位", () => {
    const withAudio = mountView({ audio: OK });
    expect(q(withAudio.container, "audio").getAttribute("src")).toBe(URL_OK);
    expect(withAudio.container.querySelectorAll('[data-kind="error"]')).toHaveLength(0);
    cleanup();

    const noAudio = mountView({ audio: NO_AUDIO });
    const root = q(noAudio.container, RAIL);
    expect(root.getAttribute("data-degraded"), "无音频没有进降级态").toBe("true");
    expect(noAudio.container.querySelector('[data-testid="session-timerail-viewport"]'), "降级把时间轨带走了").not.toBeNull();
    expect(noAudio.container.querySelectorAll('[data-kind="error"]')).toHaveLength(1);
    expect(noAudio.container.querySelector("audio"), "无音频却渲染了媒体元素").toBeNull();
    // 降级下「时间轨仍可用」的可判部分：点时间码照旧驱动播放头
    fireEvent.click(codeAt(noAudio.container, 9_000));
    expect(q(noAudio.container, PLAYHEAD).dataset.ms).toBe("9000");
  });
});
