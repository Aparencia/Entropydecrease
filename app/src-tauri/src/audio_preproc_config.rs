//! 音频预处理链持久化配置（REQ-101 PRE-O1 / v0.7.0 M1）。
//!
//! @ai-context: 预处理链默认值定标的落地通道——CER 微基准（bin/cer_bench.rs）
//!              给出"开/关"对比结论后，用户可在设置面板开关；配置 JSON 原子写
//!              应用数据目录（同 OcrDeviceConfig 模式），下次实时会话生效
//!              （不热切换进行中会话，避免音频链路抖动）。
//! @ai-context: 读取优先级：配置文件 > env ENTROPY_AUDIO_PREPROC（开发期
//!              快速实测）> 默认开。纯函数可单测（配置路径可注入）。
//! @ai-context: 2026-08 用户决策：默认**开启**——低音量课程防 VAD 截断的
//!              收益（CER 微基准支撑）大于预处理开销；此前 REQ-041 裁决"默认关"
//!              被用户反馈推翻（用户开关通道保留，可随时关闭）。

use serde::{Deserialize, Serialize};

/// 持久化配置（JSON，应用数据目录）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AudioPreprocConfig {
    /// 预处理链总开关（AGC + 削波检测 + 动态静音阈值）
    /// 默认开（2026-08 用户决策：防低音量课程 VAD 截断，见模块注释）
    pub enabled: bool,
}

impl AudioPreprocConfig {
    /// 从 JSON 文件加载（缺失/损坏 → 默认开 + 可观测日志，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("[AudioPreproc] 配置解析失败（回退默认开）: {}", e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// 原子写配置（先写临时文件再 rename——防写一半损坏配置）。
    pub fn save(&self, path: &std::path::Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
        })?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 生效开关（配置文件 > env 覆盖 > 默认开）：
    /// env ENTROPY_AUDIO_PREPROC=1 为开发期快速实测通道（12.wav 低电平取证）。
    pub fn effective(&self) -> bool {
        match std::env::var("ENTROPY_AUDIO_PREPROC") {
            Ok(v) => v == "1",
            Err(_) => self.enabled,
        }
    }
}

/// 默认配置：开启（2026-08 用户决策——覆盖 REQ-041 原"默认关"裁决）。
impl Default for AudioPreprocConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_enabled() {
        // 2026-08 用户决策：默认开（防低音量课程 VAD 截断；覆盖 REQ-041 原裁决）
        assert!(AudioPreprocConfig::default().enabled);
    }

    #[test]
    fn load_missing_file_defaults() {
        // 缺失配置 → 默认开（不阻断启动）
        let cfg = AudioPreprocConfig::load(std::path::Path::new("C:/nonexistent/audio-preproc.json"));
        assert!(cfg.enabled);
    }

    #[test]
    fn save_then_load_roundtrip() {
        // 原子写 + 读回 roundtrip（临时目录）
        let dir = std::env::temp_dir().join(format!("entropy-audio-preproc-test-{}", std::process::id()));
        let path = dir.join("audio-preproc.json");
        let cfg = AudioPreprocConfig { enabled: true };
        cfg.save(&path).expect("保存成功");
        let loaded = AudioPreprocConfig::load(&path);
        assert!(loaded.enabled);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupted_json_falls_back() {
        // 损坏 JSON → 默认开（防御：配置错误不劣化音频链路）
        let dir = std::env::temp_dir().join(format!("entropy-audio-preproc-bad-{}", std::process::id()));
        let path = dir.join("audio-preproc.json");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "{not json").unwrap();
        let cfg = AudioPreprocConfig::load(&path);
        assert!(cfg.enabled);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn user_toggle_persists_disabled() {
        // 用户主动关闭必须持久化生效（默认开不覆盖用户选择）
        let dir = std::env::temp_dir().join(format!("entropy-audio-preproc-off-{}", std::process::id()));
        let path = dir.join("audio-preproc.json");
        AudioPreprocConfig { enabled: false }.save(&path).expect("保存成功");
        let loaded = AudioPreprocConfig::load(&path);
        assert!(!loaded.enabled, "配置文件显式 false 应保持关闭");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn env_overrides_config() {
        // env 开发期通道优先于配置文件（快速实测不落盘）
        unsafe {
            std::env::set_var("ENTROPY_AUDIO_PREPROC", "1");
        }
        let cfg = AudioPreprocConfig { enabled: false };
        assert!(cfg.effective(), "env=1 应覆盖配置文件关闭态");
        unsafe {
            std::env::remove_var("ENTROPY_AUDIO_PREPROC");
        }
        assert!(!cfg.effective(), "无 env 时回退配置文件");
        unsafe {
            std::env::set_var("ENTROPY_AUDIO_PREPROC", "0");
        }
        assert!(!cfg.effective(), "env=0 应保持关闭");
        unsafe {
            std::env::remove_var("ENTROPY_AUDIO_PREPROC");
        }
    }
}
