// @vitest-environment jsdom
/**
 * SessionScreenCards.test.tsx — 拆件 B 的**安全网判据**（批 5 · T3 Step 1）。
 *
 * @ai-context: 为什么先立判据再抽件：`SessionScreenCards.tsx` 是批 5 开工时**无同名测试、
 *              全仓测试 0 处 import** 的文件（计划 §Task 3 实测），而 C3 要求把它退化为
 *              「每屏一卡的列表容器」并抽出 `SessionScreenCard` 单卡 —— 没有判据的抽件无法证明
 *              「行为等价」。本文件钉住**今天**的五条用户可见行为，**抽件前后都必须逐字绿**。
 *
 * @ai-context **C16-STOP2 的强化口径（控制方已裁）**：C3 原文写「抽件后 `data-testid` 集合不变」，
 *              但该文件今天 `data-testid` **实测 0 处** ⇒ 那是**空真**。改用强化口径：
 *              ① id 锚点集合恰等（S1）② 卡片计数（S2）③ 逐字文案（S3）④ 展开态行为（S4）
 *              ⑤ 框选态留容器的可观测面（S5）+ **阳性对照**（S1/T1 各自证明仪器有牙）。
 *              **不许**退化成「渲染不报错」这类弱判据（控制方逐字）。
 *              T1 仍保留 `data-testid` 集合断言（今天为**空集**）⇒ **若日后新增 `data-testid`，
 *              该集合判据自动生效**（新增即必须同步 `FROZEN_TESTIDS` 并触发一次评审）。
 *              另：本文件**不设源码文本断言、不设快照**（C15 纪律）。
 *
 * @ai-context 仪器边界：只 mock **模块边界**（`@tauri-apps/api/core`：`invoke` 冻成 mock、
 *              `convertFileSrc` 给可预测串）。框选 overlay（`BoxSelectOverlay`）**不 mock** ——
 *              「框选态留容器」正是 S5 要判的东西。S4 的原生 `<details>` 翻转行为已用
 *              `tmp/t3/probe-details-toggle.mjs` 实测 jsdom 30.0.1 会翻（不是靠记忆）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { SessionOcrBlock, SessionScreen } from "../../types";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

import SessionScreenCards from "./SessionScreenCards";

const SESSION_ID = 1042;
const noop = () => {};

/** 三屏 fixture：① 有标题/标签/结构/配图 ② `screen_id === null`（走 `i + 1` 兜底）且无图 ③ 只有标签+图 */
function screenOf(over: Partial<SessionScreen>): SessionScreen {
  return {
    session_id: SESSION_ID,
    screen_id: 1,
    first_seen_ms: 1000,
    last_seen_ms: 4000,
    title: null,
    body: [],
    labels: [],
    image_ref: null,
    structure: [],
    ...over,
  };
}

const SCREENS: SessionScreen[] = [
  screenOf({
    screen_id: 1, first_seen_ms: 1000, last_seen_ms: 4000, title: "第一屏标题",
    body: ["正文甲", "正文乙"], labels: ["标签一", "标签二"], image_ref: "screens/a.png",
    structure: [{ kind: "table", text: "表格原文", rendered: "|a|b|" }],
  }),
  screenOf({ screen_id: null, first_seen_ms: 2500, last_seen_ms: 6000, body: ["正文丙"] }),
  screenOf({ screen_id: 3, first_seen_ms: 9000, last_seen_ms: 12000, labels: ["标签三"], image_ref: "screens/c.png" }),
];

/** 屏号兜底（`screen_id === null` ⇒ `i + 1`）与时间码的**逐字**期望（S2 用） */
const HEADERS = ["📄 屏 1 · 00:01 – 00:04", "📄 屏 2 · 00:02 – 00:06", "📄 屏 3 · 00:09 – 00:12"];

/** 锚点集合（排序后）——**唯一 DOM 锚点**：`id={`ocr-${sessionId}-${first_seen_ms}`}`（`:89`） */
const ANCHORS = ["ocr-1042-1000", "ocr-1042-2500", "ocr-1042-9000"];

