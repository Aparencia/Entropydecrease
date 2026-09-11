/**
 * ClassroomCapturePanel — 课堂助手左栏「实时捕获」卡片（批 0-C2 Task 4 步 1 自
 * ClassroomPage.tsx 的 L495–681 整体抽出，纯搬运、行为等价）。
 *
 * @ai-context: 纯展示适配器 —— 采集生命周期（active/starting/pending/sessionId/
 *              pausedReason）与流式模型四态（未就绪缺件 / 下载中带 MB 进度 / 失败
 *              可重试 / 检查中）全部由页面以 props 注入；卡内**不再调用**
 *              useCaptureControl()（裁决 D2：唯一消费点留在页面，防同窗双消费点漂移）。
 * @ai-context: 派生展示值随卡下沉：paused · autoPaused（media/foreground 自动暂停
 *              ——resume 后端 Ok 但物理无变化，按钮禁用 + title 如实提示）·
 *              autoPauseHint（AUTO_RESUME_HINTS）；暂停三态文案见 pausedCardText。
 * @ai-context: 边界与副作用 —— 动作（start/stop/pause/resume/浮窗/下载/重试）只回调
 *              页面，卡内不 invoke 采集命令；唯一卡内副作用是「⭐ 标记此刻」调
 *              save_user_screenshot（同效快捷键留在页面 useClassroomShortcuts）；
 *              「⏹ 停止」后的关浮窗与再预热属页面 stopLive 编排。样式（内联色值 /
 *              ~650MB 魔数 / 全角标点 / emoji）为现状契约，本批不 token 化、不换 emoji。
 */
import { invoke } from "@tauri-apps/api/core";
import AudioLevelMeter from "./AudioLevelMeter";
import { AUTO_RESUME_HINTS } from "../hooks/liveCaptureState";
import type { CaptureActionKind } from "../hooks/useLiveCaptureControl";
import type { PrepareState } from "../hooks/useClassroomHints";
import type { FloatSnapshot } from "../hooks/useFloatWindow";
import type { DownloadProgress, PauseSource, StreamingModelStatus } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

/** 采集卡暂停状态行文案（按 reason 三态；沿用原横幅语义——媒体暂停含"自动继续"
 *  说明，前台切走含"回窗即继续"说明；徽标/右栏/浮窗用短文案 pauseReasonLabel） */
function pausedCardText(reason: PauseSource): string {
  switch (reason) {
    case "media":
      return "⏸ 已随视频暂停——画面/声音恢复即自动继续";
    case "foreground":
      return "⏸ 已自动暂停（切走）——回到目标窗口即自动继续";
    default:
      return "⏸ 已暂停（时间轴冻结，恢复后继续）";
  }
}

interface Props {
  /** 采集中（决定"录制中"徽标 / 状态行 / VU 表 / 按钮组分支） */
  active: boolean;
  /** 启动过渡态（等待引擎就绪自动开录——不显示采集中控件） */
  starting: boolean;
  /** 动作防连点（非空时开始/停止/暂停按钮禁用） */
  pending: CaptureActionKind | null;
  /** 当前会话 id（非空且非过渡态时提示可到「会话」页查看） */
  sessionId: number | null;
  /** 暂停原因三态（manual/media/foreground；null=未暂停） */
  pausedReason: PauseSource | null;
  /** 采集期错误行（引擎错误/浮窗切换失败/标记失败） */
  liveError: string;
  /** 流式 ASR 模型状态（null=检查中；ready=false 时展示缺件与下载入口） */
  modelStatus: StreamingModelStatus | null;
  modelDownloading: boolean;
  modelProgress: DownloadProgress | null;
  /** 模型查询/下载错误（TD-016：不再静默，允许重试） */
  modelError: string;
  /** 引擎预热状态（就绪后点"开始"即录） */
  prepareState: PrepareState;
  /** 浮窗三态快照（浮窗化 ⇄ 收起 ⇄ 解锁穿透；Rust 单一来源） */
  floatSnap: FloatSnapshot;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleFloat: () => void;
  onDownloadModel: () => void;
  onRetryModelStatus: () => void;
  /** 产物/状态行写入（页面唯一 status 状态源） */
  onStatus: (message: string) => void;
  /** 错误横幅写入（页面唯一 liveError 状态源） */
  onLiveError: (message: string) => void;
}

