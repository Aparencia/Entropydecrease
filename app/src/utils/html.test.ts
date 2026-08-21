/**
 * html.test.ts — utils/html.ts escapeHtml 测试（M9 首批单测，AAA 结构）。
 *
 * Why 重点测属性注入：OCR/ASR 文本既入正文上下文也入属性值上下文，
 * `" onerror="` 类载荷是属性逃逸的最典型形态。
 */
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("五类特殊字符全部转义", () => {
    // Arrange
    const input = `& < > " '`;
    // Act
    const out = escapeHtml(input);
    // Assert
    expect(out).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("普通文本原样返回", () => {
    expect(escapeHtml("hello 世界 123")).toBe("hello 世界 123");
  });

  it("脚本标签转义（正文上下文防 XSS）", () => {
    // Arrange：恶意字幕载荷
    const input = `<script>alert(1)</script>`;
    // Act
    const out = escapeHtml(input);
    // Assert：不残留可解析标签
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("属性注入载荷（onerror 逃逸）无法打破属性边界", () => {
    // Arrange：模拟 <img src="${payload}"> 拼接场景
    const payload = `" onerror="alert(1)`;
    // Act
    const attr = `<img src="${escapeHtml(payload)}">`;
    // Assert：引号已转义，属性边界不被打破
    expect(attr).toBe(`<img src="&quot; onerror=&quot;alert(1)">`);
    expect(attr.match(/src="/g)).toHaveLength(1);
  });

  it("先转义 &（避免二次转义污染后续替换结果）", () => {
    // Arrange：含 & 的字符串若顺序错误会产生 &amp;lt; 类污染
    const input = "<&";
    // Act
    const out = escapeHtml(input);
    // Assert
    expect(out).toBe("&lt;&amp;");
  });
});
