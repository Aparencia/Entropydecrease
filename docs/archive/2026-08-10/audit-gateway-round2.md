# AI 网关第二轮审计报告（audit-gateway-round2）

- 审计对象：`server/ai-gateway`（FastAPI + 多 Provider fallback 链 + Redis 限流/成本 + JWT 认证）
- 审计方式：全量代码走读（config / providers / chains / routers / middleware / cost / cache）+ 环境配置核对（`server/.env`）+ git 历史核对（d3be873「AI网关中低危修复」、950d54a「GLM flash max_tokens clamp 1024」）
- 结论：共发现 **14 个真实问题（4 高 / 6 中 / 4 低）**

## 问题总览

| # | 优先级 | 模块 | 一句话摘要 |
|---|--------|------|-----------|
| 1 | 高 | 认证 | `config/app.py` 硬编码 ES256，与 Supabase 默认 HS256 签发机制断裂，当前 .env 下全部 /api/ 请求 401 |
| 2 | 高 | 限流 | 流式路由在 Lua 原子回滚后再次手动回滚，双重回滚导致限流可被刷穿 |
| 3 | 高 | Chain/路由 | error_pattern 畸形输入与 LLM 缺字段输出直接 500（无字段校验） |
| 4 | 高 | Provider | GLM `generate_vision` 返回元数据缺 `max_tokens`，full 模式 4096 被 clamp 到 1024 后截断不可感知 |
| 5 | 中 | Provider | Gemini `generate_stream` 同步迭代阻塞事件循环 |
| 6 | 中 | 成本 | fallback 链 token 对半拆分记账，input/output 单价不同导致费用估算系统性失真 |
| 7 | 中 | 余额 | `balance.py` 只读单数环境变量，实际部署用复数 `DEEPSEEK_API_KEYS`，DeepSeek 余额查询被跳过 |
| 8 | 中 | 认证 | JWKS 获取 fail-closed 无降级，Supabase 短暂不可达即全站 401 |
| 9 | 中 | 超时/限流 | `TIMEOUT_CONFIG`/`RATE_LIMITS` 缺 `import_concept`，落到 300s 兜底超时与默认 10 次限流 |
| 10 | 中 | 缓存 | error_pattern 缓存键不含 user_id，跨用户结果串用（隐私数据泄露面） |
| 11 | 低 | 视觉 | `vision.py` 置信度硬编码 0.9/0.3，编造而非测量 |
| 12 | 低 | 文档 | fallback 链预算注释 *1.5，实现 *3.0，注释与代码漂移 |
| 13 | 低 | Provider | Key 轮询仅覆盖 `generate`，视觉/流式/ASR 路径恒用主 Key |
| 14 | 低 | 配置 | `.env` 中 `JWT_SECRET` 为死配置，实际读取的是 `SUPABASE_JWT_SECRET` |

---

## 问题详情

### 1.【高】JWT 算法硬编码 ES256，认证链路与 Supabase 默认签发机制断裂

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/config/app.py:27-28`（模块级 `APP_CONFIG`）
  - `server/ai-gateway/middleware/auth.py:36-49`（`_jwt_verification_configured`）、`auth.py:135-143`（`_resolve_jwks_url`）、`auth.py:146-172`（`_fetch_jwks`）

- **问题描述与技术原因**
  `app.py` 中 `jwt_algorithm` 被硬编码为 `"ES256"`，而 `jwt_secret` 从 `SUPABASE_JWT_SECRET` 读取（当前 `.env:47` 为空）。Supabase 默认使用 **HS256**（对称密钥 `SUPABASE_JWT_SECRET`）签发用户 JWT，只有用户在 Dashboard 中显式开启「自定义 JWT / 非对称签名」才会提供 JWKS 端点。硬编码 ES256 导致：
  1. `_jwt_verification_configured()` 对 ES256 只检查 `supabase_jwks_url`/`supabase_url` 是否非空——当前 `.env:50` 中 `SUPABASE_URL=https://your-project-id.supabase.co` 是**占位符**，非空 → 判定"已配置" → 不进入开发降级模式；
  2. 于是所有 `/api/` 请求走严格验签 → `_fetch_jwks` 请求占位符推导出的 `https://your-project-id.supabase.co/auth/v1/.well-known/jwks.json` → DNS/连接失败 → `auth.py:170-172` 直接 `raise` → `_verify_token`（auth.py:343-347）捕获后抛 `AuthenticationError(401)`；
  3. 即使 `SUPABASE_URL` 配置正确，只要 Supabase 项目未开启自定义 JWT（默认 HS256，JWKS 端点 404），同样全部 401。

