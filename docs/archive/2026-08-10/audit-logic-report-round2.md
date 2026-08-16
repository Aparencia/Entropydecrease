# 熵减项目第二轮逻辑合理性审计报告

> 审计日期：2026-08-04（第一轮修复后）
> 审计范围：同步引擎（客户端）、AI 网关剩余模块、React 前端未覆盖 features、Electron 补充模块、第一轮修复回归审查
> 方法：逐文件走查 + 关键发现交叉验证（含与第一轮修复的联动分析）
> 统计：**34 项问题 = 8 高 / 14 中 / 12 低**（详见各分报告）

## 分报告索引

| 分报告 | 内容 | 数量 |
|--------|------|------|
| [audit-gateway-round2.md](audit-gateway-round2.md) | AI 网关剩余模块（14 项：4高/6中/4低） | 14 |
| 本报告 §一 | 同步引擎（含 SYNC-H1 联动回归） | 9 |
| 本报告 §二 | React 前端未覆盖 features | 8 |
| 本报告 §三 | Electron 补充与第一轮遗留 | 3 |

---

# 一、客户端同步引擎（最高优先级——与第一轮 SYNC-H1 修改直接联动）

## SYNC2-H1（高）— 冲突解决后本地日志未清理，resolve 后永久循环冲突（第一轮修复引入的联动缺陷）

- **位置**：[SyncEngine.ts:264-299](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/SyncEngine.ts) — `resolve()`；[oplogSyncChannel.ts:65-86](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/oplogSyncChannel.ts) — `oplogPush()`
- **问题**：第一轮 SYNC-H1 将服务端冲突判定收紧为 `client version <= server version`（拒绝相同版本覆盖）。但客户端 oplog 的版本号是**本地日志序号**（`getNextVersion` 本地 max+1），与多设备场景下的服务端版本收敛无关。冲突实体的本地日志（v1/v2/v3）被拒后**不会 markLogsSynced**（只有 accepted 才标记），resolve 提交 v4 后服务端 ev=4——下次 push 时 v1/v2/v3 仍全部 `<= 4` 再次冲突 → **每次同步都弹出同一批冲突，用户无论选择 local/remote 都无法终结**。
- **影响**：冲突实体的同步永久卡死；用户反复面对冲突对话框；数据在本地/云端间漂移。
- **触发条件**：任何双设备并发编辑产生冲突后（SYNC-H1 生效后必然出现）。
- **修复**：`resolve()` 成功后，将该实体所有未同步日志标记 synced（或删除）——resolve 已代表该实体最终状态；同时在 `oplogPush` 的 conflicts 处理中，对冲突实体的本地日志做一次"压缩"（仅保留最新一条）。
- **优先级**：高（与第一轮修改联动，是当前最可能被用户踩到的回归）

## SYNC2-H2（高）— oplogPush 冲突对象 localData 硬编码 '{}'，选择"保留本地"清空实体数据

