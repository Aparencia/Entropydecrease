# 熵减移动端 PWA 发布清单（M4 Task13）

> 日期：2026-08-16 ｜ 关联：`docs/archive/2026-08-16/2026-08-16-pwa-mobile.md` ｜ 状态：待执行部署

本清单是 PWA 移动端 MVP 上线前的**部署前置项 + 真机验证项 + 已知限制**。代码实现已完成
（T0–M3 + M4 单测），以下条目需在生产环境/真机执行。

## 1. 部署前置（阻塞项，上线前必须完成）

| # | 项 | 操作 | 依据 |
|---|----|------|------|
| D1 | **CORS** | PWA 部署于 `entropydecrease.com/pwa/`（与 API 同源）→ **CORS 自动满足**，无需额外白名单；若未来独立子域再配置 `CORS_ORIGINS` | `main.py:202`、`config/app.py:22` |
| D2 | **API 绝对地址** | `.env.production` 的 `VITE_API_BASE_URL`/`VITE_AI_GATEWAY_URL` 为绝对 HTTPS 地址（当前 `https://entropydecrease.com`，同源） | `lib/http/apiClient.ts` |
| D3 | **HTTPS** | PWA 必须 HTTPS 托管（SW 注册 + `getUserMedia` 需 secure context）；`entropydecrease.com` 已有证书 ✅ | 浏览器平台约束 |
| D4 | **构建** | CI 由 `mobile-release.yml` 执行：`VITE_PWA_BASE=/pwa npx vite build`（子路径 base + manifest start_url/scope 已支持） | `client/vite.config.ts` |
| D5 | **服务器一次性配置** | 应用仓库内配置：`docker compose -f server/docker-compose.prod.yml up -d`（应用 `/opt/Entropydecrease/pwa` 挂载 + nginx `location /pwa/`）；确认 `https://entropydecrease.com/pwa/` 返回 200 | `server/nginx/nginx.conf`、`server/docker-compose.prod.yml` |

## 1.1 发版工作流（CI/CD，已实现）

- **`.github/workflows/mobile-release.yml`**（新增）：监听 `v*` tag → lint/test 门禁 → `VITE_PWA_BASE=/pwa npx vite build` → 校验 manifest/sw.js → scp 上传 ECS `/opt/Entropydecrease/pwa`（rm 干净替换）→ docker restart nginx → 写 version.txt → curl 验证
- 与 `release.yml`（Electron 桌面）**共用 v* tag**：semantic-release 打 `v0.x.y` 时双端并行发版，版本天然同步、互不干扰
- PR 验证复用 `pr-check.yml`（client job 已含 vite build 产出 PWA）；手动补发用 workflow_dispatch

## 2. 真机验证清单（M4 Task12 Step2，需 iOS Safari + Android Chrome 真机）

| # | 验收点 | 预期 |
|---|--------|------|
| V1 | iOS Safari「添加到主屏幕」→ standalone 启动 | 图标/启动正常，无浏览器地址栏 |
| V2 | 番茄钟：启动→切后台 5 分钟→恢复 | 计时不漂移（墙钟校准）；到点通知可达（iOS 16.4+ 需先授权） |
| V3 | 空白笔记：新建/编辑/插图/保存 | 工具栏不溢出（横向滚动）；无输入遮挡；图片可从相册插入 |
| V4 | 课堂助手-录音：点「开始录音转写」→ 说话 → 停止 | 麦克风授权弹窗；转写文本实时上屏；停止后可「生成笔记」 |
| V5 | 课堂助手-视频：导入手机录屏/抖音保存的视频 | 上传进度 → 分析（1–3 分钟）→ 「视频笔记已生成」 |
| V6 | 抖音链接引导：粘贴 `v.douyin.com/…` | 显示「保存到相册再导入」引导文案 |
| V7 | 同步：登录 → 桌面写笔记 → 移动端拉取 | 双向增量同步；离线操作入队、恢复后补齐 |
| V8 | 音频：首次点击播放番茄钟音效 | 首触可播（AudioContext 手势解锁） |

## 3. 已知限制（产品层需知晓，Phase 2 再解决）

1. **系统音频实时监听不可用**：PWA 无法捕获系统扬声器/其他 App 音频（iOS 无 API、Android 网页无法跨 App）。
   主力方案 = 手机系统录屏（含系统音频）导入分析；真·实时监听需 Phase 2 原生壳
   （Android `AudioPlaybackCapture` / iOS `ReplayKit`）。
2. **PDF 直接导入不可用**：移动端剪藏/PDF 导入降级为提示（引导桌面端导入或复制文本）。
3. **后台录音受限**：浏览器标签切后台时录音暂停（iOS 尤其严格）；番茄钟靠墙钟校准不受影响。
4. **屏幕采集不可用**：移动浏览器无 `getDisplayMedia`，课堂助手无视觉采集（仅音频转写 + 视频文件导入）。
5. **剪藏受 CORS 限制**：URL 剪藏对不允许跨域 fetch 的站点会降级提示手动复制。

## 4. 桌面端回归结论（M4 Task12 Step1）

- `npm run check`：lint ✅ / typecheck ✅ / typecheck:electron ✅
- `npm run test`：134/135 文件通过；唯一失败为 `electron/windowScorer.test.ts`
  （**并行开发中的「窗口识别优化」工作**，非 PWA 改动导致，由该功能负责人修复）。
- PWA 新增单测 11 个全部通过（`isDouyinUrl` / `resampleToMono` / `computeRms`）。
