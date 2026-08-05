# 第三轮逻辑审计报告（audit-logic-report-round3）

- 审计对象：第二轮 34 项修复的全部新增代码（提交 7ef8ad8..064f636，7 个提交；含同步引擎 9 项、AI 网关 14 项、React 前端 8 项、Electron 3 项）
- 审计方式：3 个子代理并行全量走读（网关 Python / 同步引擎 TS / 前端+Electron）+ 主线程逐项复核（含 Dexie 源码级验证、Redis 序列化行为核对、前端消费方核对、Dexie orderBy 非索引行为实测确认）
- 结论：发现 **19 个真实问题（2 高 / 8 中 / 9 低）**，其中 2 项为本轮修复引入的回归（OfflineQueue SchemaError、JWKS 宽限窗口失效）；**19 项全部已修复并提交（beed8b4）**；另有 6 项报告不修（既有/产品决策/低危）

---

## 一、已修复问题（提交 beed8b4）

### 高危（2）

#### R3-H1. OfflineQueue `orderBy('version')` 非索引字段 → Dexie SchemaError，离线入队全面失效
- **位置**：[OfflineQueue.ts:48](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/OfflineQueue.ts) `enqueue`（SYNC2-L4 引入的回归）
- **技术原因**：`offlineQueue` 表 schema 为 `'id, entityType, entityId, createdAt, retryCount'`（database.ts:105），`version` 不在索引中。Dexie 源码 `getIndexOrStore`（dist/dexie.js:2004-2009）对非索引 keyPath 抛 `Schema('KeyPath ... is not indexed')`——`orderBy('version')` 在 toArray 执行时必然抛错。原实现 `orderBy('createdAt')`（已索引）正常。既有代码 `getPendingItems`/`getReadyItems` 也使用 `orderBy('version')`（一直未工作，被 `isEmpty()` 短路掩盖）。
- **影响**：离线场景（`!isOnline`）所有 `createWithQueue/updateWithQueue/deleteWithQueue` 写操作抛异常（本地数据已写入但调用方收到错误）；离线重放功能失效。测试未覆盖（OfflineQueue.test.ts 仅测 calculateBackoff，db 全 mock）。
- **修复**：enqueue/getPendingItems/getReadyItems 全部改用 `sortBy('version')`（Dexie 内存排序，任意字段可用；队列数据量小性能可接受）。

#### R3-H2. JWKS 网络失败无条件复用过期缓存 → 宽限窗口形同虚设，越权窗口无上限
- **位置**：[auth.py:234-244](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/auth.py) `_fetch_jwks`
- **技术原因**：GW-2#8 的宽限窗口（TTL+300s）只在锁外检查；网络失败分支 `if _jwks_cache is not None: return` **无条件**复用，缓存年龄超过 3900s 后锁外条件失效、锁内双重检查不查 `retry_after` → 每次请求进锁打端点（10s 超时串行阻塞），失败后继续复用过期缓存 → 密钥轮换后的旧 token 越权窗口无限延长。
- **修复**：网络失败与 5xx 分支均增加"缓存年龄 < TTL+GRACE"检查（超出即 fail-closed）；锁内双重检查补 `retry_after` 复用分支（消除锁内并发风暴）；5xx 与网络类同等降级（4xx 保持 fail-closed）。

