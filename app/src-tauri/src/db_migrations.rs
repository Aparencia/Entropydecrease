//! SQLite schema 建表与列迁移（H3 拆分自 db.rs）。
//!
//! @ai-context: db.rs 超 600 行硬拆——建表 SQL + ensure_column 列迁移内聚于本模块；
//!              db.rs 只保留 Db 结构体定义、连接/锁管理与核心通用方法。
//! @ai-context: init_schema 幂等——新库建表、旧库补列/补索引，重复启动安全。
//!              公共 API 签名不变（Db::open 行为与拆分前完全一致）。

use rusqlite::Connection;

use crate::error::Result;

/// 初始化全部核心 schema（建表 + 索引 + 旧库列迁移 + 子模块表）。
///
/// @ai-context: CREATE TABLE IF NOT EXISTS 只对新库生效；既有数据库缺列时靠
///              ensure_column ALTER 补齐（每列迁移的 Why 见调用处注释）。
pub(crate) fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            -- REQ-277（v0.19.4）：对外不可变 uid（日期前缀+短哈希；旧库 ensure_column 补）
            uid TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        -- 会话主表（ADR-004：每次学习 = 一个会话）
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source_window TEXT,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            status TEXT NOT NULL DEFAULT 'recording',
            -- v0.5.0 M1（REQ-043）：视频类型档案标识（kebab-case；NULL=默认档案）
            profile TEXT,
            -- v0.11.7（图文会话，ADR-020）：会话类型（NULL=实时/视频导入等视频类；'photo'=图文截屏会话）
            kind TEXT,
            -- REQ-277（v0.19.4）：对外不可变 uid（旧库 ensure_column 补）
            uid TEXT
        );
        -- 会话转写段（ASR final / 字幕 / 融合统一落库）
        CREATE TABLE IF NOT EXISTS session_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'asr',
            confidence REAL
        );
        CREATE INDEX IF NOT EXISTS idx_segments_session ON session_segments(session_id, start_ms);
        -- 会话 OCR 块（字幕区 / 全帧）
        CREATE TABLE IF NOT EXISTS session_ocr_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            timestamp_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            score REAL NOT NULL,
            region TEXT NOT NULL DEFAULT 'full',
            -- v0.5.0 M4（REQ-048）：来源版面区域类型（kebab-case；NULL=整帧直跑）
            region_kind TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ocr_blocks_session ON session_ocr_blocks(session_id, timestamp_ms);
        -- v0.5.0 M7（REQ-052）：会话产物块（会话 1:1 产物，块有序；payload JSON）
        CREATE TABLE IF NOT EXISTS artifact_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            refs_json TEXT NOT NULL DEFAULT '{}',
            payload_json TEXT NOT NULL,
            block_order INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT 'local'
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_session ON artifact_blocks(session_id, block_order);
        -- v0.7.0 M1.5（REQ-108）：会话信号事件表（统一落库——章节检测/实践段标记/周报备数据；
        -- 设计见 docs/archive/2026-08-19/2026-08-19-session-events-table-design.md）
        CREATE TABLE IF NOT EXISTS session_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, timestamp_ms);
        CREATE INDEX IF NOT EXISTS idx_events_kind ON session_events(session_id, kind);
        -- v0.11.0（REQ-195，v4 §7.4 融合点基建）：笔记组——统一产物层唯一容器；
        -- terrain 为管线分叉前提（container/feed），kind 三种形成方式（课程/主题/独立）
        CREATE TABLE IF NOT EXISTS note_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            terrain TEXT NOT NULL DEFAULT 'container',
            kind TEXT NOT NULL DEFAULT 'standalone',
            domain_tag TEXT,
            source TEXT NOT NULL DEFAULT 'route',
            series_key TEXT,
            route_reason TEXT,
            route_overridden INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        -- 课程组幂等键（同一系列名唯一；部分索引仅约束非 NULL）
        CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_series
            ON note_groups(series_key) WHERE series_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_groups_domain ON note_groups(domain_tag);
        -- v0.11.1（feed 进料口；v4 契约：碎片不是笔记，独立原料层身份诚实）
        -- status 列预埋（v0.11.3 组结算归档用；active/archived）
        CREATE TABLE IF NOT EXISTS fragments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            image_path TEXT,
            domain_tag TEXT,
            group_id INTEGER REFERENCES note_groups(id) ON DELETE SET NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_fragments_group ON fragments(group_id);
        -- v0.11.2（学习循环统一；闪卡绑定粒度从一开始就是「组」，v4 契约二）
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
            note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            fragment_id INTEGER REFERENCES fragments(id) ON DELETE SET NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'fact',
            state_json TEXT NOT NULL,
            due_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cards_due ON flashcards(due_at);
        CREATE INDEX IF NOT EXISTS idx_cards_group ON flashcards(group_id);
        -- 复习日志（弹性承诺：无 streak 字段——不追债不清零，N10 防御）
        CREATE TABLE IF NOT EXISTS review_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
            rating TEXT NOT NULL,
            reviewed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_logs_card ON review_logs(card_id);
        -- 指标事件（北极星与过程指标从第一天记——Phase 4 门控判据）
        CREATE TABLE IF NOT EXISTS metrics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_kind ON metrics_events(kind);
        -- v0.11.3（组结算机制；防沼泽仪式记录——结算历史可追溯）
        CREATE TABLE IF NOT EXISTS settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
            stats_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id, created_at);
        -- v0.11.4（REQ-200，弹性承诺呈现层）：周契约——用户自设本周目标
        -- （target_days/target_cards），非打卡 KPI；(group_id, week_start) 唯一
        -- 保证每周每组一份契约，upsert 幂等覆盖本周（无 streak 无惩罚）
CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES note_groups(id) ON DELETE CASCADE,
            week_start INTEGER NOT NULL,     -- 周一零点（UTC Unix 秒）
            target_days INTEGER NOT NULL,    -- 本周承诺复习天数（1..7）
            target_cards INTEGER NOT NULL,   -- 本周承诺复习卡数（有界）
            created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_group_week
            ON contracts(group_id, week_start);
        -- v0.13.1（REQ-202）：知识体系主表（体系只引用、不收纳——引用走 knowledge_links）
        -- global/domain 两 kind；global 唯一索引兜底防多核心稀释（command 层白名单校验 kind）
        CREATE TABLE IF NOT EXISTS knowledge_systems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_system_id INTEGER REFERENCES knowledge_systems(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'domain',        -- global/domain（command 层白名单校验）
            core_question TEXT,                          -- global 必填（command 层校验非空）
            status TEXT NOT NULL DEFAULT 'active',       -- active/watching/archived
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_systems_global
            ON knowledge_systems(kind) WHERE kind = 'global';   -- 全局体系唯一（防多核心稀释）
        -- v0.13.1（REQ-202）：问题树节点（type=question/scenario/domain_entry；
        -- parent 自引用 ON DELETE CASCADE 级联清子树——删节点连子树一并清）
        CREATE TABLE IF NOT EXISTS knowledge_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            type TEXT NOT NULL DEFAULT 'question',       -- question/scenario/domain_entry
            text TEXT NOT NULL,
            order_idx INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',       -- active/watching/archived
            created_at INTEGER NOT NULL,
            -- v0.13.8（画布）：节点画布位置（NULL=未布局——首次打开画布触发辐射布局批量初始化；
            -- 位置按 React Flow 左上角坐标存储，零破坏——NULL 不影响树视图与既有命令）
            canvas_x REAL,
            canvas_y REAL
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_tree ON knowledge_nodes(system_id, parent_id);
        -- v0.13.1（REQ-202）：概念表（name 全局 UNIQUE——交叉点判定前提；
        -- 三问 essence/boundary/relation；last_applied_at 留 v0.13.3 应用记录）
        CREATE TABLE IF NOT EXISTS knowledge_concepts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
            name TEXT NOT NULL UNIQUE,                   -- 全局唯一：交叉点判定的前提
            essence TEXT, boundary TEXT, relation TEXT,  -- 三问：本质/边界/联系
            status TEXT NOT NULL DEFAULT 'core',         -- core/watching/archived
            last_applied_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        -- v0.13.1（REQ-202）：知识模型（disciplines JSON 数组≥1学科；cross_checks 预埋可空）
        CREATE TABLE IF NOT EXISTS knowledge_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            disciplines TEXT NOT NULL,                   -- JSON 数组（≥1 学科，command 层校验）
            claim TEXT, valid_when TEXT, invalid_when TEXT,
            cross_checks TEXT,                           -- JSON（v0.13.1 预埋字段，可空）
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_models_system ON knowledge_models(system_id);
        -- v0.13.1（REQ-202）：唯一引用通道（体系只引用不收纳——node/concept/model 三向
        -- 可空；target SET NULL 保引用键；target_type 白名单）
        CREATE TABLE IF NOT EXISTS knowledge_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
            node_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
            concept_id INTEGER REFERENCES knowledge_concepts(id) ON DELETE SET NULL,
            model_id INTEGER REFERENCES knowledge_models(id) ON DELETE SET NULL,
            target_type TEXT NOT NULL,                   -- note_group/note/flashcard/fragment
            target_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_links_system ON knowledge_links(system_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON knowledge_links(target_type, target_id);
        -- v0.13.1（REQ-202）：审计记录（items_json/stats_json 自 v0.13.4 使用；
        -- v0.13.1 仅留表——审计探测 read 路径备好）
        CREATE TABLE IF NOT EXISTS knowledge_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL REFERENCES knowledge_systems(id) ON DELETE CASCADE,
            items_json TEXT NOT NULL,                    -- v0.13.4 起使用；v0.13.1 仅留表
            stats_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        );
        -- v0.13.3（REQ-208）：决策与应用（一表两面；四行法字段——decision=思辨面/application=学习面；
        -- used_refs 引用必填，command 层拒绝空；最小红环只记我的决策，禁止产物层自动升格）
        CREATE TABLE IF NOT EXISTS knowledge_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL DEFAULT 'decision',       -- decision/application
            system_id INTEGER REFERENCES knowledge_systems(id) ON DELETE SET NULL,
            question_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
            used_refs TEXT NOT NULL DEFAULT '{}',        -- JSON（结构见 types::UsedRefs；引用必填，command 层拒绝空）
            content TEXT NOT NULL,                       -- 决策内容/应用动作
            expectation TEXT, actual TEXT, reflection TEXT,
            decided_at INTEGER NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_decisions_system ON knowledge_decisions(system_id);
        CREATE INDEX IF NOT EXISTS idx_decisions_kind   ON knowledge_decisions(kind);
        -- v0.13.8（画布）：体系画布状态表（视口位置恢复——system_id 体系 1:1，
        -- upsert 覆盖；ON DELETE 走软归档无硬删，保持 REFERENCES 语义与规格一致）
        CREATE TABLE IF NOT EXISTS knowledge_canvas_states (
            system_id INTEGER PRIMARY KEY REFERENCES knowledge_systems(id),
            viewport_x REAL DEFAULT 0,
            viewport_y REAL DEFAULT 0,
            zoom REAL DEFAULT 1.0,
            -- v0.14.1：画布偏好（连线样式/箭头开关/布局算法——按体系持久化；
            -- DEFAULT 与前端缺省同口径：smoothstep + 无箭头 + radial）
            edge_style TEXT NOT NULL DEFAULT 'smoothstep',
            edge_arrows INTEGER NOT NULL DEFAULT 0,
            layout_algorithm TEXT NOT NULL DEFAULT 'radial'
        );
        -- v0.14 B（视觉系统）：标签颜色表——tags 无独立表（notes.tags JSON 数组），
        -- 以标签名称为键（规格中 tag_id 前提不存在，按最小合理偏差用 tag 文本主键）；
        -- color 为 12 色板 id，未知色板 id 前端回退默认灰不崩溃
        CREATE TABLE IF NOT EXISTS tag_colors (
            tag TEXT PRIMARY KEY,
            color TEXT NOT NULL
        );
        -- v0.19.0（REQ-258，ADR-029）：检索与发现层——kb_* 派生索引三表。
        -- 铁律：只读事实源（notes/fragments），可全量重建，永不当系统记录；
        -- 影子表写入收敛 kb_index 模块同事务双写（不依赖触发器/recursive_triggers）
        CREATE TABLE IF NOT EXISTS kb_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_kind TEXT NOT NULL CHECK (source_kind IN ('note','fragment')),
            note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,          -- source_kind='note'
            fragment_id INTEGER REFERENCES fragments(id) ON DELETE CASCADE,  -- source_kind='fragment'
            ord INTEGER NOT NULL,
            heading TEXT,
            char_start INTEGER NOT NULL, char_end INTEGER NOT NULL,
            text TEXT NOT NULL,
            embedding BLOB,                                                  -- f32 向量（v0.19.3）；无引擎 NULL
            CHECK ((source_kind='note'     AND note_id IS NOT NULL AND fragment_id IS NULL)
                OR (source_kind='fragment' AND fragment_id IS NOT NULL AND note_id IS NULL))
        );
        -- 主清理路径 = 删除事务内显式先清（kb_index 模块）；FK CASCADE 仅兜底
        -- （级联不负责影子表 kb_fts——勿依赖）
        CREATE INDEX IF NOT EXISTS idx_kb_chunks_source ON kb_chunks(source_kind, note_id, fragment_id);
        -- 词法影子表；tokenize=trigram（2026-09-03 中文 BM25 切词校准定案——
        -- unicode61 将连续中文句视为单 token 无法子串匹配；trigram 免分词器，
        -- bundled SQLite ≥3.34 已含，纯源码编译无 TLS 下载风险，详见 kb_fts.rs）
        CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
            text, chunk_id UNINDEXED,
            tokenize = 'trigram'
        );
        -- 派生索引元数据：模型版本/dim、index_version、重建与失败统计
        CREATE TABLE IF NOT EXISTS kb_meta (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
        ",
    )?;
    // REQ-287（v0.19.7）：笔记手动排序表（scope=g{id} 组 / none 未分组；独立表
    // 免改 notes 列与全库行映射涟漪——读写见 db_note_orders.rs）
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_orders (
            scope TEXT NOT NULL,
            note_id INTEGER NOT NULL,
            ord INTEGER NOT NULL,
            PRIMARY KEY (scope, note_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_orders_scope ON note_orders(scope, ord);
        ",
    )?;
    // v0.5.0 M1（REQ-043）：旧库迁移——sessions 表补 profile 列（兼容既有数据库）
    ensure_column(conn, "sessions", "profile", "ALTER TABLE sessions ADD COLUMN profile TEXT")?;
    // v0.11.7（图文会话，ADR-020）：旧库迁移——sessions 表补 kind 列
    // （NULL=视频类会话零回归；'photo'=图文截屏会话；列表徽标/残留清扫依赖此列）
    ensure_column(conn, "sessions", "kind", "ALTER TABLE sessions ADD COLUMN kind TEXT")?;
    // REQ-282（v0.19.6）：会话标题来源标记——'source'=来源名（可被首句/未来
    // AI 建议自动升级覆写）；'manual'=用户改名（此后自动升级永不覆写）
    ensure_column(
        conn,
        "sessions",
        "title_kind",
        "ALTER TABLE sessions ADD COLUMN title_kind TEXT NOT NULL DEFAULT 'source'",
    )?;
    // v0.5.0 M4（REQ-048）：旧库迁移——ocr_blocks 表补 region_kind 列
    ensure_column(
        conn,
        "session_ocr_blocks",
        "region_kind",
        "ALTER TABLE session_ocr_blocks ADD COLUMN region_kind TEXT",
    )?;
    // v0.7.3（REQ-156，ADR-015）：旧库迁移——ocr_blocks 表补屏卡体系两列：
    // bbox=检测框 JSON {x,y,w,h}（帧坐标系）、screen_id=采集时分配的屏号
    // （NULL=旧数据无屏，视图层聚类兜底——ADR-015 决策 1/2）
    ensure_column(
        conn,
        "session_ocr_blocks",
        "bbox",
        "ALTER TABLE session_ocr_blocks ADD COLUMN bbox TEXT",
    )?;
    ensure_column(
        conn,
        "session_ocr_blocks",
        "screen_id",
        "ALTER TABLE session_ocr_blocks ADD COLUMN screen_id INTEGER",
    )?;
    // v0.7.0 M1（REQ-103）：旧库迁移——segments 表补 volume 列
    // （段内平均音量，重点标注音量骤变信号输入；旧数据 None=未知）
    ensure_column(
        conn,
        "session_segments",
        "volume",
        "ALTER TABLE session_segments ADD COLUMN volume REAL",
    )?;
    // v0.7.0 M1.5（REQ-109）：段级元数据列——语速/段前停顿/speaker 影子列
    // （K1 掌握度建模（V1.0）输入：语速=字/秒、停顿=与上段 gap、speaker=V1.0 讲者接线）
    ensure_column(
        conn,
        "session_segments",
        "speech_rate",
        "ALTER TABLE session_segments ADD COLUMN speech_rate REAL",
    )?;
    ensure_column(
        conn,
        "session_segments",
        "pause_ms",
        "ALTER TABLE session_segments ADD COLUMN pause_ms INTEGER",
    )?;
    ensure_column(
        conn,
        "session_segments",
        "speaker",
        "ALTER TABLE session_segments ADD COLUMN speaker TEXT",
    )?;
    // v0.7.1（会话体验批次）：notes 表补 session_id 列——会话↔笔记关联
    // （删除会话 ON DELETE SET NULL：笔记是用户资产，只断关联不删笔记；
    //   旧数据 NULL=未关联，不猜不填——历史 classroom 笔记无法追溯归属）
    ensure_column(
        conn,
        "notes",
        "session_id",
        "ALTER TABLE notes ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL",
    )?;
    // v0.7.5（REQ-171）：notes 表补规则版本/净化统计两列——笔记可回答
    // "用哪版规则生成、滤了什么"；旧笔记 NULL 诚实降级（不猜不填，ADR-014 先例）
    ensure_column(
        conn,
        "notes",
        "rule_version",
        "ALTER TABLE notes ADD COLUMN rule_version TEXT",
    )?;
    ensure_column(
        conn,
        "notes",
        "purify_stats",
        "ALTER TABLE notes ADD COLUMN purify_stats TEXT",
    )?;
    // v0.10.0（REQ-004 增强）：notes 表补 tags/properties/pin 列
    ensure_column(
        conn,
        "notes",
        "tags",
        "ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
    )?;
    ensure_column(
        conn,
        "notes",
        "properties",
        "ALTER TABLE notes ADD COLUMN properties TEXT",
    )?;
    ensure_column(
        conn,
        "notes",
        "pin",
        "ALTER TABLE notes ADD COLUMN pin INTEGER NOT NULL DEFAULT 0",
    )?;
    // 关联查询索引（列表 has_note 子查询 + 笔记页来源跳转共用）
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id)")?;
    // v0.11.0（REQ-195）：notes 补 group_id 列——笔记↔组关联
    // （删组 ON DELETE SET NULL：笔记是用户资产，只断关联不删笔记；
    //   旧数据 NULL=未归组，不猜不填——ADR-014 先例）
    ensure_column(
        conn,
        "notes",
        "group_id",
        "ALTER TABLE notes ADD COLUMN group_id INTEGER REFERENCES note_groups(id) ON DELETE SET NULL",
    )?;
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_group ON notes(group_id)")?;
    // v0.13.8（画布）：旧库迁移——knowledge_nodes 补画布位置两列
    // （NULL=未布局；CREATE TABLE 只对新库生效，旧库缺列必须 ALTER 补齐，
    //   位置列缺省不影响树视图/既有命令——零破坏纪律 §二.3）
    ensure_column(
        conn,
        "knowledge_nodes",
        "canvas_x",
        "ALTER TABLE knowledge_nodes ADD COLUMN canvas_x REAL",
    )?;
    ensure_column(
        conn,
        "knowledge_nodes",
        "canvas_y",
        "ALTER TABLE knowledge_nodes ADD COLUMN canvas_y REAL",
    )?;
    // v0.14 B（视觉系统）：旧库迁移——note_groups 补 color 列
    // （NULL=未设置；CREATE TABLE 只对新库生效，旧库缺列必须 ALTER 补齐）
    ensure_column(
        conn,
        "note_groups",
        "color",
        "ALTER TABLE note_groups ADD COLUMN color TEXT",
    )?;
    // v0.14.1：旧库迁移——knowledge_canvas_states 补画布偏好三列
    // （CREATE TABLE 只对新库生效；旧行升级后落 DEFAULT——行为与默认设置一致，
    //   零破坏纪律：不猜用户偏好，首开即默认 smoothstep + radial）
    ensure_column(
        conn,
        "knowledge_canvas_states",
        "edge_style",
        "ALTER TABLE knowledge_canvas_states ADD COLUMN edge_style TEXT NOT NULL DEFAULT 'smoothstep'",
    )?;
    ensure_column(
        conn,
        "knowledge_canvas_states",
        "edge_arrows",
        "ALTER TABLE knowledge_canvas_states ADD COLUMN edge_arrows INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        conn,
        "knowledge_canvas_states",
        "layout_algorithm",
        "ALTER TABLE knowledge_canvas_states ADD COLUMN layout_algorithm TEXT NOT NULL DEFAULT 'radial'",
    )?;
    // v0.7.7（REQ-183）：结构图记录表（建表幂等——新库建表/旧库补表）
    crate::db_structures::init(conn)?;
    // v0.8.0 M4（REQ-144）：笔记版本快照链 + AI 成本记录（幂等建表）
    crate::db_notes_versions::init(conn)?;
    crate::db_ai_usage::init(conn)?;
    // v0.18.0（REQ-248）：学习目标三表（goals/goal_milestones/goal_groups——意图层）
    crate::db_goals::init(conn)?;
    // REQ-277（v0.19.4）：旧库迁移——notes/sessions 补对外 uid 列 + 唯一索引
    // （建表批只对新库生效；索引必须在此刻建——新库列已随 CREATE 存在、旧库刚补列）
    ensure_column(conn, "notes", "uid", "ALTER TABLE notes ADD COLUMN uid TEXT")?;
    ensure_column(conn, "sessions", "uid", "ALTER TABLE sessions ADD COLUMN uid TEXT")?;
    conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_uid ON notes(uid);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);",
    )?;
    // v0.20.2（REQ-268/270）：会话精修草稿表（离线第二遍/LLM 校对派生落点——
    // 原料 session_segments 不可变，替换文本走草稿表 + 有效轴合成）
    crate::db_session_refine::init(conn)?;
    // v0.20.3（REQ-292）：任务行增量索引表（真相=md 行；聚合查询缓存）
    crate::db_task_index::init(conn)?;
    // v0.20.3（REQ-298）：完成史统一事件表（周回顾原料/成长轨迹唯一数据源）
    crate::db_completion::init(conn)?;
    // v0.20.3（REQ-296/297）：SOP 功能区三表（模板行范围引用/run/步骤轨迹）
    crate::db_sop::init(conn)?;
    // v0.20.3（REQ-299/300）：练习条目 + 问题清单（Me 问题化）
    crate::db_practice::init(conn)?;
    crate::db_questions::init(conn)?;
    Ok(())
}

/// 幂等列迁移：表已含该列则跳过，否则执行 add_sql（兼容旧库升级）。
///
/// @ai-context: CREATE TABLE IF NOT EXISTS 只对新库生效——既有数据库缺列时必须
///              ALTER 补齐（v0.5.0 M1：sessions.profile）；列存在性经 PRAGMA
///              table_info 检查，重复启动幂等。
/// @ai-context: pub(crate) 供子模块建表后随表补列（db_ai_tasks 的
///              trajectory_json——表在 init_ai_tasks 建，时序晚于本文件）。
pub(crate) fn ensure_column(conn: &Connection, table: &str, column: &str, add_sql: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|name| name == column);
    if !exists {
        conn.execute_batch(add_sql)?;
    }
    Ok(())
}
