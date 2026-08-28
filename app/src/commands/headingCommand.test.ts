/**
 * headingCommand.test.ts — commands/headingCommand.ts 单测（spec §6.1）。
 * 纯逻辑 computeHeadingChanges 走 node 环境；真实 Command 走 jsdom + EditorView。
 */
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  computeHeadingChanges,
  headingCommand,
  shiftHeadingCommand,
} from "./headingCommand";

/** 挂载真实 EditorView（jsdom），返回 view 与 doc 读取辅助 */
function makeView(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc }),
    parent,
  });
  return { view, docOf: () => view.state.doc.toString() };
}

describe("computeHeadingChanges（纯逻辑）", () => {
  const doc = Text.of(["第一行", "第二行", "### 已有标题", "第四行"]);

  it("单行转换：行首插入 marker，光标落标记后", () => {
    const r = computeHeadingChanges(doc, 0, 0, 2);
    expect(r.changes).toEqual([{ from: 0, to: 0, insert: "## " }]);
    expect(r.cursor).toBe(3);
  });

  it("多行选区逐行转换，光标落末行标记后", () => {
    const r = computeHeadingChanges(doc, 0, 7, 1); // [0,7) 覆盖前两行（"第一行\n第二行"）
    expect(r.changes).toEqual([
      { from: 0, to: 0, insert: "# " },
      { from: 4, to: 4, insert: "# " }, // 第二行行首
    ]);
    expect(r.cursor).toBe(4 + 2 + 2); // 末行行首 + 首行插入 2 + 末行插入 2
  });

  it("已是标题的行跳过不叠加", () => {
    const r = computeHeadingChanges(doc, 0, doc.length, 2);
    // 第三行是标题跳过；其余三行插入
    expect(r.changes).toHaveLength(3);
    expect(r.changes.some((c) => c.insert === "### ")).toBe(false);
  });

  it("H6 边界：level 夹取 1..6", () => {
    expect(computeHeadingChanges(Text.of(["x"]), 0, 0, 7).changes[0].insert).toBe("###### ");
    expect(computeHeadingChanges(Text.of(["x"]), 0, 0, 0).changes[0].insert).toBe("# ");
    expect(computeHeadingChanges(Text.of(["x"]), 0, 0, 2.6).changes[0].insert).toBe("### ");
  });

  it("选区尾恰在行首：末行不纳入", () => {
    // 选区 [0, 4)：覆盖第一行（"第一行" 4 字符），结尾恰在第二行行首
    const r = computeHeadingChanges(doc, 0, 4, 1);
    expect(r.changes).toHaveLength(1);
    expect(r.cursor).toBe(2);
  });

  it("全选已全是标题 → 无变更", () => {
    const allHeadings = Text.of(["# a", "## b"]);
    const r = computeHeadingChanges(allHeadings, 0, allHeadings.length, 3);
    expect(r.changes).toHaveLength(0);
  });

  it("CRLF 行尾文档正常处理", () => {
    const crlf = Text.of(["a\r", "b"]);
    const r = computeHeadingChanges(crlf, 0, crlf.length, 2);
    expect(r.changes).toHaveLength(2);
    // 第二行行首 = "a\r\n" 长度 3
    expect(r.changes[1].from).toBe(3);
  });
});

describe("headingCommand（真实 Command）", () => {
  it("应用后 doc 出现标题且光标落位", () => {
    const { view, docOf } = makeView("第一行\n第二行");
    const ok = headingCommand(2)(view);
    expect(ok).toBe(true);
    // 无选区 → 仅光标所在行转换，光标落标记后
    expect(docOf()).toBe("## 第一行\n第二行");
    expect(view.state.selection.main.anchor).toBe(3);
    view.destroy();
  });

  it("已是标题 → 返回 false 无变化", () => {
    const { view, docOf } = makeView("## 已有");
    expect(headingCommand(2)(view)).toBe(false);
    expect(docOf()).toBe("## 已有");
    view.destroy();
  });

  it("多行选区逐行转换", () => {
    const { view, docOf } = makeView("a\nb\nc");
    view.dispatch({ selection: { anchor: 0, head: 3 } }); // 选 "a\nb"
    headingCommand(3)(view);
    expect(docOf()).toBe("### a\n### b\nc");
    view.destroy();
  });
});

describe("shiftHeadingCommand（Ctrl+Shift+↑↓ 层级升降）", () => {
  it("提升：H2 → H1；H1 → 普通段", () => {
    const { view, docOf } = makeView("## a\n# b");
    view.dispatch({ selection: { anchor: 0 } });
    shiftHeadingCommand(-1)(view);
    expect(docOf()).toBe("# a\n# b");
    shiftHeadingCommand(-1)(view);
    expect(docOf()).toBe("a\n# b");
    view.destroy();
  });

  it("降低：普通段 → H6；标题加 #", () => {
    const { view, docOf } = makeView("a\n## b");
    view.dispatch({ selection: { anchor: 0 } });
    shiftHeadingCommand(1)(view);
    expect(docOf()).toBe("###### a\n## b");
    view.destroy();
  });

  it("无标题行提升 → 无变化返回 false", () => {
    const { view } = makeView("plain");
    view.dispatch({ selection: { anchor: 2 } });
    expect(shiftHeadingCommand(-1)(view)).toBe(false);
    view.destroy();
  });
});
