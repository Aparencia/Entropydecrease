# 测试策略与规范

## 目的

建立分层的测试体系，确保代码质量可量化、回归风险可控，在开发速度和可靠性之间取得平衡。

## 适用时机

- 项目初始化时确定测试策略
- 编写新功能时同步编写测试
- 修复 Bug 时补充回归测试
- 重构前确保测试覆盖
- 发布前运行完整测试套件

## 流程步骤

### 第一部分：测试金字塔

```
        /  E2E  \        少量（关键用户路径）
       / 集成测试 \      适量（模块间交互）
      /  单元测试   \    大量（函数/组件级）
```

| 层级 | 占比 | 速度 | 覆盖目标 |
|------|------|------|---------|
| 单元测试 | 70% | 极快(ms) | 函数、工具类、业务逻辑 |
| 集成测试 | 20% | 中等(s) | API 端点、数据库交互、模块协作 |
| E2E 测试 | 10% | 慢(10s+) | 关键用户流程（注册/下单/支付） |

### 第二部分：单元测试规范

**什么必须写单元测试：**
- 业务逻辑函数
- 工具/辅助函数
- 数据转换/验证逻辑
- 状态管理逻辑
- 边界条件多的函数

**测试命名规范：**
```
格式：{被测函数} + {场景} + {期望结果}

示例：
✓ calculateTotal_withDiscount_returnsDiscountedPrice
✓ validateEmail_invalidFormat_throwsValidationError
✓ createUser_duplicateEmail_returnsConflictError
```

**测试结构（AAA 模式）：**
```typescript
describe('calculateTotal', () => {
  it('should apply 10% discount for orders over 100', () => {
    // Arrange（准备）
    const items = [{ price: 120, quantity: 1 }];

    // Act（执行）
    const result = calculateTotal(items);

    // Assert（断言）
    expect(result).toBe(108);
  });
});
```

**测试原则：**
- 每个测试只验证一件事
- 测试之间无依赖、无顺序要求
- 使用 mock/stub 隔离外部依赖
- 测试行为，不测试实现细节

### 第三部分：集成测试规范

**覆盖目标：**
- API 端点：请求 → 处理 → 响应 → 数据库
- 数据库操作：CRUD + 事务 + 约束
- 模块间调用：服务 A 调用服务 B

**API 测试模板：**
```typescript
describe('POST /api/v1/users', () => {
  it('should create user with valid data', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ email: 'test@example.com', password: 'Pass123!' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });

  it('should return 422 for invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ email: 'invalid', password: 'Pass123!' });

    expect(res.status).toBe(422);
  });
});
```

**数据库测试：**
- 使用测试数据库（不是生产库）
- 每个测试用事务包裹，测试后回滚
- 或使用 factory 生成 + 测试后清理

### 第四部分：E2E 测试规范

**只覆盖关键路径（不要多）：**
- 用户注册 → 登录 → 核心操作 → 退出
- 下单/支付流程
- 关键业务流程的 happy path

**E2E 原则：**
- 数量少但覆盖关键路径
- 使用真实浏览器（Playwright/Cypress）
- 测试用户可见的行为，不测试内部实现
- 失败时自动截图/录像
- 不在 CI 中频繁运行（慢），发布前运行

### 第五部分：测试数据管理

**策略：**
- 单元测试：内联数据（直接在测试中定义）
- 集成测试：Factory/Fixture 生成
- E2E：Seed 脚本 + API 创建

**Factory 示例：**
```typescript
const createUser = (overrides = {}) => ({
  name: 'Test User',
  email: `user${Date.now()}@test.com`,
  password: 'TestPass123!',
  ...overrides,
});
```

**原则：**
- 测试数据不依赖外部状态
- 每个测试独立创建自己需要的数据
- 不使用生产真实数据
- 测试后清理（不留垃圾数据）

### 第六部分：覆盖率要求

| 层级 | 最低覆盖率 | 说明 |
|------|-----------|------|
| 核心业务逻辑 | 90% | 支付/权限/核心算法 |
| 一般业务代码 | 70% | 常规 CRUD/服务 |
| 工具函数 | 80% | 公共 utils |
| UI 组件 | 不强制 | 重点测交互逻辑 |
| 整体项目 | 70% | 底线 |

**覆盖率不是目标，是参考：**
- 100% 覆盖率 ≠ 没有 Bug
- 关注关键路径和边界条件
- 不要为了覆盖率写无意义的测试

### 第七部分：CI 中的测试执行

```yaml
# 测试执行策略
on-push:
  - lint（秒级）
  - 单元测试（分钟级）
  - 集成测试（分钟级）

on-pr:
  - 上述全部
  - 覆盖率检查（不低于当前值）

before-release:
  - 上述全部
  - E2E 测试
  - 性能基准测试（可选）
```

## 检查清单

- [ ] 测试金字塔比例合理（单元 > 集成 > E2E）
- [ ] 核心业务逻辑有单元测试
- [ ] API 端点有集成测试
- [ ] 关键用户路径有 E2E 测试
- [ ] 测试命名清晰（函数+场景+期望）
- [ ] 测试之间无依赖
- [ ] 使用 mock 隔离外部依赖
- [ ] 测试数据独立、可重复
- [ ] 覆盖率达到最低要求
- [ ] CI 中自动运行测试

## 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| 单元测试 | 代码 | tests/unit/ 或 __tests__/ |
| 集成测试 | 代码 | tests/integration/ |
| E2E 测试 | 代码 | tests/e2e/ |
| 测试配置 | 配置文件 | vitest.config.ts / jest.config.js |
| 覆盖率报告 | HTML/lcov | coverage/（gitignore） |

## 常见误区

| 误区 | 正确做法 |
|------|---------|
| 只测 happy path | 边界/异常/空值同样重要 |
| 测试实现细节 | 测试行为和输出 |
| 测试之间有依赖 | 每个测试独立可运行 |
| E2E 测试太多 | E2E 只覆盖关键路径 |
| 追求 100% 覆盖率 | 关注关键逻辑，不追求数字 |
| 先写代码后补测试 | 理想是 TDD，至少同步写 |

## 相关文档

- [Debug SOP](debug-sop.md) — Bug 修复时补测试
- [重构规范](refactoring.md) — 重构的测试保障
- [CI/CD 流水线](cicd-release.md) — 测试自动化执行
- [性能优化](performance.md) — 性能基准测试
