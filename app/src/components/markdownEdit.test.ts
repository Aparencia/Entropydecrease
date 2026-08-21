/**
 * markdownEdit.test.ts — components/markdownEdit.ts 纯函数单测（AAA 结构）。
 *
 * Why：H2 修复将工具栏编辑从 DOM 直写改为"纯函数算新字符串 + 光标位置"，
 * 光标位置计算错误会导致受控 textarea 恢复选区错位——此处锁住契约。
 */
import { describe, expect, it } from "vitest";
import { insertAtCursor, wrapSelection } from "./markdownEdit";

describe("insertAtCursor", () => {
  it("光标位置插入：新字符串正确拼接，光标移到插入文本末尾", () => {
    // Arrange
    const current = "你好世界";
    // Act：光标在索引 2（"你好"之后）插入 "**"
    const r = insertAtCursor(current, 2, 2, "**");
    // Assert
    expect(r.value).toBe("你好**世界");
    expect(r.selStart).toBe(4);
    expect(r.selEnd).toBe(4);
  });

  it("有选区插入：替换选中内容而非拼接", () => {
    // Arrange：选中"世界"（索引 2..4）
    // Act
    const r = insertAtCursor("你好世界", 2, 4, "X");
    // Assert
    expect(r.value).toBe("你好X");
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });

  it("空字符串边界：在开头插入", () => {
    // Act
    const r = insertAtCursor("", 0, 0, "abc");
    // Assert
    expect(r.value).toBe("abc");
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });
});

describe("wrapSelection", () => {
  it("包裹选中文本：前后标记就位，选区保持选中被包裹内容（便于连续编辑）", () => {
    // Arrange：选中"重点"（索引 2..4）
    // Act
    const r = wrapSelection("这是重点内容", 2, 4, "**", "**");
    // Assert
    expect(r.value).toBe("这是**重点**内容");
    expect(r.selStart).toBe(4); // 2 + "**".length
    expect(r.selEnd).toBe(6); // 仍选中"重点"二字
  });

  it("空选区包裹：仅插入成对标记，光标选区长度为 0", () => {
    // Act
    const r = wrapSelection("abc", 1, 1, "`", "`");
    // Assert
    expect(r.value).toBe("a``bc");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(2);
  });

  it("前后标记不对称（如代码块围栏）同样正确", () => {
    // Act
    const r = wrapSelection("hi", 0, 2, "<u>", "</u>");
    // Assert
    expect(r.value).toBe("<u>hi</u>");
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(5);
  });
});
