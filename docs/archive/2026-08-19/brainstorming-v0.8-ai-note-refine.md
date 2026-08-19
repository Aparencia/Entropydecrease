# 头脑风暴记录：v0.8.0 AI 接入范围与机制（AI 精修 / 知识补充 / 信任基建）

## 基本信息

| 字段 | 内容 |
|------|------|
| 主题 | v0.8.0 版本规划：AI 接入（SiliconFlow）——会话→笔记精修 + 知识补充 + 余额查询 + 信任基建；及"AI 之外"的其他方向 |
| 日期 | 2026-08-19 |
| 参与者 | 用户 + AI 代理（对话式多轮） |
| 目标 | 收敛 v0.8.0 范围：核心 AI 线 + 非 AI 方向筛选 + 精修/补充机制设计 |

---

## 1. 问题定义

### 核心问题
0.8.0 核心目标已定（SiliconFlow AI 接入：会话→笔记的 ASR 结果处理 + 余额查询），但"只做这一条线是否完整、还缺什么"未收敛——尤其是：非 AI 能力方向（验收/测试/信任基建等）哪些该进 0.8.0；AI 精修与知识补充的机制（触发/协议/落位/信任/成本/降级/版本）如何设计。

### 关键现状（决定思考框架）
- **AI 管道已存在**：REQ-085（v0.6.0）已交付 SiliconFlow 适配器（ai_text_filter.rs）、护栏（ai_guardrails.rs：配额/缓存/审计）、协议（ai_protocol.rs）、提示词模板（prompts/text_filter.json）、mock（ai_mock.rs）——0.8.0 是"把 AI 从实验开关变成用户功能"，不是从零铺管道
- **验收欠账**：v0.5.0 M9 / v0.6.0 M7 / v0.7.0 M4 / v0.7.1 均"开发完成待真机验收"
- **前端测试欠账**：v0.7.1 明言"无 Vitest 基建"
- **密钥现状**：仅环境变量注入（开发者视角），终端用户无入口
- **红线**：AGENTS.md——AI 调用须用户授权且默认关闭；数据不出本机；云端能力必须有本地兜底；明文存储敏感数据禁止

### 约束条件
- 本地优先 + AI 为增强层；用户自带 SiliconFlow key（按量付费）
- 范围纪律：0.8.0 只做"会话→笔记"一条 AI 线，不做"AI 能力铺开"
- Windows 桌面（Tauri 2 + Rust + React）

### 成功标准
v0.8.0 规划文档产出：范围明确（含非 AI 方向裁决）、机制可执行（协议/落位/成本/版本）、需求可追溯（REQ 编号）、无重大 UX 遗漏。

---

## 2. 发散阶段

### 非 AI 方向候选（用户要求：除"在其他地方接入 AI 能力"外还考虑什么）

| # | 方向 | 内容 | 归属轴 |
|---|------|------|--------|
| 1 | 密钥管理 UI + 安全存储 | 设置面板输入；Windows Credential Manager；掩码/验证 | AI 使能层 |
| 2 | 余额查询与展示 | user/balance 端点；设置页卡片；低余额提醒 | AI 使能层 |
| 3 | 授权与隐私红线 | 全局开关默认关；上传说明；审计可见化 | AI 使能层 |
| 4 | 成本可见性 | 预估/确认/拦截/引导；成本落库 | AI 使能层 |
| 5 | Provider/模型抽象 | 共享 AI client；模型/端点可配 | AI 使能层 |
| 6 | Prompt 资产治理 | 按档案模板；golden 回归防漂移 | AI 使能层 |
| 7 | 对比预览确认流 | 本地版 vs AI 版 diff → 确认 → 落库 | 信任与质量 |
| 8 | 质量基准 | golden 会话集评估 | 信任与质量 |
| 9 | 溯源与可重算 | source 标记；原料层不动 | 信任与质量 |
| 10 | **多版本真机验收总清** | 四版本验收 + 缺陷清零（M0 前置） | 验收与基线 |
| 11 | 前端测试基建 | Vitest；AI 契约测试 | 验收与基线 |
| 12 | 技术债顺手项 | X-O5 等低成本项 | 验收与基线 |
| 13 | 转化历史/版本对比 | v0.7.1 后续批次 | 体验闭环 |
| 14 | 设置中心 | AI 相关设置集中页 | 体验闭环 |
| 15 | 逐会话成本报表 | 用量视图 | 体验闭环 |
| 16 | 其他 AI 能力 | 问答/补缝 VLM/闪卡/周报 | **明确排除** |

### 市场调研（AI 接入后的 UX 实践）

