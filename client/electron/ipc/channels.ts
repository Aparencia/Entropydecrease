/**
 * IPC Channel 名称集中管理
 *
 * 所有 Electron IPC channel 常量集中定义于此文件，
 * 便于全局搜索、重构及 preload 白名单维护。
 *
 * @ai-context: IPC channel 名称常量表——渲染/主进程通道契约，改名需两侧同步。
 */
export const IPC_CHANNELS = {
  // AI 相关
  AI_SUMMARIZE: 'ai_summarize',
  AI_GENERATE_CARDS: 'ai_generate_cards',
  AI_EVALUATE: 'ai_evaluate',
  AI_RECOMMEND_DURATION: 'ai_recommend_duration',
  AI_FEYNMAN_QUESTION: 'ai_feynman_question',
  AI_FEYNMAN_EVALUATE_ANSWERS: 'ai_feynman_evaluate_answers',
  AI_OPTIMIZE_CARD: 'ai_optimize_card',
  AI_TAG_CONTENT: 'ai_tag_content',
  AI_SORT_INSPIRATION: 'ai_sort_inspiration',
  AI_ANCHOR_POINT: 'ai_anchor_point',
  AI_SOCRATIC: 'ai_socratic',
  AI_SOCRATIC_EVALUATE: 'ai_socratic_evaluate',
  AI_SOCRATIC_DEEPENING: 'ai_socratic_deepening',
  AI_PREDICT: 'ai_predict',
  AI_RESCUE: 'ai_rescue',
  AI_SET_GATEWAY_URL: 'ai:set-gateway-url',
  AI_CHAT_SEND: 'ai:chat:send',
  AI_CHAT_HISTORY: 'ai:chat:history',
  AI_CHAT_SESSIONS: 'ai:chat:sessions',
  AI_CHAT_NEW_SESSION: 'ai:chat:new-session',

  // 采集相关
  SCREEN_LIST_WINDOWS: 'screen_list_windows',
  SCREEN_WATCH_WINDOWS_START: 'screen_watch_windows_start',
  SCREEN_WATCH_WINDOWS_STOP: 'screen_watch_windows_stop',
  SCREEN_WINDOWS_CHANGED: 'screen_windows_changed',
  SCREEN_CAPTURE_START: 'screen_capture_start',
  SCREEN_CAPTURE_STOP: 'screen_capture_stop',
  SCREEN_CAPTURE_FRAME: 'screen_capture_frame',
  AUDIO_LIST_SOURCES: 'audio_list_sources',
  AUDIO_CAPTURE_START: 'audio_capture_start',
  AUDIO_CAPTURE_STOP: 'audio_capture_stop',
  AUDIO_CAPTURE_CHUNK: 'audio_capture_chunk',
  AUDIO_CAPTURE_DO_START: 'audio_capture_do_start',
  AUDIO_CAPTURE_DO_STOP: 'audio_capture_do_stop',

  // Path C 视频录制
  VIDEO_RECORD_START: 'video_record_start',
  VIDEO_RECORD_STOP: 'video_record_stop',
  VIDEO_RECORD_PAUSE: 'video_record_pause',
  VIDEO_RECORD_RESUME: 'video_record_resume',
  VIDEO_RECORD_STATUS: 'video_record_status',
  VIDEO_RECORD_CHUNK: 'video_record_chunk',
  VIDEO_RECORD_STARTED: 'video_record_started',
  VIDEO_RECORD_STOPPED: 'video_record_stopped',
  VIDEO_RECORD_ERROR: 'video_record_error',
  VIDEO_RECORD_DO_START: 'video_record_do_start',
  VIDEO_RECORD_DO_STOP: 'video_record_do_stop',

  // 文件系统
  FS_READ_FILE: 'fs:read-file',

  // 课堂关键帧图片持久化
  KEYFRAME_SAVE: 'keyframe_save',
  KEYFRAME_CLEANUP: 'keyframe_cleanup',

  // 存储路径
  STORAGE_CHANGE_PATH: 'storage:change-path',
  STORAGE_GET_ACTIVE_PATH: 'storage:get-active-path',

  // 数据库操作
  DB_QUERY: 'db:query',
  DB_INSERT: 'db:insert',
  DB_UPDATE: 'db:update',
  DB_DELETE: 'db:delete',
  DB_SEARCH: 'db:search',
  DB_BATCH: 'db:batch',

  // 数据迁移
  MIGRATION_CHECK: 'migration:check',
  MIGRATION_IMPORT_TABLE: 'migration:import-table',
  MIGRATION_COMPLETE: 'migration:complete',

  // 备份
  BACKUP_SAVE: 'backup:save',
  BACKUP_OPEN: 'backup:open',

  // 自动更新
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_SET_AUTO_CHECK: 'update:set-auto-check',
  UPDATE_STATUS: 'update-status',

  // 窗口控制
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_CLOSE_ACTION: 'window:close-action',
  WINDOW_CLOSING: 'window:closing',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',

  // 系统
  APP_GET_VERSION: 'get-app-version',
  GET_DEFAULT_STORAGE_PATH: 'get-default-storage-path',
  DIALOG_SELECT_DIRECTORY: 'dialog:selectDirectory',

  // 同步
  SYNC_BEFORE_QUIT: 'sync:before-quit',
  SYNC_QUIT_COMPLETE: 'sync:quit-complete',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
