/**
 * 个人资料页 · 未登录空态
 *
 * @ai-context: ProfileSettings 审计拆分。未登录时展示引导登录卡片（原组件
 * 首个分支，纯展示无状态）。
 * @ai-context: Extracted from ProfileSettings. Not-logged-in prompt card
 * (the component's first branch; presentational only).
 */
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { Card } from '@/components/ui';

export function ProfileLoginPrompt() {
  return (
    <Card padding="md" className="flex flex-col gap-kb-sm items-center py-kb-lg">
      <User className="w-8 h-8 text-text-tertiary" strokeWidth={1.5} />
      <p className="text-b2 text-text-secondary">请先登录以管理个人资料</p>
      <Link
        to="/login"
        className="text-b3 text-brand-500 hover:text-brand-600 transition-colors"
      >
        前往「登录」页面开始使用 →
      </Link>
    </Card>
  );
}
