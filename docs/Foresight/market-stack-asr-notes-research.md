# 市场相关软件技术栈 / ASR 转写策略 / AI 笔记生成策略调研报告

> **状态**: 前瞻构想（未排期，作为重构区技术决策参考）
> **调研时点**: 2026-08（信息窗口以检索时点公开资料为准）
> **调研背景**: 重构区技术栈已裁决 Tauri 2 + React + Rust；本地 ASR 优先；AI 笔记生成采用云端多模态（不用 Ollama）。本报告为以上决策提供市场依据与落地路径。
> **参考**: 原项目《语音识别技术与市场调研报告（2025-2026）》（asr-market-2025-2026.md）为本地 ASR 模型选型的基础素材，本文不重复其模型细节，聚焦市场软件的技术栈与策略模式。

---

## 一、调研范围与方法

- **对象**: 主流音视频内容转写/笔记产品（Otter.ai、通义听悟、讯飞听见、飞书妙记、腾讯会议、Fireflies.ai、Notta）与本地转录工具（Buzz、MacWhisper）
- **维度**: ① 技术栈（形态/前端/后端）② ASR 转写策略（自研 vs 开源 vs 第三方 API；本地 vs 云端）③ AI 笔记生成策略（模型与架构模式）
- **方法**: 官网/官方文档/技术博客/开源社区检索；厂商不公开部分标注"未公开/推断"，不做猜测性断言

---

## 二、竞品技术栈总览

| 产品 | 形态 | ASR 方案 | 笔记/摘要 LLM | 技术栈线索 | 提取→持久化闭环 |
|------|------|---------|---------------|-----------|----------------|
| Otter.ai | Web + 移动端 + 浏览器插件 | 自研（2024 年并入 NVIDIA 后与 Riva/NeMo 语音体系整合） | GPT-4 系（2023 官宣合作：摘要/行动项/AI Chat 多轮问答） | 云 SaaS；React 系前端 | ❌ 无间隔重复，行动项导出为主 |
| 通义听悟 | Web + Chrome 插件 + 小程序 | 阿里自研 **Paraformer 系**（流式+离线，SeACo 热词），API 0.6 元/小时 | **Qwen 系**：全文摘要/章节速览/发言总结/问答回顾/PPT 抽取/思维导图 | 阿里云；听悟 API 开放千问摘要能力 | ❌ 导出为主，无复习闭环 |
| 讯飞听见 | 客户端 + Web | 自研**深度全序列卷积神经网络（DFCNN）**+记忆增强多通道端到端；实时转写仅在线 | **讯飞星火**：语篇规整（口语→书面）、纪要生成 | 讯飞开放平台；按分钟计费 0.33 元/分 | ❌ |
| 飞书妙记 | Web + 客户端（深度绑定飞书） | 字节 **Seed-ASR**（LLM 架构 ASR，2024 论文：2kw 小时自监督 + 90w 有监督；火山引擎豆包 ASR API 开放） | **豆包（Seed-LLM）系**：纪要/章节/待办 | 字节云 | ❌ |
| 腾讯会议 | 客户端（绑定会议生态） | 腾讯自研 ASR（智能录制/实时转写） | **混元大模型**（AI 小助手 Pro：问答/实时总结/待办） | 腾讯云 | ❌ |
| Fireflies.ai | Web + 会议机器人 | 第三方 ASR（Deepgram/AssemblyAI 级别，具体供应商未公开） | 自研 LLM 管线（摘要/行动项/CRM 集成/可检索知识库） | 云 SaaS；RAG 检索是其卖点 | ❌ |
| Notta | Web + 移动 | 第三方 ASR（供应商未公开） | 自研摘要 | 云 SaaS | ❌ |

**关键结论**：
1. **全部主流竞品都是云端处理**——"数据不出本机"在竞品中不存在，这是本地优先产品的结构性叙事优势（原项目竞品调研已确认）
2. **无一打通"提取→间隔重复"闭环**——转写/摘要产出即结束，复习环节全部缺失（原项目课堂助手路线图 P2-3 确认"无任何竞品打通重点→间隔重复"）
3. **大厂全部自研 ASR**（讯飞 DFCNN / 阿里 Paraformer / 字节 Seed-ASR），中小 SaaS 用第三方 API——自研是质量与成本控制的关键，开源引擎（Paraformer/Zipformer 开源）是打破自研门槛的路径

---

## 三、ASR 转写策略调研

### 3.1 市场三种模式

