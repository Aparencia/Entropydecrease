# AI 网关与调用机制优化方案

> 调研日期：2026-08-01
> 范围：server/ai-gateway/ + client AI 调用链路
> 目标：识别风险、对标业界、制定可落地的优化路线图
> 现状数字（2026-08 体检更新）：routers 46 个、chains 45 个、客户端 handlers 26 个（本文正文数字为调研时点快照）

---

## 一、现状架构分析

### 1.1 服务端 AI 网关（server/ai-gateway/）

```
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI 应用 (main.py)                     │
├─────────────────────────────────────────────────────────────────┤
│  中间件栈（从外到内）                                              │
│  CORS → JWTAuth → InputValidation → RateLimit → SecurityHeaders │
├─────────────────────────────────────────────────────────────────┤
│  routers/ (17 个功能路由)                                         │
│  summarize | cards | evaluate | vision | transcribe | socratic  │
│  multimodal | video | streaming | balance | ritual_recall ...    │
├─────────────────────────────────────────────────────────────────┤
│  chains/ (20+ LangChain 调用链)                                   │
│  每个 AI 功能一个 chain 文件，负责 prompt 组装 + 响应解析           │
├─────────────────────────────────────────────────────────────────┤
│  config/ (配置中枢，5 子模块)                                      │
│  runtime → limits → providers → fallback → app                   │
├─────────────────────────────────────────────────────────────────┤
│  providers/ (模型适配层)                                          │
│  QwenProvider | DeepSeekProvider | GLMProvider | GeminiProvider   │
│  FallbackProvider (兜底)                                          │
├─────────────────────────────────────────────────────────────────┤
│  cache/redis_cache.py (频率限制 + AI 响应缓存)                     │
└─────────────────────────────────────────────────────────────────┘
```

**核心机制：**

| 机制 | 实现方式 | 评价 |
|------|---------|------|
| 多供应商路由 | `MODEL_ROUTING` 静态表 + `PROVIDER_FALLBACK_CHAIN` | ✅ 清晰，但缺乏动态权重 |
| 降级链 | `call_with_fallback` 按链依次尝试，总预算 = timeout×1.5 | ✅ 有预算控制 |
| 重试 | `@with_retry_and_timeout` 装饰器，最多 2 次指数退避 | ✅ 基本够用 |
| 频率限制 | Redis 滑动窗口，双层（全局+功能级） | ✅ 但 Redis 故障时完全放行 |
| 认证 | JWT（ES256/HS256/RS256）+ 用户自带 Key | ⚠️ 开发降级模式有安全隐患 |
| 缓存 | Redis KV + prompt hash 去重 | ⚠️ 仅精确匹配，无语义缓存 |
| 流式输出 | SSE (streaming_router) | ✅ 已支持 |

### 1.2 客户端 AI 调用链路

```
┌─────────────────────────────────────────────────────────────┐
│  渲染进程 (React)                                            │
│  hooks/useAI*.ts → RemoteAIPlugin / ElectronAIPlugin         │
│  aiServiceFallback.ts (LRU缓存 + 三级降级)                   │
│  routeDispatcher.ts (多通道路由：视觉/音频/UI Automation)     │
├─────────────────────────────────────────────────────────────┤
│  主进程 (Electron)                                           │
│  ai/gatewayHttp.ts → postJson / postMultipart                │
│  ai/gatewayConfig.ts → 网关地址解析（env/IPC/持久化）         │
│  ai/gatewayStream.ts → SSE 流式消费                          │
│  ai/handlers/*.ts → 18 个功能 Handler                        │
│  ai/ollama/ → 本地 Ollama 推理（可选）                       │
│  callWithLocalFallback → 本地优先、云端降级                   │
└─────────────────────────────────────────────────────────────┘
```

**客户端降级链：** Ollama 本地 → 远程 AI Gateway → 缓存兜底 → 功能隐藏

### 1.3 供应商配置现状

