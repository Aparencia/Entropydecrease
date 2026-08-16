/**
 * 个人资料页 · 加载骨架屏
 *
 * @ai-context: ProfileSettings 审计拆分。首次加载（loadProfile 完成前）的
 * 占位卡片，结构与原组件一致（标题 + 头像/文本骨架条）。
 * @ai-context: Extracted from ProfileSettings. Loading skeleton shown before
 * loadProfile resolves; layout matches the original component.
 */
import { Card } from '@/components/ui';

export function ProfileLoadingSkeleton() {
  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <h2 className="text-b1 font-semibold text-text-primary">个人资料</h2>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-kb-full bg-bg-tertiary animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-bg-tertiary rounded animate-pulse" />
          <div className="h-3 w-48 bg-bg-tertiary rounded animate-pulse" />
        </div>
      </div>
    </Card>
  );
}
