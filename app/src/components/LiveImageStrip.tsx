/**
 * LiveImageStrip — 实时"最近画面"缩略图条（2026-08 用户需求：实时转写中显示图片数据）。
 *
 * @ai-context: 内嵌于实时转写 Tab 顶部（独立区域）：图片更新只替换横条内容，
 *              不插入转写行间——图文同屏但转写行零跳动。
 * @ai-context: 数据通道：session_images_base_url + list_session_images 取
 *              会话关键帧（后端 handle_full_frame 归档，数据不出本机）；
 *              归档成功时后端 emit live:image-saved → 即时刷新；live:ocr 兜底
 *              （会话恢复/事件丢失场景）。缩略图用 thumb/ 路径（320px 级），
 *              点击放大查看 full/ 原图。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 横条最多展示张数（最新 N 张，旧的到「会话」页图集查看） */
const MAX_SHOWN = 12;
/** 事件触发刷新节流（ms）：live:ocr 每帧多块高频触发，目录读也须合并——防 IPC 风暴 */
const REFRESH_THROTTLE_MS = 500;

/** 解析缩略图相对路径（full/xxx.webp → thumb/xxx.webp）；解析失败回退原路径 */
function thumbOf(rel: string): string {
  return rel.startsWith("full/") ? `thumb/${rel.slice("full/".length)}` : rel;
}

/** 从 full/<ts>.webp 提取时间戳（mm:ss），解析失败返回空串 */
function tsLabel(rel: string): string {
  const ts = rel.split("/")[1]?.replace(".webp", "");
  if (!ts) return "";
  const ms = Number(ts);
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function LiveImageStrip({ sessionId }: { sessionId: number | null }) {
  const [images, setImages] = useState<string[]>([]);
  const [baseUrl, setBaseUrl] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 图集基目录（convertFileSrc 拼接用）；随会话切换重载
  useEffect(() => {
    setBaseUrl("");
    setImages([]);
    setExpanded(null);
    if (!sessionId) return;
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
  }, [sessionId]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const list = await invoke<string[]>("list_session_images", { sessionId });
      setImages(list);
      setError("");
    } catch (e) {
      setError(`图片加载失败: ${e}`);
    }
  }, [sessionId]);

  // 事件刷新节流（审查修复）：live:ocr 一帧多块高频到达——目录读也须合并，
  // 500ms 窗口内只执行一次；初始/手动刷新不受限
  const lastEventRefreshRef = useRef(0);
  const refreshThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastEventRefreshRef.current < REFRESH_THROTTLE_MS) return;
    lastEventRefreshRef.current = now;
    void refresh();
  }, [refresh]);

  // 初次加载 + 归档事件即时刷新（live:image-saved 为主，live:ocr 兜底）
  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const unlisteners: Promise<() => void>[] = [
      listen<string>("live:image-saved", () => refreshThrottled()),
      listen("live:ocr", () => refreshThrottled()),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [refresh, refreshThrottled, sessionId]);

  if (!sessionId) return null;
  // 2026-08 用户需求：最近画面按时间先后排列——后端 list_session_images
  // 已按文件名（=时间戳）升序返回，此处不再 reverse（前→后 = 旧→新，新图追加在末尾）
  const shown = images.slice(-MAX_SHOWN);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 8, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>🖼 最近画面（{images.length} 张，实时归档）</span>
        <button
          onClick={() => void refresh()}
          style={{ marginLeft: "auto", fontSize: 11, color: "#0d9488", cursor: "pointer", border: "none", background: "none", padding: 0 }}
        >
          ⟳ 刷新
        </button>
      </div>

      {/* 点击放大的大图预览（full 原图） */}
      {expanded && baseUrl && (
        <div style={{ marginBottom: 6, position: "relative", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
          <img
            src={convertFileSrc(`${baseUrl}/${expanded}`)}
            alt="关键帧原图"
            style={{ width: "100%", maxHeight: 240, objectFit: "contain", display: "block", background: "#f9fafb" }}
          />
          <button
            onClick={() => setExpanded(null)}
            title="关闭预览"
            style={{
              position: "absolute", top: 4, right: 4, border: "none", background: "rgba(0,0,0,0.55)",
              color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12, width: 22, height: 22, lineHeight: "18px",
            }}
          >
            ✕
          </button>
          <span style={{ position: "absolute", bottom: 4, left: 6, fontSize: 10, color: "#fff", background: "rgba(0,0,0,0.45)", padding: "1px 6px", borderRadius: 4 }}>
            {tsLabel(expanded)}
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>等待画面变化…（板书/PPT 翻页时自动截取，Ctrl+Shift+S 手动截图）</div>
      ) : (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {shown.map((rel) => (
            <button
              key={rel}
              onClick={() => setExpanded(expanded === rel ? null : rel)}
              title={`${tsLabel(rel)}（点击放大）`}
              style={{
                flexShrink: 0, padding: 0, border: expanded === rel ? "2px solid #0d9488" : "1px solid #e5e7eb",
                borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "#f9fafb", position: "relative",
              }}
            >
              {baseUrl && (
                <img
                  src={convertFileSrc(`${baseUrl}/${thumbOf(rel)}`)}
                  alt={tsLabel(rel)}
                  style={{ width: 96, height: 54, objectFit: "cover", display: "block" }}
                />
              )}
              <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.45)", padding: "0 3px", textAlign: "left" }}>
                {tsLabel(rel)}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
