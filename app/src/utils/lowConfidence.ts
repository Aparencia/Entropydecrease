/**
 * lowConfidence.ts — 低置信墨度类名的**唯一出口**（批 7 T2：按裁决 C4.2 从 `components/structuredBlocks.ts` 析出）。
 *
 * @ai-context Why 必须析出：原模块顶层持有两条**大体积数学排版库的静态边**（主包 + 它的样式表，
 *   位置 = `components/structuredBlocks.ts:8-9`）⇒ 任何只想要「类名函数」的引用，都会把那个库
 *   整个拉进**会话详情的惰性 chunk**（批 6 T34 实测第二份副本 **+227,858 B 原始 / +64,497 B gzip**；
 *   首屏预算看不见它，因为懒侧 chunk 不计入）。本模块**零依赖、零副作用**（不读 store、不发请求、
 *   不写盘、不碰 DOM）⇒ 那条边随之消失。析出**只搬声明的位置**，不搬语义。
 * @ai-context 类名字面量**逐字不改**（`ed-text--low-confidence`）：`ui/primitives/Text.css:63` 的规则、
 *   `motion.css:272/299/325` 的三档名单、`motion/env.ts:44` 的镜像全以它为准；旧名 `ed-low-confidence`
 *   **仍是退役名**（`motion-coverage.test.ts:67-73` 的「绝不许再出现」名单，不得改回）。
 *   阈值（`< 0.5`）与判定形态（`!= null &&`）在搬迁前后逐字相同。
 * @ai-context 镜像代价照旧：`motion/env.ts` 的 `LOW_CONFIDENCE_CLASS` 是**双写字面量**（批 6 评审 M-2
 *   已登记为合理代价 —— `motion/**` 不宜依赖别层）⇒ 两者一致性由 `motion/env.test.ts` 的 V6 对拍守住，
 *   本次**不动**那份镜像。生产调用点：`components/session-detail/SessionRawView.tsx`（1 个；
 *   加宽到 ≥2 是批 7 T17 的活）。
 */

/** 低置信墨度类名（与 `motion/env.ts` 的 `LOW_CONFIDENCE_CLASS` 镜像**逐字相同**） */
export const LOW_CONFIDENCE_CLASS = "ed-text--low-confidence";

/**
 * 置信度 → 低置信类名（`< 0.5` 判定，阈值与判定形态不变；`null`/`undefined` ⇒ 空串）。
 *
 * @ai-context 为什么返回空串而不是 `undefined`：调用点直接写 `className={lowConfidenceClass(x)}`，
 *   空串让 React 不产出 `class` 属性 —— 既有行为，逐字保留。
 * @ai-context 为什么是 `!= null &&`：同时排除 `null` 与 `undefined`，且让 `0`（= 可信度最低）**仍然
 *   命中**低置信分支 —— 这是既有语义，不许改成真值判断。
 */
export function lowConfidenceClass(confidence: number | null | undefined): string {
  return confidence != null && confidence < 0.5 ? LOW_CONFIDENCE_CLASS : "";
}
