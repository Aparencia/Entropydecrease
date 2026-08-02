# 熵减内测人员专属系统设计方案

> **定位**：将内测运营从"微信群 + 手动发包"升级为**产品内闭环**——身份识别、专属权益、反馈收集、贡献激励、更新分发全部在应用内完成。
> **设计原则**：单人可运维、本地优先、渐进式（Phase 0 零开发即可启动，后续逐步自动化）
> **关联文档**：[收入方案](./revenue-plan-no-license.md) · [分层管理](./beta-tier-management.md) · [内测协议](./beta-agreement.md) · [运营手册](./beta-recruitment-playbook.md)
> **最后更新**：2026-08

---

## 一、系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端（Electron + React）                 │
├──────────┬──────────┬───────────┬───────────┬───────────────────┤
│ 身份标识  │ 专属权益  │ 反馈中心   │ 贡献面板   │ 内测更新通道      │
│ BetaBadge│ BetaPerks│ FeedbackHub│ ContribBoard│ BetaChannel     │
└────┬─────┴────┬─────┴─────┬─────┴─────┬─────┴────────┬──────────┘
     │          │           │           │              │
     ▼          ▼           ▼           ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase（Auth + Database）                    │
│  user_metadata.beta_tier / beta_profiles / feedbacks /           │
│  contributions / beta_releases                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AI 网关（FastAPI）                              │
│  middleware/auth.py → 识别 beta 身份 → 分级配额                   │
│  routers/beta.py → 反馈接口 / 贡献查询 / 激活码发放               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、身份标识系统（Beta Identity）

### 2.1 数据模型

**Supabase `user_metadata` 扩展**（零建表，利用现有 Auth）：

```jsonc
// Supabase auth.users.raw_user_meta_data
{
  "display_name": "潜航员A",
  "beta": {
    "tier": "core",           // "core" | "active" | "observer"
    "joined_at": "2026-07-15",
    "cohort": 1,              // 第几批内测
    "invite_code": "BETA-C1-XXXX",  // 内测准入码
    "lifetime_pro": true,     // 早鸟终身 Pro 标记
    "badges": ["founder", "bug-hunter", "feedback-star-202607"]
  }
}
```

**本地缓存**（`client/electron/db/schema.ts` 新增表）：

```sql
CREATE TABLE IF NOT EXISTS beta_profile (
  user_id       TEXT PRIMARY KEY,
  tier          TEXT NOT NULL DEFAULT 'active',  -- core/active/observer
  cohort        INTEGER NOT NULL DEFAULT 1,
  joined_at     TEXT NOT NULL,
  lifetime_pro  INTEGER NOT NULL DEFAULT 0,
  badges        TEXT NOT NULL DEFAULT '[]',      -- JSON array
  perks_config  TEXT NOT NULL DEFAULT '{}',      -- JSON: 权益快照
  synced_at     TEXT                             -- 上次同步时间
);
```

### 2.2 身份注入流程

```
用户登录（Supabase Auth）
  → AuthContext 读取 user_metadata.beta
  → 写入本地 beta_profile 表（离线缓存）
  → AI 网关请求 Header 附带 X-Beta-Tier: core
  → auth.py 中间件解析 JWT claims 中的 beta 字段
  → request.state.beta_tier = "core"
```

### 2.3 准入机制

| 方式 | 场景 | 实现 |
|------|------|------|
| **内测准入码** | 招募筛选通过后发放 | 格式 `BETA-C{cohort}-{XXXX}`，一次性使用，绑定 user_id |
| **开发者手动标记** | 首批种子用户 | 直接在 Supabase Dashboard 修改 user_metadata |
| **邀请码裂变** | 二批增长 | 核心层用户获得 2 个邀请码，被邀请者自动继承 beta 身份 |

---

## 三、专属权益引擎（Beta Perks）

### 3.1 权益矩阵

