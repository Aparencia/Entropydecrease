/**
 * SessionsPage — 会话列表与详情（REQ-010）。
 *
 * @ai-context: 左侧列表（关键词检索 + 状态标记），右侧详情（转写时间轴 + 画面要点）；
 *              会话可一键转笔记（复用后端 session_to_note）与删除。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session, SessionDetail, Note } from "../types";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const SOURCE_LABEL: Record<string, string> = {
  subtitle: "字幕",
  asr: "语音",
  fused: "融合",
};
const STATUS_LABEL: Record<string, string> = {
  recording: "录制中",
  finished: "已完成",
  failed: "异常中断",
};

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async (kw: string) => {
    try {
      const list = await invoke<Session[]>("list_sessions", { keyword: kw || null });
      setSessions(list);
    } catch (e) {
      setStatus(`会话列表加载失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh("");
  }, [refresh]);

  const openDetail = async (id: number) => {
    try {
      const d = await invoke<SessionDetail>("get_session_detail", { id });
      setDetail(d);
    } catch (e) {
      setStatus(`加载详情失败: ${e}`);
    }
  };

  const search = () => void refresh(keyword);

  const toNote = async (id: number) => {
    try {
      const note = await invoke<Note>("session_to_note", { id });
      setStatus(`已转为笔记 #${note.id}`);
    } catch (e) {
      setStatus(`转笔记失败: ${e}`);
    }
  };

  const remove = async (id: number) => {
    try {
      await invoke<boolean>("delete_session", { id });
      if (detail?.session.id === id) setDetail(null);
      void refresh(keyword);
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：会话列表 ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
          🗂 学习会话
        </div>
        <div style={{ padding: 10, display: "flex", gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="搜索标题/窗口"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
          <button style={btn} onClick={search}>搜</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {sessions.length === 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af", padding: 16, textAlign: "center" }}>
              暂无会话，去「课堂助手」开始实时捕获
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => void openDetail(s.id)}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f3f4f6",
                cursor: "pointer",
                background: detail?.session.id === s.id ? "#f0fdfa" : "#fff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                #{s.id} · {STATUS_LABEL[s.status] ?? s.status} · {new Date(s.started_at * 1000).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 右栏：会话详情 ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
        {!detail ? (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 60 }}>
            选择左侧会话查看转写时间轴与画面要点
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{detail.session.title}</h2>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {STATUS_LABEL[detail.session.status]} · {detail.segments.length} 段转写 · {detail.ocr_blocks.length} 块画面
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }} onClick={() => void toNote(detail.session.id)}>
                  📝 转为笔记
                </button>
                <button style={btn} onClick={() => void remove(detail.session.id)}>删除</button>
              </div>
            </div>
            {status && <p style={{ fontSize: 12, color: "#2563eb", marginBottom: 8 }}>{status}</p>}

            {/* 转写时间轴（字幕为主，语音/融合弱化） */}
            <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>转写时间轴</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {detail.segments.length === 0 && (
                <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无转写段</p>
              )}
              {detail.segments.map((seg) => (
                <div key={seg.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", width: 70, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMs(seg.start_ms)} – {fmtMs(seg.end_ms)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      flexShrink: 0,
                      color: seg.source === "subtitle" ? "#0d9488" : "#9ca3af",
                      width: 36,
                    }}
                  >
                    {SOURCE_LABEL[seg.source] ?? seg.source}
                  </span>
                  <span style={{ fontSize: 13, color: seg.source === "fused" ? "#b45309" : "#374151" }}>
                    {seg.text}
                  </span>
                </div>
              ))}
            </div>

            {/* 画面要点 */}
            <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>画面要点（OCR）</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {detail.ocr_blocks.length === 0 && (
                <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无画面识别内容</p>
              )}
              {detail.ocr_blocks.map((b) => (
                <div key={b.id} style={{ fontSize: 12, color: "#4b5563" }}>
                  <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                    [{fmtMs(b.timestamp_ms)}]
                  </span>{" "}
                  {b.text}
                  {b.region === "subtitle" && <span style={{ color: "#0d9488", marginLeft: 4 }}>字幕</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
