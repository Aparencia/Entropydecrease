/**
 * parseTags.test.ts — components/NoteListView.tsx parseTags 纯函数单测（AAA 结构）。
 *
 * Why：tags 字段是落库 JSON 字符串（v0.10.0），损坏 JSON / 非数组值均可能出现
 * （旧数据、手写脏数据）——parseTags 的防御回退是标签过滤面板不崩的前提。
 */
import { describe, expect, it } from "vitest";
import { parseTags } from "./NoteListView";
import type { Note } from "../types";

/** 最小 Note 桩——parseTags 只读 tags 字段，其余字段以桩补齐类型 */
function noteWithTags(tags: string): Note {
  return {
    id: 1,
    title: "t",
    content: "",
    source: "manual",
    tags,
    pin: 0,
    created_at: 0,
    updated_at: 0,
  };
}

describe("parseTags", () => {
  it("合法 JSON 数组原样返回", () => {
    // Arrange / Act / Assert
    expect(parseTags(noteWithTags('["学习","数学"]'))).toEqual(["学习", "数学"]);
  });

  it("空数组合法返回空数组", () => {
    expect(parseTags(noteWithTags("[]"))).toEqual([]);
  });

  it("损坏 JSON 回退空数组（不抛异常）", () => {
    // Arrange：手写脏数据
    // Act / Assert：不抛错，防御回退
    expect(() => parseTags(noteWithTags("{not json"))).not.toThrow();
    expect(parseTags(noteWithTags("{not json"))).toEqual([]);
  });

  it("合法 JSON 但非数组（对象/字符串）回退空数组", () => {
    // Arrange / Act / Assert：类型契约只接受数组
    expect(parseTags(noteWithTags('{"a":1}'))).toEqual([]);
    expect(parseTags(noteWithTags('"just a string"'))).toEqual([]);
  });

  it("空字符串 tags 回退空数组", () => {
    expect(parseTags(noteWithTags(""))).toEqual([]);
  });
});