- **实际影响**
  当前 `.env` 状态下**网关所有 `/api/` 业务请求 100% 返回 401**（`/health` 白名单除外）。这是服务不可用的级别，且由于 `_jwt_verification_configured()` 返回 True，开发降级模式也不会生效，排障者容易被"已配置"假象误导。

- **触发条件**
  - 立即触发：`SUPABASE_URL` 为占位符或不可达（当前 `.env` 即为该状态）；
  - 常态触发：Supabase 项目使用默认 HS256 签发，未配置 JWKS；
  - 唯一正常场景：Supabase 开启了自定义 JWT 且 JWKS 端点真实可达。

- **修复建议**
  1. `jwt_algorithm` 改为环境变量注入：`os.getenv("SUPABASE_JWT_ALGORITHM", "HS256")`，与 Supabase 默认机制对齐；
  2. `_jwt_verification_configured()` 对 HS256 必须校验 `SUPABASE_JWT_SECRET` 非空且非占位符；`SUPABASE_URL` 含 `your-project-id` 占位符时应视为未配置；
  3. 启动日志/健康检查输出实际生效的算法与密钥材料状态，避免"已配置"假象；
  4. 对 ES256 分支，JWKS URL 解析结果含占位符域名时应显式告警。

---

### 2.【高】流式路由限流双重回滚，可反复刷穿每日配额

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/routers/streaming.py:279-282`（`stream_ai`）
  - `server/ai-gateway/middleware/rate_limit.py:27-37`（`_LUA_CHECK_RATE`）、`rate_limit.py:215-228`（`_lua_check_limit`）、`rate_limit.py:231-250`（`rollback_rate_limit`）

- **问题描述与技术原因**
  Lua 脚本 `_LUA_CHECK_RATE` 在 `count > limit` 时**已在脚本内原子执行 `DECR` 回滚**并返回 `-1`（注释 GW-M12 明确说明"超限回滚在同一脚本内完成"）。但 `streaming.py:281` 在 `check_rate_limit` 返回 `False` 后**再次调用 `rollback_rate_limit`**，对 feature 计数与 global 计数各再 `DECR` 一次。
  进一步地，`rollback_rate_limit`（rate_limit.py:243-247）对 `global_key` 的 `DECR` 是**无条件的**——当超限发生在第一层 feature 检查时，global 计数根本未被 INCR，也会被 `DECR` 到负数（Redis 允许负数计数）。

- **实际影响**
  每次超限请求的净效果：Lua 回滚 1 次 + 路由再减 1 次（甚至 global 被减到 -1）。恶意用户反复发送超限请求即可把自己的计数刷低甚至清零，**每日配额限制被完全绕过**；同时全局计数被污染为负数，影响其他用户/维度的统计语义。

- **触发条件**
  用户对任一 `/{feature}/stream` 端点连续请求超过 `RATE_LIMITS` 上限（如 `chat: 100`）后，每次后续超限请求都会继续削减计数。

- **修复建议**
  1. 直接删除 `streaming.py:281` 的 `await rollback_rate_limit(...)` ——Lua 已原子回滚，超限路径无需也不应再回滚；
  2. `rollback_rate_limit` 增加"仅在本次调用确实 INCR 过对应 key"的语义（由调用方传入需回滚的层级，或脚本返回结构携带已占用的键清单）；
  3. 补充针对该场景的回归测试：连续超限请求后计数应保持不变（等于上限），而非持续下降。

---

### 3.【高】error_pattern 畸形输入 / LLM 缺字段输出直接 500

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/chains/error_pattern_chain.py:60-63`（`ErrorPatternChain.run` 输入文本构建）
  - `server/ai-gateway/routers/error_pattern.py:129-134`（`error_pattern` 响应构造：`PatternItem(**p)` / `TopOffender(**o)`）

