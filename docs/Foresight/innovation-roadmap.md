# 熵减创新功能现状盘点与实施路线图

> **文档状态**：现状盘点 + 实施路线图（基于 2026-08 三路并行代码调研交叉验证）
> **关联文档**：[docs/Foresight/innovation-features-catalog.md](./innovation-features-catalog.md)
>
> **定位声明**：本文档为创新功能实施排期依据；与 `docs/product/requirements-pool.md` 状态/优先级不一致处以本文档为准（如 EXP-019 全局捕获在 requirements-pool 标 P3，其快捷键基础由本文档 P1 全局快捷键框架提前承担）。

---

## 1. 概述

### 盘点范围

- 盘点对象：`innovation-features-catalog.md` 中 **16 个分类、约 110 项**创新功能提案。
- 实际可逐项核对：**103 项**（部分提案在 catalog 中为合并描述，已按代码事实拆分/归并）。
- 核对方式：三路并行代码调研（客户端渲染层、Electron 主进程与数据层、AI 网关与同步服务），结论经交叉验证。

### 总体统计

| 状态 | 含义 | 数量 |
|------|------|------|
| ✅ | 已实现 | **26 项** |
| 🟡 | 部分实现或有可复用基础 | **41 项** |
| ❌ | 未实现 | **36 项** |

> **口径说明**：上表为第 2 节状态矩阵逐行清点结果（合计 103 项；"✅ 基础版"类按 ✅ 计入），与四维审查口径一致（✅26 / 🟡41 / ❌36）。

### 关键结论速览

1. **SOP 系统零实现**，但它是分类八/十二/十三十余项功能的公共依赖，必须地基先行。
2. **Electron 全局快捷键地基为零**（全仓库 `globalShortcut` 零使用），收集盒类功能被阻塞。
3. AI 网关已有 **28 条 chain**，目录所需大半已存在；新增约 17 条，走标准 6-8 文件触点即可并行推进。
4. 数据层为 **SQLite + Dexie 双轨**，新功能约需新增 10 张表；**新表只进 SQLite**（schema v9/v10 + ALLOWED_TABLES 登记），Dexie 冻结不再加表（与 requirements-pool FEAT-052 保持一致，详见第 3 节关键事实 5）。
5. 大量功能处于 🟡"最后一公里"状态，**闭环收尾的投入产出比最高**。

---

## 2. 实现状态总矩阵

状态符号：✅ 已实现 ｜ 🟡 部分实现或有可复用基础 ｜ ❌ 未实现

> **归宿标记约定**：缺口列中的「→P1/P2/P3 xx批」表示该缺口的实施归宿（详见第 5 节路线图）；「暂缓」表示本轮不排期并附复审条件；无标记表示缺口为设计取舍或已含于同编号归宿中。

### 分类一：番茄钟（✅4 / 🟡1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| T1 | 超昼夜节律自适应 | ✅ | `client/src/features/pomodoro/lib/rhythmEngine.ts`（24小时桶加权完成率，高峰35/平稳25/低谷18分钟） | 三档离散而非 90-120 分钟连续周期拟合 |
| T2 | 记忆锚点定时器 | ✅ | `features/pomodoro/hooks/useAnchorReminder.ts` + `AnchorReminderOverlay.tsx`（挂于 ImmersiveTimer，work 阶段每12分钟触发15s浮层）+ `electron/ai/handlers/anchorPointHandler.ts` + `server/ai-gateway/chains/anchor_point_chain.py` | 不真正暂停15秒，输入是目标文本非实时学习内容（暂缓，复审条件：课堂实时 ASR 管线就绪后随 M1/M2 联动评估） |
| T3 | 5分钟承诺入口 | ✅ | `usePomodoroStore.startCommitDive`（COMMIT_DIVE_SECONDS）+ `proactiveRules.ts` commit-dive 规则（离开≥3天回归触发） | — |
| T4 | 孵化效应引导 | 🟡 | `src/hooks/useStuckTimer.ts`（10分钟阈值）→ `stuck:incubation` 事件 → rescue 气泡 | 无3分钟轻体力引导音频与任务自动恢复 |
| T5 | 精力-任务匹配 | ✅ | `features/pomodoro/lib/energyMatcher.ts` + `EnergySuggestionBar.tsx`（挂于 PomodoroPage，纯本地零AI） | — |

