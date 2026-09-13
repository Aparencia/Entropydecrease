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

### 第八部分：GSAP / 动效测试（L4 动效层）

底座 = `app/src/test/motionHarness.ts`（**局部**桩 + 确定性推进；**不是**全局 setup —— `src/test/setup.ts` 不加 `matchMedia` 桩）。下游引用下列条目时**逐字**照抄：

- **确定性推进只有一个正解**：`gsap.timeline({ paused: true })` + `tl.time(t)`（底座 = `freezeAt(tl, t)`）。实测逐字精度：`power2` tween（dur 0.5、`x: 0 → 100`）在 `tl.time(0.25)` ⇒ `translate3d(87.5px, 0px, 0px)`。
- **禁用四个假正解**：`gsap.updateRoot(t)`（`globalTimeline._start` 会漂移）· `gsap.ticker.tick()`（墙钟驱动）· `gsap.ticker.sleep()`（新建 tween 会同步唤醒它）· `await sleep()` / 真实定时器 / fake timers（不可复现）。
- **可中断 / 覆盖类判据必须双断言**：**同时**断 tween 计数（`tweenCount(el)` / `gsap.globalTimeline.getChildren().length`，或旧 tween 的 `totalTime()` 冻结）**与** `currentTransform(el)` —— GSAP 3 默认 `overwrite: false`，覆盖同属性时旧 tween 仍在跑，**只看 `style.transform` 会假绿**。
- **`matchMedia` 桩必须实现 `addListener` / `removeListener`**：jsdom 30 没有 `window.matchMedia`，而 GSAP 走 legacy 分支（`gsap-core.js:4078`），只实现 `addEventListener` 的桩**不会被调用**。桩是**用例级**的：谁装谁 `restore()`。
- **绝不可把 jsdom 的 `performance` 挂到 `globalThis`**（`Performance-impl.js:14` 自调用 ⇒ 栈溢出打挂进程）；GSAP 用例**全同步**，不需要 `await`。
- **`tl.to()` 返回 Timeline 本身**，不是 Tween —— 要 tween 句柄用 `tl.to(...).getChildren()` 或 `gsap.to`。

依据与「可测 / 不可测」的完整边界见[动效规范](motion.md)的「判据纪律（可测与不可测）」。

### 第九部分：门禁执行与稳定性纪律（批 8 立项）

**R-FLAKE（判「某红是 flake」的三条件，缺一 ⇒ 只写「未判定」）**：① **≥3 次重复**读数 ② **与某个可观测量的相关性**（如 transform 耗时 / 缓存冷热）③ **该文件不在本次写集内**的证据。
**WARM-CACHE**：全量 `vitest` **冷 / 热两次**都要跑、两次读数**都**登记；**不得**只贴一次「0 failed」就当全量无红。
**P9（并行假红）**：**门禁与变异体实验一律串行**；任何并行跑出来的红**不得**当缺陷登记，其签名必须带**测试名 + 超时阈值 + 错误串形态**并注明「串行复跑通过」；Rust 侧与 JS 侧**分开列**。

### 第十部分：观感 / 像素面仪器（批 8 收编）

**仪器**：`scripts/viewport-probe.mjs`。批 8 T12 把批 3 造在 gitignored `tmp/` 里的视口探针**收编入库**（`ADR-034:109` 逐字承认过「这条判据的仪器不入库」—— 本部分补的就是那个洞）。它加载**真实构建产物 `app/dist`**（本地只读静态服务器 + 真 CDP 精密视口），跑「顶栏自然宽 / Tab 越界 / 纵向溢出」三类判据，并按需读**任意选择器的解算样式与几何**（`--probe`，判据参数化）。

**调用形态（CLI 逐字）**：

```text
node scripts/viewport-probe.mjs --width 1024 --height 640 --dist app/dist [--port 9490] \
     [--json <out.json>] [--probe '<selector>:<cssProp>'] [--screenshot <out.png>]
退出码：0 = ②③ 判据与自检全过；1 = 有溢出或自检失败；2 = 产物缺失 / 端口失败 / profile 失败
```

- 扩展（可选）：`--dpr 1` · `--reduced-motion no-preference|reduce` · `--mode http|file`。`--probe` 可重复；`<cssProp>` 收解算样式属性（含 `--custom-prop`，camelCase 一并收）与几何名 `rect|x|y|w|h`；输出路径按**仓库根**解析（给绝对路径最稳）。
- 🔴 **正式入口与触发条件（何时必须跑）由 T24 追加** —— 本部分只登记仪器形态与盲区（U4 裁为 d：入库 + 按需入口 + 写死触发条件；**不接 husky、不进 CI**）。
- 🔴 **解算值必须来自 `getComputedStyle`**：每条 `--probe` 读数自带 `viewport` / `dpr` / `emulatedMedia` 三项元数据（缺 ⇒ **不得当判据**），并附一条**同代码路径的 canary**（`html` 的 `font-size`，恒为 px）；canary 取不到 px ⇒ 仪器报红（防「把解算值换成读内联 `element.style`」这类假读数）。

