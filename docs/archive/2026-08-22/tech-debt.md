# 技术债清单（权威，2026-08-22 四轮归档滚动——v0.11.5 采集体验与笔记打磨交付后）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-22 首轮清单滚动 + v0.11.5 六维审查直接修复（审查发现 20+ 项全部即修，无新增 open）

## 未偿债务（逐笔保持 carried，仪留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 |
| TD-2026-08-21-B | v0.10.0 时间戳锚点断言过时（全量 16 项） |

## 本批滚动（2026-08-22 四轮：v0.11.5 采集体验与笔记打磨交付 + 六维审查 + 归档）

- **未偿 5 笔保持 carried**：TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-B：本批为 v0.11.5 交付 + 审查修复批，未涉及 Rust 旧逻辑/配置/测试断言，逐笔核对无变化
- **已偿 0 笔** / **新登记 open 0 笔**：v0.11.5 六维审查发现的 20+ 项问题全部通过独立修复提交清偿（A+B 组 ee7b916 / D 组 de656b4+78bc6af），无残留 open

## 五轮补充（v0.11.6 M1 AI Provider 层交付 + 七维审查 + 归档，2026-08-22）

> 来源：v0.11.6 M1 代码建设（T1~T7，12 提交）+ 新增代码七维审查（Rust 后端区 + 前端/文档区双 agent，11 项问题全部即修）
> 验证：cargo test 1521 passed + vitest 48 passed + tsc 零错误 + clippy 新增零警告（日志 app/src-tauri/test_m1.log）

### 未偿核对（逐笔）

| ID | 摘要 | 状态 |
|----|------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 体积权衡） | carried（M1 未涉及） |
| TD-2026-08-19-D | image_stream_store 已交付未接线 | carried（M1 未涉及） |
| TD-2026-08-19-F | detect_pause_icon 可能误报暂停 | carried（M1 未涉及） |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验 | carried（M1 未涉及） |
| TD-2026-08-21-B | v0.10.0 时间戳锚点断言过时（全量 16 项） | **closed**（cargo test 1521 passed 0 failed 核验——断言已随 v0.11.4/0.11.5 交付链更新，M1 全量回归佐证） |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn（昨日清单遗漏继承，补登） | carried（M1 未涉及 db 层；偿还目标：db.rs::with_conn 迁移） |

### 今日已偿（M1 审查即修，可经提交验证）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| 终审 C-1 | 前端密钥门禁读旧 default scope——Provider 面板密钥对精修/补充入口不生效 | ai_get_settings 改走 resolve_default_provider_key（464533d） |
| 审查 I-1 | Ollama 本地 Provider 被全链路密钥门禁拦截（本地推理不可用） | default_provider_ready 统一门禁 + ensure_balance_for 本地放行（本次审查修复提交） |
| 审查 I-2 | keyInput 切换 Provider 未重置 → 密钥跨 Provider 错配 | 配置密钥按钮重置输入（本次审查修复提交） |
| 审查 I-3 | ai_provider_presets 死命令 + 前后端预设双源漂移 | 前端改调 ai_provider_presets 动态取模板（后端单一权威源） |
| 审查 m-1~m-7 | fallback dead_code 豁免注释 / 密钥解析错误传播 / scope 碰撞校验 / remove 吞错 / 内联表单 UI 时序 / reset 残留 / 文案与文档小项 | 全部即修（本次审查修复提交，10 文件 +104/-35） |

### 新登记（open）

无（M1 审查 11 项全部即修）。

### 观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 M1-1 | NotePreviewView.tsx:142 硬编码 SILICONFLOW_API_KEY 与 SiliconFlow 特指文案（本次变更未涉及文件） | M2 前置修复 |
| 观察 M1-2 | Ollama 预设默认禁用，需用户手动启用（本地优先入口在设置页） | 保持（默认关 = 隐私红线一致性） |
| 观察 M1-3 | 授权文案 SiliconFlow 特指（AiRefineCard/EnrichPanel） | M3 已登记 |
| 观察 M1-4 | ai_balance 余额接口为 SiliconFlow 专属路径，非 SiliconFlow 默认 Provider 时余额查询失败（调用方宽容放行） | M3 退役范围 |

