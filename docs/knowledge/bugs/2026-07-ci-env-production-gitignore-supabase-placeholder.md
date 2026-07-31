# 知识卡片 · 踩坑记录

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | `.env.production` 被 gitignore 致 CI 安装包 Supabase/同步/AI 网关地址全为空，用户见「云服务尚未配置」 |
| 日期 | 2026-07-31 |
| 类型 | 踩坑记录 |
| 标签 | #CI #环境变量 #Vite #Supabase #GitHubActions #发布 #安装包 |

---

## 症状

内测用户使用 CI（GitHub Actions `release.yml`）打包的 Windows 安装包，在注册/登录页提交时报错：

```
云服务尚未配置，请先在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
```

关键陷阱：**本地打包的安装包完全正常，只有 CI 产物必现**——本地开发机上存在 `.env.production`，问题只在 CI 环境暴露。且连带影响不止 Supabase：CI 产物中 `VITE_API_BASE_URL`、`VITE_AI_GATEWAY_URL` 同样为空（`build-config.json` 生成空值），意味着**云同步与云端 AI 网关整体失效**，只是 Supabase 报错最先被用户看到。

## 环境

| 项目 | 版本/信息 |
|------|----------|
| CI | GitHub Actions（windows-latest 打包） |
| 构建 | Vite 8 + electron-builder，`npm run electron:build` |
| 相关文件 | `.gitignore`、`client/.env.production`、`client/vite.config.ts`、`client/src/lib/auth/supabaseClient.ts`、`.github/workflows/release.yml` |

## 排查过程（5 Whys）

1. 为什么报错？→ `AuthContext.tsx` 中 `signUp/signIn` 检测到 `isPlaceholder === true`
2. 为什么是占位符？→ `supabaseClient.ts` 在**构建时**读取 `import.meta.env.VITE_SUPABASE_URL`，缺失则回落到 `'https://your-project.supabase.co'`
3. 为什么构建时缺失？→ CI checkout 的工作区里没有 `client/.env.production`
4. 为什么没有？→ `git check-ignore -v` 显示根 `.gitignore:37` 的 `.env.production` 规则将其忽略，该文件**从未入库**
5. 为什么没兜底？→ `release.yml` 的 Build 步骤也未通过 secrets 注入任何 `VITE_*` 变量

→ **根因：渲染进程环境变量的唯一来源（`.env.production`）被 gitignore，CI 打包环境无任何 `VITE_*` 注入渠道，且构建全程静默通过。**

## 根因

- Vite 在构建时将 `import.meta.env.VITE_*` **静态替换**进渲染包；`.env.production` 缺失时不报错，直接替换为 `undefined`，代码回落到占位符默认值
- 主进程侧 `electronBuildConfigPlugin` 生成的 `build-config.json` 同样写入空字符串，同样静默
- 本地正常 / CI 异常的经典「环境差异」问题：gitignore 的文件只存在于开发机

## 解决方案

1. **提交 `client/.env.production` 入库**：根 `.gitignore` 添加 `!client/.env.production` 例外。安全性评估：文件内全部为公开值——Supabase anon key 是 `sb_publishable_` 前缀的前端公开密钥（本就烘焙进每个安装包分发，由 RLS 保护），其余为公网 URL
2. **构建期防护**：`vite.config.ts` 的 `electronBuildConfigPlugin` 中校验 `VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_API_BASE_URL / VITE_AI_GATEWAY_URL`，缺失或含占位符时 `throw`，让 CI 构建**红灯失败**而非产出静默残废包

验证：正向构建通过且渲染产物中含真实 Supabase 域名；负向测试（临时移走两个 env 文件）构建以 exit 1 终止并输出 `[electron-build-config] 缺少必需环境变量: ...`。

## 教训

- **下次如何避免**：任何「构建时烘焙」的配置文件若被 gitignore，CI 产物必然缺失。新增 gitignore 规则时检查：这个文件是否被 CI 构建依赖？
- **配置缺失必须显式失败**：Vite 对缺失 env 静默替换 `undefined` 是产出「残废包」的温床。所有关键构建期变量都应有 fail-fast 校验，让问题死在 CI 而非用户手里。
- **「本地能跑、CI 挂/产物坏」的嫌疑清单**（与 Git LFS 卡片互补）：LFS 指针未拉取、**gitignore 的配置文件**、平台可选依赖、secrets/环境变量缺失。
- **公开值不必按密钥管理**：Supabase publishable key 设计上就是公开的，为其引入 secrets 流程反而增加维护成本与静默失败面；区分「真密钥」与「公开配置」再选存放位置。

## 参考

- 错误触发点：`client/src/lib/auth/AuthContext.tsx`（`isPlaceholder` 检查）
- 占位符判定：`client/src/lib/auth/supabaseClient.ts`
- 防护实现：`client/vite.config.ts` `electronBuildConfigPlugin`
- 关联卡片：[Git LFS 图标未在 CI 拉取致 electron-builder 打包失败](./2026-07-git-lfs-icon-electron-builder-ci-failure.md)（同为「本地好 / CI 坏」环境差异类）
