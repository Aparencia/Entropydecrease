/**
 * Vite 环境变量类型声明
 *
 * 为 import.meta.env 提供精确的类型提示，
 * 仅声明项目实际使用的 VITE_ 前缀变量。
 *
 * @ai-context: Vite 环境变量与 Electron IPC 返回类型的唯一权威声明——所有 IPC 接口返回类型必须在此声明，禁止调用点 as unknown/any 断言（项目硬性规范）。
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基础地址（sync-service / ai-gateway 共享前缀） */
  readonly VITE_API_BASE_URL: string;
  /** AI 网关地址 */
  readonly VITE_AI_GATEWAY_URL: string;
  /** 健康检查端点完整 URL（可选，默认从 VITE_API_BASE_URL 派生） */
  readonly VITE_API_HEALTH_URL: string;
  /** Supabase 项目 URL */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase 匿名公钥 */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Ollama 本地推理服务地址（可选，默认 http://localhost:11434） */
  readonly VITE_OLLAMA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ================================================================
// Electron API 类型声明（window.electronAPI）
// ================================================================

import type { OllamaStatus, OllamaConfig, OllamaPullProgress } from './types/ollama';

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      send: (channel: string, ...args: unknown[]) => void;
      getPathForFile: (file: File) => string;
      onWindowClosing: (callback: () => void) => () => void;
      closeAction: (action: 'quit' | 'minimize' | 'cancel', remember: boolean) => Promise<unknown>;
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
      onSyncBeforeQuit: (callback: () => void) => () => void;
      notifySyncComplete: () => void;
      /** 监听全局快捷键触发（payload: { id, text? }，shortcutManager 驱动） */
      onShortcutTriggered: (callback: (payload: { id: string; text?: string }) => void) => () => void;
      setAutoUpdate: (enabled: boolean) => Promise<unknown>;
      /** FRONT2-M5: safeStorage 系统级加密（密钥材料落盘保护） */
      safeStorageEncrypt: (plain: string) => Promise<string>;
      safeStorageDecrypt: (encoded: string) => Promise<string>;
      backupSave: (data: string, defaultName?: string) => Promise<unknown>;
      backupOpen: () => Promise<unknown>;
      db: {
        query: <T = unknown>(table: string, method: string, args?: unknown[]) => Promise<T>;
        insert: (table: string, item: unknown) => Promise<string>;
        update: (table: string, id: string, changes: unknown) => Promise<unknown>;
        delete: (table: string, id: string) => Promise<unknown>;
        search: (table: string, query: string) => Promise<unknown>;
        batch: (operations: unknown[]) => Promise<unknown>;
      };
      migration: {
        check: () => Promise<{ needed: boolean; tableMapping: Array<{ dexie: string; sqlite: string }> }>;
        importTable: (table: string, rows: unknown[]) => Promise<{ success: boolean; rowsImported?: number; error?: string }>;
        complete: () => Promise<{ success: boolean; integrity?: string; error?: string }>;
      };
      storage: {
        changePath: (newPath: string) => Promise<{ success: boolean; previousPath?: string; newPath?: string; error?: string }>;
        getActivePath: () => Promise<unknown>;
      };
      /** E2: 费曼录音持久化（{userData}/recordings） */
      recording: {
        save: (stem: string, base64: string) => Promise<{ success: boolean; fileName?: string }>;
        load: (stem: string) => Promise<{ success: boolean; base64?: string; notFound?: boolean; error?: string }>;
        delete: (stem: string) => Promise<{ success: boolean }>;
      };
      /** Ollama 本地推理 API */
      ollama: {
        getStatus: (forceRefresh?: boolean) => Promise<{ status: OllamaStatus; config: OllamaConfig }>;
        setConfig: (config: Partial<OllamaConfig>) => Promise<OllamaConfig>;
        pullModel: (modelName: string) => Promise<{ success: boolean }>;
        deleteModel: (modelName: string) => Promise<{ success: boolean }>;
        onPullProgress: (callback: (progress: OllamaPullProgress) => void) => () => void;
      };
      // ── A2 语音输入（新增） ──
      audio_capture_status: () => Promise<{ active: boolean }>;
      local_asr_stream_available: () => Promise<{ available: boolean }>;
      audio_capture_start: (options: { microphone: boolean; chunkDurationMs?: number; sampleRate?: number; channels?: number }) => Promise<{ success: boolean; error?: string }>;
      local_asr_stream_start: (options: { sampleRate?: number }) => Promise<{ success: boolean; error?: string }>;
      local_asr_stream_stop: () => Promise<{ success: boolean }>;
      audio_capture_stop: () => Promise<{ success: boolean }>;
      // ── A3 微进展叙述（新增） ──
      ai_progress_narrate: (args: { statsText: string; authToken?: string }) => Promise<{
        narrative: string;
        status: string;
        model: string;
        tokensUsed: number;
        latencyMs: number;
        requestId?: string;
        source?: string;
      }>;
    };
  }
}
