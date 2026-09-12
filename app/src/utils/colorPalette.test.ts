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
  buildNoteColorMap,
  contrastRatio,
  isColorId,
  isThemeSafe,
  onColorText,
  paletteHex,
  parseNoteProperties,
  resolveNoteColor,
  visibleNotesOf,
} from "./colorPalette";
import type { Note, NoteGroup } from "../types";

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

// ── 批 5 T4：自 NotesPage 搬入的两个派生（判据随搬入新增；既有用例未改）──
const mkNote = (id: number, group_id: number | null, tags = "[]", properties: string | null = null): Note =>
  ({ id, title: `n${id}`, content: "", source: "manual", tags, properties, pin: 0, group_id, created_at: 1, updated_at: 2 });

const mkGroup = (id: number, color: string | null): NoteGroup =>
  ({ id, name: `g${id}`, terrain: "container", kind: "topic", domainTag: null, source: "manual",
    seriesKey: null, routeReason: null, routeOverridden: 0, color, noteCount: 1, createdAt: 1, updatedAt: 2 });

describe("visibleNotesOf 组过滤 + 封存过滤（批 5 T4 搬入）", () => {
  it("① groupFilter 生效：只留该组；null = 全量（含未归组）", () => {
    const notes = [mkNote(1, 7), mkNote(2, 8), mkNote(3, null)];
    const keep = (n: Note[]) => n;
    expect(visibleNotesOf(notes, 7, keep).map((n) => n.id)).toEqual([1]);
    expect(visibleNotesOf(notes, null, keep).map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("② filterSealed 生效：恒真桩原样透传（同一引用，不复制）/ 恒假桩滤空", () => {
    const notes = [mkNote(1, 7)];
    const keep = (n: Note[]) => n;
    const drop = (): Note[] => [];
    expect(visibleNotesOf(notes, null, keep)).toBe(notes);
    expect(visibleNotesOf(notes, null, drop)).toEqual([]);
  });
});

describe("buildNoteColorMap 色板优先级（批 5 T4 搬入）", () => {
  it("③ 笔记显式 > 组继承 > 标签 > 默认灰；未归组/组不存在都不查组表", () => {
    const groups = [mkGroup(7, "green")];
    const tagColors = { 编程: "blue" };
    const notes = [
      mkNote(1, 7, '["编程"]', '{"color":"purple"}'), // 显式优先
      mkNote(2, 7, '["编程"]'),                        // 组继承次之
      mkNote(3, null, '["编程"]'),                     // 未归组 → 标签档
      mkNote(4, 9, "[]"),                              // 组不存在 → 默认灰
      mkNote(5, null, "[]"),                           // 全无量 → 默认灰
    ];
    expect(buildNoteColorMap(notes, groups, tagColors)).toEqual({ 1: "purple", 2: "green", 3: "blue", 4: null, 5: null });
  });
});
