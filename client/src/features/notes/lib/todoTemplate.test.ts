/**
 * Todo Template Unit Tests
 * Tests for createTodoTemplateContent() and createEmptyTodoTemplate()
 */

import { describe, it, expect } from 'vitest';
import { createTodoTemplateContent, createEmptyTodoTemplate } from './todoTemplate';

describe('createTodoTemplateContent', () => {
  it('should generate valid TipTap JSON with taskItem', () => {
    // Arrange
    const todo = {
      text: 'Buy groceries',
      checked: false,
      priority: 'high' as const,
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));

    // Assert
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('heading');
    expect(result.content[1].type).toBe('taskList');
  });

  it('should include priority label in task item text', () => {
    // Arrange
    const todo = {
      text: 'Review notes',
      checked: false,
      priority: 'medium' as const,
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));
    const taskItemText = result.content[1].content[0].content[0].content[0].text;

    // Assert
    expect(taskItemText).toContain('中优先');
    expect(taskItemText).toContain('Review notes');
  });

  it('should include due date when provided', () => {
    // Arrange
    const todo = {
      text: 'Submit assignment',
      checked: false,
      priority: 'high' as const,
      dueDate: '2026-07-20',
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));
    const taskItemText = result.content[1].content[0].content[0].content[0].text;

    // Assert
    expect(taskItemText).toContain('📅');
    expect(taskItemText).toContain('2026-07-20');
  });

  it('should not include due date when not provided', () => {
    // Arrange
    const todo = {
      text: 'Clean desk',
      checked: false,
      priority: 'low' as const,
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));
    const taskItemText = result.content[1].content[0].content[0].content[0].text;

    // Assert
    expect(taskItemText).not.toContain('📅');
  });

  it('should set checked state correctly', () => {
    // Arrange
    const checkedTodo = {
      text: 'Done task',
      checked: true,
      priority: 'low' as const,
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(checkedTodo));
    const isChecked = result.content[1].content[0].attrs.checked;

    // Assert
    expect(isChecked).toBe(true);
  });

  it('should handle empty text gracefully', () => {
    // Arrange
    const todo = {
      text: '',
      checked: false,
      priority: 'low' as const,
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));

    // Assert - still produces valid structure
    expect(result.type).toBe('doc');
    expect(result.content[1].content[0].type).toBe('taskItem');
  });

  it('should map all priority levels correctly', () => {
    // Arrange
    const priorities = [
      { priority: 'high' as const, expected: '高优先' },
      { priority: 'medium' as const, expected: '中优先' },
      { priority: 'low' as const, expected: '低优先' },
    ];

    // Act & Assert
    for (const { priority, expected } of priorities) {
      const result = JSON.parse(createTodoTemplateContent({ text: 'Test', checked: false, priority }));
      const text = result.content[1].content[0].content[0].content[0].text;
      expect(text).toContain(expected);
    }
  });

  it('should include sourceInspirationId without affecting output text', () => {
    // Arrange
    const todo = {
      text: 'Follow up',
      checked: false,
      priority: 'medium' as const,
      sourceInspirationId: 'insp-123',
    };

    // Act
    const result = JSON.parse(createTodoTemplateContent(todo));
    const text = result.content[1].content[0].content[0].content[0].text;

    // Assert - sourceInspirationId is metadata, not rendered in text
    expect(text).not.toContain('insp-123');
    expect(text).toContain('Follow up');
  });
});

describe('createEmptyTodoTemplate', () => {
  it('should generate valid TipTap JSON', () => {
    // Act
    const result = JSON.parse(createEmptyTodoTemplate());

    // Assert
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(2);
  });

  it('should contain heading with title "待办清单"', () => {
    // Act
    const result = JSON.parse(createEmptyTodoTemplate());

    // Assert
    const heading = result.content[0];
    expect(heading.type).toBe('heading');
    expect(heading.content[0].text).toBe('待办清单');
  });

  it('should contain placeholder task item', () => {
    // Act
    const result = JSON.parse(createEmptyTodoTemplate());

    // Assert
    const taskList = result.content[1];
    expect(taskList.type).toBe('taskList');
    expect(taskList.content[0].attrs.checked).toBe(false);
    expect(taskList.content[0].content[0].content[0].text).toContain('添加新的待办事项');
  });

  it('should return a string (serialized JSON)', () => {
    // Act
    const result = createEmptyTodoTemplate();

    // Assert
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
