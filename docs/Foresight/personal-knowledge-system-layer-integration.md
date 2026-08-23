# 个人知识体系指南 × 熵减：整合分析与落地路线（方案 B）

> 状态：**已批准并落位**（2026-08-23 用户裁决：B 模块新增型＋全局体系层＋领域体系层双层＋保持技能自学者定位、理念局部修订；已落位 [v0.13 系列](../versions/v0.13.md)）
> 本文档 = 整合分析 + 落地路线。后续动作：① 设计规格（spec）；② 理念修订（§五 所列，随 v0.13.0 前置文档批）；③ ADR-024。
> 源文档：《个人知识体系搭建指南（综合版）v2.0》用户提供，原文存档 [source-personal-knowledge-system-guide-v2.md](./source-personal-knowledge-system-guide-v2.md)。
> 关联：`product-design-philosophy.md`（冲突与修订）· `pain-points-v4.md` §7.6/§11 · `2026-08-22-v0.11-note-group-learning-loop-design.md` · 需求池（REQ-202 起登记）。

---

## 一、三句话结论

1. 指南（知识管理/获取隐喻）与熵减（学习科学/成为隐喻）不是同一范式，但两者的**闭环结构互补**：指南缺记忆发动机（间隔重复）与证据层（组/闪卡），熵减缺"为什么学"与"应用闭环"。本方案让熵减补上后者——**组回答"我在学什么"，体系回答"我为什么学、学了怎么用"**。
2. 落点：新增**体系层**，双实体——**全局体系**（一个人的知识体系：核心问题域＋多领域入口＋场景问题）与**领域体系**（每领域一棵可生长的体系树：问题树/概念库/模型库）。**组仍是唯一容器**：体系只引用、不收纳（引用不复制，与笔记引用原料同一条纪律）。
3. 理念局部修订：P13 由"知识图谱出局"重裁决为——**自由双链/图谱出局；有界问题树（体系层）通过**。其余克制条款（不做 Notion 式工作区／内容供给／移动端）全部保持，只补充边界说明。

---

## 二、范式判断：整合的前提

### 2.1 指南是什么

- **知识管理（KM）范式**："知识体系不是仓库，是**决策的操作系统**"——价值判定标准是"是否辅助决策"。
- **获取隐喻**：概念/模型/问题/决策都是可拥有的"物"，体系是物的组织与调用结构。
- 目标画像：多领域学习者/知识工作者（商业＋性格提升示例）；方法围绕"个人资产"展开（工具推荐 Obsidian 双链、知识资产审计）。

### 2.2 熵减是什么

- **学习科学＋成为隐喻**："维护『我正在学会 X』这个自我叙事的连续性"；价值判定标准是"能力真实增长＋叙事不被断裂"。
- 统一产物层：**组是唯一容器**（两地形一产物）；学习循环：提取→复习→自测→结算→下一组。
- 已经明确拒绝：知识图谱/双链（P13 出局）、Notion 式通用工作区、内容供给、移动端；"AI 测量，人类见证"。

### 2.3 直接冲突清单（为什么不能整本照搬）

| 指南要素 | 与熵减的冲突 | 处理 |
|---|---|---|
| 知识资产/从分类开始搭 | 契约一：粒度对齐领域、拒绝"人生成长"式大类 | 体系层不"收纳"内容只"引用"；分类即问题树，先问题后分类 |
| 双链/连接（工具建议） | 原则 4：知识图谱/双链不做（P13 出局） | **重裁决**（§五.1）：自由图谱出局、有界体系通过 |
| 多领域通识叙事（商业＋性格） | 定位：技能自学者；不做内容供给 | 示例降级为方法论演示；领域示例用技能领域（化妆/编程/乐理/绘画） |
| 全局概念库/模型库 | 契约一 ＋"知识收纳师"误区 | 概念/模型挂领域体系；"升格全局"是显式动作（§4.2 唯一性规则） |

### 2.4 深层接合点（为什么值得整合）

