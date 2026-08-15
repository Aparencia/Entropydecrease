/**
 * 视觉提取 Worker
 *
 * 实现 PipelineWorker 接口，将截图发送给多模态 AI 模型进行内容提取。
 * 通过 IPC ai_vision_extract 调用主进程 handler，转发至 GLM-4V-Flash / Qwen-VL-Plus。
 *
 * @ai-context: 视觉提取 Worker：截图→多模态识别管线；内部去重算法与 routeFusion 的 Jaccard 阈值需保持一致。
 */

import type {
  PipelineMessage,
  PipelineWorker,
  ExtractionResult,
  ScreenshotData,
} from '@/lib/capture/captureTypes';
import { supabase } from '@/lib/auth/supabaseClient';

// ================================================================
// 视觉提取模式类型
// ================================================================

/** 视觉提取模式 */
type VisionExtractMode = 'auto' | 'text' | 'formula' | 'diagram' | 'code' | 'full';

// ================================================================
// VisionWorker
// ================================================================

/** VisionWorker 配置 */
interface VisionWorkerOptions {
  /** 两次处理之间的最小时间间隔（ms），默认 3000 */
  minProcessInterval?: number;
  /** Jaccard 字符集相似度阈值，超过则跳过，默认 0.9 */
  similarityThreshold?: number;
  /** 默认提取模式，默认 'auto' */
  defaultMode?: VisionExtractMode;
}

export class VisionWorker implements PipelineWorker {
  name = 'vision-worker';

  private lastProcessedText = '';
  private lastProcessTime = 0;
  private readonly minProcessInterval: number;
  private readonly similarityThreshold: number;

  private readonly defaultMode: VisionExtractMode;

  constructor(options: VisionWorkerOptions = {}) {
    this.minProcessInterval = options.minProcessInterval ?? 3000;
    this.similarityThreshold = options.similarityThreshold ?? 0.9;
    this.defaultMode = options.defaultMode ?? 'auto';
  }

  canProcess(message: PipelineMessage): boolean {
    return message.type === 'screenshot';
  }

  async process(message: PipelineMessage): Promise<ExtractionResult | null> {
    const screenshotData = message.data as ScreenshotData;

    // 1. 跳过未变化的帧（由截图模块变化检测设置）
    if (!screenshotData.hasChanged) {
      return null;
    }

    // 2. 时间间隔去重：避免短时间内重复调用 AI
    const now = Date.now();
    if (now - this.lastProcessTime < this.minProcessInterval) {
      return null;
    }

    // 将 ArrayBuffer 转为 base64
    const base64 = arrayBufferToBase64(screenshotData.imageBuffer);

    // 从 metadata 中获取提取模式，或使用默认值
    const mode = (message.metadata?.visionMode as VisionExtractMode) ?? this.defaultMode;

    // 鉴权获取（懒加载）
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    // 调用主进程视觉提取 handler（带详细错误分类）
    let ipcResult: {
      text: string;
      formulas: string[];
      diagrams: string[];
      keyPoints: string[];
      codeBlocks: Array<{ language: string; code: string }>;
      concepts: string[];
      confidence: number;
      modelUsed: string;
      processingTimeMs: number;
      mode: string;
      requestId?: string;
      source: 'local' | 'remote';
    };
    try {
      ipcResult = await window.electronAPI!.invoke('ai_vision_extract', {
        imageBase64: base64,
        language: 'zh',
        mode,
        authToken,
      }) as typeof ipcResult;
    } catch (err: unknown) {
      const errorInfo = classifyVisionError(err);
      console.error(
        `[VisionWorker] 视觉提取失败: ${errorInfo.type} | ${errorInfo.message}`,
        { statusCode: errorInfo.statusCode, cause: err },
      );

      // 通过 metadata 将错误信息传递给 pipeline 下游 / UI 层
      message.metadata = {
        ...message.metadata,
        visionError: {
          type: errorInfo.type,
          message: errorInfo.message,
          statusCode: errorInfo.statusCode,
        },
      };
      return null;
    }

    // 3. 内容相似度去重：提取文本与上次高度相似则跳过
    if (ipcResult.text && this.isSimilarToLast(ipcResult.text)) {
      return null;
    }

    // 更新去重状态
    if (ipcResult.text) {
      this.lastProcessedText = ipcResult.text;
      this.lastProcessTime = now;
    }

    // 转换为 ExtractionResult（camelCase 字段名）
    return {
      text: ipcResult.text,
      confidence: ipcResult.confidence,
      source: 'vision',
      model: ipcResult.modelUsed,
      processingTimeMs: ipcResult.processingTimeMs,
      structured: {
        formulas: ipcResult.formulas,
        diagrams: ipcResult.diagrams,
        keyPoints: ipcResult.keyPoints,
        codeBlocks: ipcResult.codeBlocks,
        concepts: ipcResult.concepts,
        mode: ipcResult.mode,
      },
    };
  }