### 分类二：笔记（✅5 / 🟡1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| N1 | 课程级迷你测试 | ✅ | `features/notes/components/MiniQuizDialog.tsx` + `lib/ai/hooks/useAIQuiz.ts` + `chains/quiz_gen_chain.py`；NotesPage 多篇选择入口；错题可转闪卡 | — |
| N2 | 合书测试 | ✅ | `features/notes/components/ClosedBookTest.tsx` + NoteEditPage closedBook 状态+blur遮罩 | 答后无逐条 diff 高亮（→P1） |
| N3 | 笔记健康度 | 🟡 | `features/notes/lib/noteHealth.ts` + `NoteHealthIndicator.tsx`（本地启发式三维） | 无对比课堂转录的逐字抄录率、无 AI 关键词覆盖率 |
| N4 | 笔记→费曼引导 | ✅ | `features/notes/components/AnchorPoint.tsx`（importance≥0.6 推荐费曼讲解一键跳转） | — |
| N5 | 策略性遗忘三层 | ✅ 基础版 | `ContentTierModal.tsx` + `useAIContentTier.ts` + `content_tier_chain.py` | 编辑器内折叠渲染（暂缓，复审条件：核心层联动上线后按使用率评估）；闪卡生成优先核心层联动未做（→P1 闭环收尾） |
| N6 | 概念冲突检测 | ✅ | `features/notes/hooks/useConceptConflict.ts`（取最近5篇历史笔记比对）+ `conflict_detect_chain.py` | — |

### 分类三：闪卡（✅4 / 🟡1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| F1 | 多情境提取卡片 | 🟡 | 后端 `card_gen_chain.py` VARIANTS_ADDENDUM 就绪；**客户端零接线**，且 flashcards.type CHECK 禁止 _variant 落库（schema.ts L46） | card_gen 前端接线 + 类型约束扩展 + 变体分组展示（→P2 AI 欠账清理批） |
| F2 | 黄金错误加速复习 | ✅ | `useStudySessionStore.compressForGoldenError`（interval 封顶1天）+ `lib/sm2.ts` goldenErrorMultiplier + `flashcard_reviews.golden_error` 列 | 仪表板黄金错误周报未做（→P2 AI 欠账清理批，并入 S5/S10 展示层） |
| F3 | 睡前复习推荐 | ✅ | `features/assistant/hooks/useBedtimeReminder.ts`（21:30-23:30窗口、到期≥5）+ bedtime-review 规则 | 仅气泡提醒，未拉起5卡迷你复习会话（→P1） |
| F4 | 错误模式分析 | ✅ | `GoldenErrorPanel.tsx` + `useAIErrorPattern.ts` + `goldenErrorQueries.ts`（30天聚合）+ `error_pattern_chain.py` | — |
| F5 | 中断恢复包 | ✅ | `features/flashcards/lib/recoveryPack.ts`（≥3天中断、10张选卡）+ `RecoveryPackPanel.tsx` L14/L51 已接 fetchRecallQuestion | — |

### 分类四：费曼（✅3 / 🟡1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| E1 | 先破后立概念预检 | ✅ | `ConceptPrecheckCard.tsx`（挂于 FeynmanSessionPage）+ `useAIConceptPrecheck.ts` + `concept_precheck_chain.py` | 未改 feynmanStepSlice，采用独立组件（更解耦，非缺口） |
| E2 | 录音回放自评 | ✅ | `FeynmanRecorder.tsx`（audio_capture_start + local_asr_stream_start，会话内回放+文本持久化） | 音频不持久化，跨会话回放不可用（→P1） |
| E3 | 跨会话概念网络 | 🟡 | `FeynmanGraphPage.tsx`（@xyflow/react）+ `lib/feynmanGraph.ts` | 边为启发式相似度，无 AI 因果/类比/对立关系推断 |
| E4 | 苏格拉底-费曼互通 | ✅ | `useSocraticFlow.tsx`（评估<6分维度经 addWeakPoint 回流费曼薄弱点） | — |

### 分类五：AI 助手（✅5）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| A1 | 情绪分级干预 | ✅ | `useBehaviorSignals.ts`（emotion:struggle 三级）+ emotion-mild/moderate/deep 三规则 | — |
| A2 | 语音对话闭环 | ✅ | `useVoiceInput.ts` → chatHandler 流式 → `speechStreamer.ts` 分句 → `ttsController.ts` FIFO 播报 | — |
| A3 | 微进展叙述者 | ✅ | progress-narrative 规则 + `progressNarratorHandler.ts` + `progress_narrative_chain.py` + `lib/progressStats.ts`（离线模板先行+AI覆盖） | — |
| A4 | 实施意图教练 | ✅ | `implementation_intentions` 表（SQLite v6，非 pomodoro_goals）+ `intentionRepository.ts` + `useIntentionCoach.ts` + `RitualStepIntention.tsx` | 缺条件触发第三类与 AI 优化建议（→P2 悬念与仪式批） |
| A5 | 认知负荷监控 | ✅ | `client/src/features/assistant/lib/cognitiveLoad.ts`（EMA+迟滞）+ cognitive-overload 规则 | — |

