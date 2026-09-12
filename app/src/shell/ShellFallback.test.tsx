// @vitest-environment jsdom
/**
 * @ai-context 壳层失败/等待态的守卫（批 3 Task 13；批 2 §瓶颈清单转交的三条）。
 * 两把**独立**的尺子（各自能单独变红）：
 *   ① **渲染尺**（真组件 + 真抛错）：`SlotErrorBoundary` 的**叶级**语义 —— 出错只卸载那一棵子树；
 *      边界外的壳层（持 state 的父组件 = `MainShell` 的等价物）与**兄弟槽位**仍在，壳层 state 逐字
 *      保活（先点两次计数器再让子页抛错，随后断言计数仍是 2 —— 这是证明，不是声明）。
 *   ② **结构尺**（真 `App.tsx` 源码）：**按槽位逐个判** —— 9 个 `PageSlot` 调用点与注册表 9 个 key
 *      一一对应，且每个调用点都经过那唯一一个内部包了边界的 `PageSlot` 定义；三个非槽位 Suspense
 *      （overlay / float / dock）的边界必须**真的包住自己那个面板**（用括号平衡取内层，而非「本段
 *      出现过这两个 token」—— 后者在边界与面板解耦时静默通过）。⚠️ Why 不数全文出现次数：import 行 /
 *      注释 / 类型标注都会计入（计划 V3 的 `boundaries≥4` 因此偏松），且那条正则**对空格敏感**
 *      （`fallback={ null }` 漏判）。
 *
 * ⚠️ 诚实边界：本仓**没有** `App.test.tsx`（批 2 实测）⇒ `App.tsx` 的接线**无渲染级测试面**；① 测的是
 *   与 App **同构**的复刻（② 证明两者同形），真产物像素证据归 T14。
 * ⚠️ 失败卡文案（`:77`）是**四处共用**的一句话（PageSlot / overlay / float / dock）⇒ 判据把它整句冻结，
 *   并显式禁掉「可切换页面」这类只在主窗成立的说法（T13 评审 Minor-3）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellFallback, SlotErrorBoundary } from "./ShellFallback";
import { ALL_ENTRIES } from "./navRegistry";

/** `App.tsx` 的**只留代码**版本（剥块注释 + 整行 `//`；与 `TopBar.test.tsx:43` 同一口径） */
const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "App.tsx"), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/**
 * G2 改判（T14）的**真源侧**只读件：`motion.css` 的唯一 reduced-motion 块。
 * Why 要它：首访加载态的动效**不由行内 style 承担**，而由 `Loading` 原语的类承担 ⇒ 「行内只许 token」
 * 这条只封住一条路，另一条路（自造一个没进名单的动效载体类）必须同时封。
 */
const MOTION_CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "primitives", "motion.css"), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
const MOTION_REDUCED = MOTION_CSS.slice(MOTION_CSS.indexOf("@media (prefers-reduced-motion"));
/** G2 改判的扫描口径：一条行内 `style` 里**没走 token** 的 `transition|animation` 声明（空数组 = 都走 token） */
const inlineMotionViolations = (style: string): string[] =>
  style.split(";").filter((d) => /(?:transition|animation)/.test(d) && !/var\(--ed-(?:dur|ease)/.test(d));
/** 模拟懒 chunk 加载失败（渲染期抛错 ⇒ React 落到最近的上层边界）；抛错时 React 仍会 console.error ⇒ 抑制后还原 */
function Boom(): never { throw new Error("模拟懒 chunk 加载失败"); }
/**
 * 取出 `src.slice(i)` 里**第一个整段** `<tag>…</tag>`（开闭标签按同名嵌套做奇偶配对 —— 不用 eval/
 * new Function），返回其**内层文本**；起点不是该开标签或找不到配对 ⇒ null（判据据此响亮失败）。
 * Why 要它：只 `toContain("<SlotErrorBoundary>")` 判不出「边界**包住**面板」还是「边界只是摆设」。
 */
function balanced(src: string, i: number, tag: string): string | null {
  const open = `<${tag}>`, close = `</${tag}>`;
  if (!src.startsWith(open, i)) return null;
  let d = 0, p = i + open.length;
  while (p < src.length) {
    const end = src.indexOf(close, p);
    if (end < 0) return null;
    const o = src.indexOf(open, p);
    if (o >= 0 && o < end) { d++; p = o + open.length; } else { if (d === 0) return src.slice(i + open.length, end); d--; p = end + close.length; }
  }
  return null;
}
function silenced(fn: () => void) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try { fn(); } finally { spy.mockRestore(); }
}
afterEach(cleanup);

