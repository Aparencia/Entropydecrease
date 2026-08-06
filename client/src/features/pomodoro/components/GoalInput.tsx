/**
 * @ai-context: 通用组件：GoalInput。
 * @ai-context: “跳过”与“取消”是两种意图：跳过 = 不设目标但开始计时
 * （onSubmit('')），取消 = 关闭弹窗不开始（onClose，仅 Modal 关闭按钮）。
 * 两者共用同一回调会使空目标番茄钟无法启动（内测反馈 bug）。
 * @ai-context: "Skip" and "cancel" are distinct intents: skip starts the timer
 * with an empty goal; cancel closes the dialog without starting.
 */
import { useState, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui';
import GoalMemory from './GoalMemory';

interface GoalInputProps {
  open: boolean;
  /** 取消：关闭弹窗且不开始计时 */
  onClose: () => void;
  /** 提交并开始计时；空字符串表示本次番茄不设目标 */
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

  /** 提交目标并开始；输入为空时等同于“跳过”（无目标但仍然开始计时） */
  const handleSubmit = () => {
    onSubmit(text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 中文输入法选词时的回车（composition）不应提交表单，否则选词会误开始番茄
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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
          {/* 取消：关闭弹窗，不开始番茄 */}
          <Button variant="ghost" size="md" onClick={onClose}>
            取消
          </Button>
          {/* 跳过：不设目标，但仍然开始计时（用 secondary 与“取消”在视觉上拉开差异） */}
          <Button variant="secondary" size="md" onClick={() => onSubmit('')}>
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
