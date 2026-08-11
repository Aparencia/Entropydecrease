/**
 * Electron 预加载脚本
 *
 * 在渲染进程与主进程之间建立安全的通信桥梁，
 * 通过 contextBridge 暴露白名单内的 IPC channel。
 *
 * @ai-context: IPC 桥接安全边界（contextBridge 白名单暴露）——渲染进程唯一的主进程访问面，新增通道必须显式登记，任何修改需安全审查。
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

/** 允许渲染进程调用的 IPC channel 白名单 */
const ALLOWED_CHANNELS = [
  'ai_summarize',
  'ai_generate_cards',
  'ai_evaluate',
  'ai_recommend_duration',
  'ai_feynman_question',
  'ai_feynman_evaluate_answers',
  'ai_optimize_card',
  'ai_tag_content',
  'ai_sort_inspiration',
  'ai_anchor_point',
  'ai_socratic',
  'ai_socratic_evaluate',
  'ai_socratic_deepening',
  'ai_predict',
  'ai_rescue',
  'ai_error_pattern',
  'ai_generate_quiz',
  'ai_content_tier',
  'ai_conflict_detect',
  'ai_concept_precheck',
  'ai_vision_extract',
  'ai_session_analyze',
  'ai_video_analyze',
  'ai_merge_notes',
  // A3 微进展叙述（每周一次的统计叙述生成）
  'ai_progress_narrate',
  // 阶段 A：知识入籍概念化（切块文本 → 概念候选）
  'ai_import_concept',
  // P1：今日学习计划（个性化学习路径）
  'ai_learning_plan',
  // D2：课堂内容问答（带引用来源）
  'ai_session_qa',
  'ai:set-gateway-url',
  // AI 学伴对话 IPC channel
  'ai:chat:send',
  'ai:chat:history',
  'ai:chat:sessions',
  'ai:chat:new-session',
  'ai:tts:speak',
  'screen_list_windows',
  'screen_watch_windows_start',
  'screen_watch_windows_stop',
  'screen_capture_start',
  'screen_capture_stop',
  'audio_list_sources',
  'audio_capture_start',
  'audio_capture_stop',
  // A2 语音对话：启动前查询是否已有活跃采集（互斥保护，避免误伤课堂采集）
  'audio_capture_status',
  'get-app-version',
  // 设备指纹（激活码一码多设备绑定；仅主进程生成，渲染进程只读）
  'machine-id:get',
  // 剪贴板写入（渲染进程 navigator.clipboard 在 Electron 受限上下文下不可靠）
  'clipboard:write-text',
  'dialog:selectDirectory',
  'get-default-storage-path',
  'update:check',
  'update:download',
  'update:install',
  'update:set-auto-check',
  'window:close-action',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  // v0.9.0: 备份相关 IPC channel
  'backup:save',
  'backup:open',
  // v1.0.0: 数据访问 IPC channel
  'db:query',
  'db:insert',
  'db:update',
  'db:delete',
  'db:search',
  'db:batch',
  // v1.0.0: 数据迁移 IPC channel
  'migration:check',
  'migration:import-table',
  'migration:complete',
  // v1.1.0: 存储路径切换 IPC channel
  'storage:change-path',
  'storage:get-active-path',
  // 退出前同步完成通知
  'sync:quit-complete',
  // 文件读取（课堂助手视频分析）
  'fs:read-file',
  // 系统音量
  'system:get-volume',
  // Path C 视频录制 IPC channel
  'video_record_start',
  'video_record_stop',
  'video_record_pause',
  'video_record_resume',
  'video_record_status',
  // Ollama 本地推理 IPC channel
  'ollama:get-status',
  'ollama:set-config',
  'ollama:pull-model',
  'ollama:delete-model',
  // AI 流式输出 IPC channel
  'ai:stream:start',
  'ai:stream:cancel',
  // 课堂关键帧图片持久化 IPC channel
  'keyframe_save',
  'keyframe_cleanup',
  // 性能模式 IPC channel（三档：静谧/从容/澎湃）
  'performance:set-mode',
  // P3-18 性能诊断 IPC channel
  'perf:get-metrics',
  // 本地 ASR（sherpa-onnx）IPC channel
  'local_asr_transcribe',
  'local_asr_get_config',
  'local_asr_update_config',
  'local_asr_check_available',
  'local_asr_get_models',
  'local_asr_download_model',
  'local_asr_delete_model',
  // 本地 ASR 真流式（Paraformer 在线）IPC channel
  'local_asr_stream_available',
  'local_asr_stream_start',
  'local_asr_stream_stop',
  // MCP 学习记忆服务器应用内授权开关
  'memory_server:get_consent',
  'memory_server:set_consent',
  // 阶段 C：访问审计（最近 50 条）+ 宿主配置（三步引导第一步）
  'memory_server:get_access_log',
    'memory_server:get_host_config',
  // 知识入籍 IPC channel（阶段 A：PDF 解析/URL 抓取/入籍记录）
  'import:parse-pdf',
  'import:fetch-url',
  'import:get-settling-records',
  'import:add-settling-record',
  // 世界主权 IPC channel（阶段 D：世界之书导出/恢复）
  'sovereignty:export-world',
  'sovereignty:import-world',
  // 知识星座 IPC channel（阶段 B：只读图谱聚合）
  'knowledge:get-graph',
  // E2 费曼录音持久化 IPC channel（{userData}/recordings 读写）
  'recording:save',
  'recording:load',
  'recording:delete',
  // 3.18 电子墨水学习板次窗口
  'eink:show-card',
  'eink:hide',
] as const;

