//! bge-small-zh-v1.5 的 BERT WordPiece 分词（REQ-259，v0.19.5）。
//!
//! @ai-context: 内嵌 ONNX 引擎需要与训练一致的输入（input_ids/attention_mask）。
//!              官方句向量模型用 WordPiece + vocab.txt——中文语料为字符级词表
//!              全覆盖；本模块实现**最小 WordPiece**（不含 lowercase/重音剥离：
//!              zh 模型词表为大写敏感无关字符级；ASCII 按字面匹配、未命中回退
//!              [UNK]——诚实降级而非猜测）。
//! @ai-context: 契约：`[CLS] tokens... [SEP]`，max_len=512（超长截断——bge
//!              训练窗 512；kb 切块 ≤800 字符硬切已留安全余量），pad 到
//!              max_len（batch 同长）。词表从模型目录 vocab.txt 加载（与模型
//!              同分发）；加载失败 → 引擎不可用（外层诚实报错，检索自动降级）。
//! @ai-context: 特殊标记取自词表查找（防御换名）；词表缺 [UNK]/[CLS]/[SEP]
//!              → 加载失败（模型不完整，宁缺勿错）。

use std::collections::HashMap;
use std::path::Path;

/// bge-small-zh-v1.5 上下文窗（模型 max_position_embeddings）
pub const MAX_LEN: usize = 512;

/// 默认特殊标记名（词表内实际名字为准——查找失败即加载失败）
const PAD: &str = "[PAD]";
const CLS: &str = "[CLS]";
const SEP: &str = "[SEP]";
const UNK: &str = "[UNK]";

/// 分词器（vocab.txt 加载后不可变——Send+Sync，可跨任务线程复用）
#[derive(Debug, Clone)]
pub struct BertTokenizer {
    word_to_id: HashMap<String, u32>,
    /// 词表条目文本（id → token；构建 ## 续接查找）
    tokens: Vec<String>,
    pad_id: u32,
    cls_id: u32,
    sep_id: u32,
    unk_id: u32,
}

/// 一次编码结果（ndarray 前的一维数组——由引擎转 batch 矩阵）
#[derive(Debug, Clone, PartialEq)]
pub struct Encoded {
    pub input_ids: Vec<i64>,
    pub attention_mask: Vec<i64>,
}

impl BertTokenizer {
    /// 从 vocab.txt 加载（每行一个 token；带 `##` 续接与特殊标记校验）。
    pub fn load(path: &Path) -> Result<Self, String> {
        let raw = std::fs::read_to_string(path).map_err(|e| format!("词表读取失败: {e}"))?;
        let tokens: Vec<String> = raw.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect();
        if tokens.is_empty() {
            return Err("词表为空".to_string());
        }
        let find = |name: &str| -> Option<u32> {
            tokens.iter().position(|t| t == name).map(|i| i as u32)
        };
        let pad_id = find(PAD).ok_or_else(|| format!("词表缺少 {PAD}"))?;
        let cls_id = find(CLS).ok_or_else(|| format!("词表缺少 {CLS}"))?;
        let sep_id = find(SEP).ok_or_else(|| format!("词表缺少 {SEP}"))?;
        let unk_id = find(UNK).ok_or_else(|| format!("词表缺少 {UNK}"))?;
        let word_to_id: HashMap<String, u32> =
            tokens.iter().enumerate().map(|(i, t)| (t.clone(), i as u32)).collect();
        Ok(Self { word_to_id, tokens, pad_id, cls_id, sep_id, unk_id })
    }

    /// 编码单条文本 → [CLS] … [SEP]（截断到 MAX_LEN-2 个内容 token，pad 满窗）。
    pub fn encode(&self, text: &str) -> Encoded {
        let mut ids: Vec<i64> = vec![self.cls_id as i64];
        let content_cap = MAX_LEN.saturating_sub(2);
        for piece in self.word_pieces(text).take(content_cap) {
            ids.push(self.word_to_id.get(&piece).copied().unwrap_or(self.unk_id) as i64);
        }
        ids.push(self.sep_id as i64);
        let len = ids.len();
        ids.resize(MAX_LEN, self.pad_id as i64);
        let mut mask = vec![0i64; MAX_LEN];
        mask[..len].fill(1);
        Encoded { input_ids: ids, attention_mask: mask }
    }

