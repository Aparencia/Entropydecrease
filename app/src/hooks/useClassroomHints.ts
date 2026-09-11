/**
 * useClassroomHints — 课堂助手页级提示 / 融合编排 / 流式模型与预热状态（批 0-C2
 * Task 4 步 2 自 ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: 职责 = 页面级提示横幅与状态行文案的**唯一状态源**：三条采集期横幅
 *              （ASR 降级 / 目标窗口丢失 / 画面停更）+ 融合三事件对右栏直达卡片与
 *              状态行的影响 + 流式模型四态与下载进度 + 引擎预热状态（prepareState）。
 *              采集生命周期（active/starting/pending/notice）由页面从
 *              useCaptureControl 注入——本 hook 不自持、也不再订阅 live:status。
 * @ai-context: ★ D1（最高危隐性耦合）：`warmUp` 必须由页面**注入**而非本 hook 自建
 *              ——`model:download-done` 监听里要调它（下载完成即预热，用户无需重进
 *              页面）；`warmedRef` 的 StrictMode 一次性守卫留在页面与 warmUp 同处。
 *              `prepareState` 由本 hook 自持并**导出 setter**：页面的 startLive 需按
 *              start 返回的 prepare 重同步（v0.19.3 审查 LOW-2）。少任何一条都不会
 *              编译报错，而是"下载完成即预热"或"点击时重同步"静默消失。
 * @ai-context: 副作用 = 12 条 listen（live:error / asr-degraded / asr-recovered /
 *              window-lost / frame-stalled / frame-recovered / session:fusing /
 *              fused / fusion-failed / model:download-progress / done / failed）+
 *              2 条启动查询（asr_streaming_model_status / model_download_status）+
 *              3 条状态镜像 effect（会话结束复位横幅 / starting 收口文案 / 看门狗结论）。
 * @ai-context: 边界（本批只搬不改）——`status`/`lastNote` 留页面（D5），本 hook 只经
 *              `onStatus` 写回，避免状态行双源；三条横幅渲染在 ClassroomBanners、
 *              模型卡在 ClassroomCapturePanel；B1/G6/G7 既有缺陷原样保留。
 * @ai-context: effect deps 逐字保留原值（`[]` / `[active]` / `[starting, active]` /
 *              `[notice]`）——`onStatus`（=setStatus）与 `warmUp`（useCallback []）
 *              身份恒定，故不入 deps 不改变重订阅时机（与拆分前完全一致）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WatchdogNotice } from "./liveCaptureState";
import type { DownloadProgress, DownloadStatus, StreamingModelStatus } from "../types";

/** P3：引擎预热状态（与 Rust PrepareStatus 的 camelCase 契约一致） */
export type PrepareState = "idle" | "loading" | "ready" | "failed";

interface Options {
  /** 采集中（会话结束 → 清空三条页面级提示横幅） */
  active: boolean;
  /** 启动过渡态（starting 结束且已 active → 覆写状态行"实时捕获已开始"） */
  starting: boolean;
  /** 看门狗结论（start-unconfirmed → 状态行镜像） */
  notice: WatchdogNotice | null;
  /** 页面持有的预热回调（D1：`model:download-done` 依赖它，不得在本 hook 内重建） */
  warmUp: () => void;
  /** 状态行写入（D5：status 状态源在页面） */
  onStatus: (message: string) => void;
}

