/**
 * ChatSidebar — AI 对话页侧栏（v0.16.0 REQ-226/230）。
 *
 * @ai-context: 两段式："💬 对话"（自由聊天会话 CRUD）+ "🤖 AI 任务"
 *              （refine/enrich 任务对话入口——只读轨迹视图数据源）。
 *              全部数据由 ChatPage 加载后透传（本组件纯展示 + 事件回调）。
 * @ai-context: 批 3 · T9 评审 I-1：列状态**整体**注入（`col`）且拖拽手柄由本组件
 *              渲染。此前页面只散传宽度/折叠态/展开回调 ⇒ `resizeBy`/`resetWidth`
 *              在 UI 上不可达，注册表承诺的 200..320 成了规格 §6.2 逐字点名的
 *              「假可调」。形态与 `notes/NotesGroupsColumn` 同款：顶层 fragment、
 *              手柄在**折叠三元之外**（折叠态也渲染），且是页面根 flex 的直接子元素。
 */
import type { AiTaskRecord, ChatSession } from "../types";
// 2026-09-09 批 1：任务标题统一按类别解析（taskRefLabel——会话级/笔记级
// 精修 ref_id 语义不同；enrich 恒笔记级），侧栏与对话页/dock 同口径
import { taskRefLabel } from "../utils/entityLabel";
import { EmptyState } from "../ui/primitives";
// 批 3（规格 §6.2「AI 对话侧栏：接入列基础设施」）：列宽不再写死——
// 规格住在 shell/columnRegistry，运行时由页面里的 useColumnLayout 执行
import { columnSpec } from "../shell/columnRegistry";
import { useColumnLayout, type ColumnLayout } from "../hooks/useColumnLayout";
import ColumnBar from "./ColumnBar";
import ColumnResizer from "./ColumnResizer";

/** 任务类型标签（refine/enrich → 中文 + 图标；模块内消费——审查修复：原
 *  export 无外部消费方，收窄为非导出） */
const OP_LABEL: Record<string, string> = {
  refine: "✨ 精修",
  enrich: "📚 补充",
};

/**
 * 批 3（规格 §6.2）：本列已接入列基础设施；**T9 评审 I-1 修正**——列状态由页面
 * **整体**注入（`col`），三个散 prop（生效宽度 / 折叠态 / 展开回调）已收敛掉：
 * 散传时 `resizeBy` / `resetWidth` 到不了 UI ⇒ 注册表承诺的 200..320 不可达。
 */