### 分类六：仪表板（🟡4 / ❌1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| D1 | 自我效能感滋养 | 🟡 | `dashboard/utils/aggregator.ts` + TrendChart | 无专门周成长故事面板 |
| D2 | 蔡格尼克悬念 | 🟡 | `Sidebar.tsx` Ghost Tasks 静态随机池 | 无 AI 悬念生成引擎（suspense_chain + ritualService 结束步全缺） |
| D3 | 认知卸载中心 | ❌ | 无 | 智能日程面板零实现 |
| D4 | 学习中断恢复面板 | 🟡 | `useLastSession.ts` + `MemoryEcho.tsx` + RecoveryPackPanel 三块积木齐备 | 无 gapDays≥3 回归聚合面板 |
| D5 | 精力周期可视化 | 🟡 | `HeatmapChart.tsx`（7×24纯分钟数） | 无效率值维度、无黄金/低谷标注与 T5 联动 |

### 分类七：多媒体捕获（🟡2 / ❌2）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| M1 | 课中预测弹幕 | 🟡 | predictHandler + `chains/predict_chain.py` + `PredictionPanel.tsx`（在笔记而非课堂） | classroom 实时 ASR→定时预测→弹幕浮层链路零实现 |
| M2 | 记忆锚点自动标注 | 🟡 | anchorPointHandler + keyframePersistence + SegmentList 时间戳基础 | 录制中周期 AI 锚点标注+时间轴跳转 UI 未实现 |
| M3 | 具身休息引导 | ❌ | ImmersiveTimer 休息阶段无引导内容 | 全部缺失 |
| M4 | 清醒期记忆重放 | ❌ | 无相关代码 | 全部缺失 |

### 分类八：跨模块编排（❌2 / 🟡1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| SOP-1 | SOP 标准化流程 | ❌ | 全仓库零代码（无 useSopStore/SopTemplate/sop 表），仅两份纸面设计 `docs/Foresight/sop-module-brainstorm.md` 与 `sop-custom-design.md` | **是分类八/十二/十三十余项功能的公共依赖** |
| SOP-2 | 流程图可视化 | 🟡 | @xyflow/react@12.11.2 已用于 MindmapEditor/NotesGraphPage/FeynmanGraphPage | SOP 流程视图未实现 |
| SOP-3 | 滚书背诵法 | ❌ | 零实现 | FSRS-5（`lib/fsrs.ts`）与 card_gen_chain 可复用 |

### 分类九：知识可视化（✅1 / 🟡1 / ❌4）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| K1 | 三维知识脑图 | 🟡 | `lib/3d/scenes/KnowledgeSky.tsx`（掌握度空间化）+ DeepSeaWorld/AuroraDomeWorld | 全库 3D 图谱（dagre分层/LOD/搜索/时间轴）未实现 |
| K2 | 知识地铁图 | ❌ | 无 | 全部缺失 |
| K3 | 记忆宫殿构建器 | ❌ | 无 | 全部缺失 |
| K4 | 知识进化树 | ❌ | 无 | 全部缺失 |
| K5 | 知识信息图生成器 | ❌ | 无 | 无 infographic_chain |
| K6 | 知识星座 | ✅ | `features/constellation/` + KnowledgeSky，DOM/SVG 与 3D 双轨按性能档切换 | — |

### 分类十：AI 交互模式（🟡5 / ❌4）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| I1 | AI 学生模式 | 🟡 | 费曼"用户当老师 AI 提问评估"雏形已有 | "AI 故意犯错待纠正"student 模式未实现 |
| I2 | AI 辩论对手 | ❌ | 无 | 全部缺失 |
| I3 | AI 学习教练 | ❌ | 无 | 全部缺失 |
| I4 | AI 反直觉发现器 | ❌ | 无 | 全部缺失 |
| I5 | 概念拟人化 | ❌ | 无 | 全部缺失 |
| I6 | 苏格拉底反问镜 | 🟡 | 四模式已实现（brainstorm/question/evaluate/deepening） | 无 mirror 模式，扩展成本低 |
| I7 | AI 出题工坊 | 🟡 | quiz_gen_chain + MiniQuizDialog 已有 | 4策略/5题型/限时考试模式缺失 |
| I8 | 个性化记忆术 | 🟡 | 仅锚点副产物（useAIAnchorPoint 记忆技巧字段） | 无独立三型生成 |
| I9 | AI 播客生成器 | 🟡 | ttsController + transcribe_chain 已有 | 无 podcast_chain 无双角色合成 |

