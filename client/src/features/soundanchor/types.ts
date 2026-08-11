/**
 * 声音记忆锚点 — 类型定义
 *
 * @ai-context: 3.11 声音记忆锚点——将概念与一段环境声音绑定，复习时播放
 * 该声音作为记忆提取线索（情境依赖记忆）。绑定场景分学习/复习/考试。
 */
export type SoundType = 'ambient' | 'melody' | 'effect';

export type BindMode = 'learn' | 'review' | 'exam';

export interface SoundAnchor {
  id: string;
  /** 绑定的概念 ID（笔记 ID 或自定义标识） */
  conceptId: string;
  /** 概念标题（冗余存储，展示用） */
  conceptTitle: string;
  /** 绑定的声音名称（对应 public/audio 下的文件） */
  soundName: string;
  soundType: SoundType;
  bindMode: BindMode;
  createdAt: string;
}

export interface SoundAnchorInput {
  conceptId: string;
  conceptTitle: string;
  soundName: string;
  soundType: SoundType;
  bindMode: BindMode;
}

export const BIND_MODE_LABELS: Record<BindMode, string> = {
  learn: '学习',
  review: '复习',
  exam: '考试',
};
