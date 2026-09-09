/**
 * 实时采集控制状态机纯逻辑（批 2b：前端采集控制单一状态源）。
 *
 * @ai-context(Why): 批 2a 前暂停状态散落多处自维护（ClassroomPage livePaused/
 *              mediaPaused 双 bool、App paused、浮窗 phase 字符串推导、详情
 *              hook phase），同一窗口多份监听 + 各自拉取，事件丢失时漂移且
 *              "恢复成功"式反馈误导用户。批 2a 后 Rust 已是单状态机（manual
 *              锁存 + media/foreground 自动条件），外发带 reason 的
 *              live:paused/resumed 事件与 pausedReason 状态查询——本模块收口
 *              前端收敛规则：事件按到达序幂等收敛（漏检合成对快速往返时
 *              终态=最后事件，无需去抖）；watchdog/守卫自愈的 live_session_status
 *              快照为权威校正源。本文件零副作用，供 reducer 直测。
 */
import type { LiveSessionStatus, PauseSource } from "../types";

/** 前端控制动作种类（pending 防连点） */
export type CaptureActionKind = "start" | "pause" | "resume" | "stop";

/** 看门狗一次性结论（起始态异常结束的两种去向；下一个 start 动作清除） */
export type WatchdogNotice = "start-restored" | "start-unconfirmed";

/** 控制状态（来源①挂载/看门狗快照 ②事件 ③守卫错自愈；单一 reducer 收敛） */
export interface LiveCaptureState {
  active: boolean;
  sessionId: number | null;
  pausedReason: PauseSource | null;
  recovering: boolean;
  /** 启动等待态（start 已受理、recording 事件/快照未确认前保持——按钮防死锁） */
  starting: boolean;
  /** 停止过渡态（stopped 事件/快照确认会话结束后清除——右侧面板保持显示用） */
  stopping: boolean;
  /** 内部簿记：starting 起点（ms epoch）——看门狗 20s 未确认判定用，不对外暴露语义 */
  startingAtMs: number | null;
  notice: WatchdogNotice | null;
}

export const initialState: LiveCaptureState = {
  active: false,
  sessionId: null,
  pausedReason: null,
  recovering: false,
  starting: false,
  stopping: false,
  startingAtMs: null,
  notice: null,
};

/** 看门狗轮询间隔（Why: 事件丢失/双轨残留的漂移校正周期，5s 与后端
 *  500ms 事件延时量级差 10 倍，UI 无感） */
export const WATCHDOG_INTERVAL_MS = 5_000;
/** starting 未确认放弃阈值（Why: 后端 start 有界等待 ≤15s，多留一个轮询窗；
 *  超时仍无 recording/快照 → 引擎实际未开录，恢复"可直接重试"按钮） */
export const START_UNCONFIRMED_MS = 20_000;

export type LiveCaptureEvent =
  | { type: "status"; payload: "recording" | "stopped" | "failed" }
  | { type: "paused"; reason?: PauseSource | null }
  | { type: "resumed" }
  | { type: "recovering" }
  | { type: "recovered" }
  /** 融合开始 = 采集已停的可靠信号（stopped 事件丢失兜底，ADR-007 语义） */
  | { type: "fusing" }
  /** live:error：启动等待态立即退出（否则要等 20s 看门狗） */
  | { type: "engine-error" }
  /** live_session_status 权威快照（挂载/看门狗/守卫错自愈共用） */
  | { type: "snapshot"; status: LiveSessionStatus }
  /** 看门狗 tick（reducer 按簿记时间判定起始未确认放弃） */
  | { type: "watchdog-tick"; nowMs: number }
  /** start 命令成功受理（engineReady=预热就绪 → resolve≈已开录，直接活动） */
  | { type: "start-resolved"; sessionId: number; engineReady: boolean; nowMs: number }
  | { type: "stopping-intent" };

function reset(): LiveCaptureState {
  return { ...initialState };
}

/**
 * 事件收敛规则。Why 无去抖：合成对（漏检补偿的 paused→resumed 紧邻对）按
 * 到达序收敛，终态即最后事件；快照事件在轮询/自愈时全量覆写（权威）。
 */
