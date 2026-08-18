# 2026-08-19 归档索引

> 当日工作：结构模型版落地（版面/表格/公式模型引入 + 按需下载 + 课后精修，REQ-047/049/050 模型版）
> + 新增代码审查（H1-H3/M1/M2/M4/L1/L3 当日全部修复，提交 c5eae08 + 65c950a）+ 文档归档。

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|---------|------|
| docs/Foresight/brainstorming-video-types.md | docs/archive/2026-08-19/brainstorming-video-types.md | [ ] 已归档（六轮头脑风暴已全部落地——五类视频档案 REQ-043/044/045/046/047/048/049/050/051/052/055 均已实施；结论进入 v0.5.0 规划并实施完成，生命周期终结） |

- **未归档**：ADR-010（补缝式 AI 决策，当前生效——V1.0 云端实装继续引用）；brainstorming-no-cloud-ai-extraction-limit.md（V1.0 规划持续引用）；brainstorming-classroom-assistant-mechanisms.md（v0.5.0 机制编号 E9/B6/C1 等仍在引用）；versions/、standards/、product/ 内容（持续活跃）

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

## 备注

- 归档采用 `git mv`（保留历史链）；活跃区引用已更新（见版本文档链接修改）
- 下个归档日需先整理本清单（当前仅 TD-040 carried）
