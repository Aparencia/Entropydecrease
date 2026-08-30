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

  it("同级别标题行剥除标记（切回普通段）", () => {
    const r = computeHeadingChanges(Text.of(["### 已有"]), 0, 0, 3);
    expect(r.changes).toEqual([{ from: 0, to: 4, insert: "" }]);
    expect(r.cursor).toBe(0);
  });

  it("不同级别标题行换级（剥旧标记+插新标记）", () => {
    const r = computeHeadingChanges(Text.of(["## 已有"]), 0, 0, 1);
    expect(r.changes).toEqual([{ from: 0, to: 3, insert: "# " }]);
    expect(r.cursor).toBe(2);
  });

  it("混合选区：普通段插入 / 同级别剥除 / 不同级别换级", () => {
    const r = computeHeadingChanges(doc, 0, doc.length, 2);
    expect(r.changes).toHaveLength(4);
    // 第三行 "### 已有标题" 换级为 "## "（替换 [行首, 行首+4)）
    expect(r.changes[2]).toEqual({ from: doc.line(3).from, to: doc.line(3).from + 4, insert: "## " });
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

  it("全选全部同级别 → 全部剥除", () => {
    const allHeadings = Text.of(["# a", "# b"]);
    const r = computeHeadingChanges(allHeadings, 0, allHeadings.length, 1);
    expect(r.changes).toEqual([
      { from: 0, to: 2, insert: "" },
      { from: 4, to: 6, insert: "" },
    ]);
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

  it("同级别标题再点 → 取消回普通段", () => {
    const { view, docOf } = makeView("## 已有");
    expect(headingCommand(2)(view)).toBe(true);
    expect(docOf()).toBe("已有");
    // 剥除后光标落新行行首
    expect(view.state.selection.main.anchor).toBe(0);
    view.destroy();
  });

  it("混合行选区：H1 行取消 / H2 行换级", () => {
    const { view, docOf } = makeView("# a\n## b\nc");
    view.dispatch({ selection: { anchor: 0, head: 7 } }); // 选 "# a\n## b"（到 'b' 前）
    headingCommand(1)(view);
    expect(docOf()).toBe("a\n# b\nc");
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
