# 技术债清单（权威：2026-08-19，八轮滚动——merge-then-split 演进后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：七轮清单滚动——TD-040 维持 carried（deliberate 有意不修）。
> 八轮滚动（merge-then-split 演进：合并后句子切分取代固定次数一刀切，
> 提交 8a4e6c8）：无新增债务；TD-2026-08-19-B 偿还方式演进记录见下。

## 未偿债务

| ID | 摘要 | 备注 |
|----|------|------|
| TD-040 | tauri.conf.json bundle.resources 未含 ffmpeg——生产安装包无捆绑 ffmpeg（v0.3.0 审查，2026-08-18） | carried（deliberate 有意不修）：resources glob 对缺失目录构建失败；捆绑 ffmpeg（~80MB）与安装包体积权衡留待体积策略；开发期由 download-ffmpeg.ps1 + PATH 覆盖（ADR-008 风险项，保持观察）。八次核对（2026-08-19）：F4-1/F4-2/捕获修复/merge-then-split 均未涉模型分发/捆绑，维持 carried |

## 今日已偿（审查发现即修复，全部可经代码核验）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| （审查 L1） | streaming_asr.rs 残留重复注释（re-export 行上方旧注释未删净）（low） | 删除残留注释；审查修复提交 e41f6cc |
| （审查 L2） | asr_forensic.rs `BLOCK_MS` 常量未使用（clippy dead_code）（low） | 删除未用常量；审查修复提交 e41f6cc |
| （审查 L3） | streaming_asr.rs 320 行超 300 行上限未登记豁免（ADR-012 增长 288→320）（low） | line-limit-exemptions.md 补登记（豁免理由 + 拆分计划）；审查修复提交 e41f6cc |
| （审查 L4） | live_session.rs 豁免登记行数过期（登记 ~351，实际 600，近 600 硬拆红线）（medium-low） | 豁免登记更新至 ~600 + 拆分计划明确化（live_session_fusion.rs / live_session_loop.rs）；审查修复提交 e41f6cc |
| （审查 R13） | 区域路径整帧回退以原始块为空判定——低分/垃圾块（播放器时间码等）使整帧兜底失效，误判区域仍可能 0 OCR 产出（medium） | has_useful_blocks 过滤后判定（score ≥0.5 + 非空 + 非 junk）+ 单测；审查修复提交 a2e31b1 |
| （审查 R14） | 标点下载脚本 fp32 兜底文件名 model.onnx 与运行时 model.int8.onnx 约定不符——兜底下载成功但运行时永远加载不到（medium） | 兜底下载后重命名回 model.int8.onnx + Node ≥18 注明；审查修复提交 a2e31b1 |
| （审查 R15） | 裁剪图去重跨命名空间误判（crop ↔ full 同图返回错误路径且不落盘；save_user_screenshot 返回路径暴露前端）（medium-low） | dedupe_hit 命名空间限定（crop//full/）+ 回归测试；审查修复提交 a2e31b1 |
| （审查 R16） | live_session.rs 691 行超 600 硬拆红线（豁免登记过期 + "下轮增长必须拆分"承诺未兑现）（medium） | 豁免登记更新至 ~691 + 拆分计划明确 M7 强制落地；审查修复提交 a2e31b1 |
| （审查 R17） | 行数豁免登记过期批量更新（streaming_asr ~365 / layout_analyzer ~475 / live_frame_process ~491）+ 测试未用变量告警 3 处（low） | 豁免登记批量更新 + 变量下划线；审查修复提交 a2e31b1 |
| （TD-2026-08-19 补登记） | F4-1 链式合并回归：连续 rule3 硬切时新挂起段无条件覆盖旧挂起段，中间段全部丢失（不落库不推送）（13.wav 取证模式） | 链式合并（合并成功继续挂起，失败兜底落库）+ 回归测试；修复提交 babb58a（六轮补登记入权威清单） |
| （TD-2026-08-19-B） | 链式合并无上限——连续语音（句间停顿 <600ms）下 sherpa 端点只由 rule3（8s）触发，全部硬切段无限挂起合并：实时流不推送（前端只显示 partial 一行）、停止时 flush 整段兜底落库（用户实测"实时只显示一行 / 全部语音集中一段"，medium-high） | 修复①（七轮）：`MAX_MERGE_CHAIN=2` 上限 + 超限强制落库推送（890a066）；**演进②（八轮，merge-then-split）**：合并后按段内真实句号切分——完整句逐句落库推送（句子级沉淀）、残余继续挂起，`MAX_MERGE_CHAIN=4` 降级兜底（8a4e6c8，720 单测全绿）；ADR-012 决策记录同步演进 |

## 登记规则

- 类型四分类：有意（deliberate）/ 无意（inadvertent）/ 环境变化（environment）/ 腐化（bit rot）
- 优先级：P0 立即处理 / P1 近期 / P2 排期 / P3 观察
- 偿还时在"今日已偿"登记，状态改 closed；代码未提交的偿还注"待 commit"
- 行数豁免登记见 [standards/line-limit-exemptions.md](../../standards/line-limit-exemptions.md)
