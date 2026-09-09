/**
 * liveCaptureState.test — 采集控制单一状态源纯收敛规则（批 2b）。
 * AAA：事件按到达序幂等收敛；漏检合成对（快速往返）终态=最后事件；watchdog
 * tick 判定 20s 未确认放弃；快照权威校正（守卫错自愈收敛终点）；守卫错分类
 * 与文案映射（文案即 Rust 错误串，变更需同步本文件）。
 * @vitest-environment node（纯 reducer，无需 DOM）
 */
import { describe, expect, it } from "vitest";
import type { LiveSessionStatus, PauseSource } from "../types";
import {
  AUTO_RESUME_HINTS,
  PAUSE_LABELS,
  START_UNCONFIRMED_MS,
  WATCHDOG_INTERVAL_MS,
  classifyGuardError,
  initialState,
  isAutoPaused,
  liveCaptureReducer,
  parsePauseReason,
} from "./liveCaptureState";

/** 构造快照载荷（camelCase 契约；reason 传原始字符串模拟 Option<String>） */
function status(over: Partial<LiveSessionStatus> & { pausedReason?: string | null } = {}): LiveSessionStatus {
  return {
    active: false,
    sessionId: null,
    prepared: false,
    paused: false,
    pausedReason: null,
    tier: null,
    ...over,
  } as LiveSessionStatus;
}

const t0 = 1_000_000;
/** 快照：活动 + 手动暂停 */
const snapPausedManual = status({ active: true, sessionId: 7, paused: true, pausedReason: "manual" });
/** 快照：活动 + 自动（媒体）暂停 */
const snapPausedMedia = status({ active: true, sessionId: 7, paused: true, pausedReason: "media" });

describe("事件序列幂等收敛", () => {
  it("暂停原因跟随最后到达事件（reason 化载荷）", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true }) });
    s = liveCaptureReducer(s, { type: "paused", reason: "media" });
    expect(s.pausedReason).toBe("media");
    s = liveCaptureReducer(s, { type: "paused", reason: "manual" });
    expect(s.pausedReason).toBe("manual");
    s = liveCaptureReducer(s, { type: "resumed" });
    expect(s.pausedReason).toBeNull();
    // resumed 后重复/滞后 paused（含旧载荷无 reason → manual 防御）也收敛
    s = liveCaptureReducer(s, { type: "paused" });
    expect(s.pausedReason).toBe("manual");
  });

  it("漏检合成对（紧邻 paused→resumed）终态=最后事件，无需去抖", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true }) });
    s = liveCaptureReducer(s, { type: "paused", reason: "media" });
    s = liveCaptureReducer(s, { type: "resumed" });
    expect(s.pausedReason).toBeNull();
    expect(s.active).toBe(true);
    // 反向合成对（resumed 是补发的历史恢复，paused 才是真实现状）
    s = liveCaptureReducer(s, { type: "resumed" });
    s = liveCaptureReducer(s, { type: "paused", reason: "foreground" });
    expect(s.pausedReason).toBe("foreground");
  });

  it("多来源叠加以 reason 为准（manual 锁存期 media 事件也如实覆盖显示）", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true }) });
    s = liveCaptureReducer(s, { type: "paused", reason: "media" });
    // 手动恢复但 auto 条件仍持 → 后端再发 paused(media)：终态=media
    s = liveCaptureReducer(s, { type: "resumed", reason: "manual" });
    s = liveCaptureReducer(s, { type: "paused", reason: "media" });
    expect(s.pausedReason).toBe("media");
  });

  it("会话未活动时的滞后 paused/resumed 事件丢弃（快照权威，防停止后残留）", () => {
    const idle = liveCaptureReducer(initialState, { type: "status", payload: "stopped" });
    expect(idle).toEqual(initialState);
    const s = liveCaptureReducer(idle, { type: "paused", reason: "media" });
    expect(s.pausedReason).toBeNull();
    // active=false 但 paused 状态真存在（快照）时事件仍应正常翻转
    const fromSnap = liveCaptureReducer(initialState, {
      type: "snapshot",
      status: status({ active: true, paused: true, pausedReason: "foreground" }),
    });
    expect(liveCaptureReducer(fromSnap, { type: "resumed" }).pausedReason).toBeNull();
  });
});

describe("watchdog tick（20s 未确认放弃）", () => {
  it("starting 且未见 active：<20s 保持等待，≥20s 放弃并给 notice", () => {
    let s = liveCaptureReducer(initialState, {
      type: "start-resolved",
      sessionId: 9,
      engineReady: false,
      nowMs: t0,
    });
    expect(s.starting).toBe(true);
    expect(s.startingAtMs).toBe(t0);
    s = liveCaptureReducer(s, { type: "watchdog-tick", nowMs: t0 + WATCHDOG_INTERVAL_MS * 3 }); // 15s
    expect(s.starting).toBe(true);
    s = liveCaptureReducer(s, { type: "watchdog-tick", nowMs: t0 + START_UNCONFIRMED_MS });
    expect(s.starting).toBe(false);
    expect(s.notice).toBe("start-unconfirmed");
    expect(s.active).toBe(false);
  });

  it("tick 期间快照确认 active → 过渡态即时收口（无需等 20s）", () => {
    let s = liveCaptureReducer(initialState, {
      type: "start-resolved",
      sessionId: 9,
      engineReady: false,
      nowMs: t0,
    });
    s = liveCaptureReducer(s, { type: "snapshot", status: status({ active: true, sessionId: 9 }) });
    expect(s.starting).toBe(false);
    expect(s.active).toBe(true);
    expect(s.startingAtMs).toBeNull();
    // 已收口后 tick 不再产生 notice
    s = liveCaptureReducer(s, { type: "watchdog-tick", nowMs: t0 + 60_000 });
    expect(s.notice).toBeNull();
  });

  it("engineReady 直通路径不设簿记起点", () => {
    const s = liveCaptureReducer(initialState, {
      type: "start-resolved",
      sessionId: 9,
      engineReady: true,
      nowMs: t0,
    });
    expect(s.active).toBe(true);
    expect(s.starting).toBe(false);
    expect(s.startingAtMs).toBeNull();
  });

  it("非 starting/active 状态 tick 为空操作", () => {
    const s = liveCaptureReducer(initialState, { type: "watchdog-tick", nowMs: t0 + 60_000 });
    expect(s).toEqual(initialState);
  });
});

