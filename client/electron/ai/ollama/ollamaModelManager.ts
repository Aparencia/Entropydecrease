/**
 * Ollama 模型管理（拉取/删除）
 *
 * @ai-context: 从 OllamaService.ts 拆出。pullModel 流式读取 /api/pull
 * 的 NDJSON 进度（downloading→verifying→complete），progress 回调供
 * IPC 转发到渲染进程进度条；操作成功后必须 invalidateStatusCache()
 * 使状态缓存失效，否则模型列表不刷新。
 * @ai-context: 模型下载走用户配置的 baseUrl（含国内镜像支持，见
 * ollama/config.ts）；deleteModel 30s 超时。
 */
import { logger } from '../../logger.js';
import { getOllamaConfig } from './config.js';
import { invalidateStatusCache, type PullProgressData } from './OllamaService.js';

/**
 * 拉取模型（流式进度）
 * @param modelName 模型名称（如 'qwen2.5:7b'）
 * @param onProgress 进度回调
 */
export async function pullModel(
  modelName: string,
  onProgress?: (progress: PullProgressData) => void,
): Promise<void> {
  const config = getOllamaConfig();
  const baseUrl = config.baseUrl;

  logger.info(`[Ollama] Pulling model: ${modelName}`);

  const resp = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown error');
    throw new Error(`Ollama pull failed: HTTP ${resp.status} - ${detail}`);
  }

  if (!resp.body) {
    throw new Error('Ollama pull: no response body');
  }

  // 流式读取 NDJSON 进度
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as {
          status?: string;
          completed?: number;
          total?: number;
          error?: string;
        };

        if (data.error) {
          onProgress?.({
            model: modelName,
            status: 'error',
            percent: 0,
            error: data.error,
          });
          throw new Error(`Ollama pull error: ${data.error}`);
        }

        const status = data.status || '';
        if (status === 'success') {
          onProgress?.({ model: modelName, status: 'complete', percent: 100 });
          logger.info(`[Ollama] Model pulled successfully: ${modelName}`);
          // 刷新缓存
          invalidateStatusCache();
          return;
        }

        // 下载进度
        if (data.total && data.completed != null) {
          const percent = Math.round((data.completed / data.total) * 100);
          onProgress?.({
            model: modelName,
            status: 'downloading',
            percent,
            completedBytes: data.completed,
            totalBytes: data.total,
          });
        } else if (status.includes('verif')) {
          onProgress?.({ model: modelName, status: 'verifying', percent: 99 });
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Ollama pull error')) throw e;
        // JSON 解析失败，跳过该行
      }
    }
  }

  // 流结束但未收到 success
  onProgress?.({ model: modelName, status: 'complete', percent: 100 });
  invalidateStatusCache();
}

/**
 * 删除本地模型
 * @param modelName 模型名称（如 'qwen2.5:7b'）
 */
export async function deleteModel(modelName: string): Promise<void> {
  const config = getOllamaConfig();
  const baseUrl = config.baseUrl;

  logger.info(`[Ollama] Deleting model: ${modelName}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const resp = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const detail = await resp.text().catch(() => 'unknown error');
      throw new Error(`Ollama delete failed: HTTP ${resp.status} - ${detail}`);
    }

    logger.info(`[Ollama] Model deleted successfully: ${modelName}`);
    // 清除缓存，下次获取状态时刷新模型列表
    invalidateStatusCache();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Ollama delete timed out');
    }
    throw e;
  }
}
