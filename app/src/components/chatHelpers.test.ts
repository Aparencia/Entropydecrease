/**
 * AI 对话工具函数单测（v0.16.0；AAA 模式）。
 *
 * @ai-context: 覆盖 parseUsage（流量口径差异：total_tokens / totalTokens /
 *              分项和——服务商 usage JSON 不一致时前端仍能显示）与
 *              truncatePreview（轨迹/结果展开的深度截断）。
 */
import { describe, expect, it } from "vitest";
import { parseUsage } from "./ChatMessageList";
import { truncatePreview } from "./ChatMessageMarkdown";

describe("parseUsage", () => {
  it("解析 OpenAI 口径 total_tokens", () => {
    expect(parseUsage('{"total_tokens":123}')).toEqual({ tokens: 123 });
  });

  it("解析 camelCase totalTokens", () => {
    expect(parseUsage('{"totalTokens":45}')).toEqual({ tokens: 45 });
  });

  it("无总量时用分项求和", () => {
    expect(parseUsage('{"prompt_tokens":10,"completion_tokens":8}')).toEqual({ tokens: 18 });
  });

  it("null / 损坏 / 0 值均诚实降级", () => {
    expect(parseUsage(null)).toEqual({ tokens: null });
    expect(parseUsage("not-json")).toEqual({ tokens: null });
    expect(parseUsage('{"total_tokens":0}')).toEqual({ tokens: null });
  });
});

describe("truncatePreview", () => {
  it("短文本原样返回", () => {
    expect(truncatePreview("你好", 10)).toBe("你好");
  });

  it("超长截断并标注", () => {
    const out = truncatePreview("a".repeat(50), 10);
    expect(out).toContain("（内容过长已截断");
    expect(out.length).toBeLessThan(60);
  });

  it("默认截断上限 2000", () => {
    expect(truncatePreview("x".repeat(3000))).toContain("已截断");
  });
});
