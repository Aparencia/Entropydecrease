/**
 * @ai-context L1 原语：文本。**墨度 × 字阶的唯一出口**（批 0-D Task 3）。
 *
 * Why：现状 `fontSize:` 1274 行/143 文件 · `fontWeight` 230/96 · 弱化灰 `#9ca3af` 256 行/100 文件
 * （recon §2），字阶与墨度逐处手写；规格 §4.2 的 6 档字阶与 §4.3 的四档墨度必须能被**一处**驱动。
 * 本组件的**唯一职责就是排版与墨度** —— 它不做语义色决策（`tone` 只是「取哪一档墨度的名字」，
 * 颜色值只在 `ui/tokens.css`），也不承载动作（点击回执属 `Button`/`Surface`）。
 *
 * 副作用：`import "./Text.css"` —— 首个引入本原语的模块会带上该样式表。类规则只作用于 `.ed-text`
 * 元素，现存组件没有该类 ⇒ 批 0-D 期间**界面零变化**（本批不迁移任何调用点）。组件本身不读 store、
 * 不发请求、不写磁盘。
 *
 * 边界：① 排版与墨度**只出类名、不出内联 style**（否则批 6 的动效只能逐处改）；`style` 只是透传，
 * 供批 6 的接缝（`letterSpacing` / `color` 直接驱动）与调用点布局使用；② `truncate` 会把元素
 * 变为**块级**（`display: block`）—— 放在 `<p>` 等内联语境时由调用点负责；③ `as` 决定语义标签，
 * 本组件不额外包裹任何 DOM（不制造「多一层 div」的排版权威）；④ `ink-4` 是过渡态，
 * 不得承载唯一关键信息，剪报底纹上禁止使用（见 `Text.css` 的墨度边界注释）。
 *
 * ★ 属性级受控槽（批 4 T16-A 裁决）：`testId` / `title` 两个 —— 见 `TextProps` 里的理由。
 *   **明确不加** `role` / `onClick` / `aria-*` / `id` / 任意 DOM 透传（`...rest`）：可交互文本
 *   不是 `Text` 的职责，是 `Button` 的域（批 5/7）；开一个 `...rest` 就等于把「谁能改这个元素的
 *   行为与语义」重新交回调用点，ADR-033 §4 的「调用点不掌握排版权威」会在这一步失效。
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";
import "./Text.css";

/** 字阶档位，与 `SCALE_TOKENS.typeScaleVars` 的下标同序（1 起） */
export type TextSize = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 墨度档位 = `--ed-ink-*` 四档 + 语义色三档 + `inherit`。
 * `inherit` 不引任何 token：用于「跟随父级墨度」的内联片段（如 `<Text as="strong">` 里的强调）。
 */
export type TextTone = "ink-1" | "ink-2" | "ink-3" | "ink-4" | "stamp" | "ok" | "due" | "link" | "inherit";

/** 字族：界面黑体 / 正文衬线 / 等宽（`mono` 另开 `tabular-nums`，为数字对齐而非装饰） */
export type TextFont = "ui" | "body" | "mono";

/** 可渲染的语义标签（不提供 `a` / `button` —— 可交互元素属 `Button` 与调用点） */
export type TextTag = "span" | "p" | "div" | "label" | "strong" | "em" | "h1" | "h2" | "h3";

export interface TextProps {
  /** 字阶档位，默认 `4`（13/20·400 = 正文基准） */
  size?: TextSize;
  /** 墨度档位，默认 `ink-2`（已确认 · 正文基准），见 `TextTone` */
  tone?: TextTone;
  /** 字族，默认 `ui`（界面黑体） */
  font?: TextFont;
  /** 单行截断（`overflow: hidden` + 省略号）；注意它会把元素变为块级 */
  truncate?: boolean;
  /** 语义标签，默认 `span` */
  as?: TextTag;
  /**
   * 渲染 `data-testid`（探针锚点）。
   *
   * Why 开这一槽：批 4 T16-A 的探针实测切片内有 **≥3 处**弱化文本元素带着 `data-testid`，
   * 而 `TextProps` 表达不了 ⇒ 按 B6 阈值（同一缺口 ≥3 处共用 ⇒ 回来改原语）补槽。
   * ★ 它是**属性级**、不是排版级：`testId` 不影响任何排版或墨度决策，因此**不**打开
   * 「调用点重新掌握排版权威」的口子（ADR-033 §4）；同理 `title`。二者是唯一被批准的两槽。
   */
  testId?: string;
  /**
   * 原生 `title`（悬停 tooltip）。
   *
   * Why：同上 —— 探针实测 ≥3 处弱化文本带 `title`。**要不要 tooltip 是内容决策（调用点的）**，
   * 怎么显示是浏览器的事 ⇒ 原语只负责把值送到 DOM，不做任何包装 / 自绘气泡。
   */
  title?: string;
  /** 追加类名（调用点只做定位，不参与排版权威 —— 排版与墨度一律由本原语的类决定） */
  className?: string;
  /** 透传内联样式：批 6 的动效接缝（`letterSpacing` / `color`）与调用点布局用 */
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * 渲染一段文本。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 的类型把全局 `JSX` 命名空间收进
 * `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到。
 */
export function Text({
  size = 4,
  tone = "ink-2",
  font = "ui",
  truncate = false,
  as = "span",
  testId,
  title,
  className,
  style,
  children,
}: TextProps): ReactElement {
  const cls = [
    "ed-text",
    `ed-text--s${size}`,
    `ed-text--${tone}`,
    `ed-text--font-${font}`,
    truncate ? "ed-text--truncate" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Tag = as;
  // 未传 ⇒ 属性**根本不出现**（不是 `undefined` 字符串）：`data-testid={undefined}` 在 React 里
  // 恰好也不落属性，但显式三元把这条契约写在源码里，`Text.test.tsx` 的反向用例钉的就是它。
  return (
    <Tag
      className={cls}
      style={style}
      data-testid={testId === undefined ? undefined : testId}
      title={title === undefined ? undefined : title}
    >
      {children}
    </Tag>
  );
}
