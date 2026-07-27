/**
 * AI Handler 统一注册入口
 *
 * 汇总所有 AI 功能 handler，提供 registerAIHandlers() 函数
 * 一次性注册全部 AI IPC handler。
 */

import { logger } from '../logger.js';
import type { AIFeatureDef } from './utils.js';
import { registerOllamaHandlers, initOllama } from './ollama/index.js';
import { registerStreamHandler } from './streamHandler.js';

// 导入所有 AI 功能模块
import { feature as summarizeFeature } from './handlers/summarizeHandler.js';
import { feature as flashcardFeature } from './handlers/flashcardHandler.js';
import { feature as evaluateFeature } from './handlers/evaluateHandler.js';
import { feature as feynmanFeature } from './handlers/feynmanHandler.js';
import { feature as tagFeature } from './handlers/tagHandler.js';
import { feature as recommendFeature } from './handlers/recommendHandler.js';
import { feature as optimizeCardFeature } from './handlers/optimizeCardHandler.js';
import { feature as anchorPointFeature } from './handlers/anchorPointHandler.js';
import { feature as socraticFeature } from './handlers/socraticHandler.js';
import { feature as predictFeature } from './handlers/predictHandler.js';
import { feature as rescueFeature } from './handlers/rescueHandler.js';
import { feature as visionExtractFeature } from './handlers/visionExtractHandler.js';
import { feature as sessionAnalyzeFeature } from './handlers/sessionAnalyzeHandler.js';
import { feature as videoAnalyzeFeature } from './handlers/videoAnalyzeHandler.js';
import { feature as mergeNotesFeature } from './handlers/mergeNotesHandler.js';

// ================================================================
// 功能注册表
// ================================================================

/** 所有已注册的 AI 功能模块 */
const features: AIFeatureDef[] = [
  summarizeFeature,
  flashcardFeature,
  evaluateFeature,
  feynmanFeature,
  tagFeature,
  recommendFeature,
  optimizeCardFeature,
  anchorPointFeature,
  socraticFeature,
  predictFeature,
  rescueFeature,
  visionExtractFeature,
  sessionAnalyzeFeature,
  videoAnalyzeFeature,
  mergeNotesFeature,
];

// ================================================================
// 统一注册函数
// ================================================================

/**
 * 注册所有 AI IPC Handler
 *
 * 遍历功能注册表，依次调用每个功能的 register() 方法，
 * 将对应的 safeHandle 绑定到 ipcMain。
 * 同时注册 Ollama 本地推理相关 IPC handler。
 */
export function registerAIHandlers(): void {
  logger.info(`[AI] Registering ${features.length} AI feature(s)...`);
  for (const feat of features) {
    feat.register();
    logger.info(`[AI] Registered: ${feat.name} (${feat.id}) v${feat.version}`);
  }

  // 注册 Ollama 本地推理 IPC handler
  registerOllamaHandlers();

  // 注册流式输出 IPC handler
  registerStreamHandler();

  logger.info('[AI] All AI handlers registered successfully');
}

/**
 * 初始化 AI 模块（包括 Ollama 配置加载与检测）
 * 应在应用启动时、registerAIHandlers() 之前调用
 */
export async function initAIModule(): Promise<void> {
  await initOllama();
}