function blocksOf(): Map<number, SessionOcrBlock[]> {
  return new Map([
    [1000, [
      { id: 1, session_id: SESSION_ID, timestamp_ms: 1000, text: "块文本甲", score: 0.9, region: "top" },
      { id: 2, session_id: SESSION_ID, timestamp_ms: 2500, text: "块文本乙", score: 0.8, region: "top" },
    ]],
    [9000, [{ id: 3, session_id: SESSION_ID, timestamp_ms: 9000, text: "块文本丙", score: 0.7, region: "bottom" }]],
  ]);
}

function propsOf(over: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    kind: null as string | null,
    screens: SCREENS,
    ocrBlockCount: 3,
    baseUrl: "asset://localhost/screens",
    ocrBlocksByScreen: blocksOf(),
    selectingScreen: null as number | null,
    onSelectScreen: noop,
    panelToast: null as { screenKey: number; msg: string } | null,
    onShowToast: noop,
    onClearToast: noop,
    ...over,
  };
}

/** 屏卡容器的 id 集合（**排序后**；S1 的仪器） */
const anchors = (): string[] => [...document.querySelectorAll("[id^='ocr-']")].map((el) => el.id).sort();
/** 屏卡容器（**文档顺序**；S2 的仪器） */
const cards = (): Element[] => [...document.querySelectorAll("[id^='ocr-']")];
const cardText = (i: number): string => cards()[i]?.textContent ?? "";
const bodyText = (): string => document.body.textContent ?? "";
const buttonWith = (label: string): HTMLButtonElement[] =>
  [...document.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes(label)) as HTMLButtonElement[];

beforeEach(() => invokeMock.mockReset());
afterEach(() => cleanup());

