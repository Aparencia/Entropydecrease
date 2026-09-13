/**
 * @ai-context 批 7 T1（C9.2 / R4 / R9.1）：`focus*` 家族的**目标规格**（纯数据）与跳转请求的判别键。
 *   Why 只抽「类型 + 纯函数」：`CommandPalette.kb.test.tsx` 与 `useNotesDeepLink.test.ts` 都把
 *   `App.tsx` 当源码文本读（前者判 `const [<字段>, set` 的声明形态），故状态与 setter 必须留在那里。
 * 副作用：无（纯函数，不读 store / 不发请求 / 不写磁盘）。
 * 边界：本文件**不得** import `views/**` / `pages/**`（`shell/**` 属首屏面，见 architecture.guard）。
 */

/** `[[ts:ms]]` 深链的 **ms 载体**：`key` 是单调判别键（同值重复跳转必须能重新触发）。 */
export interface FocusSeek {
  readonly ms: number;
  readonly key: number;
}

/** 会话深链目标：`ms` 缺省 = 只定位会话、不 seek（`null` 与 `0` 语义不同）。 */
export interface SessionJump {
  readonly sessionId: number;
  readonly ms: number | null;
}

/** 由会话 id（+ 可选 ms）构造深链目标；`undefined` ⇒ `ms: null`（不 seek）。 */
export function sessionJumpOf(sessionId: number, ms?: number): SessionJump {
  return { sessionId, ms: ms === undefined ? null : ms };
}

/**
 * 跳转请求的**单调判别键**：裸 `number` 不够 —— `setState` 同值不触发重渲染，
 * 会话页已打开时再点同一个时间码就不会重新定位。`prev` 由调用方的 ref 持有。
 */
export function seekKeyOf(now: number, prev: number): number {
  return now > prev ? now : prev + 1;
}
