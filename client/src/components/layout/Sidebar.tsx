/**
 * @ai-context: 布局组件：Sidebar。
 */
import { useState, useMemo, useCallback, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Timer, FileText, Layers, Lightbulb, Settings,
  MessageSquare, Clapperboard, BarChart3, Sparkles,
  Sun, Moon, ChevronRight, ChevronLeft, User as UserIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { useSidebarStore } from '@/stores/useSidebarStore';
import { useCaptureStore } from '@/stores/useCaptureStore';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { SPRING, BEAT } from '@/lib/animation/springConfig';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { useIsNewbiePhase } from '@/features/onboarding/firstDive/useFirstDiveStore';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import FeedbackPanel from './FeedbackPanel';

/* ── 导航配置 ── */
// subtitle：新手期双标签副标题（隐喻名无法自解释，首潜完成前附直白说明）
const navSection1 = [
  { to: '/', label: '首页', icon: Home, shortcut: '⌘ 1', exact: true },
];

const navSection2 = [
  { to: '/pomodoro', label: '深潜', subtitle: '专注番茄钟', icon: Timer, shortcut: '⌘ 2', dotColor: 'bg-brand-500' },
  { to: '/notes', label: '结礁', subtitle: '学习笔记', icon: FileText, shortcut: '⌘ 3', dotColor: 'bg-note' },
  { to: '/flashcards', label: '反衰减呼吸', subtitle: '记忆闪卡', icon: Layers, shortcut: '⌘ 4', dotColor: 'bg-flashcard' },
  { to: '/feynman', label: '浮出水面', subtitle: '费曼讲解', icon: Lightbulb, shortcut: '⌘ 5', dotColor: 'bg-feynman' },
];

const navSection3 = [
  { to: '/analytics', label: '数据分析', icon: BarChart3, shortcut: '⌘ 6' },
  { to: '/inspiration', label: '萤火海沟', subtitle: '灵感收集', icon: Sparkles, shortcut: '⌘ 6' },
  { to: '/classroom', label: '回声定位', subtitle: '课堂采集', icon: Clapperboard, shortcut: '⌘ 7', dotColor: 'bg-classroom' },
];

/* ── 蔡格尼克效应：待继续任务提示池 ── */
const ghostTaskPool = [
  '上次的结礁还没整理完…',
  '今天开始学习了吗？',
  '还有几组反衰减呼吸在等你复习…',
  '昨天标记的错题可以回顾一下了…',
  '上次学到哪了？继续吧…',
  '今天的第一个深潜还没开始…',
  '知识脉络还差一点就理清了…',
  '萤火海沟一闪而过，记下来了吗…',
];

// 从池中随机取 N 条
function pickRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/* ── 动画 variants ── */
const sidebarItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.03, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

export default function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const captureOpen = useCaptureStore((s) => s.open);
  const setCaptureOpen = useCaptureStore((s) => s.setOpen);
  const { user, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // 新手期显示模块副标题（首潜完成后自动隐去）
  const isNewbie = useIsNewbiePhase();

  // 从各学习模块 store 聚合真实进度数据（深潜/闪卡/笔记/费曼/打卡）
  const progressItems = useLearningProgress();
  const ghostTasks = useMemo<string[]>(() => pickRandom(ghostTaskPool, 2), []);

  // 设置页 chunk 预加载：hover/focus 时提前下载，导航时瞬间渲染
  const settingsPrefetched = useRef(false);
  const prefetchSettings = useCallback(() => {
    if (!settingsPrefetched.current) {
      settingsPrefetched.current = true;
      import('@/pages/SettingsPage');
    }
  }, []);

  const isOnNotes = location.pathname.startsWith('/notes');

  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const displayName = (meta?.['display_name'] as string) || (meta?.['full_name'] as string) || user?.email?.split('@')[0] || '未登录';
  const avatarUrl = meta?.['avatar_url'] as string | undefined;
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <>
      <aside
        className={cn(
          'hidden md:flex flex-col flex-shrink-0 relative',
          'h-full sticky top-0 z-50',
          'transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]',
          collapsed ? 'w-14' : 'w-[240px]',
        )}
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(90deg, var(--kb-bg-primary) 0%, color-mix(in srgb, var(--kb-bg-primary) 97%, white) 100%)'
            : 'linear-gradient(90deg, #ffffff 0%, #fffcf9 100%)',
        }}
      >
        {/* 侧边栏与主内容之间的渐变过渡带 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[4px] pointer-events-none z-10"
          style={{
            background: theme === 'dark'
              ? 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, transparent 100%)'
              : 'linear-gradient(90deg, rgba(0,0,0,0.03) 0%, transparent 100%)',
          }}
        />

        {/* ── 用户信息 ── */}
        <div className={cn(
          'flex items-center gap-2.5 px-4 h-12 flex-shrink-0',
          collapsed && 'justify-center px-0',
        )}>
          {isAuthenticated && user ? (
            <>
              {avatarUrl ? (
                <motion.img
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  src={avatarUrl} alt={displayName}
                  className="w-7 h-7 rounded-full flex-shrink-0 object-cover border-2 border-brand-200/50 shadow-sm"
                />
              ) : (
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-200/50 text-brand-600 text-[11px] font-semibold shadow-sm"
                >
                  {avatarLetter}
                </motion.div>
              )}
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn('text-[13px] font-medium text-text-primary truncate', collapsed && 'hidden')}
              >
                {displayName}
              </motion.span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-bg-secondary text-text-tertiary">
                <UserIcon className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <span className={cn('text-[13px] font-medium text-text-tertiary', collapsed && 'hidden')}>
                未登录
              </span>
            </>
          )}
        </div>

        {/* ── 导航区 ── */}
        <nav className="flex-1 px-2 overflow-y-auto overflow-x-hidden">
          {/* Section: 导航 */}
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.1 }}
              className="text-[10px] text-text-tertiary font-medium tracking-[0.08em] uppercase px-2.5 pt-3 pb-1"
            >
              导航
            </motion.div>
          )}
          {navSection1.map(({ to, label, icon: Icon, shortcut, exact }, i) => (
            <SidebarItem
              key={to} to={to} label={label} icon={Icon}
              shortcut={collapsed ? undefined : shortcut}
              collapsed={collapsed} end={exact} index={i}
            />
          ))}

          {/* Section: 学习 */}
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.15 }}
              className="text-[10px] text-text-tertiary font-medium tracking-[0.08em] uppercase px-2.5 pt-4 pb-1"
            >
              学习
            </motion.div>
          )}
          {collapsed && <div className="my-1 mx-1.5 border-t border-border/20" />}
          {navSection2.map(({ to, label, subtitle, icon: Icon, shortcut, dotColor }, i) => (
            <SidebarItem
              key={to} to={to} label={label} icon={Icon}
              subtitle={isNewbie ? subtitle : undefined}
              shortcut={collapsed ? undefined : shortcut}
              dotColor={dotColor} collapsed={collapsed} index={i + 1}
            />
          ))}

          {/* Section: 更多 */}
          {!collapsed && (
            <div className="text-[10px] text-text-tertiary font-medium tracking-[0.08em] uppercase px-2.5 pt-4 pb-1 opacity-50">
              更多
            </div>
          )}
          {collapsed && <div className="my-1 mx-1.5 border-t border-border/20" />}
          {navSection3.map(({ to, label, subtitle, icon: Icon, shortcut, dotColor }, i) => (
            <SidebarItem
              key={to} to={to} label={label} icon={Icon}
              subtitle={isNewbie ? subtitle : undefined}
              shortcut={collapsed ? undefined : shortcut}
              dotColor={dotColor} collapsed={collapsed} index={i + 6}
            />
          ))}

          {/* 学习进度 — 从真实数据源聚合各模块完成百分比 */}
          {!collapsed && progressItems.length > 0 && (
            <>
              <div className="text-[10px] text-text-tertiary font-medium tracking-[0.08em] uppercase px-2.5 pt-4 pb-1 opacity-50">
                进度
              </div>
              <div className="px-2.5 flex flex-col gap-1.5">
                {progressItems.map((item, i) => (
                  <motion.div
                    key={item.subject}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.04 }}
                    className="flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary/70">{item.subject}</span>
                      <span className="text-[10px] text-text-tertiary/60 tabular-nums">{item.progress}%</span>
                    </div>
                    <div className="h-[3px] rounded-full bg-bg-tertiary/40 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-brand-500/60"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 + i * 0.04 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {/* Ghost Tasks — Zeigarnik Effect */}
          {!collapsed && (
            <>
              <div className="text-[10px] text-text-tertiary font-medium tracking-[0.08em] uppercase px-2.5 pt-5 pb-1 opacity-50">
                待继续
              </div>
              {ghostTasks.map((task, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center gap-2 px-3 py-[5px] cursor-default group/ghost"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-400/40 flex-shrink-0 animate-pulse" />
                  <span className="text-[11px] text-text-tertiary/50 truncate group-hover/ghost:text-text-secondary transition-colors duration-200 italic">
                    {task}
                  </span>
                </motion.div>
              ))}
            </>
          )}
        </nav>

        {/* ── 底部区域 ── */}
        <div className={cn(
          'border-t border-border/20 flex-shrink-0',
          collapsed ? 'px-1 py-2' : 'px-3 py-2.5',
        )}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              {/* 折叠态：主题切换按钮，带 tooltip 提示 */}
              <Tip text={theme === 'light' ? '切换至深色模式' : '切换至浅色模式'} side="right">
                <button
                  onClick={toggleTheme}
                  className="w-7 h-7 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-brand-500/5 transition-colors duration-200 active:scale-90"
                >
                  {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </Tip>
              {/* 折叠态：展开侧边栏按钮，带 tooltip 提示 */}
              <Tip text="展开侧边栏" side="right">
                <button
                  onClick={toggle}
                  className="w-7 h-7 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-brand-500/5 transition-colors duration-200 active:scale-90"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Tip>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-1.5 text-[11px] text-text-tertiary px-2 py-1 rounded-[4px] hover:text-text-secondary hover:bg-brand-500/5 transition-all duration-200 active:scale-95 whitespace-nowrap"
              >
                {theme === 'light' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                主题
              </button>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="flex items-center gap-1.5 text-[11px] text-text-tertiary px-2 py-1 rounded-[4px] hover:text-text-secondary hover:bg-brand-500/5 transition-all duration-200 active:scale-95 whitespace-nowrap"
              >
                <MessageSquare className="w-3 h-3" />
                反馈
              </button>
              <NavLink
                to="/settings"
                end
                onMouseEnter={prefetchSettings}
                onFocus={prefetchSettings}
                onClick={() => { if (!location.pathname.startsWith('/settings')) soundPlayer.play('ui_nav_switch'); }}
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-[4px] transition-all duration-200 ml-auto active:scale-95 whitespace-nowrap',
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-brand-500/5',
                )}
              >
                <Settings className="w-3 h-3" />
                设置
              </NavLink>
              {/* 收起侧边栏按钮，带 tooltip 提示 */}
              <Tip text="收起侧边栏" side="right">
                <button
                  onClick={toggle}
                  className="w-6 h-6 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-brand-500/5 transition-colors duration-200 active:scale-90"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
              </Tip>
            </div>
          )}
        </div>
      </aside>

      <FeedbackPanel isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}

