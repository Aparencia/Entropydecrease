/**
 * useNoteSelectionActions — 笔记页「正文选区右键」行动类编排（REQ-317，批 8）。
 *
 * @ai-context: NotesPage ≤600 压线（TD-2026-09-06-G 拆件义务延续）——选区菜单的
 *              模型卡预填对话框态与「转为问题」命令在此收敛，NotesPage 只消费
 *              返回值与对话框渲染。**转问题复用 REQ-300 question_create 同一
 *              命令面**（❓ 问题清单「添加」同处理器，noteId=来源笔记回链；
 *              设计稿“改写问句”中间编辑留后续——见批 8 偏差登记）；
 *              **模型卡预填=既有 ModelCardFromNoteDialog + initialExcerpt 一次性
 *              预填**（≤200 单行化截断，组内 model 卡唯一生成链防双轨不变）。
 *              复制/全选/加入行动是宿主就地动作，不经本 hook。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SNIPPET_MAX,
  singleLineTruncate,
  type SelectionNoteAction,
} from "../utils/noteSelectionMenu";

interface Options {
  /** 当前选中笔记（阅读/编辑右栏存在才有菜单动作；null=防御不动作） */
  noteId: number | null;
  /** 模型卡创建成功后父层刷新（列表 + 右栏回读，同 header 入口口径） */
  onChanged: () => void;
  /** 结果留痕（转问题成败——行动中心 ❓ 在另一页，toast 是唯一即时反馈） */
  notify: (msg: string, kind: "ok" | "err") => void;
}

export function useNoteSelectionActions({ noteId, onChanged, notify }: Options) {
  /** 模型卡对话框态（open 即非 null；excerpt=预填草稿） */
  const [modelDialog, setModelDialog] = useState<{ excerpt: string } | null>(null);
  // 转问题幂等闸（连点菜单项防双写——命令本身无副作用需求，纯 UI 防抖）
  const questionBusyRef = useRef(false);

  // 批 8 审查 P2-12：对话框快照（excerpt + noteId 上下文）随选中笔记失效——
  // 切笔记后旧 excerpt 不得配新 noteId 打开（ModelCardDialogSlot 只做接线，
  // 关闭语义必须收敛在状态持有者）；含 selected→null（关闭/删除笔记）路径
  useEffect(() => { setModelDialog(null); }, [noteId]);

  /** header 🧠 模型卡入口（无选区上下文——excerpt 空预填保持原行为） */
  const openModelCard = useCallback(() => setModelDialog({ excerpt: "" }), []);

  const closeModelCard = useCallback(() => setModelDialog(null), []);

  /** 选区菜单行动类分发（阅读/编辑两宿主共用同一入口） */
  const handleSelectionAction = useCallback((action: SelectionNoteAction, rawText: string) => {
    if (action === "toModelCard") {
      setModelDialog({ excerpt: singleLineTruncate(rawText, SNIPPET_MAX) });
      return;
    }
    if (action === "toQuestion") {
      if (noteId == null || questionBusyRef.current) return;
      questionBusyRef.current = true;
      // 与 ❓ 清单「添加」同一命令（text ≤200 单行化；noteId=来源笔记回链）
      void invoke("question_create", {
        text: singleLineTruncate(rawText, SNIPPET_MAX),
        noteId,
        context: null as string | null,
      })
        .then(() => notify("已转为问题——到「✅ 行动」→❓ 问题清单可查看/回答", "ok"))
        .catch((e) => notify(`转为问题失败: ${e}`, "err"))
        .finally(() => { questionBusyRef.current = false; });
    }
  }, [noteId, notify]);

  return {
    modelDialog,
    openModelCard,
    closeModelCard,
    handleSelectionAction,
    /** 创建成功回调（对话框创建后 900ms 自关；此回调触发父层刷新） */
    onModelCardCreated: onChanged,
  };
}
