# v0.20.0/0.20.1 新增代码六维审查报告（2026-09-06）

> 范围：v0.20.0（REQ-263）与 v0.20.1（REQ-264~267）新增/变更代码及其直接关联调用（eval_* 纯函数四模块、bin/asr_eval{,_session,_stream}、dtw_align 校正包装、live_keyframes 接线、streaming_asr 配置化、title_rules/commands_video/前端 ProfileDetector 接线、回归修复批测试文件、Cargo.toml autobins/bin 声明）。
> 方法：六维逐项（接入性/逻辑性/牵连性/性能流畅度/冗余死代码/规范+安全性）；阶段分配=原子层（eval_*/cer/dtw）→ 业务层（streaming/engine 接线）→ 系统层（bin/前端）。发现均修复后回归验证。

## 一、问题清单（按严重程度排序，全部已修复）

| # | 严重度 | 位置 | 问题描述 | 影响 | 修复（最佳方案，已实施） |
|---|---|---|---|---|---|
| 1 | 中 | `src/cer.rs` | CER 底层 levenshtein 为 O(n·m)（滚动行内存安全但时间二次方）；harness 弱参考路径拼接整会话文本，长会话（如 55.wav≈110min、数十万字）会触发分钟~小时级 CPU 消耗 | 工具路径可用性退化（非生产路径；cer 无 lib 内调用方） | 方案对比：分块测量（失真）/采样（偏差）/**长度护栏**（最优：诚实+零失真+零成本）——>20k 字任一侧 → None（不可比），调用方跳过；配套单测 |
| 2 | 低 | `src/eval_samples.rs` parse_srt | 旧实现按"序号相同即合并文本"跨块累积——两块同显式序号（畸形 srt）时内容被跨块误并为一条 cue，参考文本错序 | 畸形字幕样本参考失真（CER/画像错偏） | **块内累积、块末一次性入 cue**（每块独立，天然隔离同号块）；单测全绿 |
| 3 | 低 | `src/bin/asr_eval.rs` | 文件 386 行 > 300 行规范线（300-600 需登记豁免）；进度输出 `print!` 无换行（控制台粘连） | 规范不合规；控制台可读性 | 豁免登记入 v0.20.md 交付记录（工具 CLI 编排单用途，拆分会反损内聚，≤600 硬限内）；进度行尾补换行 |
| 4 | 低 | `src/streaming_asr_tests.rs` | rule3 默认断言 8s（旧值）——默认值定案后未同步 | 全量回归红 1 例 | 断言更新为 12s 并注释裁决依据 |

## 二、六维检查明细

**接入性 — 通过**：eval_* 四模块 lib.rs pub 注册且 bin 全量消费（无新增未调用）；`dtw_align` pub 导出仅 harness/bin 使用（crate 内另有原测试消费）；`asr_eval`/`asr_eval_session`/`asr_eval_stream` Cargo [[bin]] 声明 + autobins=false（防辅助模块误识别）；preheat title 参数后端声明与前端 invoke 及测试三方一致；commands_* 无重复注册。

**逻辑性 — 见问题 1/2**（修复后复核）：其余检查通过——`correct_drift_if_any` 门槛（段数/带内/带外拒动）与 harness 会话信道同口径；streaming 档端点命中重建流、尾部 flush 收尾与生产 handle_endpoint 语义一致；排空单测覆盖"积压逐条 Err 清空 + 空队列 no-op"；参数档案缺省字段/坏文件/缺失文件均回落默认；session 过滤/属主、wav 缺失跳过路径均无悬空分支。

**牵连性 — 通过（含 1 项外部观察）**：rule3 默认 8→12s 属受控默认变更（文档+断言同步，配置零迁移可回退）；dtw 校正仅作用于融合入口且无字幕短路不变；既有 2149→2159 用例无意外破坏。**观察**：工作区存在并行 WIP（asr_pass2/v0.20.2 线，未入库）——其失败用例非本批回归，待并行线入库后终跑全量。

**性能与流畅度 — 见问题 1**：其余通过——画像 2000 字护栏、SRT/样本 IO 线性、配置加载仅装配期两次、drain/心跳无新增热点；前端仅 invoke 参数扩展（零渲染成本）。

**冗余与死代码 — 通过**：eval_report::render_table 现无 bin 调用但有单测覆盖（工具层通用渲染，保留理由注明）；无未用变量/导入/死分支（clippy 全目标零新增告警）；新常量均有消费。

**开发提交规范 — 通过（见问题 3 豁免登记）**：Conventional Commits、原子提交、@ai-context 注释齐全、类型安全（无 any/无裸 unwrap 新增——live_keyframes 处 clippy 指正已改 let-else）；前端变更同步 vitest。

**安全性 — 通过**：无新增 IPC 面（preheat title 为既有命令参数扩展，输出经候选函数限量）；SQL 全参数化（params!）；无硬编码密钥/凭证；下载走既有 hf-mirror HTTPS + 断点/原子改名脚本；文件读写限用户指定样本/输出目录与数据目录。

## 三、修复与验证

- 修复提交：`152cf56`（CER 护栏+SRT 块隔离+进度换行）；断言/豁免同步见 v0.20.md
- 验证：eval_ 28/28、cer 11/11（含新护栏测）、`cargo build --bin asr_eval` 通过、clippy 零新增；v0.20.0/0.20.1 交付时点全量 2159 绿（并行 WIP 入库后复跑）