### 分类十一：情感与仪式（✅1 / 🟡5 / ❌3）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| R1 | 蔡格尼克悬念引擎 | 🟡 | 同 D2 | suspense_chain + 结束仪式步全缺 |
| R2 | 睡前复习仪式 | 🟡 | 同 F3 | 仅提醒触发无仪式流程 |
| R3 | 每日浮出水面仪式 | 🟡 | 开场仪式完整（`dashboard/components/ritual/` + useRitualMachine + ritualPlanner） | 缺结束仪式 closingCeremony 分支 |
| R4 | 好奇心通知引擎 | ✅ | `messageTemplates.ts` + `proactiveRules.ts` 14条规则 + `assistant_triggers` 表 | 缺 curiosity_chain AI 文案（→P2 悬念与仪式批） |
| R5 | 考前心理预演 | ❌ | 无 | 全部缺失 |
| R6 | 学习俳句 | ❌ | 无 | 无 haiku_chain |
| R7 | 学习叙事 RPG | 🟡 | progress_narrative_chain 后端就绪 | 前端未接线 |
| R8 | 知识时光胶囊 | ❌ | 无 | 无 time_capsule 表 |
| R9 | 学习成就证书 | 🟡 | `lib/achievements/evaluator.ts` checkAchievements + 7 个成就定义 + achievements 表 | 无证书 PDF、成就数少 |

### 分类十二：数据洞察（✅1 / 🟡6 / ❌4）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| S1 | 学习时光机 | ❌ | 无 | 全部缺失 |
| S2 | 学习决策日志 | ❌ | 无 | 无 decision_log 表 |
| S3 | 学习回放器 | ❌ | 无 | operation_log 表可作数据源 |
| S4 | 知识版本控制 | ❌ | 无 | 无 knowledge_snapshots 表 |
| S5 | 错题模式猎手 | 🟡 | error_pattern_chain + useAIErrorPattern + golden_error 全链路已通 | 缺完整错误模式卡片库 |
| S6 | 认知负荷仪表盘 | 🟡 | `client/src/features/assistant/lib/cognitiveLoad.ts` + useBehaviorSignals 有估算与提醒 | 无三维可视化仪表盘 |
| S7 | 学习能量系统 | 🟡 | `energyMatcher.ts` 有档位建议 | 无能量条 UI、无 SOP 联动 |
| S8 | 学习热力日历 | ✅ | AnalyticsPage + HeatmapChart | 缺 365 格年度视图+目标叠加层（→P2 仪表板叙事批） |
| S9 | 掌握度仪表盘 | 🟡 | RadarChart 五维雷达 + aggregator + MCP learning_memory.mastery | 缺 L0→L2 多层钻取 |
| S10 | 错误概念博物馆 | 🟡 | useConceptConflict + ConceptPrecheckCard + golden_error 采集侧好 | 无博物馆展示层 |
| S11 | AI 学习日志 | 🟡 | progress_narrative_chain 就绪 | 无 journal 表与每日日志流程 |

### 分类十三：游戏化（🟡4 / ❌3）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| G1 | 专注花园 | 🟡 | 深海珊瑚生态完整（`features/retention/` coralEngine/streakEngine/discoveryEngine + `CoralEcosystem.tsx` + 3D StrataField/ChaosMist 接线） | 陆上花园表/GardenScene/漫步未实现 |
| G2 | 知识料理书 | ❌ | 无 | 依赖 SOP |
| G3 | 自适应挑战阶梯 | 🟡 | FSRS-5 stability/difficulty 列已有 | 费曼5级阶梯、布鲁姆层次缺失 |
| G4 | 知识保鲜系统 | ❌ | 无 | 无 freshness 字段/chain |
| G5 | 多感官复习模式 | 🟡 | TTS + GenerativeReviewPage + useVoiceInput | 无5模式切换与多模式独立 FSRS 追踪 |
| G6 | 知识折纸 | ❌ | 无 | 全部缺失 |
| G7 | 全局快捷键系统 | 🟡 | Electron globalShortcut 零使用；应用内数字键导航 + Ctrl+K CommandPalette 已有 | 系统级快捷键地基为零 |

### 分类十四：社交协作（🟡1 / ❌5）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| C1 | 协作深潜 | ❌ | 无 | 全部缺失 |
| C2 | 番茄钟协作接力 | ❌ | dashboard 目标接力是单机内非社交 | 无社交协议 |
| C3 | 学习社交镜像 | ❌ | 无 | 全部缺失 |
| C4 | 知识编译引擎 | ❌ | 无 | 全部缺失 |
| C5 | 微学习卡片流 | ❌ | 无 | 全部缺失 |
| C6 | 协作知识维基 | 🟡 | CRDT 底座已有（schema crdt_docs/crdt_changes + sync-service `crdt.go` + `lib/sync` 15文件） | 缺维基页面/贡献标注/质量机制 |

> **sync-service WebSocket 现状**：仅数据同步（userID→deviceID 连接管理，每用户最多5连接），无房间/presence/轻互动协议。

