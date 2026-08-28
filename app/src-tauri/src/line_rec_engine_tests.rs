//! line_rec_engine 单测（v0.14 D3 spec §6：疑碎行判定/裁剪/替换编排；AAA 模式）。
//!
//! @ai-context: 识别编排经 LineRecognizer trait 注入假识别器——不依赖模型文件
//!              （RecLineEngine::build 集成测试标注需模型，见模块头）；替换
//!              对齐 1:1 索引（疑碎块 ↔ 裁剪图 ↔ 结果）。

use super::*;

/// 构造 OcrBlock（bbox 可选）。
fn blk(text: &str, score: f32, bbox: Option<(f32, f32, f32, f32)>) -> OcrBlock {
    OcrBlock {
        timestamp_ms: None,
        text: text.to_string(),
        score,
        bbox: bbox.map(|(x, y, w, h)| TextBox { x, y, w, h }),
        region_kind: None,
    }
}

/// 假识别器：按预设结果返回（1:1）；fail=true 注入识别失败（AppError 无 Clone——
/// 失败经标志注入而非存储 Result）。
struct FakeRec {
    results: Vec<LineRecResult>,
    fail: bool,
}

impl LineRecognizer for FakeRec {
    fn recognize_lines(&self, _crops: &[RgbImage]) -> Result<Vec<LineRecResult>> {
        if self.fail {
            Err(AppError::Ocr("引擎不可用".to_string()))
        } else {
            Ok(self.results.clone())
        }
    }
}

#[test]
fn fragment_text_is_suspect() {
    // Arrange/Act/Assert：≤4 字（碎片——重识别候选）
    assert!(is_suspect_line("白平衡", 0.9));
    assert!(is_suspect_line("的", 0.95));
}

#[test]
fn low_confidence_is_suspect() {
    // Arrange/Act/Assert：长文本但低置信（< 0.5）
    assert!(is_suspect_line("这是一个很长的模糊文本", 0.4));
}

#[test]
fn normal_line_not_suspect() {
    // Arrange/Act/Assert：≥5 字且高置信 → 不重识别
    assert!(!is_suspect_line("白平衡调节方法", 0.9));
}

#[test]
fn crop_line_applies_padding_and_clamps() {
    // Arrange：100x50 图 + 近边缘 bbox（x=2 → padding 后 clamp 到 0）
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    let bbox = TextBox { x: 2.0, y: 3.0, w: 40.0, h: 10.0 };
    // Act
    let crop = crop_line(&img, &bbox);
    // Assert：x 起点 clamp 到 0；尺寸 = (2+4+40) × (3+4+10) 边界内
    assert_eq!(crop.width(), 46);
    assert_eq!(crop.height(), 17);
}

#[test]
fn crop_line_invalid_bbox_returns_original() {
    // Arrange：空矩形 bbox（w=0）
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    let bbox = TextBox { x: 10.0, y: 10.0, w: 0.0, h: 10.0 };
    // Act
    let crop = crop_line(&img, &bbox);
    // Assert：不裁剪（原图返回——调用方按 1:1 索引忽略）
    assert_eq!(crop.dimensions(), img.dimensions());
}

