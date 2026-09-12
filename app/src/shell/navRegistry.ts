/**
 * @ai-context 导航注册表 —— 9 个页面的**单一真源**（规格 §10 批 3 行「9 页全走注册表」）。
 *
 * Why：同一个事实（有哪 9 个页面）原本在 `App.tsx` 里写了**四遍** —— `type Page` 字面量联合、
 *   9 行页面 import、`NAV_ITEMS` 数组、9 段 `<PageSlot>` JSX。加一页要改四处，漏一处是**静默**的
 *   （类型不报错、列表不报错、只有点进去才白屏）。本模块把「有哪些页面」收成一处，其余从它派生：
 *   `PageKey` 由组件表键集派生、顶栏项由注册表 map 出来、`isPageKey` 供 ⌘K/深链校验；
 *   `App.tsx` 不再直接 import 任何页面模块（守卫 `navRegistry.test.ts` 逐条判它）。
 *
 * 保活（批 2 裁决 2 的硬要求，本模块必须不破坏它）：只提供**稳定的组件引用** —— 两张表在模块
 *   加载时建一次、不包 wrapper、不每渲染新建 ⇒ 组件标识稳定，是「访问过即永不卸载」的前提。
 *
 * 副作用：模块加载时构建两张常量表（无 I/O、无 window 访问）；8 个 `lazy()` **不在首帧**触发 import。
 * 边界：本模块**只描述页面**，不描述列（列在 columnRegistry）、不描述视图（视图在批 5）。
 *   图标名必须来自 `ui/icons`（自绘图标集，批 0-B）；**不得内联 svg 元素** ——
 *   `ui/icons/no-inline-svg.test.ts` 是**文本棘轮**（`src/` 下任何含「小于号紧接 svg」的文件
 *   都会被点名，连注释里的字符串也算；本行刻意不写出那个连写，否则守卫当场红）。
 */
import { lazy } from "react";
import type { IconName } from "../ui/icons";
// 课堂页（默认页）保持静态 import：它是首屏必渲染页（批 2 控制方裁决 2 末条）。
// 其余 8 页 lazy —— 「保留挂载」按页保留：访问过的页常驻，未访问的不进首屏 module graph。
import ClassroomPage from "../pages/ClassroomPage";
const SessionsPage = lazy(() => import("../pages/SessionsPage"));
const NotesPage = lazy(() => import("../pages/NotesPage"));
const ActionPage = lazy(() => import("../pages/ActionPage"));
const ReviewPage = lazy(() => import("../pages/ReviewPage"));
const ChatPage = lazy(() => import("../pages/ChatPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const GoalsPage = lazy(() => import("../pages/GoalsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));

/**
 * key → 页面组件（**页面模块的唯一 import 点**）。
 * Why 与 `NAV_ENTRIES` 分成两张表：本表的值保留**各自精确的组件类型**（含 props），
 *   故 `navComponent("notes")` 能把 NotesPage 的 props 签名原样带给调用点；若把组件塞进
 *   同构数组，联合类型会抹掉每个页面的 props（计划 Task 6 Step 1 的注已点名这一点）。
 */
export const PAGE_COMPONENTS = {
  classroom: ClassroomPage,
  sessions: SessionsPage,
  notes: NotesPage,
  action: ActionPage,
  review: ReviewPage,
  chat: ChatPage,
  knowledge: KnowledgePage,
  goals: GoalsPage,
  settings: SettingsPage,
} as const;

/** 9 个页面键 —— 由**组件表键集派生**（新增页面 = 加一行组件，类型与守卫一起跟上） */
export type PageKey = keyof typeof PAGE_COMPONENTS;

/** 某个 key 的组件类型（默认参数下是 9 个页面组件的联合） */
export type PageComponent<K extends PageKey = PageKey> = (typeof PAGE_COMPONENTS)[K];

/** 类型收窄的取值口：`navComponent("notes")` 等价于 App.tsx 从前那句 `lazy(() => import(...))` */
export function navComponent<K extends PageKey>(key: K): PageComponent<K> {
  return PAGE_COMPONENTS[key];
}

export interface NavEntry {
  readonly key: PageKey;
  /**
   * 顶栏/标题用的短名（规格 §6.1 的 8 项命名）。
   * T6 过渡期曾并存一列 `legacyLabel`（emoji + 长名，逐字抄自旧 `NAV_ITEMS`）；T7 把顶栏切到本列后
   * **已删除** —— emoji 出局是控制方裁决 A2（规格 `emoji|表情` 0 命中；规范态是 §1 决策 5 的自绘
   * 线性图标集）：图标 + emoji + 文字是三重冗余，且 emoji 会污染宽度读数（批 3 陷阱 #16）。
   */
  readonly label: string;
  /** `ui/icons` 的键：`paths.domain.ts` 的 9 个域图标与 9 个 key 一一对应 */
  readonly icon: IconName;
  readonly Component: PageComponent;
}

/** 顶栏 8 项（**顺序 = 今日 `NAV_ITEMS` 顺序**；规格 §6.1 把「设置」下沉到右上齿轮） */
export const NAV_ENTRIES = [
  { key: "classroom", label: "课堂", icon: "classroom", Component: ClassroomPage },
  { key: "sessions", label: "会话", icon: "sessions", Component: SessionsPage },
  { key: "notes", label: "笔记", icon: "notes", Component: NotesPage },
  { key: "action", label: "行动", icon: "action", Component: ActionPage },
  { key: "review", label: "复习", icon: "review", Component: ReviewPage },
  { key: "chat", label: "AI 对话", icon: "ai", Component: ChatPage },
  { key: "knowledge", label: "体系", icon: "knowledge", Component: KnowledgePage },
  { key: "goals", label: "目标", icon: "goals", Component: GoalsPage },
] as const satisfies readonly NavEntry[];

/** 非顶栏项（规格 §6.1「设置下沉右上齿轮」）：仍在注册表内 ⇒ 仍受「9 页全走注册表」覆盖 */
export const SETTINGS_ENTRY = {
  key: "settings",
  label: "设置",
  icon: "settings",
  Component: SettingsPage,
} as const satisfies NavEntry;

/** 全部 9 页（顶栏 8 项 + 设置），顺序稳定 —— 守卫按它枚举 */
export const ALL_ENTRIES = [...NAV_ENTRIES, SETTINGS_ENTRY] as const satisfies readonly NavEntry[];

/** 顶栏键集（8 项 = 9 项去掉 `settings`）—— T7 顶栏与 T11 ⌘K 的键集全集 */
export const PRIMARY_KEYS: readonly PageKey[] = NAV_ENTRIES.map((e) => e.key);

export function navEntry(key: PageKey): NavEntry {
  const hit: NavEntry | undefined = ALL_ENTRIES.find((e) => e.key === key);
  if (!hit) throw new Error(`未注册的页面键：${key}`);
  return hit;
}

/** 运行期校验入口（⌘K 的命令参数、深链都可能带任意字符串） */
export function isPageKey(v: string): v is PageKey {
  return ALL_ENTRIES.some((e) => e.key === v);
}
