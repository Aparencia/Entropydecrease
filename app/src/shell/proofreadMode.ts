/**
 * proofreadMode.ts — 阅读面**审校模式**的模式位通道（规格 §4.3 条件③；批 8 T9）。
 *
 * @ai-context 🔴 **消歧（控制方 §2 B2 逐字）**：本模式 = **阅读面审校模式**（规格 §4.3 条件③：
 *   `⌘/Ctrl+Shift+R` 开、`Esc` 关，退出后墨度回常态）；**与既有的 LLM 文本校对
 *   （`proofread_estimate` / `proofread_run` / `ProofreadPanel`）无关**。`proofread` 一名已被后者占用
 *   （2026-09-13 实测，域 = `git ls-files` 1616 文件：全仓 305 处 / 51 文件；`app/src` 75 处 / 19 文件）
 *   ⇒ 本功能的属性名取 **`data-proofread-mode`**，**不得**用 `data-proofread`。
 * @ai-context 载体与范式：照 `shell/shellPhase.ts`（`data-shell-phase` 的同宿主形态，R3.1/R4.4）——
 *   属性写在 `<html>` 上，CSS 侧一条 `html[data-proofread-mode="on"] …` 就能重绑墨度 token，零 JS 参与。
 * @ai-context 三处降级**一律静默**（同 `applyShellPhase` 口径）：① 无 `document`（node 测试环境）
 *   ⇒ 不写 DOM、不抛；② 显式传 `null` 且无 `document` ⇒ 不写；③ 非法值 ⇒ **不动**既有属性
 *   —— **不**回退成 `"off"`（静默不动比替调用方猜一个值安全）。
 * @ai-context 🔴 **「缺省不落属性」（规格 §4.3 条件④ 逐字）**：`off` 走 **`removeAttribute`** ——
 *   若写成 `setAttribute(…, "off")`，「缺省态」与「显式关」在 DOM 上不可分，且首屏白白多一个属性。
 *   本条的牙在 `proofreadMode.test.ts`「退出后必须不落属性」与 jsdom 面的卸载用例。
 * @ai-context 边界：本件**只建通道**，不含任何 CSS、不含任何 UI —— 覆盖规则在 `ui/proofread.css`
 *   （由 `main.tsx` 在 token CSS **之后** import），入口按钮归 T11。
 */
import { useCallback, useEffect, useState } from "react";

/** 属性名逐字（控制方 §2 B2）；CSS 侧消费形态 = `html[data-proofread-mode="on"] …` */
export const PROOFREAD_MODE_ATTR = "data-proofread-mode";

/** 两态：`on` = 审校模式开（阅读面墨度加深）；`off` = 常态（**不落属性**）。 */
export type ProofreadMode = "on" | "off";

/** 取值守卫：只有两个合法字面量能过（外部输入 / 旧版遗留值一律不放行）。 */
const isMode = (value: string): value is ProofreadMode => value === "on" || value === "off";

/** 宿主：显式元素优先，否则 `<html>`；无 `document`（node 环境）⇒ `null`。 */
const hostOf = (el?: HTMLElement | null): HTMLElement | null =>
  el ?? (typeof document === "undefined" ? null : document.documentElement);

/** 写模式位（默认目标 = `<html>`）：`on` ⇒ 置属性；`off` ⇒ **摘属性**（缺省不落属性）；无宿主 / 非法值 ⇒ 静默不动。 */
export function applyProofreadMode(mode: ProofreadMode, el?: HTMLElement | null): void {
  if (!isMode(mode)) return;
  const target = hostOf(el);
  if (target === null) return;
  if (mode === "on") target.setAttribute(PROOFREAD_MODE_ATTR, "on");
  else target.removeAttribute(PROOFREAD_MODE_ATTR);
}

/** 读模式位：无宿主 / 属性缺失 / 值不是 `"on"` ⇒ `null`（调用方按「未设置」= 常态处理）。 */
export function readProofreadMode(el?: HTMLElement | null): ProofreadMode | null {
  const raw = hostOf(el)?.getAttribute(PROOFREAD_MODE_ATTR) ?? null;
  return raw !== null && isMode(raw) ? raw : null;
}

/**
 * 模式位 hook：挂载即应用、`mode` 变更跟手，**卸载清回 `off`**（页面保活挂载下防模式残留）。
 * 返回 `[mode, toggle]`：`toggle` 恒稳定 —— 快捷键（`App.tsx`）与 T11 的入口按钮必须是**同一个切换器**，
 * 否则两处各持一份状态就会互擦。
 */
export function useProofreadMode(): readonly [ProofreadMode, () => void] {
  const [mode, setMode] = useState<ProofreadMode>("off");
  useEffect(() => {
    applyProofreadMode(mode);
    return () => applyProofreadMode("off");
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => (m === "on" ? "off" : "on")), []);
  return [mode, toggle] as const;
}
