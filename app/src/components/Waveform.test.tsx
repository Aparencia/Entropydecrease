// @vitest-environment jsdom
/**
 * @ai-context Waveform.test.tsx — 波形读数的 **jsdom 面**判据（批 6 Task 18 Step 2；裁决 R4.3）。
 *
 * Why 每条判据各带**专属变异体**（R8.6 / R41.7：主闸是**期望比对** —— 红必须红在具名断言上，
 *   `ran > 0` 只是旁证），且都从**渲染出的 DOM** 读：
 *   · W1 条阵列 = div 条 / 条数 == bars / 索引逐序 / **0 个内联 svg** ⇒ 变异体 = 把一条换成 svg 元素
 *     （期望两条独立红：① 本文件 W1 的 svg 计数非 0；② `src/ui/icons/no-inline-svg.test.ts` 红 ——
 *     后者是**全文件文本扫描**型守卫，故本文件注释与测试名里提到那个标签时也一律**拼接写**）。
 *   · W2 映射：取样点的点亮条数**逐序等于硬编码期望**（不是从实现反推）+ 全程单调不减 + rms=0 全灭
 *     ⇒ 变异体 = `Math.round` 换 `Math.floor` 并把系数放大 10×（期望数组当场不等）。
 *   · W3 削波热区：`data-clip` 与 `backgroundColor` 两个**逐序数组** ⇒ 变异体 = 去掉 `clipping &&`
 *     （非削波时也染状态戳色 ⇒ W3b 红）。
 *   · W4 零颜色字面量：两件生产件剥注释后 hex 0 命中 ∧ 渲染出的每个着色面都是 `var(--ed-*)`
 *     ⇒ 变异体 = 写 `backgroundColor: "#0d9488"`。
 *
 * 副作用：无（只读磁盘 + 只挂载 jsdom 容器）。边界：jsdom **无排版引擎** ⇒ 本文件判得到
 *   「条数 / 次序 / 色值 / 属性」，**判不到**「波形看起来像波形」（观感面进报告 `## 诚实边界`）。
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import Waveform, {
  WAVEFORM_BARS,
  WAVEFORM_CLIP_BARS,
  WAVEFORM_FLOOR_DB,
  inClipZone,
  litBars,
} from "./Waveform";

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
/** 判据要扫的**两件生产件**（计划 V3 逐字点名 `Waveform.tsx` 与 `shell/LiveBar.tsx`）。 */
const PRODUCTION = ["Waveform.tsx", join("..", "shell", "LiveBar.tsx")] as const;
/** 剥注释（本批已三犯「注释里的字面量骗过整文件扫描器」）：块注释 + 行注释各抹一次。 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/** `#` + 3/6 位 hex（含 4/8 位带 alpha 的形态：漏掉它等于给棘轮开后门）。 */
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

/** 波形根元素（`testId` 默认 `waveform`）。 */
function root(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>('[data-testid="waveform"]');
  if (el === null) throw new Error("找不到波形根元素（data-testid=waveform）");
  return el;
}
/** 逐条子元素（**按序**读，供逐序数组比对）。 */
const barsOf = (el: HTMLElement): HTMLElement[] => Array.from(el.children) as HTMLElement[];

