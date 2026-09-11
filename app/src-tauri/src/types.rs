//! 共享领域类型。
//!
//! @ai-context: 本模块定义课堂助手提取链路与笔记模块之间的数据契约。
//! @ai-context: 业务术语全栈统一：transcript=转写段、ocr_block=画面识别块、note=笔记。
//! @ai-context: 纯数据定义，无副作用，可被 asr/ocr/concat/db/commands 各层复用。
//! @ai-context: 单文件 ≤300 行约束（AGENTS.md §3）下按域拆至 types_*.rs，本文件只保留
//!              `#[path]` 子模块声明 + `pub use` 再导出 ⇒ crate::types::X 对全仓引用面零改动。

#[path = "types_session.rs"]
mod types_session;
#[path = "types_knowledge.rs"]
mod types_knowledge;
#[path = "types_note.rs"]
mod types_note;
#[path = "types_ocr.rs"]
mod types_ocr;
#[path = "types_extract.rs"]
mod types_extract;
#[path = "types_decision.rs"]
mod types_decision;

pub use types_session::*;
pub use types_knowledge::*;
pub use types_note::*;
pub use types_ocr::*;
pub use types_extract::*;
pub use types_decision::*;
