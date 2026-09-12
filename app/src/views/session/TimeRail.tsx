/**
 * TimeRail — 「时间码回跳」的**共享时间轴尺**（批 6 T25 Step 1 · R5.5 #5）。
 *
 * @ai-context 为什么住在这里（规格 §7.1 依赖方向 + `views/architecture.guard.test.ts` 的 A3③
 *   整目录硬边界）：本件属 `views/**` ⇒ **零 `@tauri-apps`**（含 `import type`）。三条轨共用
 *   **同一条 ms 轴**，但此前只能靠「DOM 顺序」间接表达（批 5 的三轨是并排列、无共享刻度）⇒
 *   本件把那根轴**画出来**：一条横向的刻度尺，总长由调用方派生后传入。
 * @ai-context **总长的真源在调用方**（`SessionTriTrackView.totalMsOf`）：本件只做
 *   「ms → 像素」的换算，**不猜时长**（不发明数字 —— 刻度的唯一来源是 `TICK_MS`）。
 * @ai-context **刻度文案一律经 `fmtMs`**（时间码的唯一出口，与三轨条目同源）：本件不自己实现
 *   一个格式化函数。
 * @ai-context **零 `animation` / 零 `transition` / 零 `z-index`**：本件是**静态**刻度尺
 *   （播放头与降级提示归 T25 的第二步提交/后续动效；「掠过几帧缩略」归 T31）。
 * 副作用：无（纯展示；无 I/O、无订阅、无定时器、无全局状态、无本地 state）。
 * 边界：① `totalMs <= 0` ⇒ 轨道为空但仍在 DOM（轨的缺席与否由调用方决定）；② 刻度是
 *   **定值序列**（`0` 起每 `TICK_MS` 一格）⇒ 与数据规模无关，不随会话长度抖动。
 */
import type { CSSProperties, ReactElement } from "react";
import { Text } from "../../ui/primitives";
import { fmtMs } from "../../utils/fmt";
import "./TimeRail.css";

/** 1 px = 1000 ms（1 秒 1 像素）：判据点 `0 / 52.5 / 90 / 120` px 即 `0 / 52500 / 90000 / 120000` ms */
export const MS_PER_PX = 1000;

/** 刻度间隔（1 分钟一格）—— 刻度的**唯一**来源（不在 JSX 里现写数字） */
export const TICK_MS = 60_000;

/** ms → 轨道内像素（纯换算；本件唯一的 ms → 位置映射） */
export function pxOf(ms: number): number {
  return ms / MS_PER_PX;
}

/** 刻度序列：0 起、每 `TICK_MS` 一格，末格不超出总长（纯函数 ⇒ 可单测、可逐序对拍） */
export function ticksOf(totalMs: number): readonly number[] {
  const out: number[] = [];
  for (let ms = 0; ms <= totalMs; ms += TICK_MS) out.push(ms);
  return out;
}

/** 刻度线自身的定位（布局，不是视觉权威）：横坐标由 `pxOf` 给 */
const TICK_STYLE = (ms: number): CSSProperties => ({ left: pxOf(ms) });

interface Props {
  /** 时间轨总长（毫秒，**会话轴**）—— 真源由调用方派生（`SessionTriTrackView.totalMsOf`） */
  readonly totalMs: number;
}

/** 共享时间轴尺（见文件头）。 */
export default function TimeRail({ totalMs }: Props): ReactElement {
  /** 轨道长度：项目上限 = 总长本身（播放头加入后才会出现「比总长更靠右」的位置） */
  const trackMs = Math.max(totalMs, 0);

  return (
    <div className="ed-timerail" data-testid="session-timerail">
      <div className="ed-timerail__row">
        <Text as="span" size={5} tone="ink-3">{`时间轨 0:00 – ${fmtMs(trackMs)}`}</Text>
      </div>
      <div className="ed-timerail__viewport" data-testid="session-timerail-viewport">
        <div className="ed-timerail__track" style={{ width: pxOf(trackMs) }}>
          {ticksOf(trackMs).map((ms) => (
            <span key={ms} className="ed-timerail__tick" style={TICK_STYLE(ms)} data-tick-ms={ms}>
              <Text as="span" size={5} tone="ink-3">
                {fmtMs(ms)}
              </Text>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
