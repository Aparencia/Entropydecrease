/**
 * 个人资料页 · 只读展示（昵称 / 邮箱 / 简介）
 *
 * @ai-context: ProfileSettings 审计拆分。非编辑态信息展示；邮箱与简介为空时
 * 的占位文案与原组件一致。
 * @ai-context: Extracted from ProfileSettings. Read-only info display used
 * outside edit mode; empty-state copy matches the original component.
 */
import { Mail } from 'lucide-react';

interface ProfileDisplayFieldsProps {
  displayName: string;
  email: string | undefined;
  bio: string;
}

export function ProfileDisplayFields({ displayName, email, bio }: ProfileDisplayFieldsProps) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-b1 font-medium text-text-primary">
          {displayName || <span className="text-text-tertiary">未设置昵称</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Mail className="w-icon-xs h-icon-xs text-text-tertiary" strokeWidth={1.5} />
          <p className="text-b2 text-text-secondary">{email}</p>
        </div>
      </div>
      {bio ? (
        <p className="text-b2 text-text-secondary">{bio}</p>
      ) : (
        <p className="text-b3 text-text-tertiary italic">暂无个人简介</p>
      )}
    </div>
  );
}
