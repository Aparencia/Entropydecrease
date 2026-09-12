/**
 * TimeRail — 「时间码回跳」的**承载面**（批 6 T25 · R5.5 #5 / R5.5-b）。
 *
 * @ai-context 为什么住在这里（规格 §7.1 依赖方向 + `views/architecture.guard.test.ts` 的 A3③
 *   整目录硬边界）：本件属 `views/**` ⇒ **零 `@tauri-apps`**（含 `import type`）。音频引用与
 *   可播 URL 全由容器经注入槽给（`SessionViewSlot.audio`）；本件**不取数、不拼 URL、不 invoke**。
 * @ai-context **播放只许 `<audio src>`**（R5.5-b 约束 2）：不带 `Range` 的 200 分支会
 *   `Vec::with_capacity(len)` + `read_to_end` ⇒ 整段 WAV（约 115 MB/小时）进内存
 *   ⇒ `app/src/**` **不得**对音频出现 `fetch(`。这是硬守卫（见 `TimeRail.test.tsx` 的 V6）。
 * @ai-context **只有已 finalize 的 WAV 可播**（约束 3：WAV 头的 `data` 长度创建时写 0，
 *   `finalize()` 是唯一回填点）⇒ `playable === false`（录制中 / 时长未知）时播放控件禁用，
 *   并出**恰一行** `StatusLine kind="error"`（**不是** toast）。
 * @ai-context **优雅降级三条支路**（音频不可得 / 尚未 finalize / 加载失败）⇒ ① **时间轨仍可用**
 *   （刻度尺照出）；② 播放头退化为「当前聚焦段」指示器（根 `data-degraded="true"`）；
 *   ③ **恰一行** `StatusLine kind="error"`。三条支路的文案见 `noticeOf`（唯一来源）。
 * @ai-context **精度诚实**：`aligned === false` 的语义是「**不能保证**对齐」（残余 = **块粒度
 *   ±200 ms**，R51.2⑧）⇒ 文案只能是「无时间基准，定位为近似」，**不得**写成「未对齐 / 未同步」
 *   （`## 陷阱` B9-① 的「标签不许说谎」）。
 * @ai-context **播放头定位用元素级滚动**：`scrollLeftFor`（ms → 像素 → 滚动量）+ `scrollToLeft`
 *   （元素级唯一出口）。**不用 `window` 目标** —— 尖刺实测其在 jsdom 抛
 *   `Not implemented: Window's scrollTo()`、读数恒 0。⚠️ 本轮实测（T25）：jsdom **没有**
 *   `Element.prototype.scrollTo`（`typeof === "undefined"`）⇒ `scrollToLeft` 先试标准方法、
 *   缺失时退回 `scrollLeft` 赋值（元素级唯一可测形态；两条都不碰 `window`）。
 * @ai-context **诚实边界（不得越界声称）**：asset 协议下的**真实播放 / seek 在本环境不可验证**
 *   （jsdom 无媒体栈、headless Edge 不说 `asset:` 协议、真机/WebView2 用户已裁决跳过）⇒ 本件
 *   只交付**属性契约**（`src` / `preload` / `onTimeUpdate` 绑定）与纯换算，**不声称**
 *   「播放已可用」「seek 已验证」。
 * 副作用：一次元素级滚动写入（DOM 属性）+ 一次 `<audio>` 播放请求（用户点击时才发生）。
 *   无 I/O、无定时器、无订阅、无全局状态。
 * 边界：① `playheadMs === null` ⇒ **不渲染**播放头（不猜位置）；② `totalMs <= 0` ⇒ 轨道空但仍在
 *   DOM；③ 总长的真源由调用方派生（见 `SessionTriTrackView.totalMsOf`），本件只做 ms → 像素换算。
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement, SyntheticEvent } from "react";
import { Button, StatusLine, Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";
import type { SessionViewSlot } from "../registry";
import "./TimeRail.css";

/** 1 px = 1000 ms（1 秒 1 像素）：判据点 `0 / 52.5 / 90 / 120` px 即 `0 / 52500 / 90000 / 120000` ms */
export const MS_PER_PX = 1000;

