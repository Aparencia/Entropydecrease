/**
 * @ai-context A′ 顶栏（规格 §1 决策 12/14 与 §6.1；批 3 Task 7）。
 *
 * 形态：品牌 + 8 个域 Tab（线性图标 + 纯文字）+ 右上（⌘K / `right` 插槽 / ⚙ 齿轮）；设置**不下沉为 Tab**。
 *   图标取自 `ui/icons`（批 0-B 交付的自绘线性图标集，规格 §1 决策 5）—— 9 个目的地**全部**有图标，
 *   故 emoji 可以彻底出局（控制方裁决 A2）：≥1180 一档渲染**两个元素**（图标 + 纯文字），
 *   不再出现「图标 + emoji + 文字」的三重冗余。emoji 同时是**测量毒物**（批 3 陷阱 #16：
 *   同一行带 `✨` 在 1024/1180 量到 191/245 px，+28%）⇒ 它不得进入任何宽度预算。
 *
 * 溢出两级（规格 §6.1）：≥1180 图标 + 文字；1024–1179 仅图标 + 悬浮名（`title`）；<1024 由最小窗兜底。
 *   Why 用 CSS 媒体查询而不是 JS 读 `innerWidth`：JS 版要 `useState` + `resize` 监听，每次 resize
 *   都触发 React 重渲染，而这只影响**标签显隐**一件事；CSS 版零 JS、零重渲染、测试环境无 `window`
 *   也能渲染。代价是 jsdom **不计算媒体查询** ⇒ 「1180 以上显示文字」这条在单测里测不到像素，
 *   只能断言**承载该行为的 DOM 与 CSS 声明**（label 元素始终在 + `title` 始终在 + 媒体查询同值），
 *   真正的像素证据由 CDP 探针给（本任务报告 §宽度表）。两处断点数值必须同值，
 *   由 `TopBar.test.tsx` 的守卫断言钉住（CSS 读不到 TS 常量，只能靠断言）。
 *
 * 副作用：无（纯展示；所有交互经 props 回调）。
 * 边界：本组件**不**知道采集状态、也不渲染 AI toast —— 采集徽标/对话面板入口经 `right` 插槽注入，
 *   AI toast 不在顶栏、也不由本组件渲染：它是 App.tsx 的 `MainShell` 最外层一个 fixed 覆盖层
 *   （控制方裁决 A3：它是 1024 溢出的唯一主因，单项 373.75 px = 视口的 36.5%），见 App.tsx 该处注释。
 *   批 3 不加任何动效；批 6 T14 起 `TopBar.css` 的动效禁令**改判为条件式**（只许 token + 落点必须
 *   留在 `motion.css` 元素级回执的覆盖面内；`@keyframes` 与第二条 reduced-motion 块仍禁），
 *   由本文件的同名测试断言（T14 一并更正这条过时标签）。
 */
import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/icons";
import { NAV_ENTRIES, navEntry, type PageKey } from "./navRegistry";
import "./TopBar.css";

export interface TopBarProps {
  page: PageKey;
  onSelect: (key: PageKey) => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  /** 右侧状态区（采集徽标 / 对话面板入口）—— 本组件不读这些状态，由 App 注入 */
  right?: ReactNode;
}

export interface TopBarActionProps {
  testId: string;
  icon: IconName;
  label: string;
  title: string;
  onClick: () => void;
  current?: boolean;
  /** 开合/展开态（如对话面板已开）—— 语义走 `aria-pressed`，视觉走 CSS 同一档 */
  pressed?: boolean;
}

/**
 * 右上区的动作按钮（⌘K / ⚙ 齿轮，以及 App 注入的对话面板入口）。
 *
 * Why 导出它而不是让调用方直接写类名：显隐契约住在 `TopBar.css` 里，调用方不该知道类名。
 * Why 它用**自己的**类（`.ed-topbar__action` / `__action-label`）而不是与域 Tab 共用
 *   `.ed-topbar__tab` / `__tab-label`：两组文字的收起阈值不同（Tab ≤1179 收起，右簇 ≤1399 收起，
 *   见 `breakpoints.ts` 的 `navActionsFull`）。共用一条规则会把 Tab 文字一起藏掉。
 */
export function TopBarAction({ testId, icon, label, title, onClick, current, pressed }: TopBarActionProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="ed-topbar__action"
      title={title}
      aria-current={current ? "page" : undefined}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      <span className="ed-topbar__action-label">{label}</span>
    </button>
  );
}

export function TopBar({ page, onSelect, onOpenSettings, onOpenPalette, right }: TopBarProps) {
  const settings = navEntry("settings");
  return (
    <nav className="ed-topbar" data-testid="topbar" aria-label="主导航">
      <span className="ed-topbar__brand">熵减 · 本地知识提取</span>
      <div className="ed-topbar__tabs">
        {NAV_ENTRIES.map((e) => (
          <button
            key={e.key}
            type="button"
            className="ed-topbar__tab"
            data-testid={`topbar-tab-${e.key}`}
            title={e.label /* 1024–1179 档的「悬浮名」（规格 §6.1 第二级） */}
            aria-current={page === e.key ? "page" : undefined}
            onClick={() => onSelect(e.key)}
          >
            <Icon name={e.icon} size={20} />
            <span className="ed-topbar__tab-label">{e.label}</span>
          </button>
        ))}
      </div>
      <div className="ed-topbar__right">
        <TopBarAction
          testId="topbar-palette"
          icon="search"
          label="Ctrl+K"
          title="命令面板（Ctrl+K）"
          onClick={onOpenPalette}
        />
        {right}
        <TopBarAction
          testId="topbar-settings"
          icon={settings.icon}
          label={settings.label}
          title={settings.label}
          current={page === "settings"}
          onClick={onOpenSettings}
        />
      </div>
    </nav>
  );
}
