# v0.17.0 设计：AI 精修可到达度——策略化提示词 + 笔记级 AI 能力 + 流式会话化

> 状态：已批准（用户 2026-09-01 确认 11 项决策）
> 依据：用户对话——①「AI 精修提示词可选项」（例子具体程度/概念学术通俗/原文保留程度等）②「笔记页编辑模式使用 AI 精修（手写刚需）+ 知识补充并入编辑模式入口」③「精修会话化：跳转 AI 对话、显示所发送提示词、流式返回、完成后回到会话/查看笔记」④观众视角价值体系分析（作为旋钮设计依据）
> 复活扩展：v0.11.6 策略层设计（2026-08-22，已批准未实施）——本设计复活其声明式策略骨架并扩展为「目标层+档位层+旋钮层+流式会话化+笔记级」
> 关联：[ADR-026](../../adr/ADR-026-ai-refine-strategy-flow.md) · REQ-245/246/247 · 版本文档 v0.17.0（交付时写）· [v0.11.6 设计](./2026-08-22-v0.11.6-ai-platform-design.md)

## 一、目标与现状

**目标**：精修从「固定模板」升级为「用户可到达」——发起时选**目标/变化程度**，实时看到**提示词怎么变**，生成时**对话式流式呈现**，完成后**前后对比可溯源、可一键回会话/看笔记**；AI 能力从会话级扩展到**笔记级**（手写笔记刚需）。

**现状锚点**：
- `prompts/note_refine.json` v2：core_instruction + 5 风格（讲义/步骤/摘要/问答/纪要）+ profile_style 映射 + few_shot + output_format；`NoteRefinePrompt::build_system(profile)` 无用户可调参数
- `ai_refine_start(session_id, authorized)`：无策略参数；精修走 `chat_json` 整包 + 任务注册表轮询（无流式）
- `AiSettings`：无策略字段（结构体带 `#[serde(default)]`，旧 JSON 自动兼容）
- v0.16.1 已建：任务对话化（REQ-241，发起跳 AI 对话页）+ 轨迹只读视图（REQ-230，**完成后**写入 trajectory_json）+ 工作台深链（REQ-242）+ 追问（任务卡 10 分钟窗口）
- 笔记模型：`Note.source: manual|classroom`、`session_id: Option<i64>`（None=手写）、无 profile 字段；笔记图片前缀 **`notes-images/{note_id}/{name}`**（`resolve_note_image_path`）

## 二、策略层（REQ-245）

### 2.1 声明（单一事实源：prompts/note_refine.json 升级 v3）

```jsonc
"strategy_dims": [{
  "key": "examples", "label": "例子密度",
  "options": [
    { "value": "keep_all",  "label": "全保留", "instruction": "例子全部保留。" },
    { "value": "standard",  "label": "标准",   "instruction": "例子保留典型示例。" },
    { "value": "condensed", "label": "浓缩",   "instruction": "例子只保留一个典型示例并压缩说明。" } ],
  "default": "standard"
}],
"ladder_presets": [
  { "id": "faithful", "name": "忠实整理", "desc": "仅去口癖/碎句合并，句序句风原样", "dim_values": { "examples": "keep_all", "concept": "original", "colloquial": "verbatim", "emotion": "keep", "conclusion": "as_is", "sections": "inherit" } },
  { "id": "standard", "name": "标准精修", "desc": "去非知识+结构化（现状行为）", "dim_values": {} },
  { "id": "deep",     "name": "深度改写", "desc": "通俗转述+金句置顶+每节导语", "dim_values": { "concept": "plain", "conclusion": "summary_top", "colloquial": "light", "emotion": "light" } },
  { "id": "minimal",  "name": "极简提取", "desc": "只留骨架：概念/步骤/结论", "dim_values": { "examples": "condensed", "colloquial": "purified", "emotion": "drop", "conclusion": "as_is", "sections": "inherit" } }
],
"intents": [
  { "id": "verbatim",    "label": "原文保真", "keywords": ["原样","保真","不改"], "dim_values": { … = faithful } },
  { "id": "exam",        "label": "考点浓缩", "keywords": ["背","考点","复习"], "dim_values": { … = minimal } },
  { "id": "plain",       "label": "通俗转述", "keywords": ["通俗","说人话","白话","易懂"], "dim_values": { … = deep } },
  { "id": "quickref",    "label": "速查纲要", "keywords": ["速查","快查","纲要","检索"], "dim_values": { "examples": "condensed", "conclusion": "highlight_top" } },
  { "id": "golden",      "label": "金句摘录", "keywords": ["金句","金句","观点","语录"], "dim_values": { "conclusion": "summary_top", "emotion": "keep", "examples": "keep_all" } }
]
```