1. **闭环互补**：指南五环（问题→概念→模型→决策→反馈）缺记忆/间隔环节；熵减学习循环缺"为什么学＋应用证据"。合并后：记忆引擎在组（FSRS/闪卡），应用闭环在体系（决策/应用记录），两者共享证据（引用）。
2. **同一条防线**：指南"用不出来就放回待观察区" ↔ 熵减"提取产物伪装成进步＝假燃料"——都以**使用**为检验标准。
3. **动手闭环（N12）的机制化形态**：指南"用一次＝解释现象或做判断"＋决策日志四行法（用了什么/预期/实际/反思）＝"暂停–操作–比对"＋反馈记录。此前 N12 明确"另议/不做"，本方案让它落地为最小环。
4. **AI 时代立场同构**：指南"问 AI 得到答案，体系得到判断" ↔ 熵减"AI 测量，人类见证"——体系层就是"人类判断"的载体。这一条使体系层成为**顺风**（AI 能补缝、出考题，不能替用户做判断），与原则 2 一致。

### 2.5 整合后的一句话

> 在"两地形、一容器、一循环"之上：**结构在内容里的成为课程，结构在行为里的成为组，结构在问题里的成为体系**——三者被同一个学习循环接住，体系在循环之上行使"为什么学、怎么用"的导航与检验。

---

## 三、整合映射总表

| 指南元素 | 处理 | 熵减落点 | 说明 |
|---|---|---|---|
| 核心问题域（§2.1/§4.1） | 吸收 | 全局体系 `core_question`（唯一、可改） | 创建引导＝极简启动模板（§4.1 四行） |
| 问题树（§2.1） | 吸收改造 | `knowledge_nodes` 树表（全局＋领域共用）；节点可挂证据引用 | 有界树；**跨体系自由引用被禁用**（图谱化入口） |
| 概念"三问一用"（§2.2） | 吸收改造 | 体系概念库（思辨面）↔ 组内 `flashcards.kind=model`（记忆面）单向**升格** | 双面体：卡片管记忆、概念管思辨；升格＝纳入体系（REQ-199 预埋接口兑现） |
| 模型交叉验证（§2.3） | 吸收改造 | 体系模型库：claim/valid_when/invalid_when ＋ `cross_checks`（≥2 学科） | "交叉验证"是字段与引导，不是图结构 |
| 决策日志四行法（§2.4） | 吸收改造 | `knowledge_decisions`（kind=decision/application 一表两面） | 引用必填（used_refs 非空）才计入指标——防记录膨胀 |
| 动手闭环（N12） | 指南以"用一次"隐含 | 卡片/概念上"记一次使用"→ 应用记录（操作/预期/实际/反思） | N12 从"另议"转落地最小环 |
| 季度审计（§2.5/附录D） | 吸收改造 | 体系审计（季度）＋组结算第三步增强"概念失效检查" | 审计＝体系级结算；与 `settlement_due` 同范式 |
| 多领域整合/交叉点（§3.3） | 部分吸收 | 交叉点＝**派生提示**（同一概念被 ≥2 领域体系引用时，审计时提示"是否升格/建引用"） | 不做全局网状图谱；交叉点是提醒不是结构 |
| 场景整合（§3.4） | 部分吸收 | 全局问题树节点 `type=scenario`（如"如何启动我的第一个商业项目"）引用多领域子问题 | 场景＝问题的一种形态，不新增实体 |
| 极简启动/附录模板 | 吸收（内容） | 创建向导＋模板库（问题树/三问一用/四行/审计清单） | 方案 C 的伴生交付，随 v0.13.1 |
| 工具建议（Obsidian 双链） | **拒绝** | — | 熵减自带容器＋时间戳回链锚点（溯源≠图谱）；不引外部工具范式 |
| 习惯建议（每周整理/输出倒逼/讲给别人听） | 部分吸收 | 已有：周契约＋周报进展叙事＋学习产物；"讲给别人听"→ 见证结构（远期） | 不新增独立习惯功能，避免又一套打卡机制 |
| 商业＋性格示例 | **拒绝**（作演示） | 领域示例用技能领域 | 方法论可迁移，叙事不迁移；目标用户不变 |

---

## 四、架构与数据模型（概要）

### 4.1 层次位置

体系层是**飞轮层（L2）向"为什么学"方向的延伸枝**（"体系枝"），不新增层（层数膨胀＝架构复杂化死法）。主时钟：季/决策。

