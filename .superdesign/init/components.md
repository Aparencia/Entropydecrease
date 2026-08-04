# 熵减 (Entropydecrease) — 共享 UI 原语

基于 shadcn/radix 封装（cva 变体），前缀类 `rounded-kb-*`、`bg-bg-*`、`text-text-*`、`shadow-kb-*`、`duration-kb-*`、`ease-kb-*`。

## Button（client/src/components/ui/Button.tsx）

```tsx
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center font-medium',
    'transition-all duration-kb-fast ease-kb-smooth',
    'select-none whitespace-nowrap',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.97] active:duration-kb-fast',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: ['bg-brand-600 text-white', 'hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/20', 'active:bg-brand-800', 'shadow-kb-sm'],
        secondary: ['bg-bg-tertiary text-text-primary', 'hover:bg-border hover:shadow-md', 'active:bg-border-strong', 'border border-border/40'],
        ghost: ['bg-transparent text-text-secondary', 'hover:bg-bg-tertiary hover:text-text-primary', 'active:bg-bg-secondary'],
        danger: ['bg-semantic-error text-white', 'hover:bg-semantic-error/90 hover:shadow-md hover:shadow-semantic-error/20', 'active:bg-semantic-error/80', 'shadow-kb-sm'],
        ai: ['bg-gradient-to-r from-accent-500 to-brand-500 text-white', 'hover:from-accent-600 hover:to-brand-600', 'hover:shadow-md hover:shadow-accent-500/20', 'shadow-kb-sm'],
      },
      size: { sm: 'px-3 py-1.5 text-b3 rounded-kb-sm gap-1.5', md: 'px-4 py-2 text-b2 rounded-kb-md gap-2', lg: 'px-6 py-3 text-b1 rounded-kb-lg gap-2.5' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
// 支持 loading（Loader2 spin）、icon、iconRight、asChild（radix Slot）
```

## Card（client/src/components/ui/Card.tsx）

```tsx
const cardVariants = cva('transition-all duration-300 ease-kb-smooth backdrop-blur-xl overflow-hidden', {
  variants: {
    variant: {
      default: ['bg-bg-secondary/60 rounded-kb-lg shadow-kb-sm kb-squircle', 'border border-border/40', 'hover:shadow-kb-md hover:border-border/60'],
      elevated: ['bg-bg-secondary/60 rounded-kb-lg shadow-kb-md kb-squircle', 'border border-border/20', 'hover:shadow-lg hover:border-border/40'],
      outlined: ['bg-bg-secondary/40 rounded-kb-lg kb-squircle', 'border border-border/50', 'hover:border-border-strong hover:shadow-kb-sm'],
    },
    padding: { none: '', sm: 'p-kb-sm', md: 'p-kb-md', lg: 'p-kb-lg' },
    hoverable: { true: 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-border/60', false: '' },
  },
  defaultVariants: { variant: 'default', padding: 'md', hoverable: false },
});
// 子组件：CardHeader（flex flex-col gap-kb-xs pb-kb-md）、CardContent（pb-kb-md last:pb-0）、CardFooter（flex items-center pt-kb-md）
```

## Tag（client/src/components/ui/Tag.tsx）

```tsx
const tagVariants = cva(['inline-flex items-center gap-1', 'px-2.5 py-0.5', 'text-b3 font-medium', 'rounded-kb-full', 'transition-colors duration-kb-fast'], {
  variants: {
    color: {
      brand: 'bg-brand-100/70 text-brand-700',
      pomodoro: 'bg-rose-100/70 text-rose-700',        // 注意：硬编码 rose，非令牌
      note: 'bg-accent-100/70 text-accent-700',
      flashcard: 'bg-cyan-100/70 text-cyan-700',       // 注意：硬编码 cyan，非令牌
      feynman: 'bg-indigo-100/70 text-indigo-700',      // 注意：硬编码 indigo，非令牌
      default: 'bg-bg-tertiary text-text-secondary',
    },
  },
  defaultVariants: { color: 'default' },
});
// 支持 closable（X 关闭按钮）
```

## EmptyState（client/src/components/ui/EmptyState.tsx）

```tsx
<div className="flex flex-col items-center justify-center text-center py-kb-2xl px-kb-lg">
  <div className="text-text-tertiary/60 mb-kb-md">{icon || <BrandLogo mode="floating" size={64} className="text-brand-500/60" />}</div>
  <h3 className="text-h3 font-medium text-text-secondary">{title}</h3>
  {description && <p className="mt-kb-xs text-b2 text-text-tertiary max-w-xs">{description}</p>}
  {action && <div className="mt-kb-md">{action}</div>}
</div>
```

## 其他共享组件（client/src/components/ui/）

| 组件 | 用途 |
|------|------|
| IconButton | 图标按钮（size/tooltip/variant） |
| Input / AIButton | 输入框 / AI 渐变按钮 |
| Modal / CloseConfirmDialog / ConsentModal | 模态层（modal-enter 动画） |
| Toast / AchievementToast | 通知（顶部成就演出） |
| CommandPalette | 命令面板（⌘K） |
| ContextMenu / RichTooltip / Tip | 交互辅助 |
| Skeleton / VirtualList | 加载/虚拟列表 |
| BrandLogo | SVG 品牌标志（floating/draw 模式） |
| Avatar | 用户头像 |
| TypewriterText | 打字机文字 |
| AIThinkingIndicator | AI 思考指示（三点脉冲） |
| KnowledgeGalaxy | 知识星系（旋转光点） |
| AmbientLightPool | 环境光点池 |
| ModeIndicator / ComingSoonBadge / ComingSoonPlaceholder | 状态标识 |
| ErrorBoundary / UpdateNotification | 兜底 |
