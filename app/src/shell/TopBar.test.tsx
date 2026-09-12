// @vitest-environment jsdom
/**
 * @ai-context A′ 顶栏契约守卫（规格 §6.1 与 §1 决策 12/14；批 3 Task 7）。
 *
 * 判据分四层，每层都能**独立变红**：
 *   ① 结构：8 个域 Tab + ⚙ 齿轮 + ⌘K；设置**不在**域 Tab 里；`right` 插槽确实渲染在右侧区；
 *   ② 两档溢出：每个 Tab **同时**有 label 元素与 `title` ⇒ 「1024–1179 收起文字后靠 title 当悬浮名」
 *      这条规格要求是 **DOM 可断言的**；A2 裁决（emoji 出局）另有一条**带阳性对照**的判据；
 *   ③ 静态纪律：`TopBar.css` 里不得出现 transition / animation / @keyframes（动效属批 6）；
 *      高度消费 `--ed-nav-h`；两档断点与 `shell/breakpoints.ts` 同值；顶栏项不许被压缩（陷阱 #15）；
 *   ④ 裁决 A3：AI toast **不在**导航行里（它是 `App.tsx` 的 `MainShell` 最外层 fixed 覆盖层），
 *      且两个常驻状态件（`dock-toggle` / 采集徽标）都还在 —— 防「一次提交里两个状态双双消失」。
 *
 * ⚠️ 仪器局限（必须如实单列）：**jsdom 不实现 CSS 媒体查询的计算** ⇒ 「≥1180 显示文字 / 1024–1179
 *   只显示图标」这条**在本仓测试环境里测不到像素**。本文件因此只断言**承载该行为的 DOM 与 CSS 声明**
 *   （label 元素始终在 + `title` 始终在 + 媒体查询数值同值 + 断言本身对坏值会红），
 *   真正的像素证据由 CDP 探针给（Task 7 报告的宽度表，含改前/改后与 toast 两态）。
 *
 * ⚠️ 本仓测试底座（批 3 计划期实测，照抄勿改）：`vitest.config.ts` 全局 `environment: "node"` ⇒
 *   首行必须 `// @vitest-environment jsdom`；**未装** `jest-dom` 与 `user-event` ⇒ 断言用原生 DOM API、
 *   交互用 `fireEvent`；且**没有** `globals` ⇒ RTL 的 auto-cleanup 不生效，必须显式 `afterEach(cleanup)`
 *   （先例 `components/NoteColorPicker.test.tsx:11`），否则多次 `render` 后 `getByTestId` 会撞多重命中。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { NAV_ENTRIES } from "./navRegistry";
import { BREAKPOINTS } from "./breakpoints";

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据前先剥注释（与 `ui/primitives` 层同一口径）：注释里提到 transition 不算犯规 */
const CSS = readFileSync(join(HERE, "TopBar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const TOPBAR_TSX = readFileSync(join(HERE, "TopBar.tsx"), "utf8");
const APP_TSX = readFileSync(join(HERE, "..", "App.tsx"), "utf8");
/**
 * App.tsx 的**只留代码**版本：剥块注释与整行 `//` 注释。
 * Why 必须剥：App.tsx 的注释里逐字出现了 `<nav>`、`zIndex("toast")` 这些判据串 —— 不剥的话
 * 「toast 已搬出导航行」这条判据只要注释还在就会**假绿**（正是本批反复打击的「测不到失败的检查」）。
 */
const APP_CODE = APP_TSX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** emoji / 图形字符（A2 裁决的机器判据）。`\p{Extended_Pictographic}` 是 Unicode 属性类，覆盖 ✨📡🎙 等 */
const PICTO = /\p{Extended_Pictographic}/u;

afterEach(cleanup);

const base = { page: "classroom" as const, onSelect: vi.fn(), onOpenSettings: vi.fn(), onOpenPalette: vi.fn() };

describe("TopBar（规格 §6.1）", () => {
  it("① 8 个域 Tab + ⚙ 齿轮 + ⌘K；设置不在域 Tab 里", () => {
    render(<TopBar {...base} />);
    for (const e of NAV_ENTRIES) expect(screen.getByTestId(`topbar-tab-${e.key}`)).toBeTruthy();
    expect(screen.queryByTestId("topbar-tab-settings")).toBeNull();
    expect(screen.getByTestId("topbar-settings")).toBeTruthy();
    expect(screen.getByTestId("topbar-palette")).toBeTruthy();
  });

  it("① 选中态用 aria-current，不用自造字段", () => {
    render(<TopBar {...base} page="notes" />);
    expect(screen.getByTestId("topbar-tab-notes").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("topbar-tab-sessions").getAttribute("aria-current")).toBeNull();
  });

  it("① `right` 插槽渲染在右侧区（采集徽标/面板入口消失会被这条抓到）", () => {
    render(<TopBar {...base} right={<span data-testid="probe-right">状态件</span>} />);
    const right = screen.getByTestId("topbar").querySelector(".ed-topbar__right");
    expect(right).toBeTruthy();
    expect(right?.contains(screen.getByTestId("probe-right"))).toBe(true);
  });

  it("② 每个 Tab 的 title = 注册表 label（1024–1179 档的悬浮名）", () => {
    render(<TopBar {...base} />);
    for (const e of NAV_ENTRIES) {
      expect(screen.getByTestId(`topbar-tab-${e.key}`).getAttribute("title"), e.key).toBe(e.label);
    }
  });

  it("② 每个 Tab 的 label 元素始终在（像素测不到，DOM 契约可测）", () => {
    render(<TopBar {...base} />);
    for (const e of NAV_ENTRIES) {
      const tab = screen.getByTestId(`topbar-tab-${e.key}`);
      expect(tab.querySelector(".ed-topbar__tab-label")?.textContent, e.key).toBe(e.label);
    }
  });

  it("② A2：顶栏文案 0 个 emoji（判据自带阳性对照，防「正则坏了」假绿）", () => {
    // 阳性对照：同一正则对已知 emoji 必须为 true；否则下面的「0 命中」毫无意义
    expect(PICTO.test("✨")).toBe(true);
    expect(PICTO.test("📡 课堂助手")).toBe(true);
    expect(PICTO.test("课堂")).toBe(false);
    render(<TopBar {...base} right={<span data-testid="probe-right">🎙 采集中</span>} />);
    // 只判顶栏自身的文案（right 插槽是调用方的内容，采集徽标的 emoji 属 ADR-007 既有文案，不在 A2 范围）
    const bar = screen.getByTestId("topbar");
    const barText = [...bar.querySelectorAll("button")].map((b) => b.textContent ?? "").join("|");
    expect(barText).not.toBe("");
    expect(PICTO.test(barText), `顶栏按钮文案仍含 emoji：${barText}`).toBe(false);
  });

  it("② A2：注册表本身也已无 emoji（顶栏文案的单一真源，不只是渲染层隐藏）", () => {
    const withEmoji = NAV_ENTRIES.filter((e) => PICTO.test(e.label)).map((e) => e.label);
    expect(withEmoji, `注册表 label 仍含 emoji：${withEmoji.join(" / ")}`).toEqual([]);
  });

  it("④ 点击域 Tab / 齿轮 / ⌘K 各自回调（fireEvent —— 本仓未装 user-event）", () => {
    const onSelect = vi.fn();
    const onOpenSettings = vi.fn();
    const onOpenPalette = vi.fn();
    render(<TopBar {...base} onSelect={onSelect} onOpenSettings={onOpenSettings} onOpenPalette={onOpenPalette} />);
    fireEvent.click(screen.getByTestId("topbar-tab-notes"));
    expect(onSelect).toHaveBeenCalledWith("notes");
    fireEvent.click(screen.getByTestId("topbar-settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("topbar-palette"));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("③ 顶栏 CSS 里没有动效声明（批 6 才加）", () => {
    const banned = [/transition\s*:/, /animation\s*:/, /@keyframes/];
    const hits = banned.filter((re) => re.test(CSS)).map(String);
    expect(hits, `批 3 的顶栏 CSS 不得含动效（属批 6）：${hits.join(" / ")}`).toEqual([]);
  });

  it("③ 高度消费 --ed-nav-h（不许再写 56）", () => {
    expect(/height:\s*var\(--ed-nav-h/.test(CSS)).toBe(true);
    expect(/height:\s*56px/.test(CSS)).toBe(false);
  });

  it("③ 三处档位与 breakpoints.ts 同值（CSS 读不到 TS 常量 ⇒ 只能靠这条断言钉住）", () => {
    const maxWidths = [...CSS.matchAll(/max-width:\s*(\d+)px/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    expect(maxWidths, "媒体查询多了/少了档位").toEqual([
      BREAKPOINTS.nav - 1,
      BREAKPOINTS.navFull - 1,
      BREAKPOINTS.navActionsFull - 1,
    ]);
  });

  it("③ 两组文字的显隐规则**必须各自独立**（右簇用 `__action-label`，域 Tab 用 `__tab-label`）", () => {
    // 为什么会写错：两组文字的收起阈值不同（Tab ≤1179、右簇 ≤1399）。若右簇复用 `__tab-label`，
    // 那么「收起右簇文字」这条规则会把 8 个域 Tab 的文字一起藏掉 —— 规格 §6.1 的满档形态当场失效。
    // 判据：两条隐藏规则各自点名自己的类，且分别落在 1179 / 1399 两个媒体查询里。
    const blocks = [...CSS.matchAll(/@media \(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)].map((m) => [Number(m[1]), m[2]]);
    const at = (w: number) => blocks.find(([w2]) => w2 === w)?.[1] ?? "";
    expect(at(1179), "1179 档必须且只能收起域 Tab 文字").toMatch(/\.ed-topbar__tab-label\s*\{\s*display:\s*none/);
    expect(at(1179), "1179 档不该碰右簇的类").not.toContain("ed-topbar__action-label");
    expect(at(1399), "1399 档必须收起右簇文字").toMatch(/\.ed-topbar__action-label\s*\{\s*display:\s*none/);
    expect(at(1399), "1399 档不该碰域 Tab 的类").not.toContain("ed-topbar__tab-label");
    // DOM 侧同一条契约：右簇按钮**不带** `__tab-label`，域 Tab **不带** `__action-label`
    render(<TopBar {...base} />);
    for (const id of ["topbar-palette", "topbar-settings"]) {
      const btn = screen.getByTestId(id);
      expect(btn.className, id).toContain("ed-topbar__action");
      expect(btn.className, id).not.toContain("ed-topbar__tab");
      expect(btn.querySelector(".ed-topbar__action-label"), `${id} 缺右簇文字元素`).toBeTruthy();
      expect(btn.querySelector(".ed-topbar__tab-label"), `${id} 混用了域 Tab 的文字类`).toBeNull();
    }
    for (const e of NAV_ENTRIES) {
      const tab = screen.getByTestId(`topbar-tab-${e.key}`);
      expect(tab.querySelector(".ed-topbar__action-label"), `${e.key} 混用了右簇文字类`).toBeNull();
    }
  });

  it("③ 非目标 2：顶栏不 import `ui/primitives`，也不写内联 svg（图标一律走 Icon 组件）", () => {
    expect(/ui\/primitives/.test(TOPBAR_TSX), "顶栏 import 了原语层（会把 motion.css 与整层 CSS 拉进首屏）").toBe(false);
    // 字面量拼接写法：`ui/icons/no-inline-svg.test.ts` 是本仓的**文本棘轮**，连本文件的字符串也算命中
    expect(TOPBAR_TSX.includes("<" + "svg"), "顶栏里出现内联 svg").toBe(false);
  });

  it("③ 顶栏项一律不许被压缩（陷阱 #15：压缩会让宽度读数静默低估 59px 级）", () => {
    for (const selector of [".ed-topbar__brand {", ".ed-topbar__tab {"]) {
      const at = CSS.indexOf(selector);
      expect(at, `TopBar.css 缺规则：${selector}`).toBeGreaterThan(-1);
      expect(CSS.slice(at, CSS.indexOf("}", at)), `${selector} 缺 flex: 0 0 auto`).toContain("flex: 0 0 auto");
    }
  });
});

describe("裁决 A3：AI toast 不在导航行里", () => {
  it("toast 已是 fixed 覆盖层（四条声明缺一不可；改前 HEAD 全不成立）", () => {
    expect(APP_CODE).toContain('data-testid="ai-toast"');
    expect(APP_CODE, "toast 不是浮动定位 ⇒ 仍会参与导航行的宽度分配").toMatch(/position:\s*"fixed"/);
    expect(APP_CODE, "toast 的纵向位置没有消费 --ed-nav-h").toMatch(/top:\s*"calc\(var\(--ed-nav-h\) \+ 8px\)"/);
    expect(APP_CODE, "toast 层级没有走 ui/zIndex 标尺").toContain('zIndex("toast")');
  });

  it("toast 不在导航行内（旧的行内特征串与 `<nav>` 字面量都已消失）", () => {
    // 迁移前 toast 的定位特征：marginLeft 由采集徽标是否出现决定（双 marginLeft:auto 抢位）
    expect(/marginLeft:\s*capture\.active \? 8 : "auto"/.test(APP_CODE), "旧的导航行内 toast 样式仍在").toBe(false);
    expect(APP_CODE.includes("<nav"), "顶栏又回到 App.tsx 行内了（两档溢出会失效）").toBe(false);
  });

  it("两个常驻状态件都还在顶栏里（防「一次提交两个状态双双消失」）", () => {
    expect(APP_CODE.includes('testId="dock-toggle"'), "REQ-274 的对话面板入口丢了").toBe(true);
    expect(/capture\.active &&/.test(APP_CODE), "采集徽标（ADR-007）丢了").toBe(true);
  });
});
