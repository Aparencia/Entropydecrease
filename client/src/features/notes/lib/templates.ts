/**
 * 笔记模板内容 — 从 useNoteStore 提取的模板常量
 * @ai-context 各模板类型的初始 TipTap JSON 内容，由 createFromTemplate 调用
 */

import type { Note } from '@/types/models';
import { createEmptyTodoTemplate } from './todoTemplate';

/**
 * 各模板类型的初始内容（TipTap JSON 字符串或空字符串）
 * @ai-context 新建笔记时根据模板类型取对应初始内容
 */
export const TEMPLATE_CONTENT: Record<Note['template'], string> = {
  outline: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '大纲笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '一、' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '二、' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '三、' }] },
    ],
  }),
  cornell: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '康奈尔笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '线索栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '关键词 / 问题' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '笔记栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '主要内容记录' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '总结栏' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '归纳总结' }] },
    ],
  }),
  qa: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '问答笔记' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q1' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A1' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q2' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A2' }] },
    ],
  }),
  /** 思维导图：创建时由 useNoteStore.createFromTemplate 调 createDefaultMindmap 动态生成，此处仅占位 */
  mindmap: '',
  free: '',
  blank: '',
  video: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '视频笔记' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '在此记录视频学习内容，可使用时间戳标记关联视频进度。' }] },
    ],
  }),
  /** v0.11.0: 待办笔记模板占位内容（实际创建时由 createTodoNote 动态生成） */
  todo: createEmptyTodoTemplate(),
};

/**
 * 各模板类型的默认标题
 * @ai-context createFromTemplate 时用作笔记标题
 */
export const TEMPLATE_TITLES: Record<Note['template'], string> = {
  outline: '大纲笔记',
  cornell: '康奈尔笔记',
  qa: '问答笔记',
  mindmap: '思维导图笔记',
  free: '自由笔记',
  blank: '空白笔记',
  video: '视频笔记',
  /** v0.11.0 */
  todo: '待办笔记',
};