  dispose(): void {
    this.lastProcessedText = '';
    this.lastProcessTime = 0;
  }

  // ================================================================
  // 内部去重方法
  // ================================================================

  /**
   * 判断当前文本与上次提取的文本是否高度相似
   * 使用 Jaccard 字符集相似度（基于 unique 字符集合）
   */
  private isSimilarToLast(text: string): boolean {
    if (!this.lastProcessedText) return false;

    const setA = new Set(this.lastProcessedText);
    const setB = new Set(text);

    let intersectionSize = 0;
    for (const ch of setA) {
      if (setB.has(ch)) intersectionSize++;
    }

    const unionSize = setA.size + setB.size - intersectionSize;
    return unionSize > 0 && intersectionSize / unionSize > this.similarityThreshold;
  }
}

// ================================================================
// 错误分类工具
// ================================================================

/** 视觉提取错误类型 */
type VisionErrorType =
  | 'network'        // 网络不可达 / fetch 失败
  | 'timeout'        // 请求超时
  | 'auth'           // 认证失败 401/403
  | 'service_error'  // 服务端错误 5xx
  | 'client_error'   // 客户端错误 4xx（非认证）
  | 'unknown';       // 未分类

/** 分类后的错误信息 */
interface VisionErrorInfo {
  type: VisionErrorType;
  message: string;
  statusCode?: number;
}

/**
 * 将未知错误分类为具体的视觉提取错误类型，
 * 并生成用户友好的中文提示。
 */
function classifyVisionError(err: unknown): VisionErrorInfo {
  // 提取 HTTP 状态码（兼容 axios / fetch / 自定义错误对象）
  const status: number | undefined =
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;

  // 判断是否为超时
  const errMsg = (err as Error)?.message ?? String(err);
  const isTimeout = /timeout|timed out|aborted/i.test(errMsg);

  if (isTimeout) {
    return {
      type: 'timeout',
      message: '视觉提取请求超时，请检查网络连接或稍后重试',
    };
  }

  if (status === 401 || status === 403) {
    return {
      type: 'auth',
      message: 'AI 服务认证失败，请检查 API Key 是否正确配置',
      statusCode: status,
    };
  }

  if (status && status >= 500) {
    return {
      type: 'service_error',
      message: `AI 服务暂时不可用（${status}），请稍后重试`,
      statusCode: status,
    };
  }

  if (status && status >= 400) {
    return {
      type: 'client_error',
      message: `视觉提取请求参数错误（${status}），请检查配置`,
      statusCode: status,
    };
  }

  // 网络层错误（fetch 失败、DNS 解析失败等）
  if (
    err instanceof TypeError ||
    /failed to fetch|network|econnrefused|enetunreach/i.test(errMsg)
  ) {
    return {
      type: 'network',
      message: '无法连接 AI 网关服务，请确认网关已启动并检查网络连接',
    };
  }

  return {
    type: 'unknown',
    message: `视觉提取失败：${errMsg}`,
  };
}

// ================================================================
// 工具函数
// ================================================================

/** 将 ArrayBuffer 转为 base64 字符串（分块编码，避免逐字节字符串拼接的 O(n²)） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // 分块大小，避免 fromCharCode 单次参数过多
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