**维度集（6 旋钮，2-3 档）**：例子密度（keep_all/standard/condensed）· 概念表达（original 原文术语/academic 学术书面/plain 通俗白话）· 口语保留（purified 纯知识/light 轻留语气/verbatim 原文保真——无意义填充词永远硬删）· 情绪内容（drop/light/keep）· 结论优先级（as_is 原文顺序/highlight_top 章节内金句置顶/summary_top 摘要+置顶）· 章节结构（inherit 沿用/AI 归纳）

> 注入文案放 JSON（与 few_shot 同哲学：提示词可校准不进代码）；include_str 编译期捆绑，golden 测试防漂移。

### 2.2 新模块 `ai_strategy.rs`（纯函数，≤300 行）

```rust
pub struct StrategyOverride { pub preset_id: Option<String>, pub dims: HashMap<String, String> }  // serde camelCase
pub fn resolve(decl: &NoteRefinePrompt, over: Option<StrategyOverride>, global: &RefineStrategyPrefs) -> ResolvedDims
pub fn strategy_instructions(dims: &ResolvedDims, decl: &NoteRefinePrompt) -> String
pub fn resolve_intent(text: &str, decl: &NoteRefinePrompt) -> Option<ResolvedDims>
```

- 解析次序：任务覆盖 > 全局默认（AiSettings.refine_strategy）> 内置默认（standard）
- **非法值/未知 key → 回退默认**；intent 未命中 → None（前端诚实提示，不瞎猜）
- **L2 零变化保证**：standard 解析结果 = 空指令段落 → `build_system` **不追加任何内容**，与现状逐字节一致（golden 快照测试守护）

### 2.3 提示词组装

`core_instruction + style_system(profile) + strategy_instructions(dims) + few_shot + output_format`
（策略段落为空字符串时不追加；L3 示例注入文本见 §2.6 红线）

### 2.4 命令与设置

| 命令 | 变更 |
| :--- | :--- |
| `ai_refine_strategy_meta()` | **新增**：返回 strategy_dims/ladder_presets/intents 声明（后端单一事实源，前端渲染用） |
| `ai_refine_prompt_preview(session_id, strategy)` | **新增**：走 `build_system` 同一代码路径组装 → 预览与实发**逐字节一致**；笔记级另有 `profile` 传参 |
| `ai_refine_start(session_id, authorized, strategy: Option<StrategyOverride>)` | 增参；切片任务每片用同一 ResolvedDims（风格统一） |
| `AiSettings.refine_strategy: RefineStrategyPrefs { default_ladder, dim_overrides }` | 新字段（serde default，旧 JSON 零迁移）；经既有 `ai_update_settings` 落盘 |

### 2.5 目标 chips（书面命名，快捷键入）

**原文保真 / 考点浓缩 / 通俗转述 / 速查纲要 / 金句摘录** + 自由输入（本地关键词映射；未命中提示换话或点 chip）。

### 2.6 红线裁决

L3 允许**表达改写**（通俗转述/提炼金句/导语概括）——事实红线不动：不新增具体事实/数字/概念，术语与数据原样，不确定时保留原文表达；L4 只删不增。精修仍与知识补充严格区分。

## 三、笔记级 AI 能力（REQ-246）

### 3.1 入口

