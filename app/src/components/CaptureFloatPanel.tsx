/**
 * CaptureFloatPanel — 采集浮窗（v0.12.0 M6，采集体验债；v0.12.3 交互升级）。
 *
 * @ai-context: 采集中全屏看视频时主面板被遮挡——常驻悬浮小窗（alwaysOnTop）
 *              顶部状态/时长、中部最近转写、底部最近画面要点、控制按钮。
 *              与主面板共用 useLiveSessionEvents hook（同一 live:* 数据流）。
 * @ai-context: v0.12.3 双形态：面板（360×240 全功能）⇄ 字幕条（360×44 只读
 *              展示，Esc 切换）；点击穿透锁定后只读悬浮（解锁路径在主窗）。
 *              窗口级行为（拖拽/吸附/持久化/锁定/置顶/透明度）在
 *              useFloatWindow hook；几何纯函数在 utils/floatWindow.ts。
 * @ai-context: 控制按钮走真实命令（暂停/继续/停止/回主窗）；"标记"无后端命令，
 *              按 YAGNI 不预排虚假按钮。
 *
 * @line-limit-exemption: 浮窗内容密度高（360×240 内状态/转写/画面/控制分区 +
 *              双形态渲染），登记 docs/standards/line-limit-exemptions.md。
 */
import { invoke } from "@tauri-apps/api/core";
import { useLiveSessionEvents } from "../hooks/useLiveSessionEvents";
import { useFloatWindow } from "../hooks/useFloatWindow";

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const btn: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  flex: 1,
};
const iconBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 11,
  padding: "0 2px",
  color: "#6b7280",
};

/** 最近展示条数（360×240 浮窗——只给最近 3 条转写 + 2 条画面） */
const SHOW_TRANSCRIPT = 3;
const SHOW_OCR = 2;

export default function CaptureFloatPanel() {
  const { phase, transcripts, partials, counts, ocrLines, elapsedMs, info } =
    useLiveSessionEvents();
  const { snapshot, mode, opacity, setViewMode, updateOpacity, startDrag, toggleLocked, toggleTopmost, backToMain } =
    useFloatWindow();
  const paused = phase.startsWith("⏸");

  const togglePause = () => {
    void invoke(paused ? "resume_live_session" : "pause_live_session").catch((e) =>
      console.warn("[capture-float] 暂停/继续失败:", e),
    );
  };
  const stop = () => {
    void invoke("stop_live_session")
      .catch((e) => console.warn("[capture-float] 停止采集失败:", e))
      .then(() => void invoke("close_capture_float").catch(() => undefined));
  };

  /** 拖拽只在空白处触发（按钮/滑杆不劫持鼠标） */
  const dragIfBlank = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("button,input") == null) startDrag();
  };

  const shrinkToBar = () => setViewMode("bar");
  const expandToPanel = () => setViewMode("panel");

  /** 形态无关的状态行（面板头部/字幕条共用子元素） */
  const lastLine = transcripts.slice(-1)[0]?.text ?? partials.slice(-1)[0]?.text ?? "等待识别…";

  if (mode === "bar") {
    // 字幕条形态：只读近况，不遮挡窗口化视频（支持点击穿透锁定）
    return (
      <div
        onMouseDown={dragIfBlank}
        style={{
          height: "100vh",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          color: "#1f2937",
          background: `rgba(255,255,255,${opacity})`,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <span style={{ color: paused ? "#b45309" : "#dc2626", fontWeight: 700, flexShrink: 0 }}>
          {(phase === "正在初始化…" ? "…" : phase).slice(0, 1)}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lastLine}
        </span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>⏱ {fmtTime(elapsedMs)}</span>
        <button style={iconBtn} title={snapshot.locked ? "已锁定（主窗解锁）" : "点击穿透锁定"} onClick={toggleLocked}>
          {snapshot.locked ? "🔒" : "🔓"}
        </button>
        <button style={iconBtn} title="展开为面板（Esc）" onClick={expandToPanel}>⤢</button>
      </div>
    );
  }

  return (
    <div
      onMouseDown={dragIfBlank}
      style={{
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        color: "#1f2937",
        background: `rgba(255,255,255,${opacity})`,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* 顶部：状态 + 时长 + 平台 + 窗口控制 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderBottom: "1px solid #e5e7eb",
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: paused ? "#b45309" : "#dc2626" }}>
          {phase === "正在初始化…" ? "初始化…" : phase}
        </span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsedMs)}</span>
        <span style={{ marginLeft: "auto", color: "#6b7280" }}>{info?.platform ?? ""}</span>
        <button style={iconBtn} title={snapshot.topmost ? "取消置顶" : "置顶"} onClick={toggleTopmost}>
          {snapshot.topmost ? "📌" : "📍"}
        </button>
        <button style={iconBtn} title={snapshot.locked ? "点击穿透已锁定（主窗解锁）" : "点击穿透锁定"} onClick={toggleLocked}>
          {snapshot.locked ? "🔒" : "🔓"}
        </button>
        <button style={iconBtn} title="收起为字幕条（Esc）" onClick={shrinkToBar}>⤡</button>
      </div>

      {/* 中部：最近转写 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 10px" }}>
        {transcripts.slice(-SHOW_TRANSCRIPT).length === 0 && partials.length === 0 && (
          <p style={{ margin: 0, color: "#9ca3af" }}>等待识别…</p>
        )}
        {transcripts.slice(-SHOW_TRANSCRIPT).map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 6, alignItems: "baseline", lineHeight: 1.5, marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", width: 36, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(t.time)}
            </span>
            <span style={{ color: t.source === "subtitle" ? "#0f766e" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.text}
            </span>
          </div>
        ))}
        {partials.slice(-2).map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "baseline", lineHeight: 1.5, marginBottom: 2 }}>
            <span style={{ fontSize: 10, width: 36, flexShrink: 0 }} />
            <span style={{ color: p.committed ? "#374151" : "#9ca3af", fontStyle: p.committed ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.text}
            </span>
          </div>
        ))}
      </div>

      {/* 底部：最近画面要点 + 计数 + 控制 */}
      <div style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, color: "#6b7280", marginBottom: 4 }}>
          <span>字幕 {counts.subtitle}</span>
          <span>语音 {counts.asr}</span>
          <span style={{ color: "#2563eb" }}>画面 {counts.ocr}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            透明
            <input
              type="range"
              min={35}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => updateOpacity(Number(e.target.value) / 100)}
              style={{ width: 50 }}
            />
          </span>
        </div>
        {ocrLines.slice(-SHOW_OCR).map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 6, alignItems: "baseline", lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0, fontWeight: 600 }}>屏{o.screenId}</span>
            <span style={{ color: "#1e40af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.text}</span>
          </div>
        ))}
        {/* 控制按钮（暂停/继续 · 停止 · 回主窗——浮窗保留，主窗前置聚焦） */}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button style={{ ...btn, background: paused ? "#0d9488" : "#f59e0b", color: "#fff", border: "none" }} onClick={togglePause}>
            {paused ? "▶ 继续" : "⏸ 暂停"}
          </button>
          <button style={{ ...btn, background: "#dc2626", color: "#fff", border: "none" }} onClick={stop}>
            ⏹ 停止
          </button>
          <button style={{ ...btn, ...iconBtn, border: "1px solid #d1d5db", background: "#fff", color: "#1f2937" }} onClick={backToMain}>
            ⌂ 主窗
          </button>
        </div>
      </div>
    </div>
  );
}