| 权益维度 | 普通用户（未来） | 内测·观察层 | 内测·活跃层 | 内测·核心层 |
|----------|:---:|:---:|:---:|:---:|
| AI 每日调用次数 | 15 | 50 | 80 | 120 |
| AI 每日费用上限 | ¥0.5 | ¥1.5 | ¥2.0 | ¥3.0 |
| 可用模型 | GLM-4-Flash | + Qwen-Plus | + DeepSeek | + 全部（含多模态） |
| 多模态课堂助手 | ❌ | ❌ | ✅ | ✅ |
| 新功能抢先体验 | ❌ | ❌ | ✅（提前 3 天） | ✅（提前 5 天） |
| 专属主题/音效 | ❌ | ❌ | ✅ | ✅ |
| 路线图投票权 | ❌ | ❌ | ❌ | ✅ |
| 更新日志署名 | ❌ | 被采纳时 | 被采纳时 | 每次版本 |
| 正式版权益 | — | 3 个月 Pro | 6 个月 Pro | 终身 Pro |

### 3.2 技术实现（复用现有中间件）

**`rate_limit.py` 改造**（增量极小）：

```python
# 现有：固定阈值
FEATURE_LIMITS = {"socratic": 10, "flashcard_gen": 20, ...}
DAILY_LIMIT = 50

# 改造：按 beta_tier 查表
TIER_LIMITS = {
    "free":     {"daily": 15, "cost": 0.5},
    "observer": {"daily": 50, "cost": 1.5},
    "active":   {"daily": 80, "cost": 2.0},
    "core":     {"daily": 120, "cost": 3.0},
    "pro":      {"daily": 80, "cost": 2.0},  # 正式付费 Pro
}

def _get_limits(self, beta_tier: str) -> dict:
    return TIER_LIMITS.get(beta_tier, TIER_LIMITS["free"])
```

**`providers.py` 改造**（模型路由按 tier）：

```python
# 在 get_provider_for_feature 中增加 tier 参数
def get_provider_for_feature(feature: str, beta_tier: str = "free"):
    # free/observer → 仅 GLM-4-Flash
    # active → GLM-4-Flash + Qwen-Plus + DeepSeek
    # core/pro → 全部模型（含 Qwen-VL 多模态）
    ...
```

### 3.3 权益感知 UI

- **设置页 → 内测身份卡片**：显示当前层级、加入时间、徽章、权益摘要
- **AI 配额耗尽提示**：区分"内测额度"与"正式额度"话术
  - 内测用户："今日内测专属额度已用完（80/80），明天恢复。你的反馈让产品更好 🪼"
  - 普通用户："今日免费额度已用完，升级 Pro 或明天再来"
- **新功能标记**：抢先体验功能带 `🧪 内测专属` 角标

---

## 四、应用内反馈中心（Feedback Hub）

### 4.1 功能设计

取代"微信群里说一嘴"的低效模式，结构化收集反馈：

| 反馈类型 | 表单字段 | 自动附带上下文 |
|----------|----------|---------------|
| 🐛 Bug 报告 | 标题 + 复现步骤 + 期望行为 + 严重程度 | 应用版本、OS、最近 5 条操作日志、崩溃堆栈（如有） |
| 💡 功能建议 | 标题 + 场景描述 + 期望效果 | 当前使用模块、使用频次统计 |
| 📝 使用感受 | 自由文本（≤500 字）+ 情绪标签 | 使用时长、本次会话摘要 |
| 📸 截图标注 | 截图 + 画笔标注 + 说明文字 | 自动截取当前窗口 |

### 4.2 交互流程

```
用户点击侧边栏「反馈」按钮（或 Ctrl+Shift+F 快捷键）
  → 弹出 FeedbackHub 面板（右侧滑出，不离开当前页面）
  → 选择反馈类型 → 填写表单
  → [可选] 自动附带诊断信息（版本/OS/最近操作）
  → 提交
  → 本地立即存入 feedbacks 表（离线可用）
  → 联网时同步至 Supabase / AI 网关
  → 开发者处理后状态变更 → 推送通知到用户（应用内 badge）
```

### 4.3 数据模型

**Supabase 表 `beta_feedbacks`**：

