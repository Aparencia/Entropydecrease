/**
 * @ai-context L1 原语：**空态**（批 0-D Task 10；规格 §5.1 收敛账本的 `EmptyState` 行）。
 *
 * Why：本仓**没有空态组件**，等价物是散落在 40 行 / 28 文件的「暂无…」灰字（recon §2.1），
 * 5 套空态并存；更关键的是**首启路径没有主行动按钮**（规格 §5.1 原文）—— 用户看到「还没有笔记」
 * 却没有任何出路。规格 §5.1 要求把这些收敛成**一个**原语，故本组件是三件事的唯一出口：
 * ① 空态的三段槽位（图标 / 标题 / 说明）；② **主行动按钮**；③ **入场接缝**。
 *
 * ★ 批 6 的入场接缝（本任务的存在理由之一，recon §8.3）：空态今天**无组件、无 `data-*` 锚点**，
 *   所以「没有入场点」可挂。本组件给每个空态根元素**恒定**挂上 `.ed-empty-enter`，
 *   `EmptyState.css` 里那条一次性透明度入场即接缝本体。批 6 的接法（两种，都不必改调用点）：
 *   ① CSS 层：改写 `.ed-empty-enter` 规则（或删掉它，由编排层接管）；
 *   ② JS 层：`gsap.utils.toArray(".ed-empty-enter")` 直接接管该元素（`.ed-empty` 是批 4 迁移的
 *      稳定锚点，`.ed-empty-enter` 只表示「入场钩子」，两者同在一个元素上但不互相绑定）。
 *   `from` 只在动画期间生效 ⇒ 动画被取消/未加载时元素就是自然态，**不存在「永久隐身」的失效模式**；
 *   一次性（非循环）动画也天然满足 §8.6.1 第 3 条「下一个输入要能接管」—— 没有 JS 时间线持有它。
 *
 * 复用（本任务不改任何叶子原语）：
 * ① `Text`（`./Text`）：标题 = 第 3 档字阶 + `ink-1`；说明 = 第 4 档字阶 + `ink-3`。
 *    **排版与墨度的权威不在这里** —— 空态只决定「哪个槽位用哪一档」，不写 `fontSize`/`color`。
 * ② `Button`（`./Button`）：主行动按钮是**真实 `<button>`**，四态（hover / active / focus-visible /
 *    disabled）与键盘可达性由 `Button.css` **自动继承** —— 这是「叶子原语被组合原语复用」的第一次实证
 *    （规格 §8.6.1 第 2 条：每个用户动作都要有即时回执；空态里唯一的动作就是它）。
 * ③ `Icon`（`../icons`）：图标走图标层，**不手写内联 svg 标签**（批 0-B 的棘轮守卫对全树做文本扫描，
 *    注意：连注释里出现那个标签字面量都会被判为「新增内联 svg 的文件」）。
 * ④ **不用 `Surface`**（刻意的）：计划 Task 10 的 `Consumes` 没有它，且默认卡面（底 + 边框 + 圆角）
 *    会在批 4 迁移 28 处轻微空态时**改变观感**（本批的设计意图是界面零变化）。批 4 若需要「卡片式
 *    空态」，组合即可：`<Surface padded><EmptyState …/></Surface>` —— 两个原语互不冲突。
 *
 * 副作用：`import "./EmptyState.css"` —— 首个引入本原语的模块会带上该样式表；类规则只作用于
 * `.ed-empty*` 元素，现存组件没有这些类 ⇒ 批 0-D 期间**界面零变化**（本批不迁移任何调用点）。
 * 组件本身不读 store、不发请求、不写磁盘、**不持有任何状态**（无 `useState`/`useEffect`）。
 *
 * 边界：
 * ① **契约就是 `EmptyStateProps` 这几个字段**（计划 Task 10 的 `Produces` 是 7 个；批 4 Task 3
 *    按 B6 加了第 8 个 `align`）：**仍然不加** `className` / `style` —— 空态是「一处的形态」，
 *    调用点若要微调排版就等于把批 6 的「一处改对所有地方」重新打散。批 4 唯一开的口子是
 *    **两档受控对齐**（`EmptyStateAlign`，见其 `@ai-context`：44 处共用 ⇒ 只开一个档位，
 *    `fontSize`/墨度仍归 `Text`、空气仍归 `compact`）。
 * ② `action.disabled` 走 `Button` 的**原生 `disabled`**（移出 Tab 序、不派发 click）——语义是
 *    「这个出路暂时不可用」；「点了正在处理」那种不可用态用 `Button` 的 `busy`，属调用点自己的按钮。
 * ③ `description` 渲染成 `<p>` ⇒ **ReactNode 应当是行内内容**（`<p>` 不接受块级子元素）；
 *    需要块级内容（列表 / 按钮行）时用 `secondary` 槽 —— 它是普通 `<div>`，不设内容限制。
 * ④ **装饰性图标不给 `label`**：图标层在无 `label` 时自动 `aria-hidden`，信息全部由**文字**承载
 *    （标题是文本节点，不靠图形传达信息）；空态也不设 `role`（不是 live region —— 它随视图挂载，
 *    由视图自身的标题层级说明处境）。
 * ⑤ `compact` 只收空气与间距，**不动字阶**（字阶权威在 `Text`）。
 * ⑥ 不迁移任何现有调用点：那 40 行 / 28 文件是**批 4** 的迁移面，本批只交付被迁移的靶子。
 */