describe("首访加载态 ShellFallback（批 2 未做 #6）", () => {
  /**
   * G2 改判（R1.2 / §七 G2 / R4.2）：旧断言「内联样式里**没有**动效」⇒「内联动效**只许 token**」。
   * 🔴 旧口径在本批已是**空真**：批 4 T9 把自足内联 `<div style=…>` 整块删除、改用 L1 原语
   * （`Loading`）⇒ 该元素**根本没有 `style` 属性**，`?? ""` 上的 `not.toMatch` 恒成立（T14 实测
   * `getAttribute("style") === null`）。⇒ 新口径必须自己带**无条件的那一半**，否则改判只是换个写法空真：
   * ① 内联动效若回归，时长/缓动只许 `var(--ed-dur-*)` / `var(--ed-ease*)`（+ 仪器双跑自证）；
   * ② 动效**必须由类承担**，且那些基类在 `motion.css` 唯一的 reduced-motion 名单里（行内值绕不过
   *    名单，类才走得到）。判**基类**：修饰类与基类同在一个元素上、已被同一条规则覆盖（逐字枚举
   *    修饰类会假红 —— 与 `motion-coverage.test.ts` 的口径一致）。
   */
  it("渲染一行文字且是 role=status；内联动效只许 token、动效一律走类（改判自「禁内联动效」）", () => {
    render(<ShellFallback />);
    const el = screen.getByRole("status");
    expect(el.textContent).toBe("正在载入…");
    expect(el.getAttribute("data-testid")).toBe("shell-fallback");
    const bad = inlineMotionViolations(el.getAttribute("style") ?? "");
    expect(bad, `首访加载态的内联动效只许 var(--ed-dur-*) / var(--ed-ease*)：${bad.join(" / ")}`).toEqual([]);
    // 仪器自证（双跑）：反例恰 1 条（**逐序数组相等**）、正例 0 条 —— 否则「0 条」是提取器坏了
    expect(inlineMotionViolations("transition: opacity 150ms"), "提取器抓不到裸值内联动效 ⇒ 上面是空真").toEqual([
      "transition: opacity 150ms",
    ]);
    expect(inlineMotionViolations("transition: opacity var(--ed-dur-toast-in, 180ms)"), "token 正例被判成犯规 ⇒ 上面会假红").toEqual([]);
    // ② 无条件的那一半：动效载体是类，且基类在唯一的 reduced-motion 名单里
    const bases = [...new Set((el.className || "").split(/\s+/).filter(Boolean).map((c) => c.split("--")[0]))];
    expect(bases.length, "加载态根元素一个类都没有 ⇒ 下面的名单判据是空真").toBeGreaterThan(0);
    const uncovered = bases.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(MOTION_REDUCED));
    expect(uncovered, `这些基类不在 motion.css 的 reduced-motion 名单里 ⇒ 首访加载态在 reduced-motion 下照旧动：${uncovered.join(" / ")}`).toEqual([]);
    expect(screen.queryByRole("alert"), "加载态不是错误态").toBeNull();
  });
});

describe("叶级错误边界 SlotErrorBoundary", () => {
  it("① 子组件抛错 ⇒ 只渲染失败卡片，children 不再挂载", () => {
    function Wrap({ bad }: { bad: boolean }) {
      return <SlotErrorBoundary><span data-testid="child-marker">子内容</span>{bad && <Boom />}</SlotErrorBoundary>;
    }
    const { rerender } = render(<Wrap bad={false} />);
    expect(screen.getByTestId("child-marker"), "阳性对照：正常态本来该挂载").toBeTruthy();
    silenced(() => rerender(<Wrap bad />));
    expect(screen.getByRole("alert").textContent).toContain("加载失败");
    // 文案判据（T13 评审 Minor-3）：卡片由**四处**共用 —— `PageSlot`（主窗，有导航）· `?overlay=1` ·
    // `?float=1` · dock。后两者是**独立窗口**（`App.tsx` 顶部两个早返回，窗内没有顶栏/没有页面切换）
    // ⇒ 旧文案「可切换页面继续使用」在其中**是假陈述**；新文案必须在四处都成立，且不许回退。
    const card = screen.getByRole("alert").textContent ?? "";
    expect(card, "失败卡文案被改动（四处共用的措辞已冻结）").toBe("此处加载失败——其余区域仍可使用；重启应用可恢复。");
    expect(card, "窗口变体里没有页面切换 ⇒ 不许承诺「可切换页面」").not.toContain("\u53ef\u5207\u6362\u9875\u9762");
    expect(screen.queryByTestId("child-marker"), "children 仍挂着 ⇒ 没被边界卸载").toBeNull();
    expect(screen.queryByTestId("shell-fallback"), "失败态误用了加载态").toBeNull();
  });

  it("② 叶级：出错只卸载那一页 —— 壳层与兄弟槽位还在、壳层 state 保活", () => {
    function Shell() {
      const [page, setPage] = useState("classroom");
      const [alive, setAlive] = useState(0);
      return (
        <div data-testid="main-shell">
          <button data-testid="bump" onClick={() => setAlive((n) => n + 1)}>计数</button>
          <button data-testid="fail" onClick={() => setPage("broken")}>切到坏页</button>
          <span data-testid="alive">{alive}</span>
          <SlotErrorBoundary>{page === "broken" ? <Boom /> : <span data-testid="page-a">课堂页</span>}</SlotErrorBoundary>
          <SlotErrorBoundary><span data-testid="page-b">会话页</span></SlotErrorBoundary>
        </div>
      );
    }
    render(<Shell />);
    expect(screen.getByTestId("page-a"), "阳性对照：坏页之前本来是好的").toBeTruthy();
    fireEvent.click(screen.getByTestId("bump"));
    fireEvent.click(screen.getByTestId("bump"));
    expect(screen.getByTestId("alive").textContent).toBe("2");
    silenced(() => fireEvent.click(screen.getByTestId("fail")));
    expect(screen.getAllByTestId("slot-error"), "只该有一个槽位变失败卡").toHaveLength(1);
    expect(screen.getByTestId("main-shell"), "MainShell 被一起卸载了").toBeTruthy();
    expect(screen.getByTestId("alive").textContent, "壳层 state 丢了 ⇒ 不是叶级边界").toBe("2");
    expect(screen.getByTestId("page-b"), "兄弟槽位被带走了").toBeTruthy();
    expect(screen.queryByTestId("page-a"), "出错的页没被卸载").toBeNull();
  });
});

