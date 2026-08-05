/**
 * 学习社交镜像 API — 主题脉冲（匿名）
 * Social mirror API — anonymous topic pulses
 *
 * @ai-context: 匿名社交核心——只上报主题的 hash（无明文主题），只读取
 * 匿名计数。隐私：任何人无法从服务端反推学习内容。复用 socialApi 的
 * 请求层（5s 超时 + 静默降级）。
 * @ai-context: Core of anonymous social — only topic hashes are sent and
 * only anonymous counts are read. Reuses socialApi's request layer.
 */
import { socialRequest, hashTopic } from './socialApi';
import type { PeerOverview, TopicPulse } from '../types';

export { hashTopic };

/** 上报主题脉冲（匿名：只上报 hash，绝不上报明文主题） */
export function sendPulse(topicHash: string): Promise<{ ok: boolean } | null> {
  return socialRequest<{ ok: boolean }>('/api/v1/social/pulse', {
    method: 'POST',
    body: JSON.stringify({ topicHash }),
  });
}

/** 查询某主题的匿名学习人数 */
export function getPulseCount(topicHash: string): Promise<number | null> {
  return socialRequest<{ count: number }>(`/api/v1/social/pulse/count?topicHash=${encodeURIComponent(topicHash)}`)
    .then((res) => res?.count ?? null);
}

/** 同频学习者概览（topicHash + count，无内容） */
export function getPeers(): Promise<PeerOverview[] | null> {
  return socialRequest<PeerOverview[]>('/api/v1/social/peers', { method: 'GET' });
}

/** 全部主题脉冲（供镜像面板展示） */
export function listPulses(): Promise<TopicPulse[] | null> {
  return socialRequest<TopicPulse[]>('/api/v1/social/pulses', { method: 'GET' });
}
