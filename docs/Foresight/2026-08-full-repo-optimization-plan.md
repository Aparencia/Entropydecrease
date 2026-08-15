# 熵减全仓优化计划（2026-08 全面体检版）

> **类型**：技术方案 / 优化路线图
> **日期**：2026-08（体检基线：HEAD 0467b7e，v0.35.2）
> **依据**：5 路并行审计（client 代码质量 / server 代码质量 / 文档体系 / 标准落地与工程卫生 / 技术债与开发者体验）+ 人工复核
> **目标**：① 整理现有 docs 体系（修复 + 结构重组）；② 在根目录输出可直接投入新项目使用的 docs 文件树（工程化 + 个人开发化）；③ 全仓代码质量、工程卫生、开发者体验按优先级优化
> **风险偏好**：激进（允许 auth.py 拆分、大文件重构等中等影响面改动，均以测试/门禁保护）
> **首要目标**：开发者体验（lint/test 门禁、脚本工具、错误提示）

---

## 一、体检结论总览

### 1.1 好消息（代码纪律优于预期）

| 维度 | 结论 |
|------|------|
| @ai-context 注释 | 生产代码 940 个 client 文件 + ai-gateway 生产 .py **100% 合规**（缺口仅测试文件与 `__init__.py`/conftest.py） |
| any 类型 | 全仓仅 30 处，生产代码 9 处且多为 WebGL/鸭式类型合理场景 |
| 测试 | client 103 文件 / 1046 用例全绿（34.9s）；ai-gateway **331 用例全过**（"133 基线"已过时）；sync-service go build/vet/test 全绿 |
| AI 网关优化方案落地 | 18 项 P0-P2 中 **15 项已落地**（熔断器/Prompt 防护/成本追踪/预算/生产 JWT 拒绝启动/流式总预算/Key 池化/模型级联/OTel 等），P0 100% 完成 |
| 性能路线图 | P0/P1/P2 绝大多数已落地（页面级 selector 已拆细、v20 segments 存量迁移已实现） |
| 工程纪律 | CI 门禁（lint+typecheck+coverage+build+路径过滤）、commitlint、husky、覆盖率阈值、主进程崩溃恢复、离线降级链齐全 |
| 文档内核可复用性 | 20 个 standards + 12 个 templates **100% 通用**（零项目特有内容）——新项目文件树可直接复用 |

### 1.2 核心问题（按严重度）

| 级别 | 问题 | 位置 |
|------|------|------|
| 🔴 正确性 | FeynmanSessionPage 复制粘贴 bug：`convertedCount` 与 `masteredCount` 同一谓词，恒相等，指标失真 | FeynmanSessionPage.tsx:92-93/331 |
| 🔴 稳定性 | Go 生产代码 0 处 `defer recover()`，11 处 `go` 启动点任一 panic 击穿整个服务 | sync-service 各 ws manager |
| 🔴 供应链 | 11 个依赖漏洞（3 moderate/8 high），含直接依赖 react-router-dom（CSRF 绕过）、dompurify（XSS） | client/package.json |
| 🔴 门禁空转 | lint-staged 的 oxlint 配置**不生效**（`npm --prefix` 不改变 cwd，pre-commit 规则集 ≠ CI）；oxlint 仅 2 条规则；tsconfig 关闭死代码检查 | 根 package.json、.oxlintrc.json、tsconfig.app.json |
| 🟠 文档体系 | 109 失效链接（104 历史 + 4 可修）；docs/README 索引缺 10 项；knowledge 索引漏 4 条；2 份优化文档数字过期；4 处标准引用不存在目录；docs 根 5 份审计报告散落 | docs/ 各处 |
| 🟠 文档-代码漂移 | 性能路线图 P2-14 已实施未标注；AI 网关计划 routers 17→46、chains 20+→45 | 2 份 Foresight 文档 |
| 🟠 静默吞错 | 70 处 `.catch(() => {})`（useNoteStore 7、FeynmanRecorder 5、pomodoro 持久化 10） | client/src 各处 |
| 🟠 测试空白 | flashcards 33 文件零测试；electron 主进程 0 测试；ai 适配层 0-30% | features/flashcards、client/electron、lib/ai |
| 🟡 行数超标 | client 72 个超 300 行（5 个真职责过重）；ai-gateway 11 个生产文件（auth.py 613 最重）；sync-service 2 个 | 见各节 |
| 🟡 工具重复 | 时间格式化 ×12、字符串哈希 ×3、ID 生成 ×3 策略、formatRelativeTime ×3 | client/src 各处 |
| 🟡 工程卫生 | 42 个备份 wav 误入库（1.5MB）、75.6MB mp3 未走 LFS、6 个未跟踪 scratch 文件、CI 无 timeout、env 模板缺 12 变量、go.mod(1.25) vs CI(1.24) | 仓库各处 |

