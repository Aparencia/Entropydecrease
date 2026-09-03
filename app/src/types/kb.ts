/**
 * 检索与发现层前端类型（v0.19 REQ-258/REQ-260——与 Rust serde camelCase 契约对齐）。
 */

/** 索引统计（Rust kb_reindex::KbIndexStats——设置「学习库」段 + 角标数据源） */
export interface KbIndexStats {
  /** FTS5 就绪（bundled SQLite 编译期使能——恒 true） */
  ftsReady: boolean;
  /** embedding 就绪（v0.19.3 前恒 false——无模型 = FTS-only 诚实状态） */
  embeddingReady: boolean;
  /** 当前引擎标识（fts5；embedding 定案后扩展） */
  engine: string;
  chunksTotal: number;
  noteChunks: number;
  fragmentChunks: number;
  ftsRows: number;
  /** 可索引源总数（正文非空笔记 + 全量碎片） */
  sourcesTotal: number;
  sourcesIndexed: number;
  /** 未索引源数（>0 → 「索引待重建」提示） */
  dirtySources: number;
  /** 库内 index_version（≠ currentIndexVersion → 需全量重建） */
  indexVersion: number;
  currentIndexVersion: number;
  reindexAllAt: number | null;
  /** 索引失败计数/最近错误（保存钩子软失败也在——不静默） */
  errorCount: number;
  lastError: string | null;
}

/** 全量重建报告（Done 帧载荷） */
export interface KbReindexReport {
  sourcesTotal: number;
  succeeded: number;
  failed: number;
  notesTotal: number;
  fragmentsTotal: number;
}

/** 重建进度事件（kind 标签分发——与 ChatStreamEvent 同构） */
export type KbReindexEvent =
  | { kind: "progress"; done: number; total: number }
  | { kind: "done"; report: KbReindexReport }
  | { kind: "failed"; message: string };
