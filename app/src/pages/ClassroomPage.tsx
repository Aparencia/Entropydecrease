/**
 * ClassroomPage — 课堂助手独立页面（装配层，参考原项目 ClassroomPage 双列布局）。
 *
 * @ai-context: 布局沿用原项目——左栏配置态（窗口/进程选择卡 → 实时捕获 → 文件素材），
 *              右栏内容区（空态为配置说明书，结果态展示最近笔记/实时字幕）。
 * @ai-context: v0.2.0 新增实时捕获链路（REQ-007~012）：选择窗口 → 开始 → 后台
 *              捕获音频+屏幕+流式转写+字幕 OCR；事件 live:asr-partial / live:subtitle /
 *              live:error / live:status 实时回显；停止后可到「会话」页查看时间轴。
 * @ai-context: 2026-08 审查硬拆（>600 硬上限）：右栏内容区拆至 ClassroomRightPane，
 *              文件素材输入与提取拆至 MaterialInputPanel——本文件回归装配层职责。
 * @ai-context: 批 2b 采集生命周期收敛：active/sessionId/pausedReason/starting/
 *              stopping 与 live:status/paused/resumed 事件不再由本页自持——
 *              单一状态源在 CaptureStatusProvider（useCaptureControl，主窗 App
 *              挂载）。本页只剩两职责：①按钮动作接 context（pending 防连点、
 *              守卫错自愈文案如实展示）；②页面级提示（模型/窗口丢失/帧停更/
 *              融合卡片/状态行文案）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WindowSelectCard } from "../components/WindowSelectCard";
import VideoImportPanel from "../components/VideoImportPanel";
// 2026-08-21 用户需求：设置类面板迁出至设置页（模型/音频/AI/数据/词表）
// 2026-08 C1：引擎与模型就绪清单（开始前准备流——聚合现有只读命令）
import ReadyCheckCard from "../components/ReadyCheckCard";
import { SystemStatusBadge } from "../components/SystemStatusBadge";
// 2026-08 审查硬拆：右栏内容区 / 文件素材输入与提取
import ClassroomRightPane from "../components/ClassroomRightPane";
// 批 0-C2 Task 4：左栏实时捕获卡整体抽出（纯展示适配器——采集/模型状态由本页注入）
import ClassroomCapturePanel from "../components/ClassroomCapturePanel";
// 批 0-C2 Task 4 步 3：三条页面级提示横幅整体抽出（ASR 降级/窗口丢失/画面停更）
import ClassroomBanners from "../components/ClassroomBanners";
import MaterialInputPanel from "../components/MaterialInputPanel";
import ColumnResizer from "../components/ColumnResizer";
import ColumnBar from "../components/ColumnBar";
import { useColumnLayout } from "../hooks/useColumnLayout";
// v0.11.7：图文采集（第三动线：截屏导入图文内容 → 图文会话）
import PhotoCapturePanel from "../components/PhotoCapturePanel";
// v0.20.4（REQ-303）：web 采集动线面板
import WebImportPanel from "../components/WebImportPanel";
// 批 2b：采集控制单一状态源（暂停/启停状态与动作全收敛于此——页内不再
// 订阅 live:status/live:paused/live:resumed 与 media-* 双轨）
import { useCaptureControl } from "../hooks/useLiveCaptureControl";
// 批 0-C2 Task 4 步 2：页面级提示/融合编排/流式模型与预热状态下沉
// （D1：warmUp 由本页注入——model:download-done 内依赖它）
import { useClassroomHints, type PrepareState } from "../hooks/useClassroomHints";
import type { Note, WindowInfo, ProfileKind } from "../types";
// v0.12.3：浮窗状态快照类型（与 Rust FloatUiView camelCase 契约同源；
// 审查 LOW-3：统一共享类型替代内联重复声明）
import type { FloatSnapshot } from "../hooks/useFloatWindow";
// Low 清扫：标题截断长度单一定义源（与 MaterialInputPanel 共享）
import { NOTE_TITLE_MAX_LEN } from "../utils/constants";

export default function ClassroomPage({ onOpenSessions }: { onOpenSessions?: (sessionId: number) => void }) {
  // v0.15：左栏列状态（可拖拽 + 记忆 + 窄窗折叠；默认 320=历史值）
  const leftCol = useColumnLayout("classroom-left", { default: 320, min: 240, max: 420, autoFoldBelow: 860 });
  // 批 2b：采集生命周期单一状态源（挂载拉取+事件+看门狗在 provider；本页消费）
  const { active, sessionId, pausedReason, starting, stopping, pending, notice, start, pause, resume, stop } =
    useCaptureControl();
  // ── 窗口/进程选择 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  // ── 实时捕获页面级提示与编排（v0.2.0；采集生命周期状态见上 useCaptureControl）──
  // 批 0-C2 Task 4 步 2：融合/模型/预热/横幅等提示态整体下沉 useClassroomHints
  // （调用点在下方 warmUp 之后——D1 要求把 warmUp 作为入参注入）；本页只剩
  // 系统窗口开关与浮窗快照两个页面级开关。
  // v0.19.2：系统窗口默认过滤（终端/资源管理器等）——开关找回兜底
  const [showSystemWindows, setShowSystemWindows] = useState(false);
  // v0.12.3：浮窗状态（按钮语义：浮窗化 ⇄ 收起 ⇄ 解锁穿透；Rust 单一来源）
  const [floatSnap, setFloatSnap] = useState<FloatSnapshot>({ open: false, locked: false, topmost: true });

  // ── 素材与结果（文件流水线，v0.1.0）──
  // 素材路径/处理中状态已下沉 MaterialInputPanel（审查硬拆）；父级仅保留产物与提示
  const [lastNote, setLastNote] = useState<Note | null>(null);
  const [status, setStatus] = useState("");

  const refreshWindows = useCallback(async (background = false) => {
    if (!background) setWindowsLoading(true);
    try {
      const list = await invoke<WindowInfo[]>("list_windows");
      setWindows(list);
    } catch (e) {
      setStatus(`窗口枚举失败: ${e}`);
    } finally {
      if (!background) setWindowsLoading(false);
    }
  }, []);

  // 首次进入自动枚举一次窗口
  useEffect(() => {
    void refreshWindows();
  }, [refreshWindows]);

  // P3：预热引擎——进课堂助手页（=开始选窗口）即后台加载，点"开始"毫秒级
  // 启动；幂等（后端已有预备则返回当前状态）；失败回 idle（start 有内联兜底）
  const warmUp = useCallback(() => {
    void invoke<string>("prepare_live_session")
      .then((s) => setPrepareState(s as PrepareState))
      .catch(() => setPrepareState("idle"));
  }, []);

  const warmedRef = useRef(false);
  useEffect(() => {
    // dev StrictMode 会双跑 effect（挂载→cleanup→挂载）：预热是秒级重资源
    // 加载，第二次直接跳过——否则首次预热会被 replay 的 cleanup 取消（1s
    // join 超时 detach）后再开第二个加载线程，白跑一次引擎加载
    if (warmedRef.current) return;
    warmedRef.current = true;
    warmUp();
    // TD-004：课堂助手页常驻挂载（display:none 切换不卸载）——本 cleanup 只
    // 在应用卸载/StrictMode replay 时触发，**不在此释放**：release 会取消正在
    // 加载的预热线程造成 dev 双加载与"已完成→随即取消"误读；页面无卸载时机，
    // 引擎回收由 15min TTL 兜底（release_live_prepare 命令保留供未来显式
    // 回收扩展，当前无调用方——v0.19.3 审查 LOW-2 注释如实化）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 页面级提示 / 融合编排 / 流式模型与预热状态整体下沉 useClassroomHints（批 0-C2
  // Task 4 步 2）。D1：`warmUp`（含 warmedRef 一次性守卫）留在本页并作为入参注入——
  // `model:download-done` 内要调它；`prepareState` 由 hook 自持并导出 setter，供下方
  // startLive 按 start 返回的 prepare 重同步（v0.19.3 审查 LOW-2）。
  const {
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
  } = useClassroomHints({ active, starting, notice, warmUp, onStatus: setStatus });

  // v0.5.0 M6（REQ-051）：用户截图快捷键 Ctrl+Shift+S（最高权重关键图信号）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        void invoke<string>("save_user_screenshot")
          .then(() => setStatus("📷 截图已保存（关键图候选置顶）"))
          .catch((err) => setLiveError(`截图失败: ${err}`));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // v0.12.0 M6：浮窗化快捷键 Ctrl+Shift+F（采集中一键浮窗——全屏看视频不中断）
  // v0.12.6（ADR-025）：三态语义收拢到 Rust float_toggle（单一来源，防主窗键与
  // 全局快捷键双触发双翻转）——前端按钮/键只调 toggle，状态由 float:state 事件回流
  const toggleFloat = useCallback(() => {
    void invoke<FloatSnapshot>("float_toggle")
      .then(setFloatSnap)
      .catch((err) => setLiveError(`浮窗切换失败: ${err}`));
  }, []);

  // v0.12.3：浮窗状态同步（挂载拉取 + float:state 事件订阅——Rust 单一来源）
  useEffect(() => {
    let disposed = false;
    const unlisteners: Promise<() => void>[] = [];
    void invoke<FloatSnapshot>("float_state")
      .then((s) => {
        if (!disposed) setFloatSnap(s);
      })
      .catch(() => undefined);
    unlisteners.push(
      listen<FloatSnapshot>("float:state", (e) => {
        if (!disposed) setFloatSnap(e.payload);
      }),
    );
    return () => {
      disposed = true;
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // v0.12.6：仅浮窗关闭时生效——浮窗打开期间快捷键已升级为全局快捷键
      // （Rust 侧统一处理，语义见 float_toggle_core），此处拦截避免双触发
      if (active && !floatSnap.open && e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        toggleFloat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, floatSnap.open, toggleFloat]);

  // ── 视频类型档案（v0.5.0 M1，REQ-043：混合检测用户确认结果）──
  // v0.7.1：初始「未知」——未检测/无法自动识别时如实标注（参数走默认档零回归）
  const [profileKind, setProfileKind] = useState<ProfileKind>("unknown");

  /** 开始实时捕获（REQ-007~012）：窗口可选（未选=全屏）；携带档案（REQ-043）。
   *  批 2b：受理/等待态 starting、prepare 重同步、守卫错自愈、20s 看门狗全部
   *  收敛于控制 hook（useCaptureControl.start）——本函数只组装参数并落地
   *  结果文案（状态行），不再维护任何采集状态；防双击由 hook pending 挡住 */
  const startLive = async () => {
    setLiveError("");
    const title = selectedWindow ? selectedWindow.title.slice(0, NOTE_TITLE_MAX_LEN) : "实时课堂";
    const outcome = await start({
      title,
      sourceWindow: selectedWindow?.title ?? null,
      windowId: selectedWindow?.id ?? null,
      profile: profileKind,
    });
    if (!outcome.ok) {
      // 无 message = 连点被 pending 忽略——静默，不当失败弹错
      if (outcome.message) setLiveError(outcome.message);
      return;
    }
    // 新会话开始：清除旧融合直达卡片
    setFusedSessionId(null);
    // v0.19.3 审查 LOW-2：点击时重同步的预热状态由 hook 返回（prepare 幂等）
    if (outcome.prepare) setPrepareState(outcome.prepare as PrepareState);
    // 就绪态点击=交接路径（引擎已加载，resolve 即已开录）；非就绪等 recording
    // 事件——到达后由 starting 收口 effect 覆写本行（见"recording 收口文案"）
    if (outcome.engineReady) {
      setStatus("实时捕获已开始");
    } else {
      setStatus("引擎就绪中…就绪后自动开始（音频与画面同刻启动）");
    }
  };

  /** 停止实时捕获（批 2b：stopping 过渡态与状态收敛在控制 hook——本函数只
   *  落地页面编排：浮窗关闭与下次秒启预热） */
  const stopLive = async () => {
    const outcome = await stop();
    if (!outcome.ok) {
      // 无 message = 连点被 pending 忽略——静默
      if (outcome.message) setLiveError(outcome.message);
      return;
    }
    setStatus("已停止会话，融合完成后可到「会话」页查看");
    // v0.12.0 M6：停止后自动关闭采集浮窗（若已打开）
    void invoke("close_capture_float").catch(() => undefined);
    // P3：停止后重新预热（页面仍在，下一次开始同样秒启）
    warmUp();
  };

  /** 暂停实时捕获（2026-08 A1 硬暂停：完全停采，时间轴冻结；动作经控制 hook——
   *  守卫错自愈后以 outcome.message 如实提示，不吞） */
  const pauseLive = async () => {
    setLiveError("");
    const outcome = await pause();
    if (!outcome.ok) {
      if (outcome.message) setLiveError(outcome.message); // 无 message=连点忽略
    } else if (outcome.message) {
      setStatus(outcome.message);
    }
  };

  /** 恢复实时捕获（批 2b：自动暂停（media/foreground）期后端 Ok 但物理无变化——
   *  hook 返回 AUTO_RESUME_HINTS 提示，UI 不宣称"恢复成功"） */
  const resumeLive = async () => {
    setLiveError("");
    const outcome = await resume();
    if (!outcome.ok) {
      if (outcome.message) setLiveError(outcome.message); // 无 message=连点忽略
    } else if (outcome.message) {
      setStatus(outcome.message);
    }
  };

  /** 素材流水线（v0.1.0）：选素材/提取逻辑已下沉 MaterialInputPanel（审查硬拆） */

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：配置面板（窗口选择 → 素材 → 启动按钮；v0.15 可拖拽/折叠） ── */}
      {leftCol.folded ? (
        <ColumnBar icon="📡" title="课堂助手" onClick={leftCol.expand} />
      ) : (
      <div
        style={{
          width: leftCol.width,
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>📡 课堂助手</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* M7/REQ-042 F2/G2：健康徽标 + 诊断面板（开发期可见） */}
            <SystemStatusBadge />
            <button onClick={() => leftCol.setManualFolded(true)} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠侧栏">⟨</button>
          </div>
        </div>

        {/* 批 0-C2 Task 4 步 3：三条页面级横幅整体抽出（含"为什么没有第四条"注释） */}
        <ClassroomBanners
          asrDegraded={asrDegraded}
          windowLost={windowLost}
          frameStalledSecs={frameStalledSecs}
          onDismissWindowLost={dismissWindowLost}
        />

        <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 2026-08 C1：引擎与模型就绪清单（开始前准备流——缺什么一目了然） */}
          <ReadyCheckCard />

          {/* 目标窗口/进程选择（v0.2.0 实时捕获上下文） */}
          {/* v0.19.2（用户实测）：系统窗口默认过滤，开关找回（能力不丢） */}
          {windows.some((w) => w.systemWindow) && (
            <label style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showSystemWindows}
                onChange={(e) => setShowSystemWindows(e.target.checked)}
              />
              显示系统窗口（终端/资源管理器等）
            </label>
          )}
          <WindowSelectCard
            windows={showSystemWindows ? windows : windows.filter((w) => !w.systemWindow)}
            selected={selectedWindow}
            onSelect={setSelectedWindow}
            onRefresh={refreshWindows}
            loading={windowsLoading}
          />

          {/* 实时捕获（v0.2.0：WASAPI + DXGI + 流式 ASR + 字幕 OCR） */}
          {/* 批 0-C2 Task 4：卡片整体抽出至 ClassroomCapturePanel（纯展示适配器——
              采集/模型/预热状态与全部动作由本页注入，卡内不再消费 useCaptureControl） */}
          <ClassroomCapturePanel
            active={active}
            starting={starting}
            pending={pending}
            sessionId={sessionId}
            pausedReason={pausedReason}
            liveError={liveError}
            modelStatus={modelStatus}
            modelDownloading={modelDownloading}
            modelProgress={modelProgress}
            modelError={modelError}
            prepareState={prepareState}
            floatSnap={floatSnap}
            onStart={startLive}
            onStop={stopLive}
            onPause={pauseLive}
            onResume={resumeLive}
            onToggleFloat={toggleFloat}
            onDownloadModel={downloadModel}
            onRetryModelStatus={retryModelStatus}
            onStatus={setStatus}
            onLiveError={setLiveError}
          />

          {/* 视频文件导入（v0.3.0：REQ-015 第二入口，字幕优先 + ASR fallback） */}
          <VideoImportPanel onOpenSessions={onOpenSessions} />

          {/* 2026-08-21 用户需求：OCR 设备/音频预处理/备份/AI 服务/词表/模型管理等
              设置类面板已迁出至「⚙ 设置」页——课堂助手左栏仅保留采集动线 */}

          {/* 素材输入 + 提取按钮（v0.1.0 文件流水线；审查硬拆——MaterialInputPanel） */}
          <MaterialInputPanel
            windowTitle={selectedWindow?.title ?? null}
            onNote={setLastNote}
            onStatus={setStatus}
          />

          {/* v0.11.7：图文采集（第三动线：截屏导入图文内容 → 图文会话） */}
          <PhotoCapturePanel onOpenSessions={onOpenSessions} onStatus={setStatus} />

          {/* v0.20.4（REQ-303）：web 采集（第四条动线：URL 静态直取 → kind=web 会话） */}
          <WebImportPanel onOpenSessions={onOpenSessions} onStatus={setStatus} />

          {status && <p style={{ fontSize: 12, color: "#2563eb" }}>{status}</p>}
        </div>
      </div>
      )}
      <ColumnResizer onResize={leftCol.resizeBy} onReset={leftCol.resetWidth} />

      {/* ── 右栏：内容区（档案配置 + 实时活动面板 / 笔记预览 / 空态说明书） ── */}
      {/* 2026-08 审查硬拆：右栏内容区整体下沉 ClassroomRightPane */}
      <ClassroomRightPane
        liveActive={active}
        stopping={stopping}
        fusionActive={fusionActive}
        liveSessionId={sessionId}
        lastNote={lastNote}
        selectedWindow={selectedWindow}
        fusedSessionId={fusedSessionId}
        onOpenSessions={onOpenSessions}
        onDismissFused={() => setFusedSessionId(null)}
        onProfileChange={setProfileKind}
      />
    </div>
  );
}
