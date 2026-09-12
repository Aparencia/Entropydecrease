// @vitest-environment jsdom
/**
 * SessionTriTrackView.align.test.tsx — T27 在**视图层**的集成判据（#1「对齐」的接线：共轴高亮 +
 *   落点登记 + 两条非参考轨的位移真的被写）。
 *
 * @ai-context 与另外两件的分工：`SessionTriTrackView.test.tsx` 的 5 条（T1–T5，批 5 交付）与
 *   `SessionTriTrackView.rail.test.tsx`（T25）**逐字不动**；本件只加 T27 新增的面。⚠️ 本件落在
 *   **新文件**而不是往那 239 行里追加：既有文件只剩 61 行余量（R8.8「贴边文件动手前先量」），
 *   而本件要断的面（逐序高亮集合 + 落点登记 + 属性集合审计）不是几十行能写完的 —— **零余量**的
 *   文件不该再动（先例：T25 也是新开 `…rail.test.tsx` 而非改既有件）。
 * @ai-context 生产侧时间线**不 paused**（ticker 驱动）⇒ 本件只断**方向 / 范围 / 结构**，逐端点的
 *   精确读数归 `useTriTrackAlign.test.tsx`（那是 `paused: true` + `freezeAt` 的确定性面，同
 *   `phaseFreeze.seams.test.tsx` 与 `usePhaseFreeze.test.tsx` 的分工）。
 * @ai-context **不 mock Tauri**：本件不取数、不真播放 ⇒ 没有 `@tauri-apps` 的模块边界可 mock。
 * 副作用：挂 React 树 + 建 GSAP 时间线（`afterEach` 收尸）+ 只读同目录 `TriTrackAlign.css` 的文本。
 *   边界：**jsdom 不排版** ⇒ 「三轨看起来真的对齐了吗」不可判（如实进报告 `## 诚实边界`）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gsap } from "../../motion/engine";
import { animatedProps, currentTransform, tweenCount } from "../../test/motionHarness";
import { stripComments } from "../../ui/primitives/sliceScan";
import type { SessionDetail } from "../../types/session";
import SessionTriTrackView, { COALIGNED_CLASS, ITEM_CLASS } from "./SessionTriTrackView";
import { shiftYOf } from "./useTriTrackAlign";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = stripComments(readFileSync(join(HERE, "TriTrackAlign.css"), "utf8"));
/** 动态 import 的到达窗口（**不是**动画的等待窗口）；同 T29/T25 先例放宽上限）。 */
const WAIT = { timeout: 5000 } as const;
/** 夹具自己写进轨容器的**布局**行内属性（= 视图的 `LANE_STYLE`）。 */
const LAYOUT_PROPS = ["display", "flex-direction", "gap"];
/** 共轴组：9000 时刻三条轨都有条目；另有 0 / 500 两条**不在组里** ⇒ 高亮的**选择性**可判。 */
const MS = 9_000;

function detailOf(): SessionDetail {
  return {
    session: { id: 1042, title: "构图与调色", source_window: "Chrome", started_at: 1_700_000_000_000, ended_at: 1_700_003_800_000, status: "finished", kind: null },
    segments: [
      { id: 9001, session_id: 1042, start_ms: 0, end_ms: 2_500, text: "开场：构图三要素", source: "subtitle", confidence: 0.9 },
      { id: 9003, session_id: 1042, start_ms: MS, end_ms: 12_000, text: "第二段：色轮", source: "fused", confidence: 0.8 },
    ],
    screens: [
      { session_id: 1042, screen_id: 1, first_seen_ms: MS, last_seen_ms: 12_000, title: "调色面板", body: ["色相环"], labels: [], image_ref: null, structure: [] },
    ],
    ocr_blocks: [
      { id: 5001, session_id: 1042, timestamp_ms: MS, text: "色相 / 饱和度", score: 0.93, region: "full" },
      { id: 5002, session_id: 1042, timestamp_ms: 500, text: "课程封面", score: 0.81, region: "subtitle" },
    ],
  };
}
const q = (container: HTMLElement, sel: string): HTMLElement => {
  const el = container.querySelector(sel);
  if (el === null) throw new Error(`没有渲染出 ${sel}`);
  return el as HTMLElement;
};
const laneEl = (container: HTMLElement, track: string): HTMLElement => q(container, `[data-track="${track}"]`);
const yOf = (container: HTMLElement, track: string): number => shiftYOf(currentTransform(laneEl(container, track)));
/** 时间码按钮（T25 起时间码是定位按钮）。 */
const codeAt = (container: HTMLElement, ms: number): HTMLElement => q(container, `[data-track="transcript"] [data-ms="${ms}"] button`);
/** 带共轴高亮类的条目，按 **DOM 序**（= 转写 → 画面 → OCR，T2 的既有判据）写成 `轨@ms`。 */
const highlighted = (container: HTMLElement): string[] =>
  [...container.querySelectorAll(`.${COALIGNED_CLASS}`)].map((el) => {
    const lane = el.closest("[data-track]") as HTMLElement | null;
    return `${lane?.dataset.track ?? "?"}@${(el as HTMLElement).dataset.ms ?? "?"}`;
  });
