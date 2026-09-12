// @vitest-environment jsdom
/**
 * @ai-context motionHarness.test.ts — T10 底座的**自证**（计划 Task 10 的 Verification V1–V4 · 裁决
 *   R8.1 / R8.2 / R8.3 / R8.4 / R3.2）。被测 = `./motionHarness`（波 B/C 复用的同一支底座）。
 *
 * 判据纪律（本文件自己也要守）：
 *   · **零 `await sleep` / 零真实定时器 / 零 fake timers** —— 推进会部走 `freezeAt`（R8.1 的正解），
 *     全套用例同步跑完；`gsap.ticker` 的墙钟推不动 `{ paused: true }` 的 timeline，读数因此可复现。
 *   · **不把 jsdom 的 `performance` 挂到 `globalThis`**（R8.3：`Performance-impl.js:13-15` 的 `now()`
 *     取全局 `performance` ⇒ 自调用栈溢出）。本文件的 V4 是**静态扫描**：两处禁令串按拼接构造，源码
 *     文本里**不出现**完整禁令串（否则扫描器会扫到自己 —— 同 `motion/engine.guard.test.ts` 的先例）。
 *   · 每条判据各带**专属变异体**（逐条读数见批次报告 `task-10-report.md`）；**不设快照**。
 *
 * 边界：① V1 只证「paused timeline 的 seek 逐字精确」，**不证**真实帧率 / 观感（jsdom 无 paint，
 *   `getBoundingClientRect` 恒 0 ⇒ 见 `motion.md` 的「不可用判据」）；② V3 读的是 `el.style` 的**内联**
 *   属性集合，看不见类规则；③ V4 是**文本级**扫描（剥注释、无 AST）—— 它只证「禁令串不在代码里」。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gsap } from "../motion/engine";
import { ANIMATABLE_PROPERTIES } from "../motion/shift";
import { stripComments } from "../ui/primitives/sliceScan";
import { animatedProps, currentTransform, freezeAt, installMatchMediaStub, tweenCount } from "./motionHarness";

const HERE = dirname(fileURLToPath(import.meta.url));
/** reduced-motion 查询串（底座不导出它 ⇒ 这里独立写死：两边分叉时 V2c 的 conditions 当场红）。 */
const REDUCED = "(prefers-reduced-motion: reduce)";

/** 游离元素（挂进 `document.body` 让 inline style 生效）。 */
function mkDiv(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  // 局部桩纪律（R3.2）：🔴 本模块**不做自动清理** —— 每条用例必须自己 `restore()`（写进 `try/finally`）。
  // 下一行**兜不住**本桩（T13b 按合并评审 M-3 逐字更正旧注释「这里再兜一次」）：`installMatchMediaStub`
  // 是**直接赋值** `window.matchMedia`，没有 vi 的登记项可复原（实测见 V2e）；它只对将来用
  // `vi.stubGlobal` 装的全局量有效。泄漏的 canary = V2a 首行 + V2d 收尾两条 `undefined` 断言。
  vi.unstubAllGlobals();
  for (const el of [...document.body.children]) {
    gsap.killTweensOf(el);
    el.remove();
  }
});

describe("V1 确定性推进的唯一正解：`gsap.timeline({paused:true})` + `freezeAt`（R8.1）", () => {
  it("V1a 逐字精确：`power2` / dur 0.5 / x:0→100 在 t=0.125 与 0.25 的读数与尖刺实测逐字一致", () => {
    const el = mkDiv();
    const tl = gsap.timeline({ paused: true });
    const ret = tl.to(el, { x: 100, duration: 0.5, ease: "power2.out" });

    // R8.3 的陷阱：`tl.to()` 返回 **Timeline 本身**，不是 Tween（把它当 tween 用 ⇒ 断言恒真 = 假绿）
    expect(ret, "`tl.to()` 必须返回 Timeline 本身").toBe(tl);
    expect(tl.getChildren(), "tween 句柄只能从 `getChildren()` 取").toHaveLength(1);
    expect(tweenCount(el)).toBe(1);
    expect(currentTransform(el), "seek 之前不得有内联 transform（防上一用例的残留做假）").toBe("");

    freezeAt(tl, 0.125);
    expect(currentTransform(el)).toBe("translate3d(57.8125px, 0px, 0px)");
    freezeAt(tl, 0.25);
    expect(currentTransform(el)).toBe("translate3d(87.5px, 0px, 0px)");
    expect(gsap.getProperty(el, "x"), "数值口径与字符串口径必须同源").toBe(87.5);
    expect(freezeAt(tl, 0.25), "`freezeAt` 必须返回同一个 timeline（可链式）").toBe(tl);
  });

  it("V1b `tweenCount` 是双断言的第一半（R8.2）：两个 tween 并存 ⇒ 2，`killTweensOf` 后 ⇒ 0", () => {
    const el = mkDiv();
    // 注意：这里必须用 `gsap.to`（根级）而不是 `tl.to`（后者返回 timeline）
    gsap.to(el, { x: 10, duration: 1 });
    gsap.to(el, { x: 20, duration: 1 });
    expect(tweenCount(el), "默认 `overwrite:false` ⇒ 两个 tween 并存（只看 transform 会假绿）").toBe(2);

    gsap.killTweensOf(el);
    expect(tweenCount(el)).toBe(0);
  });
});

