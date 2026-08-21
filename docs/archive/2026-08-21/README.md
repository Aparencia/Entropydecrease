# 归档索引：2026-08-21（v0.8.0 M1~M4 + AI 精修非功能扩展 F0~F3 + 新增代码审查批次 ×2）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**本日归档 1 份**（首轮 0 份 + 二轮 1 份）：

| 源路径 → 归档路径 | 归档原因/状态 |
|------|-----------|
| `docs/archive/2026-08-21/brainstorming-ai-refine-nonfunctional-rebuild.md`（创建即入归档夹，提交 919b544） | **[ ] 已归档**——AI 精修非功能扩展设计文档：P0 契约断裂实证 + P1 修复 + 任务中心/协议 v2/评测框架；F0~F3 全部实施完成（提交 1845462~b75db82，1294 单测全绿），生命周期终结 |

**不归档候选**（持续活跃，规则明确排除）：

| 候选文档 | 不归档原因 |
|------|-----------|
| `docs/adr/ADR-016-ai-credentials-dpapi.md` | 当前生效 ADR（规则明确不归档） |
| `docs/versions/v0.8.0.md` | versions/ 内容（M0/M5 未完成，规划与实施记录持续活跃） |
| `docs/product/requirements-pool.md`（v0.8.0 区块） | 活跃需求池（REQ-138~147 持续更新） |
| `CHANGELOG.md` / `docs/standards/line-limit-exemptions.md` | 持续活跃（规则明确不归档） |
| `docs/Foresight/long-term-optimization-checklist.md` | **未被 git 跟踪**（非本次产出）——按前置条件排除，不补充提交 |

## 本批工作摘要（二轮：AI 精修全链路 F0~F3 + 新增代码审查）

- **AI 精修全链路代码建设四里程碑交付**（提交 1845462/897ee96/ba9e618/b6ad051/f06fd7f/6e72c5d/afca35f/7f575cd/790f964/b75db82，1294 单测全绿）：
  - F0 契约断裂修复（P0 根因实证：AiTaskState serde camelCase 与前端 PascalCase 失配 → 调用有记录但结果永不使用）——契约对齐 + 快照单测
  - F1 修复补齐：丢图（配图行缺括号 bug + 本地合并降级）、模型→单价映射 + 预估含输出、审计补齐、配额接入 + 任务去重
  - F2 任务中心：ai_tasks SQLite 表/启动恢复/全局任务面板/完成通知/切片并发 2-3 + 单片重试 + 部分成功
  - F3 协议 v2（image 块防丢图/片间上下文防结构错乱/schema_version 向后兼容）+ 成本硬拦截 + golden 结构回归评测（内置样本集 mock 全链路）
- **新增代码七维审查即修 9 项**（提交 564dfc5）：P0×2（去重粒度/拦截顺序）· P1×5（采纳幂等/落库成本模型感知/补充单片重试/任务表运行期裁剪/any 类型+契约同步）· P2×2（toast timer 清理/部分成功前端提示）；审查确认无问题项：接入性/性能/冗余/规范/安全（1294 单测全绿 + clippy 新代码清零 + 前端 tsc/build 通过）
- 验证：1294 单测全绿（基线 1271 + 新增 23）+ 前端构建通过

## 技术债摘要

- **未偿 5 笔**（全部 carried，核验保持）：TD-040（deliberate）+ TD-2026-08-19-D/F/G + TD-2026-08-21-A（存量 clippy 9 个）
- **今日已偿 15 笔**：首轮审查 C1~C6（354dd3d）+ 二轮审查 9 项（564dfc5：去重粒度/拦截顺序/采纳幂等/成本模型感知/补充重试/运行期裁剪/any 类型/toast timer/部分成功提示）
- **新登记 open 0 笔**：二轮审查无遗留；观察项 3 条保持（B6 宽松匹配/事件 deps/apply 两步落库）+ 昨日观察 8 条继承

## 本批补充（第三轮：设置页重构 + 任务 4 重构基建 + 框架 v2 定稿，2026-08-21）

**归档判定**：本批无新 Foresight 文档落地归档——`brainstorming-video-profile-detection.md` 仍被需求池（product/）引用，按规则保持活跃，仅更新状态标注（由 v2 取代，保留作历史分析）；`video-profile-framework-v2.md` 已排期 v0.9.0（未落地，不入归档夹）。