### 中危（8）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| M1 | error_pattern.py:125-129 | 缓存命中路径绕过 GW-2#3 校验，`ErrorPatternResponse(**cached)` 严格构造 → 缺字段 LLM 输出二次请求 500 | 提取 `_filter_patterns` 共用；缓存前清洗数据；命中路径同样过滤 |
| M2 | base_provider.py:73-79 + 4 provider generate | wrapper 统一轮询后 provider 内部 `_rotate_api_key()` 未删除 → 双重轮询，n=2 时每次步进 2 模 2 恒 0，第二 Key 永不使用 | 删除 4 个 provider generate 内部 rotate |
| M3 | writeWithLog.ts:171-177 | catch 中 `resetTable` 失败（IndexedDB 异常）传播到主写入流程，"降级路径"反成阻塞异常 | 嵌套 try/catch 保护 |
| M4 | SyncEngine.ts:201-204 | pause 期间 sync 完成时 finally 跳过清锁（paused=true）→ 锁残留，resume 轮询 15s 超时才恢复 | finally 无条件清锁（pause 靠 paused 标志阻止新 sync） |
| M5 | feynmanStepSlice.ts:209-221 | catch 路径 DB 标记 mastered 但 zustand store 未同步（set 在 throw 后不执行）→ 重试对已建卡 wp 重复建卡（声称的 M7 修复未达成） | catch 内同步 store |
| M6 | windowManager.ts:81-85 | 重置退出同步状态机未清 `syncTimeoutTimer` → 旧 timer 回调（`!syncBeforeQuitCompleted` 重置后必为 false）触发 `completeSyncBeforeQuit` → app.quit()，重建窗口被意外退出 | createMainWindow 清理 timer |
| M7 | rate_limit.py:199-207 | global 超限时 Lua 只回滚 global 层，feature 层已 INCR 未回滚（删除流式双重回滚后泄漏残留）→ 每次超限请求把 feature 计数 +1 | global 超限分支回滚 feature_key（DECR 抵消本请求占用，并发语义正确） |
| M8 | CryptoManager.ts:170-180 | safeStorage 解密失败自动重建密钥并覆写 → 旧密钥材料丢失，此前加密的全部敏感字段永久不可解密（无恢复路径） | 解密失败绝不重建，异常传播到 init → initFailed + 抛错，保留旧密文等待恢复 |

### 低危（9）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| L1 | operationLog.ts:104 | `l.synced === 0` 不匹配旧 boolean false/undefined → resolve 后旧日志永久孤数据（不 push 不清理，未来迁移为 0 会重新触发冲突循环） | 改为 `l.synced !== 1` |
| L2 | streakEngine.ts:20-23 | parseLocalDate 无格式校验：空串 → `new Date(0,-1,0)`（1899 年）；ISO 串 → NaN → gap=NaN → 连击被静默错误减半 | 正则校验 + daysBetween 对 NaN 返回 Infinity（走断裂语义） |
| L3 | useEcosystemStore.ts:49 | checkBleaching 仍用 toISOString UTC 日期（FRONT2-M3 口径不完整）→ UTC+8 凌晨种植白化判定偏差一天 | initialize 用本地日期拼接 |
| L4 | useEcosystemStore.ts:112-121 | restore() 仍用旧快照整体覆盖（plantCoral 已修，restore 未修） | restore 末尾重读库再 set |
| L5 | worldState.ts:89-91 | `(prev-curr)/86400000 === 1` 精确相等，未来日期格式变更（本地时区偏移）时 DST 23/25h 抖动断连击 | Math.round 容差 |
| L6 | useVoiceInput.ts:92-98 | start 等待 stop 超时静默放弃，用户点击无响应 | setError 明确提示 |
| L7 | gemini_provider.py:307-320 | 逐 chunk `asyncio.to_thread` 用默认线程池，流式并发占满默认池影响其他组件 | 改用 `run_in_provider_pool`（GW-H6 专用池） |
| L8 | qwen_vision.py:103-108 | vision_extract 主 provider 是 qwen，截断检测字段只 GLM 返回 → 检测对主链路完全无效 | qwen generate_vision 返回 max_tokens |
| L9 | app.py:33 | jwt_algorithm 未规范化，小写 `hs256` 配置 → jose 未知算法名全站 401 | strip().upper() |

---

## 二、报告未修（6 项，均非本轮引入或需产品决策）

> ✅ 已全部修复并提交 `9e625ca`（2026-08）——仅 X3（Gemini 流式取消）按"接受线程隔离策略"处理：Python 线程不可强杀，改用 AsyncClient 需 SDK 侧重构，风险高于收益，维持现状并已在 GW-H6 注释说明。

