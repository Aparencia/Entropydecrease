# 项目迁移与重构规范 v1.0

> **旧路径**：`D:\Program own\aicode\work space\KeBan`
> **新路径**：`D:\Program own\aicode\work space\Entropydecrease`
> **重构标准**：严格遵循 `docs/phase_design/AI编程工具代码生成与执行规范.md`（7 个维度）
> **执行原则**：分阶段、逐文件、每步经用户确认后方可执行

---

## 一、迁移总则

### 1.1 路径变更说明

| 维度 | 说明 |
|------|------|
| 变更范围 | 仅末级文件夹名 `KeBan` → `Entropydecrease` |
| 层级深度 | 不变（5 层） |
| 空格风险 | 无（`Entropydecrease` 为连续字符串） |
| 内部路径 | 项目内部全部使用相对路径，物理迁移后构建系统自动适配 |

### 1.2 不可变原则

- 迁移过程中，**数据库文件名**（`keban.db`）和 **IndexedDB 名称**（`'keban'`）暂不修改，避免用户数据丢失
- 服务器远程路径（`/opt/keban`）的变更需与服务器端同步操作，不在本次本地迁移范围内
- GitHub 仓库名变更独立决策，不阻塞本地迁移

### 1.3 执行纪律

1. 每个文件的重构必须经过用户确认后方可执行
2. 每完成一个模块，必须通过 `npm run lint` + `npm run build` 验证
3. 重构按**自底向上**顺序：类型/纯函数 → Service/Hook → Controller/Page
4. 单文件不超过 300 行，超出必须拆分
5. 所有修改在 Git 分支 `feature/rebrand-migration` 上进行

---

## 二、迁移阶段定义

### Phase 0：物理迁移与环境验证

**目标**：将项目安全移动到新路径，确保可构建可运行。

| 步骤 | 操作 | 验证标准 |
|------|------|----------|
| 0.1 | 创建 `D:\Program own\aicode\work space\Entropydecrease` 目录 | 目录存在 |
| 0.2 | 复制全部文件到新路径（保留 `.git`） | `git log --oneline -3` 正常 |
| 0.3 | 在新路径执行 `git lfs pull` | PNG 文件完整 |
| 0.4 | `cd client && npm install` | 无报错，`better-sqlite3` 编译成功 |
| 0.5 | `cd website && npm install` | 无报错 |
| 0.6 | `cd client && npm run build` | tsc + vite 构建通过 |
| 0.7 | `cd client && npm run electron:build` | 生成安装包 |
| 0.8 | 确认旧路径可安全删除后删除 | — |

### Phase 1：硬编码路径修复

**目标**：消除所有因路径变更导致的断裂点。

| 步骤 | 文件 | 修改内容 |
|------|------|----------|
| 1.1 | `scripts/generate_source_code_doc.ps1` | 将硬编码路径改为 `$PSScriptRoot` 动态计算 |
| 1.2 | `AGENTS.md` | 更新项目名称引用 |
| 1.3 | `README.md` | 更新 clone 地址、项目结构说明 |

### Phase 2：品牌标识统一（代码内部）

**目标**：将残留的 "KeBan/课伴" 内部标识统一为 "EntropyDecrease/熵减"。

| 步骤 | 文件 | 修改内容 | 风险等级 |
|------|------|----------|----------|
| 2.1 | 根 `package.json` | `name` → `"entropydecrease-release-tooling"` | 低 |
| 2.2 | `client/electron-builder.yml` | `repo: KeBan` → 新仓库名（若改） | 中 |
| 2.3 | `client/src/lib/http/apiClient.ts` | `[KeBan]` → `[EntropyDecrease]` | 低 |
| 2.4 | `client/src/service-worker/syncHandler.ts` | `keban-sync` → `ed-sync` 等 | 中 |
| 2.5 | `client/src/lib/sync/SyncEngine.ts` | `keban_*` localStorage 键 → `ed_*`（加迁移兼容） | 中 |
| 2.6 | `client/electron/windowScorer.ts` | 添加 `'熵减'` 关键词 | 低 |
| 2.7 | `server/.env` | 模板注释更新 | 低 |

> **注意**：步骤 2.4、2.5 涉及用户本地存储，必须编写**向后兼容迁移逻辑**：
> 启动时检测旧键是否存在，若存在则复制到新键名并删除旧键。

### Phase 3：代码结构重构（核心）

**目标**：按 AI 编程规范 7 维度重构代码，提升可维护性与 AI 协作效率。

#### 3.1 原子级重构（Types & Pure Functions）

对应规范 §1（模块化）+ §2（强类型）+ §5（可测试性）

| 目标模块 | 重构内容 |
|----------|----------|
| `client/src/types/` | 审查所有类型文件，确保零 `any`、业务术语统一 |
| `client/src/lib/` 纯函数 | 提取计算逻辑为独立文件（如 `fsrs-calculator.ts`） |
| 校验逻辑 | 从 Controller/Service 中剥离为 `*.validation.ts` |

**重构模板**：
```typescript
// ✅ 目标结构：纯逻辑模块
/**
 * @ai-context: [业务背景说明]
 * @ai-context: 此函数为纯函数，无副作用，可安全重构。
 */
export function calculateXxx(payload: XxxPayload): XxxResult {
  // ...
}
```

#### 3.2 业务级重构（Services & Hooks）

对应规范 §1（副作用隔离）+ §4（防御性编程）+ §7（环境隔离）

| 目标模块 | 重构内容 |
|----------|----------|
| `client/src/lib/ai/` | 依赖注入改造，消除全局单例直接引用 |
| `client/src/lib/http/` | 统一 Result 模式返回、超时/重试/Fallback |
| `client/src/lib/sync/` | 副作用隔离，离线队列逻辑独立 |
| `client/src/hooks/` | 确保 Hook 仅做编排，不含业务计算 |

**重构模板**：
```typescript
// ✅ 目标结构：Service 层
export class XxxService {
  constructor(
    private db: DBClient,      // 显式依赖注入
    private env: string,       // 环境感知
  ) {}

  async doSomething(payload: Payload): Promise<Result<Data>> {
    try {
      // 调用纯函数处理逻辑
      return { ok: true, data: result };
    } catch (error) {
      if (this.env === 'production') {
        return { ok: true, data: this.getFallback() }; // 降级
      }
      return { ok: false, error }; // 测试环境暴露错误
    }
  }
}
```

#### 3.3 系统级重构（Controllers & Pages）

对应规范 §1（单文件 ≤300 行）+ §3（上下文注释）

| 目标文件 | 当前行数 | 重构方案 |
|----------|----------|----------|
| `client/electron/main.ts` | 718 行 | 拆分为 `lifecycle.ts`、`storage-migration.ts`、`csp-policy.ts`、`protocol-handler.ts` |
| 大型页面组件 | 待审查 | 拆分子组件 + 提取 Hook |

#### 3.4 测试补全

对应规范 §5（可测试性）

- 为 Phase 3.1 提取的纯函数编写 BDD 风格单测
- 为 Phase 3.2 的 Service 编写 Mock 测试（禁止连接真实 DB/API）
- 测试文件命名：`*.spec.ts` 或 `*.test.ts`

### Phase 4：AI 协作优化

**目标**：让项目结构对 AI 编程助手更友好。

| 措施 | 说明 |
|------|------|
| 模块 `MODULE.md` | 每个功能目录添加 ≤50 行的模块说明（职责、边界、依赖、数据流） |
| `AGENTS.md` 重写 | 更新模块边界表、审查文件清单、验证命令 |
| 路径别名统一 | 确保 `@/` 在 tsconfig.app.json、tsconfig.node.json、electron/tsconfig.json 中一致 |
| 消除全局单例 | `export const db = new KeBanDatabase()` → 工厂函数 + 显式初始化 |
| 注释标准化 | 关键函数添加 `@ai-context` 标签（业务背景 + 副作用声明） |

### Phase 5：收尾验证

| 步骤 | 操作 |
|------|------|
| 5.1 | `cd client && npm run lint && npm run test && npm run build` |
| 5.2 | `cd client && npm run electron:build` |
| 5.3 | 启动 Electron 应用，验证核心功能（笔记、闪卡、AI、同步） |
| 5.4 | `cd website && npm run build` |
| 5.5 | 推送分支，验证 CI 流水线全绿 |
| 5.6 | 合并到 master（经用户确认） |

---

## 三、重构代码规范速查

以下规范摘自 `AI编程工具代码生成与执行规范.md`，作为每个重构步骤的检查清单：

### 检查清单（每个文件重构后必须满足）

- [ ] 单文件 ≤ 300 行
- [ ] 纯逻辑与副作用物理分离
- [ ] 无隐式全局依赖（通过构造函数/参数注入）
- [ ] 零 `any` 类型，入参出参有 Interface
- [ ] 业务术语全栈统一（使用 `EntropyDecrease` 前缀）
- [ ] 关键函数有 `@ai-context` 注释（Why，非 What）
- [ ] 网络/DB/AI 调用有超时 + 重试 + Fallback
- [ ] 环境变量通过 `process.env` / `import.meta.env` 读取，零硬编码
- [ ] 测试使用 Mock，禁止连接真实服务

#### §3 `@ai-context` 豁免规则（2026-07-29 经用户确认）

以下类型文件豁免 `@ai-context` 强制要求：
- **Barrel 文件**：纯 re-export（`export * from` / `export { x } from`）且无任何业务逻辑的 index 文件
- **微型文件**：≤ 15 行且无业务语义（如纯常量转发）
- 测试文件（`*.test.ts` / `*.spec.ts`）：测试意图由 describe/it 描述表达

豁免文件一旦增加业务逻辑，立即恢复 `@ai-context` 要求。

### 命名规范

