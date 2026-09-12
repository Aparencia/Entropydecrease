// @vitest-environment jsdom
/**
 * @ai-context A′ 顶栏契约守卫（规格 §6.1 与 §1 决策 12/14；批 3 Task 7）。
 *
 * 判据分四层，每层都能**独立变红**：
 *   ① 结构：8 个域 Tab + ⚙ 齿轮 + ⌘K；设置**不在**域 Tab 里；`right` 插槽确实渲染在右侧区；
 *   ② 两档溢出：每个 Tab **同时**有 label 元素与 `title` ⇒ 「1024–1179 收起文字后靠 title 当悬浮名」
 *      这条规格要求是 **DOM 可断言的**；A2 裁决（emoji 出局）另有一条**带阳性对照**的判据；
 *   ③ 静态纪律（G1 改判，T14）：`TopBar.css` 的动效**只许 token**（`var(--ed-dur-*)` / `var(--ed-ease*)`）
 *      且**落点必须留在 `motion.css` 元素级回执的覆盖面内**（顶栏交互元素全是裸 `<button>`）；
 *      `@keyframes` 与第二条 reduced-motion 块仍**禁**。另：高度消费 `--ed-nav-h`；两档断点与
 *      `shell/breakpoints.ts` 同值；顶栏项不许被压缩（陷阱 #15）；
 *   ④ 裁决 A3：AI toast **不在**导航行里（批 3 时它是 `App.tsx` 的 `MainShell` 最外层 fixed 覆盖层；
 *      **批 4 T10 起交给 `ui/primitives/Toast`** ⇒ B13/B15 授权把定位/锚点/层级三条判据搬到原语层，
 *      第四条（`ai-toast` 的 testid）改由 `components/toastMigration.test.tsx` 的**渲染级**断言保住），
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
/**
 * G1 改判（T14）的**真源侧**只读件：`motion.css` 的元素级回执 `button:not(.ed-btn)` 与那条唯一的
 * reduced-motion 块。顶栏的交互元素全是裸 `<button>` ⇒ 顶栏的时长/缓动**不是顶栏自己的事**：
 * 真源在那条元素级规则里，顶栏再写一份就是 R1.1 明禁的第二个真源（`motion.css:63` 同款论证）。
 */
const MOTION_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "motion.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const TOPBAR_TSX = readFileSync(join(HERE, "TopBar.tsx"), "utf8");
const APP_TSX = readFileSync(join(HERE, "..", "App.tsx"), "utf8");
/**
 * App.tsx 的**只留代码**版本：剥块注释与整行 `//` 注释。
 * Why 必须剥：App.tsx 的注释里逐字出现了 `<nav>`、`zIndex("toast")` 这些判据串 —— 不剥的话
 * 「toast 已搬出导航行」这条判据只要注释还在就会**假绿**（正是本批反复打击的「测不到失败的检查」）。
 */
const APP_CODE = APP_TSX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * T10（B13/B15 授权的机械改写）：AI toast 的定位/锚点/层级判据搬到**原语层** —— 它们是
 * `ui/primitives/Toast.{css,tsx}` 的事实，覆盖**所有** `Toast` 消费者（不再只覆盖 `App.tsx` 一处）。
 * 取规则体用「`选择器 {` 到第一个 `}`」（同 `ui/primitives/Toast.placement.test.tsx:38`）：
 * 防「同一个串写在别的规则里也算过」。
 */
