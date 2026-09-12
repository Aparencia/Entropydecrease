/**
 * @ai-context usePhaseFreeze.ts — #3「相变凝固」的**唯一动效编排点**（批 6 波 C · T29）。
 *   规格 §8.6 第 3 行逐字「**波形收束成直线、琥珀退去、导航淡入；可反向**」· §8.6.1 第 1/3/4 条 ·
 *   裁决 R5.3（冻结进度**必须**是持有的状态量）/ R4.5（琥珀逐字锁 `--ed-due` 族）/ R8.1 / R8.2 / R35.4。
 *
 * `freeze` = **凝固进度**：`0` = 采集态（活波形 + 琥珀满墨）· `1` = 常态 / 复习态（直线 + 常态档墨度）。
 *   ① **波形收束** —— 消费者 = `components/Waveform.tsx` 的受控 prop（条高只经 `scaleY` 表达）。
 *   ② **琥珀退去** —— 消费者 = 采集仪表的**墨度层**（`shell/LiveBar.tsx` 的 `live-ink` 盒；R4.5 逐字点名
 *      的「LIVE 仪表 / 暂停徽标」都在它里面）。🔴 只退**墨度**（`opacity`：1 ⇒ `DUE_INK_NORMAL`），
 *      **不改色值**（琥珀仍是 `--ed-due` 族；色值锁在 `motion.css` 的相位块侧，不许新造琥珀值）。
 *   ③ **导航淡入** —— 载体是 **T19 已交付的绝对定位交叉淡入**（§8.4「不 animate height」）；本任务
 *      **不另起机制**，只保证与它**同拍**（`freezeDurationSec("standard")` 与那条 transition 同取
 *      `--ed-dur-card`）。
 * 🔴 **起始态被持有**（R5.3）：`freeze` 是 React **state**（波形按它渲染），**不是** tween 的进度读回 ——
 *   中途反向时新时间线**从当前持有值接着走**（不回起点、不跳终值）；每帧由 `onUpdate` 从**已写进 DOM 的**
 *   墨度反解回持有值。🔴 **可中断**：先 `interrupt()` 收尸在飞的旧时间线、再起新的（不排队）。
 * 🔴 `controls.ts` **不许被「首屏静态可达」的模块静态引入**（R60.1 更正 R41.3 的适用范围；**惰性视图 /
 *   注册表驱动静态引入是安全的**）。它静态 `import "./engine"` ⇒ 而本件**在**首屏静态闭包内
 *   （`shell/LiveBar.tsx:44` 静态引入本件；T35c 用 `engine.guard.test.ts` 的仪器实测 89 文件闭包含本件）
 *   ⇒ 本件**静态取值**引入它会让那条闭包交集判据当场红；故只取类型（`import type` 不建边）+ 动态 `import()`。
 * 🔴 **唯一 GSAP 目标**（= 墨度层）：出口的 `interrupt()` 只 kill 它那**一个** target（`controls.ts` 头部
 *   逐字：多目标会留下够不着的孤儿 tween）⇒ 波形走 React 重渲染（32 个 div、一个 220/500ms 窗口）。
 * 🔴 三档（R35.4：出口**不**内置档位分支）：`eco` = §8.5「编排层直接跳终态」（不建 timeline）·
 *   standard = `--ed-dur-card`(220ms) · rich = `--ed-dur-reveal`(500ms) + 波形错开 25%。
 * 🔴 reduced-motion：**不自己分支** —— 出口命中时已 `gsap.set` 落终态并返回零 tween 的惰性时间线 ⇒
 *   本 hook 据此（`getChildren()` 为空）把持有值同步落终值。
 * 副作用：建 GSAP 时间线 + 写墨度层 `opacity`；经 `useMotionIntensity` 读写档位记忆与 `<html data-motion>`。
 * 边界：① 墨度层未挂上 ⇒ 不建时间线、持有值落终值；② 相位未变（目标 == 持有值）⇒ **不建时间线**
 *   （挂载即常态时零动作，也不给既有测试留一条在飞时间线）；③ `opts.paused` 是判据用的确定性时基
 *   （R8.1 唯一正解），生产不传 ⇒ ticker 驱动；④ 观感与真实帧率**本批未测**（jsdom 不可达）。
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { DURATION_TOKENS } from "../ui/tokens.gen";
import type { DurationTokenName } from "../ui/tokens.gen";
import { useMotionIntensity } from "../motion/intensity";
import type { MotionIntensity } from "../motion/intensity";
import { toneEase } from "../motion/tone";
// 🔴 **只取类型**：`controls.ts` **不许被「首屏静态可达」的模块静态引入**（R60.1；**惰性视图静态引入它
// 是安全的** —— 但见文件头：**本件在该闭包内** ⇒ 本件的静态取值边会红；判据 = 闭包交集）。`import type`
// 不建边 ⇒ 运行时入口只有下面的动态 `import()`（**形态不变**）。
import type { Controllable } from "../motion/controls";
import type { ShellPhase } from "./shellPhase";

/** 常态档墨度：琥珀族在**非采集**相位的墨度（= 环境层 `ed-due-glow` 的波谷 0.72 —— 复用既有数字）。 */
export const DUE_INK_NORMAL = 0.72;
/** 相变凝固的曲线（R3.4：相变是**换形**不是读数 ⇒「活的纸」族；真源 `motion/tone.ts`，零新造曲线）。 */
const EASE = toneEase("paper");
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 相位 ⇒ 凝固终值（`capture` = 0；常态 / 复习 = 1）。纯函数 —— 判据直接钉它。 */
export function freezeTarget(phase: ShellPhase): number {
  return phase === "capture" ? 0 : 1;
}
/** 凝固进度 ⇒ 墨度层 `opacity`（`freeze = 1` ⇒ 常态档）。 */
export function inkOpacity(freeze: number): number {
  return 1 - clamp01(freeze) * (1 - DUE_INK_NORMAL);
}
/** `opacity` ⇒ 凝固进度（上式的反解）；非有限值 ⇒ `null`（调用方保持持有值，不假装 0）。 */
export function inkFreezeOf(opacity: string): number | null {
  const v = Number.parseFloat(opacity);
  return Number.isFinite(v) ? clamp01((1 - v) / (1 - DUE_INK_NORMAL)) : null;
}
/** 档位 ⇒ 时长（秒）：`eco` = **0**（§8.5「节能档…编排层直接跳终态」）· standard 220ms · rich 500ms。 */
export function freezeDurationSec(tier: MotionIntensity): number {
  if (tier === "eco") return 0;
  const name: DurationTokenName = tier === "rich" ? "reveal" : "card";
  const token = DURATION_TOKENS.find((t) => t.name === name);
  if (token === undefined) throw new Error(`时长真源缺 --ed-dur-${name}（tokens.gen.ts 与生成器分叉）`);
  return token.ms / 1000;
}
/** 墨度进度 ⇒ 波形进度：只有 rich **错开** 25%（三段「错开更明显」），standard / eco 不错开。 */
export function staggeredFreeze(freeze: number, tier: MotionIntensity): number {
  const s = tier === "rich" ? 0.25 : 0;
  return s === 0 ? clamp01(freeze) : clamp01((freeze - s) / (1 - s));
}

