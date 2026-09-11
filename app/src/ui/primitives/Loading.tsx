/**
 * @ai-context L1 原语：加载三形态 `Loading` / `Skeleton` / `Probe`（批 0-D Task 11）。
 *
 * Why：现状**无加载组件** —— `加载中|正在加载|载入中|Loading` 83 行/31 文件全是逐处手写的灰字
 * （recon §2），长任务（模型下载、级联影响计算）只有一行字，用户看不出"还要等多久/等的是什么"。
 * 规格 §1 第 11 条把加载收敛为**两条判据**，本文件是它唯一的实现落点：
 *
 * | 组件 | 一句话规则 | 现状靶子（批 4 迁移） |
 * |---|---|---|
 * | `Skeleton` | **知道要出现什么形状**（几行/几块）⇒ 用骨架微光占位那个形状 | `GoalDetail.tsx` 的「加载中…」一行灰字 → 3 行骨架 |
 * | `Loading` | **不知道形状，但需要一句文字说明在等什么**（时长未知）⇒ 文案 + 探针 | `ClassroomCapturePanel.tsx`「⏳ 正在下载模型（~650MB）…」 |
 * | `Probe` | **不需要文字的最小单元**：单点脉冲，可嵌按钮/行内，并被 `Loading` 内部复用 | `GroupDeleteConfirm.tsx` 的 `data-testid="group-delete-loading"` 单行灰字 |
 * ⇒ 判定顺序：**先问"形状已知吗"**（是 → `Skeleton`）→ **再问"要文字吗"**（要 → `Loading`）→ 都不要 → `Probe`。
 *
 * 副作用：`import "./Loading.css"` —— 首个引入本原语的模块会带上样式表与**全仓第一批 `@keyframes`**
 * （循环环境动效走 CSS，不占 JS 主线程）。组件本身不读 store、不发请求、不写磁盘、不注册计时器。
 *
 * 边界：① 排版（字号/墨度）**一律交给 `Text`**，本文件不写字号与颜色（`.ed-loading--inline .ed-text`
 * 是"跟随宿主字阶"的唯一例外，且写在 CSS 里）；② 三个组件都是**纯展示**：`Loading`/`Skeleton` 的
 * 无障碍语义分别是 `role="status"` 与 `aria-hidden`（形状是纯视觉信息）；③ `Probe` **恒为装饰**
 * （`aria-hidden`）——它的 `label` 只作鼠标悬停的原生 `title`，需要被朗读的加载态请用 `Loading`；
 * ④ 本层不 import 上层（`components/` `pages/` `hooks/`），组内互引用走相对路径而非 barrel。
 */
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Text } from "./Text";
import "./Loading.css";

export interface LoadingProps {
  /** 说明"在等什么"的文案（ReactNode：模型下载进度这类多行说明可直接传入），默认「加载中…」 */
  label?: ReactNode;
  /** 行内用法（嵌按钮 / 行内文本）：与相邻文字同基线、间隙收窄、标签跟随宿主字阶 */
  inline?: boolean;
  /** 透传到根元素的 `data-testid`（批 4 迁移时保留调用点原有的 testid） */
  testId?: string;
}

export interface SkeletonProps {
  /** 骨架条数，默认 1（`GoalDetail` 这类"三行文字"的靶子传 3） */
  lines?: number;
  /** 每条的宽度，默认 `"100%"`；number 走 px，string 原样（百分比 / calc） */
  width?: number | string;
  /** 每一条的高度（px），默认 12（一行正文的量级） */
  height?: number;
  /** 透传到**整组**容器的 `data-testid`；每条骨架另有 `${testId}-line` 便于计数 */
  testId?: string;
}

export interface ProbeProps {
  /** 仅作原生 `title`（悬停提示）——装饰性元素上的可访问名是死属性，故不写 `aria-label` */
  label?: string;
  /** 透传到单点本身的 `data-testid`（`Probe` 没有包装层） */
  testId?: string;
}

/**
 * 最小单元：单点脉冲（无文字）。恒为装饰，可嵌按钮 / 行内，并被 `Loading` 内部复用。
 *
 * 动效在 `Loading.css` 的 `.ed-probe`：周期 2.4s（环境层 2–6s），幅度 ±2px。
 */
export function Probe({ label, testId }: ProbeProps): ReactElement {
  return <span aria-hidden="true" className="ed-probe" data-testid={testId} title={label} />;
}

/**
 * 不知道形状、但要一句文字说明在等什么（时长未知）。文案 + 探针。
 *
 * `role="status"` 让"内容出现"这件事被读到；探针只是装饰（`aria-hidden`），可读信息全在文案里。
 */
export function Loading({ label = "加载中…", inline = false, testId }: LoadingProps): ReactElement {
  const cls = ["ed-loading", inline ? "ed-loading--inline" : null].filter(Boolean).join(" ");
  return (
    <span className={cls} data-testid={testId} role="status">
      <Probe />
      <Text tone="ink-3">{label}</Text>
    </span>
  );
}

/**
 * 知道要出现什么形状（几行 / 几块）⇒ 用骨架微光占位那个形状。
 *
 * 整组 `aria-hidden`：骨架承载的是**形状**（纯视觉信息），可读语义由调用点的 `Loading` /
 * `role="status"` 提供 —— 批 4 迁移时二者常成对出现，别只留骨架。
 */
export function Skeleton({ lines = 1, width = "100%", height = 12, testId }: SkeletonProps): ReactElement {
  // 防御：lines 为 0 / 负数 / 非有限数时夹到 1 条。夹不住的后果是**空白区** —— 那比"占位"更糟：
  // 空白看起来像"已经加载完了，只是没内容"。
  const count = Number.isFinite(lines) ? Math.max(1, Math.trunc(lines)) : 1;
  const barStyle: CSSProperties = { width, height };
  return (
    <div aria-hidden="true" data-testid={testId}>
      {Array.from({ length: count }, (_, i) => (
        <div
          className="ed-skeleton"
          data-testid={testId ? `${testId}-line` : undefined}
          key={i}
          style={barStyle}
        />
      ))}
    </div>
  );
}
