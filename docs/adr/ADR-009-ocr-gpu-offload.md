# ADR-009: OCR 推理 GPU 卸载（CUDA EP + 三层检测 + 回退链）

## 状态

已接受（v0.4.0 架构评审确认方案方向；2026-08 spike 后按用户指示由 DirectML 改为 CUDA——DirectML 在 ORT 1.28 无官方构建，见背景与备选方案）

## 日期

2026-08

## 背景

v0.3.0 全链路本地化后，OCR（PP-OCR det+rec，oar-ocr 0.9.1）全程 CPU 执行：单帧 1-3s（导入链路实测），实时链路与流式 ASR（sherpa-onnx）争抢 CPU，屏幕采样/融合/前端均受影响。课堂主场景为网课播放，OCR 帧率是"画面要点"质量的瓶颈。

约束：

- 桌面壳 Tauri 2（Windows x64），本地优先（数据不出本机），无云依赖
- OCR 库固定为 oar-ocr 0.9.1（已锁定），底层 ONNX Runtime 为 ort 2.0.0-rc.13（**ABI 绑定 ORT 1.28**，oar-ocr-core 精确锁定 `ort = "=2.0.0-rc.13"`）
- 本机存在 TLS 拦截：Rust 侧 rustls 直连 CDN 失败，PowerShell（Windows 证书库）下载正常——运行时分发必须走 PS 脚本
- 目标用户机器差异大（NVIDIA 独显/核显/无 GPU），决策必须零误判成本、可校准、可回退

**Spike 结论（2026-08，决定 EP 选型）**：

- **DirectML 不可行**：ORT 1.28 无任何官方 DirectML 构建（GitHub Releases v1.25+ 停止发布 DirectML 资产，最后为 v1.22.1 nupkg；NuGet `Microsoft.ML.OnnxRuntime.DirectML` 止于 1.24.4）——DirectML 运行时与 ort-sys 2.0.0-rc.13 的 ABI 绑定不匹配，混用会触发 "requested API version not available" 崩溃
- **CUDA 可行**：ORT 1.28.0 官方发布含 `onnxruntime-win-x64-gpu_cuda12-1.28.0.zip`（455MB，含 cudart/cublas/cudnn 运行时）；oar-ocr 0.9.1 `cuda` feature 与 `OrtExecutionProvider::CUDA` API 已确认存在

## 决策

我们将为 OCR（det+rec，不含 ASR）启用 **CUDA 执行提供程序**，采用**三层混合检测**与三级模式：

1. **范围**：仅 OCR CUDA EP；不做 ASR GPU（DeviceConfig 预留扩展位，不换 sherpa-onnx 构建）
2. **检测机制（三层）**：
   - ① DXGI 硬件门槛：`device_probe.rs` 枚举适配器（CreateDXGIFactory1 → EnumAdapters1 → GetDesc1），候选 = **非软件 + NVIDIA 厂商（0x10DE）+ 显存 ≥1GB**，取显存最大者；无候选 → CPU（AMD/Intel 机器零尝试）
   - ② ORT 原生回退：EP 列表 `[CUDA{device_id}, CPU]`——ORT 按序尝试，CUDA 不可用（无驱动/运行时为 CPU 版）自动落 CPU
   - ③ 可选微基准校准（"重新检测"按钮）：后台临时建 CPU+GPU 引擎各跑 3 帧真实 OCR 取中位数，GPU 优势 <10%（防抖动阈值）→ CPU
3. **模式**：`OcrDeviceMode { Auto | ForceGpu | ForceCpu }`（默认 Auto）；ForceGpu 在 GPU 构建失败时降级 CPU 重建并记录 `fallback_reason`（UI 提示）
4. **CUDA EP 注入（spike 确认）**：
   - `OrtExecutionProvider::CUDA { device_id, gpu_mem_limit, arena_extend_strategy, cudnn_conv_algo_search, cudnn_conv_use_max_workspace }`，本版仅设 `device_id`（其余保持 ORT 默认）
   - `device_id` 固定 **0**（CUDA 设备序号；DXGI 枚举序 ≠ CUDA 序号，多卡映射留待 NVML——风险项）
   - 注入方式：`OAROCRBuilder::ort_session(config)`（oar-ocr 0.9.1 已暴露）；CUDA EP 无 DirectML 式 memory_pattern/顺序执行约束
   - 编译开关：cargo feature `ocr-cuda`（默认开，映射 oar-ocr/cuda → ort/cuda）；关闭时 CUDA 请求显式失败并回退 CPU（零 CUDA 符号依赖）
5. **运行时分发**：`onnxruntime-win-x64-gpu_cuda12-1.28.0` 经 `app/download-ort-cuda.ps1` 下载至 `ort/`（.part 原子写入 + 校验，绕 TLS）；`.cargo/config.toml` 的 `ORT_LIB_LOCATION` 指向其 `lib/`；**DLL 加载**：CUDA 运行时数十个 DLL 不复制进 target——`lib.rs` setup 最早期调用 `SetDefaultDllDirectories(DEFAULT_DIRS)` + `AddDllDirectory(ORT_LIB_LOCATION)`（windows crate `Win32_System_LibraryLoader`），build.rs 仅保留 onnxruntime.dll 复制（压过 system32 旧版）
6. **配置持久化**：`device_config.rs` JSON 原子写应用数据目录（路径可注入，测试用 tempfile）
7. **状态可观测**：`ocr_device_status` / `ocr_device_set_mode` / `ocr_device_recalibrate` 命令 + ClassroomPage 设置区（模式下拉 + 当前后端 + 回退原因 + 重新检测按钮）；变更下次引擎启动生效（不做热重启，避免中断进行中会话）
8. **E1 ORT 调优**：CPU 与 CUDA 会话统一注入 `intra_threads=2` + 图优化级别 `ALL`；调优前后单帧延迟基准对比（诊断面板数据源）

