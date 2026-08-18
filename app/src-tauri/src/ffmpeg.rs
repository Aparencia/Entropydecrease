//! ffmpeg 二进制定位与子进程执行（REQ-015/017，ADR-008）。
//!
//! @ai-context: ffmpeg 是文件导入（音轨/关键帧）与内嵌字幕（L2）的唯一外部依赖。
//!              分发双路径：捆绑二进制（src-tauri/ffmpeg/，download-ffmpeg.ps1 下载，
//!              gitignore 不入库）优先，PATH 探测回退；ENTROPY_FFMPEG_DIR 环境变量
//!              供测试/CI 注入，禁止硬编码绝对路径（AGENTS.md §7 环境隔离）。
//! @ai-context: 命令构建为纯函数（可单测防注入）——参数全走 Command 数组不经 shell；
//!              子进程有界等待（超时 kill，防 ffmpeg 卡死挂起导入线程）。
//! @ai-context: 本模块只做"定位 + 命令 + 执行"，管线编排在 import.rs。

use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::{AppError, Result};

/// 子进程默认超时（秒）——ffmpeg 卡死（坏文件/网络盘）时兜底退出。
const PROCESS_TIMEOUT: Duration = Duration::from_secs(300);
/// 关键帧提取帧数上限（防超长视频耗尽磁盘/时间）。
pub const KEYFRAME_MAX_FRAMES: u32 = 60;
/// 关键帧采样率（fps；fps=1/10 → 每 10s 一帧）。
pub const KEYFRAME_FPS: f64 = 0.1;

/// 定位到的 ffmpeg/ffprobe 可执行文件路径。
#[derive(Debug, Clone)]
pub struct FfmpegPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

/// ffmpeg 解析器：按固定顺序探测候选目录，最后回退 PATH。
///
/// @ai-context: 探测顺序设计：环境变量（测试注入）→ 捆绑目录（开箱即用）→ PATH
///              （系统安装）；全部缺失返回可操作错误（引导 download-ffmpeg.ps1）。
pub struct FfmpegResolver {
    /// 额外候选目录（生产可注入 resource_dir 等）
    extra_dirs: Vec<PathBuf>,
}

impl FfmpegResolver {
    /// 开发期解析器：捆绑目录 = crate 目录下 ffmpeg/（src-tauri/ffmpeg/）。
    /// 生产注入见 commands_import（resource_dir 组合）；本函数供测试与开发环境使用。
    #[allow(dead_code)]
    pub fn dev() -> Self {
        Self { extra_dirs: vec![PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ffmpeg")] }
    }

    /// 自定义候选目录（生产注入 resource_dir/ffmpeg 等；测试亦用于 PATH 隔离）。
    pub fn with_dirs(dirs: Vec<PathBuf>) -> Self {
        Self { extra_dirs: dirs }
    }

    /// 解析 ffmpeg/ffprobe 路径；任一缺失即失败。
    pub fn resolve(&self) -> Result<FfmpegPaths> {
        self.resolve_with_path(std::env::var_os("PATH").as_deref())
    }

    /// 解析（PATH 内容可注入——测试隔离，避免污染全局环境变量）。
    pub(crate) fn resolve_with_path(&self, path_env: Option<&std::ffi::OsStr>) -> Result<FfmpegPaths> {
        let mut dirs: Vec<PathBuf> = Vec::new();
        if let Ok(env_dir) = std::env::var("ENTROPY_FFMPEG_DIR") {
            dirs.push(PathBuf::from(env_dir));
        }
        dirs.extend(self.extra_dirs.iter().cloned());

        for dir in &dirs {
            let ffmpeg = dir.join(exe_name("ffmpeg"));
            let ffprobe = dir.join(exe_name("ffprobe"));
            if ffmpeg.is_file() && ffprobe.is_file() {
                return Ok(FfmpegPaths { ffmpeg, ffprobe });
            }
        }
        // PATH 探测（Windows PATH 不区分大小写，直接拼 exe 名）
        match (find_on_path("ffmpeg", path_env), find_on_path("ffprobe", path_env)) {
            (Some(ffmpeg), Some(ffprobe)) => Ok(FfmpegPaths { ffmpeg, ffprobe }),
            _ => Err(AppError::Io(
                "未找到 ffmpeg/ffprobe——请运行 scripts/download-ffmpeg.ps1 下载捆绑版，或安装 ffmpeg 并加入 PATH".to_string(),
            )),
        }
    }
}

/// Windows 追加 .exe 后缀。
fn exe_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{}.exe", base)
    } else {
        base.to_string()
    }
}

