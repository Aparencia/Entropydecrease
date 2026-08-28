/**
 * toolbarCommands.test.ts — commands/toolbarCommands.ts 单测（spec §6.1）。
 */
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { insertTextCommand, wrapSelectionCommand } from "./toolbarCommands";

function makeView(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc }),
    parent,
  });
  return { view, docOf: () => view.state.doc.toString() };
}

describe("wrapSelectionCommand", () => {
  it("选区包裹标记，光标保持选中原文", () => {
    const { view, docOf } = makeView("hello world");
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    wrapSelectionCommand("**", "**")(view);
    expect(docOf()).toBe("**hello** world");
    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.selection.main.to).toBe(7);
    view.destroy();
  });

  it("空选区：插入前后缀，光标落在标记中间", () => {
    const { view, docOf } = makeView("abc");
    view.dispatch({ selection: { anchor: 1 } });
    wrapSelectionCommand("*", "*")(view);
    expect(docOf()).toBe("a**bc");
    expect(view.state.selection.main.anchor).toBe(2);
    view.destroy();
  });
});

describe("insertTextCommand", () => {
  it("光标处插入文本，光标落末尾", () => {
    const { view, docOf } = makeView("ab");
    view.dispatch({ selection: { anchor: 1 } });
    insertTextCommand("XY")(view);
    expect(docOf()).toBe("aXYb");
    expect(view.state.selection.main.anchor).toBe(3);
    view.destroy();
  });

  it("有选区时替换选区", () => {
    const { view, docOf } = makeView("abcdef");
    view.dispatch({ selection: { anchor: 1, head: 4 } });
    insertTextCommand("!")(view);
    expect(docOf()).toBe("a!ef");
    view.destroy();
  });
});
