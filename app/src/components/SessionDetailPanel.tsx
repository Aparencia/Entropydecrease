/**
 * SessionDetailPanel — 会话详情面板（原料 / 产物 / 笔记预览三视图）。
 *
 * @ai-context: v0.7.1 自 SessionsPage 拆出（豁免清单登记拆分计划）——质量报告、
 *              大纲、视图模式为面板内部状态（仅依赖 sessionId），与列表页解耦，
 *              列表页聚焦管理操作（筛选/批量/转化）。
 * @ai-context: REQ-031（融合停止异步化）：fusing 时显示"融合中"标记，
 *              session:fused 到达后父层自动刷新 detail 重挂本面板。
 * @ai-context: REQ-080 降级分级：live:asr-degraded 一次性横幅（父层透传）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ArtifactView from "../components/ArtifactView";
import ImageGallery from "../components/ImageGallery";
import NotePreviewView from "../components/NotePreviewView";
import SpeakerSwitchCard from "../components/SpeakerSwitchCard";
import type { OutlineEntry, QualityReport, SessionDetail } from "../types";
import { fmtMs } from "../utils/fmt";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const SOURCE_LABEL: Record<string, string> = {
  subtitle: "字幕",
  asr: "语音",
  fused: "融合",
};
const STATUS_LABEL: Record<string, string> = {
  recording: "录制中",
  finished: "已完成",
  failed: "异常中断",
};

interface Props {
  detail: SessionDetail;
  /** 本会话是否融合中（父层 fusingId === detail.session.id） */
  fusing: boolean;
  /** 关键降级一次性横幅（null=无） */
  degradedBanner: string | null;
  /** 转为笔记（父层负责 toast 反馈与列表刷新） */
  onToNote: (id: number) => void;
  /** 删除会话（父层负责确认/反馈/刷新） */
  onRemove: (id: number) => void;
}

