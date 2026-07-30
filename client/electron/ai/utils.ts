/**
 * AI 网关公共工具 — 统一出口 barrel
 *
 * @ai-context: 2026-07 拆分——地址管理在 gatewayConfig、HTTP 请求在
 * gatewayHttp、SSE 流式在 gatewayStream；本文件保留 AIFeatureDef 接口
 * 定义并 re-export 全部符号，全部 handler 的旧导入路径零改动。
 */

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
// 向后兼容 re-export
// ================================================================

export {
  isDevMode, gatewayUrl, setRuntimeGatewayUrl, loadPersistedGatewayUrl,
} from './gatewayConfig.js';
export {
  postJson, postMultipart, callWithLocalFallback,
} from './gatewayHttp.js';
export {
  postJsonStream,
} from './gatewayStream.js';
