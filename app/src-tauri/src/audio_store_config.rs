//! 音频落盘策略配置（REQ-068 / v0.6.0 M4 的**配置面**；批 8 T27 从 `audio_store.rs` 抽出）。
//!
//! @ai-context: 本件只承载**类型与默认值**（结构体 + `Default` + 两个 `DEFAULT_*`）
//!              —— 与 WAV 写侧（`audio_store.rs` 的 `SessionAudioWriter` / `cleanup`）
//!              物理分离：配策略与写字节是两件事，混在一处会让"改默认值"与"改写盘逻辑"
//!              在同一文件里互相牵动（AGENTS.md §3「纯逻辑与副作用物理分离」）。
//! @ai-context: 由 `audio_store.rs` 以 `#[path]` 声明（同 `audio_align` 先例）⇒ `lib.rs`
//!              一行未动；`AudioStoreConfig` 与两个 `DEFAULT_*` 仍从 `audio_store` 原路径
//!              再导出 ⇒ 既有调用点零改动。
//! @ai-context: 本步是**行为等价的纯搬家**：一个调用点也不改（配置通道是下一步）。
//! @ai-context: 边界 = 本件不改音频存储格式（WAV 仍 16kHz 单声道 PCM16），也没有任何 IO。

/// 默认保留期（天）。
pub const DEFAULT_RETENTION_DAYS: u64 = 30;
/// 默认磁盘预算（字节；1 小时 ≈ 115MB，预算 4GB ≈ 35 小时会话）。
pub const DEFAULT_DISK_BUDGET_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// 落盘策略配置。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioStoreConfig {
    /// 总开关（默认开；关闭=现状行为零开销）
    pub enabled: bool,
    /// 保留期（天；超期文件清理）
    pub retention_days: u64,
    /// 磁盘预算（字节；总大小超限删最旧）
    pub disk_budget_bytes: u64,
}

/// 默认配置：开启（保留 30 天 / 预算 4GB；关闭 = 现状行为零开销）。
impl Default for AudioStoreConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            retention_days: DEFAULT_RETENTION_DAYS,
            disk_budget_bytes: DEFAULT_DISK_BUDGET_BYTES,
        }
    }
}
