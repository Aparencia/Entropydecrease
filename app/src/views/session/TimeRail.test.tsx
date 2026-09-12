// @vitest-environment jsdom
/**
 * TimeRail.test.tsx — 「时间码回跳」承载面的**行为级契约**（批 6 T25 · R5.5 #5 / R5.5-b）。
 *
 * @ai-context 逐条兑现计划 Task 25 的 Verification（每条各带**自己的变异体**，读数见
 *   `.superpowers/sdd/2026-09-12-frontend-redesign-batch6-motion/task-25-report.md`）：
 *   V1 元素级定位逐点精确（0/52.5/90/120）且 `window.scrollTo` **零调用** ·
 *   V2 播放头 = 注入值（`data-ms` + 位置样式双断言）· V3 降级（音频不可得）·
 *   V4 `aligned === false` 的如实文案（含「无时间基准 / 近似」，**不含**「未对齐 / 未同步」）·
 *   V5 未 finalize ⇒ 禁用播放 + **恰一行**错误行（不是 toast）· V6 **禁 `fetch()` 音频**的源码级
 *   硬守卫 · V7 `<audio>` 属性契约（`src`/`preload`/`onTimeUpdate` 绑定）。
 * @ai-context **媒体行为一律桩掉**（不连真 Tauri、不真播放）：URL 由注入槽给 ⇒ 本件面上没有
 *   `convertFileSrc`；`HTMLMediaElement.prototype.play` 被换成记录器 ⇒ 判据只覆盖**属性契约 +
 *   点击契约**。🔴 **不声称**「播放已可用」「seek 已验证」：asset 协议下的真实播放 / seek 在
 *   本环境不可验证（jsdom 无媒体栈、headless Edge 不说 `asset:` 协议、真机/WebView2 已裁决跳过）。
 * @ai-context 仪器边界：jsdom **不排版** ⇒ `clientWidth === 0`（V1 里**显式自证**这条换算前提）；
 *   V1 的四个读数是**逐序数组相等**（不是「约等于」）。
 * 副作用：只挂 React 树 + V6 只读 `app/src/**` 源码；不写盘、不发请求、不真播放。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionAudioState } from "../../types/session";
import { stripComments, walkSources, relOf } from "../../ui/primitives/sliceScan";
import TimeRail, { NOT_ALIGNED_NOTE, pxOf, scrollLeftFor, ticksOf } from "./TimeRail";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 阳性对照用的两个「音频面」文件（V6 的域非空自证） */
const AUDIO_FILES = ["views/session/TimeRail.tsx", "components/session-detail/useSessionAudio.ts"];

const TOTAL = 120_000;
const URL_OK = "asset://localhost/C%3A%2Fdata%2Fsession-audio%2F1042.wav";
/** 四套音频夹具（判据之间只差一个字段 ⇒ 变异体的因可归） */
const OK: SessionAudioState = { url: URL_OK, aligned: true, playable: true, durationMs: TOTAL };
const NO_AUDIO: SessionAudioState = { url: null, aligned: false, playable: false, durationMs: null };
const RECORDING: SessionAudioState = { url: URL_OK, aligned: true, playable: false, durationMs: null };
const HISTORY: SessionAudioState = { url: URL_OK, aligned: false, playable: true, durationMs: TOTAL };

interface Over {
  readonly totalMs?: number;
  readonly playheadMs?: number | null;
  /** 省缺 = `OK`；显式传 `undefined` = 「尚未取到」（第三态，与 `null` 不同形） */
  readonly audio?: SessionAudioState | null | undefined;
}
function mount(over: Over = {}) {
  const onSeekMs = vi.fn();
  const view = render(
    <TimeRail
      totalMs={over.totalMs ?? TOTAL}
      playheadMs={over.playheadMs ?? null}
      audio={"audio" in over ? over.audio : OK}
      onSeekMs={onSeekMs}
    />,
  );
  return { ...view, onSeekMs };
}
/** 取一个必须存在的节点（缺失即抛 ⇒ 「仪器悄悄失效」不会变成绿色） */
function q(container: HTMLElement, sel: string): HTMLElement {
  const el = container.querySelector(sel);
  if (el === null) throw new Error(`没有渲染出 ${sel}`);
  return el as HTMLElement;
}

