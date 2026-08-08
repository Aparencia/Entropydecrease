/**
 * 笔记领域类型
 *
 * @ai-context: 纯类型文件。Note.content 存储 TipTap JSON 序列化字符串。
 * sourceRef 由知识入籍流程（阶段 A）写入，用于溯源；sqlite 侧列名 source_ref（v8 迁移）。
 */

/** 笔记 */
export interface Note {
  id: string;
  title: string;
  content: string;               // TipTap JSON 内容
  template: 'outline' | 'cornell' | 'mindmap' | 'free' | 'qa' | 'qa-grid' | 'timeline' | 'blank' | 'video' | 'todo';
  folderId?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  wordCount: number;
  pinned: boolean;               // 是否置顶
  videoNoteType?: string;        // 视频笔记类型标识（lecture/tutorial/etc）
  /** 来源溯源（知识入籍：文件名/URL/粘贴来源，v8 迁移新增） / Settling source reference */
  sourceRef?: string;
  /** 知识半衰期：过期时间（可选，到期后笔记标记为"过时"） / Expiration date for knowledge decay */
  expiresAt?: Date;
  /** 情绪锚点：学习时的情绪标记（emoji 枚举） / Mood anchor for learning emotion */
  mood?: string;
}

/** 笔记双向链接记录（阶段二：由笔记内容中 wiki-link 提及推导的出链） */
export interface NoteLink {
  id: string;
  /** 来源笔记 id（含链接的笔记） */
  fromId: string;
  /** 目标笔记 id（被引用的笔记） */
  toId: string;
  createdAt: Date;
  /** 链接周围的上下文文本（前后各 N 字符，用于反向链接预览） */
  contextText?: string;
  /** 关联强度（0-1，基于上下文相关性估算） */
  relevanceScore?: number;
}

/** 笔记文件夹 */
export interface NoteFolder {
  id: string;
  name: string;
  parentId?: string;             // 支持嵌套文件夹
  color?: string;                // 文件夹颜色标识
  createdAt: Date;
  order: number;                 // 排序权重
}

/** 自由画布文本块 */
export interface FreeCanvasBlock {
  id: string;
  type: 'text';
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number | 'auto' };
}

/** 墨迹点（画布坐标） / Ink point (canvas coordinates) */
export interface InkPoint {
  x: number;
  y: number;
}

/** 墨迹笔画（阶段三 OneNote 式核心墨迹） / Ink stroke */
export interface InkStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  points: InkPoint[];
}

/** 自由画布数据 */
export interface FreeCanvasData {
  blocks: FreeCanvasBlock[];
  /** 阶段三：墨迹笔画层（旧数据无此字段 → 默认 []，向后兼容） */
  strokes?: InkStroke[];
  canvasWidth: number;
  canvasHeight: number;
}

/** 视频笔记元数据（嵌入 TipTap JSON content） */
export interface VideoNoteMeta {
  videoUrl?: string;
  duration?: number;
  platform?: string;
  captureSessionId?: string;    // 关联的 WindowCapture 会话 ID
}

/**
 * 笔记概念实体（由 AI 从笔记内容中提取）
 * Note concept entity extracted by AI from note content
 */
export interface NoteConcept {
  id: string;
  /** 所属笔记 id */
  noteId: string;
  /** 概念名称 */
  name: string;
  /** 相关度（0-1） */
  relevance: number;
  /** 在笔记中出现的上下文文本 */
  context: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间（如重新提取时更新） */
  updatedAt: Date;
}
