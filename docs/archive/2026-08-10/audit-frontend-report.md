# 前端（client 目录）全面审计报告

> 审计范围：`d:\Program own\aicode\work space\Entropydecrease\client`（Electron 主进程 + React 渲染进程）
> 审计日期：2026-08-04
> 统计：**26 个问题 = 4 高 / 11 中 / 11 中低-低**
> 方法：静态代码走查（重点：IPC 安全与竞态、SQLite 数据层、媒体采集链路、生命周期编排、存储备份、classroom 采集编排、渲染层 stores），关键发现均已对照源码逐行确认。

## 问题总览

| 编号 | 优先级 | 模块 | 标题 |
|------|--------|------|------|
| H1 | 高 | 媒体捕获 | `screen_capture_stop` 未结算防抖中的 start Promise，渲染层永久挂起 |
| H2 | 高 | 数据层 | `importTable` 迁移按行内 key 顺序取值，行间字段不一致导致列错位 |
| H3 | 高 | 数据层 | `db:search` LIKE 降级路径无 LIMIT，常见词查询全量返回 |
| H4 | 高 | 数据层 | FTS5 `rebuildIndex` 同步重建阻塞主进程事件循环 |
| M1 | 中 | AI 集成 | 网关代理 method/路径未校验，HTTP 方法硬编码 POST |
| M2 | 中 | 生命周期 | MCP Bridge 初始化失败静默禁用，server 连接无独立超时 |
| M3 | 中 | 并发与 IPC | `safeHandleBatched` 调用方永远拿不到结果，microtask 异常无捕获 |
| M4 | 中 | 媒体捕获 | `resolveSource` 每次截图全量枚举窗口并生成 1920×1080 缩略图 |
| M5 | 中 | 数据层 | `db:batch` 批量操作无条数上限，单事务长期持有写锁 |
| M6 | 中 | 数据层 | 列名白名单缓存 `columnCache` 永不过期 |
| M7 | 中 | 生命周期 | MCP Bridge 将主进程全部环境变量传给 server 子进程 |
| M8 | 中 | 媒体捕获 | `setDisplayMediaRequestHandler` 全局放行，无请求来源校验 |
| M9 | 中 | 存储备份 | 数据库文件迁移直接覆盖目标库，备份固定名互相覆盖 |
| M10 | 中 | classroom | 帧超时保底重启无重试上限与超时保护 |
| M11 | 中 | AI 集成 | `callWithLocalFallback` 本地探测状态过期时静默跳过本地推理 |
| L1 | 低 | 存储备份 | `fs:read-file` 无大小限制，可整库读取 userData |
| L2 | 低 | AI 集成 | `ai:set-gateway-url` 域名白名单但端口/路径不受限 |
| L3 | 低 | 存储备份 | `backup:save` 写入无内容/大小限制 |
| L4 | 低 | 生命周期 | `update:install` / `update:download` 无二次确认 |
| L5 | 低 | 数据层 | `chatRepository.getMessages` limit 无上限钳制 |
| L6 | 低 | 并发与 IPC | preload 专用监听 API 绕过统一事件白名单校验 |
| L7 | 低 | 数据层 | schema 迁移 ALTER 用空 catch 吞异常，无日志 |
| L8 | 低 | 并发与 IPC | `video_record_stopped` 监听无 sender 校验 |
| L9 | 低 | 并发与 IPC | `ai:stream:start` 活跃流在窗口销毁时不清理 |
| L10 | 低 | 生命周期 | `uncaughtException`/`unhandledRejection` 仅记日志不退出 |
| L11 | 低 | stores | `saveAIConfigAction` 静默吞掉网关 URL 同步失败 |

---

## 模块一：并发与 IPC

### M3（中）— `safeHandleBatched` 调用方永远拿不到结果，microtask 异常无捕获

- **文件路径:行号 + 函数**：`client/electron/ipcUtils.ts:150-177` — `safeHandleBatched()`
- **问题描述与技术原因**：批量化 handler 将实际处理推迟到 `queueMicrotask`，但外层函数立即 `return Promise.resolve(undefined)`。调用方 `invoke()` 拿到的是 `undefined` 而非真实结果；且 microtask 中的 `handler()` 抛错时没有 try/catch 包裹，异常变成 `unhandledRejection`（仅被 `logger.crash` 记录，业务状态已不一致）。
- **实际影响**：使用该工具的 IPC（如高频状态同步）结果丢失；handler 内部出错时调用方无感知，主进程与渲染进程状态漂移。
- **触发条件**：任何注册为 batched 的 channel 被调用，且 handler 内部抛出异常时。
- **修复建议**：microtask 内 `try/catch` 包裹 handler，失败时记录日志并向调用方 settle 错误（若需要返回值则改为真正的批处理合并策略，将最后一个 pending 调用的 resolve 保留到 flush 时结算）。
- **优先级**：中
- **测试建议**：单测覆盖 ①连续多次调用只执行最后一次；②handler 抛错时 promise 被 reject 而非 unhandled；③调用方收到真实返回值。

### L8（低）— `video_record_stopped` 监听无 sender 校验

- **文件路径:行号 + 函数**：`client/electron/videoRecorder.ts:180-190` — `VideoRecorder.stopRecording()`
- **问题描述与技术原因**：`stopRecording()` 内部用 `ipcMain.once('video_record_stopped', onConfirmed)` 等待渲染进程确认，但未校验事件 sender 是否为主窗口（同文件其他 `ipcMain.on` 监听均经 `verifySender`，此处遗漏）。另外该监听是全局一次性监听，若同时存在多个 recorder 实例会互相消费事件。
- **实际影响**：任意 webContents 发送 `video_record_stopped` 可提前结束 500ms 等待窗口；多实例场景下事件可能被错误实例消费。当前仅主窗口存在，实际风险低，但与 SEC-005 纵深防御策略不一致。
- **触发条件**：非主窗口 webContents 发送伪造确认事件；或未来新增多实例录制时。
- **修复建议**：在 `onConfirmed` 中校验 `event.sender.id === getMainWindowId()`；或将确认事件改为绑定到具体窗口的专用 channel。
- **优先级**：低
- **测试建议**：集成测试模拟非主窗口发送 `video_record_stopped`，验证不会提前 resolve。

