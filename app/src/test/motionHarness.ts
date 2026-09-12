/**
 * @ai-context motionHarness.ts — 批 6 的**确定性动效测试底座**（T10；依据 R8.1 / R8.2 / R8.3 / R3.2 ·
 *   尖刺 S2.3 / S2.4 / S2.8 / S3.4）。供波 B/C 的全部 GSAP 用例复用。
 *
 * Why 单独成件：波 B/C 的每个动效落点都要在同一套「时序确定性 + `matchMedia` 桩」上写判据；把正解、
 *   禁用清单与桩集中在一处，下游只 import 本模块，就不会各自发明一套（发明的那些**已被尖刺逐个证伪**）。
 *   ⚠️ 本模块**不是**全局 setup：`app/src/test/setup.ts` **一个字都不改**（加全局 `matchMedia` 桩会让既有
 *   30 处「本环境没有 matchMedia」的降级路径静默改道）。桩是**用例级**的：谁装谁 `restore()`。
 *
 * 🔴 确定性推进的**唯一正解** = `gsap.timeline({ paused: true })` + `tl.time(t)`（即本模块的 `freezeAt`）。
 *   实测逐字精度：`power2` tween（`duration: 0.5`、`x: 0 → 100`）在 `tl.time(0.25)` ⇒
 *   `translate3d(87.5px, 0px, 0px)`；`tl.time(0.125)` ⇒ `translate3d(57.8125px, 0px, 0px)`。
 *   🔴 **四个假正解**（尖刺实测，**一律不得**作为推进手段）：
 *     ① `gsap.updateRoot(t)` —— 内部是 `(t - globalTimeline._start) * _ts`，而 `_start` **会漂移**
 *        （实测 0 → 0.105 → 0.199）：请求 0.25 实际渲染到 0.145（x=64.2），下一轮到 0.051（x=27.6）。
 *     ② `gsap.ticker.tick()` —— 时间取自**墙钟**（`_lastUpdate - _startTime`），紧循环连打 6 次推进 ≈ 0。
 *     ③ `gsap.ticker.sleep()` —— 只在「此后不再新建 tween」时成立；**新建任何 tween 会同步唤醒它**
 *        （`_tickerActive || _ticker.wake()`，而 `wake()` 内部同步跑一帧 `_tick(2)`）⇒ 实测冻结后新建
 *        tween 立刻 frame 0 → 1，100ms 后 x=27.1。
 *     ④ `await sleep()` / 真实定时器 / fake timers —— 读数由墙钟决定（实测两组互相矛盾的读数
 *        5.6/18 与 97/90.9）⇒ **不可复现**。GSAP 用例**全同步**，不需要 `await`。
 *
 * 🔴 **绝不可把 jsdom 的 `performance` 挂到 `globalThis`**（R8.3）：`Performance-impl.js:13-15` 的
 *   `now()` 取的是**全局** `performance`（`return performance.now() - this._nowAtTimeOrigin`）⇒
 *   挂上去就自己调自己 ⇒ `RangeError: Maximum call stack size exceeded`（尖刺实测把整个进程打挂）。
 *   Node 24 自带的 `performance` 已满足 GSAP 的 `_getTime`，**保留原生即可**。本模块与它的测试由
 *   `motionHarness.test.ts` 的静态扫描钉死（0 命中 + 阳性对照）。
 *
 * 🔴 `tl.to()` 返回的是 **Timeline 本身**，**不是 Tween**（R8.3）：要拿 tween 句柄必须
 *   `tl.to(...).getChildren()` 或直接用 `gsap.to(...)`；把 `tl.to()` 的返回值当 tween 用（例如断
 *   「旧 tween 的 `totalTime()` 冻结」）会让断言**恒真 = 假绿**。
 *
 * 🔴 **可中断 / 覆盖类判据必须双断言**（R8.2）：**同时**断 `tweenCount(target)` /
 *   `gsap.globalTimeline.getChildren().length`（或旧句柄 `totalTime()` 冻结）**与**
 *   `currentTransform(el)`。理由：GSAP 3 默认 `overwrite: false` ⇒ 新 tween 覆盖同属性时
 *   **旧 tween 仍在 globalTimeline 里每帧写同一个属性**，**只看 `style.transform` 会假绿**。
 *
 * 🔴 **`matchMedia` 桩必须实现 `addListener` / `removeListener`**（R3.2 · 尖刺 S2.8③）：jsdom 30.0.1
 *   **没有** `window.matchMedia`，且 `gsap.matchMedia().add()` 会抛 `TypeError: _win.matchMedia is not
 *   a function`（`gsap-core.js:4073`）。GSAP 的订阅分支逐字是
 *   `mq.addListener ? mq.addListener(_onMediaChange) : mq.addEventListener("change", …)`
 *   （`gsap-core.js:4078`）⇒ **只实现 `addEventListener` 的桩不会被调用**（静默不订阅）。
 *   ⚠️ T10 实测补充：GSAP **只调 `addListener`、从不调 `removeListener`** —— `Context.kill()` 只把
 *   context 从 `_media` 里摘掉（`gsap-core.js:4024-4031`），**不碰** MediaQueryList。`removeListener`
 *   仍必须实现（生产代码与其它调用方走它），但**不能**拿 GSAP 的 `revert()` 当它的证据。
 *
 * 副作用：`installMatchMediaStub` **临时改写** `window.matchMedia`（`restore()` 复原，含「原本就没有」
 *   的情形 ⇒ `delete` 回 `undefined`）；其余导出全是纯函数 / 只读。**遗漏 `restore()` 会污染同文件
 *   后续用例** —— 本模块**不做**自动清理（vitest 的 `afterEach` 注册会侵入调用方生命周期）。
 * 边界：① 本模块只解决**时序确定性**，**不解决** jsdom 不做样式级联（`getComputedStyle` 拿不到
 *   transition / animation 的生效值）⇒ 观感类判据本批一律不做；② `animatedProps` 读的是 `el.style` 的
 *   **内联**属性集合，**看不见**类规则里的属性；③ `freezeAt` 只对 **paused** timeline 是确定性的 ——
 *   非 paused 的 timeline 会被 ticker 用墙钟推进（调用方负责传 paused 的那一个）。
 */
