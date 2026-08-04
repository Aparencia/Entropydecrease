#!/usr/bin/env node
/**
 * 激活码生成脚本
 *
 * 离线生成激活码，前缀区分类型。
 * 格式: ENTROPY-{TYPE}-{XXXX}-{XXXX}
 * TYPE: PRO(订阅) / LIFE(终身) / SND1(音效包) / THM1(主题包)
 *
 * 用法:
 *   node scripts/license-gen.mjs           # 生成 1 个 Pro 激活码
 *   node scripts/license-gen.mjs --type LIFE --count 5   # 生成 5 个终身激活码
 *   node scripts/license-gen.mjs --type SND1             # 生成 1 个音效包激活码
 *   node scripts/license-gen.mjs --csv                   # 输出 CSV 格式
 */

import crypto from 'node:crypto';

const TYPES = {
  PRO: { name: 'Pro 订阅', tier: 'pro', duration: '30天' },
  LIFE: { name: '终身 Pro', tier: 'lifetime', duration: '永久' },
  SND1: { name: '音效包 Vol.1', tier: 'free', duration: '永久' },
  THM1: { name: '主题皮肤包', tier: 'free', duration: '永久' },
};

function generateCode(type) {
  const prefix = type.toUpperCase();
  // 使用 base36 编码提高信息密度（0-9A-Z，每字符 36 种组合）
  const part1 = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  const part2 = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `ENTROPY-${prefix}-${part1}-${part2}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let type = 'PRO';
  let count = 1;
  let csv = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      const t = args[++i].toUpperCase();
      if (TYPES[t]) type = t;
      else { console.error(`无效类型: ${t}，可用: ${Object.keys(TYPES).join(', ')}`); process.exit(1); }
    } else if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[++i], 10);
      if (count < 1 || count > 100) { console.error('count 范围: 1-100'); process.exit(1); }
    } else if (args[i] === '--csv') {
      csv = true;
    }
  }

  return { type, count, csv };
}

function main() {
  const { type, count, csv } = parseArgs();
  const typeInfo = TYPES[type];

  if (csv) {
    console.log('code,type,tier,duration,generated_at');
    for (let i = 0; i < count; i++) {
      const code = generateCode(type);
      const now = new Date().toISOString();
      console.log(`${code},${type},${typeInfo.tier},${typeInfo.duration},${now}`);
    }
  } else {
    console.log(`\n📋 生成 ${count} 个 ${typeInfo.name} 激活码（${typeInfo.duration}）\n`);
    for (let i = 0; i < count; i++) {
      const code = generateCode(type);
      console.log(`  ${code}`);
    }
    console.log(`\n🔑 tier: ${typeInfo.tier}`);
    console.log(`⏰ 生成时间: ${new Date().toLocaleString('zh-CN')}\n`);
  }
}

main();