/** 句柄：墨度层 ref（= **唯一** GSAP 目标）、**持有的**凝固进度、出口句柄（`null` = 尚无编排动效）。 */
export interface PhaseFreeze {
  readonly inkRef: RefObject<HTMLDivElement | null>;
  readonly freeze: number;
  readonly barsFreeze: number;
  readonly handle: RefObject<Controllable | null>;
}

/** 把相位翻转变成一次**可中断、可反向**的相变凝固；返回持有量的读取口。 */
export function usePhaseFreeze(phase: ShellPhase, opts?: { paused?: boolean }): PhaseFreeze {
  const inkRef = useRef<HTMLDivElement | null>(null);
  const held = useRef<number>(freezeTarget(phase));
  const [freeze, setFreeze] = useState<number>(() => freezeTarget(phase));
  const handle = useRef<Controllable | null>(null);
  const epoch = useRef(0);
  const [tier] = useMotionIntensity();
  const paused = opts?.paused ?? false;

  useEffect(() => {
    const to = freezeTarget(phase);
    const from = held.current;
    if (to === from) return; // 相位未变（含挂载）⇒ 零动作
    epoch.current += 1;
    const mine = epoch.current;
    handle.current?.interrupt(); // 下一个输入接管：**先**收尸在飞的旧时间线（kill 不还原已写出的值）
    handle.current = null;
    const el = inkRef.current;
    if (el === null) {
      held.current = to; // 墨度层未挂上：落终值（不抛、不猜）
      setFreeze(to);
      return;
    }
    const duration = freezeDurationSec(tier);
    void import("../motion/controls").then(({ startControllable }) => {
      if (mine !== epoch.current) return; // 已被更新的相位接管 ⇒ 丢弃这次（不排队）
      /** 用出口的**零时长 tween** 把墨度同步写进 DOM（起始态物化 / eco 的跳终态）。🔴 另两条路被实测否掉
       *  （T30 先例）：`startAt` 在 paused 下到不了 DOM；手写 `style.opacity` 会被 GSAP 的缓存读口绕过。 */
      const write = (v: number): void => {
        const jump = startControllable(el, { opacity: inkOpacity(v), duration: 0, ease: EASE }, { paused: true });
        jump.seek(0);
        jump.interrupt();
      };
      if (duration === 0) {
        // eco（§8.5 逐字「编排层直接跳终态」）⇒ **不建编排 timeline**（零时长 tween 留场 + paused 下不渲染）
        held.current = to;
        setFreeze(to);
        write(to);
        return;
      }
      write(from); // 起始态物化：本次相变从**持有值**起（中途反向不跳回起点、不跳终值）
      const next = startControllable(
        el,
        {
          opacity: inkOpacity(to),
          duration,
          ease: EASE,
          onUpdate: () => {
            const v = inkFreezeOf(el.style.opacity);
            if (v === null) return; // 读不到 ⇒ 保持持有值（不把解析失败伪装成 0）
            held.current = v;
            setFreeze(v);
          },
        },
        { paused },
      );
      if (next.timeline.getChildren().length === 0) {
        held.current = to; // reduced-motion：出口已落终态且零 tween ⇒ 持有值同步落终值
        setFreeze(to);
      }
      handle.current = next;
    });
  }, [phase, tier, paused]);

  return { inkRef, freeze, barsFreeze: staggeredFreeze(freeze, tier), handle };
}
