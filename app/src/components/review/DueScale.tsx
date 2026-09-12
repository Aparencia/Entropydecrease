/**
 * DueScale — 到期刻度的**视觉承载面**（批 6 波 B · R5.4；§8.6 签名动效 #4「刻度生长」的静态形态）。
 *
 * @ai-context: Why 本件存在 —— 复习面今天只有纯文字「共 N 张到期」，「到期刻度」作为**视觉形态**
 *              0 命中（`recon-b` B4 双侧自证：命中 5 行全是 token 用途说明与棘轮台账文字）；
 *              而签名动效 #4 要「生长 / 回缩」，前提是先有一个**可补间的几何量**（刻度长度）。
 *              本件就是那个承载面：长度 = 后端计数；逐段长度 = 单卡间隔。形态是 **div 条阵列**
 *              （不是内联 svg —— `ui/icons/no-inline-svg.test.ts` 明禁新增内联 svg）。
 *              🔴 交付边界：本件**只建静态形态**（承载面 + 数据接线 + 判据）。生长 / 回缩动效归
 *              **T30**（波 C）—— 本件交付时刻度是**静止的**，不许把 #4 说成已交付。
 * @ai-context: 数据真源（各一，且只此两处）：① 段数 = `count_due_cards` 的计数（`due` prop，由调用点
 *              透传 —— 本件**不发 IPC、不二次查询**，全件零 `@tauri-apps` 依赖）；② 逐段间隔 =
 *              `Flashcard.intervalDays`（`intervals` prop）。🔴 **禁止自造间隔**：本件不解析
 *              `stateJson`、不用 `dueAt` 做差分、不按字符数折算（R5.4 明文禁止 + AGENTS.md
 *              「不发明数字」）。缺 `intervals` ⇒ 只画计数刻度，**不猜、不插值、不假装精确**。
 * @ai-context: 双精度域（PB2 裁决 —— 两个域**不许混为一谈**）：`intervalDays` 只有两个合法来路 ——
 *              ① 行派生路径（`list_due_cards` 等 5 个查询方法，`row_to_card` 由 `due_at − lastReviewMs`
 *              反推）= **整天粒度**（`granularity="day"`，本件缺省；标签一律带「约…整天粒度」）；
 *              ② `review_card` 返回体 = **精确值**（`granularity="exact"`，由 T30 接线）。
 *              把整天值当精确值展示 = 标签说谎（批 3 A5 先例）。
 * @ai-context: 环境层第 ④ 件「到期刻度微光」的**真实落点**：刻度底轨带
 *              `ed-surface--due-glow`（T13 落的 seam，`motion.css:184`；它的 `color: var(--ed-due)`
 *              是 R4.5 琥珀族的**唯一**来源 —— 本件不写任何琥珀字面量，段色取 `currentColor` 继承）。
 *              基类 `ed-surface` 与它同元素（同 `ed-text--low-confidence` 的用法）；本件**不**用
 *              `<Surface>` 原语，因为新调用点要登记进 `surfaceResidual.ts`（本任务禁碰棘轮表）。
 * 副作用：**无**（纯展示：不读 store、不发 IPC、不写盘、无定时器、无 effect、无 GSAP）。
 * 边界：① `due === 0` ⇒ 渲染**空刻度**（不落空态文案 —— 空态归调用点 `ReviewPage`）；
 *      ② `intervals[i] <= 0`（新卡 / 无复习记录）⇒ 画「无间隔」档，**不是** 0 长度（0 长度会让
 *      「新卡」与「这段不存在」不可分）；③ `intervals` 短于 `due`（后端队列上限 200 < 全量到期数）
 *      ⇒ 缺位段同样走「无间隔」档：「不在本轮队列里」≠「间隔为 0」，本件不替后端猜；
 *      ④ 段数多时靠 flex 压缩与裁切，**不省略 DOM 段** —— 段数恒等于 `due`（那正是判据 V1）。
 *      ⑤ 零裸 `<button>`（纯展示；`components/**` 在 `nativeButton` 棘轮域内）。
 */
import type { CSSProperties, ReactElement } from "react";