### 分类十五：环境与身心（🟡3 / ❌7）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| W1 | 氛围专注空间 | 🟡 | useAudioPlayer + SoundPlayer + WorldSoundscape + 49音效资产 + Web Audio 振荡器 | 无5种主题氛围预设 |
| W2 | 心流音乐引擎 | ❌ | 无 | 全部缺失 |
| W3 | 数字养生守门人 | ❌ | 无 | 全部缺失 |
| W4 | 虚拟自习室 | ❌ | 无 | 全部缺失 |
| W5 | 声音记忆锚点 | ❌ | 无 | 现有锚点是文本概念锚，勿混淆 |
| W6 | 概念具身化 | ❌ | 无 | 全部缺失 |
| W7 | 电子墨水学习板 | ❌ | 无 | 单窗口无副窗 |
| W8 | 自适应排版引擎 | ❌ | 无 | 全部缺失 |
| W9 | 专注守护灵 | 🟡 | `windowScorer.ts` 实为采集窗口评分过滤；真正行为感知在 useBehaviorSignals + proactiveRules 分级提示 | 6信号采集与 L3/L4 干预未实现 |
| W10 | 生物反馈集成 | 🟡 | 一期键盘行为推断部分落地 | 摄像头/心率二期未接 |

### 分类十六：产品形态（✅2 / 🟡5 / ❌1）

| 编号 | 名称 | 状态 | 关键证据文件 | 缺口 |
|------|------|------|--------------|------|
| P1 | 插件市场 | 🟡 | 仅 AIPluginLoader AI provider 层插件契约 | 无 manifest/沙箱/市场 |
| P2 | 跨设备学习接力 | 🟡 | VitePWA 已配置（Electron 构建禁用）+ Background Sync handler + sync-service 增量同步 | 接力协议未通 |
| P3 | 渐进式 UI | 🟡 | firstDive 新手引导已有 | 无浅海→中层→深海三级解锁 |
| P4 | 第二大脑收件箱 | 🟡 | 无 inbox 表；inspirations（灵感+AI分拣 sort_inspiration_chain）与 imports/settling（知识入籍）两条平行通道 | 缺全局捕获入口与统一收件箱视图 |
| P5 | 知识卡片收集盒 | ❌ | 无 | 无全局快捷键无剪贴板收藏 |
| P6 | 实施意图教练 | ✅ | 同 A4 | 缺条件触发第三类与 AI 优化建议（→P2 悬念与仪式批，同 A4） |
| P7 | 课前微预习 | ✅ | predictions 表 + PredictionPanel + predict_chain | 缺课表自动触发（暂缓，复审条件：课表数据源接入后评估，候选归宿 P2 悬念与仪式批） |
| P8 | 课堂时光轴笔记 | 🟡 | 实际表为 window_captures（无 session_captures）；useClassroomCapture smartBundle.timeline + SmartCapturePanel 已有 | 完整沿轴回放 UI 未实现 |

---

## 3. 与 catalog 描述不符的关键事实

1. **SOP 系统完全未实现**（零代码仅纸面设计），是十余项功能的公共依赖。
2. **Electron globalShortcut 全仓库零使用**，全局快捷键地基为零。
3. **实现方式与 catalog 预设不同**：E1 以独立 `ConceptPrecheckCard` 实现（未改 feynmanStepSlice）；A4 用 `implementation_intentions` 表（非 pomodoro_goals）；F2 用调度后处理（未改 FSRS 权重）。
4. **AI 网关已有 28 条 chain**（`server/ai-gateway/chains/`），目录所需大半已存在；新增约 17 条：suspense / haiku / debate / infographic / mnemonic / podcast / counterintuitive / personify / preexam / freshness / compile / micro_card / embodied / preview / inbox_sort / learning_coach / concept_relation（E3 所用，P2 AI 欠账批）（每条均已归入 P2/P3 落地批次，见第 5 节）。
5. **数据层双轨**：SQLite（`client/electron/db/schema.ts` SCHEMA_VERSION=8，31张表，实测 CREATE TABLE 31 处）+ Dexie（`client/src/lib/storage/database.ts`，库名 keban 永久豁免）；缺约 10 张新表：sop_templates / sop_steps / sop_runs、inbox_items、time_capsules、decision_log、daily_journals、garden_plants、knowledge_snapshots、misconceptions、sound_anchors、anchor_points 持久化。**口径**：新表只进 SQLite（schema v9/v10 + ALLOWED_TABLES 登记），Dexie 冻结不再加表——与 requirements-pool FEAT-052（Dexie→SQLite 统一迁移）保持一致，避免在待迁移存储上追加表造成返工。

---

## 4. 基础设施现状摘要

### AI 网关（server/ai-gateway）

