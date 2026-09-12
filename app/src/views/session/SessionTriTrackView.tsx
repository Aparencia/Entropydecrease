/**
 * SessionTriTrackView — 会话「三轨对齐」视图（C2 的「零新数据面」）。
 *
 * @ai-context 为什么是这三条轨（C2 逐字）：会话三轨 = **转写 / 画面 / OCR 文字**，三份数据
 *   全在 `SessionDetail` 里（`segments` / `screens` / `ocr_blocks`）⇒ **零新数据面、不碰 Rust**
 *   （规格 §3 红线 6）。**「笔记轨」不做**：T1 探针已判「不存在逐段级笔记↔证据关联」
 *   （C17① ⇒ 批 5 笔记侧只交付原文 + 卡片流两种形式）。故本件是「双通道 + 画面的文字面」。
 * @ai-context 依赖方向（规格 §7.1 / C14②）：本件是**纯展示视图** —— 它的第一条判据是
 *   「**不 invoke**」。三条轨的**原始数据与一切派生**都从 props 的 `detail` 来；本件
 *   **零 `@tauri-apps` import、零 `invoke`、零 `useState`/`useEffect`、零取数、零 I/O**。
 * @ai-context 对齐口径（计划 Task 7 Step 1 写死）：三条轨共用**同一条 ms 轴**，逐轨按 ms 升序；
 *   同一 ms 时 DOM 顺序固定 **转写 → 画面 → OCR**（判据用 `compareDocumentPosition` 钉住）。
 *   轨的时间锚 = `segments.start_ms` / `screens.first_seen_ms` / `ocr_blocks.timestamp_ms`。
 * @ai-context `ocr_blocks` 的归属：沿用 `useSessionDetailData` 已有的「屏 → 块」语义
 *   （`timestamp_ms ∈ [first_seen_ms, last_seen_ms)`），**但本视图只做时间对齐展示、不做分组**
 *   —— 分组结果由容器以 `ocrBlocksByScreen` 注入（那是「卡片流」视图的消费面），本件只用
 *   `ocr_blocks` 的 `timestamp_ms` 这一个字段。重复分组会造出第二份真源。
 * @ai-context 棘轮口径（控制方插播裁决：**新文件必须在"创建时"就干净**，不许改 `*Baseline.ts`）：
 *   ① 排版一律走 L1 原语 —— 文案用 `Text` 的**六档字阶**（本件只取 4/5 两档，全部 ≥12px）与
 *      墨度档（`ink-2` 正文 / `ink-3` 弱化），故本件 0 处 `#9ca3af`、0 处裸 `fontSize`；
 *   ② 空态走 `EmptyState` 原语（**不写裸灰字**）⇒ `emptyStateRatchet` 域内 0 命中；
 *   ③ 行内 `style` **只用于布局**（flex / gap / 宽度 / 数字对齐），不覆盖任何原语语义
 *      —— ADR-033 §4；本件无 `Surface`（无边框/底色需求，不为一层底而引入原语）；
 *   ④ 零交互 ⇒ 0 个 `<button>`（`nativeButton.ratchet` 域含 `views/**`）。
 * @ai-context 与「印样」视图的边界（计划 Task 8 Step 1 的逐字要求在这里登记）：**本件不渲染图片**。
 *   配图需要容器注入的 `imageUrl()` 槽（本件不接该槽），且「一屏一段区间 + 配图」是印样视图的形态；
 *   三轨对齐只需要「时间 + 这一条是什么」⇒ 画面轨只出 `title`/`body` 文本与区间时间码。
 * 副作用：无（纯函数式渲染；无 I/O、无订阅、无定时器、无全局单例）。
 * 边界：① `detail` 三个数组**都空** ⇒ 整块换成 `EmptyState`（根 `data-testid` 仍在，形态可判）；
 *   ② 单轨为空时该轨**照常渲染**（列头在、列内 0 条）—— 「三轨对齐」的语义是「三轨同框」，
 *   缺一条轨不等于整块没内容，故**不用**整块空态顶掉（否则用户看不到"哪一轨是空的"）；
 *   ③ 本件不做虚拟滚动（数据量由容器与产品上限决定；长列表的滚动/密度手感见批 6）。
 */
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";
import type { SessionViewSlot } from "../registry";

