/**
 * 思维导图自定义节点卡片
 * Mindmap custom node card (React Flow node)
 *
 * @ai-context: 经 nodeTypes 注册为 'mindmapNode'。左右 Handle 对应横向布局
 * （父右→子左）；双击/Enter 进入内联编辑；hover 显示"+"加子节点；有子节点时
 * 显示折叠切换。动作全部经 MindmapContext 上抛，本组件无业务状态。
 * @ai-context: Registered as 'mindmapNode'. LR handles (parent right -> child left);
 * double-click to edit; hover "+" adds child; collapse toggle when has children.
 */
import { memo, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { useMindmapActions } from './MindmapContext';
import type { MindmapFlowNodeData } from '../../lib/mindmap/mindmapConvert';

type MindmapNodeProps = NodeProps<Node<MindmapFlowNodeData>>;

function MindmapNodeCardBase({ id, data, selected }: MindmapNodeProps) {
  const actions = useMindmapActions();
  const { text, collapsed, hasChildren, isRoot } = data;
  const isEditing = actions.editingId === id;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div
      className={cn(
        'group relative flex items-center min-w-[72px] max-w-[220px] px-3 py-1.5 rounded-kb-md border text-b2',
        'bg-bg-elevated text-text-primary border-border/60 shadow-kb-sm transition-all duration-kb-fast',
        selected && 'border-brand-500 ring-2 ring-brand-500/30',
        isRoot && 'font-semibold bg-brand-50 border-brand-300',
      )}
    >
      {/* 父→子连接点（横向布局：入左出右） / handles for LR layout */}
      {!isRoot && <Handle type="target" position={Position.Left} className="!bg-brand-400 !w-2 !h-2" />}
      <Handle type="source" position={Position.Right} className="!bg-brand-400 !w-2 !h-2" />

      {isEditing ? (
        <input
          ref={inputRef}
          defaultValue={text}
          onBlur={(e) => actions.onCommitEdit(id, e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') actions.onCommitEdit(id, e.currentTarget.value);
            else if (e.key === 'Escape') actions.onCancelEdit();
          }}
          className="w-full bg-transparent outline-none text-b2 text-text-primary placeholder:text-text-tertiary"
          placeholder="输入内容…"
        />
      ) : (
        <span
          onDoubleClick={() => actions.onStartEdit(id)}
          className={cn('truncate select-none', !text && 'text-text-tertiary italic')}
        >
          {text || '未命名'}
        </span>
      )}

      {/* 加子节点（hover 显示），升级 title 为 Tip */}
      {!isEditing && (
        <Tip text="添加子节点" side="right">
        <button
          onClick={(e) => { e.stopPropagation(); actions.onAddChild(id); }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-kb-fast hover:bg-brand-600 z-10"
        >
          <Plus className="w-3 h-3" strokeWidth={2.5} />
        </button>
        </Tip>
      )}

      {/* 折叠切换（有子节点时），升级 title 为 Tip */}
      {hasChildren && !isEditing && (
        <Tip text={collapsed ? '展开' : '折叠'} side="right">
        <button
          onClick={(e) => { e.stopPropagation(); actions.onToggleCollapse(id); }}
          className="absolute -right-3 -bottom-3 w-5 h-5 rounded-full bg-bg-tertiary border border-border/60 text-text-secondary flex items-center justify-center hover:text-text-primary z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" strokeWidth={2} /> : <ChevronDown className="w-3 h-3" strokeWidth={2} />}
        </button>
        </Tip>
      )}
    </div>
  );
}

export const MindmapNodeCard = memo(MindmapNodeCardBase);
