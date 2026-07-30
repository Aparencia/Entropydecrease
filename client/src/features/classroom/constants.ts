/**
 * 回声定位（课堂助手）UI 常量字典
 * Echo-location (classroom assistant) UI constant dictionaries.
 *
 * @ai-context: 采集路径/模式/状态/语言/学科的静态选项配置，纯数据无副作用。
 * 左栏选择器（PathModeSelector）与右侧空态说明卡（IdleGuidePanel）共用，
 * 保证文案单一来源，修改文案只需改这里。
 * @ai-context: Static option configs shared by the left-rail selectors and the
 * right-side idle guide cards; single source of truth for all option copy.
 */
import {
  Eye, Mic, Layers, Clock, Pause, XCircle, Loader2,
  Crosshair, Sparkles, Video,
} from 'lucide-react';
import type {
  CaptureMode, CapturePath, CaptureSidebarConfig, SessionStatus,
} from '@/lib/capture';

/** 采集选项元数据：label 用于按钮，brief/detail/scene 用于右侧说明卡 */
export interface CaptureOptionMeta<V extends string> {
  value: V;
  label: string;
  icon: typeof Eye;
  /** 一句话简述（按钮副标题 / 说明卡徽标） */
  brief: string;
  /** 详细说明（右侧空态说明卡正文） */
  detail: string;
  /** 适合场景（右侧空态说明卡补充行） */
  scene: string;
}

export const PATH_OPTIONS: CaptureOptionMeta<CapturePath>[] = [
  // 智能路径置于首位并作为默认选项（资源占用低，适用面最广）
  {
    value: 'smart',
    label: '智能',
    icon: Sparkles,
    brief: 'AI 关键帧',
    detail: 'AI 自动检测画面变化，仅在幻灯片切换、板书出现等关键时刻截图，同时录制语音并智能分段，资源占用低。',
    scene: '长时间网课、幻灯片授课，低资源占用后台采集。',
  },
  {
    value: 'fine',
    label: '精细',
    icon: Crosshair,
    brief: '逐帧截图',
    detail: '按固定间隔截取屏幕画面，逐帧进行 OCR/AI 识别，完整记录每一帧内容。',
    scene: '板书密集、公式推导多、需要逐帧完整记录的课程。',
  },
  {
    value: 'full_record',
    label: '录制',
    icon: Video,
    brief: '全程录像',
    detail: '录制完整课堂视频（含音频），课后可通过 AI 一键生成结构化笔记。',
    scene: '需要完整回放、课后深度复盘的重要课程。',
  },
];

export const MODE_OPTIONS: CaptureOptionMeta<CaptureMode>[] = [
  {
    value: 'vision',
    label: '视觉',
    icon: Eye,
    brief: '仅画面',
    detail: '仅截取屏幕画面进行文字识别，不采集任何声音。',
    scene: '无声视频、纯板书或 PPT 画面内容。',
  },
  {
    value: 'audio',
    label: '音频',
    icon: Mic,
    brief: '仅声音',
    detail: '仅录制声音进行语音转文字，不截取屏幕画面。',
    scene: '播客、纯讲解且画面几乎不变的音频课。',
  },
  {
    value: 'mixed',
    label: '混合',
    icon: Layers,
    brief: '画面+声音',
    detail: '同时采集画面与声音，视觉与语音结果融合分析，信息覆盖最完整。',
    scene: '大多数网课，画面与讲解并重（推荐）。',
  },
];

export const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; icon: typeof Clock }> = {
  idle: { label: '空闲', color: 'text-text-tertiary', icon: Clock },
  capturing: { label: '采集中', color: 'text-semantic-error', icon: Loader2 },
  processing: { label: '处理中', color: 'text-brand-600', icon: Loader2 },
  paused: { label: '已暂停', color: 'text-semantic-warning', icon: Pause },
  error: { label: '错误', color: 'text-semantic-error', icon: XCircle },
};

export const LANGUAGE_OPTIONS: { value: CaptureSidebarConfig['language']; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'mixed', label: '多语' },
];

export const SUBJECT_OPTIONS = [
  { value: 'math', label: '数学' },
  { value: 'physics', label: '物理' },
  { value: 'cs', label: '计算机' },
  { value: 'english', label: '英语' },
  { value: 'other', label: '其他' },
];
