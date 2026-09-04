//! 检索建议·发现路径数据层（REQ-261，v0.19.3；设计 §八）。
//!
//! @ai-context: 读路径 B——概念「相关素材建议」：以概念名+essence 为查询做
//!              全库混合检索 top-K（≤10），**排除已链接 target**（该概念
//!              knowledge_links 已引用的 note/fragment 不重复建议）；跨体系
//!              相似概念为提示型（只展示"概念 X 与体系 Y 的 Z 高度相似"，
//!              不自动合并——合并命令不存在且语义归人，YAGNI）。
//! @ai-context: 铁律：建议不落库、零双写——确认后仅由命令层经既有
//!              link_knowledge_target 引用通道落库（target_type 白名单
//!              note/fragment 已有，零迁移）；feature flag kb_discovery
//!              （默认关）在命令层把关（后端不信前端隐藏）。本层只做只读
//!              编排 + 纯函数。

use std::collections::HashSet;

use rusqlite::OptionalExtension;
use serde::Serialize;

use crate::db::Db;
use crate::error::Result;
use crate::kb_search::KbHit;

/// 证据候选上限（设计 top-K ≤10）。
pub const DISCOVERY_LIMIT: usize = 10;
/// 相似概念提示上限（提示型——控制噪音）。
pub const SIMILAR_LIMIT: usize = 6;
/// 建议查询字符上界（essence 无落库上限——纵深防御，见 kb_discovery_suggest）。
const DISCOVERY_QUERY_MAX_CHARS: usize = 240;

/// 跨体系相似概念提示（展示型：人工处置，不自动合并）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarHint {
    pub system_id: i64,
    pub system_name: String,
    pub concept_id: i64,
    pub concept_name: String,
    /// 命中理由（overlap 口径——"名称互相包含"）
    pub reason: String,
}

/// 发现结果（前端概念详情区一次性拉取）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    /// 证据候选（KbHit 契约复用——snippet/来源字段与引用卡片一致）
    pub evidence: Vec<KbHit>,
    /// 相似概念提示（跨体系；无 → 空）
    pub similar: Vec<SimilarHint>,
}

impl Db {
    /// 概念发现建议（FTS-only 等价入口——仅测试保留；生产走 *_hybrid）。
    #[cfg(test)]
    pub fn kb_discovery_suggest(&self, concept_id: i64) -> Result<Option<DiscoveryResult>> {
        self.kb_discovery_suggest_hybrid(None, concept_id)
    }

