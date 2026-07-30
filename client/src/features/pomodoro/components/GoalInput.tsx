/**
 * @ai-context: 通用组件：GoalInput。
 */
import { useState, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui';
import GoalMemory from './GoalMemory';

interface GoalInputProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (goal: string) => void;
  rememberGoal: boolean;
  onRememberChange: (v: boolean) => void;
}

export default function GoalInput({
  open,
  onClose,
  onSubmit,
  rememberGoal,
  onRememberChange,
}: GoalInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      // 等动画结束后聚焦
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      // 空内容时等同于跳过
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSelectMemory = (goalText: string) => {
    setText(goalText);
    inputRef.current?.focus();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="设定番茄目标"
      description="这个番茄要做什么？"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            跳过
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit}>
            开始
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="这个番茄要做什么？"
        className="w-full px-3 py-2.5 rounded-kb-lg bg-bg-tertiary border border-border/40 text-b1 text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all"
      />

      <label className="flex items-center gap-2 mt-kb-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={rememberGoal}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="w-4 h-4 rounded border-border/60 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-b2 text-text-secondary">记住此目标</span>
      </label>

      <GoalMemory onSelect={handleSelectMemory} />
    </Modal>
  );
}