### L9（低）— `ai:stream:start` 活跃流在窗口销毁时不清理

- **文件路径:行号 + 函数**：`client/electron/ai/streamHandler.ts:29,62-63` — `registerStreamHandler()`
- **问题描述与技术原因**：`activeStreams` Map 中的 `AbortController` 仅在流正常结束/取消时删除；若发起流的窗口被销毁（用户关窗/刷新），`for await` 仍继续从网关拉取直至流结束或超时（默认 300s），期间主进程持续处理 SSE、占用网络与内存。`requestId` 由渲染进程任意传入，无格式/长度校验，可被构造为超大字符串造成 Map 键污染（单次无大碍，但无防御）。
- **实际影响**：窗口销毁后残留的流请求继续占用网关连接与主进程资源；多次开关窗口可累积多个并行残留流。
- **触发条件**：流式对话进行中关闭窗口/刷新页面。
- **修复建议**：监听 `sender` 的 `destroyed` 事件（`webContents.on('destroyed')`）时 abort 对应 controller 并清理 Map；对 `requestId` 做长度/字符集校验（如 ≤64 字符）。
- **优先级**：低
- **测试建议**：测试流进行中销毁窗口，验证 `activeStreams` 被清空且无继续拉取。

### L6（低）— preload 专用监听 API 绕过统一事件白名单校验

- **文件路径:行号 + 函数**：`client/electron/preload.ts:222-246` — `onWindowClosing()` / `onSyncBeforeQuit()` / `onMaximizedChanged()` / `onPullProgress()`
- **问题描述与技术原因**：`ALLOWED_EVENT_CHANNELS` 是统一事件监听白名单，但 `onWindowClosing`（`window:closing`）等专用 API 直接硬编码 `ipcRenderer.on(channel, ...)`，未纳入白名单校验，与 `on()` 的通用路径逻辑不一致。清单维护时容易漏改（例如 `window:closing` 不在 `ALLOWED_EVENT_CHANNELS` 中，但 `onWindowClosing` 独立暴露）。
- **实际影响**：白名单形同虚设——新增/移除事件的审计不完整；未来新增专用监听时可能绕过审查。无直接安全漏洞（channel 仍受 preload 控制），属纵深防御一致性缺陷。
- **触发条件**：维护 preload 白名单时基于 `ALLOWED_EVENT_CHANNELS` 判断，而专用 API 不在此列。
- **修复建议**：将专用监听统一改为基于 `ALLOWED_EVENT_CHANNELS` 的封装，或把 `window:closing` 等补充进白名单并加注释关联。
- **优先级**：低
- **测试建议**：静态检查断言所有 `ipcRenderer.on` 的 channel 均出现在白名单中（可用 ESLint 规则或单测）。

---

## 模块二：AI 集成

### M1（中）— 网关代理 method/路径未校验，HTTP 方法硬编码 POST

- **文件路径:行号 + 函数**：
  - `client/electron/ai/gatewayHttp.ts:67-68` — `executePost()`
  - `client/electron/ai/gatewayStream.ts:55-56` — `postJsonStream()`
  - `client/electron/ai/streamHandler.ts:46-56,80-86` — `registerStreamHandler()`（`method` 参数实际是 API 路径，直接拼入 `${base}${apiPath}`）
- **问题描述与技术原因**：① 网关请求层将 HTTP 方法硬编码为 `POST`，未参数化——未来需要 GET/DELETE 端点（如余额查询 GET `/api/v1/ai/balance`）时必须改代码；② `ai:stream:start` 的 `method`（路径）字段无任何格式/白名单校验，渲染进程可传任意字符串拼接进 URL（`${base}${method}`），可访问网关上的任意路径（受网关自身认证限制，但代理层零过滤）；③ 路径中可含 `?`/`#` 等注入参数。
- **实际影响**：方法不匹配时网关返回 405/路由失败；路径未校验意味着渲染层可绕过设计内的 feature 端点映射，直接探测/调用网关其他接口，扩大攻击面（如网关调试端点）。
- **触发条件**：新增非 POST 端点时需改代码；或渲染层被注入代码后可任意指定路径。
- **修复建议**：`executePost`/`postJsonStream` 增加 `method` 参数并做白名单校验（`GET/POST/PUT/PATCH/DELETE`）；`streamHandler` 对 `method` 做前缀校验（必须 `/api/v1/ai/` 开头且不含 `?`/`#`/空白），构建请求前用 `new URL()` 校验。
- **优先级**：中
- **测试建议**：单测验证非法路径（`../`、`?x=`、非 `/api` 前缀）被拒绝；验证 method 参数化后 GET 请求可用。

### L2（低）— `ai:set-gateway-url` 域名白名单但端口/路径不受限

- **文件路径:行号 + 函数**：`client/electron/main.ts:209-227` — `ai:set-gateway-url` handler
- **问题描述与技术原因**：域名白名单校验正确（`entropydecrease.com` 及子域 / `localhost` / `127.0.0.1` + HTTPS 强制），但未限制**端口与路径**——同一受信任域名的任意端口（如 `https://entropydecrease.com:8080`）和任意路径（`https://entropydecrease.com/evil`）均被接受，随后写入运行时网关地址并被 CSP `connect-src` 动态放行。
- **实际影响**：若攻击者能控制同域任意端口的服务（或内网中间人），可诱导应用向非预期端点发送请求；路径后缀还会污染后续 `${base}${apiPath}` 拼接。
- **触发条件**：用户手动配置或渲染层被注入代码时传入带端口/路径的 URL。
- **修复建议**：解析后校验 `parsedUrl.port === ''`（默认端口）且 `parsedUrl.pathname` 仅允许 `/` 或空；在 `buildExtraConnectSrc`（cspPolicy.ts）同步收紧。
- **优先级**：低
- **测试建议**：单测覆盖带端口、带路径、带 userinfo 的 URL 均被拒绝。

