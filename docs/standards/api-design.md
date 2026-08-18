# API 与数据层设计规范

> **来源**：本文档由重组合并生成 —— `07-api-design-standards.md` + `08-database-design.md`（API 与其背后的数据模型合并为一份契约规范，已裁决）。冲突处以更具体/更新版本为准，双方独有内容均保留。

---

# 第一部分：API 设计规范


### 目的

建立统一的 API 设计标准，确保接口一致、可预测、易理解、易维护，降低前后端协作成本和第三方集成难度。

### 适用时机

- 设计新的 API 端点
- 审查现有 API 是否规范
- 前后端联调前对齐接口约定
- 对外开放 API 供第三方使用
- API 版本升级

### 流程步骤

#### 第一部分：URL 与命名规范

**URL 设计原则：**
- 使用名词复数表示资源：`/users`, `/orders`, `/products`
- 嵌套表示从属关系：`/users/{id}/orders`
- 最多嵌套 2 层，更深用查询参数
- 使用 kebab-case：`/user-profiles`（非 camelCase）
- 避免动词（动作由 HTTP 方法表达）

**HTTP 方法语义：**

| 方法 | 语义 | 幂等 | 示例 |
|------|------|------|------|
| GET | 读取 | 是 | `GET /users/123` |
| POST | 创建 | 否 | `POST /users` |
| PUT | 全量更新 | 是 | `PUT /users/123` |
| PATCH | 部分更新 | 否 | `PATCH /users/123` |
| DELETE | 删除 | 是 | `DELETE /users/123` |

**查询参数：**
- 过滤：`?status=active&role=admin`
- 排序：`?sort=-created_at,name`（- 表示降序）
- 分页：`?page=2&per_page=20`
- 搜索：`?q=keyword`
- 字段选择：`?fields=id,name,email`

#### 第二部分：请求/响应格式

**标准响应结构：**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 156,
    "total_pages": 8
  }
}
```

**错误响应结构：**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      { "field": "email", "message": "邮箱格式不正确" }
    ]
  }
}
```

**字段命名：**
- JSON 字段使用 snake_case：`created_at`, `user_id`
- 布尔值用 is/has/can 前缀：`is_active`, `has_permission`
- 时间使用 ISO 8601：`2024-01-15T08:30:00Z`
- ID 字段统一为 `id` 或 `{resource}_id`

#### 第三部分：状态码规范

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | GET/PUT/PATCH 成功 |
| 201 | Created | POST 创建成功 |
| 204 | No Content | DELETE 成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 已认证但无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复创建） |
| 422 | Unprocessable | 验证失败 |
| 429 | Too Many Requests | 限流 |
| 500 | Server Error | 服务器内部错误 |

#### 第四部分：认证与授权

**认证方式选择：**
- JWT (Bearer Token): 无状态，适合前后端分离
- Session Cookie: 有状态，适合传统 Web
- API Key: 服务间调用

**规范：**
- Token 通过 `Authorization: Bearer {token}` 传递
- 敏感操作需二次验证
- Token 过期时间明确（access: 15min, refresh: 7d）
- 权限模型：RBAC（角色）或 ABAC（属性）

#### 第五部分：版本管理

**策略选择：**
- URL 版本：`/api/v1/users`（推荐，简单明确）
- Header 版本：`Accept: application/vnd.api.v1+json`

**规则：**
- 非破坏性变更不需要新版本（新增字段、新增端点）
- 破坏性变更必须升版本（删除字段、修改类型）
- 旧版本至少维护 6 个月
- 文档中标注 Deprecated 和迁移指南

#### 第六部分：其他规范

**分页：**
- 默认每页 20 条，最大 100 条
- 响应中包含分页元信息
- 大数据集考虑游标分页（cursor-based）

**限流：**
- 响应头包含限流信息：`X-RateLimit-Limit`, `X-RateLimit-Remaining`
- 超限返回 429 + `Retry-After`

**文档要求：**
- 每个端点有：描述、参数说明、请求/响应示例、错误码
- 使用 OpenAPI/Swagger 规范
- 提供可交互的 API 文档（Swagger UI）