const rails = () => gsap.globalTimeline.getChildren(false, true, true).length;

afterEach(() => {
  cleanup();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
});

describe("A1 · 共轴 + 同 ms 高亮（R5.1 的后半句）", () => {
  it("点时间码 ⇒ **恰**三个条目（转写/画面/OCR，逐序）带高亮类；非组条目一个都不带；再点 ⇒ 清空", async () => {
    const onSeekMs = vi.fn();
    const { container } = render(<SessionTriTrackView detail={detailOf()} onSeekMs={onSeekMs} />);
    expect(highlighted(container), "未触发时高亮必须是**空集**（不是「全部」）").toEqual([]);

    fireEvent.click(codeAt(container, MS));
    expect(onSeekMs.mock.calls.length, "既有上行口被改动（仍须恰 1 次）").toBe(1);
    expect(onSeekMs.mock.calls[0][0]).toBe(MS);
    expect(highlighted(container), "同 ms 的三个条目高亮共轴关系（DOM 序 = 转写 → 画面 → OCR）").toEqual([
      "transcript@9000",
      "screen@9000",
      "ocr@9000",
    ]);
    // 🔴 第三轨 = OCR（§8.6 的批 5 加注逐字）⇒ 上面那三行里必须有 `ocr@9000`；DOM 顺序另用既有判据钉住
    const at = (track: string): HTMLElement => q(container, `[data-track="${track}"] [data-ms="${MS}"]`);
    const following = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect([following(at("transcript"), at("screen")), following(at("screen"), at("ocr"))]).toEqual([true, true]);
    // 每个条目都带**基类**（高亮类必须是 `<基类>--<修饰>` 形状，而不是一个孤立的类名）
    const bare = [...container.querySelectorAll("[data-ms]")].filter((el) => !el.classList.contains(ITEM_CLASS));
    expect(bare.map((el) => (el as HTMLElement).dataset.ms), "有条目掉了基类").toEqual([]);

    fireEvent.click(codeAt(container, MS)); // 反向：再次触发 ⇒ 对齐 → 错位 ⇒ 高亮清空
    expect(highlighted(container), "反向没有清掉共轴高亮").toEqual([]);
  });
});

describe("A2 · 落点登记与位移接线（只有两条**非参考轨**被写）", () => {
  it("动效落点带 `data-tone=\"instrument\"`（R3.4）；挂载即物化错位位形；转写轨（时间基）零位移", async () => {
    const { container } = render(<SessionTriTrackView detail={detailOf()} />);
    expect(q(container, "[data-track]").parentElement?.parentElement?.getAttribute("data-tone"), "落点没有声明基调").toBe("instrument");
    await waitFor(() => expect([yOf(container, "screen"), yOf(container, "ocr")]).toEqual([8, -8]), WAIT);
    expect(animatedProps(laneEl(container, "transcript")), "转写轨是时间基 ⇒ 不许被位移").not.toContain("transform");
    expect(rails(), "挂载只物化静态位形 ⇒ 零编排时间线").toBe(0);
  });
});

