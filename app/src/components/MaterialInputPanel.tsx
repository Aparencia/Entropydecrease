/**
 * MaterialInputPanel — 学习素材（文件）输入与提取按钮（2026-08 审查硬拆：
 * ClassroomPage 641 行 >600 硬上限，执行豁免登记既有拆分计划）。
 *
 * @ai-context: v0.1.0 文件流水线：选音频 WAV（本地 SenseVoice 转写）+ 选图片
 *              （本地 PP-OCRv6）→ 一键 process_to_note（转写+OCR+拼接+落库）；
 *              标题取父组件选定窗口标题（无窗口默认名）。
 * @ai-context: 状态（素材路径/处理中）自管；产物与状态提示经回调上抛父级。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Note } from "../types";
// Low 清扫：标题截断长度单一定义源（与 ClassroomPage 共享）
import { NOTE_TITLE_MAX_LEN } from "../utils/constants";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

interface Props {
  /** 标题来源：选定窗口标题（无窗口 → 默认名） */
  windowTitle: string | null;
  onNote: (note: Note) => void;
  onStatus: (msg: string) => void;
}

export default function MaterialInputPanel({ windowTitle, onNote, onStatus }: Props) {
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const pickAudio = async () => {
    const p = await open({ filters: [{ name: "音频", extensions: ["wav"] }] });
    if (typeof p === "string") setAudioPath(p);
  };
  const pickImages = async () => {
    const ps = await open({ multiple: true, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "bmp"] }] });
    if (Array.isArray(ps)) setImagePaths(ps as string[]);
  };

  /** 一键流水线：转写 + OCR + 拼接 → 笔记 */
  const runExtract = async () => {
    setProcessing(true);
    onStatus("流水线处理中（转写 + OCR + 拼接 + 落库）…");
    try {
      const title = windowTitle ? windowTitle.slice(0, NOTE_TITLE_MAX_LEN) : "课堂记录";
      const note = await invoke<Note>("process_to_note", { title, audioPath, imagePaths });
      onNote(note);
      onStatus(`完成，已保存笔记 #${note.id}`);
      setAudioPath(null);
      setImagePaths([]);
    } catch (e) {
      onStatus(`流水线失败: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  const hasMaterial = !!audioPath || imagePaths.length > 0;

  return (
    <>
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
    </>
  );
}