### M11（中）— `callWithLocalFallback` 本地探测状态过期时静默跳过本地推理

- **文件路径:行号 + 函数**：`client/electron/ai/gatewayHttp.ts:152-180` — `callWithLocalFallback()`
- **问题描述与技术原因**：`isOllamaAvailable()` 依赖 `_cachedStatus` 且**缓存过期（`HEALTH_CACHE_TTL` 到期）即视为不可用**，返回 false 后直接走远程。若用户长时间未触发 `getOllamaStatus(true)` 刷新，Ollama 一直在运行也会被静默跳过，且不提示"本地推理已停用"。
- **实际影响**：本地推理在缓存过期窗口内静默失效，用户以为在用本地模型实际全走云端（隐私与成本预期偏差）；该状态不可观测，诊断困难。
- **触发条件**：启用本地推理后，距上次探测超过 `HEALTH_CACHE_TTL` 的任意 AI 调用。
- **修复建议**：缓存过期时异步刷新一次再决策（或过期视为"可用候选"，先行 `getOllamaStatus(true)` 探测，带回退）；将"本地降级到云端"的决策暴露给渲染层（现有 `source` 字段已可承载，补充 status 事件）。
- **优先级**：中
- **测试建议**：模拟缓存过期且 Ollama 运行中的场景，验证走本地而非远程；验证刷新失败时仍安全降级远程。

---

## 模块三：媒体捕获

### H1（高）— `screen_capture_stop` 未结算防抖中的 start Promise，渲染层永久挂起

- **文件路径:行号 + 函数**：`client/electron/screenCaptureHandlers.ts:116-132` — `screen_capture_stop` handler（关联 `pendingStartResolve` 状态：第 35、61-64、69-74 行）
- **问题描述与技术原因**：`screen_capture_start` 有 500ms 防抖，防抖期间把 `resolve` 存入模块级 `pendingStartResolve`。注释明确要求"防抖替换旧请求时必须显式 settle 旧 Promise"，且 start 分支确实做了（第 61-64 行），但 `screen_capture_stop` 只做了"递增 token + 清定时器 + dispose 实例"（第 117-130 行），**从未调用 `pendingStartResolve`**。若在防抖窗口内调用 stop：定时器被清除 → debounce 回调永不执行 → `pendingStartResolve` 永久悬挂 → 渲染层 `invoke('screen_capture_start')` 的 Promise 永不 resolve。
- **实际影响**：渲染层若以 loading 态等待 start 返回则永久卡死；"快速点击开始→立即停止"是真实用户路径（误触/切换模式），且 `useClassroomCapture` 的帧超时保底重启（stop→200ms→start）也会踩中同一状态。主进程侧 token 递增后新 start 可正常发起，但旧 invoke 泄漏。
- **触发条件**：`screen_capture_start` 调用后 500ms 内调用 `screen_capture_stop`（或在 debounce 期间被新的 start 顶替后调用 stop）。
- **修复建议**：在 `screen_capture_stop` 中增加：
  ```ts
  if (pendingStartResolve) { pendingStartResolve({ success: false }); pendingStartResolve = null; }
  ```
  与 start 分支的结算逻辑保持对称；同时建议 `disposeScreenCaptureHandlers`（第 220-235 行）也做同样结算。
- **优先级**：高
- **测试建议**：单测/集成测试覆盖 ①start 后立即 stop，渲染层 invoke 必须 resolve；②stop→start→stop 连续操作无悬挂；③帧超时重启路径（useClassroomCapture 的 stop+200ms+start）不悬挂。

### M4（中）— `resolveSource` 每次截图全量枚举窗口并生成 1920×1080 缩略图

- **文件路径:行号 + 函数**：`client/electron/screenCapture.ts:166-186` — `ScreenCapture.resolveSource()`（`THUMBNAIL_SIZE` 常量第 45 行）
- **问题描述与技术原因**：每个采集周期都调用 `desktopCapturer.getSources({ types: ['window','screen'], thumbnailSize: { width: 1920, height: 1080 } })`——不仅枚举全部窗口，还为每个源生成全尺寸缩略图，随后才从中挑一个并再次 resize/JPEG 编码。Windows 上打开窗口较多时（10-20 个），每次截图产生数百 MB 的位图内存分配与 GPU 合成开销。
- **实际影响**：低配机器上采集间隔 5s 时仍可能出现周期性卡顿（主进程与系统合成器负载）；CPU/内存峰值高，与性能模式（静谧档）的节流初衷冲突。
- **触发条件**：开启屏幕采集且系统窗口数量多/分辨率高时。
- **修复建议**：源解析与抓帧分离——缓存窗口列表（秒级 TTL），仅在"窗口变化检测"或源失配时重新枚举；枚举时使用小缩略图（如 320×180），仅对选中的目标源做全尺寸抓帧（`thumbnailSize` 大缩略图直接作为帧数据，避免二次 capture）。
- **优先级**：中
- **测试建议**：性能基准——20 个窗口场景下对比修改前后单帧采集耗时与峰值内存；功能回归验证多显示器/窗口最小化场景选源正确。

### M8（中）— `setDisplayMediaRequestHandler` 全局放行，无请求来源校验

