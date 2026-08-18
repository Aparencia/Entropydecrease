# ADR-001: WASAPI 端点环回音频捕获方案

## 状态

已接受（Accepted，2026-08-18）

## 日期

2026-08-18

## 背景

v0.2.0（REQ-007）需要捕获系统输出声音（网课/视频播放的音频）用于流式 ASR。技术约束：

- 本地优先架构：捕获必须在 Rust 主进程完成，数据不出本机
- 本机存在 TLS 拦截：从 CDN 在线下载预编译库会失败（UnknownIssuer），新增依赖尽量不引入在线下载环节
- 捕获输出格式需与 ASR 引擎对齐：16kHz 单声道 Float32 PCM（sherpa-onnx 流式引擎要求）
- 原项目（Electron）用 C++ node addon 实现 WASAPI 环回，重构区需在 Rust 侧等价实现

## 决策

我们将用 `windows` crate 0.61（Cargo.toml 已依赖，需补充 `Win32_Media_Audio` 与 `Win32_System_Com` feature）直接调用 WASAPI：

- `IMMDeviceEnumerator` 枚举默认渲染端点（`eRender` / `eConsole`），`IAudioClient` 以 `AUDCLNT_STREAMFLAGS_LOOPBACK` 标志打开
- 捕获线程按 `IAudioCaptureClient::GetNextPacketSize` 循环取包，把浮点样本重采样为 16kHz 单声道 Float32 PCM，按固定块时长（如 200ms）切块投递
- 封装为 `capture/audio_loopback.rs` 模块：`AudioLoopbackCapture::start(on_chunk)` / `stop()`，块类型 `AudioChunk { samples: Vec<f32>, sample_rate, timestamp_ms }`（200ms 定长 16k 单声道；实际实现无 channels 字段，输出恒为单声道）
- 无可用渲染端点时返回可操作错误（引导用户检查系统声音设置），不静默失败

## 备选方案

### 方案 A：windows crate 手写 WASAPI（选择）
- 优点：零新增依赖（windows 0.61 已在依赖树）；完全控制重采样与切块；无 TLS 下载风险；与窗口枚举（windows.rs）同一依赖体系
- 缺点：需手写 COM 生命周期管理（IAudioClient/IAudioCaptureClient/Event 句柄）；代码量较大（约 200-300 行）
- 适用场景：Windows 桌面壳主进程捕获

### 方案 B：cpal crate
- 优点：跨平台 API 简洁，社区活跃
- 缺点：cpal 不支持直接枚举 WASAPI loopback 端点，需 `from_wasapi_loopback` 之类的非官方 workaround；环回支持不稳定；与 windows-rs 生态割裂
- 适用场景：需要跨平台（macOS/Linux）音频输入输出

### 方案 C：sherpa-onnx 自带捕获
- 优点：与 ASR 引擎同一库，格式天然对齐
- 缺点：功能有限（仅麦克风/默认设备，不保证 loopback），不适合目标窗口/端点选择场景；API 面窄
- 适用场景：纯麦克风场景的快速实现

### 方案 D：C++ addon（沿用原项目）
- 优点：复用原项目已验证的 loopback_capture.cc 逻辑
- 缺点：需引入 C++ 构建链 + FFI 绑定（napi-rs/手动 extern），与 Tauri 纯 Rust 架构背离；重构区铁律要求 Rust 主进程
- 适用场景：Electron 技术栈（原项目）

## 选择理由

- **依赖最小化**：windows 0.61 已在 Cargo.toml（窗口/进程枚举使用），仅补 feature 即可，不引入任何新 crate，规避本机 TLS 拦截风险
- **可控性**：重采样（48kHz→16kHz）、切块（对齐 ASR 块输入）、时间戳（单调递增对齐会话时间轴）全部可控，这是 cpal 无法保证的
- **架构一致性**：Tauri + Rust 主进程原生实现，符合"后端/系统层 Rust"技术栈裁决（AGENTS.md §2）

## 影响

### 正面影响
- 零新增依赖，构建链不变（规避 TLS 拦截的未知风险）
- 输出格式与 sherpa-onnx 流式引擎、Silero VAD 输入要求完全对齐
- 后续可扩展：端点选择（当前默认设备）、设备热插拔监听

### 负面影响 / 代价
- 手写 COM 生命周期：需严格 `release` 顺序，否则句柄泄漏（Windows 音频会话会阻止睡眠）
- 重采样需自实现（或引入轻量纯 Rust 重采样），增加 ~80 行代码
- 平台绑定 Windows（桌面壳本即 Windows 优先，可接受）

### 风险
- WASAPI loopback 静默（无应用播放时 GetBuffer 返回空）：需超时保护 + 静音检测，避免空转 CPU
- COM 初始化（CoInitializeEx）必须在线程内完成：捕获线程自行初始化
- 捕获线程 panic 导致句柄泄漏：用 `Drop` 保证释放，线程 join 超时保护

## 合规性验证

- [ ] `cargo build` 通过（无新增依赖）
- [ ] 播放音乐时捕获 10s，块时间戳单调递增，采样率 16kHz
- [ ] 无播放时捕获 10s，无 panic、无空转（CPU 占比可测）
- [ ] 停止后 `IAudioClient` 句柄全部释放（任务管理器无音频会话残留）
- [ ] 单测：切块/重采样纯函数（不依赖真实设备，用合成 PCM 数据）

## 相关决策

- ADR-003: 流式 ASR 引擎与模型分发方案（本决策产出的 PCM 块是其输入）
- 原项目参照：`client/native/process-audio/src/loopback_capture.cc`

## 参考

- [WASAPI Loopback Capture (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [windows-rs crate](https://crates.io/crates/windows)
- 原项目 `client/native/process-audio/src/loopback_capture.cc`（已验证的捕获流程）