```sql
CREATE TABLE beta_feedbacks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  type        TEXT NOT NULL,          -- bug / feature / feeling
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT,                   -- critical / major / minor / trivial
  module      TEXT,                   -- pomodoro / notes / flashcard / feynman / classroom / ...
  status      TEXT DEFAULT 'pending', -- pending / acknowledged / planned / done / wontfix
  dev_note    TEXT,                   -- 开发者回复
  screenshot  TEXT,                   -- OSS URL（可选）
  context     JSONB,                  -- 自动采集的上下文
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

**本地表 `feedbacks`**（离线优先）：

```sql
CREATE TABLE IF NOT EXISTS feedbacks (
  id          TEXT PRIMARY KEY,       -- 本地 UUID
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  severity    TEXT,
  module      TEXT,
  status      TEXT DEFAULT 'pending',
  dev_note    TEXT,
  context     TEXT,                   -- JSON
  created_at  TEXT NOT NULL,
  synced      INTEGER DEFAULT 0      -- 0=待同步 1=已同步
);
```

### 4.4 反馈闭环通知

- 开发者在 Supabase Dashboard（或简易管理页）更新 status + dev_note
- 客户端轮询（每 6 小时）或 WebSocket 推送状态变更
- 应用内通知："你的反馈「课堂助手笔记丢失公式」已被采纳，将在 v0.28.0 修复 🎉"
- 对应[协议承诺](./beta-agreement.md)：48 小时内回应处理状态

---

## 五、贡献追踪与激励系统（Contribution & Recognition）

### 5.1 贡献积分规则

| 行为 | 积分 | 说明 |
|------|:---:|------|
| 提交 Bug（被确认有效） | +10 | 与协议"质量奖励"联动 |
| 提交功能建议（被采纳） | +15 | 状态变为 planned/done 时计分 |
| 提交使用感受 | +3 | 鼓励轻量反馈 |
| 接受深度访谈 | +20 | 开发者手动标记 |
| 邀请新内测用户（活跃满 2 周） | +10 | 链式增长激励 |
| 连续 4 周达成基本要求 | +5 | 留存奖励 |
| 发现安全漏洞 | +30 | 高质量贡献 |

### 5.2 徽章体系

| 徽章 | 获取条件 | 视觉 |
|------|----------|------|
| 🪼 创始潜航员 | 第 1 批内测用户 | 深海蓝底 + 水母轮廓 |
| 🐛 捉虫达人 | 累计 5 个有效 Bug | 琥珀金甲虫 |
| 💡 灵感灯塔 | 累计 3 条被采纳建议 | 赛博青灯泡 |
| 🔥 连续深潜 | 连续 30 天使用 | 苔藓绿火焰 |
| 🌟 反馈之星 | 月度评选 | 月度限定，金色星 |
| 🎓 出师 | 完成首潜引导全部步骤 | 手册卡组毕业 |
| 🤝 布道者 | 成功邀请 3 人 | 双色握手 |

### 5.3 贡献面板 UI

**入口**：设置页 → "我的内测" 标签页

```
┌─────────────────────────────────────────────┐
│  🪼 创始潜航员 · 核心共创层 · 第 1 批         │
│  加入时间：2026-07-15 · 积分：185            │
├─────────────────────────────────────────────┤
│  徽章墙：[🪼] [🐛] [💡] [🔥] [🌟×2]        │
├─────────────────────────────────────────────┤
│  贡献统计                                    │
│  ├─ 有效 Bug：7 个                          │
│  ├─ 被采纳建议：4 条                         │
│  ├─ 反馈总数：23 条                          │
│  └─ 使用天数：18 天                          │
├─────────────────────────────────────────────┤
│  我的反馈（最近 5 条 + 状态）                  │
│  ├─ ✅ 课堂助手公式丢失 → 已修复 v0.27.1     │
│  ├─ 🔄 闪卡批量导入 → 规划中                 │
│  └─ ⏳ 深色模式闪烁 → 待确认                  │
├─────────────────────────────────────────────┤
│  正式版权益：终身 Pro（早鸟）                  │
└─────────────────────────────────────────────┘
```

### 5.4 数据模型

**Supabase 表 `beta_contributions`**：

```sql
CREATE TABLE beta_contributions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  type        TEXT NOT NULL,     -- bug / feature / feeling / interview / invite / streak / security
  points      INTEGER NOT NULL,
  ref_id      UUID,             -- 关联 feedback id（如有）
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE beta_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  badge_key   TEXT NOT NULL,    -- founder / bug-hunter / idea-lighthouse / ...
  earned_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_key)
);
```

---

## 六、内测更新通道（Beta Channel）

### 6.1 分发架构

```
electron-builder.yml:
  publish:
    - provider: generic
      url: https://cdn.entropydecrease.com/releases
      channel: latest          # 正式通道

  # 内测通道（独立 channel）
  - provider: generic
    url: https://cdn.entropydecrease.com/releases/beta
    channel: beta              # 内测通道
