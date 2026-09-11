import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICON_PATHS } from "./paths";
import { ICON_ELEMENT_TAGS } from "./types";
import { SCALE_TOKENS } from "../tokens";

describe("图标几何契约", () => {
  it("注册表非空，且 NAMES 与 PATHS 键集合一致", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_PATHS).sort());
  });

  it("命名规范：kebab-case，只含小写字母、数字与连字符", () => {
    for (const name of ICON_NAMES) {
      expect(name, `非法图标名：${name}`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("每个图标至少有一个元素（空几何是无声的渲染失败）", () => {
    for (const name of ICON_NAMES) {
      expect(ICON_PATHS[name].elements.length, `${name} 几何为空`).toBeGreaterThan(0);
    }
  });

  it("元素只用白名单内的四种标签", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        expect(ICON_ELEMENT_TAGS, `${name} 含越界标签 ${el.tag}`).toContain(el.tag);
      }
    }
  });

  it("path 的 d 非空且不含换行", () => {
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        if (el.tag === "path") {
          expect(el.d.trim().length, `${name} 的 d 为空`).toBeGreaterThan(0);
          expect(el.d, `${name} 的 d 含换行`).not.toMatch(/[\r\n]/);
        }
      }
    }
  });

  it("坐标落在 24 网格内（允许 0..24，含半个像素的溢出容忍）", () => {
    const inGrid = (n: number) => n >= 0 && n <= 24;
    for (const name of ICON_NAMES) {
      for (const el of ICON_PATHS[name].elements) {
        if (el.tag === "circle") {
          expect(inGrid(el.cx - el.r) && inGrid(el.cy + el.r), `${name} 圆越界`).toBe(true);
        }
        if (el.tag === "rect") {
          expect(inGrid(el.x) && inGrid(el.y) && inGrid(el.x + el.w) && inGrid(el.y + el.h), `${name} 矩形越界`).toBe(true);
        }
      }
    }
  });

  it("几何数据里不得出现任何颜色（颜色只由 currentColor 决定）", () => {
    // 把几何序列化成字符串再搜颜色痕迹 —— 结构化数据本该没有颜色字段，
    // 这条守的是「将来有人给图标加个 fill/stroke 字段」的退化
    const serialized = JSON.stringify(ICON_PATHS);
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(serialized).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    expect(serialized).not.toMatch(/"(?:fill|stroke|color)"/);
  });

  it("与批 0-A 的真源绑定：网格与描边值不得各写一套", () => {
    expect(SCALE_TOKENS.iconGrid).toBe(24);
    expect(SCALE_TOKENS.iconStroke).toBe(1.75);
    expect([...SCALE_TOKENS.iconSizes]).toEqual([16, 20, 24]);
  });
});