    /// 最小 WordPiece：按 Unicode 标量切分，逐字符最长匹配（≤100 步内）
    /// + `##` 续接词表条目。
    fn word_pieces<'a>(&'a self, text: &'a str) -> impl Iterator<Item = String> + 'a {
        let chars: Vec<char> = text.chars().collect();
        let mut out: Vec<String> = Vec::new();
        let mut i = 0usize;
        while i < chars.len() {
            // 词表条目可能跨多字符（常见中文词/符号）——最长匹配（≤100 步）
            let mut matched: Option<(usize, String)> = None; // (消费字符数, token)
            let max_step = (chars.len().saturating_sub(i)).min(100);
            for step in (1..=max_step).rev() {
                let cand: String = chars[i..i + step].iter().collect();
                if self.word_to_id.contains_key(&cand) {
                    matched = Some((step, cand));
                    break;
                }
            }
            let (consumed, token) = match matched {
                Some(m) => m,
                None => {
                    // 单字符未命中 → 尝试 ## 续接形式（模型词表可能只存 ##xx）
                    let ch: String = chars[i..i + 1].iter().collect();
                    let cont = format!("##{ch}");
                    if self.word_to_id.contains_key(&cont) {
                        out.push(cont);
                    } else {
                        out.push(self.unk_id_token_name());
                    }
                    i += 1;
                    continue;
                }
            };
            out.push(token);
            i += consumed;
        }
        out.into_iter()
    }

    /// UNK 名称（仅测试/诊断用——真实 token 由 unk_id 索引保证一致）
    fn unk_id_token_name(&self) -> String {
        self.tokens.get(self.unk_id as usize).cloned().unwrap_or_else(|| UNK.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造迷你词表（常见字 + [CLS]/[SEP]/[UNK]/[PAD] + 一个 ## 续接）
    fn write_vocab(path: &std::path::Path) {
        let vocab = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "学", "习", "编", "程", "##的", "今天", "好"];
        std::fs::write(path, vocab.join("\n") + "\n").unwrap();
    }

    fn temp_vocab(tag: &str) -> BertTokenizer {
        // 用例级唯一目录（并行测试共享 pid 目录会互删互踩——race 源）
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("entropy-bpe-{tag}-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("vocab.txt");
        write_vocab(&path);
        BertTokenizer::load(&path).unwrap()
    }

    #[test]
    fn load_rejects_incomplete_vocab() {
        let dir = std::env::temp_dir().join(format!("entropy-bpe-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("vocab.txt");
        std::fs::write(&p, "学\n习\n").unwrap();
        assert!(BertTokenizer::load(&p).is_err(), "缺特殊标记必须加载失败");
        assert!(BertTokenizer::load(&dir.join("none.txt")).is_err());
    }

    #[test]
    fn encode_has_cls_sep_pad_and_mask() {
        let tok = temp_vocab("cls");
        let e = tok.encode("今天学习编程");
        assert_eq!(e.input_ids.len(), MAX_LEN);
        assert_eq!(e.input_ids[0], tok.cls_id as i64);
        // 尾随 SEP（紧跟在内容后）
        let first_pad = e.input_ids.iter().position(|&v| v == tok.pad_id as i64).unwrap_or(MAX_LEN);
        assert_eq!(e.input_ids[first_pad - 1], tok.sep_id as i64, "SEP 在内容后、pad 前");
        // mask：1..=内容+CLS+SEP 段，其余 0
        let ones = e.attention_mask.iter().filter(|&&m| m == 1).count();
        assert_eq!(ones, first_pad, "mask 段与真实 token 数一致（截断窗内）");
        // 词表内字应编码为自身 id 而非 UNK
        assert!(e.input_ids[1..first_pad - 1].iter().all(|&v| v != tok.unk_id as i64), "词表内字不得回落 UNK");
    }

    #[test]
    fn unknown_char_falls_back_to_unk_without_panic() {
        let tok = temp_vocab("unk");
        let e = tok.encode("学习 🚀 编程");
        let unk = tok.unk_id as i64;
        assert!(e.input_ids.contains(&unk), "未登录字符 → UNK 诚实降级");
        assert_eq!(e.input_ids.len(), MAX_LEN);
    }

    #[test]
    fn long_text_truncated_to_window() {
        let tok = temp_vocab("long");
        let long = "学".repeat(3000);
        let e = tok.encode(&long);
        // 内容 token 数 = MAX_LEN-2（CLS+SEP 占位）
        let content_len = e.attention_mask.iter().filter(|&&m| m == 1).count() - 2;
        assert_eq!(content_len, MAX_LEN - 2);
    }
}
