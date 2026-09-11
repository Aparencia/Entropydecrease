//! 档案记忆偏好域（REQ-043 / v0.7.2 REQ-152 系列键 / v0.9.0 REQ-188 四维形态 / v0.13.6 REQ-222 领域记忆）。
//!
//! @ai-context: 从 video_profile.rs 拆出（AGENTS.md §3 单文件 ≤300 行）：记忆偏好 =
//!              「用户确认过一次 → 同窗口标题/同系列下次直接生效」。三条通道互相独立：
//!              kind/form 走 entries，domain 走 domain_entries（防 domain-only 条目把
//!              legacy kind 结果染成 Unknown）；三者的 tie-break 一律「最长关键词优先」
//!              （len > best 严格大于 ⇒ 等长时先入条目胜出）。
//! @ai-context: 副作用 = 文件 IO：load 读 JSON（缺失/损坏回落空库，不阻断启动）；
//!              save 先写 .tmp 再 rename（原子写，防写一半损坏记忆库）。调用方保证
//!              路径与并发（本域无锁、无 tauri state，可 tempfile 单测）。
//! @ai-context: 序列键：标题可识别系列（P/集/EP）时存系列名而非完整标题，同系列各集
//!              共享记忆；键规则单一来源 memory_key（MemoryEntry/DomainMemoryEntry 共用）。
//! @ai-context: 可见性：ProfileMemory 及其方法签名逐字沿用原文件；pub 类型由父模块
//!              `pub use memory::{…}` 再导出（既有导入路径零改动）。

use super::*;

/// 记忆偏好条目：窗口标题关键词 → 用户确认过的档案。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub keyword: String,
    pub kind: ProfileKind,
    /// v0.7.2（REQ-152）：系列键标记——键是剥离序号后的系列名（true），
    /// 同系列各集共享记忆；旧 JSON 缺省 false（零回归）。
    #[serde(default)]
    pub is_series: bool,
    /// v0.9.0（REQ-188）：四维形态记忆（旧 13 类 kind 的映射结果；
    /// 旧 JSON 缺省 None → 读取时经 kind.to_form() 映射，零迁移风险）。
    #[serde(default)]
    pub form: Option<crate::video_profile_spec::ContentForm>,
}

/// v0.13.6（REQ-222）：领域记忆条目——coarse+细目 id（用户确认即记忆）。
///
/// @ai-context: 与 MemoryEntry（kind/form 通道）**分离**：领域记忆不参与 lookup()
///              的 kind 匹配——防 domain-only 条目把 legacy kind 结果染成 Unknown；
///              检索走 lookup_domain（同最长关键词/series 键规则）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DomainMemoryEntry {
    pub keyword: String,
    /// series 键标记（与 MemoryEntry.is_series 同口径）
    #[serde(default)]
    pub is_series: bool,
    /// 用户确认的领域（粗 + 细目 id 多选）；空 fine=仅粗领域（合法——不阻塞）
    #[serde(default)]
    pub domain: crate::video_profile_spec::DomainTag,
}

/// 记忆偏好库（JSON 持久化；同 vocab 模式：路径可注入，测试用 tempfile）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ProfileMemory {
    pub entries: Vec<MemoryEntry>,
    /// v0.13.6（REQ-222）：领域记忆独立通道（旧 JSON 缺省空——零迁移）
    #[serde(default)]
    pub domain_entries: Vec<DomainMemoryEntry>,
}

