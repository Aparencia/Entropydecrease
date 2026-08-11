/**
 * 公共房间列表 + 创建房间表单
 * Public room list + create-room form
 *
 * @ai-context: 展示公共深潜房间（仅名称/人数，无内容），提供创建入口。
 * 创建/加入失败时 toast 提示并静默保持（离线降级，不弹错误页）。
 * @ai-context: Lists public dive rooms (name/count only) with a create
 * form; failures toast quietly per offline-first.
 */
import { useState } from 'react';
import { Plus, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, Button, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { RoomsState } from '../hooks/useDeepDiveRooms';

interface RoomListPanelProps {
  state: RoomsState;
  /** 当前所在房间 id（高亮） */
  activeRoomId: string | null;
  onEnterRoom: (roomId: string) => void;
}

export default function RoomListPanel({ state, activeRoomId, onEnterRoom }: RoomListPanelProps) {
  const { rooms, loading, create, join } = state;
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const room = await create(trimmed);
      if (room) {
        setName('');
        onEnterRoom(room.id);
      } else {
        toast({ type: 'warning', message: '创建失败：同步服务暂不可达，已保持本地模式' });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (roomId: string) => {
    if (roomId === activeRoomId) return;
    const room = await join(roomId);
    if (room) {
      onEnterRoom(room.id);
    } else {
      toast({ type: 'warning', message: '加入失败：同步服务暂不可达，已保持本地模式' });
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-kb-md">
        {/* 创建房间 */}
        <div className="flex gap-kb-sm">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新建深潜房间名称…"
            maxLength={30}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            aria-label="房间名称"
          />
          <Button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || creating}
            loading={creating}
            icon={creating ? undefined : <Plus className="w-4 h-4" />}
            className="flex-shrink-0"
          >
            创建
          </Button>
        </div>

        {/* 房间列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-6 text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            正在打捞公共房间…
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-c1 text-text-tertiary text-center py-6">
            还没有公共房间，创建一个开始协作深潜吧
          </p>
        ) : (
          <ul className="flex flex-col gap-kb-xs">
            {rooms.map((room) => {
              const isActive = room.id === activeRoomId;
              return (
                <li key={room.id}>
                  <button
                    onClick={() => void handleJoin(room.id)}
                    disabled={isActive}
                    className={cn(
                      'w-full flex items-center justify-between gap-kb-sm',
                      'px-kb-sm py-2 rounded-kb-md border transition-colors duration-kb-fast',
                      isActive
                        ? 'border-brand-500/40 bg-brand-500/5 cursor-default'
                        : 'border-border/40 hover:border-brand-500/30 hover:bg-bg-elevated/50',
                    )}
                  >
                    <span className="text-b2 text-text-primary truncate">
                      {room.name}
                      {isActive && <span className="ml-2 text-c1 text-brand-600 dark:text-brand-400">潜行中</span>}
                    </span>
                    <span className="flex items-center gap-1 text-c1 text-text-tertiary flex-shrink-0">
                      <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {room.memberCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
