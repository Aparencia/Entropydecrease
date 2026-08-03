/**
 * OfflineAIQueueBootstrap — 离线 AI 队列引导与状态可视化
 *
 * 挂载于 ToastProvider 内，同时承担两项职责：
 * 1. 副作用层：激活 offlineAIQueue（注入 toast 回调 + 注册联网自动消费监听）；
 * 2. 渲染层：当队列中存在待处理请求时，在视口右下角展示计数徽标，
 *    使用户对"离线请求已被安全缓存"有持续可感知，避免焦虑。
 *
 * @ai-context: hook 层。offlineAIQueue 为独立 Dexie 库 'keban-ai-queue'（品牌豁免，
 * 不可改名）；本组件是其唯一激活点，移除则离线队列退回死代码。
 *
 * UX 设计理由汇总：
 * - 徽标常驻：只要队列非空就显示，断网期间用户始终知道有多少请求在等待；
 * - 脉冲动画：低频呼吸灯效果暗示"后台正在等待时机"，而非应用卡顿；
 * - 联网后自动消失：队列消费完毕后徽标自然消失，无需用户手动关闭。
 */
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { offlineAIQueue } from '@/lib/ai/offlineAIQueue';

export function OfflineAIQueueBootstrap() {
  const { toast } = useToast();
  // 当前待处理队列数量（驱动徽标显示/隐藏及数字更新）
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    // 注入 toast 回调，使队列模块能向用户显示入队/完成/失败提示
    offlineAIQueue.registerQueueToast(toast);
    // 注册 window online 监听，并在启动时若在线则立即消费积压请求
    offlineAIQueue.startAutoProcess();

    // 订阅队列大小变化：每次入队/出队时触发 UI 徽标重新渲染
    const unsubscribe = offlineAIQueue.subscribeQueueSize((size) => {
      setQueueSize(size);
    });

    // 挂载时主动拉取一次初始队列大小（应对刷新后已有积压请求的场景）
    offlineAIQueue.getQueueSize().then(setQueueSize);

    return () => {
      unsubscribe();
    };
  }, [toast]);

  return (
    <>
      {/*
       * 队列计数徽标（右下角浮层）
       * UX 设计理由：选择右下角是因为该位置在桌面端通常不被主要内容遮挡，
       * 且与 toast 弹出位置（底部居中）互不干扰。仅在 queueSize > 0 时渲染，
       * 避免在线常态下对用户造成视觉负担。
       */}
      {queueSize > 0 && (
        <div
          role="status"
          aria-label={`${queueSize} 个 AI 请求排队中`}
          title={`${queueSize} 个 AI 请求排队中，联网后将自动处理`}
          className={[
            // 定位：固定于视口右下角，不随页面滚动偏移
            'fixed bottom-6 right-6 z-40',
            // 布局：胶囊形紧凑容器
            'flex items-center gap-1.5 px-2.5 py-1.5',
            // 视觉：半透明毛玻璃背景，与应用整体设计语言保持一致
            'bg-bg-elevated/90 backdrop-blur-md',
            'rounded-full shadow-kb-lg',
            'border border-border/40',
            // 可访问性：鼠标悬停时变为指针，暗示可交互（title 提供详情）
            'cursor-default',
          ].join(' ')}
        >
          {/* 状态指示灯：脉冲动画表示后台正在等待网络恢复 */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-amber-500" />
          </span>
          {/* 队列计数：直接告知用户当前积压数量 */}
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {queueSize} 个请求排队中
          </span>
        </div>
      )}
    </>
  );
}