```
L3 骨折层（事件）          ——不变
L2 飞轮层（周/月）         ——新增：体系枝（为什么学→怎么用→审计）【季/决策时钟】
L1 引擎层（天）            ——不变：组/闪卡/复习/自测/结算
```

钟分域纪律（v4 §7.5）延续：**体系不进每日视图**；只出现在"体系页（周/季视图）"与"审计事件"。

### 4.2 实体与 SQL 概要

惯例沿用：`db_migrations.rs` 建表幂等 ＋ `ensure_column` 补列；全部本地 SQLite。

```sql
-- 体系（全局：parent_system_id NULL；领域：parent 指向全局）
CREATE TABLE IF NOT EXISTS knowledge_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_system_id INTEGER REFERENCES knowledge_systems(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'domain',        -- global/domain
  core_question TEXT,                          -- 全局体系必填（唯一）
  status TEXT NOT NULL DEFAULT 'active',       -- active/watching/archived
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 问题树：统一节点表（含领域入口节点与场景节点）
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'question',       -- question/scenario/domain_entry
  text TEXT NOT NULL,
  order_idx INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- active/watching/archived
  created_at INTEGER NOT NULL
);

-- 概念（三问一用；思辨面）
CREATE TABLE IF NOT EXISTS knowledge_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,                   -- 全局唯一：交叉点判定的前提
  essence TEXT, boundary TEXT, relation TEXT,  -- 本质/边界/联系
  status TEXT NOT NULL DEFAULT 'core',         -- core/watching(待观察)/archived
  last_applied_at INTEGER,                     -- 审计"概念失效检查"数据源
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 模型（跨学科交叉验证）
CREATE TABLE IF NOT EXISTS knowledge_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  disciplines TEXT NOT NULL,                   -- JSON 数组（≥1 学科）
  claim TEXT, valid_when TEXT, invalid_when TEXT,
  cross_checks TEXT,                           -- JSON：交叉验证记录（学科+结论）
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

-- 决策与应用（一表两面；四行法字段）
CREATE TABLE IF NOT EXISTS knowledge_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'decision',       -- decision/application
  system_id INTEGER REFERENCES knowledge_systems(id) ON DELETE SET NULL,
  question_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
  used_refs TEXT NOT NULL DEFAULT '{}',        -- JSON：{concept_ids, model_ids, group_id, card_id, note_id}
  content TEXT NOT NULL,                       -- 决策内容/应用动作
  expectation TEXT, actual TEXT, reflection TEXT,
  decided_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);

-- 体系↔证据引用（引用不复制；组照旧是唯一容器）
CREATE TABLE IF NOT EXISTS knowledge_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
  node_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
  concept_id INTEGER REFERENCES knowledge_concepts(id) ON DELETE SET NULL,
  model_id INTEGER REFERENCES knowledge_models(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,                   -- note_group/note/flashcard/fragment
  target_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 体系审计记录
CREATE TABLE IF NOT EXISTS knowledge_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
  items_json TEXT NOT NULL,                    -- 审计清单勾选+结论（指南附录D 六项映射）
  stats_json TEXT NOT NULL DEFAULT '{}',       -- 概念失效数/模型边界失效数/引用停滞数…
  created_at INTEGER NOT NULL
);
```

**零破坏原则**：`note_groups`/`flashcards`/`metrics_events` 结构不动；`flashcards.kind` 补值 `model`（REQ-199 预埋接口）；`metrics_events.kind` 新增 `concept_promoted / decision_logged / application_logged / system_audited`。

**唯一性规则**：`knowledge_concepts.name` 全局唯一（跨体系判定交叉点即靠它）；概念默认归属某个领域体系，"升格全局"是显式动作（先合并重复概念、再改挂 global 体系）。

### 4.3 关键链路

