/**
 * headingCommand — CodeMirror 标题转换命令（v0.14 子项目 A）。
 *
 * @ai-context: 输入驱动（`## ` 即时生效）之外，工具栏按钮与 Ctrl+1/2/3 快捷键需要
 *              显式命令：对单行/多行选区逐行行首设置 `#`×level；已是标题的行跳过
 *              （重复按不叠加）；光标落末行标记后。不复用 markdownEdit.ts 的
 *              headingLines（字符串+offset 模型）——CM 原生 Text.lines + lineAt
 *              原生支持 CRLF 边界（spec §4.3）。computeHeadingChanges 纯逻辑可单测。
 */
import { Text, type Extension } from "@codemirror/state";
import { EditorView, keymap, type Command } from "@codemirror/view";

/** 单行插入变更（行首插入 marker） */
export interface HeadingChange {
  from: number;
  to: number;
  insert: string;
}

export interface HeadingChangeResult {
  changes: HeadingChange[];
  /** 转换后光标应落的位置（末行标记后） */
  cursor: number;
}

/**
 * 计算标题转换变更集（纯逻辑）：选区范围 [from, to) 覆盖的每行行首插入
 * `#`×level + 空格；已是标题的行跳过。选区尾恰在行首时该行不纳入（对齐
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
  let insertedBeforeEnd = 0;
  let endLineGotMarker = false;
  for (let n = start; n <= end; n++) {
    const line = doc.line(n);
    if (/^#{1,6}\s/.test(line.text)) continue; // 已是标题不叠加
    changes.push({ from: line.from, to: line.from, insert: marker });
    if (n < end) insertedBeforeEnd += marker.length;
    else endLineGotMarker = true;
  }
  // 光标 = 末行行首 + 末行之前行累计插入 +（末行自身加标记则再 + 标记长）
  const cursor = doc.line(end).from + insertedBeforeEnd + (endLineGotMarker ? marker.length : 0);
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
