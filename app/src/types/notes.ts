/**
 * 笔记领域类型（自 types.ts 硬拆归位；与 Rust serde 契约对齐）。
 *
 * @ai-context: 覆盖文件流水线转写原料（TranscriptSegment/OcrBlock/NoteDraft）、
 *              数据库笔记（Note/NewNote）与笔记版本链（NoteVersion/DiffOp/AiUsageRecord）。
 *              Note 保持 snake_case（Rust 侧未 rename，勿改动以免破坏契约）。
 */

/** ASR 转写片段 */
export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  /** 词级时间戳（v0.5.0 REQ-054 B8；null=未开启/旧数据） */
  word_timestamps: { word: string; start_ms: number }[] | null;
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
  /** v0.7.1：来源会话 id（null=手动笔记/未关联/旧数据） */
  session_id?: number | null;
  /** v0.7.5（REQ-171）：生成规则的版本标识（null=旧笔记/手动笔记，诚实降级） */
  rule_version?: string | null;
  /** v0.7.5（REQ-171）：净化统计 JSON（null=旧笔记/手动笔记） */
  purify_stats?: string | null;
  /** v0.10.0：标签 JSON 数组 */
  tags: string;
  /** v0.10.0：属性 JSON 对象（null=无） */
  properties?: string | null;
  /** v0.10.0：固定标记（0=未固定，1=固定） */
  pin: number;
  /** v0.11.0（REQ-195）：所属笔记组 id（null=未归组/旧数据） */
  group_id?: number | null;
  created_at: number;
  updated_at: number;
}

/** 新建笔记入参 */
export interface NewNote {
  title: string;
  content: string;
  source: string;
  session_id?: number | null;
  /** v0.10.0：标签 JSON 数组 */
  tags?: string;
  /** v0.10.0：属性 JSON 对象 */
  properties?: string | null;
  /** v0.11.0：直接指定组（组视图内新建；缺省不归组） */
  group_id?: number | null;
}

// ────────────────────────────────────────────────────────────
// 笔记组类型（v0.11.0 REQ-195~198；Rust NoteGroup camelCase 契约）
// ────────────────────────────────────────────────────────────

/** 组地形：container（课程/容器）/ feed（碎片） */
export type GroupTerrain = "container" | "feed";

/** 组类别：course 课程组 / topic 主题组 / standalone 独立组 */
export type GroupKind = "course" | "topic" | "standalone";

/** 路由理由 JSON（Rust 侧序列化；损坏时前端防御性回退） */
export interface GroupRouteReason {
  /** own / topic / confirm / course */
  action?: string;
  /** true=信号冲突/低结构无领域——UI 高亮待确认 */
  needsConfirm?: boolean;
  reasons?: string[];
}

/** 笔记组（统一产物层唯一容器，v4 §7.4） */
export interface NoteGroup {
  id: number;
  name: string;
  terrain: GroupTerrain;
  kind: GroupKind;
  domainTag: string | null;
  /** route / series / manual */
  source: string;
  seriesKey: string | null;
  /** 路由理由 JSON 字符串（解析见 GroupRouteReason） */
  routeReason: string | null;
  /** 0=自动路由，1=用户已改判（修改即记忆） */
  routeOverridden: number;
  noteCount: number;
  createdAt: number;
  updatedAt: number;
}

// ────────────────────────────────────────────────────────────
// 笔记版本类型（v0.8.0 M4，REQ-144/REQ-143 完整；Rust serde 契约）
// ────────────────────────────────────────────────────────────

/** 版本来源（Rust NoteVersionSource；kebab-case） */
export type NoteVersionSource = "rule" | "ai-refine" | "ai-enrich" | "user-edit";

/** 版本元数据（Rust VersionMeta；camelCase 契约） */
export interface VersionMeta {
  costYuan: number | null;
  model: string | null;
  slices: number | null;
  mergedFrom: string | null;
}

/** 版本快照（Rust NoteVersion；camelCase 契约） */
export interface NoteVersion {
  id: number;
  noteId: number;
  content: string;
  source: NoteVersionSource;
  parentId: number | null;
  createdAt: number;
  meta: VersionMeta;
}

/** 段级 diff 操作（Rust DiffOp：三态外部标签） */
export type DiffOp = { unchanged: string } | { added: string } | { removed: string };

/** AI 成本记录（Rust AiUsageRecord；camelCase 契约） */
export interface AiUsageRecord {
  id: number;
  noteId: number;
  opType: string;
  tokensIn: number;
  tokensOut: number;
  costYuan: number;
  model: string;
  slices: number;
  createdAt: number;
}
