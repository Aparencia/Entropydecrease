//! 画面档 / 档案三维运行期（live_session_frame.rs 的拆分子模块）。
//!
//! @ai-context: 采样 tick 上的**档案决策三块**集中于此——①画面价值观测注入（帧切换
//!              上升沿 + OCR 面积）与升档静默/降档确认；②`profile_override` 三维热切换
//!              消费（command 写入，本 worker 是唯一消费者，`guard.take()`）；③领域
//!              自动重评（150s 窗口 + B站选集 OCR 证据 + ASR 开场白）。
//! @ai-context: 锁顺序（不得倒置，D3 相邻约束）：消费 override 时持 `profile_override`
//!              → 取 `applied_tier`（同拍），emit 在持锁中发出；即
//!              `profile_override → applied_tier/applied_profile`。
//! @ai-context: 副作用 = `scheduler.retune`（采样档变更）/ 写 `applied_tier`、
//!              `applied_profile` 共享槽 / `app.emit`（live:tier-changed、
//!              live:tier-downgrade-request、live:profile-updated）/ 防御性 eprintln。
//!              领域重评读 `subtitle_segments` 时守卫保持短（仅 filter/map/join）。

use tauri::Emitter;

use super::FrameWorkerState;

impl FrameWorkerState {
    /// 采样 tick 的档案决策拍（tier 观测 → 升降档 → override 消费 → 领域重评）。
    ///
    /// @ai-context: `now_ms` 由调用方注入（同一采样 tick 内、process_frame **之后**
    ///              现取的补偿纪元毫秒）——顺序不可前移：tier 观测依赖
    ///              `stats.diff_pass/ocr_ok` 在本拍 `process_frame` 内已更新。
    pub(super) fn profile_tick(&mut self, now_ms: u64) {
        // v0.9.0 M2（REQ-189）：画面价值观测注入（每采样 tick）——帧切换
        // 上升沿（diff_pass 增量）、OCR 面积占比（ocr_ok 增量：本版以
        // 固定 0.4 近似——全帧变化路径即画面有文字；区域构成留 M4 迭代）
        // @review C12: has_structure 恒 false(区域构成信号暂缺实际注入)
        self.tier_observer.observe(
            now_ms / 1000,
            self.stats.diff_pass > self.last_tier_diff_pass,
            (self.stats.ocr_ok > self.last_tier_ocr_ok).then_some(0.4),
            false,
        );
        self.last_tier_diff_pass = self.stats.diff_pass;
        self.last_tier_ocr_ok = self.stats.ocr_ok;
        // 重评窗口结算后：升档静默生效（retune 采样器）；降档需确认——
        // 确认结果经 tier_override 共享状态回流（前端 confirm_tier_downgrade）
        if let Some(new_tier) = self.tier_observer.current_tier() {
            let applied = self.tier_applied_tier;
            if applied != Some(new_tier) {
                let change = crate::video_tier_detect::decide_change(applied, Some(new_tier));
                let budget = crate::video_profile_spec_data::sampling_for_tier(new_tier);
                match change {
                    crate::video_tier_detect::TierChange::UpgradeSilent
                    | crate::video_tier_detect::TierChange::None => {
                        // 升档/首定档静默应用（更积极采样无损失）；同档无需动作
                        self.scheduler.retune(budget);
                        self.tier_applied_tier = Some(new_tier);
                        if let Ok(mut guard) = self.applied_tier.lock() {
                            *guard = Some(new_tier);
                        }
                        let _ = self.app.emit(
                            "live:tier-changed",
                            serde_json::json!({
                                "tier": new_tier.as_str(),
                                "reason": "upgrade-silent",
                            }),
                        );
                    }
                    crate::video_tier_detect::TierChange::DowngradeConfirm => {
                        // 降档需确认：读取共享确认状态——用户已确认 → 应用；
                        // 未确认 → 保持现状档（不丢信息），下轮重评再询
                        let confirmed = self.tier_override
                            .lock()
                            .ok()
                            .and_then(|g| *g)
                            .filter(|t| *t == new_tier);
                        if confirmed.is_some() {
                            self.scheduler.retune(budget);
                            self.tier_applied_tier = Some(new_tier);
                            if let Ok(mut guard) = self.applied_tier.lock() {
                                *guard = Some(new_tier);
                            }
                            if let Ok(mut guard) = self.tier_override.lock() {
                                *guard = None;
                            }
                            let _ = self.app.emit(
                                "live:tier-changed",
                                serde_json::json!({
                                    "tier": new_tier.as_str(),
                                    "reason": "downgrade-confirmed",
                                }),
                            );
                        } else {
                            let _ = self.app.emit(
                                "live:tier-downgrade-request",
                                serde_json::json!({
                                    "from": self.tier_applied_tier.map(|t| t.as_str()),
                                    "to": new_tier.as_str(),
                                }),
                            );
                        }
                    }
                }
            }
        }
        // ── v0.11.5 Task 6: 消费档案三维覆写 ──
        if let Ok(mut guard) = self.profile_override.lock() {
            if let Some(po) = guard.take() {
                let mut changed = false;
                if let Some(t) = po.tier {
                    let budget = crate::video_profile_spec_data::sampling_for_tier(t);
                    self.scheduler.retune(budget);
                    self.tier_applied_tier = Some(t);
                    if let Ok(mut ag) = self.applied_tier.lock() { *ag = Some(t); }
                    changed = true;
                }
                if let Some(f) = po.form { self.current_form = Some(f); changed = true; }
                // v0.11.5 审查修复（A3）：domain 为 None（用户未选领域）→
                // 重置锁定，重新启用自动检测（领域重评不再跳过覆盖）；
                // v0.13.6（审查修复）：领域一并清空——避免 emit 出
                // domain=旧/fine=[] 的不一致快照（"领域自动"语义）
                if po.domain.is_none() && self.domain_user_locked {
                    self.domain_user_locked = false;
                    self.current_domain_kind = None;
                    self.current_fine_ids.clear();
                }
                if let Some(d) = po.domain {
                    self.current_domain_kind = Some(d);
                    // 用户手动覆写 → 锁定该维度（重评不覆盖）
                    self.domain_user_locked = true;
                    changed = true;
                    // v0.13.6（REQ-220）：细目随领域覆写（空=仅粗领域，合法）
                    self.current_fine_ids = po.fine.clone();
                }
                if changed {
                    let snapshot = crate::live_session::ProfileOverride {
                        form: self.current_form,
                        tier: self.tier_applied_tier,
                        domain: self.current_domain_kind,
                        fine: self.current_fine_ids.clone(),
                    };
                    if let Ok(mut ag) = self.applied_profile.lock() { *ag = Some(snapshot); }
                    let _ = self.app.emit("live:profile-updated", serde_json::json!({
                        "form": self.current_form.map(|f| f.as_str()),
                        "tier": self.tier_applied_tier.map(|t| t.as_str()),
                        "domain": self.current_domain_kind.map(|d| d.as_str()),
                        "fine": self.current_fine_ids,
                    }));
                } else {
                    // v0.11.5 审查修复（A2）：override 取到全空值（command 层
                    // 应已拒绝全空，此为防御）
                    eprintln!("[LiveSession] profile_override 取到全空值（command 层应已拒绝全空，此为防御）");
                }
            }
        }
        // ── v0.11.5 Task 6: 领域自动重评（同画面档窗口节拍）──
        let profile_reeval_now = now_ms / 1000;
        if profile_reeval_now >= self.last_profile_reeval_secs + 150 {
            self.last_profile_reeval_secs = profile_reeval_now;
            // v0.11.5 Task 7: B站 选集 OCR 证据增强——标题确认 B站 且累计
            // OCR 中选集命中（`P3/12`/`第X集`，adapt_bilibili_episode 解析）
            // → 累计 OCR 文本提升为平台证据（命中才加权，不命中不惩罚）
            let mut platform_tags: Vec<String> = Vec::new();
            if crate::platform_adapter::infer_platform(
                Some(&self.window_title),
                None,
            ) == Some(crate::platform_adapter::PlatformKind::Bilibili)
                && self.accumulated_ocr_text
                    .iter()
                    .any(|t| crate::platform_adapter::adapt_bilibili_episode(t).is_some())
            {
                platform_tags = self.accumulated_ocr_text.clone();
            }
            // v0.11.5 Task 7: ASR 开场白——前 30s 段文本（现有段累计可达，
            // 不为它新建数据流）；无段 → None 诚实降级
            let asr_opening: Option<String> = self.subtitle_segments
                .lock()
                .ok()
                .map(|g| {
                    g.iter()
                        .filter(|s| s.start_ms <= 30_000)
                        .map(|s| s.text.clone())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|t| !t.trim().is_empty());
            let domain_signal = crate::video_profile_domain::DomainSignals {
                title: Some(self.window_title.clone()),
                platform_tags,
                user_confirmed: None,
                term_freq: self.accumulated_ocr_text.clone(),
                asr_opening,
            };
            let detected = crate::video_profile_domain::detect_domain(&domain_signal);
            // 终审 I-1：用户已手动覆写领域 → 跳过自动覆盖（用户裁决优先）
            if !self.domain_user_locked
                && detected.kind.is_some()
                && detected.kind != self.current_domain_kind
                && detected.confidence >= 0.6
            {
                self.current_domain_kind = detected.kind;
                // v0.13.6：自动重评命中的细目随之生效（curated 预选；空则仅粗领域）
                self.current_fine_ids = detected.fine_ids;
                let snapshot = crate::live_session::ProfileOverride {
                    form: self.current_form,
                    tier: self.tier_applied_tier,
                    domain: self.current_domain_kind,
                    fine: self.current_fine_ids.clone(),
                };
                if let Ok(mut ag) = self.applied_profile.lock() { *ag = Some(snapshot); }
                let _ = self.app.emit("live:profile-updated", serde_json::json!({
                    "form": self.current_form.map(|f| f.as_str()),
                    "tier": self.tier_applied_tier.map(|t| t.as_str()),
                    "domain": self.current_domain_kind.map(|d| d.as_str()),
                    "fine": self.current_fine_ids,
                }));
            }
        }
    }
}
