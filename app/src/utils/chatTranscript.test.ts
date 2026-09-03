/**
 * chatTranscript.test.ts — 对话转笔记转写纯函数（v0.16.1）。AAA 模式。
 *
 * @ai-context: 锁三契约——① 用户=引用块 / AI=正文 / 轮次空行分隔（完整对话含问答）；
 *              ② upToId 截断（消息级入口=自首条至该条的完整上下文）；
 *              ③ failed 跳过、aborted 保留并标注、空内容跳过。
 */
import { describe, expect, it } from "vitest";
import { buildConversationMarkdown } from "./chatTranscript";
import type { ChatMessage } from "../types";

function msg(partial: Partial<ChatMessage> & { id: number; role: "user" | "assistant"; content: string }): ChatMessage {
  return {
    sessionId: 1,
    model: null,
    usageJson: null,
    metaJson: null,
    status: "done",
    createdAt: 0,
    ...partial,
  };
}

describe("buildConversationMarkdown", () => {
  // createdAt=0 的本地时标签（测试不硬编码时区）
  const t0 = (() => {
    const d = new Date(0);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  it("完整对话含问答：用户引用块 + AI 正文 + 轮次空行分隔", () => {
    const out = buildConversationMarkdown([
      msg({ id: 1, role: "user", content: "什么是梯度下降" }),
      msg({ id: 2, role: "assistant", content: "梯度下降是一种优化算法。" }),
    ]);
    expect(out).toContain(`> **🧑 你（${t0}）**`);
    expect(out).toContain("> 什么是梯度下降");
    expect(out).toContain(`**🤖 AI（— · ${t0}）**\n\n梯度下降是一种优化算法。`);
    // 用户/AI 之间有空行分隔
    expect(out).toContain("> 什么是梯度下降\n\n**");
  });

  it("多行用户内容整体进入引用块（逐行 > 前缀）", () => {
    const out = buildConversationMarkdown([msg({ id: 1, role: "user", content: "第一行\n第二行" })]);
    expect(out).toContain("> 第一行\n> 第二行");
  });

  it("upToId：截断到该条（含）——消息级入口的完整上文", () => {
    const out = buildConversationMarkdown([
      msg({ id: 1, role: "user", content: "问题甲" }),
      msg({ id: 2, role: "assistant", content: "回答甲" }),
      msg({ id: 3, role: "user", content: "问题乙" }),
      msg({ id: 4, role: "assistant", content: "回答乙" }),
    ], 2);
    expect(out).toContain("问题甲");
    expect(out).toContain("回答甲");
    expect(out).not.toContain("问题乙");
    expect(out).not.toContain("回答乙");
  });

  it("upToId 未命中（消息已删除/跨会话错位）→ 回退全量（防空笔记）", () => {
    const out = buildConversationMarkdown([
      msg({ id: 1, role: "user", content: "问题甲" }),
      msg({ id: 2, role: "assistant", content: "回答甲" }),
    ], 999);
    expect(out).toContain("问题甲");
    expect(out).toContain("回答甲");
  });

  it("failed 跳过；aborted 保留并标注；空内容跳过", () => {
    const out = buildConversationMarkdown([
      msg({ id: 1, role: "user", content: "问题" }),
      msg({ id: 2, role: "assistant", content: "部分内容", status: "aborted" }),
      msg({ id: 3, role: "assistant", content: "生成失败", status: "failed" }),
      msg({ id: 4, role: "assistant", content: "  " }),
    ]);
    expect(out).toContain("部分内容");
    expect(out).toContain("AI（已停止）");
    expect(out).not.toContain("生成失败");
  });

  it("空消息列表 → 空串", () => {
    expect(buildConversationMarkdown([])).toBe("");
  });
});
