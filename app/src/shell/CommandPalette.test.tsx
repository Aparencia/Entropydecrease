// @vitest-environment jsdom
/**
 * @ai-context ⌘K 命令面板的契约守卫（规格 §6.1；批 3 Task 11）。
 *
 * 判据分五层，每层都能**独立变红**（每条判据的变异体实测见 `task-11-report.md` §5；
 *   **批 4 T9 的改写与各自的新变异体见 `task-9-report.md` §6.2**）：
 *   ① 契约：`role="dialog"` + `aria-modal` + 无障碍名整条链（`aria-labelledby` → 可见标题）+
 *      输入框自动聚焦（**与 `Modal` 对齐的五条契约之三**，另两条 = ESC 关 / 点遮罩关，在 ② 层）；
 *   ② 关闭路径：Esc 关（`Modal` 的 `document` 冒泡相 + 栈顶）· 点遮罩关（`mousedown`，与 `Modal` 同款）·
 *      面板内点击**不**关 · 遮罩的层级落在六档标尺上；
 *   ③ 键盘导航：↑↓ 改选中项（`aria-selected`）· Enter 执行并关闭 · 过滤后选中位回到首项；
 *   ④ IME：**组合中按 Enter 不提交**（中文输入法不能误触）—— 判据自带**阳性对照**（同一条命令
 *      在不带 `isComposing` 的 Enter 下必须提交），否则「没提交」可能只是「Enter 从来没生效」；
 *   ⑤ 静态纪律：9 个页面跳转命令来自注册表（不硬编码 label）· **只经 barrel 导入原语**（T9 起；
 *      批 3 的「不许 import 原语层」是非目标 2 的临时守卫，前提已被批 4 解除）· **不留第二套
 *      遮罩/ESC/焦点**（ADR-033 §7）· 层级无裸数字 · 自带 CSS 整份删除且无 `.ed-cmdk*` 残类。
 *  ⚠️ 判据前**先剥注释**（`CODE`）：文件头逐字点到 `createPortal` / `aria-modal` / `.ed-cmdk*`
 *  这些形态，注释不算犯规（与 `TopBar.test.tsx:34` 同一口径）。
 *
 * ⚠️ 本仓测试底座（照抄勿改）：`vitest.config.ts` 全局 `environment: "node"` ⇒ 首行必须
 *   `// @vitest-environment jsdom`；**未装** `jest-dom` 与 `user-event` ⇒ 断言用原生 DOM API、
 *   交互用 `fireEvent`；**没有** `globals` ⇒ RTL 的 auto-cleanup 不生效，必须显式 `afterEach(cleanup)`。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { ALL_ENTRIES } from "./navRegistry";
import { zIndex } from "../ui/zIndex";

const HERE = dirname(fileURLToPath(import.meta.url));
const TSX = readFileSync(join(HERE, "CommandPalette.tsx"), "utf8");
/** 迁移面的**只留代码**版本（剥块注释 + 整行 `//`）—— 与 `TopBar.test.tsx:34` 同一口径：
 *  文件头解释「不许再自带 CSS / 不许留 `.ed-cmdk*` 残类」时会点到那些字面量，注释不算犯规。 */
