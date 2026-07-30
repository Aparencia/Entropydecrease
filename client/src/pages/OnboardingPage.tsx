/**
 * @ai-context: 页面组件：OnboardingPage。
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Timer,
  FileText,
  Layers,
  Lightbulb,
  Rocket,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  Play,
  Coffee,
  RotateCcw,
  Sparkles,
  Brain,
  CheckCircle2,
  MessageSquare,
  Eye,
  HardDrive,
  Cloud,
  Shuffle,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/* ================================================================
 *  Types
 * ================================================================ */

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: string;
  bg: string;
  ringColor: string;
  flowItems: FlowItem[];
}

interface FlowItem {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
}

/* ================================================================
 *  Constants — 4 核心模块
 * ================================================================ */

const featureSteps: OnboardingStep[] = [
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
 *  Step 1: Mode Selection — 模式介绍
 * ================================================================ */

type ModeKey = 'local' | 'hybrid' | 'cloud';

interface ModeOption {
  key: ModeKey;
  label: string;
  tag: string;
  desc: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  features: string[];
  accent: string;
  bg: string;
  ring: string;
}

const modeOptions: ModeOption[] = [
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

function StepMode({
  onNext,
  onPrev,
}: {
  onNext: () => void;
  onPrev: () => void;
}) {
  const [selected, setSelected] = useState<ModeKey>('hybrid');

  return (
    <div className="flex flex-col items-center gap-kb-lg px-kb-lg w-full max-w-2xl">
      {/* 标题 */}
      <div className="flex flex-col gap-kb-xs text-center">
        <h2 className="text-h1 font-bold text-text-primary">选择数据模式</h2>
        <p className="text-b1 text-text-secondary">决定你的数据如何存储，可随时在设置中更改</p>
      </div>

      {/* 三个模式卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-kb-sm w-full">
        {modeOptions.map((mode) => {
          const Icon = mode.icon;
          const isActive = selected === mode.key;
          return (
            <button
              key={mode.key}
              onClick={() => setSelected(mode.key)}
              className={cn(
                'flex flex-col items-start gap-kb-xs p-kb-md rounded-kb-xl border-2 text-left transition-all duration-kb-fast',
                isActive
                  ? cn('border-brand-500', mode.bg)
                  : 'border-border hover:border-border-strong',
              )}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between w-full">
                <div className={cn('p-kb-sm rounded-kb-lg', mode.bg)}>
                  <Icon className={cn('w-icon-md h-icon-md', mode.accent)} strokeWidth={1.5} />
                </div>
                <span
                  className={cn(
                    'text-c2 px-2 py-0.5 rounded-kb-full',
                    mode.key === 'hybrid'
                      ? 'bg-brand-600 text-white'
                      : 'bg-bg-tertiary text-text-tertiary',
                  )}
                >
                  {mode.tag}
                </span>
              </div>

              {/* 名称 */}
              <h3 className={cn('text-b1 font-bold', isActive ? mode.accent : 'text-text-primary')}>
                {mode.label}
              </h3>

              {/* 描述 */}
              <p className="text-c1 text-text-secondary leading-relaxed">{mode.desc}</p>

              {/* 特性列表 */}
              <ul className="flex flex-col gap-1 mt-kb-xs">
                {mode.features.map((f) => (
                  <li key={f} className="flex items-center gap-1 text-c2 text-text-secondary">
                    <CheckCircle2 className={cn('w-3 h-3 shrink-0', mode.accent)} strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* 混合模式详细说明 */}
      {selected === 'hybrid' && (
        <div className="flex items-start gap-kb-sm p-kb-md rounded-kb-xl bg-brand-600/5 border border-brand-600/20 w-full text-left">
          <Shield className="w-icon-sm h-icon-sm text-brand-600 shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="flex flex-col gap-1">
            <span className="text-c1 font-medium text-brand-600">混合模式说明</span>
            <p className="text-c2 text-text-secondary leading-relaxed">
              默认以本地存储为主，学习数据（结礁、反衰减呼吸、进度等）全部保存在你的设备上。当你登录账户后，可选择将数据同步到云端，实现多设备访问和自动备份。AI 功能（如 AI 摘要、AI 反衰减呼吸生成）需要联网使用，但核心学习功能离线即可运行。
            </p>
          </div>
        </div>
      )}

      {/* 导航按钮 */}
      <div className="flex items-center gap-kb-sm w-full max-w-xs mt-kb-sm">
        <Button size="lg" variant="secondary" className="flex-1" onClick={onPrev}>
          <span className="flex items-center gap-1">
            <ArrowLeft className="w-icon-sm h-icon-sm" />
            上一步
          </span>
        </Button>
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onNext}
        >
          下一步
        </Button>
      </div>
    </div>
  );
}

/** Total steps: Welcome(0) + Mode(1) + 4 features(2-5) + Ready(6) */
const TOTAL_STEPS = 3 + featureSteps.length; // 7
const LAST_INDEX = TOTAL_STEPS - 1; // 6

/* ================================================================
 *  Step Dots — 进度指示器
 * ================================================================ */

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'rounded-kb-full transition-all duration-kb-normal ease-kb-default',
            i === current
              ? 'w-6 h-2 bg-brand-600'
              : i < current
                ? 'w-2 h-2 bg-brand-400'
                : 'w-2 h-2 bg-border-strong',
          )}
        />
      ))}
    </div>
  );
}

