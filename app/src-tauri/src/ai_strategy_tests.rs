//! ai_strategy.rs 单测（AAA 模式；策略层纯函数——零网络零 DB）。

use std::collections::HashMap;

use crate::ai_note_refine::NoteRefinePrompt;
use crate::ai_strategy::{
    preview_system, resolve, strategy_instructions, RefineStrategyPrefs, StrategyOverride,
};

fn dims_map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

#[test]
fn standard_dims_produce_empty_strategy_section() {
    // L2 标准精修 = 全默认 → 空指令段落（零变化保证的解析侧）
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(&p, &RefineStrategyPrefs::default(), None);
    assert_eq!(dims.preset_id, "standard");
    assert!(strategy_instructions(&dims, &p).is_empty());
}

#[test]
fn standard_build_system_byte_identical_to_legacy() {
    // 零变化核心断言：standard 档组装结果与 v0.16.1 路径（dims=None）逐字节一致
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(&p, &RefineStrategyPrefs::default(), None);
    for profile in ["lecture", "talking-head", "unknown", "no-such"] {
        assert_eq!(
            p.build_system(profile, Some(&dims)),
            p.build_system(profile, None),
            "standard 档（profile={}）必须与现状逐字节一致",
            profile
        );
    }
}

#[test]
fn deep_preset_injects_strategy_section() {
    // L3 深度改写：档级指令 + 偏离默认维度指令（concept=plain, conclusion=summary_top）
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(
        &p,
        &RefineStrategyPrefs::default(),
        Some(&StrategyOverride { preset_id: Some("deep".to_string()), dims: HashMap::new(), custom_text: None }),
    );
    let s = strategy_instructions(&dims, &p);
    assert!(s.contains("深度改写"), "档级指令缺失: {}", s);
    assert!(s.contains("通俗白话"), "概念通俗维度指令缺失: {}", s);
    assert!(s.contains("概括导语"), "结论摘要维度指令缺失: {}", s);
    let sys = p.build_system("lecture", Some(&dims));
    assert!(sys.contains("本次产出策略"));
    // 顺序：策略段落位于 few-shot 之前（管线顺序）
    let sp = sys.find("本次产出策略").unwrap();
    let fs = sys.find("示例输入").unwrap();
    assert!(sp < fs, "策略段落必须插在 few-shot 之前");
}

#[test]
fn unknown_preset_falls_back_to_standard() {
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(
        &p,
        &RefineStrategyPrefs::default(),
        Some(&StrategyOverride { preset_id: Some("no-such".to_string()), dims: HashMap::new(), custom_text: None }),
    );
    assert_eq!(dims.preset_id, "standard");
    assert!(strategy_instructions(&dims, &p).is_empty());
}

#[test]
fn invalid_dim_value_falls_back_to_declared_default() {
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(
        &p,
        &RefineStrategyPrefs::default(),
        Some(&StrategyOverride {
            preset_id: None,
            dims: dims_map(&[("examples", "bogus"), ("concept", "plain")]),
            custom_text: None,
        }),
    );
    // bogus → 声明默认 standard；plain 合法保留
    assert_eq!(dims.dims.get("examples").map(|s| s.as_str()), Some("standard"));
    assert_eq!(dims.dims.get("concept").map(|s| s.as_str()), Some("plain"));
}

#[test]
fn global_default_then_task_override_wins() {
    let p = NoteRefinePrompt::bundled();
    let prefs = RefineStrategyPrefs { default_ladder: "minimal".to_string(), dim_overrides: HashMap::new() };
    // 仅全局：极简档生效
    let d1 = resolve(&p, &prefs, None);
    assert_eq!(d1.preset_id, "minimal");
    assert_eq!(d1.dims.get("examples").map(|s| s.as_str()), Some("condensed"));
    // 任务覆盖档位：深度覆盖极简
    let d2 = resolve(&p, &prefs, Some(&StrategyOverride { preset_id: Some("deep".to_string()), dims: HashMap::new(), custom_text: None }));
    assert_eq!(d2.preset_id, "deep");
    // 单维覆盖只改目标维
    let d3 = resolve(&p, &prefs, Some(&StrategyOverride {
        preset_id: None,
        dims: dims_map(&[("emotion", "keep")]),
        custom_text: None,
    }));
    assert_eq!(d3.preset_id, "minimal");
    assert_eq!(d3.dims.get("emotion").map(|s| s.as_str()), Some("keep"));
}

#[test]
fn intent_meta_breaks_into_chips_and_keywords() {
    // 意图匹配在前端（meta.keywords + localStorage 先例）——后端声明唯一源：
    // 五枚书面 chips 与关键词齐备即匹配能力成立（未命中由前端诚实提示）
    let p = NoteRefinePrompt::bundled();
    let byid = |id: &str| p.intents.iter().find(|i| i.id == id).expect("intent 存在");
    assert!(byid("exam").keywords.iter().any(|k| "要能考前背的".contains(k)), "「背」应命中考点浓缩");
    assert!(!byid("exam").keywords.iter().any(|k| "随便来点".contains(k)), "未命中 → 前端提示（不瞎猜）");
    assert!(byid("plain").label.contains("通俗转述"), "chips 书面命名: 通俗转述");
}

#[test]
fn preview_system_contains_strategy_and_matches_real_build() {
    let p = NoteRefinePrompt::bundled();
    let prefs = RefineStrategyPrefs { default_ladder: "deep".to_string(), dim_overrides: HashMap::new() };
    let over = StrategyOverride { preset_id: None, dims: dims_map(&[("examples", "condensed")]), custom_text: None };
    let preview = preview_system(&p, "lecture", &prefs, Some(&over));
    let dims = resolve(&p, &prefs, Some(&over));
    // 预览与实发同一 build_system 路径（逐字节一致）
    assert_eq!(preview, p.build_system("lecture", Some(&dims)));
    assert!(preview.contains("本次产出策略"));
}