- **问题描述与技术原因**
  两处都缺少防御性校验，与同目录 `quiz_gen_chain.py:38-61`（`_validate_question`）、`content_tier_chain.py:39-57`（`_validate_items`）的"逐项校验+过滤"模式形成鲜明反差：
  1. Chain 侧 `e['correctAnswer']`/`e['userAnswer']` 直接键索引（60-63 行），若调用方传入缺字段的 dict → `KeyError`；
  2. Router 侧对 LLM 输出不做任何清洗，直接 `PatternItem(**p)` 严格构造（129-134 行）。LLM 输出缺 `type`/`keywords`/`explanation`/`suggestion`（PatternItem）或 `flashcardId`/`count`（TopOffender）任一必填字段，pydantic 抛 `ValidationError`——该异常既不在 `try` 内（120-122 只捕获 `RuntimeError`），也无全局 handler 兜底 → **500**。

- **实际影响**
  JSON Mode 下 LLM 仍可能因输出截断（max_tokens=2048）或格式漂移而缺字段；一旦发生，前端拿到 500（非预期的结构化错误），且无降级/重试。输入侧若未来有其它调用方绕过 Pydantic 直接调 Chain，同样 500。

- **触发条件**
  - 请求体 `goldenErrors` 项缺少 `correctAnswer`/`userAnswer`（绕过 Pydantic 校验时）；
  - LLM 返回的 `patterns`/`top_offenders` 任一元素缺必填字段（截断、格式漂移、超长输出被 `[:20]` 截断后 JSON 仍合法但字段不全）。

- **修复建议**
  1. Chain 侧用 `e.get("correctAnswer", "")` + `str()` 归一化，并在构建输入文本前过滤空值项；
  2. Router 侧引入与 `quiz_gen_chain` 相同的静态校验器（`isinstance(p, dict)` + 必填字段 + 类型检查），非法项直接过滤；`TopOffender.count` 用 `int()` 强制转换并容错；
  3. 响应构造包一层 `try/except ValidationError`，异常时记录日志并返回 502/降级空结构而非 500。

---

### 4.【高】GLM `generate_vision` 返回元数据缺 `max_tokens`，full 模式截断不可感知

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/providers/glm_provider.py:247-252`（`generate_vision` 返回构造）
  - 对比 `glm_provider.py:320-327`（`generate_vision_multi` 返回构造，含 `"max_tokens": max_tokens`，注释明确"供 chain 侧截断检测使用"）
  - 消费侧：`server/ai-gateway/chains/vision_extract_chain.py:264`（full 模式 `max_tokens=4096`）、`vision_extract_chain.py:271-282`（调用与解析）

- **问题描述与技术原因**
  950d54a 已在参数层把 `max_tokens` clamp 到 1024（`glm_provider.py:205`），但 `generate_vision` 的**返回 dict 缺少 `"max_tokens"` 字段**，与 `generate_vision_multi`（326 行）不一致。`vision_extract_chain.run` 对 full 模式请求 4096 tokens（264 行），经 GLM clamp 后实际上限 1024——而 chain 侧没有任何基于实际 `max_tokens` 的显式截断检测（`_parse_response` 的"looks_like_json"抢救只是解析失败时的启发式猜测，且不会告警提示截断、不会触发降级重试）。

- **实际影响**
  full 模式（深度分析）在 GLM 上输出大概率在 1024 token 处被截断，返回残缺 JSON → 只抢救出 `text` 字段，`formulas/diagrams/keyPoints/codeBlocks/concepts` 全部丢失且**静默**——用户看到的内容不完整，但系统无任何截断告警、不重试、不降级到 qwen 付费模型，还会正常缓存该残缺结果。

- **触发条件**
  GLM 成为 `vision_extract` 实际 provider（DeepSeek/Qwen 视觉不可用时降级路径，或 GLM 直接作为 fallback）且请求 full 模式/长内容提取。

- **修复建议**
  1. `generate_vision` 返回 dict 补 `"max_tokens": max_tokens`（对齐 `generate_vision_multi`）；
  2. `vision_extract_chain` 消费该字段做显式截断检测：输出长度接近上限或 JSON 解析失败且 `looks_like_json` 时，记录 `truncated=True` 告警日志，并可让调用方重试（降低 max_tokens 或切换 provider）；
  3. 统一 GLM 文本/视觉的 max_tokens 语义（generate 已 clamp 1024，vision 也应保持一致并显式暴露）。

---

### 5.【中】Gemini `generate_stream` 同步迭代阻塞事件循环

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/providers/gemini_provider.py:291-301`（`GeminiProvider.generate_stream`）

