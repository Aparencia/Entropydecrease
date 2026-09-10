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
import { renderAll, CONTRAST_BASELINE } from "../../scripts/gen-tokens.mjs";
import { contrastRatio } from "./contrast";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 行尾归一。**为何不能逐字节比**：本仓库没有 `.gitattributes`，而 `core.autocrlf=true`,
 * 因此新克隆/新检出时 git 会把 LF 转成 CRLF，工作区文件与生成器的 `\n` 模板将逐字节不等 ——
 * 逐字节断言会在别人机器上失败，且失败原因与「有人手改了产物」无关，属假阳性。
 * 归一后仍能守住真正要守的东西：**内容**漂移（手改即内容不同）。
 */
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");

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
  // 全仓仅此一份公式实现 —— 不存在「两套公式分叉」的面。
  // （更正记录：初版计划曾误称「生成器自带等价实现」，T2 评审据此提了 Important 发现，核实后更正。）
  it("生成器数据经权威对比度实现复核仍达标", () => {
    const by = (n: string) => COLOR_TOKENS.find((t) => t.name === n);
    for (const theme of THEMES) {
      const { canvas, surface } = CONTRAST_BASELINE[theme];
      expect(contrastRatio(by("ink-2")![theme], surface), `${theme} ink-2/面`).toBeGreaterThanOrEqual(11);
      expect(contrastRatio(by("ink-3")![theme], surface), `${theme} ink-3/面`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(by("ink-4")![theme], surface), `${theme} ink-4/面`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(by("ink-2")![theme], canvas), `${theme} ink-2/纸`).toBeGreaterThanOrEqual(10.5);
      expect(contrastRatio(by("due")![theme], canvas), `${theme} due/纸`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