describe("V2 `matchMedia` 桩必须走 legacy 分支（R3.2 · 尖刺 S2.8③）", () => {
  it("V2a jsdom 30 本就没有 `window.matchMedia`（桩不是奢侈品；也是 V2d 的读数基线）", () => {
    expect(typeof window.matchMedia).toBe("undefined");
  });

  it("V2b 直接订阅：`addListener` 增、`removeListener` 减 —— legacy 两方法都**真被调用**（不是摆设）", () => {
    const stub = installMatchMediaStub({ reduce: true });
    try {
      const mq = window.matchMedia(REDUCED);
      expect(mq.matches, "`matches === true` 必须读得到").toBe(true);
      expect(mq.media, "查询串必须逐字透传").toBe(REDUCED);
      expect(stub.listeners()).toBe(0);

      const listener = (): void => undefined;
      mq.addListener(listener);
      expect(stub.listeners(), "`addListener` 没进挂载集合").toBe(1);
      mq.removeListener(listener);
      expect(stub.listeners(), "`removeListener` 没把监听器摘掉（只加不减 = 摆设）").toBe(0);
    } finally {
      stub.restore();
    }
  });

  it("V2c GSAP 侧真走 legacy：`gsap.matchMedia().add()` 后 `listeners() >= 1`（只实现 addEventListener 会是 0）", () => {
    const stub = installMatchMediaStub({ reduce: true });
    const mm = gsap.matchMedia();
    try {
      const seen: unknown[] = [];
      mm.add({ reduce: REDUCED }, (ctx) => {
        seen.push(ctx.conditions);
      });
      expect(seen, "handler 必须**同步**跑一次（尖刺 S2.8③ 的 handlerRanSynchronously）").toEqual([{ reduce: true }]);
      expect(
        stub.listeners(),
        "GSAP 没走 legacy 分支（`mq.addListener ? … : mq.addEventListener`，gsap-core.js:4078）⇒ 桩的 addListener 是摆设",
      ).toBeGreaterThanOrEqual(1);
    } finally {
      mm.revert();
      stub.restore();
    }
  });

  it("V2d `restore()` 复原「原本就没有」：`delete` 回 `undefined`（局部桩不得泄漏到同文件后续用例）", () => {
    const stub = installMatchMediaStub({ reduce: false });
    try {
      expect(typeof window.matchMedia).toBe("function");
      expect(window.matchMedia(REDUCED).matches, "`reduce:false` ⇒ matches 必须是 false").toBe(false);
      expect(window.matchMedia("(min-width: 700px)").matches, "非 reduced 查询一律 false（不做「全真」糊桩）").toBe(false);
    } finally {
      stub.restore();
    }
    expect(typeof window.matchMedia).toBe("undefined");
    expect("matchMedia" in window, "restore 必须 delete 掉自建属性，而不是留一个 `undefined`").toBe(false);
  });

  /* T13b 追加（合并评审 M-3）：旧 `afterEach` 注释自称 `vi.unstubAllGlobals()`「这里再兜一次」，
   * 实测**为假** —— 桩是**直接赋值** `window.matchMedia`，vi 没有登记项可复原。本条把那一次实测
   * 常驻化：装桩 → 就地调 afterEach 里那句 → 泄漏**原样留存**；只有 `restore()` 能 `delete` 掉它。
   * ⚠️ 它**故意钉住**「直接赋值」这个形态（R28 ③ 已裁定沿用、波 B/C 复用同一支桩）：若将来把桩迁到
   * `vi.stubGlobal`，本条会红 —— 那是**有意的**，迁移时必须连同 afterEach 的语义一起改，
   * 否则这句「只能靠逐条 restore()」会静默变成假话。 */
  it("V2e 泄漏**可见**（不是「兜一次」）：`unstubAllGlobals()` 复原不了直接赋值形态 ⇒ 只能逐条 `restore()`", () => {
    const leaked = installMatchMediaStub({ reduce: true });
    try {
      vi.unstubAllGlobals(); // ← afterEach 里那一句，就地复现
      expect(typeof window.matchMedia, "直接赋值没进 vi 的登记表 ⇒ unstubAllGlobals 无从复原，泄漏留存").toBe("function");
      expect("matchMedia" in window, "自建属性仍在 window 上 ⇒ 下一条用例会读到它").toBe(true);
    } finally {
      leaked.restore(); // 唯一复原手段
    }
    expect(typeof window.matchMedia, "`restore()` 必须把自建属性 delete 回 undefined").toBe("undefined");
    expect("matchMedia" in window, "`restore()` 后不得留 `undefined` 残值").toBe(false);
  });
});

