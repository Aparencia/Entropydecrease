//! AI 密钥凭据存储（REQ-138，v0.8.0 M1 使能层；v0.11.6 M1 scope 化）。
//!
//! @ai-context: 安全红线（AGENTS.md §4）：密钥不落 SQLite/明文文件——
//!              Windows 用 DPAPI CryptProtectData 加密后写入数据目录
//!              ai_credentials.bin（当前用户作用域，管理员与其他用户不可解；
//!              CRYPTPROTECT_UI_FORBIDDEN 禁弹窗，服务化场景不卡 UI）。
//! @ai-context: scope 化（v0.11.6 M1）：per-provider 隔离用 "provider:<id>" →
//!              ai_credentials_<safe_id>.bin，各自独立 DPAPI 加密。scope 字符
//!              白名单：字母/数字/-/_，其余映射为 '_'。旧默认条目 scope="default"
//!              的物理文件名（ai_credentials.bin）仍被 scoped_path 指认，但该槽
//!              已废弃（见下方遗留槽移除条）。
//! @ai-context: keyring crate spike 因本机 TLS 拦截（crates.io 新依赖下载
//!              失败）跳过，直接走 v0.8.0 规划裁决的 DPAPI 直写 fallback
//!              路径（裁决见 ADR-016）；环境变量 SILICONFLOW_API_KEY 保留
//!              为开发路径，优先级：环境变量 > 凭据库（command 层解析）。
//! @ai-context: 凭据库 roundtrip 单测走内存桩（M5 契约测试口径）——DPAPI
//!              为系统调用不单测（与 model_downloader 网络路径同口径）。
//! @ai-context: 遗留槽移除（2026-09-13 批 8 T25 · 用户裁决 U2 = c）：单 Provider
//!              时代的 scope="default" **不再是合法槽位** —— save/load/clear
//!              三条路径一律显式拒绝（守卫 ensure_slot_usable）。🔴 只移除
//!              **代码路径**：用户已存的旧数据（DPAPI 文件与既有条目）**不删、
//!              不改、不迁移**（物理抹除是另一件事，用户裁决未授权）；仅有旧槽
//!              的真机用户需重填密钥（风险已登记）。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 遗留单 Provider 凭据槽名（v0.11.6 scope 化之前的唯一槽位）。
///
/// @ai-context: 2026-09-13 批 8 T25（U2 = c「删除」）：本槽**不再是合法槽位**，
///              写/读/清三条路径全部显式拒绝（见 `ensure_slot_usable`）。旧数据
///              仍在物理存储里（**不做**迁移、**不做**抹除），仅在应用内不再可达
///              ⇒ 名字保留是为了「旧数据在哪」这件事仍可被指认与取证。
pub const LEGACY_DEFAULT_SCOPE: &str = "default";

/// 槽位守卫：拒绝遗留槽（per-provider `provider:<id>` 是唯一合法形态）。
///
/// @ai-context: 为什么**读**也拒：只要旧槽还算「合法槽位」，任何调用点都能把它
///              当兜底读（批 1 删掉旧 IPC 后，`resolve_default_provider_key` 与
///              启动迁移正是这样留着的）——把合法性收在存储抽象这一层，调用点
///              无从绕过；拒绝是显式的（返回具名错误），不是静默返回 None。
fn ensure_slot_usable(scope: &str) -> Result<(), String> {
    if scope == LEGACY_DEFAULT_SCOPE {
        return Err(format!(
            "凭据槽 \"{}\" 已废弃：遗留单 Provider 槽位不再可用，请用 provider:<id> 保存密钥",
            LEGACY_DEFAULT_SCOPE
        ));
    }
    Ok(())
}

