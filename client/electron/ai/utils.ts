/**
 * AI 网关公共工具函数
 *
 * 提取自 aiHandlers.ts，包含所有 AI handler 共用的
 * POST 请求辅助函数、网关地址管理和功能注册表接口定义。
 */

import { app } from 'electron';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../logger.js';
import { isLocalInferenceEnabled } from './ollama/config.js';
import { isOllamaAvailable } from './ollama/OllamaService.js';

// ================================================================
// 常量
// ================================================================

const DEFAULT_GATEWAY_URL = 'https://entropydecrease.com';
const GATEWAY_CONFIG_FILE = 'ai-gateway-config.json';

// ── 运行时网关地址（渲染进程通过 IPC 同步） ──
let _runtimeGatewayUrl: string | null = null;

/** 记录 gatewayUrl() 是否已打印过首次解析日志，避免重复输出 */
let _gatewayFirstResolveLogged = false;

/**
 * 判定当前是否为开发模式
 * 可靠依据：electron:dev 脚本设置 NODE_ENV=development，安装包运行时 app.isPackaged=true
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

/**
 * 获取 AI 网关地址
 *
 * 按模式分流优先级：
 * - 开发模式：环境变量 > 运行时 IPC > 默认值
 * - 生产模式：运行时 IPC > 持久化文件(已存入_runtimeGatewayUrl) > 环境变量 > 默认值
 */
export function gatewayUrl(): string {
  const url = _resolveGatewayUrl();
  if (!_gatewayFirstResolveLogged) {
    _gatewayFirstResolveLogged = true;
    const dev = isDevMode();
    const source = dev
      ? (process.env.VITE_AI_GATEWAY_URL
          ? `env (VITE_AI_GATEWAY_URL=${process.env.VITE_AI_GATEWAY_URL})`
          : _runtimeGatewayUrl
            ? 'runtime (IPC)'
            : 'DEFAULT (hardcoded fallback)')
      : (_runtimeGatewayUrl
          ? 'runtime (IPC/persisted)'
          : process.env.VITE_AI_GATEWAY_URL
            ? `env (VITE_AI_GATEWAY_URL=${process.env.VITE_AI_GATEWAY_URL})`
            : 'DEFAULT (hardcoded fallback)');
    logger.info(`[AI] Gateway URL resolved: ${url}  [source: ${source}, mode: ${dev ? 'dev' : 'prod'}]`);
    if (!process.env.VITE_AI_GATEWAY_URL && !_runtimeGatewayUrl) {
      logger.warn('[AI] Gateway URL fell back to DEFAULT. Set VITE_AI_GATEWAY_URL in .env or configure via AI settings.');
    }
  }
  return url;
}

/** 内部解析逻辑，按模式分流优先级 */
function _resolveGatewayUrl(): string {
  if (isDevMode()) {
    // 开发模式：环境变量优先，持久化不覆盖开发配置
    return process.env.VITE_AI_GATEWAY_URL || _runtimeGatewayUrl || DEFAULT_GATEWAY_URL;
  }
  // 生产模式：运行时/持久化 > 环境变量 > 默认值
  return _runtimeGatewayUrl || process.env.VITE_AI_GATEWAY_URL || DEFAULT_GATEWAY_URL;
}

/**
 * 设置运行时网关地址（由渲染进程通过 IPC 调用）
 * 同时持久化到 userData 目录，确保主进程重启后仍可用
 */
export async function setRuntimeGatewayUrl(url: string): Promise<void> {
  _runtimeGatewayUrl = url;
  // 重置首次解析日志标记，使下次 gatewayUrl() 重新打印来源
  _gatewayFirstResolveLogged = false;
  logger.info(`[AI] Runtime gateway URL set via IPC: ${url}`);
  // 开发模式不写入持久化文件，防止调试数据污染生产配置
  if (isDevMode()) {
    logger.info('[AI] Dev mode: skip persisting gateway URL to file');
    return;
  }
  // 持久化到文件
  try {
    const configPath = path.join(app.getPath('userData'), GATEWAY_CONFIG_FILE);
    await writeFile(configPath, JSON.stringify({ gatewayUrl: url }), 'utf-8');
  } catch (err) {
    logger.error('[AI-Gateway] Failed to persist gateway URL', err);
  }
}

