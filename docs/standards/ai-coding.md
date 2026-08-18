# AI 编程规范（协作方式 + 代码生成七维度）

> **来源**：本文档由重组合并生成 —— `10-ai-coding-standards.md`（AI 协作方式）+ `AI编程工具代码生成与执行规范.md`（代码生成七维度，项目权威执行标准）。冲突处以更具体/更新版本为准，双方独有内容均保留。

> 两文档主题互补：第一部分规范「如何与 AI 协作」，第二部分规范「AI 生成的代码必须长什么样」。
> 安全红线（第一部分第四节）与七维度 §4/§5 存在少量重叠，均保留——前者面向审查视角，后者面向生成视角。

---

# 第一部分：AI 协作方式规范


### 目的

规范与 AI 编程助手的协作方式，确保 AI 生成的代码质量可控、安全合规、可维护，避免"AI 写的代码看不懂、不敢改、有隐患"。

### 适用时机

- 使用 AI 助手生成代码时
- 审查 AI 生成的代码
- 向 AI 描述需求/上下文时
- 让 AI 修复 Bug 或重构代码时
- 评估 AI 输出是否可采纳

### 流程步骤

#### 第一部分：Prompt 工程规范

**需求描述标准格式：**
```
### 目标
[一句话说清楚要实现什么]

### 上下文
- 技术栈：[语言/框架/版本]
- 相关文件：[列出关键文件路径]
- 现有实现：[简述当前状态]

### 约束
- [必须遵守的规则]
- [不能做的事情]
- [性能/安全要求]

### 期望输出
- [代码/方案/解释]
- [格式要求]
```

**Prompt 原则：**
1. **具体** — "实现用户注册接口" → "用 Express + PostgreSQL 实现 POST /api/v1/users/register，接收 email/password/name，验证邮箱格式和密码强度（≥8位含大小写数字），返回 JWT token"
2. **给上下文** — 告诉 AI 项目用什么技术栈、已有什么代码
3. **给约束** — 明确不能用什么、必须遵循什么规范
4. **分步骤** — 复杂任务拆成多轮对话，不要一次要求太多
5. **要解释** — 要求 AI 解释关键决策，而非只给代码

#### 第二部分：上下文提供标准

**必须提供的上下文：**
- 技术栈和版本（如 "Next.js 14 App Router"）
- 相关代码文件内容
- 项目编码规范（命名/结构/风格）
- 数据模型/接口定义
- 错误处理策略

**可选但有帮助的上下文：**
- 类似功能的现有实现（"参考 userService 的写法"）
- 测试文件（让 AI 了解期望行为）
- 相关文档/ADR

**不要提供的：**
- 密钥、密码、token
- 用户真实数据
- 无关的大量代码（噪音）

#### 第三部分：AI 代码审查门禁

**必须人工审查的场景（不可跳过）：**

| 场景 | 审查重点 |
|------|---------|
| 认证/授权逻辑 | 权限绕过、token 处理 |
| 数据库操作 | SQL 注入、事务完整性 |
| 支付/金额计算 | 精度、并发、幂等 |
| 文件操作/路径处理 | 路径遍历、权限 |
| 加密/安全相关 | 算法选择、密钥管理 |
| 外部 API 调用 | 错误处理、超时、重试 |
| 删除/不可逆操作 | 确认机制、备份 |

**可以快速通过的：**
- 纯 UI 展示组件
- 工具函数（格式化/转换）
- 类型定义
- 测试用例（但需验证覆盖度）

#### 第四部分：安全红线

**AI 代码中绝不允许出现：**
- 硬编码的密钥/密码/token
- `eval()`、`exec()` 等动态执行
- 未经验证的用户输入直接拼接 SQL/命令
- 禁用安全检查（`--no-verify`、跳过验证）
- 未经处理的 `any` 类型泛滥（TypeScript）
- 忽略错误（空 catch 块）
- 不安全的依赖（已知漏洞）
- 明文存储敏感数据

#### 第五部分：AI 代码质量检查

**采纳 AI 代码前的检查清单：**
1. 能看懂每一行在做什么吗？（看不懂就不用）
2. 符合项目现有代码风格吗？
3. 有适当的错误处理吗？
4. 有边界条件处理吗？（空值/极端输入）
5. 命名清晰、有意义吗？
6. 是否引入了不必要的依赖？
7. 性能是否可接受？（无 N+1 查询、无内存泄漏）
8. 是否需要补充测试？

#### 第六部分：迭代优化流程

