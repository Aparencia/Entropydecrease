/**
 * 微学习卡片 API 客户端
 * Micro learning card API client
 *
 * @ai-context: 调用 ai-gateway 的 /api/v1/ai/micro-card（新链，并行开发中）。
 * 遵循 aiClient 模式（token 注入 + 401 刷新重试）；网关不可达时抛错，
 * 由 hook 层降级为本地示例卡（离线模式，不打断微学习流）。
 * @ai-context: Calls the ai-gateway micro-card chain via aiClient; when the
 * gateway is unreachable the hook falls back to local sample cards.
 */
import { aiClient } from '@/lib/http/apiClient';

/** 微卡难度：1 浅 / 2 中 / 3 深 */
export type MicroCardDifficulty = 1 | 2 | 3;

/** 微卡状态：待处理 / 已会 / 不会 / 深入 */
export type MicroCardStatus = 'pending' | 'known' | 'unknown' | 'deep';

/** 微学习卡片（用户自己的生成内容） */
export interface MicroCard {
  id: string;
  front: string;
  back: string;
  tag?: string;
  difficulty: MicroCardDifficulty;
  status: MicroCardStatus;
  createdAt: number;
}

/** AI 微卡响应载荷（服务端契约） */
export interface MicroCardPayload {
  front: string;
  back: string;
  tag?: string;
  difficulty?: number;
}

/** 生成微卡（aiClient 模式；服务端契约：{ cards: [...] }） */
export async function fetchAIMicroCards(topic: string, count = 8): Promise<MicroCardPayload[]> {
  const res = await aiClient.post<{ cards: MicroCardPayload[] }>('/api/v1/ai/micro-card', {
    topic,
    count,
  });
  return res?.cards ?? [];
}

/** 本地示例卡（网关不可达时兜底，通用学习方法内容） */
export const FALLBACK_MICRO_CARDS: MicroCardPayload[] = [
  { front: '主动回忆比重读更有效', back: '合上书本，尝试凭记忆复述要点再核对。', tag: '记忆', difficulty: 1 },
  { front: '间隔重复的科学依据', back: '遗忘曲线——在将忘未忘时复习效果最佳。', tag: '记忆', difficulty: 2 },
  { front: '费曼技巧四步', back: '概念 → 教授他人 → 发现缺口 → 简化重讲。', tag: '费曼', difficulty: 2 },
  { front: '番茄工作法核心', back: '25 分钟专注 + 5 分钟休息为一轮。', tag: '专注', difficulty: 1 },
  { front: '睡眠巩固记忆', back: '海马体在睡眠中重放白天学习的内容。', tag: '认知', difficulty: 2 },
  { front: '交错练习更持久', back: '混合练习不同题型，优于集中练习。', tag: '练习', difficulty: 2 },
  { front: '生成效应', back: '自己生成答案比阅读答案记忆更深。', tag: '认知', difficulty: 3 },
  { front: '元认知监控', back: '学习时定期自问"我真的懂了吗"。', tag: '元认知', difficulty: 1 },
];
