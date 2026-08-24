# 技术债清单（权威：2026-08-24）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-24（v0.13.6 交付后新增代码审查——三段并行 agent + 跨切面；高×2/中×6/低×8 **16 项**全部即修 8464f99；审前规格自查修订 81a83a5 + 修复批 a21af26/b043970/400fbe4/4dfa2af）
> **二轮（v0.13.7 交付后审查）**：七维审查新增登记 2 笔 open（TD-2026-08-24-B/C），规格与计划归档。
> **三轮（v0.13.8 画布交付后审查）**：七维审查——接入/牵连/性能/冗余/规范/安全全部通过；逻辑性高×1/中×1/低×1 **全部即修 6464abd**（重挂载拖拽位置覆盖 / 框选批量移动未持久化 / 测试死分支）+ 回归测试 1 项（189 用例全绿）；v0.13.8 设计规格归档。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 | 无意 | P3 | 2026-08-19 | carried |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 | 无意 | P2 | 2026-08-19 | carried |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn | 无意 | P3 | 2026-08-21 | carried |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量 lib 5 项 + tests 类 ~14 项；**v0.13.6/7/8 交付批 + 审查批均零新增**，三轮复核本批新文件零警告） | 无意 | P3 | 2026-08-22 | carried |
| TD-2026-08-24-A | lib.rs（712 行）/ live_session_frame.rs（683 行）超 600 硬限——预存债务（HEAD 即 684/669，v0.12.x~v0.13.x 增长），已登记行数豁免 + 承接拆分计划（command 注册拆 app_commands.rs / 帧消费拆 live_frame_consume.rs；**拆分计划 v0.13.7 未兑现——顺延下一窗口**；三轮审查 +7 行注册） | 有意 | P1 | 2026-08-24 | open |
| TD-2026-08-24-B | RouteInfoPopover sysBrief 仅查 groupLinks[0] 体系——多体系组其余体系的概念失效不提示（触点①允许多徽标，此处功能缺口） | 无意 | P2 | 2026-08-24 | open |
| TD-2026-08-24-C | KnowledgePage KnowledgeSampleView refreshGlobal={0} 恒传死参数——checkGlobal 只在挂载执行，参数承诺的"全局创建完成后触发"从未兑现 | 无意 | P3 | 2026-08-24 | open |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| 审查 H1 | detect_video_profile 领域记忆兜底被 `result.domain = domain` 无条件覆盖（REQ-222 完全失效）——先赋值后兜底 | 8464f99 |
| 审查 H2 | NotesPage ESC 出口刷新竞态（卸载保存 vs get_note——重演"编辑后旧值"P0）——flushSave 命令式出口 + flushLatest 最终保存 | 8464f99 |
| 审查 M1 | 烘焙种子 Handcraft/Cooking 双表残留（恒归手工）——移除 Handcraft "烘焙" + 回归测试 | 8464f99 |
| 审查 M2 | 分区映射 ①a 首个条目 coarse=None 阻塞后续 coarse 分区——改为"首个带 coarse 的分区" find_map + 回归测试 | 8464f99 |
| 审查 M3 | legacy Live 配置与四维 Live 语义矛盾（disable_ocr=true 短路画面链）——对齐浅画面语义（disable_ocr=false/ocr 0.1/low 采样）+ 测试更新 | 8464f99 |
| 审查 M4 | 单字 CJK 种子（谱/炖/炒/折/稿/刨/锯/釉/窑）+ contains 无边界跨领域误命中——全部替换为 ≥2 字 + 守卫测试（粗/细目双表） | 8464f99 |
| 审查 M5 | update_live_profile `Some([])` 与 None 语义不一致（空数组误报"需与 domain 同传"）——空数组统一为无细目 | 8464f99 |
| 审查 M6 | LiveProfileStrip"领域自动"回退全空触发"至少需一项"误报且还原不生效——空串 sentinel 清除语义（前后端协议级） | 8464f99 |
| 审查 L1-8 | 挂名即修项：领域自动清空快照一致性（live_session_frame）/ 至少一项校验计入 fine / changeDomain 独立 try（热词失败不阻断记忆）/ chips fine_ids 与 fineSel 同步 / onProfileChange ref（闭包陈旧性）/ ALL_FORMS 自 FORM_LABELS 派生（单源）/ 测试断言健壮性（10/20 项显式断言 + ESC 用例）/ 注释过期（15→20/394→590/confidence 口径）与行数豁免登记刷新 | 8464f99 |
| 审查 v0.13.8-高 | 画布拖拽/批量初始化持久化后 props 陈旧——树↔画布往返重挂载时辐射布局重算覆盖已拖走位置（违反 §4.4"位置只由用户决定"）——onPositionsSaved 回传父页 applyCanvasPositions 合并 + 重挂载回归测试 | 6464abd |
| 审查 v0.13.8-中 | 画布 elementsSelectable 默认开启——shift 框选 + 多节点拖拽仅主节点持久化，其余节点视觉位移回弹不一致——elementsSelectable=false + selectionKeyCode=null（§九 不暴露框选批量移动） | 6464abd |
| 审查 v0.13.8-低 | KnowledgePage.test withSystemMock 画布命令分支死代码（画布视图已 mock，分支不可达）——清理 | 6464abd |

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.13.6-1 | `seed_words` 每次调用分配 `Vec<String>`（detect_domain 每轮 20 次）——命令级频率非热路径 | 保持（低价值；若检测进入热路径改为 &'static 切片） |
| 观察 v0.13.6-2 | preheat_domain_hotwords 非法 fine 静默跳过 vs remember_video_profile_domain 明确报错——设计选择（诚实降级 vs 不静默），均已注释 | 保持（文档已注明差异） |
| 观察 v0.13.6-3 | 前端 DOMAIN_OPTIONS/FORM_LABELS/KIND_TO_* 静态双写 Rust 表（漂移风险；84 项细目已走 list_domain_fine 单一数据源，ALL_FORMS 已派生自 FORM_LABELS） | 保持（既有模式：后端契约测试锚定；若再增类统一为命令拉取） |
| 观察 v0.13.6-4 | a21af26 提交混合两处修复（knowledge 契约 + notes 刷新）——违反原子提交纪律 | 保持（本地未推送，历史重编收益低；后续拆清） |
| 观察 v0.13.6-5 | docs-check 预存 15 处失效链接（v0.13.4/5 规格相对路径笔误 + v0.10.1/v0.12.0/v0.12.4 假阳性）——非本批引入 | 后续 docs-check 治理轮（与观察 v0.12.2-6 合并） |
| 观察 v0.13.8-1 | 辐射初始位置带浮点尾差（cos(-90°)≈6e-17 → x≈1e-14）——RF 双精度渲染不可感知（<1/1000px），测试已取整断言；如将来做 DB 导出/比较再在 toTopLeft 取整 2 位 | 保持（低价值；拖拽即覆盖） |
| 观察 v0.13.8-2 | update_node_canvas_position 无体系归属校验（契约按规格仅 nodeId+坐标；节点存在性已校验；本地应用伪造 IPC 才可跨体系写画布列，影响仅为位置无内容） | 保持（以规范为准；后续该层扩面时统一加 system 上下文） |
| 观察 v0.13.8-3 | CanvasEntityKind（树实体语义）与 CanvasSelectKind（选中语义）双枚举并存——避免 "question→node" 语义在转换层被混淆；合并需改 6 处调用点 | 保持（职责不同；若后续再增实体再复盘合并） |

