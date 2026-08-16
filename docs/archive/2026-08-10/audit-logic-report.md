# 熵减项目全量逻辑合理性审计报告

> 审计日期：2026-08-04
> 审计范围：client（Electron 主进程 + React 渲染进程）、server/ai-gateway（FastAPI）、server/sync-service（Go/Gin）、website（Next.js）
> 方法：逐文件静态走查 + 关键路径交叉验证（Grep 佐证），核心结论均对照源码确认
> 统计：**69 项问题 = 18 高 / 33 中 / 18 低**（含前端专项报告 docs/audit-frontend-report.md 的 26 项）

## 问题总览

| 模块 | 高 | 中 | 低 | 合计 |
|------|----|----|----|------|
| 同步服务 (Go) | 2 | 4 | 4 | 10 |
| AI 网关 (Python) | 10 | 15 | 5 | 30 |
| 客户端/Electron | 5 | 11 | 8 | 24 |
| 学习算法 (FSRS/SM2) | 1 | 2 | 2 | 5 |
| 官网 (Next.js) | 0 | 0 | 1 | 1 |
| **合计** | **18** | **32** | **19** | **69** |

---

# 一、同步服务（server/sync-service）

## SYNC-H1（高）— Push 相同版本号静默覆盖，双设备并发编辑丢数据

- **位置**：[sync.go:95](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/sync.go) — `Push()`
- **问题**：冲突判定为 `op.Version < ev.Version`（仅拒绝旧版本）。当两台设备基于同一服务端版本 v1 各自编辑产生**相同版本号 v2、不同内容**时，先到达者写入 v2，后到达者 `v2 == v2` 不触发冲突，**直接覆盖前者内容**。行锁 `FOR UPDATE` 只防了 TOCTOU，未防版本语义漏洞。
- **影响**：双设备并发编辑时静默丢失一方修改（数据丢失），无冲突提示、无合并机会。
- **触发条件**：两台设备几乎同时基于同一版本编辑同一实体（笔记/卡片）。
- **修复**：冲突判定改为 `op.Version <= ev.Version` 时返回冲突（客户端拿到 ServerData 后可做 LWW 裁决）；或服务端对 `==` 场景返回 `conflicts` 列表携带服务端数据，由客户端决定。
- **优先级**：高
- **测试**：构造双设备同版本并发 Push，断言后者收到冲突而非覆盖；验证 `==` 版本但内容相同的幂等重试不受影响（配合 op.ID 幂等去重）。

## SYNC-H2（高）— handleSyncRequest 无并发限制，WS 慢查询 DoS

- **位置**：[ws_connection.go:124](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/ws_connection.go) — `readPump()` / `handleSyncRequest()`
- **问题**：客户端可在一个 WS 连接上连续发送任意数量 `sync_request`，每个都启动一个 goroutine 查库（含 15s 超时）。无并发上限、无请求节流——单连接即可打满数据库连接池（上限 50），拖垮所有用户。
- **影响**：认证用户可低成本制造服务不可用；慢查询堆积时全局 DB 连接耗尽。
- **触发条件**：脚本或异常客户端高频发 sync_request。
- **修复**：每连接限制并发查询数（如 1-2 个在飞查询，其余合并/丢弃）；查询结果缓存去抖（同游标短时间不重复查）。
- **优先级**：高
- **测试**：单连接并发发 100 个 sync_request，断言在飞查询 ≤2 且服务端无错误。

## SYNC-M1（中）— Resolve 端点无版本校验且不广播

- **位置**：[sync_resolve.go:44-111](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/sync_resolve.go) — `Resolve()`
- **问题**：① `local`/`manual` 策略直接以客户端提供的 `req.Version` 覆盖服务端（可小于当前版本，制造版本回退）；② 未加行锁（与 Push 的 M1 防护不一致，仍有 TOCTOU 窗口）；③ 成功后不调用 `BroadcastOperation`，其他在线设备只能等下一次 Pull 才收敛。
- **影响**：版本回退后其他设备 Pull 到旧数据产生连锁冲突；在线设备实时性延迟。
- **触发条件**：客户端 bug 或异常请求携带小版本号；多设备在线时解决冲突。
- **修复**：版本必须 `> ev.Version` 才接受（否则返回当前服务端数据让客户端重新裁决）；事务内加 `FOR UPDATE` 行锁；成功后构造 Operation 广播。
- **优先级**：中
- **测试**：提交小于当前版本号的 resolve 断言被拒；双设备在线时 resolve 后另一设备立即收到广播。

## SYNC-M2（中）— Push 广播条件缺陷：无 ID 操作被接受但不广播

- **位置**：[sync.go:193](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/sync.go) — `Push()` 广播段
- **问题**：广播前提 `len(opSeqNoByID) > 0`——`opSeqNoByID` 只登记有 ID 的操作。若批次中操作均无 ID（服务端生成 fallback ID，L118-121），变更已落库但**不广播**；且 `accepted` 列表存的是原始 `op.ID`（可能为空串），客户端无法对应确认。
- **影响**：其他设备同步延迟（需手动 Pull）；客户端确认语义失效。
- **触发条件**：客户端未携带 op.ID 的推送（网络重试路径易出现）。
- **修复**：广播遍历改为基于"被接受的实体+版本"列表（而非 ID 映射）；accepted 返回 opID（含 fallback）。
- **优先级**：中
- **测试**：推送无 ID 操作批次，断言其他设备收到广播且响应中 accepted 非空。

