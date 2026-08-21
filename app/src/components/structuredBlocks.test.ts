/**
 * structuredBlocks.test.ts — 结构化块渲染器测试（M9 首批单测，AAA 结构）。
 *
 * 覆盖重点：HTML 转义贯穿（防恶意字幕 XSS）与 KaTeX/表格降级路径。
 */
import { describe, expect, it } from "vitest";
import {
  aiPlaceholderLabel,
  lowConfidenceClass,
  renderLatex,
  renderMarkdownTable,
} from "./structuredBlocks";

describe("renderLatex", () => {
  it("合法 LaTeX：返回 KaTeX HTML（本地化渲染，无 CDN）", () => {
    // Act
    const out = renderLatex("E=mc^2");
    // Assert：KaTeX 产物带 katex 类名
    expect(out).toContain("katex");
  });

  it("恶意载荷：输出不含可执行脚本标签（任何分支均安全）", () => {
    // Arrange：字幕注入载荷——无论 KaTeX 成功/报错/走 catch 降级，
    // 产物中不得出现未转义的 <script>
    const out = renderLatex("<script>alert(1)</script>");
    // Assert
    expect(out).not.toContain("<script>");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("非法 LaTeX：不抛异常（降级路径兜底，不阻断渲染链）", () => {
    // Arrange / Act / Assert：throwOnError:false 或 catch 降级均不得抛出
    expect(() => renderLatex("\\begin{unknownenv}")).not.toThrow();
  });
});

describe("renderMarkdownTable", () => {
  it("标准表格：生成 table/thead/tbody 结构", () => {
    // Arrange
    const md = ["| 名称 | 值 |", "|---|---|", "| a | 1 |"].join("\n");
    // Act
    const out = renderMarkdownTable(md);
    // Assert
    expect(out).toContain("<table>");
    expect(out).toContain("<th>名称</th>");
    expect(out).toContain("<td>a</td>");
  });

  it("单元格 HTML 被转义（防恶意字幕 XSS）", () => {
    // Arrange
    const md = "| x |\n|---|\n| <img src=x onerror=alert(1)> |";
    // Act
    const out = renderMarkdownTable(md);
    // Assert
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("不足 2 行表格：降级为 pre 且内容转义", () => {
    // Arrange：仅一行管道文本（不构成表格）
    const md = "just text\n| lone";
    // Act
    const out = renderMarkdownTable(md);
    // Assert
    expect(out).toBe(`<pre>${md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")}</pre>`);
  });

  it("转义管道 \\|：当前实现 split 先于还原（锁定现状，TODO 待对齐 Markdown 语义）",
    () => {
      // Arrange
      const md = "| a | b |\n|---|---|\n| x\\|y | z |";
      // Act
      const out = renderMarkdownTable(md);
      // Assert：锁定现状——`\|` 未被还原为字面量（split("|") 先于 replace）；
      // TODO(行为修正): 理想应为 <td>x|y</td>，属实现缺陷但不在本次修复边界，
      // 先以快照防回归，后续修正实现时同步更新本断言
      expect(out).toContain("<td>x\\</td><td>y</td><td>z</td>");
    });
});

describe("lowConfidenceClass / aiPlaceholderLabel", () => {
  it("低置信（<0.5）返回标记类名，其余返回空串", () => {
    // Assert
    expect(lowConfidenceClass(0.3)).toBe("ed-low-confidence");
    expect(lowConfidenceClass(0.5)).toBe("");
    expect(lowConfidenceClass(null)).toBe("");
    expect(lowConfidenceClass(undefined)).toBe("");
  });

  it("AI 占位文案为诚实声明", () => {
    expect(aiPlaceholderLabel()).toBe("AI 增强待 V1.0");
  });
});
