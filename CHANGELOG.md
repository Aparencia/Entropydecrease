# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [SemVer](https://semver.org/lang/zh-CN/)。
各版本的深度版本文档见 [docs/versions/](docs/versions/)。

## [0.4.0] - 2026-08

### 新增

- **OCR GPU 卸载（REQ-036，ADR-009）**：CUDA 执行提供程序（EP 注入 + CPU 自动回退 + 回退原因可查）；DXGI 硬件门槛探测（NVIDIA 候选过滤）+ 三层检测；Auto/ForceGpu/ForceCpu 模式 + "重新检测"微基准校准（CPU/GPU 各 3 帧取中位数，防抖动阈值）；ORT 调优（intra_threads + 图优化 All）；`ocr_device_status/set_mode/recalibrate` 命令 + ClassroomPage 设置区；`download-ort-cuda.ps1` 运行时分发（含 CUDA 包，AddDllDirectory 注入 DLL 搜索路径）
- **动态字幕区域（REQ-037）**：播放区域检测（黑边扫描，5s 周期重扫）+ det bbox 驱动 ROI 锁定/失效重扫（`playback_region.rs` / `region_tracker.rs`）；OcrBlock 携带 bbox（oar-ocr 0.9.1 确认暴露）；先验=播放区域底部 1/4，无播放区域退化窗口坐标零回归
- **实时字幕体验（REQ-038）**：partial 上屏灰→黑原位静默修正（无闪烁无跳动，已定稿行沉淀入列表）；投票器同文本 hash 短路（跳过字符级 levenshtein）
- **采样预算与自动降级（REQ-039）**：双速率调度预算封顶（字幕 ≤2fps / 全帧 ≤0.5fps）+ 高负载降级档（全帧 0.1fps 封顶，保 ASR 主链路）+ VAD 旋钮参数化；CPU 负载监测（GetProcessTimes，持续超阈值 3s 触发）；OCR 结果 LRU 缓存（8×8 均值哈希，A→B→A 帧往返零推理）
- **热词/替换词闭环（REQ-040）**：词表本地持久化（JSON）+ CRUD 命令 + 前端词表管理；热词注入流式 ASR（端点断句自动生效，TD-032 防空串保留）；替换词 OCR 后纠错（长词优先，缓存存修正结果）；最近会话 OCR 高频词建议（用户确认加入）；课件预热最小版（pptx/txt/md 文本提取，PDF 留 v0.5）
- **音频前端与信号增强（REQ-041）**：预处理链（AGC 目标 RMS + 峰值钳制 + 削波检测 + 动态静音能量阈值防轻声截断，默认关，微基准定默认）；立体声声道 RMS 选优混音（杂音声道不混入）；窗口标题信号确认入库（source_window）
- **韧性与可观测性（REQ-042）**：ASR 三级降级链状态机（流式→离线重打分→静音占位，静默语音 5s/15s 触发，恢复自动回落）+ `live:asr-degraded` UI 提示；资源健康巡检（磁盘剩余/模型完整性/引擎线程心跳）+ 系统状态徽标；静默失败可见化（ASR/OCR 失败计数 + OCR 缓存命中率 + 诊断面板）；启动加速核对（引擎常驻启动即加载）

### 修复

- TD-033：窗口跨显示器移动后 DXGI duplication 不更新（最长 30s 空窗）——DxgiState 保存输出 DesktopCoordinates，窗口中心越界立即重建（2s 快速节流）；DxgiState 拆分至 `dxgi_state.rs`

### 变更

- 引擎池/词表/健康监控等共享状态经 `Arc<Mutex<...>>` 注入（命令层与 worker 解耦）
- 依赖新增：`zip`（课件预热 PPTX 提取）
- 版本：0.3.0 → 0.4.0（Cargo.toml / package.json / tauri.conf.json）

### 测试

- 单测 232 个（+93）：CUDA 设备决策矩阵、黑边扫描、ROI 状态机、OCR 缓存 LRU/哈希、调度预算/降级、词表/纠错/候选、预处理 DSP、降级链状态机、健康巡检等
- 真机验收项（REQ-033 关闭保护/音频重连/DXGI 重建 + GPU 卸载实际生效）待用户执行

## [0.3.0] - 2026-08

视频文件导入（字幕优先 + ASR fallback + 关键帧 OCR）、字幕探测与融合体验优化（停止秒回/融合异步化/句起句尾时间戳）、采集链路质量优化（时间戳统一/引擎池并行/分窗转写/多帧投票/OCR 输入缩小）、实时活动面板。详见 [docs/versions/v0.3.0.md](docs/versions/v0.3.0.md)。

## [0.2.0] - 2026-08

系统实时捕获链路（WASAPI 环回 + DXGI 屏幕 + 流式 ASR + 字幕 OCR + 双源融合 + 会话）。详见 [docs/versions/v0.2.0.md](docs/versions/v0.2.0.md)。

## [0.1.0] - 2026-08

本地提取链路 MVP（ASR + OCR + 拼接 + 笔记）。详见 [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md)。

[0.4.0]: https://github.com/Aparencia/Entropydecrease/tree/rebuild
