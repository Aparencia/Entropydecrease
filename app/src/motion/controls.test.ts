// @vitest-environment jsdom
/**
 * @ai-context controls.test.ts — 可中断 / 可反向出口的**判据模板**（批 6 T11 · 裁决 R8.2 / R8.4 ·
 *   计划 Task 11 Step 2 的四条判据，按「一条判据一个用例、各带专属变异体」拆开）。
 *
 * 这是**波 C 的复制母本**：六个签名动效（#1–#6）与列折叠的用例照本文件写 —— 双断言（状态机 + DOM）、
 *   回走逐序、属性集合审计、reduced-motion 降级四条；每条都能在专属变异体下变红（逐条读数见
 *   `task-11-report.md`）。
 *
 * 判据纪律：① 推进**只用** `freezeAt`（R8.1 的唯一正解；本文件零 `await`、零真实定时器、零 fake timers）；
 *   ② 双断言**同时**断状态机（`globalTimeline` 计数 / 旧 tween 的 `totalTime()` / `tweenCount`）**与**
 *   `currentTransform` —— 只看后者会假绿（R8.2）；③ **绝不可**把 jsdom 的 `performance` 挂到 `globalThis`；
 *   ④ `tl.to()` 返回 Timeline 不是 Tween ⇒ tween 句柄一律走 `timeline.getChildren()[0]`；⑤ 所有时间线经
 *   `track()` 登记、由 `afterEach` 统一 kill ⇒ 每条用例的 `globalTimeline` 计数都是**干净**读数。
 *
 * `globalTimeline.getChildren()` 的**默认口径是递归**的：一条时间线 + 它的 1 个 tween = **2**
 *   （`getChildren(false, true, true)` 才是只数直接子项 = 1）；两种读数下面都给，与 `motion.md:121` 的
 *   写法（不带实参）保持一致。
 *
 * 边界：① 本文件判的是 jsdom 里的**状态机正确性**（旧 tween 死了、新 tween 掌权），**不是**「用户看到的
 *   接管」；② 真实帧率**本批未测**（jsdom 不可达）⇒ 性能面只有属性集合代理判据（R8.4）；③ 三档强度
 *   （`data-motion`）不在出口的判据域（那是 CSS 侧的幅度通道）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "../test/motionHarness";
import { assertAnimatable, startControllable } from "./controls";
import type { Controllable } from "./controls";
import { gsap } from "./engine";
import { ANIMATABLE_PROPERTIES } from "./shift";

/** 本文件建的时间线全部登记在此、`afterEach` 收尸（否则跨用例残留会让精确计数变假）。 */
const live: Controllable[] = [];
const track = (c: Controllable): Controllable => {
  live.push(c);
  return c;
};

function mkDiv(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  for (const c of live.splice(0)) c.timeline.kill();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
});

