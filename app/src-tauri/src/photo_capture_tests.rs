//! photo_capture 业务模块测试（内存库 + 临时目录，环境隔离）。

use base64::Engine;

use crate::db::Db;
use crate::engine::EnginePool;
use crate::image_store::SessionImageStore;
use crate::photo_capture::{decode_image, save_photo_capture};
use crate::types::NewSession;

/// 构造一个纯色 PNG 的 base64（测试夹具）。
fn png_b64(w: u32, h: u32, gray: u8) -> String {
    let img = image::RgbImage::from_pixel(w, h, image::Rgb([gray, gray, gray]));
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .expect("PNG 编码成功");
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}

#[test]
fn save_photo_end_to_end_engine_failure_still_saves() {
    // Arrange：图文会话 + 临时图片目录 + 长驻 store + dummy 引擎（OCR 立即失败）
    let db = Db::open(":memory:").expect("内存库");
    let session = db
        .create_session(&NewSession {
            title: "图文".into(),
            source_window: None,
            profile: None,
            kind: Some("photo".into()),
        })
        .expect("建会话");
    let dir = tempfile::tempdir().expect("临时目录");
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).expect("store");
    // Act：保存 200×100 纯色图（ts=1000）
    let result = save_photo_capture(&mut store, &db, &EnginePool::dummy(), session.id, &png_b64(200, 100, 120), 1000)
        .expect("保存成功");
    // Assert：图已落盘（full+thumb）、块数诚实 0（dummy 引擎失败不阻断）、非重复
    assert!(!result.duplicated);
    assert_eq!(result.block_count, 0);
    assert_eq!(result.image_ref, "full/1000.webp");
    assert!(dir.path().join("full/1000.webp").is_file(), "full 图应存在");
    assert!(dir.path().join("thumb/1000.webp").is_file(), "缩略图应存在");
}

#[test]
fn duplicate_photo_returns_duplicated_flag() {
    // Arrange：同内容连续两次保存（同一长驻 store——去重 FIFO 跨调用生效）
    let db = Db::open(":memory:").unwrap();
    let session = db
        .create_session(&NewSession {
            title: "图文".into(),
            source_window: None,
            profile: None,
            kind: Some("photo".into()),
        })
        .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let mut store = SessionImageStore::new(dir.path().to_path_buf()).unwrap();
    let b64 = png_b64(300, 200, 80);
    let first = save_photo_capture(&mut store, &db, &EnginePool::dummy(), session.id, &b64, 1000).unwrap();
    // Act：第二次保存（新 ts=2000，内容相同）
    let second = save_photo_capture(&mut store, &db, &EnginePool::dummy(), session.id, &b64, 2000).unwrap();
    // Assert：第二次命中双指纹 → duplicated=true、image_ref 仍为首次路径、不新增文件
    assert_eq!(first.image_ref, "full/1000.webp");
    assert!(second.duplicated);
    assert_eq!(second.image_ref, "full/1000.webp");
    assert!(!dir.path().join("full/2000.webp").exists(), "重复内容不得新增文件");
}

#[test]
fn decode_rejects_garbage_and_empty() {
    // Act & Assert：非法 base64 / 空串 / 非图片字节 → 可诊断错误
    assert!(decode_image("not-base64!!").is_err());
    assert!(decode_image("").is_err());
    let junk = base64::engine::general_purpose::STANDARD.encode(b"not an image");
    assert!(decode_image(&junk).is_err());
}
