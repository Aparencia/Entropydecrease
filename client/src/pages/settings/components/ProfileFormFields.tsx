/**
 * 个人资料页 · 编辑表单（昵称 / 邮箱只读 / 个人简介）
 *
 * @ai-context: ProfileSettings 审计拆分。formId 与提交按钮（ProfileEditActions
 * 中的 type="submit" form={formId}）跨组件关联，提交事件由父组件 handleSave
 * 处理（乐观更新 + 失败回滚）。
 * @ai-context: Extracted from ProfileSettings. Edit form (nickname / read-only
 * email / bio). formId links the submit button in ProfileEditActions to this
 * form; submission is handled by the parent's optimistic-save handler.
 */
import type { FormEvent } from 'react';
import { User, Mail } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ProfileFormFieldsProps {
  displayName: string;
  bio: string;
  email: string | undefined;
  formId: string;
  onDisplayNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function ProfileFormFields({
  displayName,
  bio,
  email,
  formId,
  onDisplayNameChange,
  onBioChange,
  onSubmit,
}: ProfileFormFieldsProps) {
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-kb-sm">
      <Input
        label="昵称"
        placeholder="输入昵称"
        value={displayName}
        onChange={(e) => onDisplayNameChange(e.target.value)}
        prefix={<User className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
      />
      <div className="flex flex-col gap-1">
        <label className="text-b2 font-medium text-text-secondary">邮箱</label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-kb-md bg-bg-tertiary border border-border">
          <Mail className="w-icon-sm h-icon-sm text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b2 text-text-secondary truncate">{email}</span>
          <span className="text-c1 text-text-tertiary flex-shrink-0">只读</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-b2 font-medium text-text-secondary">个人简介</label>
        <textarea
          placeholder="简单介绍一下自己..."
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          rows={3}
          maxLength={200}
          className={cn(
            'w-full px-3 py-2 rounded-kb-md resize-none',
            'bg-bg-elevated border border-border text-b2 text-text-primary',
            'placeholder:text-text-tertiary',
            'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20',
            'transition-all duration-kb-fast',
          )}
        />
        <span className="text-c1 text-text-tertiary text-right">{bio.length}/200</span>
      </div>
    </form>
  );
}
