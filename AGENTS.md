# AGENTS.md — 熵减重构区（Entropydecrease Rebuild）代理上下文

> 本文件是 AI 编程代理在本工作区的**最高执行指令**。所有代码生成、重构、文档、提交行为必须遵循本文件。规范细则见 `docs/standards/`。

## 0. 工作区铁律（最高优先级，违反即失败）

1. **旧项目存档只读**：`D:\Program own\aicode\work space\Entropydecrease-old` 下任何文件**不得改动**，仅作参照（2026-08-21 目录互换：原项目更名存档）。
2. **改动只在主工作区**：所有新增/修改必须发生在 `D:\Program own\aicode\work space\Entropydecrease -重构区`（2026-08-21 目录互换尝试后**保留原名**——IDE 工作区绑定稳定优先，AGENTS.md 第 2 节不变）。
3. **分支规范（2026-08-21 重构完成）**：开发在 `dev` 分支（重构区本地即 `dev`），发布在 `main` 分支（semantic-release 自动发布，`branches=["main"]`），旧代码存档在 `old` 分支（只读，禁止 push 到 old）。重构区的提交推送到 `https://github.com/Aparencia/Entropydecrease` 的 `dev`（日常开发）/`main`（发布）。
4. **规范与代码冲突时以规范为准**；规范过时时先改规范再改代码。

## 1. 项目概述

熵减（Entropydecrease）重构项目：面向**技能自学者**（化妆/编程/乐理/绘画等一切自我提升领域）的**视频知识提取与持久化**桌面应用。

- **核心理念**：本地优先 + 数据不出本机 + AI 为增强层
- **MVP 核心**：课堂助手（屏幕+音频捕获 → 本地 ASR 转写 → 本地 OCR → 内容本地拼接 → 笔记）+ 间隔重复闪卡（知识持久化）
- **MVP 成功标准**：视频知识提取与持久化达到市场级（对标通义听悟/讯飞听见）
- 产品依据：`docs/product/`（痛点图谱/MVP 画布/PRD/需求池）
- 技术决策依据：`docs/archive/2026-08-19/market-stack-asr-notes-research.md`（[ ] 已归档，2026-08-19 裁决完成）

## 2. 技术栈（2026-08 已裁决，改动需 ADR）

| 层 | 选型 | 说明 |
|----|------|------|
| 桌面壳 | **Tauri 2 + React + TypeScript** | 替代原项目 Electron |
| 后端/系统层 | **Rust** | Tauri 主进程 |
| 本地 ASR | **sherpa-onnx crate** | 流式 Zipformer（zh 2025-06 fp16）+ 能量自适应 VAD + SenseVoice 重打分/导入全窗两遍 + hotwords（实现口径 2026-09-03 修订，ADR-030；Silero VAD 未接线） |
| 本地 OCR | **paddle-ocr-rs（PaddleOCR PP-OCRv5/v6 ONNX）** | 关键帧文字检测+识别 |
| 本地数据库 | **SQLite**（rusqlite / sqlx） | 音频/转写/笔记/卡片全本地 |
| AI 笔记增强 | 云端多模态（Qwen-VL 系），**不用 Ollama** | 增量+课后精修，离线降级本地拼接 |
| 本地拼接 | 纯本地规则拼接转写+OCR | 无 LLM 依赖的降级路径 |
| 模型分发 | **随安装包捆绑**（bundle.resources + 首启同步到数据目录）；OCR 模型经 ModelScope 自动缓存 | 开发期可手动下载放入 src-tauri/models/（不入库） |
| 推理引擎架构 | 专用线程常驻引擎池（engine.rs）：模型只加载一次，规避 FFI Send/Sync | 字幕检测策略：有字幕优先、无字幕才 ASR（v0.3.0） |

## 3. 代码生成七维度（硬性标准，源自 standards/ai-coding.md）

生成/重构任何代码必须同时满足：

1. **模块化**：单文件 ≤300 行（>600 行必须硬拆；300-600 行登记豁免清单）；纯逻辑与副作用物理分离；显式依赖注入。
2. **强类型契约**：业务术语贯穿全栈；禁止 `any`/无类型；入参出参必须定义类型（TS interface / Rust struct）。
3. **上下文注释**：注释解释 Why 不解释 What；公共函数/模块必须含 `@ai-context` 业务背景注释；标注副作用与边界条件；Magic Number/Hack 必须说明原因。
4. **防御性编程**：网络/DB/AI/系统调用必须有超时、重试、降级（Fallback）；本地优先架构下所有云端能力必须有本地兜底路径。
5. **可测试性**：业务逻辑必须配测试（AAA 模式：Arrange/Act/Assert）；覆盖空值/越界/边界；复杂需求先写测试再实现。
6. **自底向上工作流**：复杂需求按 原子层（类型/纯函数）→ 业务层（service/hook）→ 系统层（command/UI）顺序生成，不可跳步。
7. **环境隔离**：禁止硬编码连接串/密钥/端点；配置走环境变量注入；测试严禁直连真实生产数据（用 Mock/内存库）。

