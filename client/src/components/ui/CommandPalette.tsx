/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：CommandPalette。
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, X, ArrowRight,
  LayoutDashboard, Timer, FileText, Layers, Lightbulb, BarChart3, Settings,
  FilePlus, FolderPlus, Import, Download, Moon, CheckCircle,
  Palette, Brain, Database, Info,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { commandRegistry } from '@/lib/commandPalette/registry';
import { registerDefaultCommands } from '@/lib/commandPalette/defaultCommands';
import type { Command } from '@/lib/commandPalette/registry';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Timer, FileText, Layers, Lightbulb, BarChart3, Settings,
  FilePlus, FolderPlus, Import, Download, Moon, CheckCircle,
  Palette, Brain, Database, Info,
};

function CommandIcon({ name, className }: { name?: string; className?: string }) {
  if (!name || !iconMap[name]) return null;
  const Icon = iconMap[name];
  return <Icon className={className} />;
}

const categoryLabels: Record<Command['category'], string> = {
  navigation: '导航', action: '操作', settings: '设置',
};

/** 导航命令 ID → 目标路由（用于判断目标≠当前时播放切换音效） */
const NAV_COMMAND_ROUTES: Record<string, string> = {
  'nav-dashboard': '/', 'nav-pomodoro': '/pomodoro', 'nav-notes': '/notes',
  'nav-flashcards': '/flashcards', 'nav-feynman': '/feynman', 'nav-analytics': '/analytics',
  'nav-classroom': '/classroom', 'nav-settings': '/settings',
};
const categoryColors: Record<Command['category'], string> = {
  navigation: 'bg-accent-500/15 text-accent-500',
  action: 'bg-semantic-success/15 text-semantic-success',
  settings: 'bg-accent/15 text-accent-500',
};