/** 允许渲染进程监听的事件 channel 白名单（主进程 → 渲染进程推送） */
const ALLOWED_EVENT_CHANNELS = [
  'screen_capture_frame',
  'screen_windows_changed',
  'audio_capture_chunk',
  'audio_capture_do_start',
  'audio_capture_do_stop',
  'update-status',
  'window:closing',
  'window:maximized-changed',
  'sync:before-quit',
  // Path C 视频录制状态推送
  'video_record_status',
  'video_record_error',
  'video_record_do_start',
  'video_record_do_stop',
  // Ollama 模型拉取进度推送
  'ollama:pull-progress',
  // AI 流式输出推送
  'ai:stream:chunk',
  'ai:stream:end',
  'ai:stream:error',
  // 本地 ASR 模型下载进度推送
  'local_asr_download_progress',
  // 本地 ASR 真流式转写结果推送（partial 实时 / final 断句）
  'asr_stream_partial',
  'asr_stream_final',
  // 全局快捷键触发推送（payload: { id, text? }，shortcutManager 驱动）
  'shortcut:triggered',
  // 3.18 电子墨水学习板：主进程推送复习卡片到次窗口
  'eink:card',
] as const;

/** 允许渲染进程单向发送的 channel 白名单（渲染进程 → 主进程，fire-and-forget） */
const ALLOWED_SEND_CHANNELS = [
  'audio_capture_chunk',
  // Path C 视频录制数据块回传
  'video_record_chunk',
  'video_record_started',
  'video_record_stopped',
  'video_record_error',
] as const;

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];
type AllowedEventChannel = (typeof ALLOWED_EVENT_CHANNELS)[number];
type AllowedSendChannel = (typeof ALLOWED_SEND_CHANNELS)[number];

