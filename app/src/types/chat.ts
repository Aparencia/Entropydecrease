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
  /** done | aborted（部分内容）| failed（占位——错误事件另行展示） */
  status: "done" | "aborted" | "failed";
  createdAt: number;
}

/** 流式事件（Rust ChatStreamEvent——kind 标签 + camelCase 字段契约） */
export type ChatStreamEvent =
  | { kind: "chunk"; delta: string }
  | { kind: "done"; content: string; usageJson: string | null }
  | { kind: "failed"; errorKind: string; message: string }
  | { kind: "aborted"; content: string };

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
