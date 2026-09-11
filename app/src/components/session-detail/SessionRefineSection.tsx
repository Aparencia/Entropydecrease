/**
 * SessionRefineSection — 会话详情精修工具条（🔬 课后精修 / ⚡ 离线精修 / 🔤 文本校对）。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 拆出（原工具条内三个按钮）。按钮**渲染为面板工具条
 *              行的同级兄弟节点**（返回 fragment，无包裹元素）——视图切换组仍由面板渲染，
 *              三者同处一个 flex 行，DOM 结构与拆分前逐字一致。
 * @ai-context: 三条链路语义（拆分前注释原样保留）：🔬 课后精修与原料视图懒触发同命令
 *              auto_refine_session，幂等防重由后端 run_refine 承担，refining 期间按钮禁用并显示
 *              「精修中…」；⚡ 离线精修（REQ-268 全量第二遍）与 🔤 文本校对（REQ-270，仅文本上云、
 *              默认关双闸门）都是**面板显隐开关**，真正的 IPC 在各自面板内，故这里只回调父层打开。
 * @ai-context: 条件渲染边界——`canSecondPass`（status==="finished" && kind!=="photo"）由父层计算后
 *              传入：拆分前两处条件表达式完全相同，合并为一个 prop 不改变任何分支可达性。
 * @ai-context: refineMsg 提示行与 SecondPassPanel/ProofreadPanel 的挂载**不在此文件**——它们留在
 *              面板的就地位置，避免把 in-flow 提示行与 fixed overlay 换父节点（DOM 顺序契约）。
 * @ai-context: 样式口径——沿用拆分前的全部 inline style（无 .ed-* 类名），拆分不改色值。
 */
/** 通用小按钮基础样式（拆分前 SessionDetailPanel 的 `btn`——本文件三个按钮复用） */
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  /** 精修中（事件驱动；禁用 🔬 并改文案） */
  refining: boolean;
  /** 🔬 手动入口（面板层 useSessionDetailData().startRefine） */
  onStartRefine: () => void;
  /** 是否允许第二遍/校对（finished 且非图文会话） */
  canSecondPass: boolean;
  /** ⚡ 打开离线精修（第二遍）裁决面板 */
  onOpenPass2: () => void;
  /** 🔤 打开 LLM 文本校对面板 */
  onOpenProofread: () => void;
}

export default function SessionRefineSection({ refining, onStartRefine, canSecondPass, onOpenPass2, onOpenProofread }: Props) {
  return (
    <>
      {/* v0.11.5（spec 5️⃣）：课后精修入口迁移到面板层（与懒触发同命令，幂等防重） */}
      <button
        style={{ ...btn, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", marginLeft: "auto" }}
        onClick={() => onStartRefine()}
        disabled={refining}
      >
        {refining ? "精修中…" : "🔬 课后精修"}
      </button>
      {/* v0.20.2（REQ-268）：全量离线精修（第二遍）——仅已结束非图文会话
          （需要 S4 落盘音频）；面板内预览/采纳/回退，原料视图恒原文 */}
      {canSecondPass && (
        <button
          style={{ ...btn, borderRadius: 6, border: "1px solid #7c3aed", background: "#f5f3ff", color: "#6d28d9" }}
          onClick={() => onOpenPass2()}
        >
          ⚡ 离线精修
        </button>
      )}
      {/* v0.20.2（REQ-270）：可选 LLM 文本校对（建议制·默认关双闸门——
          未开启时面板给引导文案；仅文本上云） */}
      {canSecondPass && (
        <button
          style={{ ...btn, borderRadius: 6, border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8" }}
          onClick={() => onOpenProofread()}
        >
          🔤 文本校对
        </button>
      )}
    </>
  );
}
