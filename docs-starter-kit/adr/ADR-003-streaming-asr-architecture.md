# ADR-003: 流式 ASR 引擎与模型分发方案

## 状态

已接受（Accepted，2026-08-18）

## 日期

2026-08-18

## 背景

v0.2.0（REQ-009）需要流式实时转写：边说边出（partial），端点断句产出 final 段。技术约束：

- sherpa-onnx crate 已引入（1.13，离线 SenseVoice 转写在 v0.1.0 已验收），流式需用 `OnlineRecognizer`（Zipformer transducer 中英双语，支持热词增强）
- 模型分发：v0.1.0 的 SenseVoice int8 已随 `sherpa-archive/` 本地库 + 数据目录手工放置解决；Zipformer 流式模型约 650MB 需新增获取路径
- 本机 TLS 拦截：GitHub Release / HuggingFace 直连下载失败（UnknownIssuer），需走国内镜像（hf-mirror.com）
- 原项目已验证的流式流程（`streamingAsr.ts`）：partial 节流推送（≥150ms 间隔 + 文本变化才推）、端点断句 final + 重建流、静音隔块喂入（降低 CPU）、尾句 flush 去重、SenseVoice 整句重打分（P1-1）

## 决策

我们将用 sherpa-onnx `OnlineRecognizer` + `OnlineZipformerTransducerModelConfig` 实现流式 ASR，并把原项目已验证的流程移植为 Rust 模块 `streaming_asr.rs`：

1. **引擎架构**：沿用 v0.1.0 的 engine.rs 专用线程模式——在线识别器在引擎线程独占持有（规避 FFI Send/Sync），新增 `EngineRequest::StreamFeed` / `StreamReset` / `StreamFlush` 请求类型
2. **流状态机**：`accept_waveform` → `while is_ready { decode }` → `is_endpoint` 命中 → `get_result` 取 final → 重建流（支持热词）；未命中 → partial 文本（节流推送）
3. **事件输出**：`StreamingAsrEvent::{Partial{text}, Final{text}}`（时间戳由编排层按会话时钟标注——实现简化），经 Tauri event 推送到前端
4. **VAD 与静音优化**：Silero VAD（sherpa-onnx `VoiceActivityDetector` 或独立 silero_vad.onnx 经 ort）判静音；静音块隔块喂入（参照原项目 SILENT_FEED_SKIP_COUNT=1），非静音全量喂入
5. **质量兜底**：端点断句后可选 SenseVoice 整句重打分（复用 v0.1.0 离线引擎，一致性校验通过才替换）
6. **模型分发**：
   - 目录约定：`models/streaming-zipformer/`（encoder/decoder/joiner/tokens 四件套），与 SenseVoice 同级
   - **模型选型（2026-08 升级）**：`csukuangfj/sherpa-onnx-streaming-zipformer-zh-fp16-2025-06-30`（2025-06 新版中文 zipformer fp16，替代 2023-02-20 旧双语包——性能与准确性显著提升；文件 `encoder/decoder/joiner.fp16.onnx` + `tokens.txt`）
   - 下载脚本 `scripts/download-streaming-asr.mjs`：hf-mirror.com 国内镜像逐文件下载（.part 原子写入 + Content-Length 校验），备选 ModelScope
   - 应用内自动下载：`download_streaming_model` command 后台线程下载，进度经 `model:download-progress` 事件推送，前端一键配置（无需手动跑脚本）
   - 应用内提供"模型状态"command：`asr_streaming_model_status()` 返回 `{ ready, missing }`，未就绪时前端给出下载引导
   - 模型文件不入库（.gitignore），与 AGENTS.md §5 一致

## 备选方案

### 方案 A：Zipformer transducer 流式 + SenseVoice 重打分（选择）
- 优点：原项目已生产验证（延迟 <200ms、热词增强、重打分质量兜底）；sherpa-onnx 官方支持；中英双语
- 缺点：模型 ~650MB 下载成本；流式 CER 弱于离线大模型（靠重打分补偿）
- 适用场景：课堂实时字幕（本阶段主场景）

### 方案 B：仅离线 SenseVoice 按块转写（模拟流式）
- 优点：零新模型（v0.1.0 已就绪），SenseVoice 整句准确率高
- 缺点：无 partial 实时性（需等块结束才出结果）；无端点断句（切块边界不可控）；CPU 峰值高
- 适用场景：模型未就绪时的降级路径（保留）

### 方案 C：Paraformer 流式（sherpa-onnx 亦支持）
- 优点：阿里开源，中文领域口碑好
- 缺点：无热词增强；流式模型文件同样需下载；与原项目生态不一致（无法复用其调参经验）
- 适用场景：中文单语场景的备选

## 选择理由

- **复用验证经验**：原项目 streamingAsr.ts 的节流/静音/断句/flush 参数均经生产调参，直接移植可规避重复踩坑
- **架构一致**：引擎线程模式与 v0.1.0 完全一致，扩展成本低
- **模型分发闭环**：国内镜像 + 校验和 + 应用内状态提示，解决 TLS 拦截下的分发问题

## 影响

### 正面影响
- 实时字幕体验（partial 延迟 < 1s）
- 静音期 CPU 显著降低（隔块喂入）
- 热词增强为后续（REQ-025 热词表）铺路

### 负面影响 / 代价
- 模型体积大（~650MB），首次下载时间长（需进度提示）
- 流式与离线双引擎共存，内存占用增加（SenseVoice ~250MB + Zipformer ~650MB 常驻，需评估合并加载策略：流式优先，SenseVoice 重打分懒加载）

### 风险
- hf-mirror.com 在本机 TLS 拦截下可能仍不可用：需备选 ModelScope 源 + 手动放置引导
- 流式模型与 sherpa-onnx 1.13 版本兼容性：需先 spike 验证 OnlineRecognizer 能加载该模型包（原项目用 1.13+ node 版，crate 版 API 需确认）
- 双引擎并发解码争抢 CPU：引擎池串行化保证不并发

## 合规性验证

- [ ] spike：sherpa-onnx crate 1.13 加载 streaming-zipformer 模型包成功，`OnlineRecognizer::create` 返回 Some
- [ ] 合成 16kHz PCM 喂入 → 产出 partial/final 事件，文本与预期一致
- [ ] 静音块（RMS < 阈值）喂入 → 跳过解码但端点仍可检测
- [ ] 停止时尾句 flush：未端点文本以 final 形式送出，与最近 final 去重
- [ ] 模型缺失时 `asr_streaming_model_status` 返回 missing 列表，前端显示引导
- [ ] 单测：节流逻辑、静音判定、flush 去重（纯函数，Mock 引擎）

## 相关决策

- ADR-001: WASAPI 端点环回音频捕获方案（PCM 块输入来源）
- 原项目参照：`client/electron/ai/local-asr/streamingAsr.ts`、`SherpaAsrService.ts`、`sensevoiceRescore.ts`

## 参考

- [sherpa-onnx 流式识别文档](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- [sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20](https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20)
- 原项目 `client/electron/ai/local-asr/`（config.ts 模型文件清单 / streamingAsr.ts 流程 / sensevoiceRescore.ts 重打分）
