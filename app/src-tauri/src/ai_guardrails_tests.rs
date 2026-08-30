//! 补缝式 AI 护栏骨架单测（REQ-055 / v0.5.0 M8）。
//!
//! @ai-context: AAA 模式；覆盖配额跨日翻转/耗尽、hash 缓存命中/LRU、审计条目。

use super::*;

#[test]
fn quota_consumes_until_limit() {
    // Arrange：配额 3
    let mut quota = DailyQuota::new(3);
    // Act：消耗 3 次
    assert!(quota.try_consume(1000000));
    assert!(quota.try_consume(1000000));
    assert!(quota.try_consume(1000000));
    // Assert：第 4 次拒绝
    assert!(!quota.try_consume(1000000));
    assert_eq!(quota.usage(), (3, 3));
}

#[test]
fn quota_resets_on_new_day() {
    // Arrange：配额 2，首日耗尽
    let mut quota = DailyQuota::new(2);
    assert!(quota.try_consume(86_400));
    assert!(quota.try_consume(86_400));
    assert!(!quota.try_consume(86_400));
    // Act：次日
    assert!(quota.try_consume(86_400 * 2), "跨日应重置配额");
    assert_eq!(quota.usage(), (1, 2));
}

#[test]
fn quota_default_limit() {
    let mut quota = DailyQuota::new(DAILY_QUOTA_DEFAULT);
    for _ in 0..DAILY_QUOTA_DEFAULT {
        assert!(quota.try_consume(0));
    }
    assert!(!quota.try_consume(0));
}

#[test]
fn hash_cache_hit_and_miss() {
    // Arrange
    let mut cache = AiHashCache::with_capacity(4);
    // Act：未命中 → 写入 → 命中
    assert_eq!(cache.get(42), None);
    cache.put(42, r#"{"ok":true}"#.into(), 1000);
    assert_eq!(cache.get(42).as_deref(), Some(r#"{"ok":true}"#));
}

#[test]
fn hash_cache_lru_eviction() {
    // Arrange：容量 2
    let mut cache = AiHashCache::with_capacity(2);
    cache.put(1, "a".into(), 0);
    cache.put(2, "b".into(), 0);
    cache.get(1); // 刷新 1 为最近
    // Act：写第 3 个 → 淘汰 2
    cache.put(3, "c".into(), 0);
    // Assert
    assert!(cache.get(2).is_none());
    assert!(cache.get(1).is_some());
    assert!(cache.get(3).is_some());
}

#[test]
fn hash_cache_put_updates_existing() {
    let mut cache = AiHashCache::with_capacity(2);
    cache.put(1, "old".into(), 0);
    cache.put(1, "new".into(), 0);
    assert_eq!(cache.get(1).as_deref(), Some("new"));
}

#[test]
fn audit_entry_serializable() {
    // Arrange：审计条目（V1.0 落库契约）
    let entry = AiAuditEntry {
        at_unix: 1700000000,
        upload_summary: "hash=abc,type=table".into(),
        result: "ok".into(),
    };
    // Act：roundtrip
    let raw = serde_json::to_string(&entry).unwrap();
    let back: AiAuditEntry = serde_json::from_str(&raw).unwrap();
    // Assert：无损
    assert_eq!(back, entry);
}

#[test]
fn cache_empty_safe() {
    let mut cache = AiHashCache::default();
    assert!(cache.get(99).is_none());
}
