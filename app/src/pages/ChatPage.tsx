/**
 * ChatPage — AI 对话页（v0.16.0 REQ-224~230）。
 *
 * @ai-context: 统一对话中枢：①💬 自由聊天（流式/停止/重发/编辑重发/会话
 *              CRUD/模型选择）②🤖 AI 任务对话（精修/补充轨迹——提示词与
 *              回答全文 + 可跳转引用）。任务视图复用 ai_task_history +
 *              ai_task_conversation；聊天复用 chat_* 命令。
 * @ai-context: 单活跃流纪律（REQ-225）：streaming 态下不可再发送；停止=
 *              chat_cancel（后端每行检查取消标志）；失败置 failed 占位，
 *              重试=chat_regenerate（删除占位后重流）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { AiTaskRecord, AiProviderView, ChatMessage, ChatSession, ChatStreamEvent } from "../types";
import ChatSidebar from "../components/ChatSidebar";
import ChatMessageList from "../components/ChatMessageList";
import ChatComposer from "../components/ChatComposer";
import TaskConversationView from "../components/TaskConversationView";

interface Props {
  /** 跨页直达（任务对话引用跳转） */
  onOpenSessions: (sessionId: number) => void;
  onOpenNote: (noteId: number) => void;
  onOpenSettings: () => void;
}

interface SessionRow {
  id: number;
  title: string;
}

