//! WAV 轴与会话轴对齐的边界单测（批 6 T23 / R5.5-b 第 2 条逐字：≥7 条边界）。
//!
//! @ai-context: AAA 模式；**纯函数、零 IO、无墙钟**（夹具只用相对毫秒）。
//!              覆盖：首块 · 连续块（零空档）· 单空档 · 多空档 · 超大空档 ·
//!              时间戳回退/乱序 · 缺 `timestamp_ms` · 负时间戳 · 批量≡增量对拍 ·
//!              **自证不变式**（含「发生过暂停」的会话形态）。

use super::*;

/// 会话纪元（毫秒；夹具只关心相对差）。
const T0: i64 = 1_000;
/// 一块的样本数 = 200 ms @16 kHz（`audio_loopback.rs:338` 的 `block_samples`）。
const BLOCK: usize = 200 * SAMPLES_PER_MS;
/// 一块的毫秒数（自证不变式的常数项：`timestamp_ms` 是块**发点** = 块末）。
const BLOCK_MS: i64 = 200;

// ① 首块：T0 由首块锚定 ⇒ 不补
#[test]
fn first_chunk_anchors_t0_without_padding() {
    // Arrange & Act & Assert
    assert_eq!(silence_gap_samples(None, Some(T0)), Some(0));
    assert_eq!(silence_gap_samples(None, Some(0)), Some(0)); // 会话纪元处起步同样不补
}

// ② 连续块（零空档）：上一块末端 == 本块时间戳 ⇒ 不补
#[test]
fn consecutive_blocks_need_zero_padding() {
    assert_eq!(silence_gap_samples(Some(T0 + 200), Some(T0 + 200)), Some(0));
}

// ③ 单空档：补**等长**静音（200 ms ⇒ 200 × 16 样本）
#[test]
fn single_gap_pads_equal_length_silence() {
    assert_eq!(silence_gap_samples(Some(T0), Some(T0 + 200)), Some(200 * SAMPLES_PER_MS));
    assert_eq!(silence_gap_samples(Some(T0), Some(T0 + 1)), Some(SAMPLES_PER_MS));
}

// ④ 多空档：逐块独立、总数守恒（每块各补自己的空档）
#[test]
fn multiple_gaps_are_independent() {
    // Arrange：首块 T0 → 空档 300ms → 空档 700ms
    let fixture = [
        (Some(T0), BLOCK),
        (Some(T0 + 200 + 300), BLOCK),
        (Some(T0 + 200 + 300 + 200 + 700), BLOCK),
    ];
    // Act
    let plan = alignment_plan(&fixture);
    // Assert：首块 0；第 2 块补 300ms；第 3 块补 700ms（不叠加）
    assert_eq!(plan, vec![Some(0), Some(300 * SAMPLES_PER_MS), Some(700 * SAMPLES_PER_MS)]);
    let total: usize = fixture.iter().zip(&plan).map(|((_, n), p)| n + p.unwrap()).sum();
    assert_eq!(total, 3 * BLOCK + 1_000 * SAMPLES_PER_MS); // 总数守恒
}

// ⑤ 超大空档：恰好上限仍补，多 1 ms 即失效安全（不补）
#[test]
fn oversized_gap_fails_safe_at_the_limit() {
    assert_eq!(
        silence_gap_samples(Some(T0), Some(T0 + MAX_GAP_MS)),
        Some(MAX_GAP_MS as usize * SAMPLES_PER_MS)
    );
    assert_eq!(silence_gap_samples(Some(T0), Some(T0 + MAX_GAP_MS + 1)), None);
}

// ⑥ 时间戳回退/乱序：一律不补（`None`），且相等不是回退
#[test]
fn rollback_and_out_of_order_fail_safe() {
    assert_eq!(silence_gap_samples(Some(T0 + 200), Some(T0 + 100)), None); // 回退 100ms
    assert_eq!(silence_gap_samples(Some(T0 + 200), Some(T0)), None); // 乱序（退回更早）
    assert_eq!(silence_gap_samples(Some(T0 + 200), Some(T0 - 1)), None);
}

// ⑦ 缺 `timestamp_ms`：不补；会话级 ⇒ 该块与后续所有块都不补（纯追加）
#[test]
fn missing_timestamp_fails_safe() {
    assert_eq!(silence_gap_samples(Some(T0), None), None);
    assert_eq!(silence_gap_samples(None, None), None); // 首块就缺时间戳 ⇒ 无基准
    let fixture = [(Some(T0), BLOCK), (None, BLOCK), (Some(T0 + 5_000), BLOCK)];
    assert_eq!(alignment_plan(&fixture), vec![Some(0), None, None]);
}

// ⑧ 负时间戳：不补（`None`），含首块为负
#[test]
fn negative_timestamp_fails_safe() {
    assert_eq!(silence_gap_samples(None, Some(-1)), None);
    assert_eq!(silence_gap_samples(Some(T0), Some(-200)), None);
}