/// 在 PATH 中查找可执行文件（纯函数；找不到返回 None）。
fn find_on_path(name: &str, path_env: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let path_var = path_env?;
    for dir in std::env::split_paths(path_var) {
        let candidate = dir.join(exe_name(name));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

// ── 命令构建（纯函数，防注入可单测）──────────────────

/// 提取音轨参数：16kHz 单声道 WAV（与 sherpa-onnx Wave 输入对齐）。
pub fn extract_audio_args(input: &Path, output: &Path) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-f".into(),
        "wav".into(),
        output.to_string_lossy().into_owned(),
    ]
}

/// 提取关键帧参数：fps 采样 → 编号 PNG（封顶帧数，防磁盘耗尽）。
pub fn extract_keyframes_args(input: &Path, output_dir: &Path, fps: f64, max_frames: u32) -> Vec<String> {
    let pattern = output_dir.join("frame_%03d.png");
    vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-vf".into(),
        format!("fps={}", fps),
        "-frames:v".into(),
        max_frames.to_string(),
        pattern.to_string_lossy().into_owned(),
    ]
}

/// 探测字幕轨参数：ffprobe 输出 JSON（流序号 + 编码名）。
pub fn probe_subtitle_streams_args(input: &Path) -> Vec<String> {
    vec![
        "-v".into(),
        "error".into(),
        "-select_streams".into(),
        "s".into(),
        "-show_entries".into(),
        "stream=index,codec_name".into(),
        "-of".into(),
        "json".into(),
        input.to_string_lossy().into_owned(),
    ]
}

/// 解出内嵌字幕参数：首条字幕轨 → 标准 SRT 文本（stdout）。
pub fn extract_subtitle_args(input: &Path) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().into_owned(),
        "-map".into(),
        "0:s:0".into(),
        "-f".into(),
        "srt".into(),
        "pipe:1".into(),
    ]
}

// ── 子进程执行（有界等待）────────────────────────────

/// 执行命令并捕获 stdout（stderr 丢弃）；超时 kill 返回错误。
///
/// @ai-context: 审查 P0 修复（TD-034）：stdout 必须在 spawn 后立即交给读取线程——
///              子进程写满管道缓冲（Windows 默认 4-64KB）会阻塞在 write 上，
///              若主线程先轮询退出状态，大输出子进程永不退出 → 被超时误杀
///              （长视频内嵌字幕解出可达数百 KB，必触发）。
pub fn run_captured(program: &Path, args: &[String], timeout: Duration) -> Result<Vec<u8>> {
    use std::io::Read;
    use std::sync::mpsc;

    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Io(format!("启动 {} 失败: {}", program.display(), e)))?;

    // 读取线程：子进程存活期间持续排空管道（防阻塞），退出后收 EOF
    let (out_tx, out_rx) = mpsc::channel();
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let result = Read::read_to_end(&mut BufReader::new(stdout), &mut buf).map(|_| buf);
            let _ = out_tx.send(result);
        });
    }

    // 有界等待：轮询退出状态，超时强杀（防 ffmpeg 卡死）
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().map_err(|e| AppError::Io(format!("等待子进程失败: {}", e)))? {
            if status.success() {
                // 子进程已退出 → 管道 EOF，读取线程应立即完成（1s 兜底）
                return out_rx
                    .recv_timeout(Duration::from_secs(1))
                    .map_err(|_| AppError::Io("读取子进程输出超时".to_string()))?
                    .map_err(|e| AppError::Io(format!("读取子进程输出失败: {}", e)));
            }
            return Err(AppError::Io(format!(
                "{} 退出码 {:?}（args: {}）",
                program.display(),
                status.code(),
                args.first().unwrap_or(&String::new())
            )));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Io(format!("{} 执行超时（{}s）已终止", program.display(), timeout.as_secs())));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// 执行命令并返回退出状态（stdout/stderr 丢弃；关键帧等无输出产物命令用）。
