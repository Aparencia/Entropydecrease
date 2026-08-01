/**
 * 本地 ASR — 配置持久化模块（sherpa-onnx 版）
 *
 * 配置文件存放于 userData/local-asr-config.json，
 * 与 ollama-config.json、ai-gateway-config.json 同级。
 *
 * @ai-context: 本地 ASR 配置持久化：enabled/引擎模式/模型目录/语言偏好/线程数。
 * 渲染进程经 IPC local_asr_get_config / local_asr_update_config 读写。
 * 用户首次启用时触发模型下载（modelManager），下载完成前 enabled 不生效。
 * @ai-context: 双引擎架构——streaming（Paraformer，实时字幕）和
 * offline（SenseVoice，课后精修），用户可选默认引擎。
 */

import { app } from 'electron';
import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../logger.js';

// ================================================================
// 类型定义
// ================================================================

/** ASR 引擎模式 */
export type AsrEngine = 'streaming' | 'offline';

/** 本地 ASR 用户配置 */
export interface LocalAsrConfig {
  /** 用户是否启用本地 ASR（需模型已下载才生效） */
  enabled: boolean;
  /** 默认引擎：streaming（Paraformer 实时）/ offline（SenseVoice 精修） */
  engine: AsrEngine;
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
  engine: 'offline',
  language: 'zh',
  threads: 0,
  fallbackToCloud: true,
};

/**
 * 模型定义（供设置页展示 + modelManager 下载）
 *
 * streaming: Paraformer 流式中英双语（实时字幕，延迟 < 200ms）
 * offline:   SenseVoice 非流式多语言（课后精修，50ms/段，准确率最高）
 */
export const ASR_MODELS = {
  streaming: {
    id: 'streaming-paraformer',
    label: 'Paraformer 流式（实时字幕，中英双语）',
    description: '边说边出，延迟 < 200ms，适合课堂实时转录',
    size: '~220MB',
    dirName: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    files: [
      'encoder.onnx',
      'decoder.onnx',
      'joiner.onnx',
      'tokens.txt',
    ],
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
    mirrorUrl: 'https://modelscope.cn/models/zhaochaoqun/sherpa-onnx-asr-models/resolve/main/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
  },
  offline: {
    id: 'offline-sensevoice',
    label: 'SenseVoice 离线精修（中/英/粤/日/韩）',
    description: '50ms/段极速推理，中文准确率最高，适合课后全量分析',
    size: '~230MB',
    dirName: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17',
    files: [
      'model.int8.onnx',
      'tokens.txt',
    ],
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2',
    mirrorUrl: 'https://modelscope.cn/models/zhaochaoqun/sherpa-onnx-asr-models/resolve/main/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2',
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

/** 获取指定引擎的模型目录完整路径 */
export function getModelDir(engine?: AsrEngine): string {
  const eng = engine ?? getLocalAsrConfig().engine;
  const modelDef = ASR_MODELS[eng];
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
      engine: parsed.engine === 'streaming' ? 'streaming' : 'offline',
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_CONFIG.language,
      threads: typeof parsed.threads === 'number' ? parsed.threads : DEFAULT_CONFIG.threads,
      fallbackToCloud: typeof parsed.fallbackToCloud === 'boolean' ? parsed.fallbackToCloud : DEFAULT_CONFIG.fallbackToCloud,
    };
    logger.info(`[LocalASR] Config loaded: enabled=${_config.enabled}, engine=${_config.engine}, lang=${_config.language}`);
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
    engine: partial.engine ?? current.engine,
    language: partial.language ?? current.language,
    threads: partial.threads ?? current.threads,
    fallbackToCloud: partial.fallbackToCloud ?? current.fallbackToCloud,
  };

  _config = updated;

  try {
    const configPath = getAsrConfigPath();
    await writeFile(configPath, JSON.stringify(updated, null, 2), 'utf-8');
    logger.info(`[LocalASR] Config saved: enabled=${updated.enabled}, engine=${updated.engine}`);
  } catch (err) {
    logger.error('[LocalASR] Failed to persist config', err);
  }

  return { ...updated };
}

/**
 * 判断本地 ASR 是否可用（enabled + 对应引擎模型目录存在）
 */
export function isLocalAsrEnabled(): boolean {
  const config = getLocalAsrConfig();
  if (!config.enabled) return false;
  return isModelReady(config.engine);
}

/**
 * 检查指定引擎的模型是否已下载就绪
 */
export function isModelReady(engine: AsrEngine): boolean {
  const modelDir = getModelDir(engine);
  const modelDef = ASR_MODELS[engine];
  // 检查关键文件是否存在
  return modelDef.files.every(f => existsSync(path.join(modelDir, f)));
}
