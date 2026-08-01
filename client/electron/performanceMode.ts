/**
 * performanceMode（主进程）— 性能模式状态、持久化与采集频率缩放
 *
 * 渲染进程经 performance:set-mode 设置模式并持久化到 userData，
 * 启动时加载，供屏幕采集间隔缩放等进程级策略使用。
 *
 * @ai-context: 主进程模块。backgroundThrottling 等需重建窗口的策略
 * 因与番茄钟后台计时精度冲突，暂不启用（保持 backgroundThrottling:false），
 * 待与番茄钟状态协同后再引入。
 */
import { app } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { safeHandle } from './ipcUtils.js';
import { logger } from './logger.js';

export type PerformanceMode = 'low' | 'medium' | 'high';

const DEFAULT_MODE: PerformanceMode = 'medium';

/** 各模式采集频率倍率（作用于截屏间隔：interval / scale，scale<1 即降频） */
const CAPTURE_RATE_SCALE: Record<PerformanceMode, number> = {
  low: 0.5,
  medium: 1,
  high: 1,
};

let currentMode: PerformanceMode = DEFAULT_MODE;

function configPath(): string {
  return join(app.getPath('userData'), 'performance-mode.json');
}

function isMode(v: unknown): v is PerformanceMode {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** 启动时加载持久化模式（文件缺失/损坏时用默认值） */
export function loadPerformanceMode(): void {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf-8'));
    if (isMode(parsed?.mode)) currentMode = parsed.mode;
  } catch { /* 首次运行或文件损坏：使用默认 medium */ }
  logger.info(`[PerformanceMode] 当前模式: ${currentMode}`);
}

/** 设置模式并持久化（由 IPC 调用） */
export function setPerformanceMode(mode: unknown): void {
  if (!isMode(mode)) return;
  currentMode = mode;
  try {
    writeFileSync(configPath(), JSON.stringify({ mode }), 'utf-8');
  } catch (err) {
    logger.error('[PerformanceMode] 持久化失败:', err);
  }
  logger.info(`[PerformanceMode] 模式已设置: ${mode}`);
}

/** 当前模式 */
export function getPerformanceMode(): PerformanceMode {
  return currentMode;
}

/** 采集频率倍率（用于缩放截屏间隔） */
export function getCaptureRateScale(): number {
  return CAPTURE_RATE_SCALE[currentMode];
}

/** 注册性能模式 IPC handler */
export function registerPerformanceHandlers(): void {
  safeHandle('performance:set-mode', async (_event, mode: unknown) => {
    setPerformanceMode(mode);
    return { success: true, mode: getPerformanceMode() };
  });
}
