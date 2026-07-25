#!/usr/bin/env node
/**
 * 重复工作检测器 — 分析会话事件，识别跨会话重复模式
 *
 * 用法：
 *   node scripts/session-detect.mjs              # 分析所有会话，输出检测到的模式
 *   node scripts/session-detect.mjs --min=3      # 自定义最小重复次数（默认 2）
 *   node scripts/session-detect.mjs --verbose    # 显示详细匹配信息
 *
 * 检测策略：
 *   1. 命令重复：相同命令在 ≥2 个会话中出现
 *   2. 分类重复：相同 category 的事件序列在多个会话中重复
 *   3. 错误重复：相同错误消息跨会话出现
 *   4. 文件热点：相同文件在多个会话中被编辑
 *
 * 输出：.qoder/learning/patterns.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const learningDir = join(repoRoot, '.qoder', 'learning');
const eventsDir = join(learningDir, 'events');
const patternsFile = join(learningDir, 'patterns.json');

// ================================================================
// 参数解析
// ================================================================

const args = process.argv.slice(2);
const minOccurrences = parseInt(args.find(a => a.startsWith('--min='))?.split('=')[1] || '2', 10);
const verbose = args.includes('--verbose');

// ================================================================
// 数据加载
// ================================================================

function loadAllSessions() {
  if (!existsSync(eventsDir)) return [];
  const files = readdirSync(eventsDir).filter(f => f.endsWith('.json'));
  const sessions = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
      if (data.schemaVersion === 1 && Array.isArray(data.events)) {
        sessions.push(data);
      }
    } catch (e) {
      console.warn(`[detect] 跳过无效文件: ${file} (${e.message})`);
    }
  }
  return sessions;
}

// ================================================================
// 签名生成
// ================================================================

function signature(type, key) {
  const raw = `${type}:${key}`;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return `${type}_${hash}`;
}

// ================================================================
// 检测策略
// ================================================================

/**
 * 策略 1：命令重复检测
 * 相同命令（规范化后）在多个会话中出现
 */
function detectCommandRepeats(sessions) {
  const commandMap = new Map(); // normalized command -> { sessions: Set, timestamps: [] }

  for (const session of sessions) {
    const seenInSession = new Set();
    for (const event of session.events) {
      if (event.type !== 'command' || !event.payload?.command) continue;
      // 规范化：去除路径中的绝对前缀、合并多余空格
      const normalized = event.payload.command
        .replace(/\\/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
      if (seenInSession.has(normalized)) continue;
      seenInSession.add(normalized);

      if (!commandMap.has(normalized)) {
        commandMap.set(normalized, { sessions: new Set(), timestamps: [] });
      }
      const entry = commandMap.get(normalized);
      entry.sessions.add(session.sessionId);
      entry.timestamps.push(event.timestamp);
    }
  }

  const patterns = [];
  for (const [cmd, info] of commandMap) {
    if (info.sessions.size >= minOccurrences) {
      const timestamps = info.timestamps.sort();
      patterns.push({
        id: `pat_${signature('cmd', cmd)}`,
        signature: signature('cmd', cmd),
        title: `重复命令: ${cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}`,
        category: 'command-repeat',
        occurrences: info.sessions.size,
        sessionRefs: [...info.sessions],
        firstSeen: timestamps[0],
        lastSeen: timestamps[timestamps.length - 1],
        status: 'candidate',
        routedTo: null,
        detail: { command: cmd },
      });
    }
  }
  return patterns;
}

/**
 * 策略 2：分类序列重复检测
 * 相同 category 的事件在多个会话中形成相似序列
 */
function detectCategoryRepeats(sessions) {
  const categoryMap = new Map(); // category -> { sessions: Set, count: number }

  for (const session of sessions) {
    const categoriesInSession = new Set();
    for (const event of session.events) {
      if (!event.category) continue;
      categoriesInSession.add(event.category);
    }
    for (const cat of categoriesInSession) {
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { sessions: new Set(), count: 0 });
      }
      const entry = categoryMap.get(cat);
      entry.sessions.add(session.sessionId);
      entry.count++;
    }
  }

  const patterns = [];
  for (const [cat, info] of categoryMap) {
    if (info.sessions.size >= minOccurrences) {
      patterns.push({
        id: `pat_${signature('cat', cat)}`,
        signature: signature('cat', cat),
        title: `重复工作类别: ${cat}`,
        category: 'category-repeat',
        occurrences: info.sessions.size,
        sessionRefs: [...info.sessions],
        firstSeen: null,
        lastSeen: null,
        status: 'candidate',
        routedTo: null,
        detail: { eventCategory: cat },
      });
    }
  }
  return patterns;
}

/**
 * 策略 3：错误重复检测
 * 相同错误消息跨会话出现
 */
function detectErrorRepeats(sessions) {
  const errorMap = new Map(); // normalized message -> { sessions: Set, timestamps: [] }

  for (const session of sessions) {
    const seenInSession = new Set();
    for (const event of session.events) {
      if (event.type !== 'error' || !event.payload?.message) continue;
      // 规范化：取前 100 字符作为 key
      const normalized = event.payload.message.slice(0, 100).trim();
      if (seenInSession.has(normalized)) continue;
      seenInSession.add(normalized);

      if (!errorMap.has(normalized)) {
        errorMap.set(normalized, { sessions: new Set(), timestamps: [] });
      }
      const entry = errorMap.get(normalized);
      entry.sessions.add(session.sessionId);
      entry.timestamps.push(event.timestamp);
    }
  }

  const patterns = [];
  for (const [msg, info] of errorMap) {
    if (info.sessions.size >= minOccurrences) {
      const timestamps = info.timestamps.sort();
      patterns.push({
        id: `pat_${signature('err', msg)}`,
        signature: signature('err', msg),
        title: `重复错误: ${msg.length > 50 ? msg.slice(0, 47) + '...' : msg}`,
        category: 'error-repeat',
        occurrences: info.sessions.size,
        sessionRefs: [...info.sessions],
        firstSeen: timestamps[0],
        lastSeen: timestamps[timestamps.length - 1],
        status: 'candidate',
        routedTo: null,
        detail: { errorMessage: msg },
      });
    }
  }
  return patterns;
}

