/**
 * 声音记忆锚点 — localStorage 存储
 *
 * @ai-context: 3.11 声音锚点。key 前缀 ed_sound_anchors；读取时做结构校验，
 * 缺失/损坏回退空数组（不抛错）；同一概念 + 同一声音 + 同场景去重。
 */
import { generateId } from '@/lib/utils/uuid';
import { findSoundOption } from './soundOptions';
import type { SoundAnchor, SoundAnchorInput } from '../types';

const STORAGE_KEY = 'ed_sound_anchors';

/** 结构校验：字段齐全且声音选项存在则视为有效记录 */
function isValidAnchor(raw: unknown): raw is SoundAnchor {
  if (!raw || typeof raw !== 'object') return false;
  const a = raw as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.conceptId === 'string' &&
    typeof a.conceptTitle === 'string' &&
    typeof a.soundName === 'string' &&
    typeof a.soundType === 'string' &&
    (a.soundType === 'ambient' || a.soundType === 'melody' || a.soundType === 'effect') &&
    typeof a.bindMode === 'string' &&
    (a.bindMode === 'learn' || a.bindMode === 'review' || a.bindMode === 'exam') &&
    typeof a.createdAt === 'string' &&
    !!findSoundOption(a.soundName)
  );
}

function readAll(): SoundAnchor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAnchor);
  } catch {
    // 数据损坏时回退空数组，不阻塞功能
    return [];
  }
}

function writeAll(anchors: SoundAnchor[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(anchors));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

/** 全部锚点（按创建时间倒序） */
export function listSoundAnchors(): SoundAnchor[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 按概念查询锚点 */
export function findAnchorsByConcept(conceptId: string): SoundAnchor[] {
  return readAll().filter((a) => a.conceptId === conceptId);
}

/** 绑定新锚点；同一概念 + 同一声音 + 同一场景已存在时返回 null */
export function addSoundAnchor(input: SoundAnchorInput): SoundAnchor | null {
  const anchors = readAll();
  const duplicated = anchors.some(
    (a) =>
      a.conceptId === input.conceptId &&
      a.soundName === input.soundName &&
      a.bindMode === input.bindMode,
  );
  if (duplicated) return null;

  const anchor: SoundAnchor = {
    id: generateId(),
    conceptId: input.conceptId,
    conceptTitle: input.conceptTitle,
    soundName: input.soundName,
    soundType: input.soundType,
    bindMode: input.bindMode,
    createdAt: new Date().toISOString(),
  };
  anchors.push(anchor);
  writeAll(anchors);
  return anchor;
}

/** 删除锚点 */
export function removeSoundAnchor(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}
