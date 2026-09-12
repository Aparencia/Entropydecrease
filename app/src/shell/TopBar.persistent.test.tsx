// @vitest-environment jsdom
/**
 * @ai-context 两个**常驻状态件**的装配守卫（REQ-274 的对话面板入口 / ADR-007 的采集徽标；批 3 T7 评审 I-2）。
 *
 * Why 单开一个文件而不是塞进 `TopBar.test.tsx`：那个文件已 198/200 行，加不下；且本文件的判据
 *   性质不同（它判的是 **App.tsx 的实际装配**，不是 `TopBar` 组件能力）。
 *
 * Why 需要它（评审 I-2 的实测事实，本文件即其修法）：
 *   `TopBar.test.tsx` 收尾那条用例名逐字承诺「两个常驻状态件都还在顶栏里」，但判据是**源码文本**
 *   （`APP_CODE.includes('testId="dock-toggle"')` / `/capture\.active &&/`）——**文本在哪儿都算数**。
 *   评审者在导出副本里把 `dock-toggle` 从 `<TopBar right={…}>` 挪到 `<main>` 之前（字面量仍在文件里），
 *   `TopBar.test.tsx` **17 passed 全绿**。⇒ 用例名承诺的语义**没有被判据覆盖**。
 *
 * 本文件用两把**独立**的尺子补上（两把都能单独变红）：
 *   ① **结构尺**：扫**真实 `App.tsx`**，逐字符平衡地切出 `right={…}` 属性正文，再在正文里做
 *      **括号平衡包含**判定 ⇒ 「`dock-toggle` 元素与采集徽标条件**都在** `right` 插槽正文内、
 *      且各自完整闭合在其中」被机械判定。挪出去 ⇒ 必红（评审的 M-C 变异体正是这个形状）。
 *      ⚠️ 诚实边界：它读的是**源码结构**、不是运行期 React 树（本仓 `MainShell` 未导出、App 装配
 *      依赖 `listen`/`useCaptureControl` 等 IPC，整树渲染需 mock 一大片）。它能证明「装配写在
 *      right 插槽里」、不能证明「浏览器里真的画出来了」——后者由 ② 的 DOM 判据与本批 CDP 探针分担。
 *   ② **渲染尺**：把 `App.tsx` 里**真实的 props**用括号平衡扫描逐字取出来，喂给真实的 `TopBar` +
 *      `TopBarAction` 渲染，断言两个状态件**真的落在 `nav.ed-topbar__right` 子树内**、文案/回调
 *      契约成立，并附**阴性样本**（不传 `right` ⇒ 两者都不出现），证明这条仪器能红。
 *
 * 副作用：无（只读文件 + jsdom 渲染）。
 * 边界：`right` 正文扫描依赖 `right={` 这一属性写法；写法变了会**抛错**（红），不会静默假绿。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar, TopBarAction, type TopBarProps } from "./TopBar";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 统一成 LF 再解析：本仓 `core.autocrlf=true` ⇒ 工作树可能给 CRLF，平衡扫描的口径必须与换行无关 */
const APP = readFileSync(join(HERE, "..", "App.tsx"), "utf8").replace(/\r\n/g, "\n");

/**
 * 括号平衡扫描器（注释/字符串/模板里的括号**不计数**）—— 普通 TS 函数，**无任何动态执行**。
 * 逐字符用 `s.charAt(i)`（返回 `string`，永不为 `undefined`）⇒ 在 `noUncheckedIndexedAccess`
 *   下也没有下标联合类型的噪音，不需要 `any` / `@ts-expect-error` / 关类型检查。
 * ⚠️ 本段与 `tmp/t7-acceptance/proto-extract.mjs` 的原型同源（原型只是外壳不同，算法一致）。
 */
