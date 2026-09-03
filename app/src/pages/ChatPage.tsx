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
import type { AiTaskRecord, AiProviderView, ChatMessage, ChatSession, ChatStreamEvent, NoteGroup } from "../types";
import ChatSidebar from "../components/ChatSidebar";
import ChatMessageList from "../components/ChatMessageList";
import ChatComposer from "../components/ChatComposer";
import TaskConversationView from "../components/TaskConversationView";
import useChatStream from "../hooks/useChatStream";
// v0.16.1：对话「另存为笔记」——双入口（顶栏整段 / AI 消息级）+ 转写纯函数
import ChatSaveNoteDialog from "../components/ChatSaveNoteDialog";
import { buildConversationMarkdown } from "../utils/chatTranscript";
// v0.16.1：任务对话化——对话内发起任务（按钮 + '/' 命令）+ 线程任务卡 + 追问预填
import TaskLaunchDialog, { type LaunchTargetRow } from "../components/TaskLaunchDialog";
import TaskThreadCard from "../components/TaskThreadCard";
import { buildTaskFollowUpPrompt } from "../utils/taskFollowUp";

interface Props {
  /** 跨页直达（任务对话引用跳转） */
  onOpenSessions: (sessionId: number) => void;
  onOpenNote: (noteId: number) => void;
  /** v0.19.1（REQ-260）：引用跳笔记并高亮命中词（search=笔记内搜索词） */
  onOpenNoteHighlight?: (noteId: number, search: string) => void;
  onOpenSettings: () => void;
  /** v0.16.1：任务进入对话页（会话页精修启动自动跳转——挂载即选中该任务） */
  focusTaskId?: number | null;
  /** v0.16.1：focusTaskId 消费完成回调（App 清空——防陈旧值跨导航复触发） */
  onFocusTaskConsumed?: () => void;
  /** v0.16.1：任务视图 → 精修工作台深链（App 切会话页并自动展开） */
  onOpenRefineWorkbench?: (sessionId: number, taskId: number) => void;
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
  const { onOpenSessions, onOpenNote, onOpenNoteHighlight, onOpenSettings, focusTaskId, onFocusTaskConsumed, onOpenRefineWorkbench } = props;
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
  // v0.16.1：对话转笔记——组列表（目标组下拉）与保存对话框态
  const [noteGroups, setNoteGroups] = useState<NoteGroup[]>([]);
  const [saveDialog, setSaveDialog] = useState<{ initialTitle: string; content: string } | null>(null);
  // v0.16.1：任务对话化——发起面板（工具条下拉）/ 启动对话框 / 目标清单
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  const [launchDialog, setLaunchDialog] = useState<"refine" | "enrich" | null>(null);
  const [launchTargetId, setLaunchTargetId] = useState<number | null>(null);
  const [sessionRows, setSessionRows] = useState<LaunchTargetRow[]>([]);
  const [noteRows, setNoteRows] = useState<LaunchTargetRow[]>([]);
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
      setSessionRows(sessRows.map((s) => ({ id: s.id, title: s.title })));
      const notes = await invoke<{ id: number; title: string }[]>("search_notes", { keyword: "", tag: null as string | null }).catch(() => [] as { id: number; title: string }[]);
      setNoteTitles(new Map(notes.map((n) => [n.id, n.title])));
      setNoteRows(notes.map((n) => ({ id: n.id, title: n.title })));
      // v0.16.1：组列表（保存对话框目标组下拉——失败静默仅无组可选）
      setNoteGroups(await invoke<NoteGroup[]>("list_note_groups", { terrain: null }).catch(() => [] as NoteGroup[]));
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

  // v0.16.1：任务对话化——目标名解析 / 追问预填 / 启动成功
  const taskRefTitle = useCallback((t: import("../types").AiTaskRecord): string =>
    t.opType === "refine"
      ? sessionTitles.get(t.refId) ?? `会话 #${t.refId}`
      : noteTitles.get(t.refId) ?? `笔记 #${t.refId}`,
  [sessionTitles, noteTitles]);
  const followUpTask = useCallback((t: import("../types").AiTaskRecord) => {
    setDraft(buildTaskFollowUpPrompt(t, taskRefTitle(t)));
  }, [taskRefTitle]);
  const onTaskLaunched = useCallback((taskId: number) => {
    setLaunchDialog(null);
    setLaunchTargetId(null);
    setLaunchMenuOpen(false);
    void reloadTasks();
    // 启动后切到任务对话视图（进度/轨迹即时可见；聊天视图内有同款线程卡）
    void selectTask(taskId);
  }, [reloadTasks, selectTask]);

