# 技术债清单（权威：2026-08-23 · 五轮）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-23 一轮（v0.12.0 七里程碑交付 + 新增代码七维审查，4 项即修 c624f4c）
>        → 二轮（v0.12.3 浮窗死锁修复 + 交互/架构升级 + 精修工作台契约修复，新增代码七维审查，3 处即修 f8db9e2）
>        → 三轮（**v0.12.2 笔记页信息架构重构交付 + 新增代码七维审查，8 处问题全部即修 fe8c919/f5731e1**）
>        → 四轮（**v0.12.4 视频画面要点纯图落地 + 笔记预览锚点 chip 化交付 + 新增代码七维审查，零 P0/P1 缺陷、2 项 P3 观察不修；无文档归档**）
>        → 五轮（**v0.12.5 AI 精修线路修复 + v0.12.6 浮窗显隐/锁定自解锁交付 + 新增代码七维审查，P1×1/P2×1/P3×1 即修 30a7502；无文档归档**）

## 未偿债务（逐笔保持 carried，仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量 lib 5 项：live_session_manager applied_profile / commands_ai_enrich redundant closure / db_settlements i64 cast / note_filter doc list / watermark_filter ptr_arg，tests 类另有 ~14 项；**v0.12.2/v0.12.4 批新增零警告**） |

## 本批滚动（2026-08-23 四轮：v0.12.4 视频画面要点纯图 + 笔记预览锚点 chip 交付 + 新增代码七维审查）

- **未偿 6 笔保持 carried**：全部未触及对应模块（v0.12.4 为视频画面要点/笔记预览域，与 ffmpeg/讲者暂停/OCR 搜索/锁迁移/clippy 存量项无交集）；TD-2026-08-22-A 经本批 `cargo clippy --tests` 复核——存量告警集合与三轮一致，本批新增文件零告警（唯一相关线索：screens_tests 曾现 unused_mut 已即修），未清偿
- **已偿 0 笔**：本批未触及旧债务模块
- **新登记 open 0 笔**：本批七维审查结论——接入性通过 / 逻辑性 1 项 P1（视频会话大纲检测恒空，判定为 ADR-023 设计内行为变更，v0.12.4 文档已补说明）+ 1 项 P3（锚点段落正则尾 `]` 残渣，无真实触发路径，不修）/ 牵连性、性能、冗余、规范、安全全部通过；2 项观察登记见下

## 本批滚动（2026-08-23 五轮：v0.12.5 AI 精修线路 + v0.12.6 浮窗显隐/锁定自解锁交付 + 新增代码七维审查）

- **未偿 6 笔保持 carried**：TD-040（ffmpeg 体积）/ TD-2026-08-19-D/F/G（图库/暂停误报/OCR 搜索）/ TD-2026-08-21-C（lock().expect 迁移）本批未触及；TD-2026-08-22-A（clippy 存量 lib 5 项）经本批 `cargo clippy --lib` 复核——告警集合与四轮完全一致（applied_profile / redundant closure / i64 cast / doc list / ptr_arg），本批及审查批新增文件零告警，未清偿
- **已偿 0 笔**：无旧债触及
- **新登记 open 0 笔**：新增代码七维审查结论——接入性通过（float_toggle 注册/插件 handler/类型复用无孤立项）/ 逻辑性 P1（全局快捷键注册失败=锁定死局）与 P2（set_always_on_top 失败漂移）即修 30a7502 + P3（bar 双锁图标冗余）同批即修 / 牵连性通过（命令签名兼容、Cargo.lock 同步、文档/豁免登记/docs-check 一致）/ 性能通过 / 冗余通过（buildDataFromResult 中间产物零残留）/ 规范通过 / 安全通过（CSS 静态注入、快捷键 Rust 侧无前端权限面、无新 IPC 入参面）；4 项观察登记见下

