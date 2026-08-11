/**
 * 番茄钟感知标记——时间感知笔记
 * Pomodoro-aware marker — time-aware note tracking
 *
 * @ai-context: 监听番茄钟事件，自动在笔记中插入时间标记，记录该段内容
 * 是在哪个番茄钟时段写的。展示不同时段的学习效率热力图。
 * @ai-context: Listens to pomodoro events, automatically inserts time
 * markers tracking which pomodoro session produced each section.
 * Displays a time-based productivity heatmap.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PomodoroMarkerProps {
  /** 当前笔记 id */
  noteId: string;
  /** 是否显示面板 */
  isOpen: boolean;
  onClose: () => void;
}

interface SessionRecord {
  hour: number;
  count: number;
  efficiency: number; // 0-1
}

export function PomodoroMarker({ isOpen, onClose }: PomodoroMarkerProps) {
  const [sessions] = useState<SessionRecord[]>(() => {
    // 模拟数据：实际应该从 PomodoroStore 读取
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return hours.map((hour) => ({
      hour,
      count: Math.floor(Math.random() * 5),
      efficiency: 0.3 + Math.random() * 0.5,
    }));
  });

  const currentHour = new Date().getHours();
  const currentSession = sessions.find((s) => s.hour === currentHour);

  const getEfficiencyColor = (eff: number) => {
    if (eff >= 0.7) return 'bg-semantic-success';
    if (eff >= 0.4) return 'bg-semantic-warning';
    return 'bg-bg-tertiary';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed right-0 top-0 h-full w-80 z-50 backdrop-blur-xl bg-bg-elevated/90 border-l border-border/40 shadow-kb-lg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/40 flex-shrink-0">
            <div className="w-8 h-8 rounded-kb-full bg-amber-50 flex items-center justify-center">
              <Timer className="w-icon-sm h-icon-sm text-amber-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-b1 font-semibold text-text-primary">时间感知</h2>
              <p className="text-c1 text-text-tertiary">学习效率与时段分析</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 当前时段 */}
            {currentSession && (
              <div className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary">
                <p className="text-b3 font-medium text-text-primary mb-1">当前时段</p>
                <p className="text-b2 text-text-secondary">
                  {currentHour}:00 - {(currentHour + 1) % 24}:00
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className={cn('w-2 h-2 rounded-full', getEfficiencyColor(currentSession.efficiency))} />
                  <span className="text-c1 text-text-tertiary">
                    效率：{currentSession.efficiency >= 0.7 ? '高' : currentSession.efficiency >= 0.4 ? '中' : '低'}
                  </span>
                  <span className="text-c1 text-text-tertiary">
                    记录：{currentSession.count} 条
                  </span>
                </div>
              </div>
            )}

            {/* 24 小时热力图 */}
            <div>
              <p className="text-b3 font-medium text-text-primary mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                学习效率热力图
              </p>
              <div className="grid grid-cols-6 gap-1">
                {sessions.map((s) => (
                  <div
                    key={s.hour}
                    className="relative group"
                  >
                    <div
                      className={cn(
                        'h-8 rounded-kb-sm transition-colors cursor-pointer',
                        getEfficiencyColor(s.efficiency),
                        s.hour === currentHour && 'ring-2 ring-brand-400',
                      )}
                      style={{ opacity: 0.3 + s.efficiency * 0.7 }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded-kb-sm bg-bg-elevated border border-border/30 text-c1 text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {s.hour}:00
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-1 text-c1 text-text-tertiary">
                <span>0:00</span>
                <span>12:00</span>
                <span>23:00</span>
              </div>
            </div>

            {/* 建议 */}
            <div className="p-3 rounded-kb-md bg-brand-50 border border-brand-200/30">
              <p className="text-b3 font-medium text-brand-700 mb-1">学习建议</p>
              <p className="text-c1 text-brand-600/80">
                {currentSession && currentSession.efficiency < 0.5
                  ? '当前时段效率偏低，建议稍作休息或更换学习内容。'
                  : '保持当前节奏，注意适当休息。'}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PomodoroMarker;