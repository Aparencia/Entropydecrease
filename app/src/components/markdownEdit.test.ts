/**
 * markdownEdit.test.ts — components/markdownEdit.ts 纯函数单测（AAA 结构）。
 *
 * Why：H2 修复将工具栏编辑从 DOM 直写改为"纯函数算新字符串 + 光标位置"，
 * 光标位置计算错误会导致受控 textarea 恢复选区错位——此处锁住契约。
 */
import { describe, expect, it } from "vitest";
import { headingLines, insertAtCursor, wrapSelection } from "./markdownEdit";

describe("headingLines", () => {
  it("无选区：光标所在行行首加 #，光标落在标记后", () => {
    // Arrange：光标在第二行"世界"开头（offset 3）
    const current = "你好\n世界\n结尾";
    // Act
    const r = headingLines(current, 3, 3, 1);
    // Assert：仅第二行加标记
    expect(r.value).toBe("你好\n# 世界\n结尾");
    expect(r.selStart).toBe(5); // 3（第二行行首）+ 2（标记长）
    expect(r.selEnd).toBe(5);
  });

  it("多行选区：每行行首加 #，光标落在末行标记后（不跳顶）", () => {
    // Arrange：选中第一行到第二行（offset 0..4，含换行）
    const current = "甲行\n乙行\n丙行";
    // Act
    const r = headingLines(current, 0, 4, 1);
    // Assert：前两行转换，第三行不动；光标在第二行标记后（行首 3 + 标记 2）
    expect(r.value).toBe("# 甲行\n# 乙行\n丙行");
    expect(r.selStart).toBe(7);
    expect(r.selEnd).toBe(7);
  });

  it("切换语义：同级别剥除 / 不同级别换级 / 普通段插入", () => {
    // Arrange：第一行正文，第二行已是 H2 —— 光标在第一行（offset 0）
    const current = "正文\n## 已有标题\n尾巴";
    // Act：目标 H1——逐行独立判定：第一行插入；第二行不在选区不处理
    const r = headingLines(current, 0, 0, 1);
    // Assert
    expect(r.value).toBe("# 正文\n## 已有标题\n尾巴");
    expect(r.selStart).toBe(2);
    // 多行选区（0..5 覆盖前两行）：第一行插入 `# `；第二行 ## 换级为 #
    const r2 = headingLines(current, 0, 5, 1);
    expect(r2.value).toBe("# 正文\n# 已有标题\n尾巴");
    // 光标 = 新末行行首（3 + 前面插入 2）+ 标记后（2）= 7
    expect(r2.selStart).toBe(7);
    // 同级别剥除：H1 行再点 H1 → 切回普通段，光标落行首
    const r3 = headingLines("# 一级", 0, 0, 1);
    expect(r3.value).toBe("一级");
    expect(r3.selStart).toBe(0);
  });

  it("选区尾恰在行首：不含下一行（选中到上一行结尾止）", () => {
    // Arrange：选中第一行全文（offset 0..3，恰在第一行末尾 \n 前）——selEnd 指向 "\n" 前
    const current = "甲乙\n丙丁\n戊己";
    // Act：selEnd = 2（"甲乙" 结尾），不是行首；用 selEnd=3（\n 位置）模拟选中含换行
    const r1 = headingLines(current, 0, 3, 1);
    expect(r1.value).toBe("# 甲乙\n丙丁\n戊己"); // selEnd=3 恰在 \n 上 → 只含第一行
    // 若 selEnd 指向下一行行首（4）→ 含第二行
    const r2 = headingLines(current, 0, 4, 1);
    expect(r2.value).toBe("# 甲乙\n# 丙丁\n戊己");
  });

  it("level 越界防御：clamp 到 1..6", () => {
    // Arrange + Act
    const r1 = headingLines("行", 0, 0, 0);
    expect(r1.value).toBe("# 行");
    const r6 = headingLines("行", 0, 0, 9);
    expect(r6.value).toBe("###### 行");
  });

  it("空内容边界：首行加标记，光标在标记后", () => {
    // Act
    const r = headingLines("", 0, 0, 1);
    // Assert
    expect(r.value).toBe("# ");
    expect(r.selStart).toBe(2);
  });
});

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
