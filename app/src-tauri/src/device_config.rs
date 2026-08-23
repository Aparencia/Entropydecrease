//! OCR 设备模式与决策配置（ADR-009 / v0.4.0 M1：OCR GPU 卸载决策层）。
//!
//! @ai-context: 三层检测的决策层——把"探测选择结果（select_best 已先行）+ 用户模式 +
//!              校准基准"折叠为最终后端（Cpu | Cuda{device_id}）。纯函数可单测，
//!              不依赖 Windows/DXGI（与 device_probe.rs 解耦：本模块只收选择结果）。
//! @ai-context: 配置 JSON 原子写应用数据目录（路径可注入，测试用 tempfile）；
//!              变更下次引擎启动生效（不做热重启，避免中断进行中会话）。
//! @ai-context: M1 决策（2026-08，用户指示）：EP 定为 CUDA——ORT 1.28 官方发布含
//!              gpu_cuda12 运行时（DirectML 1.28 无官方构建已弃用）；CUDA 分支经
//!              cargo feature `ocr-cuda` 编译，运行时不可用时自动落 CPU 并记录
//!              fallback_reason（无 NVIDIA 驱动/机器由硬件门槛层提前短路）。

use serde::{Deserialize, Serialize};

/// OCR 推理设备模式（用户可配；默认 Auto）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum OcrDeviceMode {
    /// 硬件门槛 + ORT 原生回退 + 校准基准自动决策
    #[default]
    Auto,
    /// 强制 CUDA（不可用时降级 CPU 并记录 fallback_reason）
    ForceGpu,
    /// 强制 CPU（兜底/调试）
    ForceCpu,
}

/// 微基准结果（"重新检测"产出，持久化用于 Auto 决策）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BenchResult {
    /// CPU 单帧中位延迟（毫秒）
    pub cpu_ms: f64,
    /// GPU 单帧中位延迟（毫秒）
    pub gpu_ms: f64,
}

/// 持久化配置（JSON，应用数据目录）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct OcrDeviceConfig {
    pub mode: OcrDeviceMode,
    /// 最近一次校准基准（None=未校准）
    pub bench: Option<BenchResult>,
}

/// 最终推理后端（请求态与生效态共用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OcrBackend {
    Cpu,
    /// CUDA EP（ADR-009：device_id 为 CUDA 设备序号；当前固定 0，多卡映射留待 NVML）
    Cuda { device_id: i32 },
}

/// 设备运行时状态（命令层返回前端；worker 更新生效后端）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcrDeviceStatus {
    pub mode: OcrDeviceMode,
    /// 请求的后端（本次启动决策结果）
    pub requested: OcrBackend,
    /// 实际生效后端（引擎加载后更新；未加载完成前=requested）
    pub actual: OcrBackend,
    /// 回退原因（无回退为 None；如"运行时无 CUDA 支持"）
    pub fallback_reason: Option<String>,
    /// 引擎是否加载成功（v0.12.1：true=加载成功可用；false=加载中或加载失败——
    /// 失败原因见 fallback_reason；线程心跳 alive ≠ 引擎就绪，前端不得混用）
    #[serde(default)]
    pub engine_ready: bool,
    /// 最近校准基准
    pub bench: Option<BenchResult>,
    /// 校准进行中标记（前端轮询用）
    pub calibrating: bool,
}

impl OcrDeviceStatus {
    pub fn new(mode: OcrDeviceMode, requested: OcrBackend, bench: Option<BenchResult>) -> Self {
        Self {
            mode,
            requested,
            actual: requested,
            fallback_reason: None,
            engine_ready: false,
            bench,
            calibrating: false,
        }
    }
}

/// GPU 相对 CPU 无优势阈值（10%）：gpu_ms 超过 cpu_ms×0.9 即判定无收益（防抖动）。
/// ADR-009：校准兜"新核显快于老独显"边界——Auto 下 GPU 优势不足则落 CPU。
const GPU_ADVANTAGE_MIN_RATIO: f64 = 0.9;