| 模式 | 代表 | 特点 | 成本 | 适用 |
|------|------|------|------|------|
| 自研深度模型 | 讯飞 DFCNN、阿里 Paraformer、字节 Seed-ASR | 质量天花板高；热词/方言/混说可定制；需大规模数据与算力 | 极高（亿级投入） | 大厂 |
| 开源引擎部署 | sherpa-onnx（Zipformer/Paraformer/SenseVoice）、whisper.cpp、faster-whisper | 端侧/本地事实标准；Apache-2.0/MIT；CPU 可跑；中文 CER 5-20% 可接受 | 低（模型下载 + 开发） | 桌面/端侧产品（本方案） |
| 第三方 API | 阿里云/讯飞/Deepgram/AssemblyAI | 开箱即用；按分钟计费（阿里 0.6 元/小时，Deepgram $0.15-0.37/h）；数据出境 | 低起步、随量增长 | 云端产品/兜底精修 |

### 3.2 本地转写策略（sherpa-onnx 生态，2026 年端侧事实标准）

原项目 2025-2026 调研的核心结论（重构区沿用）：

| 组件 | 选型 | 说明 |
|------|------|------|
| VAD | Silero VAD | 2MB ONNX、噪声鲁棒，本地流式首选 |
| 流式 ASR | Zipformer（icefall 中文）或流式双语 Paraformer | 原生流式，延迟数百 ms；双语 `x-asr-zh-en-streaming-zipformer2` 已覆盖混说 |
| 离线高精度 | Paraformer-large（FunASR 导出） | 中文开源榜首 |
| 两遍解码 | 流式出实时结果 + 句末 SenseVoice-Small 重打分 | 兼顾实时性与整句精度，官方 two-pass 示例 |
| 热词 | sherpa-onnx hotwords（transducer 系上下文图偏置） | 课堂/技能术语识别的关键机制 |

**Rust 侧可行性（已核实）**：`sherpa-onnx` crate（v1.13.5）提供安全 Rust 绑定，**静态链接开箱即用**（构建脚本自动下载 Windows x64/macOS/Linux 预编译库），覆盖：离线 ASR（OfflineRecognizer）、流式 ASR（OnlineRecognizer）、VAD（Silero/语音活动检测）、标点恢复（在线/离线）、说话人分离、去噪、关键词检测、语种识别。官方 Rust 示例含 streaming_zipformer、sense_voice、silero_vad 等——**Tauri + Rust 本地 ASR 全链路可行，无需 C FFI 手写绑定**。

### 3.3 趋势（2025-2026）

- **大模型 ASR 崛起**：Qwen3-ASR（0.6B-8B）、字节 Seed-ASR 采用 LLM 架构，对噪声/混说/上下文理解显著提升，但资源占用高（≥1.7B），适合服务器端而非弱网端侧
- 本地端侧仍是 Zipformer/Paraformer/SenseVoice 的天下；Qwen3-ASR 后续可作云端降级链的增强项

---

## 四、AI 笔记生成策略调研

### 4.1 市场四种架构模式

| 模式 | 代表 | 机制 | 优点 | 缺点 |
|------|------|------|------|------|
| **全文后处理总结**（主流） | 通义听悟、飞书妙记、讯飞、Otter | 会/课后全文转写 → LLM 一次性生成摘要/章节/待办 | 质量稳定、成本可控（一次调用）、可精细排版 | 非实时，课后才能看到笔记 |
| **增量实时生成** | 熵减原项目（每 5 帧增量分析） | 课中按片段持续分析合并 | 边学边出笔记、可课中修正 | 上下文碎片化、成本高、合并质量波动 |
| **RAG 问答**（增强层） | Otter AI Chat、通义问答回顾、Fireflies 知识库 | 转写+笔记向量化检索 → 多轮问答/引用定位 | 交互式提取、跨会话检索 | 依赖检索质量；竞品按次限额（Otter 免费 20 次/月） |
| **多模态增强** | 通义 PPT 抽取、熵减原项目关键帧 OCR | 幻灯片/屏幕关键帧与转写融合 | 图文并茂，结构化程度高 | 多模态模型成本高 |

### 4.2 竞品 LLM 选型对照

- 通义听悟 → Qwen 系（同生态 ASR+LLM，Paraformer 转录 + Qwen 摘要，API 已开放"千问摘要/要点提炼/PPT 抽取"）
- 飞书妙记 → 豆包（Seed-LLM）；讯飞 → 星火；腾讯会议 → 混元；Otter → GPT-4
- **模式共性**：笔记生成全部由**云端大模型**完成（无本地 LLM 方案），多模态能力（视觉理解）集中在通义/腾讯等有视觉模型的厂商