describe("V1 可中断（R8.2 本体：双断言，缺一即假绿）", () => {
  it("V1a `interrupt()` 后旧 tween 死透（状态机）**且** DOM 归新 tween", () => {
    expect(gsap.globalTimeline.getChildren(), "同文件前置用例有残留 ⇒ 下面的精确计数会被做假").toHaveLength(0);
    const el = mkDiv();
    const a = track(startControllable(el, { x: 100, duration: 1, ease: "none" }, { paused: true }));
    const aTween = a.timeline.getChildren()[0];
    freezeAt(a.timeline, 0.3);
    expect(currentTransform(el)).toBe("translate3d(30px, 0px, 0px)");
    expect(gsap.globalTimeline.getChildren(), "一条时间线 + 它的 1 个 tween（默认口径递归）").toHaveLength(2);

    const next: { handle: Controllable | null } = { handle: null };
    a.interrupt(() => {
      next.handle = track(startControllable(el, { x: 50, duration: 1, ease: "none" }, { paused: true }));
    });
    const b = next.handle;
    if (b === null) throw new Error("`interrupt(next)` 没有**立即**起下一个 —— 探针失效（排队 = 不接管）");
    freezeAt(b.timeline, 1);

    // ① 状态机半边：旧时间线已从 globalTimeline 摘除；目标上只剩新 tween 一条
    expect(gsap.globalTimeline.getChildren(), "旧时间线还在 globalTimeline ⇒ 那是「覆盖」不是「kill」").toHaveLength(2);
    expect(gsap.globalTimeline.getChildren(false, true, true), "只数直接子项（规范字面的「1」是这一口径）").toHaveLength(1);
    expect(tweenCount(el), "目标上只许剩新 tween 一条").toBe(1);

    // ② 继续推**旧**时间线的播放头 = 确定性模拟「旧 tween 仍在跑」（生产里由 ticker 驱动）
    freezeAt(a.timeline, 1);
    expect(aTween.totalTime(), "旧 tween 的播放头必须冻结在 interrupt 时刻").toBe(0.3);

    // ③ DOM 半边：旧 tween 若还活着，它会把值写回 100（只看这一半的实现会漏掉状态机）
    expect(currentTransform(el), "旧 tween 仍在写同一属性 ⇒ 只看这一半会假绿（R8.2）").toBe("translate(50px, 0px)");
    expect(gsap.getProperty(el, "x")).toBe(50);

    expect(() => a.interrupt(), "`interrupt()` 必须幂等（重复调用不得抛）").not.toThrow();
    expect(tweenCount(el), "接管语义 = 目标上不再有在飞 tween").toBe(0);
    expect(currentTransform(el), "kill 不还原已写出的值（冻结在当前值）").toBe("translate(50px, 0px)");
  });

  it('V1b 出口强制 `overwrite: "auto"`：新 tween 首次渲染即杀掉同属性的旧 tween（无需显式 interrupt）', () => {
    const el = mkDiv();
    const a = track(startControllable(el, { x: 100, duration: 1, ease: "none" }, { paused: true }));
    const aTween = a.timeline.getChildren()[0];
    freezeAt(a.timeline, 0.3);

    const b = track(startControllable(el, { x: 50, duration: 1, ease: "none" }, { paused: true }));
    expect(tweenCount(el), "两条并存 = GSAP 默认 `overwrite:false` ⇒ 出口没有强制 auto").toBe(2);

    freezeAt(b.timeline, 0.5); // 新 tween 的**首次渲染**：auto 覆盖在此刻生效（尖刺 S2.4(b) 表）
    expect(tweenCount(el)).toBe(1);
    expect(a.timeline.getChildren(), "旧 tween 已从它自己的时间线摘除").toHaveLength(0);
    expect(aTween.totalTime(), "旧 tween 死在冻结处，不随新 tween 前进").toBe(0.3);
    expect(currentTransform(el), "接管从**接管时刻的当前值**（30px）出发，不跳回起点").toBe("translate3d(40px, 0px, 0px)");
  });
});

describe("V2 可反向（计划 Step 2 的第 2 条，拆成三条各有专属变异体的判据）", () => {
  it("V2a `reverse()` 真的翻方向并开始回放（「只改 timeScale 不 play」的假反向会红在这里）", () => {
    const el = mkDiv();
    const c = track(startControllable(el, { x: 100, duration: 1, ease: "none" }, { paused: true }));
    freezeAt(c.timeline, 0.6);

    c.reverse();
    expect(c.timeline.reversed()).toBe(true);
    expect(c.timeline.timeScale()).toBe(-1);
    expect(c.timeline.paused(), "只改 timeScale 不 play ⇒ 时间线仍停着（看起来反向其实没反向）").toBe(false);
  });

  it("V2b `reverse()` 只改方向、**不动**播放头（尖刺 S2.5(a)：`reverse()` 后 progress 仍 = 1）", () => {
    const el = mkDiv();
    const c = track(startControllable(el, { x: 100, duration: 1, ease: "none" }, { paused: true }));
    freezeAt(c.timeline, 0.6);
    const before = c.timeline.progress();
    const domBefore = currentTransform(el);

    c.reverse();
    expect(before, "时间线长度必须非 0，否则「progress 不变」是空真").toBeCloseTo(0.6, 6);
    expect(c.timeline.progress(), "把播放头拉回起点 = 反向时从头播（不是从当前状态回退）").toBe(before);
    expect(currentTransform(el), "`reverse()` 本身不写 DOM").toBe(domBefore);
  });

  it("V2c 反向后回走**逐字重走同一条轨迹**（逐序数组相等；防空真：前进序列必须真的在动）", () => {
    const el = mkDiv();
    const c = track(startControllable(el, { x: 100, duration: 1, ease: "none" }, { paused: true }));
    const tween = c.timeline.getChildren()[0];
    freezeAt(c.timeline, 0.6); // 先渲染一次：未渲染时 t=0 的读数是空串，不是 `translate(0, 0)`

    const pts = [0, 0.25, 0.5, 0.75, 1];
    const forward = pts.map((t) => {
      freezeAt(c.timeline, t);
      return currentTransform(el);
    });
    expect(forward, "前进序列必须逐字等于 5 个已知读数（否则「逐序相等」是空真）").toEqual([
      "translate(0, 0)",
      "translate3d(25px, 0px, 0px)",
      "translate3d(50px, 0px, 0px)",
      "translate3d(75px, 0px, 0px)",
      "translate(100px, 0px)",
    ]);

    c.reverse();
    const backward = [...pts].reverse().map((t) => {
      freezeAt(c.timeline, t);
      return currentTransform(el);
    });
    expect(backward, "回走的值必须逐字等于正向序列的逆序（任何时间→值的映射改写都会在这里现形）").toEqual([...forward].reverse());
    expect(c.timeline.getChildren()[0], "`reverse()` 不许重建 / 替换 tween（重建 = 值序列换了来源）").toBe(tween);
  });
});

