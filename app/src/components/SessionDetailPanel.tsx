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
import { convertFileSrc } from "@tauri-apps/api/core";
import ArtifactView from "../components/ArtifactView";
import BoxSelectOverlay from "../components/BoxSelectOverlay";
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
  // v0.7.3（REQ-160）：屏卡配图 baseUrl（图集同款：convertFileSrc 拼本地路径）
  const [baseUrl, setBaseUrl] = useState("");
  // v0.7.7（REQ-184）：框选截取状态（first_seen_ms 标识屏）+ 保存反馈
  const [selectingScreen, setSelectingScreen] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState("");
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
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
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

          {/* 画面要点（v0.7.3 屏卡流：区间+标题+正文+标签+配图+结构徽标；可展开块级明细复查） */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>
            画面要点（OCR）· {detail.screens.length} 屏
            <span style={{ color: "#9ca3af", fontWeight: 400 }}>
              {detail.screens.length === 0 ? "" : `（原始 ${detail.ocr_blocks.length} 块）`}
            </span>
          </h3>
          {detail.screens.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无画面识别内容</p>
          )}
          {detail.screens.map((s, i) => {
            // 块级明细（原料复查）：屏时间区间内的原始块
            const raw = detail.ocr_blocks.filter(
              (b) => b.timestamp_ms >= s.first_seen_ms && b.timestamp_ms <= s.last_seen_ms,
            );
            return (
              <div
                key={i}
                id={`ocr-${sessionId}-${s.first_seen_ms}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 8,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 11, color: "#0f766e", fontWeight: 600, marginBottom: 4 }}>
                  📄 屏 {s.screen_id ?? i + 1} · {fmtMs(s.first_seen_ms)} – {fmtMs(s.last_seen_ms)}
                  {s.structure.length > 0 &&
                    s.structure.map((st, j) => (
                      <span key={j} style={{ marginLeft: 8, color: "#7c3aed" }}>
                        {st.kind === "table" ? "📊" : st.kind === "formula" ? "∑" : "⟨code⟩"} {st.kind}
                      </span>
                    ))}
                </div>
                {s.title && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                    {s.title}
                  </div>
                )}
                {s.body.map((b, j) => (
                  <div key={j} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.6 }}>
                    {b}
                  </div>
                ))}
                {s.labels.length > 0 && (
                  <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 3 }}>
                    标签：{s.labels.join(" · ")}
                  </div>
                )}
                {s.structure.length > 0 && (
                  <div style={{ fontSize: 11.5, color: "#7c3aed", marginTop: 3 }}>
                    {s.structure.map((st, j) => (
                      <div key={j}>[{st.kind}] {st.rendered ?? st.text.slice(0, 60)}</div>
                    ))}
                  </div>
                )}
                {s.image_ref && baseUrl && (
                  <div style={{ marginTop: 6 }}>
                    {toastMsg && (
                      <div style={{ fontSize: 11, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
                        {toastMsg}
                      </div>
                    )}
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={convertFileSrc(`${baseUrl}/${s.image_ref}`)}
                        alt={`屏 ${i + 1}`}
                        loading="lazy"
                        style={{
                          maxWidth: 260,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                          display: "block",
                        }}
                      />
                      {/* v0.7.7（REQ-184）：屏卡全帧图框选截取（无图屏不出现按钮） */}
                      {selectingScreen === s.first_seen_ms && (
                        <BoxSelectOverlay
                          src={convertFileSrc(`${baseUrl}/${s.image_ref}`)}
                          sessionId={sessionId}
                          firstSeenMs={s.first_seen_ms}
                          onDone={() => {
                            setSelectingScreen(null);
                            setToastMsg("✓ 已保存为结构图（见图集「结构图」区段）");
                            setTimeout(() => setToastMsg(""), 4000);
                          }}
                          onCancel={() => setSelectingScreen(null)}
                        />
                      )}
                    </div>
                    <div>
                      <button
                        style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", marginTop: 4 }}
                        onClick={() => {
                          setSelectingScreen(s.first_seen_ms);
                          setToastMsg("");
                        }}
                        title="拖框截取此屏中的流程图/图表等非线性结构为结构图"
                      >
                        ✂ 框选截取
                      </button>
                    </div>
                  </div>
                )}
                {raw.length > 0 && (
                  <details style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                    <summary style={{ cursor: "pointer" }}>块级明细（{raw.length} 块，可复查误合并）</summary>
                    {raw.map((b) => (
                      <div key={b.id}>
                        [{fmtMs(b.timestamp_ms)}] {b.text}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            );
          })}

          {/* 参考图集（v0.5.0 M6：REQ-051 三层图结构） */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>参考图集</h3>
          <ImageGallery sessionId={sessionId} />
        </>
      )}
    </>
  );
}
