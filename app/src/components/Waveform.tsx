/**
 * Waveform — 采集态 LIVE 仪表的**波形读数**（规格 §6.3；裁决 R4.3；批 6 Task 18 Step 1）。
 *
 * @ai-context Why：§6.3 逐字「采集态 = 58px **LIVE 仪表**（波形 + 计时 + 暂停/标记/停止）」，
 *   而改造前全仓「波形 / waveform」**0 命中** —— 只有 `components/AudioLevelMeter.tsx`（88 行）的
 *   12 段离散色块。本件补上「读数」的那一半：`rms` 决定点亮条数（对数映射，与那张 VU 表同口径），
 *   `clipping` 决定右端热区是否染成状态戳色。**新建而不改既有组件**：动 `AudioLevelMeter` 的 DOM
 *   会连带三处棘轮台账（`statusLineBaseline` 3 / `surfaceBaseline` 1 / `textBaseline` 3，R4.3 逐字）。
 * @ai-context ★ 为什么是 div 条阵列而不是别的画法（R4.3 逐字「用 div 条阵列建，**禁止** SVG」）：
 *   `ui/icons/` 的 no-inline-svg 守卫是**全文件文本扫描**型（连注释一起扫）⇒ 本文件与同名测试里
 *   提到那个标签时必须用**拼接写法**（"<" + "svg"），否则守卫会在**文字**上假红 —— 本批已三犯的
 *   「注释/测试名里的字面量骗过整文件扫描器」陷阱家族（DISPATCH-TEMPLATE §二 点名提醒过）。
 * @ai-context 副作用：**无**。纯受控展示件：零 IPC / 零 store / 零计时器 / 零磁盘 —— 连
 *   `@tauri-apps/api` 都不 import。订阅 `live:audio-level` 的是容器（`shell/LiveBar.tsx`）。
 * @ai-context 边界：① `rms` 一律**夹取**：非有限值（NaN / ±Infinity）或 ≤0 ⇒ 0 条点亮；≥0dB ⇒ 满格
 *   —— 永不抛、永不把 NaN 漏进 `style`；② `bars <= 0` ⇒ 不渲染任何条（显式归零，不让负值流进 flex
 *   计算）；③ 颜色**零字面量**，一律 `var(--ed-*)`（与 `views/session/SessionCardFlowView.tsx` 同一
 *   纪律：色值只在 `ui/tokens.css` 与生成器里）；④ 动效接缝（ADR-033 §4 允许的用途）只声明
 *   `background` 的 micro 档 token 过渡 —— **几何不做 transition**（§8.4「宽度本身不做 transition」）。
 */
import type { CSSProperties, ReactElement } from "react";

/** 条数默认值：58px 条里排得开，且与后端每音频块 200ms 的推送节奏相称。 */
export const WAVEFORM_BARS = 32;
/** 高度默认值（px）。纯布局量 —— 进 `style` 正是 ADR-033 §4 允许的用途。 */
export const WAVEFORM_HEIGHT = 30;
/** 削波热区条数 = 右端两段（与 `AudioLevelMeter` 的末两段同口径，两件并存时读数一致）。 */
export const WAVEFORM_CLIP_BARS = 2;
/** 映射下界 = -60dB（RMS 0.001）以下算静音；上界 0dB = 满格。与既有 VU 表同口径。 */
export const WAVEFORM_FLOOR_DB = -60;
/**
 * `Math.log10(0)` = `-Infinity` ⇒ 给 RMS 一个有限下垫（-120dB）。
 * Why 具名（R27.1 先例：边界/幅度类数字必须有唯一落点）：它是「静音」与「极小值」的分界，
 * 散成两处字面量后必然各自漂移，而漂移表现为「安静时条数偶尔跳一格」——最难归因的那类。
 */
export const WAVEFORM_RMS_EPSILON = 1e-6;

