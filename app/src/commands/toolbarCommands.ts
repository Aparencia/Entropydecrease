/**
 * toolbarCommands — CodeMirror 工具栏通用命令（v0.14 子项目 A）。
 *
 * @ai-context: textarea 版工具栏经字符串纯函数（markdownEdit.ts）计算后受控回写；
 *              CM 版工具栏直接构造 transaction dispatch——天然进撤销栈（spec §4.2：
 *              "工具栏操作经 view.dispatch 产生 transaction → 天然进撤销栈"）。
 *              wrapSelectionCommand/insertTextCommand 是纯 transaction 构造，
 *              可经 EditorState 单测（spec §6.1 覆盖行内/空选区边界）。
 */
import { EditorSelection, type SelectionRange } from "@codemirror/state";
import type { EditorView, Command } from "@codemirror/view";

/**
 * 包裹命令：选区包裹 before/after 标记（粗体/斜体/行首列表等）；
 * 无选区 → 光标处插入前后缀，光标落在标记中间（便于继续输入）。
 */
export function wrapSelectionCommand(before: string, after: string): Command {
  return (view: EditorView) => {
    const { state } = view;
    const ranges: SelectionRange[] = [];
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const range of state.selection.ranges) {
      const selText = state.sliceDoc(range.from, range.to);
      changes.push({ from: range.from, to: range.to, insert: before + selText + after });
      ranges.push(EditorSelection.range(range.from + before.length, range.from + before.length + selText.length));
    }
    view.dispatch({ changes, selection: EditorSelection.create(ranges), userEvent: "input.toolbar" });
    return true;
  };
}

/**
 * 插入命令：光标处插入文本（替换选区），光标落在插入文本之后。
 * 用于表格模板/图片引用/外链图等一次性插入。
 */
export function insertTextCommand(text: string): Command {
  return (view: EditorView) => {
    const { state } = view;
    const main = state.selection.main;
    view.dispatch({
      changes: { from: main.from, to: main.to, insert: text },
      selection: { anchor: main.from + text.length },
      userEvent: "input.toolbar",
    });
    return true;
  };
}
