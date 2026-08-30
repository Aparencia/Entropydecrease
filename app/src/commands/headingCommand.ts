/**
 * headingCommand — CodeMirror 标题转换命令（v0.14 子项目 A / v0.15 切换语义）。
 *
 * @ai-context: 输入驱动（`## ` 即时生效）之外，工具栏按钮与 Ctrl+1/2/3 快捷键需要
 *              显式命令：对单行/多行选区逐行 set-or-toggle——行已精确等于所点级别
 *              则剥掉 `#×level+空格` 切回普通段（v0.15 修复"点 H1 无取消"），
 *              其他级别/普通段一律置为该级别（原"已是标题跳过"语义废弃——
 *              按钮高亮态的取消承诺与跳过行为冲突；Overleaf/Obsidian 同款）。
 *              不复用 markdownEdit.ts 的 headingLines（字符串+offset 模型）——
 *              CM 原生 Text.lines + lineAt 原生支持 CRLF 边界（spec §4.3）。
 *              computeHeadingChanges 纯逻辑可单测。
 */
import { Text, type Extension } from "@codemirror/state";
import { EditorView, keymap, type Command } from "@codemirror/view";

/** 单行变更（行首插 marker / 剥同级 marker / 换级 = 替换区间） */
export interface HeadingChange {
  from: number;
  to: number;
  insert: string;
}

export interface HeadingChangeResult {
  changes: HeadingChange[];
  /** 转换后光标应落的位置（新文档坐标：末行标记后；剥除时落行首） */
  cursor: number;
}

/**
 * 计算标题转换变更集（纯逻辑）：选区范围 [from, to) 覆盖的每行逐行判定——
 * 行已等于目标级别 → 删除 `#×level+空格`；已是其他级别 → 替换为该级别；
 * 普通段 → 行首插入 `#×level+空格`。选区尾恰在行首时该行不纳入（对齐
 * textarea 版 headingLines 语义）。level 夹取 1..6。
 */
export function computeHeadingChanges(
  doc: Text,
  from: number,
  to: number,
  level: number,
): HeadingChangeResult {
  const clamped = Math.max(1, Math.min(6, Math.round(level)));
  const marker = "#".repeat(clamped) + " ";
  let start = doc.lineAt(from).number;
  let end = doc.lineAt(to).number;
  // 选区尾恰在行首（\n 之后第一字符）且非空选区 → 末行未被选中
  if (to > from && to > 0 && doc.sliceString(to - 1, to) === "\n" && end > start) {
    end -= 1;
  }
  const changes: HeadingChange[] = [];
  // 末行之前各行的净变更增量（插入为正、剥除/换级为负）——末行行首平移量
  let deltaBeforeEnd = 0;
  // 末行自身变换后光标在"新末行"内的落点（无变换=0；插入/换级=标记后）
  let endCursorDelta = 0;
  for (let n = start; n <= end; n++) {
    const line = doc.line(n);
    const m = /^(#{1,6})\s/.exec(line.text);
    if (m) {
      const cur = m[1].length;
      if (cur === clamped) {
        // 同级别 → 剥除（切换取消：H1 按 H1 → 普通段）
        changes.push({ from: line.from, to: line.from + clamped + 1, insert: "" });
        if (n < end) deltaBeforeEnd -= clamped + 1;
      } else {
        // 其他级别 → 剥旧标记 + 插新标记（净效果=换级）
        changes.push({ from: line.from, to: line.from + cur + 1, insert: marker });
        if (n < end) deltaBeforeEnd += marker.length - (cur + 1);
        else endCursorDelta = marker.length;
      }
    } else {
      // 普通段 → 行首插入
      changes.push({ from: line.from, to: line.from, insert: marker });
      if (n < end) deltaBeforeEnd += marker.length;
      else endCursorDelta = marker.length;
    }
  }
  // 光标 = 新末行行首 + 末行落点（selection 坐标为新文档坐标）
  const cursor = doc.line(end).from + deltaBeforeEnd + endCursorDelta;
  return { changes, cursor };
}

/** 标题命令：工具栏/快捷键共用；无行需转换时返回 false（不产生空 transaction） */
export function headingCommand(level: number): Command {
  return (view: EditorView) => {
    const { state } = view;
    const sel = state.selection.main;
    const { changes, cursor } = computeHeadingChanges(state.doc, sel.from, sel.to, level);
    if (changes.length === 0) return false;
    view.dispatch({
      changes,
      selection: { anchor: cursor },
      scrollIntoView: true,
      userEvent: "input.heading",
    });
    return true;
  };
}

/** 层级升降（Ctrl+Shift+↑↓）：有标题加减一个 #；无标题时 demote 落 H6、promote 不动 */
export function shiftHeadingCommand(delta: -1 | 1): Command {
  return (view: EditorView) => {
    const { state } = view;
    const sel = state.selection.main;
    const from = Math.min(sel.from, sel.to);
    const to = Math.max(sel.from, sel.to);
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(to).number;
    const changes: HeadingChange[] = [];
    let cursor = sel.from;
    for (let n = startLine; n <= endLine; n++) {
      const line = state.doc.line(n);
      const m = /^(#{1,6})\s/.exec(line.text);
      if (delta === -1) {
        // 提升：H1 → 普通段（删 "# ");H2+ → 只删 1 个 #（对齐 textarea 版语义）
        if (!m) continue;
        const removeLen = m[1].length === 1 ? m[1].length + 1 : 1;
        changes.push({ from: line.from, to: line.from + removeLen, insert: "" });
        if (n === state.doc.lineAt(sel.from).number && sel.from >= line.from && sel.from <= line.from + removeLen) {
          cursor = line.from;
        }
      } else {
        // 降低：有标题加一个 #；普通段 → H6
        changes.push({ from: line.from, to: line.from, insert: m ? "#" : "###### " });
      }
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes, selection: { anchor: cursor }, scrollIntoView: true, userEvent: "input.heading" });
    return true;
  };
}

/** 标题快捷键：Ctrl+1/2/3 设置级别；Ctrl+Shift+↑↓ 层级升降 */
export const headingKeymap: Extension = keymap.of([
  { key: "Mod-1", run: headingCommand(1) },
  { key: "Mod-2", run: headingCommand(2) },
  { key: "Mod-3", run: headingCommand(3) },
  { key: "Mod-Shift-ArrowUp", run: shiftHeadingCommand(-1) },
  { key: "Mod-Shift-ArrowDown", run: shiftHeadingCommand(1) },
]);