- **文件路径:行号 + 函数**：`client/electron/displayMediaHandler.ts:38-72` — `registerDisplayMediaHandler()`
- **问题描述与技术原因**：handler 对任何 `getDisplayMedia` 请求都直接授予"指定源视频 + `audio: 'loopback'` 系统混音"，且 `useSystemPicker: false` 跳过系统选择器。回调忽略 `request` 参数——不校验请求来源 frame 的 URL 是否属于应用自身（`request.frame` 的 `url`/`topLevelFrame`），也不区分请求方用途。
- **实际影响**：一旦渲染进程出现 XSS 或加载了不可信内容（如 `window.open` 拦截只处理了 http(s) 外链，`webContents` 内若注入脚本），即可无感获取整屏画面 + 系统音频混音（含其他应用声音），构成隐私泄露；正常场景下其他网页/iframe 的合法展示也会被无条件授权。
- **触发条件**：渲染层任意代码调用 `navigator.mediaDevices.getDisplayMedia()`（受信任代码正常触发；注入代码恶意触发）。
- **修复建议**：在 handler 内校验 `request.frame`（或 `request.topLevelFrame`）的 URL 前缀为应用自身 origin（`file://` 打包路径或 `http://localhost:5173`），否则 `callback({})` 拒绝；可考虑对 `audio` 请求与 `video` 请求区分授权策略。
- **优先级**：中
- **测试建议**：集成测试分别从主窗口与注入 iframe/伪造 frame 发起请求，验证后者被拒；回归验证课堂音频采集正常。

---

## 模块四：数据层

### H2（高）— `importTable` 迁移按行内 key 顺序取值，行间字段不一致导致列错位

- **文件路径:行号 + 函数**：`client/electron/db/migration.ts:106-128` — `importTable()`
- **问题描述与技术原因**：列名从**第一行**推断（`Object.keys(rows[0]).map(toSnake)`），但每行插入时按**该行自己的 key 顺序**取值（`Object.keys(item).map(k => item[k])`），再以位置对应填充到第一行推断出的列。若第二行及之后的行与首行的字段**集合或顺序不同**（IndexedDB 行缺少可选字段、字段顺序因对象字面量书写差异而不同、新旧版本数据结构不一致），值会按位置错位写入——例如行1 为 `[a,b,c]`，行2 为 `[c,b,a]` 时，行2 的 c 值被写入 a 列。SQLite 不校验列类型，静默写入，无任何报错。
- **实际影响**：IndexedDB → SQLite 迁移产生**静默数据损坏**：title/content 互换、时间戳错列、枚举值落到错误字段；迁移完成后 `migrationComplete` 已标记，用户数据不可逆错乱，且 FTS 索引基于错位数据构建。
- **触发条件**：存量 IndexedDB 中同一表存在字段集合/顺序不一致的行（几乎必然存在——历史版本可选字段、`undefined` 字段序列化差异）。
- **修复建议**：对每行显式按首行列集合取值并补齐缺失项：`cols.map(c => item[c] ?? null)`；或对每行独立校验字段集合，不一致时以该行自身列重建 INSERT（推荐前者 + 行级校验日志）。
- **优先级**：高
- **测试建议**：单测构造字段乱序/缺失的行集合（含 `undefined`、多余字段），断言插入后各列值正确；迁移端到端测试：构造带缺陷数据的 IndexedDB → 迁移 → 全表抽查列值。

### H3（高）— `db:search` LIKE 降级路径无 LIMIT，常见词查询全量返回

- **文件路径:行号 + 函数**：`client/electron/db/dbIpcHandlers.ts:237-251` — `db:search` handler 的 LIKE 降级分支
- **问题描述与技术原因**：FTS5 路径有 `LIMIT 20`，但当 FTS 无匹配（`ftsResults.length === 0`）时会**继续走 LIKE 降级**，而 notes 分支（`SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?`）与通用 TEXT 列分支**均无 LIMIT**。搜索"的""了"等常见字/词在 FTS 中通常无索引命中，但 LIKE `%的%` 可匹配海量行，触发 better-sqlite3 同步全表扫描 + 全量结果经 IPC 一次性传输。
- **实际影响**：笔记数万行时，一次常见词搜索即可造成主进程同步阻塞（秒级）+ 渲染进程 JSON 解析/渲染卡死，甚至内存峰值飙升；属用户高频路径。
- **触发条件**：任意用户搜索"的/了/是/一"等 FTS 未命中但 LIKE 命中的词；或 FTS 虚拟表损坏/查询语法错误时。
- **修复建议**：LIKE 降级分支统一追加 `LIMIT 20`（与 FTS 路径保持一致），并返回截断提示（如有需要）；同时对 `db:search` 增加结果行数上限钳制（服务端强制）。
- **优先级**：高
- **测试建议**：单测用 10 万行 notes 数据搜索"的"，验证返回 ≤20 行且耗时可控；回归验证正常关键词搜索仍走 FTS5。

### H4（高）— FTS5 `rebuildIndex` 同步重建阻塞主进程事件循环

- **文件路径:行号 + 函数**：`client/electron/db/fts5Search.ts:173-190` — `rebuildIndex()`；调用点：`main.ts:171-181`（启动）、`migration.ts:199-206`（migration:complete）
- **问题描述与技术原因**：`rebuildIndex` 使用 better-sqlite3 **同步 API**，在单事务内 `DELETE FROM fts_content` 后逐行 `INSERT` 全部文档。启动路径虽放入 `setTimeout` 异步执行，但回调内仍是同步代码——数万文档的全量重建（含分词 tokenize）会长时间占用主进程事件循环；`migration:complete` 路径更是在 IPC handler 内同步执行 `collectIndexableData + rebuildIndex`。
- **实际影响**：数据量大时（数万笔记/闪卡），应用启动后窗口事件、托盘、其他 IPC 全部被阻塞数秒至数十秒（窗口无响应/白屏）；迁移完成时同样卡死 UI。
- **触发条件**：存量数据量大时的首次启动或 IndexedDB 迁移完成；数据量随使用增长，问题随时间恶化。
- **修复建议**：将重建分批执行并让出事件循环（如每 500 行 `await setImmediate()` 或 `atomics.wait` 分片）；或将重建下沉到 Worker 线程（worker_threads + 独立连接）；为 `migration:complete` 提供进度事件而非同步等待。
- **优先级**：高
- **测试建议**：性能基准——5 万行数据重建时主进程事件循环延迟（`setInterval` 心跳偏差）应 < 100ms；迁移完成接口应可中断/可重入。

