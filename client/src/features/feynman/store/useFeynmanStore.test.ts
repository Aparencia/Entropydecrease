import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeynmanNote, FeynmanSummary, FeynmanWeakPoint } from '@/types/models';

// Mock uuid to return predictable values
vi.mock('@/lib/utils/uuid', () => ({
  generateId: () => 'mock-uuid-1',
}));

// Mock operationLog to avoid IndexedDB dependency
vi.mock('@/lib/storage/operationLog', () => ({
  logOperation: vi.fn().mockResolvedValue(undefined),
}));

// Mock crypto to avoid encryption dependency
vi.mock('@/lib/crypto', () => ({
  cryptoManager: {
    isReady: () => false,
  },
}));

// Mock writeWithLog to avoid OfflineQueue → database import chain
vi.mock('@/lib/storage/writeWithLog', async () => {
  const { logOperation } = await import('@/lib/storage/operationLog') as any;
  const { generateId } = await import('@/lib/utils/uuid') as any;
  return {
    createWithLog: async (repo: any, _entityType: string, data: any) => {
      const id = generateId();
      const item = { ...data, id };
      await repo.create(item);
      await logOperation(_entityType, id, 'create', item);
      return id;
    },
    updateWithLog: async (repo: any, entityType: string, id: string, changes: any) => {
      await repo.update(id, changes);
      await logOperation(entityType, id, 'update', changes);
    },
    deleteWithLog: async (repo: any, entityType: string, id: string) => {
      const existing = await repo.getById(id);
      await repo.delete(id);
      await logOperation(entityType, id, 'delete', existing);
    },
  };
});