export interface ChatSidebarProps {
  /** 页面注入的列状态（`useColumnLayout("chat-sidebar", columnSpec("chat-sidebar"))`，
   *  宽度已按 200..320 夹取）。缺省 ⇒ 本组件按**同一注册表规格**自持一份（页面
   *  零注入时行为自足，缺省宽度仍是注册表默认值，不是接线前的写死值）。 */
  col?: ColumnLayout;
  sessions: ChatSession[];
  tasks: AiTaskRecord[];
  /** 当前选中（chat 段会话 id / task 段任务 id） */
  activeChatId: number | null;
  activeTaskId: number | null;
  onSelectChat: (id: number) => void;
  onSelectTask: (id: number) => void;
  onNewChat: () => void;
  /** v0.19.1（REQ-260）：新建学习库问答会话（检索+生成双产物模式） */
  onNewKbChat?: () => void;
  onRenameChat: (id: number) => void;
  onDeleteChat: (id: number) => void;
  /** 会话标题解析（精修 refId=会话；补充 refId=笔记） */
  sessionTitles: Map<number, string>;
  noteTitles: Map<number, string>;
}

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ChatSidebar(props: ChatSidebarProps) {
  const {
    col: injectedCol,
    sessions, tasks, activeChatId, activeTaskId,
    onSelectChat, onSelectTask, onNewChat, onNewKbChat, onRenameChat, onDeleteChat,
    sessionTitles, noteTitles,
  } = props;
  // 单行写法是刻意的：`columnRegistry.test.ts` ⑤ 逐行捕获
  // `useColumnLayout("键", columnSpec("键"))`，换行写法会让那条判据静默空转。
  const ownCol = useColumnLayout("chat-sidebar", columnSpec("chat-sidebar"));
  const col = injectedCol ?? ownCol;
  const itemBase: React.CSSProperties = {
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12.5,
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    width: "100%",
    textAlign: "left",
    color: "#374151",
  };
  // 批 3：折叠态与其它列同款——整列换成 ColumnBar 窄条（26px，点击走 expand()）
  const panel = (
    <div style={{ width: col.width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>💬 对话</span>
        <div style={{ display: "flex", gap: 2 }}>
          {/* v0.19.1：学习库问答模式（检索+带引用回答）与纯聊并列的新建入口 */}
          {onNewKbChat && (
            <button
              data-testid="new-kb-chat"
              onClick={onNewKbChat}
              title="新建学习库问答（问我的学习库——本地命中恒可用，生成默认关）"
              style={{ fontSize: 12, lineHeight: 1, cursor: "pointer", border: "none", background: "transparent", color: "#0d9488" }}
            >
              📚
            </button>
          )}
          <button
            onClick={onNewChat}
            title="新建对话"
            style={{ fontSize: 16, lineHeight: 1, cursor: "pointer", border: "none", background: "transparent", color: "#0d9488" }}
          >
            ＋
          </button>
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "0 8px 8px" }}>
        {sessions.length === 0 && (
          <EmptyState title="还没有对话——" description="点 ＋ 开始" compact align="start" />
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelectChat(s.id)}
            style={{
              ...itemBase,
              background: activeChatId === s.id ? "#f0fdfa" : undefined,
              border: activeChatId === s.id ? "1px solid #99f6e4" : "1px solid transparent",
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.retrieval && <span title="学习库问答模式">📚 </span>}
              {s.title}
            </span>
            {s.model && <span style={{ fontSize: 10, color: "#9ca3af" }}>{s.model.split("/").pop()}</span>}
            <span
              role="button"
              title="重命名"
              onClick={(e) => { e.stopPropagation(); onRenameChat(s.id); }}
              style={{ fontSize: 11, cursor: "pointer", color: "#9ca3af" }}
            >✎</span>
            <span
              role="button"
              title="删除"
              onClick={(e) => { e.stopPropagation(); onDeleteChat(s.id); }}
              style={{ fontSize: 11, cursor: "pointer", color: "#9ca3af" }}
            >🗑</span>
          </div>
        ))}

        <div
          style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", padding: "14px 8px 4px" }}
          title="AI 精修/补充任务的轨迹条目（来源=会话或笔记），不是上方 💬 聊天会话——点选查看轨迹与采纳入口"
        >🤖 AI 任务</div>
        {tasks.length === 0 && <EmptyState title="暂无精修/补充任务" compact align="start" />}
        {/* 2026-09-09 批 1 语义说明：本段是精修/补充任务（来源会话/笔记）的
            只读轨迹视图，不是 💬 聊天会话——点选打开任务对话、结果可采纳 */}
        {tasks.length > 0 && (
          <div style={{ fontSize: 10.5, color: "#9ca3af", lineHeight: 1.6, padding: "0 8px 6px" }}>
            精修/补充任务的轨迹（来源：会话或笔记）——非聊天会话；完成结果可采纳
          </div>
        )}
        {tasks.map((t) => {
          const refName = taskRefLabel(t, sessionTitles, noteTitles);
          const stateBadge = t.state === "succeeded" ? "#047857" : t.state === "failed" ? "#b91c1c" : "#b45309";
          return (
            <div
              key={t.taskId}
              onClick={() => onSelectTask(t.taskId)}
              style={{
                ...itemBase,
                background: activeTaskId === t.taskId ? "#f0fdfa" : undefined,
                border: activeTaskId === t.taskId ? "1px solid #99f6e4" : "1px solid transparent",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {OP_LABEL[t.opType] ?? t.opType} {refName}
              </span>
              <span style={{ fontSize: 10, color: stateBadge, fontWeight: 600 }}>
                {t.state === "succeeded" ? "✓" : t.state === "failed" ? "✗" : "…"}
              </span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>{fmtTime(t.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  // T9 评审 I-1：手柄由本组件渲染，且在**折叠三元之外**（折叠态也在）——与
  // `notes/NotesGroupsColumn` 同款。顶层 fragment 的两个子元素都是页面根 flex 的
  // 直接子元素（多包一层会改变宽度分配；`ColumnResizer` 恒 5px / flexShrink 0）。
  return (
    <>
      {col.folded ? <ColumnBar icon="💬" title="对话" onClick={col.expand} /> : panel}
      <ColumnResizer onResize={col.resizeBy} onReset={col.resetWidth} />
    </>
  );
}
