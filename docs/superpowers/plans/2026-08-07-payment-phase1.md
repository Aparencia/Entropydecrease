# 付费系统 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 基于 [payment-system-spec.md](../../product/payment-system-spec.md) 落地 Phase 1——面包多激活码池验真 + 按 tier 分级限额 + 客户端订阅展示。

**Architecture:** Supabase 为数据权威（licenses 池 + user_metadata.paid）；AI 网关从 JWT claims 解析 tier 注入 request.state，rate_limit/budget 消费分级配额；激活码验证走"池验真 + sold 状态 + user/machine 绑定"；面包多订单经 webhook（HMAC + 查询确认）标记 sold。

**Tech Stack:** FastAPI/Pydantic/httpx（服务端）、pytest（测试）、TypeScript/React/Zustand（客户端）、Vitest（测试）、Node fetch（管理脚本）。

**Spec 缺口映射：** ① auth.py tier 注入 ② budget.py 分级 ③ license.py 验真 ④ machine_id 真实化 ⑤ PRO 时长由池决定

---

## Task 1: auth.py — JWT claims tier 注入

**Files:**
- Modify: `server/ai-gateway/middleware/auth.py`（`_verify_token` 返回 payload；dispatch 注入 tier）
- Test: `server/ai-gateway/tests/test_tier_injection.py`（新建）

- [x] **Step 1: 写失败测试** — 纯函数 `extract_tiers(payload)`：有 beta 无 paid / 双有取 max / paid 过期 → None / claims 缺失 → (None, None)
- [x] **Step 2: 运行确认失败**
- [x] **Step 3: 实现** — `_verify_token` 返回 `dict`（payload）；`dispatch` 调 `extract_tiers` 注入 `request.state.beta_tier/paid_tier`；开发降级模式返回空 dict
- [x] **Step 4: 测试通过**
- [x] **Step 5: commit**

## Task 2: budget.py — 费用上限按 tier 分级

**Files:**
- Modify: `server/ai-gateway/cost/budget.py`
- Test: `server/ai-gateway/tests/test_budget_tier.py`（新建）

- [x] **Step 1: 失败测试** — 纯函数 `resolve_cost_limit(beta_tier, paid_tier) -> float`：free→0.5 / pro→2.0 / lifetime→3.0 / 无效→0.5
- [x] **Step 3: 实现** — 复用 `middleware.rate_limit.get_tier_limits`；dispatch 中读 request.state tier；token 上限保持全局
- [x] **Step 5: commit**

## Task 3: 限流注册 license_activate

**Files:**
- Modify: `server/ai-gateway/middleware/rate_limit.py`（PATH_TO_FEATURE）
- Modify: `server/ai-gateway/config/limits.py`（RATE_LIMITS + TIMEOUT_CONFIG，启动校验要求双登记）

- [x] **Step 1: 配置** — `"/api/v1/license/activate": "license_activate"`；`"license_activate": 10`（RATE_LIMITS）；`"license_activate": 5`（TIMEOUT_CONFIG）
- [x] **Step 2: 验证** — 启动无 `_MISSING_CONFIG` 告警（pytest 或 import 冒烟）
- [x] **Step 3: commit**

## Task 4: supabase_adapter.py — Supabase REST 适配层

**Files:**
- Create: `server/ai-gateway/services/supabase_adapter.py`（≤200 行）
- Test: `server/ai-gateway/tests/test_supabase_adapter.py`（新建）

- [x] **Step 1: 失败测试** — 未配置 SUPABASE_URL/SERVICE_KEY 时进入内存 mock 池模式：`get_license_by_code` 命中/未命中；`bind_license` 状态转换
- [x] **Step 3: 实现** — httpx.AsyncClient（5s 超时）；PostgREST 查询 `licenses?code=eq.XXX`；PATCH 状态；`update_paid_metadata(user_id, tier, expires_at)` 调 `/auth/v1/admin/users/{id}`（service key）
- [x] **Step 5: commit**

## Task 5: license.py — 验真改造 + /quota + /status

**Files:**
- Modify: `server/ai-gateway/routers/license.py`
- Test: `server/ai-gateway/tests/test_license_pool.py`（新建）

