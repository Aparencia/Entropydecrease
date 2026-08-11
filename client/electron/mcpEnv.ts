/**
 * MCP Bridge 环境与配置构建
 *
 * @ai-context: 从 mcpManager.ts 拆出。Electron 主进程的 process.env
 * 可能几乎为空（仅含 Electron 自设变量），Windows 下经 PowerShell
 * .NET API 从注册表读取 Machine+User 环境变量作为基础层、process.env
 * 覆盖其上——MCP Server 子进程需要完整 PATH 才能运行。
 * @ai-context: buildServerConfigs 解析 node_modules/.bin 下的三个
 * MCP server 可执行文件（Windows 加 .cmd 后缀）；新增 server 在此登记。
 * @ai-context: SEC——execSync 命令串为完全固定常量（无任何用户/外部
 * 输入拼接），无 shell 注入面；若未来需参数化必须改用 execFile。
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { logger } from './logger.js';

// ================================================================
// IPC 消息类型
// ================================================================

export interface BridgeRequest {
  id: string;
  method: 'init' | 'listTools' | 'callTool' | 'shutdown';
  params?: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  result?: unknown;
  error?: string;
}

/** 工具描述信息 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export type ServerName = 'filesystem' | 'sequential-thinking' | 'memory';

/** MCP Server 启动配置 */
export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

// ================================================================
// Windows 注册表环境变量读取
// ================================================================

/**
 * 从 Windows 注册表读取用户 + 系统环境变量。
 * @returns 从注册表读取的环境变量对象，失败时返回空对象
 */
function readWindowsRegistryEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  if (process.platform !== 'win32') return env;

  try {
    // 使用 PowerShell .NET API 从注册表读取用户 + 系统环境变量
    // [Environment]::GetEnvironmentVariables() 合并 Machine + User 两层
    const output = execSync(
      'powershell -NoProfile -Command "' +
      '$e = [Environment]::GetEnvironmentVariables();' +
      'foreach ($k in $e.Keys) { Write-Output "$k=$($e[$k])" }"',
      {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
      },
    );

    for (const line of output.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        if (key) env[key] = value;
      }
    }

    logger.info(`[MCP] Registry env loaded: ${Object.keys(env).length} keys`);
  } catch (err) {
    logger.error('[MCP] Failed to read registry env via PowerShell', err);
  }

  return env;
}

/**
 * 构建完整的子进程环境变量：
 * 合并 Electron process.env + Windows 注册表环境变量。
 * 注册表值作为基础层，process.env 覆盖其上（保留 Electron 特有能力如 ELECTRON_RUN_AS_NODE）。
 */
export function buildChildEnv(): Record<string, string> {
  const registryEnv = readWindowsRegistryEnv();
  const processEnv = process.env as Record<string, string | undefined>;

  // 注册表为基础，process.env 覆盖
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(registryEnv)) {
    merged[k] = v;
  }
  for (const [k, v] of Object.entries(processEnv)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }

  return merged;
}

/**
 * 构建三个内置 MCP server 的启动配置
 * @param dirname 调用方 __dirname（编译后为 dist-electron/electron/）
 * @param userDataDir filesystem server 的工作目录（userData）
 */
export function buildServerConfigs(dirname: string, userDataDir: string): McpServerConfig[] {
  const clientRoot = path.resolve(dirname, '..', '..');
  const binDir = path.join(clientRoot, 'node_modules', '.bin');
  const isWindows = process.platform === 'win32';

  return [
    {
      name: 'filesystem',
      binName: 'mcp-server-filesystem',
      args: [userDataDir],
    },
    {
      name: 'sequential-thinking',
      binName: 'mcp-server-sequential-thinking',
      args: [],
    },
    {
      name: 'memory',
      binName: 'mcp-server-memory',
      args: [],
    },
  ].map((cfg) => ({
    name: cfg.name,
    command: isWindows
      ? path.join(binDir, `${cfg.binName}.cmd`)
      : path.join(binDir, cfg.binName),
    args: cfg.args,
  }));
}
