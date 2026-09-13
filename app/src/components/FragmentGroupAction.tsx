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
 * @ai-context: 🔴 **候选集 = feed 地形组（碎片的家），不是笔记容器组**。三条实测依据：
 *              ① `commands_groups.rs:36` 逐字「列出笔记组（含组内笔记数；terrain 可选过滤
 *                 container / feed）」；`:43-46` 的白名单校验是
 *                 `if t != "container" && t != "feed" { return Err(...) }` ⇒ feed 是**一等公民**
 *                 地形（不是内部值、不是只读视图）。
 *              ② `commands_fragments.rs:344-366` 的 `resolve_feed_topic_group` —— 碎片自动归组时
 *                 **显式**建的就是 feed 组：`:355` 是 `terrain: "feed".to_string()`、`:349` 是
 *                 `find_topic_group(domain_tag, "feed")`、`:361` 的理由逐字「碎片 DomainTag 自动归组」。
 *              ③ 反向对照：同目录 `loadGroupsIfNeeded()` 的容器组过滤服务的是**升为笔记**
 *                 （`promote_fragment_to_note`）的去向语义（`FeedFragmentList.tsx:109` 注释逐字
 *                 「目标=笔记容器组（feed 地形是碎片容器——不是笔记去向）」）—— 那是**另一件事**，
 *                 不能当本命令的先例：碎片被移进容器组 = 静默的语义错位。
 * @ai-context: 本件**自带** feed 清单加载（`list_note_groups` 带 terrain 过滤「后端真源」+
 *              再收一次客户端口径「防御性」）：它与父层 promote 的容器清单是**两个不同 terrain
 *              的两个不同查询**，故不构成「同一口径写两份」；也避免把只服务笔记去向的清单
 *              借来当归组候选。清单**首次展开才拉**（每行都预拉 = N 行列表发 N 次 IPC）。
 * @ai-context: `groupId: null` = 移出组，与 Rust 侧 `Option<i64>` 的 None 语义逐字对齐。
 * @ai-context: 三条出口都不静默：成功 ⇒ 收起 + 源组自动清理留痕（REQ-316 的 autoCleanedGroups，
 *              照 FeedFragmentList 的 runPromote 同一形态上抛）；命令失败与清单加载失败 ⇒ 都交
 *              父层既有的 setErr（落到 `inbox-error` 那条 StatusLine 上；空 catch 是安全红线）。
 * 边界：本件不做视觉决策 —— 边框 / 圆角 / 阴影 / 色值 / 字号一个字面量都没有，一律由 Button
 *   与 Text 原语的类承载。副作用：首次展开发一次 `list_note_groups`，选中后发一次
 *   `update_fragment_group`；不读 store、不写磁盘。
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
  fragmentId, groupId, disabled, onMoved, onError, onCleanNotice,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** feed 地形组清单（null=尚未加载 —— 不把「没加载」谎报成「没有组」；加载失败也留 null ⇒ 可重试） */
  const [groups, setGroups] = useState<NoteGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  // 组名只在清单到手后才敢说；名字查不到（例如碎片还留在容器组里）就**如实报 id**，不猜「未归组」
  const groupName = (groups ?? []).find((g) => g.id === groupId)?.name;

  /** 清单加载：后端按 terrain 过滤（真源）+ 客户端再收一次口径（防漂移混入笔记容器组） */
  const loadGroups = async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await invoke<NoteGroup[]>("list_note_groups", { terrain: "feed" });
      setGroups(list.filter((g) => g.terrain === "feed"));
    } catch (e) {
      onError(`组清单加载失败: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  /** 展开/收起；**首次展开才拉清单**（`groups === null` ⇒ 上次失败也能再点一次重试） */
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && groups === null && !loading) void loadGroups();
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
              {groupName ?? (groupId === null ? "当前未归组" : `当前组 #${groupId}`)}
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
            <Text size={2} tone="ink-3" testId={`fragment-move-group-${fragmentId}-hint`}>
              先在左侧建一个碎片组
            </Text>
          )}
        </span>
      )}
    </span>
  );
}