/**
 * 暴露 electronAPI 对象到渲染进程的 window 全局变量，
 * 仅允许白名单内的 channel 通过，防止任意 IPC 调用。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: AllowedChannel, ...args: unknown[]) => {
    if ((ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`[preload] 不允许的 IPC channel: ${channel}`));
  },
  on: (channel: AllowedEventChannel, callback: (...args: unknown[]) => void) => {
    if ((ALLOWED_EVENT_CHANNELS as readonly string[]).includes(channel)) {
      // 保留包装后的 handler 引用，卸载时只移除自己的监听器。
      // 注意：不能使用 removeAllListeners(channel)——多个组件会订阅同一
      // channel（如 audio_capture_chunk），removeAllListeners 会把其他
      // 组件的监听器一并清除，导致音频流静默中断。
      const handler = (_event: unknown, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    }
    console.warn(`[preload] 不允许的事件 channel: ${channel}`);
    return () => {};
  },
  send: (channel: AllowedSendChannel, ...args: unknown[]) => {
    if ((ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`[preload] 不允许的发送 channel: ${channel}`);
    }
  },
  /** 监听主进程发出的窗口关闭事件（CL-L6: 统一纳入 ALLOWED_EVENT_CHANNELS 校验） */
  onWindowClosing: (callback: () => void) => {
    if (!(ALLOWED_EVENT_CHANNELS as readonly string[]).includes('window:closing')) {
      console.warn('[preload] 不允许的事件 channel: window:closing');
      return () => {};
    }
    const handler = () => callback();
    ipcRenderer.on('window:closing', handler);
    return () => ipcRenderer.removeListener('window:closing', handler);
  },
  /** 向主进程发送关闭行为选择 */
  closeAction: (action: 'quit' | 'minimize' | 'cancel', remember: boolean) => {
    return ipcRenderer.invoke('window:close-action', action, remember);
  },
  // ---- 窗口控制 API ----
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
    if (!(ALLOWED_EVENT_CHANNELS as readonly string[]).includes('window:maximized-changed')) {
      console.warn('[preload] 不允许的事件 channel: window:maximized-changed');
      return () => {};
    }
    const handler = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },
  /** 监听退出前同步事件（CL-L6: 统一纳入 ALLOWED_EVENT_CHANNELS 校验） */
  onSyncBeforeQuit: (callback: () => void) => {
    if (!(ALLOWED_EVENT_CHANNELS as readonly string[]).includes('sync:before-quit')) {
      console.warn('[preload] 不允许的事件 channel: sync:before-quit');
      return () => {};
    }
    const handler = () => callback();
    ipcRenderer.on('sync:before-quit', handler);
    return () => ipcRenderer.removeListener('sync:before-quit', handler);
  },
  /** 监听全局快捷键触发（payload: { id, text? }，shortcutManager 驱动） */
  onShortcutTriggered: (callback: (payload: { id: string; text?: string }) => void) => {
    if (!(ALLOWED_EVENT_CHANNELS as readonly string[]).includes('shortcut:triggered')) {
      console.warn('[preload] 不允许的事件 channel: shortcut:triggered');
      return () => {};
    }
    const handler = (_event: unknown, payload: { id: string; text?: string }) => callback(payload);
    ipcRenderer.on('shortcut:triggered', handler);
    return () => ipcRenderer.removeListener('shortcut:triggered', handler);
  },
  /** 通知主进程同步已完成 */
  notifySyncComplete: () => {
    ipcRenderer.invoke('sync:quit-complete');
  },
  // ---- 自动更新 API ----
  /** 设置是否自动检查更新 */
  setAutoUpdate: (enabled: boolean) => ipcRenderer.invoke('update:set-auto-check', enabled),
  // FRONT2-M5: safeStorage 系统级加密（密钥材料落盘保护，CryptoManager 消费）
  safeStorageEncrypt: (plain: string) => ipcRenderer.invoke('crypto:safe-storage-encrypt', plain),
  safeStorageDecrypt: (encoded: string) => ipcRenderer.invoke('crypto:safe-storage-decrypt', encoded),
  // ---- 阶段 A：知识入籍拖拽 API（Electron 35 移除 File.path，必须经 webUtils 转换） ----
  /** 拖拽文件 → 绝对路径（供 import:parse-pdf 使用） */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // ---- 设备指纹 API（激活码绑定用） ----
  /** 获取设备指纹（主进程生成，首次调用后恒定） */
  getMachineId: () => ipcRenderer.invoke('machine-id:get'),
  // ---- v0.9.0: 备份 API ----
  /** 保存备份文件（显示系统保存对话框） */
  backupSave: (data: string, defaultName?: string) => ipcRenderer.invoke('backup:save', data, defaultName),
  /** 打开备份文件（显示系统打开对话框，返回文件内容） */
  backupOpen: () => ipcRenderer.invoke('backup:open'),
  // ---- v1.0.0: 数据访问 API ----
  db: {
    query: (table: string, method: string, args?: unknown[]) =>
      ipcRenderer.invoke('db:query', { table, method, args }),
    insert: (table: string, item: unknown) =>
      ipcRenderer.invoke('db:insert', { table, item }),
    update: (table: string, id: string, changes: unknown) =>
      ipcRenderer.invoke('db:update', { table, id, changes }),
    delete: (table: string, id: string) =>
      ipcRenderer.invoke('db:delete', { table, id }),
    search: (table: string, query: string) =>
      ipcRenderer.invoke('db:search', { table, query }),
    batch: (operations: unknown[]) =>
      ipcRenderer.invoke('db:batch', { operations }),
  },
  // ---- v1.0.0: 数据迁移 API ----
  migration: {
    check: () => ipcRenderer.invoke('migration:check'),
    importTable: (table: string, rows: unknown[]) =>
      ipcRenderer.invoke('migration:import-table', { table, rows }),
    complete: () => ipcRenderer.invoke('migration:complete'),
  },
  // ---- v1.1.0: 存储路径管理 API ----
  storage: {
    changePath: (newPath: string) =>
      ipcRenderer.invoke('storage:change-path', { newPath }),
    getActivePath: () =>
      ipcRenderer.invoke('storage:get-active-path'),
  },
  // ---- E2: 费曼录音持久化 API ----
  recording: {
    save: (stem: string, base64: string) =>
      ipcRenderer.invoke('recording:save', { stem, base64 }),
    load: (stem: string) =>
      ipcRenderer.invoke('recording:load', { stem }),
    delete: (stem: string) =>
      ipcRenderer.invoke('recording:delete', { stem }),
  },
  // ---- Ollama 本地推理 API ----
  ollama: {
    getStatus: (forceRefresh?: boolean) =>
      ipcRenderer.invoke('ollama:get-status', forceRefresh),
    setConfig: (config: Record<string, unknown>) =>
      ipcRenderer.invoke('ollama:set-config', config),
    pullModel: (modelName: string) =>
      ipcRenderer.invoke('ollama:pull-model', modelName),
    deleteModel: (modelName: string) =>
      ipcRenderer.invoke('ollama:delete-model', modelName),
    onPullProgress: (callback: (...args: unknown[]) => void) => {
      const handler = (_event: unknown, ...args: unknown[]) => callback(...args);
      ipcRenderer.on('ollama:pull-progress', handler);
      return () => ipcRenderer.removeListener('ollama:pull-progress', handler);
    },
  },
});
