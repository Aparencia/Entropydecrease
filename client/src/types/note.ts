/**
 * 笔记领域类型
 *
 * @ai-context: 纯类型文件。Note.content 存储 TipTap JSON 序列化字符串。
 */

/** 笔记 */
export interface Note {
  id: string;
  title: string;
  content: string;               // TipTap JSON 内容
  template: 'outline' | 'cornell' | 'mindmap' | 'free' | 'qa' | 'blank' | 'video' | 'todo';
  folderId?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  wordCount: number;
  pinned: boolean;               // 是否置顶
  videoNoteType?: string;        // 视频笔记类型标识（lecture/tutorial/etc）
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

/** 自由画布数据 */
export interface FreeCanvasData {
  blocks: FreeCanvasBlock[];
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
