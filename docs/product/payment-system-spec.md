# 熵减付费系统规格说明（Payment System Spec）

> **定位**：把"临时收入方案"（v10 三表 + 激活码占位实现）完善为可上线的最小收费闭环——**面包多收款验真**与**按 tier 分级限额**是本次核心补齐项。
> **关联文档**：[收入方案](./revenue-plan-no-license.md) · [内测专属系统](./beta-exclusive-system.md) · [分层管理](./beta-tier-management.md) · [内测协议](./beta-agreement.md) · [第三方集成规范](../standards/third-party-integration.md) · [AI 编程规范](../standards/ai-coding.md)
> **架构决策**：Supabase 为数据权威（方案 A，已确认）；激活码池 + webhook 验真（已确认）
> **最后更新**：2026-08-07

---

## 一、架构设计

### 1.1 分层总览

```
┌───────────────────────────── 客户端 (Electron + React) ─────────────────────────────┐
│  betaStore(effectiveTier) ── useTierAccess(权限检查) ── LicenseActivation(激活 UI)   │
│  本地 SQLite: beta_profile / licenses / invite_codes (v10 已有, 7 天离线宽限)        │
│  设备指纹 machineId：Electron 主进程生成持久化 UUID（见 §八.4）                      │
└──────────────────────────────────────┬──────────────────────────────────────────────┘
                                       │ Supabase JWT（claims 含 user_metadata.beta / .paid）
┌──────────────────────────────────────▼──────────────────────────────────────────────┐
│                             AI 网关 (FastAPI)                                        │
│  auth.py            : 解析 JWT claims → request.state.beta_tier / paid_tier 【改】  │
│  rate_limit.py      : get_tier_limits 消费注入 tier → 分级配额生效         【改】    │
│  cost/budget.py     : 费用上限按 tier 读取（TIER_LIMITS.cost）            【改】    │
│  routers/license.py : 验真改造（查池 + sold + 绑定 + 幂等）               【改】    │
│  license_webhook    : 面包多订单通知（通知+查询确认双重验真）              【新】    │
│  services/supabase_adapter.py : Supabase REST 数据适配层（httpx + service key）【新】│
│  services/payment_adapter.py  : 面包多适配层（隔离/降级/超时）            【新】    │
└──────────────────────────────────────┬──────────────────────────────────────────────┘
                                       ▼
              Supabase: licenses 池 / user_metadata(beta + paid) ← 数据权威
```

### 1.2 身份整合与 tier 注入链路

```
用户登录（Supabase Auth）
  → JWT claims 携带 user_metadata.beta.tier / user_metadata.paid.{tier,expires_at}
  → auth.py JWTAuthMiddleware 解析 claims：
       beta_tier = claims.user_metadata.beta.tier
       paid_tier = claims.user_metadata.paid.tier（paid.expires_at 已过期 → None）
     → request.state.beta_tier / request.state.paid_tier
  → rate_limit.py / budget.py 经 get_tier_limits() 读取分级配额
```

**硬性规则**：
1. **tier 只信服务端 JWT claims**，客户端自定义 Header（如 `X-Beta-Tier`）一律忽略——防止伪造身份提权。
2. **paid 过期即降级**：`paid.expires_at < now` 时 paid_tier 视为 None，服务端回落到 beta/free 档。
3. **解析失败默认 free**（配额 fail-closed）；核心学习功能不受影响（本地优先，离线照常用）。

### 1.3 与现有代码的缺口映射（本次必须补齐）

| # | 缺口 | 现状 | 修复 |
|---|------|------|------|
| ① | tier 未注入 | `auth.py` 只注入 `user_id`，`request.state.beta_tier` 恒为 None → 所有人按 free 档限流 | auth.py 解析 claims（§1.2） |
| ② | budget 未分级 | `DAILY_COST_LIMIT_YUAN` 全局 ¥2.0 环境变量，TIER_LIMITS.cost 无消费方 | budget.py 按 tier 读上限（§四） |
| ③ | 激活码验真缺失 | `license.py /activate` 格式合法即成功（占位实现） | 池验真 + sold 状态 + 绑定（§五） |
| ④ | 机器码占位 | 客户端传 `machine_id: 'local'` | 真实设备指纹（§八.4） |
| ⑤ | 月/年同码同时长 | PRO 固定 30 天，年卡 ¥99 无法表达 | 时长由池记录 `duration_days` 决定（§二） |