pub fn run_quiet(program: &Path, args: &[String], timeout: Duration) -> Result<()> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Io(format!("启动 {} 失败: {}", program.display(), e)))?;
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().map_err(|e| AppError::Io(format!("等待子进程失败: {}", e)))? {
            if status.success() {
                return Ok(());
            }
            return Err(AppError::Io(format!("{} 退出码 {:?}", program.display(), status.code())));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Io(format!("{} 执行超时（{}s）已终止", program.display(), timeout.as_secs())));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// 默认超时（供导入管线使用，坏文件/网络盘兜底）。
pub fn default_timeout() -> Duration {
    PROCESS_TIMEOUT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_args_are_plain_parameters() {
        // Arrange & Act：路径含空格/特殊字符也不得出现 shell 元字符拼接
        let args = extract_audio_args(Path::new("D:/课 程/第一节.mp4"), Path::new("out dir/a.wav"));
        // Assert：参数数组包含字面路径（不经 shell，无引号包裹）
        assert!(args.contains(&"D:/课 程/第一节.mp4".to_string()));
        assert!(args.contains(&"out dir/a.wav".to_string()));
        assert_eq!(args[args.len() - 3], "-f");
    }

    #[test]
    fn keyframe_args_cap_frame_count() {
        // Arrange & Act
        let args = extract_keyframes_args(Path::new("in.mp4"), Path::new("out"), 0.1, 60);
        // Assert：帧数封顶参数存在
        let idx = args.iter().position(|a| a == "-frames:v").expect("has -frames:v");
        assert_eq!(args[idx + 1], "60");
        assert!(args.contains(&"fps=0.1".to_string()));
    }

    #[test]
    fn subtitle_args_pipe_to_stdout() {
        // Act & Assert：内嵌字幕解出为 SRT 走 stdout（pipe:1）
        let args = extract_subtitle_args(Path::new("in.mkv"));
        assert!(args.contains(&"0:s:0".to_string()));
        assert!(args.contains(&"pipe:1".to_string()));
    }

    #[test]
    fn probe_args_select_subtitle_streams() {
        // Act & Assert：只探测字幕轨
        let args = probe_subtitle_streams_args(Path::new("in.mp4"));
        assert!(args.contains(&"s".to_string()));
        assert!(args.contains(&"stream=index,codec_name".to_string()));
    }

    #[test]
    fn exe_name_appends_on_windows() {
        // Act & Assert：平台相关命名
        #[cfg(target_os = "windows")]
        assert_eq!(exe_name("ffmpeg"), "ffmpeg.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(exe_name("ffmpeg"), "ffmpeg");
    }

    /// TD-034 回归：子进程输出超过管道缓冲（64KB）时不得被超时误杀。
    /// cmd 生成 ~1.2MB 输出（50000 行 × 24 字符），3s 内必须正常返回。
    #[test]
    fn run_captured_handles_large_output() {
        // Arrange & Act：大输出子进程（cmd 内建循环，无外部依赖）
        let args = vec!["/C".to_string(), "for /L %i in (1,1,50000) do @echo xxxxxxxxxxxxxxxxxxxxxxxx".to_string()];
        let out = run_captured(Path::new("cmd.exe"), &args, Duration::from_secs(10)).expect("large output");
        // Assert：输出完整接收（>1MB），未触发超时误杀
        assert!(out.len() > 1_000_000, "输出应完整接收，实际 {} 字节", out.len());
    }
}
