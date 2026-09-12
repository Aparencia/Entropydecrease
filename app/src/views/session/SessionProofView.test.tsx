// @vitest-environment jsdom
/**
 * SessionProofView.test.tsx — 批 5 · T8「印样」视图（`SessionProofView`）的**行为级判据**。
 *
 * @ai-context 为什么是第一等交付物（C15）：`SessionProofView` 是**新**生产文件，没有任何既有
 *   断言可依靠；「印样」的数据契约**规格未给**（侦察 §11.7），本批 T8 把它写死在 `SessionProofView`
 *   的文件头 —— 本文件逐条钉住那份契约里**可机器判定**的部分。五条判据各带一个变异体（在导出树里
 *   跑，先 `ran===true` 再断言 `red`），另加「只改文案/间距 ⇒ 必须仍绿」的反例守卫（证明本文件
 *   不是快照或文本断言）。
 *
 * @ai-context 判据清单（编号与计划 Task 8 Step 2 的 P 表**同号**；顺序按 C14② 把「不 invoke」提到
 *   第一条，计划表里它是 P5）：
 *   P5 **不 invoke**：`@tauri-apps/api/core` 的 `invoke` 零调用（视图不自己取数）。
 *   P1 印张数 = `screens.length` · 顺序 = `screens` 给定顺序 · 序号 = `screen_id ?? index+1` ·
 *      区间时间码与 `fmtMs` 逐字一致 · `screens` 为空 ⇒ 0 张印张 + `EmptyState`（根仍在）。
 *   P2 `image_ref` 为空 ⇒ **不出** `<img>`；非空且 `imageUrl()` 解析得出 ⇒ `src` **逐字等于**它的
 *      返回；非空但解析不出（null）⇒ 同样不出图；**图注位恒在**（3/3）；`imageUrl` 只被非空 ref 调用。
 *   P3 正文按区间归属：每张印张出现的转写文本集合与顺序 == 与该区间重叠的段（逐字 + 升序 + 并列按 id）。
 *   P4 只读：全件 0 个 `<button>` / 0 个 `<details>`（印样不得退化成卡片流的复制品）。
 *
 * @ai-context 仪器边界：**只 mock 模块边界**（`@tauri-apps/api/core`）。`imageUrl` 用**注入的 spy**
 *   —— 它的返回值刻意带 `INJECTED://` 前缀，与 mock 里 `convertFileSrc` 的 `TAURI-ASSET://` 前缀
 *   可区分：**视图若绕过注入槽自己转 URL（计划 P5 的变异体形态），P2 的 `src` 断言立刻红**。
 *   断言只用原生 DOM API（本仓**无 `jest-dom`、无 `user-event`**）⇒ 没有 `toBeInTheDocument()` 之类。
 *
 * @ai-context 诚实边界（细节见 `task-8-report.md` §7）：本文件判**结构与内容**，不判观感 ——
 *   印张密度、剪报底纹的实际对比度、长会话滚动流畅度、真实图片能否加载（jsdom 不载图）都不在此列。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { SessionDetail, SessionScreen, SessionSegment } from "../../types";
import { fmtMs } from "../../utils/fmt";

const { invokeMock, convertFileSrcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  convertFileSrcMock: vi.fn((p: string) => `TAURI-ASSET://${p}`),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: convertFileSrcMock }));

import SessionProofView from "./SessionProofView";

/** 注入的图片 URL 解析器（容器给的那一支）——前缀刻意与 `convertFileSrc` 不同（见文件头） */
const IMAGE_PREFIX = "INJECTED://";
/** 后端在 `image_ref` 存在、但图集不可用时给出的 ref（`imageUrl` 对它返回 null） */
const UNRESOLVABLE_REF = "full/unresolvable.webp";

function screenOf(over: Partial<SessionScreen> & Pick<SessionScreen, "first_seen_ms" | "last_seen_ms">): SessionScreen {
  return {
    session_id: 1042,
    screen_id: null,
    title: null,
    body: [],
    labels: [],
    image_ref: null,
    structure: [],
    ...over,
  };
}

function segmentOf(id: number, start_ms: number, end_ms: number, text: string): SessionSegment {
  return { id, session_id: 1042, start_ms, end_ms, text, source: "asr", confidence: 0.8 };
}

