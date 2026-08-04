/**
 * 仪式碑文标题
 * @description 造序仪式视觉语言：衬线大字主标题 + 琥珀「序」印 + 竖排注文，取代普通页头
 * @ai-context 宪法第五条排印（跳率 ≥4x、衬线大字 + 10-12px 注文、竖排+印章）；
 * 右侧 children 插槽承载功能操作（沉浸入口按钮），页面逻辑不拆分
 */
import type { ReactNode } from 'react';

interface RitualHeaderProps {
  /** 主标题文案 */
  title: string;
  /** 竖排注文（从右向左书写） */
  note?: string;
  /** 右侧操作区插槽（沉浸入口等） */
  children?: ReactNode;
}

/**
 * 仪式碑文标题组件
 * @ai-context 布局：印章 → 衬线大字（clamp 2.5-4.25rem）→ 竖排注文，右侧 children；
 * 标题尾部带渐隐光痕线（文字被雾吞没的隐喻）
 */
export default function RitualHeader({ title, note, children }: RitualHeaderProps) {
  return (
    <header className="relative z-10 flex items-start gap-kb-lg">
      <div className="flex items-start gap-kb-md">
        {/* 琥珀「序」印：顿悟与秩序归属 */}
        <div className="kb-seal mt-1.5 shrink-0" aria-hidden="true">序</div>

        {/* 主标题：衬线大字 + 字距拉开 */}
        <h1 className="kb-ritual-title">{title}</h1>

        {/* 竖排注文：从右向左书写 */}
        {note && (
          <p className="kb-vertical-note h-28 pt-1 shrink-0" aria-label={note}>
            {note}
          </p>
        )}
      </div>

      {/* 右侧操作区 */}
      {children && <div className="ml-auto mt-1 shrink-0">{children}</div>}
    </header>
  );
}
