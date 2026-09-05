//! web_inbox 纯逻辑单测（v0.20.4 / REQ-304）。

use super::*;

#[test]
fn parse_headers_basic() {
    let (method, path, headers) =
        parse_headers("POST /ingest HTTP/1.1\r\nAuthorization: Bearer abc\r\nContent-Length: 12\r\n").unwrap();
    assert_eq!(method, "POST");
    assert_eq!(path, "/ingest");
    assert_eq!(headers.get("authorization").map(|s| s.as_str()), Some("Bearer abc"));
    assert_eq!(headers.get("content-length").map(|s| s.as_str()), Some("12"));
}

#[test]
fn token_check_constant_style_and_case() {
    let h: HashMap<String, String> =
        [("authorization".to_string(), "Bearer s3cr3t".to_string())].into();
    assert!(is_authorized(&h, "s3cr3t"));
    assert!(!is_authorized(&h, "s3cr3X"));
    assert!(!is_authorized(&HashMap::new(), "s3cr3t"));
}

#[test]
fn payload_validation_guards() {
    let good = IngestPayload {
        title: Some("t".into()),
        url: Some("https://a.b/c".into()),
        site: None,
        author: None,
        markdown: "# t\n正文。".into(),
        images: vec![],
    };
    assert!(validate_payload(&good).is_ok());
    let bad_url = IngestPayload { url: Some("ftp://x".into()), ..good.clone() };
    assert!(validate_payload(&bad_url).is_err());
    let empty = IngestPayload { markdown: "  ".into(), ..good.clone() };
    assert!(validate_payload(&empty).is_err());
    let bad_name = IngestPayload {
        images: vec![IngestImage { name: "../evil.png".into(), data_base64: "data:image/png;base64,AA==".into() }],
        ..good.clone()
    };
    assert!(validate_payload(&bad_name).is_err(), "路径穿越名拒绝");
    let not_image = IngestPayload {
        images: vec![IngestImage { name: "x.png".into(), data_base64: "data:text/plain;base64,AA==".into() }],
        ..good
    };
    assert!(validate_payload(&not_image).is_err());
}

#[test]
fn data_uri_extract_and_hash_deterministic() {
    let uri = "data:image/png;base64,iVBORw0KGgo=";
    let bytes = data_uri_bytes(uri).unwrap();
    assert!(!bytes.is_empty());
    assert_eq!(short_hash(&bytes), short_hash(&bytes));
    assert_ne!(short_hash(b"a"), short_hash(b"b"));
    assert!(data_uri_bytes("not-a-data-uri").is_none());
    assert_eq!(random_token(1).len(), 24);
    assert_ne!(random_token(1), random_token(2));
}
