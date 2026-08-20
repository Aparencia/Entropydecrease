//! AI 密钥凭据存储（REQ-138，v0.8.0 M1 使能层）。
//!
//! @ai-context: 安全红线（AGENTS.md §4）：密钥不落 SQLite/明文文件——
//!              Windows 用 DPAPI CryptProtectData 加密后写入数据目录
//!              ai_credentials.bin（当前用户作用域，管理员与其他用户不可解；
//!              CRYPTPROTECT_UI_FORBIDDEN 禁弹窗，服务化场景不卡 UI）。
//! @ai-context: keyring crate spike 因本机 TLS 拦截（crates.io 新依赖下载
//!              失败）跳过，直接走 v0.8.0 规划裁决的 DPAPI 直写 fallback
//!              路径（裁决见 ADR-016）；环境变量 SILICONFLOW_API_KEY 保留
//!              为开发路径，优先级：环境变量 > 凭据库（command 层解析）。
//! @ai-context: 凭据库 roundtrip 单测走内存桩（M5 契约测试口径）——DPAPI
//!              为系统调用不单测（与 model_downloader 网络路径同口径）。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 凭据存储抽象（测试注入内存桩；平台存储 Windows=DPAPI）。
pub trait CredentialStore: Send + Sync {
    fn save_key(&self, api_key: &str) -> Result<(), String>;
    fn load_key(&self) -> Result<Option<String>, String>;
    fn clear_key(&self) -> Result<(), String>;
}

/// 平台存储构造（Windows=DPAPI 加密文件；非 Windows 内存存储 + 告警——
/// 全平台编译兼容，实时链路本为 Windows-only）。返回 Arc 便于直接注入
/// AppState（避免 Box→Arc 双重包装的 trait 对象问题）。
pub fn platform_store(path: &Path) -> std::sync::Arc<dyn CredentialStore> {
    #[cfg(target_os = "windows")]
    {
        std::sync::Arc::new(DpapiCredentialStore { path: path.to_path_buf() })
    }
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!(
            "[AiCredentials] 非 Windows 平台密钥仅存内存（进程退出即失）——开发请用环境变量 SILICONFLOW_API_KEY"
        );
        std::sync::Arc::new(MemoryCredentialStore::default())
    }
}

// ────────────────────────────────────────────────────────────
// Windows DPAPI 存储（密钥 → CryptProtectData 加密 → ai_credentials.bin）
// ────────────────────────────────────────────────────────────

/// DPAPI 加密文件存储（当前用户数据保护；文件非明文）。
#[cfg(target_os = "windows")]
pub struct DpapiCredentialStore {
    /// 加密 blob 文件路径（应用数据目录 ai_credentials.bin）
    path: PathBuf,
}

#[cfg(target_os = "windows")]
impl CredentialStore for DpapiCredentialStore {
    fn save_key(&self, api_key: &str) -> Result<(), String> {
        if api_key.trim().is_empty() {
            return Err("密钥不能为空".to_string());
        }
        let encrypted = dpapi_protect(api_key.as_bytes())?;
        std::fs::write(&self.path, encrypted)
            .map_err(|e| format!("写入凭据文件失败: {}", e))
    }

    fn load_key(&self) -> Result<Option<String>, String> {
        let raw = match std::fs::read(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("读取凭据文件失败: {}", e)),
        };
        if raw.is_empty() {
            return Ok(None);
        }
        let plain = dpapi_unprotect(&raw)?;
        let key = String::from_utf8(plain).map_err(|_| "解密结果非 UTF-8（凭据文件损坏）".to_string())?;
        Ok(Some(key))
    }

    fn clear_key(&self) -> Result<(), String> {
        match std::fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("删除凭据文件失败: {}", e)),
        }
    }
}

/// DPAPI 加密（纯辅助；unsafe 集中在函数内，调用方无裸指针）。
#[cfg(target_os = "windows")]
fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use ::windows::Win32::Foundation::{LocalFree, HLOCAL};
    use ::windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len().try_into().map_err(|_| "密钥数据过长")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI 加密失败: {}", e))?;
        // CryptProtectData 用 LocalAlloc 分配输出——必须 LocalFree 归还
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut core::ffi::c_void)));
        Ok(out)
    }
}

/// DPAPI 解密（对应 protect）。
#[cfg(target_os = "windows")]
fn dpapi_unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
    use ::windows::Win32::Foundation::{LocalFree, HLOCAL};
    use ::windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: blob.len().try_into().map_err(|_| "凭据数据过长")?,
        pbData: blob.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI 解密失败（凭据文件损坏或非当前用户）: {}", e))?;
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut core::ffi::c_void)));
        Ok(out)
    }
}

// ────────────────────────────────────────────────────────────
// 内存存储（测试桩；非 Windows 平台兜底）
// ────────────────────────────────────────────────────────────

/// 内存存储（测试注入；进程退出即失——仅测试/非 Windows 兜底用）。
/// Windows 构建下仅测试与 cfg(not(windows)) 分支引用——登记豁免 dead_code。
#[allow(dead_code)]
#[derive(Default)]
pub struct MemoryCredentialStore {
    inner: Mutex<Option<String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn save_key(&self, api_key: &str) -> Result<(), String> {
        if api_key.trim().is_empty() {
            return Err("密钥不能为空".to_string());
        }
        *self.inner.lock().map_err(|_| "凭据锁中毒".to_string())? = Some(api_key.to_string());
        Ok(())
    }

    fn load_key(&self) -> Result<Option<String>, String> {
        Ok(self.inner.lock().map_err(|_| "凭据锁中毒".to_string())?.clone())
    }

    fn clear_key(&self) -> Result<(), String> {
        *self.inner.lock().map_err(|_| "凭据锁中毒".to_string())? = None;
        Ok(())
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_credentials_tests.rs"]
mod tests;