#[test]
fn meta_serializes_declaration_with_all_intents() {
    // meta 命令载荷：声明可序列化（前端渲染数据源），intents 五枚书面命名齐全
    let p = NoteRefinePrompt::bundled();
    let meta = crate::ai_strategy::RefineStrategyMeta {
        strategy_dims: p.strategy_dims.clone(),
        ladder_presets: p.ladder_presets.clone(),
        intents: p.intents.clone(),
    };
    let v = serde_json::to_value(&meta).expect("meta 可序列化");
    assert!(v["strategyDims"].is_array());
    let labels: Vec<&str> = meta.intents.iter().map(|i| i.label.as_str()).collect();
    for want in ["原文保真", "考点浓缩", "通俗转述", "速查纲要", "金句摘录"] {
        assert!(labels.contains(&want), "chips 书面命名缺失: {}（实得 {:?}）", want, labels);
    }
    assert_eq!(meta.ladder_presets.len(), 5, "五档阶梯应齐全（REQ-279 新增自定义）");
    assert!(meta.ladder_presets.iter().any(|l| l.id == "custom"), "custom 档应声明");
}

#[test]
fn standard_ignores_legacy_global_overrides() {
    // REQ-279 污染通道③后端兜底：standard 档不受全局逐维覆盖影响——
    // 旧版 prefsFromDraft 曾把意图基准全维写入 dim_overrides，叠加后「标准」
    // 语义漂移；后端对 standard 恒不叠加（与零覆盖解析逐字段等价）。
    let p = NoteRefinePrompt::bundled();
    let prefs = RefineStrategyPrefs {
        default_ladder: String::new(),
        dim_overrides: dims_map(&[("concept", "plain"), ("conclusion", "summary_top")]),
    };
    let dirty = resolve(&p, &prefs, None);
    let clean = resolve(&p, &RefineStrategyPrefs::default(), None);
    assert_eq!(dirty.preset_id, "standard");
    assert_eq!(dirty, clean, "standard 必须与零覆盖逐字段等价（含指令与每维值）");
    assert!(strategy_instructions(&dirty, &p).is_empty());
    // 对照：显式阶梯档（deep）仍允许全局覆盖折叠（设置页默认偏好的语义保留）
    let ladder_prefs = RefineStrategyPrefs {
        default_ladder: "deep".to_string(),
        dim_overrides: dims_map(&[("examples", "condensed")]),
    };
    let dl = resolve(&p, &ladder_prefs, None);
    assert_eq!(dl.preset_id, "deep");
    assert_eq!(dl.dims.get("examples").map(|s| s.as_str()), Some("condensed"));
}

#[test]
fn custom_preset_free_text_becomes_instruction_and_surfaces_in_info() {
    // REQ-279：自定义档自由文本 → 档级指令（预览/实发同路径可见）；无维度注入
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(
        &p,
        &RefineStrategyPrefs::default(),
        Some(&StrategyOverride {
            preset_id: Some("custom".to_string()),
            dims: HashMap::new(),
            custom_text: Some("写得更口语一些，多举一个生活化例子。".to_string()),
        }),
    );
    assert_eq!(dims.preset_id, "custom");
    assert_eq!(dims.custom_text, "写得更口语一些，多举一个生活化例子。");
    let s = strategy_instructions(&dims, &p);
    assert!(s.contains("本次为自定义档"), "档级指令缺失: {}", s);
    assert!(s.contains("生活化例子"), "自由文本未进指令: {}", s);
    // 每维保持声明默认 → 无维度指令注入（纯文本档）
    assert_eq!(dims.dims.get("conclusion").map(|s| s.as_str()), Some("as_is"));
}

#[test]
fn custom_preset_empty_text_falls_back_to_standard() {
    // 前端守卫 + 后端兜底统一口径：custom 无文本 = 无效 → standard（零变化）
    let p = NoteRefinePrompt::bundled();
    let dims = resolve(
        &p,
        &RefineStrategyPrefs::default(),
        Some(&StrategyOverride {
            preset_id: Some("custom".to_string()),
            dims: HashMap::new(),
            custom_text: Some("   ".to_string()),
        }),
    );
    assert_eq!(dims.preset_id, "standard");
    assert!(dims.custom_text.is_empty());
    assert!(strategy_instructions(&dims, &p).is_empty());
}

#[test]
fn custom_preset_ignores_global_overrides_and_caps_text_length() {
    // 净化：custom 与 standard 同属「用户显式文本」档——全局残留不得叠加；
    // 自由文本 500 字符截断（防提示词膨胀）
    let p = NoteRefinePrompt::bundled();
    let long: String = "a".repeat(1200);
    let prefs = RefineStrategyPrefs {
        default_ladder: String::new(),
        dim_overrides: dims_map(&[("concept", "plain")]),
    };
    let dims = resolve(
        &p,
        &prefs,
        Some(&StrategyOverride {
            preset_id: Some("custom".to_string()),
            dims: HashMap::new(),
            custom_text: Some(long),
        }),
    );
    assert_eq!(dims.preset_id, "custom");
    assert_eq!(dims.custom_text.chars().count(), crate::ai_strategy::MAX_CUSTOM_TEXT_CHARS);
    assert_eq!(dims.dims.get("concept").map(|s| s.as_str()), Some("original"), "全局覆盖不得进 custom 档");
}