- **设置页重构**（任务 1，提交 `6720bec`）：9 个设置类面板迁出课堂助手 → 新「⚙ 设置」页（5 组单页滚动，REQ-194 已实施）；课堂助手左栏仅保留采集动线；tsc + vite build 通过
- **任务 4 重构基建**（提交 `158b3ff`/`f361921`/`4ce782b`/`1aecb70`/`d6af0af`）：分支重构（dev/main/old）、目录互换（保留原名）、工作设施继承适配（CI/发布链/hooks/服务器配置）、文档索引补登记
- **框架 v2 定稿**（v0.9.0 规划）：四维解耦设计（形态 7 类 × 画面价值 4 档 × 领域标签 × 语言预留）+ 会话 33 实证；登记 REQ-188~193 已排期；设计文档状态更新

## 技术债摘录（本批滚动）

- **未偿 5 笔保持**（TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-A）：本批为 UI 迁移 + 基建适配，未涉及 Rust 逻辑，逐笔核验保持 carried
- **已偿 0 笔新增**：无 Rust 改动，无新债务；**新登记 open 0 笔**

## 关联

- 版本与需求：[v0.8.0 版本文档](../../versions/v0.8.0.md) · [需求池 REQ-138~147](../../product/requirements-pool.md) · [v0.9.0 版本文档](../../versions/v0.9.0.md)（框架 v2 规划，REQ-188~193）
- 设计文档：[AI 精修非功能扩展设计（[ ] 已归档）](./brainstorming-ai-refine-nonfunctional-rebuild.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）

## 本批补充（第四轮：v0.9.0 四维解耦代码建设 M1~M5，2026-08-21）

**归档 2 份**（设计文档已实施完成，生命周期终结）：

| 源路径 → 归档路径 | 归档原因/状态 |
|------|-----------|
| `docs/Foresight/video-profile-framework-v2.md` → `docs/archive/2026-08-21/video-profile-framework-v2.md` | **[ ] 已归档**——四维解耦框架设计文档（形态 7 × 画面 4 档 × 粗 15 领域 × 语言预留），M1~M5 全部代码建设完成（cargo test 1352 全绿 + clippy 零警告），生命周期终结 |
| `docs/Foresight/brainstorming-video-profile-detection.md` → `docs/archive/2026-08-21/brainstorming-video-profile-detection.md` | **[ ] 已归档**——v1 检测改进候选（13 类检测改进），已被四维解耦 v2 取代，保留作历史分析 |

**工作摘要**：

- **M1 四维解耦**：ContentForm/VisualTier/DomainTag 类型 + 13→7 映射 + 参数矩阵（形态→模板+后处理、画面档→采样/OCR/存储）+ 记忆库 kind 映射迁移 + 新 command
- **M2 画面价值检测**：三信号加权投票 + 升降档裁决 + DualRateScheduler::retune + screen worker 集成 + live:tier-changed 事件
- **M3 领域标签体系**：粗 15 领域 × 种子词表 + 四来源检测(平台>用户>标题>术语) + hotwords 预热 + 术语筛选 + 区域预期
- **M4 平台适配**：bilibili/local 适配 + OCR 标签通用化(不依赖平台枚举)
- **M5 检测卡 v2 + 叙事变体**：ProfileDetector 三维一体交互 + narrative_detect 故事化叙事(叙事线+要点)模板变体
- 验证：cargo test 1352 全绿 + clippy 零警告 + 前端 tsc/build 通过

## 技术债摘录（本批滚动）

- **已偿 1 笔新增**：TD-2026-08-21-A（存量 clippy 告警 9 个——live_session_persist ×8 + series_detect ×1）在本次 v0.9.0 代码建设中全部清偿（clippy 零警告），close
- **新登记 open 0 笔**：审查发现 L2(区域构成信号暂缺)/L3(OCR 面积固定近似) 登记为观察项（M4 迭代），不登记正式债务
- **未偿 5 笔保持**（TD-040 / TD-2026-08-19-D/F/G）：本次未涉及 Rust 核心引擎/存储/UI，逐笔核验保持 carried

## 本批补充（第五轮：v0.10.1 编辑机制修复 + 笔记图片功能，2026-08-21）

**归档判定**：本批无文档归档——`docs/versions/v0.10.1.md` 为活跃版本规划（实施中）；`docs/product/note-design-philosophy.md` / `product-design-philosophy.md` 为活跃产品理念文档（持续引用非实施文档）；本次无已实施完成、不再活跃维护的新方案文档。

**工作摘要**：

- **0.10.1 规划定稿**（三轮探讨：编辑机制复杂度 / 浏览态价值 / 图片技术选型）→ `docs/versions/v0.10.1.md`
- **编辑机制修复 F1~F5**：串写（切笔记退出编辑 + key 重建 + 卸载 dirty 自动保存）、`create_version` 参数接通（自动保存不建版本，恢复 v0.10.0 状态一致性规范）、版本内容去重、完成按钮改名 + ESC 退出、Ctrl+E handler ref 稳定化
- **笔记图片功能**：`resolve_note_image`/`import_note_image`/`app_data_dir` 三命令（前缀白名单 + 归属校验 + 穿越防护 + 扩展名/大小限制）+ NoteImage 组件 + NotePreviewView 拼接修复（`session-images/` 前缀重复路径 v0.7.3 遗留疑点）+ 点击放大预览
- 验证：新增 8 单测全绿；cargo test 1359 passed / 12 failed（既有断言过时 → TD-2026-08-21-B）；clippy 新代码零警告；前端 tsc/build 通过

## 技术债摘录（本批滚动）

- **审查即修 3 项**：P0-1（NotePreviewView 图片 src 未转义 XSS 注入面 → escapeHtml 兜底）/ P2-1（async 按钮 void 包装）/ P2-2（indent 死代码），提交随 0.10.1 交付批次
- **新登记 open 1 笔**：TD-2026-08-21-B（v0.10.0 时间戳锚点断言过时 12 项）
- **未偿保持 4 笔**（TD-040 / TD-2026-08-19-D/F/G）；TD-2026-08-21-A 保持已偿（四轮 close）
- **观察项 +1**：卸载自动保存与在飞保存乱序（低概率，保持跟踪）


## 六轮补充（v0.10.2 结构图准确性重构，2026-08-21）

**归档判定**：本批无文档归档——`docs/versions/v0.10.2.md` 为活跃版本规划（代码已实施未发布，versions/ 不归档）；Foresight 全部文档活跃或已归档；screen-ocr spec 未实施完成。

**归档摘要**：

- **v0.10.2 结构图机制重构**：取消会话停止时的逐屏自动捕获（会话 33 实测 50%+ 结构图围绕字幕）；改为图库「分析参考图集」手动一键，直扫 full/ 全部归档帧；`decide_keep` 四层过滤（L3 位置约束 → L0 字幕块重叠拦截 → L1 版面类型 → L2 OCR 置信度反向信号）；删除 edge_energy/pick_sharpest/frame_candidates 旧管线死代码；`CaptureSummary.screens_scanned → images_scanned`；前端文案与事件同步（StructureImageSection）。
- **审查即修 2 项**：H1（L2 重叠判据过宽 → overlap_ratio ≥30% + 回归测试）/ M1（screen_id 语义注释同步）
- **验证**：structure_detect 14 + structure_capture 10 单测全绿；clippy 本次改动零警告；前端 tsc 通过

## 技术债摘要（本轮）

- **即修 2 笔**：审查 H1（L2 重叠判据）/ M1（screen_id 注释同步）
- **新登记 open 0 笔**：七维审查无遗留
- **未偿 4 笔保持**：TD-040 / TD-2026-08-19-D/F/G（TD-2026-08-21-A 已 close，TD-2026-08-21-B open 保持——锚点断言过时实测 16 项仍失败）
- **观察项 +3**：O(n²) 窗口扫描 / budgetExhausted 前端无提示 / _frame_w 冗余参数

## 本批补充（七轮：痛点图谱 v1.0 归档 + v2.0 产品蓝图沉淀，2026-08-21）

**归档 1 份**：

| 源路径 → 归档路径 | 归档原因/状态 |
|------|-----------|
| `docs/product/pain-points.md` → `docs/archive/2026-08-21/pain-points-v1.md` | **[ ] 已归档**——47痛点/26科学机制的产品规划顶层文档，已被 v2.0 三轮头脑风暴综合文档取代；v1.0 降级为历史参考与科学机制索引 |

**工作摘要**：
- **v2.0 产品蓝图沉淀**：`docs/product/pain-points-v2.md`——三轮头脑风暴综合文档：5个新镜头（跨周期/人群分/动机/内容/社会性）→ 20个新假设 N1-N20 → 交叉验证三堆产物 + 三个结构洞察（产品为稳态/熵减方向修正/隐喻分岔）→ 飞轮模型（叙事↔行为↔能力↔可见性）→ 九状态坐标系 + 三时钟 → 17节点三层架构（引擎层/飞轮层/骨折层）+ 实验序列（7裁决实验 + 熔断器）+ 四层指标体系 + 实施路线 Phase 0-4
- **v1.0 归档**：47痛点 + 26科学机制保留历史参照价值，活跃侧由 product/ 迁移至 archive/，product README 索引已更新

**技术债摘要（本批）**：
- **已偿 0 笔**：纯文档变更，无 Rust/前端代码改动
- **新登记 open 0 笔**
- **未偿 4 笔保持**（TD-040 / TD-2026-08-19-D/F/G）