  // v0.16.1：任务进入对话页（会话页精修启动 → App 传 focusTaskId → 选中该任务；
  // 消费后回调清空——防陈旧值在后续导航复触发）
  useEffect(() => {
    if (focusTaskId == null) return;
    void selectTask(focusTaskId);
    onFocusTaskConsumed?.();
  }, [focusTaskId, selectTask, onFocusTaskConsumed]);

  const newChat = useCallback(async (retrieval = false) => {
    // v0.19.1（REQ-260）：retrieval=true = 学习库问答模式（每会话模式——创建时定死）
    const s = await invoke<ChatSession>("chat_create_session", { title: null, retrieval });
    await refreshSessions();
    await selectChat(s.id);
  }, [refreshSessions, selectChat]);

  const newKbChat = useCallback(() => void newChat(true), [newChat]);

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
    // v0.16.1：'/' 命令——精确形态 `/refine` `123` 或 `/enrich` `7`（打开任务发起
    // 面板并预选目标）；审查修复：拒绝任意前缀误劫持（"/refine 怎么用？" 是正常提问）
    const cmd = content.match(/^\/(refine|enrich)(?:\s+(\d+))?$/);
    if (cmd) {
      setLaunchDialog(cmd[1] as "refine" | "enrich");
      setLaunchTargetId(cmd[2] ? Number(cmd[2]) : null);
      setDraft("");
      return;
    }
    // v0.18.2（REQ-253）：`/goal <目标名>`——L4.5 目标摘要现算注入（库即记忆，
    // 与普通提问分流；找不到目标不发送，防误注入）
    const goalCmd = content.match(/^\/goal (.+)$/);
    let effective = content;
    if (goalCmd) {
      const name = goalCmd[1].trim();
      try {
        const goals = await invoke<{ goal: { id: number; name: string } }[]>("list_goals");
        const g = goals.find((x) => x.goal.name === name) ?? goals.find((x) => x.goal.name.includes(name));
        if (!g) {
          setGateError(`找不到目标「${name}」——请在🎯目标页确认名称`);
          return;
        }
        const ctx = await invoke<string>("goal_chat_context", { goalId: g.goal.id });
        effective = `（以下为目标上下文·现算注入）\n${ctx}\n\n——请基于以上回答：我学到哪了？下一步重点是什么？`;
      } catch (e) {
        setGateError(String(e));
        return;
      }
    }
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
      const ok = await launch(activeChatId, "chat_send", { content: effective, resendMessageId: resendId });
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

  // v0.16.1：对话转笔记——双入口共用的开窗逻辑（标题默认取首条提问首行）
  const openSaveDialog = (upToId?: number) => {
    if (messages.length === 0) return;
    const firstUser = messages.find((m) => m.role === "user" && m.content.trim() !== "");
    const firstLine = (firstUser?.content ?? "").split("\n")[0]?.trim() ?? "";
    setSaveDialog({
      initialTitle: (firstLine || activeSession?.title || "AI 对话记录").slice(0, 60),
      content: buildConversationMarkdown(messages, upToId),
    });
  };
  const editMessage = (m: ChatMessage) => {
    setEditingId(m.id);
    setDraft(m.content);
  };
  /** 当前展示会话的流式视图（非展示会话的流不可见——后台完成不污染 UI）；
   *  v0.19.1：附带流内命中片段（kb_hits 事件累积） */
  const streamView = view && view.sessionId === activeChatId ? { text: view.text, hits: view.hits } : null;

  /** 引用跳笔记（优先带命中词高亮——最小面：无高亮回调时退化为普通打开） */
  const openCitedNote = useCallback((noteId: number, search: string) => {
    if (onOpenNoteHighlight) {
      onOpenNoteHighlight(noteId, search);
    } else {
      onOpenNote(noteId);
    }
  }, [onOpenNote, onOpenNoteHighlight]);

