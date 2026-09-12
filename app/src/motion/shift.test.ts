/**
 * @ai-context shift.test.ts — 位移唯一出口 `shift.ts` 的**行为级判据**（批 6 T9 · 计划 V2/V3/V4）。
 *
 * Why：`SHIFT_MAX_PX` / `clampShift` / `ANIMATABLE_PROPERTIES` 是波 C（T12/T27/T31）所有位移 tween 的公共
 * 入口 —— 入口的**行为**（夹取边界、NaN 口径、白名单内容）必须逐条可红，否则「8px 上限」只是一句注释。
 * 每条判据的专属变异体见 `task-9-report.md`（M2 上界 / M2b NaN / M2c 下界 / M3 常量 / M4 白名单）。
 * 副作用：无（纯函数；**node 环境**，本文件不加 jsdom 头）。
 * 边界：`clampShift` **不能**挡住绕过本模块的裸 `gsap.to(el, { y: 40 })`（`shift.ts` 边界②）；
 *   本文件判的是入口自身的行为，**不判**调用方是否真的走了入口（那是 `shift.guard.test.ts` 与评审的事）。
 */
import { describe, expect, it } from "vitest";
import { ANIMATABLE_PROPERTIES, SHIFT_BANNED_PROPERTIES, SHIFT_MAX_PX, clampShift } from "./shift";

describe("clampShift：§8.4 的 8px 夹取（上下界与 NaN 各有专属判据）", () => {
  it("上界：0 / 7.5 / 8 原样；9 与 ±Infinity 夹到 ±8（断言写裸 8 ⇒ 常量被改也红）", () => {
    expect(clampShift(0)).toBe(0);
    expect(clampShift(7.5)).toBe(7.5);
    expect(clampShift(8)).toBe(8);
    expect(clampShift(9)).toBe(8);
    expect(clampShift(Number.POSITIVE_INFINITY)).toBe(8);
    expect(SHIFT_MAX_PX).toBe(8);
  });

  it("下界：-8 原样、-9 / -Infinity 夹到 -8（只守上界会在反向动效上漏）", () => {
    expect(clampShift(-8)).toBe(-8);
    expect(clampShift(-9)).toBe(-8);
    expect(clampShift(Number.NEGATIVE_INFINITY)).toBe(-8);
  });

  it("NaN ⇒ 抛（不静默归零：NaN 意味着上游解析失败，归零会把它伪装成「合法的不动」）", () => {
    expect(() => clampShift(Number.NaN)).toThrow(/NaN/);
  });
});

describe("ANIMATABLE_PROPERTIES：R8.4 的属性白名单（T11 的属性集合审计消费它）", () => {
  it("逐序等于 R8.4 的逐字集合（**逐序数组相等** —— 换序同样红，集合相等测不出换序）", () => {
    expect(ANIMATABLE_PROPERTIES).toEqual(["transform", "translate", "rotate", "scale", "opacity", "filter"]);
  });

  it("不含任何 layout 属性（`width` / `height` / `margin` / `left` / `top` 逐个反例）", () => {
    for (const banned of ["width", "height", "margin", "left", "top"]) {
      expect(ANIMATABLE_PROPERTIES, `${banned} 是 layout 属性，动它会触发排版`).not.toContain(banned);
    }
  });

  it("两张表不相交，且 SHIFT_BANNED_PROPERTIES 覆盖 R11.4 点名的三个布局量", () => {
    expect(ANIMATABLE_PROPERTIES.filter((p) => SHIFT_BANNED_PROPERTIES.includes(p))).toEqual([]);
    for (const prop of ["margin", "left", "top"]) expect(SHIFT_BANNED_PROPERTIES).toContain(prop);
  });
});
