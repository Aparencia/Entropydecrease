/**
 * ClassroomBanners — 课堂助手左栏三条页面级提示横幅（批 0-C2 Task 4 步 3 自
 * ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: 三条横幅自上而下 = ①ASR 降级（流式引擎静默失效可见化，asr-recovered
 *              或会话停止时清除）②目标窗口丢失（画面采集中断提示，唯一带「知道了」
 *              手动关闭入口）③画面源停更（WGC 长时间无新帧，恢复帧/停止采集自动
 *              清除）。三者的状态源都在 useClassroomHints（事件驱动），本文件只做
 *              条件渲染与文案呈现。
 * @ai-context: 顶层返回 **fragment** —— 三条横幅必须仍是左栏 div 的直接子元素
 *              （不得加包裹层：包裹层会改变 borderBottom 堆叠与 flex 高度分配）。
 * @ai-context: 耦合逐字保留 —— ⚠/🖼 emoji、全角破折号与括号、内联色值
 *              （#fef2f2/#fecaca/#b91c1c · #fffbeb/#fcd34d/#b45309 ·
 *              #eff6ff/#bfdbfe/#1d4ed8）与字号 11 均为现状契约，本批不 token 化、
 *              不换 emoji。本文件零 className / 零 id / 零 data-testid。
 */
interface Props {
  /** ASR 降级提示文案（null=不显示） */
  asrDegraded: string | null;
  /** 目标窗口丢失（true=显示；关闭走 onDismissWindowLost） */
  windowLost: boolean;
  /** 画面源停更秒数（null=未停更） */
  frameStalledSecs: number | null;
  onDismissWindowLost: () => void;
}

export default function ClassroomBanners({
  asrDegraded,
  windowLost,
  frameStalledSecs,
  onDismissWindowLost,
}: Props) {
  return (
    <>
      {asrDegraded && (
        <div style={{ padding: "6px 14px", background: "#fef2f2", borderBottom: "1px solid #fecaca", fontSize: 11, color: "#b91c1c" }}>
          ⚠ {asrDegraded}
        </div>
      )}

      {/* TD-2026-08-20-I 清偿：目标窗口丢失横幅（画面采集中断提示；恢复/停止后清除） */}
      {windowLost && (
        <div style={{ padding: "6px 14px", background: "#fffbeb", borderBottom: "1px solid #fcd34d", fontSize: 11, color: "#b45309", display: "flex", alignItems: "center", gap: 8 }}>
          ⚠ 目标窗口已关闭或不可见——画面采集中断（音频继续；请恢复窗口或重新选择）
          <button
            onClick={onDismissWindowLost}
            style={{ marginLeft: "auto", border: "none", background: "none", color: "#b45309", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
          >
            知道了
          </button>
        </div>
      )}

      {/* REQ-281（v0.19.6）：画面源停更轻提示（区别于窗口丢失；恢复帧自动消失） */}
      {frameStalledSecs != null && (
        <div style={{ padding: "6px 14px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", fontSize: 11, color: "#1d4ed8", display: "flex", alignItems: "center", gap: 8 }}>
          🖼 画面源已 {frameStalledSecs}s 无新帧——可能播放器暂停渲染或窗口被遮挡（已自动重试；画面恢复即消失）
        </div>
      )}

      {/* 批 2b：原 REQ-291 随播随停横幅（mediaPaused）删除——暂停原因单一来源
          pausedReason，横幅语义并入采集卡内状态行（pausedCardText，见下） */}
    </>
  );
}
