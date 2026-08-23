# 竞品调研：知识体系层与学习闭环赛道（v0.13 决策输入）

> 状态：前瞻调研（2026-08-23；已作为 v0.13 系列立项依据，见 [v0.13.md](../versions/v0.13.md)）
> 目的：为「知识体系层」（[整合分析·方案 B](./personal-knowledge-system-layer-integration.md)）提供市场定位、定价锚点与差分验证
> 方法：官网定价页 + 2026-08-03 三款主流实测对比（通义听悟/讯飞听见/Ai好记，公开 URL 见 §七）+
> 产品深度分析（通义听悟 vs 飞书妙记，woShiPM 2023，本地检索缓存 `.firecrawl/tytingwu-analysis.md` 未入库）+
> 行业数据（Notion 财务/用户、SRS 榜单 2026、笔记市场规模）；检索时间 2026-08-23；**价格为写稿时点，以官网为准**

## 结论先行

- **五层竞品地图**（提取→记忆→组织→学习闭环→体系-决策）中，「提取→记忆→应用→决策」完整闭环**无人做**；四处断点分别被不同品类占据。
- **「应用/决策」是零竞品带**：未发现把「概念/模型 ↔ 决策日志 ↔ 审计」做成产品级记账结构的产品（Notion/Obsidian 的"决策日志"是社区人工模板）。
- **本地优先赛道拥挤度低**：本地优先 + 内置 SRS 的组合（思源笔记）已被验证有付费意志，但无视频提取、无组级学习循环——熵减是"提取→组→循环→体系"全程本地的唯一组合。
- **最大威胁是免费 AI**（NotebookLM 免费档）：提取与组织心智正被大厂免费收割——熵减的回答是"成为隐喻 + 人类判断领地（体系层）"，体系层绝不能做成 AI 自动写决策。

---

## 一、调研问题与结论

| # | 问题 | 结论 |
|---|------|------|
| Q1 | 谁在做"视频内容 → 知识体系"的完整闭环？ | 提取侧（听悟/听见/妙记/Ai好记/BibiGPT）全部停于"转写+AI 总结+导出"：无记忆引擎、无体系层。记忆侧（Anki/RemNote/Mochi/Quizlet）无提取、无组织层。组织侧（Obsidian/Notion/思源/语雀/flomo/Heptabase）无自动提取、SRS 非主线（思源除外，但无视频管线）。**没有任何一家贯通四段** |
| Q2 | 有没有人做"应用/决策"环节？ | 未发现。最接近的是反思日记类（Day One、flomo 回顾——无概念↔决策结构）与白板类（Heptabase——空间组织非记账）。**产品级"决策日志 + 审计"为空** |
| Q3 | 定价与商业模式锚点？ | 国内 C 端事实标准：免费核心 + 年付会员（¥100–300 档：flomo/语雀/印象笔记）；转写类按量/按分钟（听悟/听见；腾讯会议 ≈¥25/月 历史参照）；国外订阅 $8–20/月（Notion $10/$20、Granola、Heptabase、Capacities）；Obsidian 证明"免费核心 + 增值服务"，Anki 证明"免费开源"可行 |
| Q4 | 熵减的差异化是否成立？ | 成立，且有三层：①唯一"本地全链路（两地形提取）+ 组级学习循环 + 体系决策层"组合；②"决策/应用记账"零竞品带；③AI 免费冲击下，"被 AI 问得到的才是能力"是唯一可持续回答。风险：双界面成本与体系沼泽化（防 line 见整合分析 §七） |

---

## 二、市场分层与竞品地图

```
L5 体系-决策层   ❌ 空（仅模板社区的"决策日志/知识体系"人工模板）
L4 学习闭环层    [熵减]（本赛道代表）· Ai好记(整理向) · NotebookLM(AI 问答向) · RemNote(输入→卡)
L3 组织层        Obsidian · Notion · Logseq · 思源笔记 · 语雀 · flomo · Heptabase · Capacities · 印象笔记
L2 记忆层        Anki · Quizlet · RemNote · Mochi · Brainscape · Chunks · Duolingo(语言)
L1 提取层        通义听悟 · 讯飞听见 · 飞书妙记 · Ai好记 · BibiGPT · Otter · Granola
```

