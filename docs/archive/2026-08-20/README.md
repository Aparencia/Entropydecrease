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

## 本批工作摘要（2026-08-20 三轮，v0.7.7 结构图批次）

- **v0.7.7 结构图捕获持久化实施**（REQ-182~187，提交 1629ea0/5bb9c3a/0ca4fbe/b13ead0/5147d85/a399365）：原子层 diagram_likeness/pick_sharpest（长直线+密度+面积+形状约束启发式）→ 业务层 struct/ 命名空间独立预算 + session_structure_images 新表 + 批量捕获管线（屏内选优帧→版面→过滤→裁剪→入库，幂等去重）→ 系统层四命令 + 停止后自动捕获 → 前端屏卡框选（BoxSelectOverlay 确认浮层）/ 图库区段 / 大图预览 / 会话列表全选框；1172 单测全绿（v0.7.7 增 34）+ 前端构建通过；实现校准：真实流程图被判 Text——Text 同过图结构门控 + 形状约束防标题误收（规格同步更新）
- **技术债清偿 3 笔**：TD-B 术语锚点词边界+大小写折叠（1b24168）、TD-C list_events 失败留日志（f8be4d3）、TD-E 前端接入图搜/磁盘面板（5147d85）
- **新增代码三轮审查即修 9 项**（提交 bca36da）：R1 预算/错误区分（Err(_) 吞所有错误误判预算耗尽）、R2 删除顺序（先文件后记录防孤儿文件）、R3 屏定位 first_seen_ms（聚类屏号不唯一错屏）、R4 框选单击误触全屏、R5 错误消息误导、R6 rgb_to_bgra 重复、R7 拖出残留框、R8 非错误信息用 error 态、R9 测试冗余行；接入/逻辑/牵连/性能/冗余/提交规范/安全七维检查通过项见审查输出
- **v0.7.8 规划**：无（下一规划为 v0.8.0 AI 精修，REQ-138~147 已排期，见 [v0.8.0 版本文档](../../versions/v0.8.0.md)）

## 技术债摘要

- **未偿 4 笔**（全部 carried，压缩一行摘要）：TD-040（deliberate）+ TD-2026-08-19-D/F/G
- **今日已偿 15 笔**：二轮 6 笔（H1/H2/M1/M2/L1/L2）+ TD-B/TD-C/TD-E + 三轮审查 9 笔（R1~R9，详见 [tech-debt.md](./tech-debt.md)）
- **新登记 open 1 笔**（TD-2026-08-20-A：async 命令主体同步执行 spawn_blocking 改造；TD-B/C 已偿关闭）+ 观察项 3 条

## 关联

- 版本与需求：[v0.7.7 版本文档](../../versions/v0.7.7.md) · [v0.7.6 版本文档](../../versions/v0.7.6.md) · [需求池 REQ-162~187](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
