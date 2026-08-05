/**
 * 虚拟自习室页面 — /social/studyroom
 * Virtual study room page
 *
 * @ai-context: 装配层：座位网格。sync 未启用/离线时透传原因给视图
 * （离线时本地座位记录仍可读，但无法占座/离开——静默保持）。
 * @ai-context: Assembly page; passes the offline reason to the seat view.
 */
import { Armchair } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import StudyRoomView from '../components/StudyRoomView';
import { useSocialSync } from '../lib/useSocialSync';

export default function StudyRoomPage() {
  const { syncEnabled, online } = useSocialSync();
  const reason = !syncEnabled ? 'syncDisabled' : !online ? 'offline' : null;

  return (
    <div className="mx-auto max-w-3xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="虚拟自习室"
        note="和同窗并肩而坐 —— 只共享在场，不共享内容"
        sealChar="室"
        sealColor="#C4A35A"
        actions={<Armchair className="w-5 h-5 text-accent-400" strokeWidth={1.5} />}
      />
      <StudyRoomView offlineReason={reason} />
    </div>
  );
}
