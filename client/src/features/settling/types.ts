/**
 * 知识入籍 · 类型定义
 * Knowledge settling · type definitions
 *
 * @ai-context: 阶段 A（入口问题）的原子层契约。定义导入来源、AI 概念化
 * 候选、入籍记录、提取内容与文本块五类结构，供 textChunker/contentSanitizer
 * 纯函数与后续 importHandlers / useSettleConcepts 业务层消费。
 * 序列化字段（IPC/SQLite）遵循 docs/standards/api-design.md 的 snake_case；
 * 本层保持 camelCase，转换在边界完成。
 *
 * @ai-context: Atomic-layer contracts for the knowledge-settling flow.
 * camelCase in-process, snake_case at IPC/SQLite boundaries.
 */

/** 知识来源类型 / Import source kinds */
export type ImportSource = 'text' | 'pdf' | 'url' | 'clipboard';

/** AI 概念化候选（预览可编辑，安放时落库） / AI-proposed concept candidate */
export interface ConceptCandidate {
  /** 概念名（→ flashcards.front / feynman 概念） / Concept name */
  name: string;
  /** 一句话摘要（→ 笔记首段） / One-line summary */
  summary: string;
  /** 卡片正面（问题形式；为空则由 name 派生） / Card front (question form) */
  cardFront: string;
  /** 卡片背面（答案要点；可为空） / Card back (answer points) */
  cardBack: string;
}

/** 入籍记录（imports 表行） / Settling record row */
export interface SettlingRecord {
  id: string;
  source: ImportSource;
  /** 原始文件名 / URL / 标题 / Raw file name, URL, or title */
  rawName: string;
  /** 安放的概念卡数量 / Number of settled concepts */
  conceptCount: number;
  /** 安放时间（ISO 8601） / Settled at */
  settledAt: string;
}

/** 导入解析结果（PDF/URL 提取后的统一载体） / Parsed source content */
export interface ExtractedContent {
  title: string;
  text: string;
  source: ImportSource;
  /** 提取质量提示（如图片型 PDF 仅得文本层） / Extraction quality note */
  note?: string;
}

/** 文本块（AI 概念化的输入单元） / Chunk fed to the AI endpoint */
export interface TextChunk {
  index: number;
  text: string;
}
