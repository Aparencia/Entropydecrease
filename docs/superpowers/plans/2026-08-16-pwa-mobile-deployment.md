# 熵减移动端 PWA 发布清单（M4 Task13）

> 日期：2026-08-16 ｜ 关联：`docs/superpowers/plans/2026-08-16-pwa-mobile.md` ｜ 状态：待执行部署

本清单是 PWA 移动端 MVP 上线前的**部署前置项 + 真机验证项 + 已知限制**。代码实现已完成
（T0–M3 + M4 单测），以下条目需在生产环境/真机执行。

## 1. 部署前置（阻塞项，上线前必须完成）

| # | 项 | 操作 | 依据 |
|---|----|------|------|
| D1 | **CORS 生产白名单** | 在 `server/.env` 设置 `CORS_ORIGINS`，加入 PWA 域名（如 `https://app.entropydecrease.com`）；`APP_ENV=production` 时网关为严格模式，仅允许列表内源 | `server/ai-gateway/main.py:202`、`config/app.py:22` |
| D2 | **API 绝对地址** | 构建 PWA 前确保 `.env.production` 的 `VITE_API_BASE_URL`（sync-service）与 `VITE_AI_GATEWAY_URL`（ai-gateway）为**绝对 HTTPS 地址**（浏览器跨域 fetch 需要） | `client/vite.config.ts`、`lib/http/apiClient.ts` |
| D3 | **HTTPS** | PWA 必须 HTTPS 托管（Service Worker 注册 + `getUserMedia` 麦克风均为 secure context 要求）；`http://` 仅 localhost 例外 | 浏览器平台约束 |
| D4 | **构建** | `cd client && vite build`（非 ELECTRON_BUILD）产出含 `sw.js`/`manifest.webmanifest` 的 PWA 产物，部署到静态托管 | T0.1 已验证 |

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