const TOAST_CSS = readFileSync(join(HERE, "..", "ui", "primitives", "Toast.css"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const TOAST_TSX = readFileSync(join(HERE, "..", "ui", "primitives", "Toast.tsx"), "utf8");
const toastRuleBody = (selector: string): string => {
  const at = TOAST_CSS.indexOf(selector);
  return at < 0 ? "" : TOAST_CSS.slice(at, TOAST_CSS.indexOf("}", at));
};
const TOAST_BASE_BODY = toastRuleBody(".ed-toast {");
const TOAST_BELOW_NAV_BODY = toastRuleBody(".ed-toast--below-nav");

/** emoji / 图形字符（A2 裁决的机器判据）。`\p{Extended_Pictographic}` 是 Unicode 属性类，覆盖 ✨📡🎙 等 */
const PICTO = /\p{Extended_Pictographic}/u;

/**
 * G1 改判的**扫描口径**（一处定义，判据与仪器自证共用 ⇒ 不会各写一份正则而漂移）。
 * `withoutTokenVars` 必须先剥掉 `var(--ed-x, <同值兜底>)` 整段：本仓的 token 习惯写法**带同值兜底**
 * （`--ed-dur-micro, 120ms`）⇒ 不剥的话「不得写裸 ms/s」会把合法 token 用法判成犯规（**假红**，
 * 逼实施者绕开守卫 —— 计划 Task 14 的 G1 新断言原文就有这个洞，T14 实施时实测并修正）。
 * 🔴 R1.2（改判不得弱于原判据）：属性名还认**厂商前缀 / 大写**（同 `motion-coverage.test.ts:91` 的孪生守卫）—— 旧 G1 是子串匹配，`-webkit-transition:` 在它下面是**红**，新口径漏掉前缀支就是强度回退（T14c 专属变异体实测）。
 */
const motionDecls = (css: string): string[] =>
  css.split(";").filter((d) => /(?:^|[;\s])(?:-(?:webkit|moz|ms|o)-)?(?:transition|animation)(?:-duration|-name)?\s*:/i.test(d));
const withoutTokenVars = (decl: string): string => decl.replace(/var\(--ed-[a-z0-9-]+,[^)]*\)/g, "");
const rawTimes = (decls: string[]): string[] => decls.filter((d) => /\d+(?:\.\d+)?\s*(?:ms|s)\b/.test(withoutTokenVars(d)));
/** 裸缓动的第三类：**裸关键字** `linear`/`ease`/`steps()`（Important ②）。边界用 `(?<![\w-])…(?![\w-])` 而非 `\b`：后者会把无兜底的合法 token `var(--ed-ease)` 与 `linear-gradient` 误判成犯规。 */
const rawEases = (decls: string[]): string[] =>
  decls.filter((d) => /cubic-bezier|ease-(?:in|out|in-out)\b|(?<![\w-])(?:linear|ease|steps)(?![\w-])/i.test(withoutTokenVars(d)));

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

  /**
   * G1 改判（R1.2 / §七 G1 / R4.2）：旧断言「顶栏 CSS 里没有动效声明」⇒「动效只许 token + 落点可被
   * reduced-motion 覆盖」。**为什么不做计划 Task 14 的 `decls.length > 0`**：T12 的元素级回执
   * （`motion.css:66-73` 的 `button:not(.ed-btn)`）已落在顶栏每个交互元素上（域 Tab 与两个动作按钮都是
   * 裸 `<button>`）⇒ 顶栏再写一份 = R1.1 明禁的第二个真源（同 `motion.css:63` 对 `.ed-btn` 的论证）。
   * 三条判据：① 真写动效时时长/缓动只许 token；② `@keyframes` 仍禁（§8.2 桶边界）；
   * ③ **无条件** —— 顶栏交互元素必须留在那条回执的覆盖面内（自写的每处动效，落点类也必须长在它们上），
   * 回执本身必须存在、声明时长、在那条唯一的 reduced-motion 名单里；解禁新开的洞（本文件自写第二条
   * reduced-motion 块）一并封住。旧口径对照读数见 `task-14-report.md`（探针实测：旧断言对**合法 token
   * 用法假红**、对「动效载体没进名单」**无牙**）。
   */
  it("③ 顶栏动效只许 token，且落点必须留在元素级回执的覆盖面内（改判自「一律禁止」）", () => {
    const decls = motionDecls(CSS);
    const times = rawTimes(decls);
    const eases = rawEases(decls);
    expect(times, `顶栏 CSS 的时长必须走 var(--ed-dur-*)，不得写裸 ms/s：${times.join(" / ")}`).toEqual([]);
    expect(eases, `顶栏 CSS 的缓动必须走 var(--ed-ease*)，不得写裸曲线：${eases.join(" / ")}`).toEqual([]);
    expect(CSS, "顶栏 CSS 出现 @keyframes（§8.2 桶边界：keyframes 只留 Loading/Skeleton/Probe）").not.toContain("@keyframes");
    // 仪器自证（双跑）：反例各报 1 条、正例各报 0 条 —— 否则上面的「0 条」是正则坏了，不是「没犯规」
    const bad = motionDecls(".a { transition: color 120ms ease-out; }");
    const good = motionDecls(".a { transition: color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)); }");
    expect([rawTimes(bad), rawEases(bad)], "扫描器抓不到裸值动效 ⇒ 上面两条是空真").toEqual([bad, bad]);
    expect([rawTimes(good), rawEases(good)], "token + 同值兜底的正例被判成犯规 ⇒ 上面两条会假红").toEqual([[], []]);
    // 前缀 / 大写属性名（R1.2）：旧口径的子串匹配挡得住，新口径漏掉前缀支 = 强度回退 ⇒ 两者都必须判红
    const pre = motionDecls(".a { -webkit-transition: color 120ms ease-out; }"), up = motionDecls(".a { ANIMATION: ed-x 1s infinite; }");
    expect([pre.length, up.length, rawTimes([pre[0]]), rawEases([pre[0]]), rawTimes([up[0]])], "前缀 / 大写属性名逃出扫描器，或裸值未被判红").toEqual([1, 1, [pre[0]], [pre[0]], [up[0]]]);
    // 裸缓动关键字（Important ②）：三者同样是绕过 token 的写法；末项 = 反向对照（无兜底的合法 token 必须绿）
    const bare = [".a { transition: opacity linear 200ms; }", ".a { transition: opacity ease 200ms; }", ".a { transition: opacity steps(4); }"].map((s) => motionDecls(s)[0]);
    expect([bare.map((d) => rawEases([d])), rawEases(motionDecls(".a { transition: color var(--ed-dur-micro) var(--ed-ease); }"))], "裸关键字漏判 / 合法无兜底 token 被误判").toEqual([bare.map((d) => [d]), []]);
    // ③a 覆盖面（类序**逐序数组相等**：带 `ed-btn` 会掉出那条回执，少一个 = 覆盖面缩水）
    render(<TopBar {...base} />);
    const classes = [...screen.getByTestId("topbar").querySelectorAll("button")].map((b) => b.className);
    expect(
      classes,
      "顶栏按钮的类序变了：带 `ed-btn` ⇒ 掉出 `button:not(.ed-btn)` 的元素级回执（也就掉出 reduced-motion 名单）",
    ).toEqual([...NAV_ENTRIES.map(() => "ed-topbar__tab"), "ed-topbar__action", "ed-topbar__action"]);
    // ③a-2 落点覆盖面（今天 0 处声明 ⇒ 条件式；变异体证明有牙：把落点写到 `.ed-topbar__brand`（`<span>`）⇒ 红）
    const buttons = new Set(classes.flatMap((c) => c.split(/\s+/)));
    const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => motionDecls(m[2]).length > 0);
    const landing = [...new Set(rules.flatMap((m) => [...m[1].matchAll(/\.(ed-[A-Za-z0-9_-]+)/g)].map((c) => c[1])))];
    expect(landing.filter((c) => !buttons.has(c)), "这些类上声明了动效、却不长在裸 `<button>` 上 ⇒ reduced-motion 名单打不到它们").toEqual([]);
    // ③b 真源侧：回执存在、声明了时长/缓动、且在**唯一**的 reduced-motion 名单里
    const at = MOTION_CSS.indexOf("button:not(.ed-btn)");
    expect(at, "motion.css 里找不到 `button:not(.ed-btn)`（顶栏元素级回执的真源）").toBeGreaterThan(-1);
    expect(MOTION_CSS.slice(at, MOTION_CSS.indexOf("}", at)), "那条回执没有声明时长/缓动 ⇒ 顶栏的回执是空壳").toContain("transition-duration:");
    const reducedAt = MOTION_CSS.indexOf("@media (prefers-reduced-motion");
    expect(reducedAt, "motion.css 里找不到 reduced-motion 块").toBeGreaterThan(-1);
    expect(MOTION_CSS.slice(reducedAt), "名单没覆盖 `button:not(.ed-btn)` ⇒ 顶栏在 reduced-motion 下照旧动").toContain("button:not(.ed-btn)");
    expect(CSS, "TopBar.css 自写了 reduced-motion 块 ⇒ app/src 出现第二条（唯一块的真源在 motion.css）").not.toContain("@media (prefers-reduced-motion");
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
  it("toast 的定位/锚点/层级都在原语层（B13/B15 授权的机械改写）", () => {
    // 原四条断言（`:182`–`:185`）断的是「`App.tsx` 源码里出现过自足 toast 的特征串」——批 3
    // 的中间态。T10 把 AI toast 交给 `ui/primitives/Toast` 后那些串**必然**不在 `App.tsx` 里
    // （计划 Task 10 Step 4 逐字：「迁移必然让 :183/:184/:185 失效」；B15 把 `:182` 一并纳入）。
    // 改写后的判据搬到**原语层**，强度不降反升：覆盖面从「App.tsx 一处」扩到**全部** Toast 消费者
    // （B13 逐字要求）；`ai-toast` 的 testid 语义改由**渲染级**断言保住（B15 ②），见
    // `components/toastMigration.test.tsx` §⑤（断言的是渲染出的元素，不是源码里出现过该字符串）。
    expect(TOAST_BASE_BODY, "原语基类不是 fixed 定位 ⇒ toast 仍会参与布局流向").toMatch(/position:\s*fixed/);
    expect(APP_CODE, "App.tsx 没有把 AI toast 交给 belowNav 档").toContain('placement="belowNav"');
    expect(TOAST_BELOW_NAV_BODY, "位置档的 top 没有消费壳层 token --ed-nav-h").toMatch(
      /top:\s*calc\(\s*var\(--ed-nav-h/,
    );
    expect(TOAST_TSX, "toast 层级没有走 ui/zIndex 标尺").toContain('zIndex("toast")');
    // 仪器自证（同一条正则对反例必须判否）——防「判据其实是永真的字符串包含」
    expect(TOAST_BASE_BODY.length, "Toast.css 缺 `.ed-toast {` 规则体（选择器改名了？）").toBeGreaterThan(0);
    expect(".ed-toast--below-nav {\n  top: 64px;\n}", "反例样本未被判否 ⇒ 锚点判据无牙").not.toMatch(
      /top:\s*calc\(\s*var\(--ed-nav-h/,
    );
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