/**
 * 夹具（`screens` 3 张 / `segments` 6 段，**刻意乱序**）——覆盖契约的全部边界：
 *  · S1 `[0, 5000)` 有图 · S2 `[5000, 12000)` 无 `screen_id`、无图 · S3 `[12000, 12000)` **零宽屏**
 *    （退化为点 12000）且 `image_ref` 解析不出 URL；
 *  · `边界段 [2500,5000)` 与 S1/S2 首尾相接 ⇒ **只属 S1**（半开区间）；
 *  · `跨屏段 [8000,13000)` 同时属 S2 与 S3（重叠归属 ⇒ 两张印张都出现）；
 *  · `并列段 [8000,9000)` 与 `跨屏段` **同 `start_ms`** ⇒ 靠 `id` 升序定序（7004 在 7006 前）；
 *  · `屏外段 [20000,21000)` 与任何屏都不重叠 ⇒ 本视图**不出现**（原文视图才承载它）。
 */
const SCREENS: readonly SessionScreen[] = [
  screenOf({ first_seen_ms: 0, last_seen_ms: 5000, screen_id: 1, title: "开场", image_ref: "full/s1.webp" }),
  screenOf({ first_seen_ms: 5000, last_seen_ms: 12000 }),
  screenOf({ first_seen_ms: 12000, last_seen_ms: 12000, screen_id: 3, image_ref: UNRESOLVABLE_REF }),
];
const SEGMENTS: readonly SessionSegment[] = [
  segmentOf(7006, 8000, 9000, "并列段"),
  segmentOf(7003, 5000, 8000, "中段讲述"),
  segmentOf(7005, 20000, 21000, "屏外段"),
  segmentOf(7001, 0, 2500, "开场白"),
  segmentOf(7004, 8000, 13000, "跨屏段"),
  segmentOf(7002, 2500, 5000, "边界段"),
];

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
    segments: [...SEGMENTS],
    ocr_blocks: [],
    screens: [...SCREENS],
    ...over,
  };
}

/** 注入槽（容器给的那一支）的函数形态 */
type ImageUrlFn = (ref: string | null) => string | null;

/** 注入槽的 spy：`INJECTED://<ref>`；对 `UNRESOLVABLE_REF` 返回 null（模拟「无图集/拉取失败」） */
function imageUrlOf(): Mock<ImageUrlFn> {
  return vi.fn<ImageUrlFn>((ref) => (ref === null || ref === UNRESOLVABLE_REF ? null : `${IMAGE_PREFIX}${ref}`));
}

interface Rendered {
  readonly view: ReturnType<typeof render>;
  readonly imageUrl: Mock<ImageUrlFn>;
}
function renderView(detail: SessionDetail = detailOf(), imageUrl = imageUrlOf()): Rendered {
  const view = render(<SessionProofView detail={detail} imageUrl={imageUrl} />);
  return { view, imageUrl };
}

/** 全部印张（DOM 顺序） */
const sheets = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[data-proof-sheet]")];
/** 某张印张的正文段文本（DOM 顺序，逐字） */
const bodyTextsOf = (sheet: HTMLElement): string[] =>
  [...sheet.querySelectorAll<HTMLElement>("[data-proof-body] p")].map((p) => p.textContent ?? "");
/** 某张印张的图注位文本 */
const figureTextOf = (sheet: HTMLElement): string =>
  sheet.querySelector<HTMLElement>("[data-proof-figure]")?.textContent ?? "";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => Promise.reject(new Error(`invoke not mocked: ${cmd}`)));
  convertFileSrcMock.mockClear();
});
afterEach(() => cleanup());

