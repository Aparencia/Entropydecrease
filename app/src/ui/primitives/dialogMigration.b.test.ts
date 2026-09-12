// @vitest-environment node
/**
 * @ai-context dialogMigration.b.test.ts —— 批 4 T7「B 组工作台」4 个手写弹层的**迁移收口判据**。
 *
 * Why 存在：这 4 个文件迁移前各自手写 `position:"fixed"; inset:0` 的遮罩 + 居中几何 + 自绘
 * 关闭钮（B3 的 20 个 `role="dialog"` 里属于 B 组的 4 个），其中 `RefineWorkbench` 还是
 * 1200 px 并排双栏工作台（R3 / B12 裁决走 (a)：迁入 `Modal --l` = 720）。迁移把**四条可
 * 证伪的形态契约**换掉：① 唯一公共入口是 barrel（ADR-033 §1）② 不得再有自建遮罩
 * ③ 不得再有 `keydown` 监听（ESC 是 `Modal` 的独占职责，ADR-033 §7）④ 不得再有裸数字
 * z-index、也不再自己 import 层级标尺（层级归 `Modal`）。
 *
 * 口径（全部**先剥注释再判**；仓内多次被注释里的字面量误伤，正解先例
 * `app/src/shell/TopBar.test.tsx:34`）：
 *   ① barrel 名字表含 `Modal` 且无 `ui/primitives/<X>` 深导入
 *   ② 不出现 `position: "fixed"` ∧ 同文件出现 `inset: 0`
 *   ③ 不出现 `addEventListener("keydown"` / `onkeydown=`
 *   ④ 不出现 `zIndex: <数字>` / `z-index: <数字>`，且不再 `from "../ui/zIndex"`
 *   ⑤（组专有，计划 V2）**面板宽度不再由调用点声明**：4 个文件各写 `size="l"`
 *      （档位权威在 `Modal` 的 `.ed-modal--l`），且计划点名的四条面板宽度字面量
 *      与向导的 `width: 560` 命中数 = 0
 *
 * 副作用：只读磁盘（4 个组件）。不写文件、不渲染。
 * 边界：这是**源码形态判据**，不是渲染判据 —— 720 下的可读性由 T7 的 headless 探针
 *   （`tmp/t7/probe/`，读数与截图见 `task-7-report.md`）实测，渲染级行为在各自组件的既有
 *   测试里（`KnowledgeSystemWizard.test.tsx` / `RefineWorkbench.test.tsx` /
 *   `pages/KnowledgePage.test.tsx`，本任务**未改其中一条断言**）。
 *   剥注释器不处理正则字面量分支（4 个文件当前均无正则字面量；引入后需同步升级）。
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** `app/src` —— 相对它写路径（与 `ui/zIndex.guard.test.ts` / `.a1` / `.a2` 同口径） */
const SRC = resolve(import.meta.dirname, "..", "..");

/** B 组的 4 个文件（计划 Task 7 Files 逐字） */
const B_FILES: readonly string[] = [
  "components/KnowledgeSystemWizard.tsx",
  "components/ProofreadPanel.tsx",
  "components/RefineWorkbench.tsx",
  "components/SecondPassPanel.tsx",
];

/**
 * 迁移前由**调用点**声明的面板宽度（计划 V2 的四条 + 向导的 560 —— 计划漏了它，
 * 口径是「4 个文件的面板宽度声明命中 = 0」）。迁移后宽度权威是 `Modal` 的档位。
 */
const PANEL_WIDTH_LITERALS: readonly string[] = [
  'width: "90vw"',
  "maxWidth: 1200",
  "width: 560",
  "width: 680",
  "width: 720",
];

