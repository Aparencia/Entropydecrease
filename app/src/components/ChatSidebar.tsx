/**
 * ChatSidebar — AI 对话页侧栏（v0.16.0 REQ-226/230）。
 *
 * @ai-context: 两段式："💬 对话"（自由聊天会话 CRUD）+ "🤖 AI 任务"
 *              （refine/enrich 任务对话入口——只读轨迹视图数据源）。
 *              全部数据由 ChatPage 加载后透传（本组件纯展示 + 事件回调）。
 */
import type { AiTaskRecord, ChatSession } from "../types";

/** 任务类型标签（refine/enrich → 中文 + 图标；模块内消费——审查修复：原
 *  export 无外部消费方，收窄为非导出） */
const OP_LABEL: Record<string, string> = {
  refine: "✨ 精修",
  enrich: "📚 补充",
};

interface Props {
  sessions: ChatSession[];
  tasks: AiTaskRecord[];
  /** 当前选中（chat 段会话 id / task 段任务 id） */
  activeChatId: number | null;
  activeTaskId: number | null;
  onSelectChat: (id: number) => void;
  onSelectTask: (id: number) => void;
  onNewChat: () => void;
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

export default function ChatSidebar(props: Props) {
  const {
    sessions, tasks, activeChatId, activeTaskId,
    onSelectChat, onSelectTask, onNewChat, onRenameChat, onDeleteChat,
    sessionTitles, noteTitles,
  } = props;
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
  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px 4px" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>💬 对话</span>
        <button
          onClick={onNewChat}
          title="新建对话"
          style={{ fontSize: 16, lineHeight: 1, cursor: "pointer", border: "none", background: "transparent", color: "#0d9488" }}
        >
          ＋
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "0 8px 8px" }}>
        {sessions.length === 0 && (
          <div style={{ fontSize: 12, color: "#9ca3af", padding: "4px 8px" }}>还没有对话——点 ＋ 开始</div>
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
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
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

        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", padding: "14px 8px 4px" }}>🤖 AI 任务</div>
        {tasks.length === 0 && <div style={{ fontSize: 12, color: "#9ca3af", padding: "4px 8px" }}>暂无精修/补充任务</div>}
        {tasks.map((t) => {
          const refName = t.opType === "refine"
            ? sessionTitles.get(t.refId) ?? `会话 #${t.refId}`
            : noteTitles.get(t.refId) ?? `笔记 #${t.refId}`;
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
}