1. **提取→组**：不变（两地形、一容器）。
2. **组→体系**：组挂载到问题节点/概念（仅引用）；课程组（kind=course）自动建议挂到全局树"领域入口"节点。
3. **卡→概念（升格）**：组内 `kind=model` 卡 →"纳入体系"→ 创建/关联概念并回填三问（AI 可选增强，默认关，复用授权/审计全套）→ `metrics_events(concept_promoted)`。升格单向：概念→卡不反向（卡片是组内记忆单元，概念是体系思辨单元）。
4. **用一次**：概念页/闪卡复习面"记一次使用"→ `knowledge_decisions(kind=application)` 四行 → 更新概念 `last_applied_at`。
5. **审计**：季度触发（复用 `settlement_due` 范式）→ 审计清单六项（附录D）→ 生成**建议**（失效降级/边界修订/问题增删/交叉点提示），**须用户确认**（防古德哈特、防打扰）。
6. **决策日志**：任何页面"记一次决策"→ 四行＋used_refs。**只记"我的决策"**——产物层 `ArtifactKind::Decision`（访谈/会议内容里的"决策"）禁止自动升格为我的决策（假证据，见 §七）。

---

## 五、理念修订提案（与本文档同批裁决，不允许静默并存）

> project-design-philosophy.md 开头写道："凡与本文档冲突的设计，要么改设计，要么改本文档"。方案 B 属于"改设计未遂、改理念"的情形，以下修订需在同一批裁决。

### 5.1 P13 重裁决（原：知识图谱出局）

- **新表述**：自由双链/图谱（任意连接＋图可视化＋图漫游）**出局**；**有界体系**（体系树＋概念库＋模型库＋决策日志，引用限于体系内节点以及对证据的单向引用）**通过**。
- **论证**：P13 的原始推理（"失败发生在人没回来的地方，不在知识没连成网的地方"）成立，但它裁决的是**优先序**（骨折层＞连接层）与"连接作为增长机制"（P13 出现在 v1 P15 语境：知识图谱作为功能）；体系层的价值不在"连成网"，而在"围绕一个真实问题组织学习"（指南第一性原理）＋"为动手闭环提供记账本"（N12）。它不承担增长机制，只承担组织与检验。
- **防线（不越界）**：体系功能排组级学习循环真机验收之后；体系无内容收纳权（引用不复制）；体系有审计与失效降级；不做图可视化（REQ-029 维持 P3）。

### 5.2 克制清单修订（原则 4 表格）

| 行 | 原 | 新 |
|---|---|---|
| 知识图谱/双链 | 不做 | **自由双链图谱不做**（有界体系除外，见 ADR-024） |
| 通用工作区（Notion 式） | 不做 | 不做；补边界句：**体系不是工作区**——不托管文档协作/写作，只托管"为什么学、学了怎么用"（问题/概念/模型/决策），笔记/卡片/碎片仍只在组 |

### 5.3 原则 5 学习链扩展（可选）

原链：`视频知识 → 个人能力 → 自我叙事`；扩展为：`视频知识 → 个人能力 → 自我叙事 → 决策判断`。体系是第四环载体。**终点不变**（成为）——体系是"成为"的导航仪与检验器，不是新的终点。

### 5.4 需要同步修改的文件

- `docs/product/product-design-philosophy.md`（§四 原则4 表格、原则5、§五 克制清单）
- `docs/product/pain-points-v4.md`（§7.6 出局名单 P13 行加注）
- `docs/product/requirements-pool.md`（REQ-029 备注联动；REQ-202 起新登记）
- `docs/adr/ADR-024-knowledge-system-layer.md`（新增，编号顺延：当前最新 ADR-023）

---

## 六、落地路线（v0.13 系列，每版独立交付闭环）

> 前置门控：**REQ-146 真机验收总清**（至少组级学习循环通过）。理由：引擎层未验收就建上层＝假燃料放大器（pre-mortem 已列）。
> 每版交付含：代码＋测试＋需求池状态同步＋版本文档＋提交（项目第八节惯例）。

| 小版本 | 范围 | 需求登记（预估） |
|---|---|---|
| **v0.13.1 体系基建** | schema（§4.2）＋体系/节点/概念/模型 CRUD＋全局体系创建向导（极简启动模板：核心问题一句→3-5 领域入口→本周第一个输出）＋领域体系；纯函数 TDD：`audit_due`/`concept_stale`/`promote_rules` | REQ-202~205 |
| **v0.13.2 概念双面体** | `flashcards.kind=model` 落地（卡面契约：front=概念名，back=三问＋锚点回链）＋卡→概念升格＋概念库 UI（三问一用卡片） | REQ-206~207 |
| **v0.13.3 决策与应用** | `knowledge_decisions`＋应用记录入口（概念页/组/复习面"记一次使用"）＋决策日志 UI＋metrics_events 扩展 | REQ-208~210 |
| **v0.13.4 审计与整合** | 体系审计（季度）＋组结算第三步增强（概念失效检查）＋交叉点派生提示＋审计报告视图 | REQ-211~212 |