// ⑨ 空簿记不冒充「已对齐」；一次偏差即**永久**失效（后续即便单调也不补）
#[test]
fn book_stays_unusable_after_a_single_deviation() {
    // Arrange：空簿记（如零样本会话）
    let mut book = AlignBook::new();
    assert!(!book.is_aligned(), "无任何带时间戳的块 ⇒ 不得自称已对齐");
    // Act：首块锚定 → 回退一次 → 恢复单调
    assert_eq!(book.step(Some(T0), BLOCK), Some(0));
    assert!(book.is_aligned());
    assert_eq!(book.step(Some(T0 + 100), BLOCK), None); // 回退 ⇒ 永久失效
    assert!(!book.is_aligned());
    assert_eq!(book.step(Some(T0 + 100_000), BLOCK), None); // 失效后不再补
    // Assert：失效后基准不再推进（纯追加不改变已写样本的会话轴末端）
    assert_eq!(book.first_ts_ms, Some(T0));
    assert_eq!(book.last_end_ms, Some(T0 + 200));
    assert_eq!(book.aligned, false);
}

// ⑩ 批量 ≡ 增量（对拍）：两条路径在 ≥7 条夹具上逐元素相等
#[test]
fn batch_plan_equals_incremental_driver_on_all_fixtures() {
    let fixtures: Vec<Vec<(Option<i64>, usize)>> = vec![
        vec![],                                                    // 空序列
        vec![(Some(T0), BLOCK)],                                   // 首块
        vec![(Some(T0), BLOCK), (Some(T0 + 200), BLOCK)],          // 连续
        vec![(Some(T0), BLOCK), (Some(T0 + 500), BLOCK)],          // 单空档
        vec![(Some(T0), BLOCK), (Some(T0 + 500), BLOCK), (Some(T0 + 1_500), BLOCK)], // 多空档
        vec![(Some(T0), BLOCK), (Some(T0 + MAX_GAP_MS + 1), BLOCK)], // 超大空档
        vec![(Some(T0 + 1_000), BLOCK), (Some(T0 + 500), BLOCK)],  // 回退
        vec![(Some(T0), BLOCK), (None, BLOCK), (Some(T0 + 9_000), BLOCK)], // 缺时间戳
        vec![(Some(T0), BLOCK), (Some(-5), BLOCK)],                // 负时间戳
        vec![(None, BLOCK), (Some(T0), BLOCK)],                    // 首块缺时间戳
    ];
    for f in &fixtures {
        assert_eq!(alignment_plan(f), incremental_plan(f), "夹具 {:?}", f);
    }
}

// ⑪ 自证不变式：补静音后「已写样本数 × 1000 ÷ 16000 ==（末块 ts − 首块 ts）+ 块长」，
//    在「发生过暂停」的会话形态上同样成立（暂停两侧抵消 ⇒ 会话轴上不可见）
#[test]
fn self_proof_invariant_holds_across_pause_and_silence_window() {
    // Arrange：连续两块 →（暂停 30s：端点停采 + 时间戳补偿 ⇒ 会话轴冻结点接续）→
    //          恢复后一块 → 2s 静默窗（无包）→ 收尾两块
    let fixture = vec![
        (Some(T0), BLOCK),
        (Some(T0 + 200), BLOCK),
        (Some(T0 + 400), BLOCK),   // 暂停后恢复：会话轴上仍连续
        (Some(T0 + 2_400), BLOCK), // 静默窗 1.8s ⇒ 补静音
        (Some(T0 + 2_600), BLOCK),
    ];
    // Act
    let plan = alignment_plan(&fixture);
    let written: u64 = fixture
        .iter()
        .zip(&plan)
        .map(|((_, n), p)| *n as u64 + p.unwrap_or(0) as u64)
        .sum();
    // Assert：逐字读数 —— 44800 样本；2800 ms == (2600 − 1000) + 200
    assert_eq!(plan, vec![Some(0), Some(0), Some(0), Some(1_800 * SAMPLES_PER_MS), Some(0)]);
    assert_eq!(written, 44_800);
    let first = fixture[0].0.unwrap();
    let last = fixture[fixture.len() - 1].0.unwrap();
    assert_eq!(written * 1000 / 16_000, (last - first + BLOCK_MS) as u64);
    // 等价形态：用「末块会话轴末端」（= `last_end_ms`）替代末块发点，二者差一个块长
    let mut book = AlignBook::new();
    for (ts, n) in &fixture {
        book.step(*ts, *n);
    }
    assert!(book.is_aligned());
    assert_eq!(written * 1000 / 16_000, (book.last_end_ms.unwrap() - first) as u64);
}

/// 逐块驱动（**测试侧独立实现**：只调 `silence_gap_samples`，不复用 `AlignBook`）——
/// V5 对拍的基准：批量与增量两条路径分叉即红。
fn incremental_plan(chunks: &[(Option<i64>, usize)]) -> Vec<Option<usize>> {
    let mut out = Vec::new();
    let mut aligned = true;
    let mut first: Option<i64> = None;
    let mut written: u64 = 0;
    for (ts, n) in chunks {
        if !aligned {
            out.push(None);
            written += *n as u64;
            continue;
        }
        let prev_end = first.map(|f| f + (written / SAMPLES_PER_MS as u64) as i64);
        match silence_gap_samples(prev_end, *ts) {
            Some(pad) => {
                if first.is_none() {
                    first = *ts;
                }
                written += (pad + n) as u64;
                out.push(Some(pad));
            }
            None => {
                aligned = false;
                written += *n as u64;
                out.push(None);
            }
        }
    }
    out
}
