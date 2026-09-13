/**
 * FragmentGroupAction — 收件箱碎片行的「移动到组」入口（批 7 C11：规格 §9 第 46 条
 * `update_fragment_group` 的补 UI）。
 *
 * @ai-context: 后端 `update_fragment_group`（commands_fragments.rs）自 REQ-201 起在册、今天
 *              仍在注册表里，但生产侧一直没有调用方（规格 §9 第 46 条逐字「声称已接线但
 *              实际无调用方」）⇒ 本件把那半条「接线」兑现：入口 + 指哪打哪的 IPC 载荷。
 * @ai-context: 形态照同目录既有的零对话框纪律（FeedFragmentList 的升笔记轻确认）—— 点
 *              「移动到组」就地铺开组清单，选中即发命令；不新造菜单 / 浮层原语
 *              （ui/primitives 下没有 Menu），也不占用原生 button 棘轮的配额（一律 Button 原语）。
 * @ai-context: 组清单由父层 loadGroupsIfNeeded() 惰性加载后以 props 传入 —— 本件不自建第二套
 *              加载器（同一次 list_note_groups 的同一份结果；两套加载器就是两套口径）。
 *              `groupId: null` = 移出组，与 Rust 侧 `Option<i64>` 的 None 语义逐字对齐。
 * @ai-context: 三条出口都不静默：成功 ⇒ 收起 + 源组自动清理留痕（REQ-316 的 autoCleanedGroups，
 *              照 FeedFragmentList 的 runPromote 同一形态上抛）；失败 ⇒ 交父层既有的 setErr
 *              （落到 inbox-error 那条 StatusLine 上；空 catch 是安全红线）。
 * 边界：本件不做视觉决策 —— 边框 / 圆角 / 阴影 / 色值 / 字号一个字面量都没有，一律由 Button
 *   与 Text 原语的类承载。副作用：只在用户点击后发一次 IPC，不读 store、不写磁盘。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteGroup } from "../types";
// REQ-316（批 7）：碎片移组返回契约（源空组清理留痕数据源）
import type { MoveFragmentResult } from "../types/notes";
import { Button, Text } from "../ui/primitives";

interface Props {
  fragmentId: number;
  /** 当前组 id（null=未归组 —— 此时不出现「移出组」出口，与后端 None 语义同向） */
  groupId: number | null;
  /** 可选组清单（父层惰性加载；null=尚未加载 —— 不把「没加载」谎报成「没有组」） */
  groups: NoteGroup[] | null;
  /** 展开时惰性拉组（父层 loadGroupsIfNeeded —— 每行都预拉会让 N 行列表发 N 次 IPC） */
  onNeedGroups: () => void;
  /** 父层动作在飞（与同行其余出口共用同一把 busy 门） */
  disabled: boolean;
  /** 移组成功后的父层刷新（重载收件箱 + 侧栏计数） */
  onMoved: () => void;
  /** 失败可见反馈（父层既有 setErr 形态：错误必须落到可见的 StatusLine） */
  onError: (msg: string) => void;
  /** REQ-316（批 7）：源组因移走变空被自动清理 → 上抛组标题（父层 toast 留痕） */
  onCleanNotice?: (groupNames: string[]) => void;
}

export default function FragmentGroupAction({
  fragmentId, groupId, groups, onNeedGroups, disabled, onMoved, onError, onCleanNotice,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 组名只在清单到手后才敢说；未加载时**不**猜（groupId 非空却显示「未归组」就是撒谎）
  const groupName = (groups ?? []).find((g) => g.id === groupId)?.name;

  /** 展开/收起；**首次展开才拉组** */
  const toggle = (): void => {
    if (!open) onNeedGroups();
    setOpen(!open);
  };

  /** 选中一个目标（null=移出组）；点当前组不产生伪写 */
  const move = async (target: number | null): Promise<void> => {
    if (busy || target === groupId) return;
    setBusy(true);
    try {
      const r = await invoke<MoveFragmentResult>("update_fragment_group", { fragmentId, groupId: target });
      setOpen(false);
      // REQ-316（批 7）：碎片源组因移走变空 → 自动清理留痕（结果空=零变化）
      if (r.autoCleanedGroups.length > 0) onCleanNotice?.([...new Set(r.autoCleanedGroups)]);
      onMoved();
    } catch (e) {
      onError(`移动到组失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        testId={`fragment-move-group-${fragmentId}`}
        title="移动到组（碎片归组 / 移出组）"
        onClick={toggle}
      >
        📁 移动到组
      </Button>
      {open && (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {groups !== null && (
            <Text size={2} tone="ink-3" testId={`fragment-move-group-${fragmentId}-current`}>
              {groupName === undefined ? "当前未归组" : `当前：${groupName}`}
            </Text>
          )}
          {(groups ?? []).map((g) => (
            <Button
              key={g.id}
              size="sm"
              variant={g.id === groupId ? "primary" : "ghost"}
              disabled={busy}
              testId={`fragment-move-group-${fragmentId}-${g.id}`}
              onClick={() => void move(g.id)}
            >
              {g.name}
            </Button>
          ))}
          {groupId !== null && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              testId={`fragment-move-group-${fragmentId}-none`}
              onClick={() => void move(null)}
            >
              移出组
            </Button>
          )}
          {groups !== null && groups.length === 0 && (
            <Text size={2} tone="ink-3">先在左侧建一个笔记组</Text>
          )}
        </span>
      )}
    </span>
  );
}
