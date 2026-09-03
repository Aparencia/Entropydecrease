/**
 * AI 对话领域类型（v0.16.0 REQ-224~230，与 Rust serde 契约对齐）。
 *
 * @ai-context: 纯聊天会话（chat_sessions/chat_messages 双表）与 AI 任务轨迹
 *              （ai_tasks.trajectory_json）在 AI 对话页合并展示：聊天=可写，
 *              任务=只读对话（提示词/回答全文 + 可跳转引用）。
 */

/** 聊天会话（Rust ChatSession；camelCase 契约） */
export interface ChatSession {
  id: number;
  title: string;
  /** 选择的 Provider id（null = 跟随设置页默认） */
  providerId: string | null;
  /** 会话模型（首次发送后回填——消息模型标签口径） */
  model: string | null;
  /** v0.19.1（REQ-260）：学习库问答模式（创建时定死——已有会话不改语义） */
  retrieval: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 聊天气泡内消息（Rust ChatMessage；camelCase 契约） */
export interface ChatMessage {
  id: number;
  sessionId: number;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  /** 用量 JSON 原样（token 展示用；null=服务商未返回） */
  usageJson: string | null;
  /** v0.19.1（REQ-260）：消息级元数据 JSON（学习库问答 {mode,hits}；null=无） */
  metaJson: string | null;
  /** done | aborted（部分内容）| failed（占位——错误事件另行展示） */
  status: "done" | "aborted" | "failed";
  createdAt: number;
}

/** 命中片段（Rust kb_search::KbHit；camelCase 契约——引用卡片/聊天 citations 单位） */
export interface KbHit {
  chunkId: number;
  /** note | fragment */
  sourceKind: "note" | "fragment";
  noteId: number | null;
  fragmentId: number | null;
  /** 笔记标题（note 恒有；fragment 无——前端诚实降级文案） */
  noteTitle: string | null;
  /** 源所属组名（未归组 → null） */
  groupName: string | null;
  /** 命中所在节标题 */
  heading: string | null;
  /** 节级 snippet（`==命中==` 高亮标记——全站渲染协议） */
  snippet: string;
  /** 命中通道（fts | like） */
  scoreKind: "fts" | "like";
}

/** 消息 meta_json 解析产物（mode 区分 hits-only 引导/真回答） */
export interface KbMessageMeta {
  mode: "answer" | "hits-only";
  hits: KbHit[];
}

/** 流式事件（Rust ChatStreamEvent——kind 标签 + camelCase 字段契约） */
export type ChatStreamEvent =
  | { kind: "chunk"; delta: string }
  | { kind: "done"; content: string; usageJson: string | null }
  | { kind: "failed"; errorKind: string; message: string }
  | { kind: "aborted"; content: string }
  /** v0.19.1（REQ-260）：学习库命中片段（本地恒可用——先于/独立于生成） */
  | { kind: "kb_hits"; hits: KbHit[] };

/** LLM 调用轨迹单步（Rust AiTurn；camelCase 契约——任务对话视图数据源） */
export interface AiTurn {
  /** 片序（1 起） */
  turn: number;
  /** 组装后的 system 提示词 */
  system: string;
  /** user 请求文本（精修=AiRefineRequest JSON；vision 附图数占位） */
  user: string;
  /** 模型回答（结构化响应 JSON 原文） */
  response: string;
}