- **问题描述与技术原因**
  `run_in_provider_pool`（base_provider.py:30-33，线程池隔离）只包住了**创建流**这一步（291-296 行），随后的 `for chunk in response`（297 行）是对 google-genai **同步 SDK** 生成器的同步迭代，直接在 asyncio 事件循环线程内执行——每个 chunk 的底层网络 IO（阻塞读）都卡住事件循环；301 行的 `await asyncio.sleep(0)` 只在两个 chunk 之间让出一次调度，块间等待期间的阻塞无法避免。对比 `qwen_provider.py:215` 的 `async for chunk in stream`（httpx 异步流）是正确的。

- **实际影响**
  `chat`/`{feature}/stream` 经 fallback 链落到 Gemini 时（`video_analyze` 主路径也是 Gemini），整个网关事件循环被同步网络 IO 阻塞：其它所有请求（含健康检查、Redis 限流）延迟升高，流式生成期间表现为"全站卡顿"；多路并发流式时问题叠加。

- **触发条件**
  fallback 链切换到 Gemini 的流式路径（如 `chat: ["deepseek","qwen","fallback"]` 链中没有 gemini，但 `video_analyze` 为 Gemini 主路径；任何直接使用 GeminiProvider.generate_stream 的调用）。

- **修复建议**
  1. 将同步迭代包装进线程池：`chunks = await run_in_provider_pool(lambda: list(response))` 后异步产出（牺牲流式增量，但恢复事件循环）；或
  2. 改用 google-genai 的 `AsyncClient`（`await client.aio.models.generate_content_stream(...)`）保持真正异步流式；
  3. 至少将 `response` 的迭代整体放入 `run_in_provider_pool` 的生成器包装，用 `asyncio.to_thread` 迭代并逐块 `await asyncio.sleep(0)` 产出。

---

### 6.【中】fallback 链 token 对半拆分记账，成本估算系统性失真

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/config/fallback.py:215-223`（`call_with_fallback` 内成本记录）
  - 对比 `server/ai-gateway/cost/tracker.py:22-32`（`PRICE_TABLE`）、`tracker.py:112-116`（`_calculate_cost`）

- **问题描述与技术原因**
  `fallback.py:221-222` 用 `tokens_used // 2` 把总 token 对半拆成 input/output。但 `PRICE_TABLE` 中 output 单价普遍是 input 的 2~3 倍（deepseek-chat 0.001/0.002、qwen-plus 0.004/0.012、qwen2.5-vl-72b 0.02/0.06）。真实调用中 output 占比往往远高于 50%（摘要类功能），对半拆分导致费用被系统性低估。

- **实际影响**
  `BudgetMiddleware`（`DAILY_COST_LIMIT=¥2`）基于该费用做预算判定：**低估费用 → 超预算用户未被拦截**，预算控制形同虚设；余额面板/报表费用同样失真。token 总量计数不受影响，仅金额维度错误。

- **触发条件**
  任何走 `call_with_fallback`/`call_with_fallback_stream` 的成功调用（全部非流式 + 流式路径），模型 output 单价高于 input 时即失真。