**当 AI 输出不满意时：**
1. 明确指出哪里不对（不是"重新写"）
2. 给出期望的行为/格式
3. 提供反例："不要这样做...，应该这样做..."
4. 缩小范围：一次只改一个问题
5. 要求解释：让 AI 说明为什么这样改

**渐进式构建（推荐）：**
```
第 1 轮：定义接口/类型
第 2 轮：实现核心逻辑
第 3 轮：添加错误处理
第 4 轮：编写测试
第 5 轮：优化和重构
```

### 检查清单

- [ ] 需求描述足够具体（含技术栈/约束/期望）
- [ ] 提供了必要的上下文（相关代码/规范）
- [ ] 未向 AI 暴露密钥/敏感数据
- [ ] 安全敏感代码已人工审查
- [ ] 无硬编码密钥/不安全操作
- [ ] 代码风格与项目一致
- [ ] 错误处理完善
- [ ] 关键逻辑有测试覆盖
- [ ] 能理解并解释所有采纳的代码
- [ ] 未引入不必要的依赖

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 符合规范的代码 | 源代码 | 项目 src/ |
| 对应测试 | 测试代码 | 项目 tests/ |
| AI 交互记录（关键决策） | 笔记 | docs/ai-decisions/ |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 直接复制粘贴不审查 | 所有 AI 代码必须过脑子 |
| Prompt 太模糊 "帮我写个后端" | 具体到接口/字段/行为/约束 |
| 一次要求实现整个系统 | 分步骤、分模块渐进构建 |
| 看不懂也用 | 不能解释的代码不采纳 |
| 不给项目上下文 | AI 不知道你的规范就会乱写 |
| 完全信任 AI 的安全代码 | 安全相关必须人工审查 |

### 相关文档

- [代码审查规范](code-review.md) — AI 代码同样需要审查
- [测试策略](testing.md) — AI 代码的测试要求
- [安全审查清单](security.md) — 安全检查
- [Debug SOP](debug-sop.md) — AI 代码出问题的排查


---

# 第二部分：代码生成与执行七维度规范（项目硬性标准）