    /// 概念发现建议（REQ-259：engine=Some 时证据候选走混合检索 RRF 合流——
    /// 引擎不可用由检索层自决降级；相似概念提示仍按名称/词法重叠规则）。
    ///
    /// @ai-context: 检索只读派生索引 kb_*；排除集 = 该概念在 knowledge_links
    ///              已引用的 note/fragment target（引用通道唯一入口且概念链
    ///              只落在自身体系内，无需 system 维度二次过滤）。
    pub fn kb_discovery_suggest_hybrid(
        &self,
        engine: Option<&dyn crate::kb_embed::EmbeddingEngine>,
        concept_id: i64,
    ) -> Result<Option<DiscoveryResult>> {
        // ① 概念取回（查询面 name/essence + 排除集归属体系）
        let concept = self.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT system_id, name, essence FROM knowledge_concepts WHERE id=?1",
                    [concept_id],
                    |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, Option<String>>(2)?,
                        ))
                    },
                )
                .optional()?)
        })?;
        let Some((system_id, name, essence)) = concept else {
            return Ok(None);
        };
        // ② 排除集：本概念已链接的 note/fragment（target_type,target_id）
        let links = self.list_knowledge_links(system_id, None, Some(concept_id), None)?;
        let excluded: HashSet<(String, i64)> = links
            .into_iter()
            .filter(|l| l.target_type == "note" || l.target_type == "fragment")
            .map(|l| (l.target_type, l.target_id))
            .collect();
        // ③ 证据候选：name + essence 混合检索 → 排除已链接 → 截顶
        //    （v0.19.3 审查即修：essence 落库无长度上限——查询字符截断 240，
        //    防跨 token 无上限的 FTS 表达式膨胀；kb_fts 96 硬顶只约束 CJK 段）
        let mut query = name.clone();
        if let Some(e) = essence.as_deref().map(str::trim).filter(|e| !e.is_empty()) {
            query.push(' ');
            query.push_str(e);
        }
        if query.chars().count() > DISCOVERY_QUERY_MAX_CHARS {
            query = query.chars().take(DISCOVERY_QUERY_MAX_CHARS).collect();
        }
        let hits = self.kb_search_hybrid(engine, &query, DISCOVERY_LIMIT)?;
        let evidence: Vec<KbHit> = hits
            .into_iter()
            .filter(|h| {
                let id = match h.source_kind.as_str() {
                    "note" => h.note_id,
                    "fragment" => h.fragment_id,
                    _ => None,
                };
                !id.is_some_and(|tid| excluded.contains(&(h.source_kind.clone(), tid)))
            })
            .take(DISCOVERY_LIMIT)
            .collect();
        // ④ 相似概念提示：全库概念（跨体系）与本品归一化名重叠 → 提示型
        let similar = self.similar_concepts_of(system_id, concept_id, &name)?;
        Ok(Some(DiscoveryResult { evidence, similar }))
    }

    /// 跨体系相似概念（排除自身体系与自身；按重叠口径 ≤ SIMILAR_LIMIT）。
    ///
    /// @ai-context: 提示型仅供人眼判读（不落库不建链）——口径宽松（归一化
    ///              后互相包含），宁可多示一人裁，不静默漏检交叉点。
    fn similar_concepts_of(
        &self,
        system_id: i64,
        concept_id: i64,
        name: &str,
    ) -> Result<Vec<SimilarHint>> {
        let concepts = self.list_knowledge_concepts(None, None)?;
        if concepts.is_empty() {
            return Ok(Vec::new());
        }
        let systems = self.list_knowledge_systems()?;
        let name_map: std::collections::HashMap<i64, String> = systems
            .into_iter()
            .map(|s| (s.id, s.name.clone()))
            .collect();
        let norm = normalize_name(name);
        if norm.is_empty() {
            return Ok(Vec::new());
        }
        let mut hints: Vec<SimilarHint> = concepts
            .into_iter()
            .filter(|c| c.id != concept_id && c.system_id != system_id)
            // archived（归档）概念不参与提示（展示噪声；v0.19.3 审查即修）
            .filter(|c| c.status != "archived")
            .filter(|c| concept_name_overlap(&norm, &normalize_name(&c.name)))
            .map(|c| SimilarHint {
                system_id: c.system_id,
                system_name: name_map
                    .get(&c.system_id)
                    .cloned()
                    .unwrap_or_else(|| format!("体系 #{}", c.system_id)),
                concept_id: c.id,
                concept_name: c.name,
                reason: "名称高度相似（互相包含）".to_string(),
            })
            .collect();
        // 提示型防噪：按体系/id 序稳定取前 N（无相关度排序——二进制判据，
        // 先到先得即防噪音上限；不自动合并，人工处置）
        hints.sort_by(|a, b| a.system_id.cmp(&b.system_id).then(a.concept_id.cmp(&b.concept_id)));
        hints.truncate(SIMILAR_LIMIT);
        Ok(hints)
    }
}

/// 名称归一化（相似判定的公共口径）：空白/全角/大小写折叠。
///
/// @ai-context: 判定"高相似"用**双向包含**而非相等——"晕染手法"与
///              "眼影晕染手法"互为包含即提示；单字名不参与（噪音）。
pub fn normalize_name(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            _ => c,
        })
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// 双向包含重叠（短边 ≥2 字才参与——防单字误报；归一化后输入）。
pub fn concept_name_overlap(a: &str, b: &str) -> bool {
    let (short, long) = if a.chars().count() <= b.chars().count() { (a, b) } else { (b, a) };
    short.chars().count() >= 2 && long.contains(short)
}

#[cfg(test)]
#[path = "kb_discovery_tests.rs"]
mod tests;