let playStub: ReturnType<typeof vi.fn>;
beforeEach(() => {
  playStub = vi.fn(() => Promise.resolve());
  // 媒体行为桩掉（jsdom 的 `play()` 只报 not implemented）—— 判据看的是**谁在什么时候请求播放**
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", { value: playStub, configurable: true, writable: true });
});
afterEach(cleanup);

describe("V1 播放头定位：元素级、逐点精确、绝不碰 window（R5.5 的判据边界）", () => {
  it("playheadMs 0/52500/90000/120000 ⇒ scrollLeft 逐序 0/52.5/90/120；window.scrollTo 零调用", () => {
    const problems: string[] = [];
    const windowScroll = vi.spyOn(window, "scrollTo");
    const { container, rerender } = mount({ playheadMs: 0 });
    const viewport = q(container, '[data-testid="session-timerail-viewport"]');

    // 仪器自证：jsdom 无排版 ⇒ clientWidth 恒 0 ⇒ 期望的 scrollLeft 就等于像素值
    if (viewport.clientWidth !== 0) problems.push(`jsdom 排版口径变了：clientWidth=${viewport.clientWidth}`);
    const readings: number[] = [];
    for (const ms of [0, 52_500, 90_000, 120_000]) {
      rerender(<TimeRail totalMs={TOTAL} playheadMs={ms} audio={OK} />);
      readings.push(viewport.scrollLeft);
    }
    if (JSON.stringify(readings) !== JSON.stringify([0, 52.5, 90, 120])) {
      problems.push(`四点读数不是 0/52.5/90/120，实测 ${JSON.stringify(readings)}`);
    }
    if (windowScroll.mock.calls.length > 0) problems.push(`定位打到了 window（尖刺实测读数恒 0）：${windowScroll.mock.calls.length} 次`);

    // 第二面（clientWidth=0 覆盖不到的分支）：居中换算 + 左端夹紧
    const centered = [scrollLeftFor(52_500, 20), scrollLeftFor(1_000, 100)];
    if (JSON.stringify(centered) !== JSON.stringify([42.5, 0])) problems.push(`居中/夹紧换算错：${JSON.stringify(centered)}`);

    windowScroll.mockRestore();
    expect(problems, "元素级定位的两面各自独立成立").toEqual([]);
  });
});

describe("V2 播放头位置 = 注入值（不是常量、不是派生）", () => {
  it("playheadMs=52500 ⇒ `data-ms` 逐字 52500 且位置样式 52.5px；换值/换 null 都跟着变", () => {
    const { container, rerender } = mount({ playheadMs: 52_500 });
    const head = q(container, '[data-testid="session-timerail-playhead"]');
    expect(head.dataset.ms, "`data-ms` 不是注入值").toBe("52500");
    expect(head.style.left, "位置样式不是 52500ms 的像素值").toBe("52.5px");
    expect(container.querySelector('[data-testid="session-timerail"]')?.getAttribute("data-degraded")).toBe("false");

    // 反例守卫：换成另一个值 ⇒ 两处都变（把位置写成常量的实现当场露馅）
    rerender(<TimeRail totalMs={TOTAL} playheadMs={90_000} audio={OK} />);
    const moved = q(container, '[data-testid="session-timerail-playhead"]');
    expect([moved.dataset.ms, moved.style.left]).toEqual(["90000", "90px"]);

    // `null` = 无播放头（不猜位置、不渲染空标记）
    rerender(<TimeRail totalMs={TOTAL} playheadMs={null} audio={OK} />);
    expect(container.querySelector('[data-testid="session-timerail-playhead"]')).toBeNull();
  });

  it("刻度尺：刻度逐序 = `ticksOf(totalMs)` 且文案逐字 = `fmtMs` 的输出（轨不是空的）", () => {
    const { container } = mount({ playheadMs: null, totalMs: 130_000 });
    const ticks = [...container.querySelectorAll("[data-tick-ms]")] as HTMLElement[];
    expect(ticks.map((el) => Number(el.dataset.tickMs))).toEqual([0, 60_000, 120_000]);
    expect(ticks.map((el) => el.textContent)).toEqual(["00:00", "01:00", "02:00"]);
    expect(ticksOf(130_000)).toEqual([0, 60_000, 120_000]);
    expect(ticksOf(0)).toEqual([0]);
  });
});