describe("V3 被动画属性集合审计（R8.4 的机器抓手 = 未动 layout 属性）", () => {
  it("V3a 出口产出的 tween 只写白名单内的合成属性（逐序数组相等 + ⊆ 白名单 + `assertAnimatable` 不抛）", () => {
    const el = mkDiv();
    const c = track(startControllable(el, { x: 20, y: 4, opacity: 0.5, duration: 1, ease: "none" }, { paused: true }));
    freezeAt(c.timeline, 0.5);

    const props = animatedProps(el);
    expect(props, "逐序等于 jsdom 实测的 5 个合成属性（换序 / 多写都红）").toEqual([
      "opacity",
      "rotate",
      "scale",
      "transform",
      "translate",
    ]);
    expect(props.filter((p) => !ANIMATABLE_PROPERTIES.includes(p)), "有 layout 属性混进来").toEqual([]);
    expect(ANIMATABLE_PROPERTIES, "白名单真源（T9 交付）逐序").toEqual(["transform", "translate", "rotate", "scale", "opacity", "filter"]);
    expect(() => assertAnimatable(props)).not.toThrow();
  });

  it("V3b 对照（V3a 的牙）：动 layout 属性的样本必须写出该属性、且被 `assertAnimatable` 抛", () => {
    const el = mkDiv();
    const c = track(startControllable(el, { width: 200, duration: 1, ease: "none" }, { paused: true }));
    freezeAt(c.timeline, 0.5);

    const props = animatedProps(el);
    expect(props, "对照组必须真的写出 layout 属性（删掉本句 ⇒ V3a 退化为「任何集合都 ⊆」的空真）").toContain("width");
    expect(() => assertAnimatable(props)).toThrow(/width/);
    expect(() => assertAnimatable(["height", "margin"])).toThrow(/height, margin/);
  });
});

describe("V4 reduced-motion 降级（§8.5：系统偏好优先于档位）", () => {
  it("V4a 桩 `{reduce:true}` ⇒ 直接落终态、不建 tween（`tweenCount` = 0）", () => {
    const stub = installMatchMediaStub({ reduce: true });
    try {
      const el = mkDiv();
      const c = track(startControllable(el, { x: 50, opacity: 0.5, duration: 1, ease: "none" }, { paused: true }));
      expect(tweenCount(el), "降级路径建了 tween ⇒ 系统偏好被无视").toBe(0);
      expect(c.timeline.getChildren(), "惰性时间线里不该有任何 tween").toHaveLength(0);

      freezeAt(c.timeline, 0);
      expect(currentTransform(el), "reduce 下必须**直接落终态**（不是从初值开始动）").toBe("translate(50px, 0px)");
      expect(el.style.opacity).toBe("0.5");
      expect(gsap.getProperty(el, "x")).toBe(50);
    } finally {
      stub.restore();
    }
  });

  it("V4b 对照：本环境没有 `matchMedia` ⇒ 未 reduce ⇒ 建 tween 且从初值动起来", () => {
    expect(typeof window.matchMedia, "对照成立的前提是 jsdom 没有 matchMedia（装了桩 ⇒ 本用例会静默改道）").toBe("undefined");
    const el = mkDiv();
    const c = track(startControllable(el, { x: 50, duration: 1, ease: "none" }, { paused: true }));
    expect(tweenCount(el), "未 reduce ⇒ 必须走 tween 路径").toBe(1);

    freezeAt(c.timeline, 0.5);
    expect(currentTransform(el), "从初值 0 起（reduce 才直接落 50）").toBe("translate3d(25px, 0px, 0px)");
  });
});
