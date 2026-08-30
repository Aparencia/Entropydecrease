# 技术债清单（权威：2026-08-29）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-29（v0.14.1 交付 20da94e7 + 新增代码七维审查即修 313dd9ff：
> 三区域并行 agent——Rust 侧 1中7低 / 前端纯函数层 2高3中6低 / 前端组管理 4中6低，
> 全部即修或登记，无残留 open；设计规格归档）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 | 无意 | P3 | 2026-08-19 | carried |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 | 无意 | P2 | 2026-08-19 | carried |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn | 无意 | P3 | 2026-08-21 | carried |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量项；后续交付批均零新增） | 无意 | P3 | 2026-08-22 | carried |
| TD-2026-08-24-A | lib.rs（712 行）/ live_session_frame.rs（683 行）超 600 硬限——拆分计划顺延下一窗口 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-24-B | RouteInfoPopover sysBrief 仅查 groupLinks[0] 体系——多体系组其余体系的概念失效不提示 | 无意 | P2 | 2026-08-24 | carried |
| TD-2026-08-24-C | KnowledgePage KnowledgeSampleView refreshGlobal={0} 恒传死参数 | 无意 | P3 | 2026-08-24 | carried |
| TD-2026-08-28-A | chapter_quality_scores 每章全量扫描 blocks（O(C×B)）+ 每块文本克隆——正确性无影响，纯性能优化项 | 无意 | P3 | 2026-08-28 | carried |
| TD-2026-08-28-B | incremental_merge 循环内线性 find 导致 O(n²)——dead code 模块（已登记豁免）；修复前提（D4 接线）在 v0.14.1 未发生，顺延 | 无意 | P3 | 2026-08-28 | carried |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| 审查 R-中1 | 组删除后指向组内闪卡的 knowledge_links 悬空（仅清理了 note_group 类）——delete_group 补 flashcard 引用清理 + impact 统计并入 + 2 测试 | 313dd9ff |
| 审查 R-低2 | delete_note_group Ok(false) 未转错误（并发删除窗口契约破口） | 313dd9ff |
| 审查 R-低3 | 组/体系存在性校验重复（require_group/require_system 抽取） | 313dd9ff |
| 审查 R-低4 | delete_group 毒锁恢复缺 ROLLBACK 说明（与 set_node_canvas_positions 同款注释补齐） | 313dd9ff |
| 审查 R-低7 | knowledge_canvas_states 三列迁移 ALTER 分支无覆盖——旧库升级测试（DEFAULT 落位/视口保留） | 313dd9ff |
| 审查 R-低6/8 | commands_knowledge_canvas 头注释 4→6 命令 + 新命令 @ai-context；旧裸 SQL 删除测试改走新 API | 313dd9ff |
| 审查 F-高1 | layoutFishbone hasCore=false 鱼头整棵子树丢位（实证）——头子节点并入骨刺 + 不变式矩阵补无核心变体 | 313dd9ff |
| 审查 F-高2 | layoutDualRing 贴树环与 ring1 树节点 AABB 重叠（实证 4/5）——树缘口径 + 碰撞集合含树节点 + 单环扁树回归用例 | 313dd9ff |
| 审查 F-中3 | KCV 布局 effect 依赖整个 prefs——偏好切换全量重排 + 重复写库窗口（原子化拆建边 effect） | 313dd9ff |
| 审查 F-中4 | prefsLoaded 不门控控件——覆盖已存偏好竞态（三控件 disabled 门控） | 313dd9ff |
| 审查 F-中5 | 初始布局 hasCore=coreQuestion!=null 与 autoLayout rootCard 口径不一致——领域体系首根压体系名卡（统一 rootCard + 回归断言） | 313dd9ff |
| 审查 F-中6 | 测试矩阵几何缺口（hasCore=false/头带子树/单环扁树） | 313dd9ff |
| 审查 U-中1 | DOMAIN_OPTIONS 15 项 vs Rust 20 类 + ProfileDetector 双定义漂移——共享常量 20 类对齐 + 三处消费方消重 + 规格口径更正 | 313dd9ff |
| 审查 U-中2 | 双层 ESC 监听一次关两层（RouteInfoPopover 顶层优先短路） | 313dd9ff |
| 审查 U-中3 | 内联重命名无 IME isComposing 守卫（中文候选 Enter 提前提交） | 313dd9ff |
| 审查 U-中4 | 新建组成功反馈死代码 + update_group_color 失败归因错误/漏刷新（onCreated 文案上抛 + 部分失败分离） | 313dd9ff |
| 审查 U-低5 | GroupDeleteConfirm 读取失败死胡同（重试按钮）+ 重复文案去重 | 313dd9ff |
| 审查 U-低6 | 新建组颜色链路测试假断言（补真断言 + list_group_cards mock 完备） | 313dd9ff |
| 审查 U-低7 | 编辑态行空白点击触发组过滤切换（行 onClick 编辑短路 + 注释归因更正） | 313dd9ff |
| 审查 U-低8 | GroupCreateDialog 无 ESC（与 GroupDeleteConfirm 同款补齐） | 313dd9ff |
| 审查 低/规范 | 行数豁免刷新（types.rs 958 注旧值过期/db_note_groups_tests 388 登记/GroupSidebar 445/KCV 466） | 313dd9ff |

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-08-28-1 | docs-check 存量失效链接 18 处（本批归档零新增）：v0.13.4/0.13.5 spec 相对路径笔误×4、v0.14 spec 代码片段误检×3、v0.10.1/v0.12.0/v0.12.4 路径模板与 `[[ts:]]` 代码引用误检×11 | 待专项治理（与归档无关，避免范围蔓延） |
| 观察 2026-08-28-2 | ensure_rec_engine 构建失败后每次请求重试完整模型加载（无冷却）——模型修复后自动恢复是收益 | 保持（deliberate：冷却会破坏自动恢复） |
| 观察 2026-08-28-3 | D4 平台 ROI 应用接线（platform_layout/layout_reorder 生产消费）留 v0.14.1——模板/兜底资产已就绪并登记豁免 | 待接线（v0.14.1 未含本项——组 CRUD + 画布偏好为交付内容，D4 顺延并持有 TD-2026-08-28-B 修复前提） |
| 观察 2026-08-29-1 | 20da94e7 捆绑"组 CRUD + 画布偏好"两功能单提交（34 文件）——不满足原子提交书面规则（subject 亦非动词开头）；不回写历史（禁 force push），后续提交遵循原子性 | 记录（后续版本功能拆分提交） |
| 观察 2026-08-29-2 | 会话暂停停采重连循环（排查报告）：WASAPI Stop 失败→重连→再 Stop→循环，期间前端"采集中/恢复中"与真实停采信息差（App.tsx 恢复态徽标）| 修复 1+2 待用户确认实施（audio_loopback 暂停标志先行 + 徽标文案区分暂停中） |
| 观察 2026-08-29-3 | layoutForest 成环父引用静默丢失（数据损坏/导入异常路径）——布局函数缺位断言 | 低优先（正常 UI 造不出环；已有 key 全覆盖不变式测试守护） |

## 验证记录

- 前端 vitest 409/409 全绿（新增 7 用例）；tsc --noEmit 零错误；Rust cargo test 1834 通过（3 个预存失败与本次无关：ai_client provider 默认值 + note_filter golden×2——clean HEAD 已复现）
- docs-check 链接校验（归档后活跃区引用全部改指归档路径）

## 关联

- 版本与需求：[v0.14.1 版本文档](../../versions/v0.14.1.md)（交付 20da94e7 + 审查修复 313dd9ff）
- 归档快照：[2026-08-29 README](./README.md) · [v0.14.1 设计规格（[ ] 已归档）](./2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md)
