/**
 * @ai-context L1 原语：状态行。**错误 / 警告 / 成功 / 信息四档语义的唯一出口**（批 0-D Task 12）。
 *
 * Why：现状错误行 175 行 / 98 文件里三种红并存（recon §2.1 的色值分词：主红 138 次 / 深红 37 次 /
 * 亮红 2 次；本文件不写具体色值 —— 色值只在 tokens 侧），另有 30 行 / 23 文件的错误块底色各自手写；
 * 规格 §5.1 还点名「错误常在列表
 * 最底部（视觉盲区）」。四档语义必须能被**一处**驱动，否则「哪一种红才算错」永远没有答案。
 * 本原语的唯一职责是**语义色的归属与播报时机**（`role`）：它不做排版决策（字阶与墨度属 `Text`，
 * 见边界④），不承载动作（`action` 是纯插槽，见下）。
 *
 * ★ 用色显式契约（控制方 2026-09-11 裁决③ · 规格 §4.1）：
 *   `error → var(--ed-stamp)`（**文字色**）· `warn → var(--ed-due)` · `ok → var(--ed-ok)` ·
 *   `info → var(--ed-ink-3)`。`--ed-stamp` 的真源注释（`app/scripts/gen-tokens.mjs:47` →
 *   `ui/tokens.css:19`）原文是「状态戳 —— 全站唯一非中性色，绝不用于按钮」（规格 §4.1 那一行只写到
 *   「唯一非中性色，只用于状态戳」）⇒ 本原语**不渲染任何按钮**：`action` 是纯 `ReactNode` 槽，
 *   由调用方传入 `Button` 原语节点
 *   （因此本文件**不 import `./Button`** —— 「不能有按钮底色」于是成为**结构保证**而不是纪律：
 *   本原语连一个按钮元素都产不出来）。同向守卫：`StatusLine.css` 里连底色属性名都不出现，
 *   与本原语测试、Task 14 Step 1 第 4 条按**同一判据**扫。
 *
 * 副作用：`import "./StatusLine.css"` —— 首个引入本原语的模块会带上该样式表；类规则只作用于
 * `.ed-status` 元素，现存组件没有该类 ⇒ 批 0-D 期间**界面零变化**（本批不迁移任何调用点）。
 * 组件本身不读 store、不发请求、不写磁盘、**不自建计时器与 presence 状态**（浮现是纯 CSS 接缝）。
 *
 * 边界：
 * ① `role` **二值契约**：`error → role="alert"`（立即播报 = 规格 §8.6.1 第 2 条的「收到了」），
 *    其余三档 → `role="status"`（等当前朗读结束 = 不打断）。两者都**不**额外声明 `aria-live`：
 *    ARIA 里这两个 role 已隐含对应的 live 值，重复声明只会制造第二个真源。
 * ② **颜色不是唯一信号**（§4.3 第 1 条的同款口径）：本原语不上图标、不改字形，语义色只做强化；
 *    「这是什么」必须由 `children` 的**文字**说清（前缀文案 / 图标由调用方给，原语不猜）。
 * ③ **环境层纪律：不抢注意力**（§8.6.1 第 1 条）。本原语不写 `@keyframes`、不做循环动画；
 *    「闲置时也有生命感」的探针落在 `Loading` 的 `Probe`（`ed-probe-swing`），状态行的接缝是
 *    一次性的**浮现 / 消退过渡**（`.ed-status` 的 `transition`，批 6 驱动 `color` / `opacity`）。
 * ④ 只挪语义色、不动布局：`detail` 走 `Text tone="ink-3"`（技术细节不该被语义色染红），
 *    `action` 原样渲染、**不额外包 DOM、不加类**（多包一层就会多一个不在 `motion.css` 名单里的
 *    类名，给 Task 14 的 reduced-motion 覆盖守卫制造假红）。两个槽都不设字号档位之外的样式。
 */

import type { ReactElement, ReactNode } from "react";
import { Text } from "./Text";
import "./StatusLine.css";

/** 四档语义。`error` 与其余三档的差别不止颜色：它还换 `role`（见 `StatusLine` 的边界①）。 */
export type StatusKind = "error" | "warn" | "info" | "ok";

export interface StatusLineProps {
  /** 语义档，默认 `info`（中性档：信息不是警告） */
  kind?: StatusKind;
  /** 主文案：语义色的承载者。**必须自带「这是什么」的文字** —— 颜色不是唯一信号（边界②） */
  children: ReactNode;
  /** 次级说明（技术细节 / 下一步）：走 `ink-3`，不随语义色染红；不传则不渲染该节点 */
  detail?: ReactNode;
  /** 行动槽：由调用方传入按钮等节点（**本原语自己不渲染按钮**，见用色契约）；不传则不渲染 */
  action?: ReactNode;
  /** 落到 `data-testid`；不传时不产生该属性 */
  testId?: string;
}

/**
 * `error` 用 `alert`（立即播报），其余用 `status`（等当前朗读结束）；二者都不再声明 `aria-live`。
 * 抽成函数而不是内联三元：这是契约里唯一一处「档位 → 无障碍语义」的映射，测试与文档都指它。
 */
function roleOf(kind: StatusKind): "alert" | "status" {
  return kind === "error" ? "alert" : "status";
}

/**
 * 渲染一行状态。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 把全局 `JSX` 命名空间收进 `React.JSX`，
 * 直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export function StatusLine({ kind = "info", children, detail, action, testId }: StatusLineProps): ReactElement {
  return (
    <div
      className={`ed-status ed-status--${kind}`}
      role={roleOf(kind)}
      /* 机器可读的语义锚点（测试与批 6 的动效选择器都指它，不必解析类名）：`data-kind` 不参与样式权威 */
      data-kind={kind}
      data-testid={testId}
    >
      {/* 主文案 `tone="inherit"`：语义色由容器的修饰类给，主文案只继承它（不再自己挑一档墨度） */}
      <Text size={5} tone="inherit">
        {children}
      </Text>
      {detail !== undefined ? (
        <Text size={5} tone="ink-3">
          {detail}
        </Text>
      ) : null}
      {action}
    </div>
  );
}
