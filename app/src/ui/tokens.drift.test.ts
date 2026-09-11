/**
 * @ai-context token 产物漂移守卫（ADR-032）。
 *
 * Why：tokens.css / tokens.gen.ts 是生成物，唯一合法改法是改生成器再重跑。
 * 没有守卫时，下一个人会直接手改产物，两份数据随即分叉且无人察觉。
 *
 * 边界：本文件只校验「产物 == 生成器输出」与「门面可见性」；
 * 规范值本身的正确性由 scripts/gen-tokens.test.mjs 负责。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, SCALE_TOKENS, THEMES, cssVar, varRef } from "./tokens";
import { renderAll, CONTRAST_BASELINE, normalizeEol } from "../../scripts/gen-tokens.mjs";
import { contrastRatio } from "./contrast";

const HERE = dirname(fileURLToPath(import.meta.url));

// 行尾归一：**不逐字节比** —— 本仓库没有 `.gitattributes` 且 `core.autocrlf=true`，
// 新克隆/新检出时 git 会把 LF 转成 CRLF，逐字节断言在别人机器上是假阳性。
// 口径不在此重述：直接 import 生成器的实现，免得两边各持一份再次分叉（终局评审 C3）。

describe("token 产物漂移守卫", () => {
  it("tokens.css 与生成器输出一致（手改即失败）", () => {
    const onDisk = readFileSync(join(HERE, "tokens.css"), "utf8");
    expect(normalizeEol(onDisk)).toBe(normalizeEol(renderAll().css));
  });

  it("tokens.gen.ts 与生成器输出一致（手改即失败）", () => {
    const onDisk = readFileSync(join(HERE, "tokens.gen.ts"), "utf8");
    expect(normalizeEol(onDisk)).toBe(normalizeEol(renderAll().ts));
  });
});

describe("token 门面一致性", () => {
  it("COLOR_TOKENS 经由门面可见且非空", () => {
    expect(COLOR_TOKENS.length).toBe(16);
  });

  it("cssVar / varRef 加 --ed- 前缀", () => {
    expect(cssVar("ink-2")).toBe("--ed-ink-2");
    expect(varRef("ink-2")).toBe("var(--ed-ink-2)");
  });

  it("两档主题常量完整", () => {
    expect([...THEMES]).toEqual(["light", "dark"]);
  });

  it("SCALE_TOKENS 的间距与圆角与规范一致", () => {
    expect([...SCALE_TOKENS.spaceScale]).toEqual([4, 8, 12, 16, 24, 32, 48]);
    expect(SCALE_TOKENS.radiusScale.map((r) => r.px)).toEqual([3, 5, 8, 10]);
  });

  // 生成器只持有数据、不含任何 WCAG 计算；此处用 Task 2 的权威实现校验这份数据。
  // WCAG 实现范围：**本批三个模块之间**只有一份公式实现（src/ui/contrast.ts）——
  // 生成器数据与两个测试文件都走它，故本批之内不存在「两套公式分叉」的面。
  // 既存例外（终局评审 I8）：scripts/gen-mark-css.mjs 的 note-mark 调色板自带第二份
  // lum/ratio，其产物 src/note-mark.css 目前**无漂移守卫** —— 已登记于批 0-A 计划
  // 「交接给 0-B/0-C/0-D 的硬前置」，待并入或显式豁免。
  // （更正记录：初版计划曾误称「生成器自带等价实现」，T2 评审据此提了 Important 发现，核实后更正。）
  it("生成器数据经权威对比度实现复核仍达标", () => {
    const by = (n: string) => COLOR_TOKENS.find((t) => t.name === n);
    for (const theme of THEMES) {
      const { canvas, surface } = CONTRAST_BASELINE[theme];
      // 基准必须与底 token 同源，否则守卫会对着旧底色静默测错底：只改 bg-surface 而不同步
      // 基准时，ink-2 的真实比值会跌破 §4.3 的 11:1 而断言仍绿（终局评审 C2）。
      expect(by("bg-canvas")![theme]).toBe(canvas);
      expect(by("bg-surface")![theme]).toBe(surface);
      expect(contrastRatio(by("ink-2")![theme], surface), `${theme} ink-2/面`).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(by("ink-3")![theme], surface), `${theme} ink-3/面`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(by("ink-4")![theme], surface), `${theme} ink-4/面`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(by("ink-2")![theme], canvas), `${theme} ink-2/纸`).toBeGreaterThanOrEqual(10.5);
      expect(contrastRatio(by("due")![theme], canvas), `${theme} due/纸`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("token 接线守卫", () => {
  // Why：未接线的 `var(--ed-*)` **不会报错**，只会静默取不到值（见 tokens.ts 头注）。
  // 批 0-D 的原语全靠这些变量着色/取阴影，漏一次 import 就会让整层原语在运行时失效，
  // 而所有单元测试仍全绿 —— 故把这条从纪律变成机器判据。
  it("应用入口 import 了 ui/tokens.css（未接线则所有 var(--ed-*) 运行时无值）", () => {
    const main = readFileSync(join(HERE, "..", "main.tsx"), "utf8");
    expect(main, "main.tsx 必须 import ./ui/tokens.css（见批 0-D 控制方裁决）").toContain('import "./ui/tokens.css";');
  });
});