```

### 6.2 客户端通道切换逻辑

```typescript
// updater.ts 增强
function getUpdateChannel(): string {
  const betaProfile = db.getBetaProfile(currentUserId);
  if (betaProfile && betaProfile.tier) {
    return 'beta';  // 内测用户自动走 beta 通道
  }
  return 'latest';  // 普通用户走正式通道
}

// 核心层额外能力：可选安装 "nightly" 通道（开发者手动发包）
```

### 6.3 版本标记与更新提示

- 内测版本命名：`v0.27.0-beta.1`、`v0.27.0-beta.2`
- 更新提示区分话术：
  - 内测用户："🧪 内测新版 v0.27.0-beta.2 可用！本次重点：课堂助手公式识别优化。帮你测试一下？"
  - 附带"本次希望重点测试"清单（来自 `beta_releases` 表）

### 6.4 数据模型

**Supabase 表 `beta_releases`**：

```sql
CREATE TABLE beta_releases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT NOT NULL,          -- "0.27.0-beta.2"
  channel       TEXT DEFAULT 'beta',    -- beta / nightly
  release_notes TEXT NOT NULL,          -- Markdown 更新日志
  focus_areas   TEXT,                   -- 希望重点测试的方向
  download_url  TEXT,                   -- 安装包直链（备份通道）
  published_at  TIMESTAMPTZ DEFAULT now(),
  is_latest     BOOLEAN DEFAULT true
);
```

---

## 七、开发者管理面板（Admin Lite）

### 7.1 设计原则

- **不单独建后台系统**——单人开发者用 Supabase Dashboard + 轻量脚本即可
- 高频操作封装为 CLI 脚本（`scripts/beta-admin.mjs`）

### 7.2 管理操作清单

| 操作 | 实现方式 | 频率 |
|------|----------|------|
| 添加内测用户 | 脚本：生成准入码 + 更新 user_metadata | 按需 |
| 调整用户层级 | 脚本：更新 beta.tier + 同步配额 | 每两周 |
| 发放徽章 | 脚本：插入 beta_badges | 按需 |
| 处理反馈 | Supabase Dashboard 直接改 status/dev_note | 每日 |
| 发布内测版本 | CI/CD（`release.yml`）+ 更新 beta_releases | 每 1~2 周 |
| 查看贡献排行 | SQL 视图 / 脚本输出 | 每月 |
| 批量发送通知 | 脚本：写入 notifications 表 → 客户端拉取 | 按需 |

### 7.3 CLI 脚本示例

```bash
# 添加内测用户
node scripts/beta-admin.mjs add --email user@example.com --cohort 2 --tier active

# 提升层级
node scripts/beta-admin.mjs promote --email user@example.com --tier core

# 发放徽章
node scripts/beta-admin.mjs badge --email user@example.com --badge bug-hunter

# 查看贡献排行
node scripts/beta-admin.mjs leaderboard --top 10

# 发布内测版本
node scripts/beta-admin.mjs release --version 0.27.0-beta.2 --notes "课堂助手优化" --focus "公式识别"
```

---

## 八、通知与触达系统

### 8.1 应用内通知（替代群消息）

**本地表 `notifications`**：

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,   -- feedback_reply / badge_earned / new_release / perk_update / system
  title       TEXT NOT NULL,
  body        TEXT,
  read        INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);
```

**通知场景**：

