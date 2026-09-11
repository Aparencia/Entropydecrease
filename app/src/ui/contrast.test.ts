/**
 * @ai-context src/ui/contrast.ts（WCAG 对比度纯函数）的单测（ADR-032）。
 *
 * Why：规范 §4.3 的硬数字（11 / 4.5 / 3 / 10.5）是本批验收口径，必须由机器而非人眼守护；
 * 同时守住 hex 解析的边界（非法输入抛错而非静默回退）与两档不可合并且值不得回归。
 * 批 0-D 追加：剪报底纹（`--ed-mark-clip`）作为**第三种底**参与判定 —— §4.3 的阈值是以
 * 「阅读面」为基准定的，把文字放到剪报底上会换底，故「底 × 墨」组合必须逐对实测。
 */
import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA, parseHex, relativeLuminance } from "./contrast";
import { COLOR_TOKENS } from "./tokens";

describe("parseHex", () => {
  it("解析 6 位 hex", () => {
    expect(parseHex("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("解析 3 位缩写 hex 并按位翻倍", () => {
    expect(parseHex("#0AF")).toEqual({ r: 0, g: 170, b: 255 });
  });

  it("大小写不敏感", () => {
    expect(parseHex("#aabbcc")).toEqual(parseHex("#AABBCC"));
  });

  it("缺 # 前缀抛错", () => {
    expect(() => parseHex("FFFFFF")).toThrow(/hex/i);
  });

  it("长度非法抛错", () => {
    expect(() => parseHex("#FFFF")).toThrow(/hex/i);
  });

  it("含非 hex 字符抛错", () => {
    expect(() => parseHex("#GGGGGG")).toThrow(/hex/i);
  });

  it("空值抛错", () => {
    expect(() => parseHex("")).toThrow(/hex/i);
  });
});

describe("relativeLuminance", () => {
  it("纯黑为 0", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("纯白为 1", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("处于 0..1 之间", () => {
    const l = relativeLuminance("#3A3A36");
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
  });
});

describe("contrastRatio", () => {
  it("黑白对比为 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("同色对比为 1:1", () => {
    expect(contrastRatio("#3A3A36", "#3A3A36")).toBeCloseTo(1, 5);
  });

  it("参数顺序不影响结果", () => {
    expect(contrastRatio("#3A3A36", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#3A3A36"),
      10,
    );
  });

  // 规范 §4.3 的 7 条硬数字 —— 本块内 7 个「规范：」断言就是验收口径的机器化
  // （§4.1 只定义色值，不含对比度阈值；阈值与四档墨度的升档规则都在 §4.3）
  it("规范：ink-2 对阅读面 >= 11:1", () => {
    expect(contrastRatio("#3A3A36", "#FFFFFF")).toBeGreaterThanOrEqual(11);
  });

  it("规范：ink-2 对纸底 >= 10.5:1（纸底比面低一档，实测 10.95）", () => {
    expect(contrastRatio("#3A3A36", "#FBFAF8")).toBeGreaterThanOrEqual(10.5);
  });

  it("规范：ink-3 对纸底 >= 4.5:1", () => {
    expect(contrastRatio("#6E6E68", "#FBFAF8")).toBeGreaterThanOrEqual(4.5);
  });

  it("规范：due 亮档两次修正后达标（#B26A12 4.06:1 → #A05F10 → 本值）", () => {
    expect(contrastRatio("#9F5E10", "#FBFAF8"), "due/纸").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#9F5E10", "#FFFFFF"), "due/面").toBeGreaterThanOrEqual(4.5);
    // 第二次修正的求解规则：剪报底须留 ≥0.05 余量（4.5 + 0.05 = 4.55），
    // 因为 hex 量化与将来底色微调都会吃掉没有余量的值（#A05F10 正是卡在 4.4950 的反例）
    expect(contrastRatio("#9F5E10", "#F4F1E9"), "due/剪报底").toBeGreaterThanOrEqual(4.55);
    // 反例守门：两个旧值不得回归（各自在不同底上不达标）
    expect(contrastRatio("#B26A12", "#FBFAF8")).toBeLessThan(4.5);
    expect(contrastRatio("#A05F10", "#F4F1E9")).toBeLessThan(4.5);
  });

  it("规范：ink-4 对纸底允许低于 4.5 但不低于 3:1", () => {
    const r = contrastRatio("#909088", "#FBFAF8");
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });

  it("规范：暗档 ink-4 对暗面 >= 3:1", () => {
    expect(contrastRatio("#6E6A62", "#1C1A18")).toBeGreaterThanOrEqual(3);
  });

  it("规范：暗档 ink-2 对暗面 >= 11:1", () => {
    expect(contrastRatio("#D6D1C8", "#1C1A18")).toBeGreaterThanOrEqual(11);
  });

  it("亮档强调色若照搬暗档会不合格（反例守门）", () => {
    // 规范 §4.1：同一颜色两档差异可达 4 倍 —— 此断言防止有人把两档合并成一个值
    expect(contrastRatio("#17C3B2", "#FFFFFF")).toBeLessThan(3);
  });
});

describe("meetsAA", () => {
  it("正文阈值 4.5", () => {
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
  });

  it("大字阈值 3", () => {
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
  });
});

// ---- 剪报底纹（0-D 硬前置 · 规范 §4.4 的防御性规则）------------------------------------
// 裁决（2026-09-11 控制方）：剪报底纹**只改背景**，文字仍用所在层级的 `--ed-ink-*`，
// **不新增前景 token**；因此原来按「面」定的阈值在这里要逐对重测一遍。
// 实测（Task 1 报告，亮档底 `#F4F1E9`）：ink-1 15.4197 · ink-2 10.1204 · ink-3 4.5454 ·
// stamp 5.7679 · ok 4.6310 · due 4.5571 · link 5.3968；**ink-4 仅 2.8489 ⇒ 禁止组合**。
// 暗档底 `#221F1B`：ink-1 14.5564 · ink-2 10.7931 · ink-3 5.5052 · ink-4 3.0480 ·
// stamp 4.6533 · ok 5.9688 · due 7.4863 · link 5.8732。
describe("剪报底纹上的文字（底 × 墨组合 · 规范 §4.4）", () => {
  const by = (n: string) => COLOR_TOKENS.find((t) => t.name === n);
  const clipOf = (theme: "light" | "dark") => by("mark-clip")![theme];
  const AA: ReadonlyArray<readonly [string, "light" | "dark"]> = [
    ["ink-1", "light"], ["ink-1", "dark"],
    ["ink-2", "light"], ["ink-2", "dark"],
    ["ink-3", "light"], ["ink-3", "dark"],
    ["stamp", "light"], ["stamp", "dark"],
    ["ok", "light"], ["ok", "dark"],
    ["due", "light"], ["due", "dark"],
    ["link", "light"], ["link", "dark"],
    ["ink-4", "dark"], // ink-4 是过渡态：只须 ≥3（§4.3）；**亮档不在名单里 —— 见下面反例守门**
  ];
  for (const [name, theme] of AA) {
    it(`${theme} · ${name} / 剪报底`, () => {
      const floor = name === "ink-4" ? 3 : 4.5;
      expect(contrastRatio(by(name)![theme], clipOf(theme)), `${theme} ${name}/剪报底`).toBeGreaterThanOrEqual(floor);
    });
  }

  // ★ 反例守门（范式 B，同 `#B26A12` 的写法）：把「禁止组合」钉成机器判据 ——
  // 将来若有人把 ink-4 的文字放到剪报底纹上，这条断言就是那份"为什么不行"的证据。
  it("规范：ink-4 亮档不得用于剪报底纹（实测低于其 3:1 过渡态例外）", () => {
    expect(contrastRatio(by("ink-4")!.light, clipOf("light"))).toBeLessThan(3);
  });

  it("规范：due 亮档第二次修正——刚被替换掉的 #A05F10 在剪报底上仍不达标（防回归）", () => {
    expect(contrastRatio("#A05F10", clipOf("light"))).toBeLessThan(4.5);
    expect(contrastRatio(by("due")!.light, clipOf("light"))).toBeGreaterThanOrEqual(4.5);
  });
});
