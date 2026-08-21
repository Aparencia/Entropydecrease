//! 视频类型档案 Tauri commands（REQ-043 / v0.5.0 M1）。
//!
//! @ai-context: 本层只做参数校验、调用纯逻辑（video_profile）、错误映射（AGENTS.md §6）。
//! @ai-context: 混合检测闭环：detect（信号投票 + 记忆偏好）→ 前端展示"检测为：网课（可改）"
//!              → 用户确认/修改 → remember 写记忆偏好（同窗口标题下次直接生效）。
//! @ai-context: 记忆偏好 JSON 持久化（应用数据目录，AppState 持有路径与内存态单点，
//!              与词表同模式：锁内 read-modify-write 防 TOCTOU）。

use tauri::State;

use crate::commands::AppState;
use crate::video_profile::{
    builtin_profiles, profile_by_kind, vote_detect, DetectResult, ObservedSignals, ProfileKind,
    ProfileMemory, VideoProfile,
};
use crate::video_profile_spec::{ContentForm, ProfileSpec};

/// 档案标识最大长度（防御超长输入污染记忆库）。
const KIND_MAX_CHARS: usize = 30;

/// 导出五档案（前端展示/校准；JSON 序列化即档案可校准接口）。
#[tauri::command]
pub fn video_profiles() -> Vec<VideoProfile> {
    builtin_profiles()
}

/// 混合检测：窗口标题信号 → 候选档案（先查记忆偏好，命中直接生效）。
///
/// @param title - 目标窗口标题（A5 信号；记忆偏好匹配键）
/// @param url - 可选 URL/播放器标题（B站/网课平台关键词信号）
/// @param frameSwitchRate - 可选画面切换频率（次/分；会话中可增量评估）
/// @param hasSubtitle - 可选字幕有无（det 结果统计）
/// @param platformTags - 可选平台分区标签（REQ-191：B站分区/本地目录名——
///                       领域检测强信号；无平台信号零回归）
#[tauri::command]
pub fn detect_video_profile(
    state: State<'_, AppState>,
    title: Option<String>,
    url: Option<String>,
    frame_switch_rate: Option<f32>,
    has_subtitle: Option<bool>,
    platform_tags: Option<Vec<String>>,
) -> DetectResult {
    let title = title.map(|t| t.chars().take(200).collect::<String>());
    let url = url.map(|u| u.chars().take(500).collect::<String>());
    // 领域检测（REQ-190：平台分区 > 标题词；user/term 由检测卡/会话中补全）
    // REQ-191（M4）：平台适配器自动推断——bilibili 内联分区/local 路径分段
    // 补入平台标签；显式传入的 platformTags 优先（前端 OCR 标签通用化通道）
    let mut platform_hints: Vec<String> = platform_tags.unwrap_or_default();
    match crate::platform_adapter::infer_platform(title.as_deref(), url.as_deref()) {
        Some(crate::platform_adapter::PlatformKind::Bilibili) => {
            let h = crate::platform_adapter::adapt_bilibili(title.as_deref(), url.as_deref());
            for t in h.platform_tags {
                if !platform_hints.contains(&t) {
                    platform_hints.push(t);
                }
            }
        }
        Some(crate::platform_adapter::PlatformKind::Local) => {
            let h = crate::platform_adapter::adapt_local(title.as_deref());
            for s in h.path_segments {
                if !platform_hints.contains(&s) {
                    platform_hints.push(s);
                }
            }
        }
        _ => {}
    }
    let domain = crate::video_profile_domain::detect_domain(
        &crate::video_profile_domain::DomainSignals {
            title: title.clone(),
            platform_tags: platform_hints
                .into_iter()
                .map(|t| t.chars().take(50).collect())
                .collect(),
            user_confirmed: None,
            term_freq: Vec::new(),
        },
    );
    let domain = (domain.kind.is_some() || !domain.fine_tags.is_empty()).then_some(domain);
    // 1) 记忆偏好优先：同窗口标题上次确认过 → 直接生效（无需再次询问）
    if let Some(t) = title.as_deref() {
        let memory = state
            .profile_memory
            .lock()
            .map(|m| m.clone())
            .unwrap_or_default();
        if let Some(kind) = memory.lookup(t) {
            let mut result = vote_detect(&ObservedSignals {
                title: title.clone(),
                url,
                frame_switch_rate,
                has_subtitle,
                duration_min: None,
            });
            // 记忆命中覆盖候选：单候选 + 无需确认（用户已裁决过）
            result.candidates = vec![crate::video_profile::ProfileCandidate {
                kind,
                score: 1.0,
            }];
            result.needs_confirmation = false;
            result.memory_hit = Some(kind);
            // v0.9.0（REQ-188）：记忆命中的四维形态（新记忆 form 优先，
            // 旧记忆经 kind.to_form() 映射兜底——检测卡 v2 直接展示）
            result.memory_form = memory.lookup_form(t);
            result.domain = domain;
            return result;
        }
    }
    // 2) 信号投票（无记忆命中）
    let mut result = vote_detect(&ObservedSignals {
        title,
        url,
        frame_switch_rate: frame_switch_rate.map(|r| r.clamp(0.0, 1000.0)),
        has_subtitle,
        duration_min: None,
    });
    result.domain = domain;
    result
}