describe("V3 优雅降级（音频不可得）：时间轨仍可用 + 恰一行错误行（不是 toast）", () => {
  it("audio.url=null ⇒ 轨/刻度/视口仍在 DOM、播放头仍在（指示器）、恰 1 个 error、0 个 toast、无 <audio>", () => {
    const { container } = mount({ audio: NO_AUDIO, playheadMs: 9_000 });
    const root = q(container, '[data-testid="session-timerail"]');
    expect(root.querySelector('[data-testid="session-timerail-viewport"]'), "时间轨消失了（R5.5-b：轨仍可用）").not.toBeNull();
    expect([...container.querySelectorAll("[data-tick-ms]")].length, "刻度尺是空的 ⇒ 轨不可用").toBeGreaterThan(1);
    expect(q(container, '[data-testid="session-timerail-playhead"]').dataset.ms, "播放头没退化为聚焦指示器").toBe("9000");
    expect(root.getAttribute("data-degraded")).toBe("true");
    expect(container.querySelectorAll('[data-kind="error"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid*="toast"]'), "降级提示走了 toast（R5.5-b 逐字：不许）").toBeNull();
    expect(container.querySelector("audio"), "无音频却渲染了媒体元素").toBeNull();
    // 尚未取到（undefined）**不**是失败 ⇒ 不出红行（否则每次挂载都闪一行）
    cleanup();
    const pending = mount({ audio: undefined });
    expect(pending.container.querySelectorAll('[data-kind="error"]')).toHaveLength(0);
  });
});

describe("V4 `aligned === false` 的如实文案（标签不许说谎 · R51.2⑧）", () => {
  it("无时间基准 ⇒ 文案含「无时间基准」/「近似」，不含「未对齐」「未同步」；有基准 ⇒ 0 行", () => {
    const { container } = mount({ audio: HISTORY });
    const line = q(container, '[data-testid="session-timerail-notice"]');
    const text = line.textContent ?? "";
    expect(text, "如实文案缺「无时间基准」").toContain("无时间基准");
    expect(text, "如实文案缺「近似」").toContain("近似");
    expect(text.includes("未对齐") || text.includes("未同步"), "文案把「不能保证对齐」写成了断言式的「未对齐」").toBe(false);
    expect(text).toContain(NOT_ALIGNED_NOTE);
    cleanup();
    // 反例守卫：有基准且可播 ⇒ 不该出任何提示行
    const clean = mount({ audio: OK });
    expect(clean.container.querySelectorAll('[data-kind="error"]')).toHaveLength(0);
  });
});