import { gsap } from "../motion/engine";
import type { GsapTimeline } from "../motion/engine";

/** 系统无障碍查询串（逐字；生产侧同串见 `ui/primitives/motion.css` 的 reduced-motion 块）。 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * **唯一允许的推进手段**：把 paused timeline 的播放头放到 `t` 秒（R8.1 的正解）。
 * 返回同一个 timeline，便于 `const tl = freezeAt(gsap.timeline({ paused: true }), 0.25)` 这样的链式写法。
 */
export function freezeAt<T extends GsapTimeline>(tl: T, t: number): T {
  tl.time(t);
  return tl;
}

/** 目标上**还活着**的 tween 数（R8.2 双断言的第一半；`gsap.getTweensOf` 的读取口）。 */
export function tweenCount(target: unknown): number {
  return gsap.getTweensOf(target as object | null).length;
}

/** `el.style` 的**内联**属性集合（排序去重；R8.4 属性集合审计的读取口）。 */
export function animatedProps(el: { style: CSSStyleDeclaration }): string[] {
  const names: string[] = [];
  for (let i = 0; i < el.style.length; i += 1) names.push(el.style.item(i));
  return [...new Set(names)].sort();
}

/** `el.style.transform` 的读取口（R8.2 双断言的第二半）。 */
export function currentTransform(el: Element): string {
  return (el as HTMLElement | SVGElement).style.transform;
}

/** 桩的形态：legacy 两方法 + 现代两方法 + `onchange` + `dispatchEvent`（计划 T10 Step 2 逐字）。 */
interface MediaQueryListStub {
  readonly matches: boolean;
  readonly media: string;
  onchange: ((ev: MediaQueryListEvent) => void) | null;
  addEventListener(type: "change", listener: (ev: MediaQueryListEvent) => void): void;
  removeEventListener(type: "change", listener: (ev: MediaQueryListEvent) => void): void;
  addListener(listener: (ev: MediaQueryListEvent) => void): void;
  removeListener(listener: (ev: MediaQueryListEvent) => void): void;
  dispatchEvent(event: Event): boolean;
}

/**
 * 可写 / 可 `delete` 的 `window` 视图。⚠️ **不能**写成 `Window & { matchMedia?: … }` —— 交叉类型里
 * 原生 `Window` 的 `matchMedia` 是**必选**属性，会把可选性再收回去 ⇒ `delete` 报 TS2790
 * （`restore()` 要 `delete` 掉自建属性，故这里用**独立**的宽松视图）。
 */
interface WindowWithMatchMedia {
  matchMedia?: (query: string) => MediaQueryList;
}

/**
 * 装一个**用例级** `matchMedia` 桩，返回 `{ restore, listeners }`。
 * `opts.reduce` = 本环境对 reduced-motion 查询的答案；**其余查询一律 `false`** —— 这样
 * `gsap.matchMedia({ reduce: "(…)" })` 的 conditions 能区分真假，而不是「全部为真」的糊桩。
 * `listeners()` = **当前仍挂着**的 legacy 监听器数（`addListener` 增、`removeListener` 减）。
 */
export function installMatchMediaStub(opts: { reduce: boolean }): { restore(): void; listeners(): number } {
  const target = window as WindowWithMatchMedia;
  const hadFunction = typeof target.matchMedia === "function";
  const original = target.matchMedia;
  const attached = new Set<(ev: MediaQueryListEvent) => void>();

  target.matchMedia = (query: string): MediaQueryList => {
    const stub: MediaQueryListStub = {
      matches: opts.reduce && query === REDUCED_MOTION_QUERY,
      media: query,
      onchange: null,
      // GSAP 逐字走 legacy 分支（见文件头）⇒ 下面两个现代方法在 GSAP 路径上不会被调用；保留它们既是
      // 「桩形态完整」（被测代码可能走现代分支），也是 `motionHarness.test.ts` V2 反面对照的基础。
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: (listener) => {
        attached.add(listener);
      },
      removeListener: (listener) => {
        attached.delete(listener);
      },
      dispatchEvent: () => true,
    };
    return stub as unknown as MediaQueryList;
  };

  return {
    restore: (): void => {
      if (hadFunction) target.matchMedia = original;
      else delete target.matchMedia;
    },
    listeners: (): number => attached.size,
  };
}
