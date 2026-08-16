/**
 * 笔记模板常量：各类笔记模板的初始内容与默认标题
 * Note template constants: initial content and default titles per template
 *
 * @ai-context: 从 useNoteStore 拆出的纯常量模块（无副作用）。TEMPLATE_CONTENT
 * 为 TipTap JSON / 结构化 JSON 序列化字符串，createFromTemplate 创建时直接使用；
 * mindmap 与 todo 为占位（创建时由 createDefaultMindmap / createTodoNote 动态生成，
 * 避免复用模板中的节点 id）。TEMPLATE_TITLES 为各模板默认标题。
 * @ai-context: Pure constant module extracted from useNoteStore. mindmap and todo
 * entries are placeholders — real content is generated dynamically on creation so
 * node ids are never reused across notes.
 */
import type { Note } from '@/types/models';
import { createEmptyTodoTemplate } from './todoTemplate';

/** 各模板创建时的初始内容（TipTap JSON / 结构化 JSON 字符串） */
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
  /** 思维导图模板：创建时由 createFromTemplate 调 createDefaultMindmap 动态生成（全新节点 id），此处仅占位 */
  mindmap: '',
  free: '',
  'qa-grid': JSON.stringify({
    rows: [],
  }),
  timeline: JSON.stringify({
    events: [],
  }),
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

/** 各模板创建时的默认标题 */
export const TEMPLATE_TITLES: Record<Note['template'], string> = {
  outline: '大纲笔记',
  cornell: '康奈尔笔记',
  qa: '问答笔记',
  mindmap: '思维导图笔记',
  free: '自由笔记',
  'qa-grid': '问答网格',
  timeline: '时间线笔记',
  blank: '空白笔记',
  video: '视频笔记',
  /** v0.11.0 */
  todo: '待办笔记',
};
