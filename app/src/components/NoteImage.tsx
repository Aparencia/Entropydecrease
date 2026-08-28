/**
 * NoteImage — 笔记 Markdown 图片渲染（v0.10.1）。
 *
 * @ai-context: 笔记内容内嵌 data_dir 相对引用（session-images/...、notes-images/...、
 *              产物裸 full/thumbs/...）——WebView 不能直接读本地文件，经 Rust
 *              resolve_note_image 校验后返回绝对路径，再 convertFileSrc 转 asset
 *              协议 URL；http(s)/data: 直出；解析失败降级占位不破版面。
 */
import { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
// v0.14 A：外链/本地判定提取为共享纯函数（编辑 widget 与阅读共用同一解析逻辑）
import { resolveNoteImageSrc } from "../utils/resolveNoteImageSrc";

interface Props {
  src: string;
  alt?: string;
  noteId: number;
  /** 点击放大回调（传最终可渲染 URL） */
  onOpen?: (url: string, title?: string) => void;
}

/** 无需本地解析的直出源判定已提取至 utils/resolveNoteImageSrc（v0.14 A） */

const PLACEHOLDER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  maxWidth: "100%",
  background: "#f9fafb",
  border: "1px dashed #d1d5db",
  borderRadius: 6,
  color: "#9ca3af",
  fontSize: 12,
  padding: "8px 12px",
  margin: "4px 0",
};

export default function NoteImage({ src, alt = "", noteId, onOpen }: Props) {
  const kind = resolveNoteImageSrc(src);
  const [url, setUrl] = useState<string | null>(kind === "external" ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (kind === "external") {
      setUrl(src);
      setFailed(false);
      return;
    }
    if (kind === "invalid") {
      setFailed(true);
      return;
    }
    setUrl(null);
    setFailed(false);
    invoke<string | null>("resolve_note_image", { noteId, src })
      .then((abs) => {
        if (!disposed && abs) setUrl(convertFileSrc(abs));
        else if (!disposed) setFailed(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [src, noteId, kind]);

  if (failed) {
    return <div style={PLACEHOLDER}>🖼 {alt || "图片不可用"}</div>;
  }
  if (!url) {
    return <div style={PLACEHOLDER}>…</div>;
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onClick={() => onOpen?.(url, alt)}
      style={{
        // 当前为 CSS 缩略图：全尺寸图片加载后 CSS 缩放为 240×160 cover（容器约束保留）。
        // TODO(v0.12.0): 使用后端 thumbs/ 缩略图路径替代全尺寸 CSS 缩放
        maxWidth: "100%",
        width: 240,
        height: 160,
        objectFit: "cover",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        cursor: onOpen ? "zoom-in" : "default",
      }}
    />
  );
}