/* ================================================================
 *  Step 0: Welcome
 * ================================================================ */

function StepWelcome({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-kb-xl text-center px-kb-lg">
      {/* Logo */}
      <div className="flex items-center gap-kb-sm">
        <div className="p-3 rounded-kb-xl bg-brand-600/10">
          <BookOpen className="w-icon-xl h-icon-xl text-brand-600" strokeWidth={1.5} />
        </div>
      </div>

      {/* 品牌名 */}
      <h1 className="text-d1 font-bold text-brand-600 tracking-tight">熵减</h1>

      {/* 文案 */}
      <div className="flex flex-col gap-kb-xs max-w-sm">
        <h2 className="text-d2 font-bold text-text-primary">欢迎使用熵减</h2>
        <p className="text-b1 text-text-secondary">你的本地优先智能学习助手</p>
      </div>

      {/* 操作 */}
      <div className="flex flex-col items-center gap-kb-md w-full max-w-xs">
        <Button
          size="lg"
          variant="primary"
          className="w-full"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onNext}
        >
          开始了解
        </Button>

        <button
          onClick={onSkip}
          className="flex items-center gap-1 text-b2 text-text-tertiary hover:text-text-secondary transition-colors duration-kb-fast"
        >
          <SkipForward className="w-icon-xs h-icon-xs" strokeWidth={1.5} />
          跳过引导
        </button>
      </div>
    </div>
  );
}

/* ================================================================
 *  Step 2-5: Feature Demo
 * ================================================================ */