- **修复建议**
  1. Provider 层在返回 dict 中补充 `input_tokens`/`output_tokens`（OpenAI 兼容响应有 `usage.prompt_tokens`/`completion_tokens`，各 Provider 均可用），fallback 链优先使用真实拆分；
  2. 无法获取拆分时，按模型经验比例（如 output 占 60-70%）估算并加注释，而非无说明的对半；
  3. 成本记录失败目前是 `logger.debug` 静默（fallback.py:224-225），建议提升到 warning 并加采样指标。

---

### 7.【中】`balance.py` 用单数环境变量读 Key，`DEEPSEEK_API_KEYS`（复数）配置下余额查询被跳过

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/routers/balance.py:302-308`（`_query_all_balances`）
  - 根因：`server/ai-gateway/config/providers.py:42`（`AI_PROVIDERS["deepseek"]["api_key"] = os.getenv("DEEPSEEK_API_KEY", "")` 单数）
  - 对照：`server/ai-gateway/config/key_pool.py:18-23`（`_KEY_ENV_MAP` 优先复数变量）

- **问题描述与技术原因**
  网关实际部署只配置了复数变量 `DEEPSEEK_API_KEYS`（`.env:29`，两个 key 逗号分隔），由 `key_pool.py:117-127` 读取并注入 Provider（`provider_bootstrap.py:60` 用 `get_primary_key` 正常初始化）。但 `balance.py:303-304` 直接读 `AI_PROVIDERS[provider_key]["api_key"]`——该值来自单数环境变量 `DEEPSEEK_API_KEY`（providers.py:42，`.env` 中未设置 → 空）→ `is_valid_api_key("")` 为假 → **DeepSeek 余额查询被静默跳过**。QWEN 因 `.env` 恰好配置了单数 `QWEN_API_KEY` 而正常。

- **实际影响**
  余额面板缺失 DeepSeek 条目，用户无法查看主力 Provider（MODEL_ROUTING 主路由 deepseek）的余额/配额状态；运维无法在网关侧感知 DeepSeek 余额耗尽（只能等 401 报错）。

- **触发条件**
  仅配置复数 `DEEPSEEK_API_KEYS`（当前部署即如此）；同理影响 `GLM_API_KEYS`/`GEMINI_API_KEYS` 若未来配置为复数。

- **修复建议**
  1. `balance.py` 改用 `get_primary_key(provider_key) or cfg.get("api_key", "")`（与 `provider_bootstrap.py:49/60/71/83` 一致）；
  2. 更彻底：让 `AI_PROVIDERS` 的 `api_key` 读取逻辑统一收敛到 key_pool（复数优先、单数兜底），消除双轨不一致。

---

### 8.【中】JWKS 获取 fail-closed 无降级，Supabase 短暂不可达即全站 401

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/middleware/auth.py:146-172`（`_fetch_jwks`）、`auth.py:183-224`（`_get_es256_public_key`）、`auth.py:343-347`（`_verify_token` 捕获后 401）

- **问题描述与技术原因**
  `_fetch_jwks` 网络失败直接 `raise`（170-172 行），`_get_es256_public_key` 无缓存兜底，`_verify_token` 将其转换为 `AuthenticationError(401)`。设计注释（GW-M3）称"密钥轮换后过期缓存是越权窗口，fail-closed 更安全"——对**密钥轮换**场景合理，但当前实现把**网络抖动**与**密钥轮换**混为一谈：JWKS 端点 1 小时才刷新一次，期间 Supabase 任何一次网络故障都会让**全部**请求 401。

- **实际影响**
  Supabase 侧网络抖动/端点维护（分钟级）→ 网关全站业务不可用（认证风暴），且无自动恢复节奏（缓存过期后下一次请求又失败，持续 401）；配合问题 1（ES256 是唯一路径），可用性风险被放大。

- **触发条件**
  ES256 模式下 JWKS 请求失败：Supabase 网络故障、DNS 抖动、TLS 中断、或被限流（JWKS 端点有速率限制时高频刷新触发）。