| 类型 | 旧命名 | 新命名 |
|------|--------|--------|
| 日志前缀 | `[KeBan]` | `[EntropyDecrease]` |
| localStorage 键 | `keban_*` | `ed_*` |
| Service Worker 标签 | `keban-sync` | `ed-sync` |
| 数据库类名 | `KeBanDatabase` | `EntropyDecreaseDatabase`（仅类名，IndexedDB name 暂不改） |
| 备份文件名 | `entropy-decrease-backup-*` | 保持不变（已是新品牌） |
| 窗口检测关键词 | `'课伴'` | `'熵减'`, `'Entropy decrease'` |

#### 已完成的 localStorage 键迁移（含一次性兼容逻辑，2027-01 前保留旧键分支）

- `keban_last_sync_version` → `ed_last_sync_version`（syncCursors.ts）
- `keban_crdt_last_seq` → `ed_crdt_last_seq`（syncCursors.ts）
- `keban_app_mode` → `ed_app_mode`（ModeManager.ts）
- `keban_ai_keys` → `ed_ai_keys`（apiKeyManager.ts，用户 API Key 无损）
- `keban-animation-disabled` → `ed-animation-disabled`（useAnimationPreference.ts）
- `keban_feedback` → `ed_feedback`（FeedbackPanel.tsx）
- `keban.lastDismissedPendingCount` → `ed.lastDismissedPendingCount`（useSortPendingReminder.ts）
- `keban-data-path` → `ed-data-path`（useStoragePath.ts / DataSettings）
- `keban-auto-update` → `ed-auto-update`（AboutSettings.tsx）
- `keban-density` → `ed-density`（AppearanceSettings.tsx）

阶段 10 起统一使用共享工具 `lib/utils/legacyLocalStorage.ts` 的 `readWithLegacyMigration(newKey, legacyKey)`。

#### 非存量数据标识直接改名（无需迁移）

- Service Worker 同步标签：`keban-sync`→`ed-sync`、`keban-periodic-sync`→`ed-periodic-sync`
- SW 常量：`keban_offline_queue`→`ed_offline_queue`；自定义事件：`keban-sync-requested`→`ed-sync-requested`（无跨文件监听方，已确认）
- 备份下载文件名：`keban-backup-encrypted-*` → `entropy-decrease-backup-encrypted-*`

#### 用户数据标识永久豁免清单（绝对不可改名）

| 标识 | 位置 | 原因 |
|------|------|------|
| `'keban'` | database.ts IndexedDB 库名 | 改名=清空全体用户本地数据 |
| `'keban-ai-queue'` | offlineAIQueue.ts IndexedDB 库名 | 同上（离线 AI 队列） |
| `keban-inspirations` | database.ts v8 迁移读取键 | 历史升级链路依赖 |
| `keban_device_id` | operationLog.ts | 设备同步身份，改名引发冲突误判 |
| `'keban-encrypted-backup'` | backupService.ts 格式标识 | 历史备份文件识别依赖 |
| `keban_crypto_salt` / `keban_device_key` | CryptoManager.ts | 改名=加密数据永久不可解密 |
| `keban.db/-wal/-shm` | electron/db 系列文件 | SQLite 存量库文件名，改名=用户数据丢失 |
| `keban-recordings` | videoRecorder.ts 录制目录 | 存量录制文件目录 |
| `'课伴'` 关键词 | windowScorer.ts 采集排除列表 | 防旧版本窗口被误采集（兼容保留） |

#### §1 行数限制边界豁免清单（高内聚不可再拆，经用户逐项裁决）

| 文件 | 行数 | 豁免理由 |
|------|------|----------|
| `lib/ai/electronLearningFeatures.ts` | 235 | （已二次拆分达标，保留历史记录） |
| `lib/capture/captureManager.ts` | 498 | 三条互斥采集路径强状态编排，已拆出 smart 控制器与结果处理器 |
| `features/notes/components/FreeCanvas.tsx` | 539 | 框选/平移/拖拽交互状态机深度耦合，已拆出浮层层 |

> 300-600 行的页面级组件（约 18 个）按“页面组件边界情况”处理：巨型（>600）必拆，其余在后续专项重构中逐步消化；清单以实时扫描为准（`Get-ChildItem -Recurse | 行数>300`）。

---

## 四、回滚方案

| 场景 | 回滚策略 |
|------|----------|
| 物理迁移失败 | 旧目录在 Phase 0 完成前不删除 |
| 构建失败 | `git checkout .` 回退当前阶段所有修改 |
| 用户数据异常 | localStorage/IndexedDB 迁移逻辑内置旧键回退读取 |
| CI 失败 | 分支隔离，master 不受影响 |
| 服务器部署异常 | `/opt/keban` 保留为符号链接 → `/opt/entropydecrease` |

---

## 五、执行节奏

```
用户确认 Phase 0 → 执行物理迁移 → 验证通过
用户确认 Phase 1 → 逐文件修复 → 验证通过
用户确认 Phase 2 → 逐文件品牌统一 → 验证通过
用户确认 Phase 3.1 → 原子级重构 → 测试通过
用户确认 Phase 3.2 → 业务级重构 → 测试通过
用户确认 Phase 3.3 → 系统级重构 → 测试通过
用户确认 Phase 3.4 → 补全测试 → 全部通过
用户确认 Phase 4 → AI 协作优化 → 验证通过
用户确认 Phase 5 → 收尾验证 → 合并
```

**每个 Phase 内部，按文件粒度逐步执行，每步等待用户确认。**

---

## 六、服务器端变更（独立执行，不阻塞本地迁移）

以下变更需要在服务器端配合操作，建议本地迁移完成后再处理：

| 项目 | 当前值 | 目标值 | 操作 |
|------|--------|--------|------|
| 部署目录 | `/opt/keban` | `/opt/entropydecrease` | 新建目录 + 符号链接过渡 |
| docker-compose.prod.yml 卷挂载 | `/opt/keban/website` | `/opt/entropydecrease/website` | 修改后 `docker compose up -d` |
| deploy-server.yml | `cd /opt/keban` | `cd /opt/entropydecrease` | 更新 CI |
| deploy-website.yml | `/opt/keban/website` | `/opt/entropydecrease/website` | 更新 CI |
| nginx.conf 注释 | `/opt/keban/website` | `/opt/entropydecrease/website` | 仅注释 |

---

## 七、文件级迁移计划（逐文件执行顺序）

### 迁移操作定义

对每个文件，"迁移" 的含义为：

```
1. 复制：将源文件从 KeBan/ 复制到 Entropydecrease/ 对应路径
2. 审视：阅读文件内容，识别不符合规范的部分
3. 修改：按 AI 编程规范 7 维度进行重构（仅修改新路径下的副本）
4. 验证：确保编译/lint 通过
```

**源文件（KeBan/ 下）始终保持原样，不得删除或修改。**

### 迁移批次总览

| 批次 | 层级 | 内容 | 文件数 | 前置依赖 |
|------|------|------|--------|----------|
| B0 | 基础设施 | 根配置 + 构建系统 | 18 | 无 |
| B1 | 原子级 | 类型定义 | 12 | B0 |
| B2 | 原子级 | 纯函数 & 算法库 | 22 | B1 |
| B3 | 业务级 | 存储层 | 12 | B1 |
| B4 | 业务级 | HTTP / Sync / Auth | 12 | B2, B3 |
| B5 | 业务级 | AI 服务层（渲染进程） | 35 | B4 |
| B6 | 业务级 | 捕获 / 搜索 / 其他 lib | 30 | B2, B3 |
| B7 | 编排级 | Hooks & Stores | 16 | B5, B6 |
| B8 | 系统级 | Electron 主进程 | 44 | B0 |
| B9 | 展示级 | UI 基础组件 | 56 | B7 |
| B10 | 展示级 | Features 功能模块 | 90+ | B7, B9 |
| B11 | 展示级 | Pages & 路由 | 10 | B10 |
| B12 | 独立模块 | Server AI 网关 | 65 | B0 |
| B13 | 独立模块 | Server 同步服务 | 12 | B0 |
| B14 | 独立模块 | Website 官网 | 15 | B0 |
| B15 | 支撑 | Scripts / CI / Docs | 15 | B0 |

---

### B0：基础设施（根配置 + 构建系统）

> 目标：让新路径下的项目能 `npm install` + `npm run build` 通过。
> 此批次以复制为主，仅修改硬编码路径和品牌名称。

| 序号 | 文件路径 | 操作要点 |
|------|----------|----------|
| 0.01 | `package.json` | 复制，`name` → `entropydecrease-release-tooling` |
| 0.02 | `.releaserc.json` | 复制，检查 assets 路径（相对路径无需改） |
| 0.03 | `.gitattributes` | 原样复制 |
| 0.04 | `.gitignore` | 原样复制 |
| 0.05 | `LICENSE` | 原样复制 |
| 0.06 | `client/package.json` | 复制（已是 entropy-decrease，无需改） |
| 0.07 | `client/package-lock.json` | 原样复制 |
| 0.08 | `client/tsconfig.json` | 原样复制 |
| 0.09 | `client/tsconfig.app.json` | 原样复制 |
| 0.10 | `client/tsconfig.node.json` | 原样复制 |
| 0.11 | `client/vite.config.ts` | 复制，审视注释规范性 |
| 0.12 | `client/electron-builder.yml` | 复制，`repo: KeBan` → 新仓库名 |
| 0.13 | `client/electron/tsconfig.json` | 原样复制 |
| 0.14 | `client/postcss.config.js` | 原样复制 |
| 0.15 | `client/tailwind.config.js` | 原样复制 |
| 0.16 | `client/components.json` | 原样复制 |
| 0.17 | `client/index.html` | 原样复制 |
| 0.18 | `client/.env` / `.env.test` / `.env.production` / `.env.example` | 复制，更新注释中的 "课伴 KeBan" → "熵减 Entropydecrease" |

**B0 验证门禁**：
```bash
cd Entropydecrease/client
npm install
npm run build   # tsc -b && vite build 必须通过
```

---

### B1：类型定义（原子级 - 最底层）