- **编辑态**（RichEditorView/NoteEditView 工具栏）：「🤖 AI」菜单 → `NoteAiDialog`（能力选择：AI 精修 / 知识补充 / 预留槽位）→ 精修=策略对话框、补充=九子项面板（EnrichPanel 交互搬入）
- **阅读态**：独立「✨ 知识补充」面板移除；用 AI 时点入口 → **直接进入编辑态 + 自动打开 NoteAiDialog**（一步到位）
- 会话页 AiRefineCard 保留（会话级基线=规则版）；聊天 `/refine` 保留（REQ-241）

### 3.2 笔记级精修管线

| 项 | 方案 |
| :--- | :--- |
| 输入 | 编辑器当前内容**直接传参**（`content: Option<String>`，未保存所见即所修；None=读库） |
| 基线/diff | 当前笔记版 vs 精修版（同段级 diff；工作台笔记级模式左栏=当前版） |
| 落库 | 版本链复用（source=ai-refine，可回滚） |
| 切片 | 沿用切片管线（章节优先；无章节按长度） |
| 档案 | profile=`handwritten`（见 3.3）；对话框「内容档案」下拉：默认手写笔记式，可切 5 种既有风格 |

### 3.3 handwritten 档案

- `styles` 新增 `"handwritten"`：「笔记式」——整理零散手写笔记为结构化知识：合并碎片、层级组织、保留原意、不补全缺失知识
- `profile_style` 映射 `"handwritten" → "handwritten"`；**采集端零改动**（视频档案 ProfileKind/检测器不新增、不显示）
- 仅笔记级 AI 精修请求使用；会话级不受影响

### 3.4 命令

`ai_note_refine_estimate(note_id, content?)` · `ai_note_refine_start(note_id, content?, authorized, strategy?)` · 复用任务表/事件/成本/审计；`AiRefineResult` 增 `strategy: Option<RefineStrategyInfo>`（serde default 向前兼容）。

### 3.5 协议扩展（唯一协议改动）

`AiRefineRequest`/`AiRefineResponse` 主体不变；**image 块前缀白名单化**：`session-images/`（既有） + `notes-images/`（笔记级）——validate 改白名单校验，向后兼容。

## 四、精修流式会话化（REQ-247，B+ 档）

### 4.1 通道

Tauri IPC 流式通道（与 `ai_chat_stream` 同机制）。帧类型：

| 帧 | 载荷 | 呈现 |
| :--- | :--- | :--- |
| `progress` | `{sliceIndex, sliceTotal}` | 「整理第 N/M 片…」进度行 |
| `block_done` | `{markdown}`（该片 validate 通过后的渲染） | 逐章正文流出 |
| `slice_failed` | `{sliceIndex, reason}` | 单片回退提示（诚实降级） |
| `done` | `{summary, diffStats}` | 消息定格为最终摘要 + 双入口 |

### 4.2 对话页流程

发起 → 跳 AI 对话页 → **消息 1（用户）= 提示词全文**（发起命令返回 system+user，立即显示）→ **消息 2（AI）= 片级解析流** → 完成**自动升工作台**（diff 同步打开，REQ-242 深链复用）→ 消息底部 **[回到会话] [查看笔记]** 双入口；追问保留（10 分钟窗口）。

### 4.3 后端

- `ai_refine_task` 改流式：逐片 `chat_stream`（模拟器/真模型同路径）→ 片完成 `validate` → 推 `block_done`；失败 → `slice_failed`（回退纯规则语义不变）
- 任务表语义**全保留**：幂等/去重/成本/审计/失败重试/终态 trajectory_json 落库（流式过程不承诺中间态，终态才记轨迹）
- 非流式路径保留（任务表注册制，避免对话未打开时无呈现）；流式=增强呈现，不是替代任务语义

### 4.4 工作台升级

- 溯源条：`本次档位：深度改写 · 例子=浓缩 · 概念=通俗白话 · 结论=摘要+置顶` +「查看完整提示词」→ 深链任务卡（REQ-242 focusTaskId，零新增存储）
- 笔记级模式：左栏=当前笔记版（含未保存传参快照）
- **再来一版·更/少干预**：重生成管线（v0.12.5 父级管线）—档位参数随上下文透传

## 五、前端组件清单

