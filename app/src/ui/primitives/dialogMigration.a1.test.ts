// @vitest-environment node
/**
 * @ai-context 批 4 T5「20 弹层迁移 · A 组 1」的源码级守卫（7 个文件）。
 *
 * Why 源码级而不是渲染级：本组 7 个文件里 **5 个没有同名测试**（`GroupDeleteConfirm` 靠
 * `RouteInfoPopover.test.tsx` 间接覆盖，`GroupCreateDialog` 靠 `GroupSidebar.test.tsx`），
 * 故「迁移后不得再自建第二套弹层机制」这件事在**行为级无观测点**（ADR-033 §7 与 §4 的两条
 * 禁令需要一个能失败的地方）。
 *
 * 口径（四条，逐文件各判一次）：
 *   ① import 的是 **barrel**（`"../ui/primitives"`）—— 深导入会漏掉 `motion.css` 的
 *      `prefers-reduced-motion` 块（ADR-033 §1 的代价，不是风格偏好）；
 *   ② 无自建遮罩（`position: "fixed"`）；
 *   ③ 无 `addEventListener("keydown"` / `window.onkeydown`（ESC 栈归 `Modal`，ADR-033 §7）；
 *   ④ 无裸 `zIndex: <数字>`（层级归 `ui/zIndex.ts` 标尺；`zIndex("tier")` 是函数调用，不算）。
 *
 * ⑤ 全局：`role="dialog"` 的 **JSX 属性形态**只许出现在 `ui/primitives/Modal.tsx`（原语侧）与
 *    `shell/CommandPalette.tsx`（批 3 自足件，T9 收）；迁移面（`components/**` + `pages/**`）
 *    必须 **0 命中** —— 这同时是"迁移不是把原语复制粘贴进调用点"的机器判据。
 *
 * 边界（诚实登记）：
 *   ① **剥注释后再判**：`Modal.tsx` 自己在注释里写了 `role="dialog"`（说明性文字），不剥会把
 *      "解释"当"使用"（承批 0-D Task 10 的教训）。剥除器**不去字符串字面量**，且第 ⑤ 条用
 *      JSX **属性形态**（带 `="`）⇒ 测试里的 `getAttribute('role')` 不会被误命中。
 *   ② 本文件是**文本扫描**型守卫 ⇒ 自己的路径必须排除在扫描域之外（`SELF`）。
 *   ③ 第 ⑤ 条**不判** `Modal.tsx` 里那一行的行号（行号会随原语改动漂移）；它另有仪器自证：
 *      同一正则对两处"已知存在该形态"的文件必须命中。
 *   ④ 本文件**不判** `ModalDepthContext` 的嵌套正确性（`InterviewDialog` → `GoalPlanApprovalDialog`
 *      是内层 `Modal`）—— 见报告「行为等价性」表的未验证栏。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** A 组 1 的 7 个文件（相对 `app/src`，一律正斜杠 —— Windows 下 `sep` 是反斜杠，见台账 #26） */
const A1 = [
  "components/ChatSaveNoteDialog.tsx",
  "components/GoalPlanApprovalDialog.tsx",
  "components/GraduateDialog.tsx",
  "components/GroupCreateDialog.tsx",
  "components/GroupDeleteConfirm.tsx",
  "components/InterviewDialog.tsx",
  "components/KnowledgeConceptDialog.tsx",
];

/** ⑤ 的判据域：迁移面（不含 `shell/**` 与 `ui/**`） */
const MIGRATION_DIRS = ["components", "pages"];

/** 本文件自己的相对路径（文本扫描型守卫必须排除自己） */
const SELF = relative(SRC, fileURLToPath(import.meta.url)).split(sep).join("/");

/**
 * 行数口径：**逐字照抄** `scripts/line-limits.mjs:48-52` 的 `countLines()`。
 * Why 必须逐字：本文件只把行数**打印**出来供报告引用（不判好坏），若公式与门禁不同，
 * 报告里的读数就与 `--full` 对不上 —— 那正是「自引用/口径漂移」型假证明（T4 自查先例）。
 */