// Mock SoundPlayer to avoid AudioContext in jsdom
vi.mock('@/lib/audio/SoundPlayer', () => ({
  soundPlayer: {
    play: vi.fn(),
    preload: vi.fn(),
    preloadAll: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock storage to isolate pure business logic
vi.mock('@/lib/storage', () => ({
  feynmanNoteStore: {
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('mock-uuid-1'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  feynmanSummaryStore: {
    where: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('mock-summary-1'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  feynmanWeakPointStore: {
    getAll: vi.fn().mockResolvedValue([]),
    where: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue('mock-wp-1'),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useFeynmanStore } from './useFeynmanStore';

// Helper to create a FeynmanNote
function makeNote(overrides: Partial<FeynmanNote> = {}): FeynmanNote {
  return {
    id: 'n1',
    concept: 'Test Concept',
    explanation: '',
    status: 'not_started',
    currentStep: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

const SAMPLE_NOTES: FeynmanNote[] = [
  makeNote({ id: 'n1', status: 'completed', completedAt: new Date('2025-01-05') }),
  makeNote({ id: 'n2', status: 'in_progress', currentStep: 2 }),
  makeNote({ id: 'n3', status: 'not_started', currentStep: 1 }),
];

const SAMPLE_WEAK_POINTS: Record<string, FeynmanWeakPoint[]> = {
  n1: [
    { id: 'wp10', noteId: 'n1', text: 'wp1', position: { start: 0, end: 5 }, mastered: true, createdAt: new Date() },
    { id: 'wp11', noteId: 'n1', text: 'wp2', position: { start: 10, end: 15 }, mastered: false, createdAt: new Date() },
  ],
  n2: [
    { id: 'wp20', noteId: 'n2', text: 'wp3', position: { start: 0, end: 5 }, mastered: false, createdAt: new Date() },
  ],
};

beforeEach(() => {
  useFeynmanStore.setState({
    notes: SAMPLE_NOTES,
    summaries: {
      n1: { id: 's100', noteId: 'n1', summary: 'Summary for note 1', createdAt: new Date(), updatedAt: new Date() },
      n2: null,
    },
    weakPoints: SAMPLE_WEAK_POINTS,
    currentNoteId: null,
    isLoading: false,
  });
});

describe('Feynman Store - Pure Business Logic', () => {
  // ── getStats ──────────────────────────────────────────────

  describe('getStats', () => {
    it('should return correct total count', () => {
      const stats = useFeynmanStore.getState().getStats();
      expect(stats.total).toBe(3);
    });

    it('should return correct completed count', () => {
      const stats = useFeynmanStore.getState().getStats();
      expect(stats.completed).toBe(1); // only note id=1 is completed
    });

    it('should return correct unmastered weak points count', () => {
      const stats = useFeynmanStore.getState().getStats();
      // Note 1: wp2 not mastered; Note 2: wp3 not mastered → 2 unmastered
      expect(stats.weakPointsCount).toBe(2);
    });

    it('should handle empty notes', () => {
      useFeynmanStore.setState({ notes: [], weakPoints: {} });
      const stats = useFeynmanStore.getState().getStats();
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.weakPointsCount).toBe(0);
    });
  });

  // ── getCurrentView ────────────────────────────────────────

  describe('getCurrentView', () => {
    it('should return null when no currentNoteId', () => {
      const view = useFeynmanStore.getState().getCurrentView();
      expect(view).toBeNull();
    });

    it('should return null when currentNoteId does not exist in notes', () => {
      useFeynmanStore.setState({ currentNoteId: 'nonexistent' });
      const view = useFeynmanStore.getState().getCurrentView();
      expect(view).toBeNull();
    });

    it('should return note view with summary and weak points', () => {
      useFeynmanStore.setState({ currentNoteId: 'n1' });
      const view = useFeynmanStore.getState().getCurrentView();
      expect(view).not.toBeNull();
      expect(view!.note.id).toBe('n1');
      expect(view!.summary).not.toBeNull();
      expect(view!.summary!.summary).toBe('Summary for note 1');
      expect(view!.weakPoints).toHaveLength(2);
    });

    it('should return null summary for note without summary', () => {
      useFeynmanStore.setState({ currentNoteId: 'n2' });
      const view = useFeynmanStore.getState().getCurrentView();
      expect(view).not.toBeNull();
      expect(view!.summary).toBeNull();
    });

    it('should return empty weakPoints for note without weak points', () => {
      useFeynmanStore.setState({ currentNoteId: 'n3' });
      const view = useFeynmanStore.getState().getCurrentView();
      expect(view).not.toBeNull();
      expect(view!.weakPoints).toEqual([]);
    });
  });

  // ── createNote state transition ───────────────────────────

  describe('createNote', () => {
    it('should add note to store and set as current', async () => {
      await useFeynmanStore.getState().createNote('New Concept');
      const state = useFeynmanStore.getState();
      expect(state.notes).toHaveLength(4);
      expect(state.currentNoteId).toBe('mock-uuid-1'); // mock returns id='mock-uuid-1'
      expect(state.notes[0].concept).toBe('New Concept');
      expect(state.notes[0].status).toBe('not_started');
      expect(state.notes[0].currentStep).toBe(1);
    });
  });

  // ── setExplanation（FRONT2-M1: 不再自动推进，由 advanceStep 统一推进）──

  describe('setExplanation', () => {
    it('should save explanation without advancing step (advanceStep owns progression)', async () => {
      const note = makeNote({ id: 'n10', currentStep: 1, status: 'not_started' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().setExplanation('n10', 'My explanation');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(1); // 不再自动推进
      expect(updated!.status).toBe('not_started');
      expect(updated!.explanation).toBe('My explanation');
    });

    it('should NOT advance step if already past step 1', async () => {
      const note = makeNote({ id: 'n10', currentStep: 3, status: 'in_progress' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().setExplanation('n10', 'Updated explanation');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(3); // unchanged
    });
  });

  // ── advanceStep ───────────────────────────────────────────

  describe('advanceStep', () => {
    it('should advance step by 1', async () => {
      const note = makeNote({ id: 'n10', currentStep: 2, status: 'in_progress' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().advanceStep('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(3);
    });

    it('should not exceed step 4', async () => {
      const note = makeNote({ id: 'n10', currentStep: 4, status: 'in_progress' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().advanceStep('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(4);
    });

    it('should set status to in_progress when advancing from step 1 to 2', async () => {
      const note = makeNote({ id: 'n10', currentStep: 1, status: 'not_started' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().advanceStep('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(2);
      expect(updated!.status).toBe('in_progress');
    });

    it('should auto-complete when reaching step 4 with non-empty summary', async () => {
      const note = makeNote({ id: 'n10', currentStep: 3, status: 'in_progress' });
      const summary: FeynmanSummary = {
        id: 's100',
        noteId: 'n10',
        summary: 'A valid summary',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      useFeynmanStore.setState({
        notes: [note],
        summaries: { n10: summary },
      });

      await useFeynmanStore.getState().advanceStep('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(4);
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });

    it('should NOT auto-complete when reaching step 4 with empty summary', async () => {
      const note = makeNote({ id: 'n10', currentStep: 3, status: 'in_progress' });
      const summary: FeynmanSummary = {
        id: 's100',
        noteId: 'n10',
        summary: '   ',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      useFeynmanStore.setState({
        notes: [note],
        summaries: { n10: summary },
      });

      await useFeynmanStore.getState().advanceStep('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.currentStep).toBe(4);
      expect(updated!.status).toBe('in_progress'); // not completed
    });
  });

  // ── completeNote ──────────────────────────────────────────

  describe('completeNote', () => {
    it('should set status to completed and add completedAt', async () => {
      const note = makeNote({ id: 'n10', status: 'in_progress' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().completeNote('n10');
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });
  });

  // ── setSelfRating ─────────────────────────────────────────

  describe('setSelfRating', () => {
    it('should update selfRating on the note', async () => {
      const note = makeNote({ id: 'n10' });
      useFeynmanStore.setState({ notes: [note] });

      await useFeynmanStore.getState().setSelfRating('n10', 4);
      const updated = useFeynmanStore.getState().notes.find((n) => n.id === 'n10');
      expect(updated!.selfRating).toBe(4);
    });
  });
});
