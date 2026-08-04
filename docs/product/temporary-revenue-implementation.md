# 熵减临时收入方案实施设计

> **定位**：基于无工商户约束的临时收入方案，整合内测邀请系统与付费机制
> **关联文档**：[收入方案（无工商户版）](./revenue-plan-no-license.md) · [内测专属系统](./beta-exclusive-system.md) · [内测协议](./beta-agreement.md)
> **最后更新**：2026-08

---

## 一、收入模型总览

```
┌───────────────────────────────────────────────────────────────┐
│  第三层：数字内容包（一次性购买）                                │
│  音效包 / 主题皮肤 / 课程预设模板                                │
│  → 面包多自动发卡 → 激活码本地激活                               │
├───────────────────────────────────────────────────────────────┤
│  第二层：AI Pro 订阅（月/季/年）                                │
│  ¥12/月 或 ¥99/年                                              │
│  → 面包多/Gumroad 发卡 → 激活码验证 → 本地缓存                  │
├───────────────────────────────────────────────────────────────┤
│  第一层：免费层（永久免费）                                      │
│  全部核心学习功能 + 基础 AI（15次/天）                           │
│  + BYOK（自带 API Key 完全不受限）                              │
├───────────────────────────────────────────────────────────────┤
│  0层：内测邀请裂变                                               │
│  核心层→2个邀请码 → 被邀请者自动继承 beta 身份 → 早鸟权益       │
└───────────────────────────────────────────────────────────────┘
```

### 核心原则
- **本地优先**：核心学习功能永不收费，离线可用不受影响
- **可选增强**：付费仅提升 AI 体验上限，不解锁功能锁
- **渐进过渡**：免费→付费平滑，不设强制付费墙
- **合规先行**：通过面包多/Gumroad 平台代扣代缴个税，无需工商户

---

## 二、Tier 层级体系

### 2.1 层级定义

| Tier | 标识 | 说明 | 来源 |
|------|------|------|------|
| `free` | 免费用户 | 默认值，核心功能全开 | 注册即得 |
| `observer` | 内测观察层 | 内测用户，基础权益 | 准入码/邀请码 |
| `active` | 内测活跃层 | 较高 AI 配额，多模态 | 贡献升级 |
| `core` | 内测核心层 | 最高配额，路线图投票权 | 贡献升级 |
| `pro` | 付费 Pro | 订阅用户，80次/天 | 激活码 |
| `lifetime` | 终身 Pro | 早鸟/终身用户 | 激活码 |

### 2.2 权益矩阵

| 维度 | free | observer | active | core | pro | lifetime |
|------|:---:|:--------:|:------:|:----:|:---:|:--------:|
| 每日 AI 调用 | 15 | 50 | 80 | 120 | 80 | 120 |
| 日费用上限 | ¥0.5 | ¥1.5 | ¥2.0 | ¥3.0 | ¥2.0 | ¥3.0 |
| 可用模型 | 基础 | + Qwen-Plus | + DeepSeek | 全部 | + DeepSeek | 全部 |
| 多模态 | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| 新功能抢先 | ❌ | ❌ | 提前3天 | 提前5天 | ❌ | ✅ |
| 正式版权益 | — | 3月Pro | 6月Pro | 终身Pro | — | 终身 |

### 2.3 Tier 优先级解析

```typescript
const TIER_RANK: Record<string, number> = {
  free: 0, observer: 1, active: 2, pro: 3, core: 4, lifetime: 5,
};

function resolveEffectiveTier(betaTier?: string, paidTier?: string): string {
  const beta = TIER_RANK[betaTier ?? 'free'] ?? 0;
  const paid = TIER_RANK[paidTier ?? 'free'] ?? 0;
  const effective = Math.max(beta, paid);
  return Object.entries(TIER_RANK).find(([, v]) => v === effective)?.[0] ?? 'free';
}
```

---

## 三、数据库设计

### 3.1 本地 SQLite 新增表

```sql
-- beta_profile: 内测身份本地缓存
CREATE TABLE IF NOT EXISTS beta_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'observer',
  cohort INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL,
  lifetime_pro INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '[]',
  perks_config TEXT NOT NULL DEFAULT '{}',
  synced_at TEXT
);

-- licenses: 激活码本地缓存
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,        -- pro / lifetime / snd1 / thm1
  tier TEXT NOT NULL,        -- pro / lifetime
  status TEXT NOT NULL DEFAULT 'active',  -- active / expired / revoked
  machine_id TEXT,
  activated_at TEXT,
  expires_at TEXT,
  synced_at TEXT
);

-- invite_codes: 邀请码本地缓存
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  issuer_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / used / expired
  used_by_user_id TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL
);
```

### 3.2 Supabase 对应表（可选，联网时同步）

