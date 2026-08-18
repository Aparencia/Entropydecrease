//! Tauri 构建脚本。
//!
//! @ai-context: ORT 采用 system 策略（ORT_LIB_LOCATION 指向本地库，见 .cargo/config.toml）时，
//!              不会把 onnxruntime.dll 复制到输出目录；而 Windows 搜索顺序会让 PATH/system32 中
//!              可能存在的旧版 onnxruntime.dll（如 1.17.1）被优先加载，触发
//!              "requested API version [27] not available + STATUS_ACCESS_VIOLATION" 崩溃。
//!              此处自动把 ORT_LIB_LOCATION 下的 dll 复制到 target/<profile>/（exe 同目录，
//!              加载优先级高于 system32），保证运行时版本与编译期链接版本一致。

fn main() {
    tauri_build::build();
    copy_onnxruntime_dll();
}

/// 复制 onnxruntime.dll 到 target 输出目录（dev/release 均生效）。
fn copy_onnxruntime_dll() {
    println!("cargo:rerun-if-env-changed=ORT_LIB_LOCATION");
    let Ok(lib_dir) = std::env::var("ORT_LIB_LOCATION") else {
        return;
    };
    let dll = std::path::Path::new(&lib_dir).join("onnxruntime.dll");
    if !dll.exists() {
        println!("cargo:warning=ORT_LIB_LOCATION 下未找到 onnxruntime.dll: {}", dll.display());
        return;
    }
    println!("cargo:rerun-if-changed={}", dll.display());
    // OUT_DIR = <target>/<profile>/build/<crate>-<hash>/out → 第 3 级祖先目录即 <target>/<profile>
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        if let Some(profile_dir) = std::path::Path::new(&out_dir).ancestors().nth(3) {
            let dest = profile_dir.join("onnxruntime.dll");
            if let Err(e) = std::fs::copy(&dll, &dest) {
                println!("cargo:warning=复制 onnxruntime.dll 失败: {e}");
            }
        }
    }
}
