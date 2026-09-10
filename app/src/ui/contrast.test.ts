import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA, parseHex, relativeLuminance } from "./contrast";

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

  // 规范 §4.1 的四个硬数字 —— 这四个断言就是验收口径的机器化
  it("规范：ink-2 对阅读面 >= 11:1", () => {
    expect(contrastRatio("#3A3A36", "#FFFFFF")).toBeGreaterThanOrEqual(11);
  });

  it("规范：ink-2 对纸底 >= 10.5:1（纸底比面低一档，实测 10.95）", () => {
    expect(contrastRatio("#3A3A36", "#FBFAF8")).toBeGreaterThanOrEqual(10.5);
  });

  it("规范：ink-3 对纸底 >= 4.5:1", () => {
    expect(contrastRatio("#6E6E68", "#FBFAF8")).toBeGreaterThanOrEqual(4.5);
  });

  it("规范：due 亮档达标（原 #B26A12 仅 4.06:1，低于正文线，已改 #A05F10）", () => {
    expect(contrastRatio("#A05F10", "#FBFAF8")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A05F10", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // 反例守门：旧值不得回归
    expect(contrastRatio("#B26A12", "#FBFAF8")).toBeLessThan(4.5);
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