---

## 二、计费模式设计

### 2.1 商品目录（三层模型落地）

| 商品 | 定价 | 激活码前缀 | 池记录时长 | 说明 |
|------|------|-----------|-----------|------|
| AI Pro 月卡 | ¥12/月 | `PRO` | 30 天 | 订阅制，到期降级 |
| AI Pro 年卡 | ¥99/年 | `PRO` | 365 天 | **同前缀，时长由服务端池记录决定**，客户端不信前缀 |
| 终身 Pro（早鸟） | ¥199 限量 100 | `LIFE` | 36500 天 | 联动 `beta.lifetime_pro` |
| 深海声景音效包 | ¥6 | `SND1` | 永久 | 内容解锁，不升级 tier |
| 主题皮肤包 | ¥3~6 | `THM1` | 永久 | 同上 |

### 2.2 计费规则

- **核心学习功能永不收费**：番茄钟/笔记/闪卡/费曼/SOP/调度（scheduler.ts）不设付费墙。
- **收费仅围绕**：AI 增强（模型档位 + 配额）与数字内容（音效/主题/课程预设模板包）。
- **BYOK 豁免**：自带 API Key 的用户不受平台配额限制（收入方案已承诺），请求跳过 rate_limit/budget 的平台配额检查。
- **激活码单价与时长解耦**：`license-gen.mjs` 生成时指定 `--duration`（默认 30），服务端池记录为准。

### 2.3 订阅生命周期

```
购买(面包多) → webhook 标记 sold → 应用内激活(bound) → 生效(expires_at 起算)
    → 到期前 3 天：应用内温和提醒（本地判断 + 服务端复核）
    → 到期：服务端 paid_tier 视为 None（JWT 过期校验），客户端 effectiveTier 回落
    → 续费：购买新码再次激活（同用户叠加时长：新 expires_at = max(now, 旧 expires_at) + duration）
```

**叠加规则**：同一用户激活同类型订阅码，有效期在旧到期日基础上顺延（`expires_at = max(now, old) + duration_days`），避免"提前续费亏天数"。

---

## 三、用户层级管理

### 3.1 层级并存的优先级规则（沿用并固化现有实现）

```typescript
// client/src/types/beta.ts 已实现，服务端 rate_limit.py _TIER_RANK 同构
TIER_RANK = { free: 0, observer: 1, active: 2, pro: 3, core: 4, lifetime: 5 }
effectiveTier = max(betaTier, paidTier)   // 无降级抵消
```

| 组合场景 | 结果 | 理由 |
|---------|------|------|
| 内测 active + Pro 订阅 | pro | 付费权益即时生效 |
| 内测 core + Pro 订阅 | core | 内测最高层 > pro，保留共创权益 |
| 内测 observer + 早鸟终身 | lifetime | 终身最高 |
| 订阅到期 + 内测 active | active | 回落内测档，不归零 |

### 3.2 权益矩阵（TIER_PERKS 基线，客户端与服务端必须同步）

| tier | daily 次数 | 日费用上限 | 模型 | 多模态 | 抢先体验 | 多设备同步 |
|------|:---:|:---:|------|:---:|:---:|:---:|
| free | 15 | ¥0.5 | glm-flash | ❌ | 0 | ❌ |
| observer | 50 | ¥1.5 | + qwen-plus | ❌ | 0 | ✅ |
| active | 80 | ¥2.0 | + deepseek | ✅ | 3 天 | ✅ |
| core | 120 | ¥3.0 | all | ✅ | 5 天 | ✅ |
| pro | 80 | ¥2.0 | + deepseek | ❌ | 0 | ✅ |
| lifetime | 120 | ¥3.0 | all | ✅ | 5 天 | ✅ |

