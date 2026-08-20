# 归档索引：2026-08-20（v0.7.2 深化 + v0.7.3 屏卡 + v0.7.5 净化 + v0.7.6 结构渲染 批次）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**一轮归档 2 份**（设计规格实施落地，生命终态）：

| 文档 | 归档原因 |
|------|---------|
| `brainstorming-ocr-screen-cards.md` | v0.7.3 屏卡体系设计规格——M1-M5 全量代码建设完成（1053 单测全绿 + 前端构建通过），已落地实施；活跃区索引已标注 [ ] 已归档（v0.7.3.md / requirements-pool.md / ADR-015） |
| `brainstorming-session-note-rules.md` | v0.7.5 会话转笔记规则优化设计规格——净化快赢批 12 项 + 停止残留修复 3 项已登记 REQ-162~176 并排期 v0.7.5（结构组织暂不实施，与 v0.8.0 AI 精修衔接）；活跃区索引已标注 [ ] 已归档（v0.7.5.md / requirements-pool.md） |

**二轮归档 0 份**（v0.7.5/v0.7.6 批次核验——无新增生命终态文档）：

| 候选文档 | 不归档原因 |
|------|-----------|
| `docs/versions/v0.7.5.md` / `docs/versions/v0.7.6.md` | versions/ 内容（规则明确不归档，持续活跃——v0.7.6 规划与实施记录均在其中） |
| `docs/Foresight/brainstorming-video-profile-detection.md` | 部分已立项（合集/自适应已实施）但检测准确度整体仍搁置待议——活跃 |
| `docs/Foresight/video-data-extraction-inventory.md` | 部分已立项（说话人/信息面板已实施）其余待裁决——活跃 |
| `docs/Foresight/brainstorming-classroom-assistant-mechanisms.md`（含 fed-guide） | 机制摘要投喂文档——供其他 AI 模型头脑风暴输入，持续活跃 |
| `docs/Foresight/brainstorming-no-cloud-ai-extraction-limit.md` | 前瞻构想（未排期）——活跃 |
| `docs/Foresight/brainstorming-structure-images-v0.7.7.md` | v0.7.7 结构图捕获持久化头脑风暴（2026-08-20 登记 REQ-182~187，规划中未实施）——活跃 |

## 本批工作摘要（2026-08-20 二轮，v0.7.5/v0.7.6 批次）

- **v0.7.5 会话转笔记规则净化**（REQ-162~176，提交 0834b38/37ce5c1/14d4843/f2efab9）：停止状态残留根治 + 图片时间戳数值排序 + 过渡句/修辞问句规则净化 + 会话转笔记净化优化（净化链 12 项 + 停止残留修复 3 项）
- **v0.7.6 笔记纯本地结构渲染**（REQ-177~181，提交 974343b 规划 + 4edb5db 实施）：章节边界 → `## 章节 N [MM:SS]` 标题层级（outline 窗口命名）+ 术语表 `## 词汇表` 块（score 降序/锚点回跳/上限防噪音）+ NoteStructureConfig 嵌套 JSON 可校准 + StructureStats 并入 purify_stats（RULE_VERSION → note-rules-0.7.6）；1131 单测全绿（v0.7.6 增 17：structure_note 15 + 黄金 2）+ clippy 新代码零警告
- **v0.7.7 结构图捕获持久化规划**（REQ-182~187 登记，提交 843bfce）：头脑风暴文档入 Foresight（规划中，活跃不归档）
- **新增代码七维审查即修**（提交 4dbafdf + 84c867f + fb40c1e）：H1 AI 复核出口补结构渲染（REQ-081 三出口一致）、H2 commands_session 611 行 >600 硬拆（笔记管线 → commands_session_note.rs 240 行）、M1 glossary_max_terms=0 语义、M2 零回归黄金测试补测、L1 死代码 helpers 清理、L2 行数豁免登记同步、L3 mod 字母序；1133 单测全绿（审查增 2）+ clippy 新代码零警告；接入/逻辑/牵连/性能/冗余/提交规范/安全七维检查通过项见审查输出

## 技术债摘要

- **未偿 5 笔**（全部 carried，与一轮一致）：TD-040（deliberate）+ TD-2026-08-19-D~G（4 笔）
- **今日已偿 6 笔**（二轮审查即修）：H1/H2/M1/M2/L1/L2（详见 [tech-debt.md](./tech-debt.md)）
- **新登记 open 3 笔**（TD-2026-08-20-A/B/C：async 阻塞改造/锚点子串匹配/静默错误日志）+ 观察项 3 条

## 关联

- 版本与需求：[v0.7.5 版本文档](../../versions/v0.7.5.md) · [v0.7.6 版本文档](../../versions/v0.7.6.md) · [需求池 REQ-162~181](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