| Provider | 模型 | 用途 | 成本特征 |
|----------|------|------|---------|
| GLM (智谱) | glm-4.6v-flash | 文本类功能主力 | 免费额度大 |
| Qwen (通义) | qwen-plus / qwen2.5-vl-72b | 视觉/苏格拉底/锚点 | 按量付费 |
| DeepSeek | deepseek-chat | 费曼评估/推荐 | 低价 |
| Gemini | gemini-2.0-flash | 视频分析 | 按量付费 |
| Fallback | 本地规则引擎 | 兜底 | 零成本 |

---

## 二、潜在风险识别

### 2.1 安全风险 🔴

| 风险项 | 严重度 | 现状 | 影响 |
|--------|--------|------|------|
| JWT 开发降级模式 | **高** | 未配置密钥时不验证签名，生产环境仅 warn | 若生产误配则全部请求放行 |
| 用户 API Key 明文传输 | **中** | `X-User-API-Key` 头传输，仅 HTTPS 保护 | 中间人攻击可窃取 Key |
| 无 Prompt 注入防护 | **高** | InputValidation 仅检查长度，无内容过滤 | 恶意 prompt 可操纵模型输出 |
| API Key 环境变量管理 | **中** | `.env` 文件管理，无轮换机制 | 泄露后无法快速轮换 |
| 无请求签名/防重放 | **中** | 仅有 X-Request-ID 用于日志 | 重放攻击无法检测 |
| CORS 开发模式全开 | **低** | `allow_origins=["*"]` 限开发环境 | 生产已严格，风险可控 |

### 2.2 性能风险 🟡

| 风险项 | 严重度 | 现状 | 影响 |
|--------|--------|------|------|
| 无熔断器 | **高** | 连续失败仍会尝试完整 fallback 链 | 供应商宕机时请求堆积 |
| 无连接池复用 | **中** | 每次用户 Key 请求新建 Provider 实例 | 高并发时 TCP 连接爆炸 |
| 视频分析超时 300s | **中** | 单请求占用 worker 5 分钟 | 并发视频请求可耗尽服务资源 |
| Redis 单点 | **中** | 单实例 Redis，故障时限流/缓存全失效 | 无限制放行可能导致成本失控 |
| 无响应压缩 | **低** | 未见 gzip/br 中间件 | 大响应体浪费带宽 |

### 2.3 成本风险 🟡

| 风险项 | 严重度 | 现状 | 影响 |
|--------|--------|------|------|
| 无 token 级成本追踪 | **高** | 仅记录 `tokens_used` 到日志，无聚合分析 | 无法精确归因成本到功能/用户 |
| 无预算告警 | **高** | 无月度/日度预算上限和告警机制 | 异常调用可能产生高额账单 |
| 缓存命中率低 | **中** | 精确 hash 匹配，prompt 微变即失效 | 重复语义请求浪费 token |
| 无模型降级成本感知 | **中** | fallback 链不考虑成本差异 | 可能不必要地使用高价模型 |
| 用户 Key 无用量审计 | **低** | 用户 Key 请求不记录详细用量 | 无法追溯异常使用 |

### 2.4 可靠性风险 🟡

| 风险项 | 严重度 | 现状 | 影响 |
|--------|--------|------|------|
| 无健康检查主动探活 | **中** | `health_check` 存在但无定时调度 | 故障 Provider 仍会被尝试 |
| 降级链静态配置 | **中** | 无法根据实时成功率动态调整 | 已知故障 Provider 仍排首位 |
| 流式 fallback 不完整 | **中** | `call_with_fallback_stream` 无总预算超时 | 流式请求可能无限等待 |
| 无请求队列/背压 | **中** | 高并发时直接透传到供应商 | 供应商 429 时用户体验差 |
| 客户端离线队列有限 | **低** | `offlineAIQueue.ts` 存在但容量有限 | 长时间离线后请求丢失 |

---

## 三、市场成熟方案调研

### 3.1 主流 AI 网关对比

