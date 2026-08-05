/**
 * 房间状态轮询 Hook — 成员在场 + cheer 事件
 * Room state polling hook — presence + cheer events
 *
 * @ai-context: 5s 轮询房间状态（轻量 GET）。通过对比服务端返回的 cheer
 * 时间戳检测新 cheer，触发 CheerBurst 动画。失败时保留上次数据并标记
 * degraded（离线降级）。离开组件/房间时停止轮询。
 * @ai-context: 5s polling for room state; new cheer detected by timestamp
 * diff triggers CheerBurst. Keeps stale data and marks degraded on failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoomState, sendCheer } from '../lib/socialApi';
import type { CheerEvent, DeepDiveRoom } from '../types';

export interface RoomStateResult {
  room: DeepDiveRoom | null;
  /** 收到的最近 cheer（触发动画后由 dismissCheer 清除） */
  cheer: CheerEvent | null;
  degraded: boolean;
  refresh: () => Promise<void>;
  dismissCheer: () => void;
  cheerFor: (emoji: string) => Promise<void>;
}

/** 预设 cheer 表情（轻互动，无自定义内容） */
export const CHEER_EMOJIS = ['👏', '💪', '🔥', '🌟', '🐬'] as const;

export function useRoomState(roomId: string | null): RoomStateResult {
  const [room, setRoom] = useState<DeepDiveRoom | null>(null);
  const [cheer, setCheer] = useState<CheerEvent | null>(null);
  const [degraded, setDegraded] = useState(false);
  /** 已消费的 cheer 时间戳（避免重复触发动画） */
  const lastCheerAtRef = useRef(0);
  /** 自己刚发出的 cheer 时间戳（过滤回显，避免自嗨动画） */
  const selfCheerAtRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const result = await getRoomState(roomId);
    if (!mountedRef.current) return;
    if (!result) {
      setDegraded(true);
      return;
    }
    setRoom(result);
    setDegraded(false);
    // 增量检测新 cheer：取时间戳大于已消费值的最近一条（排除自己发出的）
    const fresh = (result.recentCheers ?? [])
      .filter((e) => e.at > lastCheerAtRef.current && e.at !== selfCheerAtRef.current)
      .sort((a, b) => b.at - a.at);
    if (fresh.length > 0) {
      lastCheerAtRef.current = fresh[0].at;
      setCheer(fresh[0]);
    }
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    lastCheerAtRef.current = 0;
    setRoom(null);
    setCheer(null);
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const dismissCheer = useCallback(() => setCheer(null), []);

  const cheerFor = useCallback(async (emoji: string): Promise<void> => {
    if (!roomId) return;
    const event = await sendCheer(roomId, emoji);
    if (!event) return;
    selfCheerAtRef.current = event.at;
  }, [roomId]);

  return { room, cheer, degraded, refresh, dismissCheer, cheerFor };
}
