/**
 * 费曼学习领域类型
 *
 * @ai-context: 费曼学习法四步流程的数据契约。currentStep 业务映射：
 * 1=讲解概念(explanation) → 2=标记薄弱点(FeynmanWeakPoint) →
 * 3=回炉深究 → 4=简化重述(FeynmanSummary)。步骤间存在依赖关系，
 * 不可跳步推进 currentStep。
 * @ai-context: 纯类型文件，无运行时代码，可安全重构。
 */

// 费曼学习笔记
export interface FeynmanNote {
  id: string;
  concept: string;               // 学习的概念
  explanation: string;           // 讲解内容（第一步）
  status: 'not_started' | 'in_progress' | 'completed';
  currentStep: 1 | 2 | 3 | 4;  // 当前步骤
  selfRating?: number;           // 理解深度自评 1-5
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// 费曼简化总结（第四步）
export interface FeynmanSummary {
  id: string;
  noteId: string;                // 关联 feynmanNotes.id
  summary: string;               // 简化重述内容
  createdAt: Date;
  updatedAt: Date;
}

// 费曼薄弱点（第二步）
export interface FeynmanWeakPoint {
  id: string;
  noteId: string;
  text: string;
  position: { start: number; end: number };
  mastered: boolean;
  createdAt: Date;
}
