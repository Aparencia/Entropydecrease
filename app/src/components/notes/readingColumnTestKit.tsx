/**
 * readingColumnTestKit — `NotesReadingColumn.views.test.tsx` 的**共享夹具与宿主挂载工具**（批 8 T7 拆件）。
 *
 * @ai-context 自 `NotesReadingColumn.views.test.tsx` **纯搬迁**抽出（行为零变化 · 用例零变化）：
 *   夹具（`note` / `noop` / `MEMORY_KEY` / `handleOf`）、props 面（`HarnessProps`）与
 *   **宿主挂载工具**（页面形态的 `HarnessHost`）都是「怎么把被测宿主挂起来」的事实，
 *   与被测的 F 系列判据无关 ⇒ 物理分离到本件，让判据件腾出行数头寸（原 300 / 余 0）。
 * @ai-context 🔴 本件**不得** import `views/registry`（故 `HarnessHost` 的 `views` 是**必填**、
 *   类型由 `NotesReadingColumn` 的 props 面派生）：`views/architecture.guard.test.ts` 的
 *   A2①（运行时导入者恰 2 个页面）与 A2④（触碰注册的非 views 文件恰 5 个）都是 `toEqual`
 *   精确集合 ⇒ 夹具件会成为第 3 / 第 6 个而红。默认值 `viewsFor("note")` 由判据件那一侧给。
 * @ai-context 为什么 `HarnessHost` 必须走**真 hook**：`useColumnLayout("notes-outline", …)` 与
 *   `columnSpec("notes-outline")` 是页面侧的真实接线（C1① 的注入面），换成假值就测不到
 *   「注入清单真的进到切换器」（F0）。
 * @ai-context `vi.mock("@tauri-apps/api/core")` 与 `vi.mock("../RichEditorView")` 留在**判据件**里
 *   （`vi.mock` 是文件级注册，搬到本件会改变模块图的作用面）；本件只消费它们的效果。
 * 副作用：`noop` 是 `vi.fn()`（每次 import 一份）；渲染时只挂 React 树，不写盘、不发请求。
 * 边界：本件在六棘轮的 PROD 域内（它不是 `*.test.*`）⇒ 零颜色 / 零字号 / 零边框字面量。
 */
import { useRef } from "react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import type { Note } from "../../types";
import type { NoteEditHandle } from "../NoteEditView";
import { columnSpec } from "../../shell/columnRegistry";
import { useColumnLayout } from "../../hooks/useColumnLayout";
import NotesReadingColumn from "./NotesReadingColumn";

/**
 * 视图清单的 props 面 —— **从宿主组件派生**（本件不 import 注册表，理由见文件头）。
 * 调用侧传 `viewsFor("note")`（真注册表清单）时天然结构匹配。
 */
export type ColumnViews = NonNullable<ComponentProps<typeof NotesReadingColumn>["views"]>;

export const note: Note = {
  id: 1,
  title: "标题",
  content: "# 正文\n内容段落",
  source: "session",
  session_id: 42,
  rule_version: null,
  purify_stats: null,
  tags: "[]",
  properties: null,
  pin: 0,
  group_id: null,
  created_at: 1,
  updated_at: 2,
};

export const noop = vi.fn();
export const MEMORY_KEY = "view:default:note";

/** 注入的编辑器出口（`NoteEditHandle` 契约一字未改 —— 这行是 C4「不改接口」的编译期锚） */
export function handleOf(flushSave: () => Promise<void>): NoteEditHandle {
  return { flushSave, getContent: () => note.content };
}

export interface HarnessProps {
  /** 视图清单（**必填**：本件不得 import 注册表 —— 见文件头；判据件那一侧给 `viewsFor("note")`） */
  readonly views: ColumnViews;
  readonly editing?: boolean;
  readonly selected?: Note | null;
  readonly handle?: NoteEditHandle | null;
  /** 批 7 T17：卡片流那条链的 ms 出口（F11 用；缺省 = 今天的形态） */
  readonly onOpenSession?: (sessionId: number) => void;
  readonly onOpenSessionAt?: (sessionId: number, ms: number) => void;
}

/** 页面形态的宿主：真 `useColumnLayout` + 调用侧注入的真注册表清单（与 `NotesPage` 的那一行同源） */
export function HarnessHost({ views, editing = false, selected = note, handle = null, onOpenSession, onOpenSessionAt }: HarnessProps) {
  const outlineCol = useColumnLayout("notes-outline", columnSpec("notes-outline"));
  const editorRef = useRef<NoteEditHandle | null>(handle);
  return (
    <NotesReadingColumn
      selected={selected}
      editing={editing}
      setEditing={noop}
      readerSearch={null}
      noteColors={{}}
      groups={[]}
      editorRef={editorRef}
      outlineCol={outlineCol}
      onChanged={noop}
      onError={noop}
      onOpenAi={noop}
      onOpenModelCard={noop}
      onSelectionAction={noop}
      onPinToggle={noop}
      onDelete={noop}
      onTaskToggle={noop}
      onTagClick={noop}
      onOpenSession={onOpenSession}
      onOpenSessionAt={onOpenSessionAt}
      onImageOpen={noop}
      onCleanNotice={noop}
      views={views}
    />
  );
}
