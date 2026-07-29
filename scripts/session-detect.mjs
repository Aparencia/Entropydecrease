#!/usr/bin/env node
/**
 * @ai-context
 * 重复工作检测器 — 加载会话事件，运行检测策略，合并输出模式清单。
 * Repeat-work detector: loads session events, runs strategies, merges pattern list.
 * Why: 合并时保留 verified/routed/resolved 的既有状态，避免每轮检测把人工裁决打回 candidate。
 *
 * 用法：
 *   node scripts/session-detect.mjs              # 分析所有会话，输出检测到的模式
 *   node scripts/session-detect.mjs --min=3      # 自定义最小重复次数（默认 2）
 *   node scripts/session-detect.mjs --verbose    # 显示详细匹配信息
 *
 * 检测策略（见 session-detect-strategies.mjs）：
 *   命令重复 / 分类重复 / 错误重复 / 文件热点
 *
 * 输出：.qoder/learning/patterns.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectCommandRepeats,
  detectCategoryRepeats,
  detectErrorRepeats,
  detectFileHotspots,
} from './session-detect-strategies.mjs';

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
    ...detectCommandRepeats(sessions, minOccurrences),
    ...detectCategoryRepeats(sessions, minOccurrences),
    ...detectErrorRepeats(sessions, minOccurrences),
    ...detectFileHotspots(sessions, minOccurrences),
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
