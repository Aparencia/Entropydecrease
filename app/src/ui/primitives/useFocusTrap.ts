/**
 * @ai-context L1 原语配套：**焦点陷阱**（批 0-D Task 7；规格 §5.2 能力②「焦点陷阱 + 打开聚焦
 * 首元素 + 关闭归还焦点」）。`Modal` 消费，批 0-D 的 `ConfirmDialog`（T8）同样消费。
 *
 * Why：全仓 `role="dialog"` / `aria-modal` / 焦点陷阱**各 0 处**（recon §10）；20 个手写弹层里
 * `autoFocus` 19 行/15 文件、`.focus()` 5 行/4 文件，但**没有一处**保证 Tab 不逃出弹层、
 * 也没有一处把焦点还给触发元素 —— 键盘用户关掉弹层后焦点掉回 `<body>`，下一个 Tab 从页首重新开始。
 *
 * 副作用：① 激活时读一次 `document.activeElement` 并在停用时 `.focus()` 归还；② 在 `document`
 * 上挂一个 `keydown`（**捕获相**）拦截 Tab/Shift+Tab。两者都在 effect cleanup 里摘除。
 *
 * 边界（四条，逐条有测试）：
 * ① **jsdom 不实现 Tab 导航**（没有任何浏览器默认行为）⇒ 循环必须自己 `preventDefault()` +
 *    `.focus()`：这不是"为了测试"，而是唯一可移植的写法（真浏览器里 Tab 的默认行为正是我们要
 *    接管的那件事）。
 * ② **捕获相**：Tab 循环必须比面板内部的处理器先看到 Tab —— 内部一条 `stopPropagation()` 就能让
 *    焦点逃出弹层（无障碍洞）。ESC 的接管相反走冒泡（见 `Modal.tsx`），两者是不同关切。
 * ③ **嵌套**：焦点若落在**另一个已激活陷阱**里（更内层弹层正在管焦点），本层不得抢 Tab；
 *    焦点若完全不在任何陷阱里（点了非可聚焦区域 / 元素被摘除）则必须拉回本层，否则 Tab 会把
 *    焦点带出弹层。
 * ④ **可见性判据分两层**：样式层（`display:none` / `visibility:hidden` / `hidden` / `aria-hidden`）
 *    任何环境都算数；布局层（`offsetParent === null` 且非 fixed，判据来自计划 Task 7 Step 2）
 *    只在**真有布局引擎**的环境算数 —— jsdom 定义了 `offsetParent` 却恒返回 `null`（实测），
 *    照搬会把所有元素判成不可见，陷阱随即静默失效（"焦点给面板本身"看起来还挺正常，最难发现）。
 */
import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * 可聚焦元素的选择器契约（T8 也消费；改动即破坏契约）。
 * 只列"天然可聚焦"的标签 + 非 `-1` 的 `tabindex`；`-1` 是**程序化聚焦**（面板自己就用它）。
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 当前已激活的陷阱面板（模块级）：仅用于边界③的"焦点归谁"判定，**不参与**层级排序 */
const activeTraps: HTMLElement[] = [];

/** 本环境是否真的计算布局（见 @ai-context 边界④）。`null` = 还没探过 */
let layoutEngine: boolean | null = null;

function hasLayoutEngine(): boolean {
  if (typeof document === "undefined" || document.body === null) return false;
  if (layoutEngine === null) {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    document.body.appendChild(probe);
    layoutEngine = probe.offsetParent !== null; // jsdom：恒 null ⇒ false
    probe.remove();
  }
  return layoutEngine;
}

function computedStyle(el: HTMLElement): CSSStyleDeclaration | null {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return null;
  return window.getComputedStyle(el);
}

/** 该元素是否**不可聚焦**（不可见 / 隐藏 / `input[type=hidden]`） */
function isUnfocusable(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  if (el.tagName === "INPUT" && el.getAttribute("type") === "hidden") return true;
  const style = computedStyle(el);
  if (style !== null && (style.display === "none" || style.visibility === "hidden")) return true;
  if (!hasLayoutEngine()) return false; // 无布局引擎：布局判据不可用（否则会误杀全部元素）
  if (el.offsetParent !== null) return false;
  return style === null || style.position !== "fixed"; // fixed 元素的 offsetParent 本来就是 null
}

/** 面板内**按文档序**的可聚焦元素（不含面板自己） */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !isUnfocusable(el));
}

/** 焦点是否落在本面板内（面板自己也算 —— 面板是 `tabIndex={-1}` 的兜底落点） */
function ownsFocus(panel: HTMLElement): boolean {
  const active = document.activeElement;
  return active === panel || panel.contains(active);
}

/**
 * 激活焦点陷阱。`active` 由消费方控制（`Modal` 传 `open && presence.mounted`）；
 * 关闭（`active` 变假）时把焦点归还给激活前那个**仍在文档里**的元素。
 */
export function useFocusTrap(active: boolean, panelRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const panel = panelRef.current;
    if (!active || panel === null || typeof document === "undefined") return;

    const previous = document.activeElement;
    const restoreTo = previous instanceof HTMLElement ? previous : null;
    activeTraps.push(panel);
    (focusablesIn(panel)[0] ?? panel).focus(); // 打开聚焦首元素；没有可聚焦元素则钉在面板本身

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      // 边界③：焦点在别的陷阱里（更内层）⇒ 本层不抢；焦点谁都不在 ⇒ 拉回本层
      if (!ownsFocus(panel) && activeTraps.some((other) => other !== panel && other.contains(document.activeElement))) {
        return;
      }
      const list = focusablesIn(panel);
      const active = document.activeElement;
      const index = active instanceof HTMLElement ? list.indexOf(active) : -1;
      let next: HTMLElement;
      if (list.length === 0) next = panel;
      else if (event.shiftKey) next = index <= 0 ? list[list.length - 1] : list[index - 1];
      else next = index === -1 || index === list.length - 1 ? list[0] : list[index + 1];
      event.preventDefault();
      next.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const at = activeTraps.indexOf(panel);
      if (at !== -1) activeTraps.splice(at, 1);
      // 归还守卫：元素可能已被卸载（列表刷新 / 视图切换）—— 对已摘除的节点 focus() 是静默无效
      if (restoreTo !== null && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [active, panelRef]);
}
