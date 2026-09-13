/**
 * lowConfidence.test.ts — 低置信类名判定（批 7 T3：自 `components/structuredBlocks.test.ts` 的
 * `describe("lowConfidenceClass")` 原样迁入；用例与断言逐字保留，只换 import 源）。
 *
 * @ai-context Why 必须迁而不是随模块删除：`lowConfidenceClass` 是 C4.2 里的**活导出**
 *   （生产调用点 = `components/session-detail/SessionRawView.tsx`），被删的只有测试-only 的两个
 *   渲染器（`renderLatex` / `renderMarkdownTable`）。删除与迁移**同批**做，才不会留下
 *   「实现还在、覆盖已丢」的中间态（控制方裁决）。
 * @ai-context 本文件守的是**阈值语义**（`< 0.5` 命中；`0.5` / `null` / `undefined` ⇒ 空串）；
 *   类名**字面量**的镜像一致性另由 `motion/env.test.ts` 的 V6 对拍守住（两者分工不重叠）。
 * @ai-context 副作用：无（纯函数用例，不读 store、不发请求、不写盘）。
 */
import { describe, expect, it } from "vitest";
import { lowConfidenceClass } from "./lowConfidence";

describe("lowConfidenceClass", () => {
  it("低置信（<0.5）返回标记类名，其余返回空串", () => {
    // Assert
    // 批 6 T13（R12.1）：类名由 `ed-low-confidence` 改为 `<既有基类>--<修饰>` 形状
    // （`ed-text` 基类的修饰类）—— 旧名字会被 motion-coverage.test.ts 的「未登记基类」判据拦下。
    expect(lowConfidenceClass(0.3)).toBe("ed-text--low-confidence");
    expect(lowConfidenceClass(0.5)).toBe("");
    expect(lowConfidenceClass(null)).toBe("");
    expect(lowConfidenceClass(undefined)).toBe("");
  });
});