- **断点 1（提取→记忆）**：听悟/Ai好记 产出的笔记只能导出给别人（PDF/Obsidian），自己不进复习引擎；
- **断点 2（记忆→组织）**：Anki 卡不与知识结构连接；RemNote 笔记=卡但无提取、锁格式；
- **断点 3（组织→循环）**：Obsidian/Notion 的组织是文档逻辑，不是学习循环（无 SRS 主线、无组粒度、无结算）；
- **断点 4（循环→决策）**：**全场空白**——没有人把"学了什么"接上"用在哪、判断对错"。

---

## 三、逐层明细（核心竞品）

| 产品 | 形态/平台 | 关键能力 | 定价（写稿时点） | 与熵减重叠 | 缺口 |
|---|---|---|---|---|---|
| 通义听悟（阿里云） | Web/小程序/API | 实时转写、声纹分离、章节速览、PPT 识别、AI 总结/问答 | 免费额度＋按量（百炼 API）；单会议 2h 上限；阿里云盘打通免空间 | 高（提取） | 无记忆引擎；云端；按分钟成本 |
| 讯飞听见（科大讯飞） | Web/App | 高精度转写、方言、专业语料、同传 | 套餐＋时长卡（多档） | 中（提取） | 定位"转写工具"，笔记整理自理（[2026-08 实测](https://www.cnblogs.com/Agusiling/articles/22165378)） |
| 飞书妙记（字节） | 飞书套件 | 会议纪要、AI 摘要 | 飞书会员/企业套件 | 中（提取） | 强绑定飞书生态；曾需企业账号 |
| Ai好记 | Web | 11 平台链接解析（B站/小宇宙…）；单文件 7h/4GB；图文笔记＋大纲＋导图＋速览＋AI 播客；三级目录＋跨笔记检索；导出 MD/PDF/Word/Obsidian | 订阅制（以官网为准） | **高（学习整理）** | 无实时转写；无 SRS；无组循环；云端——"整理端"最像样的对手 |
| BibiGPT | Web/小程序 | B站/YT/播客/本机视频一键总结、转写 | 免费试用＋订阅（[定价页](https://bibigpt.co/pricing)） | 中 | 总结向，无沉淀 |
| Granola | 桌面/mobile | **本机系统音频捕获，无会议机器人**；转写＋AI 笔记＋Chat | Free/Pro/Business（[定价页](https://www.granola.ai/blog/granola-pricing-plans-features-roi)） | 中（采集同构） | 会议向；无学习记忆；AI 依赖云端 |
| NotebookLM（Google） | Web | 上传资料→AI 笔记本：问答、摘要、音频概览、时间线＋笔记 | 免费；Plus 随 Google One AI Pro（$19.99/月，[2025-02 扩至个人](https://techcrunch.com/2025/02/10/google-expands-notebooklm-plus-to-individual-users/)） | **高（AI 问答）** | 无 SRS；无本地；无应用闭环；数据上云——**免费 AI 冲击头号来源** |
| Anki | 全平台/开源 | FSRS/SM-2 调度、插件生态 | 免费 | 中（记忆） | 制卡门槛高；无提取 |
| RemNote | 全平台 | outliner 笔记→任意行变卡；知识树 | Free＋Pro 订阅（[官方对比文](https://www.remnote.com/blog/quizlet-vs-revisely-vs-remnote)） | 高（笔记闪卡） | 格式锁定；无提取；无应用层 |
| Mochi | 桌面 | Markdown 笔记＋卡前缀 | 免费＋Pro | 中 | 小众 |
| Quizlet | Web/App | 最大 UGC 卡库、AI 生成 | Free＋Plus | 中 | 应试向 |
| Obsidian | 全平台 | 本地 Markdown、双链、插件生态（含 SRS/Smart Connections） | 核心免费＋Sync 订阅；商业授权 $50/用户/年（[定价页](https://obsidian.md/pricing)，2025-02 起可选） | 高（组织） | 通用向；无提取、无学习循环；"双链图谱"心智所在地 |
| 思源笔记（链滴） | 全平台 | **本地优先＋双链＋内置闪卡（SRS）**＋大纲；会员 | 免费＋会员（[定价参考](https://saascompared.com/product/siyuan)） | **高（本地＋SRS）** | 无视频提取；无组级循环/结算；无应用层——"本地优先"最直接竞品 |
| Logseq | 全平台 | outliner、本地、双链、卡 | 免费＋Pro（[讨论](https://discuss.logseq.com/t/logseq-pro-paid-local-features/32007)） | 中 | 同上 |
| Notion | 全平台 | 通用工作区；AI 智能体（$10/1,000 credits） | Free/Plus $10/Business $20 per seat（[定价页](https://www.notion.com/pricing)）；100M 用户/4M 付费/~$600M ARR（[官方站](https://www.notion.com/blog/100-million-of-you) · [Contrary 报告](https://research.contrary.com/company/notion)） | 高（组织） | 非学习向；无提取、无 SRS |
| 语雀（蚂蚁） | Web/App | 知识库、文档、团队协作 | 会员制（[定价页](https://wit-motion.yuque.com/about/price) 镜像） | 中 | 企业知识库向 |
| flomo | Web/App | 碎片卡片、标签、回顾（被动间隔回忆）、AI | 免费＋会员（[App Store](https://apps.apple.com/cn/app/id1552314395)） | **高（feed 地形）** | 无组、无提取、无结算；"回顾"是轻 SRS——碎片心智被它占据 |
| Heptabase | 全平台 | 卡片＋白板＋**可视化图谱** | Pro/Premium/Premium+ 订阅（[定价 FAQ](https://support.heptabase.com/en/articles/12990121-pro-premium-and-premium-plans-pricing-faq)） | 中 | "可视化图谱"心智被占；无提取/复习——印证熵减不做图谱可视化是对的 |
| Capacities | 全平台 | 对象式 PKM、AI | Free＋Studio（[对比页](https://capacities.io/compare/evernote)） | 中 | 同 Heptabase |
| 印象笔记 | 全平台 | 采集/搜索/知识库 | 会员 | 中 | 老化 |

**市场体量参照**：笔记应用市场 2026 年约 $13.3B → 2030 年 $28.05B（CAGR 20.5%，[ResearchAndMarkets](https://www.researchandmarkets.com/reports/5790688/note-taking-app-market-report)）；笔记管理软件狭义市场 $2.49B(2026) → $4.04B(2030)，12.8% CAGR（[TBRC](https://www.thebusinessresearchcompany.com/report/note-taking-management-software-global-market-report)）。学习闭环细分在其中占比未知——**这是缝隙市场，不是红海**，支撑"精做技能自学者"而非"做大而全"。

---

## 四、关键判读（六条）

1. **闭环缺失带**：提取→记忆→应用→决策没有一家贯通。Ai好记最接近"学习整理"，但停在"产出多样性"；RemNote 最接近"笔记↔卡"，但无提取且锁格式。
2. **"应用/决策"零竞品带**：这是 v0.13 体系层最大的差异化——概念/模型 ↔ 决策日志 ↔ 审计 的产品级记账结构，全场无人做（竞品只有人工模板）。
3. **定价锚点**：国内 C 端事实标准是"免费核心＋年付会员（¥100–300）"；转写类按量/分钟（长期成本高，正是"本地优先"的价值论据）；国外 $8–20/月订阅。启示：熵减采用"本地全功能免费核心＋会员（多端/云同步/AI 增强）＋AI 按量"混合模式，与市场事实标准一致，且本地引擎零边际成本。
4. **AI 免费冲击**：NotebookLM 免费档证明大厂在用免费 AI 抢占"提取＋组织"心智。熵减的应战是**成为隐喻**（"被 AI 问得到的才是能力"）＋**体系层＝人类判断领地**。设计红线：体系层绝不做"AI 自动写决策/自动建体系"（假燃料），AI 只做补缝与提示。
5. **可视化图谱已被占位**：Heptabase/Obsidian Graph/思源图谱占据"知识图谱"心智，且 P13 已出局——熵减体系层用**树＋列表**（决策导向），不做力导向图（REQ-029 维持 P3）。
6. **碎片心智被 flomo 占据**：flomo 定义"碎片卡片＋回顾"品类；熵减 feed 地形的差异化＝碎片**进组、进循环、生卡、结算**（flomo 没有组粒度与结算机制）。

---

## 五、对 v0.13 的启示（七条）

1. **体系层优先做，但永远挂在学习循环上**——无组证据的体系＝Notion 模板社区（防"体系沼泽化"死法）。
2. **不做 AI 自动生成决策/概念**：践行"AI 测量，人类见证"；AI 只做三问一用回填提示、审计建议生成（须用户确认）。
3. **定价留桩**：`knowledge_*` 数据可导出（Markdown/JSON），"低锁定"是撬动 Obsidian/思源用户迁移的理由；会员模式只留桩不实现（v0.13 不排商业化）。
4. **"审计/结算"是全场共性缺失**，可作为叙事层差异化重点：连 Ai好记/NotebookLM 都没有"复盘"概念（它们只有"年报告"式的计数）。
5. **互操作安全阀**：参考 Ai好记"导出 Obsidian"——熵减提供 Markdown＋回链格式导出（不是做双链产品，是防盗域锁定）。
6. **避免"笔记应用面孔"**：体系页 UI 保持"决策仪表盘"质感（三问一用卡片、审计清单、树+列表），不变成 Notion 式文档树。
7. **竞争参照系**（对内对外同口径）：比提取与 AI——听悟/NotebookLM；比记忆——Anki/RemNote；比组织——Obsidian/思源；比碎片——flomo；**没人比"应用与决策"——这是熵减的位置**。

---

## 六、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| NotebookLM 类免费 AI 碾压"提取+组织"心智 | 高 | 高 | 成为隐喻＋本地优先＋决策层；不与之比拼"AI 问答多聪明" |
| Ai好记类"整理端"抢学习心智 | 中 | 高 | 差异化＝记忆引擎＋组循环＋审计（Ai好记无 SRS 无结算） |
| 双界面成本（体系＋学习两套界） | 中 | 中 | 三时钟纪律：体系不进每日视图；体系页＝树＋审计单屏 |
| 思源/Obsidian 用户不迁移 | 高 | 中 | 锚定"视频提取＋学习循环"（它们没有），不做"记笔记"之争 |
| 免费+低价下沉 | 中 | 中 | 本地引擎零边际成本，允许免费核心＋低价会员；AI 成本按量转嫁 |

---

## 七、来源清单

- 官网定价/功能：Obsidian pricing · Notion pricing（Free/$10/$20；企业版另议）· NotebookLM Plus 个人版（TechCrunch 2025-02-10）· BibiGPT · Granola（pricing + docs：本机系统音频/无会议机器人）· Heptabase Pricing FAQ · Capacities · 思源定价参考 · flomo App Store · 语雀定价（镜像）· 飞书妙记产品页 · 通义听悟（[阿里云百炼产品概述](https://help.aliyun.com/zh/model-studio/tingwu-meeting-summary-overview)）· 讯飞听见收费帮助（[m.iflyrec.com](https://m.iflyrec.com/help/help_charge.html)）
- 实测对比：通义听悟/讯飞听见/Ai好记（[博客园 2026-08-03](https://www.cnblogs.com/Agusiling/articles/22165378)）
- 深度分析：通义听悟 vs 飞书妙记（woShiPM 2023，本地检索缓存 `.firecrawl/tytingwu-analysis.md` 未入库；含腾讯会议 ¥25/月 参照、听悟 2G 免费＋阿里云盘、飞书妙记 10G）
- 行业榜单：Best Spaced Repetition Apps 2026（[chunks.app](https://chunks.app/blog/best-spaced-repetition-apps-2026)）
- 市场规模：ResearchAndMarkets（$13.3B→$28.05B）· TBRC（$2.49B→$4.04B）
- 未核实项标注：(以官网为准) 的行——Ai好记/RemNote/思源/flomo/Quizlet/Logseq/Heptabase/Capacities 的具体档位金额未逐项核实，定位与 tier 结构经公开页面确认。
