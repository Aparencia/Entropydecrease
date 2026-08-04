/**
 * 升级引导提示 — AI 配额耗尽时温和提醒
 *
 * @ai-context: 非阻断式升级引导，在 AI 配额耗尽时显示。
 * 区分内测用户（"明天恢复"）与免费用户（"升级 Pro"）话术。
 * 遵循"损失厌恶"定价策略——先提示"今天已用完"而非"请付费"。
 */
import { useState } from 'react';
import { Sparkles, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBetaStore } from '@/features/beta/betaStore';

interface UpgradePromptProps {
  /** 已使用的 AI 调用次数 */
  usedCount?: number;
  /** 总配额 */
  totalCount?: number;
  /** 功能名称 */
  featureName?: string;
  /** 是否可关闭 */
  dismissible?: boolean;
}

export function UpgradePrompt({
  usedCount,
  totalCount,
  featureName,
  dismissible = true,
}: UpgradePromptProps) {
  const { effectiveTier, betaProfile } = useBetaStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isBeta = !!betaProfile;

  return (
    <div
      className={cn(
        'relative p-4 rounded-kb-xl border transition-all duration-kb-fast',
        isBeta
          ? 'bg-brand-50/50 dark:bg-brand-900/10 border-brand-200/30 dark:border-brand-800/20'
          : 'bg-bg-elevated border-border-default',
      )}
    >
      {/* 关闭按钮 */}
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      )}

      <div className="flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-kb-full flex items-center justify-center flex-shrink-0',
          isBeta
            ? 'bg-brand-100 dark:bg-brand-800/30'
            : 'bg-bg-tertiary',
        )}>
          <Sparkles className={cn(
            'w-4.5 h-4.5',
            isBeta ? 'text-brand-500' : 'text-text-tertiary',
          )} strokeWidth={1.5} />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* 话术 */}
          {isBeta ? (
            <>
              <p className="text-b3 font-medium text-text-primary">
                {featureName ? `「${featureName}」今日配额已用完` : '今日 AI 配额已用完'}
              </p>
              <p className="text-b2 text-text-tertiary">
                {usedCount != null && totalCount != null
                  ? `已使用 ${usedCount}/${totalCount} 次`
                  : '你的反馈让产品变得更好 🪼'}
                <br />
                明天恢复配额，届时可继续使用
              </p>
            </>
          ) : (
            <>
              <p className="text-b3 font-medium text-text-primary">
                今日免费额度已用完
              </p>
              <p className="text-b2 text-text-tertiary">
                {usedCount != null && totalCount != null
                  ? `已使用 ${usedCount}/${totalCount} 次`
                  : '每天免费 15 次 AI 调用'}
                <br />
                升级 Pro 获取更多配额，或自带 API Key 完全不受限
              </p>
            </>
          )}

          {/* 按钮 */}
          {!isBeta && (
            <div className="flex items-center gap-2 pt-1">
              {/* 升级 Pro 按钮 */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // 滚动到设置页的激活码区域
                  const el = document.getElementById('license-activation-section');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                icon={<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />}
              >
                升级 Pro
              </Button>
              {/* 了解详情 */}
              <a
                href="https://mianbaoduo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-b3 text-text-tertiary hover:text-text-secondary transition-colors"
              >
                了解详情
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}