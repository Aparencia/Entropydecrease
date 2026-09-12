/**
 * @ai-context 列契约的**单一注册表**（规格 §1 决策 16「单一注册表 ColumnSpec」+ §6.2 表）。
 *
 * Why：今天「列有多宽」这件事有 4 种写法 —— ① `useColumnLayout` 的 7 处调用（4 页）
 *   ② 未接入的 4 处硬编码（ChatSidebar 240 / GoalsPage 380 / NoteReadingView 180 /
 *   KnowledgeDetailPanel 34；**其中 NoteReadingView 的 180 已被本任务接线进注册表**）
 *   ③ 组件的 `width` 默认参数（SessionListPanel 320 / GroupSidebar 240 / KnowledgeDetailPanel 320）
 *   ④ 老师的口头约定。⇒ 同一个「笔记组列 240」在 4 处各写一遍，改一处漏三处是静默的。
 *   本模块把 §6.2 的 13 行变成可枚举、可断言的契约；hook 仍是**唯一执行器**（见 A5 裁决：
 *   注册表持有「规格」，`useColumnLayout` 持有「运行时」——宽度记忆/手动折叠记忆/夹取/
 *   `resize` 监听/SSR 守卫/`localStorage` 异常兜底全部留在 hook，**不重写**）。
 *
 * 口径（逐字对应 §6.2）：
 *   · `autoFoldBelow` = 窗口宽**低于**该值时自动折叠（与 useColumnLayout 的 `<` 语义一致）；
 *     `undefined` = 不折叠（§6.2 写「—」或「不折叠」的行）。
 *   · `pinnable` = 该列是否允许用户固定（§6.2 未逐行给值 ⇒ 本注册表取保守默认 `false`，
 *     **除笔记大纲列**（§6.2 明写「接线拖拽+记忆或删钩子」）为 `true`。**注：这是本批唯一一处
 *     「规格没给值、计划者取默认」的字段。**
 *   · 主体顺序 = §6.2 表的行序（便于逐行比对）。
 *
 * 副作用：无（纯数据；`PageKey` 是 `import type`，编译后不留运行时边）。
 * 边界：**只管宽度与折叠**；不描述列的内容、组件的挂载、也不描述列的可见性（采集态整列隐藏属批 6）。
 */
import { breakpointFor } from "./breakpoints";
import type { PageKey } from "./navRegistry";

export interface ColumnSpec {
  /** 全局唯一键（`useColumnLayout` 的持久化键就用它 ⇒ 迁移时**不得改名**，改名等于丢掉用户的列宽记忆） */
  readonly key: string;
  readonly page: PageKey;
  /** 默认宽（= 今日既有值，迁移零视觉变化） */
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** 窗口宽低于该值时自动折叠；`undefined` = 不折叠 */
  readonly autoFoldBelow?: number;
  readonly pinnable: boolean;
}

/** 规格 §6.2 的 13 行，逐行落表（顺序 = 规格表行序） */
export const COLUMN_SPECS = [
  // 📡 课堂
  { key: "classroom-left", page: "classroom", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  { key: "classroom-right", page: "classroom", default: 0, min: 0, max: 0, pinnable: false }, // flex 列：宽由容器决定，不参与拖拽（T10 消费）
  // 🗂 会话
  { key: "sessions-list", page: "sessions", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // 📝 笔记
  { key: "notes-groups", page: "notes", default: 240, min: 180, max: 320, autoFoldBelow: breakpointFor("threeCol"), pinnable: false },
  { key: "notes-list", page: "notes", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("threeCol"), pinnable: false },
  { key: "notes-outline", page: "notes", default: 180, min: 140, max: 260, autoFoldBelow: breakpointFor("outlineCol"), pinnable: true },
  // ✅ 行动 / 🔄 复习：单列，无自动折叠（§6.2 两行都是「单列」）
  { key: "action-main", page: "action", default: 0, min: 0, max: 0, pinnable: false },
  { key: "review-main", page: "review", default: 0, min: 0, max: 0, pinnable: false },
  // 💬 AI 对话（T9 接线：现硬编码 240）
  { key: "chat-sidebar", page: "chat", default: 260, min: 200, max: 320, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // 🧠 体系
  { key: "knowledge-left", page: "knowledge", default: 260, min: 200, max: 360, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  { key: "knowledge-detail", page: "knowledge", default: 320, min: 260, max: 420, pinnable: false }, // §6.2「不折叠」
  // 🎯 目标（T9 接线：现硬编码 380 → 默认 320）
  { key: "goals-left", page: "goals", default: 320, min: 240, max: 420, autoFoldBelow: breakpointFor("twoCol"), pinnable: false },
  // ⚙ 设置：单列居中 860（§6.2「居中 860」——无 min/max ⇒ 不参与拖拽）
  // ⚠️ 该行**不得**喂给 `useColumnLayout`：clamp(default,min,max)=max(0,min(0,860))=**0**
  //    ⇒ T9 按计划取 `columnSpec("settings-main").default` 直接用（不走 hook）
  { key: "settings-main", page: "settings", default: 860, min: 0, max: 0, pinnable: false },
] as const satisfies readonly ColumnSpec[];

export const COLUMN_KEYS: readonly string[] = COLUMN_SPECS.map((c) => c.key);

export function columnSpec(key: string): ColumnSpec {
  const hit: ColumnSpec | undefined = COLUMN_SPECS.find((c) => c.key === key);
  if (!hit) throw new Error(`未注册的列键：${key}`);
  return hit;
}

export function columnsOf(page: PageKey): readonly ColumnSpec[] {
  return COLUMN_SPECS.filter((c) => c.page === page);
}
