/**
 * RecentKeyframesStrip — 实时截图缩略流（P1-9，自 UnifiedTimeline 拆出）
 *
 * @ai-context: 最近 6 帧仍有 imageBase64 的关键帧横向缩略条（识别过程
 * 可见性）；imageBase64 已被增量分析清空的帧自动跳过。纯展示组件。
 */
import { Camera } from 'lucide-react';
import type { KeyFrame } from '@/lib/capture';

interface RecentKeyframesStripProps {
  keyframes: KeyFrame[];
}

export function RecentKeyframesStrip({ keyframes }: RecentKeyframesStripProps) {
  const recentThumbs = keyframes.filter((kf) => kf.imageBase64).slice(-6);
  if (recentThumbs.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border/20 bg-bg-secondary/30 overflow-x-auto flex-shrink-0">
      <Camera className="w-3 h-3 text-text-quaternary flex-shrink-0" strokeWidth={1.5} />
      {recentThumbs.map((kf) => (
        <img
          key={kf.id}
          src={`data:image/jpeg;base64,${kf.imageBase64}`}
          alt={`关键帧 ${new Date(kf.timestamp).toLocaleTimeString()}`}
          title={new Date(kf.timestamp).toLocaleTimeString()}
          className="w-16 h-9 rounded-kb-xs object-cover border border-border/30 flex-shrink-0"
        />
      ))}
    </div>
  );
}

export default RecentKeyframesStrip;