#[test]
fn pipeline_replaces_suspect_blocks_only() {
    // Arrange：疑碎块（碎片 + 低置信）与正常块混排；假识别器返回正确文本
    let mut blocks = vec![
        blk("白平衡", 0.9, Some((10.0, 10.0, 60.0, 20.0))),
        blk("这是完整的正常行内容", 0.92, Some((10.0, 40.0, 200.0, 20.0))),
        blk("模糊", 0.3, Some((10.0, 70.0, 40.0, 20.0))),
    ];
    let rec = FakeRec {
        results: vec![
            LineRecResult { text: "白平衡调节".to_string(), score: 0.88 },
            LineRecResult { text: "模糊文字".to_string(), score: 0.91 },
        ],
        fail: false,
    };
    let img = RgbImage::from_pixel(400, 200, image::Rgb([255, 255, 255]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：两块疑碎被替换（索引 0 和 2）；正常块（索引 1）原样
    assert_eq!(replaced, 2);
    assert_eq!(blocks[0].text, "白平衡调节");
    assert_eq!(blocks[1].text, "这是完整的正常行内容");
    assert_eq!(blocks[2].text, "模糊文字");
    assert!((blocks[0].score - 0.88).abs() < 1e-4);
}

#[test]
fn pipeline_keeps_low_score_result() {
    // Arrange：疑碎块重识别结果低分（< 采纳阈值）→ 保留原文本
    let mut blocks = vec![blk("碎片", 0.6, Some((10.0, 10.0, 40.0, 20.0)))];
    let rec = FakeRec {
        results: vec![LineRecResult { text: "更差的识别".to_string(), score: 0.2 }],
        fail: false,
    };
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：不引入更低质文本
    assert_eq!(replaced, 0);
    assert_eq!(blocks[0].text, "碎片");
}

#[test]
fn pipeline_keeps_empty_result() {
    // Arrange：重识别返回空文本（adapter 过滤——保持 1:1 索引）
    let mut blocks = vec![blk("碎片", 0.6, Some((10.0, 10.0, 40.0, 20.0)))];
    let rec = FakeRec {
        results: vec![LineRecResult { text: String::new(), score: 0.9 }],
        fail: false,
    };
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：空文本不替换（保留原结果）
    assert_eq!(replaced, 0);
    assert_eq!(blocks[0].text, "碎片");
}

#[test]
fn pipeline_degrades_on_recognition_error() {
    // Arrange：识别失败（引擎不可用——spec §5 降级不失效）
    let mut blocks = vec![blk("碎片", 0.6, Some((10.0, 10.0, 40.0, 20.0)))];
    let rec = FakeRec {
        results: Vec::new(),
        fail: true,
    };
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：保留原结果（能力降级不失效）
    assert_eq!(replaced, 0);
    assert_eq!(blocks[0].text, "碎片");
}

#[test]
fn pipeline_skips_blocks_without_bbox() {
    // Arrange：疑碎但无 bbox（旧数据）→ 无法裁剪，跳过
    let mut blocks = vec![blk("碎片", 0.6, None)];
    let rec = FakeRec {
        results: vec![LineRecResult { text: "替换文本".to_string(), score: 0.9 }],
        fail: false,
    };
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：无裁剪无请求（rec 未被调用——crops 空时假识别器返回空）
    assert_eq!(replaced, 0);
    assert_eq!(blocks[0].text, "碎片");
}

#[test]
fn pipeline_all_healthy_no_rec_call() {
    // Arrange：全部正常块（无疑碎）——不应发起识别
    let mut blocks = vec![
        blk("完整的正常行内容一", 0.9, Some((10.0, 10.0, 100.0, 20.0))),
        blk("完整的正常行内容二", 0.88, Some((10.0, 40.0, 100.0, 20.0))),
    ];
    let rec = FakeRec {
        results: Vec::new(),
        fail: false,
    };
    let img = RgbImage::from_pixel(200, 100, image::Rgb([0, 0, 0]));
    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);
    // Assert：0 替换（无识别请求——crops 空）
    assert_eq!(replaced, 0);
}

#[test]
fn invalid_bbox_never_sent_to_recognition() {
    // Arrange：零宽 bbox 疑碎块 + 识别器返回整屏内容（审查 M2——原实现会把
    //          整屏图送识别并静默替换碎片文本，污染落库）
    let mut blocks = vec![blk("碎", 0.9, Some((10.0, 10.0, 0.0, 20.0)))];
    let rec = FakeRec {
        results: vec![LineRecResult { text: "整屏内容".to_string(), score: 0.9 }],
        fail: false,
    };
    let img = RgbImage::from_pixel(100, 50, image::Rgb([0, 0, 0]));

    // Act
    let replaced = rec_pipeline_on_blocks(&rec, &img, &mut blocks, 0.5);

    // Assert：无效 bbox 不裁剪不识别——块文本原样保留
    assert_eq!(replaced, 0);
    assert_eq!(blocks[0].text, "碎", "无效 bbox 块不得被整屏结果替换");
}