export function useClassroomHints({ active, starting, notice, warmUp, onStatus }: Options) {
  // ── 实时捕获页面级提示与编排（v0.2.0；采集生命周期状态见 useCaptureControl）──
  // 后台融合期（session:fusing 期间，右侧面板显示"融合中"）
  const [fusionActive, setFusionActive] = useState(false);
  // 2026-08 A4：最近融合完成的会话 id（右侧"查看时间轴"直达卡片；切换窗口/新会话时清除）
  const [fusedSessionId, setFusedSessionId] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState<StreamingModelStatus | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelProgress, setModelProgress] = useState<DownloadProgress | null>(null);
  const [modelError, setModelError] = useState("");
  const [liveError, setLiveError] = useState("");
  // M7/REQ-042 F5：ASR 降级提示（流式引擎静默失效可见化）
  const [asrDegraded, setAsrDegraded] = useState<string | null>(null);
  // TD-2026-08-20-I 清偿：目标窗口丢失横幅（采集中画面源不可见提示）
  const [windowLost, setWindowLost] = useState(false);
  // REQ-281（v0.19.6）：画面源停更提示（WGC 长时间无新帧——区别于窗口关闭；
  // 恢复帧/停止采集自动清除；null=未停更）
  const [frameStalledSecs, setFrameStalledSecs] = useState<number | null>(null);
  // P3：引擎预热状态（选窗口阶段后台加载；与 Rust PrepareStatus 契约一致）
  const [prepareState, setPrepareState] = useState<PrepareState>("idle");

  // 页面级提示与融合编排监听（v0.2.0）。批 2b：live:status / live:paused /
  // live:resumed / live:media-* 不再在此订阅——采集生命周期（含随播随停随前台
  // 自动暂停）收敛于 CaptureStatusProvider（useCaptureControl），防同窗双监听
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      // 引擎错误横幅（页面级文案；starting 退出由控制 hook 的 engine-error 收敛）
      listen<string>("live:error", (e) => setLiveError(e.payload)),
      // M7/REQ-042 F5：ASR 降级提示（静默失败可见化；会话停止时清除）
      listen<string>("live:asr-degraded", (e) => setAsrDegraded(e.payload)),
      // 降级恢复（审查修复）：清除降级横幅，避免残留误导
      listen("live:asr-recovered", () => setAsrDegraded(null)),
      // TD-2026-08-20-I 清偿：目标窗口丢失提示（采集中画面源不可见的唯一信号；
      // 会话停止时清除）
      listen("live:window-lost", () => setWindowLost(true)),
      // REQ-281（v0.19.6）：画面停更提示（帧恢复/停止时清除——不复原真实播放器
      // 状态，仅提示画面源未出新帧；伴随 WGC 会话自愈重试）
      listen<{ silentSecs: number }>("live:frame-stalled", (e) => setFrameStalledSecs(e.payload.silentSecs)),
      listen("live:frame-recovered", () => setFrameStalledSecs(null)),
      // 后台融合事件（REQ-031）：面板显示"融合中"，完成后提示并回退
      // 2026-08 A4：记录融合完成会话 id（右侧"查看时间轴"直达卡片）。
      // （fusing 同时是采集停止的兜底信号——其状态收敛在控制 hook，此处只管
      // 面板显示与直达卡片，非重复状态机）
      listen<number>("session:fusing", (e) => {
        setFusionActive(true);
        setFusedSessionId(e.payload);
      }),
      listen<number>("session:fused", (e) => {
        setFusionActive(false);
        setFusedSessionId(e.payload);
        onStatus("融合完成，可到「会话」页查看融合时间轴");
      }),
      listen<string>("session:fusion-failed", (e) => {
        setFusionActive(false);
        // 审查修复：融合失败不得残留"✅ 融合完成"直达卡片（fusing 已预置 id）
        setFusedSessionId(null);
        onStatus(`融合失败（原始段保留）: ${e.payload}`);
      }),
      // 模型自动下载进度（ADR-003）
      listen<DownloadProgress>("model:download-progress", (e) => setModelProgress(e.payload)),
      listen<boolean>("model:download-done", () => {
        setModelDownloading(false);
        setModelProgress(null);
        // 审查补充：状态复查失败不能产生 unhandled rejection（与 TD-016 同口径）
        void invoke<StreamingModelStatus>("asr_streaming_model_status")
          .then(setModelStatus)
          .catch((e) => setModelError(`模型状态复查失败: ${e}`));
        // P3：模型就绪后立即预热（下载完成即可开始即录，无需重进页面）
        warmUp();
      }),
      // 下载失败：重置"下载中"态并展示错误（审查 M4 修复）
      listen<string>("model:download-failed", (e) => {
        setModelDownloading(false);
        setModelProgress(null);
        setModelError(`下载失败: ${e.payload}（可重试或手动放置模型）`);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 会话结束侧效复位（原 live:status stopped/failed 分支职责——停止信号现由
  // 控制 hook 收敛为 active=false；此处只清页面级提示横幅，不留双状态）
  useEffect(() => {
    if (!active) {
      setAsrDegraded(null);
      setWindowLost(false);
      setFrameStalledSecs(null);
    }
  }, [active]);

  // recording 收口文案：starting 结束时若已 active → 覆写"实时捕获已开始"
  // （engineReady=false 受理路径的"引擎就绪中…"在此被真实开录事件替换；
  // 与 v0.19.3 MED-1 的语义一致——starting 迁移不得残留就绪中文案）
  const prevStartingRef = useRef(false);
  useEffect(() => {
    const prev = prevStartingRef.current;
    prevStartingRef.current = starting;
    if (prev && !starting && active) onStatus("实时捕获已开始");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting, active]);

  // 看门狗结论镜像到状态行（unconfirmed=引擎未开录可重试——20s 未确认的单一
  // 去向，见 liveCaptureState.WatchdogNotice 注释；"start-restored" 已删无产出
  // 分支，审查 P3-6——恢复成功路径由轮询快照逐拍收敛，无独立文案可镜像）
  useEffect(() => {
    if (notice === "start-unconfirmed") onStatus("启动状态未确认——引擎未开录；可直接重试（就绪即秒开）");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  // 启动时检查流式模型状态 + 下载状态恢复。
  // 批 2b：活动会话恢复（live_session_status 拉取）已下沉 CaptureStatusProvider
  // 挂载兜底——本页不再独立查询（防双查询/双状态机）
  // TD-016：invoke 失败不再静默——展示错误并允许重试（此前按钮永久禁用且无提示）
  useEffect(() => {
    void invoke<StreamingModelStatus>("asr_streaming_model_status")
      .then(setModelStatus)
      .catch((e) => setModelError(`模型状态查询失败: ${e}`));
    void invoke<DownloadStatus>("model_download_status").then((d) => {
      setModelDownloading(d.state === "downloading");
      if (d.state === "failed" && d.error) setModelError(d.error);
    });
  }, []);

  /** 重试模型状态检查（TD-016：查询失败后手动恢复按钮可用性） */
  const retryModelStatus = async () => {
    setModelError("");
    try {
      const s = await invoke<StreamingModelStatus>("asr_streaming_model_status");
      setModelStatus(s);
    } catch (e) {
      setModelError(`模型状态查询失败: ${e}`);
    }
  };

  /** 一键下载流式 ASR 模型（应用内自动配置） */
  const downloadModel = async () => {
    setModelError("");
    setModelDownloading(true);
    try {
      await invoke("download_streaming_model");
    } catch (e) {
      setModelError(`下载启动失败: ${e}`);
      setModelDownloading(false);
    }
  };

  /** 「知道了」关闭目标窗口丢失横幅（渲染在 ClassroomBanners） */
  const dismissWindowLost = useCallback(() => setWindowLost(false), []);

  return {
    fusionActive,
    fusedSessionId,
    setFusedSessionId,
    modelStatus,
    modelDownloading,
    modelProgress,
    modelError,
    liveError,
    setLiveError,
    asrDegraded,
    windowLost,
    dismissWindowLost,
    frameStalledSecs,
    prepareState,
    setPrepareState,
    retryModelStatus,
    downloadModel,
  };
}
