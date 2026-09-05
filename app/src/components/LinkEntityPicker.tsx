/**
 * LinkEntityPicker — 挂体系目标选择器（REQ-286，v0.19.7）。
 *
 * @ai-context: 取代旧「Tab+第二下拉」：搜索输入即过滤（本地数据已在手）；
 *              列表行点击=选中挂接目标（问题行同时充当"其下新建"的父锚点）；
 *              输入非空即出现「＋ 新建『xx』」操作行（Enter 同效，零命中新建
 *              语义）——建后由父层回填选中。纯受控展示，加载/创建/列表刷新
 *              由父层（NoteLinkToSystem）负责。
 * @ai-context: 边界如实声明——行列表键盘 ↑↓ 导航列入全局观察项（§2.9 约定，
 *              本组件提供 Esc 两段式：先清输入再请求关闭）；列表为父子同显
 *              的树形缩进视图（父锚点可视化），非平铺下拉。
 */
import { useMemo, useState } from "react";

export interface LinkRow {
  id: number;
  label: string;
  /** 树形缩进深度（问题节点父子层级；概念/模型恒 0） */
  depth: number;
}

interface Props {
  rows: LinkRow[];
  selectedId: number | null;
  placeholder: string;
  /** 新建动作文案前缀（「问题」「概念」「模型」） */
  kindLabel: string;
  /** 无选中锚点时的新建落点说明（如「体系根」） */
  rootAnchorLabel: string;
  onPick: (id: number) => void;
  /** 新建（name 非空；anchorId=选中的问题节点，None=体系根）。成功 resolve、失败 throw */
  onCreate: (name: string, anchorId: number | null) => Promise<void>;
  /** Esc 第二段（输入已空）请求关闭浮层 */
  onClose?: () => void;
}

const rowBtn = (selected: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  fontSize: 12,
  padding: "3px 6px",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  background: selected ? "#f0fdfa" : "transparent",
  color: selected ? "#0f766e" : "#374151",
});

export default function LinkEntityPicker({
  rows, selectedId, placeholder, kindLabel, rootAnchorLabel,
  onPick, onCreate, onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const kw = query.trim().toLowerCase();
  const visible = useMemo(
    () => (kw ? rows.filter((r) => r.label.toLowerCase().includes(kw)) : rows),
    [rows, kw],
  );
  // 选中行对象（父锚点说明用）；节点 tab 的选中行=挂接目标=新建父锚
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const doCreate = async () => {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onCreate(name, selectedId ?? null);
      // 成功：清空搜索（父层已重载列表并回填选中——行高亮可见）
      setQuery("");
    } catch (e) {
      setErr(`新建失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        data-testid="note-link-search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setErr(""); }}
        onKeyDown={(e) => {
          // 审查 D3：IME 中文组词回车（isComposing）不触发动作
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            const name = query.trim();
            if (!name || busy) return;
            // 审查 D2：Enter=有命中选首项（spec §2.5），零命中才新建
            if (visible.length > 0) {
              onPick(visible[0].id);
              setQuery("");
            } else {
              void doCreate();
            }
          } else if (e.key === "Escape") {
            if (query) setQuery("");
            else onClose?.();
          }
        }}
        placeholder={placeholder}
        style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
      />
      <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #f3f4f6", borderRadius: 6, padding: 2 }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: "#9ca3af", padding: "6px 4px" }}>
            {kw ? `没有匹配——可直接回车新建「${query.trim()}」` : "暂无内容"}
          </div>
        )}
        {visible.map((r) => (
          <button
            key={r.id}
            data-testid={`note-link-row-${r.id}`}
            onClick={() => onPick(r.id)}
            style={rowBtn(selectedId === r.id)}
          >
            <span style={{ display: "inline-block", width: r.depth * 12 }} />
            {selectedId === r.id ? "✓ " : ""}
            {r.label}
          </button>
        ))}
      </div>
      {query.trim() && (
        <button
          data-testid="note-link-create"
          disabled={busy}
          onClick={() => void doCreate()}
          style={{
            fontSize: 12, padding: "4px 6px", borderRadius: 6, cursor: busy ? "default" : "pointer",
            border: "1px solid #4f46e5", background: "#eef2ff", color: "#3730a3",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "创建中…" : `＋ 新建${kindLabel}「${query.trim()}」${selected ? `（于「${selected.label.slice(0, 12)}」下）` : `（${rootAnchorLabel}）`}`}
        </button>
      )}
      {!query.trim() && selected && (
        <div style={{ fontSize: 10, color: "#6b7280" }}>
          已选「{selected.label.slice(0, 16)}」——输入新名称可在其下新建{kindLabel}
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: "#dc2626" }}>{err}</div>}
    </div>
  );
}