/** `//` 与块注释抹为等长空白（保行号）；字符串字面量整段跳过，避免 `//` 被误当注释 */
function stripComments(src: string): string {
  const out = src.split("");
  const blank = (a: number, b: number): void => {
    for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " ";
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charAt(i);
    if (c === "/" && src.charAt(i + 1) === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? n : end);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "/" && src.charAt(i + 1) === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? n : end + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== c) {
        if (src.charAt(j) === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** 该行里 `position:` 之后是否**跨行**配到 `fixed`（处理 `position:\n  "fixed"` 这种写法） */
function hasFixedPosition(lines: string[], index: number): boolean {
  const at = lines[index].indexOf("position:");
  if (at < 0) return false;
  const rest = lines[index].slice(at);
  if (/position:\s*["']fixed["']/.test(rest)) return true;
  return /position:\s*["']fixed["']/.test(`${rest} ${lines[index + 1] ?? ""}`);
}

/** `zIndex:` / `z-index:` 后跟数字（`zIndex: zIndex("modal")` 不匹配） */
const RE_BARE_Z = /z-index\s*:\s*-?\d|zIndex\s*:\s*-?\d/;
/** 深度/默认导入 `ui/primitives/<X>`（barrel 之外的入口，ADR-033 §1 禁止） */
const RE_DEEP = /from\s*"(?:\.\.\/)+ui\/primitives\/[A-Za-z]+"/;
/** `ui/zIndex` 标尺（层级归 `Modal`，调用点不再需要它） */
const RE_ZINDEX_IMPORT = /from\s*"(?:\.\.\/)+ui\/zIndex"/;
/** barrel 名字表 */
const RE_BARREL = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.\/)+ui\/primitives"/;

interface FileFacts {
  readonly rel: string;
  readonly lines: number;
  readonly barrelNames: readonly string[];
  readonly deepImports: readonly string[];
  readonly selfMask: readonly string[];
  readonly keydown: readonly string[];
  readonly bareZ: readonly string[];
  readonly zIndexImport: readonly string[];
  readonly noSizeL: boolean;
  readonly panelWidths: readonly string[];
}

/** 对一个**已剥注释**的源文本量出八项事实（抽成纯函数 ⇒ 仪器自检可喂合成样本） */
function scan(src: string): Omit<FileFacts, "rel" | "lines"> {
  const lines = src.split("\n");
  const deepImports: string[] = [];
  const selfMask: string[] = [];
  const keydown: string[] = [];
  const bareZ: string[] = [];
  const zIndexImport: string[] = [];
  const panelWidths: string[] = [];
  const barrel = RE_BARREL.exec(src);

  lines.forEach((line, index) => {
    const where = `:${index + 1}  ${line.trim()}`;
    if (RE_DEEP.test(line)) deepImports.push(where);
    if (hasFixedPosition(lines, index) && /inset\s*:\s*0\b/.test(src)) selfMask.push(where);
    if (/addEventListener\s*\(\s*["']keydown["']/.test(line) || /onkeydown\s*=/.test(line)) keydown.push(where);
    if (RE_BARE_Z.test(line)) bareZ.push(where);
    if (RE_ZINDEX_IMPORT.test(line)) zIndexImport.push(where);
  });
  for (const lit of PANEL_WIDTH_LITERALS) if (src.includes(lit)) panelWidths.push(lit);

  return {
    barrelNames: barrel ? barrel[1].split(",").map((s) => s.trim()) : [],
    deepImports,
    selfMask,
    keydown,
    bareZ,
    zIndexImport,
    // `size="l"` 必须真的传给 `Modal`（档位权威）；`size="m"` 等其它档位视为**未声明 l**
    noSizeL: !/<Modal[\s\S]*?\bsize="l"/.test(src),
    panelWidths,
  };
}

/** 逐个受管文件量事实（带 `文件:行` 定位，报错能点到位） */
function factsOf(rel: string): FileFacts {
  const raw = readFileSync(join(SRC, rel), "utf8");
  return { rel, lines: raw.split(/\r?\n/).length, ...scan(stripComments(raw)) };
}

const FACTS: readonly FileFacts[] = B_FILES.map(factsOf);

describe("B 组 · 4 个弹层的形态契约（4 判据 × 4 文件）", () => {
  it("仪器自检：4 个文件都读得到、都不短；剥注释与判据各自能命中已知样本", () => {
    expect(FACTS.map((f) => f.rel)).toEqual([...B_FILES]);
    expect(FACTS.filter((f) => f.lines < 60).map((f) => `${f.rel} 只有 ${f.lines} 行`)).toEqual([]);
    // 阳性样本：每条判据都能命中一个**已知存在**的串（否则下面的 0 命中与"仪器坏了"不可区分）
    const live = scan(stripComments(
      'import { Modal } from "../../ui/primitives";\n'
      + 'import { Text } from "../../ui/primitives/Text";\n'
      + 'const a = <i style={{ position: "fixed", inset: 0, zIndex: 1000 }} />;\n'
      + 'document.addEventListener("keydown", h);\n'
      + 'import { zIndex } from "../ui/zIndex";\n'
      + 'const b = <Modal open size="m" />;\n'
      + 'const w = { width: "90vw" };\n',
    ));
    expect(live.barrelNames, "barrel 名字表读不到（判据①的阳性样本失效）").toContain("Modal");
    expect([live.deepImports.length, live.selfMask.length, live.keydown.length,
      live.bareZ.length, live.zIndexImport.length, live.panelWidths.length]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(live.noSizeL, "`size=\"m\"` 必须被判成「未声明 l」").toBe(true);
    // 阴性样本：注释里的字面量一律不得命中（剥注释承重）
    const dead = scan(stripComments('// position: "fixed"; inset: 0; zIndex: 50; width: 720\nconst keep = 1;\n'));
    expect(dead.selfMask.length + dead.bareZ.length + dead.panelWidths.length).toBe(0);
    // 阴性样本：barrel 名字表不得把深导入当成 barrel 命中
    expect(scan(stripComments('import { Modal } from "../../ui/primitives/Modal";\n')).barrelNames).toEqual([]);
  });

  // 4 文件 × 4 判据 = 16 条**逐文件**用例：分开写而不是合成一条断言 ——
  // 合成后「哪个文件犯了哪条」只能靠报错文本，且一条红会遮蔽其余判据（每条各带变异体）。
  for (const f of FACTS) {
    it(`① ${f.rel}：从 barrel 导入 Modal，无深导入`, () => {
      expect(f.barrelNames, `${f.rel} 的 barrel 名字表不含 Modal`).toContain("Modal");
      expect(f.deepImports, `${f.rel} 出现深导入（ADR-033 §1 禁止）`).toEqual([]);
    });

    it(`② ${f.rel}：无自建遮罩`, () => {
      expect(f.selfMask, `${f.rel} 仍在自建遮罩（position:"fixed" ∧ inset:0）`).toEqual([]);
    });

    it(`③ ${f.rel}：无 keydown 监听`, () => {
      expect(f.keydown, `${f.rel} 仍自建 keydown 监听（ESC 归 Modal）`).toEqual([]);
    });

    it(`④ ${f.rel}：无裸数字 z-index，且不再 import 层级标尺`, () => {
      expect(f.bareZ, `${f.rel} 仍有裸数字 z-index`).toEqual([]);
      expect(f.zIndexImport, `${f.rel} 仍 import ui/zIndex（层级归 Modal）`).toEqual([]);
    });
  }
});

describe("组专有判据（计划 V2）：面板宽度不再由调用点声明", () => {
  it("4 个文件各以 `size=\"l\"` 声明档位，且五条面板宽度字面量命中 = 0", () => {
    expect(FACTS.filter((f) => f.noSizeL).map((f) => f.rel), "以下文件未给 Modal 声明 size=\"l\"").toEqual([]);
    const hits = FACTS.flatMap((f) => f.panelWidths.map((w) => `${f.rel} 仍声明面板宽度 ${w}`));
    expect(hits, `面板宽度必须由 Modal 的档位给（调用点声明 = 0 命中）：\n${hits.join("\n")}`).toEqual([]);
    // 仪器自证：这五条字面量真的能命中"迁移前"的写法（否则本判据恒真 = 空真）
    const before = PANEL_WIDTH_LITERALS.filter((lit) => scan(stripComments(`const s = { ${lit} };\n`)).panelWidths.includes(lit));
    expect(before.length, "五条面板宽度字面量里有取不到的（判据空真）").toBe(PANEL_WIDTH_LITERALS.length);
    // 阴性样本：改一个字符就不该命中（证明匹配不是子串噪声）
    expect(scan(stripComments("const s = { width: 721 };\n")).panelWidths).toEqual([]);
  });
});
