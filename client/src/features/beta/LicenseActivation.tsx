/**
 * 激活码输入 — 升级 Pro 订阅
 *
 * @ai-context: 用户输入激活码（ENTROPY-{TYPE}-{XXXX}-{XXXX}）升级付费 tier。
 * 本地优先：首次验证需联网，成功后本地缓存 7 天宽限期。
 * 激活码格式：ENTROPY-PRO-XXXX-XXXX（订阅）/ ENTROPY-LIFE-XXXX-XXXX（终身）
 * @ai-context: machine_id 取主进程设备指纹（electronAPI.getMachineId），
 * 服务端据此做一码多设备绑定（防分享）；到期前 3 天展示续费提醒。
 */
import { useState } from 'react';
import { Key, Check, AlertTriangle, Sparkles, ExternalLink } from 'lucide-react';
import { Button, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBetaStore } from '@/features/beta/betaStore';
import { type License, type LicenseType, type UserTier } from '@/types/beta';
import { useAuth } from '@/lib/auth/AuthContext';

/** 激活码格式校验正则 */
const LICENSE_PATTERN = /^ENTROPY-(PRO|LIFE|SND1|THM1)-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** 激活码类型 → tier 映射 */
const LICENSE_TYPE_TO_TIER: Record<string, UserTier> = {
  PRO: 'pro',
  LIFE: 'lifetime',
  SND1: 'free',    // 音效包不升级 tier
  THM1: 'free',    // 主题包不升级 tier
};

/** 剩余天数（不足 1 天按 0 处理） */
function daysRemaining(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

/** 获取设备指纹（Electron 主进程；Web 环境降级为固定占位符） */
async function getDeviceMachineId(): Promise<string> {
  try {
    const mid = await window.electronAPI?.getMachineId?.();
    if (mid) return mid;
  } catch {
    // 主进程不可用（Web 预览等）时降级，服务端按单设备兼容处理
  }
  return 'web';
}

export function LicenseActivation() {
  const { toast } = useToast();
  const { getAccessToken } = useAuth();
  const { addLicense, activeLicenses } = useBetaStore();
  const [code, setCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  /** 是否已激活 Pro 或 Lifetime */
  const hasProOrLifetime = activeLicenses.some(
    (l) => (l.tier === 'pro' || l.tier === 'lifetime') && l.status === 'active',
  );

  async function handleActivate() {
    const trimmed = code.trim().toUpperCase();
    setError('');

    // 1. 格式校验
    if (!trimmed) {
      setError('请输入激活码');
      return;
    }
    if (!LICENSE_PATTERN.test(trimmed)) {
      setError('激活码格式无效，应为 ENTROPY-{TYPE}-XXXX-XXXX');
      return;
    }

    // 2. 重复检查
    if (activeLicenses.some((l) => l.code === trimmed)) {
      setError('该激活码已被使用');
      return;
    }

    setActivating(true);
    try {
      // 提取类型（trimmed 已 toUpperCase，type 为大写字符串如 'PRO'/'LIFE'）
      const type = trimmed.split('-')[1];

      // 设备指纹（一码多设备绑定；Web 环境降级 'web'）
      const machineId = await getDeviceMachineId();

      // 调服务端验证激活码
      const token = await getAccessToken();
      const resp = await fetch('/api/v1/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: trimmed,
          machine_id: machineId,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ detail: '验证失败' }));
        throw new Error(errBody.detail || '激活码无效');
      }

      const data = await resp.json();
      const tier = LICENSE_TYPE_TO_TIER[type] ?? 'free';

      // 服务端返回的到期时间优先（池记录 duration_days 为准，客户端不再自行 30 天）
      const serverExpiresAt = typeof data.expires_at === 'string' ? data.expires_at : undefined;

      // 创建本地激活码记录
      const license: License = {
        id: crypto.randomUUID(),
        code: trimmed,
        type: type.toLowerCase() as LicenseType,
        tier,
        status: 'active',
        machineId,
        activatedAt: new Date().toISOString(),
        expiresAt: serverExpiresAt,
        syncedAt: new Date().toISOString(),
      };

      addLicense(license);
      toast({
        type: 'success',
        message: tier === 'lifetime'
          ? '🎉 终身 Pro 已激活！感谢你的支持！'
          : tier === 'pro'
            ? '✨ Pro 订阅已激活！畅享高级 AI 体验'
            : '内容包已激活，可在对应模块使用',
      });
      setCode('');
    } catch {
      toast({ type: 'error', message: '激活失败，请检查激活码后重试' });
    } finally {
      setActivating(false);
    }
  }

  // 已激活 Pro/Lifetime 时显示状态
  if (hasProOrLifetime) {
    const activeLicense = activeLicenses.find(
      (l) => (l.tier === 'pro' || l.tier === 'lifetime') && l.status === 'active',
    );
    const expiresAt = activeLicense?.expiresAt;
    const remainingDays = expiresAt ? daysRemaining(expiresAt) : 0;
    const isAnnual = !!expiresAt && remainingDays >= 300;  // 年付方案识别（服务端时长为准）
    const expiringSoon = !!expiresAt && remainingDays > 0 && remainingDays <= 3;
    return (
      <div className="flex flex-col gap-2 p-3 rounded-kb-md bg-semantic-success/5 border border-semantic-success/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-semantic-success flex-shrink-0" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <p className="text-b3 font-medium text-semantic-success">
              {activeLicense?.tier === 'lifetime' ? '终身 Pro 已激活' : `Pro 已激活${isAnnual ? '（年付方案）' : ''}`}
            </p>
            {expiresAt && (
              <p className="text-c1 text-text-tertiary">
                有效期至 {new Date(expiresAt).toLocaleDateString('zh-CN')}
                {activeLicense?.tier !== 'lifetime' && `（剩余 ${remainingDays} 天）`}
              </p>
            )}
          </div>
          <span className="text-c1 text-semantic-success">已激活</span>
        </div>
        {/* 到期前 3 天温和提醒（非阻断） */}
        {expiringSoon && (
          <div className="flex items-center gap-1.5 text-c1 text-semantic-warning">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
            订阅将于 {remainingDays} 天后到期，续费保持 Pro 权益
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-kb-md bg-bg-elevated border border-border-default">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
        <span className="text-b3 font-medium text-text-primary">激活码升级</span>
      </div>

      <p className="text-c1 text-text-tertiary leading-relaxed">
        输入激活码升级 Pro 订阅或激活内容包。激活码可在面包多 (mianbaoduo.com) 购买。
      </p>

      {/* 输入行 */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="ENTROPY-PRO-XXXX-XXXX"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
          }}
          className={cn('flex-1 font-mono text-xs', error && 'border-semantic-error')}
        />
        <Button
          variant="primary"
          size="sm"
          loading={activating}
          onClick={handleActivate}
          icon={<Check className="w-3.5 h-3.5" strokeWidth={1.5} />}
          disabled={!code.trim()}
        >
          激活
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-semantic-error flex-shrink-0" strokeWidth={1.5} />
          <span className="text-c1 text-semantic-error">{error}</span>
        </div>
      )}

      {/* 购买链接 */}
      <div className="flex items-center gap-1">
        <span className="text-c1 text-text-tertiary">还没有激活码？</span>
        <a
          href="https://mianbaoduo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-c1 text-brand-500 hover:text-brand-600 transition-colors"
        >
          前往面包多购买
          <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
        </a>
      </div>
    </div>
  );
}