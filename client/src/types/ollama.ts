/**
 * Ollama 本地推理 — 渲染进程侧类型定义
 *
 * 供设置页 UI、useOllamaStatus Hook 及 IPC 桥接层使用。
 *
 * @ai-context: OllamaConfig 与 Electron 主进程 ai/ollama/config.ts 的
 * 配置结构必须严格同步（主进程是持久化权威源，渲染进程仅展示/编辑）。
 * 修改字段时两侧同时更新，否则 IPC 传输后字段静默丢失。
 * @ai-context: OLLAMA_RECOMMENDED_MODELS 是本文件唯一的运行时导出
 * （常量数组），其余均为纯类型。推荐模型需与主进程下载逻辑支持的
 * 模型列表保持一致。
 */

// ================================================================
// Ollama 服务状态
// ================================================================

/** Ollama 安装与运行状态 */
export interface OllamaStatus {
  /** Ollama 可执行文件是否存在 */
  installed: boolean;
  /** Ollama 服务是否正在运行 */
  running: boolean;
  /** 已拉取的模型名称列表 */
  models: string[];
  /** Ollama 版本号（运行时获取） */
  version?: string;
  /** 上次检测时间戳（ms） */
  lastChecked: number;
}

// ================================================================
// Ollama 配置
// ================================================================

/** 模型映射配置 */
export interface OllamaModelMapping {
  /** 通用文本模型（summarize、evaluate、flashcard 等） */
  text: string;
  /** 多模态视觉模型（vision_extract、multimodal_analyze） */
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
// 模型拉取进度
// ================================================================

/** 模型拉取进度事件 */
export interface OllamaPullProgress {
  /** 模型名称 */
  model: string;
  /** 当前状态：downloading / verifying / complete / error */
  status: 'downloading' | 'verifying' | 'complete' | 'error';
  /** 下载进度百分比（0-100），仅 downloading 状态有效 */
  percent: number;
  /** 已下载字节数 */
  completedBytes?: number;
  /** 总字节数 */
  totalBytes?: number;
  /** 错误信息（仅 error 状态） */
  error?: string;
}

// ================================================================
// 推荐模型
// ================================================================

/** 推荐模型信息 */
export interface OllamaRecommendedModel {
  /** 模型全名（用于 ollama pull） */
  name: string;
  /** 显示名称 */
  label: string;
  /** 用途类型 */
  type: 'text' | 'vision';
  /** 大致体积描述 */
  size: string;
  /** 最低显存/内存需求描述 */
  requirement: string;
}

/** 默认推荐模型列表 */
export const OLLAMA_RECOMMENDED_MODELS: OllamaRecommendedModel[] = [
  {
    name: 'qwen2.5:7b',
    label: 'Qwen2.5 7B（通用文本）',
    type: 'text',
    size: '~4.7 GB',
    requirement: '8GB 内存 / 6GB 显存',
  },
  {
    name: 'qwen2.5vl:7b',
    label: 'Qwen2.5-VL 7B（多模态视觉）',
    type: 'vision',
    size: '~5.0 GB',
    requirement: '8GB 内存 / 8GB 显存',
  },
];
