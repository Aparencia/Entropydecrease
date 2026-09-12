/**
 * @ai-context shellPhase.test.ts — 壳层相变态通道的**纯函数与静态判据**（node 环境，不写 jsdom 头）。
 *
 * Why node：本文件要判的事实恰好与 jsdom 无关 —— ① 三态名册与属性名的**字面量冻结**（逐序数组相等）；
 *   ② 写读通道在**注入的宿主元素**上的往返；③ 「无 `document` ⇒ 静默不动、不抛」这一条**只能在真 node
 *   环境判**（jsdom 里 `document` 恒存在 ⇒ 那条降级路径不可达）；④ 采集态高度 token 的真源 ↔ 产物绑定；
 *   ⑤ `motion.css` 相位选择器的**值域闭合**（纯文本判定，**先剥注释**）。
 *   与之互补的 jsdom 面（真 `<html>` 的挂载/变更/卸载）在 `shellPhase.dom.test.tsx` —— 两侧都不可删。
 *
 * 副作用：只读磁盘（`ui/tokens.css` · `ui/primitives/motion.css`）与临时改写 `globalThis.document`
 *   （逐条 `finally` 还原，照 `motion/intensity.test.ts` 的 `withGlobal` 范式）。
 * 边界：① 宿主用**假元素**（只实现 `setAttribute` / `getAttribute`）—— 真 DOM 的同一断言在 jsdom 文件；
 *   ② 「相位是否真的**切对了**」（采集时顶栏真的变 58px）**不在本任务判据内**：jsdom 不做样式级联、
 *   `getComputedStyle` 拿不到生效值 ⇒ 像素面进报告的诚实边界（消费方是 T18/T19）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCALE_TOKENS } from "../ui/tokens.gen";
import { stripComments } from "../ui/primitives/sliceScan";
import { SHELL_PHASE_ATTR, SHELL_PHASES, applyShellPhase, readShellPhase, useShellPhase } from "./shellPhase";
import type { ShellPhase } from "./shellPhase";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

/** 假宿主：只带判据要用的那一层（写入面 = 属性表；真 DOM 面见 jsdom 文件）。 */
function fakeEl(): HTMLElement {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (k: string, v: string): void => void attrs.set(k, v),
    getAttribute: (k: string): string | null => attrs.get(k) ?? null,
  } as unknown as HTMLElement;
}

