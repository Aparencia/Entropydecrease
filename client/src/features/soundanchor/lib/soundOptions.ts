/**
 * 声音记忆锚点 — 可绑定声音选项
 *
 * @ai-context: 3.11 声音锚点。选项来自 public/audio/*.mp3（环境音/生活音效），
 * 通过 publicAssetUrl 解析 URL，兼容 Electron file:// 协议。
 */
import { publicAssetUrl } from '@/lib/assets/publicAssetUrl';
import type { SoundType } from '../types';

export interface SoundOption {
  fileName: string;
  name: string;
  type: SoundType;
  description: string;
}

/** public/audio 下已有的声音文件（11 个） */
export const SOUND_OPTIONS: SoundOption[] = [
  // 环境白噪音（专注/氛围）
  { fileName: 'rain.mp3', name: '雨声', type: 'ambient', description: '淅沥雨声，适合安静沉思' },
  { fileName: 'stream.mp3', name: '溪流', type: 'ambient', description: '潺潺流水，放松而清醒' },
  { fileName: 'wind-wheat.mp3', name: '麦浪风', type: 'ambient', description: '风吹麦田的沙沙声' },
  { fileName: 'campfire.mp3', name: '篝火', type: 'ambient', description: '噼啪柴火，温暖专注' },
  { fileName: 'silkworm.mp3', name: '蚕食', type: 'ambient', description: '沙沙细响，如笔尖划过纸面' },
  { fileName: 'study-hall.mp3', name: '自习室', type: 'ambient', description: '教室环境声，唤起学习情境' },
  { fileName: 'morning-rhythm.mp3', name: '晨间韵律', type: 'ambient', description: '清晨节奏，元气开场' },
  // 生活音效（场景联想）
  { fileName: 'traffic.mp3', name: '车流', type: 'effect', description: '城市车流声，忙碌节奏' },
  { fileName: 'train.mp3', name: '火车', type: 'effect', description: '列车行进声，通勤联想' },
  { fileName: 'restaurant.mp3', name: '餐厅', type: 'effect', description: '餐馆人声，烟火气' },
  { fileName: 'cargo-ship.mp3', name: '货轮', type: 'effect', description: '港口货轮汽笛与浪声' },
];

export const SOUND_TYPE_LABELS: Record<SoundType, string> = {
  ambient: '环境音',
  melody: '旋律',
  effect: '生活音',
};

/** 声音文件名 → 选项查找 */
export function findSoundOption(fileName: string): SoundOption | undefined {
  return SOUND_OPTIONS.find((o) => o.fileName === fileName);
}

/** 声音展示名（找不到时回退文件名） */
export function soundDisplayName(fileName: string): string {
  return findSoundOption(fileName)?.name ?? fileName.replace(/\.mp3$/, '');
}

/** 声音类型（找不到时按文件名前缀猜测，回退 ambient） */
export function soundTypeOf(fileName: string): SoundType {
  return findSoundOption(fileName)?.type ?? 'ambient';
}

/** 可播放 URL（经 publicAssetUrl 兼容 Electron file://） */
export function soundAssetUrl(fileName: string): string {
  return publicAssetUrl(`/audio/${fileName}`);
}
