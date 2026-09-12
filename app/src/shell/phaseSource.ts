/**
 * phaseSource.ts — 壳层相变态的**来源通道与唯一决策点**（批 6 T19；规格 §6.3；裁决 R4.4 / R42⑥）。
 *
 * @ai-context Why 本文件必须存在（计划 `:1527/:1542` 那一行 `useShellPhase(session ? "review" : "idle")`
 *   有两个缺陷，逐条对应本文件的形态）：
 *   ① **双写者互擦**：T17 已确立 `MainShell` 是相位的**唯一写入方**
 *      （`useShellPhase(capture.active ? "capture" : "idle")`）；若 `ReviewPage` 再写一次，两个写入方
 *      各自回写 ⇒ 在「复习会话进行中切走 / 采集态翻转」的交叉点互相擦除（后写的那个赢）。
 *      ⇒ 本文件把「该写什么」收在**一处**：`useShellPhaseState` 是全仓**唯一**调用 `useShellPhase` 的地方，
 *      由 `MainShell` 调用（判据 = `shellPhase.guard.test.ts` 的「唯一写入方名册」）。
 *   ② **无 `active` 门控**：页面是**保活挂载**（TD-004）⇒ 带会话切到别页时页面并不卸载、`session` 仍非空
 *      ⇒ 壳层会**停在 review 相位**（顶栏与域导航都不在 = 零 chrome 卡死）。
 *      ⇒ 门控落在两处且都有判据：页面侧 `usePublishReviewSession(visible, sessionOpen)` 的 `visible &&`，
 *      壳层侧 `useShellPhaseState(…, onReviewPage)` 的 `onReviewPage &&`。
 *
 * @ai-context 优先级（§6.3 的三态表没有写「两态同时成立」时谁赢 ⇒ 本处显式定义，并登记为**实现口径**）：
 *   **采集 > 复习 > 常态**。理由：采集是**跨页常驻**的系统级状态（ADR-007 逐字要求「切页/最小化后仍可
 *   感知采集在跑」），复习是页面级状态；若让复习压过采集，LIVE 仪表与采集徽标会被零 chrome 一起藏掉。
 *
 * @ai-context 副作用：① 模块级订阅源（**每个 webview 一份** —— 相位本来就是 per-webview 的，与
 *   `shellPhase.ts` 的多窗口边界同款）；② **DOM 写入不在本文件**：写什么由本文件决定，「怎么写」仍是
 *   `shellPhase.ts` 的 `useShellPhase`（三处静默降级沿用它的口径）。不读 store、不发 IPC、不起计时器。
 * @ai-context 边界：① 复习事实的发布方今天只有 `ReviewPage` 一处；② 采集侧只消费既有单一状态源的
 *   `capture.active`（不新增订阅、不新增 state）；③ `useShellPhaseState` **必须在 `MainShell` 内调用**
 *   —— 它同时是「唯一写入方」与「`PhaseChrome` 的同帧相位来源」（属性写入在 effect 里、叠层类名在渲染里，
 *   两者同源同帧，不会出现「DOM 说 capture、React 说 idle」的中间态）。
 */
import { useEffect, useSyncExternalStore } from "react";
import { useShellPhase } from "./shellPhase";
import type { ShellPhase } from "./shellPhase";

/** 复习会话事实（模块级）：写方 = `usePublishReviewSession`，读方 = `useShellPhaseState`。 */
let reviewSessionActive = false;
const listeners = new Set<() => void>();

/** 写事实（**同值不通知** ⇒ 不给 React 制造空转渲染）。 */
export function setReviewSessionActive(next: boolean): void {
  if (next === reviewSessionActive) return;
  reviewSessionActive = next;
  for (const notify of [...listeners]) notify();
}

/** 读事实（`useSyncExternalStore` 的快照函数；模块级稳定引用 ⇒ 不会每渲染换一个订阅）。 */
export function getReviewSessionActive(): boolean {
  return reviewSessionActive;
}

/** 订阅事实（同上，模块级稳定引用；StrictMode 双调用安全）。 */
export function subscribeReviewSession(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** 事实的 React 读侧：`useSyncExternalStore`（无 tearing、SSR 快照同值 ⇒ 服务端渲染不抛）。 */
export function useReviewSessionActive(): boolean {
  return useSyncExternalStore(subscribeReviewSession, getReviewSessionActive, getReviewSessionActive);
}

/**
 * 页面侧**上抛**（`ReviewPage` 调用）：`visible` = 本页当前可见（`active` 门控），
 * `sessionOpen` = 本页有一轮复习会话在跑。
 * 🔴 两个条件**都必须**成立才发布 —— `visible &&` 这条门控写在**这里**而不是调用点：
 *   这里有判据（`phaseSource.test.tsx`）、调用点只有一行；卸载时复位（防「页面真的被卸载后壳层停在 review」）。
 */
export function usePublishReviewSession(visible: boolean, sessionOpen: boolean): void {
  useEffect(() => {
    setReviewSessionActive(visible && sessionOpen);
  }, [visible, sessionOpen]);
  useEffect(() => () => setReviewSessionActive(false), []);
}

/**
 * **唯一决策点**：全仓唯一调用 `useShellPhase` 的地方（单一写入方）。
 *
 * @param capturing 采集是否进行中（既有采集单一状态源 `useCaptureControl().active`）
 * @param onReviewPage 复习页当前是否可见（`active` 门控的壳层侧那一半）
 * @returns 本次渲染决定的相位（同名属性由 `useShellPhase` 的 effect 写入 `<html>`）
 */
export function useShellPhaseState(capturing: boolean, onReviewPage: boolean): ShellPhase {
  const reviewing = useReviewSessionActive();
  const phase: ShellPhase = capturing ? "capture" : onReviewPage && reviewing ? "review" : "idle";
  useShellPhase(phase);
  return phase;
}