/// 领域标签检测（REQ-190：平台分区 > 用户确认 > 标题词 > 术语频率）。
///
/// @param title - 窗口标题（来源②标题领域词）
/// @param platformTags - 平台分区标签（来源①——B站分区/本地目录名）
/// @param userConfirmed - 用户已确认领域（来源③——检测卡下拉；kebab-case）
/// @param termFreq - 会话中术语频率词（来源④——自动补全）
/// @param ocrTags - 画面内 OCR 标签（REQ-191 通用化通道——任何平台画面标签
///                  都算；与 platformTags 合并入平台来源）
#[tauri::command]
pub fn detect_video_domain(
    title: Option<String>,
    platform_tags: Option<Vec<String>>,
    user_confirmed: Option<String>,
    term_freq: Option<Vec<String>>,
    ocr_tags: Option<Vec<String>>,
) -> crate::video_profile_domain::DomainDetection {
    let user = user_confirmed.and_then(|s| {
        crate::video_profile_domain::DomainKind::parse(&s.chars().take(30).collect::<String>())
    });
    // OCR 标签通用化（REQ-191）：画面内标签与平台标签同为强信号来源——
    // 经 platform_adapter 通用通道合并（词表映射扩展，不依赖平台枚举）
    let mut platform = platform_tags.unwrap_or_default();
    for t in ocr_tags.unwrap_or_default() {
        if !platform.contains(&t) {
            platform.push(t);
        }
    }
    // 平台标签 → 领域（通用通道）；无平台信号 → 其余来源（标题/用户/术语）
    let from_ocr = crate::platform_adapter::ocr_tags_to_domain(&platform);
    if from_ocr.kind.is_some() {
        return from_ocr;
    }
    crate::video_profile_domain::detect_domain(&crate::video_profile_domain::DomainSignals {
        title: title.map(|t| t.chars().take(200).collect()),
        platform_tags: Vec::new(),
        user_confirmed: user,
        term_freq: term_freq.unwrap_or_default()
            .into_iter()
            .map(|t| t.chars().take(50).collect())
            .collect(),
    })
}

/// 领域 → hotwords 预热（REQ-190 作用链：VocabManager 通道——注入共享词表，
/// ASR 术语命中率↑；幂等去重）。
///
/// @param kind - 领域标识（kebab-case；非法值明确报错）
#[tauri::command]
pub fn preheat_domain_hotwords(
    state: State<'_, AppState>,
    kind: String,
) -> Result<usize, String> {
    let kind = crate::video_profile_domain::DomainKind::parse(
        &kind.chars().take(30).collect::<String>(),
    )
    .ok_or_else(|| "非法领域标识".to_string())?;
    let candidates = crate::video_profile_domain::hotword_candidates(kind);
    let mut vocab = state
        .vocab
        .lock()
        .map_err(|e| format!("词表锁中毒: {}", e))?;
    let added = vocab.add_hotwords(&candidates);
    vocab
        .save(&state.vocab_path)
        .map_err(|e| format!("保存词表失败: {}", e))?;
    Ok(added)
}

