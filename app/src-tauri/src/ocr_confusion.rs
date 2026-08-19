//! OCR 错误模式校准表（REQ-120 PIPE-3 / v0.7.0 M2）。
//!
//! @ai-context: OCR 常见误识字符对（0/O、1/l/I、8/B、5/S 等）数据驱动画像——
//!              落库混淆对统计 → 自动生成替换词表（供 REQ-040 替换词通道补充）
//!              与校准表（OCR 后纠错）。纯本地、无网络、可校准（JSON 导出）。
//! @ai-context: 统计口径：OCR 文本与参考文本（ASR 交叉验证/人工校正）对齐后
//!              收集单字符替换对；本模块提供画像聚合与替换表生成的纯逻辑，
//!              采集端（OCR 块 vs 段文本交叉）在 M2 接线层。

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// 单字符混淆计数。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConfusionCount {
    /// 误识字符（OCR 输出）
    pub from: char,
    /// 正确字符（参考）
    pub to: char,
    /// 出现次数
    pub count: u64,
}

/// 混淆画像（会话聚合）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ConfusionProfile {
    /// 按 (from,to) 计数的混淆对
    #[serde(default)]
    pub pairs: Vec<ConfusionCount>,
}

/// 内置高频混淆对先验（0/O、1/l、8/B 等——OCR 模型系统误差的通用模式；
/// 数据画像与之合并，先验只在无数据时兜底）。
pub fn builtin_priors() -> Vec<(char, char)> {
    vec![
        ('0', 'O'), ('O', '0'), // 数字零 ↔ 字母 O
        ('1', 'l'), ('1', 'I'), ('l', '1'), ('I', '1'), // 一 ↔ l/I
        ('8', 'B'), ('B', '8'), // 八 ↔ B
        ('5', 'S'), ('S', '5'), // 五 ↔ S
        ('6', 'G'), ('G', '6'), // 六 ↔ G
        ('2', 'Z'), ('Z', '2'), // 二 ↔ Z
        ('，', ','), (',', '，'), // 中英文逗号
        ('。', '.'), ('.', '。'), // 中英文句号
    ]
}

impl ConfusionProfile {
    /// 记录一次混淆（计数累加）。
    pub fn record(&mut self, from: char, to: char) {
        if from == to {
            return;
        }
        if let Some(p) = self.pairs.iter_mut().find(|p| p.from == from && p.to == to) {
            p.count += 1;
        } else {
            self.pairs.push(ConfusionCount { from, to, count: 1 });
        }
    }

    /// 批量记录（对齐后的字符对序列）。
    pub fn record_many(&mut self, pairs: &[(char, char)]) {
        for &(f, t) in pairs {
            self.record(f, t);
        }
    }

    /// 从文本对齐提取字符对（纯函数）：逐字符比较两条文本（长度不同 → 截断
    /// 到较短长度——对齐近似；防御：空输入返回空）。
    ///
    /// @ai-context: 对齐近似说明：不做全局对齐（编辑距离回溯成本高且本场景
    ///              为单字符替换为主），逐位比较足以捕获 0/O 类单字符混淆。
    pub fn extract_pairs(ocr_text: &str, reference: &str) -> Vec<(char, char)> {
        ocr_text.chars().zip(reference.chars()).filter(|(a, b)| a != b).collect()
    }

    /// 高频混淆对（按计数降序，取 top N）。
    pub fn top_pairs(&self, n: usize) -> Vec<&ConfusionCount> {
        let mut sorted: Vec<&ConfusionCount> = self.pairs.iter().collect();
        sorted.sort_by(|a, b| b.count.cmp(&a.count));
        sorted.truncate(n);
        sorted
    }

    /// 生成替换词表（供 REQ-040 替换词通道）：高频混淆对 → (from → to) 候选。
    ///
    /// @ai-context: 阈值 MIN_COUNT 防噪声（单次混淆不生成候选——用户确认闭环
    ///              仍是最终把关：候选供建议列表，不自动生效）。
    /// @ai-context: 先验合并：无数据时内置先验兜底（新装环境仍有基础纠错）。
    pub fn build_replacement_candidates(&self, min_count: u64) -> Vec<crate::vocab::ReplacePair> {
        let mut candidates: Vec<crate::vocab::ReplacePair> = self
            .top_pairs(50)
            .into_iter()
            .filter(|p| p.count >= min_count)
            .map(|p| crate::vocab::ReplacePair { from: p.from.to_string(), to: p.to.to_string() })
            .collect();
        // 先验合并（去重：数据画像优先，先验只补缺）
        for (from, to) in builtin_priors() {
            if !candidates.iter().any(|c| c.from == from.to_string()) {
                candidates.push(crate::vocab::ReplacePair { from: from.to_string(), to: to.to_string() });
            }
        }
        candidates
    }

    /// 保存画像（JSON 原子写；路径可注入测试）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化混淆画像失败: {}", e)))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 加载画像（缺失/损坏 → 空画像，不阻断）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_accumulates_counts() {
        // Arrange
        let mut p = ConfusionProfile::default();
        // Act：0→O 两次、1→l 一次
        p.record('0', 'O');
        p.record('0', 'O');
        p.record('1', 'l');
        // Assert：计数正确
        assert_eq!(p.pairs.len(), 2);
        assert_eq!(p.pairs.iter().find(|x| x.from == '0').unwrap().count, 2);
    }

    #[test]
    fn same_char_not_recorded() {
        // 同字符（无混淆）不计数
        let mut p = ConfusionProfile::default();
        p.record('A', 'A');
        assert!(p.pairs.is_empty());
    }

    #[test]
    fn extract_pairs_from_texts() {
        // "0K" vs "OK" → 一对 (0,O)
        let pairs = ConfusionProfile::extract_pairs("0K", "OK");
        assert_eq!(pairs, vec![('0', 'O')]);
        // 空输入安全
        assert!(ConfusionProfile::extract_pairs("", "OK").is_empty());
    }

    #[test]
    fn top_pairs_sorted_by_count() {
        let mut p = ConfusionProfile::default();
        p.record('1', 'l');
        p.record('0', 'O');
        p.record('0', 'O');
        let top = p.top_pairs(2);
        assert_eq!(top[0].from, '0', "高频在前");
    }

    #[test]
    fn candidates_respect_min_count_and_priors() {
        // 数据：0→O 三次（≥2）→ 候选；1→l 一次（<2）→ 不候选但先验兜底
        let mut p = ConfusionProfile::default();
        p.record('0', 'O');
        p.record('0', 'O');
        p.record('0', 'O');
        p.record('1', 'l');
        let candidates = p.build_replacement_candidates(2);
        assert!(candidates.iter().any(|c| c.from == "0" && c.to == "O"));
        // 1→l 单次不入候选（阈值），但先验含 1→l（新装兜底）
        assert!(candidates.iter().any(|c| c.from == "1"));
    }

    #[test]
    fn save_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("entropy-confusion-{}", std::process::id()));
        let path = dir.join("confusion.json");
        let mut p = ConfusionProfile::default();
        p.record('0', 'O');
        p.save(&path).unwrap();
        let loaded = ConfusionProfile::load(&path);
        assert_eq!(loaded.pairs.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_missing_is_default() {
        let p = ConfusionProfile::load(std::path::Path::new("C:/nonexistent/confusion.json"));
        assert!(p.pairs.is_empty());
    }
}
