/**
 * 待办笔记模板的内容生成器
 * @ai-context 当用户从灵感分拣创建待办笔记时，使用此模块生成 TipTap 兼容的 JSON 初始内容。
 * 此模块为纯函数，无副作用，可安全进行单元测试。
 */

/** 待办项数据结构 @ai-context 用于创建待办笔记时传入的初始待办项 */
export interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
  priority: 'low' | 'medium' | 'high';
  /** ISO date string */
  dueDate?: string;
  /** 关联来源灵感 ID @ai-context 从灵感分拣转化时记录原始灵感 ID，便于溯源 */
  sourceInspirationId?: string;
}

/** TipTap taskItem 节点的 JSON 结构 */
interface TipTapTaskItemNode {
  type: 'taskItem';
  attrs: { checked: boolean };
  content: [{ type: 'paragraph'; content: [{ type: 'text'; text: string }] }];
}

/** TipTap 文档根节点 JSON 结构 */
interface TipTapDoc {
  type: 'doc';
  content: unknown[];
}

/**
 * 生成包含单个待办项的 TipTap JSON 文档结构
 * @ai-context 返回值可直接作为 Note.content 字段存储（JSON.stringify 后）
 * 边界条件：text 为空字符串时仍生成有效节点，避免 TipTap 解析异常
 */
export function createTodoTemplateContent(
  initialTodo: Omit<TodoItem, 'id'>,
): string {
  const priorityLabel = formatPriorityLabel(initialTodo.priority);
  const dueDateLabel = initialTodo.dueDate
    ? ` 📅 ${initialTodo.dueDate}`
    : '';

  const taskItem: TipTapTaskItemNode = {
    type: 'taskItem',
    attrs: { checked: initialTodo.checked },
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `${initialTodo.text} [${priorityLabel}]${dueDateLabel}`,
          },
        ],
      },
    ],
  };

  const doc: TipTapDoc = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '待办清单' }],
      },
      {
        type: 'taskList',
        content: [taskItem],
      },
    ],
  };

  return JSON.stringify(doc);
}

/**
 * 生成空的待办模板（仅含标题占位）
 * @ai-context 用户手动新建空白待办笔记时使用
 */
export function createEmptyTodoTemplate(): string {
  const doc: TipTapDoc = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: '待办清单' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '添加新的待办事项...' }],
              },
            ],
          },
        ],
      },
    ],
  };

  return JSON.stringify(doc);
}

/** 将优先级枚举映射为中文标签（纯函数） */
function formatPriorityLabel(priority: TodoItem['priority']): string {
  switch (priority) {
    case 'high': return '高优先';
    case 'medium': return '中优先';
    case 'low': return '低优先';
  }
}
