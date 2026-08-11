# 文档归档与技术债滚动治理机制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立按天文档归档机制（A 机制文档 + B 简洁实施文档 + 首次基线归档），使文档生命周期闭环、技术债权威唯一。

**Architecture:** 纯文档交付，无代码改动。A 部分创建机制文档（archive/README.md、archive-template.md）并挂接两份现有标准（documentation.md、tech-debt.md）；B 部分为近 3 日已实施功能撰写简洁实施文档；最后执行首次基线归档（git mv 已实施文档进 `docs/archive/2026-08-10/`，建立首份权威 tech-debt.md）。

**Tech Stack:** Markdown、Git（git mv 保留历史）

**依据 spec:** `2026-08-10-doc-archive-tech-debt-design.md`（设计已批准，随本批次归档于 docs/archive/2026-08-10/）

**事实基线（2026-08-08 ~ 08-10 提交，执行时可用 `git log --since=2026-08-08 --pretty=format:"%h %ad %s" --date=short` 复核）:**
- 08-10：`a67fdf2` CSS stagger 入场动画
- 08-09：`3d3a7f7` spring→CSS 过渡、`1f2308b` 订阅治理、`0e9dc4a` GPU 粒子迁移、`1ec8b37` WebGPU 切换、`5c3b01c`/`0832b21` WebGPU→WebGL 回退、`6f2411b` 消除 per-frame Color 分配、`2f96df2` Chronos 粒子球修复、`a734883` 性能优化第二批次（23 文件）、`2a5cf31` timer 清理
- 08-08：`d0e0776` 笔记创新 7 阶段（28 文件 3292 行）、`c1d2a3d`/`9f6838b`/`df90cf2` 笔记剩余项、`1d7ab71` Chronos P0-P2、多笔 style 令牌化（`2c13973`/`553bfab`/`ae6075c`/`1905ed9`/`879b935`/`9afe53f`/`b072318`/`3bb49b9`/`e3df416`）
- 近 3 日 docs 变更仅：`e3df416` 更新 `docs/product/ui-ux-system.md`（活跃文档，不归档）、`324d5fb` 本机制 spec

---

### Task 1: 创建归档机制说明 docs/archive/README.md

**Files:**
- Create: `docs/archive/README.md`

- [ ] **Step 1: 创建目录与文件**

```bash
mkdir "docs/archive"
```

写入 `docs/archive/README.md`（完整内容，直接使用）：

```markdown
# 文档归档机制

> 唯一权威入口：归档判定标准、日收工 SOP、技术债滚动规则、只读约束。
> 关联：[文档编写规范](../standards/documentation.md)、[技术债务管理](../standards/tech-debt.md)、[归档模板](../templates/archive-template.md)。

## 目的

为已实施完成的文档提供"生命终态"去向：按天快照（`YYYY-MM-DD` 子文件夹）、git mv 保留历史、不可变可追溯。

## 目录结构

```
docs/archive/
├── README.md            # 本说明 + 归档日期索引
├── 2026-08-10/          # 某日归档
│   ├── README.md        # 当日索引：归档清单 + 债务摘要
│   ├── tech-debt.md     # 当日权威债务清单（滚动）
│   └── ...已实施文档快照
```

## 归档对象判定

**可归档（生命终态）**：已落地实施的方案/设计文档、已验收的实施文档、已验证的知识卡（索引标 `[ ] 已归档`）、被取代的 ADR、已发布版本的规划文档、已执行的 spec/plan。

**不归档（持续活跃）**：standards/、templates/、knowledge/index.md、当前生效 ADR、CHANGELOG、README、versions/ 内容（按版本粒度独立沉淀，与本品并行不重叠）。

**判定核心**：内容已实施完成、不再需要活跃维护 → 归档。归档时同步更新活跃区索引。

## 日收工归档 SOP（每个工作日，< 15 分钟）

1. **整理昨日债务**：读 `docs/archive/<昨日>/tech-debt.md`，逐条核对（代码/提交验证）：已偿 → closed（注偿还提交）；未偿 → 继承为 carried
2. **识别今日新债务**：扫描今日提交中的 TODO/FIXME/HACK、妥协方案 → 登记 open
3. **筛选今日已实施文档**：`git log --since=<今日>` 筛 docs 变更 → 按判定标准 → `git mv` 入今日归档夹
4. **写当日 README**：归档清单 + 债务摘要
5. **更新活跃区索引**：链接改指归档路径 + 标 `[ ] 已归档`
6. **原子提交**：`docs(archive): archive YYYY-MM-DD`

首次归档（基线）无昨日清单可整理，跳过第 1 步。

## 技术债滚动规则

- 任何时刻，债务状态以**最新一日**归档的 `tech-debt.md` 为唯一权威；旧归档仅历史追溯
- 昨日未偿债务今日保留为 `carried`（只写 ID + 一行摘要，全文以首次登记日为准）
- 无新增债务的归档日，仍须继承昨日清单（"最新归档必有权威清单"）
- 编号沿用 TD-XXX，类型沿用四类分类（有意/无意/环境变化/腐化），字段：`来源归档`、`状态`（open/carried/closed）

## 只读约束

| 约束 | 保证 |
|------|------|
| 技术债只认最新归档 | 上方滚动规则 |
| 旧归档仅可阅读已达成内容 | 除最新一日外禁止修改归档文件；归档与提交原子化，git 历史可审计 |
| 时间戳命名 | `YYYY-MM-DD`；空白日不建夹 |

## 归档索引

| 归档日期 | 内容摘要 | 未偿债务 |
|----------|---------|----------|
| 2026-08-10 | 基线归档：性能优化/笔记创新/生物发光实施文档 + biolum 设计实施计划 + 本机制 spec | 1（TD-001） |
```