impl ProfileMemory {
    /// 从磁盘加载；文件不存在/损坏 → 空库（防御：不阻断启动）。
    pub fn load(path: &std::path::Path) -> Self {
        let Ok(raw) = std::fs::read_to_string(path) else { return Self::default() };
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 原子写（先 .tmp 再 rename，防写一半损坏记忆库）。
    pub fn save(&self, path: &std::path::Path) -> crate::error::Result<()> {
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Io(format!("序列化档案记忆失败: {}", e)))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 按窗口标题查询记忆偏好：标题包含某条 keyword 即命中（同窗口标题下次直接生效）。
    ///
    /// @ai-context: 最长关键词优先（"网课-数学" 应命中更长更具体的条目）。
    /// @ai-context: v0.7.2（REQ-152）：先试**系列键**——标题可识别系列（P/集/EP 等）
    ///              时用系列名匹配，P1 确认过的档案 P5 直接生效（修复标题序号
    ///              变化导致的记忆失配）；系列未命中回退完整标题 contains（现状）。
    pub fn lookup(&self, title: &str) -> Option<ProfileKind> {
        if let Some(info) = crate::series_detect::extract_series(title) {
            if let Some(kind) = self.lookup_best(&info.series) {
                return Some(kind);
            }
        }
        self.lookup_best(title)
    }

    /// 最长关键词优先匹配（纯函数）。
    fn lookup_best(&self, key: &str) -> Option<ProfileKind> {
        let mut best: Option<(usize, ProfileKind)> = None;
        for e in &self.entries {
            if key.contains(&e.keyword) && !e.keyword.is_empty() {
                let len = e.keyword.chars().count();
                if best.as_ref().is_none_or(|(bl, _)| len > *bl) {
                    best = Some((len, e.kind));
                }
            }
        }
        best.map(|(_, kind)| kind)
    }

    /// 记录用户确认（关键词已存在则覆盖档案；新增追加）。
    ///
    /// @ai-context: v0.7.2（REQ-152）：标题可识别系列 → 存**系列键**（is_series=true，
    ///              同系列各集共享）；否则存完整标题（现状行为零回归）。
    pub fn remember(&mut self, keyword: &str, kind: ProfileKind) {
        let form = kind.to_form();
        self.remember_with_form(keyword, kind, form);
    }

    /// 记录用户确认（四维形态优先版，REQ-188）：kind 存代表旧类（消费端兼容），
    /// form 存新形态（检测卡 v2 下次直接生效——同标题/同系列）。
    ///
    /// @ai-context: form 为 None（Unknown 等无可映射形态）时仅记 kind——
    ///              形态维度诚实未知，不猜默认；读取时 lookup_form 返回 None。
    pub fn remember_form(&mut self, keyword: &str, form: crate::video_profile_spec::ContentForm) {
        let kind = crate::video_profile_spec_data::legacy_kind_for_form(form);
        self.remember_with_form(keyword, kind, Some(form));
    }

    /// 记录内部实现（series 键剥离 + 条目覆盖/追加 + form 同步）。
    fn remember_with_form(
        &mut self,
        keyword: &str,
        kind: ProfileKind,
        form: Option<crate::video_profile_spec::ContentForm>,
    ) {
        let (key, is_series) = Self::memory_key(keyword);
        if key.is_empty() {
            return;
        }
        if let Some(e) = self.entries.iter_mut().find(|e| e.keyword == key) {
            e.kind = kind;
            e.is_series = is_series;
            e.form = form;
        } else {
            self.entries.push(MemoryEntry { keyword: key, kind, is_series, form });
        }
    }

    /// 记忆键归一化（series 剥离；空键 → None 语义由调用方拒绝）。
    ///
    /// @ai-context: MemoryEntry/DomainMemoryEntry 共用——键规则单一来源防漂移。
    fn memory_key(keyword: &str) -> (String, bool) {
        let keyword = keyword.trim().to_string();
        if keyword.is_empty() {
            return (keyword, false);
        }
        match crate::series_detect::extract_series(&keyword) {
            Some(info) => (info.series, true),
            None => (keyword, false),
        }
    }

    /// 记录用户确认的领域（coarse+细目多选；REQ-222）——同标题/系列下次直接生效。
    ///
    /// @ai-context: 独立通道（DomainMemoryEntry）不污染 kind/form 记忆；
    ///              细目为空（仅粗领域）同样合法；空键拒绝（不记悬挂条目）。
    pub fn remember_domain(&mut self, keyword: &str, domain: &crate::video_profile_spec::DomainTag) {
        let (key, is_series) = Self::memory_key(keyword);
        if key.is_empty() {
            return;
        }
        if let Some(e) = self.domain_entries.iter_mut().find(|e| e.keyword == key) {
            e.is_series = is_series;
            e.domain = domain.clone();
        } else {
            self.domain_entries.push(DomainMemoryEntry {
                keyword: key,
                is_series,
                domain: domain.clone(),
            });
        }
    }

    /// 按标题查询领域记忆（REQ-222）：series 键优先，完整标题兜底；最长关键词优先。
    pub fn lookup_domain(&self, title: &str) -> Option<crate::video_profile_spec::DomainTag> {
        if let Some(info) = crate::series_detect::extract_series(title) {
            if let Some(tag) = self.lookup_domain_best(&info.series) {
                return Some(tag);
            }
        }
        self.lookup_domain_best(title)
    }

    /// 最长关键词优先匹配（纯函数；领域记忆专用通道）。
    fn lookup_domain_best(&self, key: &str) -> Option<crate::video_profile_spec::DomainTag> {
        let mut best: Option<(usize, crate::video_profile_spec::DomainTag)> = None;
        for e in &self.domain_entries {
            if key.contains(&e.keyword) && !e.keyword.is_empty() {
                let len = e.keyword.chars().count();
                if best.as_ref().is_none_or(|(bl, _)| len > *bl) {
                    best = Some((len, e.domain.clone()));
                }
            }
        }
        best.map(|(_, tag)| tag)
    }

    /// 按标题查询四维形态记忆（REQ-188）：form 优先，旧条目经 kind 映射兜底。
    ///
    /// @ai-context: 消费端 v2（检测卡/会话落库）用本方法；旧 lookup 保留为
    ///              13 类兼容（零回归）。序列键剥离逻辑与 lookup 同口径。
    pub fn lookup_form(&self, title: &str) -> Option<crate::video_profile_spec::ContentForm> {
        if let Some(info) = crate::series_detect::extract_series(title) {
            if let Some(form) = self.lookup_form_best(&info.series) {
                return Some(form);
            }
        }
        self.lookup_form_best(title)
    }

    /// 最长关键词优先匹配（纯函数；form 优先、kind 映射兜底）。
    fn lookup_form_best(
        &self,
        key: &str,
    ) -> Option<crate::video_profile_spec::ContentForm> {
        let mut best: Option<(usize, crate::video_profile_spec::ContentForm)> = None;
        for e in &self.entries {
            if key.contains(&e.keyword) && !e.keyword.is_empty() {
                let len = e.keyword.chars().count();
                let form = e
                    .form
                    .or_else(|| e.kind.to_form());
                if let Some(f) = form {
                    if best.as_ref().is_none_or(|(bl, _)| len > *bl) {
                        best = Some((len, f));
                    }
                }
            }
        }
        best.map(|(_, form)| form)
    }
}
