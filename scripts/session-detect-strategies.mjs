#!/usr/bin/env node
/**
 * @ai-context
 * 重复模式检测策略库 — 四种跨会话重复识别策略（命令/分类/错误/文件热点）。
 * Detection strategies for cross-session repeat patterns.
 * Why: 策略与主流程分离，新增检测维度只需在此追加函数并在主流程注册，互不干扰。
 */
import { createHash } from 'node:crypto';

/** 模式签名：type + key 的短哈希，跨轮次检测保持稳定 */
export function signature(type, key) {
  const raw = `${type}:${key}`;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return `${type}_${hash}`;
}

/**
 * 策略 1：命令重复检测
 * 相同命令（规范化后）在多个会话中出现
 */
export function detectCommandRepeats(sessions, minOccurrences) {
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
export function detectCategoryRepeats(sessions, minOccurrences) {
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
export function detectErrorRepeats(sessions, minOccurrences) {
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
export function detectFileHotspots(sessions, minOccurrences) {
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
