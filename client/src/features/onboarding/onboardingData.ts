/**
 * 新手引导数据与类型定义 · 纯数据
 *
 * @ai-context: OnboardingPage 审计拆分——featureSteps（4 核心模块演示数据：
 * 深潜/结礁/反衰减呼吸/浮出水面）与 modeOptions（数据模式三选一：本地/混合/
 * 云端）及配套类型集中于此。仅类型与常量，无 React 组件。
 * @ai-context: Data & types extracted from OnboardingPage. featureSteps drive
 * the four module demo steps (pomodoro/notes/flashcards/feynman), modeOptions
 * the three data-mode cards (local/hybrid/cloud). Types & constants only.
 */
import type { ComponentType, SVGProps } from 'react';
import {
  Timer,
  Play,
  Coffee,
  RotateCcw,
  FileText,
  Sparkles,
  Layers,
  CheckCircle2,
  Brain,
  Lightbulb,
  MessageSquare,
  Eye,
  HardDrive,
  Shuffle,
  Cloud,
} from 'lucide-react';

export interface FlowItem {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accent: string;
  bg: string;
  ringColor: string;
  flowItems: FlowItem[];
}

export type ModeKey = 'local' | 'hybrid' | 'cloud';

export interface ModeOption {
  key: ModeKey;
  label: string;
  tag: string;
  desc: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  features: string[];
  accent: string;
  bg: string;
  ring: string;
}

/* ================================================================
 *  Constants — 4 核心模块
 * ================================================================ */

export const featureSteps: OnboardingStep[] = [
  {
    id: 'pomodoro',
    title: '深潜',
    subtitle: '专注计时',
    description: '科学管理时间，高效专注每一刻。设定时间 → 开始专注 → 短暂休息 → 循环往复。',
    icon: Timer,
    accent: 'text-pomodoro',
    bg: 'bg-pomodoro/10',
    ringColor: 'ring-pomodoro/20',
    flowItems: [
      { icon: Timer, label: '设定时间' },
      { icon: Play, label: '开始专注' },
      { icon: Coffee, label: '休息放松' },
      { icon: RotateCcw, label: '循环往复' },
    ],
  },
  {
    id: 'notes',
    title: '结礁',
    subtitle: '结构化记录',
    description: '使用富文本编辑器创建结礁，借助 AI 一键生成摘要和反衰减呼吸，知识不再遗漏。',
    icon: FileText,
    accent: 'text-note',
    bg: 'bg-note/10',
    ringColor: 'ring-note/20',
    flowItems: [
      { icon: FileText, label: '创建结礁' },
      { icon: Sparkles, label: 'AI 摘要' },
      { icon: Layers, label: '生成反衰减呼吸' },
      { icon: CheckCircle2, label: '知识沉淀' },
    ],
  },
  {
    id: 'flashcards',
    title: '反衰减呼吸',
    subtitle: '间隔重复',
    description: '基于 SM-2 算法的间隔复习系统，创建牌组和卡片，科学规划复习节奏。',
    icon: Layers,
    accent: 'text-flashcard',
    bg: 'bg-flashcard/10',
    ringColor: 'ring-flashcard/20',
    flowItems: [
      { icon: Layers, label: '创建牌组' },
      { icon: FileText, label: '添加卡片' },
      { icon: Brain, label: 'SM-2 复习' },
      { icon: CheckCircle2, label: '巩固记忆' },
    ],
  },
  {
    id: 'feynman',
    title: '浮出水面',
    subtitle: '以教代学',
    description: '输入一个概念，用通俗语言解释它，AI 帮你评估理解深度，发现知识盲区。',
    icon: Lightbulb,
    accent: 'text-feynman',
    bg: 'bg-feynman/10',
    ringColor: 'ring-feynman/20',
    flowItems: [
      { icon: Lightbulb, label: '输入概念' },
      { icon: MessageSquare, label: '通俗解释' },
      { icon: Eye, label: 'AI 评估' },
      { icon: Brain, label: '深度理解' },
    ],
  },
];

/* ================================================================
 *  Mode Options — 数据模式（本地/混合/云端）
 * ================================================================ */

export const modeOptions: ModeOption[] = [
  {
    key: 'local',
    label: '本地模式',
    tag: '隐私优先',
    desc: '所有数据完全保存在本设备，无需联网，适合隐私敏感或离线场景。',
    icon: HardDrive,
    features: ['数据不出设备', '离线完全可用', '单设备使用'],
    accent: 'text-note',
    bg: 'bg-note/10',
    ring: 'ring-note/20',
  },
  {
    key: 'hybrid',
    label: '混合模式',
    tag: '推荐',
    desc: '核心数据保存在本地，可选同步到云端。AI 功能联网可用，兼顾隐私与便利。',
    icon: Shuffle,
    features: ['本地存储 + 可选云同步', 'AI 功能可用', '多设备切换'],
    accent: 'text-brand-600',
    bg: 'bg-brand-600/10',
    ring: 'ring-brand-600/20',
  },
  {
    key: 'cloud',
    label: '云端模式',
    tag: '全功能',
    desc: '数据实时同步到云端服务器，支持多设备无缝切换，自动备份。',
    icon: Cloud,
    features: ['多设备实时同步', '自动云端备份', '需联网'],
    accent: 'text-feynman',
    bg: 'bg-feynman/10',
    ring: 'ring-feynman/20',
  },
];
