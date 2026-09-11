import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * @ai-context **棘轮守卫**：禁止新增内联 `<svg>`（ADR-032 决策 6 的执行手段）。
 *
 * Why：本批建立了图标层，但批 4 之前不会有任何机制阻止新代码继续手写 `<svg>` —— 那样图标层
 * 会退化成「又一套并存的东西」。棘轮的做法是：把改造前就存在的内联 svg 文件**冻结成名单**，
 * 之后**只允许减少、不允许增加**。它不要求本批清理存量（那是批 4 的事），只要求不倒退。
 *
 * 副作用：只读磁盘（遍历 `src/`）。不修改任何文件。
 * 边界：扫描口径是「含 `<svg` 的 `.ts`/`.tsx`」——不含 `.css`（CSS 里的 svg 是 data-uri 背景图，
 * 与图标层无关）。清单里的文件在批 4 迁完后应从名单删除，届时本测试的名单会自然缩短。
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ICONS_DIR = join(SRC, "ui", "icons");

/**
 * 改造前就存在的内联 svg 文件（相对 `app/src`，正斜杠）—— 只允许减少。
 *
 * 实测：改造前 src/ 下无内联 svg（基线为空，任何新增都会被抓）
 */
const FROZEN_BASELINE: readonly string[] = [
  // 由 Task 3 Step 1 的实测输出逐行填入（保持排序）
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function filesWithInlineSvg(): string[] {
  return collectFiles(SRC)
    // 排除图标层自身（它当然要能写 svg）。比较**必须带上分隔符**：裸的 `startsWith(ICONS_DIR)`
    // 会把 `ui/icons-legacy/` 这类同前缀的兄弟目录一并静默豁免 —— 守卫会悄悄失效（实测已复现）。
    .filter((f) => !f.startsWith(ICONS_DIR + sep))
    .filter((f) => readFileSync(f, "utf8").includes("<svg"))
    .map((f) => relative(SRC, f).split(sep).join("/"))
    .sort();
}

describe("内联 svg 棘轮", () => {
  it("不得新增含内联 svg 的文件（只允许减少）", () => {
    const current = filesWithInlineSvg();
    const added = current.filter((f) => !FROZEN_BASELINE.includes(f));
    expect(added, `新增了内联 svg 的文件（请改用 <Icon />）：\n${added.join("\n")}`).toEqual([]);
  });

  it("基线名单本身没有过期项（已迁完的文件要及时从名单删除）", () => {
    const current = new Set(filesWithInlineSvg());
    const stale = FROZEN_BASELINE.filter((f) => !current.has(f));
    expect(stale, `基线里这些文件已无内联 svg，请从名单删除：\n${stale.join("\n")}`).toEqual([]);
  });
});
