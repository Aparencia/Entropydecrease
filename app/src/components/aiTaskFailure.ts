/**
 * aiTaskFailure — AI 任务失败原因引导文案（M8 去重：精修/补充共用）。
 *
 * @ai-context: AiRefineCard 与 EnrichPanel 原本各持一份 failureGuide（四类
 *              出口口径一致，仅 invalid 提示语因业务不同）——抽为共享纯函数，
 *              invalidHint 参数保留两组件差异点（行为等价）。
 */

/** Rust AiTaskFailure 序列化形态：单键对象 { kind: message } */
export type AiTaskFailureLike = Record<string, string>;

/** 失败原因 → 引导文案（四类出口：未授权/网络/余额/配额 + invalid/兜底） */
export function failureGuide(f: AiTaskFailureLike, invalidHint: string): string {
  const [kind, msg] = Object.entries(f)[0] ?? ["other", "未知错误"];
  switch (kind) {
    case "unauthorized": return `未授权：${msg}（请到设置页配置密钥并开启 AI 功能）`;
    case "network": return `网络错误：${msg}（可重试）`;
    case "balance": return `余额不足：${msg}（请充值或切换免费档模型）`;
    case "quota": return `配额受限：${msg}（请明日再试）`;
    case "invalid": return `响应非法已丢弃：${msg}（${invalidHint}）`;
    default: return msg;
  }
}
