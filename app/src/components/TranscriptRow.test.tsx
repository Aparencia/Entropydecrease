// @vitest-environment jsdom
/**
 * TranscriptRow.test.tsx — 采集期转写行渲染 + **逐段显影**（#2）在采集期的落点判据（批 7 T20）。
 *
 * @ai-context 本文件守两件事（各自能独立变红）：
 *   ① **行渲染形态**（拆件守恒）：定稿行的时间码/来源色点/正文、未沉淀行的「按句读一对多 + 尾段 …」
 *      —— 这是 `LiveTranscriptStream.tsx` 拆件后**新增的**回归面（拆前该文件无同名测试）。
 *   ② **显影的落点锚点**（§C9.16 的 7b 半 · R8.5 结构锚点优先于时间判据）：逐行一个容器（`ref`）+
 *      `data-seg-id`（`SEGMENT_SELECTOR`）+ `data-tone="instrument"`（R3.4）+ `data-reveal-epoch`，
 *      且**起始态真的被物化进 DOM**（R50.1：手写 `style.transform` 无效，唯一正解是出口的零时长 tween）。
 * @ai-context 为什么还要一条**源码级**判据：DOM 侧证明不了「每行一个 `ref`」这个接线本身（`ref` 不落
 *   DOM）。故附一条先剥注释的结构探针：本件必须**恰好一处** `ref={box}` 与**一处** `data-seg-id`
 *   （多一处 = 有人又加了一条并行的显影通道；少一处 = 接线被删）。带**负控**（不存在的串 0 命中）。
 * @ai-context 仪器局限：jsdom **不做布局、不 paint** ⇒ 判的是「锚点与起始态存在」，**不是**观感/帧率
 *   （像素与手感归批 8，见 `## 诚实边界`）。`eco` / reduced-motion 下的「零在场 tween」由
 *   `useRevealChoreography.test.tsx` 自己钉，本件不复制第二份 matchMedia 分支。
 * 副作用：挂/卸真实 DOM、触发一次动态 import（GSAP 出口）、读写档位记忆（localStorage）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stripComments } from "../ui/primitives/sliceScan";
import { fmtMs } from "../utils/fmt";
import { PendingRows, TranscriptRow } from "./TranscriptRow";
import type { PendingLine, TranscriptLine } from "./TranscriptRow";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 先剥注释再扫（先例 `sliceScan.stripComments`）⇒ 文件头注释里提到 `data-seg-id` 不产生幻影命中 */
const SRC = stripComments(readFileSync(join(HERE, "TranscriptRow.tsx"), "utf8"));
const countOf = (needle: string): number => SRC.split(needle).length - 1;

const LINE: TranscriptLine = { id: 7, time: 65_000, source: "subtitle", text: "这一句是定稿的字幕行" };
const ASR_LINE: TranscriptLine = { id: 8, time: 66_000, source: "asr", text: "这一句是定稿的语音行" };
const PENDING: readonly PendingLine[] = [
  { id: 1, time: 70_000, text: "已定稿待沉淀", committed: true },
  { id: 2, time: 0, text: "第一句。第二句还没说完", committed: false },
];

