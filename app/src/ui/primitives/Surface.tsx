/**
 * @ai-context L1 原语：面。**底 / 边框 / 圆角 / 阴影的唯一出口**（批 0-D Task 4）。
 *
 * Why：现状 `borderRadius` 584 行/134 文件（6/8/10/12 四值混用）· `border 1px solid` 412 行/
 * 121 文件 · `boxShadow:` 38 行/38 文件且是 18 个互不相同的字面值（recon §2 / §4①）——
 * 「面长什么样」逐处手写，改一次要动上百个文件。规格 §5.1 要求它收敛成 `Surface` 一个出口。
 *
 * 本组件的**唯一职责是面本身**（底 / 边框 / 圆角 / 阴影 + 可选内边距）：它不做语义决策
 * （`level` 只是「取哪一档底色」的名字，颜色值只在 `ui/tokens.css`），也不承载内容排版
 * （墨度与字阶属 `Text`，动作回执属 `Button`）。卡片 / 列 / 阅读面 / 弹层底都是它。
 *
 * 副作用：`import "./Surface.css"` —— 首个引入本原语的模块会带上该样式表；`interactive` 会
 * 引入 `:hover` / `:active` / `:focus-visible` 三条伪类规则（**全仓活代码里此前 0 处**，
 * recon §8.2）。类规则只作用于 `.ed-surface` 元素，现存组件没有该类 ⇒ 批 0-D 期间**界面零变化**
 * （本批不迁移任何调用点）。组件本身不读 store、不发请求、不写磁盘。
 *
 * 边界：① 底 / 边框 / 圆角 / 阴影 / 内边距**只出类名、不出内联 style**（否则批 6 的动效只能
 *       逐处改）；`style` 只是透传，供批 6 的接缝（直接驱动 `transform` / `boxShadow`）与调用点
 *       布局使用；② `interactive` 只给视觉，**不加 `tabIndex` / `role`** —— 键盘可达性由消费方
 *       用真实 `<button>` / `<a>` 承载（§8.6.1 第 4 条：键盘路径优先于「活」）；③ `bordered`
 *       默认 `true`，`bordered={false}` 用于「只有底色、不要分隔线」的阅读面；④ 不写 `box-sizing`
 *       （尺寸口径属调用点排版，见 `Surface.css` 的边界注释）。
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";
import "./Surface.css";

/** 四档底，与 `COLOR_TOKENS` 的 `bg-*` 四个颜色 token 一一对应（值只在 `ui/tokens.css`） */
export type SurfaceLevel = "sunken" | "canvas" | "surface" | "raised";

/** 四档圆角，与 `SCALE_TOKENS.radiusScale` 同序（3 / 5 / 8 / 10px） */
export type SurfaceRadius = "stamp" | "control" | "panel" | "overlay";

/** 可渲染的语义标签（不含 `button` / `a` —— 可交互元素属 `Button` 与调用点） */
export type SurfaceTag = "div" | "section" | "article" | "aside" | "li";

export interface SurfaceProps {
  /** 底色档位，默认 `surface`（卡片 / 列 / 阅读面） */
  level?: SurfaceLevel;
  /** 圆角档位，默认 `panel`（8px） */
  radius?: SurfaceRadius;
  /** 是否带 1px 边框，默认 `true`（`false` = 只有底色，用于阅读面） */
  bordered?: boolean;
  /** 是否可点（hover 升起 / 边框墨度 / 焦点环 / `cursor: pointer`），默认 `false` */
  interactive?: boolean;
  /** 是否加 12px 内边距，默认 `false`（内边距多数由调用点决定，故不默认开） */
  padded?: boolean;
  /** 语义标签，默认 `div` */
  as?: SurfaceTag;
  /** 追加类名（调用点只做定位与排布，不参与「面」的视觉权威） */
  className?: string;
  /** 透传内联样式：批 6 的动效接缝（`transform` / `boxShadow`）与调用点布局用 */
  style?: CSSProperties;
  /** 落到 `data-testid`；不传时不产生该属性 */
  testId?: string;
  children: ReactNode;
}

/**
 * 渲染一个「面」。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 的类型把全局 `JSX` 命名空间收进
 * `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` 的先例）。
 */
export function Surface({
  level = "surface",
  radius = "panel",
  bordered = true,
  interactive = false,
  padded = false,
  as = "div",
  className,
  style,
  testId,
  children,
}: SurfaceProps): ReactElement {
  const cls = [
    "ed-surface",
    `ed-surface--${level}`,
    `ed-surface--r-${radius}`,
    bordered ? "ed-surface--bordered" : null,
    interactive ? "ed-surface--interactive" : null,
    padded ? "ed-surface--padded" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Tag = as;
  return (
    <Tag className={cls} style={style} data-testid={testId}>
      {children}
    </Tag>
  );
}
