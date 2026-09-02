//! goal_interview 纯函数 table-driven golden（v0.18.0 优化评审 #9——不写众多
//! 散装测试函数：6 条端到端路径 + 参数矩阵断言）。

use crate::goal_interview::{
    assemble_declaration, derive_criteria, horizon_end_secs, suggest_milestones,
};
use crate::goal_schema::{
    TIER_DEFAULT, TIER_HANDS_ON, TIER_SOLO_PROJECT, TIER_TEACH_CERT,
};

/// 端到端路径夹具：完整访谈答案组合 → 预期配方与草案断言。
struct Path {
    name: &'static str,
    tier: &'static str,
    level: Option<&'static str>,
    commitment: Option<&'static str>,
    horizon: Option<&'static str>,
    scenario: Option<&'static str>,
    criteria_statement: Option<&'static str>,
    non_scope: Option<&'static str>,
    // 预期
    expect_settlements: usize,
    expect_applications: Option<usize>,
    expect_self_test: Option<f64>,
    expect_self_test_enforced: bool,
    expect_review_days: Option<usize>,
    expect_drafts: usize,
    expect_due_weeks: &'static [usize],
    expect_horizon_end: Option<i64>,
    expect_decl_contains: &'static str,
}

const NOW: i64 = 1_700_000_000;

/// 端到端 golden（6 条路径：覆盖全档位矩阵/跳过/折叠/快速模式）。
const PATHS: [Path; 6] = [
    Path {
        name: "能上手×零基础×投入 5h+",
        tier: TIER_HANDS_ON,
        level: Some("zero"),
        commitment: Some("5h+"),
        horizon: Some("3m"),
        scenario: Some("工作自动化"),
        criteria_statement: None,
        non_scope: Some("不做 Web 框架"),
        expect_settlements: 1,
        expect_applications: None,
        expect_self_test: None,
        expect_self_test_enforced: false,
        expect_review_days: None,
        expect_drafts: 3,
        expect_due_weeks: &[4, 8, 12],
        expect_horizon_end: Some(90 * 86_400),
        expect_decl_contains: "用3 个月学会",
    },
    Path {
        name: "能独立实例×会一点×投入 2-5h",
        tier: TIER_SOLO_PROJECT,
        level: Some("some"),
        commitment: Some("2-5h"),
        horizon: Some("6m"),
        scenario: Some("独立项目"),
        criteria_statement: Some("独立完成爬虫实例并记录 ≥1 次应用"),
        non_scope: None,
        expect_settlements: 1,
        expect_applications: Some(1),
        expect_self_test: None,
        expect_self_test_enforced: false,
        expect_review_days: None,
        expect_drafts: 3,
        expect_due_weeks: &[6, 12, 18],
        expect_horizon_end: Some(180 * 86_400),
        expect_decl_contains: "独立完成爬虫实例并记录 ≥1 次应用",
    },
    Path {
        name: "能教别人×零基础×看情况",
        tier: TIER_TEACH_CERT,
        level: Some("zero"),
        commitment: Some("flex"),
        horizon: Some("none"),
        scenario: Some("兴趣分享"),
        criteria_statement: None,
        non_scope: Some("不做商业变现"),
        expect_settlements: 1,
        expect_applications: None,
        expect_self_test: Some(0.8),
        expect_self_test_enforced: false, // M1/M2 占位：不参与判定
        expect_review_days: None,
        expect_drafts: 3,
        expect_due_weeks: &[8, 16, 24],
        expect_horizon_end: None,
        expect_decl_contains: "长期目标（无期限）：学会",
    },
    Path {
        name: "说不清→默认档×系统学过一半",
        tier: TIER_DEFAULT,
        level: Some("mid"),
        commitment: None,
        horizon: None,
        scenario: None,
        criteria_statement: None,
        non_scope: None,
        expect_settlements: 1,
        expect_applications: None,
        expect_self_test: None,
        expect_self_test_enforced: false,
        expect_review_days: Some(5),
        expect_drafts: 2, // mid 从应用阶段起步
        expect_due_weeks: &[16, 24], // spacing 8 兜底
        expect_horizon_end: None,
        expect_decl_contains: "用12 周学会",
    },
    Path {
        name: "快速模式（只填名称+期限）",
        tier: TIER_DEFAULT,
        level: None,
        commitment: None,
        horizon: Some("2w"),
        scenario: None,
        criteria_statement: None,
        non_scope: None,
        expect_settlements: 1,
        expect_applications: None,
        expect_self_test: None,
        expect_self_test_enforced: false,
        expect_review_days: Some(5),
        expect_drafts: 3,
        expect_due_weeks: &[8, 16, 24],
        expect_horizon_end: Some(14 * 86_400),
        expect_decl_contains: "用先试两周学会",
    },
    Path {
        name: "第 2/4 问全部跳过（折叠可选）",
        tier: TIER_HANDS_ON,
        level: None,
        commitment: None,
        horizon: None,
        scenario: Some("考试通关"),
        criteria_statement: Some("能通过 CSP 考试"),
        non_scope: None,
        expect_settlements: 1,
        expect_applications: None,
        expect_self_test: None,
        expect_self_test_enforced: false,
        expect_review_days: None,
        expect_drafts: 3,
        expect_due_weeks: &[8, 16, 24],
        expect_horizon_end: None,
        expect_decl_contains: "能通过 CSP 考试",
    },
];

