/**
 * 前端共享领域类型（与 Rust serde 契约对齐）。
 *
 * @ai-context: WindowInfo 对应 Rust CaptureWindow（camelCase 序列化）；
 *              Note 保持 snake_case（Rust 侧未 rename，勿改动以免破坏契约）。
 */

/** 可捕获窗口（Rust list_windows 返回，含推荐评分） */
export interface WindowInfo {
  id: number;
  title: string;
  processName: string;
  pid: number;
  score: number;
  reasons: string[];
}

/** ASR 转写片段 */
export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

/** OCR 画面文本块 */
export interface OcrBlock {
  timestamp_ms: number | null;
  text: string;
  score: number;
}

/** 本地拼接产出的笔记初稿 */
export interface NoteDraft {
  title: string;
  transcript_paragraphs: string[];
  ocr_points: string[];
  markdown: string;
}

/** 数据库中的笔记（Rust Note，snake_case 契约） */
export interface Note {
  id: number;
  title: string;
  content: string;
  source: string;
  created_at: number;
  updated_at: number;
}

/** 新建笔记入参 */
export interface NewNote {
  title: string;
  content: string;
  source: string;
}

// ────────────────────────────────────────────────────────────
// 会话领域类型（v0.2.0，REQ-010，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** 会话记录（Rust Session，snake_case 契约） */
export interface Session {
  id: number;
  title: string;
  source_window: string | null;
  started_at: number;
  ended_at: number | null;
  status: string; // recording | finished | failed
}

/** 会话转写段（asr | subtitle | fused） */
export interface SessionSegment {
  id: number;
  session_id: number;
  start_ms: number;
  end_ms: number;
  text: string;
  source: string;
  confidence: number | null;
}

/** 会话 OCR 块（subtitle | full） */
export interface SessionOcrBlock {
  id: number;
  session_id: number;
  timestamp_ms: number;
  text: string;
  score: number;
  region: string;
}

/** 会话详情（会话 + 转写段 + OCR 块） */
export interface SessionDetail {
  session: Session;
  segments: SessionSegment[];
  ocr_blocks: SessionOcrBlock[];
}

/** 流式 ASR 模型就绪状态 */
export interface StreamingModelStatus {
  ready: boolean;
  missing: string[];
}

/** 模型下载状态（camelCase 契约） */
export interface DownloadStatus {
  state: string; // idle | downloading | done | failed
  currentFile: string | null;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

/** 模型下载进度事件载荷 */
export interface DownloadProgress {
  file: string;
  downloadedBytes: number;
  totalBytes: number;
}

/** 实时会话状态（camelCase 契约） */
export interface LiveSessionStatus {
  active: boolean;
  sessionId: number | null;
}

/** 视频导入进度（Rust ImportProgress，camelCase 契约） */
export interface ImportProgress {
  /** 阶段：subtitle | audio | asr | ocr | done */
  stage: string;
  message: string;
  done: number;
  total: number;
}

/** 实时画面要点事件载荷（Rust OcrEvent，camelCase 契约；live:ocr 事件） */
export interface OcrEvent {
  timestampMs: number;
  text: string;
}
