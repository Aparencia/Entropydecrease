/**
 * FeedFragmentList — 收件箱碎片列表（v0.12.2 收件箱动线；自 feed 组碎片列表改造）。
 *
 * @ai-context: 二元论（用户裁决）——碎片=原料不是短笔记，收件箱只装碎片
 *               （未归组笔记在「全部笔记」，两种实体两条动线）。碎片卡三出口：
 *               ✍ 升为笔记（轻确认：标题预填首句可改 + 归组下拉默认未归组 →
 *               promote_fragment_to_note 事务建笔记+删碎片 → 父层右侧自动打开）、
 *               ⚙ 升为闪卡（promote_fragment_to_card 幂等——已升级/单句无卡
 *               返回 0 不报错）、🗑 删除（二次确认）。
 * @ai-context: 恒常视图——不再依赖 feed 组展开（开关只控制快速记录入口
 *              与后端准入）；空态引导三种归宿（规划 §3）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Fragment, Note, NoteGroup } from "../types";
import { fragmentPreview, promoteTitleFor } from "../utils/inbox";

interface Props {
  /** 碎片列表变更（捕获/升降/删除）后刷新回调——父层重载笔记与计数 */
  onChanged: () => void;
  /** 升笔记成功——父层打开新笔记（右侧自动打开，闭环可见） */
  onPromoted: (note: Note) => void;
}

