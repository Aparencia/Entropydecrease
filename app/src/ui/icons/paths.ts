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

const GROUPS: Readonly<Record<string, Readonly<Record<string, IconGeometry>>>> = {
  domain: DOMAIN_ICON_PATHS,
};

function mergeGroups(): Record<string, IconGeometry> {
  const merged: Record<string, IconGeometry> = {};
  for (const [groupName, group] of Object.entries(GROUPS)) {
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

export type IconName = keyof typeof ICON_PATHS;
