/**
 * MCP Server 管理器（Bridge 架构）
 *
 * 通过 child_process.fork() 启动独立的 Node.js 子进程（mcpBridge.ts），
 * 在子进程中加载 MCP SDK 并管理 server 连接。
 *
 * 为什么需要 Bridge：
 *   Electron 主进程是 CJS 环境，MCP SDK 的 StdioClientTransport 仅 ESM 导出。
 *   Electron 的模块系统不支持 new Function + import() 技巧加载 ESM 模块。
 *   Bridge 运行在纯 Node.js 中，原生支持 ESM dynamic import()。
 *
 * 通信协议（JSON over IPC）：
 *   Manager → Bridge：{ id, method, params }
 *   Bridge → Manager：{ id, result?, error? }
 *
 * @ai-context Electron 主进程 MCP 集成入口。2026-07 拆分——环境变量
 * 合并与 server 配置在 mcpEnv.ts；本类保留 Bridge 进程生命周期与
 * 请求-响应管线。shutdown 有 1s 优雅关闭 + SIGTERM + 5s SIGKILL
 * 三级兜底，防孤儿进程阻塞应用退出。
 */

import { fork, type ChildProcess } from 'child_process';
import * as path from 'path';
import { app } from 'electron';
import { logger } from './logger.js';
import {
  buildChildEnv, buildServerConfigs,
  type BridgeRequest, type BridgeResponse, type McpToolInfo, type ServerName,
} from './mcpEnv.js';

// ================================================================
// 管理器
// ================================================================

class McpManager {
  private bridge: ChildProcess | null = null;
  private initialized = false;
  private requestCounter = 0;
  /** 待响应的请求回调 */
  private pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();

  /**
   * 初始化 MCP Manager：fork Bridge 子进程并发送 init 命令
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    logger.info('[MCP] Initializing MCP Manager (bridge architecture)...');

    // 1. Fork bridge 子进程
    //    编译后 __dirname = dist-electron/electron/
    //    bridge 编译产物也在同目录：dist-electron/electron/mcpBridge.js
    const bridgePath = path.join(__dirname, 'mcpBridge.js');

    // 构建完整环境变量（Electron process.env 可能几乎为空，需从 Windows 注册表补充）
    const childEnv = buildChildEnv();
    logger.info(`[MCP] Main process env keys: ${Object.keys(process.env).length}, merged child env keys: ${Object.keys(childEnv).length}, PATH: ${(childEnv.PATH || childEnv.Path || '').slice(0, 80)}`);

    try {
      this.bridge = fork(bridgePath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: childEnv,
      });

      if (!this.bridge.pid) {
        throw new Error('Failed to fork bridge process — no PID assigned');
      }

      logger.info(`[MCP] Bridge process forked (pid: ${this.bridge.pid})`);

      // 监听 bridge 的 stdout（日志）
      this.bridge.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) logger.info(msg);
      });

      // 监听 bridge 的 stderr（错误）
      this.bridge.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) logger.error(msg);
      });

      // 监听 bridge 的 IPC 消息
      this.bridge.on('message', (msg: BridgeResponse) => {
        this.handleResponse(msg);
      });

      // bridge 进程退出
      this.bridge.on('exit', (code, signal) => {
        logger.warn(`[MCP] Bridge process exited: code=${code} signal=${signal}`);
        this.bridge = null;
        // 拒绝所有待处理的请求
        for (const [id, pending] of this.pending) {
          pending.reject(new Error('Bridge process exited'));
          this.pending.delete(id);
        }
      });

      // bridge 进程错误
      this.bridge.on('error', (err) => {
        logger.error('[MCP] Bridge process error', err);
      });

      // 2. 解析 bin 目录和 server 配置（详见 mcpEnv.ts）
      const serverConfigs = buildServerConfigs(__dirname, app.getPath('userData'));

      // 3. 发送 init 命令到 bridge
      const result = await this.sendRequest('init', { servers: serverConfigs });
      const status = result as Record<ServerName, boolean>;

      const connectedCount = Object.values(status).filter(Boolean).length;
      logger.info(`[MCP] Initialization complete: ${connectedCount}/${serverConfigs.length} servers connected`);
    } catch (err) {
      logger.error('[MCP] Manager init failed', err);
      this.killBridge();
    }
  }

  /**
   * 列出指定 server 的所有可用工具
   */
  async listTools(serverName: ServerName): Promise<McpToolInfo[]> {
    const result = await this.sendRequest('listTools', { serverName });
    return result as McpToolInfo[];
  }

  /**
   * 调用指定 server 上的工具
   */
  async callTool(
    serverName: ServerName,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.sendRequest('callTool', { serverName, toolName, args });
  }

  /**
   * 获取所有 server 的连接状态
   */
  async getStatus(): Promise<Record<ServerName, boolean>> {
    if (!this.bridge) {
      return { filesystem: false, 'sequential-thinking': false, memory: false };
    }
    // 通过 listTools 间接检测连接状态
    const status = {} as Record<ServerName, boolean>;
    const names: ServerName[] = ['filesystem', 'sequential-thinking', 'memory'];
    for (const name of names) {
      try {
        await this.sendRequest('listTools', { serverName: name });
        status[name] = true;
      } catch {
        status[name] = false;
      }
    }
    return status;
  }

  /**
   * 关闭所有 server（发送 shutdown 命令并终止 bridge 进程）
   */
  async shutdown(): Promise<void> {
    logger.info('[MCP] Shutting down MCP Manager...');

    if (this.bridge) {
      try {
        // 给 bridge 1 秒时间优雅关闭（避免阻塞退出）
        await Promise.race([
          this.sendRequest('shutdown', {}),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Shutdown timeout')), 1000),
          ),
        ]);
      } catch {
        // 超时或失败，忽略
      }
      this.killBridge();
    }

    logger.info('[MCP] MCP Manager shut down');
  }

  // ================================================================
  // 内部方法
  // ================================================================

  /**
   * 向 bridge 发送请求并等待响应
   */
  private sendRequest(method: BridgeRequest['method'], params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.bridge) {
        reject(new Error('Bridge process is not running'));
        return;
      }

      const id = `req_${++this.requestCounter}`;
      const request: BridgeRequest = { id, method, params };

      this.pending.set(id, { resolve, reject });

      this.bridge.send(request, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(new Error(`Failed to send request: ${err.message}`));
        }
      });
    });
  }

  /**
   * 处理 bridge 返回的响应
   */
  private handleResponse(msg: BridgeResponse): void {
    const pending = this.pending.get(msg.id);
    if (!pending) {
      logger.warn(`[MCP] Received response for unknown request: ${msg.id}`);
      return;
    }

    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  /**
   * 强制终止 bridge 子进程
   */
  private killBridge(): void {
    if (this.bridge) {
      this.bridge.kill('SIGTERM');
      // 5 秒后强杀
      const bridge = this.bridge;
      setTimeout(() => {
        if (bridge.connected) bridge.kill('SIGKILL');
      }, 5000);
      this.bridge = null;
    }
  }
}

// ================================================================
// 单例导出
// ================================================================

export const mcpManager = new McpManager();
