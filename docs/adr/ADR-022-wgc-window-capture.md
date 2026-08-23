# ADR-022: WGC 窗口级捕获——三级降级链

## 状态

已接受（v0.12.0 M2，2026-08-23 规划定稿；已实施交付，真机验证待执行）

## 日期

2026-08-23

## 背景

当前 DXGI Desktop Duplication 是显示器级捕获，窗口上方覆盖的 UI（弹窗/任务栏/通知）会入镜；GDI BitBlt 降级更差，遮挡完全无法避免。目标窗口被遮挡导致采集内容含遮挡物（能力债）。

## 决策

我们将新增 WGC（Windows.Graphics.Capture，Win 10 1903+）后端，构建三级降级自愈链：

```
WGC（主，窗口级，Win 10 1903+）
  ↓ AcquireNextFrame 失败 / 安全桌面 / 窗口最小化
DXGI Desktop Duplication（降级 1，屏幕级+窗口裁剪，当前主路径）
  ↓ 远程桌面 / 锁屏 / 设备丢失
GDI BitBlt（兜底，全场景可用）
```

- 新增 `capture/wgc_capture.rs`（WinRT 异步帧回调 → 通道同步化，`capture()` 保持同步接口——上层 Worker 零改动，变化检测/双速率调度/OCR 编排全部复用）。
- `ScreenCaptureSampler` 扩展为三级链：新增 `CaptureBackend { Wgc, Dxgi, Gdi }`，`try_create_backend` 逐级尝试（WGC → DXGI → GDI），`capture()` 按当前后端路由，失败自动降级下一级。
- WGC 初版编译期 `#[cfg(windows)]` gate——Win 10 1903 以下回退 DXGI/GDI（旧系统行为零变化）。
- 三级链不引入新不确定性：WGC 最小化场景不回退到 DXGI 后不尝试自动切回——沿用 DXGI 已有 30s 周期重建（TD-033 快速节流同理）。

## 备选方案

### 方案 A：继续 DXGI，只在窗口裁剪上增强
- 优点：无新依赖。
- 缺点：DXGI 是显示器级，窗口遮挡本质无法规避——治标不治本。

### 方案 B：WGC 主路径 + 三级降级（**选定**）
- 优点：WGC 窗口级捕获真正抗遮挡（弹窗/任务栏/通知不入镜）；三级链覆盖不稳定场景（安全桌面/全屏独占 DX 游戏/最小化/远程桌面/无 DWM）。
- 缺点：WinRT FFI 复杂度；Win 10 1903 以下不可用（编译期 gate 回退）。
- 适用场景：窗口被遮挡是用户核心痛点。

## 选择理由

WGC 提供真正的窗口级捕获，是唯一能规避窗口遮挡的方案。三级降级链保证在 WGC 不稳定的各类场景（UAC 安全桌面、全屏独占 DX 游戏、窗口最小化、远程桌面、Server Core 无 DWM）不 panic 且行为与当前一致，最大化兼容性。

## 影响

### 正面影响
- 目标窗口被遮挡时捕获内容为窗口实际内容（非遮挡物）。

### 负面影响 / 代价
- 新增 WinRT FFI 模块（异步转同步的通道化样板）；`ScreenCaptureSampler` 增加后端状态机。

### 风险
- WGC WinRT 异步回调 → 通道同步的 FFI 复杂度；需真机验证各降级路径（安全桌面/远程桌面/锁屏）。

## 合规性验证

- 目标窗口被遮挡时捕获内容为窗口实际内容；远程桌面会话自动降级 DXGI/GDI 且不 panic；窗口关闭/最小化按现有 DXGI/GDI 逻辑兜底；`cargo build` 通过。

## 相关决策

- ADR-002: DXGI 屏幕捕获
- ADR-007: 实时会话生命周期（30s 周期重建）

## 参考

- docs/versions/v0.12.0.md（WGC 窗口级捕获 M2）
