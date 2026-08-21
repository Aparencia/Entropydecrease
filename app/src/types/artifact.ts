/**
 * 产物体系领域类型（自 types.ts 硬拆归位；v0.5.0 M7 REQ-052，与 Rust serde 契约对齐）。
 *
 * @ai-context: 会话产物块模型（kind/refs/payload/source）——产物视图渲染契约；
 *              原料引用（BlockRefs）回链转写段/OCR 块/帧坐标。
 */

/** 块类型（Rust ArtifactKind，kebab-case 序列化） */
export type ArtifactKind =
  | "paragraph"
  | "key-image"
  | "table"
  | "formula"
  | "term-anchor"
  | "summary"
  | "step-card"
  | "claim"
  | "quote"
  | "qa-pair"
  | "highlight"
  | "decision"
  | "todo"
  | "agenda-section"
  | "screen-shot"
  | "code-block";

/** 原料引用（Rust BlockRefs） */
export interface BlockRefs {
  segment_id: number | null;
  ocr_block_id: number | null;
  frame_ms: number | null;
}

/** 块载荷（Rust BlockPayload；各变体字段合并为可选结构） */
export interface BlockPayload {
  text?: string;
  image?: string;
  markdown?: string;
  structure_confidence?: number;
  latex?: string;
  source_text?: string;
  confidence?: number;
  term?: string;
  definition?: string | null;
  description?: string;
  start_ms?: number;
  end_ms?: number;
  question?: string;
  answer?: string;
  code?: string;
  language?: string | null;
  /** REQ-123：步骤图卡标签（跟练档案步骤边界） */
  label?: string;
  /** REQ-123：步骤图卡理由（cue/practice/demo 等信号来源） */
  reason?: string;
  /** REQ-121：代码块展示段起始时间（ms） */
  time_ms?: number;
}

/** 块来源（Rust BlockSource） */
export type BlockSource = "local" | "ai-enhanced" | "placeholder";

/** 产物块（Rust ArtifactBlock） */
export interface ArtifactBlock {
  id: number;
  kind: ArtifactKind;
  refs: BlockRefs;
  payload: BlockPayload;
  order: number;
  source: BlockSource;
}

/** 会话产物（Rust SessionArtifact） */
export interface SessionArtifact {
  session_id: number;
  profile: string;
  blocks: ArtifactBlock[];
}
