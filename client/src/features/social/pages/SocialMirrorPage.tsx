/**
 * 学习社交镜像页面 — /social/mirror
 * Social mirror page
 *
 * @ai-context: 装配层：匿名同频面板。sync 未启用/离线时透传原因给面板，
 * 面板用本地缓存展示上次计数（stale 优于空白），绝不报错。
 * @ai-context: Assembly page; passes the offline reason through so the
 * panel can show cached counts in degraded mode.
 */
import { Radar } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import OfflineBanner from '../components/OfflineBanner';
import SocialMirrorPanel from '../components/SocialMirrorPanel';
import { useSocialSync } from '../lib/useSocialSync';

export default function SocialMirrorPage() {
  const { syncEnabled, online } = useSocialSync();
  const reason = !syncEnabled ? 'syncDisabled' : !online ? 'offline' : null;

  return (
    <div className="mx-auto max-w-3xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="学习社交镜像"
        note="此刻有 N 人正在学习同类内容 —— 只报计数，不露内容"
        sealChar="镜"
        sealColor="#8B9DC3"
        actions={<Radar className="w-5 h-5 text-cyber" strokeWidth={1.5} />}
      />

      {reason && <OfflineBanner reason={reason} />}

      <SocialMirrorPanel offlineReason={reason} />
    </div>
  );
}
