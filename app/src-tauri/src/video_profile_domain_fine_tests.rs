//! 细目表测试（REQ-220 / v0.13.6；AAA + 金数据枚举）。
//!
//! @ai-context: 覆盖——全 20 粗领域均带非空细目（表完备性）、细目 id 全局唯一
//!              （落库契约：DomainTag.fine 存 id）、跨粗领域错配拒绝、命中/标签
//!              兼容展示、hotwords 候选并集去重。

use super::*;
use crate::video_profile_domain::DomainKind;

#[test]
fn fine_table_covers_all_coarse_domains() {
    // Arrange/Act：20 粗领域全覆盖 + 总条目数 84
    let mut total = 0usize;
    for (k, list) in fine_table() {
        assert!(!list.is_empty(), "{:?} 细目表非空", k);
        total += list.len();
        // 每细目 id/label/seeds 契约完备
        for f in *list {
            assert!(!f.id.is_empty() && !f.label.is_empty(), "{:?} 细目字段非空", f.id);
            assert!(!f.seeds.is_empty(), "细目 {} 种子词非空", f.id);
        }
    }
    assert_eq!(total, 84, "细目总数为 84（规格 §四.2 金数据）");
}

#[test]
fn fine_ids_globally_unique_and_parse_checks_coarse() {
    // Arrange：全表 id 收集
    let mut ids: Vec<&str> = Vec::new();
    for (_, list) in fine_table() {
        for f in *list {
            ids.push(f.id);
        }
    }
    // Assert：全局唯一（Domaintag.fine 落库契约——跨粗领域不可歧义）
    let dup_count = ids.len() - ids.iter().collect::<std::collections::HashSet<_>>().len();
    assert_eq!(dup_count, 0, "细目 id 全局唯一");
    // Assert：合法解析 + 跨粗领域错配拒绝（"frontend" 属编程，不属经济）
    assert_eq!(parse_fine(DomainKind::Programming, "frontend").map(|f| f.id), Some("frontend"));
    assert_eq!(parse_fine(DomainKind::Economy, "frontend"), None);
    assert_eq!(parse_fine(DomainKind::Programming, "no-such-fine"), None);
}

#[test]
fn match_fine_hits_only_its_coarse() {
    // Arrange：编程术语文本（跨细目多命中——多选语义；避开经济细目"管理"等泛词）
    let texts = vec!["React Hooks 组件化开发".to_string(), "后端接口部署 Docker".to_string()];
    // Act/Assert：前端/后端同时命中（并集）；经济词表不命中
    let hits = match_fine(&texts, DomainKind::Programming);
    assert!(hits.contains(&"frontend") && hits.contains(&"devops"), "多细目命中并集: {:?}", hits);
    assert!(match_fine(&texts, DomainKind::Economy).is_empty(), "跨粗领域不得命中");
    // 通用词不命中（"学习/教程"不是细目种子）
    assert!(match_fine(&["学习教程".to_string()], DomainKind::Programming).is_empty());
}

#[test]
fn fine_hotword_candidates_union_dedup_and_skip_invalid() {
    // Arrange：前端 + 非法 id
    let cands = fine_hotword_candidates(
        DomainKind::Programming,
        &["frontend".into(), "frontend".into(), "no-such".into()],
    );
    // Assert：并集去重；非法 id 静默跳过（诚实降级）
    let uniq = cands.iter().collect::<std::collections::HashSet<_>>();
    assert_eq!(cands.len(), uniq.len(), "并集去重");
    assert!(cands.iter().any(|c| c == "React") && cands.iter().any(|c| c == "Vue"));
    assert!(!cands.iter().any(|c| c == "no-such"));
}

#[test]
fn no_single_char_cjk_fine_seeds() {
    // 审查 M4 守卫：细目种子同样禁止单字 CJK（"折"/"炒"/"刨"等无边界误命中）
    for (_, list) in fine_table() {
        for f in *list {
            for s in f.seeds {
                assert!(
                    s.chars().count() >= 2 || s.is_ascii(),
                    "细目 {} 单字 CJK 种子: {}（M4 审查）",
                    f.id,
                    s
                );
            }
        }
    }
}
