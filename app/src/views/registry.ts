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

/**
 * ── 视图清单（本文件的下半部）─────────────────────────────────────────────────────────────
 * @ai-context 会话 spec 顺序（`[0]` = 默认）：`raw` → `tritrack` → `proof` → `cardflow` → `preview`。
 *   既有第二视图 `preview` 今天是被页 chunk **静态** import 的 `NotePreviewView`；进注册表后
 *   **必须惰性**（R-1：否则「非默认视图模块级惰性」这条硬约束当场破功）。
 * @ai-context `preview` 的 `load` 指向 **`./session/SessionNotePreview`（会话槽适配器）**，不是
 *   `NotePreviewView` 本体：`NotePreviewView` 的 props 是 `{sessionId, autoTaskId, onTaskStarted}`
 *   （容器形态、自带取数），而注册表的 `P` 是 `SessionViewSlot`（纯注入槽）—— 两者不同形，
 *   直接指向它得到 `TS2322`。适配器把槽映射成 props（**不是**第二套取数），详见该文件头部。
 * @ai-context 笔记 spec 顺序：`raw` → `cardflow`。「带证据三轨」是 T13 的**条件项** —— T1 的探针
 *   判定「不存在逐段级『笔记 ↔ 证据』读取路径」⇒ **不进表**（C2：不许空壳视图）。
 * @ai-context `FROZEN_VIEW_KEYS` 是**独立于实现的**冻结声明：`keysFor` 由 `viewsFor` 派生，冻结表
 *   逐字写死 ⇒ 二者对拍（G1）能同时抓住「实现偷偷增删视图」与「冻结表被手工改宽」。
 */
const SESSION_VIEWS: readonly ViewSpec<SessionViewSlot>[] = [
  // 默认视图：**无 `load`** —— 容器同步渲染、常驻（§7.3①）；图标 = 堆叠的行（逐行原文）
  { key: "raw", label: "原文", icon: "sessions", appliesTo: "session" },
  { key: "tritrack", label: "三轨对齐", icon: "clock", appliesTo: "session", load: () => import("./session/SessionTriTrackView") },
  { key: "proof", label: "印样", icon: "image", appliesTo: "session", load: () => import("./session/SessionProofView") },
  { key: "cardflow", label: "卡片流", icon: "classroom", appliesTo: "session", load: () => import("./session/SessionCardFlowView") },
  { key: "preview", label: "笔记预览", icon: "notes", appliesTo: "session", load: () => import("./session/SessionNotePreview") },
];

const NOTE_VIEWS: readonly ViewSpec<NoteViewSlot>[] = [
  // 默认视图：**无 `load`**（同上）；图标 = 文档 + 文字行
  { key: "raw", label: "原文", icon: "notes", appliesTo: "note" },
  { key: "cardflow", label: "卡片流", icon: "action", appliesTo: "note", load: () => import("./note/NoteCardFlowView") },
];

/** 可用视图清单（按对象类型；`viewsFor(t)[0]` 恒为默认视图）。未知 `objectType` ⇒ `[]`（G5）。 */
export function viewsFor(objectType: "session"): readonly ViewSpec<SessionViewSlot>[];
export function viewsFor(objectType: "note"): readonly ViewSpec<NoteViewSlot>[];
export function viewsFor(objectType: ObjectType): readonly (ViewSpec<SessionViewSlot> | ViewSpec<NoteViewSlot>)[];
export function viewsFor(objectType: ObjectType): readonly (ViewSpec<SessionViewSlot> | ViewSpec<NoteViewSlot>)[] {
  if (objectType === "session") return SESSION_VIEWS;
  if (objectType === "note") return NOTE_VIEWS;
  // 未知类型：**返回空表**，不是抛错、也不是「默认全集」（G5）—— 调用点拿不到视图就渲染空态，
  // 而不是把会话视图塞进笔记面板。
  return [];
}

/** 可用视图键。**由 `viewsFor` 派生**（视图清单只有一处），与 `FROZEN_VIEW_KEYS` 由 G1 对拍。 */
export function keysFor(objectType: ObjectType): readonly string[] {
  return viewsFor(objectType).map((spec) => spec.key);
}

/** 冻结的视图键清单（顺序 = spec 顺序，`[0]` = 默认视图）。增删视图必须**同时**改此处与 `viewsFor`。 */
export const FROZEN_VIEW_KEYS: Readonly<Record<ObjectType, readonly string[]>> = {
  session: ["raw", "tritrack", "proof", "cardflow", "preview"],
  note: ["raw", "cardflow"],
};
