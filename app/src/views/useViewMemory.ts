/**
 * useViewMemory — 视图记忆（C5 / 规格决策 23）：把「用户上次选的视图」记在 `view:default:{objectType}` 上。
 *
 * @ai-context 键口径**逐字** `view:default:{objectType}`，`objectType ∈ {"session","note"}`：粒度是
 *   **对象类型**、**不含 `kind`**（决策 23 字面）⇒ web/photo/video 三种会话共享一份记忆。代价（已
 *   登记）：同一域里换 kind 不重置视图；换来的是「同一类对象行为一致」。
 * @ai-context 为什么**不复用** `useColumnLayout`：它的持久化键前缀被 `shell/columnKeys.freeze.test.ts`
 *   钉死为**恰** `["col-fold","col-width"]`（前缀与键名是同一个 localStorage 键的两半，改任一半都会让
 *   用户已记住的列宽**静默丢失**）。复用它要么写 `layout:` 前缀（撞红那条冻结判据），要么放宽那条
 *   判据（本批「既有断言改动数 = 0」）⇒ 独立一份薄层更便宜。
 * @ai-context 为什么注入 `Storage` 且读/写都是纯函数：照 `utils/draftStore.ts` 的范式 —— 纯函数在
 *   **node 环境**可直接用内存桩单测（无 jsdom、无全局污染），`localStorage` 只是**默认值**。默认值取
 *   `globalThis.localStorage` 而非裸标识符：真 node 环境里裸标识符抛 `ReferenceError`（**绕过**下面的
 *   `try/catch`，把一次可降级的情形变成崩溃），而 `globalThis.localStorage` 是 `undefined` ⇒ 落进
 *   同一条 `try/catch` 降级路径（隐私模式/配额拒绝同理）。
 * 副作用：读/写注入的 `Storage`（默认 `window.localStorage`）；异常一律**静默** —— 视图记忆是增强层，
 *   且读发生在渲染路径上，`console.warn` 会把一次降级放大成控制台风暴。
 * 边界：只认「值 ∈ `validKeys`」；其余（空串、被手改的垃圾值、旧版本遗留值）一律当作**没有记忆**，
 *   由调用方回退默认视图（M4）。
 */
import { useCallback, useState } from "react";
import type { ObjectType } from "./registry";

export const VIEW_MEMORY_PREFIX = "view:default:";

/** 唯一构造记忆键的地方（C5）。 */
export function viewMemoryKey(objectType: ObjectType): string {
  return `${VIEW_MEMORY_PREFIX}${objectType}`;
}

/** 读记忆：无值 / 值不在 `validKeys` / `Storage` 抛 ⇒ `null`（调用方回退默认视图）。 */
export function readViewMemory(
  objectType: ObjectType,
  validKeys: readonly string[],
  storage: Storage = globalThis.localStorage,
): string | null {
  try {
    const raw = storage.getItem(viewMemoryKey(objectType));
    return raw !== null && validKeys.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** 写记忆：配额满 / 隐私模式抛 ⇒ 静默（记忆失败不阻塞切换）。 */
export function writeViewMemory(objectType: ObjectType, key: string, storage: Storage = globalThis.localStorage): void {
  try {
    storage.setItem(viewMemoryKey(objectType), key);
  } catch {
    /* 静默失败（配额满 / 隐私模式 / node 无 localStorage） */
  }
}

/** 视图记忆 hook：返回 `[当前视图键, 选择视图]`。初始值**惰性读取**（不必每次渲染读盘）。 */
export function useViewMemory(
  objectType: ObjectType,
  defaultKey: string,
  validKeys: readonly string[],
  storage: Storage = globalThis.localStorage,
): readonly [string, (key: string) => void] {
  const [key, setKey] = useState<string>(() => readViewMemory(objectType, validKeys, storage) ?? defaultKey);
  const select = useCallback(
    (next: string) => {
      setKey(next);
      writeViewMemory(objectType, next, storage);
    },
    [objectType, storage],
  );
  return [key, select];
}