- [ ] **Step 2: 提交**

```bash
git add "docs/archive/README.md"
git commit -m "docs(archive): 归档机制说明（判定标准/SOP/债务滚动/只读约束）"
```

---

### Task 2: 创建归档模板 docs/templates/archive-template.md

**Files:**
- Create: `docs/templates/archive-template.md`

- [ ] **Step 1: 写入模板**（完整内容，直接使用）

```markdown
# 归档模板

> 每日归档时按此模板创建 `<归档日>/README.md` 与 `<归档日>/tech-debt.md`。机制详见 [归档机制说明](../archive/README.md)。

## 当日索引 README.md

```markdown
# YYYY-MM-DD 归档索引

> 归档说明（基线归档 / 常规归档）

## 归档内容
- 实施文档：[文件名]（功能一句话）
- 已实施计划：[文件名]
- 机制文档：[spec/plan 文件名]

## 技术债摘要
- 未偿 N 笔（TD-XXX 摘要）；详见本目录 tech-debt.md

## 备注
- 下个归档日需先整理本日清单（如本日为最新归档）
```

## 技术债清单 tech-debt.md

```markdown
# 技术债清单（权威：YYYY-MM-DD）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-XXX | 一行摘要 | 有意/无意/环境变化/腐化 | P0/P1/P2/P3 | YYYY-MM-DD | open / carried |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| TD-XXX | 一行摘要 | <提交哈希> |
```

## 字段说明

- `来源归档`：债务首次登记的归档日期；carried 条目保留原值
- `状态`：open（今日新增）/ carried（继承昨日未偿，仅保留 ID+摘要行）/ closed（今日已偿，后续归档不再出现）
```

- [ ] **Step 2: 提交**

```bash
git add "docs/templates/archive-template.md"
git commit -m "docs(template): 归档模板（当日索引 + 技术债滚动清单）"
```

---

### Task 3: 更新 docs/standards/documentation.md（新增"文档归档"章节）

**Files:**
- Modify: `docs/standards/documentation.md`（在"### 第六部分：文档质量检查"之后、"## 检查清单"之前插入新章节）

- [ ] **Step 1: 插入新章节**（在 `- **有结构** — 标题层级清晰，可快速定位` 之后、`## 检查清单` 之前插入）

```markdown
### 第七部分：文档归档

**归档定义**：已实施完成、不再活跃维护的文档，移入 `docs/archive/YYYY-MM-DD/` 快照（`git mv` 保留文件历史）。

**判定标准**：可归档 = 已落地实施的方案/设计文档、已验收的实施文档、已验证的知识卡（索引标 `[ ] 已归档`）、被取代的 ADR、已发布版本的规划文档、已执行的 spec/plan；不归档 = standards/、templates/、索引文件、生效 ADR、CHANGELOG、README、versions/ 内容。

**流程（日收工，< 15 分钟）**：① 整理昨日归档 tech-debt.md（已偿标 closed，未偿继承 carried）② 扫描今日提交登记新债务 ③ `git mv` 已实施文档入今日归档夹 ④ 写当日 README 索引 ⑤ 更新活跃区索引（`[ ] 已归档`）⑥ 原子提交。

**只读约束**：技术债只认最新归档的 tech-debt.md；除最新一日外归档文件禁止修改。

详见 [归档机制说明](../archive/README.md)。
```

- [ ] **Step 2: 提交**

