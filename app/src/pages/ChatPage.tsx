/**
 * ChatPage — AI 对话页（v0.16.0 REQ-224~230）。
 *
 * @ai-context: 统一对话中枢：①💬 自由聊天（流式/停止/重发/编辑重发/会话
 *              CRUD/模型选择）②🤖 AI 任务对话（精修/补充轨迹——提示词与
 *              回答全文 + 可跳转引用）。流式状态机在 useChatStream（per-
 *              session 隔离）；任务视图复用 ai_task_history + ai_task_conversation。
 * @ai-context: 授权红线：chat_send 前置 content_gate（默认关）——门禁错误
 *              显示引导卡 + 禁输入；首次发送前一次性云端提示（localStorage
 *              记忆，审查补充：设计承诺的实现缺口）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { AiTaskRecord, AiProviderView, ChatMessage, ChatSession, ChatStreamEvent } from "../types";
import ChatSidebar from "../components/ChatSidebar";
import ChatMessageList from "../components/ChatMessageList";
import ChatComposer from "../components/ChatComposer";
import TaskConversationView from "../components/TaskConversationView";
import useChatStream from "../hooks/useChatStream";

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

/** 首次发送云端提示的记忆键（一次性确认） */
const CLOUD_NOTICE_KEY = "entropy-ai-chat-cloud-notice";

const CLOUD_NOTICE_TEXT =
  "对话内容（纯文本）将发送至所选模型的云端服务商；本地音视频/图片/笔记永不出本机。是否同意？";