describe("W1 · div 条阵列（R4.3：禁用内联 svg）", () => {
  it("条全是 div · 条数 == bars · 索引逐序 0..bars-1 · 内联 svg 计数为 0", () => {
    render(<Waveform rms={0.3} clipping={false} bars={24} />);
    const el = root();
    expect(el.querySelectorAll("svg"), "出现了内联 svg 元素（R4.3 明禁）").toHaveLength(0);
    const bars = barsOf(el);
    expect(bars.map((b) => b.tagName), "条元素必须全是 div（R4.3「div 条阵列」）").toEqual(
      Array.from({ length: 24 }, () => "DIV"),
    );
    expect(bars.map((b) => b.getAttribute("data-bar")), "条按序编号 0..23").toEqual(
      Array.from({ length: 24 }, (_, i) => String(i)),
    );
    expect(el.getAttribute("data-bars"), "根上的条数读数 == 传入的 bars").toBe("24");
  });

  it("条数读数跟手：bars=7 与 bars=1 各渲染对应条数（防「常数条数」假绿）", () => {
    render(<Waveform rms={0.3} clipping={false} bars={7} />);
    expect(barsOf(root())).toHaveLength(7);
    cleanup();
    render(<Waveform rms={0.3} clipping={false} bars={1} />);
    expect(barsOf(root())).toHaveLength(1);
  });

  it("边界：`bars <= 0` 一条不渲染（负值 / 0 都不许把假条数流进 flex 计算）", () => {
    render(<Waveform rms={0.5} clipping={false} bars={0} />);
    expect(barsOf(root())).toHaveLength(0);
    cleanup();
    render(<Waveform rms={0.5} clipping={false} bars={-3} />);
    expect(barsOf(root()), "负条数必须归零").toHaveLength(0);
    expect(root().getAttribute("data-bars")).toBe("0");
  });

  it("默认条数 == 导出的具名常量（R27.1：数字只有一个落点，别处不许再写 32）", () => {
    render(<Waveform rms={0.3} clipping={false} />);
    expect(root().getAttribute("data-bars")).toBe(String(WAVEFORM_BARS));
    expect(barsOf(root())).toHaveLength(WAVEFORM_BARS);
  });
});

describe("W2 · RMS → 点亮条数（对数映射 · 单调不减）", () => {
  it("取样点上的读数**逐序等于硬编码期望**（期望不是从实现反推的）", () => {
    const samples = [0, 0.001, 0.01, 0.0316, 0.1, 0.316, 1];
    expect(samples.map((r) => litBars(r, 32))).toEqual([0, 0, 11, 16, 21, 27, 32]);
    expect(samples.map((r) => litBars(r, 24))).toEqual([0, 0, 8, 12, 16, 20, 24]);
    expect(litBars(1, 0), "0 条时上限就是 0").toBe(0);
    expect(inClipZone(0, 6), "热区在右端（左端不是热区）").toBe(false);
    expect(inClipZone(5, 6)).toBe(true);
    expect(inClipZone(6 - WAVEFORM_CLIP_BARS, 6), "热区起点 = bars - CLIP_BARS").toBe(true);
    expect(WAVEFORM_FLOOR_DB, "映射下界是具名常量（-60dB）").toBe(-60);
  });

  it("单调不减：0..1 全程 2001 个取样点都不出现回退（越响越短 = 读数坏了）", () => {
    const counts = Array.from({ length: 2001 }, (_, i) => litBars(i / 2000, 32));
    const drops = counts.filter((n, i) => i > 0 && n < counts[i - 1]);
    expect(drops, "出现回退点 ⇒ 波形会「越响越短」").toEqual([]);
    expect(counts[0], "rms=0 ⇒ 0 条").toBe(0);
    expect(counts[2000], "rms=1 ⇒ 满格").toBe(32);
  });

  it("越界一律夹取：NaN / 负值 / Infinity ⇒ 0 条（永不抛、永不把 NaN 漏进 style）", () => {
    expect([Number.NaN, -1, -0.5, Number.POSITIVE_INFINITY].map((r) => litBars(r, 32))).toEqual([0, 0, 0, 0]);
    expect(litBars(2, 32), "超过满刻度的 rms 也不许超过条数").toBe(32);
  });

  it("rms=0 ⇒ **双断言**：根上 data-lit == 0 **且**逐条 data-lit 全 false", () => {
    render(<Waveform rms={0} clipping={false} bars={8} />);
    const el = root();
    expect(el.getAttribute("data-lit")).toBe("0");
    expect(barsOf(el).map((b) => b.getAttribute("data-lit"))).toEqual(
      Array.from({ length: 8 }, () => "false"),
    );
  });

  it("DOM 与纯函数同源：每条的 data-lit 就是 `i < litBars(...)`（逐序数组，不是抽查）", () => {
    render(<Waveform rms={0.1} clipping={false} bars={24} />);
    const expected = Array.from({ length: 24 }, (_, i) => (i < litBars(0.1, 24) ? "true" : "false"));
    expect(barsOf(root()).map((b) => b.getAttribute("data-lit"))).toEqual(expected);
    expect(expected.filter((v) => v === "true"), "点亮 16 条（不是 0 也不是 24）").toHaveLength(16);
  });
});

