//! 统一错误类型。
//!
//! @ai-context: 集中定义各层错误，避免业务深处散落 try-catch；command 层统一映射为字符串返回前端。

/// 应用统一错误类型。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(String),
    #[error("ASR 转写错误: {0}")]
    Asr(String),
    #[error("OCR 识别错误: {0}")]
    Ocr(String),
    #[error("IO 错误: {0}")]
    Io(String),
    #[error("模型未就绪: {0}")]
    ModelNotReady(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

/// 应用统一 Result 别名。
pub type Result<T> = std::result::Result<T, AppError>;
