# 熵减 · Entropydecrease

> 面向**技能自学者**的视频知识提取与持久化桌面应用 —— 把「看完就忘」变成「学完即得」。
> 观看教学视频（B 站 / 网课 / YouTube）自学化妆、编程、乐理、绘画等任何技能时，课堂助手自动捕获屏幕与音频，本地转写 + 本地识别 + 内容拼接，一键产出结构化笔记；数据全程留在本机。

[![CI](https://github.com/Aparencia/Entropydecrease/actions/workflows/pr-check.yml/badge.svg?branch=dev)](https://github.com/Aparencia/Entropydecrease/actions/workflows/pr-check.yml)
[![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-orange.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-dea584?logo=rust&logoColor=white)](https://www.rust-lang.org)

---

## 核心理念

| 原则 | 含义 |
|------|------|
| **本地优先** | ASR / OCR / 拼接 / 存储全部本地完成，无网络也能用 |
| **数据不出本机** | 音频、转写、OCR、笔记全部存于本地 SQLite；AI 调用需用户显式授权且默认关闭 |
| **AI 为增强层** | 云端多模态仅做「精修 / 知识补充」等增强，失败自动降级到纯本地拼接路径 |

产品文档：[PRD](docs/product/prd.md) · [痛点图谱](docs/product/pain-points.md) · [MVP 画布](docs/product/mvp-canvas.md)

## ✨ 核心能力

### 课堂助手（视频知识提取）

```
屏幕关键帧捕获 ─┐
               ├─► 本地 ASR 转写 ─► 双源融合 ─► 内容拼接 ─► 笔记初稿
系统音频捕获 ───┘   （有字幕则跳过 ASR，字幕优先）
```

- **本地流式 ASR**：sherpa-onnx（流式 Zipformer + Silero VAD + SenseVoice 两遍解码 + hotwords 热词）
- **本地 OCR**：PaddleOCR PP-OCRv5/v6（关键帧文字检测识别，GPU 可卸载）
- **字幕优先策略**：检测到字幕先走 OCR 字幕，无字幕才启动 ASR，节省算力
- **双源融合**：转写 + OCR 按时间线纯本地规则拼接为笔记初稿（无 LLM 依赖）
- **视频档案四维解耦**（v0.9.0）：形态 7 类 × 画面价值 4 档 × 领域 15 类 × 语言；画面价值三信号自动检测、动态调档、领域热词预热

### 笔记体系（知识持久化）

- 会话 → 笔记一键落库，Markdown 渲染 / 源码编辑双模式
- **版本链**：每次编辑自动建版本快照，diff 对比、一键回滚（50 版上限）
- **AI 增强**（可选）：AI 精修双模式（预览 / 落库同基线）+ 知识补充九子项，采纳前 diff 预览、成本确认、全程审计
- **时间戳回链**（v0.10.0）：笔记段落 ↔ 会话视频时间点双向跳转
- FTS5 全文搜索、标签、大纲面板、任务列表勾选

### 数据主权

- 全部数据存本地 SQLite（`notes` / `sessions` / `notes_versions` / `ai_usage`…）
- AI 密钥经 Windows DPAPI 加密存储，明文永不落盘
- 云端能力（AI 精修 / 知识补充）默认关闭，授权后才可用，且只上传最小文本上下文

## 🏗 技术栈

| 层 | 选型 |
|----|------|
| 桌面壳 | **Tauri 2**（替代原 Electron 版） |
| 前端 | React 19 + TypeScript + Vite |
| 后端 / 系统层 | Rust（Tauri 主进程，引擎池常驻线程） |
| 本地 ASR | sherpa-onnx crate（流式 Zipformer + Silero VAD + SenseVoice 两遍解码） |
| 本地 OCR | paddle-ocr-rs（PaddleOCR PP-OCRv5/v6 ONNX） |
| 本地数据库 | SQLite（rusqlite，含 FTS5） |
| AI 增强 | 云端多模态（Qwen-VL 系，SiliconFlow 网关），不用本地 LLM |
| 模型分发 | 随安装包捆绑 + 首启同步；开发期脚本下载 |

## 📁 仓库结构

```
├── app/                    # Tauri 桌面应用
│   ├── src/                #   React 19 前端（页面/组件/类型）
│   └── src-tauri/          #   Rust 主进程（引擎池/ASR/OCR/捕获/存储/AI）
├── server/                 # 服务端部署配置（docker-compose / nginx / deploy.sh，不含业务代码）
├── docs/                   # 文档体系（见「文档导航」）
├── scripts/                # 辅助脚本（docs-check / version-bump / 学习会话检测）
├── .github/workflows/      # CI/CD：pr-check（前端/Rust/文档三 job）+ release（NSIS 打包）
├── .husky/                 # 提交门禁（commitlint + lint-staged）
└── package.json            # 仓库级发布工具链（semantic-release）
```

## 🚀 快速开始

### 前置要求

- Windows 10/11（当前主力平台；WASAPI 环回 / DXGI 屏幕捕获为 Windows 原生能力）
- [Rust stable](https://www.rust-lang.org/tools/install)（含 MSVC 工具链）
- [Node.js 20+](https://nodejs.org/) 与 npm

### 开发运行

```bash
cd app
npm install

npm run tauri dev        # Tauri 开发模式（前端 + Rust 热重载）
npm run build            # 前端类型检查 + 构建（tsc + vite build）
```

### Rust 侧验证

```bash
cd app/src-tauri
cargo build              # 编译
cargo test               # 单元测试（拼接 / 切片 / 版本链 / 成本估算等纯逻辑）
cargo clippy             # lint（要求零警告）
```

> 单测不依赖真实模型文件（模型相关用集成测试标注）；`AI_REFINE_MOCK=1` / `AI_ENRICH_MOCK=1` 可离线走 AI 链路开发。

### 模型下载（开发期）

模型文件不提交仓库，通过脚本下载后放入 `app/src-tauri/models/`：

```bash
# 流式 ASR 模型 / 标点模型 / 说话人模型 / ffmpeg（按需执行）
node app/scripts/download-streaming-asr.mjs
node app/scripts/download-punctuation.mjs
```

> 网络注意：本机存在 TLS 拦截时 Rust 侧在线下载预编译库可能失败；sherpa-onnx 已通过 `sherpa-archive/` 本地库 + `.cargo/config.toml` 解决。

## 🔀 分支与发布

| 分支 | 用途 |
|------|------|
| `dev` | 日常开发主线（默认分支），所有功能开发在此进行 |
| `main` | 发布线：合并后由 semantic-release 依据 Conventional Commits 自动版本化，生成 CHANGELOG 并触发 Tauri NSIS 打包发布 |
| `old` | 旧 Electron 版代码存档（只读，仅作参照） |

- 提交规范：[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（`<type>(<scope>): <subject>`），husky + commitlint 强制门禁
- 大功能（>2 天）开 `feature/*` 分支，完成后合入 `dev`

## 🧭 文档导航

| 入口 | 内容 |
|------|------|
| [docs/](docs/README.md) | 文档体系总览（维护节奏 / 写作规范） |
| [docs/product/](docs/product/README.md) | 产品文档：PRD / 痛点图谱 / MVP 画布 / 需求池 |
| [docs/adr/](docs/adr/README.md) | 架构决策记录（ADR-001 ~ ADR-016） |
| [docs/standards/](docs/standards/README.md) | 工程规范（ai-coding / testing / git-workflow / security 等 20+ 篇） |
| [docs/versions/](docs/versions/README.md) | 版本深度文档（v0.1.0 ~ v0.16.1） |
| [docs/archive/](docs/archive/README.md) | 归档机制（每日快照 + 技术债滚动清单） |
| [CHANGELOG.md](CHANGELOG.md) | 全量变更流水账 |

## 🗺 当前状态

重构进行中：原 Electron 版已存档至 `old` 分支，当前为 Tauri 2 全量重写。

- **已交付**：本地提取链路（ASR + OCR + 拼接 + 笔记）→ 系统实时捕获（WASAPI + DXGI + 流式 ASR + 字幕 OCR + 双源融合 + 会话）→ AI 精修 / 知识补充 / 版本链 / 成本与审计 → 视频档案四维解耦 v2（v0.9.0，cargo test 1352 全绿 + clippy 零警告）
- **进行中**：v0.10.0 笔记能力建设（Markdown 渲染 / 编辑 / 时间戳回链 / 标签）——[规划文档](docs/versions/v0.10.0.md)
- **后续**：间隔重复闪卡（SM-2）、回顾流、AI 问答等

## 📜 许可证

本项目采用 **BUSL-1.1**（[Business Source License 1.1](https://opensource.org/license/busl-1-1)），全文见根目录 [LICENSE](LICENSE)。
