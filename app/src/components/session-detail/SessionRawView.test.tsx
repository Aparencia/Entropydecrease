// @vitest-environment jsdom
/**
 * SessionRawView.test.tsx — **#2「显影编排」的落点判据 + R11.3 共存判据**（批 6 波 C · T28）。
 *
 * @ai-context Why 新建而不是追加：本视图**批 5 起就没有同名测试**（实测：全仓只有
 *   `components/SessionDetailPanel.test.tsx` 经真面板间接渲染它）⇒ 显影的落点与低置信墨度的
 *   落点都没有**直接**判据。本文件把两件事变成机器判据：
 *   ① **落点 = 课后**（R5.2 逐字）：显影的容器（`data-tone="paper"`）与逐段锚点
 *      （`data-seg-id`）都在**本视图的产物**里，且 `[data-seg-id]` 与容器内的锚点**逐序数组相等**；
 *   ② **与 R11.3 共存**（本任务最重要的一条）：低置信段落**同时**带 `ed-text--low-confidence`
 *      （CSS `animation` 动 `opacity`）**与**显影写的内联 `transform`，且两处**互不覆盖** ——
 *      机器形态 = 「类名仍在 ∧ `style.transform` 有值 ∧ `style.opacity` 为空（显影从不染指墨度）」。
 *      变异 M7（把显影改成动 `opacity`）就是死在这一条上。
 *   ⚠️ 既有 DOM 与文案**一条不许改**：本文件逐字断言 `seg-{sessionId}-{segId}` 锚点（`SessionDetailPanel
 *   .test.tsx` 的 P1/P2 依赖它）、`fmtMs` 时间码与三处来源文案。
 *
 * @ai-context 仪器边界：只 mock **模块边界**（两个带 IPC / asset 的子块），**不 mock** 被测件与
 *   `useRevealChoreography` —— 显影的物化走真 hook + 真的动态 `import("../../motion/controls")`。
 *   时间线在本文件里是**生产时基**（视图不传 `paused`）⇒ 只断「有值 / 类名 / 逐序数组」这类
 *   **非时序**读数（数值与时序判据在 `useRevealChoreography.test.tsx` 的 paused 时基上做）。
 *
 * 副作用：挂/卸真实 DOM、建 GSAP 时间线（`afterEach` 收尸）、读写档位记忆（`localStorage`）。
 * 边界：**观感与真实帧率本批未测**（jsdom 不排版、无 paint）—— 本文件不判「显影看起来如何」。
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "../../motion/engine";
import { MOTION_INTENSITY_KEY } from "../../motion/intensity";
import { tweenCount } from "../../test/motionHarness";
import type { SessionDetail } from "../../types";
import { fmtMs } from "../../utils/fmt";

vi.mock("./SessionScreenCards", () => ({ default: () => <div data-testid="screen-cards" /> }));
vi.mock("../ImageGallery", () => ({ default: () => <div data-testid="image-gallery" /> }));

import SessionRawView from "./SessionRawView";

const LOW = "ed-text--low-confidence";
const noop = () => {};
/** 三段：中置信 / **低置信（0.3 < 0.5）** / 无置信度（null ⇒ 不算低置信） */
const SEGMENTS = [
  { id: 7001, session_id: 1042, start_ms: 0, end_ms: 2500, text: "第一段讲述", source: "subtitle", confidence: 0.9 },
  { id: 7002, session_id: 1042, start_ms: 2500, end_ms: 5000, text: "第二段低置信讲述", source: "asr", confidence: 0.3 },
  { id: 7003, session_id: 1042, start_ms: 5000, end_ms: 8000, text: "第三段讲述", source: "fused", confidence: null },
];
const detailOf = (segments = SEGMENTS): SessionDetail => ({
  session: { id: 1042, title: "化学反应速率", source_window: "Chrome", started_at: 1_700_000_000_000, ended_at: 1_700_000_600_000, status: "finished", kind: null },
  segments,
  ocr_blocks: [],
  screens: [],
});

function renderView(detail: SessionDetail = detailOf()): ReturnType<typeof render> {
  return render(
    <SessionRawView
      detail={detail}
      baseUrl=""
      ocrBlocksByScreen={new Map()}
      selectingScreen={null}
      onSelectScreen={noop}
      panelToast={null}
      onShowToast={noop}
      onClearToast={noop}
      glossarySummary="术语 0 条"
      glossary={[]}
    />,
  );
}

const toneBox = (): HTMLElement => document.querySelector<HTMLElement>('[data-tone="paper"]') as HTMLElement;
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[data-seg-id]")];
const rowIdOf = (el: HTMLElement): string => el.getAttribute("data-seg-id") ?? "";
/** 段落正文（`<Text as="span">` = 行内第三列；低置信类名就落在它身上） */
const textOf = (row: HTMLElement): HTMLElement => row.lastElementChild as HTMLElement;
const hasLow = (row: HTMLElement): boolean => textOf(row).classList.contains(LOW);

beforeEach(() => {
  localStorage.setItem(MOTION_INTENSITY_KEY, "standard");
});
afterEach(() => {
  cleanup();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
});

