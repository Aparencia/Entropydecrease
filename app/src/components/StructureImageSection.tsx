/**
 * StructureImageSection — 会话结构图区段（v0.7.7 REQ-185）。
 *
 * @ai-context: 非线性结构图（表格/公式/代码/流程图/手动框选）图库——kind/source
 *              徽标 + 时间 + 屏号 + 删除 + 「重新捕获」重跑（幂等）；点击缩略图
 *              大图预览（ImagePreviewOverlay 共用）；监听 session:structures-updated
 *              自动刷新（停止后自动捕获/手动截取/删除均触发）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StructureImageRecord } from "../types";
import { fmtMs } from "../utils/fmt";
import ImagePreviewOverlay from "./ImagePreviewOverlay";

const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12 };

/** kind 徽标文案（全栈统一术语） */
const KIND_LABEL: Record<string, string> = {
  table: "📊 表格",
  formula: "∑ 公式",
  code: "⟨code⟩ 代码",
  image: "🖼 图结构",
  manual: "✋ 手动",
};

export default function StructureImageSection({ sessionId, baseUrl }: { sessionId: number; baseUrl: string }) {
  const [images, setImages] = useState<StructureImageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<StructureImageRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setImages(await invoke<StructureImageRecord[]>("list_session_structure_images", { sessionId }));
    } catch (e) {
      setError(`结构图加载失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 停止后自动捕获/手动截取/删除均 emit → 自动刷新（所见即所得）
  useEffect(() => {
    const unlisten = listen("session:structures-updated", () => void refresh());
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const remove = async (id: number) => {
    try {
      await invoke<boolean>("delete_structure_image", { id });
      setImages((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(`删除失败: ${e}`);
    }
  };

  const recapture = async () => {
    setBusy(true);
    setError("");
    try {
      const summary = await invoke<{ captured: number; screensScanned: number; budgetExhausted: boolean }>(
        "capture_session_structures",
        { sessionId },
      );
      if (summary.captured === 0) setError("重新捕获完成：无新增结构图（已去重或本会话无结构区域）");
    } catch (e) {
      setError(`重新捕获失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🧩 结构图（{images.length}）</span>
        <button style={btn} onClick={() => void recapture()} disabled={busy}>
          {busy ? "捕获中…" : "⟳ 重新捕获"}
        </button>
        <button style={btn} onClick={() => void refresh()} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </button>
        {error && <span style={{ fontSize: 11, color: "#dc2626" }}>{error}</span>}
      </div>
      {images.length === 0 && !loading && (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          暂无结构图（停止采集后自动捕获表格/公式/代码/流程图；或到原料屏卡上框选截取）
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {images.map((r) => (
          <div
            key={r.id}
            style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", position: "relative", cursor: "pointer" }}
            onClick={() => setPreview(r)}
            title="点击查看大图"
          >
            {baseUrl && (
              <img
                src={convertFileSrc(`${baseUrl}/${r.cropPath}`)}
                alt={r.cropPath}
                loading="lazy"
                style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
              />
            )}
            <div style={{ padding: "3px 6px", fontSize: 10, color: "#6b7280", lineHeight: 1.5 }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#0f766e", fontWeight: 600 }}>{KIND_LABEL[r.kind] ?? r.kind}</span>
                <span style={{ background: r.source === "auto" ? "#eef2ff" : "#fef3c7", borderRadius: 8, padding: "0 5px" }}>
                  {r.source === "auto" ? "自动" : "手动"}
                </span>
              </div>
              <div>
                {fmtMs(r.sourceTsMs)}
                {r.screenId != null ? ` · 屏 ${r.screenId}` : ""}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(r.id);
                }}
                style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, padding: 0 }}
                title="删除此结构图"
              >
                ✕ 删除
              </button>
            </div>
          </div>
        ))}
      </div>
      {preview && baseUrl && (
        <ImagePreviewOverlay
          src={convertFileSrc(`${baseUrl}/${preview.cropPath}`)}
          title={`${KIND_LABEL[preview.kind] ?? preview.kind} · ${fmtMs(preview.sourceTsMs)}${preview.screenId != null ? ` · 屏 ${preview.screenId}` : ""} · ${preview.source === "auto" ? "自动" : "手动"}`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
