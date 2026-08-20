/**
 * BoxSelectOverlay — 屏卡全帧图框选截取（v0.7.7 REQ-184）。
 *
 * @ai-context: 在屏卡图上叠加选择层：鼠标拖框（归一化坐标 0-1，与显示/原图
 *              线性一致）→ 松开出确认浮层（CSS 放大镜预览裁剪区域 + 保存/取消，
 *              防误触产生垃圾图）→ 保存 invoke capture_structure_manual。
 *              无图屏不进入（调用方禁用按钮）。
 */
import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  src: string;
  sessionId: number;
  /** 屏定位键（first_seen_ms——旧数据聚类屏号不唯一，审查修复） */
  firstSeenMs: number;
  /** 保存成功回调（父层 toast + 图库自动刷新走事件） */
  onDone: () => void;
  onCancel: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function BoxSelectOverlay({ src, sessionId, firstSeenMs, onDone, onCancel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false); // 审查修复：区分"拖拽"与"单击"（防误触全屏）
  const [box, setBox] = useState<Box | null>(null);
  const [confirm, setConfirm] = useState<Box | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const norm = (clientX: number, clientY: number): Box | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
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
    setError("");
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !box) return;
    const p = norm(e.clientX, e.clientY);
    if (!p) return;
    setMoved(true);
    setBox({
      x: Math.min(box.x, p.x),
      y: Math.min(box.y, p.y),
      w: Math.abs(p.x - box.x),
      h: Math.abs(p.y - box.y),
    });
  };

  const onMouseUp = () => {
    if (!dragging || !box) return;
    setDragging(false);
    // 单击未拖动（初始占位 w=h=1）→ 视为误触忽略（审查修复：此前会确认全屏框）
    if (!moved) {
      setBox(null);
      return;
    }
    // 过小框（<6% 宽高）视为误触：忽略本次拖拽
    if (box.w < 0.06 || box.h < 0.06) {
      setBox(null);
      return;
    }
    setConfirm(box);
  };

  const save = async () => {
    if (!confirm) return;
    setSaving(true);
    setError("");
    try {
      await invoke("capture_structure_manual", {
        sessionId,
        firstSeenMs,
        x: confirm.x,
        y: confirm.y,
        w: confirm.w,
        h: confirm.h,
      });
      onDone();
    } catch (e) {
      setError(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const boxStyle: React.CSSProperties = box
    ? {
        position: "absolute",
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        border: "2px solid #0d9488",
        background: "rgba(13,148,136,0.12)",
        pointerEvents: "none",
      }
    : {};

  // CSS 放大镜预览：以框选区域为视口显示原图（确认浮层）
  const zoomStyle: React.CSSProperties = confirm
    ? {
        width: 240,
        height: 160,
        backgroundImage: `url(${src})`,
        backgroundSize: `${100 / confirm.w}% ${100 / confirm.h}%`,
        backgroundPosition: `${(confirm.x / (1 - confirm.w)) * 100}% ${(confirm.y / (1 - confirm.h)) * 100}%`,
        backgroundRepeat: "no-repeat",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
      }
    : {};

  return (
    <div
      ref={wrapRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => {
        // 审查修复：拖出框外时清理拖拽状态与残留框（防虚线框残留）
        if (dragging) {
          setDragging(false);
          setBox(null);
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "crosshair",
        zIndex: 10,
        border: "2px dashed #0d9488",
        background: "rgba(13,148,136,0.06)",
      }}
      title="拖拽框选要截取的结构区域"
    >
      <div style={boxStyle} />
      {!box && (
        <span style={{ position: "absolute", top: 4, left: 6, fontSize: 11, color: "#0f766e", background: "#fff", padding: "2px 6px", borderRadius: 4 }}>
          拖拽框选结构区域（Esc 取消）
        </span>
      )}
      <button
        onClick={onCancel}
        style={{ position: "absolute", top: 4, right: 6, fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        title="取消框选"
      >
        ✕ 取消
      </button>
      {confirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.96)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>确认截取此区域？</div>
          <div style={zoomStyle} />
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            区域 {Math.round(confirm.w * 100)}% × {Math.round(confirm.h * 100)}%（相对整屏）
          </div>
          {error && <div style={{ fontSize: 11, color: "#dc2626" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setConfirm(null); setBox(null); }}
              disabled={saving}
              style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, padding: "5px 14px" }}
            >
              重新框选
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              style={{ border: "1px solid #0d9488", borderRadius: 6, background: "#0d9488", color: "#fff", cursor: "pointer", fontSize: 12, padding: "5px 14px" }}
            >
              {saving ? "保存中…" : "✓ 保存为结构图"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