| 方案 | 类型 | 核心能力 | 适用场景 | 与熵减适配度 |
|------|------|---------|---------|-------------|
| **LiteLLM** | 开源自托管 | 100+ Provider、OpenAI 兼容接口、虚拟 Key、预算、RPM/TPM 限制、负载均衡 | 有 DevOps 能力的团队 | ⭐⭐⭐⭐⭐ |
| **Portkey** | 托管 SaaS | 路由/fallback/负载均衡、Guardrails、Prompt 管理、RBAC、成本分析 | 企业级治理需求 | ⭐⭐⭐⭐ |
| **Cloudflare AI Gateway** | 边缘网关 | 边缘缓存、限流、重试、fallback、用量分析、DLP 扫描 | 已用 Cloudflare 的团队 | ⭐⭐⭐ |
| **Kong AI Gateway** | 基础设施级 | 语义缓存、语义路由、MCP/A2A 网关、Token 限流、审计 | 已有 Kong 的企业 | ⭐⭐ |
| **Braintrust** | 评估+网关 | 路由+追踪+评估+CI/CD 发布检查 | 质量驱动的团队 | ⭐⭐⭐ |
| **OpenRouter** | 聚合路由 | 统一 API、自动 fallback、按价格排序 | 快速接入多模型 | ⭐⭐⭐ |

### 3.2 业界最佳实践总结

**1. 路由与降级（LiteLLM/Portkey 模式）**
- 基于权重的负载均衡（非纯顺序 fallback）
- 条件路由：按 metadata/用户等级/功能类型分流
- 实时健康探活 + 自动摘除故障 Provider
- 每 Provider 独立熔断器（Circuit Breaker）

**2. 成本控制（Kong/Portkey 模式）**
- Token 级成本追踪（按用户/功能/模型/环境维度）
- 预算硬限制 + 软告警（80% 告警、100% 拒绝）
- 语义缓存（embedding 相似度 > 阈值时命中）
- 模型级联：简单问题用小模型，复杂问题升级

**3. 安全防护（OWASP LLM Top 10）**
- Prompt 注入检测（输入/输出双向过滤）
- PII 脱敏（请求前自动遮蔽敏感信息）
- 输出 Guardrails（有害内容/幻觉检测）
- 虚拟 Key（不暴露真实供应商 Key）

**4. 可观测性（Braintrust/Portkey 模式）**
- 全链路追踪（request_id 贯穿）
- 结构化指标：延迟 P50/P95/P99、token 用量、成功率
- 生产流量 → 评估数据集 → CI/CD 质量门禁
- 异常自动告警（延迟突增、错误率飙升、成本异常）

---

## 四、优化方案

### 4.1 架构优化

#### P0：引入熔断器 + 动态健康探活

**问题：** 当前 fallback 链在 Provider 连续故障时仍会逐个尝试，浪费超时预算。

**方案：**
```python
# 新增 providers/circuit_breaker.py
class CircuitBreaker:
    """每 Provider 独立熔断器"""
    CLOSED = "closed"        # 正常
    OPEN = "open"            # 熔断（快速失败）
    HALF_OPEN = "half_open"  # 试探恢复

    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.state = self.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0

    async def call(self, fn):
        if self.state == self.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = self.HALF_OPEN
            else:
                raise CircuitOpenError("Provider 熔断中")
        try:
            result = await fn()
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
```

**配套：** 每 30s 后台探活任务（`asyncio.create_task`），更新 Provider 健康状态。

#### P1：语义缓存升级

**问题：** 当前 `prompt_hash` 精确匹配，prompt 微变即失效。

**方案：**
- 引入轻量 embedding 模型（如 `bge-small-zh`）计算 prompt 向量
- Redis 向量搜索（RediSearch）或本地 FAISS 索引
- 相似度 > 0.95 时命中缓存，TTL 按功能分级
- 保留精确 hash 作为 L1 缓存，语义匹配作为 L2

#### P2：Provider 连接池化

**问题：** 用户 Key 每次请求新建 Provider 实例。

**方案：**
- 服务端 Provider 使用 `httpx.AsyncClient` 连接池（已有，确认复用）
- 用户 Key Provider 引入 LRU 缓存（key_hash → instance，TTL 5min）
- 设置池上限（max_connections=100, max_keepalive=20）

### 4.2 安全性增强

#### P0：Prompt 注入防护