```bash
git add "docs/standards/documentation.md"
git commit -m "docs(standard): documentation.md 新增文档归档章节"
```

---

### Task 4: 更新 docs/standards/tech-debt.md（新增"滚动归档"章节）

**Files:**
- Modify: `docs/standards/tech-debt.md`（在"### 第四部分：偿还计划"的偿还策略列表之后、`### 第五部分：预防措施` 之前插入新章节，并把原"第五部分：预防措施"改名为"第六部分：预防措施"）

- [ ] **Step 1: 插入滚动归档章节**（在 `4. **替换偿还**：用更好的方案替换旧实现` 之后、`### 第五部分：预防措施` 之前插入）

```markdown
### 第五部分：滚动归档（日收工）

**记录位置**：`docs/archive/<最新归档日>/tech-debt.md` —— 每日滚动的唯一权威清单，随文档归档建立。

**字段扩展**：在第二部分记录格式基础上增加两个字段——`来源归档`（债务首次登记的归档日期）、`状态`（open 今日新增 / carried 继承昨日未偿 / closed 今日已偿）。

**滚动规则**：
- 归档日先读昨日清单：已偿（提交/代码验证）→ `closed` 并注偿还提交，后续归档不再出现；未偿 → `carried`，仅保留 ID + 一行摘要，全文以首次登记日归档为准
- 当日新识别（TODO/FIXME/HACK、妥协方案）→ `open`
- 归档日无新增债务也须继承昨日清单，保证"最新归档必有权威清单"
- 旧归档中的债务条目仅历史追溯，不作为工作依据

**与偿还计划的衔接**：滚动清单是债务的唯一来源，偿还仍按第三部分影响面×成本排期、每迭代预留 20% 时间。
```

- [ ] **Step 2: 原第五部分改名**（把 `### 第五部分：预防措施` 替换为 `### 第六部分：预防措施`）

- [ ] **Step 3: 提交**

```bash
git add "docs/standards/tech-debt.md"
git commit -m "docs(standard): tech-debt.md 新增滚动归档章节"
```

---

### Task 5: B-1 性能优化批次实施文档

**Files:**
- Create: `docs/archive/2026-08-10/performance-optimization-batch.md`（≤ 1 页，直接使用以下内容）

- [ ] **Step 1: 写入文档**（完整内容，直接使用）

```markdown
# 性能优化批次实施文档（2026-08-08 ~ 08-10）

> 已实施完成。归档依据：spec §4 实施文档判定。对应提交见文末。

## 第一批：3D 渲染治理（08-09）

- **GPU 粒子迁移**：6 套粒子系统（鱼群/模块实体/粒子系统/双场景）迁移至 GPU vertex shader（新增 `client/src/lib/3d/shaders/gpuParticleShaders.ts` 240 行），useFrame 合并收敛（`0e9dc4a`）
- **WebGPU 尝试与回退**：渲染后端切 WebGPU 并恢复 Chronos 3D 球体（`1ec8b37`），因 R3F 兼容性回退 WebGLRenderer（`5c3b01c`、`0832b21`）；遗留为技术债 TD-001
- **渲染开销消除**：useFrame 内 per-frame `THREE.Color` 分配消除（`6f2411b`）
- **Chronos 粒子球修复**：TimerFace 高频区重构（`2f96df2`）

## 第二批：应用层治理（08-09，`a734883` 23 文件）

- 笔记投影优化：`useNoteEditor` 重构（133 行变更）、NotesPage/NoteEditPage/useNoteStore 订阅收窄
- 课堂内存与事件治理：`useClassroomAnalysis`/`useClassroomCapture`/`useClassroomEvents` 资源释放
- 全局订阅治理：whole-store 订阅拆分、effect 重注册修复（`1f2308b`）
- 3D 内存：`MemoryManager`/`SceneProvider` 资源管理增强

## 第三批：页面过渡（08-09 ~ 08-10）

- spring → CSS transition 替换 + 路由 chunk 预加载（`3d3a7f7`）
- showTime timer effect 清理（`2a5cf31`）
- 页面内容区 CSS stagger 入场动画（`a67fdf2`）

## 提交清单

`a67fdf2` `3d3a7f7` `2a5cf31` `1f2308b` `2f96df2` `0e9dc4a` `6f2411b` `5c3b01c` `0832b21` `1ec8b37` `a734883`
```

- [ ] **Step 2: 提交**

```bash
git add "docs/archive/2026-08-10/performance-optimization-batch.md"
git commit -m "docs(archive): 性能优化批次实施文档"
```

---

### Task 6: B-2 笔记创新实施文档

