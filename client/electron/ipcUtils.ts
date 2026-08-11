/**
 * IPC 安全注册工具
 *
 * 在注册新 handler 前先 removeHandler，确保幂等注册，
 * 防止 macOS activate 事件导致 createWindow() 被多次调用时
 * 触发 "Attempted to register a second handler" 崩溃。
 *
 * SEC-005: 新增 IPC sender 验证机制，仅允许主窗口的 webContents
 * 调用已注册的 IPC handler，防止恶意渲染进程注入调用。
 *
 * @ai-context Electron 主进程 IPC 安全加固
 */

import { ipcMain } from 'electron';
import { logger } from './logger.js';

// ================================================================
// 主窗口 webContents ID 管理（SEC-005）
// ================================================================

/** 主窗口 webContents.id，用于 IPC sender 验证；null 表示未设置（跳过验证） */
let mainWindowWebContentsId: number | null = null;

/**
 * 设置主窗口 webContents.id，用于 IPC sender 验证。
 * 应在 main.ts 中创建主窗口后立即调用。
 *
 * @param id - 主窗口 webContents.id
 * @ai-context main.ts 在 app.whenReady() 中调用
 */
export function setMainWindowId(id: number): void {
  mainWindowWebContentsId = id;
  logger.info(`[IPC] Main window ID set: ${id}`);
}

/**
 * 获取当前主窗口 webContents.id。
 *
 * @returns 主窗口 webContents.id，未设置时返回 null
 * @ai-context 用于调试或外部模块查询
 */
export function getMainWindowId(): number | null {
  return mainWindowWebContentsId;
}

// ================================================================
// 类型安全 handler 签名
// ================================================================

/**
 * 支持类型安全的 handler 签名：
 * 允许 handler 声明具体参数类型，内部通过断言适配 ipcMain.handle 的 unknown[] 签名。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedHandler<T extends any[]> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: T
) => Promise<unknown>;

// ================================================================
// 安全注册
// ================================================================

/**
 * 幂等注册 IPC handler，并可选启用 sender 验证。
 *
 * - 注册前先 removeHandler，防止重复注册崩溃。
 * - 若已调用 setMainWindowId，则执行 sender 验证：
 *   不匹配的 sender 将被拒绝并记录告警日志。
 * - 若 mainWindowId 未设置（null），则跳过验证（开发容错）。
 *
 * @param channel - IPC 频道名称
 * @param handler - 处理函数
 * @ai-context main.ts 中所有 safeHandle 调用均经过此函数
 */
export function safeHandle<T extends any[]>(
  channel: string,
  handler: TypedHandler<T>,
): void {
  ipcMain.removeHandler(channel);

  // 包装 handler 以执行 sender 验证
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedHandler = async (event: Electron.IpcMainInvokeEvent, ...args: unknown[]): Promise<unknown> => {
    // sender 验证：仅允许主窗口 webContents 调用
    if (mainWindowWebContentsId !== null && event.sender.id !== mainWindowWebContentsId) {
      logger.warn(
        `[IPC] Sender verification failed for channel "${channel}": ` +
        `expected sender.id=${mainWindowWebContentsId}, got ${event.sender.id}`
      );
      throw new Error(`IPC sender verification failed for channel: ${channel}`);
    }

    return handler(event, ...args as T);
  };

  ipcMain.handle(channel, wrappedHandler as Parameters<typeof ipcMain.handle>[1]);
}

// ================================================================
// IPC 入参校验（P1-4：防缺参/错型导致主进程 TypeError 崩溃）
// ================================================================

/**
 * 校验必填非空字符串入参。
 *
 * @param value - 待校验值（渲染进程传入，实际可能缺失/错型）
 * @param field - 字段名（仅用于错误信息）
 * @returns 校验通过的原值
 * @throws 入参缺失或类型错误时抛出带字段名的明确错误
 * @ai-context handler 首行调用：把"缺参导致的裸 .length TypeError"前移为
 * 带字段名的可诊断错误，避免向云端网关发出无效请求
 */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`IPC 入参错误: ${field} 必须为非空字符串`);
  }
  return value;
}

/**
 * 校验必填数组入参（允许空数组，仅拒绝非数组类型）。
 *
 * @param value - 待校验值
 * @param field - 字段名（仅用于错误信息）
 * @returns 校验通过的数组
 * @throws 入参缺失或类型错误时抛出带字段名的明确错误
 */
export function requireArray<T = unknown>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`IPC 入参错误: ${field} 必须为数组`);
  }
  return value as T[];
}

// ================================================================
// IPC 消息批量化（渲染进程侧防抖工具）
// ================================================================

/**
 * IPC 消息防抖：相同 channel 的连续调用在一帧内合并为最后一次请求。
 *
 * 适用于渲染进程频繁触发的 IPC 调用（如窗口 resize 事件、输入状态同步等），
 * 通过 queueMicrotask 将同一事件循环内的多次调用合并为最后一次。
 *
 * @param channel - IPC 频道名称
 * @param handler - 实际处理函数（仅处理最后一次请求的参数）
 * @ai-context 用于高频 IPC 场景（如滚动位置同步、窗口状态更新）
 */
export function safeHandleBatched<T extends any[]>(
  channel: string,
  handler: TypedHandler<T>,
): void {
  let pending: {
    event: Electron.IpcMainInvokeEvent;
    args: T;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  } | null = null;
  let scheduled = false;

  const batchedHandler: TypedHandler<T> = (event, ...args) => {
    // 新调用覆盖旧 pending：旧调用立即结算（合并语义——只有最后一次返回真实结果）
    if (pending) {
      pending.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
      pending = { event, args, resolve, reject };

      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const current = pending;
          pending = null;
          if (!current) return;
          // CL-M3: microtask 中 try/catch 包裹——handler 抛错时 reject 给调用方
          // （invoke 收到 rejection 而非 unhandledRejection 状态漂移）；
          // 最后一次调用可拿到 handler 的真实返回值
          Promise.resolve(handler(current.event, ...current.args))
            .then(current.resolve)
            .catch(current.reject);
        });
      }
    });
  };

  safeHandle(channel, batchedHandler);
}
