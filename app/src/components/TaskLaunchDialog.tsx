/**
 * TaskLaunchDialog — 从 AI 对话发起任务（v0.16.1 用户决定③：按钮 + '/' 命令）。
 *
 * @ai-context: 对话中枢闭环——不用离开对话页即可启动精修/补充：选目标
 *              （会话/笔记）→ 授权与成本一次确认（未授权先 confirm 同意 +
 *              ai_set_authorized——与 AiRefineCard 同红线；预估失败则仅授权
 *              确认，成本未知诚实提示）→ ai_refine_start / ai_enrich_start。
 *              补充默认全九子项（d1~d3+b1~b6——对话页不展开子项勾选，深度
 *              勾选需求在笔记页 EnrichPanel 完整呈现）。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { AiSettingsView, AiTaskState, RefineEstimateView } from "../types";

export interface LaunchTargetRow {
  id: number;
  title: string;
}

interface Props {
  kind: "refine" | "enrich";
  sessions: LaunchTargetRow[];
  notes: LaunchTargetRow[];
  /** '/' 命令带数字 id 时预选目标（按钮入口=null） */
  initialTargetId?: number | null;
  onClose: () => void;
  /** 启动成功（父层刷新任务列表 + 展示线程卡） */
  onStarted: (taskId: number) => void;
}

/** 补充九子项（与 EnrichPanel KINDS 对齐；对话页一键全选） */
const ALL_ENRICH_KINDS = ["d1", "d2", "d3", "b1", "b2", "b3", "b4", "b5", "b6"];

const BTN: React.CSSProperties = { fontSize: 12.5, cursor: "pointer", padding: "5px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151" };

export default function TaskLaunchDialog({ kind, sessions, notes, initialTargetId, onClose, onStarted }: Props) {
  const [targetId, setTargetId] = useState<number | null>(initialTargetId ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const isRefine = kind === "refine";
  const rows = isRefine ? sessions : notes;
  const targetTitle = useMemo(() => rows.find((r) => r.id === targetId)?.title ?? "", [rows, targetId]);

  // 目标清单为空时提示（无会话/无笔记）
  useEffect(() => {
    if (rows.length === 0) setStatus(isRefine ? "暂无会话——先到「会话」页采集/导入内容" : "暂无笔记——先创建或采集内容");
  }, [rows.length, isRefine]);

  const launch = async () => {
    if (targetId == null || busy) return;
    setBusy(true);
    setStatus("");
    try {
      // ① 授权红线（与 AiRefineCard 同语义：未授权 → 同意后 ai_set_authorized）
      const settings = await invoke<AiSettingsView>("ai_get_settings").catch(() => null);
      if (settings && !settings.authorized) {
        const ok = await confirm(
          "任务内容（转写文本/笔记正文）将上传至所选模型的云端服务商；本地音视频/图片永不出本机。是否同意？",
          { title: "熵减 · AI 任务", kind: "warning" },
        );
        if (!ok) { setBusy(false); return; }
        await invoke("ai_set_authorized", { authorized: true }).catch(() => undefined);
      }
      // ② 成本确认（预估失败 → 仅提示未知成本，不阻断——任务中心有完整记录）
      const est = isRefine
        ? await invoke<RefineEstimateView>("ai_refine_estimate", { sessionId: targetId }).catch(() => null)
        : await invoke<RefineEstimateView>("ai_enrich_estimate", { noteId: targetId, selectedKinds: ALL_ENRICH_KINDS }).catch(() => null);
      const cost = est?.estimate?.estCostYuan;
      const estText = cost != null ? `预估费用 ¥${Number(cost).toFixed(4)}` : "费用未知（可到任务中心查看）";
      const ok2 = await confirm(
        `启动${isRefine ? " AI 精修" : " AI 知识补充"}「${targetTitle || `#${targetId}`}」？\n${estText}`,
        { title: "熵减 · AI 任务", kind: "warning" },
      );
      if (!ok2) { setBusy(false); return; }
      // ③ 启动任务
      const handle = isRefine
        ? await invoke<{ taskId: number; state: AiTaskState }>("ai_refine_start", { sessionId: targetId, authorized: true })
        : await invoke<{ taskId: number; state: AiTaskState }>("ai_enrich_start", {
            noteId: targetId, selectedKinds: ALL_ENRICH_KINDS, authorized: true,
          });
      onStarted(handle.taskId);
    } catch (e) {
      setStatus(`启动失败：${e}`);
      setBusy(false);
    }
  };

  return (
    <>
      <div onClick={onClose} data-testid="task-launch-backdrop" style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.18)" }} />
      <div
        data-testid="task-launch-dialog"
        style={{
          position: "fixed", zIndex: 51, top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 360, background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 14, fontSize: 12.5,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 10 }}>
          {isRefine ? "✨ 发起 AI 精修" : "📚 发起 AI 知识补充"}
        </div>
        <label style={{ display: "block", color: "#6b7280", marginBottom: 4 }}>
          {isRefine ? "选择会话（转写内容 → 精修成笔记）" : "选择笔记（正文 → 补充外部知识）"}
        </label>
        <select
          data-testid="task-launch-target"
          value={targetId ?? ""}
          onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
          style={{ width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box", marginBottom: 8, background: "#fff" }}
        >
          <option value="">选择…</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>{r.title || `#${r.id}`}</option>
          ))}
        </select>
        {isRefine && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
            补充默认九子项（深度 d1~d3 + 广度 b1~b6）
          </div>
        )}
        {status && <div data-testid="task-launch-error" style={{ color: "#dc2626", marginBottom: 8 }}>{status}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button data-testid="task-launch-cancel" style={BTN} onClick={onClose} disabled={busy}>取消</button>
          <button
            data-testid="task-launch-start"
            style={{ ...BTN, background: "#0d9488", color: "#fff", border: "none", fontWeight: 600 }}
            onClick={() => void launch()}
            disabled={busy || targetId == null}
          >
            {busy ? "启动中…" : "启动任务"}
          </button>
        </div>
      </div>
    </>
  );
}
