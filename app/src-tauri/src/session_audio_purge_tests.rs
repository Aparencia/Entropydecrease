//! 删除会话的音频级联清理单测（批 8 T28；内存库 + 临时目录，**不依赖真实模型/真实音频**）。
//!
//! @ai-context: 判据面 = ① 正常删除 ⇒ 音频与 sidecar **都不存在**（隐私面，本任务核心）
//!              ② 音频不存在 ⇒ **不报错**（幂等）③ 删除失败 ⇒ 会话记录**仍被删掉** +
//!              失败**被上报** ④ 部分删除（多文件里一件失败）⇒ 终态**可解释**
//!              ⑤ 与落盘开关无关 ⑥ DB 失败 ⇒ 文件一个不动（先 DB 后文件的顺序守卫）。
//! @ai-context: 副作用 = 只在 `%TEMP%/entropy-t28-*` 建/删夹具 + `:memory:` 库；**不**读真实
//!              `%APPDATA%`、**不**写仓库内任何路径（用完即删）。
//! @ai-context: 被测对象 = `purge_session_audio` / `session_audio_paths`（纯文件面）+ **两条**
//!              删除路径的命令体 `commands_session::delete_session_in` 与
//!              `commands_session_delete::run_batch_delete_with_audio`
//!              （`#[tauri::command]` 是薄壳：`State<'_, AppState>` 单测里造不出——同 T22 的
//!              `session_audio_ref_in` 口径）。
//! @ai-context: 「删除失败」的造法 = 用**同名目录**占位（`remove_file` 对目录必失败：
//!              Windows `ERROR_ACCESS_DENIED` / Unix `EISDIR`，两平台都**不是** `NotFound`）
//!              ——跨平台确定性的**真实** OS 失败源；**不用** `set_readonly`：Unix 下 unlink
//!              只受父目录权限约束，只读文件照样删得掉 ⇒ 用例会**假绿**。

use super::*;
use crate::commands_session::delete_session_in;
use crate::commands_session_delete::run_batch_delete_with_audio;
use crate::db::Db;
use crate::types::NewSession;

/// 独立临时 `data_dir` 夹具（pid + tag ⇒ 并发用例互不踩；Drop 时整体删除）。
struct TempDataDir {
    /// 充当 `AppState::data_dir` 的根（`session-audio/` 的父目录）
    root: std::path::PathBuf,
    /// 会话音频目录（`{root}/session-audio`）
    base: std::path::PathBuf,
}

impl TempDataDir {
    fn new(tag: &str) -> Self {
        let root = std::env::temp_dir().join(format!("entropy-t28-{}-{}", std::process::id(), tag));
        let base = root.join(SESSION_AUDIO_DIR);
        std::fs::create_dir_all(&base).expect("建临时会话音频目录");
        Self { root, base }
    }

    /// 写夹具音频两件（内容无关紧要：本模块只判存在性 ⇒ 不依赖真实音频/模型）。
    fn write_audio(&self, session_id: i64) {
        std::fs::write(self.base.join(format!("{}.wav", session_id)), b"RIFF-fixture")
            .expect("写夹具 WAV");
        std::fs::write(self.base.join(format!("{}.wav.meta.json", session_id)), SIDECAR)
            .expect("写夹具 sidecar");
    }

    /// 造「删不掉」的音频：`{id}.wav` 位置放**目录**（sidecar 照常写）。
    fn block_wav(&self, session_id: i64) -> std::path::PathBuf {
        let blocked = self.base.join(format!("{}.wav", session_id));
        std::fs::create_dir_all(&blocked).expect("建占位目录");
        std::fs::write(self.base.join(format!("{}.wav.meta.json", session_id)), SIDECAR)
            .expect("写夹具 sidecar");
        blocked
    }

    fn root(&self) -> &std::path::Path {
        &self.root
    }
}

impl Drop for TempDataDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// 夹具 sidecar 内容（键名照 T23 冻结快照，只求可辨识）。
const SIDECAR: &[u8] = br#"{"version":1,"aligned":true,"firstTsMs":0,"samplesWritten":16000}"#;

fn mem_db() -> Db {
    Db::open(":memory:").expect("open in-memory db")
}

/// 建一个会话（内存库）。
fn session(db: &Db, title: &str) -> i64 {
    db.create_session(&NewSession {
        title: title.into(),
        source_window: None,
        profile: None,
        kind: None,
    })
    .expect("create session")
    .id
}

