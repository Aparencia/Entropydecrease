/**
 * useCaptureControl / CaptureStatusProvider — 实时采集控制单一状态源（批 2b）。
 *
 * @ai-context(Why): 暂停/启停状态此前在 ClassroomPage/App/浮窗/详情 hook 多处
 *              自维护并各自订阅 live:status/paused/resumed 等事件——同一窗口
 *              双监听双查询，事件丢失时漂移并产生误导性"恢复成功"反馈。批 2a
 *              后端已把暂停收敛为单状态机并外发 reason——本模块收口前端：
 *              状态收敛规则全在 liveCaptureState reducer（纯函数可测），本文件
 *              只做副作用装配（invoke/listen/watchdog/动作 pending）。
 * @ai-context: **每窗口单实例**——主窗在 App.tsx 挂 <CaptureStatusProvider>
 *              （导航徽标/ClassroomPage/右栏共用同一 context）；浮窗是独立
 *              webview（?float=1，无法共享主窗 context），在 App float 分支单独
 *              实例化同一 provider。任何窗口不得开第二个实例（双监听双查询）。
 * @ai-context: 动作语义（守卫契约）：pause/resume/stop/start 失败分两类——
 *              守卫错（会话已暂停/未暂停/已有进行中会话）→ 自动重拉
 *              live_session_status 快照自愈并把文案随 ActionResult 返回（UI 提示，
 *              不吞）；其余为真失败。resume 在 pausedReason∈{media,foreground}
 *              时后端 Ok 但物理无变化（自动条件仍真）——返回文案提示而非宣称成功。
 * @ai-context: 详情数据（转写/字幕/计数）不经本 context——由 useLiveSessionEvents
 *              等展示层 hook 自理，本 context 只管采集生命周期状态（职责边界）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LiveSessionStatus, PauseChangeEvent, PauseSource } from "../types";
import {
  AUTO_RESUME_HINTS,
  WATCHDOG_INTERVAL_MS,
  type CaptureActionKind,
  type GuardErrorKind,
  type WatchdogNotice,
  classifyGuardError,
  initialState,
  liveCaptureReducer,
  parsePauseReason,
} from "./liveCaptureState";

export type { CaptureActionKind, LiveCaptureState, WatchdogNotice } from "./liveCaptureState";

/** start 动作入参（与 Rust start_live_session 参数契约一致） */
export interface CaptureStartArgs {
  title: string;
  sourceWindow: string | null;
  windowId: number | null;
  profile: string;
}

/** 动作结果（守卫错自愈 healed=true；message 供调用方转 UI 提示——不吞） */
export interface CaptureActionResult {
  ok: boolean;
  /** 守卫错自愈（已自动重拉快照收敛）——UI 按提示展示而非宣称成功 */
  healed?: boolean;
  /** 提示文案（错误或"物理无变化"类说明） */
  message?: string;
  /** start 专属：本次预热状态（页面提示条同步用） */
  prepare?: string;
  /** start/stop 专属：会话 id */
  sessionId?: number | null;
  /** start 专属：resolve 时引擎已就绪（=已同刻开录） */
  engineReady?: boolean;
}

/** 动作未启动的结果（Why：pending 期间再次触发=连点被忽略——ok=false 且无
 *  message，调用方应静默返回，勿当失败弹错） */
const IGNORED_RESULT: CaptureActionResult = { ok: false };

/** 守卫错自愈文案（与后端错误串对应；具体串见 Rust command 层） */
const GUARD_HINTS: Record<GuardErrorKind, string> = {
  "already-paused": "会话已处于暂停（状态已同步；自动暂停时条件恢复即自动继续）",
  "not-paused": "会话未处于暂停（状态已同步）",
  "active-session": "已有进行中的实时会话（状态已同步；如需重启请先停止）",
  "no-session": "没有进行中的采集（状态已同步）",
};