## SYNC-M3（中）— CRDTPush 无幂等去重，重复推送存储膨胀

- **位置**：[crdt.go:36-89](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/crdt.go) — `CRDTPush()`
- **问题**：与 Push 不同，CRDT changeset 无 `(user_id, device_id, op_id)` 唯一索引，网络重试会导致同一 changeset 重复落库、重复分配序号、重复被 Pull 拉取。Automerge 应用幂等可掩盖语义问题，但存储与拉取流量成倍增长。
- **影响**：长连接重试频繁时 operations 表膨胀；Pull 数据量增大拖慢同步。
- **触发条件**：客户端断网重试 CRDT 推送。
- **修复**：为 CRDTChange 增加 `(user_id, device_id, changeset_hash)` 唯一约束，重复时返回已接受；或客户端先查服务端已确认序号再补发。
- **优先级**：中
- **测试**：重复推送同一 changeset，断言仅落库一次且序号不重复分配。

## SYNC-L1（低）— Status 端点全表 Count 无优化

- **位置**：[sync_query.go:72-88](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/sync_query.go) — `Status()`
- **问题**：`Operation` 表无上限的 `COUNT(*)`，数据量大时（数百万行）查询耗时，且该端点无缓存。
- **影响**：同步状态轮询变慢；运维监控误报延迟。
- **修复**：缓存计数（分钟级 TTL）；或从 GlobalSeqNo 推导近似值。
- **优先级**：低

## SYNC-L2（低）— Pull/CRDTPull 的 deviceId 参数未校验

- **位置**：[sync_query.go:22](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/sync_query.go) — `Pull()`；[crdt.go:98](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/handlers/crdt.go) — `CRDTPull()`
- **问题**：deviceId 直接拼入 SQL 条件（参数化安全），但空值时 `device_id != ''` 会让客户端拉到自己设备的变更造成回环；且无长度限制（超长串仅增加索引扫描成本）。
- **影响**：变更回环（客户端重复应用自己的操作）；极端长参数微性能损耗。
- **修复**：复用 `isValidDeviceID()` 校验，缺失时返回 400。
- **优先级**：低

## SYNC-L3（低）— AutoMigrate 生产环境风险

- **位置**：[database.go:52](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/models/database.go) — `InitDB()`
- **问题**：生产环境使用 GORM `AutoMigrate`：不删除多余列、不处理数据回填、多副本同时启动可能竞争 DDL 锁；索引变更不生效。
- **影响**：schema 漂移与生产环境意外；索引缺失导致查询退化。
- **修复**：改用显式版本化迁移（golang-migrate/atlas），AutoMigrate 仅限开发。
- **优先级**：低

## SYNC-L4（低）— 设备在线状态仅 Redis 表达，WS 与 Redis 状态可能漂移

- **位置**：[redis.go:94-104](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/sync-service/cache/redis.go) — `SetDeviceOnline()`
- **问题**：Push 时 `SetDeviceOnline` 刷新集合 TTL（24h），但连接断开由 `unregister` 异步移除——若 Redis 短暂不可用（降级为 no-op），集合残留离线设备条目最多 24h。
- **影响**：在线设备展示不准确（低影响，仅影响推送目标判断——广播实际以内存 wsManager 为准，Redis 集合仅用于展示）。
- **修复**：可接受；如需精确，改为 WS 心跳刷新 + 短 TTL（5min）。
- **优先级**：低

---

# 二、AI 网关（server/ai-gateway）

## GW-H1（高）— 并发信号量从未启用，AI 调用并发无界

- **位置**：[main.py:80-102](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/main.py)；全代码库
- **问题**：`ai_semaphore`(20)/`ai_heavy_semaphore`(3) 创建后挂到 `app.state`，但全代码库**无任何 `acquire()` 调用**（Grep 验证）。注释宣称的 Phase3 并发控制未落地。
- **影响**：突发流量直接打满上游 provider 配额、耗尽线程池与内存。
- **修复**：在 `FallbackProvider.generate` 等统一入口 `async with` 信号量；重型任务（视频/多模态）走 heavy 信号量。
- **优先级**：高
- **测试**：100 并发压测断言同时进行的 provider 调用 ≤ 配置值。

## GW-H2（高）— 预算中间件完全失效（记账 user 写死 "system"）

- **位置**：[fallback.py:181-182](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/config/fallback.py) — `record(user_id="system", ...)`；[budget.py:40-46](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/cost/budget.py) — `BudgetMiddleware`
- **问题**：全代码库唯一记账调用写死 `user_id="system"`，而预算中间件查询真实 `request.state.user_id` 的日用量——每个真实用户累计恒为 0，`BUDGET_DAILY_TOKEN_LIMIT`(200K)/`DAILY_COST_LIMIT`(2元) 永不触发。
- **影响**：用户无限消费 AI 资源，成本失控，日限额管控形同虚设。
- **修复**：从 `request.state.user_id` 取真实用户传入记账（保留 system 级总账）。
- **优先级**：高
- **测试**：两次调用后断言 `cost:{user_id}:tokens:{today}` 已累计；超限后返回 429。

## GW-H3（高）— 流式端点绕过全部限流

