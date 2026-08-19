/**
 * NotePreviewView — 会话笔记预览（REQ-081 / v0.6.0 M6 第三视图）。
 *
 * @ai-context: 原料/产物/笔记预览三视图之一：过滤后笔记正文（标题+讲述内容+
 *              画面要点）+ 过滤统计卡（UI 垃圾 x/重复 y/碎片 z/低置信 w）+
 *              被过滤内容折叠对照（可复查误杀，点击定位原料）+ 一键落库
 *              （复用 session_to_note 单一管线）+「✨ AI 复核」按需触发
 *              （REQ-085：授权默认关——上传前确认；判定结果就地更新预览；
 *              merge 段以拼接形态展示，落库仍按原始段——原料不动原则）。
 * @ai-context: 预览只读不落库（preview_session_note）；AI 判定仅在本次预览
 *              生效，落库时经 ai_decisions 回传保持输出一致。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteFilterResult, TextFilterDecision, TextFilterReview, TextFilterStatus } from "../types";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const REASON_LABEL: Record<string, string> = {
  "ui-junk": "UI 垃圾",
  duplicate: "重复",
  fragment: "碎片",
  "low-confidence": "低置信",
  "ai-delete": "AI 判删",
};

/** HTML 转义（审查修复 2026-08-19：OCR/ASR 文本来自视频字幕，恶意字幕可含
 *  `<script>`/`<img onerror>` 等 HTML——dangerouslySetInnerHTML 渲染前必须
 *  转义，防存储型 XSS） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 轻量 Markdown 渲染（标题/段落/列表——笔记正文结构有限，避免引渲染库；
 *  所有文本经 escapeHtml 转义——本地内容仍按不可信输入处理） */
function renderMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h2 style="font-size:15px;margin:10px 0 4px">${escapeHtml(line.slice(2))}</h2>`;
      if (line.startsWith("## ")) return `<h3 style="font-size:13px;margin:8px 0 4px;color:#0f766e">${escapeHtml(line.slice(3))}</h3>`;
      if (line.startsWith("- ")) return `<div style="font-size:12px;color:#4b5563">• ${escapeHtml(line.slice(2))}</div>`;
      if (line.trim() === "") return "";
      return `<p style="font-size:13px;color:#374151;margin:4px 0">${escapeHtml(line)}</p>`;
    })
    .join("");
}

export default function NotePreviewView({ sessionId }: { sessionId: number }) {
  const [preview, setPreview] = useState<NoteFilterResult | null>(null);
  const [status, setStatus] = useState("");
  const [showFiltered, setShowFiltered] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState<TextFilterReview["ai"] | null>(null);
  const [aiStatus, setAiStatus] = useState<TextFilterStatus | null>(null);
  // 审查修复（2026-08-19）：AI 判定列表——落库回传保证预览/落库一致
  const [aiDecisions, setAiDecisions] = useState<TextFilterDecision[]>([]);

  const load = useCallback(async () => {
    try {
      const p = await invoke<NoteFilterResult>("preview_session_note", { id: sessionId });
      setPreview(p);
    } catch (e) {
      setStatus(`预览加载失败: ${e}`);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    void invoke<TextFilterStatus>("text_filter_status").then(setAiStatus).catch(() => undefined);
  }, [load]);

  /** 一键落库（复用 session_to_note；AI 判定结果回传保持预览一致——REQ-081） */
  const saveToNote = async () => {
    try {
      const note = await invoke<{ id: number }>("session_to_note", {
        id: sessionId,
        aiDecisions: aiDecisions.length > 0 ? aiDecisions : null,
      });
      setStatus(`已转为笔记 #${note.id}`);
    } catch (e) {
      setStatus(`落库失败: ${e}`);
    }
  };

  /** AI 复核（REQ-085）：授权确认 → 云端三态判定 → 就地更新预览 */
  const aiReview = async () => {
    const enabled = aiStatus?.enabled;
    if (!enabled) {
      setStatus("AI 复核未启用（需配置 SILICONFLOW_API_KEY 与 AI_TEXT_FILTER_ENABLED）");
      return;
    }
    const count = preview?.filtered.length ?? 0;
    if (!window.confirm(`将发送 ${count} 段边界文本至 SiliconFlow（模型 ${aiStatus?.model}）进行删除/保留/合并判定。是否继续？`)) {
      setStatus("已取消（预览保持纯规则结果）");
      return;
    }
    setAiBusy(true);
    setStatus("");
    try {
      const review = await invoke<TextFilterReview>("review_text_filter", {
        sessionId,
        authorized: true,
      });
      setPreview(review.result);
      setAiMeta(review.ai);
      setAiDecisions(review.decisions);
      const meta = review.ai;
      setStatus(
        meta.error
          ? `AI 复核降级（纯规则结果原样输出）: ${meta.error}`
          : `AI 复核完成：送审 ${meta.sent}/${meta.candidates} 段${meta.quota_hit ? "（今日配额耗尽，余段未送审）" : ""}`
      );
    } catch (e) {
      setStatus(`AI 复核失败: ${e}`);
    } finally {
      setAiBusy(false);
    }
  };

  if (!preview) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 16 }}>{status || "加载预览中…"}</p>;
  }

  const stats = preview.stats;
  return (
    <div>
      {/* 过滤统计卡 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {[
          ["UI 垃圾", stats.ui_junk, "#dc2626"],
          ["重复", stats.duplicates, "#b45309"],
          ["碎片", stats.fragments, "#6b7280"],
          ["低置信", stats.low_confidence, "#7c3aed"],
          ["AI 判删", stats.ai_delete, "#2563eb"],
        ].map(([label, count, color]) => (
          <span
            key={label as string}
            style={{ fontSize: 11, color: color as string, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "2px 8px" }}
          >
            {label} {count as number}
          </span>
        ))}
        <span style={{ fontSize: 11, color: "#6b7280", alignSelf: "center" }}>
          保留 {preview.kept.length} 段 · 画面要点 {preview.ocr_points.length} 条
        </span>
      </div>

      {/* 操作行：AI 复核 + 一键落库 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          style={{ ...btn, borderRadius: 6, border: "1px solid #a5b4fc", color: "#3730a3", background: "#eef2ff" }}
          onClick={() => void aiReview()}
          disabled={aiBusy}
        >
          {aiBusy ? "⏳ AI 复核中…" : "✨ AI 复核"}
        </button>
        <button
          style={{ ...btn, borderRadius: 6, background: "#0d9488", color: "#fff", border: "none" }}
          onClick={() => void saveToNote()}
        >
          📝 一键落库
        </button>
        <button
          style={{ ...btn, borderRadius: 6, border: "1px solid #e5e7eb" }}
          onClick={() => setShowFiltered((v) => !v)}
        >
          {showFiltered ? "收起被过滤对照" : `被过滤对照（${preview.filtered.length}）`}
        </button>
      </div>
      {status && <p style={{ fontSize: 12, color: "#2563eb", marginBottom: 6 }}>{status}</p>}
      {aiMeta && (
        <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
          模型 {aiMeta.model} · 候选 {aiMeta.candidates} · 送审 {aiMeta.sent}
          {aiMeta.quota_hit ? " · 配额耗尽" : ""}
        </p>
      )}

      {/* 过滤后笔记正文 */}
      <div
        style={{ fontSize: 13, lineHeight: 1.6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.markdown) }}
      />

      {/* 被过滤内容对照（可复查误杀——来源定位原料） */}
      {showFiltered && (
        <div style={{ marginTop: 10, border: "1px solid #fee2e2", borderRadius: 8, padding: 10, background: "#fff7f7" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", marginBottom: 6 }}>
            被过滤内容（原料层未动——如属误杀请在产物/笔记中人工补回）
          </div>
          {preview.filtered.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>无被过滤内容</p>
          )}
          {preview.filtered.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 3 }}>
              <span style={{ color: "#b91c1c", marginRight: 6 }}>[{REASON_LABEL[f.reason] ?? f.reason}]</span>
              <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                {Math.floor(f.start_ms / 1000 / 60)}:{String(Math.floor(f.start_ms / 1000) % 60).padStart(2, "0")}
              </span>{" "}
              {f.text}
            </div>
          ))}
          {preview.merged.length > 0 && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              合并 {preview.merged.length} 处（重复段/AI merge——展示层拼接，原料按原始段）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
