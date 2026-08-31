# 技术债清单（权威：2026-08-31）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-31（v0.16.1 用户反馈批 7 提交 4e30af1f~09f9689f + 新增代码审查即修；
> 昨日 5 笔未偿逐条核验均未发生偿还条件 → 继承 carried）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——本日核验：lib.rs 仅 mod 声明（L238）+ image_store.rs 注释"当前未接线"，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs/live_session_frame.rs 超 600 硬限——lib.rs 实测 777 行（generate_handler proc-macro 单点展开不可拆）；live_session_frame 拆分方案已登记顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 607 行超 600 硬限——本日实测仍 607；拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——本日 `cargo test --test app_lib_tests note_filter` 复现 60 通过 / 2 失败（与本批零触及） | 预存 | P2 | 2026-08-30 | carried |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable（CodeMirror 之外）右键无应用内文本菜单——当前应用无该编辑面；未来画布/树文本编辑需补 | 有意 | P3 | 2026-08-31 | open |
| TD-2026-08-31-B | 13 处 window.prompt/confirm/alert 替换为应用内对话框（聊天重命名/AI Provider 删除/备份恢复/碎片删除/版本回滚/精修授权确认等）——用户 2026-08-31 裁决"本批不做"，登记后续批 | 有意 | P2 | 2026-08-31 | open |
| TD-2026-08-31-C | App.css 从未被引入（`ed-low-confidence` / `chatBlink` / 暗色 :root 均为死样式）——引入会改变全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | open |

## 今日已偿

无遗留债务偿还；本日新增代码审查定位并**即修 5 项**（不立债，均在本批提交内）：
1. **审查-1（P2）**：AiRefineCard 工作台「重新生成」误触发 onTaskStarted → 被拽去 AI 对话页 —— skipNavigateRef 旁路（a27954e6）
2. **审查-2（P2）**：`/refine `/`/enrich ` 任意前缀误劫持正常提问 —— 收紧为精确形态（可带数字 id 预选目标）（a27954e6）
3. **审查-3（P3）**：buildConversationMarkdown upToId 未命中 → 空正文静默损坏 —— 回退全量（533e7e92）
4. **审查-4（P3）**：两个菜单组色点未随主题（浅色硬编码）—— 主题感知（ae9e89ea）
5. **审查-5（P3）**：NoteRowContextMenu 无 ESC 关闭（键盘可达性不一致）—— 补 ESC（ae9e89ea）
6. **审查-6（P3）**：focusRefineTaskId/focusChatTaskId 陈旧值跨导航复触发 —— 消费后清空（App↔面板回调链 + SessionDetailPanel 深链快照防竞态）（a27954e6）
6. **审查-7（P2）**：REQ-231 编号与 v0.16.0 预留的"聊天上下文注入"冲突 —— 本批重编号 REQ-238~244（09f9689f，文档一致性）

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-08-28-1 | docs-check 存量失效链接 18 处 | 待专项治理（与归档无关，避免范围蔓延） |
| 观察 2026-08-28-2 | ensure_rec_engine 构建失败后每次请求重试完整模型加载（无冷却） | 保持（deliberate：冷却会破坏自动恢复） |
| 观察 2026-08-28-3 | D4 平台 ROI 应用接线留后续——模板/兜底资产已就绪并登记豁免 | 待接线（持有 TD-2026-08-28-B 修复前提） |
| 观察 2026-08-29-1 | 提交捆绑多功能（不满足原子书面规则）——不在本次 7 提交内（已按原子拆分）；历史不回写 | 记录（后续遵循原子性） |
| 观察 2026-08-29-3 | layoutForest 成环父引用静默丢失（数据损坏/导入异常路径） | 低优先（正常 UI 造不出环；不变式测试守护） |
| 观察 2026-08-30-1 | 正文手写/粘贴绝对路径图片引用不改写 | 保持边界（v0.15 §6 登记） |
| 观察 2026-08-30-2 | 历史孤儿图片目录（v0.15 前遗留） | 垃圾回收后续任务 |
| 观察 2026-08-30-3 | AI 对话停止响应延迟上限（ureq 无请求取消句柄） | 保持（换 reqwest 属架构级重构，后续评估） |
| 观察 2026-08-30-4 | SSE usage 附在 delta 行时 token 显示降级 | 低优先（extract_usage 兜底已覆盖主端点） |
| 观察 2026-08-30-5 | AI 对话流式渲染每 chunk 全量 markdown 解析 | 保持（阈值实测后再节流渲染） |
| 观察 2026-08-30-6 | trajectory 存储体积（50-200KB/任务） | 可接受（50 条/类型上限硬约束已有） |
| 观察 2026-08-30-7 | chat_set_model 自定义 Provider 模型校验 | 保持（校验防御性正确） |
| 观察 2026-08-30-8 | ChatStreamEvent::Done.content 未被前端消费 | 保留（协议完整性 + 未来轻量端点） |
| 观察 2026-08-31-1 | AiRefineCard 导航旁路修复无单测（该卡无既有测试基座——useAiTaskPolling/RefineWorkbench 链重） | 观察（审查人工核验 + 真机验证；后续抽可测面再补） |
| 观察 2026-08-31-2 | 工具条提示文案 "试试 '/refine' '/enrich'" 未注明数字 id 用法（`/refine 12` 预选） | 低优先（文案微调项） |
| 观察 2026-08-31-3 | TaskLaunchDialog 补充=九子项硬编码全选（对话页不做子项勾选） | deliberate（笔记页 EnrichPanel 完整呈现） |
| 观察 2026-08-31-4 | TaskThreadCard「10 分钟」追问窗口魔法数 | 观察（注释已述；设配置属微优化，实测后再定） |
| 观察 2026-08-31-5 | NoteRowContextMenu 与 NoteMoveToGroupMenu 归组 invoke 两处独立实现 | 观察（生命周期/上下文不同；抽 hook 属微优化） |
| 观察 2026-08-31-6 | 浏览器原生右键菜单禁用仅 Windows（wry Windows 扩展；非 Windows 空实现） | deliberate（本产品仅 Windows） |
| 观察 2026-08-31-7 | 代码版本号（package.json/Cargo 0.13.9）与版本存档（v0.14~v0.16.1）长期漂移 | 预存记录（semantic-release 管 main 线版本；dev 不升——发版前核） |

## 验证记录

- 前端 vitest 62 文件 483 用例全绿；`tsc --noEmit` 零错误
- Rust `cargo check` 零错误；`cargo test --test app_lib_tests note_filter`：60 通过 / 2 预存失败（TD-30-B，与本批无关）
- docs-check：本批文档零新问题（存量 18 处失效链接见观察 28-1）

## 关联

- 版本与需求：[v0.16.1 版本文档](../../versions/v0.16.1.md)（交付 4e30af1f~09f9689f，REQ-238~244）· [v0.16.0 版本文档](../../versions/v0.16.0.md)
- 归档快照：[2026-08-31 README](./README.md)
