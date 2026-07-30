/**
 * AI 网关 HTTP 请求层（postJson / postMultipart / 降级链）
 *
 * @ai-context: 从 ai/utils.ts 拆出。executePost 统一 JSON 与 multipart
 * 两种请求的公共骨架（超时/日志/req-id/错误诊断/响应解析），消除原
 * 两函数 80 行重复；错误诊断按 ECONNREFUSED/ENOTFOUND/ETIMEDOUT 给出
 * 运维提示。X-Request-ID 贯穿网关日志链路。
 * @ai-context: callWithLocalFallback 是"本地优先、云端降级"的核心：
 * Ollama 启用且运行 → localHandler，失败静默降级 postJson；
 * source 字段（'local'|'remote'）供渲染层展示推理来源，勿删。
 */
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { gatewayUrl } from './gatewayConfig.js';
import { isLocalInferenceEnabled } from './ollama/config.js';
import { isOllamaAvailable } from './ollama/OllamaService.js';

/** 构建公共请求头（JSON 模式含 Content-Type，multipart 由 fetch 自动生成） */
function buildHeaders(clientRequestId: string, json: boolean, authToken?: string, userApiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-Request-ID': clientRequestId };
  if (json) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (userApiKey) headers['X-User-API-Key'] = userApiKey;
  return headers;
}

/** 网络错误诊断日志（常见错误码给出运维提示） */
function logNetworkHint(errDetail: string): void {
  if (/ECONNREFUSED/i.test(errDetail)) {
    logger.error('[AI] Hint: Connection refused — check if AI Gateway service is running and the URL is correct');
  } else if (/ENOTFOUND/i.test(errDetail)) {
    logger.error('[AI] Hint: DNS resolution failed — check the gateway URL hostname');
  } else if (/ETIMEDOUT/i.test(errDetail)) {
    logger.error('[AI] Hint: Connection timed out — check network connectivity and firewall rules');
  }
}

/**
 * POST 公共骨架：超时控制 + 日志 + req-id + 错误诊断 + JSON 响应解析
 */
async function executePost<TRes>(
  apiPath: string,
  requestBody: string | FormData,
  isJson: boolean,
  bodyDesc: string,
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
  logger.debug(`[AI] Request config: timeout=${timeoutMs}ms, hasAuth=${!!authToken}, hasUserKey=${!!userApiKey}, ${bodyDesc}`);

  const headers = buildHeaders(clientRequestId, isJson, authToken, userApiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
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
    logNetworkHint(errDetail);
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
  const bodyDesc = `bodyKeys=${Object.keys(body as Record<string, unknown>).join(',')}`;
  return executePost<TRes>(apiPath, JSON.stringify(body), true, bodyDesc, authToken, userApiKey, timeoutMs);
}

/**
 * Multipart POST 请求辅助函数：
 * 1. 不设置 Content-Type header（Node.js fetch 自动设置 multipart/form-data; boundary=...）
 * 2. body 直接传 FormData（不做 JSON.stringify）
 * 3. 默认超时 300000ms（5 分钟，视频文件较大）
 */
export async function postMultipart<TRes>(
  apiPath: string,
  formData: FormData,
  authToken?: string,
  userApiKey?: string,
  timeoutMs: number = 300000,
): Promise<{ data: TRes; requestId: string | undefined }> {
  return executePost<TRes>(apiPath, formData, false, 'body=FormData', authToken, userApiKey, timeoutMs);
}

/**
 * 带本地 Ollama 降级的调用函数
 *
 * 逻辑：
 * 1. 检查 OllamaConfig.enabled && OllamaService.isRunning()
 * 2. 是 → 调用 localHandler()，成功则返回 { source: 'local' }
 * 3. 本地失败/未启用 → 调用现有 postJson()（远程 AI Gateway）
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
