//! `commands_audio` 的单测（批 6 T22：`session_audio_path`）。
//!
//! @ai-context: 判据面 = R12.2 要求的三条**行为级**判据（无音频 ⇒ `None`；非法 id ⇒ `Err`；
//!              路径越界 ⇒ `Err`）+ R5.5-b 的「`aligned` 不得恒 true」+ `durationMs`
//!              作为「能不能播」的唯一判据（未 finalize ⇒ `None`）。
//! @ai-context: 副作用 = 只在 `%TEMP%/entropy-t22-*` 建/删夹具；**不**连库、**不**读真实
//!              `%APPDATA%`、**不**写仓库内任何路径（用完即删）。
//! @ai-context: 被测对象 = 命令体 `session_audio_ref_in`（`#[tauri::command]` 是薄壳：
//!              `State<'_, AppState>` 需要运行中的 `AppHandle`，单测里无法构造，
//!              且本任务不改 `lib.rs`/`AppState`）+ 边界核心 `confined_audio_file`。

use super::*;

/// 夹具：独立临时 `data_dir`（内含 `session-audio/`），Drop 时整体删除。
struct TempDataDir {
    /// 充当 `AppState::data_dir` 的根（`session-audio/` 的父目录）
    root: std::path::PathBuf,
    /// 会话音频目录（`{root}/session-audio`）
    base: std::path::PathBuf,
}

impl TempDataDir {
    /// 建夹具（目录名带 pid + 原子序号 ⇒ 并发用例互不踩）。
    fn new(tag: &str) -> Self {
        static SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("entropy-t22-{}-{}-{}", std::process::id(), tag, n));
        let base = root.join(SESSION_AUDIO_DIR);
        std::fs::create_dir_all(&base).expect("建临时会话音频目录");
        Self { root, base }
    }

    /// 写一个 fmt 合法的 WAV：`data_len` = **头部声明的** data 长度，`payload` = 实际追加字节数
    /// （两者不等即模拟 `finalize` 未回填的崩溃残留）。
    fn write_wav(&self, name: &str, data_len: u32, payload: usize) {
        let mut buf = Vec::with_capacity(WAV_HEADER_LEN + payload);
        buf.extend_from_slice(b"RIFF");
        buf.extend_from_slice(&(36 + data_len).to_le_bytes());
        buf.extend_from_slice(b"WAVE");
        buf.extend_from_slice(b"fmt ");
        buf.extend_from_slice(&16u32.to_le_bytes());
        buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
        buf.extend_from_slice(&1u16.to_le_bytes()); // 单声道
        buf.extend_from_slice(&16_000u32.to_le_bytes());
        buf.extend_from_slice(&32_000u32.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes());
        buf.extend_from_slice(&16u16.to_le_bytes());
        buf.extend_from_slice(b"data");
        buf.extend_from_slice(&data_len.to_le_bytes());
        buf.resize(WAV_HEADER_LEN + payload, 0);
        std::fs::write(self.base.join(name), &buf).expect("写夹具 WAV");
    }

    /// 写 T23 的对齐 sidecar（键名照计划 Task 23 Step 3 的冻结快照）。
    fn write_sidecar(&self, name: &str, aligned: bool) {
        let json =
            format!(r#"{{"version":1,"aligned":{},"firstTsMs":0,"samplesWritten":16000}}"#, aligned);
        std::fs::write(self.base.join(name), json).expect("写夹具 sidecar");
    }
}

impl Drop for TempDataDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn non_positive_session_id_is_err() {
    let d = TempDataDir::new("badid");
    // Act & Assert：入参校验（安全红线①）——在任何文件系统访问之前
    assert_eq!(session_audio_ref_in(&d.root, 0).unwrap_err(), "无效的会话 id");
    assert_eq!(session_audio_ref_in(&d.root, -1).unwrap_err(), "无效的会话 id");
}

#[test]
fn missing_audio_is_none_not_err() {
    let d = TempDataDir::new("none");
    // Act：目录里没有 `{id}.wav`（导入会话即此形态——其音轨在 %TEMP% 且导入结束即删）
    let got = session_audio_ref_in(&d.root, 7).expect("无音频不是错误");
    // Assert：`None`（不是空串、不是死路径、不是 Err）
    assert_eq!(got, None);
}

