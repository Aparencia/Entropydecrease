/**
 * @ai-context **按钮形态扫描器**（批 4 T12 判据与 `tmp/t12/*.mjs` 探针的**唯一实现**）。
 *
 * Why 独立成模块（而不是写在 `buttonMigration.test.ts` 里）：
 *   ① 判据文件要塞下 37 行清单 + 缺口表 + 常量白名单 + 形状表，再带一份 60 行的剥注释状态机
 *      就会顶破本仓 **≤300 行**的硬限（第一版实测 360 行 ⇒ 直接违反 AGENTS.md §3.1）；
 *   ② 生成器（`tmp/t12/gen-test.mjs`）与守卫必须**同一份口径** —— 两份手抄迟早漂移，
 *      而"形状表对拍"的全部价值就在"冻结值与盘上读数同源"。
 *
 * Why 放在 `ui/primitives/` 下：本模块的**字符串字面量**里含 `<button` / `<Button` 形态样本，
 *   而 `nativeButton.ratchet.test.ts` 的扫描域按设计**排除** `ui/primitives/**`（口径的一部分）——
 *   放到域内文件旁边才不会把样本字面量算成"新增原生按钮"。
 *
 * 副作用：无（纯函数，不读盘不写盘）。边界：
 *   ① `stripComments` 与 `nativeButton.ratchet.test.ts` 的状态机同源（字符串/模板/regex 只跳过不抹内容，
 *      否则 `https://…` 这类字面量会被 `//` 截断 ⇒ 判据假阴性）；
 *   ② `directHits` **只认本文件声明的 `const *Btn*`**（不认同名 import，那是另一条账）；
 *   ③ `shapeOf` 把三元表达式折叠成 `三元:a|b`（排序后），缺省折叠成 `(默认)` —— 折叠规则本身就是判据的一部分。
 */

/** 常量族声明（与棘轮 `RE_BTN_CONST` 同一正则） */
const RE_DECL = /const\s+(\w*[Bb]tn\w*)\s*[:=]/g;
/** 原生按钮开标签（与棘轮 `RE_BUTTON` 同一正则） */
const RE_BUTTON = /<button[\s>]/g;
/** 原语按钮开标签 */
const RE_PRIMITIVE = /<Button[\s>]/g;
/**
 * 形状词表（三元折叠时**只收这些字面量**）：条件表达式里的业务串（如 `searchMode === "title"`）
 * 不是档位、不该进形状表 —— 归一是**判据的一部分**（否则"形状"会把条件值也算进去）。
 */
const VOCAB = new Set(["primary", "secondary", "ghost", "sm", "md", "lg"]);

/** 剥注释：`//` 与块注释抹为等长空白（保行号）；字符串/模板/regex 字面量只跳过不抹内容 */
export function stripComments(src: string): string {
  const out = src.split("");
  const blank = (a: number, b: number): void => {
    for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " ";
  };
  const isRegexStart = (k: number): boolean => {
    let j = k - 1;
    while (j >= 0 && /\s/.test(src.charAt(j))) j--;
    if (j < 0) return true;
    return "(,=:[!&|?{};+-*%~^<>".includes(src.charAt(j));
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charAt(i);
    if (c === "/" && src.charAt(i + 1) === "/") {
      const e = src.indexOf("\n", i);
      blank(i, e < 0 ? n : e);
      i = e < 0 ? n : e;
      continue;
    }
    if (c === "/" && src.charAt(i + 1) === "*") {
      const e = src.indexOf("*/", i + 2);
      blank(i, e < 0 ? n : e + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== c) {
        if (src.charAt(j) === "\\") j++;
        if (src.charAt(j) === "\n") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n && src.charAt(j) !== "`") {
        if (src.charAt(j) === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "/" && isRegexStart(i)) {
      let j = i + 1;
      let cls = false;
      let ok = false;
      while (j < n) {
        const d = src.charAt(j);
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) { ok = true; break; }
        j++;
      }
      if (ok) { blank(i + 1, j); i = j + 1; continue; }
    }
    i++;
  }
  return out.join("");
}

/** 取从 `start` 起、跨行到标签 `>` 结束的整段（`{}` 配对 + 跳过字符串/模板） */
export function tagText(src: string, start: number): string {
  let i = start;
  let depth = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
    else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src.charAt(j) !== c) { if (src.charAt(j) === "\\") j++; j++; }
      i = j;
    } else if (c === "`") {
      let j = i + 1;
      while (j < src.length && src.charAt(j) !== "`") { if (src.charAt(j) === "\\") j++; j++; }
      i = j;
    }
    i++;
  }
  return src.slice(start);
}

/** 取 `open` 处 `{` 配对到的表达式（`style={` 与 `variant={` 共用） */
export function braceExpr(src: string, open: number): string {
  let i = open;
  let depth = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(open + 1, i); }
    else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src.charAt(j) !== c) { if (src.charAt(j) === "\\") j++; j++; }
      i = j;
    }
    i++;
  }
  return src.slice(open + 1);
}

/** 本文件声明的 `const *Btn*` 名字（出现顺序） */
export function declsOf(s: string): string[] {
  return [...s.matchAll(new RegExp(RE_DECL.source, "g"))].map((m) => m[1]);
}

/** 直接形态命中数：`<button … style={NAME}` / `style={NAME(...)}`（NAME 必须是本文件声明的常量） */
export function directHits(s: string): number {
  const decls = declsOf(s);
  let n = 0;
  for (const t of s.matchAll(new RegExp(RE_BUTTON.source, "g"))) {
    const tag = tagText(s, t.index);
    const at = tag.indexOf("style={");
    if (at < 0) continue;
    const expr = braceExpr(s, t.index + at + "style=".length).trim();
    const lead = /^(\w*[Bb]tn\w*)\b/.exec(expr);
    if (lead && decls.includes(lead[1])) n += 1;
  }
  return n;
}

/** 某个 prop 的取值形状：字面量 / `三元:a|b`（**只收原语词表内的字面量**，排序）/ `(默认)` / `(动态)` */
export function shapeOf(tag: string, prop: string): string {
  const lit = new RegExp(`${prop}="(\\w+)"`).exec(tag);
  if (lit) return lit[1];
  const at = tag.indexOf(`${prop}={`);
  if (at < 0) return "(默认)";
  const lits = [...braceExpr(tag, at + prop.length + 1).matchAll(/"(\w+)"/g)]
    .map((m) => m[1])
    .filter((x) => VOCAB.has(x))
    .sort();
  return lits.length > 0 ? `三元:${lits.join("|")}` : "(动态)";
}

/** `<Button>` 的 `(variant,size)` 形状计数表 —— 形状表的**唯一**生成口径 */
export function shapeCensus(s: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of s.matchAll(new RegExp(RE_PRIMITIVE.source, "g"))) {
    const tag = tagText(s, t.index);
    const k = `variant=${shapeOf(tag, "variant")} size=${shapeOf(tag, "size")}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