export interface CaptureControlValue {
  active: boolean;
  sessionId: number | null;
  pausedReason: PauseSource | null;
  recovering: boolean;
  starting: boolean;
  stopping: boolean;
  /** 动作防连点（非空时相关按钮禁用） */
  pending: CaptureActionKind | null;
  /** 看门狗结论（start 未确认 20s 放弃/恢复；下一个 start 清除） */
  notice: WatchdogNotice | null;
  start: (args: CaptureStartArgs) => Promise<CaptureActionResult>;
  pause: () => Promise<CaptureActionResult>;
  resume: () => Promise<CaptureActionResult>;
  stop: () => Promise<CaptureActionResult>;
}

const CaptureControlCtx = createContext<CaptureControlValue | null>(null);

export function CaptureStatusProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(liveCaptureReducer, initialState);
  // 事件回调/动作内读最新状态与 pending（镜像 ref，审查 LOW-1 同模式）
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [pending, setPendingState] = useState<CaptureActionKind | null>(null);
  const pendingRef = useRef<CaptureActionKind | null>(null);
  const beginPending = useCallback((kind: CaptureActionKind) => {
    pendingRef.current = kind;
    setPendingState(kind);
  }, []);
  const endPending = useCallback(() => {
    pendingRef.current = null;
    setPendingState(null);
  }, []);

  /** 拉取权威快照（挂载兜底/看门狗/动作收尾共用）。Why 失败静默：纯 web dev
   *  无 Tauri 后端时页面不崩，事件通道仍在校正；真机失败由动作结果面反馈 */
  const pullStatus = useCallback(async (): Promise<void> => {
    try {
      const s = await invoke<LiveSessionStatus>("live_session_status");
      dispatch({ type: "snapshot", status: s });
    } catch {
      /* 见上 Why */
    }
  }, []);

  // 挂载：事件可能在监听注册前已发出（刷新/双窗冷启）——先拉一次再订阅。
  // Why 不 gate 于窗口：主窗/浮窗都需要在无本地会话上下文时还原后端真值。
  useEffect(() => {
    let disposed = false;
    void pullStatus();
    const unlisteners: Promise<() => void>[] = [
      listen<string>("live:status", (e) => {
        if (disposed) return;
        const p = e.payload;
        if (p !== "recording" && p !== "stopped" && p !== "failed") return;
        dispatch({ type: "status", payload: p });
      }),
      listen<PauseChangeEvent>("live:paused", (e) => {
        if (disposed) return;
        // 载荷可能缺 reason（旧契约 unit）→ 防御按 manual
        dispatch({ type: "paused", reason: typeof e.payload?.reason === "string" ? parsePauseReason(e.payload.reason) : null });
      }),
      listen<PauseChangeEvent>("live:resumed", () => {
        if (!disposed) dispatch({ type: "resumed" });
      }),
      listen<string>("live:recovering", () => {
        if (!disposed) dispatch({ type: "recovering" });
      }),
      listen<string>("live:recovered", () => {
        if (!disposed) dispatch({ type: "recovered" });
      }),
      listen<number>("session:fusing", () => {
        if (!disposed) dispatch({ type: "fusing" });
      }),
      listen<string>("live:error", () => {
        if (!disposed) dispatch({ type: "engine-error" });
      }),
    ];
    return () => {
      disposed = true;
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [pullStatus]);

  // 看门狗（Why: 事件丢失/双轨残留的漂移校正——active/starting/stopping 期间每
  // 5s 拉一次快照；starting 20s 未确认由 reducer tick 判定放弃；stopping 期快照
  // 收口对齐 TD-042 停止超时先例）
  useEffect(() => {
    if (!(state.active || state.starting || state.stopping)) return;
    const timer = setInterval(() => {
      void pullStatus();
      dispatch({ type: "watchdog-tick", nowMs: Date.now() });
    }, WATCHDOG_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.active, state.starting, state.stopping, pullStatus]);

  const start = useCallback(
    async (args: CaptureStartArgs): Promise<CaptureActionResult> => {
      if (pendingRef.current) return IGNORED_RESULT;
      beginPending("start");
      try {
        // 先幂等 prepare（与页面预热共享同一引擎态），再 start；既有会话 → 后端守卫错自愈
        const freshPrepare = await invoke<string>("prepare_live_session").catch(() => "idle" as const);
        const sessionId = await invoke<number>("start_live_session", {
          title: args.title,
          sourceWindow: args.sourceWindow,
          windowId: args.windowId,
          profile: args.profile,
        });
        const engineReady = freshPrepare === "ready";
        dispatch({ type: "start-resolved", sessionId, engineReady, nowMs: Date.now() });
        return { ok: true, engineReady, prepare: freshPrepare, sessionId };
      } catch (e) {
        const message = String(e);
        if (classifyGuardError(message) === "active-session") {
          await pullStatus();
          return { ok: false, healed: true, message: GUARD_HINTS["active-session"] };
        }
        return { ok: false, message: `启动失败: ${message}` };
      } finally {
        endPending();
      }
    },
    [beginPending, endPending, pullStatus],
  );

  const pause = useCallback(async (): Promise<CaptureActionResult> => {
    if (pendingRef.current) return IGNORED_RESULT;
    beginPending("pause");
    try {
      try {
        await invoke("pause_live_session");
      } catch (e) {
        const guard = classifyGuardError(String(e));
        if (guard === "already-paused" || guard === "no-session") {
          await pullStatus();
          return { ok: false, healed: true, message: GUARD_HINTS[guard] };
        }
        return { ok: false, message: `暂停失败: ${String(e)}` };
      }
      await pullStatus();
      return { ok: true };
    } finally {
      endPending();
    }
  }, [beginPending, endPending, pullStatus]);

  const resume = useCallback(async (): Promise<CaptureActionResult> => {
    if (pendingRef.current) return IGNORED_RESULT;
    beginPending("resume");
    try {
      try {
        await invoke("resume_live_session");
      } catch (e) {
        const guard = classifyGuardError(String(e));
        if (guard === "not-paused" || guard === "no-session") {
          await pullStatus();
          return { ok: false, healed: true, message: GUARD_HINTS[guard] };
        }
        return { ok: false, message: `恢复失败: ${String(e)}` };
      }
      await pullStatus();
      // 自动暂停期 resume：后端 Ok 但物理无变化（auto 条件仍真）——如实提示
      const reason = stateRef.current.pausedReason;
      if (reason === "media" || reason === "foreground") {
        return { ok: true, message: AUTO_RESUME_HINTS[reason] };
      }
      return { ok: true };
    } finally {
      endPending();
    }
  }, [beginPending, endPending, pullStatus]);

  const stop = useCallback(async (): Promise<CaptureActionResult> => {
    if (pendingRef.current) return IGNORED_RESULT;
    beginPending("stop");
    if (stateRef.current.active || stateRef.current.starting) {
      dispatch({ type: "stopping-intent" });
    }
    try {
      const sessionId = await invoke<number | null>("stop_live_session");
      return { ok: true, sessionId };
    } catch (e) {
      return { ok: false, message: `停止失败: ${String(e)}` };
    } finally {
      await pullStatus();
      endPending();
    }
  }, [beginPending, endPending, pullStatus]);

  const actions = useMemo(
    () => ({ start, pause, resume, stop }),
    [start, pause, resume, stop],
  );
  const value = useMemo<CaptureControlValue>(
    () => ({
      active: state.active,
      sessionId: state.sessionId,
      pausedReason: state.pausedReason,
      recovering: state.recovering,
      starting: state.starting,
      stopping: state.stopping,
      pending,
      notice: state.notice,
      ...actions,
    }),
    [state, pending, actions],
  );

  return <CaptureControlCtx.Provider value={value}>{children}</CaptureControlCtx.Provider>;
}

/** 消费 hook：必须在 CaptureStatusProvider 内（每窗口单实例） */
export function useCaptureControl(): CaptureControlValue {
  const value = useContext(CaptureControlCtx);
  if (!value) {
    throw new Error("useCaptureControl 需在 CaptureStatusProvider 内使用（每窗口恰一个实例）");
  }
  return value;
}