> 目标：统一业务术语、消除 `any`、补全 `@ai-context` 注释。
> 规范维度：§2 强类型契约 + §3 上下文注释

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 1.01 | `client/src/types/models.ts` | 413 | **需拆分**（>300行）：按领域拆为 `note.types.ts`、`flashcard.types.ts`、`session.types.ts` 等 |
| 1.02 | `client/src/types/common.ts` | 91 | 审视：确保 Result 模式类型定义完善 |
| 1.03 | `client/src/types/flashcard.ts` | 76 | 审视：术语统一 |
| 1.04 | `client/src/types/capture.ts` | 62 | 审视 |
| 1.05 | `client/src/types/electron.d.ts` | 56 | 审视：IPC 返回类型精确性 |
| 1.06 | `client/src/types/note.ts` | 50 | 审视 |
| 1.07 | `client/src/types/sync.ts` | 44 | 审视 |
| 1.08 | `client/src/types/pomodoro.ts` | 35 | 审视 |
| 1.09 | `client/src/types/feynman.ts` | 33 | 审视 |
| 1.10 | `client/src/types/inspiration.ts` | 28 | 审视 |
| 1.11 | `client/src/types/ollama.ts` | 105 | 审视 |
| 1.12 | `client/src/types/index.ts` | 6 | 更新 re-export（若 1.01 拆分） |

**B1 验证门禁**：`npx tsc --noEmit -p tsconfig.app.json` 零错误

---

### B2：纯函数 & 算法库（原子级）

> 目标：确保无副作用、强类型、有 `@ai-context` 注释。
> 规范维度：§1 模块化 + §2 强类型 + §3 注释

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 2.01 | `client/src/lib/sm2.ts` | 186 | 纯算法，添加 `@ai-context`（SM-2 间隔重复算法说明） |
| 2.02 | `client/src/lib/fsrs.ts` | 286 | 纯算法，添加 `@ai-context`（FSRS 调度器说明） |
| 2.03 | `client/src/lib/scheduler.ts` | 166 | 审视：分离纯计算与副作用 |
| 2.04 | `client/src/lib/schedulingFactory.ts` | 101 | 审视：工厂模式规范性 |
| 2.05 | `client/src/lib/search/tokenizer.ts` | 104 | 纯函数，添加注释 |
| 2.06 | `client/src/lib/search/types.ts` | 90 | 类型定义审视 |
| 2.07 | `client/src/lib/crypto/utils.ts` | 18 | 纯工具函数 |
| 2.08 | `client/src/lib/crypto/encryption.ts` | 94 | 审视 |
| 2.09 | `client/src/lib/crypto/backupCrypto.ts` | 142 | 审视 |
| 2.10 | `client/src/lib/crypto/CryptoManager.ts` | 155 | 审视：DI 改造 |
| 2.11 | `client/src/lib/crypto/index.ts` | 7 | 原样复制 |
| 2.12 | `client/src/lib/env.ts` | 36 | 审视 |
| 2.13 | `client/src/lib/env/index.ts` | 11 | 原样复制 |
| 2.14 | `client/src/lib/env/runtimeDetect.ts` | 109 | 纯检测逻辑 |
| 2.15 | `client/src/lib/animation/index.ts` | 35 | 原样复制 |
| 2.16 | `client/src/lib/animation/presets.ts` | 229 | 配置型，审视 |
| 2.17 | `client/src/lib/animation/springConfig.ts` | 42 | 配置型 |
| 2.18 | `client/src/lib/animation/themeVariants.ts` | 121 | 配置型 |
| 2.19 | `client/src/lib/achievements/definitions.ts` | 19 | 纯数据 |
| 2.20 | `client/src/lib/achievements/evaluator.ts` | 63 | 纯函数 |
| 2.21 | `client/src/lib/metaphors/metaphorDictionary.ts` | 153 | 纯数据 |
| 2.22 | `client/src/lib/audio/audioConfig.ts` | 194 | 配置型 |

**B2 验证门禁**：`npx tsc --noEmit` + `npm run test -- --run` 通过

---

### B3：存储层（业务级）

> 目标：依赖注入改造、副作用隔离。
> 规范维度：§1 副作用隔离 + §4 防御性 + §7 环境隔离

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 3.01 | `client/src/lib/storage/interfaces.ts` | 24 | 接口定义，确保 DI 契约完整 |
| 3.02 | `client/src/lib/storage/StorageAdapter.ts` | 139 | 审视：抽象层规范性 |
| 3.03 | `client/src/lib/storage/IpcStorageAdapter.ts` | 74 | 审视 |
| 3.04 | `client/src/lib/storage/StorageManager.ts` | 46 | 审视 |
| 3.05 | `client/src/lib/storage/storageFactory.ts` | 72 | 审视：工厂 DI |
| 3.06 | `client/src/lib/storage/database.ts` | 259 | **重点**：`KeBanDatabase` → `EntropyDecreaseDatabase`（类名改，IndexedDB name 暂不改） |
| 3.07 | `client/src/lib/storage/captureStore.ts` | 89 | 审视 |
| 3.08 | `client/src/lib/storage/classroomNoteStore.ts` | 59 | 审视 |
| 3.09 | `client/src/lib/storage/operationLog.ts` | 95 | 审视 |
| 3.10 | `client/src/lib/storage/writeWithLog.ts` | 199 | 审视 |
| 3.11 | `client/src/lib/storage/exportImport.ts` | 552 | **需拆分**（>300行）：分离 export / import / 格式转换 |
| 3.12 | `client/src/lib/storage/index.ts` | 31 | 更新导出 |

---

### B4：HTTP / Sync / Auth（业务级）

> 目标：Result 模式、超时重试 Fallback、品牌标识迁移。

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 4.01 | `client/src/lib/http/apiClient.ts` | 215 | `[KeBan]` → `[EntropyDecrease]`，审视 Result 模式 |
| 4.02 | `client/src/lib/auth/supabaseClient.ts` | 22 | 审视 |
| 4.03 | `client/src/lib/sync/NetworkManager.ts` | 175 | 审视：防御性编程 |
| 4.04 | `client/src/lib/sync/OfflineQueue.ts` | 164 | 审视 |
| 4.05 | `client/src/lib/sync/SyncEngine.ts` | 585 | **需拆分**（>300行）+ `keban_*` 键 → `ed_*`（含兼容迁移） |
| 4.06 | `client/src/lib/sync/crdtEngine.ts` | 444 | **需拆分**（>300行） |
| 4.07 | `client/src/lib/mode/ModeManager.ts` | 181 | 审视 |
| 4.08 | `client/src/lib/commandPalette/registry.ts` | 87 | 审视 |
| 4.09 | `client/src/lib/commandPalette/defaultCommands.ts` | 183 | 审视 |
| 4.10 | `client/src/lib/contextMenu/index.ts` | 2 | 原样复制 |
| 4.11 | `client/src/lib/contextMenu/useContextMenu.ts` | 98 | 审视 |
| 4.12 | `client/src/lib/checkin/useCheckIn.ts` | 66 | 审视 |

---

### B5：AI 服务层 - 渲染进程（业务级）

> 目标：DI 改造、Fallback 链规范化、消除全局单例。

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 5.01 | `client/src/lib/ai/types.ts` | 361 | **需拆分**：按领域分 `ai-common.types.ts`、`ai-stream.types.ts` |
| 5.02 | `client/src/lib/ai/config.ts` | 65 | 审视：环境配置外部化 |
| 5.03 | `client/src/lib/ai/errorClassifier.ts` | 93 | 纯函数 |
| 5.04 | `client/src/lib/ai/errorMessages.ts` | 34 | 纯数据 |
| 5.05 | `client/src/lib/ai/courseDetector.ts` | 42 | 纯函数 |
| 5.06 | `client/src/lib/ai/LocalFallback.ts` | 94 | 审视 |
| 5.07 | `client/src/lib/ai/aiFallbackManager.ts` | 117 | 审视：Fallback 链 |
| 5.08 | `client/src/lib/ai/aiServiceFallback.ts` | 235 | 审视 |
| 5.09 | `client/src/lib/ai/aiStreamConsumer.ts` | 150 | 审视 |
| 5.10 | `client/src/lib/ai/apiKeyManager.ts` | 95 | 审视 |
| 5.11 | `client/src/lib/ai/AIPluginLoader.ts` | 616 | **需拆分**（>300行） |
| 5.12 | `client/src/lib/ai/ElectronAIPlugin.ts` | 757 | **需拆分**（>300行） |
| 5.13 | `client/src/lib/ai/RemoteAIPlugin.ts` | 668 | **需拆分**（>300行） |
| 5.14 | `client/src/lib/ai/routeDispatcher.ts` | 432 | **需拆分**（>300行） |
| 5.15 | `client/src/lib/ai/sessionAnalyzer.ts` | 256 | 审视 |
| 5.16 | `client/src/lib/ai/offlineAIQueue.ts` | 247 | 审视 |
| 5.17 | `client/src/lib/ai/visionWorker.ts` | 289 | 审视 |
| 5.18 | `client/src/lib/ai/asrWorker.ts` | 102 | 审视 |
| 5.19 | `client/src/lib/ai/useAI.ts` | 38 | 审视 |
| 5.20 | `client/src/lib/ai/useAIFallback.ts` | 68 | 审视 |
| 5.21 | `client/src/lib/ai/useAIService.ts` | 48 | 审视 |
| 5.22-5.35 | `client/src/lib/ai/hooks/*.ts` (14个) | 25-255 | 逐个审视，确保 Hook 仅做编排 |

---

