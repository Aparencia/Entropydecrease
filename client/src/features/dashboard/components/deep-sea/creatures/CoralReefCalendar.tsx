/**
 * @file 珊瑚礁日历 -- 打卡日历热力图
 * @description 月历网格以珊瑚礁色斑形态呈现，已打卡日期为发光珊瑚
 * @ai-context: 替代原 DashboardPage 内联的打卡日历，保留原有 calendarDays 数据接口
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface CalendarDay {
  day: number | null;
  checked: boolean;
  isToday: boolean;
}

interface Props {
  days: CalendarDay[];
  month: number;
  year: number;
}

/** 珊瑚颜色强度（基于打卡状态） */
function getCoralStyle(checked: boolean, isToday: boolean) {
  if (checked) {
    return {
      bg: 'bg-gradient-to-br from-brand-400/80 to-brand-600/60',
      glow: 'shadow-[0_0_8px_rgba(91,138,114,0.4)]',
      text: 'text-white font-semibold',
    };
  }
  if (isToday) {
    return {
      bg: 'bg-bg-tertiary/40',
      glow: 'ring-1 ring-cyan-400/40 ring-offset-1 ring-offset-transparent',
      text: 'text-cyan-300/80',
    };
  }
  return {
    bg: 'bg-bg-tertiary/20',
    glow: '',
    text: 'text-text-tertiary/50',
  };
}

export default function CoralReefCalendar({ days, month, year }: Props) {
  const prefersReduced = useReducedMotion();
  const weeks = ['一', '二', '三', '四', '五', '六', '日'];

  const checkedCount = useMemo(() => days.filter((d) => d.checked).length, [days]);

  return (
    <motion.div
      className="rounded-[var(--kb-radius-lg)] border border-cyan-400/15 bg-bg-elevated/30 backdrop-blur-sm p-3 overflow-hidden"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label={`${year}年${month + 1}月打卡日历`}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-medium text-cyan-200/70">
          {year}年{month + 1}月 珊瑚礁
        </h3>
        <span className="text-[9px] text-brand-400/60">
          {checkedCount} 天活跃
        </span>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weeks.map((w) => (
          <div key={w} className="text-center text-[7px] text-cyan-300/30 font-medium">{w}</div>
        ))}
      </div>

      {/* 珊瑚礁网格 */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((cell, i) => {
          if (cell.day === null) {
            return <div key={i} className="h-[22px]" />;
          }
          const style = getCoralStyle(cell.checked, cell.isToday);
          return (
            <motion.div
              key={i}
              initial={prefersReduced ? {} : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.005, duration: 0.15 }}
              className={cn(
                'h-[22px] flex items-center justify-center rounded-[4px] text-[8px] transition-all duration-300',
                style.bg,
                style.glow,
                style.text,
                cell.checked && 'hover:shadow-[0_0_12px_rgba(91,138,114,0.5)]',
              )}
            >
              {cell.day}
            </motion.div>
          );
        })}
      </div>

      {/* 底色弥散 */}
      <div className="absolute inset-0 pointer-events-none rounded-[var(--kb-radius-lg)] bg-gradient-to-t from-brand-500/[0.02] to-transparent" />
    </motion.div>
  );
}
