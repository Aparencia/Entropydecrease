// @vitest-environment jsdom
/**
 * SessionTriTrackView.thumbs.test.tsx — #5 的**掠过条**端到端判据（批 6 波 C · T31）。
 *
 * @ai-context 与两个既有件的分工：`SessionTriTrackView.test.tsx`（T1–T5，批 5）与
 *   `SessionTriTrackView.rail.test.tsx`（T25 的 I1–I5）**一字未改**；本件只加 T31 新增的面 ——
 *   ① 三档帧数（1/3/6）与「只取 `thumb/` 级缩略图」；② 帧的取材 = 目标邻域（**单一真源**
 *   `screensFor.screensAround`，不是「最前几屏」）；③ 稀疏降级（`image_ref` 全空 / 槽未接线 ⇒
 *   **整条不渲染**，而不是占位或拉伸时间轴）；④ 解析不出 URL 的那一帧同样不占位。
 * @ai-context 仪器边界：`imageUrl` 用**注入的 spy**（视图侧零 `@tauri-apps` —— 本件不 mock Tauri，
 *   也没有真 `convertFileSrc` 可 mock）；载荷只在 DOM 与 spy 的实参上。⚠️ 视图从 T31 起把 `imageUrl`
 *   当**可选**槽收（既有夹具单参渲染）⇒ 缺它时不出条，这是 T4② 那条「视图零 Tauri」的形态之一。
 * @ai-context 诚实边界：jsdom **不排版**（尺寸/位置不可判）⇒ 只判 `src`、帧数与结构事实；
 *   **「掠过几帧」的观感未测**（本件不声称）。
 * 副作用：只挂 React 树 + 读写 `localStorage` 的档位记忆（`beforeEach` 清空）。不写盘、不发请求。
 */
import { cleanup, render } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "../../types/session";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import SessionTriTrackView from "./SessionTriTrackView";

const URL_OF = (ref: string): string => `asset://injected/${ref}`;
const STRIP = '[data-testid="session-timerail-thumbs"]';
const RAIL = '[data-testid="session-timerail"]';
const PLAYHEAD = '[data-testid="session-timerail-playhead"]';

/** 五屏（10s…50s），每屏都有归档图；屏区间互不重叠 ⇒ 目标落在哪一屏可归因 */
function screensOf(refOf: (ms: number) => string | null): SessionDetail["screens"] {
  return [10, 20, 30, 40, 50].map((s) => {
    const ms = s * 1_000;
    return {
      session_id: 1042,
      screen_id: s,
      first_seen_ms: ms,
      last_seen_ms: ms + 900,
      title: null,
      body: [],
      labels: [],
      image_ref: refOf(ms),
      structure: [],
    };
  });
}
function detailOf(screens: SessionDetail["screens"]): SessionDetail {
  return {
    session: { id: 1042, title: "构图与调色", source_window: "Chrome", started_at: 1_700_000_000_000, ended_at: 1_700_003_800_000, status: "finished", kind: null },
    segments: [{ id: 9001, session_id: 1042, start_ms: 0, end_ms: 60_000, text: "开场：构图三要素", source: "subtitle", confidence: 0.9 }],
    screens,
    ocr_blocks: [],
  };
}
const FULL: SessionDetail["screens"] = screensOf((ms) => `full/${ms}.webp`);

interface Mounted {
  readonly container: HTMLElement;
  readonly imageUrl: Mock;
}
/** 挂载**真实视图**（端到端：视图 → TimeRail → 掠过条 → `screensFor`） */
function mount(opts: { readonly screens?: SessionDetail["screens"]; readonly playheadMs?: number | null; readonly wired?: boolean } = {}): Mounted {
  const imageUrl = vi.fn((ref: string | null) => (ref === null ? null : URL_OF(ref)));
  const view = render(
    <SessionTriTrackView
      detail={detailOf(opts.screens ?? FULL)}
      playheadMs={opts.playheadMs === undefined ? 35_000 : opts.playheadMs}
      {...(opts.wired === false ? {} : { imageUrl })}
    />,
  );
  return { container: view.container, imageUrl };
}
function q(container: HTMLElement, sel: string): HTMLElement {
  const el = container.querySelector(sel);
  if (el === null) throw new Error(`没有渲染出 ${sel}`);
  return el as HTMLElement;
}
const srcs = (container: HTMLElement): string[] => [...container.querySelectorAll(`${STRIP} img`)].map((el) => el.getAttribute("src") ?? "");

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("T1 三档帧数 + 只取 `thumb/` 级缩略图（`full/` 是原图，图集可达 115 MB 级）", () => {
  it("standard ⇒ 恰 3 帧、rich ⇒ 恰 6（屏数不足 6 ⇒ 有多少给多少）、eco ⇒ 恰 1；每帧 `src` 都含 `thumb/`（逐序）", () => {
    const expectRefs: Readonly<Record<string, readonly string[]>> = {
      eco: ["thumb/50000.webp"],
      standard: ["thumb/30000.webp", "thumb/40000.webp", "thumb/50000.webp"],
      rich: ["thumb/10000.webp", "thumb/20000.webp", "thumb/30000.webp", "thumb/40000.webp", "thumb/50000.webp"],
    };
    const counts: number[] = [];
    for (const tier of ["eco", "standard", "rich"] as const) {
      localStorage.setItem(MOTION_INTENSITY_KEY, tier);
      const { container, imageUrl } = mount({ playheadMs: 50_000 });
      // `imageUrl` 在 render 里调用（同 `SessionCardFlowView`）⇒ 每次重渲都会再调一次，故去重后对拍
      const asked = [...new Set(imageUrl.mock.calls.map((c) => c[0] as string))];
      expect(asked, `${tier}：配图槽只许收到 thumb/ 级 ref（逐序）`).toEqual(expectRefs[tier]);
      const shown = srcs(container);
      counts.push(shown.length);
      expect(shown, `${tier}：` + "`src` 逐序 = 注入槽的返回（URL 不在本层拼）").toEqual(expectRefs[tier].map(URL_OF));
      expect(shown.filter((s) => !s.includes("thumb/")), `${tier}：出现非 thumb/ 的帧 ⇒ 掠过会去拉原图`).toEqual([]);
      expect(q(container, STRIP).dataset.frames, `${tier}：data-frames 与 DOM 一致`).toBe(String(shown.length));
      cleanup();
    }
    expect(counts, "三档帧数逐序（1/3/6；rich 受屏数上限约束 ⇒ 5）").toEqual([1, 3, 5]);
  });
});