**同步纪律**：`TIER_PERKS`（客户端）、`TIER_LIMITS`（服务端 rate_limit.py）、本文档三处必须一致；修改任一处于 PR 中同步其余两处并加注释互指（沿用现有注释约定）。

---

## 四、配额限制策略（限额机制）

### 4.1 计量模型

- **服务端权威计数**：Redis（`rate_limit:{user_id}:global:{date}` 次数 + `cost:{user_id}:{tokens|yuan}:{date}` 费用）。客户端 `useTierAccess` 仅做展示，不参与判定。
- **双层限流**（rate_limit.py 已有）：功能级上限 + 全局每日次数上限；`GLOBAL_EXEMPT_FEATURES`（transcribe/chat）豁免全局总量。
- **每日重置**：Redis key 按日期 + TTL 至当日结束（已有实现，无需改动）。
- **多设备一致性**：配额按 `user_id` 计数（非设备），跨设备天然共享同一配额；`multiDeviceSync` 权益控制的是同步服务，与配额无关。

### 4.2 需要落地的改造

**a) auth.py tier 注入**（缺口①）：见 §1.2，使 `get_tier_limits()` 首次真正生效。

**b) budget.py 按 tier 分级**（缺口②）：

```python
# cost/budget.py dispatch() 内，替换全局常量判断：
from middleware.rate_limit import get_tier_limits
beta_tier = getattr(request.state, "beta_tier", None)
paid_tier = getattr(request.state, "paid_tier", None)
limits = get_tier_limits(beta_tier, paid_tier)
daily_cost_limit = float(limits["cost"])          # 0.5 / 1.5 / 2.0 / 3.0
# DAILY_TOKEN_LIMIT 保持全局 200K：作为防滥用兜底，不按 tier 分级（理由：token 上限
# 主要防单次超长请求，费用上限才是成本控制主闸）
```

**c) 用尽降级**（已有 429 + 友好提示，保持）：
- 拒绝话术区分用户（复用 UpgradePrompt 逻辑）：内测"明天恢复"、免费"升级 Pro 或 BYOK"、Pro"明日恢复/考虑年卡"。
- **不提供自动降级到低价模型**（Phase 2 可选）：避免"付费后仍用低档模型"的体验落差，当前以明确 429 为准。

**d) 配额展示接口**（新增，供 §七 UI）：

```
GET /api/v1/license/quota        （需登录）
→ { "used_calls": 12, "total_calls": 80,          # 服务端 Redis 当日计数
    "used_cost": 0.34, "cost_limit": 2.0,
    "tier": "pro", "expires_at": "2026-09-07T..." }
```

### 4.3 BYOK 豁免

- BYOK 请求（携带自有 `X-User-API-Key` 的既有模式；virtual_key.py 属 Phase 4 预留，不阻塞）在认证后标记 `request.state.byok = True`，rate_limit/budget 跳过平台配额。
- 豁免只针对平台配额，不豁免基础防滥用（请求体大小、频率熔断仍生效）。

---

## 五、支付集成方案（面包多）

### 5.1 资金流与状态机

```
① 开发者: license-gen.mjs --type PRO --duration 30 --count 50
      → 激活码 CSV → ①导入 Supabase licenses 池(unsold) ②上传面包多卡密商品
② 买家付款 → 面包多自动发卡（激活码直发买家）
③ 面包多订单通知 → POST /api/v1/license/webhook
      → 服务端用 order_id 主动调面包多订单查询 API 确认（查询确认模式）
      → 确认后 licenses.status: unsold → sold（回填 order_id / sold_at）
④ 买家应用内输入激活码 → POST /api/v1/license/activate
      → 验真：池中存在 + status=sold + 未绑定 + 未过期 + 未撤销
      → 绑定 user_id + machine_id（status: sold → bound）+ 更新 user_metadata.paid
      → 返回 tier / expires_at → 客户端写本地 SQLite
⑤ 到期前 3 天：客户端本地提醒；联网时 /license/status 服务端复核
```

**licenses 状态机**：`unsold → sold → bound → revoked`；bound 到期后查询时视为失效（记录保留，供续费叠加计算）。