- **位置**：[rate_limit.py:88-89](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/rate_limit.py)；[streaming.py:260-353](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/streaming.py)
- **问题**：限流中间件明确承认 `/{feature}/stream` 通配路径"无法精确匹配"并声称路由内部自处理——但 streaming.py **内部没有任何限流代码**。流式端点完全免频控。
- **影响**：攻击者可用流式端点（通常更长更贵）无限消耗配额，触发上游封号。
- **修复**：在 streaming 路由内复用 `RateLimiter` 做 Redis 滑动窗口限流；或中间件对 `/stream` 后缀做包含匹配。
- **优先级**：高
- **测试**：10 并发 stream 请求断言第 N+1 个被拒。

## GW-H4（高）— SSE 超时/异常路径不关闭上游生成器，连接泄漏 + 幽灵计费

- **位置**：[streaming.py:302-342](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/streaming.py) — `stream_completion`；[chat.py:131-170](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/chat.py)
- **问题**：`asyncio.wait_for(agen.__anext__(), timeout)` 超时后直接 break/return，**从未 `await agen.aclose()`**——上游 HTTP 连接保持打开，模型继续生成并按 token 计费。streaming.py 还缺少 `request.is_disconnected()` 检测（chat.py 有）。
- **影响**：每个超时请求泄漏上游连接；超时后仍产生计费 token；客户端断连不中断生成。
- **修复**：所有退出路径 `try/finally` 中 `await agen.aclose()`；每轮循环检测断连。
- **优先级**：高
- **测试**：mock 永不发 token 的 async generator，断言超时后 aclose 被调用。

## GW-H5（高）— Gemini 多图推理同步调用阻塞事件循环

- **位置**：[gemini_provider.py:171](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/gemini_provider.py) — `generate_vision_multi`
- **问题**：同文件其他方法均用 `asyncio.to_thread` 包裹同步 SDK 调用，唯独 `generate_vision_multi` 直接同步调用 `self._client.models.generate_content(...)`（google-genai 为同步阻塞 API）。
- **影响**：一个多图请求（30-60s）冻结整个事件循环，所有用户所有请求（含健康检查）全部超时。
- **修复**：改为 `await asyncio.to_thread(...)`，与文件内其他方法一致。
- **优先级**：高
- **测试**：mock SDK 延迟 1s，断言事件循环中其他协程不被阻塞。

## GW-H6（高）— to_thread + wait_for 无法真正取消，线程池可耗尽

- **位置**：[gemini_provider.py:74-79](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/gemini_provider.py)、[base_provider.py:54-57](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/base_provider.py)
- **问题**：`asyncio.wait_for(asyncio.to_thread(同步调用), timeout)` 超时只能取消外层协程，线程内的同步调用继续跑完。google-genai SDK 无客户端 timeout，内部重试可达数分钟。默认线程池 `min(32, cpu+4)`，慢调用堆积即耗尽，后续所有 to_thread（含健康检查）排队。
- **影响**：Gemini 网络挂起时全服务 AI 功能不可用且表现为超时无错误。
- **修复**：独立 `ThreadPoolExecutor` + 超时后 `shutdown(wait=False, cancel_futures=True)`；或改用 SDK async 客户端。
- **优先级**：高
- **测试**：mock SDK 阻塞 10s、超时 1s，断言线程池空闲数 5s 内恢复。

## GW-H7（高）— 多模态请求体无大小限制（内存 DoS）

- **位置**：[multimodal_schemas.py:17](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/multimodal_schemas.py) — `image_base64`；[input_validation.py:20](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/input_validation.py)
- **问题**：`image_base64` 无 `max_length`；`InputValidationMiddleware` 只覆盖 `/api/v1/ai/` 前缀，**multimodal 端点（/api/v1/multimodal/）完全不经过校验**。`analyze-session` 允许 100 帧 × 无单帧限制 → 请求体可达数百 MB。
- **影响**：单请求 OOM 崩溃；base64 解码膨胀 ~1.33×。
- **修复**：所有 base64 字段加 `max_length`（如 14M 字符）；中间件覆盖 multimodal/asr 前缀。
- **优先级**：高
- **测试**：发送超限 body 断言 413/422。

## GW-H8（高）— 视频上传同步文件拷贝阻塞事件循环

- **位置**：[multimodal_video.py:76](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/multimodal_video.py) — `shutil.copyfileobj`
- **问题**：同步拷贝 500MB 文件阻塞事件循环数秒至数十秒；大小检查依赖 content-length（chunked 可绕过），先落盘后才发现超限。
- **影响**：单个大视频上传冻结所有请求；磁盘可被恶意大文件占满。
- **修复**：`asyncio.to_thread` 包裹；边收边计字节数超限立即 abort 并删除临时文件。
- **优先级**：高
- **测试**：上传 500MB 时其他接口延迟正常；超限文件被清理。

## GW-H9（高）— ffprobe/ffmpeg 同步子进程阻塞事件循环

- **位置**：[video_analyze_chain.py:57,78](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/chains/video_analyze_chain.py) — `subprocess.run(...)`
- **问题**：`subprocess.run` 每次最长阻塞 30s/15s，并发视频分析请求相互拖垮。
- **修复**：`asyncio.create_subprocess_exec` + `await asyncio.wait_for`；受 heavy 信号量约束（与 GW-H1 联动）。
- **优先级**：高

## GW-H10（高）— FallbackProvider.generate 缺 **kwargs，全链路降级直接 TypeError

