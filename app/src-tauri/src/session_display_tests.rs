//! 会话显示序号纯函数单测（AAA 模式；rustc 独立编译可跑）。
//!
//! @ai-context: 由 session_display.rs 以 #[cfg(test)] #[path] 引入；纯 std 依赖，
//!              Windows 下 cargo test harness 受限（v0.11.4 onnxruntime 冲突）时
//!              可 rustc --test 独立运行——"纯函数可独立验证"（Context 环境说明）。

use super::assign_display_no;

#[test]
fn display_no_is_created_order_rank() {
    // Arrange：三个会话（不同创建时间），模拟删除中间一个
    let items = vec![(1, 100), (2, 200), (3, 300)];
    // Act：按 (started_at, id) 升序赋 rank
    let map = assign_display_no(&items);
    // Assert：时间序 rank 1..=3
    assert_eq!(map[&1], 1);
    assert_eq!(map[&2], 2);
    assert_eq!(map[&3], 3);
    // 删除中间会话（id=2）后重排：不复用旧号，后续会话归位
    let map2 = assign_display_no(&[(1, 100), (3, 300)]);
    assert_eq!(map2[&1], 1);
    assert_eq!(map2[&3], 2);
}

#[test]
fn display_no_stable_on_same_timestamp() {
    // 同时间戳按 id 稳定排序（排序键 (started_at, id) 全序）
    let map = assign_display_no(&[(5, 100), (3, 100)]);
    assert_eq!(map[&3], 1);
    assert_eq!(map[&5], 2);
}

#[test]
fn display_no_ignores_input_order() {
    // rank 按 created 序与调用方排序模式解耦：乱序输入结果一致
    let a = assign_display_no(&[(3, 300), (1, 100), (2, 200)]);
    let b = assign_display_no(&[(1, 100), (2, 200), (3, 300)]);
    assert_eq!(a, b);
    assert_eq!(a[&1], 1);
    assert_eq!(a[&2], 2);
    assert_eq!(a[&3], 3);
}
