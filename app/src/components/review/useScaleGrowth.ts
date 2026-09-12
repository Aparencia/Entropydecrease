/**
 * @ai-context useScaleGrowth.ts — #4「刻度生长」的**唯一动效编排点**（批 6 波 C · T30）。
 *   规格 §8.6 第 4 行逐字「**刻度生长** | 到期刻度按**真实间隔**生长；答「忘了」则回缩 | 让 FSRS 调度
 *   **可以被感觉**」· §8.6.1 第 3 条「可中断、可反向是『活』的硬指标」· 裁决 R5.4 + PB2 双精度域。
 *
 * 数据真源（唯一）= `review_card` 返回体的 **`intervalDays`（PB2 ①域 = 精确值）** —— PB2 逐字「UI 上
 *   『答忘了则回缩』**必须**用 ① 的精确值」⇒ 本模块**不接受**行派生的整天值（那会让标签说谎）。
 *   `intervalToScale` 复用 T21 的单调映射（`tickHeight`：1 天 ⇒ 8px、≥30 天 ⇒ 满刻度 28px、`<=0`/缺 ⇒
 *   6px 的「无间隔」档）⇒ **零新数字**。几何量的唯一定义 = `length`（归一长度 0..1 = 段高 ÷ 满刻度）；
 *   DOM 侧**只动 `scaleY`**（R8.4：不许动 layout 属性），落差写成 `起始 scale = held / target`、终态
 *   `scaleY = 1` ⇒ **落定时刻度逐字回到 T21 的静态形态**。「生长」= 从上一段间隔的长度长到新间隔的长度；
 *   「答忘了则回缩」= 新间隔更短 ⇒ 同一个式子直接给出回缩（V2 的方向断言）。
 *
 * 🔴 起始态**被持有**（§8.6.1-1）：`length` **不是** tween 的即时读回 —— jsdom 无排版（R8.4 实测
 *   `offsetHeight` 恒 0）⇒「上一段有多长」量不出来，只能持有；新目标从**当前持有值**起播 ⇒ 中途接管不
 *   跳回起点（V4 的 M4 死在这一条）；`onUpdate` 每帧把**已写进 DOM 的** scaleY 折回持有值。
 * 🔴 可中断（§8.6.1-3）：每次新目标**先** `interrupt()` 收尸、**再**起新的一条 ⇒ 下一个输入接管、**不排队**；
 *   动态 import 到达时若 epoch 已变 ⇒ **丢弃这次**（晚到的旧目标不许再起一条）。
 * 🔴 reduced-motion：**不自己分支** —— 出口命中时已 `gsap.set` 落终态并返回**零 tween** 的惰性时间线 ⇒
 *   本 hook 据此（`getChildren()` 为空）把持有值同步落终值（V6 的 M6 死在这一行）。
 * 🔴 三档（R35.4：`controls.ts` **不**内置档位分支 ⇒ 波 C 每条动效自己消费）：`useMotionIntensity()` 读
 *   `data-motion` 且**档位变化时重新取值**；`eco` = §8.5「编排层直接跳终态」（**不建编排 timeline**）、
 *   standard = `--ed-dur-card`(220ms)、rich = `--ed-dur-reveal`(500ms)；**三档的目标长度完全相同**
 *   （档位只改时长，不篡改读数）；基调按 R3.4 取 `instrument`，曲线经 `toneEase` 取 T8 真源（零新造曲线）。
 * 副作用：建 GSAP 时间线 + 写目标元素 `transform`；读档位记忆与 `<html data-motion>`；无 IPC、无网络。
 * 边界：① `target === null`（缺 / 非有限 / 旧后端）⇒ **不生长、不抛、不猜**（「缺失」≠「间隔为 0」）；
 *   ② 只服务「正在评的那张卡」的刻度 —— `ReviewPage` 总到期数**不实时**（闪卡域不在事件总线）⇒ 绑总数会
 *   出现「回缩了但数字没变」的自相矛盾观感；③ `opts.paused` 是**判据用的确定性时基**（R8.1 唯一正解），
 *   生产不传 ⇒ ticker 驱动；④ 观感与真实帧率**本批未测**（jsdom 不可达）—— 机器抓手只有「被动画属性 ⊆
 *   合成属性白名单」。
 */
import { useEffect, useRef, type RefObject } from "react";
import { DURATION_TOKENS, type DurationTokenName } from "../../ui/tokens.gen";
import { useMotionIntensity, type MotionIntensity } from "../../motion/intensity";
import { toneEase } from "../../motion/tone";
// 🔴 **只取类型**：`controls.ts` 内部有静态 `import { gsap } from "./engine"` ⇒ 它只许经 `await import()`
// **到达**（R41.3 / §三十四 #23；判据 = `engine.guard.test.ts` 的闭包交集）。`import type` 不进产物、也不
// 建静态边（守卫的正则显式排除它）⇒ 下面的动态 import 是唯一运行时入口。
import type { Controllable } from "../../motion/controls";
import { TICK_DAY_MAX_PX, TICK_NONE_PX, tickHeight } from "./DueScale";

/** 缺间隔记录时（未评分 / 新卡）刻度停在 T21 的「无间隔」档 —— 它是**起始态**，不是 0 长度。 */
const BASE_LENGTH = TICK_NONE_PX / TICK_DAY_MAX_PX;

