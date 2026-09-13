/**
 * SessionAnalysisPanel — 会话详情「重新分析」入口 + 结构化分析结果面板（批 7 T20 · §9 #34）。
 *
 * @ai-context Why 是本任务新造的展示面（C10.5 逐字要求先给「展示面设计 + 验收判据」）：
 *   `analyze_session_command` 在规格 §9 的处置是「会话详情『重新分析』」，但**前端零
 *   `SessionAnalysis` 对应**（recon-a §A5⑦：该命令今天没有可重渲染的展示面）⇒ 直接「先接上」
 *   会得到一个调用了却什么都不显示的按钮。本件给的是**最小可交付**：入口按钮 + 只读三段面板
 *   （章节 / 重点 / 术语）。**它是设计决定，不是裁决**（计划 T20 的诚实边界①逐字）。
 * @ai-context 依赖方向：本件是**会话详情子树**的一件（与 `SessionScreenCards` 同级），唯一的 IPC 是
 *   `analyze_session_command`（读）——**不写库、不发事件、不改状态**；结果只落本件自己的 state。
 *   失败面走 `StatusLine kind="error"`（全站唯一错误行原语；不写裸红字面量）。
 * @ai-context 冻结键口径（C9.12）：本件是**新文件** ⇒ `nativeButton` / 边框 / 越界圆角 / 阴影
 *   四族**零字面量**（按钮走 `Button` 原语、排版走 `Text` 的档位）；**不用 `EmptyState`**
 *   （`emptyStateRatchet` 的余量集是逐文件冻结的 ⇒ 新文件用它必红）；**不写「加载中…」**
 *   （`loadingRatchet` 同律）⇒ 待机文案用中性词「未分析」。
 * 副作用：一次 `invoke`（用户点击触发）。边界：① 后端返回空数组的三段各自渲染一行「无」——
 *   **不隐藏整块**（隐藏会让「分析跑了但没结果」与「没跑」不可区分）；② 重复点击被 `busy` 挡住。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, StatusLine, Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";

/** 后端 `SessionAnalysis`（`analysis.rs:45`）的**只读子集**：本件只渲染这三段。
 *  ⚠️ serde 无 `rename_all` ⇒ 字段名逐字是 snake_case（与 Rust 侧同名）。 */
interface SessionAnalysis {
  readonly chapters: readonly { readonly time_ms: number; readonly votes: number; readonly topic_drop: number }[];
  readonly highlights: readonly {
    readonly time_ms: number;
    readonly text: string;
    readonly signals: number;
    readonly reasons: readonly string[];
  }[];
  readonly glossary: readonly {
    readonly term: string;
    readonly ocr_count: number;
    readonly asr_count: number;
    readonly score: number;
  }[];
}

/** 一段的段落标题（三段共用同一形态；标题里带条数 ⇒ 空段与有段一眼可分） */
function SectionTitle({ label, count }: { readonly label: string; readonly count: number }): React.ReactElement {
  return (
    <Text as="p" size={5} tone="ink-3" style={{ margin: "6px 0 2px" }}>
      {label}（{count}）
    </Text>
  );
}

export default function SessionAnalysisPanel({ sessionId }: { readonly sessionId: number }) {
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** 重新分析：读会话 → 后端按档案跑章节/重点/术语检测 → 结果整块替换（无增量合并，语义最简） */
  const run = async (): Promise<void> => {
    setBusy(true);
    setErr("");
    try {
      setAnalysis(await invoke<SessionAnalysis>("analyze_session_command", { id: sessionId }));
    } catch (e) {
      setErr(`分析失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="session-analysis-panel">
      <Button size="sm" variant="secondary" busy={busy} onClick={() => void run()} title="按当前档案重新跑一遍结构化分析">
        {busy ? "分析中…" : "🔄 重新分析"}
      </Button>
      {err !== "" && <StatusLine kind="error" testId="session-analysis-error">{err}</StatusLine>}
      {analysis === null ? (
        <Text as="p" size={5} tone="ink-3" style={{ margin: "4px 0 0" }}>
          未分析
        </Text>
      ) : (
        <div data-testid="session-analysis-result">
          <SectionTitle label="章节" count={analysis.chapters.length} />
          {analysis.chapters.length === 0 ? (
            <Text as="p" size={5} tone="ink-3">无</Text>
          ) : (
            analysis.chapters.map((c) => (
              <Text as="p" size={5} tone="ink-2" key={`ch-${c.time_ms}`}>
                {fmtMs(c.time_ms)} · 信号 {c.votes} · 话题降幅 {c.topic_drop.toFixed(2)}
              </Text>
            ))
          )}
          <SectionTitle label="重点" count={analysis.highlights.length} />
          {analysis.highlights.length === 0 ? (
            <Text as="p" size={5} tone="ink-3">无</Text>
          ) : (
            analysis.highlights.map((h) => (
              <Text as="p" size={5} tone="ink-2" key={`hl-${h.time_ms}-${h.text}`}>
                {fmtMs(h.time_ms)} · {h.text}（信号 {h.signals}{h.reasons.length > 0 ? ` · ${h.reasons.join("/")}` : ""}）
              </Text>
            ))
          )}
          <SectionTitle label="术语" count={analysis.glossary.length} />
          {analysis.glossary.length === 0 ? (
            <Text as="p" size={5} tone="ink-3">无</Text>
          ) : (
            analysis.glossary.map((g) => (
              <Text as="p" size={5} tone="ink-2" key={`gl-${g.term}`}>
                {g.term}（画面 ×{g.ocr_count} / 语音 ×{g.asr_count} · 分 {g.score.toFixed(1)}）
              </Text>
            ))
          )}
        </div>
      )}
    </div>
  );
}
