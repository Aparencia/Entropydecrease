/**
 * taskFollowUp.test.ts — 任务追问预填纯函数（v0.16.1）。AAA 模式。
 *
 * @ai-context: 锁两契约——① refine/enrich 结果 markdown 提取（损坏 JSON 返回 null）；
 *              ② 预填结构：任务背景 + 引用块结果 + 开放引导（800 字符截断）。
 */
import { describe, expect, it } from "vitest";
import { buildTaskFollowUpPrompt, extractTaskResultMarkdown } from "./taskFollowUp";
import type { AiTaskRecord } from "../types";

const base: AiTaskRecord = {
  taskId: 1, opType: "refine", refId: 42, state: "succeeded", model: "deepseek-chat",
  slices: 3, costYuan: 0.001, elapsedMs: 1000, createdAt: 0, finishedAt: 1000, adopted: false, error: null,
  resultJson: null,
};

describe("extractTaskResultMarkdown", () => {
  it("refine 结果取 refinedMarkdown", () => {
    const t = { ...base, resultJson: JSON.stringify({ refinedMarkdown: "精修正文" }) };
    expect(extractTaskResultMarkdown(t)).toBe("精修正文");
  });

  it("enrich 结果取 enrichedMarkdown", () => {
    const t = { ...base, opType: "enrich", resultJson: JSON.stringify({ enrichedMarkdown: "补充正文" }) };
    expect(extractTaskResultMarkdown(t)).toBe("补充正文");
  });

  it("损坏 JSON / 空串 → null（诚实降级）", () => {
    expect(extractTaskResultMarkdown({ ...base, resultJson: "not-json" })).toBeNull();
    expect(extractTaskResultMarkdown({ ...base, resultJson: JSON.stringify({}) })).toBeNull();
    expect(extractTaskResultMarkdown({ ...base, resultJson: null })).toBeNull();
  });
});

describe("buildTaskFollowUpPrompt", () => {
  it("结构：背景 + 引用块结果 + 开放引导", () => {
    const t = { ...base, resultJson: JSON.stringify({ refinedMarkdown: "要点一\n要点二" }) };
    const out = buildTaskFollowUpPrompt(t, "B站#42");
    expect(out).toContain("「B站#42」");
    expect(out).toContain("> 要点一\n> 要点二");
    expect(out).toContain("我想继续问：");
  });

  it("超长结果截断 800 字符（锚点而非全文搬运）", () => {
    const t = { ...base, opType: "enrich", resultJson: JSON.stringify({ enrichedMarkdown: "x".repeat(5000) }) };
    const out = buildTaskFollowUpPrompt(t, "笔记#7");
    expect(out.length).toBeLessThan(6000); // 截断生效（未搬运全文）
    expect(out).not.toContain("xxxx".repeat(1200)); // 尾部被截掉
    expect(out).toContain("继续问");
  });

  it("无结果文本 → 引导去任务段查看（不崩）", () => {
    const out = buildTaskFollowUpPrompt({ ...base, resultJson: null }, "会话#1");
    expect(out).toContain("完整轨迹");
  });
});
