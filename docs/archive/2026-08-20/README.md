# 归档索引：2026-08-20（v0.7.2 深化 + v0.7.3 屏卡 + v0.7.5 净化 + v0.7.6 结构渲染 + v0.7.7 结构图 批次）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**一轮归档 2 份**（设计规格实施落地，生命终态）：

| 文档 | 归档原因 |
|------|---------|
| `brainstorming-ocr-screen-cards.md` | v0.7.3 屏卡体系设计规格——M1-M5 全量代码建设完成（1053 单测全绿 + 前端构建通过），已落地实施；活跃区索引已标注 [ ] 已归档（v0.7.3.md / requirements-pool.md / ADR-015） |
| `brainstorming-session-note-rules.md` | v0.7.5 会话转笔记规则优化设计规格——净化快赢批 12 项 + 停止残留修复 3 项已登记 REQ-162~176 并排期 v0.7.5（结构组织暂不实施，与 v0.8.0 AI 精修衔接）；活跃区索引已标注 [ ] 已归档（v0.7.5.md / requirements-pool.md） |

**三轮归档 1 份**（v0.7.7 批次：规划中 → 已实施完成，生命终态）：

| 文档 | 归档原因 |
|------|---------|
| `brainstorming-structure-images-v0.7.7.md` | v0.7.7 结构图捕获持久化设计规格——REQ-182~187 代码建设完成（1172 单测全绿 + 前端构建通过 + 三轮审查修复 bca36da），已落地实施；活跃区索引已标注 [ ] 已归档（v0.7.7.md / requirements-pool.md） |

**二轮归档 0 份**（v0.7.5/v0.7.6 批次核验——无新增生命终态文档）：

| 候选文档 | 不归档原因 |
|------|-----------|
| `docs/versions/v0.7.5.md` / `docs/versions/v0.7.6.md` / `docs/versions/v0.7.7.md` | versions/ 内容（规则明确不归档，持续活跃——规划与实施记录均在其中） |
| `docs/Foresight/brainstorming-video-profile-detection.md` | 部分已立项（合集/自适应已实施）但检测准确度整体仍搁置待议——活跃 |
| `docs/Foresight/video-data-extraction-inventory.md` | 部分已立项（说话人/信息面板已实施）其余待裁决——活跃 |
| `docs/Foresight/brainstorming-classroom-assistant-mechanisms.md`（含 fed-guide） | 机制摘要投喂文档——供其他 AI 模型头脑风暴输入，持续活跃 |
| `docs/Foresight/brainstorming-no-cloud-ai-extraction-limit.md` | 前瞻构想（未排期）——活跃 |

## 本批工作摘要（2026-08-20 四轮，模型接入/自动化配置/课堂助手接线盘点）

- **模型接入全景盘点**（只读核验，无代码变更）：ASR 三级（流式 Zipformer 主链路 → SenseVoice 整句重打分 → 标点恢复）+ OCR（PaddleOCR 经 oar-ocr，ModelScope 自动缓存）+ 结构模型三类（应用内一键下载）+ 说话人（wespeaker embedding，脚本下载）+ AI 云端（SiliconFlow 骨架，v0.8.0 排期实装）；分发四路径（捆绑 models/**/* + 流式 hf-mirror 自动下载 + 结构应用内下载 + OCR ModelScope 缓存）；自动化配置：OCR 设备 Auto 微基准决策、档案自动检测+记忆、引擎预热、停止后自动精修+结构图捕获
- **四轮审查**：无新增代码（f9c9638 后零变更）——沿用三轮结论（9 项已修复）
- **盘点发现登记 open 3 笔**：TD-2026-08-20-D（说话人模型无应用内下载）、E（就绪清单不含说话人/标点模型）、F（标点模型缺失静默降级）——详见 [tech-debt.md](./tech-debt.md)

## 技术债摘要

- **未偿 4 笔**（全部 carried，四轮核验保持）：TD-040（deliberate）+ TD-2026-08-19-D/F/G
- **今日已偿 15 笔**（四轮无新增）：二轮 6 笔（H1/H2/M1/M2/L1/L2）+ TD-B/TD-C/TD-E + 三轮审查 9 笔（R1~R9）
- **新登记 open 4 笔**（TD-2026-08-20-A：spawn_blocking 改造；D/E/F：模型接入缺口）+ 观察项 3 条

## 关联

- 版本与需求：[v0.7.7 版本文档](../../versions/v0.7.7.md) · [v0.7.6 版本文档](../../versions/v0.7.6.md) · [需求池 REQ-162~187](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
