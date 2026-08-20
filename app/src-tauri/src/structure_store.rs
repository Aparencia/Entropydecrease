//! 结构图存储（REQ-183 / v0.7.7）：`struct/` 命名空间 + 独立预算 + 双指纹去重。
//!
//! @ai-context: 非线性结构图（表格/公式/代码/流程图等）持久化——与 `crop/`
//!              （精修中间产物）语义分离：struct/ = 图库消费的持久结构图。
//!              原图 + 缩略图两级（缩略图在 struct/thumb/ 子目录，命名空间
//!              完全隔离防与 full/ 缩略图碰撞）。
//! @ai-context: 预算独立桶 STRUCT_BUDGET_AUTO（仅自动捕获计数；手动不设限——
//!              用户主动行为不被预算驱逐）；去重复用 same_image 双指纹
//!              （REQ-067 先例，与 image_store 同口径）。
//! @ai-context: 文件名 = 入库时间毫秒（与源帧时间戳解耦——源时间在 DB
//!              source_ts_ms 字段）；冲突（同一毫秒两次入库）递增兜底。

use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use crate::error::Result;

/// 自动捕获预算（每会话；手动不设限）。
pub const STRUCT_BUDGET_AUTO: usize = 80;
/// 去重指纹缓冲容量（≥ 预算上限——批量重跑从已有 struct/ 重建指纹后 FIFO
/// 不因 pop_front 丢失历史；80 预算 + 手动余量）。
const DEDUPE_BUFFER: usize = 96;

/// 结构图存储（有状态：会话目录 + 已存计数 + 去重缓冲）。
#[derive(Debug, Clone)]
pub struct StructureImageStore {
    session_dir: PathBuf,
    /// 已存结构图数（struct/ 计数）
    saved: usize,
    /// 自动桶预算上限（手动路径不检查）
    budget: usize,
    /// 去重指纹（auto 路径；启动时从已有 struct/ 重建——批量任务每次新建
    /// 实例，FIFO 必须跨调用持久；manual 不参与——每次框选都是新意图）
    recent_fingerprints: VecDeque<(u64, u64, String)>,
}

impl StructureImageStore {
    /// 创建结构图存储（默认自动桶预算）。
    pub fn new(session_dir: PathBuf) -> Result<Self> {
        Self::with_budget(session_dir, STRUCT_BUDGET_AUTO)
    }

    /// 显式预算创建（测试/命令层注入）。
    pub fn with_budget(session_dir: PathBuf, budget: usize) -> Result<Self> {
        std::fs::create_dir_all(session_dir.join("struct"))?;
        std::fs::create_dir_all(session_dir.join("struct").join("thumb"))?;
        let saved = count_webp(&session_dir.join("struct"));
        let recent_fingerprints = rebuild_fingerprints(&session_dir.join("struct"));
        Ok(Self { session_dir, saved, budget, recent_fingerprints })
    }

    /// 自动桶剩余预算。
    pub fn remaining_budget(&self) -> usize {
        self.budget.saturating_sub(self.saved)
    }

    /// 自动捕获入库：预算检查 + 双指纹去重 → struct/ + thumb/。
    ///
    /// @ai-context: 返回 (相对路径, 是否新入库)——去重命中（is_new=false）时
    ///              调用方**不得**再插记录（同图只留一份，批量重跑幂等）。
    ///              去重先于预算（重复图不消耗预算）；预算耗尽 → Err。
    pub fn save_auto(
        &mut self,
        now_ms: u64,
        bgraw: &[u8],
        width: u32,
        height: u32,
    ) -> Result<SaveOutcome> {
        let rgb = crate::image_store::bgra_to_rgb(bgraw, width, height)
            .ok_or_else(|| crate::error::AppError::Io("结构图数据无效".to_string()))?;
        let ah = crate::ocr_cache::average_hash(&rgb);
        let dh = crate::ocr_cache::difference_hash(&rgb);
        if let Some(existing) = self.dedupe_hit(ah, dh) {
            return Ok(SaveOutcome { rel: existing, is_new: false });
        }
        if self.remaining_budget() == 0 {
            return Err(crate::error::AppError::Io(format!(
                "结构图自动捕获预算已达上限（{} 张/会话）",
                self.budget
            )));
        }
        let name = self.unique_name(now_ms);
        let rel = format!("struct/{}", name);
        self.write_files(&rgb, bgraw, width, height, &name)?;
        self.saved += 1;
        self.recent_fingerprints.push_back((ah, dh, rel.clone()));
        if self.recent_fingerprints.len() > DEDUPE_BUFFER {
            self.recent_fingerprints.pop_front();
        }
        Ok(SaveOutcome { rel, is_new: true })
    }