/** 逐条注入假全局并还原（`Reflect.deleteProperty` 处理「本来就没有」的情形）。 */
function withDocument<T>(value: unknown, run: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

const read = (rel: string): string => readFileSync(join(SRC, rel), "utf8");

describe("相态名册与属性名（规格 §6.3 的三态；逐字冻结）", () => {
  it("SHELL_PHASES 恰三项且逐序等于 [idle, capture, review]；属性名逐字 data-shell-phase", () => {
    // 硬字面量对照（**不从被测真源派生期望值**）：往名册里塞第 4 个取值 / 改名 ⇒ 本条当场红，
    // 这正是「三处集合闭合」的第一颗牙 —— CSS 侧那颗牙在下面第 ⑤ 段。
    expect([...SHELL_PHASES]).toEqual(["idle", "capture", "review"]);
    expect(SHELL_PHASE_ATTR).toBe("data-shell-phase");
  });

  it("写读闭合：三态逐个「写 ⇒ 读回」，逐序数组相等（一个值都不许被通道改写）", () => {
    const el = fakeEl();
    const roundTrip = SHELL_PHASES.map((p) => {
      applyShellPhase(p, el);
      return readShellPhase(el);
    });
    expect(roundTrip).toEqual(["idle", "capture", "review"]);
  });
});

describe("采集态高度 token（T17 的 token 半；R4.1）", () => {
  it("tokens.css 同时含 --ed-nav-h: 56px 与 --ed-nav-h-live: 58px，且 56 一字未动、顺序在前", () => {
    const css = read("ui/tokens.css");
    const base = "--ed-nav-h: 56px;";
    const live = "--ed-nav-h-live: 58px;";
    expect(css.includes(base), `tokens.css 缺 ${base}（R4.1：--ed-nav-h 必须保持 56px 不动）`).toBe(true);
    expect(css.includes(live), `tokens.css 缺 ${live}（采集态 58px 的新 token）`).toBe(true);
    // ⚠️ 顺序是零成本的保险：`navHeight.consumption.test.ts` 的 TOKEN_DECL 取**首个**匹配
    expect(css.indexOf(base), "`--ed-nav-h` 必须排在 `--ed-nav-h-live` 之前").toBeLessThan(css.indexOf(live));
  });

  it("产物同值：58 == SCALE_TOKENS.navHeightLive，且 navHeight 仍 56", () => {
    // ⚠️ 真源 `SCALE_SOURCE` 在 TS 侧**读不到这两把键**（实测：`SCALE_SOURCE` 有 12 个键，而 TS 从
    //   `.mjs` 推断出的键联合只有**前 10 个** —— `navHeight` 是第 11 个、`navHeightLive` 是第 12 个；
    //   探针 `keyof typeof SCALE_SOURCE` 打印的联合止于 `iconSizes`）⇒ 本层改用**产物** `tokens.gen.ts`，
    //   真源 ↔ 产物 的绑定由 `ui/tokens.drift.test.ts`（重跑生成器逐字节比对）与 `gen-tokens.test.mjs` 承担。
    expect(SCALE_TOKENS.navHeightLive).toBe(58);
    expect(SCALE_TOKENS.navHeight, "R4.1 逐字：既有顶栏高度一个字节都不许改").toBe(56);
    expect(read("ui/tokens.css")).toContain(`--ed-nav-h-live: ${SCALE_TOKENS.navHeightLive}px;`);
  });
});

describe("applyShellPhase：写真属性 / 三处降级", () => {
  it("显式传元素 ⇒ 属性落在它身上；再写一次覆盖旧值", () => {
    const el = fakeEl();
    applyShellPhase("review", el);
    expect(el.getAttribute("data-shell-phase")).toBe("review");
    applyShellPhase("capture", el);
    expect(el.getAttribute("data-shell-phase")).toBe("capture");
  });

  it("不传元素 ⇒ 默认宿主是 document.documentElement（`<html>`）", () => {
    const el = fakeEl();
    withDocument({ documentElement: el }, () => applyShellPhase("review"));
    expect(el.getAttribute("data-shell-phase")).toBe("review");
  });

  it("无 document（真 node 环境）且不传元素 / 传 null ⇒ 静默不动，不抛", () => {
    expect(typeof document).toBe("undefined");
    expect(() => applyShellPhase("capture")).not.toThrow();
    expect(() => applyShellPhase("capture", null)).not.toThrow();
  });

  it("非法值 ⇒ **不动**既有属性（不是回退 idle：静默不动优于替调用方猜一个值）", () => {
    const el = fakeEl();
    applyShellPhase("review", el);
    applyShellPhase("recording" as unknown as ShellPhase, el);
    expect(el.getAttribute("data-shell-phase")).toBe("review");
  });
});

describe("readShellPhase：缺失与垃圾值一律 null", () => {
  it("属性缺失 / 空串 / 旧版遗留值 / 大小写不符 ⇒ null；三态字面量 ⇒ 原样读回", () => {
    const el = fakeEl();
    expect(readShellPhase(el)).toBeNull();
    for (const junk of ["", "Capture", "capture ", "live", "review;capture"]) {
      el.setAttribute("data-shell-phase", junk);
      expect(readShellPhase(el), `垃圾值 ${JSON.stringify(junk)}`).toBeNull();
    }
    el.setAttribute("data-shell-phase", "idle");
    expect(readShellPhase(el)).toBe("idle");
  });

  it("无 document 且不传元素 ⇒ null，不抛", () => {
    expect(typeof document).toBe("undefined");
    expect(readShellPhase()).toBeNull();
    expect(() => readShellPhase(null)).not.toThrow();
  });
});

describe("useShellPhase 在 node 环境下可调用（SSR 不执行 effect ⇒ 只证「不抛」）", () => {
  it("renderToString 渲染一个调用 useShellPhase 的探针组件 ⇒ 不抛，且 `<html>` 上什么都没写", () => {
    const Probe = (): string => {
      useShellPhase("capture");
      return "ok";
    };
    expect(typeof document).toBe("undefined");
    expect(renderToString(createElement(Probe))).toBe("ok");
  });
});

describe("⑤ CSS 侧值域闭合：motion.css 的相位选择器只许用名册里的三态（先剥注释）", () => {
  /** 相位选择器的取值：`[data-shell-phase="x"]` */
  const PHASE_SEL = /\[\s*data-shell-phase\s*=\s*"([^"]*)"\s*\]/g;
  /** 仪器正对照：同一读法必须能在同一文件里认出**已存在**的档位选择器（`data-motion`） */
  const MOTION_SEL = /\[\s*data-motion\s*=\s*"([^"]*)"\s*\]/g;

  it("仪器双侧自证 + 值域闭合（剥注释后判定；注释里的字面量不算犯规）", () => {
    // 🔴 先剥注释（R8.7 / R40.2 预判）：`shell/columnRegistry.ts` 的**注释**里逐字写着
    // `data-shell-phase`（T14b 落的前向引用）—— 不剥注释的扫描器会被注释字面量骗到。
    const code = stripComments(read("ui/primitives/motion.css"));
    const motionHits = [...code.matchAll(MOTION_SEL)].map((m) => m[1]);
    expect(motionHits.length, "正对照失败：这台仪器在 motion.css 上认不出 data-motion（域或口径漂了）").toBeGreaterThan(0);
    expect(motionHits.every((v) => v.length > 0), "认出了 data-motion 却取不到值 ⇒ 捕获组写错了").toBe(true);
    // 邻居家族的负对照：相位正则不许对 `[data-motion="eco"]` 开火（口径隔离）
    expect([...`[data-motion="eco"]`.matchAll(PHASE_SEL)].length, "相位正则误伤档位选择器").toBe(0);
    // 值域闭合：相位选择器的每个取值都必须在名册内（T19 落地相位块后这条开始有牙）
    const phaseHits = [...code.matchAll(PHASE_SEL)].map((m) => m[1]);
    const foreign = phaseHits.filter((v) => !(SHELL_PHASES as readonly string[]).includes(v));
    expect(foreign, `motion.css 用了名册外的相位值（拼错？）：\n${foreign.join("\n")}`).toEqual([]);
    // 反空真：无意义串必须 0 命中（同域双侧自证的负样本）
    expect([...code.matchAll(/\[\s*data-shell-phase\s*=\s*"zzz-not-a-phase"\s*\]/g)].length).toBe(0);
  });
});
