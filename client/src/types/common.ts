// ========== 跨领域通用类型 ==========

/** 三档自信度 */
export type Confidence = 'low' | 'medium' | 'high';

/** 高自信错误标记（confidence=high 但答错 → goldenError） */
export interface GoldenError {
  flashcardId: string;
  timestamp: number;
  confidence: 'high';
  correctAnswer: string;
  userAnswer: string;
}

/** 搜索索引支持的实体类型 */
export type SearchEntityType = 'note' | 'flashcard' | 'feynman' | 'inspiration' | 'classroom';

/** 笔记全文搜索索引条目 */
export interface SearchIndexEntry {
  id?: number;
  noteId: string;
  /** v1.2.0: 实体唯一标识（值等于 noteId，向后兼容） */
  entityId: string;
  /** v1.2.0: 实体类型 */
  entityType: SearchEntityType;
  tokens: string[];
  title: string;
  content: string;
  updatedAt: number;
}

/** 学习预测记录 */
export interface Prediction {
  id?: number;
  noteId: string;
  question: string;
  userAnswer?: string;
  aiAnswer: string;
  confidence: Confidence;
  createdAt: number;
  verifiedAt?: number;
  isCorrect?: boolean;
}

// 学习打卡记录
export interface StudyCheckIn {
  id: string;
  date: string;           // YYYY-MM-DD
  checkInTime: Date;
  modulesUsed: string[];  // 当日使用的模块名称列表
  streakDays: number;     // 连续打卡天数
}

// 成就解锁记录
export interface Achievement {
  id: string;
  key: string;            // 成就唯一标识
  title: string;
  description: string;
  icon: string;           // 图标名称或路径
  unlockedAt: Date;
}

// 应用设置
export interface AppSettings {
  id: string;
  key: string;                   // 设置键名
  value: string;                 // 设置值（JSON 字符串）
  updatedAt: Date;
}

// 隐私合规同意记录
export interface Consent {
  id: string;
  type: 'privacy' | 'terms';
  version: string;
  acceptedAt: Date;
}

// ========== v0.7.0 账户体系完善新增类型 ==========

// 用户资料（本地缓存，与 Supabase user metadata 同步）
export interface UserProfile {
  id: string;
  userId: string;         // Supabase user.id
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string;      // Supabase Storage 头像 URL
  updatedAt: string;      // ISO 8601
}