**前置（三条硬要求）**：

1. 🔴 **必须是真实构建产物**：先 `cd app; npm run build`（`--no-build` 语义**不适用**于本仪器），并在报告里登记 `app/dist/index.html` 的 **mtime**。
2. 🔴 **独占窗口 + 串行**：与全量测试 / 变异体实验**不得并发**（承 P9）；仪器会起本地 HTTP 服务与 headless Edge，并发会让两侧读数互为假红。
3. 🔴 **§17 受控对比纪律**：读数**绑定 dist 的时点与树**（stdout 与 `--json` 都带 `dist.entry_mtime` + `tree_head`）⇒ 拿两次读数做差前**必须先证明两侧 dist mtime 与 HEAD 相同**；否则该差**只能作「上界 / 存在性」证据**，并显式声明它是**非受控对比**。

**盲区（五条；引用读数时必须逐条复述）**：

1. 🔴 它验的是 **WebView2 / Chromium 的渲染引擎**，**不是 IPC / 窗口层** ⇒ **不可替代真机冒烟**：无头引擎**不覆盖** Tauri IPC 真链路、窗口装饰、真实字体回退与真机 DPI ⇒ **凡 headless / jsdom 读数一律不得写成「真机验证通过」**（U5 沿用「跳过真机」，7 条真机项继续登记、不假装完成）。
2. 🔴 headless 默认 `prefers-reduced-motion: reduce` ⇒ 仪器**必须显式**调 `Emulation.setEmulatedMedia`（默认 `no-preference`；`--reduced-motion reduce` 反测降级路径）；不显式设置 ⇒ **动效类读数全部失真**（自检里验「实测值 == 参数」）。
3. 🔴 headless **滚动条占位 = 0**（与真机不同）⇒ 依赖滚动条宽度的读数**不可用**（姊妹件 `review-t1-t6/scrollbar-cdp.mjs` 4,688 B / 105 行专测此面，**批 8 未收编**，登记为将来收编对象）。
4. 🔴 必须用 `Emulation.setDeviceMetricsOverride` 定视口：`--window-size=800` 实测 `innerWidth=776`；批 8 T12 的 M2 变异体实测 `--window-size=1024,640` ⇒ `innerWidth=1000` ⇒ 视口自检**红**（这条自检**不是装饰**）。
5. 🔴 `--dump-dom` 的 stdout **抓不到**（实测 0 字节）⇒ 读数只走 CDP `Runtime.evaluate` 或 `Page.captureScreenshot`；且因无 `window.__TAURI__`，各页 IPC 全失败 ⇒ 「整页无横向滚动」只能是**参考项**。

**profile 卫生（硬要求，非选项）**：browser profile **必须**落 `$env:TEMP`（`mkdtempSync` 造唯一目录）且**跑完删除**（`finally` 里删，异常路径同删）。🔴 落仓内会**一次喷进 1,241 文件 / 32.4 MB**（批 3 陷阱 #19；批 8 侦察阶段又复现过一次 —— 仪器自己警告过的坑）。⚠️ 判据口径：profile 落**未 gitignore** 的仓内路径（如仓根 `tmp/`）时 `git status` 看得见；落在**已 gitignore** 的目录（如 `.superpowers/**`）时 `git status` **看不见** ⇒ 卫生判据**必须**同时给「仓内文件数前后相同 + 全树 profile 名搜索为 0」（T12 的 V1 判据即为此）。

**零安装**：本机 Edge **152.0.4191.66** + WebView2 **152.0.4191.66** + Node 24 内建 `WebSocket` 已够用 ⇒ **不得引入任何新依赖、不得 `npm install`**。为什么不用 tauri-driver / Playwright / vitest browser：**都要装**，且本机**有 TLS 拦截史**（`Cargo.toml:146-148`）⇒ `cargo install` 很可能失败；它们多给的只是 **IPC 真链路 = 真机范畴**（用户已裁跳过真机）。

**判据分层（强度不同，引用时必须带层）**：① `documentElement.scrollWidth <= clientWidth`（整页无横向滚动）—— **仅供参考**；② 顶栏自然宽 `natural_w <= clientWidth` —— **判据**；③ 逐个 Tab `getBoundingClientRect().right <= innerWidth` —— **判据**；④ 仪器自检（视口 `innerWidth === --width` · `dpr === --dpr` · 500px 定块 · 文本哨兵 · **阳性对照**已知 id 必须命中 1 · **阴性对照**每次现造的随机串必须 0 命中 · `emulatedMedia` 实测值 == 参数）—— **判据**。

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
