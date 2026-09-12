/**
 * SessionTriTrackView — 会话「三轨对齐」视图（C2 的「零新数据面」）。
 *
 * @ai-context 为什么是这三条轨（C2 逐字）：会话三轨 = **转写 / 画面 / OCR 文字**，三份数据
 *   全在 `SessionDetail` 里（`segments` / `screens` / `ocr_blocks`）⇒ **零新数据面、不碰 Rust**
 *   （规格 §3 红线 6）。**「笔记轨」不做**：T1 探针已判「不存在逐段级笔记↔证据关联」
 *   （C17① ⇒ 批 5 笔记侧只交付原文 + 卡片流两种形式）。故本件是「双通道 + 画面的文字面」。
 * @ai-context 依赖方向（规格 §7.1 / C14②）：本件是**纯展示视图** —— 它的第一条判据是
 *   「**不 invoke**」。三条轨与时间轨的**原始数据与一切派生**都从 props 来；本件
 *   **零 `@tauri-apps` import、零 `invoke`、零 `useState`、零取数、零 I/O**（唯一的副作用是
 *   把点击上报给注入的 `onSeekMs`，与 `viewKey`/`onViewKeyChange` 同一种**受控**形态）。
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
 * @ai-context **批 6 T25：时间轨 + 播放头 + 优雅降级（R5.5 #5 的承载面）**。本件在三条轨**之上**
 *   加一条共享的横向时间轨（`TimeRail`；总长的真源见 `totalMsOf`），播放头位置 = 注入槽
 *   `playheadMs`（**唯一真源在容器**）。
 *   🔴 **播放头是受控的**：本件**不自持**第二份播放头状态（T24 的槽位契约逐字「容器负责
 *   `setState` + 播放头动效，**视图自身零副作用**」）⇒ 用户点时间码只经 `onSeekMs` 上报，
 *   位置随下一帧的 `playheadMs` 回来。降级时的「当前聚焦段」指示器因此也由**容器**驱动
 *   —— 不传 `onSeekMs` 的宿主点时间码不会有任何位移（判据 I3 钉住这一点）。
 *   🔴 **音频与可播 URL 一律由容器注入**（`SessionViewSlot.audio`）：本件不取数、不拼 URL
 *   —— `views/**` 是零 Tauri 边（A3③）。🔴 **播放只许 `<audio src>`**：`fetch()` 整取音频会把
 *   约 115 MB/小时读进内存（R5.5-b 约束 2）。🔴 **只有已 finalize 的 WAV 可播**（约束 3）
 *   ⇒ `playable === false` 时播放控件 `disabled` 且出**恰一行** `StatusLine kind="error"`。
 *   🔴 **降级不许崩、不许白屏**：音频不可得 / 加载失败 ⇒ 时间轨仍在 DOM、播放头退化为指示器。
 *   🔴 **精度诚实**：`aligned === false` = 「**不能保证**对齐」（残余 = 块粒度 ±200 ms，R51.2⑧）
 *   ⇒ 文案只说「无时间基准，定位为近似」，**不说**「未对齐 / 未同步」。
 *   ⚠️ **适用范围**：只有实时采集会话有音频；无音频（含导入会话）⇒ 只读时间轨（同一件内二分）。
 *   ⚠️ **不在本件**：真机媒体播放 / seek（本环境不可验证）、`[[ts:ms]]` 的深链（T26）、
 *   「掠过几帧缩略」（T31）。
 * @ai-context 与「印样」视图的边界（计划 Task 8 Step 1 的逐字要求在这里登记）：**本件不渲染图片**。
 *   配图需要容器注入的 `imageUrl()` 槽（本件不接该槽），且「一屏一段区间 + 配图」是印样视图的形态；
 *   三轨对齐只需要「时间 + 这一条是什么」⇒ 画面轨只出 `title`/`body` 文本与区间时间码。
 * @ai-context **批 6 T27：#1「对齐」（R5.1 的形态裁定 = 该动效的定义）**。三轨条目按 `data-ms` 共轴；
 *   **非对齐轨**（画面 / OCR 两条派生轨 —— 🔴 **第三轨 = OCR**，§8.6 的批 5 加注逐字）在错位态各带
 *   ≤8px 的位移偏移，交互（**时间码点击** = 本视图唯一的用户动作）把它们滑到对齐位（`y → 0`），
 *   同 ms 的三个条目**高亮共轴关系**（`ed-tritrack__item--coaligned`）。反向 = 再次触发或切走再回；
 *   可中断 = 新输入接管。编排、两个持有量、三档与 reduced-motion 全在 `useTriTrackAlign.ts` 的文件头。
 *   ⚠️ **视图自身仍零副作用**：位移只由那条 hook 经出口写；本件只加两个 DOM 锚（`data-tone="instrument"`
 *   与两条非参考轨的 ref 登记）与一个**受控**的高亮类（`aligned && item.ms === ms`）。
 * 副作用：无（纯函数式渲染；无 I/O、无订阅、无定时器、无本地 state、无全局单例）。T25 增：
 *   子件 `TimeRail` 的一次元素级滚动写入（DOM 属性，随 `playheadMs` 变化）。
 * 边界：① `detail` 三个数组**都空** ⇒ 整块换成 `EmptyState`（根 `data-testid` 仍在，形态可判）
 *   —— 此时**不出时间轨**（刻度的三个来源全空 ⇒ 轨上无内容可指）；
 *   ② 单轨为空时该轨**照常渲染**（列头在、列内 0 条）—— 「三轨对齐」的语义是「三轨同框」，
 *   缺一条轨不等于整块没内容，故**不用**整块空态顶掉（否则用户看不到"哪一轨是空的"）；
 *   ③ 本件不做虚拟滚动（数据量由容器与产品上限决定；长列表的滚动/密度手感见批 6）。
 */