impl OcrDeviceConfig {
    /// 从磁盘加载；文件不存在/损坏 → 默认配置（防御：不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        let Ok(raw) = std::fs::read_to_string(path) else { return Self::default() };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 原子写（先写 .tmp 再 rename，防写一半损坏配置）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self).map_err(|e| {
            crate::error::AppError::Ocr(format!("序列化设备配置失败: {}", e))
        })?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

/// 折叠探测选择结果/模式/校准为最终后端（三层检测的决策纯函数）。
///
/// @ai-context: best_device 来自 device_probe::select_best（Windows DXGI 枚举，
///              NVIDIA 候选），无候选传 None——本函数不感知具体适配器，保持全平台可测。
/// @ai-context: CUDA EP 的 device_id 与 DXGI 枚举序不一致（ADR-009 风险项），
///              当前固定 0；多 NVIDIA 卡（nvidia_count>1）时 Auto 保守落 CPU——
///              DXGI 选出的"最佳卡"序号无法映射到 CUDA 序号，宁可不赌（ForceGpu
///              仍强制 device_id=0，用户显式承担）。
pub fn decide(
    mode: OcrDeviceMode,
    best_device: Option<usize>,
    nvidia_count: usize,
    bench: Option<BenchResult>,
) -> OcrBackend {
    match mode {
        OcrDeviceMode::ForceCpu => OcrBackend::Cpu,
        OcrDeviceMode::ForceGpu => {
            // 硬件门槛仍生效：无候选时 CUDA 会话构建必失败，直接 CPU
            match best_device {
                Some(_) => OcrBackend::Cuda { device_id: 0 },
                None => OcrBackend::Cpu,
            }
        }
        OcrDeviceMode::Auto => {
            let Some(_) = best_device else { return OcrBackend::Cpu };
            // 多卡保守：DXGI 序号 ≠ CUDA 序号（ADR-009 风险），映射实现前不自动赌卡
            if nvidia_count > 1 {
                return OcrBackend::Cpu;
            }
            // 校准兜底：GPU 优势 <10%（gpu_ms > cpu_ms × 0.9）→ CPU（防抖动）
            if let Some(b) = bench {
                if b.gpu_ms > b.cpu_ms * GPU_ADVANTAGE_MIN_RATIO {
                    return OcrBackend::Cpu;
                }
            }
            OcrBackend::Cuda { device_id: 0 }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bench(gpu_ms: f64) -> BenchResult {
        BenchResult { cpu_ms: 100.0, gpu_ms }
    }

    #[test]
    fn force_cpu_ignores_device_and_bench() {
        assert_eq!(decide(OcrDeviceMode::ForceCpu, Some(1), 1, None), OcrBackend::Cpu);
        assert_eq!(decide(OcrDeviceMode::ForceCpu, Some(1), 1, Some(bench(5.0))), OcrBackend::Cpu);
    }

    #[test]
    fn force_gpu_without_candidate_falls_back_cpu() {
        assert_eq!(decide(OcrDeviceMode::ForceGpu, None, 0, None), OcrBackend::Cpu);
    }

    #[test]
    fn force_gpu_with_candidate_selects_cuda() {
        assert_eq!(
            decide(OcrDeviceMode::ForceGpu, Some(2), 2, None),
            OcrBackend::Cuda { device_id: 0 }
        );
    }

    #[test]
    fn auto_without_candidate_is_cpu() {
        assert_eq!(decide(OcrDeviceMode::Auto, None, 0, None), OcrBackend::Cpu);
        assert_eq!(decide(OcrDeviceMode::Auto, None, 0, Some(bench(5.0))), OcrBackend::Cpu);
    }

    #[test]
    fn auto_with_candidate_and_no_bench_is_cuda() {
        assert_eq!(
            decide(OcrDeviceMode::Auto, Some(0), 1, None),
            OcrBackend::Cuda { device_id: 0 }
        );
    }

    #[test]
    fn auto_multi_gpu_is_conservative_cpu() {
        // 多 NVIDIA 卡：DXGI 序号 ≠ CUDA 序号（ADR-009 风险），Auto 不赌卡 → CPU
        assert_eq!(decide(OcrDeviceMode::Auto, Some(1), 2, None), OcrBackend::Cpu);
        assert_eq!(decide(OcrDeviceMode::Auto, Some(1), 2, Some(bench(5.0))), OcrBackend::Cpu);
    }

    #[test]
    fn force_gpu_ignores_multi_gpu_conservatism() {
        // ForceGpu 用户显式强制 → 多卡也走 device_id=0
        assert_eq!(
            decide(OcrDeviceMode::ForceGpu, Some(1), 2, None),
            OcrBackend::Cuda { device_id: 0 }
        );
    }

    #[test]
    fn auto_gpu_advantage_under_ten_percent_uses_cpu() {
        // gpu 95ms > cpu 100ms×0.9=90ms → 无 10% 优势 → CPU（防抖动）
        assert_eq!(decide(OcrDeviceMode::Auto, Some(0), 1, Some(bench(95.0))), OcrBackend::Cpu);
    }

    #[test]
    fn auto_gpu_advantage_over_ten_percent_uses_cuda() {
        // gpu 80ms ≤ 90ms → 有优势 → Cuda
        assert_eq!(
            decide(OcrDeviceMode::Auto, Some(0), 1, Some(bench(80.0))),
            OcrBackend::Cuda { device_id: 0 }
        );
    }

    #[test]
    fn config_roundtrip_preserves_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ocr_device.json");
        let cfg = OcrDeviceConfig {
            mode: OcrDeviceMode::ForceGpu,
            bench: Some(BenchResult { cpu_ms: 100.0, gpu_ms: 20.0 }),
        };
        cfg.save(&path).unwrap();
        let loaded = OcrDeviceConfig::load(&path);
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn config_load_missing_file_is_default() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = OcrDeviceConfig::load(&dir.path().join("none.json"));
        assert_eq!(cfg, OcrDeviceConfig::default());
        assert_eq!(cfg.mode, OcrDeviceMode::Auto);
    }

    #[test]
    fn config_load_corrupt_file_is_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(OcrDeviceConfig::load(&path), OcrDeviceConfig::default());
    }

    #[test]
    fn status_new_actual_equals_requested() {
        let s = OcrDeviceStatus::new(OcrDeviceMode::Auto, OcrBackend::Cpu, None);
        assert_eq!(s.requested, s.actual);
        assert!(!s.calibrating);
        assert!(s.fallback_reason.is_none());
        // v0.12.1：新建状态引擎未就绪（worker 加载成功后才置 true）
        assert!(!s.engine_ready);
    }

    #[test]
    fn status_roundtrip_keeps_engine_ready() {
        // v0.12.1：engine_ready 缺省反序列化为 false（旧前端/旧 JSON 零回归）；
        // 显式 false 往返一致
        let s = OcrDeviceStatus {
            mode: OcrDeviceMode::ForceCpu,
            requested: OcrBackend::Cpu,
            actual: OcrBackend::Cpu,
            fallback_reason: Some("请求后端 Cuda 构建失败".to_string()),
            engine_ready: false,
            bench: None,
            calibrating: false,
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: OcrDeviceStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
        // 无 engine_ready 键的旧载荷 → false（不阻断反序列化）
        let legacy = r#"{"mode":"Auto","requested":{"Cuda":{"device_id":0}},"actual":{"Cuda":{"device_id":0}},"fallback_reason":null,"bench":null,"calibrating":false}"#;
        let from_legacy: OcrDeviceStatus = serde_json::from_str(legacy).unwrap();
        assert!(!from_legacy.engine_ready);
    }
}
