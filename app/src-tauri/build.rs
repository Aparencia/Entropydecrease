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
    copy_sherpa_dlls();
    declare_comctl32_v6_manifest();
}

/// 声明 comctl32 v6 SxS 依赖（2026-08-21 真机定位修复）。
///
/// @ai-context: Windows 25H2 的 system32\comctl32.dll 为 5.82（无 TaskDialogIndirect
///              导出），v6 需 manifest 声明后从 WinSxS 按需加载；tauri（windows
///              crate）链接了 TaskDialogIndirect，而 rustc 的 MSVC 链接默认不生成
///              manifest——lib 测试 exe 全量链接时加载 5.82 报
///              0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND（bin 因链接剪裁不含该符号
///              不受影响）。作用于 bin/test/cdylib 全部链接目标（含 cargo test）。
/// @ai-context: 不用 /MANIFESTDEPENDENCY 内联声明——其值含空格，经 rustc 透传后
///              link.exe 按空格拆参（LNK1181）；改 /MANIFESTINPUT 指向 manifest
///              文件，路径写入 TEMP 根（避免 "work space" 类空格路径同样拆参失败），
///              TEMP 含空格时降级跳过（仅影响 TaskDialog 调用场景，不阻断构建）。
/// @ai-context: 仅对 test 目标注入（rustc-link-arg-tests）——应用/bin 已有
///              tauri-build 的 resource.lib manifest（含 v6 声明），重复注入
///              会 CVT1100 duplicate resource；lib test/bin test 无 manifest
///              才需要（cargo test 全量链接必现 0xc0000139）。
#[cfg(all(target_os = "windows", target_env = "msvc"))]
fn declare_comctl32_v6_manifest() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="amd64" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
"#;
    let Ok(dir) = std::env::var("TEMP") else {
        return;
    };
    if dir.contains(' ') {
        println!("cargo:warning=TEMP 路径含空格，跳过 comctl32 v6 manifest 注入（TaskDialog 调用场景可能加载 5.82 失败）");
        return;
    }
    let manifest = std::path::Path::new(&dir).join("entropy-comctl32-v6.manifest");
    if let Err(e) = std::fs::write(&manifest, xml) {
        println!("cargo:warning=写入 comctl32 v6 manifest 失败: {e}");
        return;
    }
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
}

#[cfg(not(all(target_os = "windows", target_env = "msvc")))]
fn declare_comctl32_v6_manifest() {} // 非 Windows/MSVC 无 SxS manifest 机制

/// 复制 sherpa-onnx-c-api/cxx-api.dll 到 target 输出目录（dev/release 均生效）。
///
/// @ai-context: 集成测试 exe 位于 <target>/<profile>/deps/，静态导入 sherpa-onnx-c-api.dll
///              （tauri dev 的主 exe 走 bundle.resources 侧；测试 exe 无此机制）——该 DLL 只在
///              sherpa-onnx-sys 解压目录（target/sherpa-onnx-prebuilt/<pkg>/lib/），不在 exe
///              搜索路径时测试进程 0xC0000135。与 copy_onnxruntime_dll 同机制拷贝到 profile
///              与 deps（集成测试 exe 目录），免手工 PATH 注入。
fn copy_sherpa_dlls() {
    let Ok(out_dir) = std::env::var("OUT_DIR") else {
        return;
    };
    let out_path = std::path::Path::new(&out_dir);
    let Some(profile_dir) = out_path
        .ancestors()
        .find(|p| p.file_name().is_some_and(|n| n == "build"))
        .and_then(|b| b.parent())
    else {
        return;
    };
    // sherpa-onnx-sys 解压目录：<target>/sherpa-onnx-prebuilt/<pkg>/lib/
    let target_dir = profile_dir.parent().unwrap_or(profile_dir);
    let Ok(entries) = std::fs::read_dir(target_dir.join("sherpa-onnx-prebuilt")) else {
        return;
    };
    let mut lib_dir = None;
    for entry in entries.flatten() {
        let candidate = entry.path().join("lib");
        if candidate.join("sherpa-onnx-c-api.dll").exists() {
            lib_dir = Some(candidate);
            break;
        }
    }
    let Some(lib_dir) = lib_dir else {
        return;
    };
    for name in ["sherpa-onnx-c-api.dll", "sherpa-onnx-cxx-api.dll"] {
        let src = lib_dir.join(name);
        if !src.exists() {
            continue;
        }
        println!("cargo:rerun-if-changed={}", src.display());
        for dest_dir in [profile_dir.to_path_buf(), profile_dir.join("deps")] {
            if dest_dir.is_dir() {
                if let Err(e) = std::fs::copy(&src, dest_dir.join(name)) {
                    println!("cargo:warning=复制 {name} 失败: {e}");
                }
            }
        }
    }
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
    // OUT_DIR = <target>/<profile>/build/<crate>-<hash>/out → 找名为 "build" 的祖先目录，其父目录即 <target>/<profile>
    // @ai-context: TD-006 修复——原 nth(3) 依赖 Cargo 内部目录层级（Cargo 改版会静默失效），
    //              改用目录名定位，层级变化仍可解析。
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let out_path = std::path::Path::new(&out_dir);
        let profile_dir = out_path
            .ancestors()
            .find(|p| p.file_name().is_some_and(|n| n == "build"))
            .and_then(|b| b.parent());
        if let Some(profile_dir) = profile_dir {
            let dest = profile_dir.join("onnxruntime.dll");
            if let Err(e) = std::fs::copy(&dll, &dest) {
                println!("cargo:warning=复制 onnxruntime.dll 失败: {e}");
            }
            // 集成测试 exe 在 <target>/<profile>/deps/ 下运行（DLL 搜索不含上级目录），
            // 不同步复制会导致测试进程加载系统旧版 onnxruntime（如 1.17.1）触发
            // "requested API version [27] not available + STATUS_ACCESS_VIOLATION"。
            let deps_dir = profile_dir.join("deps");
            if deps_dir.is_dir() {
                let dest_deps = deps_dir.join("onnxruntime.dll");
                if let Err(e) = std::fs::copy(&dll, &dest_deps) {
                    println!("cargo:warning=复制 onnxruntime.dll 到 deps 失败: {e}");
                }
            }
        }
    }
}