### M6（中）— 列名白名单缓存 `columnCache` 永不过期

- **文件路径:行号 + 函数**：`client/electron/db/sqliteRepository.ts:110-124` — `getTableColumns()`
- **问题描述与技术原因**：`columnCache` 是模块级 `Map`，首次 `PRAGMA table_info` 后永久缓存。运行期若发生 schema 变更（`ALTER TABLE ADD COLUMN`——schema.ts 的 v2/v4/v8 迁移正是运行期 ALTER，且 `storage:change-path` 会 `reinitialize` 到新库后再 `initializeSchema`），缓存仍为旧列集合，`filterAllowedColumns` 会把新列过滤掉。
- **实际影响**：运行期 schema 升级后，新列的数据写入/更新被静默丢弃（列被过滤），用户数据无声丢失；目前迁移在启动期执行可规避大部分场景，但 `storage:change-path` 等运行期建表路径存在真实触发面。
- **触发条件**：应用运行期间执行 ALTER TABLE（如未来热升级 schema）、或切换存储路径后旧连接缓存未失效。
- **修复建议**：缓存失效策略——`reinitialize`/`initializeSchema` 后调用 `columnCache.clear()`；或给缓存加版本号（跟随 `SCHEMA_VERSION`/`user_version`）。
- **优先级**：中
- **测试建议**：单测模拟 ALTER 后再次 `filterAllowedColumns`，验证新列不再被过滤；`storage:change-path` 端到端验证迁移后写入新列成功。

### M5（中）— 批量写操作无条数上限，单事务长期持有写锁

- **文件路径:行号 + 函数**：
  - `client/electron/db/dbIpcHandlers.ts:258-296` — `db:batch` handler
  - `client/electron/db/migration.ts:95-135` — `importTable()`（同性质：rows 无上限 + 逐行单事务同步插入）
- **问题描述与技术原因**：`db:batch` 的 `params.operations` 直接整体包进 `db.transaction`，无条数/体积上限；`importTable` 同样对 `rows` 无上限、整批单事务逐行 `INSERT OR REPLACE`（未用多行 VALUES）。渲染进程可一次性提交数万条操作（全量同步、导入大表），单事务同步执行期间：
  1. better-sqlite3 同步循环阻塞主进程事件循环；
  2. 写事务长期持有数据库写锁，所有其他 db:* IPC（搜索、读笔记）全部排队等待。
  3. 迁移路径与 H4（FTS 重建）叠加形成双重阻塞。
- **实际影响**：大批量导入/同步时 UI 卡顿 + 其他数据操作延迟；渲染层误传巨型数组（或注入代码）可制造拒绝服务。
- **触发条件**：批量同步/导入数据量大时；或渲染层构造超长 operations/rows 数组。
- **修复建议**：`db:batch` 限制单次条数（如 ≤1000）并分片多次事务；`importTable` 限制单次 rows（如 ≤5000）且由渲染进程分批调用、主进程侧统计总进度；两者入口均做长度校验并返回明确错误；INSERT 改多行 VALUES 提升吞吐。
- **优先级**：中
- **测试建议**：单测提交 10 万条 operations / rows，验证被拒绝或分片且不阻塞其他查询；迁移基准测试（5 万行导入事件循环延迟 < 100ms）；分批导入幂等性（断点续传）验证。

### L5（低）— `chatRepository.getMessages` limit 无上限钳制

- **文件路径:行号 + 函数**：`client/electron/db/chatRepository.ts:85-93` — `getMessages()`
- **问题描述与技术原因**：`limit` 直接拼入 `LIMIT ?`，调用方（渲染进程）可传任意大值（如 `1e9`），一次拉取整表消息；会话消息量大时经 IPC 全量传输。
- **实际影响**：长会话（数万条消息）下接口调用即全量返回，渲染卡顿；属低概率但无防御。
- **触发条件**：渲染层传超大 limit 或未来代码重构引入。
- **修复建议**：`limit = Math.min(Math.max(1, Math.floor(limit)), 200)` 钳制。
- **优先级**：低
- **测试建议**：单测验证 limit 越界被钳制。

### L7（低）— schema 迁移 ALTER 用空 catch 吞异常，无日志

- **文件路径:行号 + 函数**：`client/electron/db/schema.ts:228-278` — `initializeSchema()`（v2/v4/v8 迁移块）
- **问题描述与技术原因**：所有条件 `ALTER TABLE ... ADD COLUMN` 均以空 `catch { /* 列已存在 */ }` 吞掉异常。若失败原因不是"列已存在"（如数据库被锁 `SQLITE_BUSY`、磁盘错误、权限问题），迁移会**静默失败且无任何日志**，随后无条件 `db.pragma('user_version = 8')` 标记为已迁移——后续启动不再重试，新列永久缺失，依赖新列的功能（如 source_ref 溯源）静默失效。
- **实际影响**：偶发迁移失败被永久掩盖，功能缺失难以定位；数据完整性风险。
- **触发条件**：迁移瞬间数据库被锁/磁盘异常（低概率但存在）。
- **修复建议**：catch 中先检查错误信息是否确为 "duplicate column"，其余错误记录 `logger.error` 并**不设置 user_version**（保留重试机会）。
- **优先级**：低
- **测试建议**：单测模拟非 duplicate 异常，验证日志输出且 user_version 不更新。

---

## 模块五：stores

### L11（低）— `saveAIConfigAction` 静默吞掉网关 URL 同步失败

