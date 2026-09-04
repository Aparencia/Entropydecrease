/**
 * AiTaskPanel — AI 任务中心面板（F2 任务中心，2026-08-21）。
 *
 * @ai-context: 全局任务历史（精修/补充统一）：时间/类型/状态/耗时/成本/模型/
 *              错误全量可见（数据源 ai_task_history——SQLite ai_tasks 表）；
 *              成功任务可「查看结果」重新取回（重启恢复后的任务也能查，
 *              结果在内存注册表/DB）并可「采纳落库」（带 taskId 标记采纳，
 *              防重复采纳产生重复笔记）；失败任务显示原因可重试（回到原入口）。
 * @ai-context: 与内联卡片（AiRefineCard/EnrichPanel）互补：卡片=进行中交互，
 *              面板=历史 + 恢复 + 采纳复核；完成通知由 App.tsx 全局监听
 *              ai:task-update 事件实现（跨页面可见）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiEnrichResult, AiRefineResult, AiTaskRecord } from "../types";

const btn: React.CSSProperties = { padding: "3px 8px", fontSize: 11, borderRadius: 5, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" };

/** 状态 → 徽标色/文案 */
function stateBadge(state: string): { text: string; color: string; bg: string } {
  switch (state) {
    case "succeeded": return { text: "✅ 成功", color: "#047857", bg: "#ecfdf5" };
    case "failed": return { text: "❌ 失败", color: "#b91c1c", bg: "#fef2f2" };
    case "running": return { text: "⏳ 进行中", color: "#1d4ed8", bg: "#eff6ff" };
    default: return { text: "⏸ 排队中", color: "#92400e", bg: "#fffbeb" };
  }
}

/** 类型 → 标签 */
function opLabel(op: string): string {
  return op === "refine" ? "✨ 精修" : "📖 补充";
}

