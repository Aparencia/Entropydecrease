/**
 * @ai-context L1 原语：按钮。**四态契约的唯一出口**（批 0-D Task 5；规格 §8.6.1 接缝表第 1 行）。
 *
 * Why：本仓至今**没有任何按钮原语** —— `<button>` 510 行/121 文件全是各自内联样式、`const *Btn*`
 * 样式常量 86 行/60 文件（recon §3.3）；而 CSS `:hover` / `:active` 在活代码里 **0 处**、
 * `:focus*` / `:disabled` **各 0**、`aria-disabled` **0**、禁用视觉降级**全站 1 处**（recon §8.2）。
 * 用户对动效纲领的答复是「我希望我在对其进行交互时，它是活的」（规格 §8.6.1）⇒ 本组件是那条
 * 纲领落地的第一块基石：悬停有反应、按下有回执、焦点看得见、禁用看得出来。
 *
 * 副作用：`import "./Button.css"` —— 首个引入本原语的模块会带上该样式表；它含**本批第二个
 * `:focus-visible`**（全仓首个在 `Surface.css:73`，本原语非首创）与首条按钮 `:disabled` 视觉降级。类规则只作用于 `.ed-btn` 元素，现存组件
 * 没有该类 ⇒ 批 0-D 期间**界面零变化**（本批不迁移任何调用点）。组件本身不读 store、不发请求、
 * 不写磁盘。
 *
 * 边界：
 * ① **`disabled` 与 `busy` 是两种不可用态，语义不同**：`disabled` 走**原生 `disabled`**（浏览器
 *    把它移出 Tab 序、不派发 click），`busy` **只设 `aria-disabled`**（留在 Tab 序里、焦点不丢 ——
 *    避免"点了没反应、焦点也丢了"）。两者都同步 `aria-disabled="true"`，让 CSS 有一个**统一的
 *    不可用锚点**（`.ed-btn[aria-disabled="true"]`）。代价：原生 `disabled` 已足够向辅助技术表达
 *    禁用，同步声明与 ARIA「原生属性足够时不要重复」的建议有轻微张力 —— 若评审要求去掉，删掉
 *    这一行即可，CSS 的 `:disabled` 分支与测试不受影响。
 * ② 不可用时**不派发 `onClick`**：`busy` 没有原生 `disabled` 替我们拦截，click 仍会到达 ⇒ 处理器
 *    显式 `preventDefault()` 后返回（顺带挡住 `type="submit"` 的隐式表单提交）。
 * ③ 四态与位移**只出类名、不出内联 style**（否则批 6 只能逐处改）。`style` 是**纯透传**
 *    （与 `Text` / `Surface` 逐字同一写法，控制方 2026-09-11 裁决补入）：本组件**没有基类内联
 *    style**，故不存在合并与顺序问题 —— 调用点传什么就是什么。视觉权威仍在类：调用点若用
 *    `style` 去覆盖四态的底色/位移，等于把批 6 的"一处改对所有地方"重新打散（那正是本批要消灭的形态）。
 * ④ **不加 `tabIndex` / `role`**：它是**真实 `<button>`**，Tab 到达与 Enter/Space 激活由浏览器免费
 *    提供（现状全仓 `tabIndex` 仅 1 处、大量可点 `<div>` 不可键盘到达，见 recon §8.2 与 §8.6.1 第 4 条）。
 * ⑤ **无 `danger` 变体**：危险语义由 `ConfirmDialog` 的印章标记 + 级联影响清单承载，按钮保持中性
 *    （控制方裁决 3 · 规格 §4.1「`--ed-stamp` 绝不用于按钮」）。
 * ⑥ 图标槽**不额外包裹 DOM**（间距由 `.ed-btn` 的 `flex gap` 承载）：多包一层 `span` 就要多一个
 *    类名，而该类名不在 `motion.css` 的 reduced-motion 基类名单里，会给 Task 14 的守卫制造假红。
 */

import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from "react";
import "./Button.css";

/** 三档变体：`primary` 墨底（主行动）· `secondary` 纸底（默认）· `ghost` 透明（工具条 / 关闭） */
export type ButtonVariant = "primary" | "secondary" | "ghost";

/** 三档尺寸：`sm` 工具条 · `md` 常态 · `lg` 表单与主行动（字号取字阶第 6/5/4 档） */
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  /** 按钮文案（可含嵌套元素；`icon` 渲染在它之前） */
  children: ReactNode;
  /** 点击回调；`disabled` 与 `busy` 时**不会**被调用（不传 event —— 调用点不需要知道实参） */
  onClick?: () => void;
  /** 变体，默认 `secondary`（中性；主行动才用 `primary`） */
  variant?: ButtonVariant;
  /** 尺寸，默认 `md` */
  size?: ButtonSize;
  /** 原生禁用：移出 Tab 序、不派发 click（不可逆动作进行中请改用 `busy`） */
  disabled?: boolean;
  /** 忙：保留焦点与 Tab 顺序，但屏蔽点击（`aria-busy` + `aria-disabled`，**不设**原生 `disabled`） */
  busy?: boolean;
  /** 原生 type，默认 `button`（`<button>` 在表单里的隐含默认是 `submit`，默认值必须显式写死） */
  type?: "button" | "submit" | "reset";
  /** 撑满容器宽度（布局修饰，不参与按钮的视觉权威） */
  block?: boolean;
  /** 原生 title（悬停提示；不传时不产生该属性） */
  title?: string;
  /** 图标槽，渲染在文案之前（装饰性由图标自身决定，见 `ui/icons/Icon.tsx`） */
  icon?: ReactNode;
  /** 追加类名（调用点只做定位，不参与按钮的视觉权威） */
  className?: string;
  /** 透传内联样式（纯透传：调用点布局微调、批 6 的动效接缝；**视觉一律由类决定**） */
  style?: CSSProperties;
  /** 落到 `data-testid`；不传时不产生该属性 */
  testId?: string;
}

/**
 * 渲染一个按钮。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 的类型把全局 `JSX` 命名空间收进
 * `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled = false,
  busy = false,
  type = "button",
  block = false,
  title,
  icon,
  className,
  style,
  testId,
}: ButtonProps): ReactElement {
  const unavailable = disabled || busy;
  const cls = [
    "ed-btn",
    `ed-btn--${variant}`,
    `ed-btn--${size}`,
    block ? "ed-btn--block" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (unavailable) {
      // busy 态没有原生 disabled 拦截，click 仍会到达 —— 不 preventDefault 会在"动作已在进行"
      // 时再次触发同一动作，也会让 type="submit" 的表单被隐式提交。
      event.preventDefault();
      return;
    }
    onClick?.();
  };

  return (
    <button
      type={type}
      className={cls}
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={unavailable ? true : undefined}
      aria-busy={busy ? true : undefined}
      title={title}
      style={style}
      data-testid={testId}
    >
      {icon}
      {children}
    </button>
  );
}
