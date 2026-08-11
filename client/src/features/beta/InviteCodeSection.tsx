/**
 * 邀请码管理 — 内测核心层用户专属
 *
 * @ai-context: 核心层用户可查看/复制邀请码（2个），
 * 邀请码用于邀请新用户加入内测，被邀请者自动继承 beta 身份。
 */
import { useState } from 'react';
import { Users, Copy, Check, Plus } from 'lucide-react';
import { Button, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBetaStore } from '@/features/beta/betaStore';

export function InviteCodeSection() {
  const { toast } = useToast();
  const { myInviteCodes, addInviteCode } = useBetaStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // 可用的邀请码（未使用 + 未过期）
  const availableCodes = myInviteCodes.filter((c) => c.status === 'pending');
  const usedCodes = myInviteCodes.filter((c) => c.status === 'used');
  // 核心层可生成 2 个邀请码
  const maxInvites = 2;
  const usedCount = usedCodes.length;
  const remaining = maxInvites - usedCount;
  const canGenerate = remaining > 0;

  async function handleGenerate() {
    setGenerating(true);
    try {
      // 生成邀请码（使用加密安全的随机数）
      const code = `INVITE-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      addInviteCode({
        id: crypto.randomUUID(),
        code,
        issuerUserId: 'current',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      toast({ type: 'success', message: '邀请码已生成，可复制分享给朋友' });
    } catch {
      toast({ type: 'error', message: '生成失败，请重试' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      toast({ type: 'success', message: '邀请码已复制到剪贴板' });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ type: 'error', message: '复制失败，请手动复制' });
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-kb-md bg-bg-tertiary/50 border border-border-default">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-primary">邀请码管理</span>
        </div>
        <span className="text-c1 text-text-tertiary">
          {availableCodes.length}/{maxInvites} 可用
        </span>
      </div>

      <p className="text-c1 text-text-tertiary leading-relaxed">
        邀请朋友加入内测，被邀请者自动获得内测身份。邀请码不可重复使用。
      </p>

      {/* 邀请码列表 */}
      {availableCodes.length > 0 && (
        <div className="space-y-2">
          {availableCodes.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-2.5 rounded-kb-sm bg-bg-elevated border border-border-default"
            >
              <code className="text-b3 font-mono font-medium text-text-primary tracking-wider">
                {invite.code}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(invite.code, invite.id)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-kb-sm',
                  'text-c1 transition-colors',
                  copiedId === invite.id
                    ? 'text-semantic-success bg-semantic-success/10'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary',
                )}
              >
                {copiedId === invite.id ? (
                  <>
                    <Check className="w-3 h-3" strokeWidth={1.5} />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" strokeWidth={1.5} />
                    复制
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 已使用的邀请码 */}
      {usedCodes.length > 0 && (
        <div className="space-y-1">
          <p className="text-c1 text-text-quaternary">已使用的邀请码</p>
          {usedCodes.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-2 rounded-kb-sm bg-bg-tertiary/30"
            >
              <code className="text-c1 font-mono text-text-quaternary line-through">
                {invite.code}
              </code>
              <span className="text-c2 text-text-quaternary">
                已使用
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 生成按钮 */}
      {canGenerate && (
        <Button
          variant="ghost"
          size="sm"
          loading={generating}
          onClick={handleGenerate}
          icon={<Plus className="w-3.5 h-3.5" strokeWidth={1.5} />}
          className="self-start"
        >
          生成邀请码（剩余 {remaining} 个）
        </Button>
      )}
    </div>
  );
}