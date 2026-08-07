/**
 * 本地 ASR — 配置持久化模块（sherpa-onnx 版）
 *
 * 配置文件存放于 userData/local-asr-config.json，
 * 与 ollama-config.json、ai-gateway-config.json 同级。
 *
 * @ai-context: 本地 ASR 配置持久化：enabled/语言偏好/线程数。
 * 单一引擎：zipformer-transducer 中英双语流式模型（支持热词增强）。
 * 渲染进程经 IPC local_asr_get_config / local_asr_update_config 读写。
 * 用户首次启用时触发模型下载（modelManager），下载完成前 enabled 不生效。
 */

import { app } from 'electron';
import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../logger.js';

// ================================================================
// 类型定义
// ================================================================

/** 本地 ASR 用户配置 */
export interface LocalAsrConfig {
  /** 用户是否启用本地 ASR（需模型已下载才生效） */
  enabled: boolean;
  /** 推理语言（zh/en/auto） */
  language: string;
  /** CPU 推理线程数（0 = 自动检测核心数） */
  threads: number;
  /** 是否在本地 ASR 失败时降级到云端（默认 true） */
  fallbackToCloud: boolean;
}

// ================================================================
// 常量
// ================================================================

const CONFIG_FILE_NAME = 'local-asr-config.json';

/** 默认配置 */
const DEFAULT_CONFIG: LocalAsrConfig = {
  enabled: false,
  language: 'zh',
  threads: 0,
  fallbackToCloud: true,
};

/**
 * zipformer 模型包关键文件名（单一事实来源）
 *
 * 必须与上游模型包实际文件名完全一致：
 * GitHub Release 整包与 HF 仓库均为 -epoch-99-avg-1 命名，
 * 不是 paraformer 包的简化名（encoder.onnx/decoder.onnx）。
 * 曾因沿用简化名导致 isModelReady() 恒为 false、下载后校验失败。
 *
 * sherpa-onnx 的 zipformer2（transducer 类）模型需要 encoder/decoder/joiner
 * 三件套，缺 joiner 时识别器创建失败（joiner: '' does not exist）。
 */
export const MODEL_FILES = {
  encoder: 'encoder-epoch-99-avg-1.onnx',
  decoder: 'decoder-epoch-99-avg-1.onnx',
  joiner: 'joiner-epoch-99-avg-1.onnx',
  tokens: 'tokens.txt',
} as const;

/**
 * 模型定义（供设置页展示 + modelManager 下载）
 *
 * 统一模型：zipformer-transducer 流式中英双语（支持热词增强）
 * 同时承担实时流式转写与课后按段转写。
 *
 * 下载源优先级：
 *   1. GitHub Releases（tar.bz2 整包，全球可用）
 *   2. hf-mirror.com（HuggingFace 国内镜像，逐文件下载，无需解压）
 */
export const ASR_MODELS = {
  streaming: {
    id: 'streaming-zipformer',
    label: 'Zipformer 流式（实时字幕，中英双语，支持热词）',
    description: '边说边出，延迟 < 200ms，支持热词增强，适合课堂实时转录',
    size: '~650MB',
    dirName: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
    files: [
      MODEL_FILES.encoder,
      MODEL_FILES.decoder,
      MODEL_FILES.joiner,
      MODEL_FILES.tokens,
    ],
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2',
    /** hf-mirror.com 国内镜像（逐文件下载，无需解压） */
    mirrorBaseUrl: 'https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/main',
  },
} as const;

// ================================================================
// 运行时状态
// ================================================================

let _config: LocalAsrConfig | null = null;

// ================================================================
// 公共 API
// ================================================================

/** 获取配置文件完整路径 */
export function getAsrConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/** 获取模型存放根目录（userData/asr-models/） */
export function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'asr-models');
}

/** 获取模型目录完整路径 */
export function getModelDir(): string {
  const modelDef = ASR_MODELS.streaming;
  return path.join(getModelsDir(), modelDef.dirName);
}

/**
 * 获取当前本地 ASR 配置
 */
export function getLocalAsrConfig(): LocalAsrConfig {
  if (_config) return { ..._config };
  return { ...DEFAULT_CONFIG };
}

/**
 * 应用启动时从持久化文件加载配置
 */
export async function loadLocalAsrConfig(): Promise<void> {
  try {
    const configPath = getAsrConfigPath();
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    _config = {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_CONFIG.enabled,
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_CONFIG.language,
      threads: typeof parsed.threads === 'number' ? parsed.threads : DEFAULT_CONFIG.threads,
      fallbackToCloud: typeof parsed.fallbackToCloud === 'boolean' ? parsed.fallbackToCloud : DEFAULT_CONFIG.fallbackToCloud,
    };
    logger.info(`[LocalASR] Config loaded: enabled=${_config.enabled}, lang=${_config.language}`);
  } catch {
    _config = { ...DEFAULT_CONFIG };
    logger.info('[LocalASR] No persisted config found, using defaults');
  }
}

/**
 * 更新本地 ASR 配置并持久化
 */
export async function updateLocalAsrConfig(partial: Partial<LocalAsrConfig>): Promise<LocalAsrConfig> {
  const current = getLocalAsrConfig();
  const updated: LocalAsrConfig = {
    enabled: partial.enabled ?? current.enabled,
    language: partial.language ?? current.language,
    threads: partial.threads ?? current.threads,
    fallbackToCloud: partial.fallbackToCloud ?? current.fallbackToCloud,
  };

  try {
    const configPath = getAsrConfigPath();
    await writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');
    // 持久化成功后再更新内存，保证重启后状态一致
    _config = updated;
    logger.info(`[LocalASR] Config saved: enabled=${updated.enabled}`);
  } catch (err) {
    logger.error('[LocalASR] Failed to persist config', err);
    // 内存未更新，保持与持久化状态一致
  }

  return { ...updated };
}

/**
 * 判断本地 ASR 是否可用（enabled + 模型目录存在）
 */
export function isLocalAsrEnabled(): boolean {
  const config = getLocalAsrConfig();
  if (!config.enabled) return false;
  return isModelReady();
}

/**
 * 检查模型是否已下载就绪
 */
export function isModelReady(): boolean {
  const modelDir = getModelDir();
  const modelDef = ASR_MODELS.streaming;
  // 检查关键文件是否存在
  return modelDef.files.every(f => existsSync(path.join(modelDir, f)));
}
