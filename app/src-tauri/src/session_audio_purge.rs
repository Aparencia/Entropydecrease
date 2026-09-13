//! 会话删除的音频级联清理（批 8 T28 · 用户裁决 U1-a 的 #2）。
//!
//! @ai-context: 产品问题——**删会话不删音频**：用户删了会话，磁盘上的
//!              `{data_dir}/session-audio/{id}.wav` 与 T23 对齐 sidecar
//!              `{id}.wav.meta.json` 还留着，与「数据不出本机」的承诺（AGENTS.md §4）冲突。
//!              本模块是删会话**两条**路径——单条 `commands_session::delete_session_in`
//!              与批量 `commands_session_delete::run_batch_delete_with_audio`——共用的清理面。
//! @ai-context: 🔴 为什么「部分删除」是**允许的终态**（**显式设计，不是意外**）：DB 删除是
//!              单事务原子（`commands_session_delete.rs` 头注逐字「单事务原子
//!              batch_delete_sessions」），而**文件系统删除无法参与该事务** ⇒
//!              「DB 原子 + 文件非原子」**必然**产生「会话记录已删、个别音频文件仍在」的
//!              中间态。事务消不掉它，只能**选择失败方向**：删会话以**会话记录消失**为准
//!              （用户意图就是「这个会话别留」），文件删除失败**只登记不阻断** ⇒
//!              本模块**永不返回 `Err`**（返回 `AudioPurgeSummary` 供调用方登记）。
//! @ai-context: 顺序**先 DB 后文件**（调用方保证）：DB 删除失败/回滚 ⇒ 文件一个不动
//!              （会话还在，音频必须还在——否则是「活会话丢音频」的真数据损失）。
//! @ai-context: 与落盘开关**无关**（不读 `AudioStoreConfig`）：删会话就该删它的音频，
//!              否则「关掉落盘开关」会变成「删会话不清音频」的豁免通道，隐私面反被削弱。
//! @ai-context: 幂等——音频 / sidecar 不存在（含整个 `session-audio/` 目录不存在）不报错、
//!              不计失败：`NotFound` 是**唯一**被吞的错误，且被**显式计数**（`absent`）；
//!              其余错误一律进 `failures`（AGENTS.md §4 红线：不得空 catch / 忽略错误）。
//! @ai-context: 路径由 `data_dir` + `session_id: i64` 构造，**不拼用户输入**、不用相对路径
//!              （AGENTS.md §4「文件系统访问限定应用数据目录」）。

use std::path::{Path, PathBuf};

use crate::commands_audio::SESSION_AUDIO_DIR;

/// 会话音频清理结果（命令层登记/上报用）。
///
/// @ai-context: `deleted` / `absent` / `failures` 三态互斥且**穷尽** `remove_file` 的返回
///              ——覆盖「真删掉 / 本就不存在 / 真失败」全部出口，**没有**「静默丢弃」档。
#[derive(Debug, Default, Clone, PartialEq)]
pub struct AudioPurgeSummary {
    /// 实际删除的文件数（WAV 本体与 sidecar 都计）
    pub deleted: usize,
    /// 本就不存在、无需删除的文件数（幂等，**不算**失败）
    pub absent: usize,
    /// 失败明细（`路径: 原因`）——命令层据此登记
    pub failures: Vec<String>,
}

impl AudioPurgeSummary {
    /// 失败文件数。
    pub fn failed(&self) -> usize {
        self.failures.len()
    }

    /// 是否无失败（`false` ⇒ 存在「部分删除」终态，须登记）。
    pub fn is_clean(&self) -> bool {
        self.failures.is_empty()
    }

    /// 失败登记（命令层调用；**无失败不打日志**，正常路径不刷屏）。
    ///
    /// @ai-context: 这是「失败项必须登记/上报」的落地形态：文件删除失败**不上抛**
    ///              （不阻断已生效的会话删除），但必须**可见**——stderr 一条 + 调用方手里的
    ///              计数与明细。🔴 绝不写成 `let _ = fs::remove_file(..)` 这种空忽略
    ///              （AGENTS.md §4；`audio_store.rs` 的 sidecar 写失败是本仓既有的
    ///              `let _ = std::fs::write(..)` 形态，属**别的**任务面，本件不复制它）。
    pub fn report(&self, scope: &str, ids: &[i64]) {
        if self.is_clean() {
            return;
        }
        eprintln!(
            "[sessions] {scope} 音频清理失败 {} 件（已删 {} · 本不存在 {}）ids={:?}：{:?} —— 会话记录已删；残留音频待下次删除或人工清理",
            self.failed(),
            self.deleted,
            self.absent,
            ids,
            self.failures
        );
    }
}

/// 会话音频的两件路径：WAV 本体 + T23 对齐 sidecar。
///
/// @ai-context: sidecar 名与写侧（`audio_store.rs` 的 `format!("{}.wav.meta.json", ..)`）和
///              读侧（`commands_audio::read_aligned`）逐字同形——改名必须同提交改三处
///              （T23 的读侧快照纪律：改名会让读侧**静默回落** `aligned = false`）。
pub fn session_audio_paths(base: &Path, session_id: i64) -> (PathBuf, PathBuf) {
    (base.join(format!("{}.wav", session_id)), base.join(format!("{}.wav.meta.json", session_id)))
}

/// 删一个文件：成功 / 不存在 / 失败 三态归档（幂等；失败登记不阻断）。
fn remove_counted(path: &Path, summary: &mut AudioPurgeSummary) {
    match std::fs::remove_file(path) {
        Ok(()) => summary.deleted += 1,
        // 幂等：本就不存在（含 session-audio/ 目录本身不存在）——不算失败，但显式计数
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => summary.absent += 1,
        Err(e) => summary.failures.push(format!("{}: {}", path.display(), e)),
    }
}

/// 级联清理若干会话的音频（**两条删除路径共用**；永不返回 `Err`）。
///
/// @ai-context: 入参 id 由调用方在删除前校验（`<= 0` 已拒绝，批 4 口径）——本函数只做
///              「把 `{id}.wav` 与 sidecar 从应用数据目录删掉」这一件事，不连库、不发事件。
/// @ai-context: 对**已不存在**的会话 id 同样清理：用户删会话的意图是「这个会话的东西都别留」，
///              而该 id 已无行可删时（`delete_session` 返 `Ok(false)`）磁盘上残留的音频只可能
///              来自半删 / 清理漏项 ⇒ 一并删掉是**自愈**，不是越界（该文件名只可能由本应用
///              按会话 id 写出）。返回值语义不变（单条仍是 `Ok(false)`、批量 `deleted` 不含它）。
pub fn purge_session_audio(data_dir: &Path, ids: &[i64]) -> AudioPurgeSummary {
    let base = data_dir.join(SESSION_AUDIO_DIR);
    let mut summary = AudioPurgeSummary::default();
    for &id in ids {
        let (wav, sidecar) = session_audio_paths(&base, id);
        remove_counted(&wav, &mut summary);
        remove_counted(&sidecar, &mut summary);
    }
    summary
}
