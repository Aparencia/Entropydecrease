// @vitest-environment jsdom
/**
 * @ai-context ⌘K 命令面板的契约守卫（规格 §6.1；批 3 Task 11）。
 *
 * 判据分五层，每层都能**独立变红**（每条判据的变异体实测见 `task-11-report.md` §5）：
 *   ① 契约：`role="dialog"` + `aria-modal` + 输入框自动聚焦（**与 `Modal` 对齐的五条契约之三**，
 *      另两条 = ESC 关 / 点遮罩关，在 ② 层）；
 *   ② 关闭路径：Esc 关（window 冒泡相）· 点遮罩关（`mousedown`，与 `Modal` 同款）· 面板内点击**不**关；
 *   ③ 键盘导航：↑↓ 改选中项（`aria-selected`）· Enter 执行并关闭 · 过滤后选中位回到首项；
 *   ④ IME：**组合中按 Enter 不提交**（中文输入法不能误触）—— 判据自带**阳性对照**（同一条命令
 *      在不带 `isComposing` 的 Enter 下必须提交），否则「没提交」可能只是「Enter 从来没生效」；
 *   ⑤ 静态纪律：9 个页面跳转命令来自注册表（不硬编码 label）· 不 import 原语层 · 层级走 `zIndex()`
 *      且无裸数字 · CSS 无 transition/animation（动效属批 6）。
 *
 * ⚠️ 本仓测试底座（照抄勿改）：`vitest.config.ts` 全局 `environment: "node"` ⇒ 首行必须
 *   `// @vitest-environment jsdom`；**未装** `jest-dom` 与 `user-event` ⇒ 断言用原生 DOM API、
 *   交互用 `fireEvent`；**没有** `globals` ⇒ RTL 的 auto-cleanup 不生效，必须显式 `afterEach(cleanup)`。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { ALL_ENTRIES } from "./navRegistry";

const HERE = dirname(fileURLToPath(import.meta.url));
const TSX = readFileSync(join(HERE, "CommandPalette.tsx"), "utf8");
/** 判据前先剥注释（与 `TopBar.test.tsx:34` 同一口径）：文件头解释「不得出现 transition」时点到了那个词 */
const CSS = readFileSync(join(HERE, "CommandPalette.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** `App.tsx` 的**只留代码**版本（剥块注释 + 整行 `//`）—— 与 `TopBar.test.tsx:43` 同一口径 */
const APP_CODE = readFileSync(join(HERE, "..", "App.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

afterEach(cleanup);

const base = { open: true, onClose: vi.fn(), onPick: vi.fn() };

describe("CommandPalette 契约（规格 §6.1）", () => {
  it("① role=dialog + aria-modal + 输入框自动聚焦（批 4 迁移到 Modal 前的契约对齐）", () => {
    render(<CommandPalette {...base} />);
    const dialog = screen.getByTestId("command-palette");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("命令面板");
    // 焦点：面板打开即落在输入框（键盘用户不必先按 Tab 找入口）
    expect(document.activeElement).toBe(screen.getByTestId("command-palette-input"));
  });

  it("① open=false 渲染 null（关闭后不留遮罩/焦点陷阱）", () => {
    const { container } = render(<CommandPalette {...base} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("② Esc 关闭；关闭后 Esc 不再触发（监听随 open 解绑，避免常驻 window 监听）", () => {
    const onClose = vi.fn();
    const { unmount } = render(<CommandPalette {...base} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose, "卸载后 Esc 仍触发 ⇒ window 监听没解绑").toHaveBeenCalledTimes(1);
  });

  it("② 点遮罩关闭；面板内点击不关闭（缩进层次：遮罩与面板是两个节点）", () => {
    const onClose = vi.fn();
    render(<CommandPalette {...base} onClose={onClose} />);
    const panel = screen.getByTestId("command-palette");
    fireEvent.mouseDown(panel); // 面板内按下（含面板自身的空白区）
    expect(onClose, "面板内点击把面板关掉了").not.toHaveBeenCalled();
    const overlay = screen.getByTestId("command-palette-overlay");
    expect(overlay.contains(panel), "面板不在遮罩里 ⇒ 点遮罩判据测的不是本组件").toBe(true);
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("③ ↑↓ 改选中项（aria-selected 单一真源），Enter 执行并关闭", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette {...base} onPick={onPick} onClose={onClose} />);
    const input = screen.getByTestId("command-palette-input");
    // 首项默认选中（classroom = 注册表第 1 项）
    expect(screen.getByTestId(`command-page:${ALL_ENTRIES[0].key}`).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByTestId(`command-page:${ALL_ENTRIES[1].key}`).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId(`command-page:${ALL_ENTRIES[0].key}`).getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByTestId(`command-page:${ALL_ENTRIES[0].key}`).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith({ kind: "page", key: ALL_ENTRIES[0].key });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("③ 输入过滤：无匹配时给空态；过滤后选中位回到首项（不指向已被滤掉的命令）", () => {
    render(<CommandPalette {...base} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // 先把选中位挪到第 2 项
    fireEvent.change(input, { target: { value: "面板" } }); // 只剩「对话面板」一条
    expect(screen.queryByTestId(`command-page:${ALL_ENTRIES[0].key}`)).toBeNull();
    expect(screen.getByTestId("command-dock").getAttribute("aria-selected")).toBe("true");
    fireEvent.change(input, { target: { value: "zzz-不存在的命令" } });
    expect(screen.getByTestId("command-palette-empty")).toBeTruthy();
  });

  it("③ 面板里的「对话面板」是增量入口（onPick kind=dock），顶栏 dock-toggle 不因此消失", () => {
    const onPick = vi.fn();
    render(<CommandPalette {...base} onPick={onPick} />);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "面板" } });
    fireEvent.click(screen.getByTestId("command-dock"));
    expect(onPick).toHaveBeenCalledWith({ kind: "dock" });
  });

  it("④ IME 组合中按 Enter 不提交（判据自带阳性对照：同一命令普通 Enter 必须提交）", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette {...base} onPick={onPick} onClose={onClose} />);
    const input = screen.getByTestId("command-palette-input");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onPick, "组合中按 Enter 提交了（中文输入法会误触）").not.toHaveBeenCalled();
    expect(onClose, "组合中按 Enter 把面板关了").not.toHaveBeenCalled();
    // 阳性对照：去掉 isComposing 后同一条命令必须提交 —— 否则上一行只是「Enter 从来没生效」
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith({ kind: "page", key: ALL_ENTRIES[0].key });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("⑤ 命令列表含 9 个页面跳转命令，label 逐字取自注册表（不硬编码、含设置页）", () => {
    render(<CommandPalette {...base} />);
    expect(ALL_ENTRIES, "注册表条目数变了 ⇒ 本判据的锚点失效").toHaveLength(9);
    for (const e of ALL_ENTRIES) {
      const item = screen.getByTestId(`command-page:${e.key}`);
      expect(item.querySelector(".ed-cmdk__label")?.textContent, e.key).toBe(e.label);
    }
    expect(screen.queryByTestId("command-page:not-a-page")).toBeNull(); // 阴性样本
  });

  it("⑤ 静态纪律：不 import 原语层 · 层级走 zIndex() 标尺且无裸数字", () => {
    expect(/ui\/primitives/.test(TSX), "面板 import 了原语层（会把整层 CSS 拉进首屏）").toBe(false);
    expect(TSX.includes("<" + "svg"), "面板里出现内联 svg（图标一律走 ui/icons）").toBe(false);
    expect(/zIndex\(/.test(TSX), "层级没有走六档标尺").toBe(true);
    expect(/zIndex:\s*\d/.test(TSX), "层级写了裸数字").toBe(false);
  });

  it("⑤ CSS 里没有动效声明（transition/animation/@keyframes 属批 6）", () => {
    const banned = [/transition\s*:/, /animation\s*:/, /@keyframes/];
    // 仪器自检：同一组正则对一段**确定含动效**的 CSS 必须命中（否则下面的「0 命中」是假绿）
    expect(banned.some((re) => re.test(".x { transition: opacity 200ms; }"))).toBe(true);
    const hits = banned.filter((re) => re.test(CSS)).map(String);
    expect(hits, `批 3 的面板 CSS 不得含动效（属批 6）：${hits.join(" / ")}`).toEqual([]);
  });
});

describe("App.tsx 的 ⌘K 接线（**静态**判据）", () => {
  /**
   * 仪器局限（如实声明，不许当成运行期证据）：这四条是**源码文本**判据。
   * `App` 整树依赖 Tauri IPC（`invoke` / `listen` / `getCurrentWindow`），仓内**没有任何测试 import 它**
   * （实测 `importing_App=[]`，136 个测试文件逐个扫）⇒ 「按一次 Ctrl+K 面板真的开了」只有真机 / WebView2
   * 能给证据，本批未跑（§报告「没能验证的地方」）。这四条挡的是**接线被删/被改回去**这类静默回归。
   */
  it("顶栏按钮 · Ctrl+K 监听 · 面板挂载三处都在，且 onPick 收口经 isPageKey（反例自检：空实现必须不通过）", () => {
    expect(/onOpenPalette=\{\(\) => setPaletteOpen\(true\)\}/.test(APP_CODE), "⌘K 按钮没接到面板").toBe(true);
    expect(/<CommandPalette[\s\S]*?open=\{paletteOpen\}/.test(APP_CODE), "面板挂载丢了").toBe(true);
    expect(/onClose=\{\(\) => setPaletteOpen\(false\)\}/.test(APP_CODE), "面板的关闭回调丢了").toBe(true);
    expect(/isPageKey\(pick\.key\)/.test(APP_CODE), "onPick 不过 isPageKey 就 setPage").toBe(true);
    // Ctrl+K 必须显式排除 Shift/Alt —— 否则会与既有的 Ctrl+Shift+A（对话面板）抢同一个事件
    expect(/e\.ctrlKey && !e\.shiftKey && !e\.altKey && \(e\.key === "k" \|\| e\.key === "K"\)/.test(APP_CODE)).toBe(true);
    // 反例自检：同一组判据对「T7 时期的空实现」必须不命中，否则这四条是恒真的
    expect(/onOpenPalette=\{\(\) => setPaletteOpen\(true\)\}/.test("onOpenPalette={() => {}}")).toBe(false);
    expect(/isPageKey\(pick\.key\)/.test("setPage(pick.key)")).toBe(false);
  });
});