describe("快照权威校正（挂载/看门狗/守卫错自愈共用）", () => {
  it("漂移的暂停原因被快照覆写（事件丢失双轨残留）", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true }) });
    s = liveCaptureReducer(s, { type: "paused", reason: "foreground" });
    // 实际已恢复（手动）——快照校正回 null
    s = liveCaptureReducer(s, { type: "snapshot", status: status({ active: true, sessionId: 7 }) });
    expect(s.pausedReason).toBeNull();
    // 反向：事件丢失但后端已暂停 media——快照补上
    s = liveCaptureReducer(s, { type: "snapshot", status: snapPausedMedia });
    expect(s.pausedReason).toBe("media");
    expect(s.sessionId).toBe(7);
  });

  it("快照 inactive 全量清停采/暂停/停过渡（stopping 期间轮询收口）", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true, paused: true, pausedReason: "manual" }) });
    s = liveCaptureReducer(s, { type: "stopping-intent" });
    expect(s.stopping).toBe(true);
    s = liveCaptureReducer(s, { type: "snapshot", status: status({ active: false }) });
    expect(s).toMatchObject({ active: false, sessionId: null, pausedReason: null, stopping: false });
  });

  it("stopped/failed/fusing 事件全量复位（含 recovering/notice）", () => {
    let s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true, paused: true, pausedReason: "media" }) });
    s = liveCaptureReducer(s, { type: "recovering" });
    expect(s.recovering).toBe(true);
    s = liveCaptureReducer(s, { type: "fusing" });
    expect(s).toEqual(initialState);
    s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true }) });
    s = liveCaptureReducer(s, { type: "paused", reason: "manual" });
    expect(liveCaptureReducer(s, { type: "status", payload: "stopped" })).toEqual(initialState);
    expect(liveCaptureReducer(s, { type: "status", payload: "failed" })).toEqual(initialState);
  });

  it("engine-error 只退等待态不动 active（录制中错误走文案面）", () => {
    let s = liveCaptureReducer(initialState, {
      type: "start-resolved",
      sessionId: 9,
      engineReady: false,
      nowMs: t0,
    });
    s = liveCaptureReducer(s, { type: "engine-error" });
    expect(s).toMatchObject({ starting: false, stopping: false });
    const running = liveCaptureReducer(initialState, {
      type: "snapshot",
      status: status({ active: true, sessionId: 5 }),
    });
    expect(liveCaptureReducer(running, { type: "engine-error" }).active).toBe(true);
  });

  it("recording 事件=新会话起点：清暂停/过渡态", () => {
    const s = liveCaptureReducer(initialState, { type: "snapshot", status: status({ active: true, paused: true, pausedReason: "media" }) });
    const after = liveCaptureReducer(s, { type: "status", payload: "recording" });
    expect(after).toMatchObject({ active: true, pausedReason: null, starting: false, stopping: false, recovering: false });
  });
});

describe("守卫错分类与文案", () => {
  it("四类后端错误串映射（文案变更需同步——契约见 Rust command 层）", () => {
    expect(classifyGuardError("会话已处于暂停")).toBe("already-paused");
    expect(classifyGuardError("会话未处于暂停")).toBe("not-paused");
    expect(classifyGuardError("已有进行中的实时会话，请先停止")).toBe("active-session");
    expect(classifyGuardError("无活动实时会话")).toBe("no-session");
    expect(classifyGuardError("音频设备初始化失败")).toBeNull();
  });

  it("reason 三态文案与 auto 提示齐备", () => {
    expect(PAUSE_LABELS.manual).toBe("⏸ 已暂停");
    expect(PAUSE_LABELS.media).toBe("⏸ 已随视频暂停");
    expect(PAUSE_LABELS.foreground).toBe("⏸ 已自动暂停（切走）");
    expect(AUTO_RESUME_HINTS.media.length).toBeGreaterThan(0);
    expect(AUTO_RESUME_HINTS.foreground.length).toBeGreaterThan(0);
    expect(isAutoPaused("manual")).toBe(false);
    expect(isAutoPaused("media")).toBe(true);
    expect(isAutoPaused(null)).toBe(false);
  });

  it("parsePauseReason 边界防御（Option<String> 未知值按 null）", () => {
    expect(parsePauseReason("manual")).toBe("manual");
    expect(parsePauseReason("media")).toBe("media");
    expect(parsePauseReason("foreground")).toBe("foreground");
    expect(parsePauseReason(null)).toBeNull();
    expect(parsePauseReason(undefined)).toBeNull();
    expect(parsePauseReason("window-blur" as PauseSource)).toBeNull();
  });
});
