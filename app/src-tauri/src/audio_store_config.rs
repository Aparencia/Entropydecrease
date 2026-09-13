//! 音频落盘策略配置（REQ-068 / v0.6.0 M4 的**配置面**；批 8 T27 从 `audio_store.rs` 抽出）。
//!
//! @ai-context: 产品问题 #1（用户裁决 U1-a #1）：面板显示的「落盘启用状态」用户改不了 ——
//!              `AudioStoreConfig` 此前**只有 `Default`**（无 JSON / env 通道）⇒ `status.enabled`
//!              恒 `true`。本件补齐持久化通道，把开关做成真的。
//! @ai-context: 形态**逐条对齐同域先例** `audio_preproc_config.rs`：`load`（缺失 / 损坏 ⇒
//!              默认 + 可观测日志，不阻断会话）/ `save`（原子写 = `.tmp` → rename）/
//!              `effective`（配置文件 > env > 默认）。**唯一形态差异**：本配置有 3 个字段而
//!              env 只管总开关 ⇒ `effective()` 返回生效后的 `Self`（先例是单字段配置、返回
//!              `bool`；若此处也返回 `bool`，调用点得手工拼结构体才能交给
//!              `SessionAudioWriter::create`）。
//! @ai-context: 读取优先级：`{data_dir}/audio-store.json` > env `ENTROPY_AUDIO_STORE`
//!              （开发期快速实测）> 默认（开 / 保留 30 天 / 预算 4GB）。
//! @ai-context: 副作用 = 读写**应用数据目录**内的单个 JSON（AGENTS.md §4：文件系统访问限定
//!              应用数据目录）；`save` 先写 `.tmp` 再 rename（防写一半损坏配置）。
//! @ai-context: 边界 = ① 配置**不进 SQLite** ⇒ 零迁移（`db_migrations.rs` 零改动）；② 开关只在
//!              **下次实时会话**生效（不热切换进行中会话 —— 音频链路抖动风险，同
//!              audio-preproc.json 先例）；③ 本件**不改**音频存储格式（WAV 仍 16kHz 单声道
//!              PCM16），只改「是否存储」；④ 任何失败都不阻断会话主链路（音频是增强数据源）。
//! @ai-context: 本件由 `audio_store.rs` 以 `#[path]` 声明（同 `audio_align` 先例）⇒ `lib.rs`
//!              一行未动；`AudioStoreConfig` 与两个 `DEFAULT_*` 仍从 `audio_store` 原路径
//!              再导出 ⇒ 既有调用点零改动。

use serde::{Deserialize, Serialize};

/// 默认保留期（天）。
pub const DEFAULT_RETENTION_DAYS: u64 = 30;
/// 默认磁盘预算（字节；1 小时 ≈ 115MB，预算 4GB ≈ 35 小时会话）。
pub const DEFAULT_DISK_BUDGET_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// 落盘策略配置（JSON；应用数据目录 `audio-store.json`）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AudioStoreConfig {
    /// 总开关（默认开；关闭=现状行为零开销）
    pub enabled: bool,
    /// 保留期（天；超期文件清理）
    pub retention_days: u64,
    /// 磁盘预算（字节；总大小超限删最旧）
    pub disk_budget_bytes: u64,
}

