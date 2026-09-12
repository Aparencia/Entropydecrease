/**
 * @ai-context **切片类棘轮守卫的共享扫描仪器**（T13 从 `emptyStateRatchet.test.ts` 里析出）。
 *
 * Why 单独成件：这套「按域遍历 + 剥注释 + 逐行命中」的仪器是**每个切片棘轮都要用的同一件事**
 * （T13 空态、T14 加载态、后续三类），而 T13 的守卫本体已经贴着 300 行硬限 ⇒ 仪器留在守卫里
 * 会把判据挤掉。它**不含任何断言、不读业务语义**，只做「把源文件变成带行号的文本行」。
 *
 * ★ 剥注释为什么必须是状态机而不是一条正则：本仓有真实的坑 —— `KnowledgeDecisionForm.tsx` 的
 * JSDoc 里出现反引号（`` `Modal` `` 这类写法到处都是），朴素实现会把从那句注释起的**整个文件**
 * 当成模板字面量抹掉 ⇒ 命中全变 0（T13 实测：该文件的例外被读成「不存在」）。状态机把字符串 /
 * 模板 / 正则 / 行注释 / 块注释分开处理，且用**等长空白**替换 ⇒ 行号与列号与原文一一对应。
 * 规则与 `.superpowers/.../tmp/scan-callsites.mjs` 的 `stripComments()` 同源。
 *
 * 副作用：无（只读调用方传进来的绝对路径）。边界：**文本级仪器，不做 AST** —— 它不认识 JSX 语法，
 * 故「这行是否落在某个原语调用里」由调用方自己判（T13 用「向上找最近的语法起点行」启发式）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** 剥注释（字符串 / 模板 / 正则 / 行注释 / 块注释），等长空白替换以保住行号 */
export function stripComments(src: string): string {
  const out = src.split("");
  const n = src.length;
  const blank = (a: number, b: number): void => { for (let i = a; i < b; i++) if (out[i] !== "\n") out[i] = " "; };
  const regexStart = (k: number): boolean => {
    let j = k - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    return j < 0 || "(,=:[!&|?{};+-*%~^<>".includes(src[j]);
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); blank(i, e < 0 ? n : e); i = e < 0 ? n : e; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); blank(i, e < 0 ? n : e + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; if (src[j] === "\n") break; j++; }
      i = j + 1; continue;
    }
    if (c === "`") { let j = i + 1; while (j < n && src[j] !== "`") { if (src[j] === "\\") j++; j++; } i = j + 1; continue; }
    if (c === "/" && regexStart(i)) {
      let j = i + 1, cls = false, ok = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (d === "[") cls = true; else if (d === "]") cls = false;
        else if (d === "/" && !cls) { ok = true; break; }
        j++;
      }
      if (ok) { blank(i + 1, j); i = j + 1; continue; }
    }
    i++;
  }
  return out.join("");
}

/** 递归收集目录下的 `.ts`/`.tsx` 绝对路径 */
export function walkSources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walkSources(f, out);
    else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

/** 相对 `base` 的正斜杠路径（判据里一律用这个形态做键） */
export const relOf = (base: string, file: string): string => relative(base, file).split(sep).join("/");

/** 读一个源文件 → `{ raw, stripped }` 两套行数组（行号一一对应） */
export function readLines(file: string): { raw: string[]; stripped: string[] } {
  const src = readFileSync(file, "utf8");
  return { raw: src.split(/\r?\n/), stripped: stripComments(src).split(/\r?\n/) };
}
