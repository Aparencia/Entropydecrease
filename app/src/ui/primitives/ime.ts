/**
 * @ai-context L1 原语配套：**中文输入法组合态守卫**（批 0-D Task 7；规格 §5.2 第三条：「`Enter` 提交
 * 必须带 IME 组合守卫」）。
 *
 * Why：中文输入法下"回车确认候选词"与"回车提交"是同一个按键 —— 没有守卫时，用户挑词的那一下会
 * 直接触发危险动作（删除 / 级联）。本函数是全站唯一的判定出口，**本批只建不接**：`Modal` 自己不
 * 消费它（弹层的提交动作由调用点定义），批 4 迁移时由表单/搜索框的 `onKeyDown` 统一挂上
 * ——`if (event.key === "Enter" && !isImeComposing(event)) submit()`。
 *
 * 副作用：无（纯函数、无 DOM、无状态）。
 * 边界：① 只看两个信号 —— 现代事件对象的 `isComposing`（WebView2 = Chromium，可靠）与旧式的
 * `keyCode === 229`（部分 IME/环境在组合期只给 229）；② 入参故意只声明**结构最小面**，React 的
 * `KeyboardEvent` 直接满足它；若要传原生 `KeyboardEvent`，须写成 `isImeComposing({ nativeEvent: e })`
 * —— 原生事件的 `isComposing` 就在它自己身上（不是 `nativeEvent` 字段），这样写才读得到。
 */
export function isImeComposing(event: { nativeEvent?: { isComposing?: boolean }; keyCode?: number }): boolean {
  return event.nativeEvent?.isComposing === true || event.keyCode === 229;
}