impl AudioStoreConfig {
    /// 从 JSON 文件加载（缺失 / 损坏 → 默认值 + 可观测日志，不阻断启动）。
    ///
    /// @ai-context: 「损坏」= serde 解析失败（截断 / 手改错）。缺失与损坏**同档**回退默认 ——
    ///              配置读不出来不该让会话起不来（同 audio-preproc.json 先例）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("[AudioStore] 配置解析失败（回退默认值）: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// 原子写配置（先写临时文件再 rename——防写一半损坏配置）。
    ///
    /// @ai-context: `parent` 不存在则创建（首启时该级目录可能还没有）；临时名走
    ///              `with_extension` ⇒ `audio-store.tmp`（与先例同形）。
    pub fn save(&self, path: &std::path::Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 生效配置（配置文件 > env `ENTROPY_AUDIO_STORE` > 默认）。
    ///
    /// @ai-context: env 只覆盖**总开关**（`=1` 开、其余关 —— 与先例 `ENTROPY_AUDIO_PREPROC`
    ///              逐字同形）；保留期 / 预算无 env 通道（它们不在产品问题 #1 的面内）。
    pub fn effective(&self) -> Self {
        match std::env::var("ENTROPY_AUDIO_STORE") {
            Ok(v) => Self { enabled: v == "1", ..*self },
            Err(_) => *self,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 独立临时目录夹具（pid + tag ⇒ 并发用例互不踩；Drop 时整体删除）。
    struct TempDir {
        root: std::path::PathBuf,
    }

    impl TempDir {
        fn new(tag: &str) -> Self {
            let root = std::env::temp_dir()
                .join(format!("entropy-audio-store-{}-{}", std::process::id(), tag));
            std::fs::create_dir_all(&root).expect("建临时目录");
            Self { root }
        }

        fn cfg(&self) -> std::path::PathBuf {
            self.root.join("audio-store.json")
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn default_is_enabled_with_frozen_policy() {
        // 默认：开 + 保留 30 天 + 预算 4GB（策略默认值与原 audio_store 常量同源）
        let cfg = AudioStoreConfig::default();
        assert!(cfg.enabled);
        assert_eq!(cfg.retention_days, DEFAULT_RETENTION_DAYS);
        assert_eq!(cfg.disk_budget_bytes, DEFAULT_DISK_BUDGET_BYTES);
    }

    #[test]
    fn load_missing_file_defaults() {
        // 缺失配置 → 默认开（不阻断启动）
        let cfg = AudioStoreConfig::load(std::path::Path::new("C:/nonexistent/audio-store.json"));
        assert_eq!(cfg, AudioStoreConfig::default());
    }

    #[test]
    fn save_then_load_roundtrip() {
        // Arrange：非默认的策略值（证明三个字段都真的落盘，而非只落了开关）
        let d = TempDir::new("roundtrip");
        let cfg = AudioStoreConfig { enabled: false, retention_days: 7, disk_budget_bytes: 1_024 };
        // Act
        cfg.save(&d.cfg()).expect("保存成功");
        let loaded = AudioStoreConfig::load(&d.cfg());
        // Assert：读回逐字段相等（roundtrip）
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn corrupted_json_falls_back_without_panic() {
        // 损坏 JSON → 默认值（防御：配置错误不劣化音频链路；**不 panic**）
        let d = TempDir::new("corrupt");
        std::fs::write(d.cfg(), b"{ not json").unwrap();
        assert_eq!(AudioStoreConfig::load(&d.cfg()), AudioStoreConfig::default());
    }

    #[test]
    fn user_toggle_persists_disabled() {
        // 🔴 V1 核心：用户关闭 ⇒ 落盘 ⇒ **重新 load 同一文件**仍为 false（默认开不覆盖用户选择）
        let d = TempDir::new("off");
        let saved = AudioStoreConfig { enabled: false, ..AudioStoreConfig::default() };
        saved.save(&d.cfg()).expect("保存成功");
        // 重新载入（模拟下一次会话/命令调用；**不是**重启真机）
        let reloaded = AudioStoreConfig::load(&d.cfg());
        assert!(!reloaded.enabled, "配置文件显式 false 应保持关闭");
        assert_eq!(reloaded, saved, "保存后读回 == 保存值");
    }

    #[test]
    fn save_is_idempotent() {
        // 幂等：连存两次 == 存一次（原子写的字节确定）
        let d = TempDir::new("idem");
        let cfg = AudioStoreConfig { enabled: false, retention_days: 7, disk_budget_bytes: 1_024 };
        cfg.save(&d.cfg()).expect("第一次保存");
        let once = std::fs::read(d.cfg()).unwrap();
        cfg.save(&d.cfg()).expect("第二次保存");
        let twice = std::fs::read(d.cfg()).unwrap();
        assert_eq!(twice, once, "连存两次应与存一次逐字节相同");
        // 且临时文件不残留（rename 而非 copy）
        assert!(!d.root.join("audio-store.tmp").exists());
    }

    #[test]
    fn env_overrides_config_switch() {
        // env 开发期通道优先于配置文件（快速实测不落盘）
        unsafe {
            std::env::set_var("ENTROPY_AUDIO_STORE", "1");
        }
        let cfg = AudioStoreConfig { enabled: false, ..AudioStoreConfig::default() };
        assert!(cfg.effective().enabled, "env=1 应覆盖配置文件关闭态");
        unsafe {
            std::env::set_var("ENTROPY_AUDIO_STORE", "0");
        }
        assert!(!cfg.effective().enabled, "env=0 应保持关闭");
        unsafe {
            std::env::remove_var("ENTROPY_AUDIO_STORE");
        }
        assert!(!cfg.effective().enabled, "无 env 时回退配置文件");
    }

    #[test]
    fn effective_without_env_keeps_policy_fields() {
        // env 只管总开关：保留期 / 预算在任何 env 下都原样透传（无 env 通道）
        let cfg = AudioStoreConfig { enabled: true, retention_days: 3, disk_budget_bytes: 512 };
        let eff = cfg.effective();
        assert_eq!(eff.retention_days, 3);
        assert_eq!(eff.disk_budget_bytes, 512);
    }
}