**功能开关**：体系默认**开**（与 feed 不同——feed 是进料增强，体系是叙事层主枝）；"交叉点派生提示"默认**关**（防打扰，v0.14 视数据转正）。遵循"增强能力默认关闭"传统的部分仅 AI 增强（卡→概念回填默认关）。

---

## 七、防线扩展（Pre-mortem 增量）

| 新死法 | 危险 | 防线 |
|---|---|---|
| 体系沼泽化（问题树变装饰品，"知识收纳师"回魂） | ★★★★ | ① 审计季度触达（软提示）；② 节点/概念失效降级（90 天无引用→watching；180 天未应用→归档建议）；③ 体系无内容收纳权（只引用）；④ 创建向导即极简启动折叠，"从分类开始搭"误区在入门就被隔离 |
| 假燃料放大器（体系很漂亮、学习不动） | ★★★★ | ① 审计报告"思辨动作 vs 学习动作"并列（诚实）；② 体系引用必须指向真实组/卡（无证据引用权重低）；③ 门控：组循环未验收不上线；④ 决策日志只记"我的决策"，禁止从产物/内容自动升格 |
| 记账负担（组结算＋体系审计＋决策＋应用＝两本账） | ★★★ | ① 决策/应用一表两面（kind）；② 审计与组结算共享纯函数范式；③ 四行法默认模板；④ used_refs 引用必填防膨胀 |
| 冷启动（不知道写什么问题） | ★★★ | 创建向导＋示例（指南 §4.1 四行 + 领域示例用技能领域）；**不预填内容**（预填＝假燃料） |
| 审计变考核（体系＝自我奖励） | ★★★ | 无 streak/无惩罚继承（与弹性承诺一致）；审计产出的是**建议**，须用户确认后生效 |
| 与图谱可视化合流 | ★★ | 体系用列表/树渲染，**不做力导向图**；REQ-029 维持 P3 |
| 决策日志包装成"我的成就" | ★★ | 反思字段保留负面（失败决策真实记录）；不设"决策质量评分"（§九.6） |

---

## 八、指标（不设新北极星）

- **北极星不变**：组学习循环完成、第二组启动率（身份）。
- **过程指标（新增观察）**：第一体系创建率、体系审计执行率、决策日志引用率（used_refs 非空占比）、概念升格率（卡→概念/月）。
- **反指标**：体系页人均停留时长（体系页不是"看"的，是"用"的——重读当安慰剂，与显影报告同警戒）。

---

## 九、开放问题（spec 阶段裁决）

1. 概念"用一次"入口粒度：概念页（默认）＋闪卡复习面（默认关，不打扰复习）——倾向如上。
2. 交叉点提示默认开关——倾向默认关（已入 §六）。
3. 全局体系是否允许多个——倾向唯一（可改），防多核心稀释；长期看数据再议。
4. 体系是否承接 REQ-030（学习计划系统）——**不承接**：体系＝"为什么学/怎么用"，学习计划＝"怎么持续学"，属飞轮层另一枝，另议。
5. 决策日志是否加"决策质量"评级——**不加**（不引入自我评判压力；反思字段已够）。
6. 领域体系是否允许嵌套（子领域）——倾向不允许（一层即够），问题树深度由节点承载。

---

## 十、参考

- 指南原文：`docs/Foresight/source-personal-knowledge-system-guide-v2.md`
- 理念基线：`docs/product/product-design-philosophy.md`、`docs/product/pain-points-v4.md`
- 前序实现：`docs/superpowers/specs/2026-08-22-v0.11-note-group-learning-loop-design.md`（组/闪卡/结算接口）
- 预埋接口：REQ-199（flashcards.kind=model 留接口）· 需求池 v0.11.4 区段
