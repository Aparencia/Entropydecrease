/**
 * useSettleConcepts 单元测试 / Unit tests for the settling hook
 *
 * @ai-context: 覆盖阶段 A 验收——批量建笔记+概念卡（sourceRef 溯源）、
 * imports 记录、settling 签名时刻、空列表/失败兜底、牌组复用。
 * @ai-context: Covers batch settle, trace record, settling signature moment,
 * empty/failure fallbacks, and deck reuse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettleConcepts, summaryToNoteContent, SETTLING_DECK_NAME, SETTLING_TAG } from './useSettleConcepts';

// 集中 mock 句柄（vi.mock 提升先行，需 vi.hoisted）
/** 牌组 mock 行 / Deck row shape */
interface MockDeck { id: string; name: string }

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  createCard: vi.fn(),
  createDeck: vi.fn(),
  loadDecks: vi.fn(),
  emitSignatureMoment: vi.fn(),
  invoke: vi.fn(),
  decks: [] as MockDeck[],
}));

vi.mock('@/features/notes/store/useNoteStore', () => ({
  useNoteStore: { getState: () => ({ createNote: mocks.createNote }) },
}));

vi.mock('@/features/flashcards/store/useFlashcardStore', () => ({
  useFlashcardStore: {
    getState: () => ({
      decks: mocks.decks,
      loadDecks: mocks.loadDecks,
      createDeck: mocks.createDeck,
      createCard: mocks.createCard,
    }),
  },
}));

vi.mock('@/features/retention/store/useWorldEvents', () => ({
  useWorldEvents: { getState: () => ({ emitSignatureMoment: mocks.emitSignatureMoment }) },
}));

const input = {
  title: '熵减学习法',
  source: 'pdf' as const,
  rawName: 'entropy.pdf',
  concepts: [
    { name: '费曼技巧', summary: '用自己的话讲清楚', cardFront: '费曼技巧的四个步骤？', cardBack: '选择概念→讲解→发现缺口→重讲' },
    { name: '间隔重复', summary: '按遗忘曲线安排复习', cardFront: '', cardBack: '' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decks = [];
  let noteSeq = 0;
  let cardSeq = 0;
  mocks.createNote.mockImplementation(async () => `note-${++noteSeq}`);
  mocks.createCard.mockImplementation(async () => `card-${++cardSeq}`);
  mocks.createDeck.mockResolvedValue('deck-1');
  mocks.invoke.mockResolvedValue({ success: true, record: { id: 'rec-1' } });
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { invoke: mocks.invoke },
  });
});

describe('summaryToNoteContent（纯函数）', () => {
  it('应将摘要序列化为合法 TipTap doc JSON', () => {
    // Arrange
    const summary = '用自己的话讲清楚';

    // Act
    const doc = JSON.parse(summaryToNoteContent(summary));

    // Assert
    expect(doc.type).toBe('doc');
    expect(doc.content[0].type).toBe('paragraph');
    expect(doc.content[0].content[0].text).toBe(summary);
  });
});

describe('useSettleConcepts', () => {
  it('空概念列表应返回 ok:false 且不触发任何写入', async () => {
    // Arrange
    const { result } = renderHook(() => useSettleConcepts());

    // Act
    const res = await act(async () => result.current.settleConcepts({ ...input, concepts: [] }));

    // Assert
    expect(res.ok).toBe(false);
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(result.current.isSettling).toBe(false);
  });

  it('首次安放应创建牌组、逐概念建笔记+卡片并写溯源记录', async () => {
    // Arrange
    const { result } = renderHook(() => useSettleConcepts());

    // Act
    const res = await act(async () => result.current.settleConcepts(input));

    // Assert — 牌组：不存在 → 创建一次
    expect(mocks.createDeck).toHaveBeenCalledWith(SETTLING_DECK_NAME);
    // 每概念 = 1 笔记 + 1 卡片，sourceRef 溯源透传
    expect(mocks.createNote).toHaveBeenCalledTimes(2);
    expect(mocks.createNote).toHaveBeenCalledWith(expect.objectContaining({
      title: '费曼技巧', sourceRef: 'entropy.pdf', tags: [SETTLING_TAG],
    }));
    expect(mocks.createCard).toHaveBeenCalledTimes(2);
    expect(mocks.createCard).toHaveBeenCalledWith(expect.objectContaining({
      deckId: 'deck-1', front: '费曼技巧的四个步骤？', sourceNoteId: 'note-1', sourceRef: 'entropy.pdf',
    }));
    // 空 cardFront 由概念名派生
    expect(mocks.createCard).toHaveBeenCalledWith(expect.objectContaining({ front: '间隔重复' }));
    // 溯源记录
    expect(mocks.invoke).toHaveBeenCalledWith('import:add-settling-record', {
      source: 'pdf', rawName: 'entropy.pdf', conceptCount: 2,
    });
    // 签名时刻：settling 变体，取最后一个概念名
    expect(mocks.emitSignatureMoment).toHaveBeenCalledWith('间隔重复', 'settling');
    expect(res).toMatchObject({ ok: true, noteIds: ['note-1', 'note-2'], cardIds: ['card-1', 'card-2'], recordId: 'rec-1' });
  });

  it('牌组已存在时应复用且不重复创建', async () => {
    // Arrange
    mocks.decks = [{ id: 'deck-x', name: SETTLING_DECK_NAME }];
    const { result } = renderHook(() => useSettleConcepts());

    // Act
    await act(async () => result.current.settleConcepts(input));

    // Assert
    expect(mocks.createDeck).not.toHaveBeenCalled();
    expect(mocks.loadDecks).not.toHaveBeenCalled();
    expect(mocks.createCard).toHaveBeenCalledWith(expect.objectContaining({ deckId: 'deck-x' }));
  });

  it('卡片创建失败应返回 ok:false 并保留已建笔记 ID', async () => {
    // Arrange
    mocks.createCard.mockRejectedValueOnce(new Error('写入失败'));
    const { result } = renderHook(() => useSettleConcepts());

    // Act
    const res = await act(async () => result.current.settleConcepts(input));

    // Assert
    expect(res.ok).toBe(false);
    expect(res.error).toBe('写入失败（已安放 1 个概念，重试会从剩余概念继续）');
    expect(res.noteIds).toEqual(['note-1']);
    expect(mocks.emitSignatureMoment).not.toHaveBeenCalled();
    expect(result.current.isSettling).toBe(false);
  });

  it('溯源记录失败不应阻塞安放与签名时刻', async () => {
    // Arrange
    mocks.invoke.mockRejectedValueOnce(new Error('sqlite busy'));
    const { result } = renderHook(() => useSettleConcepts());

    // Act
    const res = await act(async () => result.current.settleConcepts(input));

    // Assert
    expect(res.ok).toBe(true);
    expect(res.recordId).toBeUndefined();
    expect(mocks.emitSignatureMoment).toHaveBeenCalledWith('间隔重复', 'settling');
  });
});