describe("V5 未 finalize ⇒ 禁用播放 + 恰一行错误行；可播时点击才请求播放", () => {
  it("playable=false ⇒ 播放控件 disabled 且恰 1 个 error；点击不请求播放；可播时点击 ⇒ play() 恰 1 次", async () => {
    const { container } = mount({ audio: RECORDING });
    const btn = q(container, '[data-testid="session-timerail-play"]') as HTMLButtonElement;
    expect(btn.disabled, "录制中的 WAV 被允许播放（R5.5-b 约束 3）").toBe(true);
    expect(container.querySelectorAll('[data-kind="error"]')).toHaveLength(1);
    expect(container.textContent ?? "").toContain("finalize");
    fireEvent.click(btn);
    expect(playStub.mock.calls.length, "禁用态仍请求了播放").toBe(0);

    cleanup();
    const ok = mount({ audio: OK });
    const playBtn = q(ok.container, '[data-testid="session-timerail-play"]') as HTMLButtonElement;
    expect(playBtn.disabled).toBe(false);
    fireEvent.click(playBtn);
    expect(playStub.mock.calls.length, "可播状态点播放没有请求媒体").toBe(1);
  });

  it("加载失败（`play()` 拒绝 / 媒体 error）⇒ 同一条降级：轨仍在、恰一行「音频加载失败」、播放禁用", async () => {
    playStub.mockImplementation(() => Promise.reject(new Error("decode failed")));
    const { container } = mount({ audio: OK, playheadMs: 3_000 });
    fireEvent.click(q(container, '[data-testid="session-timerail-play"]'));
    await waitFor(() => {
      expect(container.textContent ?? "").toContain("音频加载失败");
    });
    expect(container.querySelectorAll('[data-kind="error"]')).toHaveLength(1);
    expect(q(container, '[data-testid="session-timerail-viewport"]'), "加载失败把时间轨也带走了").not.toBeNull();
    expect((q(container, '[data-testid="session-timerail-play"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("V7 `<audio>` 属性契约（唯一可测的一半：src / preload / onTimeUpdate 绑定）", () => {
  it("src=注入 URL、preload=metadata；timeupdate ⇒ 当前时间（秒→毫秒）经唯一上行口报出", () => {
    const { container, onSeekMs } = mount({ audio: OK });
    const el = q(container, '[data-testid="session-timerail-audio"]') as HTMLAudioElement;
    expect(el.getAttribute("src")).toBe(URL_OK);
    expect(el.getAttribute("preload")).toBe("metadata");
    // `onTimeUpdate` 的**绑定**用行为判：jsdom 里 currentTime 可写（本轮实测）
    el.currentTime = 3.5;
    fireEvent.timeUpdate(el);
    expect(onSeekMs.mock.calls.length, "timeupdate 没有到达上行通道（绑定缺失）").toBe(1);
    expect(onSeekMs.mock.calls[0][0]).toBe(3500);
    // 无音频 ⇒ 不该有媒体元素（`url === null` 时不许把空 src 渲染出去）
    cleanup();
    const none = mount({ audio: NO_AUDIO });
    expect(none.container.querySelector("audio")).toBeNull();
  });
});

describe("V6 硬守卫：`app/src/**` 不得对音频 `fetch()`（R5.5-b 约束 2 的机器判据）", () => {
  it("剥注释后生产文件 `fetch(` 0 命中；阳性/阴性对照各自成立；域含两个音频面文件", () => {
    const SRC = join(HERE, "..", "..");
    const prod = walkSources(SRC).map((abs) => relOf(SRC, abs)).filter((r) => !/\.test\.tsx?$/.test(r));
    expect(prod.length, "域被走空 ⇒ 0 命中是空真").toBeGreaterThan(200);
    for (const f of AUDIO_FILES) expect(prod, `${f} 不在域里`).toContain(f);

    const hits = prod.filter((r) => /\bfetch\s*\(/.test(stripComments(readFileSync(join(SRC, ...r.split("/")), "utf8"))));
    expect(hits, `出现了 fetch( —— 不带 Range 的 200 分支会把整段 WAV 读进内存：\n${hits.join("\n")}`).toEqual([]);
    // 两个对照：仪器**确实看得见** `fetch(`，且注释里的提及不算命中
    expect(/\bfetch\s*\(/.test(stripComments("const r = await fetch(audio.url);")), "扫描器看不见 fetch( ⇒ 上面的 0 命中不可信").toBe(true);
    expect(/\bfetch\s*\(/.test(stripComments("// 禁止 fetch(audio.url)\n/* fetch(url) */")), "注释里的提及被当成了命中").toBe(false);
    // 第二面：音频 URL 的唯一消费形态 = `<audio src>`（结构化断言，防「偷偷换成 XHR/整取」）
    const rail = stripComments(readFileSync(join(SRC, "views", "session", "TimeRail.tsx"), "utf8"));
    expect(rail).toContain("<audio");
    expect(rail).toContain("src={url}");
    expect(rail).toContain('preload="metadata"');
  });
});

describe("纯换算自证（V1/V2 的共用前提，直接单测）", () => {
  it("pxOf 逐点精确：1 秒 = 1 像素（半点值不取整）", () => {
    expect([0, 52_500, 90_000, 120_000].map(pxOf)).toEqual([0, 52.5, 90, 120]);
  });
});
