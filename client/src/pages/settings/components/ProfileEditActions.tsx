/**
 * 个人资料页 · 编辑操作按钮（取消 / 保存）
 *
 * @ai-context: ProfileSettings 审计拆分。保存按钮通过 form={formId} 触发
 * ProfileFormFields 中的表单提交（HTML 原生跨元素关联），取消回调由父组件
 * handleCancel 处理（回填原值并退出编辑态）。
 * @ai-context: Extracted from ProfileSettings. The save button submits the
 * form in ProfileFormFields via form={formId} (native HTML association);
 * cancel is handled by the parent's handleCancel.
 */
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui';

interface ProfileEditActionsProps {
  saving: boolean;
  formId: string;
  onCancel: () => void;
}

export function ProfileEditActions({ saving, formId, onCancel }: ProfileEditActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        icon={<X className="w-icon-xs h-icon-xs" strokeWidth={1.5} />}
      >
        取消
      </Button>
      <Button
        type="submit"
        form={formId}
        variant="primary"
        size="sm"
        loading={saving}
        icon={<Check className="w-icon-xs h-icon-xs" strokeWidth={1.5} />}
      >
        保存
      </Button>
    </div>
  );
}