import type { ReactElement, ReactNode } from "react";
import { Icon } from "../icons";
import type { IconName } from "../icons";
import { Button } from "./Button";
import type { ButtonVariant } from "./Button";
import { Text } from "./Text";
import "./EmptyState.css";

/**
 * 空态图标尺寸取 24（`SCALE_TOKENS.iconSizes` 的最大档）：空态图标是这一屏**唯一的视觉焦点**，
 * 取列表行常用的 20 会与行内图标同权（图标只有名字，尺寸档由 `IconSize` 收窄，写错即编译错误）。
 */
const ICON_SIZE = 24;

/**
 * `align` → **附加类**（`null` = 不加，即基类形态）。写成 `Record<…>` 而非内联三元：
 * **新增一档对齐而忘了给类会成为编译错误**（同 `Toast.tsx` 的 `PLACEMENT_CLASS` 契约完整性锚）。
 * 默认档不产生 `--center` 类：`EmptyState.test.tsx:79` 的精确类名断言要求默认形态逐字不变。
 */
const ALIGN_CLASS: Readonly<Record<EmptyStateAlign, string | null>> = {
  center: null,
  start: "ed-empty--start",
};

/** 主行动按钮：空态的**唯一出路**（规格 §5.1「首启路径无主行动按钮」的落点） */
export interface EmptyStateAction {
  /** 按钮文案（如「新建第一篇笔记」） */
  readonly label: string;
  /** 点击回调；`disabled` 时不会被调用 */
  readonly onClick: () => void;
  /** 变体，默认 `primary`（空态的主行动是这一屏的头号动作；`ghost` 留给「工具型」空态） */
  readonly variant?: ButtonVariant;
  /** 是否不可用（透传 `Button` 的原生 `disabled`） */
  readonly disabled?: boolean;
}

