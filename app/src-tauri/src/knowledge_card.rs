//! 概念双面体——模型卡卡面纯函数（v0.13.2 REQ-206）。
//!
//! @ai-context: 概念双面体（记忆面×思辨面）单向升格——组内 model 卡（front=概念名、
//!              back=三问）经升格成为体系内概念。本文件定义卡背三问的纯函数契约：
//!              format（compose）与 parse 互为逆；back_has_anchor 判定是否已写回链锚点。
//! @ai-context: 锚点＝独立行 `→ 概念「name」`，整行前缀判定（行首匹配）——防字段值
//!              中部出现"→ 概念「…」"被误判为已锚定（规范 §三），也防升格重复回链。
//! @ai-context: M1 原子层 API 供 M2 command 层接入用（机制先行）；v0.13.2 升格命令
//!              已接线（commands_knowledge_cards*），无 dead_code 残留。

/// 卡背三问（概念双面体：本质 / 边界 / 联系）。
///
/// @ai-context: 三问对应概念三问一用卡片的三个思辨面——本质（它是什么）、
///              边界（适用范围/限制）、联系（与之关联的概念/体系）。任一问缺省
///              表示该卡尚未填写（不代表"无此问"），故用 Option。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ModelCardBack {
    /// 本质（What——它是什么）。
    pub essence: Option<String>,
    /// 边界（Where——适用范围/限制）。
    pub boundary: Option<String>,
    /// 联系（How——与之关联的概念/体系）。
    pub relation: Option<String>,
}

/// 卡背字段标签（内部枚举，无公开语义）。
#[derive(Clone, Copy)]
enum Field {
    Essence,
    Boundary,
    Relation,
}

/// 行首标签判定。
///
/// @ai-context: full-width `：` 为主，半角 `:` 容错——但只在行首（trim 后）匹配，
///              字段值中部出现同名词（如先写"本质"再展开）不误判为标签行。
///              返回 (字段, 标签后内容)。
fn split_label(line: &str) -> Option<(Field, &str)> {
    let t = line.trim_start();
    for (full, half, field) in [
        ("本质：", "本质:", Field::Essence),
        ("边界：", "边界:", Field::Boundary),
        ("联系：", "联系:", Field::Relation),
    ] {
        if let Some(rest) = t.strip_prefix(full) {
            return Some((field, rest));
        }
        if let Some(rest) = t.strip_prefix(half) {
            return Some((field, rest));
        }
    }
    None
}

/// 把字段行拼回值：保留内部换行，trim 首尾空白；空值 → None。
///
/// @ai-context: 契约约定"缺标签/缺字段/空字段 → None"——空问不是"有但为空"，而是
///              信息缺失（缺这一问），落库后前端按 None 渲染占位而非空串。
fn join_trim(lines: &[String]) -> Option<String> {
    let joined = lines.join("\n");
    let trimmed = joined.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// 解析卡背文本为三问（三问契约的 parse 侧）。
///
/// @ai-context: 标签行（行首 `本质：`/`边界：`/`联系：`）是字段值起点，标签后内容为
///              该字段首行；后续非标签行并入当前字段直到下一标签（保留内部换行）。
/// @ai-context: 同名标签后出现者覆盖（后来者胜——重写卡面时旧值作废）；首尾空白经
///              join_trim 折叠。与 format 互为逆（解析后再格式化幂等）。
pub fn parse_model_card_back(back_text: &str) -> ModelCardBack {
    let mut essence: Vec<String> = Vec::new();
    let mut boundary: Vec<String> = Vec::new();
    let mut relation: Vec<String> = Vec::new();
    let mut current: Option<Field> = None;

    for line in back_text.lines() {
        match split_label(line) {
            Some((field, rest)) => {
                let target: &mut Vec<String> = match field {
                    Field::Essence => {
                        essence.clear();
                        &mut essence
                    }
                    Field::Boundary => {
                        boundary.clear();
                        &mut boundary
                    }
                    Field::Relation => {
                        relation.clear();
                        &mut relation
                    }
                };
                target.push(rest.to_string());
                current = Some(field);
            }
            None => match current {
                Some(Field::Essence) => essence.push(line.to_string()),
                Some(Field::Boundary) => boundary.push(line.to_string()),
                Some(Field::Relation) => relation.push(line.to_string()),
                None => {}
            },
        }
    }

    ModelCardBack {
        essence: join_trim(&essence),
        boundary: join_trim(&boundary),
        relation: join_trim(&relation),
    }
}

/// 组合三问为卡背文本（三问契约的 compose 侧）。
///
/// @ai-context: 空字段留 `标签：` 空行（占位不省略）——保证三行契约稳定，parse 可幂等
///              往返；与 create_model_card（M2）的卡面契约一致。
pub fn format_model_card_back(
    essence: Option<&str>,
    boundary: Option<&str>,
    relation: Option<&str>,
) -> String {
    format!(
        "本质：{}\n边界：{}\n联系：{}",
        essence.unwrap_or(""),
        boundary.unwrap_or(""),
        relation.unwrap_or("")
    )
}

/// 判定卡背是否已写回链锚点（升格锚点＝独立行前缀 `→ 概念「`）。
///
/// @ai-context: 整行前缀判定——只有 trim 后整行以 `→ 概念「` 开头才算已锚定；字段值
///              中部出现该标记（如联系里提"→ 概念「凯利」"）不算，防误判为已回链。
///              升格追加锚点时以此幂等（已锚定则不二次追加，见 spec §三）。
pub fn back_has_anchor(back_text: &str) -> bool {
    back_text.lines().any(|l| l.trim().starts_with("→ 概念「"))
}

/// 单测独立文件（保持本文件 ≤300 行，AGENTS.md §3；golden 先行 TDD）。
#[cfg(test)]
#[path = "knowledge_card_tests.rs"]
mod tests;