| 触发事件 | 通知内容 | 类型 |
|----------|----------|------|
| 反馈被回复 | "你的反馈「XX」开发者已回复：已采纳，计划 v0.28 修复" | feedback_reply |
| 获得新徽章 | "恭喜获得「🐛 捉虫达人」徽章！" | badge_earned |
| 内测新版可用 | "🧪 v0.27.0-beta.2 已发布，重点测试：XX" | new_release |
| 层级变更 | "你已升级为核心共创层！新增权益：路线图投票权…" | perk_update |
| 周报推送 | "本周改进：修复 3 个 Bug，优化课堂助手公式识别" | system |

### 8.2 触达节奏（对齐分层管理）

| 层级 | 应用内通知 | 微信触达 | 频率 |
|------|:---:|:---:|------|
| 核心层 | 全部 | 一对一深聊 | 新版本即时 + 每周 |
| 活跃层 | 全部 | 大群周报 | 每周 |
| 观察层 | 仅 new_release | 隔周轻量回访 | 每两周 |

---

## 九、与收入系统的衔接

### 9.1 内测 → 正式版的身份迁移

```
内测结束（公测/正式版发布）
  → 内测用户身份永久保留（beta.joined_at 不删除）
  → 按层级发放正式版权益：
      核心层 → 终身 Pro（ENTROPY-LIFE-XXXX）
      活跃层 → 6 个月 Pro（ENTROPY-PRO-XXXX）
      观察层 → 3 个月 Pro（ENTROPY-PRO-XXXX）
  → 激活码自动写入本地 + 应用内通知
  → 徽章永久保留，贡献面板继续可见
```

### 9.2 早鸟预售联动

- 早鸟 ¥199 终身 Pro 购买者 → 自动标记 `beta.lifetime_pro = true`
- 内测期间即享核心层 AI 配额（即使不是"核心共创层"）
- 正式版发布后 → 激活码自动生效，无需二次操作

### 9.3 tier 优先级规则

```python
def resolve_effective_tier(user) -> str:
    """当用户同时具有 beta 身份和付费身份时，取较高者"""
    beta_tier = user.metadata.get("beta", {}).get("tier")  # core/active/observer
    paid_tier = user.metadata.get("paid_tier")              # pro/lifetime
    
    TIER_RANK = {"free": 0, "observer": 1, "active": 2, "pro": 3, "core": 4, "lifetime": 5}
    
    effective = max(
        TIER_RANK.get(beta_tier, 0),
        TIER_RANK.get(paid_tier, 0),
        key=lambda x: x
    )
    return RANK_TO_TIER[effective]
```

---

## 十、分阶段实施路线

### Phase 0：零开发启动（当前即可）

| 动作 | 工具 | 产出 |
|------|------|------|
| Supabase Dashboard 手动标记首批用户 beta metadata | Supabase Studio | 身份数据就绪 |
| AI 网关 `rate_limit.py` 增加 beta_tier 查表（~20 行） | 代码改动 | 配额分级生效 |
| 微信群 + 腾讯文档维持反馈收集（现有方式） | 无开发 | 过渡期运转 |
| 准入码手动生成（UUID 脚本） | `scripts/beta-admin.mjs` 初版 | 准入可控 |

**工作量**：~1 天

### Phase 1：反馈中心 + 身份 UI（2~3 周）

| 任务 | 涉及模块 | 工作量 |
|------|----------|--------|
| 本地 `feedbacks` 表 + `beta_profile` 表 | `client/electron/db/schema.ts` | 0.5d |
| FeedbackHub 组件（侧滑面板） | `client/src/features/beta/FeedbackHub.tsx` | 2d |
| 截图标注（canvas 画笔） | `client/src/features/beta/ScreenshotAnnotator.tsx` | 1.5d |
| 反馈提交 → 本地存储 → 联网同步 | `client/src/features/beta/feedbackService.ts` | 1d |
| AI 网关 `routers/beta.py`（反馈接收 + 状态查询） | `server/ai-gateway/routers/beta.py` | 1d |
| 设置页"我的内测"身份卡片 | `client/src/pages/settings/BetaProfile.tsx` | 1d |
| Supabase 建表（beta_feedbacks / beta_contributions / beta_badges） | SQL migration | 0.5d |