function groupByCategory(commands: Command[]): Array<{ category: Command['category']; items: Command[] }> {
  const order: Command['category'][] = ['navigation', 'action', 'settings'];
  const groups = new Map<Command['category'], Command[]>();
  for (const cmd of commands) {
    const list = groups.get(cmd.category) ?? [];
    list.push(cmd);
    groups.set(cmd.category, list);
  }
  return order.filter((c) => groups.has(c)).map((category) => ({ category, items: groups.get(category)! }));
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const registeredRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!registeredRef.current) {
      registerDefaultCommands(navigate, toast);
      registeredRef.current = true;
    }
  }, []);

  const filtered = useMemo(() => commandRegistry.search(query), [query]);
  const groups = useMemo(() => (query ? null : groupByCategory(filtered)), [query, filtered]);
  const flatList = filtered;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);

        // BUG-007 fix: 首次触发全局快捷键时显示功能引导 Toast
        const GUIDE_KEY = 'kb_shortcut_guide_shown';
        if (!localStorage.getItem(GUIDE_KEY)) {
          localStorage.setItem(GUIDE_KEY, '1');
          toast({
            type: 'info',
            message: 'Ctrl+K 命令面板：快速导航、执行操作，输入关键词搜索功能',
            duration: 4000,
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toast]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const executeCommand = useCallback(async (cmd: Command) => {
    close();
    const targetRoute = NAV_COMMAND_ROUTES[cmd.id];
    if (targetRoute !== undefined && targetRoute !== pathname) soundPlayer.play('ui_nav_switch');
    try { await cmd.execute(); }
    catch (err) { toast({ type: 'error', message: `命令执行失败：${err instanceof Error ? err.message : '未知错误'}` }); }
  }, [close, toast, pathname]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => (flatList.length === 0 ? 0 : Math.min(i + 1, flatList.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flatList[selectedIndex]) executeCommand(flatList[selectedIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }, [flatList, selectedIndex, executeCommand, close]);

  const getFlatIndex = useCallback((cmd: Command) => flatList.findIndex((c) => c.id === cmd.id), [flatList]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
        >
          <motion.div
            className={cn(
              'bg-bg-elevated/90 backdrop-blur-2xl rounded-[var(--kb-radius-xl)] shadow-2xl',
              'w-[560px] max-h-[400px] flex flex-col',
              'border border-border/40',
            )}
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* ── 顶部渐变装饰线 ── */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />

            {/* ── 搜索输入框 ── */}
            <div className="px-kb-md pt-kb-md pb-kb-sm">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                placeholder="输入命令或搜索功能…"
                size="lg"
                prefix={<Search className="w-4 h-4" />}
                suffix={query ? (
                  <motion.button whileTap={{ scale: 0.85 }}
                    onClick={() => { setQuery(''); setSelectedIndex(0); inputRef.current?.focus(); }}
                    className="text-text-tertiary hover:text-text-primary transition-colors">
                    <X className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <kbd className="text-c1 text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border/50">ESC</kbd>
                )}
                className="!bg-bg-secondary"
              />
            </div>

            {/* ── 命令列表 ── */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-kb-sm pb-kb-md">
              {flatList.length === 0 ? (
                <motion.div className="flex flex-col items-center justify-center py-8 gap-2"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Search className="w-8 h-8 text-text-tertiary" />
                  <p className="text-b2 text-text-tertiary">未找到匹配命令</p>
                </motion.div>
              ) : groups ? (
                groups.map((group) => (
                  <div key={group.category} className="mb-kb-sm">
                    <div className="px-kb-sm py-1">
                      <span className="text-c1 font-medium text-text-tertiary uppercase tracking-wider">
                        {categoryLabels[group.category]}
                      </span>
                    </div>
                    {group.items.map((cmd) => {
                      const flatIdx = getFlatIndex(cmd);
                      return (
                        <CommandItem key={cmd.id} cmd={cmd} index={flatIdx}
                          isSelected={flatIdx === selectedIndex}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(flatIdx)} />
                      );
                    })}
                  </div>
                ))
              ) : (
                flatList.map((cmd, idx) => (
                  <CommandItem key={cmd.id} cmd={cmd} index={idx}
                    isSelected={idx === selectedIndex}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)} />
                ))
              )}
            </div>

            {/* ── 底部快捷键 ── */}
            <div className="flex items-center gap-3 px-kb-md py-kb-xs border-t border-border/30">
              <FooterHint keys="↑↓" label="导航" />
              <FooterHint keys="↵" label="执行" />
              <FooterHint keys="esc" label="关闭" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CommandItem({ cmd, index, isSelected, onClick, onMouseEnter }: {
  cmd: Command; index: number; isSelected: boolean; onClick: () => void; onMouseEnter: () => void;
}) {
  return (
    <motion.button
      data-index={index}
      className={cn(
        'w-full flex items-center gap-kb-sm px-kb-sm py-2 rounded-kb-md transition-colors',
        isSelected ? 'bg-brand-500/10 text-text-primary' : 'text-text-secondary hover:bg-bg-secondary',
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      whileTap={{ scale: 0.98 }}
    >
      <div className={cn(
        'flex items-center justify-center w-8 h-8 rounded-kb-md flex-shrink-0',
        isSelected ? 'bg-brand-500/20 text-brand-500' : 'bg-bg-secondary text-text-tertiary',
      )}>
        <CommandIcon name={cmd.icon} className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-b2 font-medium truncate">{cmd.label}</p>
        {cmd.description && <p className="text-c1 text-text-tertiary truncate">{cmd.description}</p>}
      </div>
      <span className={cn('text-c2 px-1.5 py-0.5 rounded flex-shrink-0', categoryColors[cmd.category])}>
        {categoryLabels[cmd.category]}
      </span>
      {cmd.shortcut && (
        <kbd className="text-c2 text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border/50 flex-shrink-0">
          {cmd.shortcut}
        </kbd>
      )}
      <ArrowRight className={cn('w-4 h-4 flex-shrink-0 transition-opacity', isSelected ? 'opacity-100 text-brand-500' : 'opacity-0')} />
    </motion.button>
  );
}

function FooterHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <kbd className="text-c2 text-text-tertiary bg-bg-secondary px-1 py-0.5 rounded border border-border/50 min-w-[20px] text-center">{keys}</kbd>
      <span className="text-c2 text-text-tertiary">{label}</span>
    </div>
  );
}