#[test]
fn delete_session_removes_audio_and_sidecar() {
    // Arrange：会话 + 已落盘的音频两件
    let db = mem_db();
    let dir = TempDataDir::new("v1-single");
    let id = session(&db, "有录音的课");
    dir.write_audio(id);
    let (wav, sidecar) = session_audio_paths(&dir.base, id);
    assert!(wav.exists() && sidecar.exists(), "夹具前置：音频与 sidecar 应已落盘");
    // Act：删会话（单条路径）
    let ok = delete_session_in(&db, dir.root(), id).expect("删会话不应报错");
    // Assert：会话记录消失 + 音频两件都不存在（隐私面）
    assert!(ok, "会话应被删除");
    assert!(db.get_session(id).expect("db").is_none(), "会话记录必须消失");
    assert!(!wav.exists(), "删会话后音频必须不存在: {}", wav.display());
    assert!(!sidecar.exists(), "删会话后 sidecar 必须不存在: {}", sidecar.display());
}

#[test]
fn purge_is_idempotent_when_audio_absent() {
    // Arrange：会话没有音频，连 session-audio/ 目录都不存在
    let db = mem_db();
    let id = session(&db, "无录音的课");
    let bare = std::env::temp_dir().join(format!("entropy-t28-bare-{}", std::process::id()));
    // Act：清理面 + 删会话本体各走一次
    let summary = purge_session_audio(&bare, &[id]);
    let ok = delete_session_in(&db, &bare, id).expect("音频不存在时必须不报错");
    // Assert：幂等——不报错、不计失败（`absent` 显式计数，不静默）
    assert_eq!(summary.deleted, 0);
    assert_eq!(summary.absent, 2, "两件文件都本就不存在，应显式计 absent");
    assert_eq!(summary.failed(), 0, "音频不存在不得被记为失败");
    assert!(summary.is_clean(), "无失败才是干净终态");
    assert!(ok, "删会话本身照常成功");
    assert!(db.get_session(id).expect("db").is_none());
}

#[test]
fn audio_delete_failure_must_be_reported() {
    // Arrange：同名目录占位 ⇒ remove_file 必失败（真实 OS 错误，不是 mock）
    let db = mem_db();
    let dir = TempDataDir::new("v2-fail");
    let id = session(&db, "删不掉的课");
    let blocked = dir.block_wav(id);
    // Act ①：清理面本身
    let summary = purge_session_audio(dir.root(), &[id]);
    // Assert ①：失败被上报（计数 + 明细点名那件文件）
    assert_eq!(summary.failed(), 1, "失败必须被上报（计数）");
    assert_eq!(summary.deleted, 1, "B 的 sidecar 应被删掉；被占位的那件不得记成已删");
    assert!(!summary.is_clean(), "有失败就不是干净终态");
    assert!(
        summary.failures[0].contains(&format!("{}.wav", id)),
        "失败必须被上报（明细须点名文件）: {:?}",
        summary.failures
    );
    assert!(blocked.exists(), "占位目录仍在 ⇒ 失败是真的（不是夹具假红）");
    // Act ②：删会话本体
    let ok = delete_session_in(&db, dir.root(), id).expect("文件删不掉不得让删会话报错");
    // Assert ②：会话记录**仍被删掉**（「部分删除」是允许的终态，不回滚 DB）
    assert!(ok, "会话记录必须被删掉");
    assert!(db.get_session(id).expect("db").is_none(), "文件失败不得回滚会话删除");
}

#[test]
fn partial_delete_terminal_state_is_explainable() {
    // Arrange：A 正常两件；B 的 wav 被占位、sidecar 正常 ⇒ 四件里三删一失败
    let dir = TempDataDir::new("v2-partial");
    let a = 7;
    let b = 8;
    dir.write_audio(a);
    let blocked = dir.block_wav(b);
    // Act
    let summary = purge_session_audio(dir.root(), &[a, b]);
    // Assert：终态**逐件可解释**（删掉 3 · 本不存在 0 · 失败 1），不是「全删或全不删」
    assert_eq!(summary.deleted, 3, "A 两件 + B 的 sidecar 应被删掉");
    assert_eq!(summary.absent, 0, "夹具前置：四件都在盘上");
    assert_eq!(summary.failed(), 1, "B 的 wav 应记 1 件失败");
    assert!(!dir.base.join(format!("{a}.wav")).exists(), "A 的音频必须不存在");
    assert!(!dir.base.join(format!("{a}.wav.meta.json")).exists(), "A 的 sidecar 必须不存在");
    assert!(!dir.base.join(format!("{b}.wav.meta.json")).exists(), "B 的 sidecar 必须不存在");
    assert!(blocked.exists(), "B 的 wav 仍在盘上（允许的终态，须登记而非假装成功）");
}

