/**
 * Ollama 本地推理 — 配置持久化模块
 *
 * 配置文件统一存放于 userData/ollama-config.json，
 * 与现有 ai-gateway-config.json、storage-config.json 同级。
 */

import { app } from 'electron';
import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../../logger.js';

// ================================================================
// 类型定义
// ================================================================

/** 模型映射配置 */
export interface OllamaModelMapping {
  /** 通用文本模型 */
  text: string;
  /** 多模态视觉模型 */
  vision: string;
}

/** Ollama 本地推理用户配置 */
export interface OllamaConfig {
  /** 用户是否启用本地推理 */
  enabled: boolean;
  /** Ollama 服务地址 */
  baseUrl: string;
  /** 模型映射 */
  models: OllamaModelMapping;
  /** 是否启动时自动检测 Ollama */
  autoDetect: boolean;
  /** 模型下载镜像地址（国内加速），空字符串表示使用默认 */
  registryMirror: string;
}

// ================================================================
// 常量
// ================================================================

const CONFIG_FILE_NAME = 'ollama-config.json';

/** 默认配置 */
const DEFAULT_CONFIG: OllamaConfig = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  models: {
    text: 'qwen2.5:7b',
    vision: 'qwen2.5vl:7b',
  },
  autoDetect: true,
  registryMirror: '',
};

// ================================================================
// 运行时状态
// ================================================================

let _config: OllamaConfig | null = null;

// ================================================================
// 公共 API
// ================================================================

/** 获取配置文件完整路径 */
export function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/**
 * 获取当前 Ollama 配置
 * 首次调用时从文件加载，后续直接返回内存缓存
 */
export function getOllamaConfig(): OllamaConfig {
  if (_config) return { ..._config };
  return { ...DEFAULT_CONFIG };
}

/**
 * 应用启动时从持久化文件加载配置
 * 在 registerOllamaHandlers 之前调用
 */
export async function loadOllamaConfig(): Promise<void> {
  try {
    const configPath = getConfigPath();
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    _config = {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_CONFIG.enabled,
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim().replace(/\/$/, '')
        : DEFAULT_CONFIG.baseUrl,
      models: {
        text: parsed.models?.text || DEFAULT_CONFIG.models.text,
        vision: parsed.models?.vision || DEFAULT_CONFIG.models.vision,
      },
      autoDetect: typeof parsed.autoDetect === 'boolean' ? parsed.autoDetect : DEFAULT_CONFIG.autoDetect,
      registryMirror: typeof parsed.registryMirror === 'string' ? parsed.registryMirror.trim() : DEFAULT_CONFIG.registryMirror,
    };
    logger.info(`[Ollama] Config loaded: enabled=${_config.enabled}, baseUrl=${_config.baseUrl}, text=${_config.models.text}, vision=${_config.models.vision}`);
  } catch {
    // 文件不存在或解析失败，使用默认配置
    _config = { ...DEFAULT_CONFIG };
    logger.info('[Ollama] No persisted config found, using defaults');
  }
}

/**
 * 更新 Ollama 配置并持久化
 * 支持部分更新（merge 语义）
 */
export async function updateOllamaConfig(partial: Partial<OllamaConfig>): Promise<OllamaConfig> {
  const current = getOllamaConfig();
  const updated: OllamaConfig = {
    enabled: partial.enabled ?? current.enabled,
    baseUrl: partial.baseUrl
      ? partial.baseUrl.trim().replace(/\/$/, '')
      : current.baseUrl,
    models: {
      text: partial.models?.text ?? current.models.text,
      vision: partial.models?.vision ?? current.models.vision,
    },
    autoDetect: partial.autoDetect ?? current.autoDetect,
    registryMirror: partial.registryMirror !== undefined
      ? partial.registryMirror.trim()
      : current.registryMirror,
  };

  _config = updated;

  // 持久化到文件
  try {
    const configPath = getConfigPath();
    await writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');
    logger.info(`[Ollama] Config saved: enabled=${updated.enabled}, baseUrl=${updated.baseUrl}`);
  } catch (err) {
    logger.error('[Ollama] Failed to persist config', err);
  }

  return { ...updated };
}

/**
 * 判断本地推理是否可用（enabled + 配置有效）
 * 注意：此函数不检测 Ollama 是否实际运行，仅检查配置开关
 */
export function isLocalInferenceEnabled(): boolean {
  const config = getOllamaConfig();
  return config.enabled;
}
