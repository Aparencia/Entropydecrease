/**
 * NoteInsertDialog 版本切换测试（P0 批量插入方案 B）
 *
 * @ai-context: 验证"AI 整理版 / 原始转写版"切换开关的显隐与内容生效：
 * rawContent 未提供时不显示开关；提供时默认 AI 版、可切原文版，
 * 复制/追加/创建均使用当前生效版本。
 * English: version toggle (AI-processed vs raw transcript) inside the
 * note insert dialog — hidden without rawContent; active content follows
 * the selected tab for copy/append/create actions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoteInsertDialog } from './NoteInsertDialog';

const baseProps = {
  content: 'AI 整理版内容',
  courseName: '高等数学',
  sessionSeq: 1,
  fetchCourseNotes: vi.fn().mockResolvedValue([]),
  appendToNote: vi.fn().mockResolvedValue(undefined),
  createCourseNote: vi.fn().mockResolvedValue(undefined),
  onDone: vi.fn(),
  onClose: vi.fn(),
};

describe('NoteInsertDialog 版本切换', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('未提供 rawContent 时不显示切换开关', () => {
    render(<NoteInsertDialog {...baseProps} />);
    expect(screen.queryByText('AI 整理版')).toBeNull();
    expect(screen.queryByText('原始转写')).toBeNull();
  });

  it('提供 rawContent 时显示切换开关，默认 AI 整理版', () => {
    render(<NoteInsertDialog {...baseProps} rawContent="原始转写内容" />);
    expect(screen.getByText('AI 整理版')).toBeTruthy();
    expect(screen.getByText('原始转写')).toBeTruthy();
    // 默认复制 AI 版
    fireEvent.click(screen.getByText('仅复制到剪贴板'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AI 整理版内容');
  });

  it('切换到原始转写后复制使用原文内容', async () => {
    render(<NoteInsertDialog {...baseProps} rawContent="原始转写内容" />);
    fireEvent.click(screen.getByText('原始转写'));
    // 预览切换生效（内容预览显示原文）
    await waitFor(() => {
      expect(screen.getByText(/原始转写内容/)).toBeTruthy();
    });
    fireEvent.click(screen.getByText('仅复制到剪贴板'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('原始转写内容');
  });

  it('创建新笔记使用当前生效版本（原文版）', async () => {
    render(<NoteInsertDialog {...baseProps} rawContent="原始转写内容" />);
    fireEvent.click(screen.getByText('原始转写'));
    // 按钮与选项标题同文案，用 role 精确匹配按钮
    fireEvent.click(screen.getByRole('button', { name: /创建新笔记/ }));
    await waitFor(() => {
      expect(baseProps.createCourseNote).toHaveBeenCalledWith(
        expect.stringContaining('高等数学'),
        expect.stringContaining('原始转写内容'),
      );
    });
  });
});