#[test]
fn batch_delete_clears_audio_and_keeps_unselected() {
    // Arrange：批量路径（第二条删除路径）——A/B 待删，keep 未勾选
    let db = mem_db();
    let dir = TempDataDir::new("v1-batch");
    let a = session(&db, "A课");
    let b = session(&db, "B课");
    let keep = session(&db, "保留课");
    for id in [a, b, keep] {
        dir.write_audio(id);
    }
    // Act
    let result = run_batch_delete_with_audio(&db, dir.root(), vec![a, b]).expect("批量删除成功");
    // Assert：DB 全删（单事务原子）+ 音频两件都清；未选会话的音频**原样保留**
    assert_eq!(result.deleted, 2);
    for id in [a, b] {
        assert!(db.get_session(id).expect("db").is_none(), "会话 {id} 记录必须消失");
        let (wav, sidecar) = session_audio_paths(&dir.base, id);
        assert!(!wav.exists(), "批量删除后音频必须不存在: {}", wav.display());
        assert!(!sidecar.exists(), "批量删除后 sidecar 必须不存在: {}", sidecar.display());
    }
    assert!(db.get_session(keep).expect("db").is_some(), "未勾选会话不得被删");
    assert!(dir.base.join(format!("{keep}.wav")).exists(), "未勾选会话的音频不得被清理");
    assert!(dir.base.join(format!("{keep}.wav.meta.json")).exists(), "未勾选会话的 sidecar 不得被清理");
}

#[test]
fn db_failure_leaves_audio_untouched() {
    // Arrange：触发器让 DELETE 失败（同批 4 既有手法）——顺序守卫：先 DB 后文件
    let db = mem_db();
    let dir = TempDataDir::new("v2-db-fail");
    let id = session(&db, "删不掉的课");
    dir.write_audio(id);
    db.with_conn(|conn| {
        // 触发器 DDL 不支持绑定变量——id 由本库 create_session 生成（非用户输入），内联安全
        let sql = format!(
            "CREATE TRIGGER guard_delete BEFORE DELETE ON sessions
             WHEN OLD.id = {} BEGIN SELECT RAISE(ABORT, 'guard: session busy'); END",
            id
        );
        conn.execute_batch(&sql)?;
        Ok(())
    })
    .expect("create guard trigger");
    // Act：DB 删除报错 ⇒ 整体上抛
    let err = run_batch_delete_with_audio(&db, dir.root(), vec![id]).expect_err("DB 失败必须上抛");
    // Assert：会话随事务回滚保留，**文件一个不动**（活会话不得丢音频）
    assert!(err.contains("guard: session busy"), "err={err}");
    assert!(db.get_session(id).expect("db").is_some(), "会话仍在（事务回滚）");
    let (wav, sidecar) = session_audio_paths(&dir.base, id);
    assert!(wav.exists(), "DB 失败时音频必须原样保留: {}", wav.display());
    assert!(sidecar.exists(), "DB 失败时 sidecar 必须原样保留: {}", sidecar.display());
}

#[test]
fn purge_ignores_audio_store_switch() {
    // Arrange：落盘开关**关闭**的配置（用户不要新录音）——但盘上已有历史录音
    let db = mem_db();
    let dir = TempDataDir::new("v2-config-off");
    let id = session(&db, "关掉落盘后要删的课");
    dir.write_audio(id);
    let cfg_path = dir.root().join("audio-store.json");
    std::fs::write(
        &cfg_path,
        r#"{"enabled":false,"retention_days":30,"disk_budget_bytes":4294967296}"#,
    )
    .expect("写 audio-store.json");
    // 前置：配置**确实**解析成关闭态（否则本用例会因配置读失败回落默认「开」而假绿）
    assert!(
        !crate::audio_store::AudioStoreConfig::load(&cfg_path).enabled,
        "夹具前置：audio-store.json 必须是可解析的关闭态"
    );
    // Act
    delete_session_in(&db, dir.root(), id).expect("删会话不应报错");
    // Assert：删音频与「是否落盘」无关（隐私面 > 设置面；🔴 不得读 AudioStoreConfig 决定删不删）
    let (wav, sidecar) = session_audio_paths(&dir.base, id);
    assert!(!wav.exists(), "关掉落盘不得让删会话漏掉音频: {}", wav.display());
    assert!(!sidecar.exists(), "sidecar 同样必须删掉: {}", sidecar.display());
}
