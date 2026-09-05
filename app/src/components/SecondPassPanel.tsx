/**
 * SecondPassPanel — 会话全量离线精修（第二遍）裁决面板（v0.20.2 / REQ-268）。
 *
 * @ai-context: 会话结束后把 S4 落盘音频全窗重跑 SenseVoice（后端 second_pass_* 命令），
 *              本面板呈现「现网基线 → 离线精修」段级 diff 供逐条/批量采纳·回退；
 *              原料 session_segments 永不变（可逆契约——采纳只影响读取/转笔记轴，
 *              原料视图始终显示原文，本面板即裁决与复核面）。
 * @ai-context: 运行态为内存注册表（崩溃后 pending 草稿可重跑清理）——面板以
 *              session:refine2:* 事件驱动刷新（progress/done/failed/aborted）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** RefineDraft（Rust serde 默认 snake_case 字段——与后端契约一致） */
export interface RefineDraftView {
  id: number;
  session_id: number;
  origin: string;
  start_ms: number;
  end_ms: number;
  base_text: string;
  refined_text: string;
  source: string;
  confidence: number | null;
  similarity: number | null;
  status: "pending" | "adopted" | "rejected";
  created_at: number;
  decided_at: number | null;
}

export interface SecondPassView {
  running: boolean;
  total: number;
  pending: number;
  adopted: number;
  rejected: number;
  items: RefineDraftView[];
}

interface Props {
  sessionId: number;
  /** 数据变更回调（采纳后刷新外部——转笔记装载为服务端合成，无需重拉） */
  onChanged?: () => void;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: 720,
  maxWidth: "92vw",
  maxHeight: "82vh",
  overflow: "auto",
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const ghostBtn: React.CSSProperties = { ...btn, background: "#fff", border: "1px solid #e5e7eb", color: "#374151" };

/** 相对会话起点的 mm:ss（面板时间轴标签；纯本地格式化，避免时区陷阱） */
function fmtClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SecondPassPanel({ sessionId, onChanged, onClose }: Props) {
  const [view, setView] = useState<SecondPassView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningMsg, setRunningMsg] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      const v = await invoke<SecondPassView>("second_pass_list", { sessionId });
      setView(v);
      if (v.running) setRunningMsg("第二遍进行中…");
    } catch (e) {
      setErr(`读取失败: ${e}`);
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // session:refine2:* 事件驱动（进度/完成/失败/中止）
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<{ sessionId: number; done: number; total: number }>(
        "session:refine2:progress",
        (e) => {
          if (e.payload.sessionId !== sessionId) return;
          setRunningMsg(`第二遍转写中 ${e.payload.done}/${e.payload.total}…`);
        },
      ),
      listen<{ sessionId: number; proposals: number }>("session:refine2:done", (e) => {
        if (e.payload.sessionId !== sessionId) return;
        setRunningMsg("");
        void reload();
        onChanged?.();
      }),
      listen<{ sessionId: number; error: string }>("session:refine2:failed", (e) => {
        if (e.payload.sessionId !== sessionId) return;
        setRunningMsg("");
        setErr(`第二遍失败: ${e.payload.error}`);
        void reload();
      }),
      listen<number>("session:refine2:aborted", (e) => {
        if (e.payload !== sessionId) return;
        setRunningMsg("已取消（已完成窗口保留为待裁决草稿）");
        void reload();
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [sessionId, reload, onChanged]);

  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      await invoke("second_pass_start", { sessionId });
      setRunningMsg("启动中…");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await invoke("second_pass_cancel", { sessionId });
      setRunningMsg("正在停止…");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (draftId: number, adopt: boolean) => {
    try {
      await invoke("second_pass_decide", { sessionId, draftId, adopt });
      onChanged?.();
      await reload();
    } catch (e) {
      setErr(`裁决失败: ${e}`);
    }
  };

  /** 批量采纳全部待裁决草稿（逐条裁决——单条失败即停并提示） */
  const adoptAllPending = async () => {
    if (!view) return;
    for (const d of view.items.filter((x) => x.status === "pending")) {
      await decide(d.id, true);
    }
  };

  /** 全部回退（恢复原料轴；adopted → rejected 双向可翻转） */
  const rejectAllAdopted = async () => {
    if (!view) return;
    for (const d of view.items.filter((x) => x.status === "adopted")) {
      await decide(d.id, false);
    }
  };

  const pending = view?.pending ?? 0;
  const adopted = view?.adopted ?? 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>⚡ 离线精修（全量第二遍）</h3>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
            S4 音频全窗 SenseVoice → 段级 diff → 采纳/回退（原料永不变）
          </span>
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={onClose}>
            关闭
          </button>
        </div>

        {runningMsg && (
          <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            ⏳ {runningMsg}
          </div>
        )}
        {err && (
          <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          {!view?.running ? (
            <>
              <button style={okBtn} onClick={() => void start()} disabled={busy}>
                ▶ 开始第二遍
              </button>
              <button style={ghostBtn} onClick={() => void adoptAllPending()} disabled={pending === 0 || busy}>
                全部采纳（{pending}）
              </button>
              <button style={ghostBtn} onClick={() => void rejectAllAdopted()} disabled={adopted === 0 || busy}>
                全部回退（{adopted}）
              </button>
            </>
          ) : (
            <button style={{ ...ghostBtn, color: "#b45309" }} onClick={() => void cancel()} disabled={busy}>
              ⏹ 取消
            </button>
          )}
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
            待裁决 {pending} · 已采纳 {adopted} · 已回退 {view?.rejected ?? 0}
          </span>
        </div>

        {view === null ? (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>加载中…</p>
        ) : view.total === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>
            {view.running ? "任务已启动，等待首个窗口…" : "暂无精修草稿——点击「开始第二遍」用 S4 音频全窗重跑 SenseVoice，有实质差异的窗口会生成本页草稿。"}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {view.items.map((d) => {
              const unchanged = d.base_text === d.refined_text;
              return (
                <div
                  key={d.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: d.status === "adopted" ? "#ecfdf5" : d.status === "rejected" ? "#f9fafb" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      {fmtClock(d.start_ms)} – {fmtClock(d.end_ms)}
                    </span>
                    {d.similarity != null && (
                      <span style={{ fontSize: 11, color: "#6b7280" }}>相似度 {(d.similarity * 100).toFixed(0)}%</span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        marginLeft: "auto",
                        color: d.status === "adopted" ? "#047857" : d.status === "rejected" ? "#9ca3af" : "#b45309",
                      }}
                    >
                      {d.status === "adopted" ? "已采纳 ✓" : d.status === "rejected" ? "已回退" : unchanged ? "" : "待裁决"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 3, textDecoration: "line-through", opacity: 0.75 }}>
                    {d.base_text || "（原链路无内容）"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#111827" }}>{d.refined_text}</div>
                  {d.status === "pending" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button style={{ ...okBtn, fontSize: 11 }} onClick={() => void decide(d.id, true)}>
                        ✓ 采纳
                      </button>
                      <button style={{ ...ghostBtn, fontSize: 11 }} onClick={() => void decide(d.id, false)}>
                        回退
                      </button>
                    </div>
                  )}
                  {d.status === "adopted" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button style={{ ...ghostBtn, fontSize: 11 }} onClick={() => void decide(d.id, false)}>
                        ↩ 撤销采纳（恢复原文）
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
          说明：采纳的替换在「笔记预览 / 转为笔记」时生效（服务端合成）；原料视图恒显示原始转写便于复核。批量采纳为逐条裁决，失败即停。
        </p>
      </div>
    </div>
  );
}
