/**
 * CaptureFloatPanel — 采集浮窗（v0.12.0 M6，采集体验债；v0.12.3 交互升级）。
 *
 * @ai-context: 采集中全屏看视频时主面板被遮挡——常驻悬浮小窗（alwaysOnTop）
 *              顶部状态/时长、中部最近转写、底部最近画面要点、控制按钮。
 *              与主面板共用 useLiveSessionEvents hook（同一 live:* 内容流）。
 * @ai-context: 批 2b：本窗是**独立 webview**（?float=1，无法共享主窗 context）——
 *              暂停/启停走本窗自己的 CaptureStatusProvider 实例（App float
 *              分支包入；useCaptureControl 消费），暂停判定与文案以
 *              pausedReason 单一来源（不再 phase 字符串推导），动作带 pending
 *              防连点；useLiveSessionEvents 只负责内容流阶段展示（职责边界）。
 * @ai-context: v0.12.3 双形态：面板（360×240 全功能）⇄ 字幕条（360×44 只读
 *              展示，Esc 切换）；点击穿透锁定后只读悬浮（解锁走全局快捷键
 *              Ctrl+Shift+F——ADR-025，v0.12.6 起主窗随浮窗打开而隐藏）。
 *              窗口级行为（拖拽/吸附/持久化/锁定/置顶/透明度）在
 *              useFloatWindow hook；几何纯函数在 utils/floatWindow.ts。
 * @ai-context: 控制按钮走真实命令（暂停/继续/停止/回主窗）；"标记"无后端命令，
 *              按 YAGNI 不预排虚假按钮。
 *
 * @line-limit-exemption: 浮窗内容密度高（360×240 内状态/转写/画面/控制分区 +
 *              双形态渲染），登记 docs/standards/line-limit-exemptions.md。
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLiveSessionEvents } from "../hooks/useLiveSessionEvents";
import { useFloatWindow } from "../hooks/useFloatWindow";
// 批 2b：本窗独立的采集控制实例（provider 由 App ?float=1 分支包入）
import { useCaptureControl } from "../hooks/useLiveCaptureControl";
import { AUTO_RESUME_HINTS, pauseReasonLabel } from "../hooks/liveCaptureState";
import { Button, Text } from "../ui/primitives";

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
  // 批 2b：暂停单一来源 pausedReason（须会话活动才有意义——滞后事件/停止后为
  // null 时回退内容流 phase；旧实现 phase.startsWith("⏸") 推导已废弃）
  const capture = useCaptureControl();
  const pauseReason = capture.active ? capture.pausedReason : null;
  const paused = pauseReason != null;
  const autoPaused = paused && pauseReason !== "manual";
  const statusText = paused ? pauseReasonLabel(pauseReason) ?? phase : phase;
  const statusColor = paused ? "#b45309" : "#dc2626";
  const statusChar = paused ? "⏸" : (phase === "正在初始化…" ? "…" : phase).slice(0, 1);
  const autoHint =
    pauseReason === "media" || pauseReason === "foreground" ? AUTO_RESUME_HINTS[pauseReason] : undefined;

  // 浮窗窗口 body 默认 8px margin + 100vh 溢出 → 左右透明条 + 最右滚条
  // （用户反馈"两侧透明区"）；浮窗无全局 CSS——此处注入窗口级重置
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent =
      "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}";
    document.head.appendChild(s);
    return () => s.remove();
  }, []);

  const togglePause = () => {
    if (capture.pending) return; // 防连点
    void (paused ? capture.resume() : capture.pause()).then((o) => {
      // 守卫错已由 hook 自愈（快照重拉）；console 保可观测，不吞
      if (!o.ok && o.message) console.warn("[capture-float] 暂停/继续被拒（状态已同步）:", o.message);
    });
  };
  const stop = () => {
    if (capture.pending) return; // 防连点
    void capture.stop().then((o) => {
      if (o.ok) {
        void invoke("close_capture_float").catch(() => undefined);
      } else if (o.message) {
        console.warn("[capture-float] 停止采集失败:", o.message);
      }
    });
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
        <span style={{ color: statusColor, fontWeight: 700, flexShrink: 0 }}>
          {statusChar}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lastLine}
        </span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>⏱ {fmtTime(elapsedMs)}</span>
        {snapshot.locked ? (
          <span style={{ color: "#b45309", fontWeight: 600, flexShrink: 0 }} title="点击穿透已锁定——按 Ctrl+Shift+F 解锁">
            🔒 已锁定
          </span>
        ) : (
          <Button variant="ghost" size="sm" title="点击穿透锁定" onClick={toggleLocked}>🔓</Button>
        )}
        <Button variant="ghost" size="sm" title="展开为面板（Esc）" onClick={expandToPanel}>⤢</Button>
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
        <span style={{ fontWeight: 600, color: statusColor }}>
          {phase === "正在初始化…" ? "初始化…" : statusText}
        </span>
        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsedMs)}</span>
        <span style={{ marginLeft: "auto", color: "#6b7280" }}>{info?.platform ?? ""}</span>
        <Button variant="ghost" size="sm" title={snapshot.topmost ? "取消置顶" : "置顶"} onClick={toggleTopmost}>
          {snapshot.topmost ? "📌" : "📍"}
        </Button>
        <Button variant="ghost" size="sm" title={snapshot.locked ? "点击穿透已锁定（Ctrl+Shift+F 解锁）" : "点击穿透锁定"} onClick={toggleLocked}>
          {snapshot.locked ? "🔒" : "🔓"}
        </Button>
        {snapshot.locked && (
          <span style={{ fontSize: 10, color: "#b45309", flexShrink: 0 }} title="点击穿透已锁定——按 Ctrl+Shift+F 解锁">
            已锁定
          </span>
        )}
        <Button variant="ghost" size="sm" title="收起为字幕条（Esc）" onClick={shrinkToBar}>⤡</Button>
      </div>

      {/* 中部：最近转写 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 10px" }}>
        {transcripts.slice(-SHOW_TRANSCRIPT).length === 0 && partials.length === 0 && (
          <Text as="p" tone="ink-3" style={{ margin: 0 }}>等待识别…</Text>
        )}
        {transcripts.slice(-SHOW_TRANSCRIPT).map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 6, alignItems: "baseline", lineHeight: 1.5, marginBottom: 2 }}>
            <Text tone="ink-3" style={{ fontSize: 10, width: 36, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(t.time)}
            </Text>
            <span style={{ color: t.source === "subtitle" ? "#0f766e" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.text}
            </span>
          </div>
        ))}
        {partials.slice(-2).map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "baseline", lineHeight: 1.5, marginBottom: 2 }}>
            <span style={{ fontSize: 10, width: 36, flexShrink: 0 }} />
            <Text tone={p.committed ? "ink-2" : "ink-3"} style={{ fontStyle: p.committed ? "normal" : "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.text}
            </Text>
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
        {/* 控制按钮（暂停/继续 · 停止 · 回主窗——浮窗保留，主窗前置聚焦）。
            批 2b：auto 暂停（media/foreground）下 resume 无物理作用——按钮禁用
            + title 提示，不误导；pending 期间全部禁用防连点 */}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            style={{ ...btn, background: autoPaused ? "#d1d5db" : paused ? "#0d9488" : "#f59e0b", color: "#fff", border: "none" }}
            disabled={capture.pending != null || autoPaused}
            title={autoHint}
            onClick={togglePause}
          >
            {paused ? (autoPaused ? "⏸ 自动暂停" : "▶ 继续") : "⏸ 暂停"}
          </button>
          <button
            style={{ ...btn, background: "#dc2626", color: "#fff", border: "none" }}
            disabled={capture.pending != null}
            onClick={stop}
          >
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
