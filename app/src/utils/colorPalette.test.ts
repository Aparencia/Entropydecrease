/**
 * 色板纯函数测试（v0.14 B 视觉系统）。
 *
 * @ai-context: spec §6 测试计划——isThemeSafe 全 12 色 × 双主题对比度 ≥4.5:1；
 *              resolveNoteColor 四档优先级（显式/继承/标签/默认）；未知色回退。
 */
import { describe, expect, it } from "vitest";
import {
  COLOR_IDS,
  COLOR_PALETTE,
  contrastRatio,
  isColorId,
  isThemeSafe,
  onColorText,
  paletteHex,
  parseNoteProperties,
  resolveNoteColor,
} from "./colorPalette";

describe("colorPalette 对比度基础", () => {
  it("黑白对比度为 21:1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it("同色对比度为 1:1", () => {
    expect(contrastRatio("#E5484D", "#E5484D")).toBeCloseTo(1, 1);
  });
});

describe("isThemeSafe 全 12 色 × 双主题", () => {
  for (const id of COLOR_IDS) {
    for (const theme of ["light", "dark"] as const) {
      it(`${id}/${theme} 黑或白文字 ≥4.5:1`, () => {
        expect(isThemeSafe(id, theme)).toBe(true);
      });
    }
  }
});

describe("onColorText 文字色选择", () => {
  it("黄色块用黑字（浅主题）", () => {
    expect(onColorText("yellow", "light")).toBe("black");
  });

  it("红色块用黑字（浅主题）——#E5484D 亮度 0.22，黑字 5.42:1 > 白字 3.88:1", () => {
    expect(onColorText("red", "light")).toBe("black");
  });

  it("黑色块用白字（浅主题）", () => {
    expect(onColorText("black", "light")).toBe("white");
  });
});

describe("paletteHex 未知 id 回退", () => {
  it("合法 id 返回主题变体", () => {
    expect(paletteHex("blue", "light")).toBe("#0091FF");
    expect(paletteHex("blue", "dark")).toBe("#5EB1FF");
  });

  it("未知 id / null / undefined 回退默认灰", () => {
    expect(paletteHex("neon", "light")).toBe(COLOR_PALETTE.gray.light);
    expect(paletteHex(null, "light")).toBe(COLOR_PALETTE.gray.light);
    expect(paletteHex(undefined, "dark")).toBe(COLOR_PALETTE.gray.dark);
  });
});

describe("isColorId 判定", () => {
  it("合法与非法", () => {
    expect(isColorId("red")).toBe(true);
    expect(isColorId("neon")).toBe(false);
    expect(isColorId(null)).toBe(false);
  });
});

describe("parseNoteProperties 防御", () => {
  it("缺失/损坏回退空对象", () => {
    expect(parseNoteProperties({})).toEqual({});
    expect(parseNoteProperties({ properties: null })).toEqual({});
    expect(parseNoteProperties({ properties: "{broken" })).toEqual({});
    expect(parseNoteProperties({ properties: "[1,2]" })).toEqual({});
  });

  it("正常解析", () => {
    expect(parseNoteProperties({ properties: '{"color":"blue","other":"x"}' })).toEqual({ color: "blue", other: "x" });
  });
});

describe("resolveNoteColor 四档优先级", () => {
  const tagColors = { 化妆: "pink", 编程: "blue" };

  it("笔记显式 > 组继承 > 标签", () => {
    const note = { properties: '{"color":"red"}', tags: '["编程"]' };
    expect(resolveNoteColor(note, { color: "green" }, tagColors)).toBe("red");
  });

  it("组继承 > 标签", () => {
    const note = { tags: '["编程"]' };
    expect(resolveNoteColor(note, { color: "green" }, tagColors)).toBe("green");
  });

  it("标签命中（首个有色标签）", () => {
    const note = { tags: '["化妆","编程"]' };
    expect(resolveNoteColor(note, null, tagColors)).toBe("pink");
  });

  it("无任何颜色 → null（默认灰）", () => {
    expect(resolveNoteColor({}, null, {})).toBeNull();
    expect(resolveNoteColor({ tags: '["无标签色"]' }, null, {})).toBeNull();
  });

  it("组无 color 字段（旧数据）不崩溃", () => {
    const note = { tags: '["编程"]' };
    expect(resolveNoteColor(note, {}, tagColors)).toBe("blue");
  });

  it("未知色板 id 仍透传（由 paletteHex 兜底）", () => {
    const note = { properties: '{"color":"neon"}' };
    expect(resolveNoteColor(note, null, {})).toBe("neon");
  });
});