  return (
    <div style={{ height: "100%", display: "flex", minHeight: 0 }}>
      <ChatSidebar
        sessions={sessions}
        tasks={tasks}
        activeChatId={activeChatId}
        activeTaskId={activeTaskId}
        onSelectChat={(id) => void selectChat(id)}
        onSelectTask={(id) => void selectTask(id)}
        onNewChat={() => void newChat(false)}
        onNewKbChat={newKbChat}
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
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                {activeSession.retrieval ? "📚 " : ""}{activeSession.title}
              </span>
              {activeSession.retrieval && (
                <span style={{ fontSize: 11, color: "#0f766e", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "0 8px" }}>
                  学习库问答
                </span>
              )}
              {isStreaming(activeSession.id) && (
                <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>● 生成中</span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6b7280" }}>
                {/* v0.16.1：整段对话另存为笔记（含提问与回答的完整转写） */}
                {messages.length > 0 && (
                  <button
                    data-testid="chat-save-conversation"
                    onClick={() => openSaveDialog()}
                    style={{ fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 }}
                    title="把本段对话（含提问与回答）另存为笔记"
                  >
                    📄 转笔记
                  </button>
                )}
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
            {/* v0.16.1：任务对话化——发起工具条（按钮）/ '-' 命令同义 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <button
                  data-testid="task-launch-open"
                  onClick={() => setLaunchMenuOpen((v) => !v)}
                  style={{ fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" }}
                  title="在对话中发起 AI 任务（也支持 '/refine' '/enrich'）"
                >
                  ✨ 发起任务 ▾
                </button>
                {launchMenuOpen && (
                  <>
                    <div onClick={() => setLaunchMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent" }} />
                    <div data-testid="task-launch-menu" data-app-menu="" style={{ position: "absolute", top: "100%", left: 0, zIndex: 31, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", minWidth: 180 }}>
                      <button data-testid="task-launch-refine" style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", color: "#374151" }} onClick={() => { setLaunchDialog("refine"); setLaunchTargetId(null); setLaunchMenuOpen(false); }}>
                        ✨ AI 精修（会话 → 精修成笔记）
                      </button>
                      <button data-testid="task-launch-enrich" style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", color: "#374151" }} onClick={() => { setLaunchDialog("enrich"); setLaunchTargetId(null); setLaunchMenuOpen(false); }}>
                        📚 AI 知识补充（笔记 → 补外部知识）
                      </button>
                    </div>
                  </>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>试试 '/refine' '/enrich' 快捷命令</span>
            </div>
            {/* v0.16.1：线程任务卡（进行中实时 + 完成可追问）；v0.17.0 精修
                完成双入口（回到会话/查看笔记——REQ-247） */}
            <TaskThreadCard
              tasks={tasks}
              onFollowUp={followUpTask}
              onOpenTask={(id) => void selectTask(id)}
              refTitle={taskRefTitle}
              onOpenSession={onOpenSessions}
              onOpenNote={onOpenNote}
            />
            <ChatMessageList
              messages={messages}
              streaming={streamView}
              onRegenerate={() => void regenerate()}
              onEditUser={editMessage}
              editingId={editingId}
              onSaveMessage={(m) => openSaveDialog(m.id)}
              // v0.19.1：引用卡片跳笔记（命中词高亮）
              onOpenCitedNote={openCitedNote}
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
            // v0.16.1：精修成功任务 → 会话页工作台深链；v0.17.0 审查修复：
            // 笔记级任务（targetKind=note）→ 直接查看笔记（ref_id=noteId，
            // 会话页深链会错目标）
            onOpenWorkbench={onOpenRefineWorkbench
              ? (t) => (t.targetKind === "note" ? onOpenNote(t.refId) : onOpenRefineWorkbench(t.refId, t.taskId))
              : undefined}
          />
        )}
        {activeChatId === null && activeTaskId === null && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            选择左侧一个会话，或在「对话」段点 ＋ 新建；精修/补充任务请选「AI 任务」段
          </div>
        )}
      </div>

      {/* v0.16.1：对话转笔记对话框（顶栏整段 / AI 消息级共用） */}
      {saveDialog && (
        <ChatSaveNoteDialog
          initialTitle={saveDialog.initialTitle}
          content={saveDialog.content}
          groups={noteGroups}
          onOpenNote={onOpenNote}
          onClose={() => setSaveDialog(null)}
        />
      )}

      {/* v0.16.1：对话内发起任务对话框（按钮 / '/' 命令共用） */}
      {launchDialog && (
        <TaskLaunchDialog
          kind={launchDialog}
          sessions={sessionRows}
          notes={noteRows}
          initialTargetId={launchTargetId}
          onClose={() => { setLaunchDialog(null); setLaunchTargetId(null); }}
          onStarted={onTaskLaunched}
        />
      )}
    </div>
  );
}