export default function ChatPage(props: Props) {
  const { onOpenSessions, onOpenNote, onOpenSettings } = props;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [tasks, setTasks] = useState<AiTaskRecord[]>([]);
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gateError, setGateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [taskDetail, setTaskDetail] = useState<{ task: AiTaskRecord; turns: import("../types").AiTurn[] } | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [sessionTitles, setSessionTitles] = useState<Map<number, string>>(new Map());
  const [noteTitles, setNoteTitles] = useState<Map<number, string>>(new Map());
  const [staticLoaded, setStaticLoaded] = useState(false);
  const activeChatRef = useRef<number | null>(null);
  activeChatRef.current = activeChatId;

  const loadMessages = useCallback(async (sessionId: number) => {
    setMessages(await invoke<ChatMessage[]>("chat_list_messages", { sessionId }).catch(() => [] as ChatMessage[]));
  }, []);

  /** 流终态 → 刷新消息（仅当终态会话仍为当前展示——旧流后台完成不打扰） */
  const onStreamSettled = useCallback(async (sessionId: number, _ev: ChatStreamEvent) => {
    if (activeChatRef.current === sessionId) await loadMessages(sessionId);
  }, [loadMessages]);

  const { view, setActive, isStreaming, launch, stop } = useChatStream((sid, ev) => void onStreamSettled(sid, ev));

  // 静态数据（会话/Provider/标题映射）只加载一次——审查优化：原 6s 全量刷新
  useEffect(() => {
    if (staticLoaded) return;
    void (async () => {
      setSessions(await invoke<ChatSession[]>("chat_list_sessions").catch(() => [] as ChatSession[]));
      setProviders(await invoke<AiProviderView[]>("ai_provider_list").catch(() => [] as AiProviderView[]));
      const sessRows = await invoke<SessionRow[]>("list_sessions", { limit: 500 }).catch(() => [] as SessionRow[]);
      setSessionTitles(new Map(sessRows.map((s) => [s.id, s.title])));
      const notes = await invoke<{ id: number; title: string }[]>("search_notes", { keyword: "", tag: null as string | null }).catch(() => [] as { id: number; title: string }[]);
      setNoteTitles(new Map(notes.map((n) => [n.id, n.title])));
      setStaticLoaded(true);
    })();
  }, [staticLoaded]);

  // 任务列表：初始 + 仅当存在未终态任务时轮询（审查优化：无进行中任务零轮询）
  const reloadTasks = useCallback(async () => {
    const refine = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "refine", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    const enrich = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "enrich", limit: 30 }).catch(() => [] as AiTaskRecord[]);
    setTasks([...refine, ...enrich].sort((a, b) => b.createdAt - a.createdAt).slice(0, 60));
  }, []);

  useEffect(() => {
    void reloadTasks();
  }, [reloadTasks]);

  const hasActiveTask = tasks.some((t) => t.state === "pending" || t.state === "running");
  useEffect(() => {
    if (!hasActiveTask) return;
    const t = setInterval(() => void reloadTasks(), 5000);
    return () => clearInterval(t);
  }, [hasActiveTask, reloadTasks]);

  const selectChat = useCallback(async (id: number) => {
    setActiveChatId(id);
    setActiveTaskId(null);
    setTaskDetail(null);
    setGateError(null);
    setEditingId(null);
    setDraft("");
    setActive(id);
    await loadMessages(id);
  }, [loadMessages, setActive]);

  const selectTask = useCallback(async (taskId: number) => {
    setActiveTaskId(taskId);
    setActiveChatId(null);
    setActive(null);
    setGateError(null);
    try {
      const [task, turns] = await invoke<[AiTaskRecord, import("../types").AiTurn[]]>("ai_task_conversation", { taskId });
      setTaskDetail({ task, turns });
    } catch (e) {
      setTaskDetail(null);
      setGateError(String(e));
    }
  }, [setActive]);

  const refreshSessions = useCallback(async () => {
    setSessions(await invoke<ChatSession[]>("chat_list_sessions").catch(() => [] as ChatSession[]));
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
    stop(id); // 进行中流先停（后端流循环出口；残留由删除语义兜底）
    await invoke("chat_delete_session", { sessionId: id });
    if (activeChatId === id) {
      setActiveChatId(null);
      setActive(null);
    }
    await refreshSessions();
  }, [activeChatId, refreshSessions, setActive, stop]);

  const send = useCallback(async () => {
    if (!activeChatId) return;
    const content = draft.trim();
    if (!content) return;
    // 首次发送前一次性云端提示（审查补充：设计承诺→实现）
    if (!localStorage.getItem(CLOUD_NOTICE_KEY)) {
      const ok = await confirm(CLOUD_NOTICE_TEXT, { title: "熵减 · AI 对话", kind: "warning" });
      if (!ok) return;
      localStorage.setItem(CLOUD_NOTICE_KEY, "1");
    }
    const resendId = editingId ?? undefined;
    setEditingId(null);
    setDraft("");
    setGateError(null);
    try {
      const ok = await launch(activeChatId, "chat_send", { content, resendMessageId: resendId });
      if (!ok) setGateError("该会话已有进行中的对话——请等待完成或先停止");
    } catch (e) {
      setGateError(String(e));
    }
  }, [activeChatId, draft, editingId, launch]);

  const regenerate = useCallback(async () => {
    if (!activeChatId) return;
    setGateError(null);
    try {
      const ok = await launch(activeChatId, "chat_regenerate", {});
      if (!ok) setGateError("该会话已有进行中的对话——请等待完成或先停止");
    } catch (e) {
      setGateError(String(e));
    }
  }, [activeChatId, launch]);

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
      await reloadTasks();
    } catch (e) {
      setGateError(String(e));
    } finally {
      setRetryBusy(false);
    }
  }, [reloadTasks]);

  const activeSession = sessions.find((s) => s.id === activeChatId) ?? null;
  const isGateBlocked = gateError !== null && (gateError.includes("未开启") || gateError.includes("授权") || gateError.includes("密钥") || gateError.includes("Provider"));
  const editMessage = (m: ChatMessage) => {
    setEditingId(m.id);
    setDraft(m.content);
  };
  /** 当前展示会话的流式视图（非展示会话的流不可见——后台完成不污染 UI） */
  const streamView = view && view.sessionId === activeChatId ? { text: view.text } : null;

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <ChatSidebar
        sessions={sessions}
        tasks={tasks}
        activeChatId={activeChatId}
        activeTaskId={activeTaskId}
        onSelectChat={(id) => void selectChat(id)}
        onSelectTask={(id) => void selectTask(id)}
        onNewChat={() => void newChat()}
        onRenameChat={(id) => void renameChat(id)}
        onDeleteChat={(id) => void deleteChat(id)}
        sessionTitles={sessionTitles}
        noteTitles={noteTitles}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* 顶栏：会话标题 + 模型选择 */}
        <div style={{ height: 44, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
          {activeSession && (
            <>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{activeSession.title}</span>
              {isStreaming(activeSession.id) && (
                <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>● 生成中</span>
              )}
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
              streaming={streamView}
              onRegenerate={() => void regenerate()}
              onEditUser={editMessage}
              editingId={editingId}
            />
            <ChatComposer
              value={draft}
              onChange={setDraft}
              streaming={streamView !== null}
              onSend={() => void send()}
              onStop={() => stop(activeChatId)}
              disabled={isGateBlocked}
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