/** 冻结快照（计划 Interfaces）：纯受控 —— 无 IPC、无回调、无订阅。 */
export interface WaveformProps {
  readonly rms: number;
  readonly clipping: boolean;
  readonly bars?: number;
  readonly height?: number;
  readonly testId?: string;
}

/**
 * RMS → 点亮条数（对数映射）。行为契约只有一条：**对 `rms` 单调不减**（同名测试逐序数组钉住）。
 * 越界一律夹取，故本函数是全定义域上的全函数（无抛点、无 NaN 出口）。
 */
export function litBars(rms: number, bars: number): number {
  if (bars <= 0 || !Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(Math.max(rms, WAVEFORM_RMS_EPSILON));
  const ratio = Math.min(1, Math.max(0, (db - WAVEFORM_FLOOR_DB) / -WAVEFORM_FLOOR_DB));
  return Math.min(bars, Math.round(ratio * bars));
}

/** 该条是否落在右端削波热区（索引 0 = 最左）。它只判**位置**，不判是否点亮。 */
export function inClipZone(index: number, bars: number): boolean {
  return index >= bars - WAVEFORM_CLIP_BARS;
}

/** 条的公共几何 + 动效接缝（色值逐条不同，故在渲染处合并）。 */
const BAR_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: "var(--ed-radius-stamp, 3px)",
  transition: "background-color var(--ed-dur-micro, 120ms) var(--ed-ease, cubic-bezier(0.2, 0, 0, 1))",
};

/**
 * 渲染一条波形。
 *
 * 返回 `ReactElement`（= 契约里的 `JSX.Element`）：React 19 把全局 `JSX` 命名空间收进 `React.JSX`，
 * 直接写 `JSX.Element` 在 `@types/react@19` 下取不到（同 `Text.tsx` / `Surface.tsx` 先例）。
 */
export default function Waveform({
  rms,
  clipping,
  bars = WAVEFORM_BARS,
  height = WAVEFORM_HEIGHT,
  testId = "waveform",
}: WaveformProps): ReactElement {
  // 条数先归一到非负整数：`Array.from({length:-1})` 本就是空数组，但显式归零让 `data-bars`
  // 与真实条数永远一致（负值 / 小数不会漏进属性）。
  const count = Math.max(0, Math.floor(bars));
  const lit = litBars(rms, count);
  // 根盒子的 `flex: "1 1 auto"` 让它在仪表条的**行** flex 里吃掉剩余宽度，同时保持独立可用
  // （非 flex 父容器里 `flex` 无效果，`display:flex` 的块级盒子照旧占满整行）。
  return (
    <div
      data-testid={testId}
      data-bars={count}
      data-lit={lit}
      data-clipping={clipping ? "true" : "false"}
      style={{ display: "flex", alignItems: "flex-end", gap: 2, flex: "1 1 auto", minWidth: 0, height }}
    >
      {Array.from({ length: count }, (_, i) => {
        const on = i < lit;
        // 热区标记只看「采样削波 ∧ 落在右端」这两件事（与点亮无关）⇒ 它是**结构性**锚点，
        // 由 props 唯一决定、可被逐序数组比对；颜色则要求「点亮」才有意义（未点亮的条是底槽）。
        const hot = clipping && inClipZone(i, count);
        return (
          <div
            key={i}
            data-bar={i}
            data-lit={on ? "true" : "false"}
            data-clip={hot ? "true" : "false"}
            style={{
              ...BAR_STYLE,
              // 用**长写** `backgroundColor` 而不是 `background` 简写：jsdom 30 的 CSSStyleDeclaration
              // 会把简写里的 `var(...)` 整条丢掉（实测 `style.background === ""`），长写则逐字保真
              // ⇒ 判据读得到真实产出的色值（本批「判据读不到产出 = 假绿」的家族）。
              backgroundColor: !on ? "var(--ed-bg-sunken)" : hot ? "var(--ed-stamp)" : "var(--ed-ink-1)",
            }}
          />
        );
      })}
    </div>
  );
}