**方案：**
```python
# 新增 middleware/prompt_guard.py
class PromptGuardMiddleware:
    """输入/输出双向 Guardrail"""

    INJECTION_PATTERNS = [
        r"ignore\s+(previous|above|all)\s+instructions",
        r"system\s*prompt\s*[:=]",
        r"you\s+are\s+now\s+",
        r"pretend\s+you\s+are",
    ]

    async def check_input(self, text: str) -> bool:
        # 1. 正则模式匹配（快速拦截明显注入）
        # 2. 可选：调用轻量分类模型（如 glm-4-flash）做二次判断
        pass

    async def check_output(self, text: str) -> bool:
        # 输出有害内容检测（关键词 + 分类模型）
        pass
```

#### P1：JWT 降级模式安全加固

**方案：**
- 生产环境缺少密钥材料时 **拒绝启动**（而非 warn + 放行）
- 添加 `GATEWAY_ALLOW_DEV_AUTH=true` 显式开关，默认 false
- 开发降级模式添加请求来源 IP 白名单（仅 127.0.0.1）

#### P2：API Key 安全增强

- 用户 Key 传输后不落盘、不记录完整值（现状已做到，保持）
- 引入虚拟 Key 机制：网关签发内部 Key，屏蔽真实供应商 Key
- Key 轮换 SOP：环境变量 + Docker secrets + 季度轮换提醒

### 4.3 成本控制

#### P0：Token 级成本追踪系统

**方案：**
```python
# 新增 cost/tracker.py
class CostTracker:
    """按 用户/功能/模型/日期 维度追踪 token 消耗与费用"""

    PRICE_TABLE = {
        "qwen-plus": {"input": 0.004, "output": 0.012},  # 元/千token
        "glm-4.6v-flash": {"input": 0, "output": 0},     # 免费
        "deepseek-chat": {"input": 0.001, "output": 0.002},
        "gemini-2.0-flash": {"input": 0.0005, "output": 0.0015},
    }

    async def record(self, user_id, feature, model, input_tokens, output_tokens):
        # 写入 Redis 聚合计数器 + 异步落盘 PostgreSQL
        pass

    async def check_budget(self, user_id) -> bool:
        # 日预算 / 月预算硬限制
        pass
```

**配套：**
- 每日成本报表（按功能/模型/用户 Top10）
- 预算告警：80% 时通知管理员，100% 时拒绝新请求
- Grafana 面板：实时成本曲线

#### P1：模型级联策略

**方案：**
- 简单任务（标签、摘要）→ GLM-Flash（免费）
- 中等任务（评估、推荐）→ DeepSeek（低价）
- 复杂任务（视觉、苏格拉底）→ Qwen-Plus / Gemini
- 引入 `complexity_estimator`：根据输入长度/类型预判复杂度

#### P2：语义缓存降本

- 高频重复请求（如相同笔记的摘要）通过语义缓存避免重复调用
- 预估节省：15-25% token 消耗（基于典型学习场景重复率）

### 4.4 可靠性改进

#### P0：流式 fallback 超时保护

**问题：** `call_with_fallback_stream` 缺少总预算超时。

**方案：** 为流式调用添加 `asyncio.wait_for` 包装，与非流式保持一致的预算控制。

#### P1：请求队列 + 背压机制

**方案：**
- 引入 `asyncio.Semaphore` 限制并发 AI 调用数（如 max=20）
- 超限时返回 429 + `Retry-After` 头
- 视频分析等高耗时请求使用独立队列（max=3）

#### P2：多实例 Redis / Sentinel

- 生产环境使用 Redis Sentinel 或托管 Redis
- 限流降级策略改进：Redis 不可用时使用内存计数器（有损但非零防护）

### 4.5 可观测性增强

#### P1：结构化指标采集

**方案：**
```python
# 新增 observability/metrics.py (Prometheus 格式)
from prometheus_client import Counter, Histogram, Gauge

ai_requests_total = Counter("ai_requests_total", "Total AI requests", ["feature", "provider", "status"])
ai_latency_seconds = Histogram("ai_latency_seconds", "AI request latency", ["feature", "provider"])
ai_tokens_total = Counter("ai_tokens_total", "Total tokens consumed", ["feature", "model", "direction"])
ai_provider_health = Gauge("ai_provider_health", "Provider health status", ["provider"])
```

