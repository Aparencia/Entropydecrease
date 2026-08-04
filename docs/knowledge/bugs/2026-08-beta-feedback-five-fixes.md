# 知识卡片 · 内测反馈批量修复（5 项）

## 基本信息

| 字段 | 内容 |
|------|------|
| 标题 | 内测反馈五连修：页面切换不渲染、MCP 复制失败、构建后无音频、预设管理缺陷、番茄钟一屏适配 |
| 日期 | 2026-08-04 |
| 类型 | 踩坑记录（批量） |
| 标签 | #3D导航 #竞态 #Electron #剪贴板 #file协议 #资源路径 #预设CRUD #响应式 |

---

## 问题 1：多次从主页切换到其他页面后页面不渲染

- **症状**：快速多次切换模块后，功能覆盖层面板存在但内部页面内容空白（内测截图：毛玻璃面板内只有 3D 背景透出）。
- **排查**：本地浏览器无法稳定复现（Electron 合成层特异性），转入静态状态机审查。
- **根因**：`OrbitalStore.syncWithRoute` 在 `phase==='entering'`（相机飞行 700ms+ 窗口）时**直接 return 丢弃路由同步**，`currentModule` 永久滞留旧值；停靠后相机/覆盖层与实际路由错位，叠加 docked 渲染冻结表现为页面不渲染。快速连续切换时该竞态必然命中。
- **修复**：
  1. `syncWithRoute` 飞行中不再整体丢弃——把 `currentModule` 校正到路由目标（SpatialNav 飞行 effect 与停靠计时器随 deps 自动重定向/重置）；
  2. `SceneProvider` 停靠计时器增加 2.5s 强制停靠兜底，防止计时器被反复重置/丢失导致相位卡在 entering、覆盖层永不显示。
- **教训**：状态机中的"early return 跳过本次同步"必须回答"被跳过的信息之后由谁补偿"；凡有飞行/过渡窗口的导航系统，路由同步必须**最终收敛**而不是丢弃。

## 问题 2：设置页 MCP 复制按钮失败

- **根因**：`navigator.clipboard.writeText` 在 Electron 中不可靠——窗口短暂失焦即抛 "Document is not focused"，file:// 受限上下文兼容性亦差。
- **修复**：新增 `clipboard:write-text` IPC（主进程 `clipboard` 模块写入，经 safeHandle sender 验证 + requireText 入参校验 + preload 白名单登记）；新建 `lib/utils/clipboard.ts` 三级降级链（Electron IPC → Web Clipboard API → execCommand）；MCP 复制按钮、笔记 AI 摘要、核心概念复制三处同类调用全部接入。
- **教训**：Electron 渲染进程的剪贴板/权限类 Web API 一律优先走主进程原生模块，Web API 仅作降级。

## 问题 3：dev 有音频、客户端构建后没有音频

- **现状调研**：音频在 `public/sounds`（50）与 `public/audio`（11），均已被 git 追踪，Vite 构建会复制到 dist，electron-builder `files: dist/**/*` 会打进 asar——**文件在包里，坏的是路径**。
- **根因**：音效路径全部写成绝对路径 `/sounds/x.wav`。Electron 生产环境 `win.loadFile(dist/index.html)` 走 file:// 协议，绝对路径解析到**文件系统根**（file:///C:/sounds/...）而 404；dev 环境 Vite 把 public 挂在站点根，问题被掩盖。
- **业界方案对照**：electron-vite/electron-builder 官方推荐 `base:'./'` + 相对路径（本项目 vite.config.ts 已配 base，只欠前端拼接）；备选为自定义 `app://` 协议（改动大、收益低，未采用）。
- **修复**：新增 `lib/assets/publicAssetUrl.ts`（`import.meta.env.BASE_URL` 拼接：Electron 构建 './' 相对文档解析，Web 构建 '/' 行为不变），接入全部 4 个消费点：SoundPlayer 音效映射、audioTracks 白噪音/BGM、WorldSoundscape、学伴音效。
- **验证**：ELECTRON_BUILD=1 构建产物中函数内联为 `e.startsWith("/")?"./"+e.slice(1):e`，dist/sounds 与 dist/audio 齐全。
- **教训**：Electron 项目一切 public 静态资源引用禁止裸绝对路径；dev/prod 协议差异（http vs file）是经典"本地好/线上坏"陷阱。

## 问题 4：番茄钟预设标题残留 + 无法删除/排序

- **根因 a（标题残留）**：`PresetEditor` 随 AnimatePresence 常驻挂载，`useState(initial?.…)` 初值只在首次挂载生效；再次打开（尤其"编辑后新建"）残留上次标题/参数。
- **根因 b（管理能力缺失）**：设置页只有编辑/删除按钮，无排序入口（`reorderPresets` 服务与 store action 已存在但 UI 未接线）；内置预设的删除按钮直接不渲染，用户误以为自己的预设删不掉。
- **修复**：PresetEditor 增加 open/initial 变化时的表单复位 effect；设置页每行新增上移/下移按钮（边界禁用）；删除按钮对内置预设置灰并以 tooltip 说明原因，删除操作补 toast 反馈。
- **相邻缺陷（验证中发现）**：dev 环境 StrictMode 双调用使 `initialize` 并发执行，两次种子化都读到空表 → 内置预设翻倍（占预设名额）。修复：`seedBuiltinPresets` 用模块级 promise 串行化，并在种子化时清理同名重复内置脏数据（自愈存量库）。
- **教训**：常驻挂载的弹窗组件表单状态必须在"打开时"复位而非依赖 useState 初值；写库前的"读-判空-写"序列在并发下不可靠，需幂等屏障。

