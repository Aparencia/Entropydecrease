# ADR-002: DXGI Desktop Duplication 屏幕捕获与关键帧变化检测方案

## 状态

已接受（Accepted，2026-08-18）

## 日期

2026-08-18

## 背景

v0.2.0（REQ-008）需要按目标窗口定时抓帧（关键帧采样），供字幕 OCR 与画面要点提取。技术约束：

- 目标窗口由用户选择（v0.1.0 已有 `list_windows` 枚举，返回窗口句柄与推荐评分）
- 字幕 OCR（REQ-011）要求字幕区高频采样（约 1-2 fps），非字幕区低频采样（约 0.2-0.5 fps）——即双速率采样
- 帧变化检测用于去重：无变化不送 OCR，节省 CPU（OCR 单帧推理为毫秒-百毫秒级）
- 本机 TLS 拦截：新增依赖尽量不引入在线下载环节
- 原项目（Electron）用 desktopCapturer 抓帧 + 分块 hash 变化检测（8 块 × 60 字节采样，≥2 块变化才判定）

## 决策

我们将用 `windows` crate 0.61 手写 DXGI Desktop Duplication API 实现屏幕捕获：

- `IDXGIOutputDuplication::AcquireNextFrame` 获取桌面帧 → `ID3D11Texture2D` → `CopyResource` 到 staging texture → `Map` 读回像素
- 按目标窗口矩形裁剪输出（窗口句柄 → `GetWindowRect`，含 DPI 缩放处理），输出 BGRA8 位图（实现于 `capture/dxgi_capture.rs` 的 `ScreenCaptureSampler::capture`，先窗口裁剪再叠加区域裁剪）
- 封装为 `capture/dxgi_capture.rs` 模块：`ScreenCaptureSampler`，支持双速率调度（字幕区 1-2 fps / 全帧 0.2-0.5 fps）
- 变化检测移植原项目算法为 Rust 纯函数（`frame_diff.rs`）：分块采样 hash 对比，≥2 块变化才判定，同时更新基准 hash 防亚阈值累积
- 降级路径：DXGI 在远程桌面/锁屏/无 GPU 加速会话下 `AcquireNextFrame` 会返回错误 → 自动降级 GDI `BitBlt`（`GetDC` + `BitBlt` + `ReleaseDC`），同接口输出

## 备选方案

### 方案 A：DXGI Desktop Duplication（选择）
- 优点：GPU 直取性能最优（不占用 GDI 带宽）；支持双速率采样天然（可跳过帧）；带帧元数据（`DXGI_OUTDUPL_FRAME_INFO` 的累计变化区域可辅助去重）
- 缺点：API 复杂（D3D11 设备/上下文/duplication 对象三层管理）；远程桌面/锁屏不可用；窗口裁剪需自行换算
- 适用场景：本地桌面会话的窗口/屏幕捕获

### 方案 B：GDI BitBlt
- 优点：实现简单（~50 行），所有会话（含远程桌面）可用；无 GPU 依赖
- 缺点：CPU 占用高（全屏位图拷贝 + GDI 带宽瓶颈），高帧率不可行；缩放/裁剪体验一般
- 适用场景：DXGI 不可用时的降级路径（本决策采纳为降级）

### 方案 C：xcap crate（第三方封装）
- 优点：API 简洁，已封装 DXGI + GDI 双后端
- 缺点：新增第三方依赖需验证本机 TLS 拦截下能正常 `cargo add`（crates.io 源若被拦截则失败）；底层细节不可控（双速率采样需 hack）；维护活跃度不确定
- 适用场景：追求开发速度且依赖源可用

### 方案 D：WGC（Windows.Graphics.Capture）WinRT API
- 优点：现代 API，微软推荐；窗口级捕获不需要裁剪；对远程桌面友好
- 缺点：WinRT 绑定（windows crate 支持但复杂）；异步帧回调与 Rust 线程模型集成成本高；API 仍在演进（Windows App SDK）
- 适用场景：需要跨 Windows 版本稳定窗口捕获的长期方案（可作为未来演进方向）

## 选择理由

- **性能**：双速率采样下字幕区高频帧 + 全帧低频帧，DXGI 是唯一能支撑 1-2 fps 全帧抓取且 CPU 占用可控的方案
- **依赖一致性**：与 ADR-001 同一 windows crate 依赖体系，零新增 crate
- **可测试性**：变化检测、窗口矩形裁剪、双速率调度均为纯函数/可注入逻辑，能脱离真实桌面做单测
- **降级路径明确**：GDI BitBlt 兜底远程桌面/锁屏场景，符合本地优先架构的防御性编程要求（AGENTS.md §4）

## 影响

### 正面影响
- 性能最优，支持双速率采样（REQ-011 的前提）
- 帧元数据（AccumulatedFrames 计数）可做"画面未变化即跳过"的二次判断
- 与 ADR-001 共用 windows-rs 基础设施

### 负面影响 / 代价
- D3D11 设备管理复杂度高（需 `ID3D11Device::Create` + 线程模型约束）
- 窗口矩形裁剪需处理 DPI 虚拟化（`SetProcessDpiAwareness` 影响 GetWindowRect 返回值）
- 远程桌面/锁屏必须降级 GDI（双实现维护成本）

### 风险
- `AcquireNextFrame` 在超时（桌面无变化）时返回 `DXGI_ERROR_WAIT_TIMEOUT`：需作为正常分支处理，不视为错误
- D3D11 设备丢失（显卡驱动更新/远程会话切换）：需监听 `DXGI_ERROR_DEVICE_REMOVED` 并重建设备
- 窗口最小化/遮挡时捕获到黑帧或旧内容：变化检测天然过滤（无变化），但需记录"窗口不可见"状态提示用户

## 合规性验证

- [ ] `cargo build` 通过（无新增依赖）
- [ ] 目标窗口播放视频 → 帧数据与窗口内容一致（尺寸/内容抽测）
- [ ] 静止画面 10s → 变化检测不产生新帧（零 OCR 触发）
- [ ] 远程桌面会话下自动降级 GDI 并输出帧（集成测试标注）
- [ ] 单测：变化检测纯函数（合成帧对比）、窗口裁剪换算、双速率调度器

## 相关决策

- ADR-001: WASAPI 端点环回音频捕获方案（同依赖体系）
- ADR-005: 字幕 OCR 与双源转写融合方案（本决策的帧输出是其输入）
- 原项目参照：`client/electron/screenCapture.ts`（分块 hash 变化检测算法）

## 参考

- [Desktop Duplication API (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api)
- [windows-rs crate](https://crates.io/crates/windows)
- 原项目 `client/electron/screenCapture.ts`（已验证的变化检测算法）