#### P2：全链路追踪

- 现有 `X-Request-ID` 升级为 W3C Trace Context（`traceparent`）
- 关键 span：客户端发起 → 网关接收 → Provider 调用 → 响应返回
- 接入 OpenTelemetry → Jaeger/Tempo 可视化

---

## 五、实施路线图

> **实施状态更新（2026-08 全仓体检核实）**：Phase 1-2 全部落地；Phase 3 大部分落地（语义缓存 L2 未做）；Phase 4 仅 OTel 落地。逐项状态见下表 ✅/⚠️/❌。另：routers 已增至 46 个、chains 45 个（本文档正文数字为调研时点快照）。

### Phase 1：安全加固 + 熔断（2 周）🔴

| 任务 | 优先级 | 工作量 | 影响面 | 状态 |
|------|--------|--------|--------|------|
| 生产环境 JWT 降级模式改为拒绝启动 | P0 | 0.5d | auth.py | ✅ 已落地（auth.py:183-190 生产缺密钥 raise RuntimeError + GATEWAY_ALLOW_DEV_AUTH 开关） |
| Prompt 注入基础防护（正则模式） | P0 | 1d | 新增 middleware | ✅ 已落地（middleware/prompt_guard.py，main.py:197 注册） |
| Provider 熔断器实现 | P0 | 2d | providers/ + fallback.py | ✅ 已落地（providers/circuit_breaker.py） |
| 流式 fallback 超时保护 | P0 | 0.5d | fallback.py | ✅ 已落地（总预算 + 首 token 探测 + tests/test_stream_fallback_timeout.py） |
| 后台健康探活任务 | P1 | 1d | provider_bootstrap.py | ✅ 已落地（30s 探活循环，metrics 联动） |

### Phase 2：成本追踪 + 预算控制（2 周）🟡

| 任务 | 优先级 | 工作量 | 影响面 | 状态 |
|------|--------|--------|--------|------|
| Token 成本追踪模块 | P0 | 3d | 新增 cost/ | ✅ 已落地（cost/tracker.py，PRICE_TABLE + Redis 管道计数） |
| 预算硬限制 + 告警 | P0 | 2d | middleware + cost/ | ✅ 已落地（cost/budget.py，超限 429 + tier 分级） |
| Prometheus 指标采集 | P1 | 2d | 新增 observability/ | ✅ 已落地（observability/metrics.py，prometheus_client 可选降级） |
| 成本报表面板 | P1 | 2d | Grafana 配置 | ❌ 未做（Grafana 面板未配置） |

### Phase 3：性能优化 + 缓存升级（3 周）🟢

| 任务 | 优先级 | 工作量 | 影响面 | 状态 |
|------|--------|--------|--------|------|
| 语义缓存（L2）实现 | P1 | 4d | cache/ | ❌ 未落地（cache/ 仍为精确 prompt hash L1） |
| Provider 连接池化 | P1 | 1d | providers/ | ✅ 已落地（httpx 连接池 + Key 池化 config/key_pool.py） |
| 请求并发控制（Semaphore） | P1 | 1d | main.py | ✅ 已落地（main.py:94-99 双信号量 20/3） |
| 模型级联策略 | P2 | 3d | config/ + chains/ | ✅ 已落地（TIER_MODEL_ACCESS + feature 分组 fallback 链） |
| 响应压缩中间件 | P2 | 0.5d | main.py | ✅ 已落地（GZipMiddleware minimum_size=500） |

### Phase 4：可观测性 + 未来扩展（3 周）🔵

