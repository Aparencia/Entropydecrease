/**
 * @ai-context 断点契约守卫（规格 §6.2 阈值口径）。
 *
 * Why 断言**相对序**而不是只断言三个常数：规格的推导规则是「三列页 < 两列页 < 大纲列」
 *   （列越多越早折叠）。只钉数字的话，将来有人把 `outlineCol` 改小会静默破坏规则。
 *
 * 口径：`nav === NAV_MIN_WIDTH`（导航下限必须等于最小窗宽，否则 1024 档无意义）。
 */
import { describe, expect, it } from "vitest";
import { BREAKPOINTS, breakpointFor } from "./breakpoints";
import { NAV_MIN_WIDTH } from "./windowSize";

describe("断点（规格 §1 决策 16 / §6.2 阈值口径）", () => {
  it("三个规格数字逐字就位", () => {
    expect(BREAKPOINTS.nav).toBe(1024);
    expect(BREAKPOINTS.twoCol).toBe(1100);
    expect(BREAKPOINTS.navFull).toBe(1180);
  });

  it("相对序：三列页最早折叠 < 两列页 < 大纲列最晚折叠", () => {
    expect(BREAKPOINTS.threeCol).toBeLessThan(BREAKPOINTS.twoCol);
    expect(BREAKPOINTS.twoCol).toBeLessThan(BREAKPOINTS.outlineCol);
  });

  it("导航下限 = 最小窗宽（两处不许各写一个 1024）", () => {
    expect(BREAKPOINTS.nav).toBe(NAV_MIN_WIDTH);
  });

  it("breakpointFor 对所有键都返回正数（防漏键导致 undefined 静默成 NaN 比较）", () => {
    for (const k of Object.keys(BREAKPOINTS) as (keyof typeof BREAKPOINTS)[]) {
      expect(breakpointFor(k), k).toBeGreaterThan(0);
    }
  });
});
