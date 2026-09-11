/**
 * @ai-context 图标层的类型契约（ADR-032 决策 6）。
 *
 * Why：全站 310 个 emoji 分布在 93 个文件里，跨平台字形不一致、无法被 `currentColor`
 * 语义着色、基线抖动会让行高跳动 —— 而本设计的「三色信号体系」要求图标能表达
 * 选中/禁用/危险。故自绘线性图标，并把几何数据与渲染分离：数据可被契约测试穷举校验，
 * 组件只有一个。
 *
 * 副作用：无（纯类型 + 常量）。
 * 边界：几何只允许四种 SVG 元素（见 `ICON_ELEMENT_TAGS`）——**不含任何颜色字段**，
 * 颜色一律由 `currentColor` 决定。新增元素类型必须先在此登记并同步契约测试。
 */

/** 几何白名单：只用这四种，足够表达全部图标且便于穷举校验 */
export const ICON_ELEMENT_TAGS = ["path", "circle", "rect"] as const;

export type IconElementTag = (typeof ICON_ELEMENT_TAGS)[number];

export type IconElement =
  | { readonly tag: "path"; readonly d: string }
  | { readonly tag: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly tag: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number };

export interface IconGeometry {
  readonly elements: readonly IconElement[];
}

/** 尺寸档来自批 0-A 的真源（`SCALE_TOKENS.iconSizes`），此处只做字面量镜像以便类型收窄 */
export type IconSize = 16 | 20 | 24;

export interface IconProps {
  /** 图标名；非法名字在编译期报错（由 `IconName` 联合拦下） */
  readonly name: IconName;
  /** 默认 20 —— 列表行与按钮的常用档 */
  readonly size?: IconSize;
  /** 只在图标**独自承载语义**时给（此时角色变为 `img`）；装饰性图标一律不给 */
  readonly label?: string;
  readonly className?: string;
}

// 循环导入的说明：`paths.ts` 需要 `IconGeometry` 类型，`types.ts` 需要 `paths.ts` 派生的
// `IconName`。TypeScript 的类型导入不产生运行时代码，故 `import type` 是安全的。
import type { IconName } from "./paths";
