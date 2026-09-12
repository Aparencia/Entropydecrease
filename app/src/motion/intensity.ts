/**
 * intensity.ts — 三档动效强度通道（规格 §8.5；R3.1 / R3.2）。
 * @ai-context Why：载体 = 写在 `<html>` 上的 `data-motion`（取值逐字 "eco" | "standard" | "rich"），
 *   CSS 才能用一条选择器改幅度/频率；「系统 `prefers-reduced-motion` 优先于档位」由 `motion.css` 的
 *   **源序**实现（档位块写在 reduced-motion 块之前）—— 本文件只负责「值 ↔ 属性 ↔ 持久化」，
 *   不碰任何时长数值（时长/缓动的唯一真源是 `scripts/gen-tokens.mjs`）。
 * @ai-context 初值**跟随系统**：`prefers-reduced-motion: reduce` ⇒ "eco"，否则 "standard"；已存过的
 *   用户选择优先于系统初值（记忆是显式选择，初值只是缺省）。
 * @ai-context 副作用：写 `<html data-motion>`（文档级；Tauri 多窗口变体各自独立）与 `motion:intensity`。
 *   三处降级**一律静默**：① 无 `document`（node 测试环境）⇒ 不写 DOM；② 无 `localStorage` / 配额
 *   拒绝 / 隐私模式 ⇒ 不记忆；③ 无 `window.matchMedia`（实测 jsdom 30.0.1 没有它）⇒ 按「未 reduce」
 *   取 "standard"，**不抛**。
 * @ai-context 边界：只认三档字面量；垃圾值（空串 / 大小写不符 / 多余空白 / 旧版遗留）当作**没有记忆**，回退系统初值。
 */
import { useCallback, useEffect, useState } from "react";
export const MOTION_INTENSITIES = ["eco", "standard", "rich"] as const;
export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];
export const MOTION_INTENSITY_KEY = "motion:intensity";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"; // matchMedia 的唯一入参（逐字）
/** 初值：`matches === true` ⇒ "eco"；`mql` 缺失（无 `matchMedia`）⇒ "standard"（§8.5 逐字）。 */
export function defaultIntensity(mql?: Pick<MediaQueryList, "matches"> | null): MotionIntensity {
  return mql?.matches === true ? "eco" : "standard";
}
/** 读记忆：无值 / 值不在三档内 / `Storage` 抛 ⇒ `null`（调用方回退系统初值）。 */
export function readIntensity(storage: Storage = globalThis.localStorage): MotionIntensity | null {
  try {
    const raw = storage.getItem(MOTION_INTENSITY_KEY);
    return raw !== null && (MOTION_INTENSITIES as readonly string[]).includes(raw) ? (raw as MotionIntensity) : null;
  } catch {
    return null;
  }
}
/** 写记忆：配额满 / 隐私模式 / node 无 localStorage 抛 ⇒ 静默（记忆失败不阻塞切换）。 */
export function writeIntensity(value: MotionIntensity, storage: Storage = globalThis.localStorage): void {
  try {
    storage.setItem(MOTION_INTENSITY_KEY, value);
  } catch {
    /* 静默降级：无 localStorage / 配额满 / 隐私模式 */
  }
}
/** 写 `data-motion`（默认目标 = `<html>`）；无 `document` 时静默返回。 */
export function applyIntensity(value: MotionIntensity, el?: HTMLElement | null): void {
  const target = el ?? (typeof document === "undefined" ? null : document.documentElement);
  if (target !== null) target.dataset.motion = value;
}
/** 强度 hook：`[当前档, 选择档]`。初值**惰性读取**（已存值 → 系统初值），并在 `<html>` 上落地。 */
export function useMotionIntensity(): readonly [MotionIntensity, (v: MotionIntensity) => void] {
  const [value, setValue] = useState<MotionIntensity>(() => {
    const stored = readIntensity();
    if (stored !== null) return stored;
    const noApi = typeof window === "undefined" || typeof window.matchMedia !== "function";
    return defaultIntensity(noApi ? null : window.matchMedia(REDUCED_QUERY));
  });
  useEffect(() => applyIntensity(value), [value]);
  const select = useCallback((next: MotionIntensity) => {
    setValue(next);
    writeIntensity(next);
  }, []);
  return [value, select];
}