export default function ChatPage(props: Props) {
  const { onOpenSessions, onOpenNote, onOpenSettings } = props;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [tasks, setTasks] = useState<AiTaskRecord[]>([]);
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<{ text: string | null; error: { kind: string; message: string } | null } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [taskDetail, setTaskDetail] = useState<{ task: AiTaskRecord; turns: import("../types").AiTurn[] } | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [sessionTitles, setSessionTitles] = useState<Map<number, string>>(new Map());
  const [noteTitles, setNoteTitles] = useState<Map<number, string>>(new Map());
  const streamRef = useRef<{ sessionId: number; acc: string } | null>(null);

  const refreshSessions = useCallback(async () => {
    const list = await invoke<ChatSession[]>("chat_list_sessions").catch(() => [] as ChatSession[]);
    setSessions(list);
    return list;
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshSessions();
    const refine = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "refine", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    const enrich = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "enrich", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    setTasks([...refine, ...enrich].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60));
    setProviders(await invoke<AiProviderView[]>("ai_provider_list").catch(() => [] as AiProviderView[]));
    // 引用标题解析（会话/笔记名——任务卡可读性；失败降级显示 #id）
    const sessRows = await invoke<SessionRow[]>("list_sessions", { limit: 500 }).catch(() => [] as SessionRow[]);
    setSessionTitles(new Map(sessRows.map((s) => [s.id, s.title])));
    const notes = await invoke<{ id: number; title: string }[]>("search_notes", { keyword: "", tag: null as string | null }).catch(() => [] as { id: number; title: string }[]);
    setNoteTitles(new Map(notes.map((n) => [n.id, n.title])));
  }, [refreshSessions]);

  useEffect(() => {
    refreshAll();
    // 任务状态轻轮询（未完成的任务存在时刷新——流式聊天不轮询，事件驱动）
    const t = setInterval(() => void refreshAll(), 6000);
    return () => clearInterval(t);
  }, [refreshAll]);

  const loadMessages = useCallback(async (sessionId: number) => {
    setMessages(await invoke<ChatMessage[]>("chat_list_messages", { sessionId }).catch(() => [] as ChatMessage[]));
  }, []);

  const selectChat = useCallback(async (id: number) => {
    setActiveChatId(id);
    setActiveTaskId(null);
    setTaskDetail(null);
    setGateError(null);
    setEditingId(null);
    setDraft("");
    await loadMessages(id);
  }, [loadMessages]);

  const selectTask = useCallback(async (taskId: number) => {
    setActiveTaskId(taskId);
    setActiveChatId(null);
    setStreaming(null);
    setGateError(null);
    try {
      const [task, turns] = await invoke<[AiTaskRecord, import("../types").AiTurn[]]>("ai_task_conversation", { taskId });
      setTaskDetail({ task, turns });
    } catch (e) {
      setTaskDetail(null);
      setGateError(String(e));
    }
  }, []);

  const newChat = useCallback(async () => {
    const s = await invoke<ChatSession>("chat_create_session", { title: null });
    await refreshSessions();
    await selectChat(s.id);
  }, [refreshSessions, selectChat]);

  const renameChat = useCallback(async (id: number) => {
    const title = window.prompt("会话标题：", sessions.find((s) => s.id === id)?.title ?? "");
    if (!title || !title.trim()) return;
    try {
      await invoke("chat_rename_session", { sessionId: id, title: title.trim() });
      await refreshSessions();
    } catch (e) {
      console.warn("重命名失败:", e);
    }
  }, [sessions, refreshSessions]);

  const deleteChat = useCallback(async (id: number) => {
    const ok = await confirm("删除该对话？历史消息将一并清除。", { title: "熵减", kind: "warning" });
    if (!ok) return;
    await invoke("chat_delete_session", { sessionId: id });
    if (activeChatId === id) setActiveChatId(null);
    await refreshAll();
  }, [activeChatId, refreshAll]);

  /** 流式发送核心（chat_send / chat_regenerate 共用信道处理） */
  const runChannel = useCallback(async (sessionId: number, cmd: string, args: Record<string, unknown>) => {
    if (streamRef.current) return; // 单活跃流（前端兜底）
    const channel = new Channel<ChatStreamEvent>();
    let acc = "";
    streamRef.current = { sessionId, acc };
    setStreaming({ text: "", error: null });
    channel.onmessage = (ev) => {
      if (ev.kind === "chunk") {
        acc += ev.delta;
        streamRef.current = { sessionId, acc };
        setStreaming({ text: acc, error: null });
      } else if (ev.kind === "done" || ev.kind === "aborted") {
        streamRef.current = null;
        setStreaming(null);
        loadMessages(sessionId);
      } else if (ev.kind === "failed") {
        streamRef.current = null;
        setStreaming({ text: null, error: { kind: ev.errorKind, message: ev.message } });
        loadMessages(sessionId);
      }
    };
    try {
      await invoke(cmd, { ...args, sessionId, channel });
    } catch (e) {
      streamRef.current = null;
      setStreaming(null);
      setGateError(String(e));
      loadMessages(sessionId);
    }
  }, [loadMessages]);

  const send = useCallback(async () => {
    if (!activeChatId || streamRef.current) return;
    const content = draft.trim();
    if (!content) return;
    const resendId = editingId ?? undefined;
    setEditingId(null);
    setDraft("");
    setGateError(null);
    await runChannel(activeChatId, "chat_send", { content, resendMessageId: resendId });
  }, [activeChatId, editingId, draft, runChannel]);

  const regenerate = useCallback(async () => {
    if (!activeChatId || streamRef.current) return;
    setGateError(null);
    await runChannel(activeChatId, "chat_regenerate", {});
  }, [activeChatId, runChannel]);

  const stop = useCallback(() => {
    if (!activeChatId) return;
    void invoke("chat_cancel", { sessionId: activeChatId });
  }, [activeChatId]);

  const setModel = useCallback(async (providerId: string | null, model: string) => {
    if (!activeChatId) return;
    try {
      await invoke("chat_set_model", { sessionId: activeChatId, providerId, model });
      await refreshSessions();
    } catch (e) {
      console.warn("模型设置失败:", e);
    }
  }, [activeChatId, refreshSessions]);

  const retryTask = useCallback(async (task: AiTaskRecord) => {
    if (task.opType !== "refine") return;
    setRetryBusy(true);
    try {
      await invoke("ai_refine_start", { sessionId: task.refId, authorized: true });
      await refreshAll();
    } catch (e) {
      setGateError(String(e));
    } finally {
      setRetryBusy(false);
    }
  }, [refreshAll]);

  const activeSession = sessions.find((s) => s.id === activeChatId) ?? null;
  const isGateBlocked = gateError !== null && (gateError.includes("未开启") || gateError.includes("授权") || gateError.includes("密钥") || gateError.includes("Provider"));
  const editMessage = (m: ChatMessage) => {
    setEditingId(m.id);
    setDraft(m.content);
  };

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <ChatSidebar
        sessions={sessions}
        tasks={tasks}
        activeChatId={activeChatId}
        activeTaskId={activeTaskId}
        onSelectChat={selectChat}
        onSelectTask={selectTask}
        onNewChat={newChat}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
        sessionTitles={sessionTitles}
        noteTitles={noteTitles}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* 顶栏：会话标题 + 模型选择 */}
        <div style={{ height: 44, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
          {activeSession && (
            <>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{activeSession.title}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6b7280" }}>
                模型
                <select
                  value={activeSession.providerId ?? ""}
                  onChange={(e) => {
                    const pid = e.target.value || null;
                    const p = providers.find((x) => x.id === pid);
                    void setModel(pid, p ? p.defaultModel : (activeSession.model ?? ""));
                  }}
                  style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: "1px solid #d1d5db" }}
                >
                  <option value="">默认（设置页）</option>
                  {providers.filter((p) => p.enabled).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}（{p.defaultModel}）</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {activeTaskId !== null && taskDetail && (
            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>🤖 任务对话</span>
          )}
        </div>

        {gateError && (
          <div style={{ margin: "8px 16px 0", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12.5, color: "#92400e" }}>
            {isGateBlocked ? (
              <span>
                {gateError}　
                <button onClick={onOpenSettings} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "transparent", color: "#0d9488", textDecoration: "underline" }}>前往设置开启 →</button>
              </span>
            ) : (
              <span>{gateError}</span>
            )}
          </div>
        )}

        {/* 内容区 */}
        {activeChatId !== null && activeSession && (
          <>
            <ChatMessageList
              messages={messages}
              streaming={streaming}
              onRegenerate={() => void regenerate()}
              onEditUser={editMessage}
              editingId={editingId}
            />
            <ChatComposer
              value={draft}
              onChange={setDraft}
              streaming={streaming !== null}
              onSend={() => void send()}
              onStop={stop}
            />
          </>
        )}
        {activeTaskId !== null && taskDetail && (
          <TaskConversationView
            task={taskDetail.task}
            turns={taskDetail.turns}
            refTitle={taskDetail.task.opType === "refine"
              ? sessionTitles.get(taskDetail.task.refId) ?? `#${taskDetail.task.refId}`
              : noteTitles.get(taskDetail.task.refId) ?? `#${taskDetail.task.refId}`}
            onOpenSession={onOpenSessions}
            onOpenNote={onOpenNote}
            onRetry={(t) => void retryTask(t)}
            busy={retryBusy}
          />
        )}
        {activeChatId === null && activeTaskId === null && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            选择左侧一个会话，或在「对话」段点 ＋ 新建；精修/补充任务请选「AI 任务」段
          </div>
        )}
      </div>
    </div>
  );
}
