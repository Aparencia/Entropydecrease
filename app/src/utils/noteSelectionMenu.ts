/**
 * noteSelectionMenu — 笔记正文「选中文字右键菜单」纯逻辑（REQ-317，批 8）。
 *
 * @ai-context: 阅读/编辑两态选区的动作矩阵与文本处理全部收敛于此（菜单组件与
 *              两宿主只做接线）——菜单项构造（模式×文本可用性）、单行化截断
 *              （任务行/模型卡 excerpt/问题文本共用 ≤200 口径）、任务行插入
 *              计划（编辑态「加入行动」用，纯 offset 计算）、坐标钳制、选区
 *              快照判定（阅读态 DOM Selection 语义，注：编辑态走 CM 自身选区，
 *              不经 DOM Selection——快照接口两态复用同一“非空文本”判定）。
 * @ai-context: 动作矩阵 v1（首批授权复制/全选/以对话处理/加入行动/转为问题/
 *              模型卡预填）：
 *              复制/全选 —— 阅读+编辑两态；
 *              加入行动 —— 仅编辑态（阅读态无 DOM↔源码行映射，V1 隐藏，
 *              登记 TD-2026-09-09-C）；
 *              以对话处理 —— 两态均不提供（dock 会话视图 v1 只读、无面板内
 *              发送通道；跨 App/ChatPage/NotesPage 的草稿种子通道 >3 组件深改，
 *              按批 8 授权退路登记 TD-2026-09-09-B，严禁伪实现）；
 *              转为问题/模型卡预填 —— 阅读+编辑两态（question_create /
 *              ModelCardFromNoteDialog 既有链路）。
 */

/** NoteSelectionMode 定义独立成 types 文件不划算——就地声明（本模块单点消费） */
export type NoteSelectionMode = "reading" | "editing";

/** 片段截断上限（字）：任务行/问题/模型卡 excerpt 共用——≤200 保持行内可读 */
export const SNIPPET_MAX = 200;

/** 菜单动作 id：copy/selectAll/addTask 由宿主就地执行，行动类跨组件上抛 */
export type SelectionActionId =
  | "copy"
  | "selectAll"
  | "addTask"
  | "toQuestion"
  | "toModelCard";

/** 需跨组件上抛的动作（复制/全选/加入行动由宿主就地执行） */
export type SelectionNoteAction = Extract<SelectionActionId, "toQuestion" | "toModelCard">;

export interface SelectionMenuItem {
  id: SelectionActionId;
  label: string;
  icon: string;
  enabled: boolean;
  /** 分隔线组（basic 组后插线，行菜单范式） */
  dividerBefore?: boolean;
}

/** 阅读态动作序（不含加入行动——见文件头 TD-2026-09-09-C） */
const READING_ORDER: readonly SelectionActionId[] = ["copy", "selectAll", "toQuestion", "toModelCard"];
/** 编辑态动作序 */
const EDITING_ORDER: readonly SelectionActionId[] = ["copy", "selectAll", "addTask", "toQuestion", "toModelCard"];

const LABELS: Record<SelectionActionId, string> = {
  copy: "复制",
  selectAll: "全选",
  addTask: "加入行动",
  toQuestion: "转为问题",
  toModelCard: "模型卡预填",
};

const ICONS: Record<SelectionActionId, string> = {
  copy: "📋",
  selectAll: "📑",
  addTask: "✅",
  toQuestion: "❓",
  toModelCard: "🧠",
};

/**
 * 菜单项构造（模式×文本可用性矩阵）：无文本时复制/行动类禁用（防御态——
 * 菜单正常只在有文本时打开；全选不受文本限制）。
 */
export function buildSelectionMenuItems(mode: NoteSelectionMode, hasText: boolean): SelectionMenuItem[] {
  const order = mode === "editing" ? EDITING_ORDER : READING_ORDER;
  const items: SelectionMenuItem[] = [];
  for (const id of order) {
    const needsText = id !== "selectAll";
    items.push({
      id,
      label: LABELS[id],
      icon: ICONS[id],
      enabled: hasText || !needsText,
      dividerBefore: id === "addTask" || id === "toQuestion",
    });
  }
  return items;
}