describe("V1 · 显影的落点 = 课后本视图（R5.2）：容器基调 + 逐段锚点 + 既有 DOM/文案一字未改", () => {
  it("落点：`data-tone=\"paper\"` 容器内**逐序**恰 N 个 `data-seg-id`（数量与顺序都是判据）", async () => {
    const { container } = renderView();
    await waitFor(() => expect(rows().length, "逐段锚点没落地 ⇒ 显影没有可作用的目标").toBe(SEGMENTS.length));
    expect(rows().map(rowIdOf), "逐序数组相等（不是「有 N 个」）").toEqual(SEGMENTS.map((s) => String(s.id)));
    expect([...container.querySelectorAll<HTMLElement>('[data-tone="paper"] [data-seg-id]')].map(rowIdOf), "锚点必须全在基调容器**内**（落点不是别处）").toEqual(SEGMENTS.map((s) => String(s.id)));
    expect(toneBox().getAttribute("data-tone"), "R3.4：会话是「有文字的界面」⇒ 活的纸").toBe("paper");
    // 显影真的把起始态物化到了这些锚点上（不是「锚点在、动效没接上」）
    await waitFor(() => expect(rows().every((r) => r.style.transform !== ""), "显影没有写这些段落的 transform").toBe(true), { timeout: 5000 });
    expect(toneBox().getAttribute("data-reveal-epoch"), "持有的世代号在 DOM 上的锚（R8.5）").toBe("0");
  });

  it("既有 DOM 与文案一条不改：`seg-{sessionId}-{segId}` 锚点 / 时间码 / 三处来源文案逐字在位", () => {
    renderView();
    const detail = detailOf();
    expect([...document.querySelectorAll("[id^='seg-']")].map((el) => el.id), "批 5 的段锚点（SessionDetailPanel P1/P2 依赖）").toEqual(detail.segments.map((s) => `seg-1042-${s.id}`));
    const rowsText = rows().map((r) => r.textContent ?? "");
    expect(rowsText.map((t) => detail.segments.map((s) => t.includes(s.text)).includes(true)), "每段正文逐字在 DOM 里").toEqual(SEGMENTS.map(() => true));
    expect(rowsText[0], "时间码走 `fmtMs` 的唯一出口（既有文案）").toContain(`${fmtMs(0)} – ${fmtMs(2500)}`);
    expect(rowsText.map((t) => ["字幕", "语音", "融合"].find((label) => t.includes(label))), "三处来源标记文案逐序").toEqual(["字幕", "语音", "融合"]);
  });
});

describe("V2 · 与 R11.3 共存：低置信墨度（CSS animation）与显影（GSAP transform）互不覆盖", () => {
  it("低置信段**恰 1 个**带 `ed-text--low-confidence`（逐序数组相等），且同段行上带显影的内联 `transform`", async () => {
    renderView();
    await waitFor(() => expect(rows().every((r) => r.style.transform !== "")).toBe(true), { timeout: 5000 });
    expect(rows().map(hasLow), "只有 confidence = 0.3 的那段是低置信（0.9 / null 都不算）").toEqual([false, true, false]);
    expect(document.querySelectorAll(`.${LOW}`), "低置信落点的计数（R11.3 ③ 的环境层落点）").toHaveLength(1);
    const low = rows()[1] as HTMLElement;
    // 🔴 共存双断言：**同一个段落**上既有 CSS animation 的类名，又有显影写的内联 transform
    // ⚠️ 本落点取**嵌套形态**（与计划 `:1995` 的「共用一个元素」逐字不同 —— 理由逐字登记在
    //    `task-28-report.md`：正文是 `<span>`（`display: inline`），而 `transform` **对行内元素无效**
    //    ⇒ 把显影挂在正文上会是一条**看不见的动画**；改挂**段落行**（`<div>`）后两个动效既不共元素、
    //    也不共属性 ⇒ 「互不覆盖」比计划要求的更强）。
    expect(hasLow(low), "M7（显影改成动 opacity）会连带打掉这条链").toBe(true);
    expect(low.style.transform, "显影的可见通道 = 段落行的 `transform`（不是 `opacity`）").not.toBe("");
    expect(low.contains(textOf(low)), "低置信类名必须在显影目标**之内**（同段落的两个动效）").toBe(true);
    for (const row of rows()) {
      expect(row.style.opacity, "🔴 显影**一个 `opacity` 都不写** ⇒ 墨度通道归 R11.3 的 CSS `animation` 独占").toBe("");
      expect(textOf(row).style.opacity, "墨度层（正文）的内联 `opacity` 也必须为空 ⇒ 零覆盖").toBe("");
      expect(tweenCount(textOf(row)), "正文元素上不许挂 tween（显影的唯一目标是段落行）").toBe(0);
    }
  });
});

describe("V3 · 空态与安全早退（零段落 ⇒ 不建时间线、不抛）", () => {
  it("零段落：空态文案在位 · 零锚点 · 零 tween · 基调容器与世代锚仍在", async () => {
    renderView(detailOf([]));
    expect(rows(), "零段落不该有逐段锚点").toHaveLength(0);
    expect(toneBox().getAttribute("data-tone"), "空态下基调容器照旧声明").toBe("paper");
    expect(document.body.textContent, "既有空态文案（photo 会话另一支）").toContain("本会话无转写段");
    expect(tweenCount(toneBox()), "零段落 ⇒ 不许建编排时间线").toBe(0);
    expect(gsap.globalTimeline.getChildren(false, true, true), "空态下场上没有编排时间线").toHaveLength(0);
  });
});
