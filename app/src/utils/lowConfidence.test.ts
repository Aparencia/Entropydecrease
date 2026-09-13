/**
 * lowConfidence.test.ts — 低置信类名判定（批 7 T3：自 `components/structuredBlocks.test.ts` 的
 * `describe("lowConfidenceClass")` 原样迁入；用例与断言逐字保留，只换 import 源）。
 *
 * @ai-context Why 必须迁而不是随模块删除：`lowConfidenceClass` 是 C4.2 里的**活导出**
 *   （生产调用点 = `components/session-detail/SessionRawView.tsx`），被删的只有测试-only 的两个
 *   渲染器（`renderLatex` / `renderMarkdownTable`）。删除与迁移**同批**做，才不会留下
 *   「实现还在、覆盖已丢」的中间态（控制方裁决）。
 * @ai-context 本文件守的是**阈值语义**（`< 0.5` 命中；`0.5` / `null` / `undefined` ⇒ 空串）；
 *   类名**字面量**的镜像一致性另由 `motion/env.test.ts` 的 V6 对拍守住（两者分工不重叠）。
 * @ai-context 副作用：无（纯函数用例，不读 store、不发请求、不写盘）。
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { walkSources, relOf, readLines } from "../ui/primitives/sliceScan";
import { lowConfidenceClass } from "./lowConfidence";

describe("lowConfidenceClass", () => {
  it("低置信（<0.5）返回标记类名，其余返回空串", () => {
    // Assert
    // 批 6 T13（R12.1）：类名由 `ed-low-confidence` 改为 `<既有基类>--<修饰>` 形状
    // （`ed-text` 基类的修饰类）—— 旧名字会被 motion-coverage.test.ts 的「未登记基类」判据拦下。
    expect(lowConfidenceClass(0.3)).toBe("ed-text--low-confidence");
    expect(lowConfidenceClass(0.5)).toBe("");
    expect(lowConfidenceClass(null)).toBe("");
    expect(lowConfidenceClass(undefined)).toBe("");
  });
});

/**
 * C4.2 的**加宽判据**：`lowConfidenceClass` 的**生产调用点 ≥2 个文件**（批 7 T20 落地第 2 点）。
 *
 * @ai-context Why 这条判据必须存在：C4.2 逐字「留 + **加宽到 ≥2 生产调用点**」是本批对 R12.4
 *   环境层第 ③ 件的**唯一可机器核对的口径**；若只数「有没有人 import」而不数**调用形态**，
 *   把调用点删掉只留 import 也能绿（真空判据）。故本判据**两形态并列**（import 形态 ∧ 调用形态），
 *   并要求两形态命中的**文件集逐字相等** —— 只删一边必红。
 * @ai-context 域口径：`app/src/**` 的 `.ts`/`.tsx` **减** `*.test.*` **减**定义模块自身
 *   （`utils/lowConfidence.ts`）—— 定义不是调用点；`ui/primitives/**` **不排除**（它是原语层，
 *   若真在那里调用，那也是一个真实调用点）。
 * @ai-context 读法：经 `sliceScan.readLines` 的 `stripped`（**先剥注释、抹为等长空白**）⇒
 *   文件头注释里提到本函数名不产生幻影调用点（B9 第 9 条：整文件扫描器最常被注释误伤）。
 * @ai-context 正控 / 负控：正控 = `session-detail/SessionRawView.tsx`（批 6 T28 的**第 1 点**，
 *   它掉了说明扫描器坏了，而不是"第 2 点没做"）；负控 = 一个不存在于全仓的标识符（必须 0 命中）
 *   ⇒ 两个方向都能红，判据非空转。
 */
describe("C4.2 · lowConfidenceClass 的生产调用点 ≥2（多形态并列 + 正控/负控）", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
  const SELF = "utils/lowConfidence.ts";
  const DEF_FILE = "utils/lowConfidence.ts";
  /** 两形态：① import 说明符形态（`from ".../lowConfidence"`）② 调用形态 `lowConfidenceClass(` */
  const IMPORT_FORM = /from\s+["'][^"']*\/lowConfidence["']/g;
  const CALL_FORM = /\blowConfidenceClass\s*\(/g;

  /** 命中文件集（相对 `app/src` 的正斜杠路径；**先剥注释**） */
  const filesMatching = (re: RegExp): string[] => {
    const out: string[] = [];
    for (const abs of walkSources(SRC)) {
      const rel = relOf(SRC, abs);
      if (/\.test\.tsx?$/.test(rel) || rel === DEF_FILE || rel === SELF) continue;
      const text = readLines(abs).stripped.join("\n");
      if (new RegExp(re.source, "g").test(text)) out.push(rel);
    }
    return out.sort();
  };

  it("① 调用形态命中 ≥2 个生产文件，且 import 形态命中的文件集与它逐字相等", () => {
    const byCall = filesMatching(CALL_FORM);
    const byImport = filesMatching(IMPORT_FORM);
    expect(
      byCall.length,
      `C4.2「低置信 ≥2 生产调用点」未达成：调用形态只命中 ${byCall.length} 个文件（${byCall.join(" · ")}）`,
    ).toBeGreaterThanOrEqual(2);
    expect(byImport, "只删 import 或只删调用都会在这里红（两形态的文件集必须逐字相等）").toEqual(byCall);
  });

  it("② 正控（第 1 点仍在）· 负控（不存在的标识符 0 命中）· 定义模块与测试不计入", () => {
    const byCall = filesMatching(CALL_FORM);
    expect(byCall, "批 6 T28 的第 1 个调用点消失了 ⇒ 先查扫描器，再查代码").toContain(
      "components/session-detail/SessionRawView.tsx",
    );
    expect(byCall, "批 7 T20 的第 2 个调用点不在命中集里").toContain("views/session/SessionTriTrackView.tsx");
    expect(filesMatching(/\bzzzNoSuchSymbolZzz\s*\(/), "负控 0 命中 ⇒ 扫描器不是恒真").toEqual([]);
    expect(byCall, "定义模块自身不算调用点").not.toContain(DEF_FILE);
  });
});
