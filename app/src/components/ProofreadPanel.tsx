/**
 * ProofreadPanel — 可选 LLM 文本校对面板（v0.20.2 / REQ-270）。
 *
 * @ai-context: 建议制流程——预估成本 → 勾选「仅文本上云」授权 → 运行（后端
 *              proofread_run，逐句建议落 origin=proofread 草稿）→ 逐条采纳/回退
 *              （复用 second_pass_decide 裁决通道，原料 session_segments 永不变）；
 *              双闸门（proofread_enabled + content_gate）未开时给出明确引导文案。
 * @ai-context: 批 4 T7 迁移：自建遮罩/居中几何（原 680 px 面板 → `Modal` 的 `l` 档 720，
 *              +40）交给 `Modal`（barrel 导入，B5）——遮罩、ESC、焦点陷阱、层级、body
 *              滚动锁都是它的独占职责（ADR-033 §7）。开合态仍由父层持有
 *              （`SessionDetailPanel` 的 `showProofread` 条件挂载）⇒ `open` 恒为 `true`。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Modal, StatusLine, Text } from "../ui/primitives";
import { invoke } from "@tauri-apps/api/core";
import type { RefineDraftView, SecondPassView } from "./SecondPassPanel";

/** 响应结构（ProofreadEstimateView/ProofreadRunView 均 serde camelCase——字段须 camel 读取） */
interface EstimateView {
  sentences: number;
  chars: number;
  costYuan: number;
  model: string;
  capped: boolean;
}

interface RunView {
  draftCount: number;
  suggestionsReceived: number;
  chars: number;
  costYuan: number;
  model: string;
  capped: boolean;
}

interface Props {
  sessionId: number;
  onClose: () => void;
}

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
    setErr("");
    // allSettled：单侧失败仍刷新成功侧（run 完成消息不因刷新失败被吞）
    const [eR, lR] = await Promise.allSettled([
      invoke<EstimateView>("proofread_estimate", { sessionId }),
      invoke<SecondPassView>("proofread_list", { sessionId }),
    ]);
    if (eR.status === "fulfilled") setEst(eR.value);
    if (lR.status === "fulfilled") setList(lR.value);
    const reasons = [eR, lR]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason));
    if (reasons.length > 0) setErr(`刷新失败: ${reasons.join("；")}`);
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
    let ok = false;
    try {
      const v = await invoke<RunView>("proofread_run", { sessionId, authorized: true });
      ok = true;
      setMsg(
        `校对完成：${v.suggestionsReceived} 条建议 → ${v.draftCount} 条待裁决草稿（预估 ¥${v.costYuan.toFixed(4)}）${v.capped ? "（超出 240 句部分未校对）" : ""}`,
      );
    } catch (e) {
      setErr(String(e));
      setMsg("");
    } finally {
      setBusy(false);
      // 成功路径必刷新草稿列表；reload 内部容错（allSettled），刷新失败不吞完成消息
      if (ok) await reload();
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
    <Modal open onClose={onClose} title="文本校对（LLM）" size="l" testId="proofread-panel">
      {/* 自绘头部（标题 + 说明 + 关闭钮）已删：标题文本交给 `Modal` 的 head（关闭钮由
          `Modal` 的 `${testId}-close` 契约提供）；说明行原样保留为正文首行 */}
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
        逐句建议制 · 仅文本上云 · 人类裁决（原料永不变）
      </div>

      {msg && (
        <div style={{ fontSize: 12, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ marginBottom: 8 }}>
          <StatusLine kind="error">{err}</StatusLine>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#374151" }}>
          候选句：<b>{est?.sentences ?? "…"}</b> 句（约 {est?.chars ?? "…"} 字符）
          {est?.capped ? <span style={{ color: "#b45309" }}>（已超 240 句护栏，超出部分本次不校对）</span> : ""}
          ，预估 <b>¥{(est?.costYuan ?? 0).toFixed(4)}</b>（模型 {est?.model ?? "…"}）
        </div>
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          我已阅读并同意：本次仅上传<b>转写文本</b>用于校对（语音/画面永不出本机）
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="primary" size="md" disabled={busy || pending > 0} onClick={() => void run()}>
            {busy ? "校对中…" : "▶ 运行校对（建议落草稿，不直改）"}
          </Button>
          {pending > 0 && (
            <span style={{ fontSize: 11, color: "#b45309" }}>有 {pending} 条待裁决草稿——请先裁决（采纳/回退）再重跑，防重复建议</span>
          )}
        </div>
      </div>

      {list !== null && list.total === 0 && !busy && (
        est && est.sentences === 0 ? (
          <EmptyState title="本会话无可校对句子（无转写内容）。" />
        ) : (
          <EmptyState title="暂无校对草稿——" description="运行后建议在此逐条裁决。" />
        )
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
              <Text as="div" tone="ink-3" style={{ fontSize: 11, marginBottom: 3 }}>
                {fmtClock(d.start_ms)} – {fmtClock(d.end_ms)} · 草稿 #{d.id} · 状态：
                {d.status === "pending" ? "待裁决" : d.status === "adopted" ? "已采纳 ✓" : "已回退"}
                {d.similarity != null ? ` · 相似 ${(d.similarity * 100).toFixed(0)}%` : ""}
              </Text>
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
      <Text as="p" tone="ink-3" style={{ fontSize: 11, marginTop: 10 }}>
        采纳后于「笔记预览/转为笔记」生效（与离线精修共用覆盖合成）；原料视图恒显示原始转写。双闸门默认关——如需使用请先在设置→AI 服务开启。
      </Text>
    </Modal>
  );
}