### 5.2 适配层（遵循 third-party-integration.md）

**`services/payment_adapter.py`（新增，≤300 行）**：
- **接口**：`verify_and_mark_sold(order_id) -> bool`、`query_order(order_id) -> OrderInfo | None`（面包多字段映射到统一 `OrderInfo`）。
- **隔离**：`license.py` 只依赖 `PaymentAdapter` 接口，不直接触碰面包多 API——未来替换 Gumroad/Stripe 只改适配层。
- **超时/重试**：所有外部调用 5s 超时；幂等查询最多 3 次指数退避（1s/2s/4s + 抖动）。
- **熔断**：连续 5 次失败开启 60s 熔断，webhook 先入队（Redis 队列）待恢复后补处理。
- **降级**：面包多查询 API 不可用时 webhook 暂不标记 sold，进入 `pending_orders` 队列 + 告警日志；人工通过 `scripts/license-admin.mjs reconcile` 对账兜底。
- **webhook 幂等**：`order_id` 唯一索引，重复通知直接 200。

### 5.3 Webhook 端点

```
POST /api/v1/license/webhook          （面包多订单通知）
安全：① HMAC 签名验证（PAYMENT_WEBHOOK_SECRET，平台支持时）
      ② 查询确认模式兜底：凭 order_id 主动调面包多 API 确认订单真实存在且已支付
      ③ 快速 200 → 异步处理 → 原始 payload 落日志（排查用）
```

> 注：面包多若不支持 webhook 签名，则依赖"查询确认模式"防伪造——伪造者无法提供真实 order_id。具体能力以面包多开放平台文档为准，适配层收敛差异。

### 5.4 密钥与配置（环境变量，禁止硬编码）

```env
# .env（不提交 git）
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...        # 网关 admin 权限（仅服务端使用，勿下发客户端）
PAYMENT_PROVIDER=mianbaoduo     # 适配层开关
PAYMENT_WEBHOOK_SECRET=whsec_...
PAYMENT_TIMEOUT_MS=5000
PAYMENT_RETRY_COUNT=3
```

---

## 六、数据模型设计

### 6.1 Supabase（数据权威，新增 SQL migration）

```sql
-- migration: 20260807_licenses.sql
CREATE TABLE IF NOT EXISTS licenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,              -- ENTROPY-PRO-XXXX-XXXX
  type          TEXT NOT NULL,                     -- pro / lifetime / snd1 / thm1
  status        TEXT NOT NULL DEFAULT 'unsold',    -- unsold/sold/bound/revoked
  order_id      TEXT UNIQUE,                       -- 面包多订单号（webhook 回填）
  buyer_email   TEXT,                              -- 买家邮箱（可选）
  duration_days INTEGER NOT NULL DEFAULT 30,       -- 时长权威来源
  bound_user_id UUID REFERENCES auth.users(id),
  machine_id    TEXT,
  expires_at    TIMESTAMPTZ,
  sold_at       TIMESTAMPTZ,
  activated_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_licenses_code ON licenses(code);
CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id);
CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(bound_user_id);
```

### 6.2 user_metadata 扩展（付费状态，随 JWT 自动携带）

```jsonc
// Supabase auth.users.raw_user_meta_data（激活时由网关经 admin API 写入）
{
  "beta": { /* 现有：tier/cohort/joined_at/invite_code/lifetime_pro/badges */ },
  "paid": {
    "tier": "pro",                    // pro / lifetime（lifetime 不设 expires_at）
    "expires_at": "2026-09-07T08:00:00Z",
    "updated_at": "2026-08-07T08:00:00Z"
  }
}
```

**为什么放 user_metadata**：JWT 自动携带 claims，网关零额外查询即可分级配额；更新走 Supabase Admin API（service key）。**已签发 JWT 不含最新 paid 状态**——激活成功后客户端调用 `supabase.auth.refreshSession()` 刷新 token，配额即时生效；离线场景由本地 SQLite 覆盖（§6.3）。

### 6.3 本地 SQLite（客户端，v10 已有，无需迁移）