- **文件路径:行号 + 函数**：`client/src/stores/useSettingsStore.ts:81-89` — `saveAIConfigAction()`
- **问题描述与技术原因**：`window.electronAPI.invoke('ai:set-gateway-url', aiConfig.gatewayUrl).catch(() => {})` 用空 catch 吞掉失败。主进程侧校验失败（URL 格式、域名白名单、HTTPS 强制，见 main.ts:209-227）会 reject，渲染层无任何提示——UI 显示"已保存"，实际主进程仍用旧网关地址，后续所有 AI 请求继续走旧地址（可能全部失败）。本地 `persistAIConfig`/`updateAIGatewayUrl` 的 localStorage 写入成功更放大了状态漂移：下次启动又从 localStorage 恢复同一非法地址，反复失败。
- **实际影响**：用户修改网关地址后静默失效，AI 功能异常且难以定位（用户以为配置已生效）；设置页显示成功但实际未生效，状态漂移。
- **触发条件**：网关 URL 非法/域名不在白名单/未用 HTTPS 时保存设置。
- **修复建议**：catch 中展示 toast/错误提示并回滚 store 或标记"未同步"状态；保存前在渲染层先做与主进程同规则的本地校验（格式/域名/HTTPS），提前拦截非法输入。
- **优先级**：低
- **测试建议**：单测模拟主进程 reject，验证 UI 出现错误提示且状态标记"未同步"；验证非法 URL 在保存前被本地校验拦截。

---

## 模块六：classroom

### M10（中）— 帧超时保底重启无重试上限与超时保护

- **文件路径:行号 + 函数**：
  - `client/src/lib/capture/captureManager.ts:482-493` — `CaptureManager.resetFrameWatchdog()`（`onFrameWatchdogTimeout` 回调触发点，默认 3000ms）
  - `client/src/features/classroom/hooks/useClassroomCapture.ts:99-109` — `frameRestartRef` 重启回调（`screen_capture_stop` → 200ms → `screen_capture_start`）
- **问题描述与技术原因**：连续 3000ms 未收到帧即触发 `onFrameWatchdogTimeout` → 重启回调执行 `screen_capture_stop` → 200ms 等待 → `screen_capture_start`。该循环**无重试上限、无指数退避、无整体超时**：只要持续无帧（目标窗口句柄失效、主进程采集异常、显卡切换、H1 的 pending 悬挂），每约 3.2s 无限执行一轮 stop/start 全量重启，日志刷屏；且与用户手动停止竞争——用户点"停止"后若 watchdog 已排队或重启流程进行中，采集可能"自动复活"。重启回调本身无超时保护：若 `screen_capture_start` 因 H1 场景悬挂，回调的 `await` 永久 pending，后续 watchdog 触发被吞。
- **实际影响**：采集故障时表现为"停止后自动复活"的幽灵采集，反复重启加剧资源消耗与日志噪声；与 H1 叠加时重启链可永久挂起；用户感知为应用失控。
- **触发条件**：采集目标窗口销毁/无帧持续 3s 以上，且根因未恢复（窗口被关闭、最小化后桌面合成异常、主进程采集崩溃）。
- **修复建议**：①重启计数 + 上限（如连续 3 次后停止并 toast 提示用户手动处理，计数在收到有效帧或用户手动 start 时清零）；②指数退避（2s/4s/8s）；③重启回调整体加超时（如 5s 未完成则放弃本轮并记录错误）；④watchdog 触发前置校验（`status === 'capturing'`、session 未变），防止与手动停止竞争。
- **优先级**：中
- **测试建议**：模拟持续无帧 30s，验证最多重启 N 次后停止并提示用户；验证用户手动停止后 watchdog 不再触发重启；验证重启回调悬挂 5s 后放弃且不阻塞后续触发。

---

## 模块七：存储备份

### M9（中）— 数据库文件迁移直接覆盖目标库，备份固定名互相覆盖

- **文件路径:行号 + 函数**：
  - `client/electron/db/dbFileMigrator.ts:156-183` — `migrateDatabaseFiles()`（`copyFile(sourcePath, targetPath)` 直接覆盖目标）
  - `client/electron/db/dbFileMigrator.ts:232-241` — `createBackup()`（备份名固定 `keban.db.bak`，无时间戳）
- **问题描述与技术原因**：① `migrateDatabaseFiles` 用 `copyFile` 复制 `keban.db`/`-wal`/`-shm` 到目标目录，`copyFile` 默认**直接覆盖目标已存在的同名文件**，迁移前无"目标目录是否已有数据库"检测与提示。若用户选择的新存储目录已存在旧 `keban.db`（曾作为存储路径、手动复制过、上次迁移残留），旧库被静默覆盖，且覆盖前无备份（`createBackup` 只备份源目录，不备份目标目录）；② `createBackup` 备份名固定为 `keban.db.bak`（同目录、无时间戳），多次切换路径时旧备份被新备份覆盖，回滚点丢失。虽然 `storage:change-path` 七步流程有完整性校验，但校验发生在覆盖之后（校验的是新文件），对目标旧库无保护。
- **实际影响**：选择已有数据的目录作为新存储路径时，目标旧库整库被无声替换，用户数据丢失；"切换前自动备份"因固定名互相覆盖而形同虚设，回滚只能回到最近一次切换前的状态。
- **触发条件**：选择一个已存在 `keban.db` 的目录作为新存储路径；或一周内多次切换存储路径（备份互相覆盖）。
- **修复建议**：①迁移前检查目标目录是否已存在 `keban.db`，存在则拒绝迁移并明确提示（或先将目标旧库重命名为带时间戳的 `.bak` 保留）；②`createBackup` 备份名加时间戳（如 `keban.db-20260804-103000.bak`），并保留最近 N 份；③迁移成功后源目录旧库保留 `.bak` 而非删除（当前已保留，需确认后续清理逻辑不会删除）。
- **优先级**：中
- **测试建议**：单测构造目标目录已有数据库的场景，验证迁移被拒绝或目标旧库被改名保留；连续 3 次切换路径后验证存在 3 个不同时间戳的备份；端到端验证迁移后新库数据正确且旧库 `.bak` 可恢复。