#[test]
fn golden_end_to_end_paths() {
    for p in &PATHS {
        // Act: 配方推导
        let criteria = derive_criteria(p.tier, p.non_scope);
        // Assert: 配方字段
        assert_eq!(criteria.group_settlements, p.expect_settlements, "路径【{}】结算要求", p.name);
        assert_eq!(criteria.applications, p.expect_applications, "路径【{}】应用要求", p.name);
        assert_eq!(criteria.self_test_rate, p.expect_self_test, "路径【{}】自测要求", p.name);
        assert_eq!(criteria.self_test_enforced, p.expect_self_test_enforced, "路径【{}】自测是否判定", p.name);
        assert_eq!(criteria.review_active_days, p.expect_review_days, "路径【{}】复习活跃要求", p.name);
        // Act: 里程碑草案
        let drafts = suggest_milestones(p.level, p.commitment);
        // Assert: 草案数量与节奏（周距）
        assert_eq!(drafts.len(), p.expect_drafts, "路径【{}】草案数", p.name);
        let weeks: Vec<usize> = drafts.iter().map(|d| d.due_weeks).collect();
        assert_eq!(weeks.as_slice(), p.expect_due_weeks, "路径【{}】草案周距", p.name);
        // Act: 时限锚点
        let end = horizon_end_secs(p.horizon, NOW);
        // Assert
        assert_eq!(
            end,
            p.expect_horizon_end.map(|w| NOW + w),
            "路径【{}】时限锚点",
            p.name
        );
        // Act: 宣言回显（criteria 语句兜底）
        let decl = assemble_declaration(
            "Python",
            p.scenario,
            p.criteria_statement,
            &criteria.statement,
            p.non_scope,
            p.horizon,
        );
        // Assert
        assert!(decl.contains(p.expect_decl_contains), "路径【{}】宣言含「{}」→ 实际「{}」", p.name, p.expect_decl_contains, decl);
    }
}

#[test]
fn matrix_derive_criteria_all_tiers() {
    // 参数矩阵：四档位各自配方语义
    let tiers = [
        (TIER_HANDS_ON, 1, None::<usize>, None::<f64>, false, None::<usize>),
        (TIER_SOLO_PROJECT, 1, Some(1), None, false, None),
        (TIER_TEACH_CERT, 1, None, Some(0.8), false, None),
        (TIER_DEFAULT, 1, None, None, false, Some(5)),
    ];
    for (tier, settlements, applications, rate, enforced, days) in tiers {
        let c = derive_criteria(tier, None);
        assert_eq!(c.tier, tier);
        assert_eq!(c.group_settlements, settlements);
        assert_eq!(c.applications, applications, "档位 {}", tier);
        assert_eq!(c.self_test_rate, rate, "档位 {}", tier);
        assert_eq!(c.self_test_enforced, enforced, "档位 {}", tier);
        assert_eq!(c.review_active_days, days, "档位 {}", tier);
    }
}

#[test]
fn matrix_suggest_milestones_level_commitment() {
    // 现状×投入矩阵：level ∈ {None, zero, some, mid} × commitment ∈ {5h+, 2-5h, flex, None/未知}
    let cases = [
        (None, None, 3, 8),
        (Some("zero"), Some("5h+"), 3, 4),
        (Some("some"), Some("2-5h"), 3, 6),
        (Some("mid"), Some("5h+"), 2, 8), // mid × 5h+：从应用起步，spacing 按投入=4 → 应用 2 周距
        (Some("mid"), Some("flex"), 2, 16), // mid × flex：spacing 8 → 应用 16
        (Some("unknown"), Some("unknown"), 3, 8), // 未知值诚实回落默认
    ];
    for (level, commitment, drafts, first_weeks) in cases {
        let out = suggest_milestones(level, commitment);
        assert_eq!(out.len(), drafts, "level={:?} commitment={:?}", level, commitment);
        assert_eq!(out[0].due_weeks, first_weeks, "level={:?} commitment={:?}", level, commitment);
        // 草案标题非空守卫——纯逻辑成品可读性
        for d in &out {
            assert!(!d.title.trim().is_empty(), "草案标题非空");
        }
    }
}

#[test]
fn matrix_horizon_end_variants() {
    let cases = [
        (Some("3m"), Some(90 * 86_400)),
        (Some("6m"), Some(180 * 86_400)),
        (Some("2w"), Some(14 * 86_400)),
        (Some("none"), None),
        (Some("unknown"), None),
        (None, None),
    ];
    for (horizon, expect) in cases {
        assert_eq!(horizon_end_secs(horizon, NOW), expect.map(|w| NOW + w), "horizon={:?}", horizon);
    }
}

#[test]
fn matrix_declaration_components() {
    // 场景/判据/边界三个可选组件的填充与兜底
    let full = assemble_declaration("Python", Some("工作自动化"), Some("独立完成爬虫"), "兜底", Some("不做 Web 框架"), Some("3m"));
    assert!(full.contains("用3 个月学会Python"));
    assert!(full.contains("（场景：工作自动化）"));
    assert!(full.contains("达成标准：独立完成爬虫"));
    assert!(full.contains("边界：不做 Web 框架"));
    // 判据缺失 → 配方兜底；边界缺失 → 占位文案
    let fallback = assemble_declaration("乐理", None, None, "配方说", None, None);
    assert!(fallback.contains("达成标准：配方说"));
    assert!(fallback.contains("边界：暂未明确"));
    // 空白串视同未填（trim 后过滤）
    let blank = assemble_declaration(" 水彩 ", Some("   "), Some("   "), "配方兜底", Some("  "), Some("2w"));
    assert!(blank.contains("学会水彩"));
    assert!(!blank.contains("（场景："));
    assert!(blank.contains("达成标准：配方兜底"));
    // 无期限（none）= 长期目标语义——不走「用无期限学会」病句
    let none = assemble_declaration("乐理", None, None, "配方兜底", None, Some("none"));
    assert!(none.starts_with("长期目标（无期限）：学会乐理"));
    assert!(!none.contains("用无期限"));
}
