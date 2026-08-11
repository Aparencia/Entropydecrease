#!/usr/bin/env node
/**
 * 激活码管理 CLI（对接 Supabase licenses 池）
 *
 * @ai-context: 单人运维工具：导入激活码 CSV → 池、按订单对账、撤销、状态查询。
 * 需要环境变量 SUPABASE_URL + SUPABASE_SERVICE_KEY（service key 仅服务端/本脚本持有）。
 *
 * 用法:
 *   node scripts/license-admin.mjs import ./codes.csv          # 导入 CSV（code,type,tier,duration_days,generated_at）
 *   node scripts/license-admin.mjs status ENTROPY-PRO-XXXX-XXXX  # 查询单个激活码状态
 *   node scripts/license-admin.mjs revoke ENTROPY-PRO-XXXX-XXXX  # 撤销激活码
 *   node scripts/license-admin.mjs reconcile MB-1001            # 按订单号对账（标记 sold）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 环境变量：脚本直接读进程环境（.env 由调用方注入）
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY');
    console.error('   powershell: $env:SUPABASE_URL=\"https://xxx.supabase.co\"; $env:SUPABASE_SERVICE_KEY=\"...\"');
    process.exit(1);
  }
}

/** PostgREST 请求（service key） */
async function pg(method, pathname, body) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${pathname}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${method} ${pathname} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : [];
}

/** 解析 CSV 行（code,type,tier,duration_days,generated_at） */
function parseCsv(content) {
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [code, type, , durationDays] = line.split(',');
    if (!code || !code.startsWith('ENTROPY-')) continue;
    rows.push({
      code: code.trim(),
      type: (type || 'PRO').trim().toLowerCase(),
      duration_days: parseInt(durationDays, 10) || 30,
    });
  }
  return rows;
}

async function cmdImport(csvPath) {
  requireEnv();
  const content = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(content);
  if (rows.length === 0) {
    console.error('❌ 未解析到任何激活码（CSV 表头: code,type,tier,duration_days,generated_at）');
    process.exit(1);
  }
  let inserted = 0;
  for (const row of rows) {
    try {
      await pg('POST', '/licenses', row);
      inserted++;
    } catch (err) {
      // 唯一键冲突 = 已存在，跳过（幂等导入）
      if (String(err.message).includes('23505') || String(err.message).includes('duplicate')) {
        console.warn(`⏭ 已存在，跳过: ${row.code}`);
      } else {
        console.error(`✗ 导入失败 ${row.code}: ${err.message}`);
      }
    }
  }
  console.log(`✅ 导入完成: ${inserted}/${rows.length} 条（unsold 状态）`);
}

async function cmdStatus(code) {
  requireEnv();
  const rows = await pg('GET', `/licenses?code=eq.${encodeURIComponent(code)}&select=*`);
  if (rows.length === 0) {
    console.log(`🔍 未找到激活码: ${code}`);
    return;
  }
  const r = rows[0];
  console.log(JSON.stringify({
    code: r.code,
    type: r.type,
    status: r.status,
    order_id: r.order_id,
    duration_days: r.duration_days,
    bound_user_id: r.bound_user_id,
    machine_id: r.machine_id,
    expires_at: r.expires_at,
    sold_at: r.sold_at,
    activated_at: r.activated_at,
    revoked_at: r.revoked_at,
  }, null, 2));
}

async function cmdRevoke(code) {
  requireEnv();
  const now = new Date().toISOString();
  const rows = await pg('PATCH', `/licenses?code=eq.${encodeURIComponent(code)}`, {
    status: 'revoked',
    revoked_at: now,
  });
  if (rows.length === 0) {
    console.error(`✗ 激活码不存在: ${code}`);
    process.exit(1);
  }
  console.log(`✅ 已撤销: ${code}（此前状态: ${rows[0].status}）`);
}

async function cmdReconcile(orderId) {
  requireEnv();
  // 按订单号查池记录；不存在 → 提示先确认订单在面包多已支付
  const rows = await pg('GET', `/licenses?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
  if (rows.length === 0) {
    console.error(`✗ 未找到订单 ${orderId} 关联的激活码——请先在面包多后台确认订单状态，再手动补标。`);
    console.error('  可先执行 status 查询确认激活码，然后 revoke 或重发。');
    process.exit(1);
  }
  for (const r of rows) {
    if (r.status === 'sold' || r.status === 'bound') {
      console.log(`⏭ 激活码 ${r.code} 已处于 ${r.status} 状态，无需处理`);
      continue;
    }
    await pg('PATCH', `/licenses?code=eq.${encodeURIComponent(r.code)}`, { status: 'sold', sold_at: new Date().toISOString() });
    console.log(`✅ 对账完成: 订单 ${orderId} → ${r.code} 已标记 sold`);
  }
}

const [subcommand, arg] = process.argv.slice(2);

switch (subcommand) {
  case 'import':
    if (!arg) { console.error('用法: license-admin.mjs import <codes.csv>'); process.exit(1); }
    cmdImport(arg);
    break;
  case 'status':
    if (!arg) { console.error('用法: license-admin.mjs status <ENTROPY-CODE>'); process.exit(1); }
    cmdStatus(arg);
    break;
  case 'revoke':
    if (!arg) { console.error('用法: license-admin.mjs revoke <ENTROPY-CODE>'); process.exit(1); }
    cmdRevoke(arg);
    break;
  case 'reconcile':
    if (!arg) { console.error('用法: license-admin.mjs reconcile <ORDER_ID>'); process.exit(1); }
    cmdReconcile(arg);
    break;
  default:
    console.log('用法: license-admin.mjs <import|status|revoke|reconcile> <参数>');
    process.exit(1);
}
