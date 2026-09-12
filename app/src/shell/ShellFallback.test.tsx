// @vitest-environment jsdom
/**
 * @ai-context 壳层失败/等待态的守卫（批 3 Task 13；批 2 §瓶颈清单转交的三条）。
 * 两把**独立**的尺子（各自能单独变红）：
 *   ① **渲染尺**（真组件 + 真抛错）：`SlotErrorBoundary` 的**叶级**语义 —— 出错只卸载那一棵子树；
 *      边界外的壳层（持 state 的父组件 = `MainShell` 的等价物）与**兄弟槽位**仍在，壳层 state 逐字
 *      保活（先点两次计数器再让子页抛错，随后断言计数仍是 2 —— 这是证明，不是声明）。
 *   ② **结构尺**（真 `App.tsx` 源码）：**按槽位逐个判** —— 9 个 `PageSlot` 调用点与注册表 9 个 key
 *      一一对应，且每个调用点都经过那唯一一个内部包了边界的 `PageSlot` 定义；三个非槽位 Suspense
 *      （overlay / float / dock）各有边界。⚠️ Why 不数全文出现次数：import 行 / 注释 / 类型标注都会计入
 *      （计划 V3 的 `boundaries≥4` 因此偏松），且那条正则**对空格敏感**（`fallback={ null }` 漏判）。
 *
 * ⚠️ 诚实边界：本仓**没有** `App.test.tsx`（批 2 实测）⇒ `App.tsx` 的接线**无渲染级测试面**；① 测的是
 *   与 App **同构**的复刻（② 证明两者同形），真产物像素证据归 T14。
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
/** 模拟懒 chunk 加载失败（渲染期抛错 ⇒ React 落到最近的上层边界）；抛错时 React 仍会 console.error ⇒ 抑制后还原 */
function Boom(): never { throw new Error("模拟懒 chunk 加载失败"); }
function silenced(fn: () => void) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try { fn(); } finally { spy.mockRestore(); }
}
afterEach(cleanup);

describe("首访加载态 ShellFallback（批 2 未做 #6）", () => {
  it("渲染一行文字且是 role=status；内联样式里没有动效（动效属批 6）", () => {
    render(<ShellFallback />);
    const el = screen.getByRole("status");
    expect(el.textContent).toBe("正在载入…");
    expect(el.getAttribute("data-testid")).toBe("shell-fallback");
    expect(el.getAttribute("style") ?? "").not.toMatch(/transition|animation/);
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

  it("② 页级定义包住 children；overlay / float / dock 三处各一个边界", () => {
    const at = (s: string) => APP.indexOf(s);
    const ps = at("function PageSlot(");
    const def = APP.slice(ps, APP.indexOf("\n}\n", ps));
    const overlay = APP.slice(at('query.get("overlay") === "1"'), at('query.get("float") === "1"'));
    const float = APP.slice(at('query.get("float") === "1"'), at("<AppErrorBoundary>"));
    const dock = APP.slice(at("{dockMounted && ("), at("export default"));
    expect(def, "页级定义没把边界包在 children 之外（M-1 的缺陷形态）").toMatch(
      /<SlotErrorBoundary>\s*<Suspense fallback=\{<ShellFallback \/>\}>\{children\}<\/Suspense>\s*<\/SlotErrorBoundary>/,
    );
    for (const [name, seg] of [["overlay", overlay], ["float", float], ["dock", dock]] as const) {
      expect(seg.length, `${name} 切片为空（定位器写错？）`).toBeGreaterThan(40);
      expect(seg, `${name} 分支缺叶级边界`).toContain("<SlotErrorBoundary>");
      expect(seg, `${name} 分支缺首访加载态`).toContain("fallback={<ShellFallback />}");
    }
    // float：CaptureStatusProvider 必须仍在边界**外层**（「每窗恰一个实例」的采集状态源）
    expect(float.indexOf("<CaptureStatusProvider>"), "采集状态源被塞进边界内层了").toBeLessThan(float.indexOf("<SlotErrorBoundary>"));
    expect(APP, "仍有 fallback={null} 残留").not.toMatch(/fallback=\{\s*null\s*\}/);
  });
});