export default function SessionDetailPanel({ detail, fusing, degradedBanner, onToNote, onRemove }: Props) {
  // v0.5.0 M7（REQ-052）+ v0.6.0 M6（REQ-081）：三视图
  const [viewMode, setViewMode] = useState<"raw" | "artifact" | "preview">("raw");
  // M6（REQ-076）：质量报告（可信度总览卡片）
  const [quality, setQuality] = useState<QualityReport | null>(null);
  // M6（REQ-077）：大纲（产物视图侧边导航）
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const sessionId = detail.session.id;

  // 质量报告 + 大纲随详情加载（失败不阻断详情展示）
  useEffect(() => {
    setQuality(null);
    setOutline([]);
    setViewMode("raw");
    void invoke<QualityReport>("session_quality_report", { id: sessionId })
      .then(setQuality)
      .catch(() => undefined);
    void invoke<OutlineEntry[]>("session_outline", { id: sessionId })
      .then(setOutline)
      .catch(() => undefined);
  }, [sessionId]);

  return (
    <>
      {degradedBanner && (
        <div
          style={{
            fontSize: 12,
            color: "#b45309",
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            borderRadius: 6,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          ⚠ {degradedBanner}（恢复后自动消失）
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{detail.session.title}</h2>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          {STATUS_LABEL[detail.session.status]} · {detail.segments.length} 段转写 ·{" "}
          {detail.ocr_blocks.length} 块画面
        </span>
        {fusing && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #f59e0b",
              borderRadius: 10,
              padding: "2px 8px",
            }}
          >
            ⏳ 融合中（字幕/语音轴将自动升级）
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }}
            onClick={() => onToNote(sessionId)}
          >
            📝 转为笔记
          </button>
          <button style={btn} onClick={() => onRemove(sessionId)}>
            删除
          </button>
        </div>
      </div>

      {/* M6（REQ-076）：可信度总览卡片 */}
      {quality && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {(
            [
              ["低置信段", quality.low_confidence_count, quality.low_confidence_count > 0 ? "#dc2626" : "#6b7280"],
              ["OCR 低分", quality.low_score_ocr_count, "#b45309"],
              ["unknown 区", quality.unknown_region_count, "#7c3aed"],
              ["AI 复核候选", quality.ai_candidate_count, "#2563eb"],
            ] as const
          ).map(([label, count, color]) => (
            <span
              key={label}
              style={{
                fontSize: 11,
                color,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "2px 8px",
              }}
            >
              {label} {count}
            </span>
          ))}
          {quality.low_confidence_segments.length > 0 && (
            <details style={{ fontSize: 11, color: "#6b7280" }}>
              <summary style={{ cursor: "pointer" }}>低置信列表（{quality.low_confidence_segments.length}）</summary>
              {quality.low_confidence_segments.map((s) => (
                <div key={s.segment_id} style={{ marginTop: 3 }}>
                  [{fmtMs(s.start_ms)}] {s.text}（{s.confidence.toFixed(2)}）
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {/* v0.7.2（REQ-153）：讲者切换（弱化版说话人分离——懒加载幂等） */}
      <SpeakerSwitchCard sessionId={sessionId} />

      {/* 三视图切换（原料 / 产物 / 笔记预览——REQ-081） */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(
          [
            ["raw", "原料视图"],
            ["artifact", "产物视图"],
            ["preview", "笔记预览"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              ...btn,
              borderRadius: 6,
              border: viewMode === mode ? "1px solid #0d9488" : "1px solid #e5e7eb",
              background: viewMode === mode ? "#ccfbf1" : "#fff",
              color: viewMode === mode ? "#0f766e" : "#374151",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === "preview" ? (
        <NotePreviewView sessionId={sessionId} />
      ) : viewMode === "artifact" ? (
        <div style={{ display: "flex", gap: 12 }}>
          {/* M6（REQ-077）：大纲侧边导航（点击跳转时间轴） */}
          {outline.length > 0 && (
            <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid #e5e7eb", paddingRight: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0f766e", marginBottom: 6 }}>📑 大纲</div>
              {outline.map((o, i) => (
                <div
                  key={i}
                  onClick={() =>
                    document.getElementById(`ocr-${sessionId}-${o.time_ms}`)?.scrollIntoView({ block: "center" })
                  }
                  style={{ fontSize: 12, color: "#374151", cursor: "pointer", padding: "3px 0", borderBottom: "1px dashed #f3f4f6" }}
                  title={`${fmtMs(o.time_ms)}`}
                >
                  <span style={{ color: "#9ca3af", marginRight: 4, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMs(o.time_ms)}
                  </span>
                  {o.text}
                </div>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <ArtifactView sessionId={sessionId} />
          </div>
        </div>
      ) : (
        <>
          {/* 转写时间轴（字幕为主，语音/融合弱化；段 id 锚点供大纲/搜索跳转） */}
          <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>转写时间轴</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {detail.segments.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无转写段</p>}
            {detail.segments.map((seg) => (
              <div key={seg.id} id={`seg-${sessionId}-${seg.id}`} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "#9ca3af", width: 70, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmtMs(seg.start_ms)} – {fmtMs(seg.end_ms)}
                </span>
                <span style={{ fontSize: 11, flexShrink: 0, color: seg.source === "subtitle" ? "#0d9488" : "#9ca3af", width: 36 }}>
                  {SOURCE_LABEL[seg.source] ?? seg.source}
                </span>
                <span style={{ fontSize: 13, color: seg.source === "fused" ? "#b45309" : "#374151" }}>{seg.text}</span>
              </div>
            ))}
          </div>

          {/* 画面要点 */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>画面要点（OCR）</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {detail.ocr_blocks.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无画面识别内容</p>}
            {detail.ocr_blocks.map((b) => (
              <div key={b.id} id={`ocr-${sessionId}-${b.timestamp_ms}`} style={{ fontSize: 12, color: "#4b5563" }}>
                <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>[{fmtMs(b.timestamp_ms)}]</span>{" "}
                {b.text}
                {b.region === "subtitle" && <span style={{ color: "#0d9488", marginLeft: 4 }}>字幕</span>}
              </div>
            ))}
          </div>

          {/* 参考图集（v0.5.0 M6：REQ-051 三层图结构） */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>参考图集</h3>
          <ImageGallery sessionId={sessionId} />
        </>
      )}
    </>
  );
}
