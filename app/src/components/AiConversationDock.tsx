/**
 * AiConversationDock — 全局 AI 对话面板（REQ-274 v0.19.4，丙案 v1）。
 *
 * @ai-context: 应用级右侧停靠「AI 任务对话」跟随工作区——按需唤起 + 内容保活
 *              （常驻挂载，open 仅切 display——选中态/已加载列表不销毁，关闭后
 *              任务在后台照跑，完成经 App 既有 ai:task-update toast 通知）。
 * @ai-context: 同源承诺：本面板不建第二套会话——数据全部来自既有命令
 *              （chat_list_sessions/chat_list_messages/ai_task_history/
 *              ai_task_conversation），线程内容在「💬 AI 对话」页天然可见可查；
 *              会话视图 v1 只读 + 「在对话页继续」跳转（规避双实例流控冲突），
 *              任务视图复用 TaskConversationView（含采纳/跳转/工作台深链）。
 * @ai-context: 唤起：导航栏 🤖 按钮 / Ctrl+Shift+A（本地 window 快捷键）；
 *              段切换：💬 对话会话 / 🤖 AI 任务（与 ChatSidebar 口径一致）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiTaskRecord, AiTurn, ChatMessage, ChatSession } from "../types";
import TaskConversationView from "./TaskConversationView";
import { refLabel } from "../utils/entityLabel";

interface SessionRow { id: number; title: string }

interface Props {
  open: boolean;
  onClose: () => void;
  /** 跳转对话页并选中会话（App 复用既有 focus 机制） */
  onOpenChat: (chatId: number) => void;
  /** 跳转对话页任务段 */
  onOpenTaskInChat: (taskId: number) => void;
  onOpenSessions: (sessionId: number) => void;
  onOpenNote: (noteId: number) => void;
  onOpenRefineWorkbench: (sessionId: number, taskId: number) => void;
}

const PANEL_W = 560;

const itemBase: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box",
  padding: "7px 10px", cursor: "pointer", fontSize: 12.5, textAlign: "left",
  background: "none", border: "none", borderRadius: 8, color: "#374151",
};

const OP_LABEL: Record<string, string> = { refine: "✨ 精修", enrich: "📚 补充" };