- **28 条 chain**；config 包化（runtime / limits / providers / fallback / key_pool）。
- **路由注册顺序即匹配顺序**——streaming_router 含 `/{feature}/stream` 通配，新具体路由必须注册在其之前（`main.py` 每个具体路由处均有注册顺序注释）。
- 新增一条 chain 的标准触点 **6-8 文件**：chain + prompts + router + `routers/__init__` + `main.py` include + `limits.py` 两 dict + `fallback.py` 降级链 + tests。

### 客户端 AI 集成层

- **22 个 AIFeatureDef 声明式 handler** + chatHandler / ttsHandler / streamHandler。
- 渲染进程 AIPluginLoader（Electron/Remote 双插件）+ LocalFallback + aiFallbackManager LRU + offlineAIQueue。
- `useAIFeature` 统一降级编排；**23 个 useAI\* hooks**。

### 主动触发引擎

- `useProactiveEngine`（事件总线零轮询、勿扰时段、每小时频控、连续忽略退让、冷却）+ proactiveRules **14条**（已覆盖 commit-dive / stuck-incubation / bedtime-review / emotion×3 / cognitive-overload / intention-reminder / progress-narrative）。

### 仪式系统

- ritualService（落库+模糊→复习卡闭环）、ritualRecallService（2s超时+离线回退+当日缓存）、ritualHelpers / ritualPlanner、useRitualMachine 开场仪式多步框架。

### 状态管理

- Zustand 全局 4 个轻量 store + features 内多个。
- `usePomodoroStore` **784行** / `useNoteStore` 454 / `useStudySessionStore` 454 已超300行规范；无 SOP / inbox / 花园 / journal store。

### IPC

- `preload.ts` 三份白名单约 **90 通道**；无全局快捷键通道。
- `db:query` 等通用通道有 **ALLOWED_TABLES 白名单**（新表必须登记）。

### 3D 渲染层

- `lib/3d`（core 9文件含 SceneProvider / objects 8 / scenes 6）。
- 掌握度→辉光映射已接线（宪法第一条）；性能双轨先例（星座）。
- **已知陷阱**：frameloop never→always 不自恢复需显式唤醒；bufferAttribute 运行时 resize 需 key 重建；变量作 JSX 标签静默失败。

### 调度器

- `lib/scheduler.ts` 策略模式（SM2/FSRS-5 双实现），`sm2.ts` 有 goldenErrorMultiplier 钩子。

---

## 5. 三阶段实施路线图

工作量标记：S 小 / M 中 / L 大。所有条目均带第 2 节矩阵编号前缀，保证可机械追溯；未列出的非 ✅ 项均归入 P3 或标注暂缓。

### P1 — 地基补齐与闭环收尾（12 项：1 项 L 级 + 3 项 M 级 + 8 项 S 级）

#### A. 公共地基

| 项目 | 工作量 | 内容与依赖 |
|------|--------|-----------|
| SOP-1 SOP 系统 MVP | L | `features/sop/` + 三表（schema v9 + ALLOWED_TABLES 白名单）+ useSopStore + 模板编辑器 + 全屏沉浸执行器（一期路由跳转+URL参数跨模块）+ 2-3 内置模板 + 5条 SopLintRule（no-break-long / no-review / too-many-steps / no-output / short-total）；AI 编排留二期。**声明**：本路线图三表方案（sop_templates / sop_steps / sop_runs）覆盖 `sop-module-brainstorm.md §5.1` 的两表方案（steps_json 内嵌），并已覆盖其 §9 三项待决策（一期路由跳转方案、L1+L2 范围）；新表只进 SQLite（见第 3 节事实 5） |
| G7 全局快捷键框架 | M | `electron/shortcutManager.ts` + preload 三份白名单 + CommandPalette 注册表；**触碰 main.ts/preload.ts 需安全审查** |
| P4 统一收件箱 + P5 知识卡片收集盒 | M | inbox_items 表 + Ctrl+Shift+B 剪贴板收藏 + 合并 inspirations/imports 视图；**依赖 G7 快捷键框架** |
| usePomodoroStore 拆分（工程项，无矩阵编号） | M | slice 化（参考 feynman 三 slice 模式），为休息阶段功能（T4/M3/M4）腾出安全空间 |

#### B. 闭环收尾（每项 S 级）

| 项目 | 内容 |
|------|------|
| D5 | 热力图效率维度 + 黄金时段标注 |
| F3 | 气泡 CTA 拉起睡前5卡迷你复习 |
| N5 | 闪卡生成只取核心层文本 |
| T4 | 孵化休息嵌入3分钟呼吸引导（复用 RitualStepBreathing） |
| E2 | 音频持久化 |
| N2 | 答后 diff 高亮 |
| R9 | 成就扩至12个 + window.print 证书 |
| R3 | closingCeremony 结束仪式（复用 useRitualMachine / ritual 组件） |