- **位置**：[fallback_provider.py:30-38](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/fallback_provider.py) — `generate()`
- **问题**：签名无 `**kwargs`，而 17+ 处 chain 调用 `provider.generate(..., _feature="...")`。云端全部失败走 FallbackProvider 时抛 `TypeError: unexpected keyword argument '_feature'`——设计好的友好降级内容永不返回（同文件 `transcribe` 已修，`generate` 漏修）。
- **影响**：上游全挂时所有功能返回 500 而非降级内容，学习流程中断。
- **修复**：`generate` 签名加 `**kwargs`（或显式 `_feature=None`）。
- **优先级**：高
- **测试**：mock 所有 provider 抛错，断言返回 fallback 内容而非 TypeError。

## GW-M1（中）— 熔断器 CLOSED 状态成功不重置失败计数

- **位置**：[circuit_breaker.py:102-112](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/circuit_breaker.py) — `on_success`
- **问题**：`on_success` 仅在 OPEN/HALF_OPEN 时重置 `_failure_count`；CLOSED 下失败计数只增不减 → 5 次**分散**失败（非连续）也会熔断，正常流量下误熔断。
- **修复**：CLOSED 成功时也清零；或改用时间窗口计数。
- **优先级**：中

## GW-M2（中）— 健康探活无超时 + 冷却期内探活直接恢复

- **位置**：[provider_bootstrap.py:120](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/provider_bootstrap.py)、[base_provider.py:316](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/base_provider.py) — `health_check`
- **问题**：探活走 `with_retry_and_timeout`（超时=300s × 3 次 → 单 provider 探活最长 900s）；熔断冷却期内探活成功直接 `on_success` 恢复 CLOSED，**绕过冷却期**。
- **修复**：探活独立短超时（5-10s）；探活成功仅标记，仍需等冷却结束；并发探活加锁。
- **优先级**：中

## GW-M3（中）— JWKS 获取无连接池 + 缓存击穿 + 失败时返回过期缓存

- **位置**：[auth.py:146](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/auth.py) — `_fetch_jwks`
- **问题**：每次 `asyncio.to_thread(httpx.get)` 新建 TCP+TLS 连接；`_jwks_cache` 无锁（冷启动并发刷新击穿）；获取失败返回**过期缓存**（密钥轮换后旧 token 继续有效）；`GATEWAY_ALLOW_DEV_AUTH=true` 跳过全部签名验证。
- **修复**：共享 AsyncClient + asyncio.Lock + fail-closed；dev 模式显式告警。
- **优先级**：中

## GW-M4（中）— KeyPool 全冷却时返回冷却中 key，mark_unavailable 死代码

- **位置**：[key_pool.py:76-81](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/config/key_pool.py) — `next_key`
- **问题**：所有 key 冷却时返回 `self._keys[0]`（正在冷却的 key）必然失败；`mark_unavailable` 全代码库无调用——"熔断联动剔除 key"从未生效，被 429 的 key 持续被打。
- **修复**：全冷却返回 None 由调用方跳过；429/401 时调用 mark_unavailable。
- **优先级**：中

## GW-M5（中）— with_retry_and_timeout 对确定性错误重试（重试风暴）

- **位置**：[base_provider.py:66-71](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/base_provider.py) — `with_retry_and_timeout`
- **问题**：捕获所有 Exception 重试 2 次，含 401（密钥失效）、400（参数错误）等确定性错误——fallback 链最多 3 provider × 3 次 = 9 次无效调用。
- **修复**：仅重试可重试错误（超时/5xx/连接错误）；401/400 直接上抛。
- **优先级**：中

## GW-M6（中）— 上游错误细节透传客户端

- **位置**：[main.py:210-223](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/main.py) — AIError 处理器
- **问题**：`str(异常)` 原样写入响应，可能含 provider 内部信息、prompt 片段、配额详情。
- **修复**：客户端仅返回通用错误码；完整错误脱敏后仅记日志。
- **优先级**：中

## GW-M7（中）— Redis 连接失败后永不重连（限流失效窗口）

- **位置**：[redis_cache.py:48-50](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/cache/redis_cache.py) — `connect`
- **问题**：失败置 `_client=None` 后无重连机制；Redis 重启后限流（fail-open）、缓存、预算全部静默失效。
- **修复**：惰性重连（指数退避）或后台重连任务；暴露 health 指标。
- **优先级**：中

## GW-M8（中）— chunked 编码绕过 1MB body 限制

- **位置**：[input_validation.py:38-50](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/input_validation.py)
- **问题**：1MB 检查只看 Content-Length；chunked 请求跳过检查且 body 全量读入内存。
- **修复**：`request.stream()` 边读边计数，超限 413。
- **优先级**：中

## GW-M9（中）— Prompt 防护可绕过（>1000 字符跳过 + 数组只检前 20 项）

- **位置**：[prompt_guard.py:108-111,123](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/prompt_guard.py)
- **问题**：`len(data) > 1000` 直接跳过检测（长文注入是主流载体）；数组只检测前 20 项。
- **修复**：删除长度跳过逻辑（分块扫描）；数组全量检测。
- **优先级**：中

## GW-M10（中）— 响应缓存键不含 user_id，跨用户共享 AI 输出