| 任务 | 优先级 | 工作量 | 影响面 | 状态 |
|------|--------|--------|--------|------|
| OpenTelemetry 全链路追踪 | P2 | 3d | 全局 | ✅ 已落地（observability/tracing.py，OTEL 可选 no-op 降级） |
| 生产流量 → 评估数据集管道 | P2 | 4d | 新增 eval/ | ❌ 未实施 |
| 虚拟 Key 签发系统 | P2 | 3d | middleware/ | ⚠️ 半落地（middleware/virtual_key.py 预实现，路由层未接入） |
| Agent 范式支持预研 | P3 | 5d | 架构设计 | ❌ 未实施（保持规划状态） |
| 向量数据库集成预研 | P3 | 3d | 架构设计 | ❌ 未实施（保持规划状态） |

---

## 六、规模化容量规划（API Key 承载力）

### 6.0 核心问题：单套 Key 能撑多少用户？

**结论：当前架构下，单套 API Key 在 DAU > 200 时会遇到供应商限速瓶颈，DAU > 1000 时成本不可持续。**

#### 供应商单 Key 限速估算

| Provider | 模型 | 典型 RPM | 典型 TPM | 承载用户数（峰值） |
|----------|------|---------|---------|------------------|
| GLM | glm-4.6v-flash | ~300 | ~500K | ~150 人同时在线 |
| Qwen | qwen-plus | ~120 | ~100K | ~60 人同时在线 |
| DeepSeek | deepseek-chat | ~60 | ~64K | ~30 人同时在线 |
| Gemini | gemini-2.0-flash | ~60 | ~1M | ~30 人（视频场景更少） |

> 注：RPM = Requests Per Minute，TPM = Tokens Per Minute。以上为免费/基础档估算，企业档可提升 5-10 倍。

#### 成本线性增长模型

```
DAU × 人均调用 × 付费比例 × 单次成本 = 日成本

DAU 500:  500 × 20 × 40% × ¥0.025 ≈ ¥100/天 ≈ ¥3,000/月
DAU 2000: 2000 × 20 × 40% × ¥0.025 ≈ ¥400/天 ≈ ¥12,000/月
DAU 5000: 5000 × 20 × 40% × ¥0.025 ≈ ¥1000/天 ≈ ¥30,000/月
```

（GLM 免费承担 ~60% 文本请求，其余 40% 走付费 Provider）

### 6.1 短期应对（DAU 0-500）：Key 池化 + 用户自带 Key

#### 多 Key 池化（Multi-Key Pool）

```python
# 新增 config/key_pool.py
class KeyPool:
    """同一 Provider 的多 Key 轮询池，突破单 Key RPM 限制"""

    def __init__(self, provider: str, keys: list[str]):
        self.keys = keys
        self._index = 0
        self._lock = asyncio.Lock()

    async def next_key(self) -> str:
        """Round-Robin 轮询下一个可用 Key"""
        async with self._lock:
            key = self.keys[self._index % len(self.keys)]
            self._index += 1
            return key

# 配置示例（环境变量）
# QWEN_API_KEYS=sk-aaa,sk-bbb,sk-ccc  （逗号分隔多 Key）
# GLM_API_KEYS=key1,key2
```

**效果：** 3 个 Qwen Key → RPM 从 120 提升到 360，承载 ~180 人同时在线。

#### 强化用户自带 Key（BYOK）

当前已有 `X-User-API-Key` 机制，但缺乏引导：
- 设置页增加「使用自己的 API Key」引导（附各平台申请教程）
- 自带 Key 用户享受更高限额（不受服务端 daily_total 约束）
- 自带 Key 请求不消耗服务端配额，降低运营成本

### 6.2 中期应对（DAU 500-5000）：分层 + 企业档 + 本地推理

#### 用户分层配额

| 层级 | 日配额 | 付费模型访问 | 来源 |
|------|--------|-------------|------|
| 免费用户 | 20 次/天 | 仅 GLM（免费） | 服务端承担 |
| 注册用户 | 50 次/天 | GLM + DeepSeek | 服务端承担 |
| 付费用户 | 200 次/天 | 全部 Provider | 订阅费覆盖 |
| BYOK 用户 | 不限（受供应商限制） | 全部 Provider | 用户自担 |

#### 供应商企业档升级

当 DAU 稳定 > 1000 时，申请企业档：
- 阿里百炼企业版：RPM 提升至 1000+，专属客户经理
- 智谱 GLM 企业版：免费额度大幅提升 + SLA 保障
- DeepSeek 企业版：RPM 无上限（按量计费）