/** 三轨的轨名（DOM 锚点 `data-track` 与纵向固定序的唯一字面量来源） */
type TrackKey = "transcript" | "screen" | "ocr";

/** 视图的数据面 = 视图槽的 `detail` 一项（C14②：其余槽位不接 ⇒ 不可能取数） */
type Detail = SessionViewSlot["detail"];

/** 转向标记：屏轨的区间用「锚点时间码 – 结束时间码」表达 */
const RANGE_DASH = "–";

/** 转写段的来源标记（`SessionSegment.source`：asr | subtitle | fused）；未知取值原样回显 */
const SOURCE_LABEL: Readonly<Record<string, string>> = { subtitle: "字幕", asr: "语音", fused: "融合" };

/**
 * 布局样式（**只许布局**，ADR-033 §4）：根为横向三列、每列自身纵向排列。
 * 抽成模块常量：同一份对象跨渲染复用，且「改一处即改三轨」。
 */
const ROOT_STYLE: CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start" };
const COLUMN_STYLE: CSSProperties = { flex: "1 1 0", minWidth: 0 };
const LANE_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const ITEM_STYLE: CSSProperties = { display: "flex", gap: 6, alignItems: "baseline" };
/** 数字等宽：时间码跨行对齐靠它，不靠 `Text` 的字阶（`fontVariantNumeric` 是排版接缝不是墨度） */
const TIME_STYLE: CSSProperties = { fontVariantNumeric: "tabular-nums", flexShrink: 0 };

/**
 * 时间码**唯一出口**：一律经 `fmtMs`（`utils/fmt.ts`）。
 * Why 单独一个函数而不是就地写 `fmtMs(...)`：判据 T5 钉的是「条目上的时间码与 `fmtMs` 逐字一致」
 * —— 三个轨若各写各的表达式，「自己实现一个格式化」就只需改一处而不被察觉；这里把它收成**一个**
 * 可变异点（变异体 M5 即替换本函数体）。
 */
function timeOf(ms: number): string {
  return fmtMs(ms);
}

/** 一条对齐条目：三轨同构（ms 轴 + 时间码 + 正文 + 可选次要信息/区间） */
interface AlignedItem {
  readonly key: string;
  /** 对齐锚（= `data-ms`）：三轨共用同一条轴 */
  readonly ms: number;
  /** 锚点时间码（**已是 `fmtMs` 的输出**，不在渲染处再格式化） */
  readonly time: string;
  readonly text: string;
  /** 次要信息（转写来源 / OCR 分数），无则不渲染该节点 */
  readonly meta?: string;
  /** 区间尾码（仅画面轨：`– ${fmtMs(last_seen_ms)}`） */
  readonly range?: string;
}

/** 一条轨：`track` 决定 DOM 锚点，`items` 已按 ms 升序（渲染层不再排序） */
interface Lane {
  readonly track: TrackKey;
  readonly label: string;
  readonly items: readonly AlignedItem[];
}

/** 按 ms 升序（同 ms 保持源数组次序 —— 稳定排序，避免同屏多块时顺序抖动） */
function ascending(a: AlignedItem, b: AlignedItem): number {
  return a.ms - b.ms;
}

/** 一段：锚 `start_ms`，正文为转写文本，次要信息为来源标记 */
function segmentItem(seg: Detail["segments"][number], index: number): AlignedItem {
  return {
    key: `transcript-${seg.id}-${index}`,
    ms: seg.start_ms,
    time: timeOf(seg.start_ms),
    text: seg.text,
    meta: SOURCE_LABEL[seg.source] ?? seg.source,
  };
}

