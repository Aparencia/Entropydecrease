/**
 * CaptureOverlayPanel — 系统级覆盖层截图面板（v0.12.0 M3，交互债）。
 *
 * @ai-context: 应用内 letterbox 框选（4K 屏缩到 73% 丢细节 + 三步操作）替代——
 *              覆盖层窗口全屏透明显示当前帧（1:1 原始像素，鼠标坐标经 scale
 *              换算回图像坐标），拖拽框选 → 确认 → overlay_submit_capture（后端
 *              裁剪 PNG 回传主窗口）；Esc → overlay_cancel。窗口不持久，截完即销毁。
 * @ai-context: 自动边缘检测候选（微信截图对标）YAGNI 不预排——仅拖拽框选。
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface Sel {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function CaptureOverlayPanel() {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const dragging = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const scaleRef = useRef<{ x: number; y: number }>({ x: 1, y: 1 });

  // 加载待选截图（仅一次）
  useEffect(() => {
    void invoke<string | null>("overlay_get_image")
      .then((p) => {
        if (p) setSrc(convertFileSrc(p));
      })
      .catch(() => undefined);
  }, []);

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    // 1:1 换算：图像坐标 = 客户端坐标 ×（自然尺寸/显示尺寸）——DPI/多屏下依旧准确
    scaleRef.current = {
      x: img.naturalWidth / Math.max(1, img.clientWidth),
      y: img.naturalHeight / Math.max(1, img.clientHeight),
    };
  };

  const toImageRect = (s: Sel) => {
    const img = imgRef.current;
    if (!img || !natural) return null;
    const box = img.getBoundingClientRect();
    const sx = Math.min(s.x1, s.x2);
    const sy = Math.min(s.y1, s.y2);
    const ex = Math.max(s.x1, s.x2);
    const ey = Math.max(s.y1, s.y2);
    const x = Math.round((sx - box.left) * scaleRef.current.x);
    const y = Math.round((sy - box.top) * scaleRef.current.y);
    const w = Math.round((ex - sx) * scaleRef.current.x);
    const h = Math.round((ey - sy) * scaleRef.current.y);
    if (w < 4 || h < 4) return null;
    return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(w, natural.w - x), h: Math.min(h, natural.h - y) };
  };

  const submit = () => {
    if (!sel) return;
    const r = toImageRect(sel);
    if (!r) return;
    void invoke("overlay_submit_capture", { rect: r }).catch(() => undefined);
  };

  // 键盘（Esc/Enter）单次注册——经 ref 读最新 sel/submit
  // （审查修复：原 [sel] 依赖在拖拽 mousemove 高频重注册 + 闭包陈旧风险）
  const selRef = useRef<Sel | null>(null);
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    selRef.current = sel;
    submitRef.current = submit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void invoke("overlay_cancel").catch(() => undefined);
      if (e.key === "Enter" && selRef.current) submitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    setSel({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !sel) return;
    setSel({ ...sel, x2: e.clientX, y2: e.clientY });
  };
  const onMouseUp = () => {
    dragging.current = false;
  };

  const selBox =
    sel && Math.abs(sel.x2 - sel.x1) > 3 && Math.abs(sel.y2 - sel.y1) > 3
      ? {
          left: Math.min(sel.x1, sel.x2),
          top: Math.min(sel.y1, sel.y2),
          width: Math.abs(sel.x2 - sel.x1),
          height: Math.abs(sel.y2 - sel.y1),
        }
      : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#000", cursor: "crosshair", overflow: "hidden", userSelect: "none" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {src && (
        <img
          ref={imgRef}
          src={src}
          onLoad={onLoad}
          alt="待框选截图"
          draggable={false}
          style={{ position: "absolute", left: 0, top: 0, width: "100vw", imageRendering: "pixelated" }}
        />
      )}
      {/* 框选遮罩：选中区域高亮，其余压暗 */}
      {selBox && (
        <div
          style={{
            position: "absolute",
            left: selBox.left - 1,
            top: selBox.top - 1,
            width: selBox.width + 2,
            height: selBox.height + 2,
            border: "2px solid #14b8a6",
            background: "rgba(20,184,166,0.15)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      )}
      {/* 操作条 */}
      <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 10 }}>
        <button
          style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          disabled={!selBox}
          onClick={submit}
        >
          确认截图（Enter）
        </button>
        <button
          style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
          onClick={() => void invoke("overlay_cancel").catch(() => undefined)}
        >
          取消（Esc）
        </button>
        <span style={{ alignSelf: "center", fontSize: 12, color: "#e5e7eb" }}>
          {natural ? `${natural.w}×${natural.h} 像素 · 1:1` : "加载截图…"}
        </span>
      </div>
    </div>
  );
}