describe("W3 · 削波热区（clipping ⇒ 右端两条染状态戳色）", () => {
  it("clipping ⇒ 热区标记与色值都落在**右端恰 2 条**（两个逐序数组）", () => {
    render(<Waveform rms={1} clipping bars={6} />);
    const bars = barsOf(root());
    expect(bars.map((b) => b.getAttribute("data-clip"))).toEqual([
      "false", "false", "false", "false", "true", "true",
    ]);
    expect(bars.map((b) => b.style.backgroundColor)).toEqual([
      "var(--ed-ink-1)", "var(--ed-ink-1)", "var(--ed-ink-1)", "var(--ed-ink-1)",
      "var(--ed-stamp)", "var(--ed-stamp)",
    ]);
  });

  it("非削波 ⇒ 热区标记与状态戳色都不出现（反例守卫：防「恒热」假绿）", () => {
    render(<Waveform rms={1} clipping={false} bars={6} />);
    const bars = barsOf(root());
    expect(bars.map((b) => b.getAttribute("data-clip"))).toEqual(Array.from({ length: 6 }, () => "false"));
    expect(
      bars.map((b) => b.style.backgroundColor).filter((c) => c.includes("stamp")),
      "非削波时不许有状态戳色",
    ).toEqual([]);
  });

  it("未点亮的条是**底槽**不是色块：rms=0.01（11/32）时前 11 条上墨、其余是底槽", () => {
    render(<Waveform rms={0.01} clipping bars={32} />);
    const colors = barsOf(root()).map((b) => b.style.backgroundColor);
    expect(colors.slice(0, 11), "点亮段（含热区之外的 9 条）").toEqual(
      Array.from({ length: 11 }, () => "var(--ed-ink-1)"),
    );
    expect(colors.slice(11), "未点亮段一律底槽色（削波也不许把底槽染色）").toEqual(
      Array.from({ length: 21 }, () => "var(--ed-bg-sunken)"),
    );
  });
});

describe("W4 · 零颜色字面量（色值只在 ui/tokens.css 与 token 生成器里）", () => {
  it("两件生产件**剥注释后** hex 字面量 0 命中", () => {
    const hits = PRODUCTION.flatMap((rel) =>
      [...stripComments(readFileSync(join(HERE, rel), "utf8")).matchAll(HEX_LITERAL)].map(
        (m) => `${rel}: ${m[0]}`,
      ),
    );
    expect(hits, "新文件里出现颜色字面量（一律走 var(--ed-*)）").toEqual([]);
    // 仪器自证：同一支正则对一条已知含字面量的样本必须报出来（否则上面那条是空真）
    expect([..."backgroundColor: \"#0d9488\"".matchAll(HEX_LITERAL)].map((m) => m[0])).toEqual(["#0d9488"]);
  });

  it("行为级同向：渲染出的每个着色面都是 `var(--ed-*)`（读的是真产出，不是源码文本）", () => {
    render(<Waveform rms={1} clipping bars={6} />);
    const colors = barsOf(root()).map((b) => b.style.backgroundColor);
    expect(colors.filter((c) => !c.startsWith("var(--ed-")), "有非 token 色").toEqual([]);
    expect(colors.length, "读到 0 个着色面 ⇒ 本条是空真").toBe(6);
  });
});