### P2 — 体验增强（约38项，M 级为主；新表统一只进 SQLite schema v9/v10，Dexie 冻结）

| 批次 | 项目 |
|------|------|
| 仪表板叙事批 | D1 周成长故事面板｜D3 认知卸载中心（纯本地规则起步）｜D4 中断恢复聚合面板（gapDays≥3 组合 useLastSession + MemoryEcho + RecoveryPackPanel）｜S6 认知负荷仪表盘可视化｜S7 学习能量条 UI（纯本地聚合优先）｜S8 热力日历年度视图｜S9 掌握度 L0→L2 钻取 |
| 悬念与仪式批 | D2/R1 suspense_chain（标准6-8文件模式）+ ritualService 结束步 + Sidebar Ghost Tasks 动态化｜R4 curiosity_chain AI 文案｜A4/P6 实施意图条件触发第三类 + AI 优化建议｜R5 考前心理预演｜R2 睡前仪式完整版（**新端点两必检：注册顺序+limits/fallback**） |
| 课堂实时批 | M1 课中预测弹幕 + M2 时间轴锚点（同批共享 ASR 管线）+ P8 时光轴回放 UI（**必须防抖与背压，音频采集竞态前科 ADR-001**）｜N3 笔记健康度 AI 维度（课堂转录逐字抄录率+关键词覆盖率，共享 ASR 管线）；P7 课前微预习课表自动触发暂缓（复审条件：课表数据源接入后评估） |
| 休息内容框架批（新增，依赖 P1 usePomodoroStore 拆分） | M3 具身休息引导（本地内容库起步）｜M4 清醒期记忆重放（先本地轻版，AI 重放编排暂缓，复审条件：progress_narrative 前端接线验证后） |
| AI 欠账清理批（投入产出比最高） | R7 progress_narrative 前端接线｜F1 card_gen 前端接线与变体分组（含 flashcards.type CHECK 扩展评估）｜S5 错题模式猎手完整版（error_pattern 前端接线，含 F2 黄金错误周报）｜S10 错误概念博物馆展示层｜I6 苏格拉底 mirror 模式 + I1 AI student 模式｜I7 出题工坊考试模式｜SOP-3 滚书背诵法（纯客户端斐波那契间隔）｜E3 跨会话概念网络 AI 关系推断（新 concept_relation_chain，标准6-8文件模式）｜G3 自适应挑战阶梯（FSRS-5 stability/difficulty 纯本地起步） |
| 环境与认知批 | W1 氛围专注空间5预设（勿新增常驻3D负载）｜P3 渐进式 UI 三级解锁｜W8 自适应排版｜W3 数字养生守门人｜G6 知识折纸｜G5 多感官复习（阅读+听力双模式起步）｜W5 声音记忆锚点（轻版，复用 TTS+音景，与 T2 文本锚点勿混淆） |
| 数据沉淀批 | R8 知识时光胶囊｜S2 学习决策日志｜S11 AI 学习日志（新表统一只进 SQLite schema v9/v10 + ALLOWED_TABLES） |

### P3 — 高耦合高风险后置（约33项，L 级单独立项）

| 序号 | 项目 | 关键约束 |
|------|------|----------|
| 1 | 3D 重量级：K1 三维知识脑图全量版 / K3 记忆宫殿构建器 / G1 专注花园陆上 3D | LOD + InstancedMesh + 视锥剔除，沿用星座双轨；严守 R3F 三陷阱 |
| 2 | 社交协作5项：C1 协作深潜 / C2 番茄钟协作接力 / C3 学习社交镜像 / C6 协作知识维基 / W4 虚拟自习室 | sync-service WS 协议扩展（房间/presence），`websocket.go` + `auth.go` 安全审查 |
| 3 | 跨设备接力 / 协作维基：P2 跨设备学习接力 / C6 CRDT 维基层 | PWA 接力协议 + CRDT 维基层 |
| 4 | P1 插件市场 | Electron 沙箱 + IPC 安全边界重设计 |
| 5 | 长尾：SOP-2 SOP 流程视图（依赖 SOP-1，复用 @xyflow/react）/ K2 知识地铁图 / K4 知识进化树 / K5 知识信息图（infographic_chain）/ I3 AI 学习教练 Workflow / I2 AI 辩论对手（debate_chain）/ I4 反直觉发现器（counterintuitive_chain）/ I5 概念拟人化（personify_chain）/ I8 个性化记忆术（mnemonic_chain）/ I9 AI 播客（podcast_chain）/ R6 学习俳句（haiku_chain）/ S1 学习时光机 / S3 学习回放器 / S4 知识版本控制 / C4 知识编译引擎（compile_chain）/ C5 微学习卡片流（micro_card_chain）/ W2 心流音乐引擎 / W6 概念具身化（embodied_chain，依赖 M3）/ W7 电子墨水副窗 / W9 专注守护灵补全（L3/L4 干预）/ W10 生物反馈二期 / G3 自适应挑战阶梯完整版（布鲁姆层次）/ G4 知识保鲜系统（freshness_chain）/ G2 知识料理书（依赖 SOP-1） | 每条新 chain 均已在第 3 节事实 4 清单中，走标准6-8文件模式；数据累积型（S1/S3/S4）依赖 operation_log/知识快照先行积累 |

