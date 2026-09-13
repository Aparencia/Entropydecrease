/**
 * GalleryBulkDelete — 会话图集「删除本场全部图片」入口 + 二次确认（批 7 T20 · §9 #37）。
 *
 * @ai-context Why 独立成件（C10.5 的「展示面设计」）：`delete_session_images_all` 今天**零调用点**
 *   （用户只能一张张删）；本件把「整场批量删」做成**一个入口 + 一次危险确认**，并让宿主
 *   （`components/ImageGallery.tsx`）只多两行装配 —— 那个宿主在 `buttonMigration` 的 **35 文件普查**
 *   名单内，**往里加 `<Button>` 会要求同提交同步形状表与总数**（§C9.8）⇒ 按钮落在本件（新文件**不进普查**）
 *   是**代价最小且不动判据件**的形态。
 * @ai-context 危险语义照 `ConfirmDialog` 的契约（规格 §5.3 两档分级）：**框内必须列明保留项**
 *   （图片删掉、转写/笔记/卡片保留），确认按钮**保持中性色**（`--ed-stamp` 绝不用于按钮）。
 * @ai-context 冻结键口径（C9.12）：新文件 ⇒ 六棘轮全 0 命中（按钮 = `Button` 原语、错误行 =
 *   `StatusLine`、排版 = `Text` 档位）；**不用 `EmptyState`**（`emptyStateRatchet` 的余量集逐文件冻结）。
 * 副作用：一次 `invoke("delete_session_images_all")`（用户确认后触发）。边界：① **取消不调 IPC**
 *   （`ConfirmDialog` 的三条退出路径都归 `onCancel`）；② 失败 ⇒ `StatusLine kind="error"`，
 *   并按「不确定是否已删」处理 —— **不**乐观清空宿主列表，改为回调让宿主**重拉**（`onDeleted`）。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, ConfirmDialog, StatusLine } from "../../ui/primitives";

export default function GalleryBulkDelete({ sessionId, count, onDeleted }: {
  readonly sessionId: number;
  /** 当前图集条数（0 时入口**不渲染** —— 没有可删的东西就不该出现危险入口） */
  readonly count: number;
  /** 删除成功后的回调（宿主重拉图集；本件不猜结果、不乐观改宿主的列表） */
  readonly onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const confirmDelete = async (): Promise<void> => {
    setBusy(true);
    setErr("");
    try {
      await invoke("delete_session_images_all", { sessionId });
      setOpen(false);
      onDeleted();
    } catch (e) {
      setErr(`批量删除失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) return null;
  return (
    <span data-testid="gallery-bulk-delete">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} title="删除本会话归档的全部图片">
        🗑 删除本场全部图片
      </Button>
      {err !== "" && <StatusLine kind="error" testId="gallery-bulk-delete-error">{err}</StatusLine>}
      <ConfirmDialog
        open={open}
        title={`删除本场全部图片（${count} 张）？`}
        message="这是不可逆动作：图片文件将从本机会话目录移除。"
        impacts={[
          { text: `${count} 张归档图片` },
          { text: "转写段 / 画面要点 / OCR 文字", keep: true },
          { text: "由本会话生成的笔记与卡片", keep: true },
        ]}
        confirmLabel="删除全部"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setOpen(false)}
        testId="gallery-bulk-confirm"
      />
    </span>
  );
}
