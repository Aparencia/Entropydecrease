# ADR-017: 安全加固批（CSP 基线与白名单、opener 移除、compose 强制配置、nginx 安全头、.env.production 去跟踪）

## 状态

已接受

## 日期

2026-08-21

## 背景

三维复审（安全维度）对桌面端与服务端各暴露出一批同类问题：

1. **桌面端 CSP 缺基线**：tauri.conf.json 此前无 CSP（等同 `null`），任意脚本/连接/图片源不受约束。
2. **opener 插件无用途却常驻**：`tauri_plugin_opener` 注册于 Builder 且 Cargo 依赖在列，但应用内无外链打开需求，徒增 IPC 攻击面。
3. **compose 配置静默缺省**：`REDIS_PASSWORD`/`CORS_ORIGINS` 缺失时 compose 以空值/难读错误收场，生产可能带弱配置启动。
4. **nginx 安全头继承陷阱**：nginx `add_header` 继承规则——location 一旦出现任何 `add_header` 就不再继承 server 层全部安全头，集中式声明会静默失效。
5. **server/.env.production 曾入库**：生产环境变量文件被 git 跟踪，存在密钥泄露面（AGENTS.md §4 安全红线：明文存储敏感数据）。

## 决策

我们将按以下口径完成本批加固：

1. **桌面端 CSP 基线（tauri.conf.json）**：
   - `default-src 'self'`；`script-src 'self'`（不接受 unsafe-inline/eval）；
     `style-src 'self' 'unsafe-inline'`（前端框架内联样式刚需）；
     `media-src 'self' asset: http://asset.localhost blob:`（本地媒体回放）；
     `font-src 'self' data:`；`connect-src` 白名单见下。
   - `connect-src` 域名清单依据（逐项对应真实网络出口，不多给）：
     - `ipc:` / `http://ipc.localhost`：Tauri 2 IPC 通道（必需）；
     - `ws:`：Vite dev 热更新（开发模式必需，生产无 ws 连接）；
     - `https://api.siliconflow.cn`：云端 AI 增强网关端点（ADR-010 补缝式 AI，用户授权后才调用）;
     - `https://hf-mirror.com`：流式 ASR/标点等模型下载镜像；
     - `https://www.modelscope.cn`：OCR 模型 ModelScope 自动缓存。
   - `img-src` 含 `https:`（三维复审 #11 修复）：产品功能支持笔记外链图片
     （NoteImage.tsx 对 https 直出）；此前 CSP 为 null 时外链图可显示，
     加固不得静默破坏既有功能。
2. **opener 权限移除**：删除 `tauri_plugin_opener::init()` 注册与 Cargo 依赖；
   capabilities 不含 opener 权限；前端 `@tauri-apps/plugin-opener` 由前端侧同步移除。
3. **compose `${VAR:?}` 强制配置**：`docker-compose.prod.yml` 对 `REDIS_PASSWORD`
   与 `CORS_ORIGINS` 使用 `${VAR:?...}` 强制插值（缺失即拒绝启动，禁止通配 `*` CORS）；
   `server/deploy.sh` 在 CHANGE_ME 检查后提前 source 校验二者存在性，
   把 compose 插值阶段的难读错误提前为可读提示。
4. **nginx 安全头片段化**：安全头收敛为 `server/nginx/conf.d/security_headers.conf`
   片段；每个自带 `add_header` 的 location 必须显式 `include` 该片段
   （nginx 继承规则决定无法只在 server 层声明一次），新增 location 同口径。
5. **server/.env.production 去跟踪**：`.gitignore` 收录 `*.env.production`；
   文件以 `git rm --cached` 移出索引（保留磁盘文件）；模板以
   `.env.production.example` 入库供部署参考。

## 备选方案

### 方案 A：CSP img-src 收紧为白名单域名（未采用）
- 优点：外链图可精确控制，跟踪像素面更小。
- 缺点：笔记外链图片来源不可枚举（用户粘贴任意图床/课程资料链接），白名单必然漏配，功能被静默破坏。
- 适用场景：外链图来源封闭的产品。

### 方案 B：CSP img-src 放开 `https:`（采用）
- 优点：与既有功能契约一致（CSP null 时代外链图可显示）；https 限定排除 http 明文图。
- 缺点：任意 https 图可加载，跟踪像素/外链探测面存在（笔记内容为用户自产，风险可控）。
- 适用场景：用户生成内容含任意外链图的本地应用。

### 方案 C：nginx 安全头只声明在 server 层（未采用）
- 优点：单点维护。
- 缺点：任一 location 自带 add_header（缓存/CORS/X-Accel-Buffering 均有此需求）即整体失继承——安全头静默消失，比不配更危险（误以为有防护）。
- 适用场景：无 location 级 add_header 的简单站点。

## 选择理由

- 桌面端是本地优先应用：网络出口少且可枚举，connect-src 用最小域名清单；
  img-src 放宽到 `https:` 是"加固不破坏功能"的显式取舍（复审 #11 闭环）。
- 攻击面收窄优先于便利：无用途的 opener 插件直接移除，而非保留待用。
- 服务端强制项用 `${VAR:?}` 显式失败而非静默缺省——生产部署宁可失败也不带弱配置。
- nginx 片段化是对继承规则的如实应对，配合注释护栏防止新增 location 漏 include。

## 影响

### 正面影响
- 桌面端具备 CSP 基线：脚本/连接源受控，IPC 与模型下载等真实出口逐一对应。
- 生产部署硬门槛：密钥/CORS 缺失无法启动；deploy.sh 提供可读的前置校验。
- server/.env.production 不再入库，密钥泄露面消除。

### 负面影响 / 代价
- img-src `https:` 无法阻止任意 https 跟踪像素（接受：内容为本地用户自产）。
- 新增 nginx location 必须记得 include 安全头片段（注释护栏 + 本 ADR 留档）。

### 风险
- connect-src 白名单需随新网络出口同步更新（漏配表现为前端请求被 CSP 拦截，可诊断）。

## 合规性验证

- `tauri.conf.json` CSP 与本文清单逐项一致；新增网络出口需同步更新本 ADR 与 CSP。
- `cargo build` 通过且无 `tauri-plugin-opener` 引用残留（Rust 侧；前端侧另一批移除）。
- `bash -n server/deploy.sh` 语法校验通过；CHANGE_ME 与 REDIS_PASSWORD/CORS_ORIGINS
  缺失路径均有可读报错。
- `git ls-files server/.env.production` 为空；`git check-ignore -v` 命中 `.gitignore` 规则。
- nginx 容器启动后抽查任一带 add_header 的 location 响应头含 HSTS/X-Frame-Options/nosniff。

## 相关决策

- ADR-010: 补缝式 AI（云端增强需 connect-src api.siliconflow.cn）
- ADR-016: AI 凭据存储方案（密钥不落明文——与 .env.production 去跟踪同红线）

## 参考

- server/docker-compose.prod.yml（`${VAR:?}` 强制项）
- server/deploy.sh（前置校验与 Redis 健康检查 REDISCLI_AUTH 口径）
- server/nginx/conf.d/security_headers.conf（安全头片段）
- AGENTS.md §4 安全红线