/**
 * 应用启动时从持久化文件加载网关地址
 * 在 registerAIHandlers 之前调用
 */
export async function loadPersistedGatewayUrl(): Promise<void> {
  if (isDevMode()) {
    logger.info('[AI] Dev mode: skip loading persisted gateway URL (using .env config)');
    return;
  }
  try {
    const configPath = path.join(app.getPath('userData'), GATEWAY_CONFIG_FILE);
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config.gatewayUrl) {
      _runtimeGatewayUrl = config.gatewayUrl;
      logger.info(`[AI] Loaded persisted gateway URL from file: ${config.gatewayUrl}`);
    }
  } catch {
    // 文件不存在或解析失败，静默忽略
  }
}

// ================================================================
// AI 功能注册表接口定义
// ================================================================

/**
 * AI 功能定义接口
 *
 * 每个 AI handler 文件导出一个符合此接口的对象，
 * 由 ai/index.ts 统一收集并注册到 IPC 系统。
 */
export interface AIFeatureDef {
  /** 功能唯一标识符，对应 IPC channel 名称 */
  id: string;
  /** 功能显示名称 */
  name: string;
  /** 功能版本 */
  version: string;
  /** 注册函数，由注册引擎调用 */
  register: () => void;
}

// ================================================================
// 通用 POST 请求辅助函数
// ================================================================

/**
 * 通用 POST 请求辅助函数：
 * 1. 将请求体序列化为 JSON
 * 2. 如有 authToken，添加 Authorization header
 * 3. HTTP 失败时抛出包含状态码和详情的错误字符串
 * 4. 返回解析后的 JSON 响应
 */
export async function postJson<TReq, TRes>(
  apiPath: string,
  body: TReq,
  authToken?: string,
  userApiKey?: string,
  timeoutMs: number = 60000,
): Promise<{ data: TRes; requestId: string | undefined }> {
  const base = gatewayUrl();
  if (!base) {
    throw new Error('[AI] Gateway URL not configured. Set VITE_AI_GATEWAY_URL in .env or configure via AI settings');
  }
  const url = `${base}${apiPath}`;
  const startTime = Date.now();
  const clientRequestId = randomUUID();

  // ── 请求前日志 ──
  logger.info(`[AI] → POST ${url} [req-id: ${clientRequestId}]`);
  logger.debug(`[AI] Request config: timeout=${timeoutMs}ms, hasAuth=${!!authToken}, hasUserKey=${!!userApiKey}, bodyKeys=${Object.keys(body as Record<string, unknown>).join(',')}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': clientRequestId,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (userApiKey) {
    headers['X-User-API-Key'] = userApiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (networkError: unknown) {
    const elapsed = Date.now() - startTime;
    const err = networkError as { name?: string; message?: string; cause?: unknown };
    if (err.name === 'AbortError') {
      logger.error(`[AI] ✖ TIMEOUT ${url} after ${elapsed}ms`);
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    // 详细网络错误诊断
    const cause = err.cause ? String(err.cause) : '';
    const errDetail = err.message || String(networkError);
    logger.error(`[AI] ✖ NETWORK_ERROR ${url} after ${elapsed}ms: ${errDetail}${cause ? ` (cause: ${cause})` : ''}`);
    // 识别常见网络错误码
    if (/ECONNREFUSED/i.test(errDetail)) {
      logger.error('[AI] Hint: Connection refused — check if AI Gateway service is running and the URL is correct');
    } else if (/ENOTFOUND/i.test(errDetail)) {
      logger.error('[AI] Hint: DNS resolution failed — check the gateway URL hostname');
    } else if (/ETIMEDOUT/i.test(errDetail)) {
      logger.error('[AI] Hint: Connection timed out — check network connectivity and firewall rules');
    }
    throw new Error(`Network error: ${errDetail}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsed = Date.now() - startTime;
  const requestId = resp.headers.get('ai-gateway-request-id') ?? undefined;

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown error');
    // 截取响应体前 500 字符防止日志爆炸
    const detailPreview = detail.length > 500 ? `${detail.slice(0, 500)}...(+${detail.length - 500} chars)` : detail;
    logger.error(`[AI] ✖ HTTP ${resp.status} ${url} (${elapsed}ms) [req-id: ${requestId ?? clientRequestId}]: ${detailPreview}`);
    throw new Error(`HTTP ${resp.status}: ${detail}`);
  }

  logger.info(`[AI] ← ${resp.status} ${url} (${elapsed}ms)${requestId ? ` [req-id: ${requestId}]` : ''}`);

  try {
    const data = (await resp.json()) as TRes;
    return { data, requestId };
  } catch (e) {
    logger.error(`[AI] Response JSON parse error for ${url}: ${e}`);
    throw new Error(`Response parse error: ${e}`);
  }
}