describe("A3 · 触发真的起了编排（方向 / 范围口径）与属性集合审计（R8.4）", () => {
  it("点时间码 ⇒ 两条非参考轨各起 1 条时间线、位移落在 [对齐位, 错位位] 之间；越界属性恰是夹具的布局属性", async () => {
    const { container } = render(<SessionTriTrackView detail={detailOf()} />);
    await waitFor(() => expect(yOf(container, "screen")).toBe(8), WAIT);
    fireEvent.click(codeAt(container, MS));
    await waitFor(() => expect(rails(), "两条非参考轨各 1 条编排时间线").toBe(2), WAIT);
    expect([tweenCount(laneEl(container, "screen")), tweenCount(laneEl(container, "ocr"))]).toEqual([1, 1]);
    // 生产侧不 paused ⇒ 只断方向/范围（端点精确读数在 `useTriTrackAlign.test.tsx` 的 paused 面）
    expect([yOf(container, "screen") <= 8, yOf(container, "screen") >= 0], "位移必须落在错位位与对齐位之间").toEqual([true, true]);
    const props = animatedProps(laneEl(container, "screen"));
    expect(props, "transform 必须真被写（否则本条是空真）").toContain("transform");
    expect(props.filter((p) => !["transform", "translate", "rotate", "scale", "opacity", "filter"].includes(p)), "越界集合必须恰是夹具的布局属性（delta 口径，同 T33 W4）").toEqual(LAYOUT_PROPS);
  });
});

describe("A4 · 反向的第二条路「切走再回」（R5.1 逐字）", () => {
  it("对齐后卸载（切走）⇒ 时间线被收尸；重挂（再回）⇒ 回错位位形、无高亮", async () => {
    const first = render(<SessionTriTrackView detail={detailOf()} />);
    expect(rails(), "前置用例有残留 ⇒ 下面的计数会被做假").toBe(0);
    await waitFor(() => expect(yOf(first.container, "screen")).toBe(8), WAIT);
    fireEvent.click(codeAt(first.container, MS));
    await waitFor(() => expect(rails(), "两条非参考轨各 1 条编排时间线").toBe(2), WAIT);
    expect(highlighted(first.container)).toHaveLength(3);

    first.unmount(); // 切走：容器卸载惰性视图（`SessionViewHost` 的 H2 行为）
    expect(rails(), "切走后时间线仍在飞 ⇒ 卸载没有收尸").toBe(0);
    const again = render(<SessionTriTrackView detail={detailOf()} />);
    await waitFor(() => expect(yOf(again.container, "screen"), "重挂 ⇒ 起始态 = 错位（反向的第二条路）").toBe(8), WAIT);
    expect([yOf(again.container, "ocr")]).toEqual([-8]);
    expect(highlighted(again.container), "重挂后残留了共轴高亮").toEqual([]);
    expect(rails(), "重挂只物化静态位形 ⇒ 零编排时间线").toBe(0);
  });
});

describe("A5 · 高亮落点的样式接缝（TriTrackAlign.css）", () => {
  it("选择器 = 修饰类 · 颜色只经 `var(--ed-link)` · **零** transition/animation/@media/z-index/色值字面量", () => {
    expect(CSS, "修饰类没有规则 ⇒ 「高亮」是空话").toContain(`.${COALIGNED_CLASS}`);
    expect(COALIGNED_CLASS, "高亮类必须是 `<基类>--<修饰>` 形状").toBe(`${ITEM_CLASS}--coaligned`);
    expect(CSS, "高亮取 `--ed-link`（其语义含「时间码」）").toContain("var(--ed-link)");
    expect(CSS, "色值只许在 tokens.css 与生成器里").not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    // 零 transition/animation ⇒ 不必进 `motion.css` 的 reduced-motion 名单（R48.1 的机制缺口不适用本落点）
    expect(CSS, "transition-only 落点会加不进 reduced-motion 名单（R48.1）").not.toMatch(/transition|animation|@keyframes/);
    expect(CSS, "本层不新增媒体查询（全仓只许一条 reduced-motion 块）").not.toContain("@media");
    expect(CSS, "层级只在 ui/zIndex.ts").not.toContain("z-index");
  });
});
