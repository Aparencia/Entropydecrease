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
 *       默认 `true`，`bordered={false}` 用于「只有底色、不要分隔线」的阅读面；④ 盒模型口径由**基类
 *       自带**（`box-sizing: border-box`，控制方 2026-09-11 裁决 —— 本仓无全局 CSS reset，
 *       `padded` + `bordered` + `width:100%` 在 content-box 下会溢出 26px；理由详见
 *       `Surface.css` 的基类注释），调用点不必再自己补。
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";
import "./Surface.css";

/** 底档：四档与 `COLOR_TOKENS` 的 `bg-*` 四个颜色 token 一一对应（值只在 `ui/tokens.css`）；
 *  第五档 `none` 是**批 7 T7 的「只出边框」档** —— 它不是第五种底色，而是**明确声明不出底**
 *  （`background: transparent` = 迁移前「不写 background」的逐字同义），供「整圈边框 + 无底色」的
 *  透明容器落进原语（批 4 B11 的 `no-background` 残留：`Surface` 基类必出底色）。 */
export type SurfaceLevel = "sunken" | "canvas" | "surface" | "raised" | "none";

/** 五档圆角：四档与 `SCALE_TOKENS.radiusScale` 同序（3 / 5 / 8 / 10px），第五档 `pill` 是批 4 T17 加的**药丸**形态
 *  （`radiusScale` 里还没有它 ⇒ `Surface.css` 的该档走 `var(--ed-radius-pill, 999px)` 兜底；补 token 见彼处注释） */
export type SurfaceRadius = "stamp" | "control" | "panel" | "overlay" | "pill";

/** 可渲染的语义标签（不含 `button` / `a` —— 可交互元素属 `Button` 与调用点） */
export type SurfaceTag = "div" | "section" | "article" | "aside" | "li";

/** 面的**自有属性**（不含内容面 —— 内容的二选一由 `SurfaceProps` 的联合表达） */
interface SurfaceOwnProps {
  /** 底色档位，默认 `surface`（卡片 / 列 / 阅读面）；`none` = **只出边框、不出底色**（批 7 T7） */
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
  /**
   * **受控槽**：宿主元素的 `id`（供锚点跳转，如 `SessionScreenCards` 的 `ocr-<会话>-<ms>`）。
   * Why 用受控槽而不是 `...rest`：`Surface` 是「面」的唯一出口，DOM 属性面一旦放开就再也收不回
   * （ADR-033 §4 + 批 7 §C9.4 的裁决）—— 只把**已点名的**两个属性开口。
   */
  domId?: string;
}

/**
 * `Surface` 的属性。**内容面是联合类型**：`children`（常规）与 `html`（受控槽，走
 * `dangerouslySetInnerHTML`）**互斥** —— 两者都给 = TS2353/TS2322，不是运行期才炸。
 */
export type SurfaceProps =
  | (SurfaceOwnProps & {
      readonly children: ReactNode;
      /** 受控槽：把**已渲染的 HTML 串**交给 `dangerouslySetInnerHTML`（与 `children` 互斥） */
      readonly html?: never;
    })
  | (SurfaceOwnProps & {
      readonly children?: never;
      /** 受控槽：把**已渲染的 HTML 串**交给 `dangerouslySetInnerHTML`（与 `children` 互斥） */
      readonly html: string;
    });

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
  domId,
  html,
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
  // 两个内容分支**分开写**：`children` 与 `dangerouslySetInnerHTML` 同时出现会被 React 抛错，
  // 而联合类型已在编译期禁止「两者都给」；分开写让「运行期只可能走一支」一眼可见。
  if (html !== undefined) {
    return (
      <Tag className={cls} style={style} data-testid={testId} id={domId}
        dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  return (
    <Tag className={cls} style={style} data-testid={testId} id={domId}>
      {children}
    </Tag>
  );
}
