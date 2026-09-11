/**
 * useSessionSelection — 会话列表多选/选择模式状态机（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 批 4 交互矩阵的状态持有者——selectionMode（「选择」按钮进入，单击行
 *              =勾选）、selected（多选集）、anchor（Shift 区间锚）。单击分派
 *              （rowOpen）与修饰键分派（rowModifier）在此收敛，行组件只上报事件；
 *              复用 utils/noteSelection 纯函数（零笔记域耦合）。
 * @ai-context 副作用与边界：
 *              ① visibleOrder **由调用方注入**（本 hook 不推导）——它是 Shift 区间、
 *                 选集裁剪、全选三态的唯一基准（折叠组隐藏行不在内，与笔记树同语义）；
 *              ② visibleOrderRef 是「同 tick 可读」镜像：rowModifier 在事件回调里
 *                 同步读它。**不得**改成闭包捕获 visibleOrder（事件发生时闭包可能是
 *                 上一帧的序 ⇒ 区间端点错位），**不得**改成 state（多一帧延迟）；
 *              ③ 裁剪 effect 必须保留 `changed ? next : cur`——集合未变时返回**同一
 *                 Set 引用**，否则每次 visibleOrder 变化都会让全列表行重渲染（测试
 *                 只断言计数，发现不了这个性能回归）；
 *              ④ Esc 退出链**不在本 hook**：面板保留唯一 window keydown 监听，维持
 *                 「右键菜单优先 return」的优先级（第二个监听会让一次 Esc 同时关菜单
 *                 + 清选集 = 行为不等价）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionListItem } from "../types";
import { emptySelection, rangeSelection, toggleSelection } from "../utils/noteSelection";

interface Options {
  /** 当前可见行序（面板派生后注入；区间/裁剪/全选三态共用同一基准） */
  visibleOrder: number[];
  /** 普通单击打开详情（选择模式下不触发——单击=勾选） */
  onOpenDetail: (id: number) => void;
}

export function useSessionSelection({ visibleOrder, onOpenDetail }: Options) {
  // ── 多选态（批 4）：selectionMode=选择模式（单击=勾选）；anchor=区间锚 ──
  const [selected, setSelected] = useState<Set<number>>(emptySelection());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);

  const clearSelection = useCallback(() => { setSelected(emptySelection()); setAnchor(null); }, []);
  const exitBatch = useCallback(() => { setSelectionMode(false); clearSelection(); }, [clearSelection]);
  const enterSelectionMode = useCallback(() => setSelectionMode(true), []);

  const visibleOrderRef = useRef<number[]>([]);
  useEffect(() => { visibleOrderRef.current = visibleOrder; }, [visibleOrder]);

  // 列表数据变化裁剪：只留当前可见行（筛选/折叠/删除后不残留幽灵勾选）
  useEffect(() => {
    setSelected((cur) => {
      if (cur.size === 0) return cur;
      const visible = new Set(visibleOrder);
      let changed = false;
      const next = new Set<number>();
      for (const id of cur) if (visible.has(id)) next.add(id); else changed = true;
      return changed ? next : cur;
    });
  }, [visibleOrder]);

  // ── 行交互（批 4）：单击语义按模式分派；修饰键不换右栏 ──
  const rowOpen = useCallback((item: SessionListItem) => {
    if (selectionMode) {
      // 选择模式：单击=勾选（不打开详情）
      setSelected((cur) => toggleSelection(cur, item.session.id));
      setAnchor(item.session.id);
      return;
    }
    // 普通单击=单选语义并打开——先清既有选集（防误以为仍处多选态），锚恒指向本次点击
    if (selected.size > 0) clearSelection();
    onOpenDetail(item.session.id);
    setAnchor(item.session.id);
  }, [selectionMode, selected.size, onOpenDetail, clearSelection]);

  const rowModifier = useCallback((item: SessionListItem, ctrl: boolean, shift: boolean) => {
    const id = item.session.id;
    if (ctrl) {
      // Ctrl/⌘：加/减单行；锚指向本次点击行
      setSelected((cur) => toggleSelection(cur, id));
      setAnchor(id);
    } else if (shift) {
      if (anchor == null) {
        // 无锚的首次 Shift=单选该行并设为锚（连按两次不再各加单行）
        setSelected(new Set([id]));
        setAnchor(id);
      } else {
        setSelected((cur) => rangeSelection(cur, visibleOrderRef.current, anchor, id));
      }
    }
  }, [anchor]);

  /** 全选框三态（P3-1）：口径=visibleOrder（折叠组隐藏行不在内）；满选再点=清空 */
  const toggleAllVisible = useCallback(() => {
    if (selected.size === visibleOrder.length && visibleOrder.length > 0) {
      clearSelection();
    } else {
      setSelected(new Set(visibleOrder));
      setAnchor(null); // 全选后无区间锚（下次 Shift 需新锚）
    }
  }, [selected.size, visibleOrder, clearSelection]);

  return {
    selected, selectionMode, clearSelection, exitBatch, enterSelectionMode,
    rowOpen, rowModifier, toggleAllVisible,
  };
}
