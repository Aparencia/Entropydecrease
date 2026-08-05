/**
 * 协作知识维基类型定义
 * Collaborative wiki type definitions
 *
 * @ai-context: 维基页面的多用户合并由现有 CRDT 基座（lib/sync/crdtEngine +
 * Automerge）承载——本 UI 层只管理"编辑/版本/贡献者标注"，不实现合并算法。
 * 隐私：contributors 只含 userId + 颜色，不渲染他人编辑的具体内容差异。
 * @ai-context: Multi-user merge uses the existing CRDT infra; this UI layer
 * only manages editing/version/attribution. Contributors carry id+color only.
 */

/** 贡献者标注（匿名 userId + 分配色） */
export interface WikiContributor {
  userId: string;
  /** 展示名（用户自己的昵称，仅本地可见） */
  nickname?: string;
  /** 贡献者专属标注色（按 userId 稳定分配） */
  color: string;
}

/** 维基页面 */
export interface WikiPage {
  id: string;
  title: string;
  /** Markdown 文本内容（本地编辑，随版本递增） */
  content: string;
  /** 参与过编辑的贡献者（按时间追加） */
  contributors: WikiContributor[];
  /** 编辑版本号（每次保存 +1，配合 CRDT 基座做冲突合并） */
  version: number;
  /** 社区投票数（本地模拟，接入服务端后可替换） */
  votes: number;
  /** 是否已被当前用户投票（本地去重） */
  votedByMe: boolean;
  /** AI 质量评估占位（接入 ai-gateway 后替换为真实分数） */
  aiQuality: 'pending' | 'good' | 'needs-review';
  createdAt: number;
  updatedAt: number;
}