**Files:**
- Create: `docs/archive/2026-08-10/notes-innovation.md`（≤ 1 页，直接使用以下内容）

- [ ] **Step 1: 写入文档**（完整内容，直接使用）

```markdown
# 笔记功能创新实施文档（2026-08-08）

> 已实施完成。7 阶段 28 文件 3292 行（`d0e0776`），剩余项两轮补齐（`c1d2a3d` `9f6838b` `df90cf2`）。

## 核心能力（client/src/features/notes/）

- **EchoDiscovery**：回响发现组件（216 行）——灵感召回
- **概念提取**：`useConceptExtractor`（174 行）+ `conceptStore`——笔记概念自动抽取
- **成就与卡点**：`achievementStore`（276 行）、`stuckStatsStore`——学习成就与卡点统计
- **链接体系**：WikiLink 编辑器扩展 + `linkExtractor` + `noteLinkStore`——双链笔记
- **辅助组件**：费曼推荐侧栏、渐进式救援面板、深度指示、深海氛围、QA 网格/时间线布局、锚点、番茄标记、分享按钮、转换面板、学习指南、笔记健康面板、Wiki 链接预览、思维导图转换（`mindmapConvert`）、反链面板
- **MCP 笔记服务**：`mcpNoteServer.ts`（207 行）——AI 侧笔记能力接入

## 后续衔接

08-09 性能优化第二批次对 EchoDiscovery、ConstellationView 做了订阅收窄（`a734883`）。
```

- [ ] **Step 2: 提交**

```bash
git add "docs/archive/2026-08-10/notes-innovation.md"
git commit -m "docs(archive): 笔记创新实施文档"
```

---

### Task 7: B-3 生物发光色彩体系实施文档

**Files:**
- Create: `docs/archive/2026-08-10/biolum-color-system.md`（≤ 1 页，直接使用以下内容）

- [ ] **Step 1: 写入文档**（完整内容，直接使用）

```markdown
# 生物发光色彩体系实施文档（2026-08-08）

> 已实施完成。全量令牌化改造，多笔 style 提交；色表同步至 `docs/product/ui-ux-system.md`（`e3df416`）。

## 改造内容

- **AI 色类名残留清零**：硬编码 violet/cyan/purple/indigo 全部归位令牌色与生物发光光谱（`2c13973`）
- **rgba/hex 旧色清零**：签名时刻/潮汐/波纹/地层/图表、辉光/渐变归位生物发光光谱（`553bfab` `ae6075c`）
- **组件级归位**：庆典/引导/签名时刻（`879b935`）、KnowledgeGalaxy/CoralReefCalendar（`1905ed9`）、生物组件 cyan/紫光、闪卡纹理底色（`ef10ae5`）
- **幽灵令牌清理**：覆盖删除 + 最终收尾（`9afe53f` `b072318`）
- **材质类层叠修正**：深色段移至浅色段之后，修复深色主题误显示浅色材质（`3bb49b9`）
- **灵感组件**：脉冲插值起点磷光蓝、AI 按钮统一磷光蓝渐变（`5c654dd` `f3795c4`）

## 结果

全部颜色归位令牌与生物发光光谱，无硬编码色残留；设计系统色表与实现同步。
```

- [ ] **Step 2: 提交**

```bash
git add "docs/archive/2026-08-10/biolum-color-system.md"
git commit -m "docs(archive): 生物发光色彩体系实施文档"
```

---

### Task 8: 首次基线归档（docs/archive/2026-08-10/）

**Files:**
- Create: `docs/archive/2026-08-10/README.md`、`docs/archive/2026-08-10/tech-debt.md`
- Move (git mv): `docs/superpowers/plans/2026-08-08-biolum-color-material-design.md`、`docs/superpowers/plans/2026-08-08-biolum-color-material-implementation.md`、`docs/superpowers/specs/2026-08-10-doc-archive-tech-debt-design.md`、`docs/superpowers/plans/2026-08-10-doc-archive-tech-debt.md`（本计划）→ `docs/archive/2026-08-10/`

- [ ] **Step 1: 创建当日索引 README.md**（完整内容，直接使用）

```markdown
# 2026-08-10 归档索引

> 基线归档（机制启动日，无昨日债务需整理）

## 归档内容
- 实施文档：performance-optimization-batch.md（性能优化三批次）/ notes-innovation.md（笔记创新）/ biolum-color-system.md（生物发光色彩）
- 已实施计划：2026-08-08-biolum-color-material-design.md / 2026-08-08-biolum-color-material-implementation.md
- 机制文档：2026-08-10-doc-archive-tech-debt-design.md（本机制 spec）与其实施计划

## 技术债摘要
- 未偿 1 笔：TD-001 WebGPU 渲染后端回退（P3）；详见 tech-debt.md

## 备注
- 下个归档日（2026-08-11）需先整理本日清单
```