- **修复建议**
  1. 区分两类失败：**网络/超时类** → 允许短暂复用过期缓存（如最多 5 分钟）并记录告警；**HTTP 4xx/密钥不匹配类** → fail-closed；
  2. 增加失败退避（失败后缓存 TTL 缩短重试，而非每次请求都打 JWKS）；
  3. 若已按问题 1 修复为 HS256 主路径，JWKS 仅作为自定义 JWT 的可选路径，此问题自然降级为低危。

---

### 9.【中】`TIMEOUT_CONFIG`/`RATE_LIMITS` 缺 `import_concept`，落入 300s 兜底超时与默认限流

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/config/limits.py:13-53`（`TIMEOUT_CONFIG`）、`limits.py:59-103`（`RATE_LIMITS`）
  - 影响点：`server/ai-gateway/providers/base_provider.py:62-66`（`with_retry_and_timeout` 兜底 `max(TIMEOUT_CONFIG.values()) = 300`）、`server/ai-gateway/middleware/rate_limit.py:176-177`（`RATE_LIMITS.get(feature, 10)` 默认 10）

- **问题描述与技术原因**
  `import_concept` 是已上线的真实功能（`routers/import_concept.py` 存在、`MODEL_ROUTING:131` 路由到 deepseek、`PROVIDER_FALLBACK_CHAIN:84` 有降级链、`rate_limit.py:96-97` 已注册路径映射），但 `TIMEOUT_CONFIG` 与 `RATE_LIMITS` **均未登记该 key**。后果：
  - 超时：`base_provider.py:62-66` 对未知 feature 取 `max(TIMEOUT_CONFIG.values())` = `video_analyze` 的 **300 秒**，且重试 3 次 → 单次请求最坏挂 900s；
  - 限流：`rate_limit.py:176` 兜底默认 **10 次/天**（与"概念化批量导入"的实际用量不匹配，偏紧）。

- **实际影响**
  import_concept 请求超时预算过宽（并发下堆积大量慢请求占线程/连接），限流额度与功能定位不符；同时 300s 兜底掩盖了"配置缺失"这一事实，排障困难。

- **触发条件**
  任何 `POST /api/v1/ai/import/concepts` 请求（功能已上线即触发）。

- **修复建议**
  在 `TIMEOUT_CONFIG` 补 `"import_concept": 30`（与同批 JSON Mode 链一致），在 `RATE_LIMITS` 补 `"import_concept": 10`（或按产品用量定值）；并增加启动时校验：`PATH_TO_FEATURE` 的 key 必须同时存在于 `TIMEOUT_CONFIG` 与 `RATE_LIMITS`，缺失即启动告警/失败，杜绝此类静默兜底。

---

### 10.【中】error_pattern 缓存键不含 user_id，跨用户结果串用

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/routers/error_pattern.py:80-93`（`error_pattern` 缓存读写）、`error_pattern.py:124-126`（写缓存）

- **问题描述与技术原因**
  缓存键为 `sha256(errors_str)`（85 行），`errors_str` 只含 `flashcardId:correctAnswer[:50]:userAnswer[:50]`（81-84 行），**不含 user_id**。错误模式分析结果基于用户私有的答题错误记录（属于敏感学习数据），不同用户只要提交内容相同即命中同一缓存。

- **实际影响**
  - 隐私：用户 B 提交相同错误内容时，直接返回用户 A 的分析结果（跨用户数据串用）；
  - 正确性：缓存命中时 `user_id` 不参与语义隔离，A 的分析结论可能被 B 当作自己的；答案截断 50 字符也放大了同键碰撞概率（虽小但存在）。

- **触发条件**
  两个用户提交完全相同（或前 50 字符相同）的错误记录；缓存存活期 1 小时内。