import type { CSSProperties, ReactElement } from "react";
import { Button, EmptyState, Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";
import type { SessionViewSlot } from "../registry";
import TimeRail from "./TimeRail";
import "./TriTrackAlign.css";
import { useTriTrackAlign } from "./useTriTrackAlign";
// 轨名类型（`data-track` 锚的唯一字面量来源）由编排层持有 ⇒ 两处不各写一份字面量
import type { TrackKey, TriTrackAlign } from "./useTriTrackAlign";

/** 视图的数据面：`detail`（三轨）+ T25 的三个**只读**注入槽（音频 / 播放头 / 上行通道）+ T31 的
 *  `imageUrl`（掠过条的配图槽）。🔴 `imageUrl` **可选**：既有夹具（T1–T5）按 `detail` 单参渲染 ⇒
 *  缺它时**不出掠过条**（稀疏降级），而不是把这条链拉红（`SessionViewSlot` 里它是必填）。 */
type Slot = Pick<SessionViewSlot, "detail" | "audio" | "playheadMs" | "onSeekMs"> & { readonly imageUrl?: SessionViewSlot["imageUrl"] };

/** 三轨的数据面 = 槽里的 `detail` 一项（C14②：其余槽位与三轨无关 ⇒ 三轨仍不可能取数） */
type Detail = Slot["detail"];

/** 转向标记：屏轨的区间用「锚点时间码 – 结束时间码」表达 */
const RANGE_DASH = "–";

/** 转写段的来源标记（`SessionSegment.source`：asr | subtitle | fused）；未知取值原样回显 */
const SOURCE_LABEL: Readonly<Record<string, string>> = { subtitle: "字幕", asr: "语音", fused: "融合" };

/**
 * 布局样式（**只许布局**，ADR-033 §4）：根为纵向（时间轨在上、三轨在下），每列自身纵向排列。
 * 抽成模块常量：同一份对象跨渲染复用，且「改一处即改三轨」。
 */
const ROOT_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
/** 三轨所在的一行（T25 之前它就是根：横向三列、顶对齐） */
const TRACKS_STYLE: CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start" };
const COLUMN_STYLE: CSSProperties = { flex: "1 1 0", minWidth: 0 };
const LANE_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const ITEM_STYLE: CSSProperties = { display: "flex", gap: 6, alignItems: "baseline" };
/** 数字等宽：时间码跨行对齐靠它，不靠 `Text` 的字阶（`fontVariantNumeric` 是排版接缝不是墨度） */
const TIME_STYLE: CSSProperties = { fontVariantNumeric: "tabular-nums", flexShrink: 0 };

/** 条目基类与共轴高亮的修饰类（`<基类>--<修饰>` 形状；规则在 `TriTrackAlign.css`，基类故意无规则）。 */
export const ITEM_CLASS = "ed-tritrack__item";
export const COALIGNED_CLASS = `${ITEM_CLASS}--coaligned`;

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

/**
 * 时间轨总长的**唯一真源**（计划 Task 25 Step 1 + 诚实边界③逐字）。
 *
 * @ai-context 两条口径缺一不可：① 派生值 = `max(segments.end_ms, screens.last_seen_ms,
 *   ocr_blocks.timestamp_ms)`（**数据零新面** —— 三份数据全在 `SessionDetail` 里）；
 *   ② **有音频且有 `durationMs` ⇒ 以 `durationMs` 为准**（`durationMs` 来自 WAV 头、是音频侧的
 *   真源），再**对派生值取大**：音频比末段短时（暂停 / 丢样）单用 `durationMs` 会把条目挤到
 *   轨外 ⇒ 取大是「不丢内容」的兜底，不是第二个真源。
 *   边界：三数组全空 ⇒ 0（此时本件整块走空态，不出时间轨）。
 */
export function totalMsOf(detail: Detail, audio: Slot["audio"]): number {
  const ends = [
    ...detail.segments.map((seg) => seg.end_ms),
    ...detail.screens.map((screen) => screen.last_seen_ms),
    ...detail.ocr_blocks.map((block) => block.timestamp_ms),
  ];
  const derived = ends.reduce((max, ms) => (ms > max ? ms : max), 0);
  const duration = audio === undefined || audio === null || audio.url === null ? null : audio.durationMs;
  return duration === null ? derived : Math.max(duration, derived);
}

/** 一条对齐条目（纯展示：时间码 → 次要信息 → 区间 → 正文；时间码是**定位按钮**） */
function TriTrackItem({ item, onSeek, coaligned }: { readonly item: AlignedItem; readonly onSeek: (ms: number) => void; readonly coaligned: boolean }): ReactElement {
  return (
    <div style={ITEM_STYLE} data-ms={item.ms} className={coaligned ? `${ITEM_CLASS} ${COALIGNED_CLASS}` : ITEM_CLASS}>
      {/* 时间码 = 唯一的「回跳」入口：点它 ⇒ 播放头滑到该段（R5.5 #5 的可见动作）。
          用 `Button` 原语而不是可点 `<div>`：键盘可达与四态由原语保证（§8.6.1 第 4 条）。
          首个文本子节点仍是 `fmtMs` 的输出 ⇒ T5 的时间码判据形态不变。 */}
      <Button size="sm" variant="ghost" onClick={() => onSeek(item.ms)} title={`把播放头移到 ${item.time}`}>
        <Text as="span" size={5} tone="ink-3" style={TIME_STYLE}>
          {item.time}
        </Text>
      </Button>
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

/** 对齐动效的落点登记：只有**非参考轨**需要（转写轨是时间基 ⇒ 不施加偏移，`ref` 为 `undefined`）。 */
function attachOf(align: TriTrackAlign, track: TrackKey): ((el: HTMLElement | null) => void) | undefined {
  return track === "screen" || track === "ocr" ? align.attach[track] : undefined;
}

/**
 * 渲染会话三轨对齐视图 + 时间轨（T25）+#1 对齐动效（T27）。数据全来自 props（`detail` + 三个注入槽）
 * ⇒ 本件不取数、**不自持播放头状态**（受控：点击只上报，位置随 `playheadMs` 回来）。
 */
export default function SessionTriTrackView({ detail, audio, playheadMs, onSeekMs, imageUrl }: Slot): ReactElement {
  const lanes = lanesOf(detail);
  const empty = lanes.every((lane) => lane.items.length === 0);
  // 🔴 hook 在**空态提前返回之前**调用（否则两次渲染的 hook 数不同 ⇒ React 抛错）；空态下两条轨
  //    容器不存在 ⇒ 编排层走「未挂上」分支，**不建时间线**。
  const align = useTriTrackAlign();

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

  /** 时间码点击：**只**经唯一上行口请求容器定位（视图自持状态 = 第二份真源，禁止）+ 触发 #1 对齐 */
  const seek = (ms: number): void => {
    align.trigger(ms); // #1 对齐（R5.1）：对齐 ⇄ 错位由编排层**持有**的 `aligned` 反转
    onSeekMs?.(ms);
  };

  return (
    <div style={ROOT_STYLE} data-testid="session-tritrack-view">
      {/* R5.5 #5 的承载面：共享时间轴尺 + 播放头 + `<audio>` 属性契约 + 降级提示行；T31 起同址接上
          **回跳编排**与**掠过条**（`screens` 与配图槽在此一转即达，视图自身零副作用） */}
      <TimeRail totalMs={totalMsOf(detail, audio)} playheadMs={playheadMs ?? null} audio={audio} onSeekMs={onSeekMs} screens={detail.screens} imageUrl={imageUrl} />
      {/* `data-tone="instrument"` = #1 的基调登记（R3.4 逐字「每个动效落点显式声明基调」） */}
      <div style={TRACKS_STYLE} data-tone="instrument">
        {lanes.map((lane) => (
          <div key={lane.track} style={COLUMN_STYLE}>
            <Text as="p" size={5} tone="ink-3">
              {lane.label}
            </Text>
            {/* 列内**只有条目**：`[data-track]` 的子项数 == 该轨条目数（判据 T1 的锚）；
                两条非参考轨额外挂对齐动效的登记口（`ref`） */}
            <div style={LANE_STYLE} data-track={lane.track} ref={attachOf(align, lane.track)}>
              {lane.items.map((item) => (
                <TriTrackItem key={item.key} item={item} onSeek={seek} coaligned={align.aligned && item.ms === align.ms} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
