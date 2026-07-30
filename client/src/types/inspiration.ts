/**
 * 灵感领域类型
 *
 * @ai-context: SortSuggestion.suggestedAction 为可选字段（与历史权威版
 * models.ts 保持一致），AI 返回结果可能不含该字段，消费方必须判空。
 */

/** 灵感分类建议（v0.9.0 AI 整理功能） */
export interface SortSuggestion {
  category: string;
  confidence: number;
  reason: string;
  /** AI 推荐的后续操作描述 */
  suggestedAction?: string;
}

/** 灵感（从 localStorage 迁移至 IndexedDB） */
export interface Inspiration {
  id: string;
  content: string;
  tags: {
    content_nature: 'concept' | 'question' | 'inspiration' | 'todo';
    cognitive_depth: 'shallow' | 'understanding' | 'application';
    subject: string;
  };
  tagsManuallyEdited: boolean;
  createdAt: string;
  updatedAt: string;
  /** v0.9.0: AI 整理状态 */
  sortStatus?: 'pending' | 'sorting' | 'sorted' | 'confirmed' | 'transformed';
  /** v0.9.0: AI 分类建议列表 */
  sortResult?: SortSuggestion[];
}
