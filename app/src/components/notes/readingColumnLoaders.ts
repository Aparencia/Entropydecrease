/**
 * readingColumnLoaders — 笔记阅读列（`NotesReadingColumn`）的**键常量与惰性映射工厂**（零 JSX、零宿主状态）。
 *
 * @ai-context: 自 `NotesReadingColumn.tsx` **纯搬迁**抽出（批 8 T7；行为零变化、文案零变化、判据零变化）：
 *              宿主只做「插槽元素构造 + 事件绑定 + 一层组合」，其中**卡片流键 / 带 seek 包装件加载器 /
 *              惰性映射工厂**是不依赖任何 React 状态与 props 的模块级事实 ⇒ 物理分离到本件。
 * @ai-context: 🔴 本件**不得** import `views/registry` —— `views/architecture.guard.test.ts` 的 A2④
 *              把注册表的**非 views 导入者**钉死为恰 5 个（`toEqual` 精确集合）、A2① 把**运行时**
 *              导入者钉死为恰 2 个页面 ⇒ 新增第 6 个 / 第 3 个会红。故这里的惰性规格只取
 *              **结构最小面** `LazyViewSpec`（调用侧传 `ViewSpec<NoteViewSlot>` 天然结构匹配）。
 * @ai-context: 三条硬约束原样承接（批 5 T14 · 规格 §7.3）：① **默认视图无 `load`** ⇒ 映射值为 `null`、
 *              永不进 `React.lazy`（构造性证据）；② `lazy()` **只按 `specs` 引用建一次**（每渲染新建会让
 *              子树恒重挂 —— F5 的挂载计数会当场红）；③ **卡片流**经**带 seek 包装件**加载（T17/C10.3：
 *              该槽缺 `onOpenSessionAt`；键漂移会让它静默失效 ⇒ F11 用例即守卫）。
 * @ai-context: **批 8 T10 追加第三视图（`evidence`）的两条模块级事实**：① `EVIDENCE_LOAD` 是**本地加载
 *              器**（照 `CARD_FLOW_LOAD` 的先例、**不 import 注册表** —— 见上条 A2①/A2④）；本件是它**唯一**
 *              的静态导入点 ⇒ 视图 + 模型层**合并进宿主 chunk**（不新增懒 chunk —— `lazyBudget.json` 的
 *              `lazyChunkCountMax = 39` 今天**贴住**，第 40 个 chunk 会当场红，见 T10 报告 V-包体）；②
 *              `NOTE_EVIDENCE_KEY` 与注册表的 `NOTE_VIEWS[2].key` 必须逐字相等 —— 漂移 ⇒ `lazyMapOf`
 *              里查不到 ⇒ 该视图**静默不渲染**（`F12` 用例即这条守卫，请勿单独改一处）。
 * @ai-context: T10 的注入面走**类型转出**（不改视图、不加槽）：`NoteEvidenceSlot` = 视图的
 *              `NoteEvidenceTracks` **逐字转出**（`import type`）⇒ 容器侧（`hooks/useNoteEvidence.ts`）
 *              与视图**不可能各自漂移** —— 那是 `import type` **边**、不是 A2④ 计数的运行时/触碰边；
 *              本件**不**从注册表取任何类型（那才会让 A2④ 的集合变 6，见第二条）。
 * 副作用：无（纯数据 + `lazy()` 构造，不碰 IPC / DOM）。边界：本件在六棘轮的 PROD 域内 ⇒
 *   不得出现颜色 / 字号 / 边框 / 圆角 / 阴影字面量，也不得有原生 `<button>`。
 */
import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type CardFlowWithSeek from "../../views/note/NoteCardFlowWithSeek";
import type { NoteEvidenceTracks } from "../../views/note/NoteEvidenceTrackView";

/** 惰性视图规格的**结构最小面**（= 注册表 `ViewSpec` 里与本件相关的两个字段，逐字同型）。 */
export interface LazyViewSpec<P> {
  readonly key: string;
  readonly load?: () => Promise<{ default: ComponentType<P> }>;
}

/** 卡片流键（= 注册表的 `NOTE_VIEWS[1]`；本件不 import 注册表 —— C1①）与其**带 seek 包装件**加载器（T17/C10.3：该槽缺 `onOpenSessionAt`）；仍经 `lazy()` ⇒ 模块级惰性不变。 */
export const CARD_FLOW_KEY = "cardflow";
export const CARD_FLOW_LOAD = (): Promise<{ default: typeof CardFlowWithSeek }> => import("../../views/note/NoteCardFlowWithSeek");

/**
 * 第三视图键（= 注册表的 `NOTE_VIEWS[2]`）与其本地加载器（T10；两处必须逐字相等，见文件头）。
 * ⚠️ 返回类型里的 `ComponentType<never>` 是**结构占位**（`never` 只描述「props 面与 `lazyMapOf` 的
 * `P` 无关」）：调用侧把它当 `ComponentType<P>` 用时**必须**在宿主那一处显式断言（本仓不引 `any`）。
 */
export const NOTE_EVIDENCE_KEY = "evidence";
export const EVIDENCE_LOAD = (): Promise<{ default: ComponentType<never> }> =>
  import("../../views/note/NoteEvidenceTrackView") as Promise<{ default: ComponentType<never> }>;

/** 第三视图的**注入面**（T8 的 `NoteEvidenceTracks` 逐字转出；容器侧 `useNoteEvidence` 产出）。 */
export type NoteEvidenceSlot = NoteEvidenceTracks;

/**
 * 惰性映射：**默认视图无 `load` ⇒ 值为 `null`**，永不进 `React.lazy`（§7.3② 的构造性证据）。
 * `lazy()` 只按 `specs` 引用建一次 —— 每渲染新建会让子树恒重挂（F5 的挂载计数会当场红）。
 * T17：**卡片流**经包装件加载（键漂移会让它静默失效 ⇒ F11 用例即守卫）；**T10**：第三视图经
 * `evidence` 加载器（同上，键漂移 ⇒ 该视图静默不渲染 ⇒ F12 用例即守卫）。
 * ⚠️ 本件是**纯函数**（不持有记忆）⇒ 调用侧必须把返回值包进 `useMemo(..., [specs])`，
 *    否则每次渲染都新建 `LazyExoticComponent` ⇒ 子树恒重挂（上一条的机理同源）。
 */
export function lazyMapOf<P>(
  specs: readonly LazyViewSpec<P>[],
  cardFlow: () => Promise<{ default: ComponentType<P> }>,
  evidence: () => Promise<{ default: ComponentType<never> }>,
): ReadonlyMap<string, LazyExoticComponent<ComponentType<P>> | null> {
  return new Map<string, LazyExoticComponent<ComponentType<P>> | null>(
    specs.map((spec): readonly [string, LazyExoticComponent<ComponentType<P>> | null] => {
      // 键 → 加载器的路由只有这一处；默认视图（无 `load`）保持 `null` ⇒ 永不进 `lazy()`
      if (!spec.load) return [spec.key, null];
      if (spec.key === CARD_FLOW_KEY) return [spec.key, lazy(cardFlow)];
      // 🔴 `evidence` 的 props 面与宿主的 `P` 无关（它是 slot 的**超集**：+ 可选 `evidence`）⇒
      //    此处是**唯一**的类型断言点，调用侧无需再断言（断言集中在加载器路由这一处，便于审查）。
      if (spec.key === NOTE_EVIDENCE_KEY) return [spec.key, lazy(evidence as () => Promise<{ default: ComponentType<P> }>)];
      return [spec.key, lazy(spec.load)];
    }),
  );
}