/// 记录用户确认/修改：窗口标题 → 档案（记忆偏好，下次同标题直接生效）。
///
/// @param title - 窗口标题（记忆匹配键，完整标题入库）
/// @param kind - 档案标识（kebab-case；非法值回退 Lecture）
#[tauri::command]
pub fn remember_video_profile(
    state: State<'_, AppState>,
    title: String,
    kind: String,
) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("窗口标题为空，无法记忆档案偏好".to_string());
    }
    let title = title.chars().take(200).collect::<String>();
    let kind = ProfileKind::parse(&kind.chars().take(KIND_MAX_CHARS).collect::<String>());
    let path = state.profile_memory_path.clone();
    let memory = state.profile_memory.clone();
    // 锁内 read-modify-write（与词表同模式，防 TOCTOU 文件竞争）
    {
        let mut guard = memory
            .lock()
            .map_err(|e| format!("档案记忆锁中毒: {}", e))?;
        guard.remember(&title, kind);
        guard
            .save(&path)
            .map_err(|e| format!("保存档案记忆失败: {}", e))?;
    }
    Ok(())
}

/// 读取当前档案记忆（诊断/展示用）。
#[tauri::command]
pub fn video_profile_memory(state: State<'_, AppState>) -> ProfileMemory {
    state
        .profile_memory
        .lock()
        .map(|m| m.clone())
        .unwrap_or_default()
}

/// 按标识查单档案（前端"检测为：网课（可改）"下拉用；非法值回退 Lecture）。
#[tauri::command]
pub fn video_profile_by_kind(kind: String) -> VideoProfile {
    profile_by_kind(ProfileKind::parse(&kind.chars().take(KIND_MAX_CHARS).collect::<String>()))
}

// ── v0.9.0 M1（REQ-188）：四维解耦 command（检测卡 v2 消费端；旧命令零改动）──

/// 按四维规格查参数矩阵（形态 × 画面档 → 采样/OCR/存储/模板）。
///
/// @param form - 形态标识（kebab-case；None=识别中——模板走默认讲义式）
/// @param tier - 画面档标识（kebab-case；缺省=中档——开始前默认+诚实声明）
#[tauri::command]
pub fn video_profile_for_spec(form: Option<String>, tier: Option<String>) -> VideoProfile {
    let form = form.and_then(|f| ContentForm::parse(&f));
    let spec = ProfileSpec {
        // v0.9.0（REQ-189 前置）：形态已知、档位缺省 → 按形态默认档（解说/对话低档、
        // 题目/代码高档——无信号时的新会话起点，避免一刀切中档）
        form,
        visual_tier: tier
            .and_then(|t| crate::video_profile_spec::VisualTier::parse(&t))
            .or_else(|| form.map(crate::video_profile_spec::default_tier_for_form))
            .unwrap_or_default(),
        ..ProfileSpec::default()
    };
    crate::video_profile_spec::profile_for_spec(&spec)
}

/// 旧档案 → 四维规格（记忆库 kind 映射迁移/旧会话解读；检测卡 v2 展示用）。
#[tauri::command]
pub fn video_profile_spec_by_kind(kind: String) -> ProfileSpec {
    let kind = ProfileKind::parse(&kind.chars().take(KIND_MAX_CHARS).collect::<String>());
    crate::video_profile_spec::spec_from_kind(kind)
}

/// 记录用户确认/修改（四维形态版，REQ-188）：记忆偏好存新形态（form 字段），
/// kind 兼容字段存代表旧类——消费端 v1/v2 双通道读取均有效。
///
/// @param title - 窗口标题（记忆匹配键，完整标题入库）
/// @param form - 形态标识（kebab-case；非法值 → 仅记 kind 兼容字段）
#[tauri::command]
pub fn remember_video_profile_form(
    state: State<'_, AppState>,
    title: String,
    form: String,
) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("窗口标题为空，无法记忆档案偏好".to_string());
    }
    let title = title.chars().take(200).collect::<String>();
    let form = ContentForm::parse(&form.chars().take(KIND_MAX_CHARS).collect::<String>())
        .ok_or_else(|| format!("非法形态标识: {}", form.chars().take(KIND_MAX_CHARS).collect::<String>()))?;
    let path = state.profile_memory_path.clone();
    let memory = state.profile_memory.clone();
    // 锁内 read-modify-write（与词表同模式，防 TOCTOU 文件竞争）
    {
        let mut guard = memory
            .lock()
            .map_err(|e| format!("档案记忆锁中毒: {}", e))?;
        guard.remember_form(&title, form);
        guard
            .save(&path)
            .map_err(|e| format!("保存档案记忆失败: {}", e))?;
    }
    Ok(())
}
