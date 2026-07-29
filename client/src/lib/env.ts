/**
 * @ai-context: 统一环境检测工具层。提供环境判断函数，用于降级策略的环境感知决策。
 * @ai-context: 此模块为纯函数，无副作用，可安全在任何上下文中引用。
 */

/** 是否为生产环境 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/** 是否为开发环境 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/** 是否为测试环境 */
export function isTest(): boolean {
  return import.meta.env.MODE === 'test';
}

/** 获取当前环境名称 */
export function getEnvName(): 'production' | 'development' | 'test' {
  if (isTest()) return 'test';
  if (isProduction()) return 'production';
  return 'development';
}

/**
 * 环境感知的降级日志。
 * 开发/测试环境输出警告以便发现问题，生产环境静默。
 */
export function degradedLog(context: string, error?: unknown): void {
  if (!isProduction()) {
    console.warn(`[DEGRADED] ${context}`, error ?? '');
  }
}