/**
 * 单行化截断：折叠空白/换行 → 单空格 + trim，超长以 … 收尾。
 * 返回串总长 ≤ max（… 占 1 个 UTF-16 单元；CJK 落在 BMP 内同计数）。
 * 边界：空串/纯空白 → ""；max ≤ 1 时只可能返回 "" 或单字符。
 */
export function singleLineTruncate(raw: string, max: number = SNIPPET_MAX): string {
  if (max <= 0) return "";
  const one = raw.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

/** 插入位置钳制（CM 偏移为 JS 字符串下标；防御越界入参） */
function clampOffset(at: number, len: number): number {
  if (!Number.isFinite(at)) return len;
  return Math.max(0, Math.min(Math.trunc(at), len));
}

/**
 * 任务行插入计划（编辑态「加入行动」）：锚定选区结束处所在行（选区结束恰在
 * 行首=含尾换行的整行选择，锚上一行行尾——任务挂在内容之后而非空行后），
 * 在该行行尾插入独立 `- [ ] <单行化任务文本>` 行。返回 null=无可插文本。
 * 调用方以返回的 from/insert 直接 view.dispatch → 既有 onChange→自动保存→
 * 后端任务索引重扫通道，不 bypass 保存（Why：不建第二套数据轨）。
 */
export function planTaskLineInsert(
  body: string,
  at: number,
  rawTaskText: string,
): { from: number; insert: string } | null {
  const taskText = singleLineTruncate(rawTaskText, SNIPPET_MAX);
  if (!taskText) return null;
  const p = clampOffset(at, body.length);
  // 锚定“选区结束内容所在行”：p-1 是换行 → 选区结束在行首，退到上一行行尾
  const eff = p > 0 && body.charCodeAt(p - 1) === 10 ? p - 1 : p;
  const nextBreak = body.indexOf("\n", eff);
  const lineEnd = nextBreak === -1 ? body.length : nextBreak;
  const insert = `${lineEnd === 0 ? "" : "\n"}- [ ] ${taskText}`;
  return { from: lineEnd, insert };
}

/** 菜单坐标钳制（行菜单范式：右缘/下缘收进视口 + 4px 内边距） */
export function clampMenuXY(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  return {
    x: Math.max(4, Math.min(x, vw - menuW - 4)),
    y: Math.max(4, Math.min(y, vh - menuH - 4)),
  };
}

/**
 * 阅读态选区快照判定：选区存在、非空且锚/焦两端都在正文容器内（排除
 * auxPanels 等既有交互区的跨容器选区）→ 返回原文（trim 后非空）。
 * Why 接口化：只依赖 SelectionLike 形状，宿主可用 window.getSelection()
 * 或测试桩——复制/转问题/模型卡动作都在菜单打开时取此快照，菜单内点击
 * 不再依赖“点击瞬间 DOM 选区仍在”（点按钮会动焦点/选区）。
 */
export interface SelectionLike {
  isCollapsed: boolean;
  rangeCount: number;
  anchorNode: Node | null;
  focusNode: Node | null;
  toString(): string;
}

export function meaningfulSelection(sel: SelectionLike | null, root: Node | null): string | null {
  if (!sel || !root || sel.isCollapsed || sel.rangeCount === 0) return null;
  const { anchorNode, focusNode } = sel;
  if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) return null;
  const text = sel.toString();
  return text.trim() ? text : null;
}

/** 阅读态「全选」：把窗口选区覆盖到正文容器全文（点击项后宿主调用） */
export function selectNodeContents(root: Node | null): void {
  if (!root) return;
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* 极端宿主（如无 Selection 实现的测试环境）静默——Ctrl+A 主路径不受影响 */
  }
}
