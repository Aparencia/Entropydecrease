# 归档索引：2026-08-20（v0.7.2 课堂助手深化批次 + v0.7.3 屏卡体系设计/实施 + 归档）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**本日归档 1 份**（设计规格实施落地，生命终态）：

| 文档 | 归档原因 |
|------|---------|
| `brainstorming-ocr-screen-cards.md` | v0.7.3 屏卡体系设计规格——M1-M5 全量代码建设完成（1053 单测全绿 + 前端构建通过），已落地实施；活跃区索引已标注 [ ] 已归档（v0.7.3.md / requirements-pool.md / ADR-015） |

**不归档（持续活跃）**：

| 文档 | 不归档原因 |
|------|-----------|
| `docs/versions/v0.7.2.md` / `docs/versions/v0.7.3.md` | versions/ 内容（规则明确不归档，持续活跃） |
| `docs/adr/ADR-015-screen-cards-ocr.md` | 当前生效 ADR（规则明确不归档） |
| `docs/Foresight/brainstorming-video-profile-detection.md` | 部分已立项（合集/自适应已实施）但检测准确度整体仍搁置待议——活跃 |
| `docs/Foresight/video-data-extraction-inventory.md` | 部分已立项（说话人/信息面板已实施）其余待裁决——活跃 |
| `docs/product/classroom-assistant-guide.md` | 课堂助手使用说明——持续维护的活跃文档 |
| `docs/product/requirements-pool.md` | 需求池——持续活跃 |

## 本批工作摘要（2026-08-20，v0.7.3 屏卡体系批次）

- **v0.7.2 四深化落地**（REQ-148~154）：三连体验/采集信息面板/合集联动/语速停顿自适应/说话人分离弱化版，1016 单测全绿，提交 9097e8f~5159bee
- **v0.7.3 画面要点屏卡体系**（REQ-155~161 + ADR-015）：会话29 实证 → 头脑风暴裁决（路线 A+B+D，屏段落+配图）→ 设计规格 + ADR + 需求登记（1545bea）→ 全量代码建设 M1-M5（屏聚合纯函数/bbox+screen_id 落库/在线屏分配/采集治理/消费端屏卡流+笔记屏段落配图/大纲检索按屏/结构识别接线，1536222~df8d3be，1053 单测全绿 + clippy 新代码零警告 + 前端构建通过）
- **新增代码七维审查**（提交 3ed0973）：R6 AI 复核配图口径（双出口一致）、R7 图匹配单次扫描；三处低项注释加固（grouped 不变量/line_merge 混合顺序/is_cjk 收窄可见性）；接入/逻辑/牵连/性能/冗余/提交规范/安全七维检查通过项见审查输出

## 技术债摘要

- **未偿 5 笔**（全部 carried，与昨日一致）：TD-040（deliberate）+ TD-2026-08-19-D~G（4 笔）
- **今日已偿 2 笔**（审查即修，3ed0973：R6/R7）
- **新增观察项 0 条**（审查低项已注释加固，不立债）

## 关联

- 版本与需求：[v0.7.2 版本文档](../../versions/v0.7.2.md) · [v0.7.3 版本文档](../../versions/v0.7.3.md) · [需求池 REQ-148~161](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