export interface DueScaleProps {
  /** 到期卡张数（来自 count_due_cards；**唯一**的"有多少"真源） */
  readonly due: number;
  /** 本轮队列的间隔（可选；来自 list_due_cards 的 intervalDays，整天粒度） */
  readonly intervals?: readonly number[];
  readonly testId?: string;
  /**
   * 间隔值的精度域。缺省 `day` = 行派生路径的**整天粒度**（PB2 ②域）；`exact` 只许接
   * `review_card` 返回体的**精确值**（PB2 ①域）。两个域**不得**互相冒充。
   */
  readonly granularity?: "day" | "exact";
}

/** 「无间隔」档的段高（px）—— 新卡 / 间隔 0 / 不在本轮队列内。**视觉常量，不是数据真源**。 */
const TICK_NONE_PX = 6;
/** 按天刻度的段高区间：1 天 ⇒ 8px，`TICK_DAY_CAP` 天及以上 ⇒ 28px（单调不减 ⇒ 间隔越长刻度越长）。 */
const TICK_DAY_MIN_PX = 8;
const TICK_DAY_MAX_PX = 28;
/** 封顶天数：再长的间隔不再变高 —— 刻度要的是「可感觉」，不是「可测量」（不发明数字）。 */
const TICK_DAY_CAP = 30;

/** 段高的档位名（DOM 锚点：判据与后续动效读它，不读内联样式的像素值）。 */
function tickTier(days: number | undefined): "none" | "day" {
  return days === undefined || !Number.isFinite(days) || days <= 0 ? "none" : "day";
}

/** 一段刻度的**视觉长度**（px）。`days <= 0` 或未知 ⇒ 「无间隔」档的定长（**不是** 0 长度）。 */
function tickHeight(days: number | undefined): number {
  if (tickTier(days) === "none") return TICK_NONE_PX;
  const capped = Math.min(days as number, TICK_DAY_CAP);
  return Math.round(TICK_DAY_MIN_PX + ((capped - 1) / (TICK_DAY_CAP - 1)) * (TICK_DAY_MAX_PX - TICK_DAY_MIN_PX));
}

/** 段的悬停读数。精度域在这里也必须如实（`day` ⇒ 带「约」与「整天粒度」）。 */
function tickLabel(index: number, days: number | undefined, granularity: "day" | "exact"): string {
  const head = `第 ${index + 1} 段`;
  if (tickTier(days) === "none") return `${head} · 无间隔记录（新卡或不在本轮队列）`;
  return granularity === "exact" ? `${head} · ${days} 天` : `${head} · 约 ${days} 天（整天粒度）`;
}

/**
 * 渲染到期刻度尺。返回 `ReactElement`（React 19 下不写全局 `JSX.Element`）。
 *
 * 刻度底轨的琥珀来自 `ed-surface--due-glow` 的 `color: var(--ed-due)`（R4.5 的唯一合法来源）。
 */
export default function DueScale({ due, intervals, testId, granularity = "day" }: DueScaleProps): ReactElement {
  // 段数 = 计数（防御：非有限值 / 负数 / 小数一律按 0 段或截断处理 —— 不 panic、不造幽灵段）
  const count = Number.isFinite(due) ? Math.max(0, Math.trunc(due)) : 0;
  const queueMarks = Math.min(intervals?.length ?? 0, count);
  const label = count === 0
    ? "到期刻度：当前范围 0 张到期（空刻度）"
    : `${count} 张到期刻度的刻度尺 · 队列 ${queueMarks} 张带间隔（${granularity === "exact" ? "精确值" : "整天粒度"}）`;
  const lane: CSSProperties = {
    display: "flex", alignItems: "flex-end", gap: 2, height: TICK_DAY_MAX_PX + 8,
    padding: "4px 6px", overflow: "hidden",
  };
  const tick: CSSProperties = {
    flex: "1 1 0", minWidth: 1, maxWidth: 5, background: "currentColor", borderRadius: 1,
  };
  return (
    <div data-testid={testId} data-due={count} data-granularity={granularity} title={label} role="img" aria-label={label}>
      {count > 0 && (
        <div className="ed-surface ed-surface--sunken ed-surface--due-glow" style={lane}>
          {Array.from({ length: count }, (_, i) => {
            const days = intervals?.[i];
            return (
              <span
                key={i}
                data-tick={i}
                data-tier={tickTier(days)}
                data-interval={days === undefined ? undefined : String(days)}
                title={tickLabel(i, days, granularity)}
                style={{ ...tick, height: tickHeight(days) }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
