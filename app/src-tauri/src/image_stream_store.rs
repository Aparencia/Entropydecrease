//! 图像流存储层（REQ-110 M-存储 / v0.7.0 M1.5：时间轴帧序列）。
//!
//! @ai-context: 图像优先档（跟练/白板/游戏教程/题目讲解，M2 档案组）的存储形态：
//!              帧流 + 时间戳 + 步骤边界——**不 50 张截断**（图集预算保护转移到
//!              本层分级标记）；低价值帧只存指纹（JSON 索引），高价值帧存图。
//! @ai-context: 三级标记：High=存图（步骤边界/新文字帧）；Low=只记指纹（重复/
//!              静止帧——时间轴占位，可回溯不可看图）；None=跳过（无信息帧）。
//! @ai-context: 产物消费：T4 跟练档案步骤图卡按 timestamp_ms 查 stream 帧；
//!              真机磁盘占用实测定阈值（v0.7.0 验收项——本版先落分级机制）。

use std::path::{Path, PathBuf};

use crate::error::Result;

/// 帧价值标记（分级存储决策）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FrameValue {
    /// 高价值：存图（步骤边界/新文字帧）
    High,
    /// 低价值：只记指纹（时间轴占位，不占图集预算）
    Low,
    /// 跳过：无信息帧（纯色/黑边）
    Skip,
}

/// 图像流帧条目（JSON 索引行）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct StreamFrame {
    /// 相对会话起点时间戳（ms）
    pub timestamp_ms: u64,
    pub value: FrameValue,
    /// 相对路径（value=High 时有值；Low 时为空——只记指纹）
    pub path: Option<String>,
    /// aHash 指纹（Low 帧占位/去重）
    pub ahash: u64,
    /// 步骤边界标记（M2 T4 口令/交替切分写入；None=非边界）
    pub step_boundary: Option<u32>,
}

/// 图像流存储（有状态：会话 stream 目录 + 内存索引）。
#[derive(Debug, Clone)]
pub struct ImageStreamStore {
    session_dir: PathBuf,
    /// 帧索引（按时间戳升序；内存态 + JSON 持久化）
    frames: Vec<StreamFrame>,
    /// 最近帧 aHash（低价值判定基准）
    last_ahash: Option<u64>,
    /// 步骤边界序号（M2 T4 切分信号写入时递增）
    step_seq: u32,
}

impl ImageStreamStore {
    /// 创建图像流存储（目录不存在则创建；索引从磁盘恢复）。
    pub fn new(session_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(session_dir.join("stream"))?;
        let frames = Self::load_index(&session_dir);
        let step_seq = frames.iter().filter_map(|f| f.step_boundary).max().unwrap_or(0);
        Ok(Self { session_dir, frames, last_ahash: None, step_seq })
    }

    /// 索引 JSON 路径。
    fn index_path(session_dir: &Path) -> PathBuf {
        session_dir.join("stream").join("index.json")
    }

    /// 从磁盘恢复索引（缺失/损坏 → 空索引 + 日志，不阻断）。
    fn load_index(session_dir: &Path) -> Vec<StreamFrame> {
        match std::fs::read_to_string(Self::index_path(session_dir)) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("[ImageStream] 索引解析失败（重建空索引）: {}", e);
                Vec::new()
            }),
            Err(_) => Vec::new(),
        }
    }

    /// 持久化索引（原子写：临时文件 + rename）。
    fn persist(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.frames)
            .map_err(|e| crate::error::AppError::Io(format!("索引序列化失败: {}", e)))?;
        let path = Self::index_path(&self.session_dir);
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 记录一帧（分级存储）：
    /// High=存图到 stream/<ts>.webp；Low=只记指纹；Skip=忽略。
    ///
    /// @ai-context: 低价值帧判定：与最近帧 aHash 相同/相近（双稳定同图）→ Low
    ///              （时间轴占位，防重复存图）；纯色/黑边由调用方预判 Skip。
    /// @ai-context: 磁盘占用控制：High 帧是"变化后首帧"（步骤/新内容），
    ///              静止期不存图——长会话 High 帧数 ≈ 内容变化数。
    pub fn record(
        &mut self,
        timestamp_ms: u64,
        value: FrameValue,
        bgraw: Option<&[u8]>,
        width: u32,
        height: u32,
    ) -> Result<()> {
        if value == FrameValue::Skip {
            return Ok(());
        }
        let ahash = bgraw
            .and_then(|raw| crate::image_store::bgra_to_rgb_public(raw, width, height))
            .map(|rgb| crate::ocr_cache::average_hash(&rgb))
            .unwrap_or(0);
        let path = if value == FrameValue::High {
            if let (Some(raw), w, h) = (bgraw, width, height) {
                let name = format!("{}.webp", timestamp_ms);
                let path = self.session_dir.join("stream").join(&name);
                crate::image_store::encode_webp_public(raw, w, h, &path)?;
                Some(format!("stream/{}", name))
            } else {
                None
            }
        } else {
            // Low：与最近帧同图则跳过（已有占位）；否则记指纹占位
            if self.last_ahash == Some(ahash) && ahash != 0 {
                return Ok(());
            }
            None
        };
        self.last_ahash = Some(ahash);
        self.frames.push(StreamFrame {
            timestamp_ms,
            value,
            path,
            ahash,
            step_boundary: None,
        });
        self.persist()
    }

    /// 标记步骤边界（M2 T4：口令/示范跟练交替切分信号写入时调用）。
    ///
    /// @ai-context: 返回边界序号（步骤卡产物块引用）；对最近一帧打标记
    ///              （调用方先 record 帧再标记边界——口令出现时刻的画面）。
    pub fn mark_step_boundary(&mut self) -> Result<u32> {
        self.step_seq += 1;
        if let Some(last) = self.frames.last_mut() {
            last.step_boundary = Some(self.step_seq);
        }
        self.persist()?;
        Ok(self.step_seq)
    }

    /// 帧索引（产物消费：步骤图卡按时间戳查帧）。
    pub fn frames(&self) -> &[StreamFrame] {
        &self.frames
    }

    /// 步骤边界帧（产物模板消费：每步首帧图卡）。
    pub fn step_frames(&self) -> Vec<&StreamFrame> {
        self.frames.iter().filter(|f| f.step_boundary.is_some()).collect()
    }

    /// 已存图数（High 帧；磁盘占用审计）。
    pub fn stored_count(&self) -> usize {
        self.frames.iter().filter(|f| f.path.is_some()).count()
    }
}

#[cfg(test)]
#[path = "image_stream_store_tests.rs"]
mod tests;
