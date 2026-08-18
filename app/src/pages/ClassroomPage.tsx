/**
 * ClassroomPage — 课堂助手独立页面（装配层，参考原项目 ClassroomPage 双列布局）。
 *
 * @ai-context: 布局沿用原项目——左栏配置态（窗口/进程选择卡 → 素材输入 → 底部启动按钮），
 *              右栏内容区（空态为配置说明书，结果态展示生成笔记）。
 * @ai-context: 第一阶段为文件素材流水线（音频/图片 → 转写+OCR+拼接 → 笔记）；
 *              窗口/进程选择为 v0.2.0 实时捕获预留上下文（选定的窗口标题用于笔记命名）。
 * @ai-context: 本文件只做状态绑定与组件编排；提取逻辑在 Rust commands，选择在 WindowSelectCard。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WindowSelectCard } from "../components/WindowSelectCard";
import type { Note, WindowInfo } from "../types";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

export default function ClassroomPage() {
  // ── 窗口/进程选择 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  // ── 素材与结果 ──
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

          {/* 素材输入（第一阶段：文件流水线） */}
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
              <li><strong>选择目标窗口/进程</strong>：自动推荐疑似网课/视频窗口（B站/播放器/浏览器），也可展开全部手动选择——将作为笔记标题与后续实时捕获目标</li>
              <li><strong>添加学习素材</strong>：音频文件（WAV，本地 SenseVoice 转写）与图片（本地 PP-OCRv6 识别）</li>
              <li><strong>一键提取</strong>：转写 + OCR → 本地拼接为 Markdown 笔记 → 自动保存</li>
            </ol>
            <div style={{ ...panel, marginTop: 16, fontSize: 12, color: "#6b7280", lineHeight: 1.9 }}>
              <div><strong>当前配置</strong></div>
              <div>目标窗口：{selectedWindow ? `${selectedWindow.title}（${selectedWindow.processName || "未知进程"}）` : "未选择"}</div>
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