| # | 位置 | 问题 | 修复（已实施） |
|---|------|------|------|
| X1 | CryptoManager.ts:42 / mcpManager.ts:63 | `init()` 均无调用方 → FRONT2-M5 safeStorage 加密路径与 ELEC2-M1 重试逻辑整体未激活（dead code） | AuthContext 登录生命周期接入 cryptoManager.init（登出 clear，失败 toast 提示）；mcpManager 加 `shuttingDown` 标志 + shutdown 复位 retryAttempts |
| X2 | env.d.ts vs electron.d.ts | 双份 `electronAPI` 声明多处类型冲突（必选/可选、返回类型不一致），被 `skipLibCheck` 掩盖 | 删除 electron.d.ts 重复声明，env.d.ts 为唯一权威超集（保留空壳维持导入兼容） |
| X3 | gemini_provider.py 流式取消 | `wait_for` 超时取消后线程池中的同步 `next()` 继续阻塞（线程不可强杀），连接泄漏 | 接受隔离策略（GW-H6 注释）；已改用专用线程池（beed8b4） |
| X4 | fallback.py 记账 | Gemini 视觉/视频路径未返回 usage 拆分（走 60% 估算）；DeepSeek 缓存命中记账用原始 tokens 未用 effective_tokens | Gemini vision/multi/video 返回真实拆分；DeepSeek input 改用 cache_miss_tokens |
| X5 | error_pattern.py 缓存键 | 键含 flashcardId + 全量文本，但 chain 只消费前 20 条 correctAnswer/userAnswer → 命中率低 | 键仅含前 20 条 correctAnswer/userAnswer |
| X6 | rate_limit.py 启动校验 | 校验只覆盖 PATH_TO_FEATURE，streaming 的 `_FEATURE_TO_CONFIG_KEY`（16 个）不在范围 | 提取 `warn_missing_feature_config` 公共函数，streaming 注册表启动即校验 |

---

## 三、验证通过项（子代理复核确认无问题）

- fallback.py 记账 `if not input_tokens and not output_tokens`：input=0/output>0 不误判 ✓
- balance.py `get_primary_key`：`load_key_pools` 在 lifespan 先于请求执行，未加载时回退单数配置不更差 ✓
- rate_limit 启动校验：30 个 feature 全部登记，无误报 ✓
- TopOffender.count 容错：`int(float("nan"))` 抛 ValueError → 容错 0，无 NaN ✓
- 429 后 Key 轮换：同 provider 不同 slot 第二次调用经 wrapper rotate 跳过冷却 Key，机制有效 ✓
- gemini to_thread 异常传播与 StopIteration 语义正确 ✓
- 流式路由删除 rollback 后：check 通过后失败扣配额为既有行为，未引入回归 ✓
- audioCapture 二次校验、useAudioPlayer clearFade、useVoiceInput stop/start 序列化主体、SyncEngine console.warn（正确修复）、FRONT2-M1 推进语义、mcpManager 重试计数边界 ✓

---

## 四、修复验证

- AI 网关：`python -m pytest tests/ -q` → **193 passed**
- 客户端：`npm run lint` → 0 errors；`npm run test` → **906 passed**（用户并行新增 31 个测试）
- Electron：`tsc -p electron/tsconfig.json --noEmit` → 我的修改文件 0 错误（剩余错误均为用户未提交的 recordingStorage.ts 工作区文件）
- 提交 `beed8b4` 已推送 dev（064f636..beed8b4），pre-commit 钩子通过

## 附：审计中的关键验证方法

- Dexie orderBy 非索引行为：直接阅读 node_modules/dexie/dist/dexie.js `getIndexOrStore`（2004-2009 行）确认抛 `Schema` 异常
- Redis 缓存序列化：核对 cache/redis_cache.py `get_ai_cache`/`set_ai_cache`（JSON 序列化原始 dict）
- 前端消费方核对：visionWorker.ts/sessionAnalyzer.ts 无 confidence 阈值过滤，0.3→0.0 契约变化无回归
