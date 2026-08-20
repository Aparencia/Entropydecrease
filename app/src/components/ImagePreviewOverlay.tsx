/**
 * ImagePreviewOverlay — 图片大图预览遮罩（v0.7.7 REQ-187 修复：参考图/结构图共用）。
 *
 * @ai-context: 点击缩略图 → 遮罩 + contain 大图 + 标题信息栏；ESC / 点击遮罩 /
 *              关闭按钮退出。参考图集与结构图区段共用一处实现。
 */
import { useEffect } from "react";

interface Props {
  src: string;
  title?: string;
  onClose: () => void;
}

export default function ImagePreviewOverlay({ src, title, onClose }: Props) {
  // ESC 关闭（遮罩点击在容器上处理）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.75)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 12,
          maxWidth: "92vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          cursor: "default",
        }}
      >
        <img
          src={src}
          alt={title ?? "预览"}
          style={{ maxWidth: "88vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 6 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          {title && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>}
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, padding: "3px 10px" }}
          >
            关闭（ESC）
          </button>
        </div>
      </div>
    </div>
  );
}