/* ── SidebarItem 子组件 ── */
interface SidebarItemProps {
  to: string;
  label: string;
  /** 新手期双标签副标题（如"专注番茄钟"），传入即显示 */
  subtitle?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  shortcut?: string;
  dotColor?: string;
  collapsed: boolean;
  end?: boolean;
  index?: number;
}

function SidebarItem({ to, label, subtitle, icon: Icon, shortcut, dotColor, collapsed, end, index = 0 }: SidebarItemProps) {
  const location = useLocation();
  // 切换到不同模块时播放导航音效（点击当前已激活项不响）
  const isCurrentActive = end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + '/');
  return (
    <motion.div
      custom={index}
      variants={sidebarItemVariants}
      initial="hidden"
      animate="visible"
    >
        {/* 折叠态使用 Tip 组件显示模块名，展开态由文字标签自解释 */}
        <Tip text={collapsed ? label : undefined} side="right">
          <NavLink
            to={to}
            end={end}
            onClick={() => { if (!isCurrentActive) soundPlayer.play('ui_nav_switch'); }}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-[var(--kb-radius-sm)] relative group',
            collapsed ? 'justify-center px-0 py-1.5 mx-0' : 'px-2.5 py-[7px]',
            isActive
              ? 'text-text-primary font-medium'
              : 'text-text-secondary/60 hover:text-text-primary hover:bg-brand-500/5 hover:scale-[1.02]',
            'transition-all duration-200',
          )
        }
        style={{ transition: `all ${BEAT.xs}ms ease` }}
      >
        {({ isActive }) => (
          <>
            {/* Active 指示器 — 3px 品牌色竖线 + 圆角 + layoutId 平滑跟随 */}
            {isActive && (
              <motion.span
                layoutId="sidebar-active-indicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-full"
                style={{ boxShadow: '0 0 8px color-mix(in srgb, var(--kb-brand-500) 50%, transparent)' }}
                transition={SPRING.default}
              />
            )}
            <span className={cn(
              'w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 transition-opacity duration-200',
              isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
            )}>
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </span>
            {/* 模块色点 */}
            {dotColor && !collapsed && (
              <span className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity duration-200',
                isActive ? 'opacity-80' : 'opacity-40 group-hover:opacity-80',
                dotColor,
              )} />
            )}
            {!collapsed && (
              <span className={cn(
                'text-[13px] flex-1 truncate transition-opacity duration-200',
                isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
              )}>
                {label}
                {subtitle && (
                  <span className="ml-1.5 text-[11px] text-text-tertiary/70">· {subtitle}</span>
                )}
              </span>
            )}
            {/* 快捷键提示 — hover 显示 */}
            {shortcut && !collapsed && (
              <kbd className="text-[10px] text-text-tertiary/50 bg-bg-secondary/40 px-1.5 py-0.5 rounded-[3px] font-mono opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-0.5 group-hover:translate-y-0">
                {shortcut}
              </kbd>
            )}
          </>
        )}
          </NavLink>
        </Tip>
    </motion.div>
  );
}
