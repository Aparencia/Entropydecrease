# 2026-08-19 归档索引

> 当日工作：结构模型版落地（版面/表格/公式模型引入 + 按需下载 + 课后精修，REQ-047/049/050 模型版）
> + 新增代码审查（H1-H3/M1/M2/M4/L1/L3 当日全部修复，提交 c5eae08 + 65c950a）+ 文档归档。

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/brainstorming-video-types.md | docs/archive/2026-08-19/brainstorming-video-types.md | [ ] 已归档（六轮头脑风暴已全部落地——五类视频档案 REQ-043/044/045/046/047/048/049/050/051/052/055 均已实施；结论进入 v0.5.0 规划并实施完成，生命周期终结） |
| docs/Foresight/brainstorming-classroom-assistant-gaps.md | docs/archive/2026-08-19/brainstorming-classroom-assistant-gaps.md | [ ] 已归档（四维缺口评估 50 项：§9 裁决 22 项已排期 v0.6.0（REQ-059~080，登记于需求池与 v0.6.0 规划）；未选与远期项保留于归档副本待议，决策生命周期终结） |

- **未归档**：ADR-010（补缝式 AI 决策，当前生效——V1.0 云端实装继续引用）；brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）；brainstorming-classroom-assistant-mechanisms.md + fed-guide（v0.5.0/v0.6.0 机制编号 E9/B6/C1/Q1/AL4 等仍在引用，供后续头脑风暴输入）；versions/、standards/、product/ 内容（持续活跃）

## 技术债摘要（滚动自 2026-08-18 清单）

- **未偿 1 笔**：TD-040（P2，deliberate carried——ffmpeg 捆绑与安装包体积权衡，保持观察）
- **今日已偿 8 笔**（审查发现即修复，提交 c5eae08 + 65c950a + 0197560）：
  - H1 精修裁剪图路径错误（critical）——注入会话图片库绝对目录
  - H2 同帧双写覆盖（high）——crop/ 命名空间隔离 + 回归测试
  - H3 公式高精度档切换失效（high）——structure_tier 档位持久化 + 装配路径跟随
  - M1 下载无 Content-Length 校验（medium）——截断下载不再静默成功
  - M2 running 标记 spawn 失败残留（medium）——失败分支清理
  - M3 精修候选匹配不可靠（medium）——best_table bbox 面积选择 + 降级提示对齐
  - M4 精修 N 次全量回填（medium）——单次 replace_artifact
  - L1/L3 前端进度/豁免清单（low）——progress 监听 + 豁免补登
- 累计已偿：昨日 45 笔 + 今日 8 笔 = 53 笔
- **归档日追加**（缺口评估文档归档）：纯文档变更，无新增技术债；TD-040 维持 carried（唯一权威清单见 tech-debt.md）

## 备注

- 归档采用 `git mv`（保留历史链）；活跃区引用已更新（Foresight README 索引改指归档路径 + v0.6.0 规划链接同步）
- 下个归档日需先整理本清单（当前仅 TD-040 carried）

---

## 二轮归档（同日，v0.6.0 M1 提取纯度交付 + 新增代码审查 + 市场调研归档）

> v0.6.0 M1（REQ-059/060/061/082/083/084/085）代码交付完成（8 个提交 cecf9f6..9fa8931）+
> 新增代码审查（七维检查）产出 4 项问题全部即修（提交 463dbf4）+
> 市场技术栈调研文档归档（技术栈 2026-08 已裁决，使命终结）。

### 归档清单（二轮）

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/market-stack-asr-notes-research.md | docs/archive/2026-08-19/market-stack-asr-notes-research.md | [ ] 已归档（市场技术栈/ASR/笔记生成调研：2026-08 支撑 Tauri 技术栈裁决，选型已固化于 AGENTS.md §2 与 product/README.md，调研使命生命终态；活跃区链接已改指归档路径） |

- **未归档**：brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）、brainstorming-classroom-assistant-mechanisms.md + fed-guide（后续头脑风暴输入）、versions/、standards/、product/ 内容（持续活跃，多轮先例）

### 技术债摘要（二轮滚动）

- **未偿 1 笔**：TD-040（P2，deliberate carried——M1 代码未涉模型分发/捆绑，二次核对维持观察）
- **今日追加已偿 4 笔**（M1 新增代码审查即修，提交 463dbf4）：
  - R1 AI merge 目标丢失错拼无关段（medium）——保守恢复原段 + 回归测试
  - R2 复核命令未拦截 recording 会话（medium）——与 preview 口径一致
  - R3 复核缓存键不含上下文（low）——键纳入全送审内容
  - R4 符号规则逐段重复排序（low）——排序移至构造期
- 累计已偿：53 + 4 = 57 笔