- **位置**：[summarize.py:72](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/summarize.py)、[generate_cards.py:83](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/generate_cards.py)
- **问题**：缓存键 = `sha256(text + options)`（输入确定性哈希、可预测），不含 user_id——用户 B 提交相同文本可命中用户 A 的缓存结果，含隐私内容时存在交叉泄漏。
- **修复**：缓存键前缀 `user_id`；敏感内容不缓存。
- **优先级**：中

## GW-M11（中）— 匿名用户共享同一限流桶

- **位置**：[rate_limit.py:167-225](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/rate_limit.py)
- **问题**：`user_id="anonymous"` 对所有未认证请求统一——恶意用户可耗尽匿名配额误伤合法匿名用户；无 IP 维度。
- **修复**：匿名按 IP + 设备指纹分桶；收紧匿名配额。
- **优先级**：中

## GW-M12（中）— 限流回退计数可负、并发不精确

- **位置**：[rate_limit.py:167-225](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/rate_limit.py)
- **问题**：失败回退用 decr（并发请求中一个失败会误减他人占用；无下限保护可为负；计数与 TTL 非原子）。
- **修复**：Lua 脚本原子处理占用/释放/过期；或放弃回退直接拒绝。
- **优先级**：中

## GW-M13（中）— balance 路由每请求新建 3 个 HTTP 客户端 + 缓存击穿

- **位置**：[balance.py:47,77,188](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/balance.py)
- **问题**：每请求 `httpx.AsyncClient()` 新建（无连接池复用）；5 分钟缓存到期时并发请求同时回源。
- **修复**：模块级共享 AsyncClient；缓存击穿用 asyncio.Lock。
- **优先级**：中

## GW-M14（中）— API key 轮换竞态 + 旧客户端不关闭

- **位置**：[base_provider.py:323-338](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/base_provider.py) — `_rotate_api_key`
- **问题**：`api_key` 赋值与 `_reinit_client` 无锁（并发请求读到新旧混合状态）；旧 AsyncOpenAI 客户端从不 close（连接池 fd 泄漏）。
- **修复**：asyncio.Lock 保护轮换；轮换后 `await old.aclose()`。
- **优先级**：中

## GW-M15（中）— 音频转写无大小限制 + segments/confidence 恒空/硬编码

- **位置**：[transcribe.py:31](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/routers/transcribe.py)、[qwen_provider.py:164-166](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/providers/qwen_provider.py)
- **问题**：`audio_base64` 无 max_length 且 /api/v1/asr/ 不在校验覆盖范围；segments 恒空、confidence 硬编码 0.9（未解析真实值）。
- **修复**：加 max_length；解析真实 segments/confidence 或从响应移除。
- **优先级**：中

## GW-L1~L5（低）

- **L1**：[semantic_cache.py](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/cache/semantic_cache.py) 全文件无调用者（死代码，嵌入成本白付）。
- **L2**：[text_dedup.py](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/utils/text_dedup.py) 逐条两两比较 O(n²)，大输入 CPU 显著。
- **L3**：[runtime.py](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/config/runtime.py) `_FEATURE_CONTEXT` 成功路径不重置（建议 try/finally 统一）。
- **L4**：[errors.py](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/errors.py) `RateLimitExceededError` 的 feature 实为 provider 名，监控聚合误导。
- **L5**：[virtual_key.py](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/server/ai-gateway/middleware/virtual_key.py) 虚拟 key 仅 64 位随机熵，建议 ≥128 位。

---

# 三、客户端 / Electron（client）

> 完整专项报告见 [audit-frontend-report.md](audit-frontend-report.md)（26 项）。以下为本报告整合的核心条目 + 本审计补充发现（CLI 编号为前端报告编号）。

## CL-H1（高）— screen_capture_stop 未结算防抖中的 start Promise，渲染层永久挂起

- **位置**：[screenCaptureHandlers.ts:116-132](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/screenCaptureHandlers.ts) — `screen_capture_stop` handler（关联 `pendingStartResolve`）
- **问题**：start 有 500ms 防抖，防抖期间 `pendingStartResolve` 悬挂；`screen_capture_stop` 只清定时器+dispose，**从未调用 `pendingStartResolve`** → 渲染层 `invoke('screen_capture_start')` 的 Promise 永不 resolve。与 start 分支（61-64 行）的结算逻辑不对称。
- **影响**：快速"开始→停止"（真实用户路径）或课堂采集帧超时重启（stop→200ms→start）时渲染层永久卡死。
- **修复**：stop/dispose 中对称结算：`pendingStartResolve?.({ success: false }); pendingStartResolve = null;`
- **优先级**：高
- **测试**：start 后立即 stop，断言 invoke resolve；stop→start→stop 连续操作无悬挂。

## CL-H2（高）— importTable 迁移列错位（IndexedDB → SQLite 静默数据损坏）

- **位置**：[migration.ts:106-128](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/migration.ts) — `importTable()`
- **问题**：列名从第一行推断（`Object.keys(rows[0])`），但每行插入按**该行自己的 key 顺序**取值（位置对应）。行间字段集合/顺序不一致时（历史版本可选字段、undefined 序列化差异——几乎必然存在），值按位置错位写入，SQLite 不校验列类型**静默写入**。
- **影响**：存量数据迁移后 title/content 互换、时间戳错列，迁移完成标记已打，数据不可逆错乱，FTS 索引也基于错位数据。
- **修复**：每行显式按首行列集合取值并补齐缺失项：`cols.map(c => item[c] ?? null)`。
- **优先级**：高
- **测试**：构造字段乱序/缺失的行集合，断言插入后各列值正确。

