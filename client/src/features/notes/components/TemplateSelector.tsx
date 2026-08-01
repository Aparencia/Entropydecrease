/**
 * @ai-context: 通用组件：TemplateSelector。
 */
import { useState } from 'react';
import { Modal } from '@/components/ui';
import { List, Layout, GitBranch, PenTool, FileText, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NoteTemplate = 'outline' | 'cornell' | 'mindmap' | 'free' | 'blank' | 'todo';

interface TemplateOption {
  id: NoteTemplate;
  name: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
}

const templates: TemplateOption[] = [
  { id: 'outline', name: '大纲式', description: '层级分明的结构化笔记', icon: List },
  { id: 'cornell', name: '康奈尔笔记法', description: '线索·笔记·总结三栏法', icon: Layout },
  { id: 'mindmap', name: '思维导图', description: '可交互的可视化导图，支持节点增删与折叠', icon: GitBranch },
  { id: 'free', name: '自由笔记', description: '无拘束的自由书写空间', icon: PenTool },
  { id: 'blank', name: '空白笔记', description: '从零开始的纯净画布', icon: FileText },
  { id: 'todo', name: '待办笔记', description: '可勾选的任务清单笔记', icon: ListTodo },
];

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: NoteTemplate) => void;
}

export function TemplateSelector({ open, onClose, onSelect }: TemplateSelectorProps) {
  const [selected, setSelected] = useState<NoteTemplate | null>(null);

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
      setSelected(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setSelected(null); onClose(); }}
      title="选择笔记模板"
      description="为你的新笔记选择一种排版模板"
      size="lg"
      footer={
        <>
          <button
            onClick={() => { setSelected(null); onClose(); }}
            className={cn(
              'px-4 py-2 text-b2 rounded-kb-md font-medium',
              'bg-bg-tertiary text-text-secondary',
              'hover:bg-border transition-all duration-kb-fast',
            )}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className={cn(
              'px-4 py-2 text-b2 rounded-kb-md font-medium',
              'bg-brand-600 text-white shadow-kb-sm',
              'hover:bg-brand-700 transition-all duration-kb-fast',
              !selected && 'opacity-40 cursor-not-allowed',
            )}
          >
            开始创建
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {templates.map((t) => {
          const Icon = t.icon;
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-2',
                'w-full aspect-[160/180] rounded-kb-lg',
                'border-2 transition-all duration-kb-normal ease-kb-default',
                'hover:-translate-y-1 hover:shadow-kb-md',
                isSelected
                  ? 'border-brand-500 bg-brand-50 shadow-kb-sm'
                  : 'border-border/50 bg-bg-elevated hover:border-brand-300',
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-kb-md flex items-center justify-center',
                'transition-colors duration-kb-fast',
                isSelected ? 'bg-brand-100 text-brand-600' : 'bg-bg-tertiary text-text-secondary',
              )}>
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <span className={cn(
                'text-b2 font-medium',
                isSelected ? 'text-brand-700' : 'text-text-primary',
              )}>
                {t.name}
              </span>
              <span className="text-c1 text-text-tertiary px-3 text-center leading-tight">
                {t.description}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