function countLines(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** 去块注释与整行注释；**不碰字符串字面量** */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function read(relPath: string): string {
  return readFileSync(join(SRC, ...relPath.split("/")), "utf8");
}

const BARE_Z_INDEX = /zIndex:\s*-?\d/;
const DIALOG_ATTR = new RegExp('role="dialog"');

/** 递归收集 `<dir>/**` 下的 .ts/.tsx（排除测试文件与本文件） */
function walk(dir: string): string[] {
  const out: string[] = [];
  // 用 `readdirSync(dir)` + `statSync(...).isDirectory()`（= 同域 `ui/zIndex.guard.test.ts` 的写法）：
  // `withFileTypes` 在本仓的 `@types/node` 下解析不出条目类型（TS2554/TS2339 实测）。
  for (const name of readdirSync(join(SRC, ...dir.split("/")))) {
    const next = `${dir}/${name}`;
    if (statSync(join(SRC, ...next.split("/"))).isDirectory()) out.push(...walk(next));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && next !== SELF) out.push(next);
  }
  return out;
}

describe("A 组 1 弹层迁移（批 4 T5）", () => {
  it("自检：7 个文件都存在、行数可读、且都不再含迁移前的形态", () => {
    const seen = A1.map((f) => `${f}=${countLines(read(f))}`);
    console.log(`[T5] 扫描 ${A1.length} 个文件：${seen.join(" · ")}`);
    expect(seen).toHaveLength(7);
    for (const entry of seen) expect(entry.split("=")[1]).toMatch(/^\d+$/);
    // 判据 ② 的正向对照：迁移前 7 个**全部**命中 `position: "fixed"`（baseline 实测 7/7），
    // 迁移后必须 0/7 —— 同一条正则两边都有读数，故它不是空真
    const stillFixed = A1.filter((f) => /position:\s*"fixed"/.test(stripComments(read(f))));
    expect(stillFixed).toEqual([]);
  });

  it("① 七个文件都从 barrel 导入，且没有一处深导入 Modal", () => {
    for (const f of A1) {
      const text = stripComments(read(f));
      expect(text.includes('from "../ui/primitives"'), `${f} 未走 barrel`).toBe(true);
      expect(text.includes('from "../ui/primitives/Modal"'), `${f} 深导入了 Modal`).toBe(false);
    }
  });

  it("② 七个文件都不含自建遮罩（position: fixed）", () => {
    for (const f of A1) {
      expect(/position:\s*"fixed"/.test(stripComments(read(f))), `${f} 残留自建遮罩`).toBe(false);
    }
  });

  it("③ 七个文件都不含自建 ESC 监听", () => {
    const needle = 'addEventListener("' + 'keydown';
    for (const f of A1) {
      const text = stripComments(read(f));
      expect(text.includes(needle), `${f} 残留 ESC 监听`).toBe(false);
      expect(text.includes("window.onkeydown"), `${f} 残留 window.onkeydown`).toBe(false);
    }
  });

  it("④ 七个文件都不含裸 zIndex 数字", () => {
    for (const f of A1) {
      expect(BARE_Z_INDEX.test(stripComments(read(f))), `${f} 残留裸 zIndex`).toBe(false);
    }
  });

  it("⑤ 迁移面零 role=\"dialog\"，且同一正则在原语侧有命中（仪器自证）", () => {
    const scanned: string[] = [];
    for (const d of MIGRATION_DIRS) scanned.push(...walk(d));
    expect(scanned.length).toBeGreaterThan(100); // 域非空 —— 防 walk 写错导致的空真

    const hits = scanned.filter((f) => DIALOG_ATTR.test(stripComments(read(f))));
    expect(hits).toEqual([]);

    const modal = stripComments(read("ui/primitives/Modal.tsx"));
    expect(DIALOG_ATTR.test(modal), "正则对 Modal.tsx 报 0 —— 仪器坏了").toBe(true);
    // T9 就地改写：阳性样本原为 `shell/CommandPalette.tsx`（批 4 的迁移面）。T9 把它交给 `Modal` 之后，
    // **全仓非原语文件都不再有** `role="dialog"` ⇒ 阳性样本改为合成串，并**补一条阴性对照**（强度不降）。
    expect(DIALOG_ATTR.test('const x = <div role="dialog" />;'), "正则对合成样本报 0 —— 仪器坏了").toBe(true);
    expect(DIALOG_ATTR.test('const x = <div role="alert" />;'), "正则对非 dialog 的 role 误报").toBe(false);
  });
});
