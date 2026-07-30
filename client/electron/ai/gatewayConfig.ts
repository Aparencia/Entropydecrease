/**
 * AI 网关地址管理（主进程侧）
 *
 * @ai-context: 从 ai/utils.ts 拆出。地址解析优先级按模式分流：
 * 开发=env > IPC运行时 > 默认；生产=IPC/持久化 > env > 默认。
 * 开发模式不写持久化文件（防调试数据污染生产配置）。
 * 持久化文件为 userData/ai-gateway-config.json。
 * @ai-context: DEFAULT_GATEWAY_URL 与 cspPolicy.ts、渲染进程 config.ts
 * 三处需保持一致；修改默认域名需三处同步。
 */
import { app } from 'electron';
import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../logger.js';

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