## 六轮补充（v0.11.7 图文会话交付 + 六维审查 + 归档，2026-08-22）

> 来源：v0.11.7 代码建设（T1~T7，9866c50→172f490 九提交）+ 新增代码六维审查（8 项问题全部即修 25386d9）
> 验证：cargo test 1521 passed + vitest 49 passed + tsc 零错误 + 前端 build 通过；**clippy --all-targets -D warnings 未过（见下 TD-2026-08-22-A）**

### 未偿核对（逐笔）

| ID | 摘要 | 状态 |
|----|------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 体积权衡） | carried（v0.11.7 未涉及） |
| TD-2026-08-19-D | image_stream_store 已交付未接线 | carried（v0.11.7 未涉及） |
| TD-2026-08-19-F | detect_pause_icon 可能误报暂停 | carried（v0.11.7 未涉及） |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验 | carried（v0.11.7 未涉及） |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn | carried（v0.11.7 未涉及 db 层） |

### 今日已偿（v0.11.7 六维审查即修，可经提交验证 25386d9）

| ID | 摘要 | 偿还方式 |
|----|------|----------|
| P1 | start_photo_session store 创建失败不释放互斥槽 + 残留会话 | 先建 store 再占用槽；失败回滚删会话 |
| P2 | decode_image 无像素上限（压缩炸弹）+ 限长检查在解码后 | MAX_PIXELS 40MP 解码后拒绝 + base64 长度解码前预估 |
| P3 | block_count 落库失败也计数（与 import_frame 口径分叉） | 成功落库才 count += 1 |
| P4 | finish_photo_session store 异常被当"无图"误删会话 | store 创建失败传播 Err |
| P5 | 图文/实时互斥 TOCTOU 窗口 | live_active 读取移入 photo_session 锁内 + 注释残余窗口 |
| P6 | 遮罩 Esc 提示无监听 + resize 不重算 letterbox | window keydown/resize 监听 |
| P7 | photoCrop 输出矩形可越界（canvas 透明带） | 起点收至末行末列 + 宽高收至边界 + 测试 |
| P8 | 完成态无法原地开始新采集 | done 态"再来一组"按钮 |

### 新登记（open）

| ID | 摘要 | 处置 |
|----|------|------|
| TD-2026-08-22-A | clippy --all-targets -D warnings 20 项错误（enrich_placement/live_session_manager/commands_ai_enrich/db_settlements/feature_flags/watermark_filter/note_filter doc 列表等——存量 6 项 + v0.11.6 M1 引入 ~14 项；M1 验收"clippy 新增零警告"未覆盖 all-targets） | open——M2 或专项批次清偿；目标：clippy -D warnings 全绿 |

### 观察项（登记不立债）

无新增（v0.11.7 审查低危项全部即修，无观察遗留）。

## 关联

- 版本与需求：[v0.11.md 系列（v0.11.0~5）](../../versions/v0.11.md)
- 设计文档：[2026-08-22-v0.11.x-capture-notes-polish-design.md](./2026-08-22-v0.11.x-capture-notes-polish-design.md)（[ ] 已归档，本日归档）· [实现计划](./2026-08-22-v0.11.5-capture-notes-polish.md)（[ ] 已归档）
- 提交链：1c84640（文档基线）→ d71da59→…→68d8684→ee7b916→de656b4→78bc6af（全部 20+ 提交）
- 遗留：真机验收清单（见版本文档交付验证记录）

## 关联（M1 批次）

- 版本与需求：[v0.11.6 版本文档](../../versions/v0.11.6.md)（M1 已交付，M2 排期）· [v0.11.md 系列](../../versions/v0.11.md)
- 设计文档：[2026-08-22-v0.11.6-ai-platform-design.md](../../superpowers/specs/2026-08-22-v0.11.6-ai-platform-design.md)（活跃：M2/M3 未实施）· [实现计划](./2026-08-22-v0.11.6-m1-ai-provider.md)（[ ] 已归档，本日归档）
- 提交链：4de6c08（计划）→ d2dda73→…→464533d（M1 全部 12 提交）→ 审查修复提交（I-1~I-4/m-1~m-7）