### L1（低）— `fs:read-file` 无大小限制，可整库读取 userData

- **文件路径:行号 + 函数**：`client/electron/storageIpcHandlers.ts:47-63` — `fs:read-file` handler
- **问题描述与技术原因**：路径边界校验正确（`userData`/`temp` 白名单 + `path.relative` 兄弟目录防护），但 `readFile(resolvedPath)` **无文件大小限制**，读取内容整体以 ArrayBuffer 返回。`userData` 下的 `keban.db` 可能达数百 MB，渲染层可调用 `fs:read-file` 读取整个数据库文件（该 channel 在 preload 白名单中，任何渲染层代码均可调用）。
- **实际影响**：恶意/被注入渲染层可整库读取本地数据（应用内数据泄露面）；大文件读取占用主进程内存与 IPC 传输带宽，反复调用可拖慢主进程。
- **触发条件**：渲染层传入 userData 下大文件路径（`keban.db`、日志文件等）。
- **修复建议**：`readFile` 前 `stat` 检查大小（如 ≤50MB，超限拒绝）；对数据库文件（`keban.db*`）直接禁止读取；必要时将读取下沉到 Worker 或限制并发。
- **优先级**：低
- **测试建议**：单测构造超过阈值的大文件验证被拒；验证正常小文件（课堂助手视频分析用）读取不受影响；验证 `keban.db` 路径被明确拒绝。

### L3（低）— `backup:save` 写入无内容/大小限制

- **文件路径:行号 + 函数**：`client/electron/storageIpcHandlers.ts:157-180` — `backup:save` handler
- **问题描述与技术原因**：`data` 参数直接 `writeFile(result.filePath, data, 'utf-8')`，无内容类型/大小校验——渲染层可传任意字符串（非 JSON、超大文本、二进制序列化内容）写入用户选择的路径。文件名虽由系统保存对话框确认，但内容与大小零限制。
- **实际影响**：注入代码可借"保存备份"对话框诱导用户将任意内容覆盖写入任意文件（文件覆盖攻击面）；超大 `data` 造成磁盘写入高峰与短暂 UI 卡顿。需用户确认对话框，实际风险低。
- **触发条件**：渲染层被注入或调用方传入异常 `data`。
- **修复建议**：校验 `data` 为字符串且大小 ≤ 若干 MB（如 100MB）；写入前尝试 `JSON.parse` 验证备份语义（失败即拒绝并返回明确错误）。
- **优先级**：低
- **测试建议**：单测验证超大/非法 JSON 数据被拒绝；正常备份数据写入成功。

---

## 模块八：生命周期

### M2（中）— MCP Bridge 初始化失败静默禁用，server 连接无独立超时

- **文件路径:行号 + 函数**：
  - `client/electron/mcpManager.ts:55-128` — `McpManager.init()`（失败路径 `initialized` 不重置）
  - `client/electron/mcpManager.ts:203-240` — `sendRequest()`（已有 30s 请求超时）
  - `client/electron/mcpBridge.ts:129-172` — `startServer()`（`client.connect(transport)` 无内部超时）
  - `client/electron/mcpManager.ts:264-274` — `killBridge()`（SIGTERM + 5s 后 SIGKILL，定时器依赖主进程存活）
- **问题描述与技术原因**：① `init()` 中 `this.initialized = true` 在 fork 或 init 请求失败后**不重置**——catch 里只 `killBridge()`，MCP 功能在本次运行中永久静默禁用，后续 `listTools`/`callTool` 全部报 "Bridge process is not running"，渲染层无任何提示；② bridge 内 `startServer` 对每个 server **串行** `await client.connect(transport)`，connect 无独立超时——单个 server 进程挂起（启动脚本卡死、握手不响应）会拖住整个 init，依赖 manager 侧 30s 整体超时"一刀切"，其他本来可用的 server 也被放弃；③ `shutdown()` 已有 1s 优雅关闭超时 + SIGTERM + 5s SIGKILL 三级兜底（此路无挂起风险），但 5s SIGKILL 定时器依赖主进程存活，`window-all-closed` 流程中若主进程先退出则定时器失效（Windows 上 SIGTERM 等效强杀，影响有限；非 Windows 平台存在孤儿进程风险）。
- **实际影响**：MCP server 启动异常时功能静默消失，AI 会话的"学习记忆/文件系统/思维链"等工具不可用且无提示；单个坏 server 拖垮全部 MCP 能力；诊断困难（日志在 main 侧有记录，但用户无感知）。
- **触发条件**：某个 MCP server 命令路径错误/启动超时/崩溃；bridge 进程异常退出后无自动恢复。
- **修复建议**：①init 失败后重置 `initialized` 并支持延迟重试（指数退避，如 3 次）；②bridge 内为每个 server 的 connect 加独立超时（如 15s），失败仅标记该 server 离线，不影响其他 server；③bridge 意外退出时由 manager 自动重启 bridge（带退避与次数上限），或至少向渲染层推送明确的"MCP 不可用"状态事件。
- **优先级**：中
- **测试建议**：模拟 server 启动挂起，验证 30s 内 init 返回且其他 server 不被牵连；模拟 bridge 崩溃，验证自动恢复或渲染层收到明确错误事件；验证 init 失败后重试机制生效。

### M7（中）— MCP Bridge 将主进程全部环境变量传给 server 子进程

