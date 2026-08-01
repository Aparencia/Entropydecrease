/**
 * OfflineAIQueueBootstrap — 离线 AI 队列引导（P2-11）
 *
 * 挂载于 ToastProvider 内，激活 offlineAIQueue：
 * - registerQueueToast：把应用 toast 注入队列模块（入队/重放成功/失败提示）；
 * - startAutoProcess：注册 window online 监听 + 启动时在线即消费积压请求。
 * 渲染为 null，纯副作用组件。
 *
 * @ai-context: hook 层。offlineAIQueue 为独立 Dexie 库 'keban-ai-queue'（品牌豁免，
 * 不可改名）；本组件是其唯一激活点，移除则离线队列退回死代码。
 */
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { offlineAIQueue } from '@/lib/ai/offlineAIQueue';

export function OfflineAIQueueBootstrap() {
  const { toast } = useToast();

  useEffect(() => {
    offlineAIQueue.registerQueueToast(toast);
    offlineAIQueue.startAutoProcess();
  }, [toast]);

  return null;
}
