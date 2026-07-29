/**
 * 全程录制模式状态面板
 * @ai-context Path C 录制模式的实时状态展示：录制时长、文件大小、暂停/恢复控制
 */

import { useState, useEffect, useCallback } from 'react';
import { Circle, Pause, Play, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordingStatus } from '@/lib/capture/captureTypes';

// ================================================================
// Props
// ================================================================

interface VideoRecordPanelProps {
  recordingStatus: RecordingStatus | null;
  isRecording: boolean;
}

// ================================================================
// 格式化工具
// ================================================================

/** 将毫秒时长格式化为 HH:MM:SS */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** 将字节数格式化为 MB（保留 1 位小数） */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ================================================================
// 主组件
// ================================================================

export function VideoRecordPanel({ recordingStatus, isRecording }: VideoRecordPanelProps) {
  // 本地计时器：在主进程状态推送间隔内平滑更新时长显示
  const [localElapsed, setLocalElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording || recordingStatus?.isPaused) return;

    // 以主进程推送的 duration 为基准，本地每秒 +1000ms 平滑补间
    const base = recordingStatus?.duration ?? 0;
    setLocalElapsed(base);

    const timer = setInterval(() => {
      setLocalElapsed((prev) => prev + 1000);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording, recordingStatus?.isPaused, recordingStatus?.duration]);

  // 主进程状态推送到达时同步基准值
  useEffect(() => {
    if (recordingStatus) {
      setLocalElapsed(recordingStatus.duration);
    }
  }, [recordingStatus?.duration]);

  const handlePauseResume = useCallback(async () => {
    if (!window.electronAPI) return;
    if (recordingStatus?.isPaused) {
      await window.electronAPI.invoke('video_record_resume');
    } else {
      await window.electronAPI.invoke('video_record_pause');
    }
  }, [recordingStatus?.isPaused]);

  // ----------------------------------------------------------------
  // 未录制状态
  // ----------------------------------------------------------------
  if (!isRecording && !recordingStatus?.isRecording) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-text-tertiary">
        <Video className="w-10 h-10 mb-3 opacity-30" strokeWidth={1} />
        <p className="text-b3 text-center leading-relaxed">
          选择录制模式后开始录制完整课堂视频
        </p>
        <p className="text-b3 mt-1.5 text-text-tertiary/60 text-center">
          录制完成后可通过 AI 生成结构化笔记
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // 录制中状态
  // ----------------------------------------------------------------
  const isPaused = recordingStatus?.isPaused ?? false;

  return (
    <div className="flex-1 flex flex-col">
      {/* 录制状态卡片 */}
      <div
        className={cn(
          'mx-3 my-2 p-4 rounded-kb-lg',
          'bg-bg-elevated/60 backdrop-blur-xl border shadow-kb-md',
          isPaused
            ? 'border-semantic-warning/20'
            : 'border-semantic-error/20',
        )}
      >
        {/* 顶部：录制指示 + 时长 */}
        <div className="flex items-center gap-2 mb-3">
          <Circle
            className={cn(
              'w-3 h-3 flex-shrink-0',
              isPaused
                ? 'fill-semantic-warning text-semantic-warning'
                : 'fill-semantic-error text-semantic-error animate-pulse',
            )}
            strokeWidth={0}
          />
          <span className={cn(
            'text-b2 font-medium',
            isPaused ? 'text-semantic-warning' : 'text-semantic-error',
          )}>
            {isPaused ? '已暂停' : '录制中'}
          </span>
          <span className="ml-auto text-b1 font-mono font-semibold text-text-primary tabular-nums">
            {formatDuration(localElapsed)}
          </span>
        </div>

        {/* 文件大小 */}
        <div className="flex items-center justify-between text-b3 text-text-tertiary mb-4">
          <span>文件大小</span>
          <span className="font-mono tabular-nums">
            {formatFileSize(recordingStatus?.fileSizeBytes ?? 0)}
          </span>
        </div>

        {/* 暂停/恢复按钮 */}
        <button
          onClick={handlePauseResume}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 py-2 rounded-kb-md text-b3 font-medium',
            'transition-all duration-kb-fast active:scale-[0.98]',
            isPaused
              ? 'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20'
              : 'bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20',
          )}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" strokeWidth={1.5} />
              恢复录制
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" strokeWidth={1.5} />
              暂停录制
            </>
          )}
        </button>
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-2">
        <p className="text-b3 text-text-tertiary text-center leading-relaxed">
          录制结束后点击停止，可选择生成 AI 笔记
        </p>
      </div>
    </div>
  );
}

export default VideoRecordPanel;
