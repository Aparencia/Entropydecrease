#!/usr/bin/env node
/**
 * @ai-context
 * 会话事件记录器：采集并规范化 agent 会话事件到 .qoder/learning/events/。
 * Session event recorder normalizing agent activity into JSON event logs.
 * Why: 事件按会话分文件存储并以 .active-session 标记当前会话，避免并发写入互相覆盖。
 *
 * 会话事件记录器 — 采集并规范化 agent 会话事件
 *
 * 用法：
 *   node scripts/session-record.mjs init                     # 初始化新会话
 *   node scripts/session-record.mjs emit <type> [options]    # 记录一条事件
 *   node scripts/session-record.mjs close                    # 关闭当前会话
 *   node scripts/session-record.mjs list                     # 列出所有会话
 *
 * 事件类型：command | file_edit | file_create | error | search | navigation | custom
 *
 * 选项（通过 --key=value 传入）：
 *   --category=env-setup|validation|build|deploy|...
 *   --command="npm run dev"
 *   --exit-code=0
 *   --file-path=client/src/App.tsx
 *   --query="authentication logic"
 *   --message="Something went wrong"
 *   --tags=tag1,tag2
 *
 * 存储位置：.qoder/learning/events/<sessionId>.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const eventsDir = join(repoRoot, '.qoder', 'learning', 'events');
const activeSessionFile = join(repoRoot, '.qoder', 'learning', '.active-session');

// ================================================================
// 工具函数
// ================================================================

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function parseArgs(args) {
  const opts = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      opts[match[1]] = match[2];
    }
  }
  return opts;
}

function getActiveSession() {
  if (!existsSync(activeSessionFile)) return null;
  return readFileSync(activeSessionFile, 'utf8').trim();
}

function loadSession(sessionId) {
  const file = join(eventsDir, `${sessionId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function saveSession(session) {
  ensureDir(eventsDir);
  const file = join(eventsDir, `${session.sessionId}.json`);
  writeFileSync(file, JSON.stringify(session, null, 2) + '\n', 'utf8');
}

// ================================================================
// 命令实现
// ================================================================

function cmdInit() {
  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${randomUUID().slice(0, 8)}`;
  const session = {
    schemaVersion: 1,
    sessionId,
    startedAt: now(),
    endedAt: null,
    project: 'Entropydecrease',
    events: [],
  };
  saveSession(session);
  ensureDir(dirname(activeSessionFile));
  writeFileSync(activeSessionFile, sessionId, 'utf8');
  console.log(`[session-record] 会话已初始化: ${sessionId}`);
  console.log(`[session-record] 事件存储: .qoder/learning/events/${sessionId}.json`);
  return sessionId;
}

function cmdEmit(type, opts) {
  const sessionId = getActiveSession();
  if (!sessionId) {
    console.error('[session-record] 无活跃会话，请先运行 init');
    process.exit(1);
  }

  const session = loadSession(sessionId);
  if (!session) {
    console.error(`[session-record] 会话文件不存在: ${sessionId}`);
    process.exit(1);
  }

  const validTypes = ['command', 'file_edit', 'file_create', 'error', 'search', 'navigation', 'custom'];
  if (!validTypes.includes(type)) {
    console.error(`[session-record] 无效事件类型: ${type}（有效: ${validTypes.join(', ')}）`);
    process.exit(1);
  }

  const event = {
    id: `evt-${randomUUID().slice(0, 12)}`,
    type,
    timestamp: now(),
  };

  if (opts.category) event.category = opts.category;

  // 构建 payload
  const payload = {};
  if (opts.command) payload.command = opts.command;
  if (opts['exit-code'] !== undefined) payload.exitCode = parseInt(opts['exit-code'], 10);
  if (opts['file-path']) payload.filePath = opts['file-path'];
  if (opts.query) payload.query = opts.query;
  if (opts.message) payload.message = opts.message;
  if (opts.tags) payload.tags = opts.tags.split(',').map(t => t.trim());

  if (Object.keys(payload).length > 0) event.payload = payload;

  session.events.push(event);
  saveSession(session);
  console.log(`[session-record] 事件已记录: ${event.id} (${type})`);
}

function cmdClose() {
  const sessionId = getActiveSession();
  if (!sessionId) {
    console.error('[session-record] 无活跃会话');
    process.exit(1);
  }

  const session = loadSession(sessionId);
  if (session) {
    session.endedAt = now();
    saveSession(session);
    console.log(`[session-record] 会话已关闭: ${sessionId}（共 ${session.events.length} 条事件）`);
  }

  // 清除活跃会话标记
  writeFileSync(activeSessionFile, '', 'utf8');
}

function cmdList() {
  ensureDir(eventsDir);
  const files = readdirSync(eventsDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.log('[session-record] 暂无会话记录');
    return;
  }
  console.log(`[session-record] 共 ${files.length} 个会话：`);
  for (const file of files) {
    const session = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
    const status = session.endedAt ? '已关闭' : '进行中';
    console.log(`  ${session.sessionId} | ${session.startedAt} | ${session.events.length} 事件 | ${status}`);
  }
}

// ================================================================
// CLI 入口
// ================================================================

const [,, command, ...rest] = process.argv;

switch (command) {
  case 'init':
    cmdInit();
    break;
  case 'emit': {
    const [type, ...argRest] = rest;
    if (!type) {
      console.error('[session-record] 用法: emit <type> [--key=value ...]');
      process.exit(1);
    }
    cmdEmit(type, parseArgs(argRest));
    break;
  }
  case 'close':
    cmdClose();
    break;
  case 'list':
    cmdList();
    break;
  default:
    console.log(`
会话事件记录器 — 采集并规范化 agent 会话事件

用法:
  node scripts/session-record.mjs init                   初始化新会话
  node scripts/session-record.mjs emit <type> [opts]     记录事件
  node scripts/session-record.mjs close                  关闭当前会话
  node scripts/session-record.mjs list                   列出所有会话

事件类型: command | file_edit | file_create | error | search | navigation | custom

示例:
  node scripts/session-record.mjs emit command --command="npm run dev" --category=env-setup --exit-code=0
  node scripts/session-record.mjs emit error --message="Module not found" --category=build
  node scripts/session-record.mjs emit file_edit --file-path=client/src/App.tsx --category=feature
`);
}