## CL-H3（高）— db:search LIKE 降级路径无 LIMIT

- **位置**：[dbIpcHandlers.ts:237-251](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/dbIpcHandlers.ts) — `db:search` LIKE 分支
- **问题**：FTS5 无命中时降级 LIKE，`%的%` 等常见词可全表扫描并全量返回（同步执行阻塞主进程 + 大 IPC 传输）。
- **修复**：LIKE 分支统一 `LIMIT 20`。
- **优先级**：高

## CL-H4（高）— FTS5 rebuildIndex 同步重建阻塞主进程事件循环

- **位置**：[fts5Search.ts:173-190](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/fts5Search.ts) — `rebuildIndex()`；调用点 [main.ts:171-181](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/main.ts)
- **问题**：better-sqlite3 同步 API 单事务逐行 INSERT 全部文档；启动 setTimeout 只是延后，回调内仍同步阻塞；migration:complete 路径在 IPC handler 内同步执行。
- **影响**：数万文档时启动后窗口/托盘/IPC 阻塞数秒至数十秒（白屏/无响应）。
- **修复**：分批执行并 `await setImmediate()` 让出事件循环；或 worker_threads。
- **优先级**：高

## CL-H5（高）— rateCard 重复提交竞态：双击评分同一卡片被调度两次（补充发现）

- **位置**：[useStudySessionStore.ts:215-366](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/flashcards/store/useStudySessionStore.ts) — `rateCard()`
- **问题**：`rateCard` 为 async，`isFlipped` 检查（L219）与状态推进（L334-365）之间存在 `await createWithLog(...)`（L305）窗口。快速双击评分时两次调用都通过 `isFlipped` 检查、读到相同的 `currentIndex`/`card` → **同一卡片被 FSRS/SM2 调度两次**，写入两条复习记录，dueDate 基于同一旧状态重复计算（第二次结果错误地少推进一轮）。
- **影响**：复习数据污染（双倍复习记录、间隔计算错误、统计失真）；FSRS stability 错乱。
- **触发条件**：双击/触屏误触评分按钮——高频真实场景。
- **修复**：进入 rateCard 后立即置位"处理中"标志（同步 set 或模块级 in-flight 锁），await 完成后才清除；或将状态推进移到 await 之前（先同步更新 UI 状态再落库）。
- **优先级**：高
- **测试**：快速连点评分按钮，断言仅创建一条复习记录且卡片只调度一次。

## CL-M1（中）— 网关代理 method/路径未校验（补充确认）

- **位置**：[gatewayHttp.ts:67-68](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/ai/gatewayHttp.ts) — `executePost()`；[streamHandler.ts:46-56](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/ai/streamHandler.ts) — `ai:stream:start`
- **问题**：`ai:stream:start` 的 `method`（实际是 API 路径）无格式/白名单校验，直接拼入 `${base}${method}`，可含 `?`/`#` 注入参数、访问任意网关路径。
- **修复**：路径前缀白名单校验（`/api/v1/ai/` 开头、不含 `?`/`#`/空白）；HTTP 方法参数化 + 白名单。
- **优先级**：中

## CL-M2（中）— 流式响应读取阶段无超时 + [DONE] 提前返回不 cancel 流（补充发现）

- **位置**：[gatewayStream.ts:62-68,91-140](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/ai/gatewayStream.ts) — `postJsonStream()`
- **问题**：① 超时 `clearTimeout` 在 fetch 完成后立即执行（L67-68）——**流式读取阶段无任何超时**，服务端建连后不发数据则 `reader.read()` 永久挂起（默认 300s 超时形同虚设）；② `[DONE]` 时直接 `return`（L113）且异常路径（L100）**均未 `reader.cancel()`/`resp.body.cancel()`**，响应流未消费完则底层 TCP 连接保持打开直到 GC（连接泄漏）；③ 外部 signal abort 后循环未检查信号仍继续读。
- **影响**：网关挂起时渲染进程永久等待（配合 streamHandler 无整体超时）；长期使用 fd/连接缓慢增长。
- **修复**：读取阶段用 `Promise.race([read(), timeout])` 或 `AbortSignal.timeout` 重新武装；所有 return/throw 路径 `finally` 中 `await reader.cancel()`；循环内检查 `externalSignal.aborted` 后 break。
- **优先级**：中
- **测试**：mock 服务端建连后不发数据，断言流在超时后终止且 reader 被 cancel；[DONE] 后断言连接资源释放。

## CL-M3~M11（中）— 见前端专项报告

