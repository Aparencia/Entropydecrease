/**
 * 虚拟自习室 API 客户端
 * Virtual study room API client
 *
 * @ai-context: 自习室 = 匿名占座 + 焦点状态点（绿色聚焦/琥珀休息/灰色离开）。
 * 复用 socialApi 的请求层（5s 超时 + 静默降级）：服务不可达返回 null，
 * UI 显示"离线模式"。占座信息只有匿名昵称/状态/分钟数，无任何内容。
 * @ai-context: Study room = anonymous seats + focus status dots only.
 * Reuses socialApi's request layer; unreachable service yields null.
 */
import { socialRequest } from './socialApi';
import type { StudyRoom } from '../types';

export type { StudyRoom };

/** 获取自习室状态（座位网格） */
export function getRoom(): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>('/api/v1/studyroom', { method: 'GET' });
}

/** 占用座位 */
export function occupySeat(seatId: string): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>(`/api/v1/studyroom/seats/${seatId}/occupy`, {
    method: 'POST',
  });
}

/** 离开座位 */
export function leaveSeat(seatId: string): Promise<StudyRoom | null> {
  return socialRequest<StudyRoom>(`/api/v1/studyroom/seats/${seatId}/leave`, {
    method: 'POST',
  });
}
