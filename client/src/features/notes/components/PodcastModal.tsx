/**
 * @ai-context: P1 AI 播客弹层：笔记转双人播客（脚本 + TTS 分段播放）。
 * 自 NotesPage.tsx 原样拆出；播客状态（loading/error/data）、主题与关闭动作经 props 注入。
 * @ai-context: AI podcast modal (script + TTS playback) extracted verbatim from
 * NotesPage.tsx. Podcast state, topic and close action are injected via props.
 */
import { Modal } from '@/components/ui';
import type { PodcastData } from '@/lib/ai/types';
import PodcastPlayer from '@/features/assistant/components/PodcastPlayer';

interface PodcastModalProps {
  /** 是否打开 */
  open: boolean;
  /** 播客主题（标题） */
  topic: string;
  /** 播客生成中 */
  loading: boolean;
  /** 生成错误信息 */
  error: string | null;
  /** 已生成的播客数据 */
  data: PodcastData | null;
  /** 关闭回调 */
  onClose: () => void;
}

export default function PodcastModal({ open, topic, loading, error, data, onClose }: PodcastModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🎧 AI 播客"
      description={`围绕「${topic}」的双人知识播客`}
      size="lg"
    >
      {loading && !data && (
        <div className="py-8 text-center text-c1 text-text-tertiary animate-pulse">
          正在编排播客脚本…
        </div>
      )}
      {error && !loading && !data && (
        <p className="py-6 text-center text-c1 text-text-tertiary">{error}</p>
      )}
      {data && <PodcastPlayer podcast={data} onClose={onClose} />}
    </Modal>
  );
}