| 组件 | 状态 |
| :--- | :--- |
| `RefineStrategyPicker`（目标 chips + 档位卡 + 6 旋钮 + 偏离徽标） | 新（共享） |
| `NoteAiDialog`（能力选择：精修/补充） | 新 |
| `PromptPreview`（只读实时预览 + 复制；数据源=preview 命令） | 新（并入策略对话框） |
| `AiPreferenceSettings`（默认档位+默认微调，设置页 AI 服务区） | 新 |
| `RefineLaunchDialog`（策略对话框：picker+预览+成本） | 新（AiRefineCard/NoteAiDialog/任务发起共用） |
| `RefineWorkbench`（溯源条 + 笔记级模式 + 完成自动打开） | 扩展 |
| `ChatPage`（精修流式消息：提示词用户消息 + AI 流式消息 + 双入口） | 扩展 |
| `AiRefineCard`（接 RefineLaunchDialog）· `NotesPage`/`RichEditorView`（🤖 AI 菜单）· `NotesPage` auxPanels（EnrichPanel 移除） | 修改 |

## 六、测试计划

| 层 | 测试 |
| :--- | :--- |
| Rust 策略层 | resolve 回退链（缺省/非法/未知 key）· 每档×每旋钮指令快照 · **L2 组装与现状逐字节一致** · resolve_intent 命中/未命中 · meta/preview 命令 · start 透传 |
| Rust 协议 | image 前缀白名单（session-images/notes-images/非法）——既有用例平移扩展 |
| Rust 任务 | 流式帧顺序（progress→block_done→done）、slice_failed 降级、终态 trajectory 仍落库、非流式路径回归 |
| 前端 Vitest | chips→档位联动、偏离徽标、预览防抖刷新、记忆恢复、策略对话框提交参数、NoteAiDialog 能力选择、工作台溯源条、消息流渲染（mock 帧） |
| 全量回归 | 既有 refine_golden_tests 全绿；会话级精修（无流式路径）行为零变化 |

## 七、分期

| 期 | 内容 | 验收 |
| :--- | :--- | :--- |
| **M1** | 策略层：JSON v3 + ai_strategy.rs + 组装改造 + meta/preview/start 参数 + AiSettings 字段 + 单测（含 L2 零变化回归） | 会话级精修可选档位生效；L2 输出与现状一致；cargo test 全绿 |
| **M2** | 发起 UI：RefineStrategyPicker/RefineLaunchDialog/AiRefineCard 接入 + 记忆 + 实时预览 | 会话页精修可选目标/档位/旋钮，预览所见即所发 |
| **M3** | 笔记级：NoteAiDialog + 🤖 AI 菜单 + 手写档案 + ai_note_refine_* + 工作台笔记级模式 + EnrichPanel 迁移 | 手写笔记编辑态可精修/补充；阅读态入口直达编辑态 |
| **M4** | 流式会话化：通道帧 + 后端流式 + ChatPage 消息流 + 完成双入口 + 工作台自动打开 + 溯源条 + AiPreferenceSettings + 文档（ADR-026/REQ/版本文档） | 精修发起即跳对话、提示词立现、流式出正文、完成双入口；追问可用 |

## 八、不做清单与风险

**不做（YAGNI）**：enrich/text_filter 策略实例化（声明式已兼容，零成本扩展）· 可编辑提示词/自定义提示词入口 · 多档同时生成对比 · 档位间 diff · 裸 LLM 意图解析 · 块级增量 JSON 解析（C 档留升级桥：帧格式不变，仅换后端解析粒度）。

**风险与对策**：
- L3 通俗化事实歪曲 → 注入护栏句（事实/术语/数据原样，不确定保留原文）+ 版本链可回滚 + diff 可见
- 流式过程不承诺中间态 → 协议校验只在片级终态做；失败帧诚实提示（不黑盒）
- 提示词变长 ≈ +100 字/次 → 成本影响可忽略（预估沿用现有口径，不按档位精调——YAGNI）
- 编辑态传参与后续编辑失同步 → 采纳前快照提示 + 冲突刷新兜底