/**
 * Multipart POST 请求辅助函数：
 * 1. 不设置 Content-Type header（Node.js fetch 自动设置 multipart/form-data; boundary=...）
 * 2. body 直接传 FormData（不做 JSON.stringify）
 * 3. 默认超时 300000ms（5 分钟，视频文件较大）
 * 4. 其余逻辑（gatewayUrl、AbortController、日志、request-id、错误处理）与 postJson 保持一致
 */
export async function postMultipart<TRes>(
  apiPath: string,
  formData: FormData,
  authToken?: string,
  userApiKey?: string,
  timeoutMs: number = 300000,
): Promise<{ data: TRes; requestId: string | undefined }> {
  const base = gatewayUrl();
  if (!base) {
    throw new Error('[AI] Gateway URL not configured. Set VITE_AI_GATEWAY_URL in .env or configure via AI settings');
  }
  const url = `${base}${apiPath}`;
  const startTime = Date.now();
  const clientRequestId = randomUUID();

  // ── 请求前日志 ──
  logger.info(`[AI] → POST ${url} [req-id: ${clientRequestId}]`);
  logger.debug(`[AI] Request config: timeout=${timeoutMs}ms, hasAuth=${!!authToken}, hasUserKey=${!!userApiKey}, body=FormData`);

  const headers: Record<string, string> = {
    'X-Request-ID': clientRequestId,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (userApiKey) {
    headers['X-User-API-Key'] = userApiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (networkError: unknown) {
    const elapsed = Date.now() - startTime;
    const err = networkError as { name?: string; message?: string; cause?: unknown };
    if (err.name === 'AbortError') {
      logger.error(`[AI] ✖ TIMEOUT ${url} after ${elapsed}ms`);
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    // 详细网络错误诊断
    const cause = err.cause ? String(err.cause) : '';
    const errDetail = err.message || String(networkError);
    logger.error(`[AI] ✖ NETWORK_ERROR ${url} after ${elapsed}ms: ${errDetail}${cause ? ` (cause: ${cause})` : ''}`);
    // 识别常见网络错误码
    if (/ECONNREFUSED/i.test(errDetail)) {
      logger.error('[AI] Hint: Connection refused — check if AI Gateway service is running and the URL is correct');
    } else if (/ENOTFOUND/i.test(errDetail)) {
      logger.error('[AI] Hint: DNS resolution failed — check the gateway URL hostname');
    } else if (/ETIMEDOUT/i.test(errDetail)) {
      logger.error('[AI] Hint: Connection timed out — check network connectivity and firewall rules');
    }
    throw new Error(`Network error: ${errDetail}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsed = Date.now() - startTime;
  const requestId = resp.headers.get('ai-gateway-request-id') ?? undefined;

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown error');
    // 截取响应体前 500 字符防止日志爆炸
    const detailPreview = detail.length > 500 ? `${detail.slice(0, 500)}...(+${detail.length - 500} chars)` : detail;
    logger.error(`[AI] ✖ HTTP ${resp.status} ${url} (${elapsed}ms) [req-id: ${requestId ?? clientRequestId}]: ${detailPreview}`);
    throw new Error(`HTTP ${resp.status}: ${detail}`);
  }

  logger.info(`[AI] ← ${resp.status} ${url} (${elapsed}ms)${requestId ? ` [req-id: ${requestId}]` : ''}`);

  try {
    const data = (await resp.json()) as TRes;
    return { data, requestId };
  } catch (e) {
    logger.error(`[AI] Response JSON parse error for ${url}: ${e}`);
    throw new Error(`Response parse error: ${e}`);
  }
}

// ================================================================
// 本地 Ollama 降级链
// ================================================================

/**
 * 带本地 Ollama 降级的调用函数
 *
 * 逻辑：
 * 1. 检查 OllamaConfig.enabled && OllamaService.isRunning()
 * 2. 是 → 调用 localHandler()，成功则返回 { source: 'local' }
 * 3. 本地失败/未启用 → 调用现有 postJson()（远程 AI Gateway）
 *
 * @param apiPath 远程 API 路径
 * @param body 请求体
 * @param localHandler 本地 Ollama 调用函数
 * @param authToken 认证 token
 * @param userApiKey 用户 API Key
 * @param timeoutMs 远程调用超时
 */
export async function callWithLocalFallback<TReq, TRes>(
  apiPath: string,
  body: TReq,
  localHandler: () => Promise<TRes>,
  authToken?: string,
  userApiKey?: string,
  timeoutMs: number = 60000,
): Promise<{ data: TRes; source: 'local' | 'remote'; requestId?: string }> {
  // 检查本地 Ollama 是否可用
  if (isLocalInferenceEnabled() && isOllamaAvailable()) {
    try {
      const localResult = await localHandler();
      logger.info(`[AI] ← Local Ollama success for ${apiPath}`);
      return { data: localResult, source: 'local' };
    } catch (localErr) {
      const errMsg = localErr instanceof Error ? localErr.message : String(localErr);
      logger.warn(`[AI] Local Ollama failed for ${apiPath}, falling back to remote: ${errMsg}`);
      // 本地失败，降级到远程
    }
  }

  // 远程 AI Gateway 调用
  const { data, requestId } = await postJson<TReq, TRes>(
    apiPath,
    body,
    authToken,
    userApiKey,
    timeoutMs,
  );
  return { data, source: 'remote', requestId };
}

// ================================================================
// 流式 POST 请求辅助函数（SSE 解析）
// ================================================================

/**
 * 流式 POST 请求：解析 SSE data: 行，逐 chunk yield 文本
 *
 * @param apiPath API 路径（如 /api/v1/ai/summarize/stream）
 * @param body 请求体
 * @param authToken 认证 token
 * @param userApiKey 用户 API Key
 * @param timeoutMs 超时时间
 */
export async function* postJsonStream<TReq>(
  apiPath: string,
  body: TReq,
  authToken?: string,
  userApiKey?: string,
  timeoutMs: number = 300000,
): AsyncGenerator<string, void, unknown> {
  const base = gatewayUrl();
  if (!base) {
    throw new Error('[AI] Gateway URL not configured');
  }
  const url = `${base}${apiPath}`;
  const clientRequestId = randomUUID();

  logger.info(`[AI] → POST (stream) ${url} [req-id: ${clientRequestId}]`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': clientRequestId,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (userApiKey) {
    headers['X-User-API-Key'] = userApiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (networkError: unknown) {
    const err = networkError as { name?: string; message?: string };
    if (err.name === 'AbortError') {
      throw new Error(`Stream request timeout after ${timeoutMs}ms`);
    }
    throw new Error(`Stream network error: ${err.message || String(networkError)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const requestId = resp.headers.get('ai-gateway-request-id') ?? undefined;

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown error');
    logger.error(`[AI] ✖ Stream HTTP ${resp.status} ${url} [req-id: ${requestId ?? clientRequestId}]: ${detail.slice(0, 200)}`);
    throw new Error(`Stream HTTP ${resp.status}: ${detail}`);
  }

  logger.info(`[AI] ← Stream started ${url}${requestId ? ` [req-id: ${requestId}]` : ''}`);

  if (!resp.body) {
    throw new Error('Stream response body is null');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 分割 SSE 事件
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(`Stream error: ${parsed.error}`);
              }
              if (parsed.chunk) {
                yield parsed.chunk;
              }
            } catch (e) {
              // JSON 解析失败，尝试作为纯文本
              if (data && data !== '[DONE]') {
                yield data;
              }
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