describe("结构尺：App.tsx 的边界**按槽位逐个判**（不用全文计数）", () => {
  const slots = [...APP.matchAll(/<PageSlot\b[^>]*>/g)].map((m) => m[0]);

  it("① 9 个 key ↔ 9 个 PageSlot 调用点一一对应（show / mounted 同键）", () => {
    expect(slots, "PageSlot 调用点数 ≠ 注册表页数").toHaveLength(ALL_ENTRIES.length);
    for (const e of ALL_ENTRIES) {
      const hit = slots.filter((s) => s.includes(`mounted={mountedPages.has("${e.key}")}`));
      expect(hit, `${e.key} 没有唯一的槽位`).toHaveLength(1);
      expect(hit[0], `${e.key} 的 show 与 mounted 键不一致`).toContain(`show={page === "${e.key}"}`);
    }
  });

  it("② 页级定义包住 children；overlay / float / dock 三处各有一个**包住面板**的边界", () => {
    const at = (s: string) => APP.indexOf(s);
    const ps = at("function PageSlot(");
    const def = APP.slice(ps, APP.indexOf("\n}\n", ps));
    const overlay = APP.slice(at('query.get("overlay") === "1"'), at('query.get("float") === "1"'));
    const float = APP.slice(at('query.get("float") === "1"'), at("<AppErrorBoundary>"));
    const dock = APP.slice(at("{dockMounted && ("), at("export default"));
    expect(def, "页级定义没把边界包在 children 之外（M-1 的缺陷形态）").toMatch(
      /<SlotErrorBoundary>\s*<Suspense fallback=\{<ShellFallback \/>\}>\{children\}<\/Suspense>\s*<\/SlotErrorBoundary>/,
    );
    // 三段非槽位 Suspense：判**边界的内层**（而非「本段出现过这两个 token」）—— 边界与面板解耦时
    // （评审 M11 形态：边界只包一个空 `<span />`、面板留在边界外）必须红。
    const PANELS = { overlay: "CaptureOverlayPanel", float: "CaptureFloatPanel", dock: "AiConversationDock" } as const;
    /** 边界内层应有的形状：加载态 + **自己那个**面板（只判开标签 —— dock 的面板属性是多行的）。
     *  空白用 `\\s+` 吃掉（缩进/换行不是语义）⇒ 只对「面板不在边界内 / 面板名写岔」变红。 */
    const shape = (panel: string) =>
      new RegExp(`<Suspense\\s+fallback=\\{<ShellFallback\\s*/>\\}\\s*>\\s*<${panel}\\b`);
    for (const [name, seg] of [["overlay", overlay], ["float", float], ["dock", dock]] as const) {
      expect(seg.length, `${name} 切片为空（定位器写错？）`).toBeGreaterThan(40);
      const bl = seg.indexOf("<SlotErrorBoundary>");
      const inner = bl < 0 ? null : balanced(seg, bl, "SlotErrorBoundary");
      expect(inner === null, `${name} 分支缺叶级边界，或边界没包住自己的面板（边界成了摆设）`).toBe(false);
      expect(inner, `${name} 的边界内层不是「加载态 + 自己的面板」`).toMatch(shape(PANELS[name]));
      // 闭合顺序（独立于上面的内层判据）：`</Suspense>` 必须早于**该边界自己的** `</SlotErrorBoundary>`
      expect(seg.indexOf("</Suspense>", seg.indexOf("<Suspense", bl)), `${name} 的边界闭合早于 Suspense`).toBeLessThan(
        seg.indexOf("</SlotErrorBoundary>", bl),
      );
    }
    // float：CaptureStatusProvider 必须仍在边界**外层**（「每窗恰一个实例」的采集状态源）
    const pAt = float.indexOf("<CaptureStatusProvider>");
    const outer = pAt < 0 ? null : balanced(float, pAt, "CaptureStatusProvider");
    expect(outer === null, "采集状态源整段缺失（旧判据在这里是空真：indexOf 返回 -1）").toBe(false);
    expect(outer, "采集状态源的内层没有边界").toContain("<SlotErrorBoundary>");
    expect(pAt, "采集状态源被塞进边界内层了").toBeLessThan(float.indexOf("<SlotErrorBoundary>"));
    expect(APP, "仍有 fallback={null} 残留").not.toMatch(/fallback=\{\s*null\s*\}/);
  });
});