function skipLineComment(s: string, i: number): number {
  let j = i + 2;
  while (j < s.length && s.charAt(j) !== "\n") j++;
  return j;
}
function skipBlockComment(s: string, i: number): number {
  const j = s.indexOf("*/", i + 2);
  return j < 0 ? s.length : j + 2;
}
function skipQuoted(s: string, i: number): number {
  const q = s.charAt(i);
  let j = i + 1;
  while (j < s.length) {
    if (s.charAt(j) === "\\") { j += 2; continue; }
    if (s.charAt(j) === q) return j + 1;
    if (s.charAt(j) === "\n") return j + 1; // 未闭合（跨行字符串）：行尾收口，别吞掉整份文件
    j++;
  }
  return j;
}
function skipTemplate(s: string, i: number): number {
  let j = i + 1;
  while (j < s.length) {
    if (s.charAt(j) === "\\") { j += 2; continue; }
    if (s.charAt(j) === "`") return j + 1;
    j++;
  }
  throw new Error("模板字符串未闭合");
}
/** 括号平衡扫描；返回 [正文, 闭合符下标]。注释/字符串/模板里的括号不计数 */
function scanBalanced(s: string, open: number): [string, number] {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === "/" && s.charAt(i + 1) === "/") { i = skipLineComment(s, i) - 1; continue; }
    if (c === "/" && s.charAt(i + 1) === "*") { i = skipBlockComment(s, i) - 1; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(s, i) - 1; continue; }
    if (c === "`") { i = skipTemplate(s, i) - 1; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return [s.slice(open + 1, i), i]; }
  }
  throw new Error(`括号未闭合（切片起点 ${open}）`);
}
/** 定位 `name={` 并返回那对平衡花括号之后的第一个字符下标（= 属性正文起点） */
function jsxPropBodyAt(src: string, name: string): number {
  const re = new RegExp(`\\b${name}\\s*=\\s*\\{`, "g");
  const m = re.exec(src);
  if (!m) throw new Error(`找不到 ${name}={ 属性`);
  return m.index + m[0].length;
}
/** 取 `name={` 之后那对平衡花括号的正文（不含花括号本身）—— 即该 JSX 属性的真实内容 */
const jsxPropBody = (src: string, name: string): string => scanBalanced(src, jsxPropBodyAt(src, name) - 1)[0];
function skipToTagEnd(s: string, i: number): number {
  let j = i;
  while (j < s.length) {
    const c = s.charAt(j);
    if (c === '"' || c === "'") { j = skipQuoted(s, j); continue; }
    if (c === "`") { j = skipTemplate(s, j); continue; }
    if (c === ">") return j;
    j++;
  }
  throw new Error("JSX 开始标签未闭合");
}
/** `String.prototype.charAt` 的短名（返回 `string`，避免下标联合类型；`i` 越界时为空串） */
const ch = (src: string, i: number): string => src.charAt(i);
/** 在 JSX 正文里定位标记，返回该标记**所在 JSX 元素的完整正文**（含标记本身） */
function elementContaining(src: string, marker: string): { body: string; open: number; close: number } {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`正文里找不到标记：${marker}`);
  let open = -1;
  for (let i = at - 1; i >= 0; i--) {
    if (ch(src, i) !== "<") continue;
    if (ch(src, i + 1) === "/" || ch(src, i + 1) === " ") continue;
    open = i;
    break;
  }
  if (open < 0) throw new Error(`标记不在任何 JSX 元素内：${marker}`);
  const tagEnd = skipToTagEnd(src, open);
  if (ch(src, tagEnd - 1) === "/") return { body: src.slice(open, tagEnd + 1), open, close: tagEnd };
  const [body, close] = scanBalanced(src, open);
  return { body, open, close };
}

/** App.tsx 里 `right={…}` 属性的**正文**与它在文件里的**绝对起点**（逐字符平衡切出） */
const RIGHT_SLOT_AT = jsxPropBodyAt(APP, "right");
const RIGHT_SLOT = jsxPropBody(APP, "right");
if (APP.slice(RIGHT_SLOT_AT, RIGHT_SLOT_AT + RIGHT_SLOT.length) !== RIGHT_SLOT) {
  throw new Error("right 正文起点与正文对不上（解析器自检失败）");
}
const DOCK_MARKER = 'testId="dock-toggle"';
const BADGE_MARKER = "{capture.active && (";
/**
 * ⚠️ 这两个定位**只在用例体内**调用，不在模块顶层：顶层抛错会让整个文件收集失败（0 test），
 *   那样变异体的红是「文件起不来」而不是「断言红」——证据强度差一档。放进用例 ⇒ 红在断言上。
 *   返回 null 表示「标记不在 right 正文里」（= 缺陷形态），由用例的 expect 给出可读的失败信息。
 */
const dockElementOrNull = () => (RIGHT_SLOT.includes(DOCK_MARKER) ? elementContaining(RIGHT_SLOT, DOCK_MARKER) : null);
const badgeCloseOrNull = () => {
  const at = RIGHT_SLOT.indexOf(BADGE_MARKER);
  return at < 0 ? null : scanBalanced(RIGHT_SLOT, at)[1];
};