### B6：捕获 / 搜索 / 其他 lib（业务级）

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 6.01 | `client/src/lib/capture/captureTypes.ts` | 200 | 类型审视 |
| 6.02 | `client/src/lib/capture/eventBus.ts` | 79 | 审视 |
| 6.03 | `client/src/lib/capture/changeDetector.ts` | 86 | 纯函数 |
| 6.04 | `client/src/lib/capture/smartSampler.ts` | 184 | 审视 |
| 6.05 | `client/src/lib/capture/pipeline.ts` | 193 | 审视 |
| 6.06 | `client/src/lib/capture/vadMarker.ts` | 301 | **需拆分** |
| 6.07 | `client/src/lib/capture/noteGenerator.ts` | 341 | **需拆分** |
| 6.08 | `client/src/lib/capture/crossFusion.ts` | 521 | **需拆分** |
| 6.09 | `client/src/lib/capture/captureManager.ts` | 676 | **需拆分** |
| 6.10 | `client/src/lib/capture/videoRecorderRenderer.ts` | 164 | 审视 |
| 6.11 | `client/src/lib/capture/index.ts` | 58 | 更新导出 |
| 6.12 | `client/src/lib/search/dexieSearchIndexer.ts` | 450 | **需拆分** |
| 6.13 | `client/src/lib/audio/SoundPlayer.ts` | 225 | 审视 |
| 6.14 | `client/src/lib/audio/useAudioPlayer.ts` | 105 | 审视 |
| 6.15-6.22 | `client/src/lib/animation/use*.ts` (5个) + `client/src/lib/3d/` (3个) | 30-196 | 逐个审视 |
| 6.23 | `client/src/lib/env/useRuntimeEnv.ts` | 55 | 审视 |

---

### B7：Hooks & Stores（编排级）

> 目标：Hook 仅做状态编排，不含业务计算。

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 7.01 | `client/src/stores/useSettingsStore.ts` | 133 | 审视 |
| 7.02 | `client/src/stores/useCaptureStore.ts` | 16 | 审视 |
| 7.03 | `client/src/stores/useSidebarStore.ts` | 15 | 审视 |
| 7.04 | `client/src/hooks/useAIBalance.ts` | 153 | 审视 |
| 7.05 | `client/src/hooks/useAIGatewayHealth.ts` | 327 | **需拆分** |
| 7.06 | `client/src/hooks/useOllamaStatus.ts` | 149 | 审视 |
| 7.07 | `client/src/hooks/useMode.ts` | 108 | 审视 |
| 7.08 | `client/src/hooks/usePageTitle.ts` | 91 | 审视 |
| 7.09 | `client/src/hooks/useSessionExpiry.ts` | 49 | 审视 |
| 7.10 | `client/src/hooks/useVirtualList.ts` | 48 | 审视 |
| 7.11 | `client/src/hooks/useNetworkStatus.ts` | 41 | 审视 |
| 7.12 | `client/src/hooks/useInViewAnimation.ts` | 35 | 审视 |
| 7.13 | `client/src/hooks/useDeviceCapability.ts` | 34 | 审视 |
| 7.14 | `client/src/hooks/useStuckTimer.ts` | 34 | 审视 |
| 7.15 | `client/src/hooks/useTheme.ts` | 28 | 审视 |
| 7.16 | `client/src/hooks/useReducedMotion.ts` | 20 | 审视 |

---

### B8：Electron 主进程（系统级）

> 目标：main.ts 拆分、DI 改造、品牌统一。
> 此批次与 B1-B7 无代码依赖（主进程独立编译），可在 B0 后并行执行。

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 8.01 | `client/electron/logger.ts` | 118 | 基础设施，先迁移 |
| 8.02 | `client/electron/ipcUtils.ts` | 141 | 基础设施 |
| 8.03 | `client/electron/ipc/channels.ts` | 104 | IPC 通道定义 |
| 8.04 | `client/electron/db/storageConfig.ts` | 81 | 配置 |
| 8.05 | `client/electron/db/schema.ts` | 212 | 审视 |
| 8.06 | `client/electron/db/sqliteService.ts` | 151 | 审视 |
| 8.07 | `client/electron/db/sqliteRepository.ts` | 195 | 审视 |
| 8.08 | `client/electron/db/fts5Search.ts` | 135 | 审视 |
| 8.09 | `client/electron/db/migration.ts` | 196 | 审视 |
| 8.10 | `client/electron/db/dbFileMigrator.ts` | 239 | 审视 |
| 8.11 | `client/electron/windowScorer.ts` | 128 | 添加 `'熵减'` 关键词 |
| 8.12 | `client/electron/windowManager.ts` | 245 | 审视 |
| 8.13 | `client/electron/trayManager.ts` | 99 | 审视 |
| 8.14 | `client/electron/updater.ts` | 259 | 审视 |
| 8.15 | `client/electron/screenCapture.ts` | 271 | 审视 |
| 8.16 | `client/electron/audioCapture.ts` | 201 | 审视 |
| 8.17 | `client/electron/videoRecorder.ts` | 269 | 审视 |
| 8.18 | `client/electron/captureHandlers.ts` | 421 | **需拆分** |
| 8.19 | `client/electron/mcpBridge.ts` | 269 | 审视 |
| 8.20 | `client/electron/mcpManager.ts` | 373 | **需拆分** |
| 8.21 | `client/electron/preload.ts` | 241 | 审视（安全关键） |
| 8.22 | `client/electron/main.ts` | 717 | **核心拆分**：→ `lifecycle.ts` + `storage-migration.ts` + `csp-policy.ts` + `protocol-handler.ts` + `main.ts`(≤200行入口) |
| 8.23 | `client/electron/ai/index.ts` | 86 | 审视 |
| 8.24 | `client/electron/ai/utils.ts` | 505 | **需拆分** |
| 8.25 | `client/electron/ai/streamHandler.ts` | 152 | 审视 |
| 8.26 | `client/electron/ai/ollama/config.ts` | 152 | 审视 |
| 8.27 | `client/electron/ai/ollama/OllamaProvider.ts` | 242 | 审视 |
| 8.28 | `client/electron/ai/ollama/OllamaService.ts` | 349 | **需拆分** |
| 8.29 | `client/electron/ai/ollama/index.ts` | 122 | 审视 |
| 8.30-8.44 | `client/electron/ai/handlers/*.ts` (15个) | 102-281 | 逐个审视，>300行的拆分 |

---

### B9：UI 基础组件（展示级）

> 按 `components/ui/` → `components/layout/` → `components/onboarding/` → 其他 顺序。
> 每个文件审视：是否 ≤300行、是否有业务逻辑混入。

（56 个文件，按目录顺序逐个迁移，此处不逐一列出，执行时按字母序）

重点关注：
- `FeedbackPanel.tsx` (538行) → **需拆分**
- `Sidebar.tsx` (396行) → **需拆分**
- `CommandPalette.tsx` (281行) → 临界，审视

---

### B10：Features 功能模块（展示级）

> 按功能域顺序：classroom → dashboard → feynman → flashcards → inspiration → notes → pomodoro

重点关注（>300行需拆分）：
- `FeynmanSessionPage.tsx` (1498行) → **严重超标，必须拆分**
- `CaptureSidebar.tsx` (1280行) → **严重超标**
- `StudySessionPage.tsx` (758行) → **需拆分**
- `DeckDetailPage.tsx` (716行) → **需拆分**
- `FreeCanvas.tsx` (605行) → **需拆分**
- `ClassroomPage.tsx` (566行) → **需拆分**
- `FeynmanPage.tsx` (514行) → **需拆分**
- `FlashcardsPage.tsx` (516行) → **需拆分**
- `DashboardPage.tsx` (442行) → **需拆分**
- `InspirationPage.tsx` (428行) → **需拆分**
- `AIEvaluationPanel.tsx` (413行) → **需拆分**

---

### B11：Pages & 路由 & 入口

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 11.01 | `client/src/main.tsx` | — | 入口，审视 |
| 11.02 | `client/src/App.tsx` | — | 路由编排 |
| 11.03 | `client/src/routes/` | — | 路由配置 |
| 11.04 | `client/src/pages/OnboardingPage.tsx` | 574 | **需拆分** |
| 11.05 | `client/src/pages/SettingsPage.tsx` | 140 | 审视 |
| 11.06 | `client/src/pages/LoginPage.tsx` | 145 | 审视 |
| 11.07-11.10 | 其余 Pages (4个) | 132-222 | 审视 |

---

### B12：Server AI 网关（独立模块）

> Python 项目，与客户端无编译依赖，可独立迁移。
> 按层级：config → providers → chains → routers → middleware → tests

| 序号 | 文件路径 | 行数 | 操作要点 |
|------|----------|------|----------|
| 12.01 | `server/ai-gateway/config.py` | 624 | **需拆分**（>300行）：分离模型配置 / 限流配置 / 环境配置 |
| 12.02 | `server/ai-gateway/errors.py` | 59 | 审视 |
| 12.03 | `server/ai-gateway/main.py` | 415 | **需拆分** |
| 12.04-12.08 | `providers/*.py` (5个) | 193-414 | 逐个审视 |
| 12.09-12.28 | `chains/*.py` (20个) | 98-269 | 逐个审视 |
| 12.29-12.43 | `routers/*.py` (15个) | 99-387 | 逐个审视 |
| 12.44-12.46 | `middleware/*.py` (3个) | 89-358 | 审视 |
| 12.47-12.53 | `tests/*.py` (7个) | 147-404 | 审视 |
| 12.54 | `server/.env` / `.env.example` / `.env.production` | — | 更新注释 |

---

### B13：Server 同步服务（独立模块）

> Go 项目，12 个文件，按 models → cache → handlers → middleware → main 顺序。

| 序号 | 文件路径 | 操作要点 |
|------|----------|----------|
| 13.01 | `models/models.go` | 审视 |
| 13.02 | `models/database.go` | 审视 |
| 13.03 | `cache/redis.go` | 审视 |
| 13.04 | `handlers/health.go` | 审视 |
| 13.05 | `handlers/sync.go` | 审视（371行需拆分） |
| 13.06 | `handlers/crdt.go` | 审视 |
| 13.07 | `handlers/websocket.go` | 审视（344行需拆分） |
| 13.08 | `middleware/auth.go` | 审视 |
| 13.09 | `main.go` | 审视 |
| 13.10-13.12 | `*_test.go` (3个) | 审视 |

---

### B14：Website 官网（独立模块）

