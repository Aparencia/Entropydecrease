//! 结构模型与课后精修 Tauri commands（REQ-047/049/050 模型版）。
//!
//! @ai-context: 本层只做参数校验、调用下载器（structure_models）+ 精修编排、
//!              错误映射（AGENTS.md §6）。
//! @ai-context: 命令集：structure_model_download（按类下载，含公式档位切换）、
//!              structure_model_status（三类状态）、structure_models_dir（装配目录）、
//!              refine_session（课后精修触发；事件 session:refining/refined/skipped）。

use tauri::State;

use crate::commands::AppState;
use crate::structure_models::StructureModelKind;

/// 结构模型装配目录（models/structure；下载器/引擎共用，禁止硬编码绝对路径）。
pub fn structure_models_dir(state: &AppState) -> std::path::PathBuf {
    state.model_dir.join("structure")
}

/// 结构模型装配路径集合（普通函数：供命令与精修编排共用）。
///
/// @ai-context: 审查 H3 修复：公式路径按持久化档位（structure_tier.json）解析——
///              用户切换 UniMERNet 高精度档并下载后装配路径正确跟随。
pub fn structure_model_paths(state: &AppState) -> crate::structure_engine::StructureModels {
    let dir = structure_models_dir(state);
    let tier = crate::structure_tier::StructureTierConfig::load(&state.structure_tier_path)
        .formula_tier;
    crate::structure_engine::StructureModels {
        layout: dir.join("pp-doclayout-l.onnx").to_string_lossy().into_owned(),
        table: Some(dir.join("slanet_plus_v2.onnx").to_string_lossy().into_owned()),
        table_cls: Some(dir.join("pp-lcnet_x1_0_table_cls.onnx").to_string_lossy().into_owned()),
        table_dict: Some(dir.join("table_structure_dict_ch.txt").to_string_lossy().into_owned()),
        formula: Some(dir.join(tier.model_file()).to_string_lossy().into_owned()),
        formula_tokenizer: Some(dir.join(tier.tokenizer_file()).to_string_lossy().into_owned()),
    }
}

/// 下载某类结构模型（按需启用：版面/表格/公式可独立下载）。
///
/// @param kind - layout | table | formula
/// @param highAccuracyFormula - 公式高精度档（true=UniMERNet 1.84GB；默认 false）
#[tauri::command]
pub async fn structure_model_download(
    state: State<'_, AppState>,
    kind: String,
    high_accuracy_formula: Option<bool>,
) -> Result<usize, String> {
    let kind = parse_kind(&kind);
    let dir = structure_models_dir(&state);
    // 审查 H3 修复：公式下载时按档位持久化（装配路径随档位切换）
    if kind == StructureModelKind::Formula {
        let tier = if high_accuracy_formula.unwrap_or(false) {
            crate::structure_tier::FormulaTier::UniMERNet
        } else {
            crate::structure_tier::FormulaTier::PFormulaNet
        };
        let cfg = crate::structure_tier::StructureTierConfig { formula_tier: tier };
        cfg.save(&state.structure_tier_path)
            .map_err(|e| format!("保存公式档位失败: {}", e))?;
    }
    state
        .structure_downloader
        .start(kind, dir, high_accuracy_formula.unwrap_or(false), state.app.clone())
        .map_err(|e| e.to_string())
}

/// 查询当前公式档位（前端设置面板展示/切换；审查 H3 修复）。
#[tauri::command]
pub fn structure_formula_tier(state: State<'_, AppState>) -> crate::structure_tier::FormulaTier {
    crate::structure_tier::StructureTierConfig::load(&state.structure_tier_path).formula_tier
}

/// 查询三类结构模型状态（未下载/下载中/就绪/失败）。
#[tauri::command]
pub fn structure_model_status(state: State<'_, AppState>) -> Vec<crate::structure_models::StructureDownloadStatus> {
    state.structure_downloader.all_statuses()
}

/// 查询结构模型装配目录（前端展示用；不暴露内部模型路径细节）。
#[tauri::command]
pub fn structure_models_dir_cmd(state: State<'_, AppState>) -> String {
    structure_models_dir(&state).to_string_lossy().into_owned()
}

/// 课后精修会话（方案 A 增强版：懒加载模型 → 表格/公式模型版识别 → 回填产物）。
///
/// @ai-context: 后台线程执行；完成后 emit session:refined（前端产物视图静默升级）。
/// @ai-context: 降级链：模型未下载 → 跳过 + 事件提示（规则版产物保留）。
#[tauri::command]
pub async fn refine_session(state: State<'_, AppState>, session_id: i64) -> Result<String, String> {
    if session_id <= 0 {
        return Err("无效的会话 id".to_string());
    }
    // 精修需要 AppState 的多项字段（db/engines/app/images 目录）——整体 clone 后移入
    // spawn_blocking（AppState 为 Clone，内部 Arc 共享），避免 State 生命周期跨 await。
    let state: AppState = (*state).clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::commands_refine_inner::run_refine(&state, session_id)
    })
    .await
    .map_err(|e| format!("任务调度失败: {}", e))?
}

/// 解析命令入参（非法值回退 layout）。
fn parse_kind(kind: &str) -> StructureModelKind {
    match kind {
        "table" => StructureModelKind::Table,
        "formula" => StructureModelKind::Formula,
        _ => StructureModelKind::Layout,
    }
}
