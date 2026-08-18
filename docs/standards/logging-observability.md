# 日志与可观测性规范

## 目的

建立统一的日志和监控标准，使系统运行状态可观测、问题可追溯、性能可量化，支撑快速排障和主动运维。

## 适用时机

- 项目初始化时设计日志方案
- 新增模块/服务时添加日志
- 排查生产问题需要日志支持
- 搭建监控和告警系统
- 性能分析需要指标数据

## 流程步骤

### 第一部分：日志级别规范

| 级别 | 用途 | 示例 | 生产环境 |
|------|------|------|---------|
| ERROR | 需要立即处理的错误 | 数据库连接失败、支付回调异常 | 必须记录 |
| WARN | 异常但可自动恢复 | 重试成功、降级触发、接近限额 | 记录 |
| INFO | 关键业务事件 | 用户注册、订单创建、部署完成 | 记录 |
| DEBUG | 开发调试信息 | 函数入参、中间计算结果 | 不记录 |

**规则：**
- 生产环境日志级别设为 INFO（不输出 DEBUG）
- ERROR 必须有足够上下文用于排障
- 不在日志中输出敏感数据（密码/token/身份证号）
- 日志量要可控（不在循环中打 INFO）

### 第二部分：结构化日志格式

**使用 JSON 结构化日志（而非纯文本）：**

```json
{
  "timestamp": "2024-03-15T08:30:00.123Z",
  "level": "error",
  "service": "order-service",
  "message": "Failed to process payment",
  "context": {
    "order_id": "ORD-12345",
    "user_id": "USR-678",
    "amount": 99.99,
    "error_code": "PAYMENT_TIMEOUT",
    "duration_ms": 30000
  },
  "trace_id": "abc-123-def",
  "stack": "Error: Payment timeout\n  at ..."
}
```

**必须包含的字段：**
- `timestamp`: ISO 8601 格式，带时区
- `level`: 日志级别
- `service`: 服务/模块名
- `message`: 人类可读的描述
- `trace_id`: 请求追踪 ID（关联同一请求的所有日志）

**可选但推荐：**
- `user_id`: 操作用户（脱敏）
- `duration_ms`: 操作耗时
- `request_id`: 请求唯一标识

### 第三部分：日志内容规范

**好的日志：**
```
[INFO] User registered: user_id=USR-123, method=email
[ERROR] Payment failed: order_id=ORD-456, reason=timeout, retry=2/3
[WARN] Cache miss rate high: 45% in last 5min
```

**坏的日志：**
```
[INFO] done                    ← 无意义
[ERROR] error                  ← 无上下文
[DEBUG] user password=123456   ← 泄露敏感信息
[INFO] processing...           ← 循环中刷屏
```

**日志消息模板：**
```
{动作} + {对象} + {关键参数} + {结果/原因}

示例：
"Created order: order_id=ORD-123, items=3, total=299.00"
"Failed to send email: to=user@ex.com, reason=SMTP timeout"
```

### 第四部分：监控指标 (Metrics)

**RED 方法（面向请求的服务）：**
- **R**ate: 每秒请求数 (QPS)
- **E**rrors: 每秒错误数
- **D**uration: 请求耗时分布 (P50/P95/P99)

**USE 方法（面向资源）：**
- **U**tilization: 使用率（CPU/内存/磁盘）
- **S**aturation: 饱和度（队列长度/等待时间）
- **E**rrors: 错误事件数

**业务指标（视产品而定）：**
- 注册数/活跃用户数
- 订单量/转化率
- API 调用量/配额使用率

### 第五部分：告警规则

**告警分级：**

| 级别 | 条件示例 | 响应时间 | 通知方式 |
|------|---------|---------|---------|
| P0 紧急 | 服务不可用/错误率>10% | 立即 | 电话/短信 |
| P1 重要 | P95>2s / 磁盘>90% | 30min | 即时消息 |
| P2 警告 | 错误率>1% / 内存>80% | 4h | 邮件/消息 |
| P3 信息 | 流量异常波动 | 下个工作日 | 日报 |

**告警原则：**
- 每条告警必须可操作（收到后知道做什么）
- 避免告警疲劳（不重要的不告警）
- 告警收敛（同一问题不重复轰炸）
- 定期审查告警规则（删除过时的）

### 第六部分：链路追踪

**适用场景：**
- 微服务/多模块调用链
- 定位"到底慢在哪一步"
- 关联一个请求经过的所有服务

**实现方式：**
- 每个请求生成唯一 `trace_id`
- 跨服务传递 trace_id（HTTP Header）
- 每个服务记录自己的 span（操作段）
- 可视化完整调用链（Jaeger/Zipkin）

**最简实现（单体应用）：**
- 中间件生成 request_id
- 所有日志带上 request_id
- 通过 request_id 关联同一请求的所有日志

### 第七部分：仪表盘设计

**必备仪表盘：**
1. **服务概览**: QPS、错误率、P95 延迟、在线实例数
2. **资源监控**: CPU、内存、磁盘、网络
3. **业务指标**: 注册/订单/活跃（视产品）
4. **告警历史**: 近期告警及处理状态

## 检查清单

- [ ] 日志使用结构化格式（JSON）
- [ ] 日志级别使用正确
- [ ] 日志中无敏感数据
- [ ] 每条日志有 timestamp + level + service + message
- [ ] 请求有唯一 trace_id/request_id
- [ ] 关键业务事件有 INFO 日志
- [ ] 错误日志有足够上下文
- [ ] 核心指标已定义（RED/USE）
- [ ] 告警规则已配置
- [ ] 告警可操作（有 runbook）
- [ ] 仪表盘已搭建
- [ ] 日志有保留策略（不过量存储）

## 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 日志规范文档 | Markdown | docs/observability/logging.md |
| 监控配置 | 代码/配置 | monitoring/ |
| 告警规则 | 配置 | monitoring/alerts.yml |
| 仪表盘 | JSON/配置 | monitoring/dashboards/ |

## 常见误区

| 误区 | 正确做法 |
|------|---------|
| 日志全是 DEBUG 级别 | 正确区分级别，生产只输出 INFO+ |
| 日志无上下文 | 带 order_id/user_id 等关键标识 |
| 日志中打印密码/token | 敏感数据必须脱敏 |
| 有日志没监控 | 日志 + 指标 + 告警 三件套 |
| 告警太多 | 只告可操作的，避免疲劳 |
| 日志永不清理 | 设定保留策略（如 30 天） |

## 相关文档

- [Debug SOP](debug-sop.md) — 日志辅助排障
- [性能优化](performance.md) — 性能监控指标
- [事故复盘](incident-postmortem.md) — 日志支撑复盘
- [维护与迭代](maintenance-iteration.md) — 日常巡检