- `licenses` 表：本地激活缓存（`expires_at` 用于离线判断 + 7 天宽限）。
- `beta_profile` 表：身份缓存。
- **新增** `machine_id` 持久化文件（userData 目录，非 SQLite）：设备指纹，见 §8.4。

### 6.4 类型层（客户端）

`client/src/types/beta.ts` 扩展：

```typescript
export interface PaidStatus {           // 新增：服务端返回的付费状态
  tier: 'pro' | 'lifetime';
  expiresAt?: string;
  updatedAt: string;
}
export interface QuotaInfo {            // 新增：配额展示
  usedCalls: number; totalCalls: number;
  usedCost: number; costLimit: number;
  tier: UserTier; expiresAt?: string;
}
// License 增加 durationDays?: number  （可选，展示用）
```

---

## 七、前端 UI 展示

### 7.1 激活与订阅状态（改造 LicenseActivation.tsx）

- 已激活时展示：订阅 tier、**到期日 + 剩余天数**、续费入口（面包多链接）。
- 到期前 3 天：应用内提醒条"订阅将于 X 天后到期，续费保持 Pro 权益"（本地判断，非阻断）。
- 激活成功：权益摘要 toast（沿用现有）。
- 年卡/月卡展示差异化话术（`durationDays >= 365` 显示"年付方案"）。

### 7.2 配额展示（新增，设置页"AI 用量"卡）

- 数据源：`GET /api/v1/license/quota`（§4.2d）。
- 展示：今日调用 `12/80` + 今日费用 `¥0.34/¥2.0` 双进度条；tier 标识。
- 用尽状态复用 UpgradePrompt（区分内测/免费/Pro 话术，已有）。

### 7.3 身份标识共存

- 付费 + 内测并存时展示双标识：如"✨ Pro 订阅 · 🪼 创始潜航员"（TIER_LABELS/TIER_COLORS 已有）。
- BetaProfile 卡片（设置页）保持内测身份展示；新增"付费状态"行（tier + 到期日）。

### 7.4 内容包解锁（Phase 2 预留，UI 占位）

- SND1/THM1 激活后进入"已购内容"列表（设置页 → 内容库），对应模块（音效设置/主题设置）解锁；核心引擎不收费（音效/主题的"使用"免费，"拥有新内容"付费）。

---

## 八、安全考虑

### 8.1 防未授权访问（服务端权威）

| 威胁 | 措施 |
|------|------|
| 伪造 tier 提权 | tier 只解析自 JWT claims，忽略客户端 Header（§1.2 规则 1） |
| 伪造激活码 | 池验真：码必须在 licenses 池且 `status=sold`；未售/不存在一律拒绝 |
| 激活码暴力枚举 | `/api/v1/license/activate` 注册进 PATH_TO_FEATURE 限流（feature `license_activate`，RATE_LIMITS 登记 10 次/天/用户）；失败计数告警 |
| 激活码分享/多设备 | 一码多设备限制：绑定上限按 tier（内容包 1 台 / pro 2 台 / lifetime 3 台）；超限返回明确错误并可人工 revoke |
| 假 webhook | HMAC 验签 + order_id 查询确认（§5.3） |
| 退款不回收 | admin 脚本 `license-admin.mjs revoke`；revoked 码激活接口拒绝（状态机） |
| 客户端篡改本地表 | 本地 licenses 表仅作缓存；配额判定在服务端；联网时 `/license/status` 复核修正 |

### 8.2 离线宽限（延续收入方案承诺）

- 本地缓存激活状态，**7 天离线宽限**；联网后服务端复核，发现 revoked/过期则本地标记失效并提示。
- 宽限期内核心学习功能不受影响（本地优先底线）。

### 8.3 密钥管理

- 全部环境变量（§5.4）；`SUPABASE_SERVICE_KEY` 仅存于服务端 `.env`，**严禁**出现在 preload/IPC 桥接或渲染进程。
- webhook secret 定期轮换；泄露立即轮换并复查日志。

### 8.4 设备指纹（machine_id 真实化）