/**
 * 两档**对齐**（受控排版档位，不是任意 `style`）—— 批 4 Task 3 按 B6 新增，`@ai-context`：
 *
 * Why 需要它：本原语的边界① 逐字**不加** `className` / `style`（空态是「一处的形态」，调用点微调
 * 排版等于把「一处改对所有地方」重新打散）。而现存 **44 处**空态（33 文件，规格 §5.1 逐字相等）
 * 普遍带内联排版：其中 `fontSize` / 墨度是 `Text` 字阶的权威、空气是 `compact` 的权威，
 * **唯独"整块左对齐"（`align-items: flex-start` / `text-align: start`）在基类（居中）里表达不了**。
 * 44 ≥ 3 ⇒ 按 B6「同一缺口 ≥3 个调用点共用 ⇒ 改原语」，**只开这一个**受控排版档位。
 *
 * 谁在用：`center`（默认）= 基类形态（居中的空态，今日 5 套空态的主流形态）；`start` = 落在**列表行 /
 * 侧栏**里的空态（与同级列表项左对齐，不把自己居中成一块告示牌）。批 4 T13 的迁移任务逐处选档。
 *
 * 边界（逐条）：
 * ① **只许这两档**，且**不放开**裸 `className` / `style`（边界① 逐字保留）—— 仍然表达不了的排版
 *    （如某个 `fontSize: 11`）由 `Text` 字阶 / `compact` / 外层 `Surface` 组合吸收；
 *    若确有 ≥3 处共用的第三种形态 ⇒ **登记 + 报控制方按 B6 判**，不许就地加口子。
 * ② 实现**走类**（`.ed-empty--start`），默认档**不产生**修饰类 —— 精确类名断言
 *    （`EmptyState.test.tsx:79` 既有的 `toBe`）要求默认档与今日形态逐字相同。
 * ③ 判据在 `EmptyState.align.test.tsx`（类名精确值 · 无 `style` 属性 · 四槽位在两种档位下都在），
 *    取值联合 ↔ CSS 类的全枚举锚在 `style-contract.test.ts`（`EmptyStateAlign` 一行）。
 */
export type EmptyStateAlign = "center" | "start";

export interface EmptyStateProps {
  /** 标题（**必填**）：一句话说明「这里为什么是空的」。它同时是空态的主信息，不靠图标传达 */
  title: string;
  /** 说明（可选）：下一步该做什么（如「去「课堂助手」开始实时捕获」）。应当只含行内内容 */
  description?: ReactNode;
  /** 图标名（可选，走 `ui/icons` 注册表）；装饰性 —— 不传时整块不渲染 */
  icon?: IconName;
  /** 主行动按钮（可选）：**有出路就一定要给**（规格 §5.1 的病灶正是首启路径没有它） */
  action?: EmptyStateAction;
  /** 次要内容（可选）：次要行动 / 快捷键提示等任意节点，渲染在 `__secondary` 槽 */
  secondary?: ReactNode;
  /** 紧凑形态（默认 `false`）：给列表行 / 侧栏内的空态收空气，不改字阶 */
  compact?: boolean;
  /** **对齐档**，默认 `"center"`（居中，基类形态）；`"start"` = 整块左对齐（`.ed-empty--start`），
   *  给落在列表行 / 侧栏里的空态用。**取值为闭集、且不放开 `className`/`style`** —— 为什么需要、
   *  边界与"还表达不了什么"见 `EmptyStateAlign` 的 `@ai-context`。实现走类 ⇒ 根元素无 `style`。 */
  align?: EmptyStateAlign;
  /** 落到 `data-testid`；不传时不产生该属性 */
  testId?: string;
}

/**
 * 渲染一个空态。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 的类型把全局 `JSX` 命名空间收进
 * `React.JSX`，直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondary,
  compact = false,
  align = "center",
  testId,
}: EmptyStateProps): ReactElement {
  const cls = ["ed-empty", compact ? "ed-empty--compact" : null, ALIGN_CLASS[align], "ed-empty-enter"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} data-testid={testId}>
      {icon !== undefined ? <Icon name={icon} size={ICON_SIZE} className="ed-empty__icon" /> : null}
      <Text as="p" size={3} tone="ink-1" className="ed-empty__title">
        {title}
      </Text>
      {description !== undefined ? (
        <Text as="p" size={4} tone="ink-3" className="ed-empty__description">
          {description}
        </Text>
      ) : null}
      {action !== undefined ? (
        <Button variant={action.variant ?? "primary"} onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      ) : null}
      {secondary !== undefined ? <div className="ed-empty__secondary">{secondary}</div> : null}
    </div>
  );
}
