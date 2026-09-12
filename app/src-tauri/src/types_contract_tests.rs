//! @ai-context: types 域（原 types.rs，批 0-C3 Task 2 拆为 6 个子模块 + 门面）的 **serde 线格式契约快照**。
//! @ai-context: 断言每个类型的 JSON 键名、**键序**（= 字段声明序）、rename / rename_all、skip_serializing_if
//!              与 default 反序列化行为——这是拆分后唯一「改坏了也没人报错」的面（前端按线格式消费）。
//! @ai-context: 纯断言，无副作用、无 IO、不连库；期望值由搬运后的等价实现冻结，搬运本身的等价性由逐字节探针证明。
//! @ai-context: 若本文件变红，先问「字段/属性是不是被顺手重排或统一了」，**不要**改期望值迁就实现。

use super::*;

/** 断言某值的线格式（键名 + 键序 + 省略规则）逐字不变。 */
macro_rules! assert_wire {
    ($name:literal, $v:expr, $expected:literal) => {
        assert_eq!(serde_json::to_string(&$v).unwrap(), $expected, "{} 线格式漂移", $name);
    };
}

#[test]
fn contract_keys_and_order() {
    assert_wire!("TranscriptSegment", TranscriptSegment { start_ms: 1, end_ms: 2, text: "t".into(), word_timestamps: Some(vec![WordTimestamp { word: "w".into(), start_ms: 3 }]), confidence: Some(0.5), volume: Some(0.5) }, r#"{"start_ms":1,"end_ms":2,"text":"t","word_timestamps":[{"word":"w","start_ms":3}],"confidence":0.5,"volume":0.5}"#);
    assert_wire!("WordTimestamp", WordTimestamp { word: "w".into(), start_ms: 1 }, r#"{"word":"w","start_ms":1}"#);
    assert_wire!("TextBox", TextBox { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, r#"{"x":0.5,"y":0.5,"w":0.5,"h":0.5}"#);
    assert_wire!("OcrBlock", OcrBlock { timestamp_ms: Some(1), text: "t".into(), score: 0.5, bbox: Some(TextBox { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }), region_kind: Some("text".into()) }, r#"{"timestamp_ms":1,"text":"t","score":0.5,"bbox":{"x":0.5,"y":0.5,"w":0.5,"h":0.5},"region_kind":"text"}"#);
    assert_wire!("NoteDraft", NoteDraft { title: "t".into(), transcript_paragraphs: vec!["a".into()], ocr_points: vec!["b".into()], markdown: "m".into() }, r#"{"title":"t","transcript_paragraphs":["a"],"ocr_points":["b"],"markdown":"m"}"#);
    assert_wire!("Note", note(1), r#"{"id":1,"title":"t","content":"c","source":"manual","session_id":1,"rule_version":"r","purify_stats":"p","tags":"[]","properties":"{}","pin":1,"group_id":2,"created_at":3,"updated_at":4}"#);
    assert_wire!("NewNote", NewNote { title: "t".into(), content: "c".into(), source: "manual".into(), session_id: Some(1), rule_version: Some("r".into()), purify_stats: Some("p".into()), tags: Some("[]".into()), properties: Some("{}".into()), group_id: Some(2) }, r#"{"title":"t","content":"c","source":"manual","session_id":1,"rule_version":"r","purify_stats":"p","tags":"[]","properties":"{}","group_id":2}"#);
    assert_wire!("NoteGroup", NoteGroup { id: 1, name: "g".into(), terrain: "container".into(), kind: "topic".into(), domain_tag: Some("d".into()), source: "route".into(), series_key: Some("k".into()), route_reason: Some("r".into()), route_overridden: 1, note_count: 2, color: Some("blue".into()), pin: 1, created_at: 3, updated_at: 4 }, r#"{"id":1,"name":"g","terrain":"container","kind":"topic","domainTag":"d","source":"route","seriesKey":"k","routeReason":"r","routeOverridden":1,"noteCount":2,"color":"blue","pin":1,"createdAt":3,"updatedAt":4}"#);
    assert_wire!("NewNoteGroup", NewNoteGroup { name: "g".into(), terrain: "feed".into(), kind: "topic".into(), domain_tag: Some("d".into()), source: "manual".into(), series_key: Some("k".into()), route_reason: Some("r".into()) }, r#"{"name":"g","terrain":"feed","kind":"topic","domainTag":"d","source":"manual","seriesKey":"k","routeReason":"r"}"#);
    assert_wire!("GroupDeleteImpact", GroupDeleteImpact { notes: 1, fragments: 2, cards: 3, settlements: 4, contracts: 5, system_refs: 6 }, r#"{"notes":1,"fragments":2,"cards":3,"settlements":4,"contracts":5,"systemRefs":6}"#);
    assert_wire!("DeleteNoteResult", DeleteNoteResult { deleted: true, auto_cleaned_groups: vec!["g".into()] }, r#"{"deleted":true,"autoCleanedGroups":["g"]}"#);
    assert_wire!("MoveNoteResult", MoveNoteResult { moved: true, auto_cleaned_groups: vec!["g".into()] }, r#"{"moved":true,"autoCleanedGroups":["g"]}"#);
    assert_wire!("DeleteFragmentResult", DeleteFragmentResult { deleted: true, auto_cleaned_groups: vec!["g".into()] }, r#"{"deleted":true,"autoCleanedGroups":["g"]}"#);
    assert_wire!("MoveFragmentResult", MoveFragmentResult { moved: true, auto_cleaned_groups: vec!["g".into()] }, r#"{"moved":true,"autoCleanedGroups":["g"]}"#);
    assert_wire!("PromoteNoteResult", PromoteNoteResult { note: note(1), auto_cleaned_groups: vec!["g".into()] }, r#"{"note":{"id":1,"title":"t","content":"c","source":"manual","session_id":1,"rule_version":"r","purify_stats":"p","tags":"[]","properties":"{}","pin":1,"group_id":2,"created_at":3,"updated_at":4},"autoCleanedGroups":["g"]}"#);
    assert_wire!("Fragment", Fragment { id: 1, text: "t".into(), image_path: Some("p".into()), domain_tag: Some("d".into()), group_id: Some(2), source: "manual".into(), status: "active".into(), created_at: 3 }, r#"{"id":1,"text":"t","imagePath":"p","domainTag":"d","groupId":2,"source":"manual","status":"active","createdAt":3}"#);
    assert_wire!("Flashcard", Flashcard { id: 1, group_id: 2, note_id: Some(3), fragment_id: Some(4), front: "f".into(), back: "b".into(), kind: "fact".into(), state_json: "{}".into(), due_at: 5, created_at: 6, interval_days: 1.5 }, r#"{"id":1,"groupId":2,"noteId":3,"fragmentId":4,"front":"f","back":"b","kind":"fact","stateJson":"{}","dueAt":5,"createdAt":6,"intervalDays":1.5}"#);
    assert_wire!("WeekContract", WeekContract { id: 1, group_id: 2, week_start: 3, target_days: 4, target_cards: 5, created_at: 6 }, r#"{"id":1,"groupId":2,"weekStart":3,"targetDays":4,"targetCards":5,"createdAt":6}"#);
    assert_wire!("NoteSortMode", NoteSortMode::UpdatedDesc, r#""updated-desc""#);
    assert_wire!("Session", Session { id: 1, title: "t".into(), source_window: Some("w".into()), started_at: 2, ended_at: Some(3), status: "finished".into(), profile: Some("p".into()), kind: Some("photo".into()) }, r#"{"id":1,"title":"t","source_window":"w","started_at":2,"ended_at":3,"status":"finished","profile":"p","kind":"photo"}"#);
    assert_wire!("NewSession", NewSession { title: "t".into(), source_window: Some("w".into()), profile: Some("p".into()), kind: Some("photo".into()) }, r#"{"title":"t","source_window":"w","profile":"p","kind":"photo"}"#);
    assert_wire!("SessionSegment", SessionSegment { id: 1, session_id: 2, start_ms: 3, end_ms: 4, text: "t".into(), source: "asr".into(), confidence: Some(0.5), volume: Some(0.5), speech_rate: Some(0.5), pause_ms: Some(5), speaker: Some("s".into()) }, r#"{"id":1,"session_id":2,"start_ms":3,"end_ms":4,"text":"t","source":"asr","confidence":0.5,"volume":0.5,"speech_rate":0.5,"pause_ms":5,"speaker":"s"}"#);
    assert_wire!("NewSessionSegment", NewSessionSegment { session_id: 1, start_ms: 2, end_ms: 3, text: "t".into(), source: "asr".into(), confidence: Some(0.5), volume: Some(0.5), speech_rate: Some(0.5), pause_ms: Some(4), speaker: Some("s".into()) }, r#"{"session_id":1,"start_ms":2,"end_ms":3,"text":"t","source":"asr","confidence":0.5,"volume":0.5,"speech_rate":0.5,"pause_ms":4,"speaker":"s"}"#);
    assert_wire!("SessionDetail", SessionDetail { session: session(1), segments: vec![], ocr_blocks: vec![], events: vec![], screens: vec![] }, r#"{"session":{"id":1,"title":"t","source_window":"w","started_at":1,"ended_at":null,"status":"finished","profile":null,"kind":null},"segments":[],"ocr_blocks":[],"events":[],"screens":[]}"#);
    assert_wire!("SessionListItem", SessionListItem { session: session(1), has_note: true, note_id: Some(2), note_title: Some("t".into()), has_content: true, display_no: 3 }, r#"{"session":{"id":1,"title":"t","source_window":"w","started_at":1,"ended_at":null,"status":"finished","profile":null,"kind":null},"hasNote":true,"noteId":2,"noteTitle":"t","hasContent":true,"displayNo":3}"#);
    assert_wire!("ConvertedNote", ConvertedNote { session_id: 1, note_id: 2 }, r#"{"sessionId":1,"noteId":2}"#);
    assert_wire!("SkippedNote", SkippedNote { session_id: 1, reason: "r".into() }, r#"{"sessionId":1,"reason":"r"}"#);
    assert_wire!("BatchNoteResult", BatchNoteResult { converted: vec![ConvertedNote { session_id: 1, note_id: 2 }], skipped: vec![SkippedNote { session_id: 3, reason: "r".into() }] }, r#"{"converted":[{"sessionId":1,"noteId":2}],"skipped":[{"sessionId":3,"reason":"r"}]}"#);
    assert_wire!("BatchSessionDeleteResult", BatchSessionDeleteResult { deleted: 2 }, r#"{"deleted":2}"#);
    assert_wire!("SessionOcrBlock", SessionOcrBlock { id: 1, session_id: 2, timestamp_ms: 3, text: "t".into(), score: 0.5, region: "full".into(), region_kind: Some("code".into()), bbox: Some(TextBox { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }), screen_id: Some(4) }, r#"{"id":1,"session_id":2,"timestamp_ms":3,"text":"t","score":0.5,"region":"full","region_kind":"code","bbox":{"x":0.5,"y":0.5,"w":0.5,"h":0.5},"screen_id":4}"#);
    assert_wire!("NewSessionOcrBlock", NewSessionOcrBlock { session_id: 1, timestamp_ms: 2, text: "t".into(), score: 0.5, region: "subtitle".into(), region_kind: Some("text".into()), bbox: Some(TextBox { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }), screen_id: Some(3) }, r#"{"session_id":1,"timestamp_ms":2,"text":"t","score":0.5,"region":"subtitle","region_kind":"text","bbox":{"x":0.5,"y":0.5,"w":0.5,"h":0.5},"screen_id":3}"#);
    assert_wire!("ScreenStructure", ScreenStructure { kind: "table".into(), text: "t".into(), rendered: Some("r".into()) }, r#"{"kind":"table","text":"t","rendered":"r"}"#);
    assert_wire!("SessionScreen", SessionScreen { session_id: 1, screen_id: Some(2), first_seen_ms: 3, last_seen_ms: 4, title: Some("t".into()), body: vec!["b".into()], labels: vec!["l".into()], image_ref: Some("i".into()), structure: vec![ScreenStructure { kind: "code".into(), text: "t".into(), rendered: None }] }, r#"{"session_id":1,"screen_id":2,"first_seen_ms":3,"last_seen_ms":4,"title":"t","body":["b"],"labels":["l"],"image_ref":"i","structure":[{"kind":"code","text":"t","rendered":null}]}"#);
    assert_wire!("KnowledgeSystem", KnowledgeSystem { id: 1, parent_system_id: Some(2), name: "n".into(), kind: "global".into(), core_question: Some("q".into()), status: "active".into(), node_count: 3, concept_count: 4, model_count: 5, created_at: 6, updated_at: 7 }, r#"{"id":1,"parentSystemId":2,"name":"n","kind":"global","coreQuestion":"q","status":"active","nodeCount":3,"conceptCount":4,"modelCount":5,"createdAt":6,"updatedAt":7}"#);
    assert_wire!("NewKnowledgeSystem", NewKnowledgeSystem { name: "n".into(), kind: "domain".into(), parent_system_id: Some(1), core_question: Some("q".into()) }, r#"{"name":"n","kind":"domain","parentSystemId":1,"coreQuestion":"q"}"#);
    assert_wire!("KnowledgeNode", KnowledgeNode { id: 1, system_id: 2, parent_id: Some(3), r#type: "question".into(), text: "t".into(), order_idx: 4, status: "active".into(), created_at: 5, canvas_x: Some(0.5), canvas_y: Some(0.5) }, r#"{"id":1,"systemId":2,"parentId":3,"type":"question","text":"t","orderIdx":4,"status":"active","createdAt":5,"canvasX":0.5,"canvasY":0.5}"#);
    assert_wire!("NewKnowledgeNode", NewKnowledgeNode { system_id: 1, parent_id: Some(2), r#type: "scenario".into(), text: "t".into(), order_idx: 3 }, r#"{"systemId":1,"parentId":2,"type":"scenario","text":"t","orderIdx":3}"#);
    assert_wire!("KnowledgeConcept", KnowledgeConcept { id: 1, system_id: 2, name: "n".into(), essence: Some("e".into()), boundary: Some("b".into()), relation: Some("r".into()), status: "core".into(), last_applied_at: Some(3), created_at: 4, updated_at: 5 }, r#"{"id":1,"systemId":2,"name":"n","essence":"e","boundary":"b","relation":"r","status":"core","lastAppliedAt":3,"createdAt":4,"updatedAt":5}"#);
    assert_wire!("NewKnowledgeConcept", NewKnowledgeConcept { system_id: 1, name: "n".into(), essence: Some("e".into()), boundary: Some("b".into()), relation: Some("r".into()) }, r#"{"systemId":1,"name":"n","essence":"e","boundary":"b","relation":"r"}"#);
    assert_wire!("KnowledgeModel", KnowledgeModel { id: 1, system_id: 2, name: "n".into(), disciplines: "[]".into(), claim: Some("c".into()), valid_when: Some("v".into()), invalid_when: Some("i".into()), cross_checks: Some("x".into()), status: "active".into(), created_at: 3, updated_at: 4 }, r#"{"id":1,"systemId":2,"name":"n","disciplines":"[]","claim":"c","validWhen":"v","invalidWhen":"i","crossChecks":"x","status":"active","createdAt":3,"updatedAt":4}"#);
    assert_wire!("NewKnowledgeModel", NewKnowledgeModel { system_id: 1, name: "n".into(), disciplines: "[]".into(), claim: Some("c".into()), valid_when: Some("v".into()), invalid_when: Some("i".into()), cross_checks: Some("x".into()) }, r#"{"systemId":1,"name":"n","disciplines":"[]","claim":"c","validWhen":"v","invalidWhen":"i","crossChecks":"x"}"#);
    assert_wire!("KnowledgeLink", KnowledgeLink { id: 1, system_id: 2, node_id: Some(3), concept_id: Some(4), model_id: Some(5), target_type: "note".into(), target_id: 6, created_at: 7 }, r#"{"id":1,"systemId":2,"nodeId":3,"conceptId":4,"modelId":5,"targetType":"note","targetId":6,"createdAt":7}"#);
    assert_wire!("GraphNode", GraphNode { id: "note:1".into(), kind: "note".into(), label: "l".into(), color: Some("blue".into()), entity_id: 1, system_id: Some(2) }, r#"{"id":"note:1","kind":"note","label":"l","color":"blue","entityId":1,"systemId":2}"#);
    assert_wire!("GraphEdge", GraphEdge { id: "e1".into(), source: "a".into(), target: "b".into(), edge_type: "link".into() }, r#"{"id":"e1","source":"a","target":"b","type":"link"}"#);
    assert_wire!("GraphSnapshot", GraphSnapshot { nodes: vec![GraphNode { id: "note:1".into(), kind: "note".into(), label: "l".into(), color: None, entity_id: 1, system_id: None }], edges: vec![GraphEdge { id: "e1".into(), source: "a".into(), target: "b".into(), edge_type: "belong".into() }] }, r#"{"nodes":[{"id":"note:1","kind":"note","label":"l","color":null,"entityId":1}],"edges":[{"id":"e1","source":"a","target":"b","type":"belong"}]}"#);
    assert_wire!("NewKnowledgeLink", NewKnowledgeLink { system_id: 1, node_id: Some(2), concept_id: None, model_id: None, target_type: "group".into(), target_id: 3 }, r#"{"systemId":1,"nodeId":2,"conceptId":null,"modelId":null,"targetType":"group","targetId":3}"#);
    assert_wire!("KnowledgeAudit", KnowledgeAudit { id: 1, system_id: 2, items_json: "[]".into(), stats_json: "{}".into(), created_at: 3 }, r#"{"id":1,"systemId":2,"itemsJson":"[]","statsJson":"{}","createdAt":3}"#);
    assert_wire!("KnowledgeDecision", KnowledgeDecision { id: 1, kind: "decision".into(), system_id: Some(2), question_id: Some(3), used_refs: "{}".into(), content: "c".into(), expectation: Some("e".into()), actual: Some("a".into()), reflection: Some("r".into()), decided_at: 4, created_at: 5 }, r#"{"id":1,"kind":"decision","systemId":2,"questionId":3,"usedRefs":"{}","content":"c","expectation":"e","actual":"a","reflection":"r","decidedAt":4,"createdAt":5}"#);
    assert_wire!("NewKnowledgeDecision", NewKnowledgeDecision { kind: "application".into(), system_id: Some(1), question_id: None, used_refs: "{}".into(), content: "c".into(), expectation: Some("e".into()), actual: None, reflection: None }, r#"{"kind":"application","systemId":1,"questionId":null,"usedRefs":"{}","content":"c","expectation":"e","actual":null,"reflection":null}"#);
    assert_wire!("UsedRefs", UsedRefs { node_ids: vec![1], concept_ids: vec![2], model_ids: vec![3], group_id: Some(4), card_id: Some(5), note_id: Some(6), fragment_id: Some(7) }, r#"{"nodeIds":[1],"conceptIds":[2],"modelIds":[3],"groupId":4,"cardId":5,"noteId":6,"fragmentId":7}"#);
    assert_wire!("CanvasNodePosition", CanvasNodePosition { node_id: 1, x: 0.5, y: 0.5 }, r#"{"nodeId":1,"x":0.5,"y":0.5}"#);
    assert_wire!("CanvasViewport", CanvasViewport { viewport_x: 0.5, viewport_y: 0.5, zoom: 0.5 }, r#"{"viewportX":0.5,"viewportY":0.5,"zoom":0.5}"#);
    assert_wire!("CanvasPrefs", CanvasPrefs { edge_style: "smoothstep".into(), edge_arrows: true, layout_algorithm: "radial".into() }, r#"{"edgeStyle":"smoothstep","edgeArrows":true,"layoutAlgorithm":"radial"}"#);
}

#[test]
fn contract_defaults_and_renames() {
    // default = "default_tags"：缺 tags 键时回落 "[]"（default_tags 必须与 Note 同模块）。
    let n: Note = serde_json::from_str(r#"{"id":1,"title":"t","content":"c","source":"manual","created_at":1,"updated_at":2}"#).unwrap();
    assert_eq!(n.tags, "[]");
    assert_eq!(n.pin, 0);
    assert!(n.session_id.is_none() && n.properties.is_none() && n.group_id.is_none());
    // rename = "type" ×3：线上只有 `type`，没有 `r#type`；canvas_* 的 default 缺键回落 None。
    let k: KnowledgeNode = serde_json::from_str(r#"{"id":1,"systemId":2,"type":"question","text":"t","orderIdx":0,"status":"active","createdAt":3}"#).unwrap();
    assert_eq!(k.r#type, "question");
    assert!(k.canvas_x.is_none() && k.canvas_y.is_none());
    let e: GraphEdge = serde_json::from_str(r#"{"id":"e","source":"a","target":"b","type":"trace"}"#).unwrap();
    assert_eq!(e.edge_type, "trace");
    // skip_serializing_if：None 时 `systemId` 整个键消失（丢了会让 null 重新出现）。
    let g = GraphNode { id: "note:1".into(), kind: "note".into(), label: "l".into(), color: None, entity_id: 1, system_id: None };
    assert!(!serde_json::to_string(&g).unwrap().contains("systemId"));
    // kebab-case 枚举：前端排序参数逐字。
    assert_eq!(serde_json::from_str::<NoteSortMode>(r#""pin-first""#).unwrap(), NoteSortMode::PinFirst);
    assert_eq!(serde_json::to_string(&NoteSortMode::CreatedDesc).unwrap(), r#""created-desc""#);
    // 刻意没有 rename_all 的类型：线上仍是 snake_case（SessionScreen 与邻居 SessionListItem 的不对称是有意的）。
    let sc: SessionScreen = serde_json::from_str(r#"{"session_id":1,"first_seen_ms":2,"last_seen_ms":3}"#).unwrap();
    assert_eq!(sc.first_seen_ms, 2);
    assert!(serde_json::to_string(&sc).unwrap().contains(r#""first_seen_ms""#));
}

/// 测试夹具：既有 Note 的最小完整构造（PromoteNoteResult 内嵌）。
fn note(id: i64) -> Note {
    Note {
        id,
        title: "t".into(),
        content: "c".into(),
        source: "manual".into(),
        session_id: Some(1),
        rule_version: Some("r".into()),
        purify_stats: Some("p".into()),
        tags: "[]".into(),
        properties: Some("{}".into()),
        pin: 1,
        group_id: Some(2),
        created_at: 3,
        updated_at: 4,
    }
}

/// 测试夹具：既有 Session 的最小完整构造（SessionDetail / SessionListItem 内嵌）。
fn session(id: i64) -> Session {
    Session {
        id,
        title: "t".into(),
        source_window: Some("w".into()),
        started_at: 1,
        ended_at: None,
        status: "finished".into(),
        profile: None,
        kind: None,
    }
}