- **位置**：[oplogSyncChannel.ts:78](file:///d:/Program%own/aicode/work%20space/Entropydecrease/client/src/lib/sync/oplogSyncChannel.ts) — `oplogPush()` conflicts 构造
- **问题**：`localData: '{}'` 写死；`localVersion` 取 `logs.find(...)` 即**第一条（最小版本）**日志。`SyncEngine.resolve('local')` 执行 `safeJsonParse(conflict.localData)` 得到 `{}` 空对象作为最终数据提交 → 被冲突实体的**全部字段被空对象覆盖**。
- **影响**：用户在前端 ConflictDialog 选择"保留本地"时，服务端实体被清空（数据永久丢失）；同时该空数据被广播到其他设备。
- **触发条件**：任何冲突后用户选择"保留本地"。
- **修复**：构造冲突时从本地 Dexie 读取该实体当前数据序列化为 `localData`；`localVersion` 取该实体最后一条日志的 version；`resolve` 的 local 分支直接读库而非信任冲突对象。
- **优先级**：高

## SYNC2-H3（高）— SyncEngine pause()/resume() 死锁，同步引擎永久瘫痪

- **位置**：[SyncEngine.ts:94-121](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/SyncEngine.ts) — `pause()/resume()`
- **问题**：`pause()` 置 `syncInProgress = true`；`sync()` 的 finally 在 `paused` 时**故意不清锁**；`resume()` 用 50ms 轮询等待 `syncInProgress === false` 且**无超时**。若 pause 发生在无 sync 运行时（路径切换流程先 pause 再 resume 是标准用法），锁被 pause 置位后**永远无人清除** → `resume()` 永久挂起，后续所有 `sync()` 返回 'Sync already in progress'。
- **影响**：存储路径切换等关键操作永久挂起；同步功能整体瘫痪直至应用重启。
- **触发条件**：任何 `await syncEngine.resume()` 的流程（存储路径切换是常态路径，不是概率事件）。
- **修复**：`pause()` 不置 `syncInProgress`（改为独立的 paused 标志即可阻止 sync）；或 resume 轮询带超时上限并强制清锁；或记录进行中的 sync Promise 供 resume 直接 await。
- **优先级**：高

## SYNC2-H4（高）— operationLog synced 字段写入 boolean、查询用 number(0/1)，oplog push 链路静默失效

- **位置**：[operationLog.ts:63,88](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/storage/operationLog.ts) — `logOperation()/markLogsSynced()`（写入 `synced: false/true`）；[operationLog.ts:72,79,96](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/storage/operationLog.ts) — `getUnsyncedLogs/getUnsyncedLogsBatch/cleanupSyncedLogs`（查询 `.equals(0)/.equals(1)`）
- **问题**：IndexedDB 键相等判定要求**同类型**——boolean `false` 与 number `0` 不相等。写入 boolean 而查询 number → `getUnsyncedLogs` **永远返回空** → oplog push 从未推送任何日志；`useMode` 的"未同步数据检查"恒为 0，切换本地模式时未同步数据**静默丢弃**。
- **影响**：oplog 模式同步完全失效（CRDT 模式不受影响）；用户切换模式丢数据。
- **触发条件**：任何启用 oplog 同步的写操作（当前若默认 CRDT 模式则影响面受限，但模式切换即触发）。
- **修复**：写入统一为 `0/1`（或查询统一 `equals(false/true)`），两侧一致；修复前加运行时断言验证查询非空。
- **优先级**：高

## SYNC2-L1~L5（低）

- **L1** [oplogSyncChannel.ts:120-123](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/oplogSyncChannel.ts) — pull 游标推进与落库非原子：单条持续失败时每次全量重放（幂等不丢数据，但停滞）。
- **L2** [SyncEngine.ts:62-78](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/SyncEngine.ts) — autoSync 把"已在同步中"计为失败，无谓拉大退避（最多 5min）。
- **L3** [crdtSyncChannel.ts:29-32](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/crdtSyncChannel.ts) — crdtPush 按表循环取"全局前 50 条"，扩展第二张表后存在推送延迟。
- **L4** [OfflineQueue.ts:46](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sync/OfflineQueue.ts) — enqueue 版本号取"最新 createdAt"而非"最大 version"，同毫秒入队顺序不定。
- **L5** [writeWithLog.ts:165-174](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/storage/writeWithLog.ts) — CRDT 内存 doc 前滚与持久化非原子，写入失败后实体同步异常（MissingDependencyError）。

---

# 二、React 前端未覆盖 features（8 项，详见分报告 §一至§八）

## FRONT2-M1（中）— 费曼 step1 输入讲解后点"下一步"直接跳到 step3

- **位置**：[feynmanStepSlice.ts:32-35](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/feynman/store/feynmanStepSlice.ts) + [useFeynmanSession.ts:117-126](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/feynman/hooks/useFeynmanSession.ts)
- **问题**：`setExplanation` 在 step1 自动推进 currentStep=2，随后 `handleNext` 再无条件 `advanceStep` → 2→3，跳过 step2 讲解视图。
- **影响**：流程状态机语义错误（无数据丢失，但用户看不到 step2 页面）。
- **修复**：step1 分支只保存不推进，统一由 `advanceStep` 推进一次。

## FRONT2-M2（中）— 番茄钟 tick 墙钟校准完成分支无音效/通知

- **位置**：[usePomodoroStore.ts:544-623](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/pomodoro/store/usePomodoroStore.ts)
- **问题**：两套完成逻辑并存，墙钟校准归零分支不含任何音效与通知。
- **影响**：休眠唤醒后阶段完成无提示，错过转换。
- **修复**：抽统一 `handlePhaseComplete()` 共用。

## FRONT2-M3（中）— 珊瑚连击/打卡/学习进度多处 UTC 日期与本地日期混用

- **位置**：[worldState.ts:69-83](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/retention/lib/worldState.ts)、[streakEngine.ts:61-62](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/retention/lib/streakEngine.ts)、[useLearningProgress.ts:108](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/dashboard/hooks/useLearningProgress.ts)
- **问题**：`toISOString().split('T')[0]` 取 UTC 日期 / `new Date("YYYY-MM-DD")` 按 UTC 午夜解析。UTC+8 用户凌晨 00:00-08:00 的种植/学习被判入前一天；跨自然日连击断裂（8/4 23:50 与 8/5 00:10 被判同一天）；打卡进度查询取到 UTC 昨天。
- **影响**：连击统计错误、进度条凌晨时段显示 0、打卡断裂。
- **修复**：统一使用本地日期工具（复用 `useCheckIn.todayStr` 写法）。

## FRONT2-M4（中）— useEcosystemStore.plantCoral 快照式并发覆盖

- **位置**：[useEcosystemStore.ts:68-106](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/retention/store/useEcosystemStore.ts)
- **问题**：读快照 → async 写库 → 整体 `set({ corals })` 覆盖。两个番茄钟会话同时完成时后写者用旧快照覆盖前者 → store 中珊瑚丢失、totalDepth 少算（DB 有但 UI 态丢）。
- **修复**：写库后重新读库再 set，或函数式合并。

## FRONT2-M5（中）— CryptoManager 加密初始化失败 fail-open + 密钥材料明文落 localStorage

- **位置**：[CryptoManager.ts:39-58,148-160](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/encryption/CryptoManager.ts)
- **问题**：① init 派生失败置 key=null 不抛错 → 后续加密走"未就绪"分支**明文写入敏感字段**，用户以为已加密；② 32 字节密钥材料 + salt 明文存 localStorage，注释声称"若 Electron 环境可用 safeStorage 则优先使用"但**从未实现 safeStorage 分支**。
- **影响**：加密静默失效；任何 XSS 可直接读密钥解密全部数据。
- **修复**：init 失败显式标记未加密状态并在 UI 提示；Electron 改用 safeStorage（IPC）存密钥材料。
- **优先级**：中（安全）

## FRONT2-M6（中）— useAudioPlayer.play() 不清理进行中的 fadeOut interval

- **位置**：[useAudioPlayer.ts:79-90](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/hooks/useAudioPlayer.ts)
- **问题**：fadeInMs 未配置时 play() 不执行 clearFade，淡出中的 interval 继续运行 → 音量持续递减到 0 并 pause。
- **修复**：play() 开头无条件 clearFade()。

## FRONT2-M7（中）— convertWeakPointsToFlashcards 循环无事务（重复建卡）

- **位置**：[feynmanStepSlice.ts:197-209](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/feynman/store/feynmanStepSlice.ts)
- **问题**：逐条 createCard + updateWithLog，中途失败重试时**重复建卡**。
- **修复**：先批量创建（成功集）再统一标记 mastered。

## FRONT2-M8（中）— useVoiceInput stop/start 并发竞态（旧 stop 停掉新采集）

- **位置**：[useVoiceInput.ts:52-73](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/assistant/hooks/useVoiceInput.ts)
- **问题**：watchdog 静音超时 `void stop()` 与用户 toggle `start()` 并发时，旧 stop 的 audio_capture_stop 停掉新采集。
- **修复**：序列化 stop/start（pending 标志）。

---

# 三、Electron 补充与第一轮遗留

## ELEC2-M1（中）— MCP Manager init 失败后 initialized 不重置（第一轮已报告未修复）

- **位置**：[mcpManager.ts:55-57](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/mcpManager.ts) — `init()`
- **问题**：`this.initialized = true` 在 fork/init 请求失败后不重置（catch 只 killBridge）→ MCP 功能本次运行永久静默禁用，渲染层无提示。
- **修复**：init 失败后重置 initialized 并支持延迟重试（指数退避）；bridge 内为每个 server connect 加独立超时（15s）。
- **优先级**：中

## ELEC2-L1（低）— windowManager 退出同步状态机不随窗口重建重置

- **位置**：[windowManager.ts:32-33](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/windowManager.ts) — 模块级 `syncBeforeQuitRequested/Completed`
- **问题**：macOS activate 重建窗口后，新窗口 close 时 `syncBeforeQuitRequested=true` 且 `syncBeforeQuitCompleted=false` → 永远 preventDefault 无法关闭。
- **修复**：窗口创建时重置两标志（或改挂在窗口实例上）。
- **优先级**：低

## ELEC2-L2（低）— AudioCapture 运行时降级与 stop 的竞态窗口

- **位置**：[audioCapture.ts:210-226](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/audioCapture.ts) — `degradeToEndpoint()`
- **问题**：通过 `!this.capturing` 守卫后、`startWithKind` await 期间 stop() 置 capturing=false，降级仍会重启 provider → 幽灵采集。
- **修复**：startWithKind 前二次校验 capturing；降级结果以 capturing 最新状态为准。
- **优先级**：低

---

# 四、第一轮修复回归审查结论

| 修复项 | 回归结论 |
|--------|----------|
| SYNC-H1（Push 版本 <= 冲突） | ⚠️ **发现联动缺陷 SYNC2-H1**：客户端 resolve 后不清理冲突日志 → 永久循环冲突，需客户端配合修复 |
| GW-H3 流式限流 | ⚠️ **发现新缺陷（网关报告 #2）**：Lua 原子回滚 + 路由层手动回滚双重 DECR，配额可被刷穿 |
| GW-M12 限流 Lua 原子化 | 同上（双重回滚是该修复引入） |
| CL-H5 rateCard 锁 | ✅ 正常（try/finally 释放，双击已拦截） |
| CL-M2 流式读取超时/cancel | ✅ 正常（Promise.race + reader.cancel，lint/test 通过） |
| ALG-H1 FSRS S0 权重 | ✅ 正常（44 项算法测试通过，TDZ 已修复） |
| SYNC-M3 CRDT 哈希幂等 | ✅ 正常（go test 通过，同设备重试幂等） |
| GW-H1 信号量、H2 预算记账 | ✅ 正常（193 pytest 通过） |

---

# 五、修复优先级建议（第二轮）

1. **立即（高）**：
   - SYNC2-H3 pause/resume 死锁（必然触发，同步引擎瘫痪）
   - SYNC2-H1 resolve 后日志清理（与第一轮 SYNC-H1 联动，冲突循环）
   - SYNC2-H2 localData='{}'（选"保留本地"即清空数据）
   - 网关 #1 ES256 认证断裂（当前 .env 下全站 401）
   - 网关 #2 流式限流双重回滚（配额刷穿）
2. **本周（中）**：SYNC2-H4 synced 类型一致、网关 #3/#4、FRONT2-M1~M8、ELEC2-M1
3. **排期（低）**：SYNC2-L1~L5、网关 #11~#14、ELEC2-L1/L2

## 联动修复说明（SYNC-H1 配套）

SYNC-H1 的方向正确（相同版本不得静默覆盖），但服务端语义收紧后**客户端必须同步收敛**：
1. `resolve()` 成功后清理该实体全部未同步日志（SYNC2-H1）
2. 冲突对象的 localData 必须携带真实本地数据（SYNC2-H2）
3. 修复后需回归测试：双设备并发编辑 → 冲突 → 三种策略解决 → 双方数据收敛且不再重复冲突
