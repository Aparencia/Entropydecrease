/**
 * SQLite Schema DDL — 全部建表语句 + 索引 + 初始化入口
 * 列类型映射: string→TEXT, number→REAL/INTEGER, boolean→INTEGER, Date→TEXT(ISO), Array/Object→TEXT(JSON)
 *
 * @ai-context: SQLite 建表 DDL 唯一权威源——新增表需同步 dbIpcHandlers.ALLOWED_TABLES 白名单。
 */
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 6;

export const SCHEMA_DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('class','self_study')),
  subject TEXT, duration INTEGER NOT NULL CHECK (duration > 0),
  actual_duration INTEGER NOT NULL CHECK (actual_duration >= 0),
  completed_at TEXT NOT NULL, interrupted INTEGER NOT NULL DEFAULT 0, goal TEXT
);
CREATE TABLE IF NOT EXISTS pomodoro_settings (
  id TEXT PRIMARY KEY, work_duration INTEGER NOT NULL DEFAULT 25,
  short_break_duration INTEGER NOT NULL DEFAULT 5, long_break_duration INTEGER NOT NULL DEFAULT 15,
  long_break_interval INTEGER NOT NULL DEFAULT 4, auto_start_break INTEGER NOT NULL DEFAULT 0,
  auto_start_work INTEGER NOT NULL DEFAULT 0, sound_enabled INTEGER NOT NULL DEFAULT 1,
  notification_enabled INTEGER NOT NULL DEFAULT 1, class_duration INTEGER NOT NULL DEFAULT 45
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT 'free' CHECK (template IN ('outline','cornell','mindmap','free','qa','blank','video')),
  folder_id TEXT, tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, video_note_type TEXT,
  FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS note_folders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, color TEXT,
  created_at TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES note_folders(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, parent_id TEXT, color TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES flashcard_decks(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY, deck_id TEXT NOT NULL, front TEXT NOT NULL DEFAULT '',
  back TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'basic' CHECK (type IN ('basic','cloze','multi_choice')),
  ease_factor REAL NOT NULL DEFAULT 2.5, "interval" REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL, last_review_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  source_note_id TEXT, "order" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, deck_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  ease_factor_before REAL NOT NULL, ease_factor_after REAL NOT NULL,
  interval_before REAL NOT NULL, interval_after REAL NOT NULL,
  reviewed_at TEXT NOT NULL, time_spent REAL NOT NULL DEFAULT 0,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('low','medium','high')),
  golden_error INTEGER,
  FOREIGN KEY (card_id) REFERENCES flashcards(id) ON DELETE CASCADE,
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS feynman_notes (
  id TEXT PRIMARY KEY, concept TEXT NOT NULL, explanation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
  self_rating INTEGER CHECK (self_rating IS NULL OR self_rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS feynman_summaries (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES feynman_notes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS feynman_weak_points (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '{}', mastered INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES feynman_notes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS operation_log (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  payload TEXT, created_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0, device_id TEXT NOT NULL DEFAULT '', patch TEXT
);
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  local_data TEXT NOT NULL, remote_data TEXT NOT NULL,
  local_version INTEGER NOT NULL, remote_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved-local','resolved-remote','resolved-manual')),
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS offline_queue (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  payload TEXT, version INTEGER NOT NULL DEFAULT 0, device_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, next_retry_at REAL
);
CREATE TABLE IF NOT EXISTS study_check_ins (
  id TEXT PRIMARY KEY, "date" TEXT NOT NULL UNIQUE, check_in_time TEXT NOT NULL,
  modules_used TEXT NOT NULL DEFAULT '[]', streak_days INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', unlocked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pomodoro_goals (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS window_captures (
  id TEXT PRIMARY KEY, note_id TEXT, target_window TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'vision' CHECK (mode IN ('vision','audio','both')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  segments TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, ended_at TEXT, total_duration REAL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('privacy','terms')),
  version TEXT NOT NULL, accepted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inspirations (
  id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '{}',
  tags_manually_edited INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  sort_status TEXT CHECK (sort_status IS NULL OR sort_status IN ('pending','sorting','sorted','confirmed','transformed')),
  sort_result TEXT
);
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  question TEXT NOT NULL,
  user_guess TEXT,
  ai_answer TEXT NOT NULL,
  accuracy TEXT CHECK(accuracy IN ('correct', 'partial', 'incorrect')),
  difficulty INTEGER,
  related_concepts TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id)
);
CREATE TABLE IF NOT EXISTS search_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL,
  tokens TEXT NOT NULL DEFAULT '[]', title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL DEFAULT 0,
  entity_id TEXT, entity_type TEXT,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
-- 高频查询列索引
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_completed_at ON pomodoro_sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_reviewed_at ON flashcard_reviews(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_feynman_notes_created_at ON feynman_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_predictions_note_id ON predictions(note_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at);
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新对话',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0, metadata TEXT
);
CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text',
  trigger_type TEXT, tokens_used INTEGER, model TEXT, latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_triggers (
  id TEXT PRIMARY KEY, rule_id TEXT NOT NULL,
  triggered_at INTEGER NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0,
  responded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_asst_msg_session ON assistant_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_asst_sess_active ON assistant_sessions(is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_asst_trig_rule ON assistant_triggers(rule_id, triggered_at);
CREATE TABLE IF NOT EXISTS implementation_intentions (
  id TEXT PRIMARY KEY,
  if_clause TEXT NOT NULL DEFAULT '',
  then_clause TEXT NOT NULL DEFAULT '',
  trigger_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','skipped')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_impl_intention_status ON implementation_intentions(status, trigger_at);
`;

/** v3 迁移 DDL：CRDT 同步引擎元数据表（条件执行） */
export const SCHEMA_V3_DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS crdt_docs (
  table_name TEXT PRIMARY KEY,
  snapshot TEXT NOT NULL DEFAULT '',
  last_heads TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS crdt_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changeset TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crdt_changes_table_name ON crdt_changes(table_name);
`;

/** 执行 DDL 并设置 PRAGMA user_version。幂等调用（CREATE IF NOT EXISTS）。 */
export function initializeSchema(db: Database.Database): void {
  db.exec(SCHEMA_DDL);

  // v2 迁移：FSRS-5 扩展字段（条件 ALTER TABLE，幂等）
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < 2) {
    try {
      db.exec(`ALTER TABLE flashcards ADD COLUMN stability REAL DEFAULT NULL`);
    } catch { /* 列已存在 */ }
    try {
      db.exec(`ALTER TABLE flashcards ADD COLUMN difficulty REAL DEFAULT NULL`);
    } catch { /* 列已存在 */ }
  }

  // v3 迁移：CRDT 同步引擎元数据表
  if (currentVersion < 3) {
    db.exec(SCHEMA_V3_DDL);
  }

  // v4 迁移：search_index 表增加 entity_id 和 entity_type 列
  if (currentVersion < 4) {
    try {
      db.exec(`ALTER TABLE search_index ADD COLUMN entity_id TEXT`);
    } catch { /* 列已存在 */ }
    try {
      db.exec(`ALTER TABLE search_index ADD COLUMN entity_type TEXT`);
    } catch { /* 列已存在 */ }
  }

  // v5 迁移：AI 助手会话/消息/触发表（CREATE IF NOT EXISTS 幂等）
  // 表 DDL 已包含在 SCHEMA_DDL 中，此处无需额外操作

  // v6 迁移：A4 实施意图表 implementation_intentions
  // 表 DDL 已包含在 SCHEMA_DDL 中（CREATE IF NOT EXISTS 幂等），此处无需额外操作

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