/** 刻度间隔（1 分钟一格）—— 刻度的**唯一**来源（不在 JSX 里现写数字） */
export const TICK_MS = 60_000;

/** 无时间基准的如实提示（R51.2⑧：块粒度 ±200 ms ⇒ **不得**声称毫秒级定位） */
export const NOT_ALIGNED_NOTE =
  "本录音无时间基准，定位为近似（对齐精度为块粒度 ±200 ms，不承诺毫秒级定位）。";

/** ms → 轨道内像素（纯换算；本件唯一的 ms → 位置映射） */
export function pxOf(ms: number): number {
  return ms / MS_PER_PX;
}

/** 播放头要滚到的位置：把播放头送到视口中央（`viewportPx` = 滚动容器的 `clientWidth`） */
export function scrollLeftFor(ms: number, viewportPx: number): number {
  return Math.max(0, pxOf(ms) - Math.max(0, viewportPx) / 2);
}

/**
 * 元素级滚动的**唯一出口**（判据 V1 指向它）。
 *
 * @ai-context Why 两条分支：`Element.prototype.scrollTo` 是标准面（生产/WebView2 走它），
 *   而 jsdom **不具备**它（本轮实测）⇒ 缺失时退回 `scrollLeft` 赋值 —— 那不是「为测试开的后门」，
 *   而是尖刺实测里**唯一**逐点精确的元素级写入形态（`0/52.5/90/120`）。两条分支都**不碰 `window`**。
 */
export function scrollToLeft(el: Element, left: number): void {
  const scroller = el as Element & { scrollTo?: (options: { left: number }) => void };
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ left });
    return;
  }
  scroller.scrollLeft = left;
}

/** 刻度序列：0 起、每 `TICK_MS` 一格，末格不超出总长（纯函数 ⇒ 可单测、可逐序对拍） */
export function ticksOf(totalMs: number): readonly number[] {
  const out: number[] = [];
  for (let ms = 0; ms <= totalMs; ms += TICK_MS) out.push(ms);
  return out;
}

/**
 * 降级 / 如实提示的**唯一来源**（恰一行；`null` = 不出提示行）。
 *
 * @ai-context 优先级 = 加载失败 → 无音频 → 尚未 finalize → 无时间基准。四条互斥 ⇒ 任何时刻
 *   **至多一行**（判据 V3/V5 的「恰 1 个 error」就靠这条构造性保证）。`undefined`（尚未取到）
 *   **不出**提示 —— 那不是失败，谎报会让每次挂载都闪一行红。`aligned` 只在「有音频、可定位」
 *   时才追加说明（无音频时说「无时间基准」是噪音）。
 */
export function noticeOf(audio: SessionViewSlot["audio"], loadFailed: boolean): string | null {
  if (audio === undefined || audio === null) return null;
  const tail = audio.aligned ? "" : ` ${NOT_ALIGNED_NOTE}`;
  if (audio.url === null) return "本会话没有音频（导入会话的音轨不留存）：时间轨可读，播放头指示当前聚焦段。";
  if (loadFailed) return `音频加载失败：时间轨仍可用，播放头指示当前聚焦段。${tail}`;
  if (!audio.playable) return `本会话音频未 finalize（录制中或时长未知）：播放已禁用。${tail}`;
  if (!audio.aligned) return NOT_ALIGNED_NOTE;
  return null;
}

interface Props {
  /** 时间轨总长（毫秒，**会话轴**）—— 真源由调用方派生（`SessionTriTrackView.totalMsOf`） */
  readonly totalMs: number;
  /** 播放头位置（毫秒，会话轴）；`null` = 不渲染播放头（不猜位置） */
  readonly playheadMs: number | null;
  /** 音频引用（注入槽原值；`undefined` = 尚未取到 —— 与「无音频」不同形） */
  readonly audio: SessionViewSlot["audio"];
  /** 上行通道（**唯一**）：播放进度回报。容器负责把它变成下一次 `playheadMs` */
  readonly onSeekMs?: (ms: number) => void;
}

