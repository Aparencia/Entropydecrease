/**
 * 系统/模型健康领域类型（自 types.ts 硬拆归位 + L11 契约去重，与 Rust serde 契约对齐）。
 *
 * @ai-context: 模型下载/就绪状态与系统健康快照为多面板共享契约
 *              （ModelManagementPanel/ReadyCheckCard/SystemStatusBadge 等），
 *              此前在各组件内重复定义（审查 L11）——本文件为单一定义源。
 */

/** 流式 ASR 模型就绪状态 */
export interface StreamingModelStatus {
  ready: boolean;
  missing: string[];
}

/** 模型下载状态（camelCase 契约） */
export interface DownloadStatus {
  state: string; // idle | downloading | done | failed
  currentFile: string | null;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

/** 模型下载进度事件载荷（model_downloader::DownloadProgress 契约） */
export interface DownloadProgress {
  file: string;
  downloadedBytes: number;
  totalBytes: number;
}

/** 系统健康快照（Rust HealthSnapshot，snake_case 契约；health_status 载荷） */
export interface HealthSnapshot {
  disk_free_gb: number | null;
  disk_warn: boolean;
  missing_models: string[];
  asr_alive: boolean;
  ocr_alive: boolean;
}

// ────────────────────────────────────────────────────────────
// OCR 设备领域类型（v0.4.0 M1，ADR-009，与 Rust serde 契约对齐）
// ────────────────────────────────────────────────────────────

/** OCR 设备模式（Rust OcrDeviceMode） */
export type OcrDeviceMode = "Auto" | "ForceGpu" | "ForceCpu";

/** OCR 推理后端（Rust OcrBackend：Cpu | Cuda{device_id}） */
export type OcrBackend = "Cpu" | { Cuda: { device_id: number } };

/** 校准基准（Rust BenchResult） */
export interface BenchResult {
  cpu_ms: number;
  gpu_ms: number;
}

/** OCR 设备运行时状态（Rust OcrDeviceStatus，snake_case 契约） */
export interface OcrDeviceStatus {
  mode: OcrDeviceMode;
  requested: OcrBackend;
  actual: OcrBackend;
  fallback_reason: string | null;
  /** v0.12.1：引擎加载成功标志（false=加载中/失败；就绪判定以此为准，非线程心跳） */
  engine_ready: boolean;
  bench: BenchResult | null;
  calibrating: boolean;
}