/** 时长格式化（ms → 秒/分） */
function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${Math.floor(s % 60)}s`;
}

export default function AiTaskPanel() {
  const [tasks, setTasks] = useState<AiTaskRecord[]>([]);
  const [msg, setMsg] = useState("");
  // 选中任务（查看结果/采纳）
  const [selected, setSelected] = useState<AiTaskRecord | null>(null);
  const [summary, setSummary] = useState<{ label: string; value: string }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const refine = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "refine", limit: 30 }).catch(() => [] as AiTaskRecord[]);
      const enrich = await invoke<AiTaskRecord[]>("ai_task_history", { opType: "enrich", limit: 30 }).catch(() => [] as AiTaskRecord[]);
      // 合并按时间倒序（createdAt desc）
      setTasks([...refine, ...enrich].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30));
    } catch (e) {
      setMsg(`加载任务历史失败：${e}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 查看成功任务结果（取回注册表/恢复结果——重启后仍可查；
   *  强类型契约：精修/补充结果分别用 AiRefineResult/AiEnrichResult） */
  const viewResult = async (t: AiTaskRecord) => {
    setMsg("");
    try {
      if (t.opType === "refine") {
        const r = await invoke<AiRefineResult>("ai_refine_result", { taskId: t.taskId });
        setSelected(t);
        setSummary([
          { label: "标题", value: r.title },
          { label: "新增行", value: String(r.addedLines) },
          { label: "删除行", value: String(r.removedLines) },
          { label: "切片", value: String(r.slices) },
          { label: "失败片", value: String(r.failedSlices) },
          { label: "模型", value: r.model },
        ]);
      } else {
        const r = await invoke<AiEnrichResult>("ai_enrich_result", { taskId: t.taskId });
        setSelected(t);
        setSummary([
          { label: "块数", value: String(r.blocks) },
          { label: "深度", value: String(r.depthBlocks) },
          { label: "广度", value: String(r.breadthBlocks) },
          { label: "切片", value: String(r.slices) },
          { label: "模型", value: r.model },
        ]);
      }
    } catch (e) {
      setMsg(`取回结果失败：${e}`);
    }
  };

  /** 采纳落库（带 taskId 标记采纳——防重复采纳；已采纳任务拒绝再采纳） */
  const adopt = async () => {
    if (!selected) return;
    if (selected.adopted) {
      setMsg("该任务已采纳落库——请勿重复采纳（可到笔记页查看）");
      return;
    }
    setMsg("");
    try {
      // 采纳落库（返回 {id} 仅历史协议——REQ-277 后不再向用户展示裸编号）
      await (selected.opType === "refine"
        ? invoke<{ id: number }>("ai_refine_apply", {
            sessionId: selected.refId,
            result: await invoke<AiRefineResult>("ai_refine_result", { taskId: selected.taskId }),
            taskId: selected.taskId,
          })
        : invoke<{ id: number }>("ai_enrich_apply", {
            noteId: selected.refId,
            result: await invoke<AiEnrichResult>("ai_enrich_result", { taskId: selected.taskId }),
            taskId: selected.taskId,
          }));
      // REQ-277：落库提示不带裸 # 数字（笔记身份=语义位置，不是编号）
      setMsg("已落库为笔记（可到笔记页查看版本时间线）");
      setSelected(null);
      setSummary(null);
      void load();
    } catch (e) {
      setMsg(`采纳失败：${e}`);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>🗂 AI 任务中心</span>
        <button style={btn} onClick={() => void load()}>刷新</button>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>历史任务持久化保存——重启后可查看/采纳结果</span>
      </div>

      {tasks.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>暂无任务记录（精修/补充完成后自动记录）</div>
      ) : (
        <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          {tasks.map((t) => {
            const badge = stateBadge(t.state);
            return (
              <div key={t.taskId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", borderBottom: "1px solid #f3f4f6", fontSize: 11 }}>
                <span style={{ color: "#6b7280", width: 50, flexShrink: 0 }}>
                  {new Date(t.createdAt * 1000).toLocaleTimeString()}
                </span>
                <span style={{ width: 44, flexShrink: 0 }}>{opLabel(t.opType)}</span>
                <span style={{ color: badge.color, background: badge.bg, borderRadius: 10, padding: "1px 8px", width: 58, textAlign: "center" }}>
                  {badge.text}
                </span>
                <span style={{ color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.opType === "refine" ? "会话" : "笔记"}
                  {t.model && <span style={{ color: "#9ca3af" }}> · {t.model}</span>}
                </span>
                <span style={{ color: "#9ca3af", width: 52, textAlign: "right" }}>{fmtMs(t.elapsedMs)}</span>
                {t.costYuan != null && (
                  <span style={{ color: "#b45309", width: 52, textAlign: "right" }}>¥{t.costYuan.toFixed(4)}</span>
                )}
                {t.state === "succeeded" && !t.adopted && (
                  <button style={btn} onClick={() => void viewResult(t)}>查看</button>
                )}
                {t.state === "succeeded" && t.adopted && (
                  <span style={{ color: "#0d9488", fontSize: 11 }}>✅ 已采纳</span>
                )}
                {t.state === "failed" && t.error && (
                  <span style={{ color: "#b91c1c", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.error}>
                    {t.error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 结果摘要 + 采纳（防重复采纳：采纳后任务标记 adopted，历史中不再可恢复） */}
      {selected && summary && (
        <div style={{ border: "1px solid #a7f3d0", background: "#ecfdf5", borderRadius: 6, padding: 8, marginTop: 6, fontSize: 11 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            任务结果 · {opLabel(selected.opType)}
            <span style={{ fontWeight: 400, color: "#6b7280" }}>
              （{new Date(selected.createdAt * 1000).toLocaleTimeString()}）
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            {summary.map((s) => (
              <span key={s.label} style={{ color: "#374151" }}>
                {s.label}：<strong>{s.value}</strong>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void adopt()}>
              ✅ 采纳落库
            </button>
            <button style={btn} onClick={() => { setSelected(null); setSummary(null); }}>关闭</button>
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: msg.startsWith("已") ? "#0d9488" : "#dc2626", marginTop: 4 }}>{msg}</div>}
    </div>
  );
}