/**
 * 策略 4：文件热点检测
 * 相同文件在多个会话中被编辑
 */
function detectFileHotspots(sessions) {
  const fileMap = new Map(); // filePath -> { sessions: Set, editCount: number }

  for (const session of sessions) {
    const seenInSession = new Set();
    for (const event of session.events) {
      if (!['file_edit', 'file_create'].includes(event.type)) continue;
      const filePath = event.payload?.filePath;
      if (!filePath) continue;
      if (seenInSession.has(filePath)) continue;
      seenInSession.add(filePath);

      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { sessions: new Set(), editCount: 0 });
      }
      const entry = fileMap.get(filePath);
      entry.sessions.add(session.sessionId);
      entry.editCount++;
    }
  }

  const patterns = [];
  for (const [filePath, info] of fileMap) {
    if (info.sessions.size >= minOccurrences) {
      patterns.push({
        id: `pat_${signature('file', filePath)}`,
        signature: signature('file', filePath),
        title: `文件热点: ${filePath}`,
        category: 'file-hotspot',
        occurrences: info.sessions.size,
        sessionRefs: [...info.sessions],
        firstSeen: null,
        lastSeen: null,
        status: 'candidate',
        routedTo: null,
        detail: { filePath, editCount: info.editCount },
      });
    }
  }
  return patterns;
}

// ================================================================
// 主流程
// ================================================================

function main() {
  const sessions = loadAllSessions();

  if (sessions.length === 0) {
    console.log('[detect] 未找到会话事件数据。请先使用 session-record.mjs 记录会话。');
    // 写入空 patterns 文件以保持结构完整
    ensureDir();
    writeFileSync(patternsFile, JSON.stringify({
      schemaVersion: 1,
      detectedAt: new Date().toISOString(),
      sessionCount: 0,
      minOccurrences,
      patterns: [],
    }, null, 2) + '\n', 'utf8');
    return;
  }

  console.log(`[detect] 加载 ${sessions.length} 个会话，最小重复阈值: ${minOccurrences}`);

  // 运行所有检测策略
  const allPatterns = [
    ...detectCommandRepeats(sessions),
    ...detectCategoryRepeats(sessions),
    ...detectErrorRepeats(sessions),
    ...detectFileHotspots(sessions),
  ];

  // 合并已有 patterns（保留已验证/已路由的状态）
  const existingPatterns = loadExistingPatterns();
  const merged = mergePatterns(existingPatterns, allPatterns);

  // 输出结果
  const output = {
    schemaVersion: 1,
    detectedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    minOccurrences,
    patterns: merged,
  };

  ensureDir();
  writeFileSync(patternsFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`[detect] 检测完成：发现 ${merged.length} 个重复模式`);
  if (verbose) {
    for (const p of merged) {
      console.log(`  [${p.status}] ${p.title} (${p.occurrences} 次, ${p.category})`);
    }
  } else {
    const byStatus = {};
    for (const p of merged) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }
    for (const [status, count] of Object.entries(byStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  }
  console.log(`[detect] 结果已写入: .qoder/learning/patterns.json`);
}

function ensureDir() {
  if (!existsSync(learningDir)) mkdirSync(learningDir, { recursive: true });
}

function loadExistingPatterns() {
  if (!existsSync(patternsFile)) return [];
  try {
    const data = JSON.parse(readFileSync(patternsFile, 'utf8'));
    return data.patterns || [];
  } catch {
    return [];
  }
}

/**
 * 合并策略：保留已有 patterns 中 status 为 verified/routed/resolved 的状态，
 * 更新 occurrences 和 sessionRefs；新发现的 patterns 以 candidate 状态加入。
 */
function mergePatterns(existing, detected) {
  const existingBySig = new Map(existing.map(p => [p.signature, p]));
  const result = [];

  for (const pattern of detected) {
    const prev = existingBySig.get(pattern.signature);
    if (prev) {
      // 保留高优先级状态
      const statusPriority = { candidate: 0, verified: 1, routed: 2, resolved: 3 };
      const finalStatus = (statusPriority[prev.status] || 0) >= (statusPriority[pattern.status] || 0)
        ? prev.status
        : pattern.status;
      result.push({
        ...pattern,
        status: finalStatus,
        routedTo: prev.routedTo || null,
        occurrences: Math.max(prev.occurrences, pattern.occurrences),
        sessionRefs: [...new Set([...(prev.sessionRefs || []), ...pattern.sessionRefs])],
      });
      existingBySig.delete(pattern.signature);
    } else {
      result.push(pattern);
    }
  }

  // 保留未在新一轮检测中出现但已 routed/resolved 的旧模式
  for (const [, prev] of existingBySig) {
    if (['routed', 'resolved'].includes(prev.status)) {
      result.push(prev);
    }
  }

  return result;
}

main();
