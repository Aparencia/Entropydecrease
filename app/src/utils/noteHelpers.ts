/**
 * noteHelpers — 笔记展示辅助纯函数（v0.15 自 NoteListView 抽出——行组件/阅读视图/
 * 页面编排共用，避免 NoteListRow↔NoteListView 循环依赖）。
 */
import type { Note } from "../types";

/** 解析 tags JSON 为字符串数组（损坏 JSON 回退空数组——防御性） */
export function parseTags(note: Note): string[] {
  try {
    const t = JSON.parse(note.tags);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/** 格式化 unix 秒为日期字符串 */
export function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}
