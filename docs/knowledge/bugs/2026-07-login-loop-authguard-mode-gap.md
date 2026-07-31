# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 登录失败后持续要求登录：AuthGuard 与"跳过登录"的模式降级缺口 + session-expired 事件风暴 |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #认证 #AuthGuard #路由守卫 #模式管理 #事件去重 #死循环 |

---

## 症状

内测反馈：**如果无法登录，会出现持续要求登录的情况**——用户被反复带回登录页，无法进入应用其他页面；session 过期时短时间弹出多个"登录已过期"提示。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| 认证 | Supabase Auth（`AuthContext` + `AuthGuard` 软守卫） |
| 模式 | `ModeManager`（local/hybrid/full，持久化 `ed_app_mode`） |
| 相关文件 | `client/src/pages/LoginPage.tsx`、`client/src/lib/auth/AuthGuard.tsx`、`client/src/hooks/useSessionExpiry.ts`、`client/src/lib/http/apiClient.ts` |

## 排查过程（按 debug-sop）

1. **分类**：逻辑错误（必现，非并发/环境）
2. **隔离**：梳理 `kb:session-expired` 的全部派发点（apiClient 401 刷新失败 × N 个并发请求 + AuthContext SIGNED_OUT）与全部消费点（useSessionExpiry）
3. **关键发现**：`AuthGuard` 包裹**全部主路由（含设置页）**，拦截条件为"云凭证有效 + 模式为 hybrid/full + 未登录"；而登录页的"跳过登录，继续使用本地功能"只是 `<Link to="/">`，**不降级模式**
4. **循环推演**：曾开启云同步的用户（模式已持久化为 hybrid/full）一旦登不上 → 点"跳过登录"回首页 → AuthGuard 立即踢回 `/login` → 死循环；且切回本地模式的唯一入口（设置页）也被 AuthGuard 拦截，用户无法自救

## 根因

1. **模式降级缺口**（主因）："跳过登录"承诺了本地功能，却没有执行 `modeManager.setMode('local')`；模式持久化后不存在任何"未登录可达"的降级出口，与 AuthGuard 的拦截条件形成闭环
2. **事件无去重**（放大因素）：session 过期瞬间，多个并发 401 请求与 SIGNED_OUT 各自派发 `kb:session-expired`，`useSessionExpiry` 只防重复跳转、不防重复 Toast，用户感知为"持续要求登录"

## 修复方案

1. `LoginPage.handleSkipLogin`：跳过登录改为先 `modeManager.setMode('local')` 再 `navigate('/', { replace: true })`，打断闭环
2. `useSessionExpiry`：增加 5s 冷却窗口（`lastHandledAtRef`），窗口内的重复事件直接忽略
3. 回归测试：`LoginPage.test.tsx`（跳过登录必须降级模式）、`useSessionExpiry.test.ts`（事件风暴只弹一次 Toast / 冷却后允许再提示）

## 教训

- **守卫类逻辑必须验证"逃生通道"**：任何强制重定向（AuthGuard）都要保证存在一条未满足条件用户可达的退出路径，否则持久化状态会把用户锁死
- **提供"跳过/降级"入口时，入口必须真正改变判定条件**，而不是仅做一次导航——否则守卫下一帧就会再次触发
- **全局事件（如 session-expired）的消费端必须做时间窗去重**：派发端天然多源（N 个并发请求 + auth 状态机），不能假设只派发一次
- 排查此类"循环弹窗/循环跳转"问题时，先画出**状态判定条件 × 状态修改入口**矩阵，检查是否存在"条件成立后所有修改入口都不可达"的死锁组合

## 相关提交

- fix: 登录失败/跳过登录死循环 + session-expired 事件风暴去重（待提交）
