#!/usr/bin/env node
/**
 * 模式路由器 — 将已验证的重复模式路由到最小持久所有者
 *
 * 用法：
 *   node scripts/session-route.mjs                    # 自动路由所有 verified 模式
 *   node scripts/session-route.mjs --verify=<patId>   # 手动将 candidate 标记为 verified
 *   node scripts/session-route.mjs --status           # 查看路由状态
 *
 * 路由规则（routing-rules）：
 *   - 基于模式的 category 和 detail 匹配预定义的路由规则
 *   - 每条规则指定一个持久所有者（Skill 文件路径或脚本路径）
 *   - 路由后模式状态从 verified → routed
 *
 * 路由目标类型：
 *   - skill: 项目 Skill 文件（.qoder/skills/*.md）
 *   - script: 自动化脚本（scripts/*.mjs）
 *   - memory: agent 记忆系统（通过输出提示）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const learningDir = join(repoRoot, '.qoder', 'learning');
const patternsFile = join(learningDir, 'patterns.json');

// ================================================================
// 路由规则定义
// 每条规则：匹配条件 → 持久所有者
// ================================================================

const ROUTING_RULES = [
  {
    id: 'rule-env-setup',
    description: '环境启动类重复工作 → env-bootstrap Skill',
    match: (pattern) => {
      // 匹配 category 为 env-setup 的分类重复，或包含 npm install/dev 的命令重复
      if (pattern.category === 'category-repeat' && pattern.detail?.eventCategory === 'env-setup') {
        return true;
      }
      if (pattern.category === 'command-repeat') {
        const cmd = pattern.detail?.command || '';
        return /npm (install|ci|run dev|run build)/.test(cmd) ||
               /electron/.test(cmd) ||
               /pip install/.test(cmd);
      }
      return false;
    },
    owner: {
      type: 'skill',
      path: '.qoder/skills/env-bootstrap.md',
      description: '环境启动引导 Skill — 提供一键环境检测和启动指导',
    },
  },
  {
    id: 'rule-build-validation',
    description: '构建验证类重复工作 → 验证流水线 Skill',
    match: (pattern) => {
      if (pattern.category === 'category-repeat' && pattern.detail?.eventCategory === 'validation') {
        return true;
      }
      if (pattern.category === 'command-repeat') {
        const cmd = pattern.detail?.command || '';
        return /npm run (lint|typecheck|test|build)/.test(cmd);
      }
      return false;
    },
    owner: {
      type: 'script',
      path: 'scripts/validate-all.mjs',
      description: '全项目验证脚本 — 一键执行 lint/typecheck/test/build',
    },
  },
  {
    id: 'rule-error-recovery',
    description: '重复错误 → 错误恢复知识',
    match: (pattern) => {
      return pattern.category === 'error-repeat';
    },
    owner: {
      type: 'memory',
      path: null,
      description: '将重复错误模式记录到 agent 记忆系统，避免重复排查',
    },
  },
  {
    id: 'rule-file-hotspot',
    description: '文件热点 → 重构候选标记',
    match: (pattern) => {
      return pattern.category === 'file-hotspot' && pattern.occurrences >= 3;
    },
    owner: {
      type: 'memory',
      path: null,
      description: '高频编辑文件标记为重构候选，提示架构优化',
    },
  },
];

// ================================================================
// 主逻辑
// ================================================================

function loadPatterns() {
  if (!existsSync(patternsFile)) {
    console.error('[route] 未找到 patterns.json，请先运行 session-detect.mjs');
    process.exit(1);
  }
  return JSON.parse(readFileSync(patternsFile, 'utf8'));
}

function savePatterns(data) {
  writeFileSync(patternsFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function routePattern(pattern) {
  for (const rule of ROUTING_RULES) {
    if (rule.match(pattern)) {
      return {
        routedTo: rule.owner.path || `memory:${rule.id}`,
        ownerType: rule.owner.type,
        ownerDescription: rule.owner.description,
        ruleId: rule.id,
      };
    }
  }
  return null;
}

function cmdRoute() {
  const data = loadPatterns();
  const verified = data.patterns.filter(p => p.status === 'verified');

  if (verified.length === 0) {
    console.log('[route] 无待路由的 verified 模式。');
    const candidates = data.patterns.filter(p => p.status === 'candidate');
    if (candidates.length > 0) {
      console.log(`[route] 当前有 ${candidates.length} 个 candidate 模式待验证：`);
      for (const p of candidates) {
        console.log(`  ${p.id}: ${p.title}`);
      }
      console.log('[route] 使用 --verify=<patternId> 手动验证，或等待更多会话数据自动升级。');
    }
    return;
  }

  let routedCount = 0;
  for (const pattern of verified) {
    const route = routePattern(pattern);
    if (route) {
      pattern.status = 'routed';
      pattern.routedTo = route.routedTo;
      pattern.routeInfo = {
        ruleId: route.ruleId,
        ownerType: route.ownerType,
        ownerDescription: route.ownerDescription,
        routedAt: new Date().toISOString(),
      };
      routedCount++;
      console.log(`[route] ✓ ${pattern.title}`);
      console.log(`    → ${route.ownerType}: ${route.routedTo}`);
      console.log(`    (${route.ownerDescription})`);
    } else {
      console.log(`[route] △ ${pattern.title} — 无匹配路由规则，保持 verified 状态`);
    }
  }

  savePatterns(data);
  console.log(`\n[route] 完成：${routedCount}/${verified.length} 个模式已路由`);
}

function cmdVerify(patternId) {
  const data = loadPatterns();
  const pattern = data.patterns.find(p => p.id === patternId || p.signature === patternId);

  if (!pattern) {
    console.error(`[route] 未找到模式: ${patternId}`);
    console.log('[route] 可用模式：');
    for (const p of data.patterns) {
      console.log(`  [${p.status}] ${p.id}: ${p.title}`);
    }
    process.exit(1);
  }

  if (pattern.status === 'candidate') {
    pattern.status = 'verified';
    pattern.verifiedAt = new Date().toISOString();
    savePatterns(data);
    console.log(`[route] ✓ 模式已验证: ${pattern.title}`);
    console.log(`[route] 运行不带参数执行路由`);
  } else {
    console.log(`[route] 模式当前状态为 ${pattern.status}，无需验证`);
  }
}

function cmdStatus() {
  const data = loadPatterns();
  console.log(`[route] 模式路由状态（更新于 ${data.detectedAt}）`);
  console.log(`[route] 会话数: ${data.sessionCount}, 模式总数: ${data.patterns.length}`);
  console.log('');

  const groups = { candidate: [], verified: [], routed: [], resolved: [] };
  for (const p of data.patterns) {
    (groups[p.status] || groups.candidate).push(p);
  }

  for (const [status, patterns] of Object.entries(groups)) {
    if (patterns.length === 0) continue;
    const labels = { candidate: '待验证', verified: '已验证(待路由)', routed: '已路由', resolved: '已解决' };
    console.log(`  ${labels[status]} (${patterns.length}):`);
    for (const p of patterns) {
      const routeInfo = p.routedTo ? ` → ${p.routedTo}` : '';
      console.log(`    ${p.id}: ${p.title}${routeInfo}`);
    }
    console.log('');
  }
}

// ================================================================
// CLI 入口
// ================================================================

const args = process.argv.slice(2);
const verifyArg = args.find(a => a.startsWith('--verify='));

if (verifyArg) {
  cmdVerify(verifyArg.split('=')[1]);
} else if (args.includes('--status')) {
  cmdStatus();
} else {
  cmdRoute();
}