## 4. 安全红线（绝不允许，源自 ai-coding.md 第一部分 + security.md）

- 硬编码密钥/密码/token
- `eval()`/`exec()` 等动态执行
- 未验证输入直接拼接 SQL/命令
- 空 catch 块 / 忽略错误
- 明文存储敏感数据
- 用户学习数据上传云端（本地优先是架构属性，非营销话术；AI 调用须用户授权且默认关闭）
- Tauri IPC：所有 command 必须校验入参；文件系统访问限定应用数据目录

## 5. Git 提交规范（源自 standards/git-workflow.md）

- **格式**：`<type>(<scope>): <subject>`（Conventional Commits），subject ≤50 字、动词开头、不加句号
- **type**：feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert
- **原子提交**：一个提交只做一件事，能通过编译和测试；禁止 "update code"/"wip"
- **分支**：当前开发在 `dev`；发布线 `main`（semantic-release，禁止直接开发）；旧代码存档 `old`（只读）；大功能（>2 天）开 `feature/*`；禁止 force push（分支重构等例外需用户明确授权）
- **.env / 密钥 / 模型大文件**：永不入库（模型走下载脚本或 .gitignore + LFS）

## 6. 文档规范（源自 standards/documentation.md）

- 文档与代码在同一提交中更新；架构变更须同步文档 + 写 ADR
- 产品文档在 `docs/product/`，前瞻/调研在 `docs/Foresight/`，决策在 `docs/adr/`
- 新文档从 `docs/templates/` 复制模板；文档变更尽量过 `docs-check`
- 注释解释 Why；不写日志式注释（"2026-08-18 张三改"）

## 7. 测试规范（源自 standards/testing.md）

- Rust：`cargo test`；关键纯逻辑（拼接、SM-2 调度、VAD 切段）必须有单测
- 前端：Vitest；交互组件覆盖关键路径
- 测试隔离：Mock 外部依赖（ASR/OCR/DB），不依赖真实模型文件做单测（模型相关用集成测试标注）

## 8. 第一阶段任务（v0.1.0 MVP）

| # | 任务 | 说明 |
|---|------|------|
| 1 | 课堂助手·本地 ASR | sherpa-onnx 离线/流式转写（先文件输入验证，后接系统音频） |
| 2 | 课堂助手·本地 OCR | paddle-ocr 关键帧文字识别（paddle-ocr-rs 上游 ndarray 冲突，接口已 stub，oar-ocr spike 中） |
| 3 | 课堂助手·内容本地拼接 | 转写 + OCR 纯本地规则拼接为笔记初稿（无 LLM） |
| 4 | 笔记·基本功能 | 笔记 CRUD + Markdown 渲染 + 搜索 |
| 5 | 课堂助手 ↔ 笔记联动 | 会话产出的拼接内容一键落入笔记 |

> 系统音频捕获（WASAPI 环回）、屏幕捕获、间隔重复闪卡为后续阶段，不在第一阶段。

## 9. 本地验证命令

```bash
# Rust 侧（app/src-tauri/ 下；SHERPA_ONNX_ARCHIVE_DIR 已由 .cargo/config.toml 自动注入）
cargo build          # 编译
cargo test           # 单元测试（拼接 + 笔记）
cargo clippy         # lint

# 前端侧（app/ 下）
npm run dev          # Tauri 开发模式（需先 npm install）
npm run build        # 前端构建
```

> 网络环境注意：本机存在 TLS 拦截，Rust 侧从部分 CDN 在线下载预编译库会失败（UnknownIssuer）。
> sherpa-onnx 已通过 `sherpa-archive/` 本地库 + `.cargo/config.toml` 解决；OCR 库接入时同样优先本地库方案。

## 10. 变更需额外审查的文件

- `src-tauri/tauri.conf.json` — 应用配置/权限边界
- `src-tauri/src/lib.rs` / `main.rs` — Tauri command 注册（IPC 安全边界）
- `src-tauri/src/windows.rs` — 窗口/进程枚举（系统句柄与进程查询，TD-002 补登）
- `src-tauri/src/live_session*.rs`、`src-tauri/src/capture/` — 音频/屏幕捕获系统调用模块（权限与隐私敏感）
- SQLite schema / 迁移 — 数据兼容
- `.github/workflows/`（如有）— CI/CD
- `docs/product/`、`adr/` — 产品与架构决策

## 11. 约定

- 提交信息遵循 Conventional Commits；版本号由第一阶段起手动维护 SemVer
- AI 功能必须支持离线降级（本地优先原则）
- 单文件 ≤300 行；源码文件含 `@ai-context` 业务背景注释
- 重构/拆分遵循自底向上（原子→业务→系统），公共 API 保持兼容
- 任何技术栈/架构级变更先写 ADR（`docs/adr/`）再动手