## 备选方案

### 方案 A：CUDA（选定）
- 优点：ORT 1.28 官方发布含 gpu_cuda12 运行时（455MB 直下可用）；NVIDIA 生态性能上限高；CUDA EP 无特殊会话约束；oar-ocr 0.9.1 `cuda` feature 与 API 全确认
- 缺点：仅 NVIDIA（AMD/Intel 用户落 CPU）；需 NVIDIA 驱动支持 CUDA 12.x；GPU 包解压后 ~2GB（不入库，gitignore `/ort/`）
- 适用场景：目标用户为 Windows 桌面；NVIDIA 独显占 GPU 市场主流

### 方案 B：DirectML（弃用）
- 优点：全厂商 GPU 通吃
- 缺点：**ORT 1.28 无官方 DirectML 构建**（GitHub v1.25+ 停发；NuGet 止于 1.24.4），与 ort-sys rc.13（ABI 1.28）不兼容；强行降级整栈需 fork oar-ocr 0.9.1 的 ort 精确锁定
- 适用场景：上游恢复发布后可作为替代评估

### 方案 C：纯 CPU 调优（不选）
- 优点：零分发成本、零兼容风险
- 缺点：不解决"OCR 与 ASR 争抢 CPU"这一核心矛盾；单帧 1-3s 瓶颈仍在
- 适用场景：作为 CUDA 不可用时的兜底（已内置于回退链）

## 选择理由

- DirectML 被上游阻塞（1.28 无构建）是硬约束；CUDA 是当前依赖集下唯一"官方运行时可用、零分叉"的 GPU 路径
- oar-ocr 0.9.1 spike 已确认全部 API 面（cuda feature、OrtExecutionProvider::CUDA、ort_session 注入），无上游阻塞
- 三层检测把决策成本降到最低：硬件门槛零成本，ORT 原生回退兜底，微基准校准兜"GPU 收益不达阈值"边界；无 NVIDIA 机器行为与 v0.3.0 完全一致（零回归风险）

## 影响

### 正面影响
- OCR 推理从 CPU 卸载到 GPU，让出 CPU 给 ASR/前端（v0.4.0 资源维度核心目标）
- 无 NVIDIA/驱动异常机器自动 CPU，行为与 v0.3.0 一致（零回归风险）
- 后端状态可查、可校准、可强制——可观测性提升
- E1 调优（线程/图优化）对 CPU 链路同样生效

### 负面影响 / 代价
- ort/ 目录体积 +~2GB（不入库，gitignore 已有 /ort/）
- 仅 NVIDIA 受益；AMD/Intel 用户 GPU 卸载不可用（记录为后续 EP 扩展位）
- 运行时 DLL 依赖 AddDllDirectory 注入（setup 时序敏感，已置于引擎加载前）
- 配置变更需重启引擎生效（下次会话启动）

### 风险
- **多 GPU 枚举序**：CUDA device_id 与 DXGI 枚举序不一致——固定 device_id=0（spike 验证项；多卡场景留 NVML 映射）
- **驱动版本**：CUDA 12.x 需要对应 NVIDIA 驱动；驱动过旧时 CUDA EP 初始化失败 → 自动落 CPU（②层兜底）
- **GPU 包加载行为**：无 NVIDIA 机器上 gpu onnxruntime.dll 是否正常加载（cudart 自带、nvcuda 延迟加载）——spike/真机验证项
- **TLS 拦截环境下载源可用性**：455MB 单源（GitHub）下载中断重试（.part 机制）

## 合规性验证

- [ ] 单测：probe 适配器分类/选择（fake 列表注入，NVIDIA 过滤）、decide 决策矩阵（3 模式 × 候选 × bench）、config JSON roundtrip（tempfile）；无 NVIDIA 环境 Auto → Cpu 全绿（CI 安全）
- [ ] `ocr_device_status` 返回实际生效后端与 fallback_reason
- [ ] 真机验收（用户执行）：NVIDIA 机器 OCR 实际走 CUDA（状态验证）；无 NVIDIA/驱动过旧自动 CPU；ForceGpu 不可用降级 CPU 并 UI 提示；"重新检测"后决策生效
- [ ] E1：调优前后单帧 OCR 延迟基准对比（校准日志/诊断面板）
- [ ] 回归：v0.3.0 验收项不劣化（字幕优先/融合/实时面板）

## 相关决策

- ADR-002: DXGI 屏幕捕获（device_probe 复用 DXGI 枚举 API 与 windows crate）
- ADR-003: 流式 ASR 架构（引擎池常驻线程模式；OCR 同构扩展）
- ADR-005: 字幕 OCR 融合（识别参数/区域裁剪不变，仅推理后端切换）
- ADR-008: 文件导入字幕优先（ORT 调优影响导入链路单帧延迟）

## 参考

- oar-ocr 0.9.1 `docs/features.md`（cuda feature、EP 选择）、`examples/utils/device_config.rs`（CUDA 配置示例）
- oar-ocr-core 0.9.1 `src/core/config/onnx.rs`（OrtSessionConfig / OrtExecutionProvider 字段确认）
- onnxruntime v1.28.0 GitHub Release 资产清单（gpu_cuda12 存在、DirectML 缺失——EP 选型依据）
- v0.4.0 版本文档 M1 规划（docs/versions/v0.4.0.md）