```sql
-- Supabase: beta_profiles
CREATE TABLE beta_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  tier TEXT NOT NULL DEFAULT 'observer',
  cohort INTEGER DEFAULT 1,
  joined_at TIMESTAMPTZ DEFAULT now(),
  lifetime_pro BOOLEAN DEFAULT false,
  badges TEXT[] DEFAULT '{}',
  perks_config JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Supabase: licenses
CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT DEFAULT 'unused',
  machine_id TEXT,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Supabase: invite_codes
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  issuer_user_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending',
  used_by_user_id UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 四、激活码系统

### 4.1 激活码格式

```
ENTROPY-{TYPE}-{XXXX}-{XXXX}
TYPE: PRO(订阅) / LIFE(终身) / SND1(音效包) / THM1(主题包)
示例: ENTROPY-PRO-8K2M-Q7XN
```

### 4.2 验证流程

```
1. 用户输入激活码 → 客户端校验格式
2. 调 AI 网关 /api/v1/license/activate
3. 服务端校验签名 + 类型 + 有效期 + 设备绑定
4. 写入本地 SQLite（离线缓存，7天宽限）
5. 更新 user.tier 为对应层级
6. 到期前3天温和提醒续费
```

### 4.3 离线宽限策略

- 激活码首次验证需联网
- 验证成功后本地缓存 7 天（`licenses` 表）
- 7 天内断网不影响已激活权益
- 超过 7 天离线 → 降级为 free 层，但核心功能不受影响

---

## 五、邀请码裂变系统

### 5.1 流程

```
核心层用户
  → 在设置页「我的内测」面板查看邀请码（2个）
  → 复制邀请码 / 分享给朋友
  → 新用户在设置页输入邀请码
  → 客户端调 /api/v1/beta/use-invite
  → 服务端校验 + 标记已用
  → 被邀请者 beta.tier = 'observer'
  → 邀请者贡献积分 +10（被邀请者活跃满2周时）
```

### 5.2 邀请码生成

```typescript
function generateInviteCode(issuerId: string): string {
  // 格式: INVITE-{prefix}-{random}
  const prefix = issuerId.slice(0, 4).toUpperCase();
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `INVITE-${prefix}-${random}`;
}
```

---

## 六、UI 实现规划

### 6.1 设置页新增面板

| 面板 | 位置 | 功能 |
|------|------|------|
| **内测身份卡片** | 设置页顶部 Region | 显示 tier、加入时间、徽章、权益摘要 |
| **邀请码管理** | 内测身份卡片内 | 核心层查看/复制邀请码 |
| **激活码输入** | 设置页「AI 设置」区 | 输入激活码升级 Pro |
| **升级引导** | AI 配额耗尽时 | 温和提示升级（非阻断） |

### 6.2 文件结构

```
client/src/features/beta/
├── BetaProfile.tsx          # 内测身份卡片（设置页嵌入）
├── InviteCodeSection.tsx    # 邀请码管理
├── LicenseActivation.tsx    # 激活码输入
├── UpgradePrompt.tsx        # 升级引导
├── betaStore.ts             # Zustand store（身份/积分/通知）
├── types.ts                 # 类型定义
└── hooks/
    ├── useBetaProfile.ts    # 内测身份 hook
    ├── useLicense.ts        # 激活码 hook
    └── useTierAccess.ts     # 权限控制 hook
```

---

## 七、分阶段实施路线

### Phase 1：数据库 + 核心类型（当前 ~ 1天）

| 动作 | 涉及文件 |
|------|----------|
| schema.ts 新增 beta_profile/licenses/invite_codes 表 | `client/electron/db/schema.ts` |
| dbIpcHandlers.ts 新增白名单 | `client/electron/db/dbIpcHandlers.ts` |
| 新增 types/beta.ts 类型定义 | `client/src/types/beta.ts` |
| AI 网关 tier 分级配置 | `server/ai-gateway/config/limits.py` |

### Phase 2：UI 实现（当前 ~ 2天）

| 动作 | 涉及文件 |
|------|----------|
| BetaProfile 内测身份卡片 | `client/src/features/beta/BetaProfile.tsx` |
| InviteCodeSection 邀请码管理 | `client/src/features/beta/InviteCodeSection.tsx` |
| LicenseActivation 激活码输入 | `client/src/features/beta/LicenseActivation.tsx` |
| UpgradePrompt 升级引导 | `client/src/features/beta/UpgradePrompt.tsx` |
| betaStore Zustand store | `client/src/features/beta/betaStore.ts` |
| SettingsPage 集成 | `client/src/pages/SettingsPage.tsx` |

### Phase 3：AI 网关集成（当前 ~ 1天）

| 动作 | 涉及文件 |
|------|----------|
| rate_limit.py 按 tier 分级 | `server/ai-gateway/middleware/rate_limit.py` |
| providers.py 按 tier 路由 | `server/ai-gateway/config/providers.py` |
| 新增 license 激活路由 | `server/ai-gateway/routers/license.py` |
| 新增 beta 邀请路由 | `server/ai-gateway/routers/beta.py` |