- Electron 主进程生成：`sha256(hostname + os.platform + os.arch + 随机盐)`，持久化到 userData 目录（`machine-id` 文件），不可被渲染进程改写路径。
- 首激活时注册；换机/重装 = 新 machine_id，触发"多设备上限"判定（按 §8.1 绑定上限）。
- 兼容：历史激活记录（machine_id='local'）由 admin 脚本批量重绑或作废。

---

## 九、迁移路径

### Phase 1（本 spec 落地，~2-3 周）
| 任务 | 文件 | 工作量 |
|------|------|:---:|
| auth.py JWT claims → tier 注入 + 测试 | `middleware/auth.py` | 1d |
| budget.py 按 tier 分级 + 测试 | `cost/budget.py` | 0.5d |
| supabase_adapter.py（REST 适配层） | `services/supabase_adapter.py`（新） | 1d |
| license.py 验真改造（池/sold/绑定/幂等/叠加） | `routers/license.py` | 2d |
| payment_adapter.py + webhook 端点 | `services/payment_adapter.py` + `routers/license_webhook.py`（新） | 2d |
| license-gen.mjs `--duration` + license-admin.mjs（导入/对账/撤销） | `scripts/` | 1d |
| 客户端 machineId 真实化 | `client/electron/`（新 module） | 0.5d |
| LicenseActivation 到期展示 + 续费提醒 | `client/src/features/beta/` | 1d |
| 配额展示（useQuota + 设置页卡片 + /license/quota） | `client/src/features/beta/` + `routers/license.py` | 1.5d |
| Supabase migration + 存量激活码导入 | SQL + admin 脚本 | 0.5d |
| **合计** | | **~11d** |

### Phase 2（订阅自动化，4-8 周）
- 续费提醒自动化 + 到期服务端复核定时任务
- 内容包解锁（SND1/THM1 → 音效/主题资源 + 已购内容列表）
- 课程预设模板包（SOP 额外模板集合，见 §十.2）
- 内测毕业权益发放（复用 beta-exclusive-system.md §9.1：core→终身 / active→6 月 / observer→3 月，admin 脚本批量发码 + 自动入池）

### Phase 3（增长，收入稳定后）
- 月收入 > ¥3000 → 评估注册工商户 → 迁移微信支付商户/Stripe（**仅替换 payment_adapter 实现**，接口不变）
- 面包多/Gumroad 双通道

### 兼容性保证
- 现有 v10 三表结构不变，本地数据零迁移。
- 已发激活码（若有）经 admin 脚本导入池（标记 sold）。
- 旧客户端（无真实 machine_id）激活兼容：服务端接受 `machine_id='local'` 但绑定上限按 1 台计，并在激活响应中提示升级客户端。

---

## 十、与现有系统协调

### 10.1 scheduler.ts（复习调度）
- 调度引擎（SM-2/FSRS）是**免费核心功能**，不设付费墙、不读 tier。
- 付费仅影响 AI 增强能力（如 AI 生成闪卡配额），调度本身零耦合。

### 10.2 builtinTemplates.ts（SOP 模板）
- 内置模板（费曼/番茄/错题）免费；SOP 引擎（sop_templates/sop_runs 表）不收费。
- "课程预设模板包"（¥3）是**额外模板集合**，作为内容包解锁（SND/THM 同类机制），激活后注入 user 模板（source='user'），不修改 builtin 种子逻辑。

### 10.3 ai-coding.md 规范
- 新增文件单文件 ≤300 行；全部含 `@ai-context` 双语注释（解释 Why + 边界条件）。
- 强类型：Pydantic Model（服务端）/ Interface（客户端），禁止 any/Dict 透传。
- 防御性编程：外部调用（Supabase/面包多）超时/重试/熔断/降级四件套（§5.2）。
- 测试先行：见附录 B。

---

## 十一、文件清单（新增/修改汇总）

