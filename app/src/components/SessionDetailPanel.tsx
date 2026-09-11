/**
 * SessionDetailPanel — 会话详情面板（原料 / 笔记预览两视图；v0.11.5 产物视图下线）。
 *
 * @ai-context: v0.7.1 自 SessionsPage 拆出（豁免清单登记拆分计划）——质量报告、
 *              大纲、视图模式为面板内部状态（仅依赖 sessionId），与列表页解耦，
 *              列表页聚焦管理操作（筛选/批量/转化）。
 * @ai-context: REQ-031（融合停止异步化）：fusing 时显示"融合中"标记，
 *              session:fused 到达后父层自动刷新 detail 重挂本面板。
 * @ai-context: REQ-080 降级分级：live:asr-degraded 一次性横幅（父层透传）。
 * @ai-context: v0.11.5（spec 5️⃣）：产物视图下线（ArtifactView 删除）——课后精修
 *              入口迁移到面板层；进入原料视图懒触发 auto_refine_session（幂等：
 *              已精修屏跳过），session:refined 事件驱动重新拉详情（屏卡 rendered 回填），
 *              refine-skipped 徽标提示（模型未下载降级链）。
 */
import { useEffect, useState } from "react";
import { useSessionDetailData } from "../hooks/useSessionDetailData";
import SessionDetailHeader from "./session-detail/SessionDetailHeader";
import SessionRefineSection from "./session-detail/SessionRefineSection";
import SessionScreenCards from "./session-detail/SessionScreenCards";
import ImageGallery from "../components/ImageGallery";
import NotePreviewView from "../components/NotePreviewView";
import ProofreadPanel from "../components/ProofreadPanel";
import SecondPassPanel from "../components/SecondPassPanel";
import WebArticleView from "../components/WebArticleView";
import SpeakerSwitchCard from "../components/SpeakerSwitchCard";
import type { SessionDetail } from "../types";
import { fmtMs } from "../utils/fmt";

/** 通用小按钮基础样式（视图切换组与精修工具条复用） */
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const SOURCE_LABEL: Record<string, string> = {
  subtitle: "字幕",
  asr: "语音",
  fused: "融合",
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
  /** 重新拉详情（v0.11.5：session:refined 事件驱动屏卡结构回填） */
  onRefreshDetail: (id: number) => void;
  /** v0.16.1：工作台深链任务 id（对话页任务视图跳转——自动切预览视图并展开工作台） */
  autoRefineTaskId?: number | null;
  /** v0.16.1：autoTaskId 消费完成回调（App 清空 focus——防陈旧值跨导航复触发） */
  onAutoTaskConsumed?: () => void;
  /** v0.16.1：精修任务启动回调（→ AI 对话页） */
  onRefineTaskStarted?: (sessionId: number, taskId: number) => void;
}