**工作量**：~7.5 天

### Phase 2：贡献系统 + 通知 + 更新通道（3~4 周）

| 任务 | 涉及模块 | 工作量 |
|------|----------|--------|
| 贡献积分引擎（服务端计分 + 本地缓存） | `routers/beta.py` 扩展 | 1.5d |
| 徽章系统（判定规则 + 发放 + UI 徽章墙） | `features/beta/BadgeWall.tsx` | 2d |
| 贡献面板 UI | `features/beta/ContributionBoard.tsx` | 1.5d |
| 应用内通知系统（本地表 + 通知中心 UI + 轮询） | `features/notifications/` | 2d |
| 内测更新通道（updater.ts channel 切换 + beta_releases 表） | `electron/updater.ts` | 1d |
| 内测版本更新提示（含 focus_areas 展示） | `components/BetaUpdateDialog.tsx` | 1d |
| `beta-admin.mjs` CLI 完善（promote/badge/release/leaderboard） | `scripts/` | 1.5d |

**工作量**：~10.5 天

### Phase 3：增长与自动化（正式版前）

| 任务 | 说明 |
|------|------|
| 邀请码裂变系统 | 核心层用户获得邀请码，被邀请者自动继承 beta 身份 |
| 反馈 → GitHub Issue 自动同步 | 开发者确认后自动创建 Issue（可选） |
| 周报自动生成脚本 | 聚合本周反馈/修复/贡献数据 → Markdown → 群发 |
| 内测毕业仪式 | 正式版发布时触发：总结贡献、颁发证书、发放权益码 |

---

## 十一、隐私与安全

| 原则 | 实现 |
|------|------|
| 反馈内容不含笔记原文 | 自动上下文仅采集操作日志（模块名+动作），不采集用户内容 |
| 截图由用户主动触发 | 不自动截屏，用户确认后才附带 |
| 分层数据不对外暴露 | 用户只能看到自己的层级，不可查询他人 |
| 退出即清除 | 用户退出内测 → 7 天内删除 Supabase 中个人关联数据（对齐协议第五条） |
| 本地优先 | 反馈/通知离线可写，联网同步；断网不影响任何功能 |

---

## 十二、文件结构规划

```
client/src/features/beta/
├── FeedbackHub.tsx          # 反馈中心主面板（≤300 行）
├── FeedbackForm.tsx         # 反馈表单（按类型切换）
├── ScreenshotAnnotator.tsx  # 截图标注画布
├── BetaProfile.tsx          # 内测身份卡片（设置页嵌入）
├── BadgeWall.tsx            # 徽章墙
├── ContributionBoard.tsx    # 贡献面板
├── BetaUpdateDialog.tsx     # 内测版更新提示
├── feedbackService.ts       # 反馈 CRUD + 同步逻辑
├── betaStore.ts             # Zustand store（身份/积分/通知）
└── types.ts                 # 类型定义

server/ai-gateway/routers/
└── beta.py                  # 内测专属 API（反馈/贡献/通知）

scripts/
└── beta-admin.mjs           # 开发者管理 CLI
```

---

## 附录：与现有文档的关系

| 现有文档 | 本系统如何承接 |
|----------|---------------|
| [内测协议](./beta-agreement.md) §1 权益 | → 权益引擎（§三）自动化兑现 |
| [内测协议](./beta-agreement.md) §2 反馈要求 | → 反馈中心（§四）降低提交门槛 |
| [分层管理](./beta-tier-management.md) 三层结构 | → 身份标识（§二）的 tier 字段 |
| [运营手册](./beta-recruitment-playbook.md) §6.1 反馈闭环 | → 通知系统（§八）实现"每条反馈必有回音" |
| [运营手册](./beta-recruitment-playbook.md) §6.2 版本管理 | → 更新通道（§六）自动化分发 |
| [收入方案](./revenue-plan-no-license.md) 激活码 | → 正式版权益发放（§九）自动衔接 |
