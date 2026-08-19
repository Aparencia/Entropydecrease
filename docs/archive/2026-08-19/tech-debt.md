# 技术债清单（权威：2026-08-19，五轮滚动——ADR-012 实施 + 新增代码审查后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：四轮清单滚动——TD-040 维持 carried（deliberate 有意不修）。
> 五轮滚动（ADR-012 流式 ASR 质量修复实施交付 + 新增代码审查）：
> 发现 4 项问题全部当日修复（提交 e41f6cc，见下）。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期由 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。五次核对（2026-08-19）：ADR-012 代码未涉模型分发/捆绑，维持 carried |

## 今日已偿（审查发现即修复，全部可经代码核验）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 L1） | streaming_asr.rs 残留重复注释（re-export 行上方旧注释未删净）（low） | 删除残留注释；审查修复提交 e41f6cc |
| （审查 L2） | asr_forensic.rs `BLOCK_MS` 常量未使用（clippy dead_code）（low） | 删除未用常量；审查修复提交 e41f6cc |
| （审查 L3） | streaming_asr.rs 320 行超 300 行上限未登记豁免（ADR-012 增长 288→320）（low） | line-limit-exemptions.md 补登记（豁免理由 + 拆分计划）；审查修复提交 e41f6cc |
| （审查 L4） | live_session.rs 豁免登记行数过期（登记 ~351，实际 600，近 600 硬拆红线）（medium-low） | 豁免登记更新至 ~600 + 拆分计划明确化（live_session_fusion.rs / live_session_loop.rs）；审查修复提交 e41f6cc |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