const CODE = TSX.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** T9：`CommandPalette.css` 已整份删除（计划 V1）⇒ 原「CSS 里没有动效声明」判据改建为
 *  「CSS 层只剩原语那一份」（同一 `it`，用例数不减；判据强度不降，见该用例的说明）。 */
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
    // T9：无障碍名从 `aria-label` 搬到 `aria-labelledby` → 可见标题（`Modal` 契约）。**强度不降**：
    // 旧判据只验一个属性字面量；新判据验「属性 → 标题节点 → 文本」**整条链**（任一处断链即红）。
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy, "面板没有无障碍名（aria-labelledby）").toBeTruthy();
    expect(document.getElementById(labelledBy ?? "")?.textContent, "无障碍名不指向可见标题").toBe("命令面板");
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
    fireEvent.keyDown(document, { key: "Escape" }); // T9：ESC 归 `Modal`（document 冒泡相 + 栈顶）
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" }); // T9：ESC 归 `Modal`（document 冒泡相 + 栈顶）
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
    // T9：层级判据从「源码里出现 `zIndex(`」搬到**渲染出的遮罩**（强于源码文本判据：它验的是
    // 「层级真的落在六档标尺上」，而不是「本文件写没写那五个字符」；判据对象随迁移搬到原语层）。
    expect(overlay.style.zIndex, "遮罩的层级不在六档标尺上").toBe(String(zIndex("modal")));
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
      // T9（选项 (b)）：行内容改由 `Text` 原语表达、`.ed-cmdk*` 残类全部删除 ⇒ 判据从「类选择器」
      // 改成**结构 + 文本**：选项的**首个元素子节点**恰是标签文本（原判据只锁类名与文本，
      // 新判据连「标签在行首、hint 在其后」这层结构一起锁 ⇒ 强度不降）。
      expect(item.firstElementChild?.textContent, e.key).toBe(e.label);
    }
    expect(screen.queryByTestId("command-page:not-a-page")).toBeNull(); // 阴性样本
  });

  it("⑤ 静态纪律：只经 barrel 导入原语 · 不留第二套遮罩/ESC/焦点（ADR-033 §7）· 无裸层级", () => {
    // 批 3 的「不 import `ui/primitives`」是**非目标 2 的临时守卫**（那条禁令的前提已被批 4 解除：
    // 迁移原语正是本批目标）⇒ 它按新架构换成**更强**的形态：入口唯一（barrel）+ 单实现（不留第二套
    // 弹层机制）+ 自带 CSS 层清零。四条原断言里「无内联 svg」与「无裸数字」两条逐字保留。
    // ⚠️ 本文件不得出现那个标签的**字面量**（连注释也不行）：`ui/icons/no-inline-svg.test.ts` 是
    // **全文扫描**的棘轮，注释里出现即被判为「新增内联 svg 的文件」（`EmptyState.tsx` 边界③ 同坑）。
    expect(/from\s+"\.\.\/ui\/primitives"/.test(CODE), "面板没走 barrel（ADR-033 §1）").toBe(true);
    expect(CODE.match(/from\s+"\.\.\/ui\/primitives\/[A-Za-z]+"/), "面板深导入原语（深导入不带 motion.css）").toBeNull();
    expect(TSX.includes("<" + "svg"), "面板里出现内联 svg（图标一律走 ui/icons）").toBe(false);
    expect(/zIndex:\s*\d/.test(CODE), "层级写了裸数字").toBe(false);
    // 单实现（ADR-033 §7）：portal / 事件监听 / 弹层语义 / 遮罩 / 焦点陷阱都只有 `Modal` 一份
    expect(CODE.match(/createPortal/), "面板自建 portal").toBeNull();
    expect(CODE.match(/addEventListener/), "面板自建事件监听（ESC 与焦点都归 `Modal`）").toBeNull();
    expect(CODE.match(/aria-modal/), "面板自建 `aria-modal`（第二套弹层语义）").toBeNull();
    expect(CODE.match(/position\s*:\s*["']fixed["']/), "面板自建遮罩（position: fixed）").toBeNull();
    expect(CODE.match(/inset\s*:\s*0/), "面板自建遮罩（inset: 0）").toBeNull();
    expect(CODE.match(/useFocusTrap|FOCUSABLE_SELECTOR/), "面板自建焦点陷阱").toBeNull();
  });

  it("⑤ 自带 CSS 整份删除（计划 V1）：文件不在盘上，迁移面也不 import 任何 CSS / 不留残类", () => {
    // 判据对象随迁移**搬走**（原判据扫的是那个文件的文本；文件按 V1 删除 ⇒ 判据升级为「它必须不在」）。
    expect(existsSync(join(HERE, "CommandPalette.css")), "CommandPalette.css 又回来了").toBe(false);
    expect(CODE.match(/\bimport\s+["'][^"']+\.css["']/), "迁移面又 import 了 CSS").toBeNull();
    expect(CODE.match(/ed-cmdk/), "`.ed-cmdk*` 残类（样式已无落点）").toBeNull();
    // 仪器自证：同一条「存在性」读法对**确定存在**的文件必须为 true（否则上面那条 false 可能只是路径写错）
    expect(existsSync(join(HERE, "CommandPalette.tsx")), "文件存在性读法失效").toBe(true);
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
