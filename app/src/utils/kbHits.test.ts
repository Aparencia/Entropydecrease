/**
 * kbHits 解析工具单测（v0.19.1 REQ-260——契约解析/跳转词提取 golden）。
 */
import { describe, expect, it } from "vitest";
import type { KbHit } from "../types";
import { firstMarkedTerm, hitLabel, isNoteHit, parseKbMeta } from "./kbHits";

const noteHit: KbHit = {
  chunkId: 1,
  sourceKind: "note",
  noteId: 7,
  fragmentId: null,
  noteTitle: "眼影入门",
  groupName: "化妆课",
  heading: "晕染手法",
  snippet: "…晕染手法的==少量多次==要点…",
  scoreKind: "fts",
};

describe("parseKbMeta", () => {
  it("解析合法 answer 元数据", () => {
    const meta = parseKbMeta(JSON.stringify({ mode: "answer", hits: [noteHit] }));
    expect(meta?.mode).toBe("answer");
    expect(meta?.hits).toHaveLength(1);
    expect(meta?.hits[0].noteId).toBe(7);
  });

  it("元素级畸形命中被过滤（审查 L3——不整包拒绝也不崩渲染）", () => {
    const malformed = [
      { chunkId: "x", snippet: 42 }, // chunkId/snippet 类型错
      null,
      { ...noteHit, snippet: undefined },
    ];
    const meta = parseKbMeta(JSON.stringify({ mode: "answer", hits: [noteHit, ...malformed] }));
    expect(meta?.mode).toBe("answer");
    expect(meta?.hits).toHaveLength(1);
    expect(meta?.hits[0].chunkId).toBe(1);
  });

  it("全部畸形 → 合法空数组（渲染零噪音）", () => {
    const meta = parseKbMeta(JSON.stringify({ mode: "hits-only", hits: [{ junk: true }] }));
    expect(meta).not.toBeNull();
    expect(meta?.hits).toEqual([]);
  });

  it("畸形/缺失/null 全部诚实返回 null", () => {
    expect(parseKbMeta(null)).toBeNull();
    expect(parseKbMeta("not json")).toBeNull();
    expect(parseKbMeta(JSON.stringify({ hits: [] }))).toBeNull();
    expect(parseKbMeta(JSON.stringify({ mode: "mystery", hits: [] }))).toBeNull();
  });
});

describe("firstMarkedTerm", () => {
  it("提取首个 == 标记词", () => {
    expect(firstMarkedTerm("…先讲==阴影==再讲==高光==…")).toBe("阴影");
  });

  it("无标记 → null（不误判）", () => {
    expect(firstMarkedTerm("普通文本没有标记")).toBeNull();
    expect(firstMarkedTerm("")).toBeNull();
  });
});

describe("hitLabel", () => {
  it("笔记含节标题；无标题笔记诚实降级", () => {
    expect(hitLabel(noteHit)).toBe("📄 眼影入门 · 晕染手法");
    expect(hitLabel({ ...noteHit, heading: null })).toBe("📄 眼影入门");
    expect(hitLabel({ ...noteHit, noteTitle: null, heading: null })).toBe("📄 未命名笔记");
  });

  it("碎片无标题——组名可溯源", () => {
    const frag: KbHit = { ...noteHit, sourceKind: "fragment", noteId: null, fragmentId: 3, heading: null };
    expect(hitLabel(frag)).toBe("📎 碎片（化妆课）");
    expect(hitLabel({ ...frag, groupName: null })).toBe("📎 碎片素材");
  });
});

describe("isNoteHit", () => {
  it("note + noteId 才可跳转", () => {
    expect(isNoteHit(noteHit)).toBe(true);
    expect(isNoteHit({ ...noteHit, noteId: null })).toBe(false);
  });
});