## 验证记录

- Rust：`cargo test --test app_lib_tests video_profile` **74 通过 / 0 失败**（新增：细目表 6 + 映射表 7 + 记忆 2 + 矩阵 4 + 审查回归 3——烘焙迁移/多分区 coarse/单字种子守卫×2）；`knowledge` 140 通过；clippy --tests 本批代码**零警告**（仅预存 render_depth_block 等）
- 前端：`tsc --noEmit` 零错误；vitest 24 文件 **133 通过**（新增 ESC flush 用例 1）；vite build 通过
- **三轮（v0.13.8 审查）**：`cargo test --test app_lib_tests knowledge` **151/151**（画布 11 新增）；全量 1721 passed / 3 failed（预存基线 ai_client/note_filter×2）/ 6 ignored；clippy 新文件零警告；`tsc --noEmit` 零错误；vitest 34 文件 **189 通过**（layoutRadial 8 + canvasElements 7 + CanvasNodes 6 + KnowledgeCanvasView 10 + 页面入口 2）；vite build 通过

## 关联

- 版本与需求：[v0.13 系列文档](../../versions/v0.13.md)（v0.13.6/7/8 行）
- 规格：[v0.13.6 设计规格（已归档 [ ] 已归档）](./2026-08-23-v0.13.6-video-profile-classification-refinement-design.md) / [v0.13.7 设计规格（已归档 [ ] 已归档）](./2026-08-24-v0.13.7-knowledge-system-onboarding-design.md) / [v0.13.8 设计规格（已归档 [ ] 已归档）](./2026-08-24-v0.13.8-knowledge-canvas-design.md)
