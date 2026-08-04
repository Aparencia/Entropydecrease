/**
 * ClassroomStatusBanners — 课堂 smart 路径运行态状态横幅组
 *
 * @ai-context: 从 ClassroomPage 纯搬移（P0-5 装配腾出行数预算）：
 * 增量分析进度 / 转写进度 / 音频健康警告 / VAD 校准提示四块横幅，
 * 渲染条件与文案逐字保留，零逻辑变更。
 * @ai-context: Banners extracted verbatim from ClassroomPage to keep the
 * assembly page under the 300-line budget; conditions and copy unchanged.
 */
import { Mic, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import type { SessionStatus } from '@/lib/capture';
import type { AudioHealth } from '../hooks/useClassroomAudio';
import type { VADStats } from '@/lib/capture/vadMarker';

interface ClassroomStatusBannersProps {
  status: SessionStatus;
  partialCount: number;
  transcribedCount: number;
  audioHealth: AudioHealth;
  vadStats: VADStats | null;
}

export function ClassroomStatusBanners({
  status, partialCount, transcribedCount, audioHealth, vadStats,
}: ClassroomStatusBannersProps) {
  return (
    <>
      {partialCount > 0 && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-brand-50/50 border border-brand-100/50">
          <CheckCircle2 className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 text-brand-600">已增量分析 {partialCount} 段，课后将快速合并生成笔记</span>
        </div>
      )}
      {transcribedCount > 0 && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-emerald-50/50 border border-emerald-100/50">
          <Mic className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
          <span className="text-b3 text-emerald-600">已转写 {transcribedCount} 段语音</span>
        </div>
      )}
      {/* 音频健康警告：区分"从未启动"与"中途中断" */}
      {status === 'capturing' && !audioHealth.isHealthy && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-semantic-error/5 border border-semantic-error/15">
          <AlertTriangle className="w-4 h-4 text-semantic-error flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b3 text-semantic-error">
            {audioHealth.chunkCount === 0
              ? '未检测到音频输入，音频采集可能未启动，请停止后重新开始'
              : '音频输入中断，请检查系统音频设置'}
          </span>
        </div>
      )}
      {/* VAD 状态（校准中提示） */}
      {status === 'capturing' && vadStats && !vadStats.calibrated && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-kb-md bg-amber-50/50 border border-amber-100/50">
          <Loader2 className="w-4 h-4 text-amber-500 animate-spin" strokeWidth={1.5} />
          <span className="text-b3 text-amber-600">正在校准音频阈值 ({vadStats.processedChunks}/10 块)...</span>
        </div>
      )}
    </>
  );
}

export default ClassroomStatusBanners;