/** 一屏：锚 `first_seen_ms`，区间到 `last_seen_ms`；**不渲染配图**（见文件头） */
function screenItem(screen: Detail["screens"][number], index: number): AlignedItem {
  const title = screen.title === null ? "" : screen.title.trim();
  return {
    key: `screen-${screen.screen_id ?? index}-${index}`,
    ms: screen.first_seen_ms,
    time: timeOf(screen.first_seen_ms),
    text: title === "" ? screen.body.join(" ") : title,
    range: `${RANGE_DASH} ${timeOf(screen.last_seen_ms)}`,
  };
}

/** 一块 OCR：锚 `timestamp_ms`，次要信息为识别分（两位小数；分数是 0..1 的置信度） */
function ocrItem(block: Detail["ocr_blocks"][number], index: number): AlignedItem {
  return {
    key: `ocr-${block.id}-${index}`,
    ms: block.timestamp_ms,
    time: timeOf(block.timestamp_ms),
    text: block.text,
    meta: block.score.toFixed(2),
  };
}

/**
 * 纯派生：`detail` → 三条**已排序**的轨（**返回顺序即 DOM 顺序**：转写 → 画面 → OCR）。
 * 契约写在这一个函数里：交换返回数组里任意两项 ⇒ 判据 T2 必红。
 */
function lanesOf(detail: Detail): readonly Lane[] {
  const transcript = detail.segments.map(segmentItem).sort(ascending);
  const screens = detail.screens.map(screenItem).sort(ascending);
  const ocr = detail.ocr_blocks.map(ocrItem).sort(ascending);
  return [
    { track: "transcript", label: "转写", items: transcript },
    { track: "screen", label: "画面", items: screens },
    { track: "ocr", label: "OCR 文字", items: ocr },
  ];
}

/** 一条对齐条目（纯展示：时间码 → 次要信息 → 区间 → 正文） */
function TriTrackItem({ item }: { readonly item: AlignedItem }): ReactElement {
  return (
    <div style={ITEM_STYLE} data-ms={item.ms}>
      <Text as="span" size={5} tone="ink-3" style={TIME_STYLE}>
        {item.time}
      </Text>
      {item.meta === undefined ? null : (
        <Text as="span" size={5} tone="ink-3">
          {item.meta}
        </Text>
      )}
      {item.range === undefined ? null : (
        <Text as="span" size={5} tone="ink-3">
          {item.range}
        </Text>
      )}
      <Text as="span" size={4} tone="ink-2">
        {item.text}
      </Text>
    </div>
  );
}

/**
 * 渲染会话三轨对齐视图。数据全来自 `detail`（props 注入）⇒ 本件不取数、不持有状态。
 */
export default function SessionTriTrackView({ detail }: Pick<SessionViewSlot, "detail">): ReactElement {
  const lanes = lanesOf(detail);
  const empty = lanes.every((lane) => lane.items.length === 0);

  // 全空 ⇒ 走 `EmptyState` 原语（不是裸灰字）：`emptyStateRatchet` 与「不写裸色值」两条同时成立
  if (empty) {
    return (
      <EmptyState
        testId="session-tritrack-view"
        icon="sessions"
        title="本会话三轨无内容"
        description="本会话没有转写段、画面要点屏或 OCR 块；切到「原文」视图可查看会话的原始记录。"
      />
    );
  }

  return (
    <div style={ROOT_STYLE} data-testid="session-tritrack-view">
      {lanes.map((lane) => (
        <div key={lane.track} style={COLUMN_STYLE}>
          <Text as="p" size={5} tone="ink-3">
            {lane.label}
          </Text>
          {/* 列内**只有条目**：`[data-track]` 的子项数 == 该轨条目数（判据 T1 的锚） */}
          <div style={LANE_STYLE} data-track={lane.track}>
            {lane.items.map((item) => (
              <TriTrackItem key={item.key} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