- [x] **Step 1: 失败测试** — 纯函数：`compute_expires_at(current, duration_days, now)`（续费叠加 max(now,old)+duration）；`check_bindable(row, user_id, machine_id, now)`（sold/已绑/过期/撤销/设备上限）
- [x] **Step 3: 实现** — activate 流程：格式 → 池查询 → sold 校验 → 绑定 → 叠加到期 → 写 metadata → 返回；`/quota`（Redis rate_limit + cost tracker 聚合）；`/status`（服务端复核）
- [x] **Step 5: commit**

## Task 6: payment_adapter.py + license_webhook.py

**Files:**
- Create: `server/ai-gateway/services/payment_adapter.py`（≤300 行）
- Create: `server/ai-gateway/routers/license_webhook.py`（≤150 行）
- Test: `server/ai-gateway/tests/test_payment_webhook.py`（新建）

- [x] **Step 1: 失败测试** — HMAC 验签通过/失败；order_id 幂等（重复通知 200）；伪造 order_id 拒绝；面包多查询超时 → 入队降级
- [x] **Step 3: 实现** — `verify_signature` / `query_order` / `verify_and_mark_sold`（查询确认模式）；webhook 快速 200 → 异步处理 → 原始 payload 落日志
- [x] **Step 5: commit**

## Task 7: 脚本 — license-gen --duration + license-admin

**Files:**
- Modify: `scripts/license-gen.mjs`
- Create: `scripts/license-admin.mjs`

- [x] **Step 1: 实现** — gen 增加 `--duration` 参数（CSV 输出 duration 列）；admin 子命令：`import`（CSV→Supabase 池，fetch + service key）、`reconcile`、`revoke`、`status`
- [x] **Step 2: 冒烟** — `node scripts/license-gen.mjs --type PRO --duration 30 --csv | head -3`
- [x] **Step 3: commit**

## Task 8: 客户端 machineId 真实化

**Files:**
- Create: `client/electron/machineId.ts`（≤60 行）
- Modify: `client/electron/main.ts`（注册 ipcMain.handle('machine-id:get')）
- Modify: `client/electron/preload.ts`（ALLOWED_CHANNELS + electronAPI.machineId）
- Test: `client/src/features/beta/licenseService.test.ts`（新建，机器码传递）

- [x] **Step 1: 实现** — 主进程生成 `sha256(hostname+platform+arch+随机盐)` 持久化 userData/machine-id；读取稳定
- [x] **Step 2: 客户端 licenseService** — 提取激活请求封装：`activateLicense(code, machineId, token)`
- [x] **Step 3: commit**

## Task 9: 客户端类型/store/UI

**Files:**
- Modify: `client/src/types/beta.ts`（PaidStatus / QuotaInfo）
- Modify: `client/src/features/beta/betaStore.ts`（paidStatus + recalc 纳入）
- Modify: `client/src/features/beta/hooks/useBetaProfile.ts`（解析 paid metadata）
- Modify: `client/src/features/beta/LicenseActivation.tsx`（machine_id + 到期展示 + <3 天提醒）
- Modify: `client/src/features/beta/BetaProfile.tsx`（付费状态行）
- Create: `client/src/features/beta/hooks/useQuota.ts`（≤100 行）
- Modify: `client/src/pages/SettingsPage.tsx`（AI 用量卡）

- [x] **Step 1: 类型 + store** — 失败测试（recalc 纳入 paidStatus：JWT paid 无本地 license 时 effectiveTier 提升）
- [x] **Step 3: 实现** — 依次落地上述文件
- [x] **Step 4: 验证** — `cd client && npm run lint && npx vitest run src/features/beta --passWithNoTests`（定向）+ `npx tsc -b`
- [x] **Step 5: commit**

## Task 10: 全量验证

- [x] 服务端：`cd server/ai-gateway && python -m pytest tests/ -q`（新增 4 个测试文件全绿，基线不回归）
- [x] 客户端：`cd client && npm run lint && npm run test`（或定向）
- [x] 汇总 commit

---
**关键设计决策（执行时遵循）：**
1. tier 只信 JWT claims；解析失败 → free（配额 fail-closed）
2. 激活码时长以池 `duration_days` 为准；续费叠加 `max(now, old) + duration`
3. 设备上限：内容包 1 / pro 2 / lifetime 3；`machine_id='local'` 兼容按 1 台计
4. webhook：HMAC（有则验）→ order_id 查询确认 → 幂等；Supabase/面包多不可用 → 队列 + 告警，人工 reconcile
5. 全部外部调用 5s 超时、最多 3 次指数退避；新增文件 ≤300 行 + @ai-context 注释