#### 扩大本地推理覆盖

- Ollama 本地推理覆盖更多功能（当前仅部分文本功能）
- 引导有 GPU 的用户启用本地推理，减轻服务端压力
- 长期：探索 WebGPU 浏览器端推理（轻量任务）

### 6.3 长期应对（DAU 5000+）：商业化闭环

#### 成本分摊模型

```
收入 = 订阅费 × 付费用户数
成本 = 服务端 AI 调用成本 + 基础设施成本

目标：付费用户 ARPU > 其 AI 调用成本 × 1.5（毛利 50%）
```

#### 架构演进

- 引入请求队列 + 优先级调度（付费用户优先）
- 非实时任务（摘要、标签）异步化，削峰填谷
- 语义缓存命中率提升到 30%+（减少实际调用量）
- 考虑自建推理服务（vLLM + 开源模型），边际成本趋近于零

### 6.4 关键监控指标

| 指标 | 告警阈值 | 含义 |
|------|---------|------|
| Provider RPM 使用率 | > 70% | 接近供应商限速 |
| 单 Key 日调用量 | > 80% 配额 | Key 即将耗尽 |
| 月度 AI 成本 | > 预算 80% | 需要干预 |
| 429 错误率 | > 5% | 供应商侧限流已触发 |
| 缓存命中率 | < 10% | 缓存策略需优化 |

---

## 七、未来扩展考量

### 7.1 Agent 范式支持

当前架构为"请求-响应"模式，未来若需支持 Agent（多步推理、工具调用）：
- Provider 基类扩展 `generate_with_tools()` 方法
- 新增 `agents/` 目录，管理 Agent 生命周期
- 引入 LangGraph / CrewAI 编排多 Agent 协作
- 网关层需支持长连接 + 中间状态持久化

### 7.2 向量数据库集成

为语义缓存和 RAG 增强做准备：
- 短期：Redis + RediSearch（已有 Redis 基础设施）
- 中期：独立 Milvus/Qdrant 实例（学习笔记向量检索）
- 长期：混合检索（关键词 + 语义）增强 AI 回答质量

### 7.3 MCP 协议支持

参考 Kong/SUSE 的 MCP 网关方向：
- 熵减作为学习工具，未来可通过 MCP 暴露学习能力给外部 Agent
- 网关层预留 MCP 协议适配接口

---

## 八、关键决策建议

| 决策点 | 建议 | 理由 |
|--------|------|------|
| 是否引入 LiteLLM 替代自研网关？ | **否，保持自研 + 借鉴** | 熵减网关已高度定制化（17 路由、20+ chain），迁移成本大于收益；借鉴 LiteLLM 的熔断/预算/虚拟 Key 设计即可 |
| 是否使用托管 AI Gateway（Portkey/Cloudflare）？ | **否** | 本地优先原则 + 数据主权 + 国产模型兼容性 |
| 语义缓存选型？ | **Redis + RediSearch** | 复用现有 Redis 基础设施，避免引入新组件 |
| 可观测性选型？ | **Prometheus + Grafana + OTel** | 开源、自托管、与 Docker 部署天然集成 |
| Prompt 防护选型？ | **自研规则引擎 + 模型辅助** | 国产模型生态无现成 Guardrail SDK，自研可控 |

---

## 九、总结

熵减 AI 网关已具备**多供应商路由、降级链、频率限制、JWT 认证、流式输出**等核心能力，架构设计合理。主要差距在于：

1. **安全纵深不足**：缺少 Prompt 注入防护、生产降级模式有隐患
2. **成本黑盒**：无 token 级追踪和预算控制，无法量化 ROI
3. **韧性待加强**：无熔断器、流式超时缺失、Redis 单点
4. **可观测性初级**：仅日志，无结构化指标和全链路追踪

建议按 Phase 1→2→3→4 顺序推进，Phase 1-2 为高优先级（约 4 周），可在不影响现有功能的前提下显著提升安全性和成本可控性。
