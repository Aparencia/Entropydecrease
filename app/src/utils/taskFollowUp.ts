/**
 * taskFollowUp — AI 任务「在对话中追问」预填纯函数（v0.16.1 用户决定③）。
 *
 * @ai-context: 任务完成后把结果要点带入提问——用户不必先读全轨迹即可围绕
 *              结果继续追问（任务=对话而非一次性卡片）。引用块呈现任务背景
 *              让模型有上下文（同一会话时上下文本来就有，预填为明确锚点）。
 *              截断 800 字符（追问是引导性锚点，不是全文搬运——完整结果去
 *              「AI 任务」段看轨迹/工作台）。
 */
import type { AiTaskRecord } from "../types";

/** 结果 markdown 提取（resultJson → refined/enriched；损坏返回 null） */
export function extractTaskResultMarkdown(task: AiTaskRecord): string | null {
  if (!task.resultJson) return null;
  try {
    const v = JSON.parse(task.resultJson) as { refinedMarkdown?: string; enrichedMarkdown?: string };
    const md = v.refinedMarkdown ?? v.enrichedMarkdown;
    return typeof md === "string" && md.trim() !== "" ? md : null;
  } catch {
    return null;
  }
}

/** 追问预填提示词：任务背景引用块 + 结果要点 + 开放引导 */
export function buildTaskFollowUpPrompt(task: AiTaskRecord, refTitle: string): string {
  const op = task.opType === "refine" ? "AI 精修" : "AI 补充";
  const result = extractTaskResultMarkdown(task);
  const excerpt = result ? result.slice(0, 800) : "（该任务没有可引用的结果文本，可在「AI 任务」段查看完整轨迹）";
  const body = excerpt
    .split("\n")
    .map((l) => (l.trim() === "" ? ">" : `> ${l}`))
    .join("\n");
  return `我刚对「${refTitle}」执行了${op}（${task.model ?? "模型"}，已完成）。\n\n${body}\n\n针对这个结果，我想继续问：`;
}
