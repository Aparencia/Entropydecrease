/**
 * ProofreadPanel — 可选 LLM 文本校对面板（v0.20.2 / REQ-270）。
 *
 * @ai-context: 建议制流程——预估成本 → 勾选「仅文本上云」授权 → 运行（后端
 *              proofread_run，逐句建议落 origin=proofread 草稿）→ 逐条采纳/回退
 *              （复用 second_pass_decide 裁决通道，原料 session_segments 永不变）；
 *              双闸门（proofread_enabled + content_gate）未开时给出明确引导文案。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RefineDraftView, SecondPassView } from "./SecondPassPanel";

interface EstimateView {
  sentences: number;
  chars: number;
  cost_yuan: number;
  model: string;
  capped: boolean;
}

interface RunView {
  draft_count: number;
  suggestions_received: number;
  chars: number;
  cost_yuan: number;
  model: string;
  capped: boolean;
}

interface Props {
  sessionId: number;
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
  width: 680,
  maxWidth: "92vw",
  maxHeight: "82vh",
  overflow: "auto",
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };
const okBtn: React.CSSProperties = { ...btn, background: "#0d9488", color: "#fff", border: "none" };
const ghostBtn: React.CSSProperties = { ...btn, background: "#fff", border: "1px solid #e5e7eb", color: "#374151" };

/** 相对会话起点 mm:ss（纯本地格式化） */
function fmtClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSec / 60) % 60).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

export default function ProofreadPanel({ sessionId, onClose }: Props) {
  const [est, setEst] = useState<EstimateView | null>(null);
  const [list, setList] = useState<SecondPassView | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      const [e, l] = await Promise.all([
        invoke<EstimateView>("proofread_estimate", { sessionId }),
        invoke<SecondPassView>("proofread_list", { sessionId }),
      ]);
      setEst(e);
      setList(l);
    } catch (e) {
      setErr(`加载失败: ${e}`);
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async () => {
    if (!consent) {
      setErr("请先勾选「我已阅读并同意：本次仅上传转写文本用于校对」");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("校对进行中（仅文本上云；长会话分块多次请求）…");
    try {
      const v = await invoke<RunView>("proofread_run", { sessionId, authorized: true });
      setMsg(
        `校对完成：${v.suggestions_received} 条建议 → ${v.draft_count} 条待裁决草稿（预估 ¥${v.cost_yuan.toFixed(4)}）${v.capped ? "（超出 240 句部分未校对）" : ""}`,
      );
      await reload();
    } catch (e) {
      setErr(String(e));
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (draftId: number, adopt: boolean) => {
    try {
      await invoke("second_pass_decide", { sessionId, draftId, adopt });
      await reload();
    } catch (e) {
      setErr(`裁决失败: ${e}`);
    }
  };

  const pending = list?.pending ?? 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🔤 文本校对（LLM）</h3>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
            逐句建议制 · 仅文本上云 · 人类裁决（原料永不变）
          </span>
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={onClose}>
            关闭
          </button>
        </div>

        {msg && (
          <div style={{ fontSize: 12, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            {msg}
          </div>
        )}
        {err && (
          <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#374151" }}>
            候选句：<b>{est?.sentences ?? "…"}</b> 句（约 {est?.chars ?? "…"} 字符）
            {est?.capped ? <span style={{ color: "#b45309" }}>（已超 240 句护栏，超出部分本次不校对）</span> : ""}
            ，预估 <b>¥{(est?.cost_yuan ?? 0).toFixed(4)}</b>（模型 {est?.model ?? "…"}）
          </div>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            我已阅读并同意：本次仅上传<b>转写文本</b>用于校对（语音/画面永不出本机）
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={okBtn} onClick={() => void run()} disabled={busy || pending > 0}>
              {busy ? "校对中…" : "▶ 运行校对（建议落草稿，不直改）"}
            </button>
            {pending > 0 && (
              <span style={{ fontSize: 11, color: "#b45309" }}>有 {pending} 条待裁决草稿——请先裁决（采纳/回退）再重跑，防重复建议</span>
            )}
          </div>
        </div>

        {list !== null && list.total === 0 && !busy && (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>
            {est && est.sentences === 0
              ? "本会话无可校对句子（无转写内容）。"
              : "暂无校对草稿——运行后建议在此逐条裁决。"}
          </p>
        )}

        {(list?.items.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list!.items.map((d: RefineDraftView) => (
              <div
                key={d.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: d.status === "adopted" ? "#ecfdf5" : d.status === "rejected" ? "#f9fafb" : "#fff",
                }}
              >
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>
                  {fmtClock(d.start_ms)} – {fmtClock(d.end_ms)} · 草稿 #{d.id} · 状态：
                  {d.status === "pending" ? "待裁决" : d.status === "adopted" ? "已采纳 ✓" : "已回退"}
                  {d.similarity != null ? ` · 相似 ${(d.similarity * 100).toFixed(0)}%` : ""}
                </div>
                <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 3, textDecoration: "line-through", opacity: 0.75 }}>
                  {d.base_text}
                </div>
                <div style={{ fontSize: 12.5, color: "#111827" }}>{d.refined_text}</div>
                {d.status === "pending" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button style={{ ...okBtn, fontSize: 11 }} onClick={() => void decide(d.id, true)}>✓ 采纳</button>
                    <button style={{ ...ghostBtn, fontSize: 11 }} onClick={() => void decide(d.id, false)}>回退</button>
                  </div>
                )}
                {d.status === "adopted" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button style={{ ...ghostBtn, fontSize: 11 }} onClick={() => void decide(d.id, false)}>↩ 撤销采纳</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
          采纳后于「笔记预览/转为笔记」生效（与离线精修共用覆盖合成）；原料视图恒显示原始转写。双闸门默认关——如需使用请先在设置→AI 服务开启。
        </p>
      </div>
    </div>
  );
}
