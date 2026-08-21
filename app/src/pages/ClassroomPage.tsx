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
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WindowSelectCard } from "../components/WindowSelectCard";
import VideoImportPanel from "../components/VideoImportPanel";
// 2026-08-21 用户需求：设置类面板迁出至设置页（模型/音频/AI/数据/词表）
// 2026-08 A2：实时音频电平条（VU 表——试听自检实时化）
import AudioLevelMeter from "../components/AudioLevelMeter";
// 2026-08 C1：引擎与模型就绪清单（开始前准备流——聚合现有只读命令）
import ReadyCheckCard from "../components/ReadyCheckCard";
import { SystemStatusBadge } from "../components/SystemStatusBadge";
// 2026-08 审查硬拆：右栏内容区 / 文件素材输入与提取
import ClassroomRightPane from "../components/ClassroomRightPane";
import MaterialInputPanel from "../components/MaterialInputPanel";
import type { Note, WindowInfo, StreamingModelStatus, LiveSessionStatus, DownloadProgress, DownloadStatus, ProfileKind } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

/** P3：引擎预热状态（与 Rust PrepareStatus 的 camelCase 契约一致） */
type PrepareState = "idle" | "loading" | "ready" | "failed";

export default function ClassroomPage({ onOpenSessions }: { onOpenSessions?: (sessionId: number) => void }) {
  // ── 窗口/进程选择 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  // ── 实时捕获（v0.2.0）──
  const [liveActive, setLiveActive] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<number | null>(null);
  // 2026-08 A1：会话暂停（硬暂停——完全停采；由 live:paused/resumed 事件驱动）
  const [livePaused, setLivePaused] = useState(false);
  // 停止过渡期（点停止 → stopped 事件到达前，右侧面板保持显示）
  const [stopping, setStopping] = useState(false);
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
  // P3：引擎预热状态（选窗口阶段后台加载；与 Rust PrepareStatus 契约一致）
  const [prepareState, setPrepareState] = useState<PrepareState>("idle");

  // ── 素材与结果（文件流水线，v0.1.0）──
  // 素材路径/处理中状态已下沉 MaterialInputPanel（审查硬拆）；父级仅保留产物与提示
  const [lastNote, setLastNote] = useState<Note | null>(null);
  const [status, setStatus] = useState("");

  const refreshWindows = useCallback(async () => {
    setWindowsLoading(true);
    try {
      const list = await invoke<WindowInfo[]>("list_windows");
      setWindows(list);
    } catch (e) {
      setStatus(`窗口枚举失败: ${e}`);
    } finally {
      setWindowsLoading(false);
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

  useEffect(() => {
    warmUp();
    // 离开页面释放预热引擎（内存 ~数百 MB；后端另有 15min TTL 兜底）
    return () => {
      void invoke("release_live_prepare").catch(() => {});
    };
  }, [warmUp]);

  // 实时会话事件监听（v0.2.0；字幕/语音实时内容由右侧 LiveActivityPanel 自监听展示）
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<string>("live:error", (e) => setLiveError(e.payload)),
      // M7/REQ-042 F5：ASR 降级提示（静默失败可见化；会话停止时清除）
      listen<string>("live:asr-degraded", (e) => setAsrDegraded(e.payload)),
      // 降级恢复（审查修复）：清除降级横幅，避免残留误导
      listen("live:asr-recovered", () => setAsrDegraded(null)),
      // TD-2026-08-20-I 清偿：目标窗口丢失提示（采集中画面源不可见的唯一信号；
      // 会话停止时清除）
      listen("live:window-lost", () => setWindowLost(true)),
      // 修复（v0.3.0 审查反馈）：必须区分 payload——Rust 侧在 ASR 模型加载成功后
      // 才 emit "recording"（比 invoke resolve 晚 1-3s），旧实现无条件清态导致
      // 按钮变回"开始采集"而后端会话仍在跑，再点开始被拒绝
      listen<string>("live:status", (e) => {
        if (e.payload === "recording") {
          // 后端确认录制中：保持/恢复活动态（invoke resolve 可能更早到达）
          setLiveActive(true);
          setStopping(false);
        } else {
          // stopped / failed：会话已结束
          setLiveActive(false);
          setLiveSessionId(null);
          setStopping(false);
          setAsrDegraded(null);
          setWindowLost(false);
          setLivePaused(false);
        }
      }),
      // 后台融合事件（REQ-031）：面板显示"融合中"，完成后提示并回退
      // 2026-08 A4：记录融合完成会话 id（右侧"查看时间轴"直达卡片）
      listen<number>("session:fusing", (e) => {
        setFusionActive(true);
        setFusedSessionId(e.payload);
      }),
      listen<number>("session:fused", (e) => {
        setFusionActive(false);
        setFusedSessionId(e.payload);
        setStatus("融合完成，可到「会话」页查看融合时间轴");
      }),
      listen<string>("session:fusion-failed", (e) => {
        setFusionActive(false);
        // 审查修复：融合失败不得残留"✅ 融合完成"直达卡片（fusing 已预置 id）
        setFusedSessionId(null);
        setStatus(`融合失败（原始段保留）: ${e.payload}`);
      }),
      // 2026-08 A1：暂停/恢复事件（硬暂停状态驱动按钮组与徽标）
      listen("live:paused", () => setLivePaused(true)),
      listen("live:resumed", () => setLivePaused(false)),
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
  }, []);

  // TD-042：停止过渡态超时兜底——live:status stopped 事件异常丢失时，
  // 10s 后自动清除过渡态（防右侧面板常驻"已停止"）
  useEffect(() => {
    if (!stopping) return;
    const timer = setTimeout(() => setStopping(false), 10_000);
    return () => clearTimeout(timer);
  }, [stopping]);

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

  // 启动时检查流式模型状态 + 活动会话恢复 + 下载状态恢复
  // TD-016：invoke 失败不再静默——展示错误并允许重试（此前按钮永久禁用且无提示）
  useEffect(() => {
    void invoke<StreamingModelStatus>("asr_streaming_model_status")
      .then(setModelStatus)
      .catch((e) => setModelError(`模型状态查询失败: ${e}`));
    void invoke<LiveSessionStatus>("live_session_status").then((s) => {
      setLiveActive(s.active);
      setLiveSessionId(s.sessionId);
    });
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

  // ── 视频类型档案（v0.5.0 M1，REQ-043：混合检测用户确认结果）──
  // v0.7.1：初始「未知」——未检测/无法自动识别时如实标注（参数走默认档零回归）
  const [profileKind, setProfileKind] = useState<ProfileKind>("unknown");

  /** 开始实时捕获（REQ-007~012）：窗口可选（未选=全屏）；携带档案（REQ-043） */
  const startLive = async () => {
    setLiveError("");
    try {
      const title = selectedWindow ? selectedWindow.title.slice(0, 60) : "实时课堂";
      const id = await invoke<number>("start_live_session", {
        title,
        sourceWindow: selectedWindow?.title ?? null,
        windowId: selectedWindow?.id ?? null,
        profile: profileKind,
      });
      setLiveActive(true);
      setLiveSessionId(id);
      setFusedSessionId(null); // 新会话开始：清除旧融合直达卡片
      setStatus(`实时捕获已开始（会话 #${id}）`);
    } catch (e) {
      // 防御性恢复（修复反馈）：UI 与后端状态不同步（事件丢失/竞态）时，
      // 查询真实状态恢复按钮语义，避免"假空闲"下重复点击被后端拒绝
      if (String(e).includes("已有进行中的实时会话")) {
        try {
          const s = await invoke<LiveSessionStatus>("live_session_status");
          setLiveActive(s.active);
          setLiveSessionId(s.sessionId);
          setLiveError(s.active ? "检测到采集仍在进行，已恢复状态；如需重启请先停止" : "状态已恢复");
        } catch {
          setLiveError(`启动失败: ${e}`);
        }
      } else {
        setLiveError(`启动失败: ${e}`);
      }
    }
  };

  /** 停止实时捕获 */
  const stopLive = async () => {
    // 停止过渡期：面板保持显示（live:status stopped 到达后由监听清除）
    setStopping(true);
    try {
      const id = await invoke<number | null>("stop_live_session");
      setLiveActive(false);
      setLiveSessionId(null);
      setLivePaused(false);
      setStatus(id ? `已停止会话 #${id}，融合完成后可到「会话」页查看` : "无活动会话");
      // P3：停止后重新预热（页面仍在，下一次开始同样秒启）
      warmUp();
    } catch (e) {
      setStopping(false);
      setLiveError(`停止失败: ${e}`);
    }
  };

  /** 暂停实时捕获（2026-08 A1 硬暂停：完全停采，时间轴冻结） */
  const pauseLive = async () => {
    setLiveError("");
    try {
      await invoke("pause_live_session");
      // live:paused 事件到达前先置位（事件延迟 <500ms，防按钮闪烁）
      setLivePaused(true);
    } catch (e) {
      setLiveError(`暂停失败: ${e}`);
    }
  };

  /** 恢复实时捕获 */
  const resumeLive = async () => {
    setLiveError("");
    try {
      await invoke("resume_live_session");
      setLivePaused(false);
    } catch (e) {
      setLiveError(`恢复失败: ${e}`);
    }
  };

  /** 素材流水线（v0.1.0）：选素材/提取逻辑已下沉 MaterialInputPanel（审查硬拆） */

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：配置面板（窗口选择 → 素材 → 启动按钮） ── */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>📡 课堂助手</span>
          {/* M7/REQ-042 F2/G2：健康徽标 + 诊断面板（开发期可见） */}
          <SystemStatusBadge />
        </div>

        {asrDegraded && (
          <div style={{ padding: "6px 14px", background: "#fef2f2", borderBottom: "1px solid #fecaca", fontSize: 11, color: "#b91c1c" }}>
            ⚠ {asrDegraded}
          </div>
        )}

        {/* TD-2026-08-20-I 清偿：目标窗口丢失横幅（画面采集中断提示；恢复/停止后清除） */}
        {windowLost && (
          <div style={{ padding: "6px 14px", background: "#fffbeb", borderBottom: "1px solid #fcd34d", fontSize: 11, color: "#b45309", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠ 目标窗口已关闭或不可见——画面采集中断（音频继续；请恢复窗口或重新选择）
            <button
              onClick={() => setWindowLost(false)}
              style={{ marginLeft: "auto", border: "none", background: "none", color: "#b45309", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
            >
              知道了
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 2026-08 C1：引擎与模型就绪清单（开始前准备流——缺什么一目了然） */}
          <ReadyCheckCard />

          {/* 目标窗口/进程选择（v0.2.0 实时捕获上下文） */}
          <WindowSelectCard
            windows={windows}
            selected={selectedWindow}
            onSelect={setSelectedWindow}
            onRefresh={refreshWindows}
            loading={windowsLoading}
          />

          {/* 实时捕获（v0.2.0：WASAPI + DXGI + 流式 ASR + 字幕 OCR） */}
          <div style={panel}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              实时捕获{liveActive && <span style={{ color: "#dc2626" }}> ● 录制中</span>}
            </div>
            {!liveActive && !modelStatus?.ready && (
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
                      onClick={() => void downloadModel()}
                      style={{ ...btn, width: "100%", padding: "8px 0", fontWeight: 600, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6, marginBottom: 6 }}
                    >
                      ⬇ 一键下载并配置模型
                    </button>
                  ))}
                {modelError && <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>{modelError}</p>}
                {!modelStatus && (
                  <button
                    onClick={() => void retryModelStatus()}
                    style={{ ...btn, width: "100%", padding: "6px 0", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}
                  >
                    ⟳ 重试检查
                  </button>
                )}
              </div>
            )}
            {liveActive && (
              // 实时内容（字幕/语音/画面）统一由右侧 LiveActivityPanel 展示，
              // 左栏保持精简（状态徽标）——审查观察项修复
              <div style={{ fontSize: 11, color: livePaused ? "#b45309" : "#0d9488", marginBottom: 6 }}>
                {livePaused ? "⏸ 已暂停（时间轴冻结，恢复后继续）" : "● 正在采集（实时内容见右侧面板）"}
              </div>
            )}
            {/* 2026-08 A2：音频电平条（仅采集中显示；暂停时电平静止） */}
            {liveActive && !livePaused && <AudioLevelMeter />}
            {liveError && <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>{liveError}</p>}
            {liveActive ? (
              /* 采集中按钮组（2026-08 A1：暂停/继续 + 标记此刻 + 停止） */
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={livePaused ? resumeLive : pauseLive}
                  style={{
                    ...btn,
                    flex: 1,
                    padding: "8px 0",
                    fontWeight: 600,
                    background: livePaused ? "#0d9488" : "#f59e0b",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                  }}
                >
                  {livePaused ? "▶ 继续捕获" : "⏸ 暂停"}
                </button>
                {/* 2026-08 A3：手动标记此刻（最高权重关键图信号；Ctrl+Shift+S 同效） */}
                <button
                  onClick={() => {
                    void invoke<string>("save_user_screenshot")
                      .then(() => setStatus("⭐ 已标记此刻画面（关键图候选置顶）"))
                      .catch((err) => setLiveError(`标记失败: ${err}`));
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
                  onClick={stopLive}
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
              </div>
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
                <button
                  onClick={startLive}
                  disabled={!modelStatus?.ready}
                  style={{
                    ...btn,
                    width: "100%",
                    padding: "8px 0",
                    fontWeight: 600,
                    background: modelStatus?.ready ? "#0d9488" : "#e5e7eb",
                    color: modelStatus?.ready ? "#fff" : "#9ca3af",
                    border: "none",
                    borderRadius: 6,
                  }}
                >
                  ▶ 开始实时捕获
                </button>
              </>
            )}
            {liveSessionId && (
              <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>会话 #{liveSessionId}（可到「会话」页查看）</p>
            )}
          </div>

          {/* 视频文件导入（v0.3.0：REQ-015 第二入口，字幕优先 + ASR fallback） */}
          <VideoImportPanel />

          {/* 2026-08-21 用户需求：OCR 设备/音频预处理/备份/AI 服务/词表/模型管理等
              设置类面板已迁出至「⚙ 设置」页——课堂助手左栏仅保留采集动线 */}

          {/* 素材输入 + 提取按钮（v0.1.0 文件流水线；审查硬拆——MaterialInputPanel） */}
          <MaterialInputPanel
            windowTitle={selectedWindow?.title ?? null}
            onNote={setLastNote}
            onStatus={setStatus}
          />

          {status && <p style={{ fontSize: 12, color: "#2563eb" }}>{status}</p>}
        </div>
      </div>

      {/* ── 右栏：内容区（档案配置 + 实时活动面板 / 笔记预览 / 空态说明书） ── */}
      {/* 2026-08 审查硬拆：右栏内容区整体下沉 ClassroomRightPane */}
      <ClassroomRightPane
        liveActive={liveActive}
        stopping={stopping}
        fusionActive={fusionActive}
        liveSessionId={liveSessionId}
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
