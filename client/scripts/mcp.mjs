#!/usr/bin/env node
/**
 * MCP 服务器启动入口（供 AI 编程工具 MCP 配置引用）
 *
 * @ai-context: 熵减为 AI 工具提供 MCP 能力：文件系统、顺序思考、记忆、SDK。
 * 用法示例（Claude Code / Cursor 的 mcp 配置）：
 *   "entropy-fs":     { "command": "node", "args": ["client/scripts/mcp.mjs", "fs"] }
 *   "entropy-seq":    { "command": "node", "args": ["client/scripts/mcp.mjs", "seq"] }
 *   "entropy-memory": { "command": "node", "args": ["client/scripts/mcp.mjs", "memory"] }
 * 2026-08 R8：从 package.json scripts 移出（避免与构建/测试命令混淆），
 * 原 npm run modelcontextprotocol/fs/seq/memory 命令已由本入口替代。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVERS = {
  fs: 'mcp-server-filesystem',
  seq: 'mcp-server-sequential-thinking',
  memory: 'mcp-server-memory',
  sdk: 'mcp-server-sdk',
};

const name = process.argv[2] ?? 'sdk';
const bin = SERVERS[name];
if (!bin) {
  console.error(`未知 MCP 服务器: ${name}（可用: ${Object.keys(SERVERS).join(', ')}）`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 继承 stdio：MCP 协议走 stdin/stdout，stderr 用于日志
const child = spawn('npx', [bin], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
