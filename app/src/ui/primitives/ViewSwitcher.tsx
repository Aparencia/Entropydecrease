/**
 * @ai-context L1 原语：视图切换器（分段控件）—— L3 视图层四个部件的**切换入口**（批 5 Task 5；C1 + C14①）。
 *
 * Why（为什么它是原语、而不是视图层的私有件）：
 *   ① C1 逐字「宿主用 `React.lazy` + `Suspense`」—— 切换入口必须由**一个**受控组件持有，
 *      否则会话 5 视图 / 笔记 2–3 视图会各写一份「哪一段是选中」，视图记忆（C5 的
 *      `view:default:{objectType}`）也就无从落点；
 *   ② C14① 逐字要求它进 `ui/primitives/index.ts` barrel（ADR-033 §1 的唯一公共入口）、在
 *      `style-contract.test.ts` 的枚举里、**零行内 style**（ADR-033 §4），并覆盖规格 §8.6.1
 *      第 3 条的**响应层接缝**（`--ed-dur-micro` 120ms）。
 *
 * ★ 类名空间（R-2 的落点；与 `ViewSwitcher.css` 文件头逐字同源）：容器 `.ed-btn-group` +
 *   段 `.ed-btn--segment` —— **复用 `ed-btn` 基座命名空间**。理由三条：① 段控件本质是**成组的
 *   按钮**（元素就是 `<button>`，四态与焦点环由 `.ed-btn` 免费提供）；② `motion-coverage.test.ts`
 *   的「未登记基类」规则逐字排除「含 `--`」与「`<基类>-…`」，且段类与基类**同在一个元素上**、
 *   已被 `motion.css` 里 `.ed-btn` 那条规则覆盖 ⇒ 不动 `BASE_CLASSES` / `motion.css` /
 *   `style-seams.test.ts` 的 12 个基类计数 ⇒ **本批对既有断言的改动数保持 0**（附 B.6）；
 *   ③ **诚实代价**：「段控件的类名落在按钮基座命名空间里」是一次**语义折中**，登记给 T18。
 *
 * ★ 语义（规格 §7.1「分段控件」+ §8.6.1 第 3/4 条）：
 *   · 容器 `role="group"` + **必填** `aria-label`（容器的可访问名不靠视觉）；
 *   · 每段是真实 `<button type="button">`，选中态用布尔 `aria-pressed`（=`opt.key === value`）——
 *     **不用 `role="tab"`**：视图面板是
 *     **条件挂载/卸载**的（C1 的 `React.lazy` + §7.3②），不是常驻 tabpanel ⇒ `role="tab"` 会
 *     承诺一个不存在的 tabpanel 关系，而 `aria-pressed` 说实话（= 一个"按下的按钮组"）；
 *   · **roving tabindex**：选中项 `tabIndex=0`、其余 `-1`；`ArrowLeft`/`ArrowRight`/`Home`/`End`
 *     只**移动焦点**、**不**改受控值（改值只能由点击或 Enter/Space 触发 ⇒ 焦点路过不会静默切视图）。
 *
 * 副作用：无（纯展示 + 只调 `onChange`；不读 store、不发请求、不写磁盘、**不 import Tauri**）。
 * 边界：
 *   ① **受控**：本组件不持有选中态 ⇒ 视图记忆（C5）与异步守卫（C4 的 `flushSave` 阻断）都在宿主手里；
 *   ② 点**当前**段**不回调** —— 否则「切到当前视图」会白跑一次 `flushSave`（C4 的阻断面）；
 *   ③ `disabled` 走**原生** `disabled`（移出 Tab 序、不派发 click）+ 处理器内**再**门控一次：
 *      `fireEvent.click` 这类**直接派发**的事件不受原生 `disabled` 拦截（先例 = `Button.tsx` 边界②
 *      对 `busy` 的显式 `preventDefault`）⇒ 少一道门就会出现「点了不该有事发生的段却切了视图」；
 *   ④ **零行内 style**（ADR-033 §4）：排版与状态一律由类 / `aria-pressed` 承载，本文件无行内样式。
 */
