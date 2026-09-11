/**
 * @ai-context ime.test.ts —— 中文输入法组合态守卫（规格 §5.2 第三条；批 0-D Task 7 **只建不接**）。
 *
 * Why node：被测定的是**纯函数**（不读 DOM、不依赖 React 事件系统）⇒ 留在 `vitest.config.ts` 的
 * 全局 node 环境即可，不必付 jsdom 的启动成本（同 `Text`/`zIndex` 的纯逻辑测试口径）。
 *
 * 副作用：无（无计时器、无监听器、无磁盘）。
 * 边界：① 只断言 `isComposing` 与 `keyCode` 两个信号；② `nativeEvent` 缺失时不得抛错 ——
 * 原生 `KeyboardEvent` 直接当参数传进去就是这种形状（消费方须写 `isImeComposing({ nativeEvent: e })`，
 * 见 `Modal.tsx` 的 @ai-context 与报告「批 4 接法」）；③ 与「组合期按 Esc 只取消候选词」的
 * 消费约定无关 —— 本批不接线，故本文件不含行为集成断言。
 */
import { describe, expect, it } from "vitest";
import { isImeComposing } from "./ime";

describe("isImeComposing —— 组合态守卫（规格 §5.2 第三条）", () => {
  it("React 合成事件带 isComposing=true（组合期）⇒ true", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: true }, keyCode: 13 })).toBe(true);
  });

  it("旧式回退：keyCode===229（部分环境组合期只给 229）⇒ true", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false }, keyCode: 229 })).toBe(true);
  });

  it("普通回车（isComposing=false, keyCode=13）⇒ false（必须放行提交）", () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false }, keyCode: 13 })).toBe(false);
  });

  it("边界：nativeEvent / keyCode 全缺 ⇒ false 且不抛错", () => {
    expect(isImeComposing({})).toBe(false);
  });
});
