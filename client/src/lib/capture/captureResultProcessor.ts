/**
 * 采集结果处理器（Path A 流水线结果的持久化/融合/广播）
 *
 * @ai-context: 从 CaptureManager 拆出。handleResult 三步：向调度器报告
 * 成功→持久化 segment→送入 CrossFusion 融合并广播；handleError 按消息
 * 类型映射失败通道并触发调度器降级。依赖全部经构造注入，可 Mock 测试。
 * @ai-context: segment.id 使用时间戳+计数拼接（非 UUID）系历史格式，
 * 下游 UI 有按前缀过滤逻辑，勿改。
 */
import type { RouteDispatcher, RouteDecision, RouteSource } from '@/lib/ai/routeDispatcher';
import type { CrossFusionEngine } from './crossFusion';
import { captureEventBus } from './eventBus';
import { captureStore } from '@/lib/storage/captureStore';
import type { ExtractionResult, PipelineMessage, CaptureSessionConfig } from './captureTypes';

/** 结果处理上下文（由 CaptureManager 每次调用时提供） */
export interface ResultContext {
  sessionId: string;
  sessionConfig: CaptureSessionConfig | null;
  extractedCount: number;
}

/** 消息类型 → 路由通道映射 */
const MESSAGE_ROUTE_MAP: Record<string, RouteSource> = {
  screenshot: 'vision',
  audio_chunk: 'audio',
  ui_text: 'uiAutomation',
};

/**
 * 处理流水线提取结果
 * 向 RouteDispatcher 报告执行成功，并持久化 + 广播提取结果
 */
export function processExtractionResult(
  dispatcher: RouteDispatcher,
  crossFusion: CrossFusionEngine,
  ctx: ResultContext,
  result: ExtractionResult,
  message: PipelineMessage,
): void {
  // 向调度器报告成功
  const routeSource: RouteSource = result.source === 'audio' ? 'audio'
    : result.source === 'ui_automation' ? 'uiAutomation'
    : 'vision';
  dispatcher.reportResult(routeSource, true, result.confidence);

  // 持久化片段到 captureStore
  const segment = {
    id: `seg-${Date.now()}-${ctx.extractedCount}`,
    timestamp: new Date(),
    source: result.source,
    text: result.text,
    confidence: result.confidence,
    metadata: {
      model: result.model,
      processingTimeMs: result.processingTimeMs,
      language: ctx.sessionConfig?.language,
    },
  };

  captureStore.addSegment(ctx.sessionId, segment).catch(() => {});

  // 将结果送入 CrossFusionEngine 进行交叉融合
  if (result.source === 'vision') {
    crossFusion.addVisionResult(
      Date.now(),
      result.text,
      result.confidence,
      result.structured,
    );
  } else if (result.source === 'audio') {
    const segments = result.structured?.segments as
      | Array<{ start: number; end: number; text: string }>
      | undefined;
    crossFusion.addAudioResult(
      Date.now(),
      result.text,
      result.confidence,
      segments,
    );
  }

  // 通过事件总线广播提取结果
  captureEventBus.emit('extraction:completed', {
    sessionId: ctx.sessionId,
    messageId: message.id,
    result,
    segment,
    extractedCount: ctx.extractedCount,
  });
}

/**
 * 处理流水线错误
 * 向 RouteDispatcher 报告失败，触发降级逻辑
 * @returns 新的路由决策（若该消息类型可映射到路由通道），否则 null
 */
export function processExtractionError(
  dispatcher: RouteDispatcher,
  sessionId: string | null,
  error: Error,
  message: PipelineMessage,
): RouteDecision | null {
  let newDecision: RouteDecision | null = null;

  const route = MESSAGE_ROUTE_MAP[message.type];
  if (route) {
    newDecision = dispatcher.handleFailure(route, error);
  }

  captureEventBus.emit('extraction:error', {
    sessionId,
    messageId: message.id,
    error: error.message,
  });

  return newDecision;
}
