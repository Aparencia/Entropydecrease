/**
 * registry — 批 5 视图层的**单一注册表**（C1/C5）：按对象类型查「这个对象有哪些视图」。
 *
 * @ai-context 为什么 `load` 是**可选**的加载器（C1：取代规格 §7.1 的静态 `Component` 字段与
 *   `lazy` 布尔）：默认视图（`raw`；规格 §7.3①「原文永远保留」）必须**常驻** —— 容器同步渲染它、
 *   不经 `React.lazy` ⇒ 它的 `load` **缺省**。于是本模块**零静态引用任何视图组件**（顶部只有
 *   `import type`），却仍持有默认视图的 key/label/icon ⇒ 仍是「按对象类型查可用视图的单一注册表」。
 * @ai-context 依赖方向（C1①）：`views/registry.ts` **只许被** `pages/SessionsPage.tsx` /
 *   `pages/NotesPage.tsx` 直接 import。理由：`shell/**` 与 `ui/primitives` barrel 都落在首屏静态
 *   可达集内，注册表一旦被它们 import，非默认视图的 `load` 目标就跟着进首屏图。本文件自身
 *   **不产生任何运行时依赖边**（顶部全是 `import type`）⇒ 静态 import 它 ≠ 把它拉进产物。
 * @ai-context **中间态声明（批 5 T6 的依赖顺序造成，不是遗漏）**：视图模块要 `import type` 本文件的
 *   槽类型 ⇒ **契约必须先落地**；而「视图清单」（`viewsFor` / `keysFor` / `FROZEN_VIEW_KEYS`）只有
 *   在视图模块落地后才满足判据 G3「每个 `load()` 都能解析出真实模块」。故本文件此刻**只含契约**，
 *   视图清单随后半提交补齐。详见 `.superpowers/sdd/2026-09-12-frontend-redesign-batch5-view-layer/task-6-report.md`。
 * 副作用：无（纯类型 + 常量；0 运行时 import、0 I/O）。
 * 边界：本文件只描述**形状**；「有哪些视图 / 什么顺序 / 哪个是默认」由视图清单承载（下半部）。
 */
import type { ComponentType } from "react";
import type { Note } from "../types/notes";
import type { SessionDetail, SessionOcrBlock } from "../types/session";
import type { IconName } from "../ui/icons";

/** 视图记忆的**对象类型粒度**（C5 / 规格决策 23）：**不含 `kind`** —— web/photo/video 共记一份。 */
export type ObjectType = "session" | "note";

/** 视图规格（C1）。`key` 是视图记忆里的值，也是视图之间的唯一标识。 */
export interface ViewSpec<P> {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly appliesTo: ObjectType;
  /** 非默认视图：**模块级惰性**加载器；默认视图**不提供** —— 它由容器同步渲染并常驻（§7.3②）。 */
  readonly load?: () => Promise<{ default: ComponentType<P> }>;
}

/** 会话视图槽：全部由**容器**注入 ⇒ 视图自身零 `invoke`、零 `@tauri-apps`（C14②）。 */
export interface SessionViewSlot {
  readonly detail: SessionDetail;
  readonly imageUrl: (imageRef: string | null) => string | null;
  readonly ocrBlocksByScreen: ReadonlyMap<number, SessionOcrBlock[]>;
  readonly selectingScreen: number | null;
  readonly onSelectScreen: (firstSeenMs: number | null) => void;
  readonly panelToast: { screenKey: number; msg: string } | null;
  readonly onShowToast: (screenKey: number, msg: string) => void;
  readonly onClearToast: () => void;
  readonly autoRefineTaskId: number | null;
  readonly onRefineTaskStarted?: (sessionId: number, taskId: number) => void;
}

/** 笔记视图槽（同上：零 `invoke`）。`onOpenSession` 可选 —— `session_id` 为空的手动笔记没有目标。 */
export interface NoteViewSlot {
  readonly note: Note;
  readonly onTaskToggle: (newContent: string) => void;
  readonly onOpenSession?: (sessionId: number) => void;
  readonly onImageOpen: (src: string, title?: string) => void;
}