- **修复建议**
  1. 缓存键加入 user_id：`cache_key = hashlib.sha256(f"{user_id}:{errors_str}".encode()).hexdigest()`；
  2. 截断策略改为 hash 整段内容（`sha256` 本身就压缩长度，无需先截断 50 字符）；
  3. 顺带审查其它 AI 响应缓存是否同样缺用户维度隔离（如 `get_ai_cache`/`set_ai_cache` 的所有调用点）。

---

### 11.【低】`vision.py` 置信度硬编码编造

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/routers/vision.py:138-140`（`error_pattern` 同文件内 `vision_extract` 端点返回构造）

- **问题描述与技术原因**
  `confidence = 0.9 if has_content else 0.3` —— 仅依据"提取文本是否非空"给出固定值，并非模型置信度测量。文本非空就报 0.9 高置信，空就报 0.3，数值无任何统计意义。

- **实际影响**
  前端展示的置信度误导用户（低质量识别结果也显示 0.9）；若未来有基于置信度的业务判断（如"低置信重拍"）将产生错误决策。

- **触发条件**
  每次 `POST /api/v1/vision/extract` 响应。

- **修复建议**
  1. 移除该字段或标注 `confidence` 为"内容完整度"占位并明确语义；
  2. 若要真实置信度，由 Provider/Chain 返回（如 GLM/Qwen 的 logprobs 或解析完整度：JSON 字段完整率、text 长度 vs max_tokens 占比）；
  3. 顺带审查 `transcribe_chain.py:97` 的 `result.setdefault("confidence", 0.0)`——ASR 置信度同样是默认值而非真实测量。

---

### 12.【低】fallback 链总预算注释与实现漂移（*1.5 vs *3.0）

- **文件路径:行号 + 函数名**
  - `server/ai-gateway/config/fallback.py:5`（模块 docstring）、`fallback.py:164` 与 `fallback.py:305`（`budget = TIMEOUT_CONFIG.get(feature, 30) * 3.0`）
  - `server/ai-gateway/config/limits.py:6`（docstring 同样写 *1.5）

- **问题描述与技术原因**
  文档声明"整条链共享 TIMEOUT_CONFIG*1.5 的总预算"，实现却是 `* 3.0`（2 处）。预算被实际放大 2 倍，注释与行为不一致。

- **实际影响**
  纯文档问题，但会误导后续维护：按注释理解的超时兜底（1.5×）与实际（3×）不符，导致排障时对"为什么等了 90s 才 503"产生困惑；也掩盖了预算上限是否应缩回 1.5× 的设计问题。

- **触发条件**
  阅读/维护该模块时。

- **修复建议**
  统一注释为 *3.0（并说明原因：3 个 provider × 每次调用超时上限的兜底语义），或按真实设计意图将实现调整为 *1.5 并同步 limits.py 注释。

---

### 13.【低】Key 轮询仅覆盖 `generate`，视觉/流式/ASR 路径恒用主 Key

- **文件路径:行号 + 函数名**
  - 已轮询：`qwen_provider.py:62`、`deepseek_provider.py:73`、`glm_provider.py:73`、`gemini_provider.py:77`（各 `generate` 方法内调用 `await self._rotate_api_key()`）
  - 未轮询：`glm_provider.py:188-256`（`generate_vision`）、`glm_provider.py:258-330`（`generate_vision_multi`）、`gemini_provider.py:275-304`（`generate_stream`）、各 Provider `transcribe`/`generate_video` 等
  - 机制：`base_provider.py:367-394`（`_rotate_api_key`，`pool.size <= 1` 时直接返回）

- **问题描述与技术原因**
  多 Key 轮询（key_pool.py Round-Robin）只在 4 个 Provider 的 `generate` 方法入口执行；`generate_vision`/`generate_stream`/`transcribe`/`generate_video` 等其它入口**从不轮换**，恒用 `get_primary_key` 返回的第一个 Key。当主 Key 被 429 标记冷却（`_mark_current_key_unavailable`，base_provider.py:111-120）后，这些路径不会切到备用 Key，只能等 60s 冷却或直接失败。

- **实际影响**
  多 Key 配置对视觉/流式/ASR/视频功能形同虚设：RPM 压力全部压在主 Key 上（与配置多 Key 的初衷相悖），且主 Key 熔断时这些功能无 Key 可换（即便池中还有健康 Key）。

- **触发条件**
  配置了复数 Key（`DEEPSEEK_API_KEYS` 已如此）且调用视觉/流式/ASR/视频路径；或主 Key 被上游 429。

- **修复建议**
  1. 把 `_rotate_api_key` 的调用上移到统一入口：在 `with_retry_and_timeout` 装饰器 wrapper 中（所有被装饰方法自动轮询）最省事；
  2. 或在 `generate_vision`/`generate_vision_multi`/`generate_stream`/`transcribe` 等方法入口补 `await self._rotate_api_key()`；
  3. 注意 `_mark_current_key_unavailable` 依赖 `provider_obj.api_key` 与池内 key 匹配，轮换后需保证两者同步（现有 GW-M14 锁已处理并发）。

---

### 14.【低】`.env` 中 `JWT_SECRET` 为死配置，误导安全配置

- **文件路径:行号 + 函数名**
  - `server/.env:43`（`JWT_SECRET=change-this-to-a-random-string-in-production`）
  - 实际读取方：`server/ai-gateway/config/app.py:27`（`os.getenv("SUPABASE_JWT_SECRET", "")`）

- **问题描述与技术原因**
  `.env` 中同时存在 `JWT_SECRET`（有值，占位符）与 `SUPABASE_JWT_SECRET`（空），而代码只读后者。运维按字面配置了 `JWT_SECRET` 会以为认证密钥已就绪，实际从未生效——叠加问题 1（ES256 硬编码），最终结果是"以为配好了密钥，实际全站 401"。

- **实际影响**
  安全配置误导；排障成本高（配置项存在但不生效，且无告警）。

- **触发条件**
  任何人按 `.env` 模板配置认证项时。

- **修复建议**
  1. 删除 `JWT_SECRET` 行，或注释说明"网关统一使用 SUPABASE_JWT_SECRET"；
  2. 在 `.env.example`/配置模板中补充 `SUPABASE_JWT_SECRET` 与 `SUPABASE_JWT_ALGORITHM`（配合问题 1 修复）；
  3. 启动时校验：存在非空 `JWT_SECRET` 而 `SUPABASE_JWT_SECRET` 为空时打印 warning。

---

## 附：审计过程中的环境事实（供复现）

- `server/.env` 关键项：`APP_ENV=development`；`SUPABASE_URL=https://your-project-id.supabase.co`（占位符）；`SUPABASE_JWT_SECRET=`（空）；`DEEPSEEK_API_KEYS=sk-2ea…,sk-c66…`（复数，双 Key）；`QWEN_API_KEY=sk-ws-…`（单数）；`GLM_API_KEY=`/`GEMINI_API_KEY=`（空）；`JWT_SECRET=change-this…`（死配置）。
- 在上述状态下，问题 1 直接导致网关全部 `/api/` 请求 401——这是**当前部署的第一优先级风险**。
- 关联提交：`950d54a`（GLM flash max_tokens clamp 1024，参数层已修复，但返回字段问题即本报告 #4）、`d3be873`（AI 网关中低危修复，未覆盖本报告多数问题）。
- 良好对照模式（修复 #3 时可参照）：`chains/quiz_gen_chain.py:38-61`（`_validate_question`）、`chains/content_tier_chain.py:39-57`（`_validate_items`）——逐项 isinstance + 必填字段检查、非法项过滤、失败降级空结构。

## 修复优先级建议

1. **立即（高）**：#1（认证断裂，全站 401）→ #2（限流绕过，配额失效）→ #3（500 崩溃）→ #4（视觉截断静默丢失）；
2. **本周（中）**：#5 → #6 → #7 → #8 → #9 → #10；
3. **排期（低）**：#11 → #12 → #13 → #14。

其中 #1、#8 可合并修复（算法环境变量化 + JWKS 降级策略）；#7、#13 可合并修复（统一 Key 读取与轮询入口）。
