//! 音频预处理链持久化配置（REQ-101 PRE-O1 / v0.7.0 M1）。
//!
//! @ai-context: 预处理链默认值定标的落地通道——CER 微基准（bin/cer_bench.rs）
//!              给出"开/关"对比结论后，用户可在设置面板开关；配置 JSON 原子写
//!              应用数据目录（同 OcrDeviceConfig 模式），下次实时会话生效
//!              （不热切换进行中会话，避免音频链路抖动）。
//! @ai-context: 读取优先级：配置文件 > env ENTROPY_AUDIO_PREPROC（开发期
//!              快速实测）> 默认关。纯函数可单测（配置路径可注入）。

use serde::{Deserialize, Serialize};

/// 持久化配置（JSON，应用数据目录）。
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct AudioPreprocConfig {
    /// 预处理链总开关（AGC + 削波检测 + 动态静音阈值）
    pub enabled: bool,
}

impl AudioPreprocConfig {
    /// 从 JSON 文件加载（缺失/损坏 → 默认关 + 可观测日志，不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("[AudioPreproc] 配置解析失败（回退默认关）: {}", e);
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

    /// 生效开关（配置文件 > env 覆盖 > 默认关）：
    /// env ENTROPY_AUDIO_PREPROC=1 为开发期快速实测通道（12.wav 低电平取证）。
    pub fn effective(&self) -> bool {
        match std::env::var("ENTROPY_AUDIO_PREPROC") {
            Ok(v) => v == "1",
            Err(_) => self.enabled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_disabled() {
        // REQ-041 裁决：默认关（CER 微基准后由用户开启）
        assert!(!AudioPreprocConfig::default().enabled);
    }

    #[test]
    fn load_missing_file_defaults() {
        // 缺失配置 → 默认关（不阻断启动）
        let cfg = AudioPreprocConfig::load(std::path::Path::new("C:/nonexistent/audio-preproc.json"));
        assert!(!cfg.enabled);
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
        // 损坏 JSON → 默认关（防御：配置错误不劣化音频链路）
        let dir = std::env::temp_dir().join(format!("entropy-audio-preproc-bad-{}", std::process::id()));
        let path = dir.join("audio-preproc.json");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "{not json").unwrap();
        let cfg = AudioPreprocConfig::load(&path);
        assert!(!cfg.enabled);
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