export default function SessionDetailPanel({ detail, fusing, degradedBanner, onToNote, onRemove, onRefreshDetail, autoRefineTaskId, onAutoTaskConsumed, onRefineTaskStarted }: Props) {
  // v0.5.0 M7（REQ-052）+ v0.6.0 M6（REQ-081）：两视图（v0.11.5 产物视图下线）
  const [viewMode, setViewMode] = useState<"raw" | "preview">("raw");
  const sessionId = detail.session.id;
  // v0.5.0 M7：会话切换回到原料视图（裁决 D1：viewMode 状态留面板；数据面重置见 useSessionDetailData）
  useEffect(() => { setViewMode("raw"); }, [sessionId]);
  // 数据面（质量/术语/baseUrl/屏→OCR 分组）+ 精修链路（懒触发/事件监听/手动入口/深链快照）
  const { quality, glossary, baseUrl, ocrBlocksByScreen, refining, refineMsg, deepTaskId, setDeepTaskId, startRefine } =
    useSessionDetailData({ detail, viewMode, onRefreshDetail });
  // REQ-282（v0.19.6）：标题行内改名 —— 连同改名状态与提交逻辑拆至 session-detail/SessionDetailHeader.tsx
  // v0.20.2（REQ-268）：离线精修（第二遍）裁决面板显隐（会话切换即关）
  const [showPass2, setShowPass2] = useState(false);
  useEffect(() => setShowPass2(false), [sessionId]);
  // v0.20.2（REQ-270）：LLM 文本校对面板显隐（会话切换即关）
  const [showProofread, setShowProofread] = useState(false);
  useEffect(() => setShowProofread(false), [sessionId]);

  // v0.16.1：工作台深链——autoTaskId 到达即切预览视图（精修卡所在视图——原默认 raw）。
  // 深链快照（deepTaskId）由 useSessionDetailData 持有：App 侧 focus 清空发生在本面板
  // effect 之后，若直接透传 prop 会在卡片挂载前被置空（竞态——工作台永不展开）；
  // 快照 + 会话切换清除保证"只消费一次、不跨会话遗留"。切换 effect 按裁决 D1 留面板。
  useEffect(() => {
    if (autoRefineTaskId != null) {
      setDeepTaskId(autoRefineTaskId);
      setViewMode("preview");
      onAutoTaskConsumed?.();
    }
  }, [autoRefineTaskId, onAutoTaskConsumed, setDeepTaskId]);

  // v0.20.4（REQ-303）：web 会话专用详情（文章阅读 + 元数据回链 + 转笔记；
  // 无时间轴/屏卡/精修面——h2 标题即页标题，改名在会话列表进行）
  if (detail.session.kind === "web") {
    return (
      <div style={{ padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>{detail.session.title}</h2>
          <span style={{ fontSize: 11, color: "#0d9488", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "1px 8px" }}>
            web 采集
          </span>
        </div>
        <WebArticleView sessionId={sessionId} onToNote={onToNote} onRemove={onRemove} />
      </div>
    );
  }

  return (
    <>
      {/* 降级横幅 + 详情头（改名/状态行/融合中徽标/操作）—— 拆至 session-detail/SessionDetailHeader.tsx */}
      <SessionDetailHeader
        detail={detail}
        fusing={fusing}
        degradedBanner={degradedBanner}
        onToNote={onToNote}
        onRemove={onRemove}
        onRefreshDetail={onRefreshDetail}
      />

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

      {/* v0.7.2（REQ-153）：讲者切换（弱化版说话人分离——懒加载幂等；
          v0.12.1：图文会话跳过（无音频，不再误报红色错误）） */}
      <SpeakerSwitchCard sessionId={sessionId} kind={detail.session.kind} />

      {/* 两视图切换（原料 / 笔记预览——REQ-081；v0.11.5 产物视图下线） */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {(
          [
            ["raw", "原料视图"],
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
        {/* v0.11.5（spec 5️⃣）+ v0.20.2（REQ-268/270）：精修工具条三按钮
            —— 拆至 session-detail/SessionRefineSection.tsx（refineMsg 提示行与两裁决面板
            挂载保留原位，DOM 顺序逐字不变） */}
        <SessionRefineSection
          refining={refining}
          onStartRefine={startRefine}
          canSecondPass={detail.session.status === "finished" && detail.session.kind !== "photo"}
          onOpenPass2={() => setShowPass2(true)}
          onOpenProofread={() => setShowProofread(true)}
        />
      </div>
      {refineMsg && (
        <div style={{ fontSize: 11, color: refining ? "#b45309" : "#0d9488", marginBottom: 6 }}>
          {refining ? "⏳ " : ""}{refineMsg}
        </div>
      )}

      {viewMode === "preview" ? (
        <NotePreviewView
          sessionId={sessionId}
          autoTaskId={deepTaskId}
          onTaskStarted={onRefineTaskStarted}
        />
      ) : (
        <>
          {/* 转写时间轴（字幕为主，语音/融合弱化；段 id 锚点供大纲/搜索跳转） */}
          <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>转写时间轴</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* v0.11.7：图文会话空态语义区分（无讲述内容）；其余会话维持原文案 */}
            {detail.segments.length === 0 && (
              <p style={{ fontSize: 12, color: "#9ca3af" }}>
                {detail.session.kind === "photo" ? "本会话无讲述内容（图文采集）" : "本会话无转写段"}
              </p>
            )}
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

          {/* 画面要点屏卡流（v0.7.3 区间/标题/正文/标签/配图/结构徽标 + v0.7.7 框选截取）
              —— 拆至 session-detail/SessionScreenCards.tsx（toast/框选状态随之下沉） */}
          <SessionScreenCards
            sessionId={sessionId}
            kind={detail.session.kind}
            screens={detail.screens}
            ocrBlockCount={detail.ocr_blocks.length}
            baseUrl={baseUrl}
            ocrBlocksByScreen={ocrBlocksByScreen}
          />

          {/* 术语表（v0.11.5 spec 8️⃣：词汇表移出笔记 → 会话详情展示；
              分析层 glossary 产出——画面高频 × 语音低频交叉，score 降序） */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>📖 术语表</h3>
          <details
            style={{
              fontSize: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 10px",
              background: "#fafafa",
              marginBottom: 8,
            }}
          >
            <summary style={{ cursor: "pointer", color: "#0f766e", fontWeight: 600 }}>
              {glossary === null
                ? "加载中…"
                : glossary.length === 0
                  ? "无术语（画面高频 × 语音低频未命中）"
                  : `${glossary.length} 条（画面高频 × 语音低频）`}
            </summary>
            {glossary !== null && glossary.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                {glossary.map((g) => (
                  <div key={g.term} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, color: "#111827" }}>{g.term}</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      画面 ×{g.ocrCount} / 语音 ×{g.asrCount}
                    </span>
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
                      分 {g.score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </details>

          {/* 参考图集（v0.5.0 M6：REQ-051 三层图结构） */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>参考图集</h3>
          <ImageGallery sessionId={sessionId} />
        </>
      )}

      {/* v0.20.2（REQ-268）：离线精修（第二遍）裁决面板 */}
      {showPass2 && <SecondPassPanel sessionId={sessionId} onClose={() => setShowPass2(false)} />}
      {/* v0.20.2（REQ-270）：LLM 文本校对面板 */}
      {showProofread && (
        <ProofreadPanel sessionId={sessionId} onClose={() => setShowProofread(false)} />
      )}
    </>
  );
}
