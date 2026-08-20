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

## 本批工作摘要（2026-08-20 五轮，技术债偿还批次）

- **技术债偿还 7 笔全清**（提交 0336b51/1a88581/5969f55）：TD-A 会话转笔记三命令迁 spawn_blocking（千段长会话不再阻塞 IPC）；TD-D 说话人模型应用内一键下载（speaker_download.rs 双镜像/.part 原子写/进度事件 + SpeakerSwitchCard 下载按钮）；TD-E/F 就绪清单补说话人/标点模型（health_status 增查 + ReadyCheckCard 两项）；TD-G 备份/恢复 UI（BackupPanel，REQ-107 TRUST-1 可达化）；TD-H 音频落盘管理面板（AudioStoragePanel，REQ-068 承诺兑现）；TD-I 目标窗口丢失横幅（live:window-lost 监听 + 可关闭）
- **台账 open 归零**：五轮核验 7 笔全部 closed（注明提交哈希）；carried 4 笔保持（TD-040 deliberate + TD-2026-08-19-D/F/G）；观察项 8 条保持（观察 1 处置更新：拷贝已随 TD-A 移出 IPC 线程）
- 验证：1176 单测全绿 + 前端构建通过

## 技术债摘要

- **未偿 4 笔**（全部 carried，五轮核验保持）：TD-040（deliberate）+ TD-2026-08-19-D/F/G
- **今日已偿 23 笔**：二轮 6 笔（H1/H2/M1/M2/L1/L2）+ TD-B/TD-C/TD-E + 三轮审查 9 笔（R1~R9）+ 盘点即修 S1 + **五轮偿还批次 7 笔（TD-A/D/E/F/G/H/I）**
- **新登记 open 0 笔**（台账 open 归零）+ 观察项 8 条

## 关联

- 版本与需求：[v0.7.7 版本文档](../../versions/v0.7.7.md) · [v0.7.6 版本文档](../../versions/v0.7.6.md) · [需求池 REQ-162~187](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
