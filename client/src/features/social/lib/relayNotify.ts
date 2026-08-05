/**
 * 番茄钟完成 → 接力上报通知（轻事件）
 * Pomodoro completion → relay notification (light event)
 *
 * @ai-context: 被 tickSlice 的 finalizeWorkPhase 动态 import 调用——工作阶段
 * 完成且存在活跃接力配对时，向搭档上报一次完成事件（只含分钟数，无内容）。
 * 全链路 fire-and-forget：任何失败静默，绝不阻塞番茄钟主流程。
 * @ai-context: Dynamically imported by tickSlice; reports a completion
 * event (minutes only) to the relay partner. Fully fire-and-forget.
 */
import { completeRelayDive, getCachedPair } from './relayApi';

/** 上报本轮专注完成（离线/无配对时静默跳过） */
export async function notifyRelayComplete(actualMinutes: number): Promise<void> {
  const pair = getCachedPair();
  // 仅活跃配对才上报（pending/completed/rejected 均跳过）
  if (!pair || pair.status !== 'active') return;
  try {
    await completeRelayDive(pair.id, Math.max(1, Math.round(actualMinutes)));
  } catch {
    // 静默失败：接力是增强体验，不应影响番茄钟
  }
}
