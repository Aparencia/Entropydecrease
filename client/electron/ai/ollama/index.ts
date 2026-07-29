/**
 * Ollama 本地推理 — IPC Handler 注册入口
 *
 * 注册 Ollama 相关 IPC channel：
 * - ollama:get-status → 返回 OllamaStatus
 * - ollama:set-config → 更新配置
 * - ollama:pull-model → 触发模型下载（流式进度推送）
 *
 * @ai-context: Ollama 模块 IPC 注册出口（状态/配置/模型管理通道）。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../logger.js';
import { getOllamaStatus, pullModel, deleteModel, initOllamaDetection } from './OllamaService.js';
import { loadOllamaConfig, updateOllamaConfig, getOllamaConfig } from './config.js';

// ================================================================
// IPC Handler 注册
// ================================================================

/**
 * 注册所有 Ollama 相关 IPC Handler
 * 在 registerAIHandlers() 中调用
 */
export function registerOllamaHandlers(): void {
  logger.info('[Ollama] Registering IPC handlers...');

  // ---- 获取状态 ----
  ipcMain.handle('ollama:get-status', async (_event, forceRefresh?: boolean) => {
    try {
      const status = await getOllamaStatus(forceRefresh ?? false);
      const config = getOllamaConfig();
      return { status, config };
    } catch (err) {
      logger.error('[Ollama] get-status failed:', err);
      return {
        status: { installed: false, running: false, models: [], lastChecked: Date.now() },
        config: getOllamaConfig(),
      };
    }
  });

  // ---- 更新配置 ----
  ipcMain.handle('ollama:set-config', async (_event, partial: Record<string, unknown>) => {
    try {
      const updated = await updateOllamaConfig(partial);
      logger.info(`[Ollama] Config updated via IPC: enabled=${updated.enabled}`);
      return updated;
    } catch (err) {
      logger.error('[Ollama] set-config failed:', err);
      throw err;
    }
  });

  // ---- 拉取模型 ----
  ipcMain.handle('ollama:pull-model', async (event, modelName: string) => {
    if (!modelName || typeof modelName !== 'string') {
      throw new Error('Invalid model name');
    }

    logger.info(`[Ollama] Pull model requested: ${modelName}`);

    // 获取发送进度的窗口
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    try {
      await pullModel(modelName, (progress) => {
        // 向渲染进程推送进度
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('ollama:pull-progress', progress);
        }
      });
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Ollama] Pull model failed: ${errorMsg}`);
      // 推送错误进度
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('ollama:pull-progress', {
          model: modelName,
          status: 'error',
          percent: 0,
          error: errorMsg,
        });
      }
      throw err;
    }
  });

  // ---- 删除模型 ----
  ipcMain.handle('ollama:delete-model', async (_event, modelName: string) => {
    if (!modelName || typeof modelName !== 'string') {
      throw new Error('Invalid model name');
    }

    logger.info(`[Ollama] Delete model requested: ${modelName}`);

    try {
      await deleteModel(modelName);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Ollama] Delete model failed: ${errorMsg}`);
      throw err;
    }
  });

  logger.info('[Ollama] All IPC handlers registered');
}

/**
 * 初始化 Ollama 模块
 * 在应用启动时调用（registerAIHandlers 之前）
 */
export async function initOllama(): Promise<void> {
  await loadOllamaConfig();
  await initOllamaDetection();
}

// 统一导出
export { getOllamaStatus, pullModel, deleteModel } from './OllamaService.js';
export { getOllamaConfig, updateOllamaConfig, isLocalInferenceEnabled } from './config.js';
export { generateText, generateVision, generateVisionMulti } from './OllamaProvider.js';
export { isOllamaAvailable } from './OllamaService.js';
