# 知识体系类软件调研：第二大脑/PKM 赛道细分（v0.13 输入）

> 状态：前瞻调研（2026-08-23；作为 v0.13 体系层 spec 的输入，承接 [赛道全景调研](./competitive-analysis-knowledge-system-layer.md)）
> 定位：上一轮调研回答"学习闭环赛道里谁做什么"；本调研回答"**知识体系/第二大脑品类内部，体系化是怎么实现的**"——五流派形态、四件套（问题树/概念三问一用/模型/决策日志/审计）支持度、方法论空白点。
> 检索时间 2026-08-23；价格为写稿时点，以官网为准。本地检索缓存见工作区 `.firecrawl/`（未入库）。

## 一、调研问题与结论

| # | 问题 | 结论 |
|---|------|------|
| Q1 | 品类内有哪些"体系化形态"流派？ | **五流派**：①卡片盒（Zettelkasten）②大纲树（outliner/导图）③目录体系（PARA/CODE）④可视化图谱（卡片白板）⑤模板约定（MOC/插件生态）。全部是"**如何组织**"的约定，无一回答"如何检验" |
| Q2 | 有没有产品原生支持"问题树/概念三问一用/模型/决策日志/审计"？ | **无完整四件套**。最接近：①问题树——Ramifly（AI 对话→理解之树，[Trae 论坛介绍](https://forum.trae.cn/t/topic/67243)）＋ Obsidian MOC（手工约定）；②概念卡——双链工具都支持"概念=原子卡+链接"，但无"三问一用"内置结构；③决策日志——**独立 App 存在**（Decisio Journal / Verdict），但孤立（无概念关联、无审计、无学习循环）；④审计——无任何产品有（只有归档清理建议） |
| Q3 | 品类叙事由什么方法论主导？ | Zettelkasten（Luhmann 卡片盒）＋ PARA/CODE（Tiago Forte，行动导向）＋ MOC（地图式结构笔记）。**没有任何方法论讲"知识是否被使用、决策是否变好"**——指南第五环（审计/检验）在方法论层就是空白 |
| Q4 | 对熵减/v0.13 的意义？ | 意义重大：①"模板+自律"是品类最大痛点（搭建/维护成本高，放弃率高）——内置向导+模板+审计就是产品化自律；②MOC 证明"用户需要体系层但没有产品承接"；③决策日志独立 App 证明需求真实；④Roam 衰落证明低锁定是品类生存法则 |

## 二、五流派图谱与代表产品

| 流派 | 方法论来源 | 代表产品 | 体系化机制 | 典型短板 |
|---|---|---|---|---|
| 卡片盒 | Zettelkasten | Roam Research · Obsidian · 思源笔记 · Logseq | 原子卡＋链接＋结构笔记 | 深度依赖使用者自律（放弃率高）；无审计无生命周期；**Roam 警示：约 5 年兴趣衰退 90%＋数据锁定（[Reddit 讨论](https://www.reddit.com/r/RoamResearch/comments/1qhgdbg/is_there_any_hope_for_roam_to_survive_another/)·[离 Roam 记](https://yu-wenhao.com/en/blog/roam-research-to-obsidian/)）** |
| 大纲树 | outliner | 幕布（[App Store](https://apps.apple.com/cn/app/id6736676944)）· 知犀（[官网](https://www.zhixi.com/jiayou)）· Workflowy · RemNote 知识树 | 大纲层次＝结构；导图＝展示 | 只有层次、无概念化；重展示轻建模 |
| 目录体系 | PARA/CODE（[方法论](https://www.todoist.com/ru/productivity-methods/para-method)） | Notion · 语雀 · 印象笔记 · 为知 | 文件夹/视图＝分类 | 正是指南点名的"**从分类开始搭**"误区；无学习循环 |
| 可视化图谱 | 卡片＋画布 | Heptabase · Kosmik · Scrintal · Tana（Supertags） | 空间/图谱＝连接；Tana 用结构化标签建模（[Tana vs Anytype](https://aiproductivity.ai/blog/tana-vs-anytype/)） | 探索感强、沉淀弱；"图谱"心智已被占据——印证熵减不做图谱可视化是对的；Tana 存在迁移争议（[讨论](https://talk.macpowerusers.com/t/replacement-for-tana/44724/6)） |
| 模板约定 | MOC（[ObsidianMOC](https://github.com/seqis/ObsidianMOC)）· 模板库 | Obsidian＋插件生态（[AI Second Brain starter](https://github.com/jamesmcroft/obsidian-ai-second-brain) · [File-Flashcards](https://github.com/lucaszischka/File-Flashcards) · [SRS 插件](https://github.com/st3v3nmw/obsidian-spaced-repetition)） | 用户自制 MOC＋模板＝事实上的"问题树" | 产品不管结构——全靠用户纪律；SRS 靠插件"缝"上去，无组粒度、无结算 |

## 三、四件套支持度对比

| 产品 | 问题树 | 概念卡"三问一用" | 模型（交叉验证） | 决策日志 | 审计（生命周期） | 一体化说明 |
|---|---|---|---|---|---|---|
| Obsidian | MOC 手工（非结构化） | 卡＝笔记＋社区模板 | 手工 | 手工模板（社区） | 无 | 本地 Markdown 低锁定；结构靠用户 |
| 思源笔记 | 大纲＋双链（无问题概念） | 模板 | 手工 | 无 | 无（有闪卡无结算） | 最接近"本地优先＋SRS"；无视频提取、无组循环 |
| RemNote | 知识树（大纲式） | 行内嵌卡 | 手工 | 无 | 无 | 笔记↔卡一体（品类的"记忆"最强者之一）；格式锁定 |
| Notion | 数据库层级（人工） | 模板 | 手工 | 模板（社区） | 无 | 通用工作区；组织向 |
| Heptabase | 白板卡片（无树） | 卡片 | 手工 | 无 | 无 | 可视化心智占位者 |
| Tana | Supertags 语义结构 | 标签字段 | 手工 | 无 | 无 | 概念建模先锋；但无循环/无审计 |
| flomo | 标签（无树） | 卡片＋标签 | ✗ | 无 | 回顾＝轻 SRS | 碎片心智；无组、无结算 |
| Ramifly | **AI 对话→理解之树（原生问题树）** | 树节点（AI 生成） | ? | 无 | ? | 新入局（大赛级产品，[介绍](https://forum.trae.cn/t/topic/67243)）；树无学习证据层 |
| Decisio Journal / Verdict | ✗ | ✗ | ✗ | **专注：独立决策日志 App**（[Decisio](https://apps.apple.com/au/app/decisio-journal/id6758459457) · [Verdict](https://apps.apple.com/tw/app/verdict-decision-journal/id6756952013)） | 无 | 孤立工具：无概念/模型引用、无审计、无学习循环 |
| 幕布 / 知犀 | 大纲/导图（无问题语义） | ✗ | ✗ | ✗ | ✗ | 展示性工具 |

## 四、关键判读（五条）

1. **方法论空白在"检验"而非"组织"**：卡片盒/PARA/MOC 全都回答"怎么存、怎么找"，**无人回答"知识是否被用了、决策是否变好了"**——熵减体系层（应用记录＋审计）填补的是**方法论级空白**，不只是功能差异。这是零竞品带的真正边界。
2. **"问题树"形态刚被市场注意**：Ramifly 证明问题树有需求（AI 对话→理解之树），但它是"AI 自动生成树"（无证据层）；熵减是"用户围绕问题组织学习"（树挂在真实组/卡证据上）。两者理念相反——**AI 生成树 = 假燃料风险（自动化的体系没有真牙）**，熵减保持"人的判断"。
3. **MOC 是被验证但无人承接的需求**：Obsidian 用户用手写 MOC/模板搭体系，[ObsidianMOC](https://github.com/seqis/ObsidianMOC) 一类文档流传——说明需求真实，只是没有产品把它做成结构化+审计的一等公民。熵减的 `knowledge_nodes`＋审计＝承接此需求并升级。
4. **Roam 衰落的元教训＝低锁定**：双链鼻祖因数据锁定＋停滞，5 年兴趣衰退约 90%，用户流向本地 Markdown 生态。熵减：本地优先＋`knowledge_*` 可导出（Markdown/JSON）＝站在品类"生存法则"一侧；这与 Obsidian 系是共存关系（其用户正是"低锁定信仰"人群）。
5. **模板不是体系**：PARA/CODE/MOC/"AI Second Brain starter"全是**约定**而非产品能力，需要用户持续自律——这正是 PKM 高放弃率的根因（搭建成本高、收益慢、无反馈）。**熵减把"模板自律"变成"产品承载"（向导＋四行模板＋审计触发＋失效降级）＝品类级差异化。**

## 五、对 v0.13 的启示（六条）

1. **内置引导是差异化的关键**：竞品全是"模板＋自律"；熵减用"创建向导（极简启动模板）＋四行法模板＋季度审计"把自律产品化（指南 §4.1 即此）。
2. **概念卡"三问一用"无人内置**：竞品概念＝空白卡；熵减把"问本质/问边界/问联系/用一次"做成卡结构＝直接差异化，且与记忆面（kind=model 闪卡）互为双面体。
3. **决策日志从"记"升级为"闭环"**：独立 App 证明"记决策"需求真实；熵减的差异＝决策↔概念/模型↔审计↔学习循环的整合（Decisio/Verdict 只有"记"）。
4. **风险：Ramifly 可能抢"问题树"心智**——应对：不与其比"AI 生成树"，比"树长在学习证据上"；AI 只建议不生成（已写入 v0.13 红线）。
5. **低锁定是品类通行证**：knowledge_* 全部可导出；但**不做 Obsidian 式笔记库**（定位=学习工具，不抢笔记迁移）——与旧调研"互操作安全阀"一致。
6. **图谱可视化维持不做**：Heptabase/Tana 已占位＋P13 出局；树＋列表＋审计已构成体系感。

## 六、风险提示

| 风险 | 对策 |
|---|---|
| Ramifly 类"AI 生成问题树"抢心智 | 差异化＝证据驱动（树挂组/卡）；AI 只建议不生成 |
| 决策日志独立 App 低价抢占 | 不比"记决策"，比"决策↔概念↔审计"闭环与学习联动 |
| PKM 用户沉没成本高（不迁移） | 锚定"视频学习"场景，不做"笔记库迁移"之争；导出功能降低入场疑虑 |
| 体系"模板感"过重（用户复制粘贴式填表） | 向导不预填内容；审计产出建议须确认；待观察区透明可见 |

## 七、来源清单

- 产品/方法论官网：Obsidian（pricing）· 思源笔记（[App Store](https://apps.apple.com/cn/app/id1583226508)·[少数派 2025 双链](https://sspai.com/post/95363)）· RemNote · Tana（vs Anytype [对比](https://aiproductivity.ai/blog/tana-vs-anytype/)）· Heptabase · 幕布（[App Store](https://apps.apple.com/cn/app/id6736676944)）· 知犀（[官网](https://www.zhixi.com/jiayou)）· flomo · PARA（[方法论](https://www.todoist.com/ru/productivity-methods/para-method)）
- 生态/模板：MOC（[ObsidianMOC](https://github.com/seqis/ObsidianMOC)）· Obsidian AI Second Brain starter · File-Flashcards / obsidian-spaced-repetition 插件
- 新入局者：Ramifly（[Trae 论坛](https://forum.trae.cn/t/topic/67243)）
- 决策日志独立 App：Decisio Journal · Verdict - Decision Journal
- Roam 兴衰：Reddit 讨论 · [Why I Left Roam](https://yu-wenhao.com/en/blog/roam-research-to-obsidian/)
- 品类综述：PKM Tools 2026 Deep Dive（[Notion/Obsidian/Logseq/Anytype/Tana/Capacities/Heptabase](https://www.youngju.dev/transcribe/culture/2026-05-15-pkm-tools-2026-notion-obsidian-logseq-anytype-tana-capacities-heptabase-deep-dive.en)）· [Atlas Workspace PKM Guide 2026](https://www.atlasworkspace.ai/blog/personal-knowledge-management) · [Kosmik Best PKM Apps](https://www.kosmik.app/blog/best-pkm-apps) · [Saner/Voicenotes/NotebookLM/Notion AI 第二大脑对比](https://z.ajkd.com/articles/saner-ai-vs-voicenotes-notebooklm-notion-ai-notes/)

## 附：对上一轮调研结论的修订

- 原结论"「应用/决策」零竞品带"**修订为**：整合型闭环（概念/模型↔决策日志↔审计↔学习循环）仍为空白；**孤立决策日志 App（Decisio/Verdict）已存在**，证明需求真实、整合是差异化而非发明需求。
- 原"不做图谱可视化"判断获反向验证：Tana/Heptabase 占据建模与可视化心智，且各自存在迁移/沉淀争议。
