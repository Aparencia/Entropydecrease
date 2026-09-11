/**
 * NotesOverlays — 笔记页覆盖层槽（AI 对话框 / 模型卡对话框 / 图片放大预览 / 清理 toast）。
 *
 * @ai-context: 本文件是**展示适配器**（自 NotesPage 拆分，行为不变）：只做「条件
 *              门控 + 原样渲染」，不含业务逻辑——开合态与快照内容全部由页面
 *              （aiOpen/aiContent/previewImg/modelDialog）与 useNotesBatchActions
 *              （toast 节点）持有，槽内**不得**新建状态、invoke 或事件订阅。
 * @ai-context: 契约——① AI 对话框仅在 `aiOpen && selected` 时渲染，key=`ai-{id}`
 *              保证切笔记重建（内容快照 aiContent 在页面进入编辑前采集）；
 *              ② 模型卡槽自持 `dialog == null → null` 门控（组件内部实现），页面
 *              只补 `selected` 非空判定；③ 图片预览由 previewImg 非空门控；
 *              ④ toast 节点直接落位渲染（fixed 全页可见，实例唯一）。
 * @ai-context: DOM 边界——顶层返回 **fragment**（覆盖层是页面根 flex 容器的兄弟
 *              节点，多包一层 div 会改变 flex 直接子元素结构）。
 */
import type { ReactElement } from "react";
import type { Note } from "../../types";
import NoteAiDialog from "../NoteAiDialog";
import ImagePreviewOverlay from "../ImagePreviewOverlay";
import ModelCardDialogSlot from "../note-selection/ModelCardDialogSlot";

interface Props {
  /** 当前选中笔记（AI 对话框与模型卡槽都需要；null=两个对话框都不渲染） */
  selected: Note | null;
  /** 编辑态 AI 能力对话框开合（页面 aiDialogOpen） */
  aiOpen: boolean;
  /** AI 对话框内容快照（进入编辑前采集：编辑态取编辑器当前内容，阅读态取已存正文） */
  aiContent: string;
  onAiClose: () => void;
  /** 精修采纳/知识补充完成 → 页面刷新（列表重载 + 右栏回读） */
  onAiUpdated: () => void;
  /** 模型卡草稿态（null=关闭；excerpt=选区预填，header 入口为空串） */
  modelDialog: { excerpt: string } | null;
  onModelCardClose: () => void;
  onModelCardCreated: () => void;
  /** 图片放大预览目标（阅读态与编辑态共用同一入口） */
  previewImg: { src: string; title?: string } | null;
  onPreviewClose: () => void;
  /** 空组清理留痕 toast 节点（由 useNotesBatchActions 返回，实例唯一） */
  toast: ReactElement | null;
}

export default function NotesOverlays({
  selected, aiOpen, aiContent, onAiClose, onAiUpdated,
  modelDialog, onModelCardClose, onModelCardCreated,
  previewImg, onPreviewClose, toast,
}: Props) {
  return (
    <>
      {/* v0.17.0：编辑态 AI 能力对话框（精修/知识补充——REQ-246） */}
      {aiOpen && selected && (
        <NoteAiDialog
          key={`ai-${selected.id}`}
          noteId={selected.id}
          noteContent={aiContent}
          onClose={onAiClose}
          onUpdated={onAiUpdated}
        />
      )}
      {/* 批 8（REQ-317）：模型卡对话框槽（header 入口与选区菜单共用生成链） */}
      {selected && <ModelCardDialogSlot note={selected} dialog={modelDialog} onClose={onModelCardClose} onCreated={onModelCardCreated} />}
      {/* v0.10.1：图片放大预览（ESC/点击遮罩关闭——与编辑退出 ESC 互斥） */}
      {previewImg && (
        <ImagePreviewOverlay src={previewImg.src} title={previewImg.title} onClose={onPreviewClose} />
      )}
      {/* REQ-316（批 7）：空组自动清理 toast（自绘 fixed 全页可见） */}{toast}
    </>
  );
}
