/**
 * PhotoCapturePanel — 图文采集面板（v0.11.7 第三采集动线）。
 *
 * @ai-context: 三态动线（仿实时捕获）：开始（创建 kind=photo 会话）→ 截屏
 *              （全屏快照 → 框选遮罩 → canvas 裁剪 → 存图+OCR，即时反馈识别
 *              预览）→ 完成（零截图删会话不留空壳）/ 放弃。产物 = 图文会话，
 *              会话列表/详情/转笔记全链路复用现有会话体系。
 * @ai-context: 互斥（实时捕获进行中）由后端 start_photo_session 拒绝，前端
 *              仅原样展示错误原因（不静默）。
 */
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import ScreenSelectOverlay from "./ScreenSelectOverlay";

const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const panel: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 };

interface Props {
  onOpenSessions?: (sessionId: number) => void;
  onStatus: (msg: string) => void;
}

type Phase = "idle" | "collecting" | "done";

/** save_photo_capture 返回契约（Rust PhotoCaptureResult camelCase） */
interface PhotoResult {
  duplicated: boolean;
  blockCount: number;
  preview: string[];
  imageRef: string;
}

export default function PhotoCapturePanel({ onOpenSessions, onStatus }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [lastImageRef, setLastImageRef] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [snapshot, setSnapshot] = useState<{ src: string; w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const start = async () => {
    try {
      // 标题时间由前端生成（JS Date；Rust 侧免引本地时间依赖）
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const title = `图文会话 ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const id = await invoke<number>("start_photo_session", { title });
      setSessionId(id);
      setCount(0);
      setLastImageRef(null);
      setBaseUrl("");
      setMsg("");
      setPhase("collecting");
      onStatus(`图文采集已开始（会话 #${id}）`);
    } catch (e) {
      onStatus(`开始采集失败: ${e}`);
    }
  };

  const openCapture = async () => {
    try {
      const s = await invoke<{ base64: string; width: number; height: number }>("capture_screen_snapshot");
      setSnapshot({ src: `data:image/jpeg;base64,${s.base64}`, w: s.width, h: s.height });
    } catch (e) {
      onStatus(`截屏失败: ${e}`);
    }
  };

  const confirmCapture = useCallback(
    async (pngBase64: string) => {
      if (sessionId == null) return;
      setSaving(true);
      try {
        const r = await invoke<PhotoResult>("save_photo_capture", { sessionId, imageB64: pngBase64 });
        setSnapshot(null);
        if (r.duplicated) {
          setMsg("⚠ 与上一张内容相同，未重复保存");
          return;
        }
        setCount((c) => c + 1);
        setLastImageRef(r.imageRef);
        if (baseUrl === "") {
          const url = await invoke<string>("session_images_base_url", { sessionId }).catch(() => "");
          setBaseUrl(url);
        }
        setMsg(
          r.blockCount > 0
            ? `已识别 ${r.blockCount} 块：${r.preview.slice(0, 2).join(" · ")}`
            : "未识别到文字（截图已保存）",
        );
      } catch (e) {
        setMsg(`保存截图失败: ${e}`);
      } finally {
        setSaving(false);
      }
    },
    [sessionId, baseUrl],
  );

  const finish = async () => {
    if (sessionId == null) return;
    try {
      const r = await invoke<string>("finish_photo_session", { sessionId });
      onStatus(r);
      setPhase("done");
    } catch (e) {
      onStatus(`完成采集失败: ${e}`);
    }
  };

  const discard = async () => {
    if (sessionId == null) return;
    try {
      await invoke("discard_photo_session", { sessionId });
      onStatus("已放弃图文采集");
      setPhase("idle");
      setSessionId(null);
    } catch (e) {
      onStatus(`放弃失败: ${e}`);
    }
  };

  return (
    <>
      <div style={panel}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>图文采集（截屏导入图文内容）</div>
        {phase === "idle" && (
          <button
            onClick={() => void start()}
            style={{ ...btn, width: "100%", padding: "8px 0", fontWeight: 600, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }}
          >
            ▶ 开始图文采集
          </button>
        )}
        {phase === "collecting" && sessionId != null && (
          <>
            <p style={{ fontSize: 11, color: "#0f766e", margin: "0 0 6px" }}>
              会话 #{sessionId} 采集中 · 已截 {count} 张
            </p>
            {lastImageRef && baseUrl && (
              <img
                src={convertFileSrc(`${baseUrl}/${lastImageRef}`)}
                alt="最近截图"
                style={{ width: "100%", maxHeight: 110, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", marginBottom: 6, display: "block" }}
              />
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...btn, flex: 1, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }} onClick={() => void openCapture()}>
                📷 截屏
              </button>
              <button style={{ ...btn, background: "#047857", color: "#fff", border: "none", borderRadius: 6 }} onClick={() => void finish()}>
                ✅ 完成采集
              </button>
              <button style={{ ...btn, border: "1px solid #e5e7eb", borderRadius: 6 }} onClick={() => void discard()}>
                放弃
              </button>
            </div>
            {msg && <p style={{ fontSize: 11, color: "#374151", margin: "6px 0 0" }}>{msg}</p>}
          </>
        )}
        {phase === "done" && sessionId != null && (
          <>
            <p style={{ fontSize: 11, color: "#047857", margin: "0 0 6px" }}>✅ 图文会话 #{sessionId} 已保存（{count} 张截图）</p>
            {onOpenSessions && (
              <button
                onClick={() => onOpenSessions(sessionId)}
                style={{ ...btn, width: "100%", background: "#fff", border: "1px solid #2563eb", color: "#2563eb", borderRadius: 6 }}
              >
                去会话页查看
              </button>
            )}
          </>
        )}
      </div>
      {snapshot && (
        <ScreenSelectOverlay
          src={snapshot.src}
          imageWidth={snapshot.w}
          imageHeight={snapshot.h}
          saving={saving}
          onConfirm={(b64) => void confirmCapture(b64)}
          onCancel={() => setSnapshot(null)}
        />
      )}
    </>
  );
}
