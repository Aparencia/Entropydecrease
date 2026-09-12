/**
 * SessionSelectionToolbar — 会话选择模式控件与批量操作栏（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 批 4 交互矩阵的两处 UI：① 具名导出 `SessionSelectionControls` = 列表头部
 *              右侧的「选择」按钮 + 选择模式 chip（点击进入/退出；Esc 由面板统一处理）；
 *              ② 默认导出 = 列表底部批量栏（三态全选框 / 已选计数 / 批量转笔记 /
 *              批量删除 / 取消）。两者的 DOM 位置与拆前一一对应（Controls 嵌在头部
 *              flex 行内，Toolbar 紧随列表区），零 className、全部内联样式。
 * @ai-context 边界（★ 均为等价性红线，不得"顺手统一"）：
 *              ① 全选框三态口径 = **可见行数 visibleCount**（visibleOrder.length，
 *                 不是 filtered）——折叠组隐藏行不在内，这是 P3-1 的修复点；
 *              ② 批量转「转前清选集」、批量删除「成功后清选集」——**不对称**，
 *                 两条动线（含 pending 与清选集时序）由面板的 runBatchConvert /
 *                 runBatchDelete 持有，本组件只上报点击；
 *              ③ batchBusy（state=禁用视觉）与 batchBusyRef（ref=同 tick 防连点）
 *                 必须同属一处（面板）——若把它搬进本组件，批量转清空选集会让
 *                 本组件卸载，pending 期间的连点拦截随之失效；
 *              ④ 批量栏的渲染条件（!hits && !ocrHits && 选集非空）由面板决定，
 *                 本组件不做可见性判断。
 * @ai-context 注意：data-testid `session-select-mode-chip` / `session-select-all`
 *              与文案「批量转笔记」「批量删除」「已选 N 个」是测试锚点，逐字保留。
 */
import { Button } from "../ui/primitives";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface ControlsProps {
  selectionMode: boolean;
  /** 多选集大小（chip 仅在 >0 时显示计数） */
  selectedCount: number;
  onEnter: () => void;
  onExit: () => void;
}

/** 头部：选择模式 chip + 「选择」按钮（再点或 Esc 退出；进入后单击行=勾选） */
export function SessionSelectionControls({ selectionMode, selectedCount, onEnter, onExit }: ControlsProps) {
  return (
    <>
      {/* 批 4：选择模式进入/退出（再点或 Esc 退出；进入后单击行=勾选） */}
      {selectionMode && (
        <span
          data-testid="session-select-mode-chip"
          style={{ fontSize: 10.5, color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 10, padding: "0 6px", background: "#eef2ff", lineHeight: "16px", fontWeight: 400 }}
        >
          选择模式{selectedCount > 0 ? `（${selectedCount}）` : ""}
        </span>
      )}
      <Button
        variant={selectionMode ? "primary" : "secondary"}
        size="sm"
        testId="session-select-mode-btn"
        onClick={() => (selectionMode ? onExit() : onEnter())}
        title={selectionMode ? "退出选择模式（Esc）" : "进入选择模式：单击会话=勾选（Ctrl/Shift 多选）"}
      >
        选择
      </Button>
    </>
  );
}

interface Props {
  selectedCount: number;
  /** 当前可见行数（visibleOrder.length——全选三态口径，非 filtered） */
  visibleCount: number;
  batchBusy: "convert" | "delete" | null;
  onToggleAll: () => void;
  onConvert: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

/** 底部批量操作栏（段搜索命中视图隐藏——避免对不可见列表误操作，由面板条件控制） */
export default function SessionSelectionToolbar({
  selectedCount, visibleCount, batchBusy, onToggleAll, onConvert, onDelete, onCancel,
}: Props) {
  return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
      {/* 批 4 审查修复（P3-1）：全选框口径 = 当前可见行序 visibleOrder——
          平铺=筛选后序、分组=展开组顺次。原 filtered 口径在折叠组时把
          不可见行也纳入全选（勾选后随即被裁剪 effect 清掉，计数误导且
          折叠内容被误批量操作），与区间/自动裁剪同基准。三态 indeterminate
          用回调 ref 每渲染刷新——部分选中显示横杠 */}
      <input
        type="checkbox"
        data-testid="session-select-all"
        ref={(el) => {
          if (el) el.indeterminate = selectedCount > 0 && selectedCount < visibleCount;
        }}
        checked={selectedCount === visibleCount && visibleCount > 0}
        onChange={onToggleAll}
        style={{ cursor: "pointer", flexShrink: 0 }}
        title="全选当前可见的会话（折叠组行不含在内）"
      />
      <span style={{ fontSize: 12, color: "#374151" }}>已选 {selectedCount} 个</span>
      <button
        style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", fontWeight: 600, opacity: batchBusy ? 0.55 : 1 }}
        disabled={batchBusy !== null}
        onClick={onConvert}
        title={batchBusy ? "批量转处理中…" : undefined}
      >
        批量转笔记
      </button>
      <button
        style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #fca5a5", color: "#dc2626", opacity: batchBusy ? 0.55 : 1 }}
        disabled={batchBusy !== null}
        onClick={onDelete}
        title={batchBusy ? "批量删除处理中…" : undefined}
      >
        批量删除
      </button>
      <button style={{ ...btn, marginLeft: "auto", fontSize: 11 }} onClick={onCancel}>
        取消
      </button>
    </div>
  );
}