describe("V3 属性集合读取（R8.4 的代理判据口径）", () => {
  it("V3a 动 `x + opacity` ⇒ 内联属性集合恰 5 个（逐序数组相等）且 ⊆ `ANIMATABLE_PROPERTIES`", () => {
    const el = mkDiv();
    gsap.to(el, { x: 50, opacity: 0.5, duration: 0 });

    const props = animatedProps(el);
    expect(props, "读数必须逐序等于尖刺实测的 5 个合成属性").toEqual(["opacity", "rotate", "scale", "transform", "translate"]);
    expect(ANIMATABLE_PROPERTIES, "白名单真源（T9 交付）逐序").toEqual(["transform", "translate", "rotate", "scale", "opacity", "filter"]);
    expect(props.every((p) => ANIMATABLE_PROPERTIES.includes(p)), "被动画属性越出白名单").toBe(true);
  });

  it("V3b 对照（**这是 V3a 的牙**）：动 `width` ⇒ 集合含 `width` ⇒ 落在白名单之外", () => {
    const el = mkDiv();
    gsap.to(el, { width: 50, duration: 0 });

    const props = animatedProps(el);
    expect(props, "对照组必须真的写出 layout 属性（删掉本句 ⇒ V3a 退化为「任何集合都 ⊆」的空真）").toContain("width");
    expect(props.some((p) => !ANIMATABLE_PROPERTIES.includes(p)), "layout 属性混进来却没被告发").toBe(true);
  });
});

// 禁令串一律**拼接构造**：本文件也在 V4b 的扫描域内 ⇒ 源码文本里出现完整禁令串会自伤
// （同 `motion/engine.guard.test.ts` 的 `fromSpec()` 先例）。
const Q = '"';
const NEEDLES: readonly string[] = [
  "globalThis." + "performance =",
  "Object.defineProperty(globalThis, " + Q + "performance" + Q,
  "gsap." + "updateRoot(",
  "." + "ticker.tick(",
  "." + "ticker.sleep(",
  "await " + "sleep(",
];
/** 底座两件（`motionHarness.ts` + 本文件）：波 B/C 直接复用的面 + 它自己的自证 */
const SCANNED: readonly string[] = [join(HERE, "motionHarness.ts"), join(HERE, "motionHarness.test.ts")];

/** 一段源码里命中的禁令串（**剥注释后**扫；纯函数，行为由 V4a 双侧自证）。 */
const bannedHits = (src: string): string[] => {
  const code = stripComments(src);
  return NEEDLES.filter((n) => code.includes(n));
};

describe("V4 静态禁令扫描（剥注释 · R8.3 的 `performance` 陷阱 + 四个禁用驱动）", () => {
  it("V4a 阳性对照：禁令串出现在**代码**里 6 条全中（逐序数组相等）；只出现在注释里 ⇒ 0", () => {
    const asCode = NEEDLES.map((n) => "const a = " + n + " 1;").join("\n");
    expect(bannedHits(asCode), "扫描器对已知样本必须逐序报全 —— 否则 V4b 的 0 命中可能是扫描器坏了").toEqual([...NEEDLES]);

    const asComment = NEEDLES.map((n) => "// " + n + " 1;").join("\n");
    expect(bannedHits(asComment), "剥注释失效 ⇒ 底座文件头（逐字写了四个禁用项）会自命中").toEqual([]);
  });

  it("V4b 底座两件零命中（防空扫：两文件都必须真读得到、且都在盘上）", () => {
    const texts = SCANNED.map((f) => readFileSync(f, "utf8"));
    expect(texts.map((t) => t.length).every((n) => n > 1000), "扫描域缩到空/读错文件 ⇒ 「0 命中」一文不值").toBe(true);
    for (const [i, text] of texts.entries()) {
      expect(bannedHits(text), `${SCANNED[i]} 出现禁令串：${bannedHits(text).join(" / ")}`).toEqual([]);
    }
  });
});