## 问题 5：番茄钟页面窗口适配（一屏、无滚动）

- **方案**：页面高度锚定视口 `h-[clamp(320px,calc(85vh-5rem),760px)]`，内部三段弹性布局（顶部信息 / 中部表盘 flex-1 吸收剩余高度 / 底部控制），全部纵向间距改 vh clamp；TimerRing 表盘 `clamp(150px,34vmin,280px)`、时间字号改 vmin clamp、光晕改百分比尺寸。
- **验证**：1920×1080 / 1440×900 / 1366×768 / 1024×600 / 800×500 五档视口实测 `scrollHeight ≤ clientHeight`（无滚动条），表盘 170→280px 连续缩放。
- **教训**：覆盖层内页面的"一屏"要同时锚定视口高与覆盖层 max-h（扣除 padding），用 85vh 而非 100vh 才能稳进面板；核心尺寸用 vmin 而非 vw/vh 单边，兼顾窄窗。

## 第二轮反馈追加（同日）

### 问题 1 复发：回到主页时主页可能不显示

- **新证据**：内测截图控制台显示 "Reduced Motion enabled"——测试环境开启了减少动效；且 dev 环境带 StrictMode。
- **真正根因**：路由过渡使用 `AnimatePresence mode="wait"`——新页面必须等旧页面退出回调交接后才挂载；在 reduced-motion / StrictMode(dev) / HMR 等条件下交接偶发丢失，新页永不挂载（面板可见、内容空白）。第一轮的 OrbitalStore 竞态修复是对的但不充分，页面挂载层还有这道闸。
- **修复**：AppLayout 路由过渡改为 **grid 叠放 + 同期交叉淡入淡出**（去掉 mode="wait"）：新页立即挂载，旧页淡出后卸载，退出即使延迟也不阻塞内容展示。
- **验证**：reduced-motion 档（静谧模式）下 5 轮 主页↔模块 快速往返 + 3 轮 Esc→主页，内容 100% 渲染。
- **教训**：`AnimatePresence mode="wait"` 是阻塞式交接，任何“必须等到某动画完成才挂载关键内容”的设计都是单点故障；路由级过渡优先用非阻塞 crossfade。

### 问题 4 补充：预设删除/排序入口在 dev 找不到

- **根因**：`/pomodoro/settings` 只有路由定义，全应用无任何 UI 跳转到它——功能存在但不可达。
- **修复**：PresetTabs 新增“预设管理”按钮（SlidersHorizontal 图标 + tooltip“预设管理（删除/排序）”），点击跳转深潜设置页；PomodoroPage 以稳定 useCallback 接线（保持 memo 化不退化）。
- **教训**：新增页面后必须自检“用户从哪进去”——路由可达 ≠ 功能可达。

## 第三轮反馈追加（控制台截图：同步超时刷屏 + Throttling navigation）

### 现象 A：控制台大量 `GET /api/v1/sync/pull … ERR_CONNECTION_TIMED_OUT`

- **根因链**（三层叠加）：
  1. `NetworkManager.handleOnline` 收到浏览器 online 事件就**立即断言 online**（未经心跳实测）；
  2. `SyncEngine.registerNetworkRecoverySync` 对**任何** status==='online' 通知都触发 sync（含延迟抖动的节流通知，最快每秒一次）；
  3. 同步服务器不可达时每次 sync 都是一发约 20s 超时的 pull → 刷屏。
- **修复**：
  1. handleOnline 不再断言 online，由心跳 ping 实测后再转状态（无心跳目标时降级用 navigator.onLine）；
  2. 自动同步改为仅在"转为 online"的**跳变沿**触发，且带指数退避：连续失败时间隔 10s→20s→40s→…封顶 5min，成功后重置；手动 sync 不受限。
  3. 新增 2 条回归测试（跳变沿触发 + 退避窗口抑制）。

### 现象 B：`Throttling navigation to prevent the browser from hanging`（栈指 SpatialNav.tsx:126）

- **根因**：Chromium 对客户端导航（pushState/hash）有洪泛保护（crbug.com/1038223），快速反复切换超阈后导航被**限流丢弃**——此时轨道状态已迁移而路由未变，覆盖层与页面错位/空白（与问题 1 同源叠加）。
- **修复**：`OrbitalStore.enterModule` 加 200ms 最小调用间隔（洪泛防护），把导航频率限制在 Chromium 阈值之下；即使 enterModule 被忽略，`syncWithRoute` 仍会从路由侧收敛轨道状态，不产生不一致。
- **教训**：“快速反复操作触发浏览器保护机制，保护机制反过来丢弃应用依赖的关键操作”是一类隐蔽的双向放大故障；高频用户入口要自带速率护栏。

## 验证汇总

- 渲染/主进程 tsc 0 错误；oxlint 0 errors；Vitest 873/873；ELECTRON_BUILD=1 vite build 通过
- Playwright 实测：响应式五档视口、预设新建/编辑复位/删除/排序/去重、快速切换导航回归均通过
- 第二轮：reduced-motion 档往返主页 5+3 轮全渲染；预设管理入口跳转验证通过
- 第三轮：同步洪泛防护 + 导航限流防护实施，Vitest 875/875（新增 2 条回归测试）
