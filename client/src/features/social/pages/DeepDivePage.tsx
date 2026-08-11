/**
 * 协作深潜页面 — /social/dive
 * Deep dive (co-work room) page
 *
 * @ai-context: 装配层：房间列表 ⇄ 房间视图切换。sync 未启用或网络离线时
 * 显示 OfflineBanner（优雅降级），绝不报错。离开房间调用 API 并回到列表。
 * @ai-context: Assembly page: room list ⇄ room view. Shows OfflineBanner
 * when sync is disabled or offline; never errors.
 */
import { useCallback, useState } from 'react';
import { Waves } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import OfflineBanner from '../components/OfflineBanner';
import RoomListPanel from '../components/RoomListPanel';
import DeepDiveRoomView from '../components/DeepDiveRoomView';
import CheerBurst from '../components/CheerBurst';
import { useDeepDiveRooms } from '../hooks/useDeepDiveRooms';
import { useRoomState } from '../hooks/useRoomState';
import { useSocialSync } from '../lib/useSocialSync';
import { leaveRoom } from '../lib/socialApi';

export default function DeepDivePage() {
  const { syncEnabled, online } = useSocialSync();
  const roomsState = useDeepDiveRooms();
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const roomState = useRoomState(activeRoomId);

  const handleEnterRoom = useCallback((roomId: string) => setActiveRoomId(roomId), []);

  const handleLeave = useCallback(() => {
    if (activeRoomId) {
      // 静默离开：失败也切回列表（服务端会在超时后自动清理在场）
      void leaveRoom(activeRoomId);
    }
    setActiveRoomId(null);
  }, [activeRoomId]);

  const reason = !syncEnabled ? 'syncDisabled' : !online ? 'offline' : roomsState.degraded && !activeRoomId ? 'degraded' : null;

  return (
    <div className="mx-auto max-w-3xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="协作深潜"
        note="和同伴一起潜入专注的深海 —— 只共享在场，不共享内容"
        sealChar="潜"
        sealColor="#5B8A72"
        actions={<Waves className="w-5 h-5 text-pomodoro" strokeWidth={1.5} />}
      />

      {reason && <OfflineBanner reason={reason} />}

      {activeRoomId ? (
        <DeepDiveRoomView roomId={activeRoomId} state={roomState} onLeave={handleLeave} />
      ) : (
        <RoomListPanel state={roomsState} activeRoomId={null} onEnterRoom={handleEnterRoom} />
      )}

      {/* 收到同伴 cheer → emoji 爆发动画 */}
      {roomState.cheer && (
        <CheerBurst cheer={roomState.cheer} onDone={roomState.dismissCheer} />
      )}
    </div>
  );
}
