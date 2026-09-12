/**
 * @ai-context **`<Surface>` 调用点的共享扫描仪器**（T15a 从 `surfaceRatchet.test.ts` 析出）。
 *
 * Why 单独成件：`<Surface>` 的扫描面被**两件**判据消费 —— `surfaceRatchet.test.ts` ⑦（调用点不得用
 *   行内 `style` 覆盖原语语义）与 `surfaceTagRegistry.test.ts` ⑪（T15a 的**新增调用点登记制**）。
 *   仪器留在 ⑦ 那边会让那件顶过 300 行硬限（AGENTS.md §3 第 1 条），而抄两份扫描器就是批 4 已登记
 *   的「两套口径漂移」陷阱（`sliceScan.ts` 头注同因）。本件**不含断言**，只把源文件变成开标签。
 *
 * ★ 口径（与 `sliceScan.ts` 的域谓词配套使用；口径本身是判据的一部分）
 *   · 域内判定由调用方给（`!*.test.ts(x)` ∧ `!ui/primitives/**`，`surfaceRatchet.test.ts` 的 `inDomain`）；
 *   · **先剥注释**（`sliceScan.ts` 的状态机）再扫 —— 注释里提到的 `<Surface>` 不算命中；
 *   · 「处」= `<Surface` **开标签**的个数（自闭合与跨行都取全）。
 *
 * 副作用：无（纯函数）。边界：**文本级启发式，不是 AST** —— 假阳 = JSX 文本节点里的字面量
 *   `<Surface`（实测本仓 0 例）；假阴 = 字符串里的 `<Surface` 会被 `stripComments` 保留（字符串只跳过
 *   不抹内容）⇒ 理论上会被数到，本仓今日 0 例。
 */
import { join } from "node:path";
import { readLines } from "./sliceScan";

/** 被覆盖即违规的属性键（底/圆角/边框三族；**不含** `padding/margin/width` 等布局口 —— 那是 `style` 的合法用途） */
export const OVERRIDE_KEYS =
  /(?:^|[,{;\s])(background|backgroundColor|backgroundImage|border|borderColor|borderWidth|borderStyle|borderTop|borderBottom|borderLeft|borderRight|borderRadius)\s*:/;

/**
 * 单个 `<Surface …>` 开标签是否用行内 `style` 覆盖了底/圆角/边框。
 * 边界（**文本级启发式，不是 AST**）：假阳 = JSX 文本节点里出现的字面量 `<Surface`（实测本仓 0 例）；
 *   假阴 = 样式对象经变量间接给出（`style={S}` / `style={pick()}`）⇒ 判据只认 `style={{` 的字面对象。
 *   `style={{ padding: 8 }}` 这类**纯布局**写法**不**算违规（ADR-033 §4：`style` 是透传，供布局用）。
 */
export function overridesSurface(tag: string): boolean {
  const at = tag.search(/\bstyle\s*=\s*\{/);
  return at >= 0 && OVERRIDE_KEYS.test(tag.slice(at));
}

/** 取 `<Surface …>` 的整个开标签：从 `<Surface` 起按 `{}` 深度找深度 0 的 `>`（跨行标签也能取全） */
export function surfaceTagsIn(text: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  const re = /<Surface(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let i = m.index + 8;
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    out.push({ tag: text.slice(m.index, i + 1), line: text.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** 一个 `<Surface>` 调用点：所在文件（相对 `app/src` 的正斜杠路径）+ 整个开标签 + 行号 */
export interface SurfaceTagHit {
  readonly file: string;
  readonly tag: string;
  readonly line: number;
}

/** 逐文件取开标签（调用方给域内文件清单与「路径 → 剥注释文本」的读法，两件判据共用同一仪器） */
export function scanSurfaceTags(
  files: readonly string[],
  textOf: (rel: string) => string,
): SurfaceTagHit[] {
  return files.flatMap((rel) => surfaceTagsIn(textOf(rel)).map((t) => ({ file: rel, ...t })));
}

/* ───────────────────────── 扫描域（两件判据共用**同一个**谓词，防「两套口径」）───────────────────────── */

/** 域口径：`app/src/**` 的 `.ts/.tsx` **减** `*.test.ts(x)` **减** `ui/primitives/**`（B17 逐字） */
export const inDomain = (rel: string): boolean => !/\.test\.tsx?$/.test(rel) && !rel.startsWith("ui/primitives/");

/** 相对路径 → 绝对路径（键一律是相对 `app/src` 的正斜杠路径） */
export const absOf = (src: string, rel: string): string => join(src, ...rel.split("/"));

/** 剥注释后的整段文本（仪器只此一处取用，判据与自证同源） */
export const textOf = (src: string, rel: string): string => readLines(absOf(src, rel)).stripped.join("\n");