function StepFeature({
  step,
  index,
  total,
  onNext,
  onPrev,
}: {
  step: OnboardingStep;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
}) {
  const Icon = step.icon;
  // index is used for step numbering display
  const isLast = index === total - 1;

  return (
    <div className="flex flex-col items-center gap-kb-lg px-kb-lg w-full max-w-lg">
      {/* 步骤编号 */}
      <span className={cn('text-c1 font-medium tracking-wide', step.accent)}>
        {index + 1} / {total}
      </span>

      {/* 图标 */}
      <div
        className={cn(
          'p-kb-md rounded-kb-xl ring-2 transition-all duration-kb-normal',
          step.bg,
          step.ringColor,
        )}
      >
        <Icon className={cn('w-icon-xl h-icon-xl', step.accent)} strokeWidth={1.5} />
      </div>

      {/* 标题 */}
      <div className="flex flex-col gap-kb-xs text-center">
        <h2 className="text-h1 font-bold text-text-primary">{step.title}</h2>
        <p className={cn('text-b2 font-medium', step.accent)}>{step.subtitle}</p>
      </div>

      {/* 描述 */}
      <p className="text-b1 text-text-secondary text-center max-w-sm leading-relaxed">
        {step.description}
      </p>

      {/* 流程演示 */}
      <div className="flex items-center gap-1 sm:gap-2 w-full justify-center flex-wrap">
        {step.flowItems.map((item, i) => {
          const ItemIcon = item.icon;
          return (
            <div key={i} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex flex-col items-center gap-1 px-kb-sm py-kb-xs rounded-kb-lg',
                  step.bg,
                  'transition-all duration-kb-normal',
                )}
              >
                <ItemIcon className={cn('w-icon-sm h-icon-sm', step.accent)} strokeWidth={1.5} />
                <span className="text-c2 text-text-secondary whitespace-nowrap">{item.label}</span>
              </div>
              {i < step.flowItems.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" strokeWidth={1.5} />
              )}
            </div>
          );
        })}
      </div>

      {/* 导航按钮 */}
      <div className="flex items-center gap-kb-sm w-full max-w-xs mt-kb-sm">
        <Button size="lg" variant="secondary" className="flex-1" onClick={onPrev}>
          <span className="flex items-center gap-1">
            <ArrowLeft className="w-icon-sm h-icon-sm" />
            上一步
          </span>
        </Button>
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onNext}
        >
          {isLast ? '下一步' : '下一步'}
        </Button>
      </div>
    </div>
  );
}

/* ================================================================
 *  Step 6: Ready
 * ================================================================ */

function StepReady({ onStart, onPrev }: { onStart: () => void; onPrev: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-kb-xl text-center px-kb-lg">
      {/* 大图标 */}
      <div className="p-kb-md rounded-kb-xl bg-brand-600/10">
        <Rocket className="w-icon-xl h-icon-xl text-brand-600" strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-kb-xs max-w-sm">
        <h2 className="text-d2 font-bold text-text-primary">准备就绪！</h2>
        <p className="text-b1 text-text-secondary">默认混合模式，数据本地保存，可随时开启云同步</p>
      </div>

      <div className="flex items-center gap-kb-sm w-full max-w-xs">
        <Button size="lg" variant="secondary" className="flex-1" onClick={onPrev}>
          <span className="flex items-center gap-1">
            <ArrowLeft className="w-icon-sm h-icon-sm" />
            上一步
          </span>
        </Button>
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          iconRight={<ArrowRight className="w-icon-sm h-icon-sm" />}
          onClick={onStart}
        >
          开始使用
        </Button>
      </div>
    </div>
  );
}

/* ================================================================
 *  Main Page
 * ================================================================ */

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const finish = useCallback(() => {
    localStorage.setItem('kb-onboarding-done', 'true');
    navigate('/', { replace: true });
  }, [navigate]);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, LAST_INDEX)), []);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const renderStep = () => {
    if (step === 0) {
      return <StepWelcome onNext={next} onSkip={finish} />;
    }

    if (step === 1) {
      return <StepMode onNext={next} onPrev={prev} />;
    }

    if (step >= 2 && step <= featureSteps.length + 1) {
      const featureIndex = step - 2;
      return (
        <StepFeature
          step={featureSteps[featureIndex]}
          index={featureIndex}
          total={featureSteps.length}
          onNext={next}
          onPrev={prev}
        />
      );
    }

    // Final step
    return <StepReady onStart={finish} onPrev={prev} />;
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-between py-kb-2xl overflow-hidden">
      {/* 动画容器 */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div
          key={step}
          className="w-full flex justify-center"
          style={{
            animation: 'kb-slide-in 250ms ease-in-out both',
          }}
        >
          {renderStep()}
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="pb-kb-md">
        <StepDots current={step} total={TOTAL_STEPS} />
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes kb-slide-in {
          from {
            opacity: 0;
            transform: translateX(32px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