| 序号 | 文件路径 | 操作要点 |
|------|----------|----------|
| 14.01 | `website/package.json` | 复制 |
| 14.02 | `website/next.config.ts` | 原样复制 |
| 14.03 | `website/tsconfig.json` | 原样复制 |
| 14.04 | `website/app/layout.tsx` | 审视 metadata |
| 14.05 | `website/app/page.tsx` | 审视（310行临界） |
| 14.06 | `website/app/download/page.tsx` | 审视（316行需拆分） |
| 14.07 | `website/app/story/page.tsx` | 审视（307行临界） |
| 14.08 | `website/app/support/page.tsx` | 审视 |
| 14.09-14.14 | `website/components/*.tsx` (6个) | 逐个审视 |
| 14.15 | `website/lib/*.ts` | 审视 |

---

### B15：Scripts / CI / Docs（支撑层）

| 序号 | 文件路径 | 操作要点 |
|------|----------|----------|
| 15.01 | `scripts/version-bump.mjs` | 原样复制（已用动态路径） |
| 15.02 | `scripts/generate-sounds.mjs` | 审视（685行需拆分） |
| 15.03 | `scripts/session-detect.mjs` | 审视（375行需拆分） |
| 15.04 | `scripts/session-record.mjs` | 审视 |
| 15.05 | `scripts/session-route.mjs` | 审视 |
| 15.06 | `scripts/generate_source_code_doc.ps1` | **硬编码路径修复** → `$PSScriptRoot` |
| 15.07 | `.github/workflows/pr-check.yml` | 原样复制 |
| 15.08 | `.github/workflows/version-release.yml` | 原样复制 |
| 15.09 | `.github/workflows/release.yml` | 原样复制 |
| 15.10 | `.github/workflows/deploy-server.yml` | `/opt/keban` → `/opt/entropydecrease` |
| 15.11 | `.github/workflows/deploy-website.yml` | `/opt/keban` → `/opt/entropydecrease` |
| 15.12 | `server/docker-compose.yml` | 原样复制 |
| 15.13 | `server/docker-compose.prod.yml` | `/opt/keban/website` → `/opt/entropydecrease/website` |
| 15.14 | `server/nginx/nginx.conf` | 更新注释 |
| 15.15 | `server/deploy.sh` | 审视 |
| 15.16 | `AGENTS.md` | 重写（品牌 + 模块边界更新） |
| 15.17 | `README.md` | 重写 |
| 15.18 | `CHANGELOG.md` | 原样复制（历史记录不改） |
| 15.19 | `docs/` 目录 | 原样复制全部文档 |

---

## 八、迁移执行规则

### 8.1 单文件迁移 SOP

```
┌─────────────────────────────────────────────────────────┐
│ 1. 复制源文件到新路径对应位置                              │
│ 2. 阅读文件，输出一份简要审视报告：                        │
│    - 当前行数 / 是否超标                                  │
│    - 是否有 `any` / 隐式依赖 / 硬编码                     │
│    - 品牌标识残留                                         │
│    - 需要的修改清单                                       │
│ 3. 等待用户确认修改方案                                   │
│ 4. 执行修改                                              │
│ 5. 运行验证命令确认通过                                   │
└─────────────────────────────────────────────────────────┘
```

### 8.2 批次验证门禁

| 批次完成时 | 验证命令 |
|------------|----------|
| B0 | `npm install && npm run build` |
| B1-B7 | `npx tsc --noEmit && npm run lint && npm run test -- --run` |
| B8 | `tsc -p electron/tsconfig.json`（主进程编译） |
| B9-B11 | `npm run build`（完整构建） |
| B12 | `cd server/ai-gateway && python -m pytest tests/ -v` |
| B13 | `cd server/sync-service && go build ./... && go test ./...` |
| B14 | `cd website && npm run build` |
| B15 | `npm run release:dry`（semantic-release 干跑） |

### 8.3 需拆分文件汇总（>300行）

共计 **28 个文件**超出 300 行限制，按严重程度排序：

| 行数 | 文件 | 建议拆分方案 |
|------|------|-------------|
| 1498 | `FeynmanSessionPage.tsx` | 按步骤拆为 5+ 子组件 |
| 1280 | `CaptureSidebar.tsx` | 分离面板/工具栏/预览 |
| 758 | `StudySessionPage.tsx` | 分离卡片渲染/控制/统计 |
| 757 | `ElectronAIPlugin.ts` | 按功能域拆分 |
| 717 | `main.ts` | → 4 个模块 + 入口 |
| 716 | `DeckDetailPage.tsx` | 分离列表/详情/操作 |
| 676 | `captureManager.ts` | 分离调度/设备/生命周期 |
| 668 | `RemoteAIPlugin.ts` | 按请求类型拆分 |
| 624 | `config.py` | 分离模型/限流/环境配置 |
| 616 | `AIPluginLoader.ts` | 分离发现/加载/注册 |
| 605 | `FreeCanvas.tsx` | 分离画布/工具/渲染 |
| 585 | `SyncEngine.ts` | 分离推送/拉取/冲突 |
| 574 | `OnboardingPage.tsx` | 已有 steps/ 子目录，提取逻辑 |
| 552 | `exportImport.ts` | 分离 export/import/格式 |
| 538 | `FeedbackPanel.tsx` | 分离表单/列表/操作 |
| 521 | `crossFusion.ts` | 分离融合策略/IO |
| 516 | `FlashcardsPage.tsx` | 分离列表/创建/筛选 |
| 514 | `FeynmanPage.tsx` | 分离导航/内容/操作 |
| 505 | `electron/ai/utils.ts` | 按功能域拆分 |
| 450 | `dexieSearchIndexer.ts` | 分离索引/查询/维护 |
| 444 | `crdtEngine.ts` | 分离本地/远程/合并 |
| 442 | `DashboardPage.tsx` | 分离各数据面板 |
| 432 | `routeDispatcher.ts` | 按路由类型拆分 |
| 428 | `InspirationPage.tsx` | 分离列表/操作/筛选 |
| 421 | `captureHandlers.ts` | 按捕获类型拆分 |
| 415 | `main.py` | 分离路由注册/中间件/启动 |
| 413 | `models.ts` | 按领域拆分类型文件 |
| 396 | `Sidebar.tsx` | 分离导航项/折叠/渲染 |

---

## 九、阶段 10（UI/Features/Pages）收尾结论

### 9.1 巨型文件拆分成果（>600 行全部归零）

| 原文件 | 原行数 | 现行数 | 拆出模块数 |
|--------|--------|--------|-----------|
| `FeynmanSessionPage.tsx` | 1502 | 287 | 9 |
| `CaptureSidebar.tsx` | 1281 | 195 | 10 |
| `AIProviderSettings.tsx` | 1034 | 193 | 6 |
| `useClassroomCapture.ts` | 1025 | 224 | 7 |
| `NoteEditPage.tsx` | 1006 | 280 | 6 |
| `StudySessionPage.tsx` | 762 | 291 | 5 |
| `DeckDetailPage.tsx` | 720 | 235 | 5 |
| `DataSettings.tsx` | 639 | 26 | 4 |
| `FeynmanPage.tsx` | 517 | 272 | 2 |
| `useFeynmanStore.ts` | 443 | 30 | 3 |
| `SocraticDialogue.tsx` | 371 | 236 | 1 |

拆分过程中同步清理的死代码：`AIEvaluationPanel.tsx`（416 行，零引用）、
源项目废弃的 `useFeynmanSession.tsx`（与新 hook 命名冲突的烂尾文件）。

### 9.2 §1 边界豁免清单（300-600 行，策略 B 裁决）

以下 21 个文件位于 300-600 行区间，经用户裁决采用**分级策略**：
不在本阶段强制拆分，登记为待专项重构项。豁免理由分三类——
① 页面级组合层（本身已是编排，进一步拆分收益低于可读性损失）；
② Zustand store（域内高内聚，拆 slice 需同步改动多个消费方与测试）；
③ 3D/图表组件（视觉参数密集，拆分后反而割裂上下文）。

| 行数 | 文件 | 类别 | 后续建议 |
|------|------|------|---------|
| 587 | `NotesPage.tsx` | ① | 提取列表/筛选/批量操作 |
| 577 | `OnboardingPage.tsx` | ① | 已有 steps/ 子目录，提取步骤编排 hook |
| 568 | `ClassroomPage.tsx` | ① | 提取三路径面板为独立组件 |
| 551 | `PomodoroSettingsPage.tsx` | ① | 按设置分组拆区块 |
| 543 | `FeedbackPanel.tsx` | ① | 分离表单/列表 |
| 539 | `FreeCanvas.tsx` | ① | 已拆 Overlays，剩余为画布核心（已接受） |
| 519 | `FlashcardsPage.tsx` | ① | 分离列表/创建/筛选 |
| 498 | `captureManager.ts` | ② | 已拆 controller/processor，剩余为编排核心（已接受） |
| 462 | `PomodoroStatsPage.tsx` | ③ | 提取图表组件 |
| 450 | `usePomodoroStore.ts` | ② | 可按 timer/stats/settings 拆 slice |
| 444 | `DashboardPage.tsx` | ① | 分离各数据面板 |
| 440 | `useNoteStore.ts` | ② | 可按 CRUD/search/tags 拆 slice |
| 431 | `InspirationPage.tsx` | ① | 分离列表/操作/筛选 |
| 424 | `ProfileSettings.tsx` | ① | 分离账户/偏好区块 |
| 399 | `Sidebar.tsx` | ① | 分离导航项/折叠逻辑 |
| 395 | `GenerativeReviewPage.tsx` | ① | 提取生成流程 hook |
| 383 | `useStudySessionStore.ts` | ② | 可按 session/rating/goldenError 拆 slice |
| 365 | `AuroraDomeWorld.tsx` | ③ | 3D 场景，视觉参数密集 |
| 365 | `PomodoroPage.tsx` | ① | 提取计时器组件 |
| 335 | `EfficiencyChart.tsx` | ③ | 图表配置密集 |
| 329 | `AboutSettings.tsx` | ① | 分离版本/更新/致谢区块 |

