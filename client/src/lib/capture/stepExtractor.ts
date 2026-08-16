/**
 * 步骤提取器（P2-7 步骤化笔记核心）
 *
 * @ai-context: 从 smart 会话数据（关键帧 + 语音段）提取技能学习步骤：
 * 步骤边界 = 界面切换关键帧（slide_change，技能类场景的"换一步"信号）；
 * 步骤说明 = 边界时间窗内匹配指令句的转写文本；步骤截图 = 窗口内代表性
 * 关键帧（优先边界帧）。纯函数，供 StepFlowView 渲染与课后持久化。
 * @ai-context EN: Extracts skill-learning steps from a smart session: step
 * boundaries are slide-change keyframes; instructions are command-cue
 * transcripts within each boundary window; the representative keyframe
 * serves as the step screenshot. Pure function for StepFlowView.
 */
import type { KeyFrame, AudioSegment } from './captureTypes';
import { hasCommandCue } from './contentClassifier';

/** 单个学习步骤 */
export interface LessonStep {
  id: string;
  /** 步骤开始时间戳（边界帧时刻） */
  timestamp: number;
  /** 步骤标题（窗口内第一条指令句；无指令句时为「步骤 N」） */
  title: string;
  /** 操作说明（窗口内全部指令句拼接） */
  instruction: string;
  /** 代表性关键帧截图（JPEG base64；窗口内无帧时为空） */
  imageBase64?: string;
  /** 参数变更（P2-6 区域监测填充；本提取器不产出） */
  paramChanges?: Array<{ name: string; from?: string; to: string }>;
}

/** 提取结果统计（UI 展示与验收口径） */
export interface StepExtractResult {
  steps: LessonStep[];
  /** 边界帧数（slide_change） */
  boundaryCount: number;
  /** 命中的指令句总数 */
  commandCueCount: number;
}

/**
 * 提取学习步骤。
 *
 * 边界策略：slide_change 帧为步骤边界（界面切换信号）；无边界帧但有
 * 关键帧时整体作为单一步骤（兜底，避免空产物）。指令句仅匹配语音段
 * 的 audioText（已清洗+热词替换后的文本）。
 */
export function extractSteps(
  keyframes: KeyFrame[],
  audioSegments: AudioSegment[],
): StepExtractResult {
  const sortedFrames = [...keyframes].sort((a, b) => a.timestamp - b.timestamp);
  const sortedSegments = [...audioSegments].sort((a, b) => a.timestampStart - b.timestampStart);

  const boundaries = sortedFrames.filter((kf) => kf.changeType === 'slide_change');
  const boundaryCount = boundaries.length;

  // 无边界帧：整体单步骤（有帧才产出）
  const stepFrames: KeyFrame[][] = [];
  if (boundaries.length === 0) {
    if (sortedFrames.length > 0) stepFrames.push(sortedFrames);
  } else {
    // 第一边界前的帧（若存在）作为步骤 1
    const firstBoundaryTs = boundaries[0].timestamp;
    const preFrames = sortedFrames.filter((kf) => kf.timestamp < firstBoundaryTs);
    if (preFrames.length > 0) stepFrames.push(preFrames);
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i].timestamp;
      const end = boundaries[i + 1]?.timestamp ?? Number.MAX_SAFE_INTEGER;
      stepFrames.push(sortedFrames.filter((kf) => kf.timestamp >= start && kf.timestamp < end));
    }
  }

  let commandCueCount = 0;
  const steps: LessonStep[] = stepFrames.map((frames, idx) => {
    const startTs = frames[0]?.timestamp ?? sortedSegments[0]?.timestampStart ?? Date.now();
    const endTs = frames[frames.length - 1]?.timestamp ?? startTs;
    // 时间窗内语音段（边界前后各 1s 容差，覆盖指令与画面切换的时序差）
    const windowSegments = sortedSegments.filter(
      (s) => s.timestampStart >= startTs - 1000 && s.timestampStart <= endTs + 1000,
    );
    const instructions = windowSegments
      .map((s) => s.audioText ?? '')
      .filter((t) => t && hasCommandCue(t));
    commandCueCount += instructions.length;
    const title = instructions[0] ?? `步骤 ${idx + 1}`;
    // 代表性截图：优先边界帧，其次窗口内最后一张有图的帧
    const withImage = frames.filter((kf) => kf.imageBase64);
    const imageBase64 = withImage[withImage.length - 1]?.imageBase64 || frames[0]?.imageBase64;
    return {
      id: `step-${idx + 1}-${startTs}`,
      timestamp: startTs,
      title: title.length > 40 ? `${title.slice(0, 39)}…` : title,
      instruction: instructions.join('；'),
      imageBase64,
    };
  });

  return { steps, boundaryCount, commandCueCount };
}

/** 步骤 → checklist 条目（P2-8 跟着做清单） */
export function stepsToChecklist(steps: LessonStep[]): Array<{ id: string; label: string }> {
  return steps.map((s) => ({ id: s.id, label: s.title }));
}

/** 步骤 → 闪卡问答对（P2-8 步骤闪卡；问答形态「这一步做了什么？」） */
export function stepsToFlashcards(steps: LessonStep[]): Array<{ front: string; back: string }> {
  return steps
    .filter((s) => s.instruction || s.title.startsWith('步骤'))
    .map((s) => ({
      front: s.title.startsWith('步骤') ? '这一步（截图/操作）是什么？' : `步骤「${s.title}」怎么操作？`,
      back: s.instruction || s.title,
    }));
}