export default function AiConversationDock({
  open, onClose, onOpenChat, onOpenTaskInChat, onOpenSessions, onOpenNote, onOpenRefineWorkbench,
}: Props) {
  const [tab, setTab] = useState<"chat" | "task">("task");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [tasks, setTasks] = useState<AiTaskRecord[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Map<number, string>>(new Map());
  const [noteTitles, setNoteTitles] = useState<Map<number, string>>(new Map());
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [taskDetail, setTaskDetail] = useState<{ task: AiTaskRecord; turns: AiTurn[] } | null>(null);
  const [notice, setNotice] = useState("");
  const loadedOnce = useRef(false);

  const reloadTasks = useCallback(async () => {
    const refine = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "refine", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    const enrich = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "enrich", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    setTasks([...refine, ...enrich].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40));
  }, []);

  /** 会话/标题静态数据（与 ChatPage 同源同口径——打开面板时拉一次） */
  const loadStatic = useCallback(async () => {
    const [sess, rows, notes] = await Promise.all([
      invoke<ChatSession[]>("chat_list_sessions").catch(() => [] as ChatSession[]),
      invoke<SessionRow[]>("list_sessions", { limit: 500 }).catch(() => [] as SessionRow[]),
      invoke<{ id: number; title: string }[]>("search_notes", { keyword: "", tag: null as string | null }).catch(() => [] as { id: number; title: string }[]),
    ]);
    setChatSessions(sess);
    setSessionTitles(new Map(rows.map((s) => [s.id, s.title])));
    setNoteTitles(new Map(notes.map((n) => [n.id, n.title])));
  }, []);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadStatic();
    void reloadTasks();
  }, [loadStatic, reloadTasks]);

  // open 变 true：刷新静态/任务（外部变化及时可见——防抖由调用频率天然承担）
  useEffect(() => {
    if (open) {
      void loadStatic();
      void reloadTasks();
    }
  }, [open, loadStatic, reloadTasks]);

  const selectTask = useCallback(async (taskId: number) => {
    setActiveTaskId(taskId);
    setActiveChatId(null);
    setNotice("");
    try {
      const [task, turns] = await invoke<[AiTaskRecord, AiTurn[]]>("ai_task_conversation", { taskId });
      setTaskDetail({ task, turns });
    } catch (e) {
      setTaskDetail(null);
      setNotice(String(e));
    }
  }, []);

  const selectChat = useCallback(async (chatId: number) => {
    setActiveChatId(chatId);
    setActiveTaskId(null);
    setTaskDetail(null);
    setNotice("");
    setMessages(await invoke<ChatMessage[]>("chat_list_messages", { sessionId: chatId }).catch(() => [] as ChatMessage[]));
  }, []);

  const taskRefTitle = useCallback((t: AiTaskRecord): string =>
    t.opType === "refine"
      ? refLabel("session", sessionTitles.get(t.refId))
      : refLabel("note", noteTitles.get(t.refId)),
  [sessionTitles, noteTitles]);

  /** 列表段（每行数据复用 ChatSidebar 的形态——标题/模型/状态/时间） */
  const renderList = () => {
    if (tab === "task") {
      return tasks.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: "#9ca3af" }}>暂无精修/补充任务</div>
      ) : (
        tasks.map((t) => {
          const done = t.state === "succeeded" || t.state === "failed";
          const color = t.state === "succeeded" ? "#047857" : t.state === "failed" ? "#b91c1c" : "#b45309";
          return (
            <button
              key={t.taskId}
              onClick={() => void selectTask(t.taskId)}
              style={{
                ...itemBase,
                background: activeTaskId === t.taskId ? "#f0fdfa" : undefined,
                border: activeTaskId === t.taskId ? "1px solid #99f6e4" : "1px solid transparent",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {OP_LABEL[t.opType] ?? t.opType} {taskRefTitle(t)}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color }}>{done ? (t.state === "succeeded" ? "✓" : "✗") : "…"}</span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>
                {new Date(t.createdAt * 1000).toLocaleTimeString()}
              </span>
            </button>
          );
        })
      );
    }
    return chatSessions.length === 0 ? (
      <div style={{ padding: 12, fontSize: 12, color: "#9ca3af" }}>暂无对话会话——到「💬 AI 对话」页新建</div>
    ) : (
      chatSessions.map((s) => (
        <button
          key={s.id}
          onClick={() => void selectChat(s.id)}
          style={{
            ...itemBase,
            background: activeChatId === s.id ? "#f0fdfa" : undefined,
            border: activeChatId === s.id ? "1px solid #99f6e4" : "1px solid transparent",
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          {s.model && <span style={{ fontSize: 10, color: "#9ca3af" }}>{s.model.split("/").pop()}</span>}
        </button>
      ))
    );
  };

  /** 会话详情 v1 只读消息（同源——继续对话请到 AI 对话页） */
  const renderChatDetail = () => {
    if (messages.length === 0) {
      return <div style={{ padding: 14, fontSize: 12, color: "#9ca3af" }}>该会话暂无消息</div>;
    }
    return messages.map((m) => (
      <div key={m.id} style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>
          {m.role === "user" ? "🧑 你" : "🤖 AI"}{m.model ? ` · ${m.model}` : ""}
        </div>
        <div style={{
          whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12.5, lineHeight: 1.6,
          background: m.role === "user" ? "#eef2ff" : "#f9fafb",
          border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", color: "#1f2937",
        }}>{m.content}</div>
      </div>
    ));
  };

  /** 顶部：并发起按钮 + 段切换 */
  const renderHeader = () => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
      borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, fontSize: 13.5 }}>🤖 AI 任务对话</span>
      <button
        data-testid="dock-tab-task"
        onClick={() => setTab("task")}
        style={{
          marginLeft: 8, fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 999,
          border: tab === "task" ? "1px solid #4f46e5" : "1px solid #d1d5db",
          background: tab === "task" ? "#eef2ff" : "#fff", color: tab === "task" ? "#3730a3" : "#374151",
        }}
      >🤖 AI 任务</button>
      <button
        data-testid="dock-tab-chat"
        onClick={() => setTab("chat")}
        style={{
          fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 999,
          border: tab === "chat" ? "1px solid #4f46e5" : "1px solid #d1d5db",
          background: tab === "chat" ? "#eef2ff" : "#fff", color: tab === "chat" ? "#3730a3" : "#374151",
        }}
      >💬 对话</button>
      <span style={{ flex: 1 }} />
      <button
        data-testid="dock-close"
        onClick={onClose}
        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: "#6b7280" }}
      >✕</button>
    </div>
  );

  return (
    <div
      data-testid="ai-dock"
      style={{
        position: "fixed", top: 56, right: 0, bottom: 0, width: PANEL_W, zIndex: 900,
        background: "#fff", borderLeft: "1px solid #e5e7eb", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
        display: open ? "flex" : "none", flexDirection: "column", overflow: "hidden",
        fontSize: 12.5, color: "#1f2937",
      }}
    >
      {renderHeader()}
      {/* 列表区（选中项高亮；点击切换） */}
      <div style={{ flex: 1, minHeight: 0, display: activeChatId == null && activeTaskId == null ? "flex" : "none", flexDirection: "column", overflowY: "auto", padding: 6, borderBottom: "1px solid #f3f4f6" }}>
        {renderList()}
      </div>
      {/* 详情区 */}
      <div style={{ flex: 1, minHeight: 0, display: activeChatId != null || activeTaskId != null ? "flex" : "none", flexDirection: "column", overflow: "hidden" }}>
        {activeTaskId != null && taskDetail && (
          <>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, padding: "4px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 11 }}>
              <button
                onClick={() => { setActiveTaskId(null); setTaskDetail(null); }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#0f766e", padding: 0 }}
              >← 任务列表</button>
              <span style={{ flex: 1 }} />
              <button
                title="在 AI 对话页打开同源任务（可查轨迹/追问）"
                onClick={() => onOpenTaskInChat(taskDetail.task.taskId)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#0d9488", padding: 0 }}
              >💬 在对话页打开 →</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <TaskConversationView
                task={taskDetail.task}
                turns={taskDetail.turns}
                refTitle={taskRefTitle(taskDetail.task)}
                onOpenSession={onOpenSessions}
                onOpenNote={onOpenNote}
                onRetry={() => {
                  setNotice("请在「💬 AI 对话」页的任务视图重试（同源线程，避免双流）");
                  void reloadTasks();
                }}
                busy={false}
                // 笔记级任务 → 查看笔记；会话级 → 工作台深链（同 ChatPage 口径）
                onOpenWorkbench={(t) => (t.targetKind === "note" ? onOpenNote(t.refId) : onOpenRefineWorkbench(t.refId, t.taskId))}
                onTaskChanged={() => void reloadTasks()}
              />
            </div>
          </>
        )}
        {activeChatId != null && (
          <>
            <div style={{ flexShrink: 0, display: "flex", gap: 6, padding: "4px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 11 }}>
              <button
                onClick={() => { setActiveChatId(null); setMessages([]); }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#0f766e", padding: 0 }}
              >← 会话列表</button>
              <span style={{ flex: 1 }} />
              <button
                title="到 AI 对话页继续对话（本面板会话视图 v1 只读）"
                onClick={() => onOpenChat(activeChatId)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#0d9488", padding: 0 }}
              >💬 在对话页继续 →</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>{renderChatDetail()}</div>
          </>
        )}
      </div>
      {notice && (
        <div style={{
          flexShrink: 0, padding: "6px 12px", fontSize: 11.5, borderTop: "1px solid #f3f4f6",
          color: notice.startsWith("✅") ? "#047857" : "#b45309", background: notice.startsWith("✅") ? "#f0fdfa" : "#fffbeb",
        }}>{notice}</div>
      )}
    </div>
  );
}