/// 凭据存储抽象（scope：per-provider "provider:<id>"；遗留 "default" 已废弃
/// ⇒ 三条方法一律拒绝；测试注入内存桩；平台存储 Windows=DPAPI 加密文件）。
pub trait CredentialStore: Send + Sync {
    fn save_key(&self, scope: &str, api_key: &str) -> Result<(), String>;
    fn load_key(&self, scope: &str) -> Result<Option<String>, String>;
    fn clear_key(&self, scope: &str) -> Result<(), String>;
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
impl DpapiCredentialStore {
    /// scope → 凭据文件路径（provider:<id> 按 id 隔离）。
    ///
    /// 🔴 遗留 "default" 的**物理键映射保留**（它指向旧文件 ai_credentials.bin）：
    /// 删掉会改变旧数据的物理归属、让「旧数据在哪」无从指认（U2 的 (ii) 不做
    /// 抹除 ⇒ 映射必须留着）。⚠️ 该分支经槽位 API **不可达**——三条方法已在入口
    /// 拒绝遗留槽（U2 = c 的 (i)）。
    fn scoped_path(&self, scope: &str) -> PathBuf {
        if scope == LEGACY_DEFAULT_SCOPE {
            return self.path.clone();
        }
        let safe: String = scope
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        self.path.with_file_name(format!("ai_credentials_{}.bin", safe))
    }
}

#[cfg(target_os = "windows")]
impl CredentialStore for DpapiCredentialStore {
    fn save_key(&self, scope: &str, api_key: &str) -> Result<(), String> {
        ensure_slot_usable(scope)?;
        if api_key.trim().is_empty() {
            return Err("密钥不能为空".to_string());
        }
        let encrypted = dpapi_protect(api_key.as_bytes())?;
        std::fs::write(self.scoped_path(scope), encrypted)
            .map_err(|e| format!("写入凭据文件失败: {}", e))
    }

    fn load_key(&self, scope: &str) -> Result<Option<String>, String> {
        ensure_slot_usable(scope)?;
        let raw = match std::fs::read(self.scoped_path(scope)) {
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

    fn clear_key(&self, scope: &str) -> Result<(), String> {
        ensure_slot_usable(scope)?;
        match std::fs::remove_file(self.scoped_path(scope)) {
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
    inner: Mutex<std::collections::HashMap<String, String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn save_key(&self, scope: &str, api_key: &str) -> Result<(), String> {
        ensure_slot_usable(scope)?;
        if api_key.trim().is_empty() {
            return Err("密钥不能为空".to_string());
        }
        self.inner
            .lock()
            .map_err(|_| "凭据锁中毒".to_string())?
            .insert(scope.to_string(), api_key.to_string());
        Ok(())
    }

    fn load_key(&self, scope: &str) -> Result<Option<String>, String> {
        ensure_slot_usable(scope)?;
        Ok(self.inner.lock().map_err(|_| "凭据锁中毒".to_string())?.get(scope).cloned())
    }

    fn clear_key(&self, scope: &str) -> Result<(), String> {
        ensure_slot_usable(scope)?;
        self.inner
            .lock()
            .map_err(|_| "凭据锁中毒".to_string())?
            .remove(scope);
        Ok(())
    }
}

/// 测试专用：越过槽位 API 直接落**物理层**（模拟旧版本写下的遗留槽数据）。
///
/// @ai-context: 2026-09-13 批 8 T25：槽位 API 已拒绝遗留槽 ⇒ 单测要造「旧数据
///              仍在」的前置状态，只能落物理层——这正是旧数据的真实成因。
///              `#[cfg(test)]` ⇒ 生产二进制零足迹。
#[cfg(test)]
impl MemoryCredentialStore {
    /// 直接写入遗留槽条目（不经过守卫）。
    pub(crate) fn seed_legacy_default_for_tests(&self, value: &str) {
        self.inner
            .lock()
            .expect("凭据锁")
            .insert(LEGACY_DEFAULT_SCOPE.to_string(), value.to_string());
    }

    /// 直接读回遗留槽条目（键与值都可读 = 「数据仍在」的物理层证据）。
    pub(crate) fn read_legacy_default_for_tests(&self) -> Option<String> {
        self.inner.lock().expect("凭据锁").get(LEGACY_DEFAULT_SCOPE).cloned()
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_credentials_tests.rs"]
mod tests;
