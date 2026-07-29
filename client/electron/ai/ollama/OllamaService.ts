/**
 * Ollama 本地推理 — 服务检测与模型管理
 *
 * 职责：
 * - 检测 Ollama 可执行文件是否存在
 * - 检测 Ollama 服务是否正在运行
 * - 获取已拉取模型列表
 * - 触发模型拉取（流式进度）
 * - 健康缓存（30s TTL）
 *
 * @ai-context: Ollama 检测与状态服务：安装路径探测（Win/mac/Linux 三平台）+ /api/tags 服务探测 + 30s 状态缓存；未安装时全部静默失败（零打扰原则）。2026-07 拆分：模型管理在 ollamaModelManager.ts。
 */

import { existsSync } from 'fs';
import * as path from 'path';
import { logger } from '../../logger.js';
import { getOllamaConfig } from './config.js';

// ================================================================
// 类型定义
// ================================================================

/** Ollama 安装与运行状态 */
export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
  version?: string;
  lastChecked: number;
}

/** 模型拉取进度回调 */
export interface PullProgressData {
  model: string;
  status: 'downloading' | 'verifying' | 'complete' | 'error';
  percent: number;
  completedBytes?: number;
  totalBytes?: number;
  error?: string;
}

// ================================================================
// 常量
// ================================================================

/** 健康缓存 TTL（ms） */
const HEALTH_CACHE_TTL = 30_000;

/** 检测请求超时（ms） */
const DETECT_TIMEOUT = 3_000;

// ================================================================
// 运行时状态
// ================================================================

let _cachedStatus: OllamaStatus | null = null;

// ================================================================
// 安装检测
// ================================================================

/** 获取当前平台 Ollama 可执行文件的可能路径 */
function getOllamaBinaryPaths(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

  switch (process.platform) {
    case 'win32':
      return [
        path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
        path.join(localAppData, 'Ollama', 'ollama.exe'),
        'C:\\Program Files\\Ollama\\ollama.exe',
      ];
    case 'darwin':
      return [
        '/usr/local/bin/ollama',
        '/opt/homebrew/bin/ollama',
        path.join(home, '.ollama', 'bin', 'ollama'),
      ];
    case 'linux':
      return [
        '/usr/bin/ollama',
        '/usr/local/bin/ollama',
        path.join(home, '.ollama', 'bin', 'ollama'),
      ];
    default:
      return [];
  }
}

/** 检测 Ollama 是否已安装 */
export function isOllamaInstalled(): boolean {
  const paths = getOllamaBinaryPaths();
  return paths.some((p) => existsSync(p));
}

// ================================================================
// 服务检测
// ================================================================

/**
 * 检测 Ollama 服务是否正在运行，并获取模型列表
 * 使用 /api/tags 端点（GET），超时 3s
 */
async function detectOllamaService(): Promise<{ running: boolean; models: string[]; version?: string }> {
  const config = getOllamaConfig();
  const baseUrl = config.baseUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECT_TIMEOUT);

    const resp = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      return { running: false, models: [] };
    }

    const data = await resp.json() as { models?: Array<{ name: string }> };
    const models = (data.models || []).map((m) => m.name);

    // 尝试获取版本号（/api/version 端点）
    let version: string | undefined;
    try {
      const vController = new AbortController();
      const vTimeoutId = setTimeout(() => vController.abort(), 2000);
      const vResp = await fetch(`${baseUrl}/api/version`, { signal: vController.signal });
      clearTimeout(vTimeoutId);
      if (vResp.ok) {
        const vData = await vResp.json() as { version?: string };
        version = vData.version;
      }
    } catch {
      // 版本获取失败不影响主流程
    }

    return { running: true, models, version };
  } catch {
    return { running: false, models: [] };
  }
}

// ================================================================
// 公共 API
// ================================================================

/**
 * 获取 Ollama 完整状态（带缓存）
 * 缓存 30s，避免频繁探测
 */
export async function getOllamaStatus(forceRefresh = false): Promise<OllamaStatus> {
  // 检查缓存是否有效
  if (!forceRefresh && _cachedStatus && (Date.now() - _cachedStatus.lastChecked < HEALTH_CACHE_TTL)) {
    return _cachedStatus;
  }

  const installed = isOllamaInstalled();
  let running = false;
  let models: string[] = [];
  let version: string | undefined;

  if (installed) {
    const result = await detectOllamaService();
    running = result.running;
    models = result.models;
    version = result.version;
  }

  _cachedStatus = {
    installed,
    running,
    models,
    version,
    lastChecked: Date.now(),
  };

  logger.debug(`[Ollama] Status: installed=${installed}, running=${running}, models=[${models.join(', ')}], version=${version ?? 'unknown'}`);
  return _cachedStatus;
}

/**
 * 快速判断 Ollama 是否可用（已启用 + 正在运行）
 * 用于 AI Handler 降级链判断，不触发网络请求（使用缓存）
 */
/** 使状态缓存失效（模型增删后由 ollamaModelManager 调用） */
export function invalidateStatusCache(): void {
  _cachedStatus = null;
}

export function isOllamaAvailable(): boolean {
  if (!_cachedStatus) return false;
  // 缓存过期则视为不可用（下次 getOllamaStatus 会刷新）
  if (Date.now() - _cachedStatus.lastChecked > HEALTH_CACHE_TTL) return false;
  return _cachedStatus.running;
}

/**
 * 应用启动时执行初始检测（如果 autoDetect 开启）
 */
export async function initOllamaDetection(): Promise<void> {
  const config = getOllamaConfig();
  if (!config.autoDetect) {
    logger.info('[Ollama] Auto-detect disabled, skipping initial detection');
    return;
  }

  // 异步检测，不阻塞启动
  getOllamaStatus(true).then((status) => {
    if (status.installed && status.running) {
      logger.info(`[Ollama] Detected running Ollama v${status.version ?? '?'} with ${status.models.length} model(s)`);
    } else if (status.installed) {
      logger.info('[Ollama] Ollama installed but not running');
    }
  }).catch(() => {
    // 静默失败
  });
}

// ─── 向后兼容 re-export（模型管理已拆至 ollamaModelManager.ts） ───
export { pullModel, deleteModel } from './ollamaModelManager.js';
