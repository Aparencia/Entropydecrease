/**
 * SystemBadge — 体系徽标（v0.13.7 触点① 组行）。
 *
 * @ai-context: 纯展示——组行小字区显示"该组被哪个体系引用"；点击跳转
 *              体系页（onClick 由父级接线）。linkCount>0 时显示计数，
 *              否则仅名字（零噪音——无引用不出现该组件本身）。
 */
interface Props {
  name: string;
  linkCount: number;
  onClick: () => void;
}

export default function SystemBadge({ name, linkCount, onClick }: Props) {
  return (
    <button
      data-testid="system-badge"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        fontSize: 10, cursor: "pointer", borderRadius: 8, padding: "0 5px",
        background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4",
      }}
      title={linkCount > 0 ? `该组为体系「${name}」提供 ${linkCount} 处引用` : `体系「${name}」`}
    >
      🧭 {name}{linkCount > 0 ? ` · ${linkCount}` : ""}
    </button>
  );
}
