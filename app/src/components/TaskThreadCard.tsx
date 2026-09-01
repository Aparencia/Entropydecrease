/**
 * TaskThreadCard — 对话线程内任务卡（v0.16.1 用户决定③：任务=对话一部分）。
 *
 * @ai-context: 聊天视图中呈现进行中任务（排队/进度实时）与 10 分钟内的最近
 *              完成任务（「在对话中追问」预填结果要点 + 「查看轨迹」）——
 *              任务不再只是侧栏的孤立状态，而是贴着对话、可继续聊的实体。
 *              纯展示组件：数据由 ChatPage 轮询提供（ai_task_history）。
 * @ai-context: v0.17.0（REQ-247）精修任务卡片升级：进行中显示流式正文
 *              （片级解析流——useRefineStream，逐章流出）+ 完成态双入口
 *              [回到会话] [查看笔记]（用户裁决：完成后快速闭环）。
 */
import type { AiTaskRecord } from "../types";
import { orderedBlockFrames, useRefineStream } from "../hooks/useRefineStream";

interface Props {
  tasks: AiTaskRecord[];
  /** 追问（父层预填 Composer——buildTaskFollowUpPrompt） */
  onFollowUp: (task: AiTaskRecord) => void;
  /** 查看完整轨迹（跳侧栏「AI 任务」段选中） */
  onOpenTask: (taskId: number) => void;
  /** 目标名解析（会话/笔记标题 → 展示） */
  refTitle: (task: AiTaskRecord) => string;
  /** v0.17.0：完成双入口——回到会话（精修来源） */
  onOpenSession?: (sessionId: number) => void;
  /** v0.17.0：完成双入口——查看笔记 */
  onOpenNote?: (noteId: number) => void;
}

const OP_LABEL: Record<string, string> = { refine: "✨ 精修", enrich: "📚 补充" };

const STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  borderRadius: 8, padding: "6px 10px", margin: "6px 16px 0",
  border: "1px solid #e5e7eb", background: "#fafafa", fontSize: 12,
};

function isActive(t: AiTaskRecord): boolean {
  return t.state === "pending" || t.state === "running";
}

/** 10 分钟内完成的最近任务（追问窗口——太久远的历史任务不打扰当前对话） */
function recentDone(tasks: AiTaskRecord[]): AiTaskRecord | null {
  const now = Math.floor(Date.now() / 1000);
  const done = tasks
    .filter((t) => t.state === "succeeded" || t.state === "partial_failed")
    .filter((t) => now - t.createdAt < 600)
    .sort((a, b) => b.createdAt - a.createdAt);
  return done[0] ?? null;
}

/** 精修流式正文（进行中任务卡内——逐章流出；无帧则仅进度行） */
function RefineStreamBody({ taskId, total }: { taskId: number; total: number | null }) {
  const frames = useRefineStream(taskId);
  const blocks = orderedBlockFrames(frames);
  const doneFrames = frames.filter((f) => f.kind === "done").length;
  const failedCount = frames.filter((f) => f.kind === "sliceFailed").length;
  if (blocks.length === 0 && frames.length === 0) return null;
  return (
    <div style={{ width: "100%", marginTop: 4, borderTop: "1px dashed #e5e7eb", paddingTop: 4 }}>
      <div style={{ fontSize: 10.5, color: "#9ca3af", marginBottom: 2 }}>
        已整理 {blocks.length}/{total ?? "?"} 片{failedCount > 0 && ` · 失败 ${failedCount} 片（保留规则版）`}
        {doneFrames > 0 && " · 完成"}
      </div>
      {blocks.map((b) => (
        <pre
          key={b.sliceIndex}
          style={{
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit",
            fontSize: 11.5, color: "#374151", margin: 0, padding: "2px 0",
            borderTop: b.sliceIndex > 1 ? "1px solid #f3f4f6" : "none",
          }}
        >
          {b.markdown}
        </pre>
      ))}
    </div>
  );
}

export default function TaskThreadCard({
  tasks, onFollowUp, onOpenTask, refTitle, onOpenSession, onOpenNote,
}: Props) {
  const active = tasks.filter(isActive).slice(0, 3);
  const done = recentDone(tasks);
  if (active.length === 0 && !done) return null;

  return (
    <div style={{ flexShrink: 0 }}>
      {active.map((t) => (
        <div key={t.taskId} data-testid="task-thread-active" style={STYLE}>
          <span style={{ fontWeight: 600, color: "#b45309" }}>
            ⚙ {OP_LABEL[t.opType] ?? t.opType} {refTitle(t)}
          </span>
          <span style={{ color: "#b45309" }}>{t.state === "running" ? "进行中…" : "排队中…"}</span>
          {t.slices != null && t.slices > 1 && <span style={{ color: "#9ca3af" }}>{t.slices} 片</span>}
          <button style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#6b7280" }} onClick={() => onOpenTask(t.taskId)}>
            查看轨迹 ▸
          </button>
          {t.opType === "refine" && <RefineStreamBody taskId={t.taskId} total={t.slices} />}
        </div>
      ))}
      {done && (
        <div data-testid="task-thread-done" style={{ ...STYLE, background: "#f0fdfa", borderColor: "#99f6e4" }}>
          <span style={{ fontWeight: 600, color: "#047857" }}>
            ✓ {OP_LABEL[done.opType] ?? done.opType} {refTitle(done)}
          </span>
          <span style={{ color: "#047857" }}>已完成</span>
          {/* v0.17.0：完成双入口（精修——回到会话/查看笔记闭环）。
              审查修复：按 target_kind 分发——会话级→回会话；笔记级→看笔记
              （ref_id 语义不同，错跳为旧实现缺陷） */}
          {done.opType === "refine" && done.targetKind !== "note" && onOpenSession != null && (
            <button
              data-testid="task-thread-back-session"
              onClick={() => onOpenSession(done.refId)}
              style={{ fontSize: 11, cursor: "pointer", border: "1px solid #99f6e4", background: "#fff", color: "#0f766e", borderRadius: 6, padding: "2px 8px" }}
            >
              🏠 回到会话
            </button>
          )}
          {done.opType !== "enrich" && done.targetKind === "note" && onOpenNote != null && (
            <button
              data-testid="task-thread-view-note"
              onClick={() => onOpenNote(done.refId)}
              style={{ fontSize: 11, cursor: "pointer", border: "1px solid #99f6e4", background: "#fff", color: "#0f766e", borderRadius: 6, padding: "2px 8px" }}
            >
              📄 查看笔记
            </button>
          )}
          <button
            data-testid="task-thread-followup"
            onClick={() => onFollowUp(done)}
            style={{ marginLeft: "auto", fontSize: 11.5, cursor: "pointer", border: "1px solid #99f6e4", background: "#fff", color: "#0f766e", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}
            title="把结果要点带入 Composer，继续追问"
          >
            💬 在对话中追问
          </button>
          <button
            onClick={() => onOpenTask(done.taskId)}
            style={{ fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#6b7280" }}
          >
            查看轨迹 ▸
          </button>
        </div>
      )}
    </div>
  );
}