> 已获用户明确"接受"的边界豁免：`captureManager`(498)、`FreeCanvas`(539)。

### 9.3 阶段 10 合规审计结果

扫描范围：渲染层 `client/src` + 主进程 `client/electron`，共 **535 个文件**（排除测试）。

| 维度 | 结果 |
|------|------|
| §1 单文件 >600 行 | **0** |
| §1 单文件 300-600 行 | 21（见 9.2 豁免清单） |
| §2 `any` 命中 | **0**（收尾时修复 2 处：`sound.ts` webkitAudioContext 双构造器、`ContextRecovery.tsx` WebGLProgram 改结构类型） |
| §3 缺 `@ai-context` | **0**（收尾时补齐 10 个：AuthGuard/3 个 index/SyncContext/uuid/utils/setup/App/main） |
| §5 环境变量硬编码 | 5 处均为 `import.meta.env.X || '生产默认值'` 模式与 CSP 白名单，属合理默认（见 9.4） |
| 品牌残留 | 63 处全为旧键迁移常量、迁移说明注释与永久豁免的用户数据标识 |
| `tsc -p tsconfig.app.json` | **0 错误** |
| `tsc -p electron/tsconfig.json` | **0 错误** |
| 单元测试 | 23 个测试文件：21 通过；2 个为源项目存量问题（见 9.6） |

### 9.4 §5 合理默认值说明（非违规）

以下 5 处出现字面量域名，均非"硬编码假设"，登记备查：

| 位置 | 形式 | 判定 |
|------|------|------|
| `lib/ai/config.ts` | `import.meta.env.VITE_AI_GATEWAY_URL \|\| 'https://entropydecrease.com'` | 环境变量优先，默认值仅作生产兜底 |
| `electron/ai/gatewayConfig.ts` | `DEFAULT_GATEWAY_URL` 常量 | 同上，主进程侧兜底 |
| `electron/cspPolicy.ts` ×3 | CSP `connect-src` 白名单 | CSP 必须在编译期确定允许来源，无法完全动态化 |

### 9.5 收尾时修复的环境问题

拆分过程中发现并修复的非拆分类问题：

1. **根 `package.json` 带 UTF-8 BOM** → Node 报 `Invalid package config`，导致 vitest 无法启动
2. **`client/electron-builder.yml` 带 BOM** → 打包配置解析隐患
3. **`client/src/test/setup.ts` 未迁移** → 阶段 10 复制清单遗漏 test 目录，阻塞全部单元测试

### 9.6 单元测试存量问题（非迁移引入，已对比源项目确认）

以下 2 项在源项目 KeBan/client 中同样存在，迁移过程未引入回归，登记备查：

| 测试文件 | 现象 | 判定 |
|---------|------|------|
| src/lib/sm2.test.ts | goldenErrorMultiplier=0 时间隔最小为 1 断言失败（期望 1，实际 25） | 源项目同样失败，属 SM2 黄金错题逻辑与测试预期不一致的存量缺陷 |
| src/features/pomodoro/store/usePomodoroStore.test.ts | 测试进程挂起（>70s 无输出） | 源项目同样挂起，疑为定时器未用 fake timer 导致 vitest 无法退出 |

> 这两项不阻塞阶段 10 收尾，建议作为独立技术债在后续迭代修复（sm2 需对齐黄金错题间隔语义；pomodoro 需引入 vi.useFakeTimers()）。

---

## 十、阶段 11（Server AI 网关）收尾结论

Python / FastAPI 服务，与客户端无编译依赖，独立迁移。共 80 个文件。

### 10.1 §1 巨型文件拆分（>300 行全部归零）

| 原文件 | 原行数 | 拆分结果 |
|--------|--------|---------|
| `config.py` | 625 | `config/` 包：`runtime`(26) / `limits`(67) / `providers`(199) / `fallback`(245) / `app`(32) / `__init__`(53，兼容 re-export) |
| `main.py` | 416 | `main.py`(179) + `logging_setup`(25) + `provider_bootstrap`(62) + `security_middleware`(32) + `health`(85) |
| `providers/qwen_provider.py` | 415 | `qwen_provider.py`(196，文本/语音/流式) + `qwen_vision.py`(212，视觉/视频 Mixin + 错误分类器) |
| `routers/multimodal.py` | 388 | `multimodal.py`(190，session+merge) + `multimodal_video.py`(96) + `multimodal_schemas.py`(59) |
| `routers/learning.py` | 365 | `learning.py`(228) + `learning_schemas.py`(92) |

拆分保持向后兼容：`config/` 包经 `__init__.py` 按依赖序 re-export 全部公共符号，
既有 `from config import X` 零改动；`QwenProvider` 经多重继承
（`AIProvider` + `QwenVisionMixin`）保留完整方法集；多模态视频端点经
`include_router` 挂载，OpenAPI 验证 4 端点齐全。

### 10.2 品牌与合规

- 品牌重命名：58 个文件 `课伴/KeBan/keban → 熵减/Entropydecrease/entropydecrease`，0 残留
- §3 `@ai-context`：源项目仅 10/51 文件含此标签（存量缺口），本次补齐至 **0 缺失**

### 10.3 修复的存量缺陷（非迁移引入）

| 缺陷 | 现象 | 处理 |
|------|------|------|
| `routers/course_detect.py:33` | 课程名示例误用 ASCII 双引号致 `SyntaxError`，使 `import routers` 失败 | 改为全角引号 |
| `tests/test_routers.py` / `test_socratic.py` | patch 旧函数名 `call_with_fallback` 且 mock 2 元组，但 router 已重构为 `call_with_fallback_for_request`（3 元组） | 对齐 patch 名与 3 元组返回值 |

> 上述测试缺陷在源项目被 course_detect 语法错误掩盖（收集错误，从未真正运行）；
> 修复语法错误后暴露并对齐。修复后目标测试套件 **133 通过 / 0 失败**，较源项目更绿。

### 10.4 验证结果

| 项 | 结果 |
|----|------|
| 全量 `py_compile` 语法 | **0 错误** |
| `import main` / `import routers` | 成功（28 个 OpenAPI 端点） |
| `pytest tests/` | **133 通过 / 0 失败** |
| §1 >600 行非测试文件 | **0** |
| §3 缺 `@ai-context` | **0** |

### 10.5 §1 豁免清单（300-600 行，策略 B 登记，待专项重构）

拆分验证时全部 <300 行，随后批量注入 `@ai-context` 注释使 7 个临界文件越过 300 行线。
按阶段 10 裁决的策略 B 登记豁免（>600 硬拆已归零）：

| 文件 | 行数 | 说明 |
|------|------|------|
| `middleware/auth.py` | 361 | JWT 认证，安全关键（AGENTS.md 列为额外审查文件），高内聚不宜轻拆 |
| `providers/glm_provider.py` | 349 | GLM Provider 完整实现（文本/视觉/流式） |
| `routers/balance.py` | 335 | 含阿里云 V3 签名内联实现，签名逻辑与调用强耦合 |
| `providers/base_provider.py` | 322 | Provider 抽象基类 + 公共重试/降级逻辑 |
| `routers/socratic.py` | 321 | 苏格拉底链路由，与 chains/ 已按职责分层 |
| `routers/streaming.py` | 313 | SSE 流式端点，流控逻辑高内聚 |
| `providers/gemini_provider.py` | 312 | Gemini Provider 完整实现 |

### 10.6 合规审计结论（七维度）

| 维度 | 结果 |
|------|------|
| §1 行数 | >600 = 0；300-600 = 7（已登记 10.5 豁免清单） |
| §2 类型契约 | 公共函数参数全无注解 = **0** |
| §3 `@ai-context` | 缺失 = **0** |
| §5 硬编码密钥 | **0**（全部走 `os.getenv`） |
| §5 硬编码 URL | 1 处误报：`balance.py` f-string 引用常量 `business.aliyuncs.com`（阿里云 BSS 官方固定端点，白名单域），判定合规 |
| §7 测试隔离 | 测试中真实网络/DB 直连 = **0** |
| 品牌残留 | keban/课伴 = **0** |

---

## 十一、阶段 12（Server 同步服务）收尾结论

Go / Gin 项目，独立迁移。源目录真实文件 15 个，目标产出 20 个（含拆分新增），`go build` / `go vet` / `go test` 全绿。

### 11.1 §1 巨型文件拆分（>300 行全部归零）

| 原文件 | 原行数 | 拆分结果 |
|--------|--------|---------|
| `handlers/sync.go` | 372 | `sync.go`(146，Push) + `sync_helpers.go`(52，toJSON/fromJSON/nextSeqNo/ConflictInfo) + `sync_query.go`(65，Pull/Status) + `sync_resolve.go`(89，Resolve) |
| `handlers/websocket.go` | 345 | `websocket.go`(112，协议类型/升级入口/广播) + `ws_connection.go`(136，连接生命周期与读写泵) + `ws_manager.go`(70，连接管理器) |

拆分全部位于同一 `handlers` 包内，公共 API（Push/Pull/Resolve/Status/CRDTPush/CRDTPull/BroadcastOperation/HandleWebSocketWithGin）零改动，测试文件原样通过。

### 11.2 品牌与合规

- module 更名：`keban/sync-service` → `entropydecrease/sync-service`（全部 import 路径同步更新）
- DSN 默认值 `postgres://keban:keban_dev@localhost:5432/keban` 中的 keban 库名/用户名属**用户数据标识永久豁免**，保留
- §3 `@ai-context`：源项目 0/9 非测试文件含此标签，本次补齐至 **0 缺失**（中英双语）
- 死代码修复：`handlers/health.go` 的 `HealthCheck` 原为未使用死代码且版本号 `0.2.0-alpha` 与 main 内联 `0.5.0` 漂移 → 收敛为 `ServiceVersion` 单一常量，新增 `ReadyCheck`，main 改为纯装配（117→74 行）
- Dockerfile：`COPY go.mod go.sum ./`（原仅 go.mod，补齐构建可复现性）

### 11.3 源目录污染（不迁移，留档备查）

