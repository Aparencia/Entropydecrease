/**
 * ClassroomPage — 课堂助手独立页面（装配层，参考原项目 ClassroomPage 双列布局）。
 *
 * @ai-context: 布局沿用原项目——左栏配置态（窗口/进程选择卡 → 实时捕获 → 文件素材），
 *              右栏内容区（空态为配置说明书，结果态展示最近笔记/实时字幕）。
 * @ai-context: v0.2.0 新增实时捕获链路（REQ-007~012）：选择窗口 → 开始 → 后台
 *              捕获音频+屏幕+流式转写+字幕 OCR；事件 live:asr-partial / live:subtitle /
 *              live:error / live:status 实时回显；停止后可到「会话」页查看时间轴。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { WindowSelectCard } from "../components/WindowSelectCard";
import VideoImportPanel from "../components/VideoImportPanel";
import type { Note, WindowInfo, StreamingModelStatus, LiveSessionStatus, DownloadProgress, DownloadStatus } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

export default function ClassroomPage() {
  // ── 窗口/进程选择 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  // ── 实时捕获（v0.2.0）──
  const [liveActive, setLiveActive] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState<StreamingModelStatus | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelProgress, setModelProgress] = useState<DownloadProgress | null>(null);
  const [modelError, setModelError] = useState("");
  const [partialText, setPartialText] = useState("");
  const [lastSubtitle, setLastSubtitle] = useState("");
  const [liveError, setLiveError] = useState("");

  // ── 素材与结果（文件流水线，v0.1.0）──
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
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

  // 实时会话事件监听（v0.2.0）
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<string>("live:asr-partial", (e) => setPartialText(e.payload)),
      listen<string>("live:subtitle", (e) => setLastSubtitle(e.payload)),
      listen<string>("live:error", (e) => setLiveError(e.payload)),
      // 修复（v0.3.0 审查反馈）：必须区分 payload——Rust 侧在 ASR 模型加载成功后
      // 才 emit "recording"（比 invoke resolve 晚 1-3s），旧实现无条件清态导致
      // 按钮变回"开始采集"而后端会话仍在跑，再点开始被拒绝
      listen<string>("live:status", (e) => {
        if (e.payload === "recording") {
          // 后端确认录制中：保持/恢复活动态（invoke resolve 可能更早到达）
          setLiveActive(true);
        } else {
          // stopped / failed：会话已结束
          setLiveActive(false);
          setLiveSessionId(null);
          setPartialText("");
        }
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

  /** 开始实时捕获（REQ-007~012）：窗口可选（未选=全屏） */
  const startLive = async () => {
    setLiveError("");
    setPartialText("");
    setLastSubtitle("");
    try {
      const title = selectedWindow ? selectedWindow.title.slice(0, 60) : "实时课堂";
      const id = await invoke<number>("start_live_session", {
        title,
        sourceWindow: selectedWindow?.title ?? null,
        windowId: selectedWindow?.id ?? null,
      });
      setLiveActive(true);
      setLiveSessionId(id);
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
    try {
      const id = await invoke<number | null>("stop_live_session");
      setLiveActive(false);
      setLiveSessionId(null);
      setPartialText("");
      setStatus(id ? `已停止会话 #${id}，可到「会话」页查看时间轴` : "无活动会话");
    } catch (e) {
      setLiveError(`停止失败: ${e}`);
    }
  };

  const pickAudio = async () => {
    const p = await open({ filters: [{ name: "音频", extensions: ["wav"] }] });
    if (typeof p === "string") setAudioPath(p);
  };
  const pickImages = async () => {
    const ps = await open({ multiple: true, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "bmp"] }] });
    if (Array.isArray(ps)) setImagePaths(ps as string[]);
  };

  /** 一键流水线：转写 + OCR + 拼接 → 笔记（标题取选定窗口标题，无窗口时默认名） */
  const runExtract = async () => {
    setProcessing(true);
    setStatus("流水线处理中（转写 + OCR + 拼接 + 落库）…");
    try {
      const title = selectedWindow ? selectedWindow.title.slice(0, 60) : "课堂记录";
      const note = await invoke<Note>("process_to_note", {
        title,
        audioPath,
        imagePaths,
      });
      setLastNote(note);
      setStatus(`完成，已保存笔记 #${note.id}`);
      setAudioPath(null);
      setImagePaths([]);
    } catch (e) {
      setStatus(`流水线失败: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  const hasMaterial = !!audioPath || imagePaths.length > 0;

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
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
          📡 课堂助手
          {processing && <span style={{ marginLeft: 8, color: "#dc2626" }}>●</span>}
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 目标窗口/进程选择（v0.2.0 实时捕获上下文） */}
          <WindowSelectCard
            windows={windows}
            selected={selectedWindow}
            onSelect={setSelectedWindow}
            onRefresh={refreshWindows}
            loading={windowsLoading}
            disabled={processing}
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
              <div style={{ fontSize: 11, color: "#374151", marginBottom: 6 }}>
                {lastSubtitle && <div style={{ color: "#0d9488" }}>字幕：{lastSubtitle}</div>}
                {partialText && <div style={{ color: "#6b7280" }}>语音：{partialText}</div>}
              </div>
            )}
            {liveError && <p style={{ fontSize: 11, color: "#dc2626", margin: "0 0 6px" }}>{liveError}</p>}
            <button
              onClick={liveActive ? stopLive : startLive}
              disabled={!modelStatus?.ready && !liveActive}
              style={{
                ...btn,
                width: "100%",
                padding: "8px 0",
                fontWeight: 600,
                background: liveActive ? "#dc2626" : modelStatus?.ready ? "#0d9488" : "#e5e7eb",
                color: liveActive || modelStatus?.ready ? "#fff" : "#9ca3af",
                border: "none",
                borderRadius: 6,
              }}
            >
              {liveActive ? "⏹ 停止捕获" : "▶ 开始实时捕获"}
            </button>
            {liveSessionId && (
              <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>会话 #{liveSessionId}（可到「会话」页查看）</p>
            )}
          </div>

          {/* 视频文件导入（v0.3.0：REQ-015 第二入口，字幕优先 + ASR fallback） */}
          <VideoImportPanel />

          {/* 素材输入（v0.1.0：文件流水线） */}
          <div style={panel}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>学习素材（文件）</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={btn} onClick={pickAudio} disabled={processing}>选音频 WAV</button>
              <button style={btn} onClick={pickImages} disabled={processing}>选图片（多选）</button>
            </div>
            {audioPath && <p style={{ fontSize: 11, color: "#374151", marginTop: 6, wordBreak: "break-all" }}>🎵 {audioPath}</p>}
            {imagePaths.length > 0 && <p style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>🖼 已选 {imagePaths.length} 张图片</p>}
          </div>

          {status && <p style={{ fontSize: 12, color: "#2563eb" }}>{status}</p>}
        </div>

        {/* 底部启动按钮（参考原项目"开始回声定位"位置） */}
        <div style={{ padding: 12, borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={runExtract}
            disabled={!hasMaterial || processing}
            style={{
              ...btn,
              width: "100%",
              padding: "10px 0",
              fontWeight: 600,
              background: hasMaterial && !processing ? "#0d9488" : "#e5e7eb",
              color: hasMaterial && !processing ? "#fff" : "#9ca3af",
              border: "none",
              borderRadius: 8,
            }}
          >
            {processing ? "处理中…" : "🚀 提取为笔记"}
          </button>
          {!hasMaterial && (
            <p style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "#9ca3af" }}>请先选择音频或图片素材</p>
          )}
        </div>
      </div>

      {/* ── 右栏：内容区（空态说明书 / 结果态笔记预览） ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {lastNote ? (
          /* 结果态：最近生成的笔记预览 */
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{lastNote.title}</h2>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                #{lastNote.id} · {lastNote.source} · {new Date(lastNote.updated_at * 1000).toLocaleString()}
              </span>
            </div>
            <pre
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 14,
                whiteSpace: "pre-wrap",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {lastNote.content}
            </pre>
            <p style={{ fontSize: 12, color: "#6b7280" }}>已保存至笔记，可在「笔记」页继续编辑与检索。</p>
          </div>
        ) : (
          /* 空态：当前配置说明书（参考原项目 IdleGuidePanel） */
          <div style={{ flex: 1, overflowY: "auto", padding: 24, maxWidth: 640 }}>
            <h2 style={{ fontSize: 18 }}>使用说明</h2>
            <ol style={{ fontSize: 13, lineHeight: 2, color: "#374151" }}>
              <li><strong>选择目标窗口/进程</strong>：自动推荐疑似网课/视频窗口（B站/播放器/浏览器），也可展开全部手动选择——将作为笔记标题与实时捕获目标</li>
              <li><strong>实时捕获</strong>：系统声音 + 屏幕字幕 + 流式转写（Zipformer）边看边记，停止后到「会话」页查看时间轴并可一键转笔记</li>
              <li><strong>添加学习素材</strong>：音频文件（WAV，本地 SenseVoice 转写）与图片（本地 PP-OCRv6 识别）</li>
              <li><strong>一键提取</strong>：转写 + OCR → 本地拼接为 Markdown 笔记 → 自动保存</li>
            </ol>
            <div style={{ ...panel, marginTop: 16, fontSize: 12, color: "#6b7280", lineHeight: 1.9 }}>
              <div><strong>当前配置</strong></div>
              <div>目标窗口：{selectedWindow ? `${selectedWindow.title}（${selectedWindow.processName || "未知进程"}）` : "未选择（实时捕获将抓全屏）"}</div>
              <div>流式转写：sherpa-onnx Zipformer（实时字幕，需模型就绪）</div>
              <div>转写引擎：sherpa-onnx SenseVoice（本地，已就绪）</div>
              <div>OCR 引擎：oar-ocr PP-OCRv6（本地，首次使用自动下载模型）</div>
              <div>数据主权：全部本地处理，内容不出本机</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