```
新增:
  server/ai-gateway/services/supabase_adapter.py   # Supabase REST 适配层（≤200 行）
  server/ai-gateway/services/payment_adapter.py    # 面包多适配层（≤300 行）
  server/ai-gateway/routers/license_webhook.py     # webhook 端点（≤150 行）
  server/ai-gateway/tests/test_license_pool.py
  server/ai-gateway/tests/test_payment_webhook.py
  server/ai-gateway/tests/test_tier_injection.py
  server/ai-gateway/tests/test_budget_tier.py
  scripts/license-admin.mjs                        # 导入池/对账/撤销/批量发码
  client/electron/machineId.ts                     # 设备指纹（≤60 行）
  client/src/features/beta/hooks/useQuota.ts       # 配额展示 hook（≤100 行）
  server/ai-gateway/migrations/20260807_licenses.sql

修改:
  server/ai-gateway/middleware/auth.py             # JWT claims 解析 → tier 注入
  server/ai-gateway/middleware/rate_limit.py       # 注册 license_activate 限流
  server/ai-gateway/cost/budget.py                 # 费用上限按 tier
  server/ai-gateway/routers/license.py             # 验真改造 + /quota + /status
  scripts/license-gen.mjs                          # --duration 参数
  client/src/features/beta/LicenseActivation.tsx   # 到期展示/续费提醒
  client/src/features/beta/BetaProfile.tsx         # 付费状态行
  client/src/types/beta.ts                         # PaidStatus / QuotaInfo
  client/src/pages/SettingsPage.tsx                # AI 用量卡片接入
```

---

## 附录 A：环境变量汇总

| 变量 | 用途 | 必填 |
|------|------|:---:|
| `SUPABASE_URL` | 网关 Supabase REST 端点 | ✅ |
| `SUPABASE_SERVICE_KEY` | admin 操作（写 user_metadata / 查 licenses） | ✅（生产） |
| `SUPABASE_JWT_SECRET` / `SUPABASE_JWKS_URL` | JWT 验证（已有） | ✅（生产） |
| `PAYMENT_PROVIDER` | 适配层开关（mianbaoduo / mock） | ✅ |
| `PAYMENT_API_KEY` / `PAYMENT_API_SECRET` | 面包多订单查询凭证（webhook 查询确认模式用） | ✅（生产） |
| `PAYMENT_WEBHOOK_SECRET` | webhook 签名 | ✅ |
| `PAYMENT_TIMEOUT_MS` | 外部调用超时（默认 5000） | 否 |
| `PAYMENT_RETRY_COUNT` | 重试次数（默认 3） | 否 |
| `DEV_USER_IDS` | 开发者白名单（逗号分隔 user_id/邮箱）：完全豁免配额 + lifetime 身份，仅供自测 | 否 |

## 附录 B：测试策略

- **test_license_pool.py**：状态机全转换（unsold→sold→bound→revoked）；验真拒绝场景（未售/已绑定/已撤销/过期/格式非法/不存在）；激活幂等（重复激活返回原记录）；续费叠加（max(now, old) + duration）。
- **test_payment_webhook.py**：签名验证通过/失败；order_id 幂等；查询确认模式下伪造 order_id 拒绝；面包多 API 超时 → 入队降级。
- **test_tier_injection.py**：claims 解析（有 beta 无 paid / 双有 / paid 过期 → None / claims 缺失 → free）；断言 request.state 注入值。
- **test_budget_tier.py**：各 tier 费用上限生效（free ¥0.5 / pro ¥2.0 / lifetime ¥3.0）；token 上限保持全局。
- **客户端**：machineId 生成稳定且不可预测；LicenseActivation 到期展示边界（<3 天提醒 / 已过期隐藏）；resolveEffectiveTier 已有测试保持。
- 全部测试**禁止直连真实 Supabase/面包多**（mock 适配层，遵循 ai-coding.md §7 环境隔离）。

## 附录 C：明确不做的事

- ❌ 核心功能付费墙 / 广告 / 数据变现（继承收入方案红线）
- ❌ 客户端本地判定配额（服务端权威）
- ❌ 面包多深度 API 自动化（发卡/上架仍手动，单人可运维优先）
- ❌ 订阅自动扣款（当前为"购买新码再激活"模式，符合面包多能力边界）
