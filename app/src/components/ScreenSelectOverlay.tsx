/**
 * ScreenSelectOverlay — 全屏框选遮罩（v0.11.7 图文采集）。
 *
 * @ai-context: 显示捕获的全屏快照（letterbox 缩放适配窗口，窗口外屏幕区域
 *              也可见可框选）→ 鼠标拖框（归一化坐标）→ 确认浮层（放大镜
 *              预览）→ canvas 物理像素裁剪 → PNG base64 回调（OCR 无损输入）。
 * @ai-context: DPI 换算——GDI 捕获为物理像素、CSS 显示为逻辑像素：鼠标坐标
 *              先减 letterbox 偏移、除以显示缩放，再按图像物理像素换算；
 *              不经 window.devicePixelRatio（显示缩放已含在 letterbox scale）。
 */
import { useRef, useState } from "react";

interface Props {
  /** 全屏快照 data URL（JPEG；capture_screen_snapshot 的 base64 拼前缀） */
  src: string;
  /** 图像物理像素宽高（裁剪换算基准） */
  imageWidth: number;
  imageHeight: number;
  /** 保存中（父层提交后端，禁用交互防重复） */
  saving: boolean;
  /** 确认回调：裁剪图 PNG base64（data URL 的 base64 部分） */
  onConfirm: (pngBase64: string) => void;
  onCancel: () => void;
}

interface Box { x: number; y: number; w: number; h: number; }

export default function ScreenSelectOverlay({ src, imageWidth, imageHeight, saving, onConfirm, onCancel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false); // 区分"拖拽"与"单击"（防误触全屏）
  const [box, setBox] = useState<Box | null>(null);
  const [confirm, setConfirm] = useState<Box | null>(null);
  const [fit, setFit] = useState<{ scale: number; left: number; top: number } | null>(null);

  /** letterbox 布局：图像完整可见居中（含窗口外屏幕区域），比例 = 显示/物理 */
  const measureFit = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rw = el.clientWidth;
    const rh = el.clientHeight;
    if (rw <= 0 || rh <= 0 || imageWidth <= 0 || imageHeight <= 0) return;
    const scale = Math.min(rw / imageWidth, rh / imageHeight);
    setFit({ scale, left: (rw - imageWidth * scale) / 2, top: (rh - imageHeight * scale) / 2 });
  };

  /** 鼠标坐标 → 图像归一化坐标（减 letterbox 偏移 + 除显示缩放 + clamp） */
  const norm = (clientX: number, clientY: number): Box | null => {
    const el = wrapRef.current;
    if (!el || !fit) return null;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left - fit.left) / (imageWidth * fit.scale);
    const y = (clientY - rect.top - fit.top) / (imageHeight * fit.scale);
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      w: 1,
      h: 1,
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    setBox(p);
    setDragging(true);
    setMoved(false);
    setConfirm(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !box) return;
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    setMoved(true);
    setBox({ x: Math.min(box.x, p.x), y: Math.min(box.y, p.y), w: Math.abs(p.x - box.x), h: Math.abs(p.y - box.y) });
  };

  const onMouseUp = () => {
    if (!dragging || !box) return;
    setDragging(false);
    if (!moved) { setBox(null); return; } // 单击未拖动 → 误触忽略
    if (box.w < 0.06 || box.h < 0.06) { setBox(null); return; } // 过小框 → 误触忽略
    setConfirm(box);
  };

  /** canvas 物理像素裁剪 → PNG base64（OCR 无损输入） */
  const cropAndConfirm = () => {
    if (!confirm) return;
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(confirm.x * imageWidth);
      const sy = Math.round(confirm.y * imageHeight);
      const sw = Math.max(1, Math.round(confirm.w * imageWidth));
      const sh = Math.max(1, Math.round(confirm.h * imageHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) { onCancel(); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      onConfirm(canvas.toDataURL("image/png").split(",")[1] ?? "");
    };
    img.src = src;
  };

  const boxStyle: React.CSSProperties = box && fit
    ? {
        position: "absolute",
        left: `${box.x * imageWidth * fit.scale + fit.left}px`,
        top: `${box.y * imageHeight * fit.scale + fit.top}px`,
        width: `${box.w * imageWidth * fit.scale}px`,
        height: `${box.h * imageHeight * fit.scale}px`,
        border: "2px solid #0d9488",
        background: "rgba(13,148,136,0.12)",
        pointerEvents: "none",
      }
    : {};

  // CSS 放大镜预览：以框选区域为视口显示原图（确认浮层；分母 clamp 防除零）
  const zoomStyle: React.CSSProperties = confirm
    ? {
        width: 240,
        height: 160,
        backgroundImage: `url(${src})`,
        backgroundSize: `${100 / confirm.w}% ${100 / confirm.h}%`,
        backgroundPosition: `${(confirm.x / Math.max(1 - confirm.w, 0.05)) * 100}% ${(confirm.y / Math.max(1 - confirm.h, 0.05)) * 100}%`,
        backgroundRepeat: "no-repeat",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
      }
    : {};

  return (
    <div
      ref={wrapRef}
      style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(17,24,39,0.45)", cursor: "crosshair" }}
    >
      {/* 快照图（letterbox 居中显示） */}
      <img
        src={src}
        alt="屏幕快照"
        draggable={false}
        onLoad={measureFit}
        style={{
          position: "absolute",
          left: fit?.left ?? 0,
          top: fit?.top ?? 0,
          width: fit ? imageWidth * fit.scale : undefined,
          height: fit ? imageHeight * fit.scale : undefined,
          pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.25)",
        }}
      />
      {/* 框选层（仅作用于图像区域内的拖拽；归一化坐标换算见 norm） */}
      {fit && (
        <div
          style={{ position: "absolute", left: fit.left, top: fit.top, width: imageWidth * fit.scale, height: imageHeight * fit.scale }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            // 拖出图像区域时清理拖拽状态与残留框（防虚线框残留——BoxSelectOverlay 同款）
            if (dragging) { setDragging(false); setBox(null); }
          }}
        />
      )}
      <div style={boxStyle} />
      {!box && (
        <span style={{ position: "absolute", top: 8, left: 12, fontSize: 12, color: "#fff", background: "rgba(17,24,39,0.75)", padding: "3px 10px", borderRadius: 6, pointerEvents: "none" }}>
          拖拽框选要截取的图文区域（Esc 取消）
        </span>
      )}
      <button
        onClick={onCancel}
        style={{ position: "absolute", top: 8, right: 12, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", padding: "3px 10px" }}
        title="取消框选"
      >
        ✕ 取消
      </button>
      {confirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.96)", zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>确认截取此区域？</div>
          <div style={zoomStyle} />
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            区域 {Math.round(confirm.w * 100)}% × {Math.round(confirm.h * 100)}%（相对整屏）
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setConfirm(null); setBox(null); }}
              disabled={saving}
              style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, padding: "5px 14px" }}
            >
              重新框选
            </button>
            <button
              onClick={cropAndConfirm}
              disabled={saving}
              style={{ border: "1px solid #0d9488", borderRadius: 6, background: "#0d9488", color: "#fff", cursor: "pointer", fontSize: 12, padding: "5px 14px" }}
            >
              {saving ? "保存中…" : "✓ 截取此区域"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
