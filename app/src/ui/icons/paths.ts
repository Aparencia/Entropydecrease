/**
 * @ai-context 图标注册表的**唯一入口**：合并各分组数据、派生 `IconName`、做启动期契约校验。
 *
 * Why：图标名必须是**字面量联合**而不是 `string` —— 批 4 会在数百处写 `<Icon name="…" />`，
 * 拼错必须在编译期报错（与批 0-A 把 `cssVar` 参数收紧为 `ColorTokenName` 同一个理由）。
 *
 * 副作用：模块加载时执行一次启动期校验（重名检测），失败即抛 —— 让冲突在 import 期炸掉，
 * 而不是等到某个图标渲染成空白。
 * 边界：新增分组数据文件时必须在此合并，否则图标「存在但注册不到」。
 */

import type { IconGeometry } from "./types";
import { DOMAIN_ICON_PATHS } from "./paths.domain";

// `as const` 保留各分组的**字面量键** —— 这正是 `IconName` 联合的来源，零列名即可派生。
const GROUPS = {
  domain: DOMAIN_ICON_PATHS,
} as const;

// 供 mergeGroups 的 Object.entries 使用：`as const` 的只读键会让 Object.entries 重载失配，
// 故给一个宽别名专供遍历。别名不参与类型推导，故不会污染上面 GROUPS 的字面量键。
const GROUPS_FOR_MERGE: Readonly<Record<string, Readonly<Record<string, IconGeometry>>>> = GROUPS;

function mergeGroups(): Record<string, IconGeometry> {
  const merged: Record<string, IconGeometry> = {};
  for (const [groupName, group] of Object.entries(GROUPS_FOR_MERGE)) {
    for (const [name, geometry] of Object.entries(group)) {
      if (merged[name]) {
        // 重名会让「哪个几何生效」取决于对象键顺序 —— 静默且难以定位，故直接拒绝
        throw new Error(`图标重名：${name}（分组 ${groupName} 与其它分组冲突）`);
      }
      merged[name] = geometry;
    }
  }
  return merged;
}

export const ICON_PATHS: Readonly<Record<string, IconGeometry>> = mergeGroups();

export const ICON_NAMES: readonly string[] = Object.keys(ICON_PATHS).sort();

/**
 * 全部已注册图标名的字面量联合 —— 由分组数据的键集**派生**（而非手写清单），
 * 故新增图标时无需改类型，且拼错名字必然是编译错误。
 */
export type IconName = { [G in keyof typeof GROUPS]: keyof (typeof GROUPS)[G] }[keyof typeof GROUPS];