源 `server/sync-service/` 下存在 `package.json` / `package-lock.json` / `node_modules/`（Tauri 前端依赖 @tauri-apps/*），系误操作在 Go 服务目录执行了 npm install。与同步服务无任何引用关系，判定为污染，**未迁移**。

### 11.4 技术债登记

| 项 | 说明 |
|----|------|
| `websocket.go` CheckOrigin 恒真 | 源项目既有行为；WS 认证走 ?token= JWT 非 Cookie，跨站风险有限，建议后续按 ALLOWED_ORIGINS 环境变量收紧 |

### 11.5 验证结果

| 项 | 结果 |
|----|------|
| `go build ./...` | **通过** |
| `go vet ./...` | **0 告警** |
| `go test ./... -count=1` | **3 包全部 ok**（cache/handlers/models） |
| `gofmt -l` | **0 文件**（Write 产出的 CRLF 已统一为 LF） |
| §1 >300 行非测试文件 | **0** |
| §3 缺 `@ai-context` | **0** |
| 品牌残留（豁免项外） | **0** |

---

## 十二、阶段 13（Website 官网）收尾结论

Next.js 16 静态导出站点，独立迁移。源目录真实文件 35 个（含 public 资产），排除构建产物（node_modules/.next/out/tsbuildinfo）后全量复制。

### 12.1 §1 行数审视

B14 清单预估的 310/316/307 行偏大，实测三页面为 278/295/287，**全部 ≤300 行，无需拆分**（注入 @ai-context 后最大 299 行，仍达标）。

### 12.2 品牌重命名（18 处替换，Python 脚本带唯一性断言）

- 站点标题/描述/OG/keywords：「课伴 KeBan · 熵减」混合形态 → 「熵减 Entropydecrease」（layout.tsx 6 处）
- 导航/页脚/下载卡片/支持页/首页文案：「课伴」→「熵减」（共 10 处）
- `theme.tsx` storageKey：`keban-theme` → `ed-theme`（新域名无存量用户，非豁免项）
- globals.css 设计系统注释 1 处

**保留项（合理不改）**：

| 项 | 理由 |
|----|------|
| GitHub 链接 `Aparencia/KeBan` ×7 | 真实发布仓库/下载源，改名即死链；待仓库实际更名后一次性替换（登记待决） |
| ICP `闽ICP备2025100891号-1` / 公安备案 / 百度验证码 | 域名法律绑定与所有权凭证 |
| `--kb-*` CSS 设计令牌（200+ 引用） | 内部缩写非品牌字面，改动面风险远大于收益，登记技术债 |

### 12.3 §3 @ai-context

源项目 0/14 源码文件含此标签，本次补齐至 **0 缺失**（中英双语，含 Why 说明；排除 next-env.d.ts 自动生成文件与纯配置文件）。

### 12.4 存量问题登记

| 项 | 说明 |
|----|------|
| Footer.tsx `<img>` lint 警告 | 源项目同样存在；备案图标 3.5×3.5px 用 next/image 收益为零，不阻塞 |

### 12.5 验证结果

| 项 | 结果 |
|----|------|
| `npm run build`（next build + TypeScript） | **通过**，9 个静态页全部生成 |
| `npm run lint` | **0 错误**（1 警告为存量） |
| §1 >300 行 | **0** |
| §3 缺 `@ai-context` | **0** |
| 品牌残留（保留项外） | **0** |

---

## 十三、阶段 14（Scripts / CI / Docs 支撑层）收尾结论

跨模块支撑层：scripts 6 个有效脚本、CI 5 个工作流、server 根部署文件 10 个（含 shared/proto 3 个）、根文档 4 个、docs/ 全量 86 个。

### 13.1 §1 巨型脚本拆分（>300 行全部归零）

| 原文件 | 原行数 | 拆分结果 |
|--------|--------|---------|
| `scripts/generate-sounds.mjs` | 686 | 入口(109) + `sound-gen/engine.mjs`(182，DSP原语) + `fx-defs.mjs`(93，42个声明式音效) + `tracks.mjs`(206，6个循环音轨) + `mp3.mjs`(64，编码降级链) |
| `scripts/session-detect.mjs` | 376 | `session-detect.mjs`(158，主流程/合并) + `session-detect-strategies.mjs`(186，4种检测策略) |

功能验证：内存冒烟 42/42 音效渲染正常、6/6 音轨生成正常、WAV 头有效；`session-detect`/`session-route --status` 实际运行通过。

### 13.2 关键联动修复与硬编码消除

| 文件 | 修复 |
|------|------|
| `deploy-website.yml` | 冒烟断言 `grep -q "课伴"` → `grep -q "熵减"`（阶段 13 官网已更名，旧断言部署必败）；`/opt/keban/website` → `/opt/entropydecrease/website` ×2 |
| `deploy-server.yml` | `cd /opt/keban` → `cd /opt/entropydecrease` |
| `docker-compose.prod.yml` | nginx 挂载 `/opt/keban/website` → `/opt/entropydecrease/website` |
| `nginx.conf` | 注释同步路径更新 |
| `generate_source_code_doc.ps1` | 硬编码绝对路径 → `$PSScriptRoot` 派生；适配 config.py→config/ 包；文档头 KeBan→Entropydecrease |
| `session-record.mjs` | `project: 'KeBan'` → `'Entropydecrease'` |
| `.env.example`（根+server） | 品牌头部更名；注释中示例域名 keban.app → entropydecrease.com；DB keban 默认值属用户数据豁免保留 |
| `AGENTS.md` | 重写：品牌 + 模块边界更新（config/ 包、同步服务入口、新验证命令）+ 追加 §1/§3/豁免约定 |
| `README.md` | 品牌 6 处更名；GitHub 链接与 clone 路径保留（仓库待决） |

### 13.3 不迁移项（判定废弃/临时）

| 文件 | 判定 |
|------|------|
| `scripts/test_connectivity.ps1` / `test_summarize.ps1` | 内容已损坏（`$` 符全部丢失，语法无效），废脚本 |
| `urls.txt` / `test-env.ps1` / `教训.md` | 一次性临时便签/个人笔记 |
| `scripts/.mp3tmp/` / `scripts/sounds_backup_original/` | 临时产物与备份，非源码 |

### 13.4 验证结果

| 项 | 结果 |
|----|------|
| `node --check` 全部 .mjs（11 个） | **0 错误** |
| PS Parser 解析 generate_source_code_doc.ps1 | **0 错误** |
| 音效引擎冒烟（内存渲染） | **42 音效 + 6 音轨 + WAV 头全过** |
| session 工具链实际运行 | **通过** |
| §1 >300 行脚本 | **0** |
| 品牌残留（豁免/待决项外） | **0** |
| `npm run release:dry`（B15 门禁） | **暂缓**：目标目录尚未 `git init`，semantic-release 依赖 git 仓库与远程；待阶段 16 仓库初始化后补跑 |

> docs/ 86 个文档按 15.19 原样复制（历史文档不改写，含本规范文档快照）；CHANGELOG.md 原样保留历史记录。

---

## 十四、阶段 15（docs/ 重组）收尾结论与去向对照清单

目标端 docs/ 从 **10 目录 86 文件 → 4 目录 51 文件**（standards 23 / product 7 / versions 9 / templates 11 / README 1）。源 KeBan/docs 未动。

### 14.1 合并产物（编辑性合并，文件头均注明来源）

| 新文档 | 来源 | 处理 |
|--------|------|------|
| standards/ai-coding.md | 10-ai-coding + AI编程工具规范 | 互补双 Part（协作方式/七维度），重叠处双视角保留并注明 |
| standards/refactoring.md | 13-refactoring + AI规范§1/§6 衔接章 | 新增项目硬性阈值与已验证拆分模式衔接说明 |
| standards/security.md | 17 + 17b | 事前预防/事中应急双 Part |
| standards/cicd-release.md | 20 + 21 + examples(ci.yml/Dockerfile) | 双 Part + 示例附录 |
| standards/server-ops.md | 22b + 22 + examples(server-init.sh/nginx/compose) | 加固/灾备双 Part + 3 脚本附录 |
| standards/api-design.md | 07 + 08 | API/数据层双 Part（已裁决并入） |
| standards/git-workflow.md | 09 + examples(gitmessage) | 提交模板附录 |
| product/ui-ux-system.md | UI-UXv2（主文权威）+ 颜色简析 + ux想法 + 05 + 06 | 主文 + 4 附录（哲学源头/灵感维度/通用方法论） |
| product/requirements-pool.md | 需求池 + phase-1 的 00-03 萃取 | 附录：目的+检查清单精要 |
| versions/v0.3.0.md / v0.4.0.md | 各 8/7 文件 | 全文拼合（含目录与原文件标记，零内容丢失） |

### 14.2 移动改名（内容不变）

- standards/：code-review(11)、debug-sop(12)、env-and-config(14)、documentation(15)、testing(16)、performance(18)、logging-observability(19)、maintenance-iteration(23)、tech-debt(24)、incident-postmortem(25)、knowledge-management(26)、dependency-management(27)、third-party-integration(28)、data-governance(29)、user-feedback-support(30)、adr(04，具独立规范价值整体保留)
- product/：brand-story、icon-design、theme、pain-points、migration-spec（本规范快照）
- versions/：v0.5.0~v1.1.0 单文件目录提升改名；templates/ 原样

### 14.3 删除项（精选并入后）

| 原文件 | 理由 |
|--------|------|
| examples/ 全目录（9） | 已裁决：有价值片段（ci.yml/Dockerfile/server-init.sh/nginx/compose/gitmessage）已以代码块并入对应 standards 文档；.env/gitignore 示例与项目真实配置重复；examples/README 为索引无信息增量 |
| phase-1 的 00-03（4） | 通用方法论，目的+检查清单已萃取入 requirements-pool 附录 |
| 各合并源文件 | 内容已全量/精选并入新文档 |

### 14.4 验证

- 新结构 4 目录 51 文件；standards/product 内部交叉链接已按映射表修复 24 文件，残留旧 phase- 链接 **0**（migration-spec/versions 历史快照除外）
- 目标根 AGENTS/README 无旧路径引用；合并产物抗抽查完好（ai-coding.md 双 Part 结构正确）

---

## 十五、Git 策略落地与完整性/安全性双审查

### 15.1 Git 策略（main / dev，依 `standards/git-workflow.md`）

| 项 | 结果 |
|----|------|
| 历史策略 | 续接课伴历史：`git reset --soft origin/master` 后提交迁移成果，31 个旧 tag 与全部 Release 保留（保障已安装客户端自动更新链路） |
| 分支 | `main`（生产，push 触发 semantic-release）+ `dev`（开发主线），两者已同步至 c15c8ac |
| 发布/CI | `.releaserc.json` 与 3 个部署/发版 workflow master→main；`pr-check.yml` PR 目标 `[main, dev]` |
| Git Hooks | husky 9 + lint-staged + commitlint（type 集合对齐 .releaserc releaseRules）；**拦截冒烟已验证**：`update stuff` 被拒（exit 1）、`chore: ...` 通过 |
| 密钥卫生门禁 | `.gitignore` 补 `.env.test`；两次提交前 `git status` 均无 .env 入暂存；git 跟踪 838 文件零 .env |
| docs 入库 | 按工程文档 §6 移除 `docs/` 排除（源项目排除属存量偏差） |
| 仓库更名销项 | `electron-builder.yml` owner 占位符 `YourGitHubUsername`→`Aparencia`（**否则客户端永远查不到更新**）；website 7 处 + README 3 处链接改新仓库名 |
| 待用户执行 | GitHub 网页：master → main 改名、默认分支设 dev、main 分支保护（禁直推+要求 pr-check）；之后 push main+dev 并补跑 release:dry |

> `release:dry` 当前报 `release branches are invalid`——远程仅有 master 无 main 分支所致，属预期；改名+push 后即可通过。

### 15.2 完整性审查发现（阻塞级 2 项，已修复）

| 等级 | 发现 | 根因 | 处置 |
|------|------|------|------|
| **阻塞** | `client/public/` 全部 54 文件（42 音效 wav + 6 音轨 mp3 + PWA 图标 + 离线页 + favicon）未迁移 | 阶段 1-15 从未在目标执行 `client` 完整 `vite build`，`tsc --noEmit` 不解析静态资产与 CSS | 已全量补齐，首次完整构建通过（PWA precache 343 条） |
| **阻塞** | `client/src/styles/` 4 文件未迁移 | `tokens.css` 被 `index.css:5` @import、`performance.css` 被 `main.tsx:10` import——**构建期硬依赖** | 已补齐 |
| **高危** | nginx 缺 `/api/v1/asr/` location | 客户端 3 处调用 `/api/v1/asr/transcribe`，gateway `transcribe.py` 有该前缀，但请求落入 `location /` 静态站点 → 生产环境语音转写必然 404（源项目同缺，存量） | 已新增 location（参照 vision 配置：50m body + 300s 超时） |
| 低危 | scripts 3 个原样复制脚本缺 `@ai-context` | 阶段 14 仅给新拆分文件添加 | 已补齐 |
| 信息 | 其余 11 文件缺 `@ai-context` | 均为纯配置文件（vite/vitest/eslint/next/postcss config）与 Go 测试文件 | 豁免，不计入缺口 |

### 15.3 完整性审查验证矩阵

| 模块 | 结果 |
|------|------|
| client 双 tsc | **0 错** |
| client lint | **0 错误**（108 警告存量） |
| client `npm run build` | **通过**（首次执行，即发现资产缺失的验证） |
| ai-gateway pytest | 130 通过 / 3 失败（`TestJWTDevMode`）——源项目同样 3 失败，根因 `getaddrinfo failed`（测试依赖真实网络获取 JWKS），**属环境性失败 + §7 测试隔离违规存量缺陷** |
| sync-service | `go build` / `go vet` / `go test` **全绿** |
| website | `npm run build` **通过**（链接改名后重建），lint 0 错误 |
| 源↔目标文件比对 | 修复后非豁免缺失 **0** |
| 跳模块契约 | nginx location ↔ gateway 5 前缀 ↔ sync 1 组 全覆盖（修 asr 后）；端口 8000/8080 一致 |
| 死引用 | 旧 module 路径/已删组件/旧拆分导入 **均 0** |
| §1 >600 行 | 1 项：`client/src/index.css=927`（CSS 全局样式表，登记技术债） |
| §1 300-600 行 | 33 项（策略 B 豁免，含阶段 10 已登记 21 项 + website/server 新入 12 项） |

### 15.4 安全审查结果

**本地审计**

| 项 | 结果 |
|----|------|
| 密钥卫生 | git 跟踪 838 文件零 .env；真实密钥字面量（sk-/LTAI/ghp_/JWT/PEM）**0** |
| Electron 基线 | **7/7 PASS**（contextIsolation 显式 true、nodeIntegration 关、sandbox/webSecurity 未禁、contextBridge、openExternal 白名单、CSP 在 cspPolicy.ts） |
| JWT | 双服务 **PASS**——gateway `{"algorithms": [alg], "audience": "authenticated"}` 显式单算法防 alg 混淆 + iss 校验；sync-service 强制 `SigningMethodRSA` + sub 非空 |
| Nginx | 安全四头、限流、HTTP→HTTPS 301、TLS≥1.2 **全 PASS** |
| 部署隔离 | 生产 DB/Redis 绑 127.0.0.1、Redis requirepass **PASS** |
| §7 测试隔离（静态） | 无 mock 的网络调用 **0**（但运行时暴露 TestJWTDevMode 依赖 JWKS，见 15.3） |

**云端扫描**（3 批安全关键路径，全仓超 10,000 行限额故定向）

| 批次 | 范围 | 结果 |
|------|------|------|
| 1 | 双服务 middleware、preload.ts、cspPolicy.ts | **无问题** |
| 2 | sync-service handlers（含 WebSocket）、nginx.conf、docker-compose.prod.yml | **无问题** |
| 3 | main.ts、ipcUtils.ts、balance.py（阿里云 V3 签名）、base_provider.py | **无问题** |

### 15.5 登记技术债（中低危，不阻塞）

| 项 | 说明与建议 |
|----|---------|
| 生产 `CORS_ORIGINS:-*}` | 未设变量时放通全部源。建议去掉默认值使缺失时启动失败，或改为生产域名 |
| WS `CheckOrigin` 恒真 | 认证走 ?token= JWT 非 Cookie，跨站风险有限；建议按 ALLOWED_ORIGINS 收紧 |
| 两个 Dockerfile 未设 `USER` | 容器以 root 运行（违反 security.md 部署清单）；建议加非 root 用户并重验构建 |
| gateway JWT 开发降级模式 | 密钥未配时不验签名仅提 sub（有 RuntimeWarning）。建议 `APP_ENV=production` 时硬失败而非降级 |
| npm 高危依赖 | client 8 个直接依赖 high（electron/electron-builder/react-router-dom/vite-plugin-pwa/postcss/concurrently 等，多为需 major 升级）；website 12 high；root 12 high+1 critical。升级需专项回归验证 |
| Go 依赖 | `golang-jwt/jwt/v5 v5.2.1`、`golang.org/x/net v0.25.0` 存在已知 CVE；govulncheck 与 proxy.golang.org 均不可达，未能自动验证 |
| `client/src/index.css=927` | §1 违规（CSS）；全局样式表拆分需谨慎，建议按令牌/布局/动效分文件 |
| `TestJWTDevMode` 3 项 | 依赖真实网络（JWKS），离网必败；应改为 mock JWKS 响应（§7） |
| npm audit 镁像限制 | 默认 registry 为 npmmirror 不支持 advisories API，需 `--registry=https://registry.npmjs.org` |

### 15.6 发版链路修复与部署首跑验证（v0.25.0 实发闭环）

PR #2 合并后 Version & Release 连续两次失败，逐层定位出两个独立根因并全部修复：

| # | 根因 | 修复 |
|---|------|------|
| 1 | **GH013**：main ruleset 强制"必须走 PR"，把 semantic-release 自身的发版推送（`chore(release)` 提交 + tag → `HEAD:main`）一并拦截 | `version-release.yml` 的 checkout 与 semantic-release 环境改用 `secrets.RELEASE_TOKEN`（细粒度 PAT，带 `\|\| github.token` 回退）；ruleset Bypass list 添加 Repository admin（PR #3） |
| 2 | **PAT 空权限 403**（`Permission denied to Aparencia`）：token 创建时未勾选仓库与权限 | PAT 补齐：Repository access=Entropydecrease、Contents/Issues/Pull requests 均 Read and write（细粒度 PAT 改权限即时生效，无需重新生成） |

**发版验证**：rerun 后 Version & Release success（41s），产出 `chore(release): v0.25.0` + tag + GitHub Release，dev 已快进同步。此为比 `release:dry` 干跑更强的实发闭环验证，A3 销项。

**部署首跑验证**（PR #4 为两个部署工作流补 `workflow_dispatch` 手动触发入口后执行）：

| 工作流 | 结果 | 关键步骤 |
|--------|------|---------|
| Deploy Website | ✅ success（1m13s） | 构建 → scp 上传 `/opt/Entropydecrease/website` → nginx 重启 → 冒烟（首页含「熵减」）→ IndexNow |
| Deploy AI Gateway（deploy-server） | ✅ success | 上传 server 源码 → `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` → 健康检查 |

第十五章 15.2 登记的"部署链路从未实跑"风险就此关闭：重写后的部署配置（真实路径、`--env-file`、代码上传）已在生产服务器实际执行成功。

**安全遗留（低危登记）**：RELEASE_TOKEN 为无过期 PAT，建议改 90 天期限并到期轮换。

---

*文档版本：v2.9 | 更新时间：2026-07-30 | 新增：15.6 发版链路修复（GH013 + PAT 权限）与 v0.25.0 实发、部署双流首跑验证*