- **M3** safeHandleBatched 调用方永远拿不到结果（[ipcUtils.ts:150-177](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/ipcUtils.ts)）
- **M4** resolveSource 每次截图全量枚举窗口 + 1920×1080 缩略图（[screenCapture.ts:166-186](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/screenCapture.ts)）
- **M5** db:batch 无条数上限，单事务长期持写锁（[dbIpcHandlers.ts:258-296](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/dbIpcHandlers.ts)）
- **M6** columnCache 永不过期，运行期 ALTER 后新列被过滤、数据静默丢弃（[sqliteRepository.ts:110-124](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/sqliteRepository.ts)）
- **M7** MCP Bridge 将主进程全部环境变量传给第三方 server 子进程（[mcpBridge.ts:143-148](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/mcpBridge.ts)）——供应链攻击可读取宿主凭据
- **M8** setDisplayMediaRequestHandler 全局放行无来源校验（[displayMediaHandler.ts:38-72](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/displayMediaHandler.ts)）——XSS 后可静默录屏+系统音频
- **M9** dbFileMigrator copyFile 直接覆盖目标库 + 备份固定名互相覆盖（[dbFileMigrator.ts:156-183,232-241](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/db/dbFileMigrator.ts)）
- **M10** 帧超时 watchdog 无限重启无上限无退避（[captureManager.ts:482-493](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/capture/captureManager.ts)）——与 CL-H1 叠加成永久挂起链
- **M11** callWithLocalFallback 本地探测缓存过期即静默跳过本地推理（[gatewayHttp.ts:152-180](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/electron/ai/gatewayHttp.ts)）

## CL-L1~L11（低）— 见前端专项报告

- **L1** fs:read-file 无大小限制可整库读取 userData；**L2** ai:set-gateway-url 端口/路径不受限；**L3** backup:save 无内容/大小限制；**L4** update:install/download 无状态机校验；**L5** chatRepository limit 无钳制；**L6** preload 专用监听绕过事件白名单；**L7** schema ALTER 空 catch 吞异常 + 无条件打版本号；**L8** video_record_stopped 无 sender 校验；**L9** ai:stream 活跃流窗口销毁不清理；**L10** uncaughtException 仅记日志不退出；**L11** saveAIConfigAction 静默吞掉网关 URL 同步失败。

---

# 四、学习算法（FSRS / SM-2）

## ALG-H1（高）— FSRS 参数与官方 FSRS-5 权重错配（算法正确性）

- **位置**：[fsrs.ts:48-84,192](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/fsrs.ts)
- **问题**：注释声明"19 个权重参数来自 fsrs-rs 官方默认值"，但初始稳定性使用**硬编码的 FSRS-4 时代常量** `S0 = [0.4, 0.6, 2.4, 9.0]`、初始难度 `D0 = [4.3, 3.3, 2.6, 1.0]`，**没有使用权重 `w[0]-w[3]`**（官方 FSRS-5 初始稳定性 `S0(G) = w[G-1]`，即 0.4872/1.4003/3.7145/13.8206）。同时 `W[6]` 定义后未参与任何计算（死权重）。`stabilityAfterSuccess` 中 `S/S0[rating]` 使用的 S0 与官方语义（初始稳定性）不同——此处 S0 应代指"该评分对应的初始稳定性常量"，与官方实现一致性与数值均有偏差。
- **影响**：所有卡片的初始 stability/difficulty 与官方 FSRS-5 不一致 → 间隔计算系统性偏差（新卡 Easy 间隔偏短、难度更新曲线不同）；由于调度状态会自我迭代，偏差会持续影响长期复习节奏（不是崩溃级 bug，但是算法正确性缺陷；用户换用官方 FSRS 工具复习同卡片时体验不一致）。
- **触发条件**：所有走 FSRS 策略的卡片。
- **修复**：① 使用权重初始化：`S0(rating) = W[0..3][rating]`（按 rating 索引），D0 按官方公式 `w[4] * exp(d0 * w[5])` 或采用 fsrs-rs 的 D0 表；② 删除未使用的 W[6] 或按官方公式接入；③ 增加与 fsrs-rs 实现的数值对拍测试（同一输入序列断言 stability/difficulty/interval 一致，误差 < 1e-6）。
- **优先级**：高（算法正确性，影响全部 FSRS 用户）
- **测试**：从 fsrs-rs 官方测试向量取 50 组 (card, rating, days_elapsed) 输入，断言输出完全一致；新增卡 → 多次复习的序列回归测试。

## ALG-M1（中）— sm2() 对缺失 easeFactor 产生 NaN 传播

- **位置**：[sm2.ts:94-101](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sm2.ts) — `sm2()`
- **问题**：`card.easeFactor + (0.1 - ...)`——若调用方传入的卡片 `easeFactor` 为 `undefined`（历史数据缺字段、JSON 反序列化遗漏），结果为 `NaN`。`Math.max(NaN, 1.3)` 返回 `NaN`（Math.max 遇 NaN 返回 NaN），随后 `newInterval = Math.round(NaN * ...)` = NaN、`dueDate` = **Invalid Date**，且所有后续复习基于 NaN 无限传播。
- **影响**：复习记录产生 Invalid Date（时间戳损坏）、间隔显示异常、FSRS 迁移反推 stability 失败。
- **触发条件**：数据库中 easeFactor 缺失/损坏的单条记录（IndexedDB 历史数据、迁移错位——与 CL-H2 联动）。
- **修复**：入口防御 `const ef = Number(card.easeFactor) > 0 ? card.easeFactor : 2.5;`；对结果做 `Number.isFinite` 兜底。
- **优先级**：中
- **测试**：传入 `{ easeFactor: undefined }` 断言回退 2.5；传入 NaN/0/负数断言安全回退。

## ALG-M2（中）— 复习提交无失败回滚，落库异常导致状态漂移

