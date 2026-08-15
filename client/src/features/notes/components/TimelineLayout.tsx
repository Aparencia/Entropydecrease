/**
 * 时间线笔记布局（Timeline Template）
 *
 * @ai-context: 以时间轴为核心组织笔记事件节点。支持时间刻度缩放、事件展开/折叠、
 * 多种内容类型标注。适合历史、项目进度、学习路径等场景。
 * @ai-context: Timeline template — organizes note events along a timeline.
 * Supports scale zoom, event expand/collapse, and multi-type content.
 */
import { useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  content: string;
  type: 'note' | 'milestone' | 'resource' | 'reflection';
}

interface TimelineData {
  events: TimelineEvent[];
}

interface TimelineLayoutProps {
  content: TimelineData;
  onChange: (data: TimelineData) => void;
}

const EVENT_TYPES = [
  { key: 'note' as const, label: '笔记', color: 'bg-brand-100 text-brand-700 border-brand-300' },
  { key: 'milestone' as const, label: '里程碑', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'resource' as const, label: '资源', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'reflection' as const, label: '反思', color: 'bg-purple-100 text-purple-700 border-purple-300' },
];

function createEvent(): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    title: '',
    content: '',
    type: 'note',
  };
}

export function TimelineLayout({ content, onChange }: TimelineLayoutProps) {
  const [events, setEvents] = useState<TimelineEvent[]>(content?.events || [createEvent()]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));

  const updateEvent = useCallback((eventId: string, field: string, value: string) => {
    setEvents((prev) => {
      const next = prev.map((e) =>
        e.id === eventId ? { ...e, [field]: value } : e,
      );
      onChange({ events: next });
      return next;
    });
  }, [onChange]);

  const addEvent = useCallback(() => {
    setEvents((prev) => {
      const next = [...prev, createEvent()];
      onChange({ events: next });
      return next;
    });
  }, [onChange]);

  const deleteEvent = useCallback((eventId: string) => {
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== eventId);
      onChange({ events: next.length > 0 ? next : [createEvent()] });
      return next.length > 0 ? next : [createEvent()];
    });
  }, [onChange]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <p className="text-b3 font-medium text-text-primary">时间线</p>
        <button
          onClick={addEvent}
          className="flex items-center gap-1 px-2.5 py-1 rounded-kb-sm text-c1 font-medium text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          添加事件
        </button>
      </div>

      <div className="relative pl-6">
        {/* 时间轴线 */}
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border/40" />

        {sorted.map((event) => {
          const typeConfig = EVENT_TYPES.find((t) => t.key === event.type) || EVENT_TYPES[0];
          const isExpanded = expandedId === event.id;

          return (
            <div key={event.id} className="relative mb-4 group">
              {/* 时间轴节点 */}
              <div className={cn(
                'absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2',
                typeConfig.color.split(' ')[0],
                'border-current',
              )} />

              <div className="ml-2 p-3 rounded-kb-md border border-border/30 bg-bg-secondary hover:bg-bg-secondary/80 transition-colors">
                {/* 头部 */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={event.date}
                    onChange={(e) => updateEvent(event.id, 'date', e.target.value)}
                    className="text-c1 text-text-tertiary bg-transparent border-none focus:outline-none font-mono"
                  />
                  <select
                    value={event.type}
                    onChange={(e) => updateEvent(event.id, 'type', e.target.value)}
                    className={cn(
                      'px-1.5 py-0.5 rounded-kb-sm text-c1 font-medium border',
                      typeConfig.color,
                    )}
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="p-0.5 text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="ml-auto p-0.5 text-text-tertiary hover:text-semantic-error opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>

                {/* 标题 */}
                <input
                  value={event.title}
                  onChange={(e) => updateEvent(event.id, 'title', e.target.value)}
                  placeholder="事件标题..."
                  className="w-full text-b2 font-medium text-text-primary bg-transparent border-none focus:outline-none placeholder:text-text-tertiary/50 mb-1"
                />

                {/* 内容（展开时显示） */}
                {isExpanded && (
                  <textarea
                    value={event.content}
                    onChange={(e) => updateEvent(event.id, 'content', e.target.value)}
                    placeholder="详细内容..."
                    className="w-full mt-1 px-2 py-1.5 rounded-kb-sm border border-border/20 bg-bg-primary text-b2 text-text-secondary placeholder:text-text-tertiary/50 resize-none focus:outline-none focus:border-brand-400 transition-colors"
                    rows={4}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TimelineLayout;