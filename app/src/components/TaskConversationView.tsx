/**
 * TaskConversationView — AI 任务对话视图（v0.16.0 REQ-230）。
 *
 * @ai-context: 精修/补充任务的"对话"在 AI 对话页查看——页头任务卡（状态/
 *              模型/片数/成本/耗时）+ 可跳转引用 chips（来源会话/笔记）
 *              + 逐 turn 轨迹（提示词 system/user 原文与模型回答全文可展开）
 *              + 成功结果预览（refinedMarkdown）与失败重试。
 * @ai-context: trajectory_json 中 vision 调用 user 只含图数占位（base64 不
 *              入库）；旧任务无轨迹 → 诚实提示"升级前任务无轨迹存档"。
 */
import { useState } from "react";
import type { AiTaskRecord, AiTurn } from "../types";
import ChatMessageMarkdown, { truncatePreview } from "./ChatMessageMarkdown";

interface Props {
  task: AiTaskRecord;
  turns: AiTurn[];
  refTitle: string;
  onOpenSession: (id: number) => void;
  onOpenNote: (id: number) => void;
  onRetry: (task: AiTaskRecord) => void;
  /** 重试中（进行中任务禁用按钮） */
  busy: boolean;
  /** v0.16.1：工作台深链（会话页自动展开精修工作台；缺省=不显示按钮） */
  onOpenWorkbench?: (task: AiTaskRecord) => void;
}

function fmtDateTime(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATE_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "排队中", color: "#b45309" },
  running: { text: "进行中", color: "#b45309" },
  succeeded: { text: "已完成", color: "#047857" },
  failed: { text: "失败", color: "#b91c1c" },
  partial_failed: { text: "部分成功", color: "#b45309" },
};

export default function TaskConversationView({ task, turns, refTitle, onOpenSession, onOpenNote, onRetry, busy, onOpenWorkbench }: Props) {
  const [openResult, setOpenResult] = useState(false);
  const [openTurns, setOpenTurns] = useState<Record<number, boolean>>({});
  const st = STATE_LABEL[task.state] ?? { text: task.state, color: "#6b7280" };
  const isRefine = task.opType === "refine";
  const canRetry = !busy && task.state === "failed" && isRefine;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px" }}>
      {/* 任务卡 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: "#fafafa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
            {isRefine ? "✨ AI 精修" : "📚 AI 知识补充"} · {refTitle}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.text}</span>
          {task.state === "succeeded" && task.adopted && (
            <span style={{ fontSize: 11, color: "#047857", background: "#ecfdf5", borderRadius: 6, padding: "1px 8px" }}>已采纳</span>
          )}
          {task.slices ? (
            <span style={{ fontSize: 11, color: "#6b7280" }}>{task.slices} 片</span>
          ) : (
            <span style={{ fontSize: 11, color: "#6b7280" }}>片数：—</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: "#6b7280" }}>
          <span>模型：{task.model ?? "—"}</span>
          <span>
            {task.costYuan != null ? `成本：¥${task.costYuan.toFixed(4)}` : "成本：—"}
            {task.elapsedMs != null ? ` · ${(task.elapsedMs / 1000).toFixed(1)}s` : ""}
          </span>
          <span>{fmtDateTime(task.createdAt)}</span>
        </div>
        {/* 可跳转引用（用户裁决：会话用可跳转引用） */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {isRefine && task.refId > 0 && (
            <button
              onClick={() => onOpenSession(task.refId)}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", cursor: "pointer" }}
            >
              📌 来源会话 #{task.refId} →
            </button>
          )}
          {!isRefine && task.refId > 0 && (
            <button
              onClick={() => onOpenNote(task.refId)}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", cursor: "pointer" }}
            >
              📌 来源笔记 #{task.refId} →
            </button>
          )}
          {/* v0.16.1：精修成功任务 → 会话页工作台深链（对比/采纳/重新生成一体） */}
          {isRefine && task.state === "succeeded" && onOpenWorkbench && (
            <button
              data-testid="open-workbench"
              onClick={() => onOpenWorkbench(task)}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: 6, border: "1px solid #c7d2fe", background: "#f5f3ff", color: "#4f46e5", cursor: "pointer" }}
              title="在会话页打开精修工作台（diff 对比 + 采纳/放弃/重新生成）"
            >
              🛠 打开精修工作台 →
            </button>
          )}
          {task.state === "failed" && (
            <button
              onClick={() => onRetry(task)}
              disabled={!canRetry}
              title={!canRetry && !isRefine ? "补充任务重试请到笔记页操作" : undefined}
              style={{ fontSize: 12, padding: "2px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: isRefine ? "#fef2f2" : "#f5f5f5", color: isRefine ? "#b91c1c" : "#9ca3af", cursor: isRefine ? "pointer" : "not-allowed" }}
            >
              {isRefine ? "↩ 重试" : "↩ 重试（笔记页）"}
            </button>
          )}
        </div>
        {task.state === "failed" && task.error && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", background: "#fef2f2", borderRadius: 6, padding: "4px 8px" }}>{task.error}</div>
        )}
      </div>

      {/* 成功结果预览（result_json → refinedMarkdown） */}
      {task.state === "succeeded" && task.resultJson && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setOpenResult(!openResult)}
            style={{ fontSize: 13, fontWeight: 600, color: "#0f766e", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {openResult ? "▾" : "▸"} 展开精修/补充结果
          </button>
          {openResult && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", marginTop: 6, background: "#fcfcfd", maxHeight: 420, overflowY: "auto" }}>
              <ChatMessageMarkdown content={truncatePreview(extractResultMarkdown(task.resultJson))} />
            </div>
          )}
        </div>
      )}

      {/* 轨迹（提示词/回答全文） */}
      {turns.length === 0 && task.state !== "failed" && (
        <div style={{ fontSize: 12.5, color: "#9ca3af", padding: "8px 0" }}>
          该任务无轨迹存档（v0.16.0 升级前的任务未记录提示词/回答）
        </div>
      )}
      {turns.map((t) => (
        <div key={t.turn} style={{ marginBottom: 10 }}>
          <button
            onClick={() => setOpenTurns((m) => ({ ...m, [t.turn]: !m[t.turn] }))}
            style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {openTurns[t.turn] ? "▾" : "▸"} 第 {t.turn} 片对话（提示词 + 回答全文）
          </button>
          {openTurns[t.turn] && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 6, background: "#fcfcfd" }}>
              <TrajectoryBlock label="🤖 提示词（system）" text={t.system} mono />
              <TrajectoryBlock label="📄 请求（user）" text={t.user} mono />
              <TrajectoryBlock label="✍️ 回答（assistant）" text={truncatePreview(t.response)} mono />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TrajectoryBlock({ label, text, mono }: { label: string; text: string; mono?: boolean }) {
  return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 320, overflowY: "auto", fontFamily: mono ? "Consolas, monospace" : "inherit", fontSize: 12 }}>{text}</pre>
    </div>
  );
}

/** 从 resultJson 提取可读 markdown（refine: refinedMarkdown；enrich: enrichedMarkdown） */
function extractResultMarkdown(resultJson: string): string {
  try {
    const v = JSON.parse(resultJson) as { refinedMarkdown?: string; enrichedMarkdown?: string };
    return v.refinedMarkdown ?? v.enrichedMarkdown ?? resultJson;
  } catch {
    return resultJson;
  }
}