### 4.3 对重构区的启示

- **MVP 采用"增量实时 + 课后精修"混合**：课中增量笔记（即时感）→ 课后云端多模态全文重生成（质量兜底）——兼顾交互与质量
- **RAG 问答为 V1.0 增强项**（REQ-015），可复用本地 SQLite 全量过程数据，无云端检索依赖
- **不用 Ollama 本地 LLM 的决策与市场一致**：市场无任何主流产品用本地 LLM 做笔记生成；本地小模型多模态能力弱，笔记质量风险高

---

## 五、本地转录桌面工具参考（与 Tauri 方案最接近的形态）

| 工具 | 技术栈 | ASR | 与我们的差异 |
|------|--------|-----|-------------|
| Buzz（开源） | Python + Go GUI | whisper.cpp / faster-whisper / Whisper API（可切换） | 文件导入→离线转写；无流式、无系统音频捕获、无笔记闭环；安装包 261MB（Win） |
| MacWhisper | Swift（macOS） | whisper.cpp | 本地转写标杆；仅 macOS、仅文件导入 |
| sherpa-onnx 桌面示例 | C++/Python/（Rust 绑定） | Zipformer/Paraformer/SenseVoice 全系 | 官方 API 示例级，非完整产品 |

**结论**：本地转录桌面工具已被验证可行（Buzz/MacWhisper 证明本地转写是真实需求且体验可商用），但**无一流式捕获系统音频**（均需先有音频文件）。"视频学习时实时捕获屏幕+系统音频"是通义插件之外的差异化场景——通义插件只能捕获 Tab 音频，我们的**端点环回可捕获整个系统的声音**（含播放器、弹幕音效场景）。

---

## 六、对重构区 Tauri 方案的落点

| 决策点 | 市场依据 | 重构区方案 |
|--------|---------|-----------|
| 桌面壳 Tauri 2 + Rust | 本地转录工具证明原生形态可行；Web 无法捕获系统音频/任意窗口（通义插件仅 Tab 级） | Tauri 2 + React + Rust |
| 本地 ASR | sherpa-onnx 是端侧事实标准；Rust crate 静态链接开箱即用 | sherpa_onnx crate：流式 Zipformer + Silero VAD + SenseVoice 两遍解码 + hotwords 热词 |
| 系统音频捕获 | 竞品全云端/插件仅 Tab 级；本地无现成产品 | Rust 侧 WASAPI 端点环回（新开发点，原项目 Electron 的 getDisplayMedia 方案不可复用） |
| 笔记生成 | 市场全部云端大模型；本地 LLM 无先例 | 云端多模态（Qwen-VL 系）增量+课后精修；离线降级本地拼接 |
| 持久化闭环 | 竞品无一打通提取→间隔重复 | 闪卡 SM-2 是独有差异化 |

## 七、风险与开放问题

| 风险 | 说明 | 缓解 |
|------|------|------|
| WASAPI 环回在 Tauri/Rust 生态样例少 | 原项目 getDisplayMedia loopback 已验证但不可复用 | 先用 `cpal`/windows crate 做 spike；备选：WebView2 内嵌方案评估 |
| 本地 ASR 中文 CER 5-20% | 市场常态（厂商 98% 是宣传口径） | 热词表 + 两遍解码 + 云端兜底精修 |
| 云端多模态笔记成本 | 视频学习高频场景用量大 | 增量降频 + 课后一次性精修；成本透明化（用量分层） |

## 八、来源清单

- sherpa-onnx：https://github.com/k2-fsa/sherpa-onnx （v1.13.5，Apache-2.0）
- sherpa-onnx Rust crate：https://docs.rs/sherpa-onnx （静态链接开箱即用，Windows x64 库提供）
- 原项目 asr-market-2025-2026.md（模型选型细节、热词机制、两遍解码）
- 原项目 classroom-assistant-competitive-analysis.md（竞品功能/定价/体验对标）
- 通义听悟官网与发布记录：https://tingwu.aliyun.com/ 、https://help.aliyun.com/zh/tingwu/release-notes
- 讯飞开放平台（DFCNN 语音转写）：https://www.xfyun.cn/service/lfasr
- 字节 Seed-ASR（飞书文档/论文）：https://arxiv.org/abs/2503.18462
- Buzz（开源本地转录）：https://github.com/chidiwilliams/buzz
- NVIDIA 音频转录工作流（Riva ASR）：https://www.nvidia.cn/ai-data-science/ai-workflows/audio-transcription/

*调研时点信息窗口：2026-08；价格为快照，落地前以官网最新计费页为准。*