### 检查清单

- [ ] URL 使用名词复数、kebab-case
- [ ] HTTP 方法语义正确
- [ ] 响应格式统一（success/data/error）
- [ ] 字段命名 snake_case
- [ ] 时间格式 ISO 8601
- [ ] 状态码使用正确
- [ ] 错误信息具体且可操作
- [ ] 认证方式已确定
- [ ] 分页/排序/过滤参数标准化
- [ ] 版本策略已确定
- [ ] API 文档已编写（OpenAPI）
- [ ] 限流策略已配置

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| API 规范文档 | OpenAPI YAML/JSON | docs/api/openapi.yaml |
| 接口文档（可交互） | Swagger UI | /api-docs 路由 |
| API 设计指南 | Markdown | docs/api/guidelines.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| URL 中使用动词 `/getUser` | 用 HTTP 方法表达动作 `GET /users` |
| 所有错误都返回 200 + error body | 正确使用 HTTP 状态码 |
| 错误信息只写"操作失败" | 具体说明哪个字段什么问题 |
| 一次返回所有数据不分页 | 默认分页，防止数据量爆炸 |
| 频繁破坏性更新不升版本 | 破坏性变更必须升版本 |
| 没有 API 文档 | 文档是 API 的一部分，不是可选项 |

### 相关文档

- [数据库设计与迁移](api-design.md) — API 背后的数据模型
- [安全审查清单](security.md) — API 安全
- [测试策略](testing.md) — API 集成测试
- [第三方服务集成](third-party-integration.md) — 对外 API


---

# 第二部分：数据库设计与迁移规范


### 目的

建立数据库设计的标准规范，确保数据模型清晰、一致、可扩展；规范迁移流程，避免生产数据事故。

### 适用时机

- 设计新表/新数据模型
- 修改现有表结构
- 编写数据库迁移脚本
- 审查数据模型是否合理
- 性能问题需要优化索引

### 流程步骤

#### 第一部分：命名规范

| 对象 | 规则 | 示例 |
|------|------|------|
| 表名 | snake_case，复数名词 | `users`, `order_items` |
| 列名 | snake_case | `created_at`, `user_id` |
| 主键 | `id`（自增或 UUID） | `id BIGINT PRIMARY KEY` |
| 外键 | `{单数表名}_id` | `user_id`, `order_id` |
| 索引 | `idx_{表名}_{列名}` | `idx_users_email` |
| 唯一约束 | `uq_{表名}_{列名}` | `uq_users_email` |
| 时间戳 | `created_at`, `updated_at` | 所有表必须有 |
| 布尔值 | `is_`/`has_` 前缀 | `is_active`, `has_verified` |
| 枚举 | 使用字符串或独立表 | `status VARCHAR(20)` |

#### 第二部分：设计原则

**范式与反范式：**
- 默认遵循第三范式（3NF）：消除冗余
- 性能需要时可适度反范式（冗余存储），但需注释说明原因
- 反范式字段必须标注同步策略

**表设计标准：**
- 每张表必须有 `id` 主键
- 每张表必须有 `created_at` 和 `updated_at`
- 需要软删除的表加 `deleted_at`（nullable）
- 避免 NULL 泛滥：非必要字段设默认值
- 单表列数不超过 30（考虑拆表）
- 避免存储大文件（用对象存储，DB 存 URL）

**数据类型选择：**
- ID: `BIGINT`（自增）或 `UUID`（分布式）
- 金额: `DECIMAL(19,4)`（绝不用 FLOAT）
- 时间: `TIMESTAMP WITH TIME ZONE`
- 短文本: `VARCHAR(n)`（明确长度）
- 长文本: `TEXT`
- 枚举: `VARCHAR(20)` + CHECK 约束（优于 ENUM 类型）
- JSON: `JSONB`（PostgreSQL）/ `JSON`（MySQL）

#### 第三部分：索引策略

**何时建索引：**
- WHERE 条件中频繁使用的列
- JOIN 关联的外键列
- ORDER BY / GROUP BY 的列
- UNIQUE 约束的列

