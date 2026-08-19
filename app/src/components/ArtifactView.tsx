/**
 * ArtifactView — 会话产物视图（v0.5.0 M7，REQ-052/053）。
 *
 * @ai-context: 会话详情页"原料视图 / 产物视图"切换——产物块按 order 渲染：
 *              LaTeX（KaTeX 本地化）/ Markdown 表格 / 图片 / 文本块；
 *              低置信样式（黄色虚线下划线）+ AI 占位样式（"AI 增强待 V1.0"）。
 * @ai-context: 产物 ↔ 时间轴双向定位：块 refs.frame_ms 可跳转对应转写段。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArtifactBlock, SessionArtifact } from "../types";
import { aiPlaceholderLabel, lowConfidenceClass, renderLatex, renderMarkdownTable } from "./structuredBlocks";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

/** 精修进度载荷（Rust RefineProgress） */
interface RefineProgressPayload {
  done: number;
  total: number;
  currentKind: string;
}

export default function ArtifactView({ sessionId }: { sessionId: number }) {
  const [artifact, setArtifact] = useState<SessionArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  // v0.5.0 M8（REQ-055）：云端 AI 状态（V1.0 未开放 → 按钮占位）
  const [aiStatus, setAiStatus] = useState<{ available: boolean; version: string; message: string } | null>(null);
  // v0.5.0 模型版：课后精修状态（精修中/完成/跳过）
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState("");

  // 精修事件（session:refining 进度 → session:refined 完成 → 刷新产物）
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<RefineProgressPayload>("session:refining", (e) => {
        setRefining(true);
        setRefineMsg(`精修中：${e.payload.currentKind} ${e.payload.done}/${e.payload.total}`);
      }),
      listen<RefineProgressPayload>("session:refined", (e) => {
        setRefining(false);
        setRefineMsg(`精修完成：${e.payload.done} 区域已升级为模型版`);
        void build();
      }),
      listen<string>("session:refine-skipped", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
      listen<string>("session:refine-failed", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 云端 AI 状态（补缝式：V1.0 开放前占位展示）
  useEffect(() => {
    void invoke<{ available: boolean; version: string; message: string }>("ai_enhance_status")
      .then(setAiStatus)
      .catch(() => setAiStatus(null));
  }, []);

  // 图片读取基地址（与图集共用通道）
  useEffect(() => {
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
  }, [sessionId]);

  const build = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const a = await invoke<SessionArtifact>("build_session_artifact", { sessionId });
      setArtifact(a);
    } catch (e) {
      setError(`产物构建失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // 进入视图自动构建（可重算：覆盖旧产物）
  useEffect(() => {
    void build();
  }, [build]);

  const blockToNote = async () => {
    try {
      await invoke<number>("artifact_to_note", { sessionId });
      setError("");
    } catch (e) {
      setError(`落笔记失败: ${e}`);
    }
  };

  /** 课后精修（模型版：表格 SLANet / 公式 FormulaNet；未下载自动跳过并提示） */
  const refine = async () => {
    setRefining(true);
    setRefineMsg("精修启动中…");
    try {
      const msg = await invoke<string>("refine_session", { sessionId });
      setRefineMsg(msg);
    } catch (e) {
      setRefining(false);
      setRefineMsg(`精修失败: ${e}`);
    }
  };

  const renderBlock = (b: ArtifactBlock) => {
    const key = `${b.kind}-${b.order}`;
    switch (b.kind) {
      case "paragraph":
        return <p key={key} style={{ fontSize: 13, lineHeight: 1.7, margin: "4px 0" }}>{b.payload.text}</p>;
      case "summary":
        return <h4 key={key} style={{ margin: "10px 0 4px", color: "#0d9488" }}>{b.payload.text}</h4>;
      case "claim":
        return <div key={key} style={{ fontSize: 13, margin: "4px 0" }}>💡 {b.payload.text}</div>;
      case "quote":
        return <blockquote key={key} style={{ margin: "4px 0", padding: "6px 10px", background: "#f9fafb", borderLeft: "3px solid #0d9488", fontSize: 13 }}>{b.payload.text}</blockquote>;
      case "highlight":
        return <div key={key} className={lowConfidenceClass(1)} style={{ fontSize: 13, margin: "4px 0" }}>🔆 {b.payload.text}</div>;
      case "decision":
        return <div key={key} style={{ fontSize: 13, margin: "4px 0" }}>✅ 决议：{b.payload.text}</div>;
      case "todo":
        return <div key={key} style={{ fontSize: 13, margin: "4px 0" }}>☑️ 待办：{b.payload.text}</div>;
      case "term-anchor":
        return <div key={key} style={{ fontSize: 13, margin: "4px 0" }}>📌 <b>{b.payload.term}</b>{b.payload.definition ? `：${b.payload.definition}` : ""}</div>;
      case "table":
        return (
          <div key={key} className={lowConfidenceClass(b.payload.structure_confidence ?? null)} style={{ margin: "6px 0", overflowX: "auto" }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownTable(b.payload.markdown ?? "") }}
          />
        );
      case "formula":
        return (
          <div key={key} className={lowConfidenceClass(b.payload.confidence ?? null)} style={{ margin: "6px 0", textAlign: "center" }}
            dangerouslySetInnerHTML={{ __html: renderLatex(b.payload.latex ?? "") }}
          />
        );
      case "code-block":
        return <pre key={key} style={{ background: "#0f172a", color: "#e2e8f0", borderRadius: 6, padding: 10, fontSize: 12, overflowX: "auto" }}>{b.payload.code}</pre>;
      case "key-image":
      case "screen-shot":
        return (
          <div key={key} style={{ margin: "6px 0" }}>
            {baseUrl && <img src={convertFileSrc(`${baseUrl}/${b.payload.image}`)} alt={b.payload.image ?? ""} style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 6, display: "block" }} loading="lazy" />}
          </div>
        );
      case "step-card":
        return (
          <div key={key} style={{ margin: "8px 0", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "flex", gap: 10 }}>
            {/* REQ-123：跟练步骤图卡本版有卡无图（image 空串；配图在 M3 REQ-088 图注后完善） */}
            {baseUrl && b.payload.image && <img src={convertFileSrc(`${baseUrl}/${b.payload.image}`)} alt="" style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} loading="lazy" />}
            <div style={{ fontSize: 13 }}>{b.payload.description}</div>
          </div>
        );
      case "qa-pair":
        return (
          <div key={key} style={{ margin: "6px 0", fontSize: 13 }}>
            <div><b>Q：</b>{b.payload.question}</div>
            <div style={{ color: "#374151" }}><b>A：</b>{b.payload.answer}</div>
          </div>
        );
      default:
        return <div key={key} style={{ fontSize: 12, color: "#9ca3af" }}>{b.kind}（未渲染）</div>;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📄 会话产物（{artifact?.profile ?? "—"}）</span>
        <button style={btn} onClick={() => void build()} disabled={loading}>
          {loading ? "构建中…" : "⟳ 重新构建"}
        </button>
        <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }} onClick={() => void blockToNote()}>
          📝 一键落笔记
        </button>
        {/* v0.5.0 M8（REQ-055）：AI 增强占位（云端 V1.0 开放） */}
        <button
          style={{ ...btn, border: "1px dashed #f59e0b", color: "#b45309", background: "#fffbeb", borderRadius: 6 }}
          title={aiStatus?.message ?? ""}
          onClick={() => setError(aiStatus?.message ?? "补缝式 AI 云端实装排期 V1.0")}
        >
          ✨ AI 增强（{aiStatus?.version ?? "V1.0"} 开放）
        </button>
        {/* v0.5.0 模型版：课后精修（表格/公式模型版静默升级） */}
        <button
          style={{ ...btn, border: "1px solid #0d9488", color: "#0f766e", background: "#f0fdfa", borderRadius: 6 }}
          onClick={() => void refine()}
          disabled={refining}
        >
          {refining ? "精修中…" : "🔬 课后精修"}
        </button>
        {error && <span style={{ fontSize: 11, color: "#dc2626" }}>{error}</span>}
      </div>
      {artifact && artifact.blocks.length === 0 && (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>本会话暂无产物（无转写/画面内容）</div>
      )}
      {refineMsg && (
        <div style={{ fontSize: 11, color: refining ? "#b45309" : "#0d9488", marginBottom: 6 }}>
          {refining ? "⏳ " : ""}{refineMsg}
        </div>
      )}
      {artifact?.blocks.map(renderBlock)}
      {/* AI 占位提示（补缝式 AI V1.0 开放前；REQ-055） */}
      {artifact && artifact.blocks.some((b) => b.source === "placeholder") && (
        <div style={{ fontSize: 11, color: "#b45309", marginTop: 8, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 10px" }}>
          ⏳ {aiPlaceholderLabel()}（低置信块可后续由 AI 补缝增强）
        </div>
      )}
    </div>
  );
}
