/**
 * ColumnBar — 折叠列的窄条形态（v0.15：组侧栏/列表/大纲整列可收起）。
 *
 * @ai-context: 折叠 ≠ 删除——26px 图标条保留入口（点击展开恢复记忆宽度）；
 *              窄窗自动折叠与手动折叠共用本组件（useColumnLayout.folded 驱动）。
 */
interface Props {
  icon: string;
  title: string;
  onClick: () => void;
}

export default function ColumnBar({ icon, title, onClick }: Props) {
  return (
    <div
      data-testid="column-bar"
      onClick={onClick}
      title={title}
      style={{
        width: 26,
        flexShrink: 0,
        borderRight: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        gap: 8,
        cursor: "pointer",
        background: "#fafafa",
        userSelect: "none",
        fontSize: 14,
      }}
    >
      <span style={{ writingMode: "vertical-rl", fontSize: 11, color: "#6b7280", letterSpacing: 3 }}>
        {icon} {title}
      </span>
    </div>
  );
}