/** 碎片图片缩略（后端 resolve 校验 → asset 协议；无图/失败降级文本） */
function FragmentThumb({ fragment }: { fragment: Fragment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    if (!fragment.imagePath) {
      setUrl(null);
      return;
    }
    invoke<string | null>("resolve_fragment_image", { fragmentId: fragment.id })
      .then((abs) => {
        if (!disposed && abs) setUrl(convertFileSrc(abs));
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
    // 依赖收窄到稳定基元（对象引用每次 load 都变，会触发无谓重新 resolve）
  }, [fragment.id, fragment.imagePath]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="碎片截图"
      loading="lazy"
      style={{ maxWidth: "100%", maxHeight: 72, borderRadius: 4, border: "1px solid #e5e7eb", marginTop: 4 }}
    />
  );
}

/**
 * 升笔记轻确认表单态（单碎片卡内联展开——零对话框纪律）。
 * 归组下拉选项=全部容器组（碎片收件箱只装碎片，目标必须是笔记容器）。
 */
interface PromoteForm {
  fragmentId: number;
  title: string;
  /** "" = 未归组（默认——落全部笔记可见） */
  groupId: string;
}

export default function FeedFragmentList({ onChanged, onPromoted }: Props) {
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  // 升笔记轻确认表单（单开——同一时间只展开一张卡）
  const [promote, setPromote] = useState<PromoteForm | null>(null);
  // 归组下拉选项（升笔记时惰性加载容器组）
  const [containerGroups, setContainerGroups] = useState<NoteGroup[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // 收件箱只装碎片：全量 active 碎片（不按组——未归组碎片也有归宿）
      const list = await invoke<Fragment[]>("list_fragments", { status: "active", limit: 500 });
      setFragments(list);
      setErr("");
    } catch (e) {
      setErr(`碎片加载失败: ${e}`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  const loadGroupsIfNeeded = useCallback(async () => {
    if (containerGroups) return;
    try {
      const list = await invoke<NoteGroup[]>("list_note_groups", { terrain: null });
      // 目标=笔记容器组（feed 地形是碎片容器——不是笔记去向）
      setContainerGroups(list.filter((g) => g.terrain === "container"));
    } catch {
      setContainerGroups([]); // 组加载失败 → 下拉空（仅未归组可选，诚实降级）
    }
  }, [containerGroups]);

  const openPromote = (f: Fragment) => {
    setPromote({ fragmentId: f.id, title: promoteTitleFor(f.text), groupId: "" });
    void loadGroupsIfNeeded();
  };

  // ✍ 升为笔记（轻确认：后端事务建笔记+删碎片；成功后父层打开新笔记）
  const runPromote = async () => {
    if (!promote) return;
    setBusy(true);
    try {
      const note = await invoke<Note>("promote_fragment_to_note", {
        fragmentId: promote.fragmentId,
        title: promote.title,
        groupId: promote.groupId === "" ? null : Number(promote.groupId),
      });
      setPromote(null);
      setErr("");
      await load();
      onChanged();
      onPromoted(note);
    } catch (e) {
      setErr(`升笔记失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ⚙ 升为闪卡（幂等——已升级/单句无卡返回 0 不报错）
  const runPromoteCard = async (f: Fragment) => {
    setBusy(true);
    try {
      const n = await invoke<number>("promote_fragment_to_card", { fragmentId: f.id });
      setErr("");
      if (n > 0) {
        setErr("");
        await load();
        onChanged();
      }
      // n=0 静默（已升级过或无可出卡素材——不打扰，幂等语义）
    } catch (e) {
      setErr(`升卡失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // 🗑 删除（二次确认；绑定卡保留）
  const runDelete = async (f: Fragment) => {
    if (!window.confirm(`删除这条碎片？\n「${f.text.slice(0, 30)}…」\n（绑定的闪卡会保留）`)) return;
    setBusy(true);
    try {
      await invoke<boolean>("delete_fragment", { fragmentId: f.id });
      await load();
      onChanged();
    } catch (e) {
      setErr(`删除失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
        📥 收件箱 <span style={{ fontWeight: 400, fontSize: 11, color: "#9ca3af" }}>碎片（{fragments.length}）· 原料层</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {loaded && fragments.length === 0 && (
          <div data-testid="inbox-empty" style={{ marginTop: 32, textAlign: "center", color: "#9ca3af", fontSize: 12, padding: "0 16px", lineHeight: 1.8 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🧩</div>
            一句灵感，三种归宿——<br />
            升为笔记沉淀它，升为闪卡复习它，或删除它。
          </div>
        )}

        {fragments.map((f) => (
          <div key={f.id} data-testid={`fragment-card-${f.id}`} style={{ padding: "8px 4px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {fragmentPreview(f.text)}
            </div>
            <FragmentThumb fragment={f} />
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => openPromote(f)}
                disabled={busy}
                data-testid={`promote-note-${f.id}`}
                style={{ fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
                title="升为笔记（沉淀）"
              >
                ✍ 升为笔记
              </button>
              <button
                onClick={() => void runPromoteCard(f)}
                disabled={busy}
                data-testid={`promote-card-${f.id}`}
                style={{ fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
                title="升为闪卡（多句出卡，幂等）"
              >
                ⚙ 升为闪卡
              </button>
              <button
                onClick={() => void runDelete(f)}
                disabled={busy}
                style={{ fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}
                title="删除碎片（绑定卡保留）"
              >
                🗑 删除
              </button>
              <span style={{ fontSize: 9, color: "#d1d5db", marginLeft: "auto" }}>
                {new Date(f.createdAt * 1000).toLocaleDateString()}
              </span>
            </div>

            {/* 升笔记轻确认：内联展开（标题预填首句可改 + 归组下拉默认未归组） */}
            {promote?.fragmentId === f.id && (
              <div data-testid={`promote-form-${f.id}`} style={{ marginTop: 6, padding: 8, background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                <input
                  data-testid="promote-title"
                  value={promote.title}
                  onChange={(e) => setPromote({ ...promote, title: e.target.value })}
                  placeholder="笔记标题…"
                  autoFocus
                  style={{ width: "100%", fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4, boxSizing: "border-box", marginBottom: 4 }}
                />
                <select
                  data-testid="promote-group"
                  value={promote.groupId}
                  onChange={(e) => setPromote({ ...promote, groupId: e.target.value })}
                  style={{ width: "100%", fontSize: 11, padding: "3px 4px", border: "1px solid #e5e7eb", borderRadius: 4, marginBottom: 6, boxSizing: "border-box" }}
                >
                  <option value="">未归组（全部笔记可见）</option>
                  {(containerGroups ?? []).map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.name}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => void runPromote()}
                    disabled={busy || promote.title.trim() === ""}
                    data-testid="promote-confirm"
                    style={{ fontSize: 11, cursor: "pointer", padding: "2px 12px", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
                  >
                    ✓ 确认升笔记
                  </button>
                  <button onClick={() => setPromote(null)} disabled={busy} style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {err && <p data-testid="inbox-error" style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{err}</p>}
      </div>
    </div>
  );
}