describe("T2 帧的取材 = 目标邻域（单一真源），不是「最前几屏」", () => {
  it("目标 35s（第 3 屏区间后）⇒ 以第 3 屏结尾的最近 3 屏；目标 5s（早于所有屏）⇒ 只有首屏", () => {
    const near = mount({ playheadMs: 35_000 });
    expect(srcs(near.container), "35s 的目标邻域 = 10/20/30s 三屏（`screensAround` 的窗口口径）").toEqual([
      URL_OF("thumb/10000.webp"),
      URL_OF("thumb/20000.webp"),
      URL_OF("thumb/30000.webp"),
    ]);
    expect(q(near.container, STRIP).dataset.frames, "`data-frames` = 实际渲染的帧数（与 DOM 一致）").toBe("3");
    cleanup();
    const early = mount({ playheadMs: 5_000 });
    expect(srcs(early.container), "早于所有屏 ⇒ 锚取最小 first_seen_ms 的那一屏（不是空、也不是全部）").toEqual([URL_OF("thumb/10000.webp")]);
  });
});

describe("T3 稀疏降级：`image_ref` 全空 ⇒ **不出**掠过条（不占位、不拉伸时间轴）", () => {
  it("五屏全无归档图 ⇒ 无条、无 img；但时间轨、播放头与刻度照旧（回跳的落位不受影响）", () => {
    const { container, imageUrl } = mount({ screens: screensOf(() => null) });
    expect(container.querySelector(STRIP), "没有可用帧却渲染了条（占位/拉伸都会在这里露馅）").toBeNull();
    expect(imageUrl.mock.calls.length, "`image_ref === null` 不该调用配图槽").toBe(0);
    expect(q(container, RAIL), "降级把时间轨带走了").not.toBeNull();
    expect(q(container, PLAYHEAD).dataset.ms, "播放头照旧落位（掠过条只是配图面）").toBe("35000");
    expect(q(container, PLAYHEAD).style.transform, "落终态：位移写出 0（不是不写）").toContain("translate");
    expect([...container.querySelectorAll("[data-tick-ms]")].length, "刻度尺被带走了").toBeGreaterThan(1);
    cleanup();
    const none = mount({ screens: [] });
    expect(none.container.querySelector(STRIP), "空 screens ⇒ 同样不出条").toBeNull();
  });
});

describe("T4 槽未接线（视图从 T31 起把 `imageUrl` 当可选槽收）⇒ 不出条且不抛", () => {
  it("不传 `imageUrl` ⇒ 三条轨、时间轨、播放头都在，掠过条缺席（既有夹具的单参渲染形态）", () => {
    const { container, imageUrl } = mount({ wired: false });
    expect(container.querySelector(STRIP), "缺槽却渲染了条").toBeNull();
    expect(imageUrl.mock.calls.length, "缺槽时不该有配图解析").toBe(0);
    expect([...container.querySelectorAll("[data-track]")].map((el) => el.children.length)).toEqual([1, 5, 0]);
    expect(q(container, PLAYHEAD)).not.toBeNull();
  });
});

describe("T5 解析不出 URL 的那一帧不占位（`imageUrl` 返回 `null`）", () => {
  it("第 2 屏的 ref 解析失败 ⇒ 帧数 3→2 且逐序少了它（不渲染 `src=null` 的空图）", () => {
    const screens = screensOf((ms) => (ms === 30_000 ? "full/gone.webp" : `full/${ms}.webp`));
    const imageUrl = vi.fn((ref: string | null) => (ref === "thumb/gone.webp" ? null : ref === null ? null : URL_OF(ref)));
    const { container } = render(<SessionTriTrackView detail={detailOf(screens)} playheadMs={35_000} imageUrl={imageUrl} />);
    expect(srcs(container), "解析不出的一帧被跳过（不是渲染空 src）").toEqual([URL_OF("thumb/10000.webp"), URL_OF("thumb/20000.webp")]);
    expect(q(container, STRIP).dataset.frames).toBe("2");
    expect(srcs(container).filter((s) => s === "" || s === "null"), "出现空 src").toEqual([]);
  });
});
