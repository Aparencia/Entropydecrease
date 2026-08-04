/**
 * 模块仪式页头（共享）
 * @description 模块列表页统一仪式页头：模块色印章 + 衬线大字 + 注文 + 右侧操作区
 * @ai-context 与萤火海沟「序」印/深潜「潜」印同源的设计语言；印章色由 sealColor 注入
 * --kb-module-seal 变量；compact 变体用于窄栏/工具栏（Notes 三栏、Classroom 左栏）
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './module-ritual.css';

interface ModuleRitualHeaderProps {
  /** 模块隐喻名标题（如「反衰减呼吸」「浮出水面」）；省略则仅渲染印章 */
  title?: string;
  /** 注文（副标题）；compact 变体下隐藏 */
  note?: string;
  /** 印章单字（如「呼」「浮」「籍」） */
  sealChar: string;
  /** 印章颜色（模块色令牌值，如 #7BC4B8）；默认琥珀 */
  sealColor?: string;
  /** 右侧操作区（按钮组等） */
  actions?: ReactNode;
  /** 紧凑变体：窄栏/工具栏场景 */
  compact?: boolean;
  className?: string;
}

/**
 * 模块仪式页头组件
 * @ai-context 布局：印章 → 衬线大字 → 注文，actions 靠右；不携带路由/业务逻辑
 */
export default function ModuleRitualHeader({
  title,
  note,
  sealChar,
  sealColor = '#F59E0B',
  actions,
  compact,
  className,
}: ModuleRitualHeaderProps) {
  const style = { '--kb-module-seal': sealColor } as CSSProperties;

  return (
    <header
      className={cn('kb-module-header', compact && 'kb-module-header--compact', className)}
      style={style}
    >
      <div className="kb-module-seal shrink-0" aria-hidden="true">{sealChar}</div>
      <div className="min-w-0">
        {title && <h1 className="kb-module-title">{title}</h1>}
        {note && <p className="kb-module-note">{note}</p>}
      </div>
      {actions && <div className="kb-module-actions">{actions}</div>}
    </header>
  );
}
