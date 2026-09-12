/**
 * shellPhase.ts — 壳层**相变态通道**（规格 §6.3；裁决 R4.4 / R4.1）。
 *
 * @ai-context Why：§6.3 的三态（常态 A′ 顶栏 / 采集态 58px LIVE 仪表 / 复习态零 chrome）是**壳层级**
 *   的相变 —— 顶栏与域导航要整体换形，而不是逐组件传 prop。载体 = 写在 `<html>` 上的
 *   `data-shell-phase`（取值逐字 "idle" | "capture" | "review"），与 `motion/intensity.ts` 的
 *   `data-motion` **同宿主形态**（R3.1 先例）⇒ CSS 侧一条 `html[data-shell-phase="…"] …` 选择器就能
 *   换 chrome 形态，零 JS 参与；且「系统 `prefers-reduced-motion` 优先于相位」由 `motion.css` 的
 *   **源序**实现（相位块写在 reduced-motion 块之前，归 T19）。
 * @ai-context 副作用：写 `<html data-shell-phase>`（文档级）。Tauri 的多窗口变体（`?float=1` /
 *   `?overlay=1`）各有独立 webview ⇒ 相位互不同步（与 `data-motion` 同款边界，本批不处理跨窗口同步）。
 * @ai-context 三处降级**一律静默**（照 T6 `applyIntensity` 的同族口径）：① 无 `document`（node 测试
 *   环境）⇒ 不写 DOM、不抛；② 显式传 `null` 且无 `document` ⇒ 不写；③ 非法值（不在三态内）⇒ 不写
 *   —— **不**回退成 "idle"（静默不动比替调用方猜一个值安全；调用方写错值时要能看出来）。
 * @ai-context 边界：`useShellPhase` **卸载时清回 "idle"** —— 页面保活挂载（TD-004）下相位可能由页面
 *   自己写；若卸载后残留 "review"/"capture"，壳层就停在该态（零 chrome ⇒ 顶栏与域导航都不在）。
 *   本文件**只建通道**：不写任何相位 CSS、不建 LIVE 仪表 —— §6.3 的视觉与交互分别归 T18 / T19。
 */
import { useEffect } from "react";

/** 三态取值（规格 §6.3 的相变态表；`idle` = 常态 = A′ 顶栏）。顺序 = 冻结快照的书写顺序。 */
export const SHELL_PHASES = ["idle", "capture", "review"] as const;
export type ShellPhase = (typeof SHELL_PHASES)[number];

/** 属性名逐字（R4.4）；CSS 侧消费形态 = `html[data-shell-phase="capture"] …` */
export const SHELL_PHASE_ATTR = "data-shell-phase";

/** 取值守卫：只有三态字面量能过（外部输入 / 旧版遗留值一律不放行）。 */
const isPhase = (value: string): value is ShellPhase => (SHELL_PHASES as readonly string[]).includes(value);

/** 宿主：显式元素优先，否则 `<html>`；无 `document`（node 环境）⇒ `null`。 */
const hostOf = (el?: HTMLElement | null): HTMLElement | null =>
  el ?? (typeof document === "undefined" ? null : document.documentElement);

/** 写相位（默认目标 = `<html>`）；无宿主 / 非法值 ⇒ 静默不动，不抛。 */
export function applyShellPhase(phase: ShellPhase, el?: HTMLElement | null): void {
  if (!isPhase(phase)) return;
  const target = hostOf(el);
  if (target !== null) target.setAttribute(SHELL_PHASE_ATTR, phase);
}

/** 读相位：无宿主 / 属性缺失 / 值不在三态内 ⇒ `null`（调用方按「未设置」处理）。 */
export function readShellPhase(el?: HTMLElement | null): ShellPhase | null {
  const raw = hostOf(el)?.getAttribute(SHELL_PHASE_ATTR) ?? null;
  return raw !== null && isPhase(raw) ? raw : null;
}

/**
 * 相位 hook：挂载与相位变更时写 `<html>`，**卸载时清回 "idle"**（防「切走后壳层永久停在该态」）。
 * node 环境下同样可调用（`applyShellPhase` 静默降级，不抛；`useEffect` 在 SSR 下本就不执行）。
 */
export function useShellPhase(phase: ShellPhase): void {
  useEffect(() => {
    applyShellPhase(phase);
    return () => applyShellPhase("idle");
  }, [phase]);
}