/** 基调曲线（R3.4：#4 是「读数」面 ⇒ 精密仪器；真源在 `motion/tone.ts`，零新造曲线）。 */
const EASE = toneEase("instrument");

/** `review_card` 的**精确** `intervalDays` ⇒ 归一长度 0..1（复用 T21 的单调映射）；缺 ⇒ `null`。 */
export function intervalToScale(days: number | null | undefined): number | null {
  if (typeof days !== "number" || !Number.isFinite(days)) return null;
  return tickHeight(days) / TICK_DAY_MAX_PX;
}

/** 从 `transform` 串读 `scaleY`（无 `scale(...)` 子句 ⇒ 1 = 未被缩放）。DOM 侧读数的**唯一**读口。 */
export function scaleYOf(transform: string): number {
  const args = (/scale\(([^)]*)\)/.exec(transform)?.[1] ?? "").split(",").map((s) => Number.parseFloat(s));
  const y = args.length > 1 ? args[1] : args[0];
  return typeof y === "number" && Number.isFinite(y) ? y : 1;
}

/** 档位 ⇒ 时长（秒）：`eco` = **0**（§8.5「节能档…编排层直接跳终态」）· standard 220ms · rich 500ms。 */
export function growthDurationSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  const name: DurationTokenName = tier === "rich" ? "reveal" : "card";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}

/** 生长句柄：元素、**持有的**归一长度、出口句柄（跨渲染存活 ⇒ 不给 React 加每帧 setState）。 */
export interface ScaleGrowth {
  /** 被动画的元素 = `DueScale` 的**首段**（本轮正在评的那张卡的刻度）。 */
  readonly ref: RefObject<HTMLSpanElement | null>;
  /** 持有的归一长度 0..1 —— 下一个目标**从这里**起播（不是 tween 的即时读回）。 */
  readonly length: RefObject<number>;
  /** 最近一次的出口句柄（`null` = 尚无编排动效）；确定性推进口 = `handle.timeline` + `freezeAt`。 */
  readonly handle: RefObject<Controllable | null>;
}

/** 把「新间隔」变成一次**可中断、可反向**的刻度生长；返回持有量的读取口。 */
export function useScaleGrowth(target: number | null, opts?: { paused?: boolean }): ScaleGrowth {
  const ref = useRef<HTMLSpanElement | null>(null);
  const length = useRef<number>(BASE_LENGTH);
  const handle = useRef<Controllable | null>(null);
  const epoch = useRef(0);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;

  useEffect(() => {
    if (target === null) return; // 缺失 ⇒ 不生长（「缺失」≠「间隔为 0」）
    const el = ref.current;
    if (el === null) return; // 元素未挂上：防御性返回（不抛、不猜）
    const mine = (epoch.current += 1);
    handle.current?.interrupt(); // 下一个输入接管：**先**收尸在飞的旧时间线（kill 不还原已写出的值）
    handle.current = null;
    const from = length.current; // 起始态被持有 ⇒ 从这里起播，不回起点
    const to = target;
    const duration = growthDurationSec(tier);
    void import("../../motion/controls").then(({ startControllable }) => {
      if (mine !== epoch.current) return; // 已被更新的目标接管 ⇒ 丢弃这次（不排队）
      /**
       * 用**出口的零时长 tween** 把 scaleY **同步**写进 DOM（起始态物化 / eco 的跳终态）。🔴 另两条路都被
       * 实测否掉：① `startAt` 被 GSAP 另建为一条 **lazy** 的 zero-duration set（`gsap-core.js:2904-2917`）
       * ⇒ paused 时间线下到不了 DOM；② 手写 `style.transform = "scale(1, x)"` 无效 —— GSAP 的
       * `_getComputedTransformMatrixAsArray`（`CSSPlugin.js:700-703`）按 `substr(7)` 取数、**只认
       * `matrix(...)`**，且元素一旦有 GSAP 缓存 `_parseTransform`（`:813`）直接返回缓存、不看 DOM。
       */
      const write = (scaleY: number): void => {
        const jump = startControllable(el, { scaleY, duration: 0, ease: EASE }, { paused: true });
        jump.seek(0); // 零时长 tween 的终值 = scaleY（实测：`seek(0)` 之后内联 transform 就是它）
        jump.interrupt(); // 立刻收尸：kill 不还原已写出的值，且不留时间线（V5 的计数不受影响）
      };
      if (duration === 0) {
        // eco（§8.5 逐字「编排层直接跳终态」）⇒ **不建编排 timeline**（零时长 tween 留场 + paused 下不渲染）
        length.current = to;
        write(1); // 终态 = 静态形态（scaleY 1 ⇒ 刻度就是 T21 画的那一段）
        return;
      }
      write(from / to); // 起始态物化：落差 = 当前长度 ÷ 目标长度（GSAP 从**元素当前值**读起点）
      const next = startControllable(
        el,
        {
          scaleY: 1,
          duration,
          ease: EASE, // R3.4：#4 是「读数」面 ⇒ 精密仪器（power3.inOut）
          onUpdate: () => { length.current = scaleYOf(el.style.transform) * to; },
        },
        { paused },
      );
      if (next.timeline.getChildren().length === 0) length.current = to; // reduced-motion：零 tween ⇒ 终值
      handle.current = next;
    });
  }, [target, tier, paused]);

  return { ref, length, handle };
}
