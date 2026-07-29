/**
 * 笔记编辑器工具栏（极简浮动条）
 *
 * @ai-context: 从 NoteEditPage 拆出。全部按钮通过 editor.chain() 直接操作
 * TipTap 实例，isActive 状态由 editor 查询驱动；康奈尔/自由画布模板下
 * 由父级决定不渲染。颜色选择器用透明 input[type=color] 覆盖图标实现。
 */
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Highlighter, Heading1, Heading2, Heading3, List, ListOrdered,
  Code, Quote, Undo2, Redo2,
  Table2, ListTodo, ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolbarButtonProps {
  icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

export function ToolbarButton({ icon: Icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'p-kb-sm rounded-kb-sm transition-all duration-kb-fast',
        isActive
          ? 'bg-brand-50 text-brand-600'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
        'active:bg-bg-secondary active:scale-95',
      )}
    >
      <Icon className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
    </button>
  );
}

export function ToolbarDivider() {
  return <div className="w-px h-5 bg-border/50 mx-1" />;
}

export interface EditorToolbarProps {
  editor: Editor | null;
  /** 触发隐藏的图片上传 input */
  onPickImage: () => void;
}

export function EditorToolbar({ editor, onPickImage }: EditorToolbarProps) {
  return (
    <div className="sticky top-0 z-20 mx-auto mt-2 flex items-center gap-1 px-4 py-1.5 rounded-[var(--kb-radius-lg)] border border-border/20 flex-shrink-0 overflow-x-auto max-w-fit bg-bg-elevated/70 backdrop-blur-xl shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] opacity-70 hover:opacity-100 transition-opacity duration-300">
      <ToolbarButton icon={Undo2} label="撤销" onClick={() => editor?.chain().focus().undo().run()} />
      <ToolbarButton icon={Redo2} label="重做" onClick={() => editor?.chain().focus().redo().run()} />
      <ToolbarDivider />
      {([1, 2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          icon={level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3}
          label={`标题 ${level}`}
          isActive={editor?.isActive('heading', { level })}
          onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
        />
      ))}
      <ToolbarDivider />
      <ToolbarButton
        icon={Bold}
        label="加粗"
        isActive={editor?.isActive('bold')}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="斜体"
        isActive={editor?.isActive('italic')}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={UnderlineIcon}
        label="下划线"
        isActive={editor?.isActive('underline')}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="删除线"
        isActive={editor?.isActive('strike')}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        icon={Highlighter}
        label="高亮"
        isActive={editor?.isActive('highlight')}
        onClick={() => editor?.chain().focus().toggleHighlight().run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={List}
        label="无序列表"
        isActive={editor?.isActive('bulletList')}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="有序列表"
        isActive={editor?.isActive('orderedList')}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="引用"
        isActive={editor?.isActive('blockquote')}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={Code}
        label="代码块"
        isActive={editor?.isActive('codeBlock')}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon={Table2}
        label="插入表格"
        onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      <ToolbarButton
        icon={ListTodo}
        label="任务列表"
        isActive={editor?.isActive('taskList')}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton icon={ImageIcon} label="插入图片" onClick={onPickImage} />
      <ToolbarDivider />
      {([
        { align: 'left', icon: AlignLeft, label: '左对齐' },
        { align: 'center', icon: AlignCenter, label: '居中' },
        { align: 'right', icon: AlignRight, label: '右对齐' },
        { align: 'justify', icon: AlignJustify, label: '两端对齐' },
      ] as const).map(({ align, icon, label }) => (
        <ToolbarButton
          key={align}
          icon={icon}
          label={label}
          isActive={editor?.isActive({ textAlign: align })}
          onClick={() => editor?.chain().focus().setTextAlign(align).run()}
        />
      ))}
      <ToolbarDivider />
      <label
        title="文字颜色"
        className="relative p-kb-sm rounded-kb-sm cursor-pointer text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-bg-secondary active:scale-95 transition-all duration-kb-fast"
      >
        <Palette className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        <input
          type="color"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
        />
      </label>
    </div>
  );
}
