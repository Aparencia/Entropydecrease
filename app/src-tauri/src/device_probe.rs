//! GPU 适配器探测（ADR-009 / v0.4.0 M1：OCR GPU 卸载的硬件门槛层）。
//!
//! @ai-context: 三层检测的第一层——DXGI 硬件门槛。零成本决策：无候选
//!              （无 NVIDIA 独显 / WARP 软件渲染）直接落 CPU，不尝试 CUDA 会话构建。
//! @ai-context: M1 决策（2026-08，用户指示）：EP 定为 CUDA（ORT 1.28 官方发布含
//!              gpu_cuda12 运行时；DirectML 1.28 无官方构建，弃用）。
//!              候选 = 非软件 + NVIDIA 厂商（0x10DE）+ 显存 ≥1GB。
//! @ai-context: select_best 为纯函数（注入适配器列表），分类/选择规则可单测；
//!              系统调用（CreateDXGIFactory1/EnumAdapters1/GetDesc1）只在 probe 内。
//! @ai-context: 仅 Windows（DXGI）；非 Windows 平台由调用方保证不进入（cfg 门控）。

use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, DXGI_ADAPTER_DESC1};

/// NVIDIA PCI VendorId（DXGI GetDesc1）。
const NVIDIA_VENDOR_ID: u32 = 0x10DE;

/// 候选显存下限（1GB）：低于此值的"独显"不参与选择（驱动残留/异常枚举）。
/// ADR-009：显存门槛是零误判成本的关键——核显共享显存通常为 0，天然被排除。
const MIN_CANDIDATE_VRAM: u64 = 1 << 30;

/// 单个 GPU 适配器信息（DXGI GetDesc1 裁剪后的业务视图）。
#[derive(Debug, Clone, PartialEq)]
pub struct AdapterInfo {
    /// DXGI 枚举序号
    pub index: usize,
    /// 适配器描述（如 "NVIDIA GeForce RTX 4060"）
    pub description: String,
    /// PCI 厂商 ID（NVIDIA=0x10DE；CUDA 候选过滤依据）
    pub vendor_id: u32,
    /// 专用显存（字节；核显共享内存为 0）
    pub dedicated_vram: u64,
    /// 软件渲染（WARP / Microsoft Basic Render Driver）
    pub is_software: bool,
}

/// 枚举 DXGI 适配器列表；失败返回空列表（上层落 CPU，不阻断启动）。
pub fn probe_adapters() -> Vec<AdapterInfo> {
    let mut out = Vec::new();
    unsafe {
        // 显式类型注解：windows 0.61 的 CreateDXGIFactory1 需要推断目标接口
        let factory: windows::Win32::Graphics::Dxgi::IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(_) => return out,
        };
        for index in 0..16u32 {
            let Ok(adapter) = factory.EnumAdapters1(index) else { break };
            let desc: DXGI_ADAPTER_DESC1 = adapter.GetDesc1().unwrap_or_default();
            // DXGI_ADAPTER_FLAG_SOFTWARE.0 为 i32（windows 0.61），显式转 u32 再位与
            let is_software =
                desc.Flags & windows::Win32::Graphics::Dxgi::DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0;
            // WCHAR 数组 → String（遇 0 截断）
            let description = desc
                .Description
                .iter()
                .take_while(|&&c| c != 0)
                .map(|&c| c as u8 as char)
                .collect::<String>();
            out.push(AdapterInfo {
                index: index as usize,
                description,
                vendor_id: desc.VendorId,
                dedicated_vram: desc.DedicatedVideoMemory as u64,
                is_software,
            });
        }
    }
    out
}

/// 选择最佳 CUDA 候选：非软件 + NVIDIA + 显存 ≥1GB 的候选中取显存最大者。
/// 返回其 DXGI 枚举序号；无候选返回 None（→ CPU）。
///
/// @ai-context: 返回序号仅供"有无候选"判断与日志；CUDA EP 的 device_id 使用
///              CUDA 设备序号（与 DXGI 枚举序不一致，ADR-009 风险项），
///              当前实现固定 device_id=0（多 NVIDIA 卡场景留待 NVML 映射）。
pub fn select_best(adapters: &[AdapterInfo]) -> Option<usize> {
    adapters
        .iter()
        .filter(|a| !a.is_software && a.vendor_id == NVIDIA_VENDOR_ID && a.dedicated_vram >= MIN_CANDIDATE_VRAM)
        .max_by_key(|a| a.dedicated_vram)
        .map(|a| a.index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn adapter(index: usize, vendor: u32, vram: u64, software: bool) -> AdapterInfo {
        AdapterInfo {
            index,
            description: format!("gpu{index}"),
            vendor_id: vendor,
            dedicated_vram: vram,
            is_software: software,
        }
    }

    const AMD: u32 = 0x1002;
    const INTEL: u32 = 0x8086;

    #[test]
    fn empty_list_selects_none() {
        assert_eq!(select_best(&[]), None);
    }

    #[test]
    fn non_nvidia_only_selects_none() {
        // AMD 独显 + Intel 核显 → CUDA 无候选（CUDA 仅 NVIDIA）
        let list = vec![adapter(0, AMD, 8 << 30, false), adapter(1, INTEL, 0, false)];
        assert_eq!(select_best(&list), None);
    }

    #[test]
    fn picks_largest_vram_nvidia() {
        let list = vec![
            adapter(0, AMD, 24 << 30, false),
            adapter(1, NVIDIA_VENDOR_ID, 8 << 30, false),
            adapter(2, NVIDIA_VENDOR_ID, 16 << 30, false),
        ];
        assert_eq!(select_best(&list), Some(2));
    }

    #[test]
    fn below_vram_floor_is_excluded() {
        // 512MB NVIDIA 独显 → 无候选
        let list = vec![adapter(0, NVIDIA_VENDOR_ID, 512 << 20, false)];
        assert_eq!(select_best(&list), None);
    }

    #[test]
    fn software_nvidia_is_excluded() {
        // WARP 伪装 NVIDIA 不选（显存 32GB 是伪显存）
        let list = vec![adapter(0, NVIDIA_VENDOR_ID, 32 << 30, true)];
        assert_eq!(select_best(&list), None);
    }

    #[test]
    fn exactly_floor_is_candidate() {
        let list = vec![adapter(0, NVIDIA_VENDOR_ID, 1 << 30, false)];
        assert_eq!(select_best(&list), Some(0));
    }
}
