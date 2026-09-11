/**
 * useNotesBatchActions — 笔记页单删/批量删 + 空组清理留痕 toast（REQ-316 / v0.12.8）。
 *
 * @ai-context: 列表级批量删除（用户要求：与「会话」管理台同操作逻辑——勾选 +
 *              confirm 二次确认 + 逐条 invoke，无需先打开笔记）。返回值 =
 *              是否执行了删除（取消确认返回 false——父面板据此保留/清空勾选）。
 *              删除命中当前选中笔记时经 onCleared 清空右栏选中态。
 * @ai-context: 清理留痕——`delete_note` 回传 autoCleanedGroups（空组自动清理的
 *              组标题）：单删各自 toast，批量删**聚合去重后单次** toast（逐条
 *              toast 会刷屏）；无清理时 autoCleanNotice 返回 null ⇒ 零变化。
 * @ai-context: 副作用——invoke `delete_note`（单条/逐条）、confirm 原生对话框、
 *              自绘 toast（3s 自动消失 + 卸载清理）。toast 实例由本 hook **独占**，
 *              页面只渲染返回的 toast 节点，不得再建第二个 useTransientToast。
 * @ai-context: 边界——结果/错误文案经 onStatus 上抛（页面 status 单一真源）；列表
 *              重载经 onReload（页面侧 `load(keyword, tagFilter, sortMode)`）——
 *              本 hook 不持有 keyword/tagFilter，避免第二份闭包快照。
 */
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
// REQ-316（批 7）：删除/移组返回契约（空组自动清理留痕数据源）
import type { DeleteNoteResult } from "../types/notes";
// REQ-316（批 7）：清理留痕统一 toast（文案拼接纯函数 + 自绘 toast hook）
import { autoCleanNotice } from "../utils/groupClean";
import { useTransientToast } from "./useTransientToast";

interface Options {
  /** 当前选中笔记 id（命中即清空右栏选中态；null=无选中） */
  selectedId: number | null;
  /** 删除命中选中笔记 → 清空选中（页面 setSelected(null)） */
  onCleared: () => void;
  /** 删除后重载列表（页面 load(keyword, tagFilter, sortMode)） */
  onReload: () => void;
  /** 结果/错误文案上抛（页面 status 区） */
  onStatus: (msg: string) => void;
}

export function useNotesBatchActions({ selectedId, onCleared, onReload, onStatus }: Options) {
  // REQ-316（批 7）：空组自动清理 toast（自绘——会话页批量删除 toast 同款）
  const { toast, showToast } = useTransientToast();

  // REQ-316（批 7）：清理留痕统一出口（子组件移组/碎片结果含清理列表时经此
  // 上抛 toast——无清理时 autoCleanNotice 返回 null，零变化）
  const notifyCleanNotice = useCallback(
    (groupNames: string[]) => {
      const msg = autoCleanNotice(groupNames);
      if (msg) showToast(msg, "ok");
    },
    [showToast],
  );

  const runDelete = async (id: number) => {
    try {
      const r = await invoke<DeleteNoteResult>("delete_note", { id });
      if (selectedId === id) onCleared();
      // 删的是组内最后一篇 → 后端自动清理空路由组（结果回传标题留痕）
      notifyCleanNotice(r.autoCleanedGroups);
      onReload();
    } catch (e) {
      onStatus(`删除失败: ${e}`);
    }
  };

  /**
   * v0.12.8：列表级批量删除（用户要求：与「会话」管理台同操作逻辑——勾选 +
   * 确认 + 逐条 invoke，无需先打开笔记；删除选中笔记同步清空右栏选中态）。
   * 返回是否执行了删除（取消确认返回 false——父面板据此保留/清空勾选）。
   */
  const runBatchDelete = async (ids: number[]): Promise<boolean> => {
    const ok = await confirm(`确定删除选中的 ${ids.length} 个笔记？删除后不可恢复。`, {
      title: "熵减",
      kind: "warning",
    });
    if (!ok) return false;
    let failed = 0;
    // REQ-316（批 7）：批量删逐条触发清理——聚合去重单次 toast（单条由 runDelete 各自 toast）
    const cleanedNames: string[] = [];
    for (const id of ids) {
      try {
        const r = await invoke<DeleteNoteResult>("delete_note", { id });
        if (selectedId === id) onCleared();
        cleanedNames.push(...r.autoCleanedGroups);
      } catch {
        failed += 1;
      }
    }
    onStatus(failed > 0 ? `已删除 ${ids.length - failed} 个，${failed} 个失败` : "");
    notifyCleanNotice([...new Set(cleanedNames)]);
    onReload();
    return true;
  };

  return { toast, showToast, notifyCleanNotice, runDelete, runBatchDelete };
}
