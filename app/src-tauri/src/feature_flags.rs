//! 功能开关（v0.11.1；v4 §11.3：feed 相关能力默认关闭）。
//!
//! @ai-context: 项目"增强能力默认关闭"传统的统一开关位——feed_capture 控制
//!              碎片快速捕获面的可见性与 command 准入（后端不信前端隐藏）；
//!              JSON 持久化同 vocab/ai_settings 模式（缺失/损坏回退默认不阻断）。

use serde::{Deserialize, Serialize};

/// 功能开关集（新增开关必须默认 false——保守默认纪律）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeatureFlags {
    /// feed 碎片快速捕获（v0.11.1 默认关——Phase 2 验证前不默认启用）
    pub feed_capture: bool,
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self { feed_capture: false }
    }
}

impl FeatureFlags {
    /// 从 JSON 文件加载（缺失/损坏 → 内置默认，诚实降级不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// 持久化（先写临时文件再 rename——原子写，防半截 JSON）。
    pub fn save(&self, path: &std::path::Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self).unwrap_or_default();
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 按名读取（白名单；未知开关 → None，诚实不猜）。
    /// 登记豁免 dead_code：get_feature_flags 命令直接返回全量结构，
    /// 按名读取留给后续开关增多时的精确消费。
    #[allow(dead_code)]
    pub fn get(&self, name: &str) -> Option<bool> {
        match name {
            "feed_capture" => Some(self.feed_capture),
            _ => None,
        }
    }

    /// 按名写入（白名单；未知开关 → false 返回）。
    pub fn set(&mut self, name: &str, value: bool) -> bool {
        match name {
            "feed_capture" => {
                self.feed_capture = value;
                true
            }
            _ => false,
        }
    }
}

#[cfg(test)]
#[path = "feature_flags_tests.rs"]
mod tests;