describe("SessionScreenCards · 安全网（批 5 T3 Step 1；抽件前后逐字不变）", () => {
  it("S1 id 锚点集合恰等：逐屏 `ocr-{sessionId}-{first_seen_ms}`（跨文件契约，SessionsPage 的 scrollIntoView 消费）", () => {
    render(<SessionScreenCards {...propsOf()} />);
    expect(anchors()).toEqual(ANCHORS);
    expect(new Set(anchors()).size).toBe(SCREENS.length); // 无重复锚点（无「同屏两卡」）
    // 阳性对照：同一支选择器在**已知带 id 的样本**上必须命中 —— 防「选择器静默失效 ⇒ 空集绿」
    const probe = document.createElement("div");
    probe.id = "ocr-probe-1";
    document.body.appendChild(probe);
    expect(anchors()).toContain("ocr-probe-1");
    probe.remove();
    // 锚点由**容器**给出且格式逐字：换 sessionId ⇒ 每条锚点整体换（抽件后仍由容器拼）
    cleanup();
    render(<SessionScreenCards {...propsOf({ sessionId: 777 })} />);
    expect(anchors()).toEqual(ANCHORS.map((a) => a.replace("1042", "777")));
  });

  it("S2 卡片数 = screens.length（每屏一块，无隐藏空卡）且逐块与 fixture 一一对应", () => {
    render(<SessionScreenCards {...propsOf()} />);
    expect(cards()).toHaveLength(SCREENS.length);
    // 逐块对拍：第 i 块的文本里必须有第 i 屏的屏头（屏号兜底 `i + 1` 与时间码都逐字）
    for (let i = 0; i < SCREENS.length; i += 1) {
      expect(cardText(i), `第 ${i} 块与第 ${i} 屏不对应`).toContain(HEADERS[i]);
    }
    // 0 屏 ⇒ 0 块（空态不产出空卡）
    cleanup();
    render(<SessionScreenCards {...propsOf({ screens: [] })} />);
    expect(cards()).toHaveLength(0);
  });

  it("S3 逐字文案：h3（两种 kind）· 空态（两种 kind）· 正文 · 标签 · 结构 · 块级明细标题", () => {
    render(<SessionScreenCards {...propsOf()} />);
    expect(document.querySelector("h3")?.textContent).toBe("画面要点（关键帧纯图） · 3 屏");
    expect(bodyText()).toContain("第一屏标题");
    expect(bodyText()).toContain("正文甲");
    expect(bodyText()).toContain("标签：标签一 · 标签二");
    expect(bodyText()).toContain("[table] |a|b|");
    expect(bodyText()).toContain("📊 table");
    expect(bodyText()).toContain("块级明细（2 块，可复查误合并）");
    expect(bodyText()).toContain("[00:01] 块文本甲");
    expect(bodyText()).toContain("✂ 框选截取");
    // 0 屏 + 非图文会话 ⇒ 空态文案（逐字）
    cleanup();
    render(<SessionScreenCards {...propsOf({ screens: [] })} />);
    expect(document.querySelector("p")?.textContent).toBe("本会话无关键帧图");
    // 图文会话（kind === "photo"）：h3 文案 + 原始块数提示 + 空态文案都换一套（逐字）
    cleanup();
    render(<SessionScreenCards {...propsOf({ kind: "photo", ocrBlockCount: 7 })} />);
    expect(document.querySelector("h3")?.textContent).toBe("画面要点（OCR） · 3 屏（原始 7 块）");
    cleanup();
    render(<SessionScreenCards {...propsOf({ kind: "photo", screens: [] })} />);
    expect(document.querySelector("p")?.textContent).toBe("本会话无画面识别内容");
  });

  it("S4 展开态行为：原生 `<details>` 的 `open` 点击 summary 后翻转，且块级明细文本始终在 DOM", () => {
    render(<SessionScreenCards {...propsOf()} />);
    const details = [...document.querySelectorAll("details")] as HTMLDetailsElement[];
    expect(details, "只有 1000 / 9000 两屏有 OCR 块 ⇒ 恰两个块级明细").toHaveLength(2);
    const first = details[0]!;
    const summary = first.querySelector("summary")!;
    expect(summary.textContent).toBe("块级明细（2 块，可复查误合并）");
    expect(first.open).toBe(false);
    expect(first.textContent).toContain("[00:01] 块文本甲"); // 闭合态也在 DOM（原生 details 语义）
    fireEvent.click(summary);
    expect(first.open).toBe(true);
    fireEvent.click(summary);
    expect(first.open).toBe(false);
  });

  it("S5 框选态留容器：✂ ⇒ onSelectScreen(first_seen_ms) + onClearToast 各 1 次；overlay 只在选中屏出现", () => {
    const onSelectScreen = vi.fn();
    const onClearToast = vi.fn();
    const view = render(<SessionScreenCards {...propsOf({ onSelectScreen, onClearToast })} />);
    const overlayTitle = '[title="拖拽框选要截取的结构区域"]';
    expect(document.querySelector(overlayTitle)).toBeNull();
    const frame = buttonWith("✂ 框选截取");
    expect(frame, "无图屏（2500）不出现 ✂ ⇒ 有图的 1000 / 9000 两屏各一个").toHaveLength(2);
    fireEvent.click(frame[0]!);
    expect(onSelectScreen).toHaveBeenCalledTimes(1);
    expect(onSelectScreen).toHaveBeenCalledWith(1000);
    expect(onClearToast).toHaveBeenCalledTimes(1);
    // 选中态由**容器**的 `selectingScreen` prop 驱动 ⇒ overlay 出现，且只在该屏
    view.rerender(<SessionScreenCards {...propsOf({ selectingScreen: 1000, onSelectScreen, onClearToast })} />);
    expect(document.querySelectorAll(overlayTitle)).toHaveLength(1);
  });
});

/**
 * `data-testid` 冻结表（**今天为空集** —— C16-STOP2 实测该文件 0 处）。
 * ⇒ 「集合不变」今天是空真，这正是改用 S1–S5 强化口径的原因；但这条判据**留着**：
 * 日后谁新增 `data-testid`，这里立刻红，必须同步本表（并触发一次评审）。
 */
const FROZEN_TESTIDS: readonly string[] = [];

const collectTestIds = (root: ParentNode): string[] =>
  [...root.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid") ?? "").sort();

describe("T1 data-testid 集合冻结（附注判据：若日后新增，集合判据自动生效）", () => {
  it("今天 = 冻结表（空集）；同一支收集器在已知样本上必须命中（阳性对照）", () => {
    render(<SessionScreenCards {...propsOf()} />);
    expect(collectTestIds(document.body)).toEqual([...FROZEN_TESTIDS]);
    const probe = document.createElement("div");
    probe.setAttribute("data-testid", "t3-instrument-probe");
    document.body.appendChild(probe);
    expect(collectTestIds(document.body), "收集器静默失效 ⇒ 上一条是空真").toEqual(["t3-instrument-probe"]);
    probe.remove();
    expect(collectTestIds(document.body)).toEqual([...FROZEN_TESTIDS]);
  });
});