- **位置**：[useStudySessionStore.ts:288-318](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/flashcards/store/useStudySessionStore.ts) — `rateCard()`
- **问题**：`await createWithLog(flashcardReviewStore, ...)`（L305）失败时直接抛异常——复习记录未写入但 UI 停留在原状态（isFlipped 仍 true、可再次评分重试 → 与 CL-H5 叠加产生重复调度）；或 review 已写入但 `updateCard`（L309）抛错，卡片状态未更新 → 卡片与复习记录永久不一致。
- **影响**：数据不一致（重复记录/状态漂移）；异常未被 UI 捕获时表现为按钮无响应。
- **修复**：① 将"review 写入 + card 更新"包成单个事务语义（先写 card 或先写 review 均可，但失败时明确回滚其一）；② 捕获异常后重置 in-flight 锁并 toast 提示；③ 写入前对 result 做 `Number.isFinite` 校验（防 ALG-M1 的 NaN 落库）。
- **优先级**：中
- **测试**：mock 存储写入失败，断言 UI 恢复可操作且无半写状态。

## ALG-L1（低）— FSRS 惰性迁移的 stability 反推对长间隔卡偏差

- **位置**：[fsrs.ts:185-189](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/fsrs.ts)
- **问题**：从 SM-2 interval 反推 stability 的公式 `S = interval / (9 * (1/R - 1))` 是"理想遗忘曲线"假设，忽略用户实际复习表现（R 实际非 0.9）；旧卡迁移后首次 Again 评分时 `stabilityAfterFailure` 会基于该近似值计算。
- **影响**：迁移卡片的首次 FSRS 复习间隔可能与用户预期偏差较大（一次性的，可接受）。
- **修复**：可接受；如要更精确，用 `lapses` 与历史 review 数据做对数拟合。
- **优先级**：低

## ALG-L2（低）— sm2 goldenErrorMultiplier 语义与注释不符

- **位置**：[sm2.ts:139-145](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/lib/sm2.ts)
- **问题**：注释写"建议值 0.3-0.7"，但 Golden Error 场景在 store 层（[useStudySessionStore.ts:262-266](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/client/src/features/flashcards/store/useStudySessionStore.ts)）未传 `goldenErrorMultiplier`，而是用 `compressForGoldenError` 后处理（interval 封顶 1 天）——两条机制并存但只有后者生效，`goldenErrorMultiplier` 实际是死参数。
- **影响**：无行为错误；参数冗余易误导后续维护。
- **修复**：二选一——删除 multiplier 参数或统一走 multiplier 路径（保留注释明确"已由 store 层后处理替代"）。
- **优先级**：低

---

# 五、官网（website）

## WEB-L1（低）— DownloadCta 无重试/超时，源站不可达时静默回退

- **位置**：[DownloadCta.tsx:42-53](file:///d:/Program%20own/aicode/work%20space/Entropydecrease/website/components/DownloadCta.tsx)
- **问题**：`fetch(latest.json)` 无超时控制（AbortController 仅用于卸载清理）。CDN 域名解析挂起（DNS 超时可达 30s+）时下载按钮一直显示"约 120 MB"的兜底值，用户无法区分"加载中"与"源站故障"。
- **修复**：加 5s 超时；加载态显示；重试一次后回退 GitHub。
- **优先级**：低
- **测试**：mock fetch 挂起，断言 5s 后展示 GitHub 回退入口。

---

# 六、跨模块联动风险与修复优先级汇总

## 联动风险场景

| 场景 | 涉及问题链 |
|------|-----------|
| 上游 provider 全挂 | GW-H10（降级 TypeError）→ GW-M5（重试风暴）→ GW-M2（探活 900s）|
| 高并发突发 | GW-H1（信号量未启用）→ GW-H6（线程池耗尽）→ GW-M7（Redis 抖动放大）|
| 恶意攻击面 | GW-H3（流式免限流）→ GW-H7/H8/M8/M15（大 body DoS）→ GW-M9（注入绕过）→ GW-M3/M11（认证/限流绕过）→ CL-M1（代理路径未校验）→ CL-M8（displayMedia 全局放行）|
| 成本失控 | GW-H2（预算失效）→ GW-H4（幽灵计费）→ GW-M4（冷却 key 重打）|
| 复习数据污染 | CL-H5（双击重复调度）→ ALG-M2（半写状态）→ ALG-M1（NaN 传播）→ CL-H2（迁移列错位源头）|
| 采集链卡死 | CL-H1（stop 挂起）→ CL-M10（watchdog 无限重启）→ CL-M4（全量缩略图放大）|

## 建议修复顺序（按最短生产事故路径）

1. **GW-H2 预算记账 user_id**（1 行修复，成本失控直接止住）
2. **GW-H10 FallbackProvider.generate 加 **kwargs**（1 行修复，全挂时降级生效）
3. **GW-H3 流式端点限流**（攻击面最大）
4. **CL-H5 rateCard 重复提交锁**（用户高频路径数据污染）
5. **CL-H1 screen_capture_stop 结算 pending Promise**（用户可见永久挂起）
6. **GW-H1 并发信号量启用** + **GW-H5/H6/H8/H9 事件循环阻塞**（可用性）
7. **CL-H2 迁移列错位**（存量数据损坏，尽早修复再发版）
8. **ALG-H1 FSRS 权重对齐**（算法正确性，需版本化变更——旧用户数据兼容）
9. **GW-H4 SSE aclose** + **CL-M2 流式读取超时/cancel**（资源泄漏）
10. **SYNC-H1 Push 版本 == 冲突**（双设备数据丢失）
11. 其余中危按模块排期（详见各模块）
