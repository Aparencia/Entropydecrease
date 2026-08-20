/**
 * ImageGallery — 会话图集画廊（v0.5.0 M6，REQ-051）。
 *
 * @ai-context: 三层图结构展示：关键图（内嵌产物，M7 消费）/ 参考图集（画廊）/
 *              缩略图走廊（时间轴导航）。本组件为参考图集画廊：懒加载（E8
 *              虚拟列表思路：仅渲染可视窗口）、用户可删除（D1 回路：删改反哺
 *              筛选阈值参数，V1.0 校准）。
 * @ai-context: 图片经 Tauri convertFileSrc 读取本地会话目录（数据不出本机）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ImagePreviewOverlay from "./ImagePreviewOverlay";
import StructureImageSection from "./StructureImageSection";

const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12 };

export default function ImageGallery({ sessionId }: { sessionId: number }) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // v0.7.7（REQ-187 修复）：参考图详情预览（点击缩略图 → 大图遮罩）
  const [preview, setPreview] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await invoke<string[]>("list_session_images", { sessionId });
      setImages(list);
    } catch (e) {
      setError(`图集加载失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // REQ-132：剪贴板图片直贴事件（后端落库后 emit）→ 自动刷新图集（粘贴即见）
  useEffect(() => {
    const unlisten = listen<string>("session:clipboard-image", () => void refresh());
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  /** 删除图片（D1 回路：用户删改反哺筛选；V1.0 校准阈值参数） */
  const removeImage = async (rel: string) => {
    try {
      const ok = await invoke<boolean>("delete_session_image", { sessionId, relativePath: rel });
      if (ok) setImages((prev) => prev.filter((p) => p !== rel));
    } catch (e) {
      setError(`删除失败: ${e}`);
    }
  };

  // 图片 URL：需知道完整数据目录路径——由后端提供（见下方 fetchBaseUrl）
  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
  }, [sessionId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📷 参考图集（{images.length}）</span>
        <button style={btn} onClick={() => void refresh()} disabled={loading}>
          {loading ? "加载中…" : "⟳ 刷新"}
        </button>
        {error && <span style={{ fontSize: 11, color: "#dc2626" }}>{error}</span>}
      </div>
      {images.length === 0 && !loading && (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          暂无图片（实时捕获中画面变化会自动归档；Ctrl+Shift+S 手动截图置顶）
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {images.map((rel) => (
          <div
            key={rel}
            onClick={() => setPreview(rel)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", position: "relative", cursor: "pointer" }}
            title="点击查看大图"
          >
            {baseUrl && (
              <img
                src={convertFileSrc(`${baseUrl}/${rel}`)}
                alt={rel}
                loading="lazy"
                style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 6px", fontSize: 10, color: "#6b7280" }}>
              <span title={rel}>{rel.split("/")[1]?.replace(".webp", "") ?? rel}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void removeImage(rel);
                }}
                style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 11 }}
                title="删除此图"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      {preview && baseUrl && (
        <ImagePreviewOverlay
          src={convertFileSrc(`${baseUrl}/${preview}`)}
          title={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {/* v0.7.7（REQ-185）：结构图区段（非线性结构图像持久化图库） */}
      <StructureImageSection sessionId={sessionId} baseUrl={baseUrl} />
    </div>
  );
}