const rowOf = (id: number): HTMLElement | null => document.querySelector<HTMLElement>(`[data-seg-id="live-${id}"]`);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("T20-B① · 行渲染形态（拆件后新增的回归面）", () => {
  it("定稿行：时间码经 `fmtMs` · 来源色点带 title 与来源色 · 正文逐字", () => {
    const { container } = render(<TranscriptRow line={LINE} fmtTime={fmtMs} />);
    expect(container.textContent, "时间码必须是 `fmtMs` 的输出（不许就地另写一份格式化）").toContain(fmtMs(65_000));
    expect(container.textContent, "正文逐字").toContain(LINE.text);
    const dot = container.querySelector<HTMLElement>('[title="字幕"]');
    expect(dot, "来源色点的 title 是「字幕」/「语音」二选一").not.toBeNull();
    expect(dot?.style.background, "字幕色点 = 品牌青（拆前逐字）").toBe("rgb(13, 148, 136)");
  });

  it("语音行：色点 title 与色值随来源切换（与字幕行**可区分**）", () => {
    const { container } = render(<TranscriptRow line={ASR_LINE} fmtTime={fmtMs} />);
    const dot = container.querySelector<HTMLElement>('[title="语音"]');
    expect(dot, "语音色点的 title").not.toBeNull();
    expect(dot?.style.background, "语音色点 = 弱化灰（拆前逐字）").toBe("rgb(156, 163, 175)");
  });

  it("未沉淀行：已定稿 1 行 + 识别中按句读**一对多**展开且尾段加 …（拆前行为逐字）", () => {
    const { container } = render(<PendingRows partials={PENDING} fmtTime={fmtMs} elapsedMs={71_000} />);
    const text = container.textContent ?? "";
    expect(text, "已定稿待沉淀行原样出").toContain("已定稿待沉淀");
    expect(text, "识别中按句读切分：第一句（带句读）").toContain("第一句。");
    expect(text, "尾段（无句读）加 … —— 它是「仍在识别」的唯一可见信号").toContain("第二句还没说完…");
    expect(text, "首行带的是 elapsedMs 的实时时钟，不是行时间").toContain(fmtMs(71_000));
    expect(container.querySelectorAll('[title="识别中"]'), "识别中按句读**一对多**：两句 ⇒ 两个识别中色点（拆前形态）").toHaveLength(2);
  });
});

describe("T20-B② · 逐段显影在采集期的落点锚点（§C9.16 的 7b 半）", () => {
  it("逐行结构锚点：`data-seg-id` 在**基调容器**上、容器是行本体的父节点（= 逐行一个 ref）", () => {
    const { container } = render(<TranscriptRow line={LINE} fmtTime={fmtMs} />);
    const row = rowOf(7);
    expect(row, "`data-seg-id=live-<id>` 缺 ⇒ `SEGMENT_SELECTOR` 取不到这一行").not.toBeNull();
    expect(container.querySelectorAll("[data-seg-id]"), "一行恰一个段锚点").toHaveLength(1);
    expect(row?.getAttribute("data-tone"), "R3.4：每个动效落点显式声明基调（采集面 = 精密仪器）").toBe("instrument");
    expect(row?.getAttribute("data-reveal-epoch"), "R8.5 的结构锚点：持有的世代号在 DOM 上").toBe("0");
    expect(row?.parentElement?.className, "行本体挂在**容器**里（容器 = 被动画的那个块；行本体是它的子节点）").toBe("");
    expect(row?.parentElement?.parentElement, "容器再往上是渲染宿主").toBe(container);
  });

  it("起始态被物化进 DOM：出口的零时长 tween 真写了 `transform`（R50.1：手写 style 无效）", async () => {
    render(<TranscriptRow line={LINE} fmtTime={fmtMs} />);
    await waitFor(
      () => expect(rowOf(7)?.style.transform ?? "", "显影的起点没有落进 DOM ⇒ 出口没被接上").not.toBe(""),
      { timeout: 5000 },
    );
  });

  it("源码级结构探针（先剥注释）：`ref={box}` 与 `data-seg-id` **各恰一处** + 负控 0 命中", () => {
    expect(countOf("ref={box}"), "逐行一个容器 `ref`（多一处 = 并行的第二条显影通道）").toBe(1);
    expect(countOf("data-seg-id"), "段锚点恰一处").toBe(1);
    expect(countOf("useRevealChoreography(box"), "逐行调用显影编排（整列表一个容器会旧行重播）").toBe(1);
    expect(countOf("zzzNoSuchAnchorZzz"), "负控：不存在的串必须 0 命中（否则上面的计数不可信）").toBe(0);
  });
});
