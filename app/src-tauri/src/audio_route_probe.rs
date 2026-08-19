//! 分应用音频路由探针（REQ-126 M10 / v0.7.0 M2，首阶段 API 面验证 spike）。
//!
//! @ai-context: 目标：WASAPI 会话级枚举（IAudioSessionManager2 按进程取音频）
//!              根治环回污染（微信/广告声混入课堂转写）。本模块为首阶段 spike
//!              ——只验证 API 面可用性（默认渲染端点活跃会话数），不接入环回
//!              链路（M2 后按 spike 结论接线）。
//!
//! ## v0.7.0 首阶段验证结论（2026-08-19）
//! - windows crate **0.61.3** 已含全部所需 API：IAudioSessionManager2 /
//!   IAudioSessionEnumerator / IMMDeviceEnumerator（Win32_Media_Audio +
//!   Win32_System_Com + Win32_Foundation feature 均已开启，**无需新增 feature**）。
//! - API 面**可用**：probe_session_count 可枚举默认渲染端点会话数（编译通过 +
//!   单测实跑通过——本机默认渲染端点会话数 ≥ 0，会话级枚举链路真实可用）。
//! - 下一步（M2 后）：经 IAudioSessionControl2::GetProcessId 按 PID 过滤取
//!   目标进程音频 → 接入环回链路；REQ-105 固定音过滤维持兜底（"失败则维持
//!   REQ-105 止血"条款在 API 面不可用时生效，当前未触发）。
//!
//! @ai-context: 失败路径返回 -1 + eprintln 记录原因（spike 诚实结论——不吞错；
//!              调用方据此判定"API 面不可用"走 REQ-105 止血）。
//! @ai-context: 本 crate 存在本地 `mod windows`（窗口枚举），外部 windows crate
//!              必须以 `::windows::` 全路径引用（遮蔽问题，见 lib.rs 注释）。
//!
//! #![allow(dead_code)] 说明：spike 探针——lib 目标下无调用方（仅单测冒烟调用），
//! M2 后按上述结论接线（按 PID 过滤取目标进程音频）时自然消除。

#![allow(dead_code)]

use ::windows::Win32::Foundation::{RPC_E_CHANGED_MODE, S_FALSE, S_OK};
use ::windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use ::windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
};

/// COM 生命周期守卫：构造时按需初始化，drop 时配对 CoUninitialize
/// （TD-028 同款模式——CoInitializeEx 无配对调用会泄漏线程 COM 状态）。
struct ComGuard {
    should_uninit: bool,
}

impl ComGuard {
    /// 初始化 COM（MTA）。已初始化（S_FALSE）或模式不同（RPC_E_CHANGED_MODE）
    /// → 复用现有公寓，不重复 CoUninitialize；初始化失败 → None（调用方降级 -1）。
    fn init() -> Option<Self> {
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        if hr == S_OK {
            Some(Self { should_uninit: true })
        } else if hr == S_FALSE || hr == RPC_E_CHANGED_MODE {
            Some(Self { should_uninit: false })
        } else {
            eprintln!("[AudioRouteProbe] COM 初始化失败: {:?}", hr);
            None
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninit {
            unsafe { CoUninitialize() }
        }
    }
}

/// 探针：默认渲染端点的活跃音频会话数（API 面可用性最小验证）。
///
/// @ai-context: 会话数 ≥ 0 证明会话级枚举链路可用（设备 → 会话管理器 →
///              会话枚举器）；失败（无设备/权限/API 缺失）→ -1 + eprintln 原因。
///              会话数含系统会话（System Sounds 等），非"分进程"粒度——
///              M2 后按 GetProcessId 过滤才是分应用路由。
#[cfg(target_os = "windows")]
pub fn probe_session_count() -> i64 {
    let Some(_com) = ComGuard::init() else { return -1 };
    probe_inner()
}

/// 探针主流程（拆分：COM guard 与函数体分离，保证配对）。
#[cfg(target_os = "windows")]
fn probe_inner() -> i64 {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("[AudioRouteProbe] 创建设备枚举器失败: {}", e);
                    return -1;
                }
            };
        let device = match enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[AudioRouteProbe] 无默认渲染端点（检查系统声音设置）: {}", e);
                return -1;
            }
        };
        let manager: IAudioSessionManager2 =
            match device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[AudioRouteProbe] 激活会话管理器失败（API 面不可用?）: {}", e);
                    return -1;
                }
            };
        let sessions = match manager.GetSessionEnumerator() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[AudioRouteProbe] 获取会话枚举器失败: {}", e);
                return -1;
            }
        };
        match sessions.GetCount() {
            Ok(n) => n as i64,
            Err(e) => {
                eprintln!("[AudioRouteProbe] 会话计数失败: {}", e);
                -1
            }
        }
    }
}

/// 非 Windows 平台占位（MVP 目标平台为 Windows；探针结论仅 Windows 有效）。
#[cfg(not(target_os = "windows"))]
pub fn probe_session_count() -> i64 {
    eprintln!("[AudioRouteProbe] 非 Windows 平台：WASAPI 会话级枚举不可用");
    -1
}

#[cfg(test)]
mod tests {
    use super::*;

    /// spike 冒烟测试：真实 WASAPI 探针（本机默认渲染端点）。
    ///
    /// @ai-context: 本测试即 REQ-126 首阶段验证的执行——Windows 有声卡的
    ///              正常机器应返回 ≥ 0（会话数，含系统会话）；-1 意味着
    ///              API 面不可用/环境无音频，需记录结论走 REQ-105 兜底。
    /// @ai-context: 审查 MEDIUM-7 修复：原测试无门控，CI/无音频设备环境
    ///              （count=-1）必失败——违反测试隔离；改 #[ignore] +
    ///              env 门控（ENTROPY_WASAPI_PROBE=1 才执行）——真机验证
    ///              手动触发，CI 默认跳过。
    #[test]
    #[ignore = "需真实音频设备（手动验证：ENTROPY_WASAPI_PROBE=1 cargo test --lib -- --ignored）"]
    fn probe_counts_sessions_on_default_endpoint() {
        if std::env::var("ENTROPY_WASAPI_PROBE").map(|v| v != "1").unwrap_or(true) {
            eprintln!("跳过（未设置 ENTROPY_WASAPI_PROBE=1）");
            return;
        }
        // Arrange & Act：真实 WASAPI 会话级枚举
        let count = probe_session_count();
        // Assert：会话数非负（链路可用）；失败 -1 时测试失败以暴露结论
        assert!(count >= 0, "WASAPI 会话级枚举失败（-1）：无音频设备/权限/API 面不可用");
    }
}