    /// 手动截取入库：不设预算、不去重（用户每次框选都是新意图）。
    pub fn save_manual(
        &mut self,
        now_ms: u64,
        bgraw: &[u8],
        width: u32,
        height: u32,
    ) -> Result<String> {
        let rgb = crate::image_store::bgra_to_rgb(bgraw, width, height)
            .ok_or_else(|| crate::error::AppError::Io("结构图数据无效".to_string()))?;
        let name = self.unique_name(now_ms);
        self.write_files(&rgb, bgraw, width, height, &name)?;
        self.saved += 1;
        Ok(format!("struct/{}", name))
    }

    /// 删除结构图（记录驱动：删 struct/ + struct/thumb/；文件缺失容忍——
    /// 防记录与文件不一致时删除失败阻断）。
    pub fn delete_image(&self, rel: &str) -> Result<()> {
        let Some(name) = rel.strip_prefix("struct/") else {
            return Err(crate::error::AppError::Io(format!(
                "非结构图路径拒绝删除: {rel}"
            )));
        };
        let full = self.session_dir.join("struct").join(name);
        let thumb = self.session_dir.join("struct").join("thumb").join(name);
        if full.exists() {
            std::fs::remove_file(&full)?;
        }
        if thumb.exists() {
            std::fs::remove_file(&thumb)?;
        }
        Ok(())
    }

    /// 原图 + 缩略图落盘（纯 IO）。
    fn write_files(
        &self,
        rgb: &image::RgbImage,
        bgraw: &[u8],
        width: u32,
        height: u32,
        name: &str,
    ) -> Result<()> {
        crate::image_store::encode_webp(rgb, &self.session_dir.join("struct").join(name))?;
        if let Some(thumb) = crate::image_store::resize_bgra(bgraw, width, height) {
            crate::image_store::encode_webp(
                &thumb,
                &self.session_dir.join("struct").join("thumb").join(name),
            )?;
        }
        Ok(())
    }

    /// 去重命中（纯读）：与最近保存结构图双稳定同图 → 返回已有相对路径。
    fn dedupe_hit(&self, ah: u64, dh: u64) -> Option<String> {
        self.recent_fingerprints
            .iter()
            .find(|(la, ld, _)| crate::frame_cluster::same_image(*la, *ld, ah, dh, 6, 8))
            .map(|(_, _, path)| path.clone())
    }

    /// 文件名唯一化（纯 IO 探测）：入库时间毫秒，冲突（同毫秒已存在）递增。
    fn unique_name(&self, now_ms: u64) -> String {
        let mut ts = now_ms;
        loop {
            let name = format!("{}.webp", ts);
            if !self.session_dir.join("struct").join(&name).exists() {
                return name;
            }
            ts += 1;
        }
    }
}

/// 保存结果（自动路径；is_new=false = 去重命中已有图——调用方跳过插记录）。
#[derive(Debug, Clone, PartialEq)]
pub struct SaveOutcome {
    pub rel: String,
    pub is_new: bool,
}

/// 统计 struct/ 目录内 WebP 文件数（预算恢复；目录缺失按 0 计）。
fn count_webp(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().is_some_and(|x| x == "webp"))
                .count()
        })
        .unwrap_or(0)
}

/// 从已有 struct/ 文件重建去重指纹（批量任务每次新建实例——内存 FIFO 不
/// 跨调用持久，重跑幂等必须从磁盘重建；解码失败文件跳过不阻断）。
fn rebuild_fingerprints(struct_dir: &Path) -> VecDeque<(u64, u64, String)> {
    let mut recent = VecDeque::new();
    let Ok(entries) = std::fs::read_dir(struct_dir) else {
        return recent;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().is_some_and(|x| x == "webp") {
            let Ok(img) = image::open(&p) else { continue };
            let rgb = img.to_rgb8();
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            recent.push_back((
                crate::ocr_cache::average_hash(&rgb),
                crate::ocr_cache::difference_hash(&rgb),
                format!("struct/{}", name),
            ));
        }
    }
    recent
}

#[cfg(test)]
#[path = "structure_store_tests.rs"]
mod tests;