export function liveCaptureReducer(state: LiveCaptureState, ev: LiveCaptureEvent): LiveCaptureState {
  switch (ev.type) {
    case "status": {
      if (ev.payload === "recording") {
        // 引擎真正就绪、音频与画面同刻启动——结束一切过渡态（新会话起点）
        return { ...state, active: true, starting: false, stopping: false, pausedReason: null, recovering: false };
      }
      // stopped / failed：会话已结束，全量复位（清 sessionId/暂停/过渡态）
      return reset();
    }
    case "paused": {
      // 滞后/重复事件丢弃（会话未活动时暂停无意义）——快照才是权威
      if (!state.active) return state;
      // 旧载荷无 reason → 防御按 manual（历史手动暂停语义）
      return { ...state, pausedReason: ev.reason ?? "manual" };
    }
    case "resumed": {
      if (!state.active) return state;
      return { ...state, pausedReason: null };
    }
    case "recovering":
      return { ...state, recovering: true };
    case "recovered":
      return { ...state, recovering: false };
    case "fusing":
      return reset();
    case "engine-error":
      // 只退等待/过渡态，不否定 active——录制中错误由 live:error 文案面展示
      return { ...state, starting: false, stopping: false };
    case "snapshot": {
      const reason = parsePauseReason(ev.status.pausedReason);
      if (!ev.status.active) {
        // 会话已结束/从未活动：停采与暂停复位；starting 保留待看门狗放弃判定
        // （引擎加载中 session 未落 active 属正常，不能一票否）
        return { ...state, active: false, sessionId: null, pausedReason: null, stopping: false };
      }
      return {
        ...state,
        active: true,
        sessionId: ev.status.sessionId,
        pausedReason: reason,
        // active 确认 → 启动/停止过渡态收口（drift 校正）
        starting: false,
        stopping: false,
        startingAtMs: null,
      };
    }
    case "watchdog-tick": {
      // 只有"starting 且始终未见 active"需要判定；20s 无确认 → 放弃等待
      if (!state.starting || state.active) return state;
      if (state.startingAtMs != null && ev.nowMs - state.startingAtMs >= START_UNCONFIRMED_MS) {
        return { ...state, starting: false, startingAtMs: null, notice: "start-unconfirmed" };
      }
      return state;
    }
    case "start-resolved": {
      return {
        ...state,
        active: ev.engineReady,
        sessionId: ev.sessionId,
        pausedReason: null,
        starting: !ev.engineReady,
        stopping: false,
        // 簿记仅在真正等待确认时启用（engineReady 直接活动，无需放弃判定）
        startingAtMs: ev.engineReady ? null : ev.nowMs,
        notice: null,
      };
    }
    case "stopping-intent":
      return { ...state, stopping: true };
  }
}

/** Rust paused_reason 为 Option<String>——边界防御解析（未知值按未暂停，契约
 *  变更不崩 UI；"manual"/"media"/"foreground" 三值见 pause_state.rs） */
export function parsePauseReason(raw: string | null | undefined): PauseSource | null {
  return raw === "manual" || raw === "media" || raw === "foreground" ? raw : null;
}

/** 守卫错分类（Why: 动作被幂等拒绝时按类给自愈文案；文案即 Rust command
 *  错误串，见 live_session_manager/commands_live——变更需同步测试） */
export type GuardErrorKind = "already-paused" | "not-paused" | "active-session" | "no-session";

export function classifyGuardError(err: string): GuardErrorKind | null {
  if (err.includes("会话已处于暂停")) return "already-paused";
  if (err.includes("会话未处于暂停")) return "not-paused";
  if (err.includes("已有进行中的实时会话")) return "active-session";
  if (err.includes("无活动实时会话")) return "no-session";
  return null;
}

/** reason 文案（批 2b 定稿：徽标/右栏/浮窗共用同一三态文案） */
export const PAUSE_LABELS: Record<PauseSource, string> = {
  manual: "⏸ 已暂停",
  media: "⏸ 已随视频暂停",
  foreground: "⏸ 已自动暂停（切走）",
};

/** reason → 三态文案（null=未暂停 → null，消费方自行兜底） */
export function pauseReasonLabel(reason: PauseSource | null): string | null {
  return reason ? PAUSE_LABELS[reason] : null;
}

/** 自动暂停（media/foreground）下用户点"恢复"是无效果操作的提示（Why: 后端
 *  resume 在 auto 条件仍真时 Ok 但物理无变化——UI 不得宣称恢复成功，改提示） */
export const AUTO_RESUME_HINTS: Record<"media" | "foreground", string> = {
  media: "视频暂停中——恢复播放即自动继续",
  foreground: "已切走——回到目标窗口即自动继续",
};

export function isAutoPaused(reason: PauseSource | null): reason is "media" | "foreground" {
  return reason === "media" || reason === "foreground";
}