export default function ClassroomCapturePanel({
  active,
  starting,
  pending,
  sessionId,
  pausedReason,
  liveError,
  modelStatus,
  modelDownloading,
  modelProgress,
  modelError,
  prepareState,
  floatSnap,
  onStart,
  onStop,
  onPause,
  onResume,
  onToggleFloat,
  onDownloadModel,
  onRetryModelStatus,
  onStatus,
  onLiveError,
}: Props) {
  // ── 采集卡派生展示值（批 2b：暂停 reason 三态语义）──
  const paused = pausedReason != null;
  /** 自动暂停（media/foreground）：resume 无物理作用——按钮禁用 + 标题提示 */
  const autoPaused = paused && pausedReason !== "manual";
  const autoPauseHint =
    pausedReason === "media" || pausedReason === "foreground" ? AUTO_RESUME_HINTS[pausedReason] : undefined;

  return (
    <div style={panel}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        实时捕获{active && <span style={{ color: "#dc2626" }}> ● 录制中</span>}
      </div>
      {!active && !modelStatus?.ready && (
        <div>
          {modelStatus ? (
            <p style={{ fontSize: 11, color: "#b45309", margin: "0 0 6px" }}>
              流式 ASR 模型未就绪（缺 {modelStatus.missing.join(", ")}）
            </p>
          ) : (
            <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>
              {modelError || "模型状态检查中…"}
            </p>
          )}
          {modelStatus &&
            (modelDownloading ? (
              <div style={{ fontSize: 11, color: "#374151", marginBottom: 6 }}>
                <div>⏳ 正在下载模型（~650MB）…</div>
                {modelProgress && (
                  <div>
                    {modelProgress.file}：
                    {((modelProgress.downloadedBytes / 1024 / 1024) | 0)}MB /{" "}
                    {((modelProgress.totalBytes / 1024 / 1024) | 0)}MB
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => void onDownloadModel()}
                style={{ ...btn, width: "100%", padding: "8px 0", fontWeight: 600, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6, marginBottom: 6 }}
              >
                ⬇ 一键下载并配置模型
              </button>
            ))}
          {modelError && <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>{modelError}</p>}
          {!modelStatus && (
            <button
              onClick={() => void onRetryModelStatus()}
              style={{ ...btn, width: "100%", padding: "6px 0", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}
            >
              ⟳ 重试检查
            </button>
          )}
        </div>
      )}
      {active && (
        // 实时内容（字幕/语音/画面）统一由右侧 LiveActivityPanel 展示，
        // 左栏保持精简（状态徽标）——审查观察项修复
        // 批 2b：暂停按 pausedReason 三态文案（media 行并入原随播随停
        // 横幅语义——单一状态源后横幅/状态行不再双份维护）
        <div style={{ fontSize: 11, color: paused ? "#b45309" : "#0d9488", marginBottom: 6 }}>
          {paused ? pausedCardText(pausedReason) : "● 正在采集（实时内容见右侧面板）"}
        </div>
      )}
      {/* 2026-08 A2：音频电平条（仅采集中显示；暂停时电平静止） */}
      {active && !paused && <AudioLevelMeter />}
      {liveError && <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>{liveError}</p>}
      {active ? (
        /* 采集中按钮组（2026-08 A1：暂停/继续 + 标记此刻 + 停止）。
           批 2b：manual 暂停 → "继续捕获"可点；auto（media/foreground）
           暂停 → resume 后端 Ok 但物理无变化（auto 条件仍真）——按钮禁用
           + title 提示，不提供误导性"恢复成功"反馈；pending 期间防连点 */
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={paused ? onResume : onPause}
            disabled={pending != null || autoPaused}
            title={autoPauseHint}
            style={{
              ...btn,
              flex: 1,
              padding: "8px 0",
              fontWeight: 600,
              background: paused ? (pausedReason === "manual" ? "#0d9488" : "#d1d5db") : "#f59e0b",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            {paused ? (pausedReason === "manual" ? "▶ 继续捕获" : "⏸ 自动暂停中") : "⏸ 暂停"}
          </button>
          {/* 2026-08 A3：手动标记此刻（最高权重关键图信号；Ctrl+Shift+S 同效） */}
          <button
            onClick={() => {
              void invoke<string>("save_user_screenshot")
                .then(() => onStatus("⭐ 已标记此刻画面（关键图候选置顶）"))
                .catch((err) => onLiveError(`标记失败: ${err}`));
            }}
            title="快捷键 Ctrl+Shift+S"
            style={{
              ...btn,
              flex: 1,
              padding: "8px 0",
              fontWeight: 600,
              background: "#fff",
              color: "#0d9488",
              border: "1px solid #99f6e4",
              borderRadius: 6,
            }}
          >
            ⭐ 标记此刻
          </button>
          <button
            onClick={onStop}
            disabled={pending != null}
            style={{
              ...btn,
              flex: 1,
              padding: "8px 0",
              fontWeight: 600,
              background: "#dc2626",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            ⏹ 停止
          </button>
          {/* v0.12.0 M6：浮窗化——采集中全屏看视频时悬浮常显（快捷键 Ctrl+Shift+F）
              v0.12.3：三态语义（浮窗化 ⇄ 收起 ⇄ 解锁点击穿透） */}
          <button
            onClick={onToggleFloat}
            title={
              floatSnap.open
                ? floatSnap.locked
                  ? "点击穿透已锁定——点击解锁（快捷键 Ctrl+Shift+F）"
                  : "收起采集浮窗（快捷键 Ctrl+Shift+F）"
                : "采集中全屏看视频时悬浮常显（快捷键 Ctrl+Shift+F）"
            }
            style={{
              ...btn,
              flex: 1,
              padding: "8px 0",
              fontWeight: 600,
              background: "#fff",
              color: floatSnap.locked ? "#dc2626" : "#0d9488",
              border: floatSnap.locked ? "1px solid #fecaca" : "1px solid #99f6e4",
              borderRadius: 6,
            }}
          >
            {floatSnap.open ? (floatSnap.locked ? "🔓 解锁浮窗" : "🗕 收起浮窗") : "🗕 浮窗化"}
          </button>
        </div>
      ) : (
        <>
          {/* v0.19.2：启动过渡态（等待引擎就绪自动开录——不显示采集中控件） */}
          {starting ? (
            <p style={{ fontSize: 11, color: "#b45309", margin: "6px 0 0" }}>
              ⏳ 引擎初始化中…就绪后自动开始（音频与画面同刻启动，请勿重复点击）
            </p>
          ) : (
            <>
              {/* P3：引擎预热状态提示（就绪后点"开始"即录） */}
              {prepareState === "loading" && (
                <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>
                  ⏳ 引擎预热中…（就绪后开始即录）
                </p>
              )}
              {prepareState === "ready" && (
                <p style={{ fontSize: 11, color: "#0d9488", margin: "6px 0 0" }}>
                  ✓ 引擎已就绪，开始即录
                </p>
              )}
            </>
          )}
          <button
            onClick={onStart}
            disabled={!modelStatus?.ready || starting || pending != null}
            style={{
              ...btn,
              width: "100%",
              padding: "8px 0",
              fontWeight: 600,
              background: modelStatus?.ready && !starting && pending == null ? "#0d9488" : "#e5e7eb",
              color: modelStatus?.ready && !starting && pending == null ? "#fff" : "#9ca3af",
              border: "none",
              borderRadius: 6,
            }}
          >
            {starting ? "⏳ 引擎初始化中…" : "▶ 开始实时捕获"}
          </button>
        </>
      )}
      {sessionId && !starting && (
        <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>实时捕获中（可到「会话」页查看）</p>
      )}
    </div>
  );
}