- **通义听悟**（[36氪AI测评](https://36aidianping.com/note-detail/3568010593716913) / [量子位](https://www.qbitai.com/2023/06/57811.html)）：转写 → 总结/笔记异步生成（生成中→完成卡片）、AI 问答、导出；按量/会员计费模式
- **Otter/Fireflies/Fathom 系**（[DEV 对比](https://dev.to/pirateprentice/ai-meeting-notes-for-bookkeepers-in-2026-fireflies-vs-otter-vs-fathom-honest-comparison-4oc5)）：AI 摘要/行动项为标配，价值在于"省时间"而非"转写准确"
- **Notion AI**：内联流式生成 + Esc 停止 + 撤销（生成过程交互范式）
- **NotebookLM**（[信任问题讨论](https://www.remio.ai/post/notebooklm-gains-attention-as-research-speed-outruns-trust)）：citation 引用机制——AI 输出可追溯到源是信任核心；[Radar](https://radar.zurb.com/article/your-ai-feature-works-nobody-can-tell-if-its-lying)：AI 功能"能用但不可验证"是最大信任缺口
- **模式库**：[llm-ux-patterns](https://github.com/arablex/llm-ux-patterns)（streaming / citations / token-cost transparency / quota fallback / evals / empty states）；[Ant Design X 确认生成过程](http://ant-design-x.antgroup.com/docs/spec/confirm-generation-process)；[Frontend Patterns AI 响应状态](https://frontendpatterns.dev/guides/managing-ai-response-states)

### 市场调研 → 发现的 5 项 UX 遗漏（对照初始范围）

| # | 遗漏 | 市场依据 | 0.8.0 落法 |
|---|------|---------|-----------|
| U1 | 生成过程交互形态（异步任务化） | 通义听悟/Notion 均异步；同步阻塞=卡死体验 | 任务状态机 + 切片进度 + 完成通知 + 失败保留重试（REQ-145） |
| U2 | AI 内容可验证性（溯源标注） | NotebookLM citation；Radar 信任缺口 | 深度块锚点溯源 + hover 引用原句（REQ-142） |
| U3 | 成本透明前置拦截链 | llm-ux-patterns token-cost transparency + quota fallback | 预估确认 + 弹窗内联余额 + 余额不足拦截引导（REQ-143） |
| U4 | 空态与引导（onboarding） | llm-ux-patterns empty states | 无密钥/未授权空态引导 + 一键连通性验证（REQ-138/140） |
| U5 | 降级不可静默 | quota fallback | 失败原因四类提示 + 纯规则输出不丢不假（REQ-141/145） |

---

## 3. 收敛阶段（用户裁决）

### 范围裁决链
1. **范围哲学**：窄而深——AI 线全闭环 + 验收总清（排除：共享 client 平台化/prompt 治理全量/质量基准完整集/前端测试全量/逐会话报表/技术债顺手项）
2. **5 项 UX 遗漏**：全收
3. **精修形态**：本地草稿 + AI 精修（用户补充构想：AI 去非知识内容 + 结构化层级 + 知识补充入口 + git 式版本管理）
4. **补充子项**：深度 D1 概念展开/D2 步骤补全/D3 例子补全 + 广度 B1 前置知识/B2 进阶/B3 横向关联/B4 对比辨析/B5 实践建议/B6 资源推荐——**全收**（B6 加防幻觉约束：仅标题不输出链接）
5. **落位方案**：混合式（深度就近插入 + 广度聚合扩展区）
6. **转笔记模式**：会话转笔记时提供规则/AI 双模式选项（行内一键保持规则效率；批量保持规则）
7. **版本管理**：核心=可回溯能力（快照链 + diff + 回滚 + 时间线；线性历史）
8. **成本机制**：确认弹窗内联显示硅基流动账户余额

### 分类
**立即执行（进 v0.8.0）：** 全部 10 项 REQ（REQ-138~147），见 [v0.8.0 规划](../versions/v0.8.0.md)
**重点规划（后续）：** AI 问答（REQ-024）/ 补缝式 VLM（REQ-056）/ AI 闪卡 / 跨笔记知识检索 / 段落级补充 / 逐会话报表
**暂时搁置：** 前端 Vitest 全量基建 / 共享 AI client 平台化 / prompt 治理全量 / 质量基准完整 golden 集

---

## 4. 行动计划

| 项 | 下一步 | 负责人 | 截止 |
|----|--------|--------|------|
| v0.8.0 规划文档 | 写入 docs/versions/v0.8.0.md + 需求池登记 REQ-138~147 | AI 代理 | 2026-08-19 |
| M0 验收总清 | 用户执行四版本真机验收清单（v0.6.0 M7 + v0.7.x 至少） | 用户 | M0 门禁 |
| 模型选型 spike | 免费档 vs 质量档固定样本对比（精修/补充质量） | 开发 | M2 前 |
| Credential Manager spike | keyring crate 在 Tauri 2 Windows 可用性（失败 DPAPI fallback） | 开发 | M1 前 |

---

## 5. 遗留问题

- 精修/补充默认模型档位（免费档 8B 质量存疑 → 实测定档）
- 切片并发与每日配额计数的并发安全改造
- 版本表全量快照 × 50 版上限的磁盘占用实测
- 广度补充幻觉控制效果（golden 冒烟含广度样本）
- 验收总清体量（用户时间大头）——分批执行策略

---

## 6. 回顾

### 本次头脑风暴效果
- 产出：4 轴 16 项非 AI 方向 + 9 子项补充机制 + 5 项市场 UX 遗漏 + 8 项机制设计（触发/协议/落位/信任/成本/降级/版本/边界）
- 关键转折：REQ-085 已有管道的发现（AI 非从零开始）+ 市场调研的 5 项 UX 遗漏 + 用户的"精修+补充+版本"构想升级

### 改进建议
- 下次版本规划前先查"已有管道/欠账"再发散（本次 REQ-085 发现改变了整个框架）
- 用户构想（补充入口/版本管理）直接并入机制设计，避免"能力 vs 体验"二分
