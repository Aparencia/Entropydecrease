//! 精修结构回归评测（F3-E golden，2026-08-21；REQ-147 扩展）。
//!
//! @ai-context: 内置小样本集（fixtures/refine_golden/samples.json——3 个典型
//!              档案：网课讲义式（含章节/术语/配图）、实操步骤式（含配图）、
//!              口播摘要式（无配图））→ mock 适配器全链路（不联网）→
//!              协议校验 + to_markdown → 断言结构不漂移：
//!              ① schema_version=2；② 章节沿用（不发明新章节）；
//!              ③ 配图经 image 块保留（丢图回归护栏）；④ 块类型合法集合。
//! @ai-context: 提示词 golden 冒烟：固定样本断言输出结构——提示词改动
//!              （note_refine.json）破坏契约时立即红（防漂移护栏）。

use serde::Deserialize;

use crate::ai_mock::AiMockAdapter;
use crate::ai_refine_protocol::{
    AiRefineBlockType, AiRefineRequest, AiRefineResponse, SCHEMA_VERSION_V2,
};

/// 样本集结构（fixtures/refine_golden/samples.json）。
#[derive(Debug, Deserialize)]
struct GoldenSet {
    samples: Vec<GoldenSample>,
}

#[derive(Debug, Deserialize)]
struct GoldenSample {
    name: String,
    profile: String,
    glossary: Vec<String>,
    chapters: Vec<String>,
    content: String,
    expect: GoldenExpect,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenExpect {
    schema_version: u32,
    min_sections: usize,
    #[serde(default)]
    chapter_set: Vec<String>,
    must_have_types: Vec<String>,
    #[serde(default)]
    images_preserved: Vec<String>,
    no_new_chapters: bool,
}

/// 内置样本集（编译期捆绑——随仓库维护，防路径漂移）。
fn bundled_golden() -> GoldenSet {
    let raw = include_str!("../fixtures/refine_golden/samples.json");
    serde_json::from_str(raw).expect("golden 样本集必须可解析（开发期错误）")
}

/// 跑通全链路：请求 → mock 精修 → 校验 → markdown（样本级回归）。
fn run_sample(s: &GoldenSample) -> AiRefineResponse {
    let req = AiRefineRequest {
        content: s.content.clone(),
        profile: s.profile.clone(),
        glossary: s.glossary.clone(),
        chapters: s.chapters.clone(),
        slice_index: 1,
        slice_total: 1,
        prev_summary: None,
        next_summary: None,
    };
    let resp = AiMockAdapter.refine(&req);
    // 协议强校验必须先通过（非法响应不得进入笔记管线）
    resp.validate()
        .unwrap_or_else(|e| panic!("样本「{}」mock 响应校验失败: {}", s.name, e));
    resp
}

#[test]
fn golden_all_samples_validate_and_render_v2() {
    for s in bundled_golden().samples {
        let resp = run_sample(&s);
        // ① schema_version = 2（协议 v2 契约）
        assert_eq!(resp.schema_version, SCHEMA_VERSION_V2, "样本「{}」必须 v2", s.name);
        // ② sections 非空 + 数量下限
        assert!(resp.sections.len() >= s.expect.min_sections, "样本「{}」章节不足", s.name);
        // ③ 渲染不 panic、非空
        let md = resp.to_markdown();
        assert!(!md.trim().is_empty(), "样本「{}」markdown 为空", s.name);
    }
}

#[test]
fn golden_chapters_follow_input_not_invented() {
    for s in bundled_golden().samples {
        if !s.expect.no_new_chapters {
            continue;
        }
        let resp = run_sample(&s);
        // 章节标题集合 ⊆ 输入章节（精修=整理不创作——不发明章节）
        for sec in &resp.sections {
            let in_input = s.expect.chapter_set.iter().any(|c| sec.heading.contains(c.as_str()))
                || s.chapters.iter().any(|c| sec.heading.contains(c.as_str()));
            assert!(in_input, "样本「{}」发明了章节: {}", s.name, sec.heading);
        }
    }
}

#[test]
fn golden_images_preserved_via_image_blocks() {
    // 丢图回归护栏：规则版配图行 → image 块原样保留（路径不丢失/不改写）
    for s in bundled_golden().samples {
        if s.expect.images_preserved.is_empty() {
            continue;
        }
        let resp = run_sample(&s);
        let md = resp.to_markdown();
        for img in &s.expect.images_preserved {
            assert!(
                md.contains(img.as_str()),
                "样本「{}」配图 {} 丢失（丢图回归）",
                s.name,
                img
            );
        }
    }
}

#[test]
fn golden_block_types_legal_and_required() {
    for s in bundled_golden().samples {
        let resp = run_sample(&s);
        let all: Vec<String> = resp
            .sections
            .iter()
            .flat_map(|sec| sec.blocks.iter())
            .map(|b| match b.block_type {
                AiRefineBlockType::Paragraph => "paragraph".to_string(),
                AiRefineBlockType::List => "list".to_string(),
                AiRefineBlockType::Term => "term".to_string(),
                AiRefineBlockType::Highlight => "highlight".to_string(),
                AiRefineBlockType::Quote => "quote".to_string(),
                AiRefineBlockType::Image => "image".to_string(),
            })
            .collect();
        for need in &s.expect.must_have_types {
            assert!(all.contains(need), "样本「{}」缺必需块类型 {}", s.name, need);
        }
    }
}

#[test]
fn golden_prompt_template_parses_with_v2_contract() {
    // 提示词 golden 冒烟：模板必须解析且含 v2 契约（image 块 + schemaVersion）
    // ——note_refine.json 改动破坏契约时立即红（防漂移）
    let prompt = crate::ai_note_refine::NoteRefinePrompt::bundled();
    assert!(prompt.version >= 2, "提示词模板必须升级到 v2");
    let sys = prompt.build_system("lecture");
    assert!(sys.contains("image"), "v2 提示词必须声明 image 块类型");
    assert!(sys.contains("schemaVersion"), "v2 提示词必须声明 schemaVersion");
    assert!(sys.contains("slice"), "v2 提示词必须声明片间上下文约束");
}
