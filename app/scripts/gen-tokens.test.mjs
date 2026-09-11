/**
 * @ai-context gen-tokens 生成器的规范数据守卫（ADR-032）。
 *
 * Why：生成器是 token 的单一真源，它一旦被改错（漏 token、写坏 hex、调低某档颜色），
 * 全站样式会在无人察觉的情况下退化。本文件把「规范 §4.1/§4.2 说了什么」变成可执行断言。
 *
 * 边界：对比度用 Task 2 的 src/ui/contrast.ts 权威实现复核；生成器本身不做任何 WCAG 计算。
 * WCAG 实现范围：**本批三个模块之间**只有一份公式实现（src/ui/contrast.ts）。
 * 既存例外（终局评审 I8）：scripts/gen-mark-css.mjs 的 note-mark 调色板自带第二份 lum/ratio，
 * 其产物 src/note-mark.css 目前**无漂移守卫** —— 已登记于批 0-A 计划「交接给 0-B/0-C/0-D 的硬前置」，
 * 待并入或显式豁免。
 */
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, CONTRAST_BASELINE, SCALE_SOURCE, SHADOW_TOKENS, TYPE_SCALE, renderAll } from "./gen-tokens.mjs";
import { contrastRatio } from "../src/ui/contrast.ts";

describe("gen-tokens 规范数据", () => {
  it("每个 token 名唯一", () => {
    const names = COLOR_TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("两档值齐全且为合法 hex", () => {
    for (const t of COLOR_TOKENS) {
      expect(t.light, `${t.name}.light`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.dark, `${t.name}.dark`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(t.usage.length, `${t.name}.usage 不得为空`).toBeGreaterThan(0);
    }
  });

  it("usage 串不得含注释终止符（会被写进 CSS 注释，含 `*/` 即截断后续声明）", () => {
    for (const t of COLOR_TOKENS) {
      expect(t.usage, `${t.name}.usage`).not.toContain("*/");
    }
  });

  it("规范 §4.1 的 16 个颜色 token 一个不少", () => {
    expect(COLOR_TOKENS.map((t) => t.name).sort()).toEqual([
      "bg-canvas", "bg-raised", "bg-sunken", "bg-surface",
      "border", "border-strong",
      "due", "ink-1", "ink-2", "ink-3", "ink-4",
      "link", "mark-clip", "ok", "overlay", "stamp",
    ]);
  });

  it("四档墨度在两档下都满足规范对比度（面为正文基准，纸放宽半档）", () => {
    const by = (n) => COLOR_TOKENS.find((t) => t.name === n);
    const base = CONTRAST_BASELINE;
    for (const theme of ["light", "dark"]) {
      // 基准必须与底 token 同源，否则守卫会对着旧底色静默测错底：只改 bg-surface 而不同步
      // 基准时，ink-2 的真实比值会跌破 §4.3 的 11:1 而断言仍绿（终局评审 C2）。
      expect(by("bg-canvas")[theme], `${theme} 基准/纸底`).toBe(base[theme].canvas);
      expect(by("bg-surface")[theme], `${theme} 基准/阅读面`).toBe(base[theme].surface);
      expect(contrastRatio(by("ink-2")[theme], base[theme].surface), `${theme} ink-2/面`).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(by("ink-3")[theme], base[theme].surface), `${theme} ink-3/面`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(by("ink-4")[theme], base[theme].surface), `${theme} ink-4/面`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(by("ink-2")[theme], base[theme].canvas), `${theme} ink-2/纸`).toBeGreaterThanOrEqual(10.5);
      expect(contrastRatio(by("ink-4")[theme], base[theme].canvas), `${theme} ink-4/纸`).toBeGreaterThanOrEqual(3);
    }
  });

  it("语义色在两档下都达 AA 正文线（修掉现状 #9CA3AF 的 2.54:1）", () => {
    const by = (n) => COLOR_TOKENS.find((t) => t.name === n);
    const base = CONTRAST_BASELINE;
    for (const theme of ["light", "dark"]) {
      for (const name of ["link", "stamp", "ok", "due"]) {
        expect(contrastRatio(by(name)[theme], base[theme].surface), `${theme} ${name}/面`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(by(name)[theme], base[theme].canvas), `${theme} ${name}/纸`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("renderAll", () => {
  it("是纯函数：两次调用结果逐字节相同", () => {
    expect(renderAll()).toEqual(renderAll());
  });

  it("CSS 含 :root 亮档与 [data-theme=\"dark\"] 暗档", () => {
    const { css } = renderAll();
    expect(css).toContain(":root");
    expect(css).toContain('[data-theme="dark"]');
  });

  it("每个颜色 token 在两档各出现一次，且带 --ed- 前缀", () => {
    const { css } = renderAll();
    for (const t of COLOR_TOKENS) {
      const varName = `--ed-${t.name}`;
      // 必须逐「声明」计数而非子串计数：`--ed-border` 是 `--ed-border-strong` 的前缀，
      // 裸 split 会把 strong 的两行也算进来（4 而非 2）。`(?![\\w-])` 只认完整变量名。
      const hits = css.match(new RegExp(`${varName}(?![\\w-])`, "g"))?.length ?? 0;
      // 亮档 1 次 + 暗档 1 次；overlay 两档同值仍各写一次（可读性优先于去重）
      expect(hits, `${varName} 出现次数`).toBe(2);
    }
  });

  it("CSS 不含未加前缀的裸底色变量（防碰撞）", () => {
    const { css } = renderAll();
    expect(css).not.toMatch(/^\s*--bg-/m);
    expect(css).not.toMatch(/^\s*--ink-/m);
  });

  it("TS 产物导出 COLOR_TOKENS 与 SCALE_TOKENS", () => {
    const { ts } = renderAll();
    expect(ts).toContain("export const COLOR_TOKENS");
    expect(ts).toContain("export const SCALE_TOKENS");
    expect(ts).toContain("此文件由 scripts/gen-tokens.mjs 生成");
  });

  it("SCALE_SOURCE 覆盖三组字族、字阶、间距、圆角", () => {
    expect(SCALE_SOURCE.fontFamilyBody).toContain("Source Han Serif SC");
    expect(SCALE_SOURCE.fontFamilyMono).toContain("JetBrains Mono");
    expect(SCALE_SOURCE.spaceScale).toEqual([4, 8, 12, 16, 24, 32, 48]);
    expect(SCALE_SOURCE.radiusScale.map((r) => r.px)).toEqual([3, 5, 8, 10]);
    expect(SCALE_SOURCE.typeScale.length).toBeGreaterThanOrEqual(6);
  });

  // 规范 §4.2 字阶逐字为「25/600 · 17/600 · 15.5/1.9 · 13/20 · 12/18 · 11.5/16 mono（下界 12px）」：
  // 11.5/16 mono 是被**点名**的档位（等宽，用于时间码/元数据），括注的 12px 下界约束其余档。
  // 故硬下界钉在 11.5：既守住「消灭 10px/11px」，又不把 mono 档私下抬到 12px
  // —— 后者等于实现者替规范改设计值，超出本任务授权。
  it("字阶下界为 11.5px（规范点名的 mono 档；10px/11px 已消灭）", () => {
    const sizes = SCALE_SOURCE.typeScale.map((s) => Number.parseFloat(s));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11.5);
    // 下限之下只有这一个例外档位：若有人新增 11px，上面的断言会拦住
    expect(sizes.filter((n) => n < 12)).toEqual([11.5]);
  });
});

describe("字阶 CSS 变量（0-D 硬前置②）", () => {
  it("6 档 × size/line/weight 共 18 个变量都在，且与 TYPE_SCALE 一一对应", () => {
    const { css } = renderAll();
    expect(TYPE_SCALE).toHaveLength(6);
    for (const [i, t] of TYPE_SCALE.entries()) {
      const n = i + 1;
      expect(css, `第 ${n} 档 size`).toContain(`--ed-type-${n}-size: ${t.size}px;`);
      expect(css, `第 ${n} 档 line`).toContain(`--ed-type-${n}-line: ${t.line}px;`);
      expect(css, `第 ${n} 档 weight`).toContain(`--ed-type-${n}-weight: ${t.weight};`);
    }
    // 18 个变量名一个不多一个不少
    expect(css.match(/--ed-type-\d-(size|line|weight)/g)?.length).toBe(18);
  });

  it("无单位行高已消灭（反例守门：/1.9 不得回归）", () => {
    expect(SCALE_SOURCE.typeScale.join("|")).not.toContain("/1.9");
    expect(SCALE_SOURCE.typeScale[2]).toBe("15.5px/29.5px·400");
    expect(SCALE_SOURCE.typeScale[2]).toContain(`${TYPE_SCALE[2].line}px`);
  });

  it("字阶人读串与结构化真源同源（不允许各写一份）", () => {
    expect([...SCALE_SOURCE.typeScale]).toEqual(
      TYPE_SCALE.map((t) => `${t.size}px/${t.line}px·${t.weight}`),
    );
  });
});

describe("阴影 token（规范 §4.2②）", () => {
  it("两档齐全，值逐字等于用户裁决", () => {
    expect(SHADOW_TOKENS.map((t) => t.name)).toEqual(["shadow-1", "shadow-2"]);
    expect(SHADOW_TOKENS[0].light).toBe("0 1px 2px rgba(28,25,23,.06), 0 4px 12px rgba(28,25,23,.08)");
    expect(SHADOW_TOKENS[1].light).toBe("0 2px 4px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.14)");
  });

  it("暗档不是投影而是反相白描边，且两档各写一次", () => {
    const { css } = renderAll();
    for (const t of SHADOW_TOKENS) {
      expect(t.dark).toBe("0 0 0 1px rgba(255,255,255,.06)");
      expect(css).toContain(`--ed-${t.name}: ${t.light};`);
      expect(css).toContain(`--ed-${t.name}: ${t.dark};`);
    }
  });

  it("usage 串不得含注释终止符（会被写进 CSS 注释）", () => {
    for (const t of SHADOW_TOKENS) expect(t.usage).not.toContain("*/");
  });

  it("产物里不再出现「引用未定义变量」的说明（0-A 交接第 1① 条）", () => {
    const { css, ts } = renderAll();
    expect(css).not.toContain("0-D 前定值");
    expect(ts).not.toContain("0-D 前定值");
  });
});

// 求解规则（Task 1 Step 6）：保持色相、RGB 三通道按同一系数 f 缩放取整，
// 取满足「纸 ≥4.5 且 面 ≥4.5 且 剪报底 ≥4.55」的**最小加深量**。
// 4.55 = 4.5 底线 + 0.05 余量：`#A05F10` 正是「卡在 4.4950」的反例，
// hex 量化与将来底色微调都会吃掉没有余量的值 —— 故余量本身是硬要求。
describe("--due 亮档第二次对比度修正（剪报底余量规则）", () => {
  const CLIP = "#F4F1E9"; // --ed-mark-clip 亮档
  const by = (n) => COLOR_TOKENS.find((t) => t.name === n);

  it("新值满足全部三条（纸 / 面 / 剪报底），且剪报底留 ≥0.05 余量", () => {
    const due = by("due").light;
    expect(contrastRatio(due, "#FBFAF8"), "due/纸").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(due, "#FFFFFF"), "due/面").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(due, CLIP), "due/剪报底").toBeGreaterThanOrEqual(4.55);
  });

  it("反例守门：被替换掉的 #A05F10 在剪报底上仍低于 4.5（不得回归）", () => {
    expect(contrastRatio("#A05F10", CLIP)).toBeLessThan(4.5);
    // 更早的 #B26A12 连纸底都不过
    expect(contrastRatio("#B26A12", "#FBFAF8")).toBeLessThan(4.5);
  });

  it("暗档 #E0A44B 未被牵连改动（暗档剪报底 7.49:1 本就达标）", () => {
    expect(by("due").dark).toBe("#E0A44B");
    expect(contrastRatio(by("due").dark, "#221F1B")).toBeGreaterThanOrEqual(4.5);
  });
});
