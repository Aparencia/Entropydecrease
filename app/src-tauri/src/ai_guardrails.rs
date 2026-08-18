//! 补缝式 AI 护栏骨架（REQ-055 / v0.5.0 M8，依据 ADR-010）。
//!
//! @ai-context: 成本与隐私护栏（云端 V1.0 实装后生效，本版骨架就位）：
//!              ① 同图 hash 缓存（不重复上传/计费）；② 每日配额计数器；
//!              ③ 审计日志（上传了什么/何时/结果——V1.0 启用）；
//!              ④ 来源标记 ai-enhanced 永远可辨认（产物块 source）。
//! @ai-context: 纯逻辑可单测（日期翻转/配额耗尽/hash 命中）；
//!              hash 缓存与审计落库由 command 层接 SQLite（骨架接口已定）。

use std::collections::HashMap;

/// 每日配额上限（V1.0 默认；用户可调）。
pub const DAILY_QUOTA_DEFAULT: u32 = 50;

/// 配额计数器（有状态；按自然日翻转）。
#[derive(Debug, Clone, PartialEq)]
pub struct DailyQuota {
    /// 当前计数日（Unix 日序号 = 秒 / 86400）
    day: i64,
    used: u32,
    limit: u32,
}

impl DailyQuota {
    pub fn new(limit: u32) -> Self {
        Self { day: current_day(), used: 0, limit: limit.max(1) }
    }

    /// 尝试消耗一次配额；配额耗尽/跨日重置后返回是否允许。
    ///
    /// @ai-context: 跨日自动重置（day 变化 → used 归零）；
    ///              返回 false = 今日配额已尽（云端不调用）。
    pub fn try_consume(&mut self, now_secs: i64) -> bool {
        let day = now_secs / 86_400;
        if day != self.day {
            self.day = day;
            self.used = 0;
        }
        if self.used >= self.limit {
            return false;
        }
        self.used += 1;
        true
    }

    /// 今日已用 / 上限（前端展示；暂由测试覆盖，登记豁免 dead_code）。
    #[allow(dead_code)]
    pub fn usage(&self) -> (u32, u32) {
        (self.used, self.limit)
    }
}

/// 当前 Unix 日序号（秒）。
fn current_day() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 / 86_400)
        .unwrap_or(0)
}

/// 文本 hash（REQ-085：同文本段不重复送审/计费；非加密用途——去重足够）。
///
/// @ai-context: 缓存键 = 待送审段文本序列的 hash；同批文本再次触发复核时
///              命中 AiHashCache 零上传（不重复计费）。
pub fn text_hash(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    h.finish()
}

/// 同图 hash 缓存（不重复上传/计费）：裁剪图 hash → 已获取的 AI 响应。
///
/// @ai-context: 判定器同图多次失败（静止画面多帧）→ 命中缓存零重复上传；
///              缓存带容量上限（LRU 淘汰）。
#[derive(Debug)]
pub struct AiHashCache {
    capacity: usize,
    map: HashMap<u64, AiCacheEntry>,
    order: std::collections::VecDeque<u64>,
}

/// 缓存条目（响应 + 时刻；at_ms 供 V1.0 过期策略，暂由测试覆盖，登记豁免）。
#[derive(Debug, Clone)]
pub struct AiCacheEntry {
    pub response_json: String,
    #[allow(dead_code)]
    pub at_ms: u64,
}

impl Default for AiHashCache {
    fn default() -> Self {
        Self::with_capacity(128)
    }
}

impl AiHashCache {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            map: HashMap::new(),
            order: std::collections::VecDeque::new(),
        }
    }

    /// 查缓存：命中刷新 LRU 序；未命中 None。
    pub fn get(&mut self, hash: u64) -> Option<String> {
        match self.map.get(&hash) {
            Some(entry) => {
                if let Some(pos) = self.order.iter().position(|&k| k == hash) {
                    self.order.remove(pos);
                }
                self.order.push_front(hash);
                Some(entry.response_json.clone())
            }
            None => None,
        }
    }

    /// 写缓存（响应 JSON + 时刻）；超容量淘汰最久未用。
    pub fn put(&mut self, hash: u64, response_json: String, at_ms: u64) {
        if let Some(pos) = self.order.iter().position(|&k| k == hash) {
            self.order.remove(pos);
        } else if self.map.len() >= self.capacity {
            if let Some(evict) = self.order.pop_back() {
                self.map.remove(&evict);
            }
        }
        self.map.insert(hash, AiCacheEntry { response_json, at_ms });
        self.order.push_front(hash);
    }
}

/// 审计日志条目（V1.0 实装后启用；落库字段契约）。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct AiAuditEntry {
    pub at_unix: i64,
    /// 上传内容摘要（裁剪图 hash + 请求类型）
    pub upload_summary: String,
    /// 结果（ok = schema 通过；error = 校验失败丢弃）
    pub result: String,
}

/// 护栏聚合状态（AppState 持有：每日配额 + 同图缓存 + 审计日志内存缓冲）。
///
/// @ai-context: command 层在锁内 read-modify-write（防 TOCTOU）；
///              审计日志 V1.0 实装后落库（骨架接口：push 缓冲已就位）。
#[derive(Debug)]
pub struct AiGuardrails {
    pub quota: DailyQuota,
    pub cache: AiHashCache,
    /// 审计缓冲（V1.0 落库前保留最近 200 条）
    pub audit: Vec<AiAuditEntry>,
}

impl Default for AiGuardrails {
    fn default() -> Self {
        Self::new(DAILY_QUOTA_DEFAULT)
    }
}

impl AiGuardrails {
    pub fn new(quota_limit: u32) -> Self {
        Self {
            quota: DailyQuota::new(quota_limit),
            cache: AiHashCache::default(),
            audit: Vec::new(),
        }
    }

    /// 记录审计（容量上限 200，超限丢弃最旧）。
    pub fn push_audit(&mut self, entry: AiAuditEntry) {
        self.audit.push(entry);
        if self.audit.len() > 200 {
            self.audit.remove(0);
        }
    }
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3）。
#[cfg(test)]
#[path = "ai_guardrails_tests.rs"]
mod tests;