describe("SessionProofView（批 5 T8 · P5 起 = C14② 的第一条判据）", () => {
  it("P5 不 invoke：渲染整块（含空态分支）后 `invoke` 零调用 —— 视图不自己取数", () => {
    renderView();
    expect(invokeMock).not.toHaveBeenCalled();
    cleanup();
    // 空态分支同样不取数（两个 return 路径都要判，否则「空态里偷偷拉一次」不会被发现）
    renderView(detailOf({ screens: [], segments: [] }));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("P1 印张数/顺序/序号/区间时间码；`screens` 为空 ⇒ 0 张印张 + EmptyState（根仍在）", () => {
    renderView();
    const root = document.querySelector('[data-testid="session-proof-view"]');
    expect(root).not.toBeNull();
    expect(sheets()).toHaveLength(SCREENS.length);
    // 顺序 = `screens` 的给定顺序（不重排）；锚点值逐字 = first_seen_ms
    expect(sheets().map((s) => s.getAttribute("data-proof-sheet"))).toEqual(["0", "5000", "12000"]);
    // 序号 = `screen_id ?? index + 1`（S2 无 screen_id ⇒ 用序号 2）
    const numbers = sheets().map((s) => s.querySelector("p")?.textContent);
    expect(numbers).toEqual(["印张 1", "印张 2", "印张 3"]);
    // 区间时间码逐字 = `fmtMs(first) – fmtMs(last)`（防「自己实现一个格式化」）
    for (const [i, screen] of SCREENS.entries()) {
      expect(
        sheets()[i].textContent,
        `第 ${i + 1} 张印张的时间码与 fmtMs 不一致`,
      ).toContain(`${fmtMs(screen.first_seen_ms)} – ${fmtMs(screen.last_seen_ms)}`);
    }

    cleanup();
    renderView(detailOf({ screens: [], segments: [] }));
    expect(sheets()).toHaveLength(0);
    expect(document.querySelector('[data-testid="session-proof-view"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="session-proof-empty"]')).not.toBeNull();
    expect(document.body.textContent).toContain("本会话无画面要点");
  });

  it("P2 配图：`image_ref` 为空 ⇒ 无 `<img>`；非空 ⇒ `src` 逐字 = 注入 `imageUrl()` 的返回；图注位恒在", () => {
    const { imageUrl } = renderView();
    const imgs = [...document.querySelectorAll<HTMLImageElement>("img")];
    // 只有 S1 出图：S2 的 `image_ref` 是 null、S3 的 ref 解析不出 URL（两者都不许出图）
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe(`${IMAGE_PREFIX}full/s1.webp`);
    // `src` 必须来自**注入槽**：mock 的 `convertFileSrc` 前缀不同 ⇒ 绕过注入槽自己转 URL 时这里红
    expect(convertFileSrcMock).not.toHaveBeenCalled();
    // 注入槽只被**非空 ref** 调用（空 ref 的答案视图自己就知道）
    expect(imageUrl.mock.calls.map((c) => c[0])).toEqual(["full/s1.webp", UNRESOLVABLE_REF]);
    // 图注位恒在（3/3）：无图的两张印张保留降级文案，而不是整块消失
    expect(sheets().map(figureTextOf)).toEqual(["配图 1", "本屏未归档配图", "本屏未归档配图"]);
    for (const sheet of [sheets()[1], sheets()[2]]) {
      expect(sheet.querySelectorAll("img")).toHaveLength(0);
    }
  });

  it("P3 正文按区间归属：每张印张的段集合与顺序（逐字）—— 含首尾相接、跨屏重叠、并列同 ms、屏外段", () => {
    renderView();
    // 期望值是**字面量真值**（不是把源码谓词抄一遍）：边界规则见夹具注释
    expect(sheets().map(bodyTextsOf)).toEqual([
      ["开场白", "边界段"],
      ["中段讲述", "跨屏段", "并列段"],
      ["跨屏段"],
    ]);
    // 屏外段不出现（印样是派生形态；「原文不丢」由默认原文视图承载）
    expect(document.body.textContent).not.toContain("屏外段");
    // 正文段总数 = 2（S1）+ 3（S2）+ 1（S3），其中「跨屏段」在两张印张上各出一次（重叠归属）
    expect(document.querySelectorAll("[data-proof-body] p")).toHaveLength(2 + 3 + 1);
  });

  it("P4 只读：全件 0 个 `<button>` / 0 个 `<details>`（印样不得长成卡片流的复制品）", () => {
    renderView();
    expect(document.querySelectorAll("button")).toHaveLength(0);
    expect(document.querySelectorAll("details")).toHaveLength(0);
    expect(document.querySelectorAll("summary")).toHaveLength(0);
    // 也没有框选 / 单屏 toast 的痕迹（那些是原文视图里 SessionScreenCards 的面）
    expect(document.querySelectorAll('[data-testid*="toast"]')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("box-select");
  });
});