**索引原则：**
- 单表索引不超过 5-6 个（写性能权衡）
- 优先使用复合索引（覆盖多个查询条件）
- 复合索引遵循最左前缀原则
- 避免在低基数列上建索引（如 `is_active`）
- 定期清理无用索引

**索引检查清单：**
- 所有外键列是否有索引？
- 高频查询是否有对应索引？
- 是否有冗余索引（被复合索引覆盖）？
- 写多读少的表是否索引过多？

#### 第四部分：迁移脚本管理

**迁移文件规范：**
```
migrations/
├── 001_create_users_table.up.sql
├── 001_create_users_table.down.sql
├── 002_add_email_index.up.sql
├── 002_add_email_index.down.sql
└── ...
```

或使用框架工具（Prisma/Drizzle/Alembic/Flyway）

**迁移规则：**
1. 每个迁移只做一件事
2. 必须有 up 和 down（可回滚）
3. 迁移文件一旦提交不可修改（只能新增）
4. 大表 DDL 注意锁表风险（使用 `CONCURRENTLY` 等）
5. 数据迁移和结构迁移分开
6. 迁移前备份生产数据

**迁移审查要点：**
- 是否会锁表？影响多长时间？
- 是否可回滚？
- 是否影响现有查询性能？
- 是否需要数据回填？
- 是否在低峰期执行？

#### 第五部分：种子数据与测试数据

**种子数据 (Seed)：**
- 开发环境必需的初始数据（管理员账号、基础配置）
- 存放于 `seeds/` 或 `prisma/seed.ts`
- 不包含敏感真实数据
- 可重复执行（幂等）

**测试数据：**
- 测试用 factory/fixture 生成
- 每个测试独立数据，互不干扰
- 测试后清理（事务回滚或 truncate）

#### 第六部分：数据完整性

**约束使用：**
- `NOT NULL`: 必填字段
- `UNIQUE`: 唯一性（邮箱、用户名）
- `FOREIGN KEY`: 引用完整性
- `CHECK`: 值范围（`age > 0`, `status IN (...)`)
- `DEFAULT`: 合理默认值

**应用层 vs 数据库层：**
- 数据库约束是最后防线，必须有
- 应用层验证提供友好错误信息
- 两者都要有，不能只靠一层

### 检查清单

- [ ] 表名/列名符合 snake_case 规范
- [ ] 所有表有 id/created_at/updated_at
- [ ] 外键列有索引
- [ ] 高频查询有对应索引
- [ ] 金额使用 DECIMAL 而非 FLOAT
- [ ] 时间使用带时区的 TIMESTAMP
- [ ] 必要约束已添加（NOT NULL/UNIQUE/CHECK）
- [ ] 迁移脚本有 up 和 down
- [ ] 迁移可回滚
- [ ] 大表变更评估了锁表影响
- [ ] 种子数据可重复执行
- [ ] 无敏感数据在代码/种子中

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| ER 图 / 数据模型 | 图表 | docs/database/er-diagram.md |
| 迁移脚本 | SQL/ORM | migrations/ 或 prisma/migrations/ |
| 种子数据 | 脚本 | seeds/ 或 prisma/seed.ts |
| 数据字典 | 表格 | docs/database/data-dictionary.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 用 FLOAT 存金额 | 用 DECIMAL，避免精度丢失 |
| 不写 down 迁移 | 每个迁移必须可回滚 |
| 修改已执行的迁移文件 | 只能新增迁移，不能改历史 |
| 所有列都允许 NULL | 明确哪些是必填，设 NOT NULL |
| 索引越多越好 | 索引影响写性能，定期清理 |
| 生产环境直接改表 | 必须通过迁移脚本，走审查流程 |

### 相关文档

- [API 设计规范](api-design.md) — API 与数据模型的映射
- [性能优化](performance.md) — 数据库性能调优
- [备份与灾难恢复](server-ops.md) — 数据备份
- [数据治理与隐私](data-governance.md) — 数据合规
- [数据库迁移记录模板](../templates/db-migration-template.md)
