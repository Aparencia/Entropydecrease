/**
 * Electron IPC 全局类型声明（渲染进程侧）
 *
 * @ai-context: 所有 IPC 返回类型均经 Electron 主进程 handler 源码
 * 逐字段核对（migration.check / importTable / complete、storage.changePath
 * 等）。修改任一签名前必须先核对主进程实现，禁止在调用方用局部断言
 * 绕过类型（根治优于局部断言）。
 * @ai-context: invoke/on/send 为通配逃生通道，新增 IPC 能力应优先
 * 定义精确的具名方法而非走通配 invoke。
 */

export {};

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      send: (channel: string, ...args: unknown[]) => void;
      /** 拖拽文件 → 绝对路径（知识入籍 PDF 拖拽，Electron 35 webUtils） */
      getPathForFile: (file: File) => string;
      /** 监听主进程发出的窗口关闭事件，返回取消监听函数 */
      onWindowClosing: (callback: () => void) => () => void;
      /** 向主进程发送关闭行为选择 */
      closeAction: (action: 'quit' | 'minimize' | 'cancel', remember: boolean) => Promise<void>;
      /** 最小化窗口 */
      windowMinimize: () => Promise<{ success: boolean }>;
      /** 切换最大化/还原 */
      windowMaximize: () => Promise<{ success: boolean }>;
      /** 关闭窗口（触发确认流程） */
      windowClose: () => Promise<{ success: boolean }>;
      /** 查询当前是否最大化 */
      windowIsMaximized: () => Promise<boolean>;
      /** 监听最大化状态变化，返回取消监听函数 */
      onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
      /** 监听退出前同步事件，返回取消监听函数 */
      onSyncBeforeQuit: (callback: () => void) => () => void;
      /** 通知主进程同步完成 */
      notifySyncComplete: () => void;
      /** 设置是否自动检查更新 */
      setAutoUpdate: (enabled: boolean) => Promise<{ success: boolean }>;
      /** v1.0.0: 数据访问 API */
      db: {
        query: <T = unknown>(table: string, method: string, args?: unknown[]) => Promise<T>;
        insert: (table: string, item: unknown) => Promise<string>;
        update: (table: string, id: string, changes: unknown) => Promise<void>;
        delete: (table: string, id: string) => Promise<void>;
        search: <T = unknown>(table: string, query: string) => Promise<T[]>;
        batch: (operations: unknown[]) => Promise<{ success: boolean }>;
      };
      /** v1.0.0: 数据迁移 API */
      migration: {
        check: () => Promise<{ needed: boolean; tableMapping: Array<{ dexie: string; sqlite: string }> }>;
        importTable: (table: string, rows: unknown[]) => Promise<{ success: boolean; rowsImported: number; error?: string }>;
        complete: () => Promise<{ success: boolean; integrity: string; error?: string }>;
      };
      /** v1.1.0: 存储路径管理 API */
      storage: {
        changePath: (newPath: string) => Promise<{
          success: boolean;
          previousPath?: string;
          newPath?: string;
          error?: string;
        }>;
        getActivePath: () => Promise<string>;
      };
    };
  }
}
