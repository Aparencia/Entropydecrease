# 技术债清单（权威：2026-08-19，四轮滚动——ADR-011 实施 + 新增代码审查后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：三轮清单滚动——TD-040 维持 carried（deliberate 有意不修）。
> 四轮滚动（ADR-011 实施交付 + 新增代码审查，REQ-086/087）：
> 发现 2 项问题全部当日修复（提交 8aab331，见下）。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期由 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。四次核对（2026-08-19）：ADR-011 代码未涉模型分发/捆绑，维持 carried |

## 今日已偿（审查发现即修复，全部可经代码核验）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 R11） | `latest_frame` 缓存按原始 region 判定——带外强制全帧（force_full）时本 tick 实为全帧数据却跳过缓存，截图命令读到旧帧（medium-low） | 缓存判断移至最终 region 决定之后（force_full 时缓存全帧）；审查修复提交 8aab331 |
| （审查 R12） | 文档状态同步遗漏——需求池 REQ-086/087 仍"已排期"、v0.6.0.md 未标注 ADR-011 实施、规格 §5 承诺的集成测试 8/9/10 未落地（low） | 需求池转"已实施"；v0.6.0 状态行补充 REQ-086/087；规格 §5 注明编排层依赖 COM 采样器无法单测、逻辑内核已由 grid_diff_tests 覆盖、端到端语义由 M4 真机验收覆盖；审查修复提交 8aab331 |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