- **文件路径:行号 + 函数**：`client/electron/mcpBridge.ts:143-148` — `startServer()`（`env: process.env as Record<string, string>`）；源头 `client/electron/mcpManager.ts:66-74` — `init()`（`buildChildEnv()`）
- **问题描述与技术原因**：bridge 启动 MCP server（memory/filesystem/sequential-thinking 等外部命令）时传入 `env: process.env as Record<string, string>`——bridge 进程的**整个环境变量表**被完整传给第三方 server 进程。mcpManager 侧 `buildChildEnv` 为补充 Windows 注册表环境已尽量完整（从注册表合并系统/用户环境），且**未做任何敏感键过滤**。MCP server 是应用启动的外部命令（用户或系统安装，供应链可信度不可控），可读取宿主环境全部凭据。
- **实际影响**：若某 MCP server 包被供应链污染或本身就是恶意实现，可直接读取宿主环境中的敏感凭据（AI 网关 API key 若以环境变量形式存在、系统级 token、用户路径信息等）。纵深防御缺口：MCP server 实际只需要最小环境（PATH、SystemRoot、HOME、显式配置的变量）。
- **触发条件**：任何配置的 MCP server 被启动（应用启动即触发）。
- **修复建议**：为 server 构建**白名单最小环境**（PATH、SystemRoot、HOME、显式声明需要的变量），不传 `process.env` 全量；对含 `KEY`/`TOKEN`/`SECRET`/`PASSWORD` 等命名的变量明确剔除（即使白名单内）；记录 server 启动时的环境键数量供审计。
- **优先级**：中
- **测试建议**：集成测试启动一个"打印环境变量"的假 server，断言其收到的环境不含主进程私有变量（如带 `API_KEY` 命名的测试变量被过滤）；验证 PATH 等必需变量仍可用。

### L4（低）— `update:install` / `update:download` 无二次确认

- **文件路径:行号 + 函数**：`client/electron/main.ts:296-304` — `update:download` / `update:install` handler
- **问题描述与技术原因**：两个 handler 直接执行 `downloadUpdate()`/`installUpdate()`（`installUpdate` 即 `autoUpdater.quitAndInstall()`，会**立即退出应用并安装**），主进程侧无任何状态机校验——不检查当前是否处于 `available`（可下载）/`downloaded`（可安装）状态，不区分调用时机。渲染层任意时刻调用 `update:install` 都会触发退出+安装；`update:download` 可在更新下载中重复触发。
- **实际影响**：渲染层误调用/被注入代码调用时，应用被强制退出并安装（可能打断未保存的课堂笔记/会话数据）；正常流程中若 UI 状态与主进程漂移（如 download 完成事件丢失），用户重复点击"安装"会二次触发。当前 UI 有确认层，风险低，但主进程零防御。
- **触发条件**：渲染层在任意状态调用 `update:install`（无需先下载完成）。
- **修复建议**：主进程维护更新状态机（`idle/checking/available/downloading/downloaded/error`）：仅 `downloaded` 态允许 install、`available` 态允许 download；`update:download` 在 `downloading` 态幂等拒绝；其余状态返回明确错误码供 UI 提示。
- **优先级**：低
- **测试建议**：单测在未下载状态调用 install 被拒绝且应用不退出；download 完成后 install 正常触发；重复调用 download 不产生并发下载。

### L10（低）— `uncaughtException`/`unhandledRejection` 仅记日志不退出

- **文件路径:行号 + 函数**：`client/electron/main.ts:116-123` — 全局异常处理
- **问题描述与技术原因**：全局 `uncaughtException`/`unhandledRejection` 仅 `logger.crash` 记录后继续运行。主进程在未知异常后处于"带病运行"状态——数据库连接可能损坏、事件监听可能缺失、状态可能不一致，但进程不退出、不重启、不标记污染。
- **实际影响**：故障后主进程带病运行，后续错误难以归因（用户看到的是功能静默失效而非崩溃）；与 Electron 官方建议（崩溃后 relaunch 恢复）相悖；长时间带病运行可能造成数据写入损坏。
- **触发条件**：主进程任何未捕获异常（第三方库缺陷、环境异常、文件系统错误）。
- **修复建议**：`uncaughtException` 记录后执行崩溃恢复（`app.relaunch()` + `app.exit(1)`，需保证 DB 已 checkpoint），或至少设置"已污染"标志拒绝关键写操作；`unhandledRejection` 保持日志（Promise 错误多数可恢复），但对数据库/IPC 相关 rejection 单独告警。
- **优先级**：低
- **测试建议**：注入异常验证日志输出与退出/重启行为符合预期；验证重启后数据完整性（WAL checkpoint 正常）。

---

## 修复优先级汇总建议

| 优先级 | 问题 | 建议处理顺序 |
|--------|------|--------------|
| 高 | H1 屏幕采集 stop 挂起 | 1（用户可见挂起，最优先） |
| 高 | H2 迁移列错位 | 2（数据损坏，涉及存量迁移） |
| 高 | H3 搜索 LIKE 全量返回 | 3（高频路径性能/稳定性） |
| 高 | H4 FTS 重建阻塞 | 4（随数据量恶化） |
| 中 | M9 迁移覆盖目标库 | 5（数据丢失风险） |
| 中 | M1 网关代理路径未校验 | 6（安全面） |
| 中 | M8 displayMedia 全局放行 | 7（隐私面） |
| 中 | M7 环境变量透传 | 8（供应链纵深） |
| 中 | M6 列缓存不过期 | 9（数据写入丢失） |
| 中 | M5 db:batch 无上限 | 10（稳定性） |
| 中 | M3 safeHandleBatched | 11（功能正确性） |
| 中 | M10 帧超时无限重启 | 12（与 H1 联动） |
| 中 | M2 MCP init 失败禁用 | 13（功能可用性） |
| 中 | M4 缩略图全量生成 | 14（性能） |
| 中 | M11 Ollama 状态过期 | 15（隐私预期） |
| 低 | L1-L11 | 16+（随迭代逐步修复） |