---

## 二、任务一：现有 docs 整理（修复 + 结构重组）

> 原则：只改"真实问题"，历史文档（v0.3.0~v0.11.0 的 104 处失效链接）按既有约定保留原貌（versions/README.md 已声明"历史快照保留原貌"）。

| # | 项目 | 细节 | 工作量 | 风险 |
|---|------|------|--------|------|
| D1 | 修复真实失效链接 | `docs/superpowers/specs/2026-08-11-website-feature-pages-design.md` 中 4 处 `../product/` → `../../product/` | S | L |
| D2 | 索引补齐 | ① docs/README.md：product 漏 3 项、Foresight 漏 4 项、模板数 11→12、7 区块说明与实际 9 目录对齐；② knowledge/index.md：补 3 条 bug + learning-mechanisms-analysis；③ versions/README.md：缺失版本说明补 v0.35.0~v0.35.2 | S | L |
| D3 | 更新过期内容 | ① README.md：徽章 v0.22.0→v0.35.2、路线图补 v0.11+ 已完成版本、L192 phase0~phase6 表述更新；② 性能路线图补实施状态（P2-14 v20 已落地、P1-5 页面级已完成）；③ ai-gateway-optimization-plan 加实施状态列 + 刷新数字（routers 17→46、chains 20+→45、handlers 18→26）；④ AGENTS.md 测试基线 133→331 | S | L |
| D4 | 修复标准文档引用 | documentation.md：docs/architecture/、docs/api/、docs/operations/ 改为实际存在的结构或注明"按需创建"；knowledge-management.md：docs/faq.md 引用修正 | S | L |
| D5 | 结构重组 | ① docs 根 5 份审计报告 → 归档（`docs/archive/2026-08-10/` 或当日快照，遵循归档 SOP）；② 新建 `templates/README.md`（12 模板索引 + 选择指南）；③ 2 个未使用模板（estimation-template、mvp-canvas-template）标注"按需启用"；④ `.superdesign/init/*.md` 归档、`design-system.md` 移入 docs/product/；⑤ 清理 `missing_ai_context.txt`、`tmp-*.png` ×5；⑥ `.qoder/` 删除 | M | L |
| D6 | 文档自动化（工程化落地） | ① 新增 `scripts/docs-check.mjs`：Markdown 链接完整性 + 索引-文件一致性 + 命名规范检查；② 接入 lint-staged（docs/** 变更时执行）；③ 可选接入 CI（pr-check.yml 增加 docs 检查路径）；④ 配套文档编写规范（docs/standards/documentation.md 增补"自动化检查"章节） | M | L |

---

## 三、任务二：新项目 docs 文件树（根目录交付物）

> 定位：从现有 docs 提炼 + 通用化，符合**工程化 + 个人开发化**，可直接 git 复制到新项目使用。内核已验证：20 standards + 12 templates 零项目特有内容。

### 3.1 目标结构

```
docs/                          # 工程化 + 个人开发化平衡（按需裁剪）
├── README.md                  # 总导航：目录说明 + 维护节奏 + 写作规范速查 + 快速开始
├── standards/                 # 工程规范（20 个通用文档 + README 索引 + 选择指南）
├── templates/                 # 文档模板（12 个 + README 索引 + 何时用哪个）
├── adr/                       # 架构决策记录（README + 编号规则 + ADR-001 示例）
├── knowledge/                 # 知识库（index + bugs/ + solutions/ + learnings/）
├── versions/                  # 版本迭代（README + 沉淀规则 + v0.1.0 示例）
├── product/                   # 产品文档（按需裁剪：需求池/品牌/定价）
├── Foresight/                 # 前瞻规划（按需裁剪：路线图/头脑风暴）
├── archive/                   # 归档机制（README + 日快照 + tech-debt 滚动规则）
└── scripts/                   # 文档自动化（docs-check.mjs + 使用说明）
```

### 3.2 工程化特征

- **索引驱动**：总 README + 每目录 README，全树可导航、可校验（脚本强制）
- **模板驱动**：ADR/PRD/知识卡/发布清单等 12 模板开箱即用
- **决策留痕**：ADR 编号规则 + 状态机（提议/已接受/已废弃/已取代）
- **版本沉淀**：versions/ 与 CHANGELOG 分工明确，缺失版本可追溯
- **知识闭环**：踩坑记录 → 技术方案 → 学习笔记，统一模板 + 标签索引
- **归档机制**：已实施文档按日快照归档，tech-debt 滚动（最新归档为唯一权威）
- **自动化**：链接/索引/命名一致性检查脚本，可挂 CI

### 3.3 个人开发化特征

- **轻量**：product/Foresight/archive 可按项目规模整目录裁剪，核心 5 目录（standards/templates/adr/knowledge/versions）即完整闭环
- **低维护**：单一入口导航 + 自动化检查，日收工归档 <15 分钟
- **模板即用**：新建文档从模板复制，无格式争议

### 3.4 交付方式

- 在仓库根目录创建 `docs/`（新文件树）与现有 docs 的关系：**同一套结构**，本任务在整理现有 docs（任务一）的同时将通用内容提炼为可复用骨架，产出 `docs/README.md` 中的"新项目启用指南"（复制哪些目录、裁剪哪些目录、初始化 checklist）
- 若用户希望物理分离，可另建 `docs-starter-kit/` 目录存放纯净模板树（待确认）

---

## 四、P0：安全与正确性（先行）

| # | 项目 | 细节 | 工作量 | 风险 |
|---|------|------|--------|------|
| C1 | FeynmanSessionPage 复制粘贴 bug | convertedCount 与 masteredCount 同谓词恒等；确认业务语义后改为正确指标或移除 prop | S | L |
| C2 | Go goroutine panic 防护 | 为 11 处 `go` 启动点（writePump/readPump/cleanupLoop/ws_manager 等）统一包 `defer recover()`，防单连接异常击穿进程 | S | H |
| C3 | 依赖漏洞升级 | react-router-dom（≤7.18.1，RSC CSRF）、dompurify（≤3.4.12，XSS）升修复版本；其余 9 个传递漏洞随升级收敛 | S | L |
| C4 | 修复 lint-staged oxlint 不生效 | 根 lint-staged 改用 `oxlint --config client/.oxlintrc.json`（cd client 后再执行）或改用 `npm --prefix client run lint --` 包装；保证 pre-commit 与 CI 规则集一致 | S | L |
| C5 | tier 配额错配核对 | ✅ 已核实为**有意设计**：pro(80/2.0) 与 active 相同系设计意图（差异在 rank 判定与付费权益，非配额），与客户端 types/beta.ts 同步；已在 rate_limit.py 加注释说明，数值不改 | S | — |
| C6 | 误入库产物清理 | ① 42 个备份 wav（零引用）已 git rm + gitignore ✅；② mp3 音景（75.6MB）LFS 迁移**暂缓**：`git lfs migrate` 需访问 GitHub 远程（当前网络不可达），且提交指针而无远程对象会损坏 CI 产物——保持 blob 存储（历史已含），待网络可用时执行 `git lfs migrate import --include="client/public/audio/*.mp3"` + pr-check.yml 加 `lfs: true`；③ 6 个未跟踪 scratch 文件已清理 ✅ | S | — |
| C7 | 安全路径静默放行补日志 | prompt_guard.py:96 / input_validation.py:89 / base_provider.py:77/132 静默 pass 处补 `logger.warning`（安全检测被绕过需可观测） | S | M |

## 五、P1：开发者体验（首要目标）

| # | 项目 | 细节 | 工作量 | 风险 |
|---|------|------|--------|------|
| D7 | 脚本补全 | client/package.json 增 `typecheck`（tsc --noEmit）、`typecheck:electron`、`lint:fix`（oxlint --fix）、`check`（lint+typecheck×2+test 聚合）；CI 复用而非裸跑 npx tsc | S | L |
| D8 | lint warning 治理 | 158 个 warning：64 no-unused-vars（lint:fix 机械修）→ 58 only-export-components（routes/index.tsx lazy 导出模式）→ 24 exhaustive-deps（逐个确认）；治理后 CI 加 `--deny-warnings` 防回潮 | M | L |
| D9 | 静默 catch 分级治理 | 70 处 `.catch(() => {})`：至少补 `console.debug`；useNoteStore 7 处（笔记保存失败用户无感知）与 FeynmanRecorder 5 处（录音持久化）改 toast | M | L |
| D10 | 环境变量一致性 | ① .env.example（根 + server）补 12 个缺失变量（PAYMENT_* ×7、SUPABASE_SERVICE_KEY、BUDGET_* ×2、GATEWAY_ALLOW_DEV_AUTH、OTEL_EXPORTER_OTLP_ENDPOINT）；② docker-compose.prod.yml 转发 PAYMENT_*；③ 根/server 模板 JWT_SECRET 说法矛盾修复 | S | L |
| D11 | store 订阅收尾 | 5 处整 store `useShallow(s => s)`（SoundSettings/TagEditPopover/InspirationCard/AISortPanel/useNoteAI）拆字段级；NoteTagFilter selector 内调用 action 反模式修复（订阅 notes + useMemo 派生） | S | L |
| D12 | 工具函数收敛 | ① `lib/utils/time.ts`：formatDate/formatDuration/formatRelativeTime/formatTimeAgo/formatTime/stripHtml（12+ 处统一，注意 UnifiedTimeline vs SmartCapturePanel 已分叉行为）；② `lib/utils/stringHash.ts`：3 实现收敛；③ ID 生成统一到 uuid.ts（包装 crypto.randomUUID，40+ 处调用点） | S | L |
| D13 | 依赖治理 | ① npm audit 可用化：✅ CI 已加 `npm audit --registry=https://registry.npmjs.org --audit-level=high`（pr-check.yml），标准文档已注明镜像限制；② 28 个 dependabot 分支**需人工分批合并**（涉及 electron 35→43、better-sqlite3 等大版本，逐批验证构建；本次不自动执行） | M | M |
| D14 | 测试噪音清理 | postcss.config.js 声明 `"type": "module"`；tiptap underline 重复注册修复；act() 警告清理；覆盖率快照入库或 CI 上传 | S | L |

## 六、P2：结构性重构（激进，分批）

| # | 项目 | 细节 | 工作量 | 风险 |
|---|------|------|--------|------|
| R1 | auth.py 613 行拆分 | 拆 `jwt_keys.py`（密钥材料/JWKS/PEM，约 290 行）+ `jwt_verify.py`（纯验证，约 180 行）+ auth.py 保留中间件（约 120 行）；test_e2e_auth.py 21 用例作回归网 | M | H |
| R2 | NotesPage 1320 行拆分 | NoteCard.tsx（L558-1121）+ noteCardFx.ts（视觉工具 L88-140）+ DeleteFolderDialog/ClipImportDialog + formatDate/stripHtml 移 lib | M | M |
| R3 | 其余巨型文件拆分 | NoteEditPage（锚点 hook/导出 lib/模板子组件）、FreeCanvas（选择状态机/工具栏）、FlashcardsPage（导入流程/统计徽章）、useNoteStore（模板/排序/搜索分离）、OnboardingPage（5 Step 组件）、captureManager（frame/audio/watchdog） | M×6 | M |
| R4 | sync-service 拆分 | rooms.go 519 行（room_manager/rooms_handlers/rooms_ws）、relay.go 380 行（relay_manager/relay_handlers）；rooms_test.go 355 行作回归网 | M | M |
| R5 | server 卫生 | ① requirements.txt 版本锁定 ✅（实测版本 == 锁定，google-genai 未安装保持 >=）；② go.mod(1.25) 与 CI(1.24) 统一 ✅（CI 升至 1.25）；③ dead proto 清理 ✅（3 个 .proto 零引用已删，go_package 指向已废弃的 github.com/keban/...）；④ conftest.py 补 @ai-context（待办） | S | L |
| R6 | flashcards 补测试 | 33 文件零测试的核心功能：store（useFlashcardStore/useStudySessionStore）+ 会话数学纯函数（SM2/FSRS/间隔）优先 | M | M |
| R7 | 门禁收紧 | oxlint 扩展规则（no-explicit-any/no-unused-vars/exhaustive-deps/no-unused-imports）；tsconfig 开启 noUnusedLocals/noUnusedParameters；覆盖率阈值与现状对齐决策（降阈或补测） | S | L |
| R8 | 工作区卫生 | 根目录 scratch 文件清理；MCP 脚本（modelcontextprotocol/fs/seq/memory）从 package.json 移出或标注；git 死分支清理（origin/master 落后 350） | S | L |

## 七、执行策略与验收标准

### 7.1 执行顺序

```
Phase 1（文档，本周）:  D1 → D2 → D3 → D4 → D5 → D6（+ 任务二文件树骨架）
Phase 2（P0 安全）:     C1 → C2 → C3 → C4 → C5 → C6 → C7
Phase 3（P1 开发者体验）: D7 → D8 → D9 → D10 → D11 → D12 → D13 → D14
Phase 4（P2 重构）:     R1 → R2/R3 → R4 → R5 → R6 → R7 → R8（分批，每批验证）
```

### 7.2 每项改动验收标准

- [ ] lint / test / build（或 pytest / go build+vet+test）全绿
- [ ] 符合 Conventional Commits 提交规范（commitlint 通过）
- [ ] 改动文件保持 @ai-context 注释（新文件必须带）
- [ ] 文档改动同步更新索引（docs/README 或对应 README）
- [ ] 高风险项（C2/R1/R2）提交前跑对应回归测试

### 7.3 完成定义（Definition of Done）

- 任务一：docs 无真实失效链接、索引与文件 1:1、过期信息全部更新、审计报告已归档、docs-check.mjs 可运行且接入门禁
- 任务二：根目录 docs 文件树可复制即用（含启用指南），standards/templates 通用性经脚本校验
- P0：全部 7 项完成且验证
- P1：158 warnings 清零、静默 catch 有日志或 toast、脚本齐全、env 一致
- P2：auth.py/NotesPage 等拆分完成且测试全绿；flashcards 有基础测试；门禁收紧生效

---

## 八、决策点（需用户确认）

| 决策点 | 建议 | 备选 |
|--------|------|------|
| 任务二文件树与现有 docs 的关系 | 同一套结构：整理现有 docs 后自然成为可复用骨架，README 附"新项目启用指南" | 物理分离：另建 `docs-starter-kit/` 纯净模板树 |
| 覆盖率阈值 60/50/50 vs 实际 54/45.7/40.9 | 先实测一次 CI 覆盖率，若确实红则补测试至达标（激进偏好） | 降阈至当前水平，后续随补测回升 |
| C5 tier 配额（pro 80 < active 120） | 需业务确认：若 pro 应为更高则修正；若为有意设计则加注释说明 | 按现状加注释 |
| R6 flashcards 测试范围 | store + 会话数学纯函数优先（M 工作量） | 全量组件测试（L 工作量） |
| 历史文档 104 处失效链接 | 保留原貌（与 versions/README.md 声明一致） | 全部重写为指向新结构（M 工作量，改历史快照） |
