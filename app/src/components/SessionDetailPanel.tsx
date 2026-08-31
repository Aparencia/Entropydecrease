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
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import BoxSelectOverlay from "../components/BoxSelectOverlay";
import ImageGallery from "../components/ImageGallery";
import NotePreviewView from "../components/NotePreviewView";
import SpeakerSwitchCard from "../components/SpeakerSwitchCard";
import type { GlossaryTerm, QualityReport, SessionDetail, SessionOcrBlock } from "../types";
import { fmtMs } from "../utils/fmt";

/** 精修进度载荷（Rust RefineProgress；v0.11.5 事件驱动屏卡回填） */
interface RefineProgressPayload {
  done: number;
  total: number;
  currentKind: string;
}

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
  // M6（REQ-076）：质量报告（可信度总览卡片）
  const [quality, setQuality] = useState<QualityReport | null>(null);
  // v0.11.5（spec 8️⃣）：术语表（词汇表移出笔记 → 会话详情直供；null=加载中）
  const [glossary, setGlossary] = useState<GlossaryTerm[] | null>(null);
  // v0.7.3（REQ-160）：屏卡配图 baseUrl（图集同款：convertFileSrc 拼本地路径）
  const [baseUrl, setBaseUrl] = useState("");
  // v0.7.7（REQ-184）：框选截取状态（first_seen_ms 标识屏）+ 保存反馈
  const [selectingScreen, setSelectingScreen] = useState<number | null>(null);
  // M2 修复：toast 携带屏键（first_seen_ms）——原单一 string 在 screens.map 内渲染导致 N 屏同显，
  // 现仅匹配屏渲染（改动最小方案：保持原位展示，不提升到列表外）
  const [panelToast, setPanelToast] = useState<{ screenKey: number; msg: string } | null>(null);
  const panelToastTimerRef = useRef<number | null>(null);
  // v0.11.5（spec 5️⃣）：课后精修状态（精修中/完成/跳过——面板层徽标，自 ArtifactView 迁移）
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState("");
  // 懒触发防重（每会话只触发一次；sessionId 变化重置）
  const autoRefinedRef = useRef<Set<number>>(new Set());
  const onRefreshDetailRef = useRef(onRefreshDetail);
  onRefreshDetailRef.current = onRefreshDetail;
  const sessionId = detail.session.id;

  // toast 定时器卸载清理（防卸载后 setState）
  useEffect(
    () => () => {
      if (panelToastTimerRef.current) window.clearTimeout(panelToastTimerRef.current);
    },
    [],
  );

  /** 面板内单屏 toast（4s 自动消失；新消息重置计时） */
  const showPanelToast = (screenKey: number, msg: string) => {
    setPanelToast({ screenKey, msg });
    if (panelToastTimerRef.current) window.clearTimeout(panelToastTimerRef.current);
    panelToastTimerRef.current = window.setTimeout(() => setPanelToast(null), 4000);
  };

  // M7 修复：屏→OCR 块分组预构建（原 screens.map 内逐屏 filter 为 O(n×m)）——
  // 排序后双指针一次遍历归组；屏区间不重叠，与原 filter 语义一致
  const ocrBlocksByScreen = useMemo(() => {
    const map = new Map<number, SessionOcrBlock[]>();
    for (const s of detail.screens) map.set(s.first_seen_ms, []);
    const screens = [...detail.screens].sort((a, b) => a.first_seen_ms - b.first_seen_ms);
    const blocks = [...detail.ocr_blocks].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    let si = 0;
    for (const b of blocks) {
      // 块时间戳单调递增——跳过已结束的屏（last_seen_ms < ts）
      while (si < screens.length && screens[si].last_seen_ms < b.timestamp_ms) si++;
      if (si < screens.length && b.timestamp_ms >= screens[si].first_seen_ms) {
        map.get(screens[si].first_seen_ms)?.push(b);
      }
    }
    return map;
  }, [detail]);

  // 质量报告 + 术语表随详情加载（v0.11.5：大纲随产物视图下线；失败不阻断详情展示）
  useEffect(() => {
    setQuality(null);
    setGlossary(null);
    setViewMode("raw");
    void invoke<QualityReport>("session_quality_report", { id: sessionId })
      .then(setQuality)
      .catch(() => undefined);
    void invoke<GlossaryTerm[]>("session_glossary", { id: sessionId })
      .then(setGlossary)
      .catch(() => setGlossary([]));
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
  }, [sessionId]);

  // v0.11.5（spec 5️⃣）：课后精修懒自动化——原料视图首次进入自动触发
  // （每会话仅一次：autoRefinedRef 防重；停止后触发通道已覆盖刚停止的会话——
  // 双通道共享 run_refine 幂等过滤，不会重复推理）
  useEffect(() => {
    if (viewMode !== "raw") return;
    if (autoRefinedRef.current.has(sessionId)) return;
    autoRefinedRef.current.add(sessionId);
    void invoke<string>("auto_refine_session", { sessionId })
      .then((msg) => {
        // no-pending=无待精修结构区域（静默）；started=后台精修启动（事件驱动刷新）；
        // 其他（模型未下载等）= 降级提示徽标
        if (msg !== "no-pending" && msg !== "started") setRefineMsg(msg);
      })
      .catch(() => undefined);
  }, [viewMode, sessionId]);

  // v0.16.1：工作台深链——autoTaskId 到达即切预览视图（精修卡所在视图——原默认 raw）。
  // 面板内持有深链快照（deepTaskId）供 NotePreviewView/AiRefineCard 消费：App 侧
  // focus 清空发生在本面板 effect 之后，若直接透传 prop 会在卡片挂载前被置空
  // （竞态——工作台永不展开）；快照 + 会话切换清除保证"只消费一次、不跨会话遗留"。
  const [deepTaskId, setDeepTaskId] = useState<number | null>(null);
  useEffect(() => { setDeepTaskId(null); }, [sessionId]);
  useEffect(() => {
    if (autoRefineTaskId != null) {
      setDeepTaskId(autoRefineTaskId);
      setViewMode("preview");
      onAutoTaskConsumed?.();
    }
  }, [autoRefineTaskId, onAutoTaskConsumed]);

  // v0.11.5（spec 5️⃣）：精修事件监听（自 ArtifactView 迁移）——
  // refining 进度 → refined 重新拉详情（屏卡 rendered 回填）→ skipped/failed 徽标
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<RefineProgressPayload>("session:refining", (e) => {
        setRefining(true);
        setRefineMsg(`精修中：${e.payload.currentKind} ${e.payload.done}/${e.payload.total}`);
      }),
      listen<RefineProgressPayload>("session:refined", (e) => {
        setRefining(false);
        setRefineMsg(`精修完成：${e.payload.done} 区域已升级为模型版`);
        // 事件驱动屏卡实时回填：重新拉详情（父层受控 detail）
        onRefreshDetailRef.current(sessionId);
      }),
      listen<string>("session:refine-skipped", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
      listen<string>("session:refine-failed", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {/* v0.11.5（spec 5️⃣）：课后精修入口迁移到面板层（与懒触发同命令，幂等防重） */}
        <button
          style={{ ...btn, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", marginLeft: "auto" }}
          onClick={() => {
            setRefining(true);
            setRefineMsg("精修启动中…");
            void invoke<string>("auto_refine_session", { sessionId })
              .then((msg) => {
                if (msg === "no-pending") {
                  setRefining(false);
                  setRefineMsg("无待精修结构区域（表格/公式）");
                } else if (msg !== "started") {
                  setRefining(false);
                  setRefineMsg(msg);
                }
              })
              .catch((e) => {
                setRefining(false);
                setRefineMsg(`精修失败: ${e}`);
              });
          }}
          disabled={refining}
        >
          {refining ? "精修中…" : "🔬 课后精修"}
        </button>
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

          {/* 画面要点（v0.7.3 屏卡流：区间+标题+正文+标签+配图+结构徽标；可展开块级明细复查）
              v0.12.0 M5 补完成：视频会话（kind≠photo）画面要点 = 关键帧纯图（无 OCR 文字）；
              图文会话（kind=photo）保持 OCR 文本屏 —— 头部文案与原始块提示随类型分派 */}
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>
            {detail.session.kind === "photo" ? "画面要点（OCR）" : "画面要点（关键帧纯图）"} · {detail.screens.length} 屏
            <span style={{ color: "#9ca3af", fontWeight: 400 }}>
              {detail.screens.length === 0 || detail.session.kind !== "photo" ? "" : `（原始 ${detail.ocr_blocks.length} 块）`}
            </span>
          </h3>
          {detail.screens.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af" }}>
              {detail.session.kind === "photo" ? "本会话无画面识别内容" : "本会话无关键帧图"}
            </p>
          )}
          {detail.screens.map((s, i) => {
            // 块级明细（原料复查）：预构建分组直取（M7：替代逐屏 O(n×m) filter）
            const raw = ocrBlocksByScreen.get(s.first_seen_ms) ?? [];
            return (
              <div
                key={s.first_seen_ms}
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
                    {/* M2：仅匹配屏渲染 toast（screenKey=first_seen_ms） */}
                    {panelToast && panelToast.screenKey === s.first_seen_ms && (
                      <div style={{ fontSize: 11, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
                        {panelToast.msg}
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
                            // 定时消失逻辑收敛到 showPanelToast（ref 持有 + 卸载清理）
                            showPanelToast(s.first_seen_ms, "✓ 已保存为结构图（见图集「结构图」区段）");
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
                          setPanelToast(null);
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
    </>
  );
}