/** 时间轨 + 播放头 + `<audio>` 属性契约 + 降级提示行（见文件头）。 */
export default function TimeRail({ totalMs, playheadMs, audio, onSeekMs }: Props): ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const url = audio === undefined || audio === null ? null : audio.url;
  // 只有已 finalize 的 WAV 可播（R5.5-b 约束 3）；加载失败走**同一条**降级 ⇒ 播放控件禁用
  const playable = url !== null && audio?.playable === true && !loadFailed;
  const notice = noticeOf(audio, loadFailed);
  /** 轨道长度：总长与播放头取大 ⇒ 标记永不落在轨道外（播放头是注入值，不许被裁掉） */
  const trackMs = Math.max(totalMs, playheadMs ?? 0, 0);

  // 播放头定位：**元素级**（R5.5 的判据边界）；`null` ⇒ 不动
  useEffect(() => {
    const el = viewportRef.current;
    if (el === null || playheadMs === null) return;
    scrollToLeft(el, scrollLeftFor(playheadMs, el.clientWidth));
  }, [playheadMs]);

  /** 播放进度回报：秒 → 毫秒（四舍五入；**不假装**亚毫秒精度），走槽位里唯一的上行口 */
  const onTimeUpdate = (event: SyntheticEvent<HTMLAudioElement>): void => {
    onSeekMs?.(Math.round(event.currentTarget.currentTime * 1000));
  };

  /** 播放：媒体栈缺失（jsdom）或加载失败都走**同一条降级**（不吞错、不把异常抛到渲染层） */
  const play = (): void => {
    const el = audioRef.current;
    if (el === null) return;
    void Promise.resolve(el.play()).catch(() => setLoadFailed(true));
  };

  return (
    <div className="ed-timerail" data-testid="session-timerail" data-degraded={playable ? "false" : "true"}>
      <div className="ed-timerail__row">
        {/* 播放控件：不可播（录制中 / 加载失败 / 无音频）⇒ 原生 `disabled` */}
        <Button size="sm" variant="ghost" disabled={!playable} onClick={play} testId="session-timerail-play">
          播放
        </Button>
        <Text as="span" size={5} tone="ink-3">{`时间轨 0:00 – ${fmtMs(trackMs)}`}</Text>
      </div>
      {/* 🔴 唯一合法消费形态：`<audio src>`。**禁止 `fetch()` 整取音频**（R5.5-b 约束 2） */}
      {url === null ? null : (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onTimeUpdate={onTimeUpdate}
          onError={() => setLoadFailed(true)}
          data-testid="session-timerail-audio"
        />
      )}
      {/* 降级 / 如实提示：**恰一行** `StatusLine kind="error"`（不是 toast —— R5.5-b 逐字） */}
      {notice === null ? null : (
        <StatusLine kind="error" testId="session-timerail-notice">
          {notice}
        </StatusLine>
      )}
      <div className="ed-timerail__viewport" ref={viewportRef} data-testid="session-timerail-viewport">
        <div className="ed-timerail__track" style={{ width: pxOf(trackMs) }}>
          {ticksOf(trackMs).map((ms) => (
            <span key={ms} className="ed-timerail__tick" style={{ left: pxOf(ms) }} data-tick-ms={ms}>
              <Text as="span" size={5} tone="ink-3">
                {fmtMs(ms)}
              </Text>
            </span>
          ))}
          {/* 播放头：`data-ms` = 注入值**逐字**（判据 V2 的锚点） */}
          {playheadMs === null ? null : (
            <span
              className="ed-timerail__mark"
              style={{ left: pxOf(playheadMs) }}
              data-ms={playheadMs}
              data-testid="session-timerail-playhead"
            >
              <Text as="span" size={5} tone="ink-3">
                {fmtMs(playheadMs)}
              </Text>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
