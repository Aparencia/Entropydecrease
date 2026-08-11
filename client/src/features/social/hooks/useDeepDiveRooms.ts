/**
 * 协作深潜房间 Hook — 列表 / 创建 / 加入
 * Deep dive rooms hook — list / create / join
 *
 * @ai-context: 数据来自 sync-service（socialApi），失败时保持上次成功数据
 * （stale-while-revalidate 风格），无数据且失败 → 判定服务不可达（degraded），
 * 由页面展示离线横幅。轮询间隔 15s，随 online 状态暂停。
 * @ai-context: Stale-while-revalidate over socialApi; null data after a
 * failed fetch marks the service degraded (offline banner). 15s polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoom, joinRoom, listRooms } from '../lib/socialApi';
import type { DeepDiveRoom } from '../types';
import { useSocialSync } from '../lib/useSocialSync';

export interface RoomsState {
  rooms: DeepDiveRoom[];
  loading: boolean;
  /** 服务不可达（离线降级判定） */
  degraded: boolean;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<DeepDiveRoom | null>;
  join: (roomId: string, taskSummary?: string) => Promise<DeepDiveRoom | null>;
}

export function useDeepDiveRooms(): RoomsState {
  const { syncEnabled, online } = useSocialSync();
  const [rooms, setRooms] = useState<DeepDiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await listRooms();
    if (!mountedRef.current) return;
    if (result) {
      setRooms(result);
      setDegraded(false);
    } else {
      setDegraded(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (online) void refresh();
    }, 15000);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, online]);

  const create = useCallback(async (name: string): Promise<DeepDiveRoom | null> => {
    if (!syncEnabled) return null;
    const room = await createRoom(name);
    if (room) void refresh();
    return room;
  }, [syncEnabled, refresh]);

  const join = useCallback(async (roomId: string, taskSummary?: string): Promise<DeepDiveRoom | null> => {
    if (!syncEnabled) return null;
    const room = await joinRoom(roomId, taskSummary);
    if (room) void refresh();
    return room;
  }, [syncEnabled, refresh]);

  return { rooms, loading, degraded, refresh, create, join };
}