## 观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.12.5-1 | 浮窗「放弃」仅关闭、任务记录保持未采纳（工作台结果可恢复设计——任务中心仍可查看/采纳） | 保持（v0.12.5 文档已知问题已说明） |
| 观察 v0.12.5-2 | 同会话重复精修会产生第二条笔记（apply 恒新建，v0.11.5 现状） | 需求池评估"同会话复用笔记" |
| 观察 v0.12.6-1 | 浮窗 toggle/按钮快速连按理论可交错（无动作级互斥锁——各操作幂等 + float:state 事件回流，最终状态一致） | 按反馈门控（必要时动作级锁） |
| 观察 v0.12.6-2 | 主窗随浮窗打开隐藏后，浮窗无"退出应用"入口（设计内——收起即回主窗；全局键在任何焦点下可收起） | 保持（按反馈门控加退出键） |
| 观察 v0.12.4-1 | 视频会话大纲检测恒空（`detect_outline` 只消费 `region=="full"` 块，ADR-023 下线后无 full 块）——设计内行为，精修 vision 图片经 `load_session_vision_images` 独立读归档目录不受影响 | 真机验证确认后关闭 |
| 观察 v0.12.4-2 | `import_frame.rs` 测试 `middle_region_crops_and_scales_to_max_width` 注释文案残留"中部区域（画面要点）"（中区域 OCR 已删，纯函数仍被字幕带复用）——文案性残留非代码缺陷 | 后续文档治理轮顺手清理 |
| 观察 v0.12.0-1 | M4 仅 commands_ai_providers env 改 DEEPSEEK_API_KEY；ai_client / ai_balance / ai_refine_task / ai_text_filter 等 legacy 单 Provider 路径仍读 SILICONFLOW_API_KEY（昨日观察 M1-1/M1-4 延续） | 专项退役或后序范围 |
| 观察 v0.12.0-2 | commands_overlay 的 overlay-tmp/snapshot.jpg 覆盖式临时文件（单张有界） | 真机确定是否需清理 |
| 观察 v0.12.0-3 | WGC 失效后不回切（沿用 DXGI 周期重建自愈）——YAGNI 决策已在 ADR-022 注明 | 保持 |
| 观察 v0.12.3-1 | 透明度滑杆拖动连续写 localStorage（微秒级；浮窗 1s tick 渲染已惰性化，收益递减） | 后续可节流（按反馈门控） |
| 观察 v0.12.3-2 | 独占全屏（DXGI exclusive）下 alwaysOnTop 不可见（系统级限制）——提示文案未做 | 真机验收后按反馈门控 |
| 观察 v0.12.2-1 | archived 碎片仍可升笔记（promote 命令不校验 status；与 delete/update_fragment_group 旧命令行为一致，收件箱只列 active 不影响主流程） | 若结算归档面与收件箱交叉再补校验 |
| 观察 v0.12.2-2 | 升卡成功无正反馈（n=0/1 均静默——幂等语义，验收标准允许重复触发不打扰） | 保持（按反馈门控加 toast） |
| 观察 v0.12.2-3 | 编辑态与 ⓘ 弹层同开时 ESC 双触发（退出编辑 + 关弹层两事件都监听 window；同一按键两动作）——弹层有背板，实际同屏概率极低 | 若反馈再收敛为弹层优先 |
| 观察 v0.12.2-4 | 弹层 fixed 锚点不随滚动/resize 跟随；碎片图文件名沿用碎片存储名（同毫秒+4hex 4 位碰撞概率 1/65536，同笔记目标目录去重缺失） | 极低，按反馈门控 |
| 观察 v0.12.2-5 | 图片搬运为事务内文件副作用（回滚不还原文件，最坏遗留孤儿图——注释已声明与 capture 降级纪律一致） | 保持（设计有意折中） |
| 观察 v0.12.2-6 | docs-check 检出 5 处既有断链（v0.10.1.md 路径占位 4 处被 extractLinks 误识别 + v0.12.0.md → 未撰写 spec 占位 1 处）；**非本批引入**（归档轮前已存在） | 后续 docs-check 治理轮（代码块剔除/占位链接规范） |

## 关联

- 版本与需求：[v0.12.0 版本文档](../../versions/v0.12.0.md) / [v0.12.2 版本文档](../../versions/v0.12.2.md) / [v0.12.3 版本文档](../../versions/v0.12.3.md) / [v0.12.5 版本文档](../../versions/v0.12.5.md) / [v0.12.6 版本文档](../../versions/v0.12.6.md)
- 决策：ADR-021（正文源多态）/ ADR-022（WGC 三级链）/ ADR-023（视频 OCR 下线 + vision 精修）/ ADR-025（浮窗锁定自解锁——全局快捷键方案）
- 验证：cargo check（v0.12.5/v0.12.6/审查批零错误）/ cargo clippy（五轮零新增告警，存量 5 项与四轮一致）/ cargo test（v0.12.5 全量 1550 通过 3 项既有失败——ai_client from_settings / note_filter golden session29 / ocr_points 过滤器，HEAD 基线与本版无关；v0.12.6 批 float_next_action_machine 新增；测试二进制加载期环境问题在应用运行中仍存——应用进程占用 onnxruntime.dll 时 lib 测试 exe 报 STATUS_ENTRYPOINT_NOT_FOUND，属本机环境非代码问题）；tsc 零错误 / vitest 92 通过 / 前端 build 通过