import { useRef } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { Icon } from "../icons";
import type { IconName } from "../icons";
import "./ViewSwitcher.css";

/** 容器类（组）—— 与 `ViewSwitcher.css` / `style-contract.test.ts` 的枚举三处同名 */
const GROUP_CLASS = "ed-btn-group";
/** 段类：**基类 + 修饰类**（复用 `ed-btn` 基座，见文件头 ★ 类名空间） */
const SEGMENT_CLASS = "ed-btn ed-btn--segment";
/** 段内图标尺寸：取 `ui/icons` 三档里最小的一档（分段控件是工具条密度，与 `.ed-btn--sm` 同量级） */
const ICON_SIZE = 16;

export interface ViewSwitcherOption {
  readonly key: string;
  readonly label: string;
  /** 图标名走 `ui/icons` 注册表（B6 的负判据：不许 emoji、不许裸字符串 —— 拼错名在 `tsc` 层即报错） */
  readonly icon?: IconName;
}

export interface ViewSwitcherProps {
  readonly options: readonly ViewSwitcherOption[];
  /** 受控选中值（= 某个 `option.key`）；与任何 key 都对不上时不崩、退回首项可 Tab（见下） */
  readonly value: string;
  /** 只在**选中值真的变化**时调用（点当前段、以及 `disabled` 时不调用） */
  readonly onChange: (key: string) => void;
  /** 容器的可访问名（**必填**：分段控件的语义不靠视觉，与 `role="group"` 成对） */
  readonly ariaLabel: string;
  /** 异步守卫期间由宿主门控（C4：`flushSave` 失败 ⇒ 不切视图 ⇒ 整组不可用） */
  readonly disabled?: boolean;
  /** 落到根元素的 `data-testid`；不传时不产生该属性 */
  readonly testId?: string;
}

/** 渲染一个受控分段控件。返回 `ReactElement`（React 19 下 `JSX.Element` 取不到，同 `Button.tsx` 先例）。 */
export function ViewSwitcher({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  testId,
}: ViewSwitcherProps): ReactElement {
  /** 每段一个 ref：roving tabindex 的焦点移动必须落到**真实节点**上（不能靠 DOM 查询反推） */
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = options.findIndex((o) => o.key === value);
  // `value` 与任何 option 都对不上（宿主传了脏值 / 记忆被手改成垃圾）时，退回首项可 Tab ——
  // 否则全组 `tabIndex=-1`，键盘用户会被整组挡在 Tab 序之外（比"高亮错了"严重得多）。
  // 注意：**只有 tabindex 回退**，选中态仍严格只认 `value`（`aria-pressed` 不会假报）。
  const tabbableIndex = activeIndex >= 0 ? activeIndex : 0;

  /** 把焦点移到第 index 段（环绕；`length === 0` 时无事可做） */
  const focusAt = (index: number): void => {
    const n = options.length;
    if (n === 0) return;
    refs.current[((index % n) + n) % n]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === "ArrowRight") focusAt(index + 1);
    else if (event.key === "ArrowLeft") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(options.length - 1);
    else return; // 其它键（含 Enter/Space 的激活）交给浏览器与 click 通路
    // 只拦我们处理了的键：不 preventDefault 会让方向键在宿主的滚动容器里**同时滚页面**
    event.preventDefault();
  };

  return (
    <div className={GROUP_CLASS} role="group" aria-label={ariaLabel} data-testid={testId}>
      {options.map((opt, index) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            className={SEGMENT_CLASS}
            aria-pressed={active}
            tabIndex={index === tabbableIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (disabled || active) return;
              onChange(opt.key);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {opt.icon ? <Icon name={opt.icon} size={ICON_SIZE} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
