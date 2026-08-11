/**
 * 番茄钟协作接力页面 — /social/relay
 * Pomodoro relay page
 *
 * @ai-context: 装配层：接力面板 + 说明。sync 未启用/离线时透传离线原因
 * 给 RelayPanel（保留本地缓存配对的可读性，不弹错误）。
 * @ai-context: Assembly page; passes the offline reason through so the
 * cached pair stays visible in degraded mode.
 */
import { Handshake } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import RelayPanel from '../components/RelayPanel';
import { useSocialSync } from '../lib/useSocialSync';

export default function RelayPage() {
  const { syncEnabled, online } = useSocialSync();
  const reason = !syncEnabled ? 'syncDisabled' : !online ? 'offline' : null;

  return (
    <div className="mx-auto max-w-3xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="番茄接力"
        note="和搭档接力深潜 —— 你完成，我接棒；只报状态，不晒内容"
        sealChar="接"
        sealColor="#7BC4B8"
        actions={<Handshake className="w-5 h-5 text-flashcard" strokeWidth={1.5} />}
      />
      <RelayPanel offlineReason={reason} />
    </div>
  );
}