/** App.tsx 装配处**真实的** props（逐字取自源码），渲染尺据此喂真组件 —— 不是手抄的近似体 */
const DOCK_PROP_RE = /testId="([^"]+)"\s*\n\s*icon="([^"]+)"\s*\n\s*label="([^"]+)"\s*\n\s*title="([^"]+)"/;
/** 惰性取：marker 不在 right 里时**不在模块顶层抛错**（顶层抛 = 整文件收集失败 = 0 test，证据弱一档） */
function dockProps() {
  const el = dockElementOrNull();
  const m = el ? DOCK_PROP_RE.exec(el.body) : null;
  if (!m) throw new Error("抽取对话面板入口的装配 props 失败（App.tsx 的 right 插槽写法变了？）");
  // ⚠️ testId 里含连字符（`dock-toggle`）⇒ 用 `[^"]+` 而不是 `\w+`。
  // icon 用组件自己的 props 类型（`IconName` 是联合类型，源码抽出来只是 string ⇒ 必须在此收口）
  return { testId: m[1], icon: m[2] as ComponentProps<typeof TopBarAction>["icon"], label: m[3], title: m[4] };
}

const base = { page: "classroom" as const, onSelect: vi.fn(), onOpenSettings: vi.fn(), onOpenPalette: vi.fn() };

/** 与 App.tsx 的 `right` 插槽同形（dock 入口 + 采集中徽标），props 取自上面抽出的真实装配值 */
function rightSlot(onToggle: () => void): TopBarProps["right"] {
  const p = dockProps();
  return (
    <>
      <TopBarAction testId={p.testId} icon={p.icon} label={p.label} title={p.title} onClick={onToggle} />
      <span data-testid="capture-badge">🎙 采集中</span>
    </>
  );
}

afterEach(cleanup);

describe("I-2 结构尺：App.tsx 的 right 插槽正文里必须含两个常驻状态件", () => {
  it("① 解析器自证（陷阱 #1：先证明仪器能命中已知存在的串，否则「包含」判定恒绿）", () => {
    expect(RIGHT_SLOT.length).toBeGreaterThan(200);
    expect(RIGHT_SLOT, "right 插槽里没有 dock 入口 —— 解析器可能切错了块").toContain(DOCK_MARKER);
    expect(RIGHT_SLOT, "right 插槽里没有采集徽标条件").toContain(BADGE_MARKER);
    expect(dockElementOrNull()?.body, "抽出的元素不含 label（元素边界切错）").toContain("label=");
    // 同一把尺子对**不存在的串**必须给 false（阳性/阴性双向对照）
    expect(RIGHT_SLOT.includes('testId="no-such-status-widget"')).toBe(false);
  });

  it("② dock-toggle 与采集徽标都在 right={…} 正文内（挪出去 ⇒ 本用例必红）", () => {
    expect(RIGHT_SLOT.includes(DOCK_MARKER), "REQ-274 的对话面板入口不在顶栏 right 插槽里").toBe(true);
    expect(RIGHT_SLOT.includes(BADGE_MARKER), "ADR-007 的采集徽标不在顶栏 right 插槽里").toBe(true);
  });

  it("③ 两个状态件必须**完整闭合**在 right 内（不许只有开头露出正文）", () => {
    const dock = dockElementOrNull();
    const badgeClose = badgeCloseOrNull();
    expect(dock, "右簇里找不到 dock 元素（无法判闭合）").not.toBeNull();
    expect(badgeClose, "右簇里找不到采集徽标条件（无法判闭合）").not.toBeNull();
    expect((dock as { close: number }).close, "dock 元素跨出了 right 正文边界").toBeLessThan(RIGHT_SLOT.length);
    expect(badgeClose as number, "采集徽标条件跨出了 right 正文边界").toBeLessThan(RIGHT_SLOT.length);
    expect(badgeClose as number).toBeGreaterThan(RIGHT_SLOT.indexOf(BADGE_MARKER));
  });

  it("④ 唯一性：`testId=\"dock-toggle\"` 全文件只此一处，且那一处就落在 right 正文区间内", () => {
    // ②③ 已判「在 right 正文内」；本用例判「全文件没有第二处，且**第一处**不在 right 之外」
    expect((APP.match(/testId="dock-toggle"/g) ?? []).length, "出现了第二个装配点（判据会失去方向）").toBe(1);
    const at = APP.indexOf(DOCK_MARKER);
    expect(at, "全文件找不到 dock 装配点").toBeGreaterThan(-1);
    const inRightRegion = at >= RIGHT_SLOT_AT && at < RIGHT_SLOT_AT + RIGHT_SLOT.length;
    expect(inRightRegion, "dock 装配点的第一次出现在 right 正文区间之外（即被挪去别处）").toBe(true);
    // 阳性对照：同一区间判定对 right 的**起点**必须为真、对文件起点必须为假（证明区间不是全真）
    expect(RIGHT_SLOT_AT >= RIGHT_SLOT_AT && RIGHT_SLOT_AT < RIGHT_SLOT_AT + RIGHT_SLOT.length).toBe(true);
    expect(0 >= RIGHT_SLOT_AT).toBe(false);
  });
});

describe("I-2 渲染尺：两个状态件真的渲染在顶栏右簇 DOM 子树内", () => {
  it("⑤ 阳性：dock 入口与采集徽标都在 nav.ed-topbar__right 子树内（且不在品牌/域 Tab 区）", () => {
    render(<TopBar {...base} right={rightSlot(vi.fn())} />);
    const nav = document.querySelector('nav[data-testid="topbar"]');
    const right = nav?.querySelector(".ed-topbar__right");
    expect(nav, "顶栏没渲染出来").toBeTruthy();
    expect(right, "右簇容器 .ed-topbar__right 不存在").toBeTruthy();
    const dock = document.querySelector(`[data-testid="${dockProps().testId}"]`);
    const badge = document.querySelector('[data-testid="capture-badge"]');
    expect(dock, "REQ-274 的对话面板入口没渲染进 DOM").toBeTruthy();
    expect(badge, "采集徽标没渲染进 DOM").toBeTruthy();
    expect(right?.contains(dock as Node)).toBe(true);
    expect(right?.contains(badge as Node)).toBe(true);
    expect(nav?.querySelector(".ed-topbar__brand")?.contains(dock as Node)).toBe(false);
    expect(nav?.querySelector(".ed-topbar__tabs")?.contains(dock as Node)).toBe(false);
    // 位置语义：右簇里最后一个按钮是齿轮（域 Tab 区不含这两个状态件）
    expect([...(right?.querySelectorAll("button") ?? [])].at(-1)?.getAttribute("data-testid")).toBe("topbar-settings");
  });

  it("⑥ 阴性样本：不传 right ⇒ 两个状态件都不出现（证明这条仪器真的能观测到缺失）", () => {
    const p = dockProps();
    render(<TopBar {...base} />);
    expect(document.querySelector(`[data-testid="${p.testId}"]`), "未传 right 却出现了状态件").toBeNull();
    expect(document.querySelector('[data-testid="capture-badge"]')).toBeNull();
    // 反向对照：同一查询器在⑤的形态下命中过（本文件已渲染过），不是恒 null 的坏选择器
    expect(document.querySelector('nav[data-testid="topbar"]')).toBeTruthy();
  });

  it("⑦ 装配 props 逐字生效：App 侧的 testId / icon / label / title 透传到 DOM", () => {
    const p = dockProps();
    render(<TopBar {...base} right={rightSlot(vi.fn())} />);
    const dock = document.querySelector(`[data-testid="${p.testId}"]`);
    expect(dock?.getAttribute("data-testid")).toBe("dock-toggle");
    expect(dock?.getAttribute("title")).toBe(p.title);
    expect(dock?.querySelector(".ed-topbar__action-label")?.textContent).toBe(p.label);
    expect(dock?.querySelector("svg, img"), "图标没渲染出来（icon 名无效？）").toBeTruthy();
  });

  it("⑧ REQ-274 的唯一显式入口仍可点：点击即触发开合回调，且开合态走 aria-pressed", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TopBar {...base} right={rightSlot(onToggle)} />);
    const dock = document.querySelector(`[data-testid="dock-toggle"]`);
    expect(dock?.getAttribute("aria-pressed"), "未开时不该是按下态").toBeNull();
    fireEvent.click(dock as Element);
    expect(onToggle, "对话面板入口点了没反应（REQ-274 的显式入口失效）").toHaveBeenCalledTimes(1);
    rerender(<TopBar {...base} right={rightSlot(onToggle)} />);
    expect(document.querySelector('[data-testid="dock-toggle"]')).toBeTruthy();
  });
});