#[test]
fn finalized_wav_yields_ref_confined_to_session_audio_dir() {
    let d = TempDataDir::new("ok");
    d.write_wav("7.wav", 32_000, 32_000); // 头部声明 1 s，实际也写满 1 s
    // Act
    let first = session_audio_ref_in(&d.root, 7).expect("有音频").expect("有引用");
    let second = session_audio_ref_in(&d.root, 7).expect("幂等").expect("有引用");
    // Assert ① 返回的是**构造路径**（非 canonicalize 的 `\\?\` 形态：asset scope 是 glob）
    assert_eq!(first.path, d.base.join("7.wav").to_string_lossy().into_owned());
    // Assert ② 返回路径的 canonicalize 仍在 session-audio 目录内（判据 V2 逐字口径）
    let canon = std::fs::canonicalize(&first.path).expect("返回路径存在");
    assert!(canon.starts_with(std::fs::canonicalize(&d.base).expect("基目录存在")));
    // Assert ③ 无 sidecar ⇒ `aligned` 不得为 true（历史录音不保证对齐）
    assert!(!first.aligned, "无 sidecar 的录音不得被当作已对齐");
    // Assert ④ durationMs = 头部 data 长度 ÷ 32 B/ms（32000 ÷ 32 = 1000）
    assert_eq!(first.duration_ms, Some(1000));
    // Assert ⑤ 同一文件两次调用载荷相等（确定性）
    assert_eq!(first, second);
}

#[test]
fn unfinalized_wav_reports_no_duration() {
    let d = TempDataDir::new("unfin");
    // 崩溃残留形态：头里 data 长度仍是创建时的 0，但样本已写了 >44 字节
    d.write_wav("9.wav", 0, 6_400);
    // Act
    let r = session_audio_ref_in(&d.root, 9).expect("有音频").expect("有引用");
    // Assert：未 finalize ⇒ `None`（**不**当作 0 时长、**不**发明数字）
    assert_eq!(r.duration_ms, None);
    assert!(!r.aligned);
}

#[test]
fn sidecar_drives_aligned_flag() {
    let d = TempDataDir::new("sidecar");
    d.write_wav("3.wav", 32_000, 32_000);
    d.write_sidecar("3.wav.meta.json", true);
    // Act & Assert：sidecar 报 true ⇒ 如实透传（不得恒 false 掩盖真实簿记）
    assert!(session_audio_ref_in(&d.root, 3).unwrap().unwrap().aligned);
    // 损坏的 sidecar ⇒ 保守 false（不 panic、不假称已对齐）
    std::fs::write(d.base.join("3.wav.meta.json"), b"{ not json").unwrap();
    assert!(!session_audio_ref_in(&d.root, 3).unwrap().unwrap().aligned);
}

#[test]
fn outside_path_is_rejected_by_boundary_check() {
    let d = TempDataDir::new("escape");
    d.write_wav("7.wav", 32_000, 32_000);
    std::fs::write(d.root.join("outside.wav"), b"x").expect("越界样本");
    // 正对照：同一份样本在目录内可被接受（证明下面的拒绝来自边界判定，而非文件缺失）
    assert!(confined_audio_file(&d.base, "7.wav").expect("目录内应接受").is_some());
    // Act & Assert：`..` 伪装成 `{id}.wav` ⇒ 越界拒绝（安全红线②）
    assert_eq!(confined_audio_file(&d.base, "../outside.wav").unwrap_err(), "路径越界拒绝");
}

#[test]
fn foreign_bytes_and_directories_are_not_audio() {
    let d = TempDataDir::new("foreign");
    // ① 非 RIFF/WAVE 的异类文件 ⇒ 不声称时长（但路径仍可定位）
    std::fs::write(d.base.join("1.wav"), vec![0u8; 128]).unwrap();
    assert_eq!(wav_duration_ms(&d.base.join("1.wav")), None);
    assert_eq!(session_audio_ref_in(&d.root, 1).unwrap().unwrap().duration_ms, None);
    // ② 目录占位（不是普通文件）⇒ 与「无音频」同档：`Ok(None)`
    std::fs::create_dir_all(d.base.join("2.wav")).unwrap();
    assert_eq!(session_audio_ref_in(&d.root, 2).unwrap(), None);
    // ③ 短于 44 字节头 ⇒ 读不满 ⇒ `None`
    std::fs::write(d.base.join("4.wav"), b"RIFF").unwrap();
    assert_eq!(session_audio_ref_in(&d.root, 4).unwrap().unwrap().duration_ms, None);
}

#[test]
fn wire_shape_is_camel_case_with_null_duration() {
    // 未 finalize 的线格式：`durationMs` 是 `null`（前端据此禁用播放）——与
    // `types_contract_tests` 的 assert_wire!（`Some` 形态）互补。
    let v = SessionAudioRef { path: "p".into(), aligned: false, duration_ms: None };
    assert_eq!(serde_json::to_string(&v).unwrap(), r#"{"path":"p","aligned":false,"durationMs":null}"#);
}
