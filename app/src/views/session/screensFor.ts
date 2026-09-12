/**
 * @ai-context screensFor.ts — 「给定 `activeMs` ⇒ 掠过哪几帧缩略」的**单一真源**（批 6 波 C · T31；
 *   规格 §8.6 第 5 行「掠过几帧缩略」· 裁决 R5.5 / R5.5-b ①）。
 *
 * Why 单独成件（纯函数 ⇒ node 环境可测、无 DOM）：
 *   · **PB1 明确把口径留给 #5**（探针逐字「『最近一帧』的判据口径…**需 #5 自己定为单一真源**」）⇒
 *     口径只落在 `screensAround` 一处，判据（`screensFor.test.ts`）直接钉它，换口径只改这一个函数。
 *   · **不发明数字**：帧数上界 `FRAMES_MAX` 是**硬限**（`rich` 的 6 就是它本身）；取材只按
 *     `first_seen_ms` 这个既有字段 —— **不插值、不拉伸时间轴**。`screens` 稀疏（或 `image_ref`
 *     全空）⇒ 返回 `[]`，调用方**不显示掠过条**，而不是把少数的屏摊开充数。
 *   · `thumbRefOf` 与 `LiveImageStrip.tsx:24-26` 的 `thumbOf` **同款口径**（`full/` → `thumb/`）：
 *     掠过条只许取 320px 级缩略图 —— `full/` 是原图，图集可达 115 MB 级（R5.5-b 的教训）。
 * 副作用：无（纯常量 + 纯函数；不碰 DOM / 存储 / IPC / GSAP / `@tauri-apps`）。
 * 边界：① `first_seen_ms` 相同的屏保持源数组次序（稳定排序 ⇒ 逐序读数不抖）；
 *   ② 超出 `max` 时丢弃的是**最老的**屏（保住目标邻域）；③ `max <= 0` ⇒ `[]`。
 */
import type { MotionIntensity } from "../../motion/intensity";
import type { SessionScreen } from "../../types/session";

/** 归档路径的两层约定（PB1 逐字：`full/<ms>.webp` + `thumb/` 双层） */
export const FULL_PREFIX = "full/";
export const THUMB_PREFIX = "thumb/";

/** 掠过用的相对路径：只把 `full/` 换成 `thumb/`，其余原样（同 `LiveImageStrip.thumbOf`）。 */
export function thumbRefOf(rel: string): string {
  return rel.startsWith(FULL_PREFIX) ? `${THUMB_PREFIX}${rel.slice(FULL_PREFIX.length)}` : rel;
}

/** 三档各自的掠过帧数：`eco` = 1 帧（只显目标那一屏）· standard = 3 · rich = 6。 */
export const FRAMES_BY_TIER: Readonly<Record<MotionIntensity, number>> = { eco: 1, standard: 3, rich: 6 };

/** 帧数**硬限**（`FRAMES_BY_TIER` 的任何值都不得越过它 —— 它是上界，不是"再加一点"） */
export const FRAMES_MAX = 6;

/** 把任意帧数夹进硬限（**纯函数** ⇒ 上限本身可单测：越限值也能直接喂进来验它有没有牙）。 */
export function capFrames(want: number): number {
  return Math.min(want, FRAMES_MAX);
}

/** 档位 × reduced-motion ⇒ 掠过帧数（命中 reduce ⇒ 恰 1 帧，与 `eco` 同形）。 */
export function framesFor(tier: MotionIntensity, reduced: boolean): number {
  if (reduced) return 1;
  return capFrames(FRAMES_BY_TIER[tier]);
}

/**
 * `activeMs` ⇒ 掠过用的缩略屏（**单一真源**；口径 = 批 6 T31 定，PB1 未判定）。
 *
 * 口径：取 `first_seen_ms <= activeMs` 的**最后一屏**当锚，返回以它结尾的最近 `max` 屏（升序）；
 * `activeMs` 早于所有屏 ⇒ 锚 = `first_seen_ms` 最小的那一屏（窗口退化成它自己）。
 * 只收 `image_ref !== null` 的屏（空 ref 的屏**跳过**，不是占位）。
 */
export function screensAround(screens: readonly SessionScreen[], activeMs: number, max: number): readonly SessionScreen[] {
  if (max <= 0) return [];
  const usable = screens.filter((s) => s.image_ref !== null);
  if (usable.length === 0) return [];
  const sorted = [...usable].sort((a, b) => a.first_seen_ms - b.first_seen_ms);
  let anchor = 0;
  for (let i = 0; i < sorted.length; i += 1) if (sorted[i].first_seen_ms <= activeMs) anchor = i;
  return sorted.slice(Math.max(0, anchor - max + 1), anchor + 1);
}
