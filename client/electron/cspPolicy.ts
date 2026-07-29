/**
 * CSP 安全策略注入（SEC-005）
 *
 * @ai-context: 从 main.ts 拆出。connect-src 白名单每次请求动态计算，
 * 确保用户运行时修改网关 URL 立即生效。生产 script-src 必须保留
 * 'wasm-unsafe-eval'——否则 automerge WASM 被 CSP 拦截、顶层 import
 * 失败、应用卡启动画面（仅放开 WASM 编译，不放开 JS eval）。
 * @ai-context: 开发模式需 unsafe-eval + worker-src blob:（Vite 8 HMR
 * 用 blob: 创建 SharedWorker）。修改 CSP 前必须全链路回归启动流程。
 */
import { session } from 'electron';
import { logger } from './logger.js';
import { gatewayUrl } from './ai/utils.js';

/** 生产网关默认域（与 ai/utils DEFAULT_GATEWAY_URL 保持一致） */
const DEFAULT_GATEWAY = 'https://entropydecrease.com';

/**
 * 动态构建 connect-src 白名单
 * 每次请求时重新计算，确保运行时网关 URL 变更（如用户通过设置页修改）能及时生效
 */
function buildExtraConnectSrc(): string {
  const extraOrigins = new Set<string>();
  // 当前运行时网关 URL（可能已被用户通过 IPC 修改）
  const currentGateway = gatewayUrl();
  if (currentGateway && currentGateway !== DEFAULT_GATEWAY) {
    extraOrigins.add(currentGateway);
  }
  // 环境变量中的 API 地址
  const configuredApi = process.env.VITE_API_BASE_URL || '';
  if (configuredApi && configuredApi !== DEFAULT_GATEWAY) {
    extraOrigins.add(configuredApi);
  }
  return extraOrigins.size > 0 ? ` ${[...extraOrigins].join(' ')}` : '';
}

/**
 * 注入 CSP 响应头（app ready 后调用一次）
 */
export function installCspPolicy(isDev: boolean): void {
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const extraConnectSrc = buildExtraConnectSrc();
      // 开发环境：允许 unsafe-inline/unsafe-eval（Vite HMR 需要），worker-src 需要 blob:
      // 生产环境：禁止 unsafe-eval，保留 unsafe-inline（Tailwind 运行时需要）
      const csp = isDev
        ? `default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; worker-src 'self' blob: http://localhost:*; connect-src 'self' http://localhost:* ws://localhost:* https://*.supabase.co wss://*.supabase.co https://entropydecrease.com wss://entropydecrease.com${extraConnectSrc}; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:;`
        : `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://entropydecrease.com wss://entropydecrease.com${extraConnectSrc}; frame-ancestors 'none';`;

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
    logger.info(`[SEC] CSP policy injected (${isDev ? 'development' : 'production'} mode, dynamic gateway tracking enabled)`);
  } catch (err) {
    // CSP 注入失败时记录错误但不阻塞启动
    logger.error('[SEC] Failed to inject CSP policy', err);
  }
}