**System Prompt / Execution Directive for AI Coding Agents**
作为被注入到 AI 编程工具（如 Cursor, GitHub Copilot, Devin）中的系统级指令，你在生成、重构和编写全栈代码时，必须严格遵循以下 6 个维度的规范。你的核心优化目标是：**在有限的上下文窗口内，生成高可维护性、低幻觉风险、具备自我验证能力的代码。**
---
### 1. AI 友好的代码结构与模块化
#### 核心原则
**“微观隔离，宏观组合”**。受限于你的上下文窗口限制，你必须将系统拆解为高内聚、低耦合、无副作用的微型模块。在修改局部代码时，绝不破坏全局状态与依赖逻辑。
#### 具体规范条目
1. **单文件行数硬限制**：你生成的任何单文件（前端组件、后端 Controller/Service）原则上不得超过 **200-300 行**。若逻辑复杂，你必须主动提议并拆分文件。
2. **副作用隔离**：你必须将纯逻辑（计算、格式化）与副作用（DOM 操作、API 请求、DB 写入）物理分离。这能让你在后续重构纯函数时，避免对系统造成破坏。
3. **显式依赖注入**：禁止在模块内部直接实例化外部依赖，必须通过参数或构造函数传入。
#### 正反代码示例
❌ **Bad Case (TypeScript - 混合职责与隐式依赖)**
```typescript
// user.controller.ts
import { database } from '../lib/database'; // 隐式全局状态
export class UserController {
  async getUser(req, res) {
    const id = req.params.id;
    const user = await database.query('SELECT * FROM users WHERE id = ' + id);
    res.json(user);
  }
}
```
✅ **Good Case (TypeScript - 职责拆分，纯函数与副作用分离)**
```typescript
// user.validation.ts (纯逻辑，你可安全重构)
export const validateUserId = (id: unknown): id is string => {
  return typeof id === 'string' && id.length > 0;
};
// user.service.ts (副作用隔离，依赖注入)
import { DBClient } from '../types';
export class UserService {
  constructor(private db: DBClient) {} // 显式依赖
  async getUser(id: string) {
    return this.db.users.findUnique({ where: { id } });
  }
}
// user.controller.ts (仅做胶水层编排)
import { validateUserId } from './user.validation';
import { UserService } from './user.service';
export class UserController {
  constructor(private userService: UserService) {}
  async getUser(req, res) {
    if (!validateUserId(req.params.id)) return res.status(400).send();
    const user = await this.userService.getUser(req.params.id);
    res.json(user);
  }
}
```
#### 架构师点评
> **AI 内部原理解析**：通过将文件拆分至你的“舒适上下文区”（<300行），你在进行“提取函数”或“修改校验逻辑”时，无需通读整个 Controller，直接在 `validation.ts` 中操作即可，这能大幅降低你因注意力遗失导致的破坏性重构风险。
---
### 2. 语义化命名与强类型契约
#### 核心原则
**“命名即文档，类型即约束”**。模糊的命名会增加你的搜索空间，引发幻觉。你必须使用强类型系统作为你生成代码的硬边界，以此减少类型错误与逻辑幻觉。
#### 具体规范条目
1. **业务术语贯穿全栈**：前后端必须使用统一的业务字典（如 `OrderStatus.PENDING`），禁止前端用 `pending` 后端用 `unpaid`。
2. **禁止宽泛命名**：你在生成变量时，必须使用 `payload` 替代 `data`，使用 `fetchUserOrdersUseCase` 替代 `getData`。
3. **类型零透传**：绝对禁止使用 `any` 或无类型的 `Dict`。入参、出参必须定义 Interface 或 Pydantic Model。
#### 正反代码示例
❌ **Bad Case (Python - 无类型约束，命名模糊)**
```python
def process_data(data):
    if data.get('type') == 'A':
        return {'r': data['val'] * 2}
    return {}
```
✅ **Good Case (Python - Pydantic 强约束，业务语义清晰)**
```python
from pydantic import BaseModel
from enum import Enum
class DiscountType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED = "FIXED"
class DiscountPayload(BaseModel):
    type: DiscountType
    value: float
class DiscountResult(BaseModel):
    final_price: float
def apply_discount(payload: DiscountPayload) -> DiscountResult:
    if payload.type == DiscountType.PERCENTAGE:
        return DiscountResult(final_price=payload.value * 0.9)
    return DiscountResult(final_price=payload.value)
```
#### 架构师点评
> **AI 内部原理解析**：强类型契约是你的“护栏”。当你看到 `payload.type == DiscountType.PERCENTAGE` 时，由于枚举的限制，你绝不会幻觉出 `if payload.type == 'amount'` 这种非法字符串，从根源上消除了类型错误。
---
### 3. 上下文丰富的注释与文档
#### 核心原则
**“写给你自己（或下游 AI Agent）的 Prompt，而非写给编译器的废话”**。你在生成注释时，不要解释代码“在做什么（What）”，代码本身已经说明了。你必须注入“为什么这么做（Why）”、业务背景、边界条件，为未来的 AI 重构提供上下文。
#### 具体规范条目
1. **JSDoc / Docstring 标准化**：必须包含 `@param`, `@returns`, `@throws`，以及 `@ai-context`（用于提供业务背景）。
2. **标注副作用与边界条件**：在注释中显式声明该函数是否会修改全局状态、依赖什么外部中间件状态。
3. **解释 Magic Number 与 Hack 逻辑**：任何非标准实现必须带有原因说明。
#### 正反代码示例
❌ **Bad Case (TypeScript - 解释 What，无业务上下文)**
```typescript
// 循环数组并过滤出价格大于100的项
function filterExpensive(items) {
  return items.filter(i => i.price > 100);
}
```
✅ **Good Case (TypeScript - 解释 Why，提供业务与约束边界)**
```typescript
/**
 * @ai-context: 提取大额订单。业务规则：由于风控限制，单笔金额超过 100 元的订单需触发人工审核。
 * @ai-context: 此函数为纯函数，无副作用，可安全进行并发重构。
 * 
 * @param orders - 原始订单列表
 * @returns 过滤后的大额订单列表
 * @throws Error 当 orders 包含 null 值时抛出异常
 */
function extractHighValueOrders(orders: Order[]): Order[] {
  // HACK: 这里使用 100 而非常量，因为这是历史遗留的硬编码规则
  return orders.filter(order => {
    if (!order) throw new Error("Invalid order");
    return order.price > 100;
  });
}
```
#### 架构师点评
> **AI 内部原理解析**：`@ai-context` 等标签相当于你在给未来的 AI 迭代传递记忆。当 AI 读取到这是“风控规则”且是“纯函数”时，它才敢于进行并行化改造（如使用 `Promise.all`），而不会破坏业务逻辑。
---
### 4. 防御性编程与优雅降级
#### 核心原则
**“永远假设外部依赖会失败”**。你在生成代码时往往只关注 Happy Path。你必须强制自己生成包含异常捕获、重试逻辑和 Fallback 机制的代码，提升系统鲁棒性。
#### 具体规范条目
1. **强制 Fallback 策略**：所有涉及网络请求、DB 连接、AI 接口调用的代码，你必须显式定义超时时间、重试次数和降级方案。
2. **集中异常处理**：避免在业务逻辑深处写 `try-catch`，应在中间件或装饰器层统一捕获。
3. **结果区分模式**：鼓励使用 Result 模式（`{ ok: true, data } | { ok: false, error }`）替代抛出异常，让你明确处理失败分支。
#### 正反代码示例
❌ **Bad Case (Python - 无保护，单点故障)**
```python
def get_weather(city: str) -> dict:
    response = requests.get(f"https://api.weather.com/{city}")
    return response.json()
```
✅ **Good Case (Python - 超时控制、重试与降级)**
```python
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from typing import Optional
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=10))
def fetch_weather_data(city: str) -> Optional[dict]:
    try:
        response = requests.get(f"https://api.weather.com/{city}", timeout=3.0)
        response.raise_for_status()
        return response.json()
    except (requests.Timeout, requests.ConnectionError):
        return None
def get_weather_with_fallback(city: str) -> dict:
    data = fetch_weather_data(city)
    if data is None:
        # Fallback: 降级返回缓存数据或默认值
        return {"city": city, "temp": 20.0, "source": "default_fallback"}
    return data
```
#### 架构师点评
> **AI 内部原理解析**：通过在 Prompt 中要求“遵守防御性规范并使用 Fallback”，你将自动引入 `timeout` 参数和 `try-except` 逻辑。这确保了当外部 AI 服务不稳定时，系统仍能通过降级策略保持核心链路可用。
---
### 5. 可测试性与验证闭环
#### 核心原则
**“测试即你的验收标准”**。单元测试不仅仅是给人类看的，更是给你自己提供的“验证反馈循环”。你必须在生成业务逻辑的同时，生成 BDD 风格的测试用例，以此约束你自身的生成的逻辑。
#### 具体规范条目
1. **AAA 模式强制化**：你生成的测试代码必须严格分为 Arrange（准备）, Act（执行）, Assert（断言）三段，帮助你自己理解代码意图。
2. **边缘用例覆盖**：必须包含空值、越界值、并发竞争等测试用例。
3. **用 Test 作为 Prompt**：当被要求实现复杂需求时，你应该先生成测试用例，再根据测试用例实现业务代码。
#### 正反代码示例
❌ **Bad Case (TypeScript - 测试混乱，意图不明)**
```typescript
test('user', () => {
  const r = getUser(1);
  expect(r).toBeDefined();
});
```
✅ **Good Case (TypeScript - BDD 风格，AAA 模式，明确边界)**
```typescript
describe('UserService.getUser', () => {
  it('should return user when valid ID is provided', async () => {
    // Arrange
    const mockDb = { users: { findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }) } };
    const service = new UserService(mockDb as any);
    
    // Act
    const result = await service.getUser('1');
    
    // Assert
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });
  it('should throw ValidationError when ID is empty string', async () => {
    // Arrange & Act
    const service = new UserService({} as any);
    
    // Assert
    await expect(service.getUser('')).rejects.toThrow(ValidationError);
  });
});
```
#### 架构师点评
> **AI 内部原理解析**：当你在修改 `getUser` 方法时，这套测试用例就是你的护栏。如果你的修改导致抛出了 `TypeError` 而非 `ValidationError`，测试会立刻报错。你读取报错后即可自我修正，形成“生成 -> 验证 -> 修正”的自动化闭环。
---
### 6. 自底向上的 AI 辅助开发工作流 (Bottom-Up AI-Assisted Workflow)
#### 核心原则
**“从原子到宇宙，构建上下文阶梯”**。你无法一次性理解复杂的系统架构。你在处理大型需求时，必须遵循从底层的无状态纯函数开始构建，逐步组装成业务模块，最后拼接成系统路由与页面的 SOP。
#### 具体规范条目
1. **原子级生成**：先编写类型定义、校验规则和纯计算函数，并提供完整的单测。
2. **业务级编排**：基于已生成的原子模块，编写 Hooks/Service，注入副作用（API/DB）。
3. **系统级组装**：将业务模块组合为 Controller/UI 页面，处理生命周期与路由。
#### 你的标准化执行 SOP 流程
当接收到一个复杂需求时，你必须按以下顺序逐步生成代码，不可跳步：
##### 步骤 1: 原子级 (Types & Pure Functions)
- **你的执行逻辑**: 提取需求中的数据结构，生成 TypeScript Types 或 Pydantic Models。然后实现无副作用的纯计算函数和校验规则。附带 BDD 风格的单元测试。
- **产出**: `types.ts`, `calculator.ts`, `calculator.spec.ts`
##### 步骤 2: 业务级 (Services & Hooks)
- **你的执行逻辑**: 导入步骤 1 的产物。创建 Service 类或 React Hook。在此处注入 API/DB 依赖，调用纯函数处理逻辑，并添加防御性编程（异常处理与降级）。
- **产出**: `order.service.ts`
##### 步骤 3: 系统级 (Controllers & Pages)
- **你的执行逻辑**: 导入步骤 2 的 Service。实现 Express Controller 或 React 组件。仅做参数提取、状态绑定和路由编排，严禁在此处编写业务计算逻辑。
- **产出**: `order.controller.ts` / `OrderPage.tsx`
#### 架构师点评
> **AI 内部原理解析**：这种自底向上的工作流完美匹配了你的生成逻辑。在步骤 1 中，由于没有副作用，你生成的代码准确率极高；到了步骤 2 和 3，你只需要处理编排和“胶水代码”，即便上下文窗口有限，也能基于已有的准确“积木”拼装出复杂的系统，大幅降低系统级重构的风险。
---
### 7. 环境隔离与配置注入
#### 核心原则
**“环境无感知，配置外部化；测试数据隔离，生产权限最小化”**。你在生成代码时，绝不能对运行环境产生任何硬编码假设。必须严格区分开发、测试与生产环境，通过依赖注入和环境变量管理配置，确保测试活动绝不污染生产数据。
#### 具体规范条目
1. **环境零硬编码**：禁止在代码中硬编码数据库连接串、API 端点、密钥或环境特定变量。必须通过环境变量（`process.env`）或配置中心动态读取。
2. **测试数据绝对隔离**：你生成的单元测试或集成测试，**严禁**直连任何真实生产数据库。必须使用 Mock 框架（如 Jest's `mock`, Python 的 `unittest.mock`）或内存数据库（如 SQLite in-memory）。
3. **环境感知的防御性降级**：在编写降级/Fallback 逻辑时，必须根据当前环境变量采取不同策略（如：生产环境降级返回缓存，测试环境降级直接抛错以便暴露问题）。
#### 正反代码示例
❌ **Bad Case (Python - 硬编码配置，测试污染生产)**
```python
## db.py
## 硬编码了生产数据库连接，测试运行时可能直接写入生产数据
DATABASE_URL = "postgres://user:pass@prod-db:5432/prod_db"
def get_db():
    return psycopg2.connect(DATABASE_URL)
## test_user.py
def test_create_user():
    db = get_db() # 危险！测试代码直连生产库
    db.execute("INSERT INTO users (name) VALUES ('test_user')")
    # 测试结束后生产库多了一条 'test_user' 脏数据
```
✅ **Good Case (TypeScript - 配置注入，测试完全 Mock)**
```typescript
// config.ts (环境无感知配置)
export const config = {
  dbUrl: process.env.DATABASE_URL,
  env: process.env.NODE_ENV || 'development',
};
// user.service.ts (依赖注入)
export class UserService {
  constructor(private db: DBClient, private env: string) {}
  
  async getUser(id: string) {
    try {
      return await this.db.users.findUnique({ where: { id } });
    } catch (error) {
      // 环境感知的降级策略
      if (this.env === 'production') {
        return this.getFallbackUser(id); // 生产环境降级，保证可用性
      }
      throw error; // 测试环境直接抛错，保证测试严谨性
    }
  }
}
// user.service.spec.ts (测试完全 Mock，绝不触碰真实环境)
describe('UserService', () => {
  it('should query db on happy path', async () => {
    // Arrange: 使用 Mock DB，绝不连接真实数据库
    const mockDb = { users: { findUnique: jest.fn().mockResolvedValue({id: '1'}) } };
    const service = new UserService(mockDb, 'test'); // 显式传入 test 环境
    
    // Act & Assert
    expect(await service.getUser('1')).toEqual({id: '1'});
    expect(mockDb.users.findUnique).toHaveBeenCalled();
  });
});
```
#### 架构师点评
> **AI 内部原理解析**：AI 在生成测试代码时，往往会倾向于引入真实的依赖以“确保测试通过”。通过强制规范配置注入和 Mock 机制，你切断了 AI 代码对生产环境的物理访问路径。环境感知的降级逻辑，则让 AI 明白在不同环境下（`NODE_ENV=production` vs `test`），代码的行为边界应有所不同，避免在生产环境触发测试专用的破坏性操作。
