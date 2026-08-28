/**
 * imageDecoration — 扫描 Markdown 源码中的图片引用（v0.14 子项目 A）。
 *
 * @ai-context: `![alt](url)` 在 textarea 时代以源码呈现、编辑态不可视；CodeMirror
 *              时代以 Decoration.replace widget 内联渲染真实图片。本文件纯函数只
 *              负责"扫描 → 位置 + 元数据"，渲染由插件/组件层负责，可单测。
 *              规则：支持行内与独立行；URL 内允许嵌套括号（按深度匹配，非贪心
 *              `[^)]*` 在首个 ) 截断）；普通链接 [x](y) 不误匹配（前置 ! 锚定）。
 */

/** 图片引用：整段 `![alt](url)` 在 doc 内的范围与元数据 */
export interface ImageRef {
  from: number;
  to: number;
  alt: string;
  url: string;
}

const IMAGE_START = /!\[([^\]]*)\]/g;

export function scanImageRefs(markdown: string): ImageRef[] {
  const refs: ImageRef[] = [];
  let m: RegExpExecArray | null;
  IMAGE_START.lastIndex = 0;
  while ((m = IMAGE_START.exec(markdown)) !== null) {
    const open = IMAGE_START.lastIndex;
    // 非 `![alt](` 形态（如 `![alt]` 后跟非左括号）→ 跳过
    if (markdown[open] !== "(") continue;
    // 括号深度匹配：支持 URL 内嵌套括号（`![](a(b)c)`），未闭合则不视为图片
    let depth = 0;
    let j = open;
    for (; j < markdown.length; j++) {
      const ch = markdown[j];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    refs.push({ from: m.index, to: j + 1, alt: m[1], url: markdown.slice(open + 1, j) });
    IMAGE_START.lastIndex = j + 1;
  }
  return refs;
}
