/**
 * 新手引导 Step 1：数据模式选择
 *
 * @ai-context: OnboardingPage 审计拆分。selected 为组件内本地状态（默认
 * hybrid），仅通过 onNext/onPrev 与父级状态机通信；模式卡片数据见
 * onboardingData.ts 的 modeOptions。
 * @ai-context: Extracted from OnboardingPage. Local `selected` state defaults
 * to hybrid; communicates with the parent flow only via onNext/onPrev.
 */
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { modeOptions, type ModeKey } from '../onboardingData';

export function StepMode({
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
