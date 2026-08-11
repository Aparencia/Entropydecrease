/**
 * 社交模块共享类型定义
 * Social features shared type definitions
 *
 * @ai-context: 隐私原则——任何类型都只承载"状态/计数/轻互动"，绝不承载
 * 其他用户的学习内容细节（无笔记正文/无卡片内容/无费曼讲解）。
 * @ai-context: Privacy rule — types carry status/counts/light interactions
 * only; never other learners' content details.
 */

// ─── 协作深潜房间 / Deep Dive Rooms ───────────────────────────────

/** 房间内成员在场状态（匿名昵称，无内容细节） */
export type PresenceStatus = 'focusing' | 'break' | 'away';

/** 房间成员在场信息 */
export interface RoomPresence {
  userId: string;
  nickname: string;
  status: PresenceStatus;
  /** 本次房间会话累计专注分钟数 */
  focusMinutes: number;
  /** 当前任务一句话摘要（用户主动填写，可选） */
  taskSummary?: string;
}

/** 协作深潜房间 */
export interface DeepDiveRoom {
  id: string;
  name: string;
  memberCount: number;
  members: RoomPresence[];
  createdAt?: string;
  /** 最近的 cheer 事件流（轮询增量检测，服务端最多保留最近 N 条） */
  recentCheers?: CheerEvent[];
}

/** 收到的 cheer 事件（轻互动，轮询检测） */
export interface CheerEvent {
  fromUserId: string;
  fromNickname: string;
  emoji: string;
  at: number;
}

// ─── 番茄钟协作接力 / Pomodoro Relay ──────────────────────────────

/** 接力配对状态 */
export type RelayPairStatus = 'pending' | 'active' | 'completed' | 'rejected';

/** 番茄接力配对 */
export interface RelayPair {
  id: string;
  partnerUserId: string;
  partnerNickname: string;
  status: RelayPairStatus;
  createdAt: string;
  /** 入向邀请方（收到邀请时展示） */
  inviter?: boolean;
}

/** 接力统计 */
export interface RelayStats {
  totalMinutes: number;
  relayCount: number;
  successRate: number; // 0-1
}

// ─── 学习社交镜像 / Social Mirror ─────────────────────────────────

/** 主题脉冲（匿名计数） */
export interface TopicPulse {
  topicHash: string;
  topicLabel: string;
  count: number;
  updatedAt: string;
}

/** 同频学习者概览 */
export interface PeerOverview {
  topicHash: string;
  topicLabel: string;
  count: number;
}

// ─── 虚拟自习室 / Virtual Study Room ──────────────────────────────

/** 座位状态 */
export type SeatStatus = 'occupied' | 'available';

/** 虚拟自习室座位 */
export interface StudySeat {
  seatId: string;
  status: SeatStatus;
  /** 占座者匿名信息（occupied 时） */
  occupant?: {
    nickname: string;
    focusStatus: PresenceStatus;
    focusMinutes: number;
  };
}

/** 虚拟自习室 */
export interface StudyRoom {
  roomId: string;
  roomName: string;
  seats: StudySeat[];
  capacity: number;
}