> **归宿校验**：矩阵全部 77 个非 ✅ 项均已落位——P1 承接非 ✅ 项 8 个：P1-A 4 个（SOP-1/G7/P4/P5）+ P1-B 4 个（D5/T4/R9/R3），另含 ✅ 项缺口收尾 4 个（F3/E2/N2/N5）；F1 转 🟡 后归入 P2 AI 欠账清理批，F5 已闭环不再占项；P2 约 38 项；P3 约 33 项（G3/C6 等部分项在 P2/P3 分阶段出现）。✅ 项实质缺口（N5 折叠渲染、R4 curiosity_chain、A4/P6 条件触发、S8 年度视图、F2 周报、T2/P7 暂缓）均已在缺口列标注归宿或暂缓。

---

## 6. AI 依赖统一策略

1. **标准触点**：新 chain 走标准 6-8 文件模式，互不耦合可并行。
2. **本地优先纪律**：每条 chain 必须有离线降级形态（模板兜底/本地 Ollama），前端统一走 `useAIFeature`。
3. **配额瓶颈**：日配额 daily_total=50 共享瓶颈，P2 批量上 chain 前评估配额再分配。
4. **回归基线**：改既有 chain prompt 必须跑 `python -m pytest tests/ -q`（133 用例基线）。

---

## 7. 风险登记册

| # | 风险点 | 说明 | 缓解措施 |
|---|--------|------|----------|
| 1 | `client/electron/preload.ts` / `main.ts` | IPC 安全边界，三份白名单是唯一访问面 | 新通道沿用冒号命名风格、专项安全审查 |
| 2 | `server/ai-gateway/main.py` | 路由注册顺序陷阱（通配遮蔽） | 新增 chain 做成 checklist（注册顺序+limits+fallback 三必检） |
| 3 | `schema.ts`（SQLite v8）+ Dexie `database.ts` | 双轨迁移兼容 | **新表只进 SQLite**：幂等条件迁移 + ALLOWED_TABLES 登记；Dexie 冻结不再加表（对齐 FEAT-052 统一迁移）、版本只增不改、keban 库名永久豁免 |
| 4 | `usePomodoroStore.ts`（784行） | 休息阶段功能聚集点 | P1 先行 slice 化拆分 |
| 5 | `useClassroomAudio.ts` | M1/M2 接入点，音频环回+ASR 竞态历史踩坑 | 防抖+背压控制+遵循 ADR-001 |
| 6 | `server/ai-gateway/config/`（limits / fallback / providers） | 新 chain 必改，配额共享与降级链正确性 | limits + fallback 纳入“新端点必检”checklist，合入前跑 133 用例基线 |

> **另注**：AI 网关日配额为新 chain 共享瓶颈；多个现有大文件（useNoteStore 454 / useStudySessionStore 454）存在 300 行规范欠账，新增功能不得继续堆入。

---

## 8. 工程护栏

- **单文件 ≤300 行**（AI 编程规范 §1）。
- 全部源码文件需含 **`@ai-context` 中英双语注释**（§3）。
- **AI 功能必须支持离线降级**（本地优先原则）。
- 提交信息遵循 **Conventional Commits** 规范。
- **AGENTS.md 敏感文件清单额外审查**：`client/electron/main.ts` / `preload.ts` / `client/electron/ai/` / `server/ai-gateway/config/` / 两处 auth 中间件（ai-gateway 与 sync-service）/ `docker-compose.prod.yml` / `electron-builder.yml` / `.github/workflows/`。
- **keban_\* 数据标识永久豁免重命名**（keban 库名 / keban_device_id / keban_crypto_salt），保证跨版本数据兼容。

---

## 9. 被否决的替代方案

| 替代方案 | 否决理由 |
|----------|----------|
| 按分类顺序线性实施 | SOP 是公共依赖但排在第八，会造成返工；改**地基优先** |
| 社交协作与 3D 重量级进 P1/P2 | 协议改动与渲染稳定性预算风险收益差；后置 P3 单独立项 |
| AI chain 全部先行 | 存在后端先行前端欠账教训；改**按功能闭环整批交付** |
| 直接在 usePomodoroStore 堆叠 | 已超标（784行），**先拆分** |
