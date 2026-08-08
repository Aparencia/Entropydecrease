/**
 * 笔记成就系统存储
 * Note achievement system store
 *
 * @ai-context: 监听笔记行为事件（创建/链接/复习/费曼），触发成就检测。
 * 成就徽章以深海生物为主题，解锁后永久记录。数据持久化到 localStorage。
 * @ai-context: Listens to note behavior events (create/link/review/feynman),
 * triggers achievement detection. Deep-sea themed badges, permanently
 * recorded. Persisted to localStorage.
 */
import { create } from 'zustand';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
  progress: number;
  maxProgress: number;
  category: 'explorer' | 'connector' | 'thinker' | 'mentor';
}

interface AchievementState {
  achievements: Achievement[];
  unlocked: string[];
  stats: {
    notesCreated: number;
    linksCreated: number;
    closedBookTests: number;
    feynmanSessions: number;
    totalWords: number;
  };
  /** 记录笔记创建 */
  recordNoteCreated: () => void;
  /** 记录链接创建 */
  recordLinkCreated: () => void;
  /** 记录合书测试 */
  recordClosedBookTest: () => void;
  /** 记录费曼会话 */
  recordFeynmanSession: () => void;
  /** 记录字数 */
  recordWords: (count: number) => void;
  /** 检查并解锁成就 */
  checkAchievements: () => void;
  /** 重置所有数据 */
  reset: () => void;
}

const STORAGE_KEY = 'keban-note-achievements';

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_note',
    title: '初入深海',
    description: '创建第一篇笔记',
    icon: '🌊',
    unlockedAt: null,
    progress: 0,
    maxProgress: 1,
    category: 'explorer',
  },
  {
    id: 'notes_7_days',
    title: '恒光水母',
    description: '连续 7 天记笔记',
    icon: '🪼',
    unlockedAt: null,
    progress: 0,
    maxProgress: 7,
    category: 'explorer',
  },
  {
    id: 'notes_50',
    title: '珊瑚群落',
    description: '创建 50 篇笔记',
    icon: '🪸',
    unlockedAt: null,
    progress: 0,
    maxProgress: 50,
    category: 'explorer',
  },
  {
    id: 'links_10',
    title: '知识网络',
    description: '建立 10 个维基链接',
    icon: '🕸️',
    unlockedAt: null,
    progress: 0,
    maxProgress: 10,
    category: 'connector',
  },
  {
    id: 'links_50',
    title: '珊瑚网络',
    description: '建立 50 个维基链接',
    icon: '🪸',
    unlockedAt: null,
    progress: 0,
    maxProgress: 50,
    category: 'connector',
  },
  {
    id: 'closed_book_5',
    title: '深潜初探',
    description: '完成 5 次合书测试',
    icon: '🤿',
    unlockedAt: null,
    progress: 0,
    maxProgress: 5,
    category: 'thinker',
  },
  {
    id: 'closed_book_20',
    title: '深海潜航',
    description: '完成 20 次合书测试',
    icon: '🐋',
    unlockedAt: null,
    progress: 0,
    maxProgress: 20,
    category: 'thinker',
  },
  {
    id: 'feynman_5',
    title: '发光浮游',
    description: '完成 5 次费曼讲解',
    icon: '✨',
    unlockedAt: null,
    progress: 0,
    maxProgress: 5,
    category: 'mentor',
  },
  {
    id: 'feynman_20',
    title: '发光乌贼',
    description: '完成 20 次费曼讲解',
    icon: '🦑',
    unlockedAt: null,
    progress: 0,
    maxProgress: 20,
    category: 'mentor',
  },
  {
    id: 'words_10000',
    title: '深海笔记',
    description: '累计写作 10000 字',
    icon: '📜',
    unlockedAt: null,
    progress: 0,
    maxProgress: 10000,
    category: 'explorer',
  },
];

function loadFromStorage(): { stats: AchievementState['stats']; achievements: Achievement[]; unlocked: string[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    stats: { notesCreated: 0, linksCreated: 0, closedBookTests: 0, feynmanSessions: 0, totalWords: 0 },
    achievements: INITIAL_ACHIEVEMENTS,
    unlocked: [],
  };
}

function saveToStorage(state: { stats: AchievementState['stats']; achievements: Achievement[]; unlocked: string[] }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export const useAchievementStore = create<AchievementState>((set, _get) => {
  const saved = loadFromStorage();

  return {
    achievements: saved.achievements,
    unlocked: saved.unlocked,
    stats: saved.stats,

    recordNoteCreated: () => set((state) => {
      const newStats = { ...state.stats, notesCreated: state.stats.notesCreated + 1 };
      const newState = { ...state, stats: newStats };
      saveToStorage(newState);
      return newState;
    }),

    recordLinkCreated: () => set((state) => {
      const newStats = { ...state.stats, linksCreated: state.stats.linksCreated + 1 };
      const newState = { ...state, stats: newStats };
      saveToStorage(newState);
      return newState;
    }),

    recordClosedBookTest: () => set((state) => {
      const newStats = { ...state.stats, closedBookTests: state.stats.closedBookTests + 1 };
      const newState = { ...state, stats: newStats };
      saveToStorage(newState);
      return newState;
    }),

    recordFeynmanSession: () => set((state) => {
      const newStats = { ...state.stats, feynmanSessions: state.stats.feynmanSessions + 1 };
      const newState = { ...state, stats: newStats };
      saveToStorage(newState);
      return newState;
    }),

    recordWords: (count) => set((state) => {
      const newStats = { ...state.stats, totalWords: state.stats.totalWords + count };
      const newState = { ...state, stats: newStats };
      saveToStorage(newState);
      return newState;
    }),

    checkAchievements: () => set((state) => {
      const { stats, achievements, unlocked } = state;
      const newUnlocked = [...unlocked];
      const newAchievements = achievements.map((ach) => {
        let progress = ach.progress;

        switch (ach.id) {
          case 'first_note':
            progress = Math.min(stats.notesCreated, 1);
            break;
          case 'notes_7_days':
            progress = Math.min(stats.notesCreated, 7);
            break;
          case 'notes_50':
            progress = Math.min(stats.notesCreated, 50);
            break;
          case 'links_10':
            progress = Math.min(stats.linksCreated, 10);
            break;
          case 'links_50':
            progress = Math.min(stats.linksCreated, 50);
            break;
          case 'closed_book_5':
            progress = Math.min(stats.closedBookTests, 5);
            break;
          case 'closed_book_20':
            progress = Math.min(stats.closedBookTests, 20);
            break;
          case 'feynman_5':
            progress = Math.min(stats.feynmanSessions, 5);
            break;
          case 'feynman_20':
            progress = Math.min(stats.feynmanSessions, 20);
            break;
          case 'words_10000':
            progress = Math.min(stats.totalWords, 10000);
            break;
        }

        if (progress >= ach.maxProgress && !newUnlocked.includes(ach.id)) {
          newUnlocked.push(ach.id);
        }

        return { ...ach, progress, unlockedAt: progress >= ach.maxProgress ? (ach.unlockedAt || new Date().toISOString()) : null };
      });

      const newState = { ...state, achievements: newAchievements, unlocked: newUnlocked };
      saveToStorage(newState);
      return newState;
    }),

    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({
        achievements: INITIAL_ACHIEVEMENTS,
        unlocked: [],
        stats: { notesCreated: 0, linksCreated: 0, closedBookTests: 0, feynmanSessions: 0, totalWords: 0 },
      });
    },
  };
});