/**
 * html.test.ts — utils/html.ts escapeHtml 测试（M9 首批单测，AAA 结构）。
 *
 * Why 重点测属性注入：OCR/ASR 文本既入正文上下文也入属性值上下文，
 * `" onerror="` 类载荷是属性逃逸的最典型形态。
 * v0.12.0 补：renderTimestampAnchors（时间戳回链锚点渲染芯片——预览/工作台
 * 轻量渲染器不再显示原始 `[⏱ 00:00]([[ts:233]])` markdown 文本）。
 */
import { describe, expect, it } from "vitest";
import { escapeHtml, renderTimestampAnchors } from "./html";

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

describe("renderTimestampAnchors", () => {
  it("段落锚点渲染为芯片（不再显示原始 markdown）", () => {
    // Arrange：规则版段落锚点（段首）——真机验收泄漏形态
    const input = escapeHtml(`[⏱ 00:00]([[ts:233]]) 项目启动是一个艺术。`);
    // Act
    const out = renderTimestampAnchors(input);
    // Assert：芯片出现、原始锚点文本消失
    expect(out).toContain("⏱ 00:00");
    expect(out).not.toContain("[⏱ 00:00]([[ts:233]])");
  });

  it("章节锚点（外带包裹括号）渲染为芯片", () => {
    // Arrange：`## 标题 [[⏱ 00:09]([[ts:9000]])]` 的标题文本部分
    const input = escapeHtml(`标题 [[⏱ 00:09]([[ts:9000]])]`);
    // Act
    const out = renderTimestampAnchors(input);
    // Assert：芯片 + 标题保留；包裹括号与原始锚点均不残留
    expect(out).toContain("⏱ 00:09");
    expect(out).not.toContain("[[ts:9000]]");
    expect(out).not.toContain("]]([[");
  });

  it("无锚点文本原样返回", () => {
    const out = renderTimestampAnchors(escapeHtml(`普通文本没有锚点 123`));
    expect(out).toBe("普通文本没有锚点 123");
  });

  it("先转义再替换——恶意 HTML 不产生可解析标签（注入面为零）", () => {
    // Arrange：恶意字幕尝试在锚点旁注入脚本（锚点语法字符均非 HTML 特殊字符，
    // 转义不改变匹配形态；但 `<script>` 已被转义）
    const input = escapeHtml(`[⏱ 00:00]([[ts:233]]) <script>alert(1)</script> & "x"`);
    // Act
    const out = renderTimestampAnchors(input);
    // Assert：芯片正常渲染 + 脚本不残留可解析标签 + 特殊字符保持转义
    expect(out).toContain("⏱ 00:00");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;x&quot;");
  });

  it("冒号注入不破坏芯片（mm:ss 仅数字化）", () => {
    // Arrange：文本中夹带仿锚点形态（非数字分钟）——不得误判
    const input = escapeHtml(`文本 [⏱ 这是一个说明]([[ts:1]]) 后续`);
    // Act：正则要求分钟为数字——仿形态不匹配，保持转义原文
    const out = renderTimestampAnchors(input);
    expect(out).toBe(input);
  });
});