- [ ] **Step 2: 扫描新债务**（登记为 TD-002+，如无发现则跳过）

```bash
git grep -n "TODO\|FIXME\|HACK" -- "client/src/**/*.ts" "client/src/**/*.tsx" "client/electron/**/*.ts" | Select-Object -First 30
```

预期：可能发现若干 TODO/FIXME 注释。将其中属于 08-08 ~ 08-10 新增或仍有效的妥协项登记为 `open`，格式见 Step 3 表格；仅历史遗留、无维护含义的不登记。如无符合项，保留 TD-001 单条。

- [ ] **Step 3: 创建权威债务清单 tech-debt.md**（完整内容，直接使用；如 Step 2 有发现，追加为 TD-002 行）

```markdown
# 技术债清单（权威：2026-08-10）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-001 | WebGPU 渲染后端因 R3F 兼容性回退 WebGL；GPU 粒子已先迁 vertex shader，待 three/R3F 生态成熟后重试 | 有意 | P3 | 2026-08-10 | open |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| （无） | | |
```

依据：`1ec8b37`（WebGPU 切换）→ `5c3b01c`/`0832b21`（回退 WebGLRenderer for R3F compatibility）。

- [ ] **Step 4: git mv 已实施文档入归档夹**

```bash
cd "d:\Program own\aicode\work space\Entropydecrease"
git mv "docs/superpowers/plans/2026-08-08-biolum-color-material-design.md" "docs/archive/2026-08-10/"
git mv "docs/superpowers/plans/2026-08-08-biolum-color-material-implementation.md" "docs/archive/2026-08-10/"
git mv "docs/superpowers/specs/2026-08-10-doc-archive-tech-debt-design.md" "docs/archive/2026-08-10/"
git mv "docs/superpowers/plans/2026-08-10-doc-archive-tech-debt.md" "docs/archive/2026-08-10/"
```

- [ ] **Step 5: 验证无残留引用**（已归档文件的旧路径应无活跃链接指向）

```bash
git grep -l "2026-08-08-biolum-color-material\|2026-08-10-doc-archive-tech-debt" -- "docs" | Select-Object -First 10
```

预期：无输出或仅指向 `docs/archive/2026-08-10/` 的引用（README.md 索引中的文件名属预期）。若发现旧路径引用，修正后一并提交。

- [ ] **Step 6: 原子提交**

```bash
git add -A "docs/archive" "docs/superpowers"
git commit -m "docs(archive): 首次基线归档 2026-08-10（性能优化/笔记/生物发光 + biolum 计划 + 机制 spec）"
```

---

### Task 9: 最终验证

**Files:**
- 验证范围：全部交付物

- [ ] **Step 1: 机制文档齐全**

```bash
Test-Path "docs/archive/README.md"; Test-Path "docs/templates/archive-template.md"; Test-Path "docs/archive/2026-08-10/README.md"; Test-Path "docs/archive/2026-08-10/tech-debt.md"
```

预期：4 个 `True`。

- [ ] **Step 2: B 项实施文档与归档夹内容完整**

```bash
Get-ChildItem "docs/archive/2026-08-10" | Select-Object Name
```

预期：包含 `README.md`、`tech-debt.md`、`performance-optimization-batch.md`、`notes-innovation.md`、`biolum-color-system.md`、`2026-08-08-biolum-color-material-design.md`、`2026-08-08-biolum-color-material-implementation.md`、`2026-08-10-doc-archive-tech-debt-design.md`、`2026-08-10-doc-archive-tech-debt.md`。

- [ ] **Step 3: 标准挂接到位**（两处新增章节存在）

```bash
git grep -c "第七部分：文档归档" "docs/standards/documentation.md"; git grep -c "第五部分：滚动归档" "docs/standards/tech-debt.md"
```

预期：两个输出均为 `1`。

- [ ] **Step 4: 工作区干净、历史可审计**

```bash
git status --short; git log --oneline -8
```

预期：`git status --short` 无输出（全部已提交）；日志末尾为 `docs(archive): 首次基线归档 2026-08-10...`。

- [ ] **Step 5: 归档夹只读约束自检**（确认归档文件已提交、无未提交改动）

```bash
git diff HEAD --stat -- "docs/archive"
```

预期：无输出（归档文件均处于已提交状态）。
