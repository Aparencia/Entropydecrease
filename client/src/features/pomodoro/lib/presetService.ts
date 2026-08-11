/**
 * 番茄钟预设 CRUD 服务
 *
 * @ai-context: 预设数据层操作独立于 Zustand store，避免 usePomodoroStore
 * 继续膨胀（已超 300 行）。首次启动时根据用户当前 settings 种子化两个
 * 内置预设（"上课""自习"），体验无缝迁移。预设上限 6 个（含内置）。
 * @ai-context: Pomodoro preset CRUD service — separated from store to respect
 * the 300-line file limit. Seeds two builtin presets on first launch.
 */
import { pomodoroPresetStore } from '@/lib/storage';
import type { PomodoroPreset, PomodoroSettings } from '@/types/models';

/** 预设数量上限（含内置） */
export const MAX_PRESETS = 8;

/**
 * 获取全部预设（按 sortOrder 升序）
 */
export async function getAllPresets(): Promise<PomodoroPreset[]> {
  const all = await pomodoroPresetStore.getAll();
  return all.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 根据 ID 获取单个预设
 */
export async function getPresetById(id: string): Promise<PomodoroPreset | undefined> {
  return pomodoroPresetStore.getById(id);
}

/**
 * 创建新预设（自动分配 sortOrder）
 * @throws 达到上限时抛出 Error
 */
export async function createPreset(
  data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>,
): Promise<PomodoroPreset> {
  const existing = await pomodoroPresetStore.getAll();
  if (existing.length >= MAX_PRESETS) {
    throw new Error(`预设数量已达上限（最多 ${MAX_PRESETS} 个）`);
  }
  const maxOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1);
  const preset: PomodoroPreset = {
    ...data,
    id: crypto.randomUUID(),
    builtin: false,
    sortOrder: maxOrder + 1,
    createdAt: new Date().toISOString(),
  };
  await pomodoroPresetStore.create(preset);
  return preset;
}

/**
 * 更新预设（内置预设也可编辑参数，不可改 builtin 标记）
 */
export async function updatePreset(
  id: string,
  changes: Partial<Omit<PomodoroPreset, 'id' | 'builtin'>>,
): Promise<void> {
  // 禁止通过 update 修改 builtin 属性
  const { builtin: _ignored, ...safeChanges } = changes as Partial<PomodoroPreset>;
  await pomodoroPresetStore.update(id, safeChanges);
}

/**
 * 删除预设（内置预设不可删除）
 * @throws 尝试删除内置预设时抛出 Error
 */
export async function deletePreset(id: string): Promise<void> {
  const preset = await pomodoroPresetStore.getById(id);
  if (!preset) return;
  if (preset.builtin) {
    throw new Error('内置预设不可删除');
  }
  await pomodoroPresetStore.delete(id);
}

/**
 * 重排预设顺序
 * @param orderedIds 按目标顺序排列的预设 ID 数组
 */
export async function reorderPresets(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => pomodoroPresetStore.update(id, { sortOrder: index })),
  );
}

/**
 * 首次启动种子化：若预设表为空，根据用户当前 settings 创建两个内置预设
 * - "上课"：workDuration=classDuration, longBreakInterval=0, silent=true
 * - "自习"：workDuration=workDuration, longBreakInterval=settings.longBreakInterval
 *
 * 并发防护：dev 环境 StrictMode 双调用 useEffect 时两次 initialize 会在首次
 * 写入提交前都读到空表，各自种子化造成内置预设翻倍（占用预设名额）。
 * 用模块级 promise 串行化同会话内的并发调用；并修复已存在的重复内置脏数据。
 */
let seedingPromise: Promise<PomodoroPreset[]> | null = null;

export function seedBuiltinPresets(settings: PomodoroSettings): Promise<PomodoroPreset[]> {
  if (!seedingPromise) seedingPromise = doSeedBuiltinPresets(settings);
  return seedingPromise;
}

async function doSeedBuiltinPresets(settings: PomodoroSettings): Promise<PomodoroPreset[]> {
  const existing = await pomodoroPresetStore.getAll();

  // 修复历史脏数据：同名重复内置预设（旧版并发种子化竞态产物）仅保留 sortOrder 最小者
  const seenNames = new Set<string>();
  const sortedAll = [...existing].sort((a, b) => a.sortOrder - b.sortOrder);
  const duplicates = sortedAll.filter((p) => {
    if (!p.builtin) return false;
    if (seenNames.has(p.name)) return true;
    seenNames.add(p.name);
    return false;
  });
  if (duplicates.length > 0) {
    await Promise.all(duplicates.map((d) => pomodoroPresetStore.delete(d.id)));
  }
  const clean = sortedAll.filter((p) => !duplicates.includes(p));
  if (clean.length > 0) return clean;

  const now = new Date().toISOString();
  const classPreset: PomodoroPreset = {
    id: crypto.randomUUID(),
    name: '上课',
    icon: 'GraduationCap',
    workDuration: settings.classDuration ?? 45,
    shortBreakDuration: settings.shortBreakDuration ?? 5,
    longBreakDuration: settings.longBreakDuration ?? 15,
    longBreakInterval: 0, // 无长休（上课模式语义）
    silent: true,
    builtin: true,
    sortOrder: 0,
    createdAt: now,
    mood: 'grid', // 纪律感：经纬网格粒子外形
  };
  const studyPreset: PomodoroPreset = {
    id: crypto.randomUUID(),
    name: '自习',
    icon: 'BookOpen',
    workDuration: settings.workDuration ?? 25,
    shortBreakDuration: settings.shortBreakDuration ?? 5,
    longBreakDuration: settings.longBreakDuration ?? 15,
    longBreakInterval: settings.longBreakInterval ?? 4,
    silent: false,
    builtin: true,
    sortOrder: 1,
    createdAt: now,
    mood: 'flow', // 自由：流动壳粒子外形
  };

  await pomodoroPresetStore.bulkCreate([classPreset, studyPreset]);
  return [classPreset, studyPreset];
}