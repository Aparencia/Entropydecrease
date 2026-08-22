/**
 * FeedFragmentList — feed 组碎片列表（v0.11.4 REQ-201；消费闭环 UI）。
 *
 * @ai-context: feed 消费闭环的呈现面——碎片不再是"捕获后看不见"的半截体验：
 *              文本预览 + 图片缩略（resolve_fragment_image 后端校验路径，
 *              convertFileSrc 转 asset 协议）+ 删除/移出组操作 + 空态引导。
 * @ai-context: 删除为真删（用户主动操作），绑定卡自动解绑保留（卡是独立资产）；
 *              开关关闭时入口不可见（父组件控制），命令层另有二次校验。
 * @ai-context: 零新界面纪律——本列表嵌入组侧栏展开区，不新建页面。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Fragment } from "../types";

interface Props {
  groupId: number;
  /** 删除/移出后回调（父组件刷新组列表等） */
  onChanged: () => void;
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

export default function FeedFragmentList({ groupId, onChanged }: Props) {
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await invoke<Fragment[]>("list_group_fragments", { groupId });
      setFragments(list);
      setErr("");
    } catch (e) {
      setErr(`碎片加载失败: ${e}`);
    } finally {
      setLoaded(true);
    }
  }, [groupId]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  const runDelete = async (f: Fragment) => {
    if (!window.confirm(`删除这条碎片？\n「${f.text.slice(0, 30)}…」\n（绑定的闪卡会保留）`)) return;
    try {
      await invoke<boolean>("delete_fragment", { fragmentId: f.id });
      await load();
      onChanged();
    } catch (e) {
      setErr(`删除失败: ${e}`);
    }
  };

  const runUngroup = async (f: Fragment) => {
    try {
      await invoke<boolean>("update_fragment_group", { fragmentId: f.id, groupId: null });
      await load();
      onChanged();
    } catch (e) {
      setErr(`移出组失败: ${e}`);
    }
  };

  return (
    <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: "#374151", fontSize: 12 }}>🧩 碎片（{fragments.length}）</span>
        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>原料层 · 不是笔记</span>
      </div>

      {loaded && fragments.length === 0 && (
        <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0" }}>
          还没有碎片——用上方「碎片捕获」框记几条试试？
        </p>
      )}

      {fragments.map((f) => (
        <div key={f.id} style={{ padding: "6px 0", borderTop: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {f.text.slice(0, 120)}
            {f.text.length > 120 && "…"}
          </div>
          <FragmentThumb fragment={f} />
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <button
              onClick={() => void runUngroup(f)}
              style={{ fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}
              title="移出本组（碎片保留）"
            >
              移出组
            </button>
            <button
              onClick={() => void runDelete(f)}
              style={{ fontSize: 10, cursor: "pointer", padding: "1px 8px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}
              title="删除碎片（绑定卡保留）"
            >
              删除
            </button>
            <span style={{ fontSize: 9, color: "#d1d5db", marginLeft: "auto", alignSelf: "center" }}>
              {new Date(f.createdAt * 1000).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}

      {err && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{err}</p>}
    </div>
  );
}
