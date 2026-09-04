/**
 * RefineLaunchDialog — 精修发起对话框（v0.17.0 REQ-245）。
 *
 * @ai-context: 编排层：策略选区（RefineStrategyPicker）+ 提示词实时预览
 *              （ai_refine_prompt_preview——与实发同一 build_system 路径，
 *              所见即所发）+ 成本确认（沿用 REQ-143 预估/余额/记住选择）+
 *              授权卡（未同意先授权——与 AiRefineCard 同红线）。
 * @ai-context: 记忆：选择变化即存 localStorage（refineStrategy.ts——
 *              下次打开恢复上次选择）；确认启动后任务轮询由调用方接管
 *              （onStarted 回传 taskId）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiSettingsView, BalanceView, RefineEstimateView, RefineStrategyMeta } from "../types";
import {
  draftFromPrefs, loadDraft, sanitizeDraft, saveDraft, toOverride, type StrategyDraft,
} from "../utils/refineStrategy";
import RefineStrategyPicker from "./RefineStrategyPicker";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

export default function RefineLaunchDialog({
  sessionId, noteId, noteContent, noteProfile,
  onClose, onStarted,
}: {
  /** 会话级目标（会话→笔记精修；与 noteId 二选一） */
  sessionId?: number;
  /** 笔记级目标（手写/任意笔记精修——编辑态直接传当前内容，所见即所修） */
  noteId?: number;
  /** 笔记级：编辑器当前内容（未保存编辑稿；None=读库已存内容） */
  noteContent?: string | null;
  /** 笔记级：内容档案（默认 handwritten 笔记式——采集端零改动） */
  noteProfile?: string | null;
  onClose: () => void;
  /** 目标已启动（targetId=会话或笔记 id，taskId=任务 id） */
  onStarted: (targetId: number, taskId: number) => void;
}) {
  const isNote = noteId != null;
  const targetId = isNote ? noteId! : sessionId ?? 0;
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [meta, setMeta] = useState<RefineStrategyMeta | null>(null);
  const [estimate, setEstimate] = useState<RefineEstimateView | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [draft, setDraft] = useState<StrategyDraft | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewErr, setPreviewErr] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const [starting, setStarting] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 装载：设置（授权态/策略默认）+ 策略声明 + 预估 + 余额（并行）
  useEffect(() => {
    void (async () => {
      const [st, mt] = await Promise.all([
        invoke<AiSettingsView>("ai_get_settings").catch(() => null),
        invoke<RefineStrategyMeta>("ai_refine_strategy_meta").catch(() => null),
      ]);
      setSettings(st);
      setMeta(mt);
      if (mt) {
        // 记忆恢复优先（REQ-279 净化：拒绝旧版污染的 standard 残留/空自定义），
        // 其次设置全局默认（draftFromPrefs 覆盖 standard 兜底）
        const saved = sanitizeDraft(loadDraft(), mt);
        setDraft(saved ?? draftFromPrefs(st?.refineStrategy, mt));
      }
      setEstimate(
        await invoke<RefineEstimateView>(
          isNote ? "ai_note_refine_estimate" : "ai_refine_estimate",
          isNote ? { noteId, content: noteContent ?? null } : { sessionId },
        ).catch(() => null),
      );
      setBalance(await invoke<BalanceView>("ai_get_balance").catch(() => null));
    })();
  }, [targetId, isNote, noteId, noteContent, sessionId]);

  // 提示词预览（防抖 250ms——选择变化即刷新；与实发同一代码路径）
  useEffect(() => {
    if (!draft) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void invoke<string>("ai_refine_prompt_preview", isNote
        ? { profile: noteProfile ?? "handwritten", strategy: toOverride(draft) }
        : { sessionId, strategy: toOverride(draft) })
        .then((s) => { setPreview(s); setPreviewErr(""); })
        .catch((e) => setPreviewErr(String(e)));
    }, 250);
    return () => clearTimeout(previewTimer.current);
  }, [draft, sessionId, isNote, noteProfile]);

  /** 选择变化（picker 回调）：更新草稿 + 记忆 */
  const handleDraftChange = useCallback((d: StrategyDraft) => {
    setDraft(d);
    saveDraft(d);
  }, []);

  const est = estimate?.estimate;
  const selectable = useMemo(() => draft !== null, [draft]);

  /** 确认启动（策略随任务级覆盖传入；会话级/笔记级双命令） */
  const confirm = async () => {
    if (!draft) return;
    // REQ-279 前端守卫：自定义档空文本 = 无效（后端会按标准精修兜底——先诚实提示）
    if (draft.presetId === "custom" && !(draft.customText ?? "").trim()) {
      setMsg("自定义档需先写下具体处理要求（或改选其它档位）");
      return;
    }
    setMsg("");
    setStarting(true);
    if (remember) {
      await invoke("ai_update_settings", {
        settings: { ...settings, rememberCostChoice: true },
      }).catch(() => undefined);
    }
    const handle = await invoke<{ taskId: number }>(
      isNote ? "ai_note_refine_start" : "ai_refine_start",
      isNote
        ? { noteId, content: noteContent ?? null, profile: noteProfile ?? null, authorized: true, strategy: toOverride(draft) }
        : { sessionId, authorized: true, strategy: toOverride(draft) },
    ).catch((e) => {
      setMsg(`启动失败：${e}`);
      setStarting(false);
      return null;
    });
    if (handle) onStarted(targetId, handle.taskId);
  };

  /** 同意授权（首次：说明已读，继续） */
  const consent = async () => {
    await invoke("ai_set_authorized", { authorized: true }).catch(() => undefined);
    setSettings(settings ? { ...settings, authorized: true } : settings);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ width: 680, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
          background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>✨ AI 精修</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{isNote ? `笔记 · ${noteId}` : `会话 · ${sessionId}`}</span>
        </div>

        {/* 授权卡（首次：上传说明 + 同意） */}
        {!settings?.authorized && (
          <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>首次使用需授权</div>
            精修将上传<strong>转写文本、笔记内容与最小上下文</strong>至 AI 服务；本地优先铁律：<strong>音视频/图像永不出本机</strong>。是否同意？
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none" }} onClick={() => void consent()}>同意并继续</button>
              <button style={btn} onClick={onClose}>暂不</button>
            </div>
          </div>
        )}

        {/* 策略选区 */}
        {selectable && (
          <RefineStrategyPicker meta={meta} value={draft!} onChange={handleDraftChange} />
        )}

        {/* 提示词预览（只读·实时·同代码路径） */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>提示词预览（随选择实时更新）</span>
            <button
              style={{ ...btn, padding: "2px 8px", fontSize: 11 }}
              onClick={() => { void navigator.clipboard.writeText(preview).catch(() => undefined); }}
            >
              📋 复制
            </button>
          </div>
          <textarea
            readOnly
            value={preview}
            placeholder={previewErr || "提示词组装中…"}
            style={{ width: "100%", height: 110, fontSize: 11, fontFamily: "monospace",
              border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, color: "#374151",
              background: "#f9fafb", resize: "none" }}
          />
        </div>

        {/* 成本确认行 */}
        {est && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#374151" }}>
            预估 token：<strong>{est.estTokens}</strong> · 预估费用：<strong>¥{est.estCostYuan.toFixed(4)}</strong>
            {est.pricePer1m === 0 && <span style={{ color: "#0d9488" }}>（当前模型免费档 ¥0）</span>}
            {balance && (
              <span style={{ marginLeft: 8 }}>
                余额 <strong>¥{balance.balance.totalBalance.toFixed(2)}</strong>
                {balance.lowBalanceWarning && <span style={{ color: "#dc2626", marginLeft: 4 }}>⚠️ {balance.lowBalanceWarning}</span>}
              </span>
            )}
            <label style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              记住此选择，下次不再确认
            </label>
          </div>
        )}
        {!est && <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>成本预估加载中…（无预估则无法启动，请重试）</div>}
        {msg && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>{msg}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button style={btn} onClick={onClose}>取消</button>
          <button
            style={{ ...btn, background: "#4f46e5", color: "#fff", border: "none",
              opacity: selectable && !starting ? 1 : .5 }}
            disabled={!selectable || starting}
            onClick={() => void confirm()}
          >
            {starting ? "启动中…" : "确认并精修 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
