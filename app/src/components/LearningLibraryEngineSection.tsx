/**
 * LearningLibraryEngineSection — 设置页「学习库」本地语义引擎治理块（v0.19.5 REQ-259/262）。
 *
 * @ai-context: 低4（0.19.4/5 审查模块化）——从 LearningLibraryPanel 迁出整块
 *              引擎治理（状态/下载/加载/就绪徽标）：面板行数回归 ≤300，本组件
 *              自管状态（emb/engBusy）、自展示局部 msg 小字，经 props 无耦合；
 *              类型契约 EmbeddingStatusView 归位 types/kb（Rust serde camelCase）。
 * @ai-context: 语义徽标行（stats.embeddingReady——FTS5 恒可用 + 回填态）留在
 *              面板徽标行原处——本块只管引擎本体三件事：kb_embedding_status
 *              （如实展示槽位）→ kb_embedding_download（hf-mirror 双源按需
 *              下载 ~25MB）→ kb_embedding_load（加载换槽，成功后引导全量重建
 *              回填向量）。
 * @ai-context: 低6（审查）——下载成功后即重取状态（await loadEmb）：按钮文案/
 *              就绪徽标随 ready 立即翻转，不待下次装载或面板轮询。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EmbeddingStatusView } from "../types/kb";

export default function LearningLibraryEngineSection() {
  const [emb, setEmb] = useState<EmbeddingStatusView | null>(null);
  const [engBusy, setEngBusy] = useState(false);
  // 本块局部消息（下载/加载结果或失败——小字自展示，不进面板主 msg 行）
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadEmb = useCallback(async () => {
    try {
      setEmb(await invoke<EmbeddingStatusView>("kb_embedding_status"));
    } catch (e) {
      setMsg({ kind: "err", text: `语义引擎状态读取失败: ${e}` });
    }
  }, []);

  // 挂载即探测一次（面板常驻挂载 display:none——状态如实展示）
  useEffect(() => {
    void loadEmb();
  }, [loadEmb]);

  /** REQ-259：加载本地语义引擎（换槽；成功后引导重建回填向量） */
  const loadEngine = async () => {
    if (engBusy) return;
    setEngBusy(true);
    setMsg(null);
    try {
      const v = await invoke<EmbeddingStatusView>("kb_embedding_load");
      setEmb(v);
      setMsg({ kind: "ok", text: v.detail });
    } catch (e) {
      setMsg({ kind: "err", text: `语义引擎加载失败: ${e}` });
    } finally {
      setEngBusy(false);
    }
  };

  /** REQ-262：按需下载 bge 模型（model_quantized.onnx + vocab.txt） */
  const downloadEngine = async () => {
    if (engBusy) return;
    setEngBusy(true);
    setMsg(null);
    try {
      const text = await invoke<string>("kb_embedding_download");
      // 低6：下载成功即重取状态——下载态结束按钮变「已下载」、状态徽标就绪，
      // 不等用户手动加载/下一轮轮询（状态来源单一：kb_embedding_status）
      await loadEmb();
      setMsg({ kind: "ok", text });
    } catch (e) {
      setMsg({ kind: "err", text: `模型下载失败: ${e}` });
    } finally {
      setEngBusy(false);
    }
  };

  return (
    <>
      {/* v0.19.5（REQ-259/262）：本地语义引擎治理——状态 / 下载 / 加载 / 重建引导 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8, fontSize: 11.5 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>
          🧬 本地语义引擎（bge-small-zh）
        </span>
        {emb?.ready ? (
          <span data-testid="kb-emb-ready" style={{ color: "#047857" }}>
            ✓ 就绪（dim={emb.dim}）
          </span>
        ) : (
          <span data-testid="kb-emb-noop" style={{ color: "#9ca3af" }} title={emb?.modelDir ?? "模型目录未探测"}>
            ○ {emb?.detail ?? "状态读取中…"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          data-testid="kb-emb-download"
          onClick={() => void downloadEngine()}
          disabled={engBusy || emb?.ready}
          title="按需下载 model_quantized.onnx 与 vocab.txt（约 25MB，hf-mirror）"
          style={{ fontSize: 12, cursor: emb?.ready || engBusy ? "default" : "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: emb?.ready ? "#9ca3af" : "#374151" }}
        >
          {engBusy ? "处理中…" : emb?.ready ? "已下载" : "⬇ 下载模型"}
        </button>
        <button
          data-testid="kb-emb-load"
          onClick={() => void loadEngine()}
          disabled={engBusy || emb?.ready}
          title="从模型目录加载引擎并换槽（加载成功后点「🔄 全量重建」回填向量）"
          style={{ fontSize: 12, cursor: emb?.ready || engBusy ? "default" : "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid #0d9488", background: emb?.ready ? "#f0fdfa" : "#fff", color: emb?.ready ? "#9ca3af" : "#0f766e" }}
        >
          {emb?.ready ? "已加载" : "▶ 加载引擎"}
        </button>
      </div>
      {msg && <p style={{ fontSize: 11, color: msg.kind === "ok" ? "#047857" : "#dc2626", margin: "0 0 6px" }}>{msg.text}</p>}
    </>
  );
}
