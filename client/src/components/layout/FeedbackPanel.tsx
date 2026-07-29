/**
 * @ai-context: 布局组件：FeedbackPanel。
 */
import { useState, useCallback, useEffect } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { createPortal } from 'react-dom';
import { X, Bug, Lightbulb, Star, Send, CheckCircle, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUCCESS_TOAST_DURATION_MS = 4000;
const COPY_TOAST_DURATION_MS = 2000;

// ─── Types ──────────────────────────────────────────────────────

type FeedbackType = 'bug' | 'suggestion' | 'experience';
type FeedbackStatus = 'pending' | 'sent';

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  description: string;
  rating?: number;
  createdAt: string; // ISO string for JSON serialization
  status: FeedbackStatus;
}

interface FeedbackPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Constants ──────────────────────────────────────────────────

const STORAGE_KEY = 'ed_feedback';
const LEGACY_STORAGE_KEY = 'keban_feedback'; // 旧键，2027-01 前兼容
const MAX_LENGTH = 500;
const MAX_HISTORY = 20;

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug; emoji: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, emoji: '🐛' },
  { value: 'suggestion', label: '建议', icon: Lightbulb, emoji: '💡' },
  { value: 'experience', label: '体验', icon: Star, emoji: '⭐' },
];

const TYPE_ICON_MAP: Record<FeedbackType, string> = {
  bug: '🐛',
  suggestion: '💡',
  experience: '⭐',
};

const TYPE_LABEL_MAP: Record<FeedbackType, string> = {
  bug: 'Bug',
  suggestion: '建议',
  experience: '体验',
};

// ─── Helpers ────────────────────────────────────────────────────

function loadFeedback(): FeedbackItem[] {
  try {
    const raw = readWithLegacyMigration(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FeedbackItem[];
  } catch {
    return [];
  }
}

function saveFeedback(items: FeedbackItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

/** 生成短反馈编号 */
function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** 将反馈内容格式化为纯文本，便于复制 */
function formatFeedbackText(item: FeedbackItem): string {
  const lines = [
    `[熵减反馈] ${TYPE_LABEL_MAP[item.type]}`,
    `编号: ${shortId(item.id)}`,
    `时间: ${new Date(item.createdAt).toLocaleString('zh-CN')}`,
    '',
    item.description,
  ];
  if (item.rating) {
    lines.push(`\n评分: ${item.rating}/5`);
  }
  return lines.join('\n');
}

/** 复制文本到剪贴板 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for non-HTTPS environments
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}

// ─── Star Rating ────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
}

function StarRating({ value, onChange }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 transition-colors duration-kb-fast"
          aria-label={`${n}星`}
        >
          <Star
            className={cn(
              'w-5 h-5 transition-colors duration-kb-fast',
              n <= (hover || value)
                ? 'fill-brand-500 text-brand-500'
                : 'text-text-tertiary',
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}
      <span className="ml-1 text-c1 text-text-tertiary">
        {value > 0 ? `${value}/5` : ''}
      </span>
    </div>
  );
}

// ─── Feedback Form ──────────────────────────────────────────────

interface FeedbackFormProps {
  onSubmit: (item: FeedbackItem) => void;
}

function FeedbackForm({ onSubmit }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(0);
  const [successInfo, setSuccessInfo] = useState<{ id: string; time: string } | null>(null);

  const charCount = description.length;
  const isValid = description.trim().length > 0 && (type !== 'experience' || rating > 0);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;
    const now = new Date();
    const item: FeedbackItem = {
      id: crypto.randomUUID(),
      type,
      description: description.trim(),
      rating: type === 'experience' ? rating : undefined,
      createdAt: now.toISOString(),
      status: 'sent',
    };
    onSubmit(item);
    setDescription('');
    setRating(0);
    setSuccessInfo({ id: shortId(item.id), time: now.toLocaleString('zh-CN') });
    // 成功提示 4 秒后消失
    setTimeout(() => setSuccessInfo(null), SUCCESS_TOAST_DURATION_MS);
  }, [type, description, rating, isValid, onSubmit]);

  return (
    <div className="space-y-kb-md">
      {/* Type selector */}
      <div className="flex gap-kb-xs">
        {TYPE_OPTIONS.map(({ value, label, icon: _icon, emoji }) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-kb-sm rounded-kb-md',
              'text-b2 font-medium transition-all duration-kb-fast',
              type === value
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 shadow-kb-sm'
                : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
            )}
          >
            <span className="text-b1">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Description */}
      <div className="relative">
        <textarea
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= MAX_LENGTH) {
              setDescription(e.target.value);
            }
          }}
          placeholder={
            type === 'bug'
              ? '描述你遇到的问题…'
              : type === 'suggestion'
                ? '分享你的改进建议…'
                : '评价你的使用体验…'
          }
          rows={4}
          className={cn(
            'w-full resize-none rounded-kb-md border border-border/50',
            'bg-bg-primary px-kb-md py-kb-sm text-b2 text-text-primary',
            'placeholder:text-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50',
            'transition-all duration-kb-fast',
          )}
        />
        <span
          className={cn(
            'absolute bottom-kb-xs right-kb-sm text-c2',
            charCount >= MAX_LENGTH * 0.9 ? 'text-semantic-error' : 'text-text-tertiary',
          )}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>

      {/* Star rating (experience only) */}
      {type === 'experience' && (
        <div className="flex items-center gap-kb-sm">
          <span className="text-b2 text-text-secondary">评分</span>
          <StarRating value={rating} onChange={setRating} />
        </div>
      )}

      {/* Success confirmation */}
      {successInfo && (
        <div className={cn(
          'flex items-start gap-2.5 p-3 rounded-kb-md',
          'bg-semantic-success/8 border border-semantic-success/25',
          'animate-in fade-in slide-in-from-top-1 duration-200',
        )}>
          <CheckCircle className="w-icon-sm h-icon-sm text-semantic-success flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <p className="text-b2 font-medium text-semantic-success">感谢你的反馈！</p>
            <p className="text-c1 text-text-tertiary mt-0.5">
              编号 <span className="font-mono text-text-secondary">{successInfo.id}</span>
              {' · '}{successInfo.time}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessInfo(null)}
            className="text-text-tertiary/50 hover:text-text-tertiary transition-colors p-0.5"
            aria-label="关闭提示"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Submit button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!isValid}
        className={cn(
          'w-full flex items-center justify-center gap-kb-xs py-kb-sm rounded-kb-md',
          'text-b2 font-medium transition-all duration-kb-fast',
          isValid
            ? 'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98]'
            : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
        )}
      >
        <Send className="w-icon-sm h-icon-sm" />
        <span>提交反馈</span>
      </button>
    </div>
  );
}

// ─── History List ───────────────────────────────────────────────

interface FeedbackHistoryProps {
  items: FeedbackItem[];
  onDelete: (id: string) => void;
}

function FeedbackHistory({ items, onDelete }: FeedbackHistoryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCopy = useCallback(async (item: FeedbackItem) => {
    const ok = await copyToClipboard(formatFeedbackText(item));
    if (ok) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), COPY_TOAST_DURATION_MS);
    }
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-center text-b3 text-text-tertiary py-kb-lg">
        暂无反馈记录
      </p>
    );
  }

  return (
    <ul className="space-y-kb-xs">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        const isCopied = copiedId === item.id;
        return (
          <li
            key={item.id}
            className={cn(
              'rounded-kb-md transition-colors duration-kb-fast',
              'bg-bg-secondary/50 hover:bg-bg-secondary',
            )}
          >
            <div
              className="flex items-start gap-kb-sm p-kb-sm cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <span className="text-b1 flex-shrink-0 mt-0.5">
                {TYPE_ICON_MAP[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-kb-xs mb-0.5">
                  <span className="text-c1 font-medium text-text-secondary">
                    {TYPE_LABEL_MAP[item.type]}
                  </span>
                  {item.rating && (
                    <span className="text-c2 text-brand-500">
                      {'★'.repeat(item.rating)}
                    </span>
                  )}
                  <span className="text-c2 text-text-tertiary/50 font-mono">
                    #{shortId(item.id)}
                  </span>
                  <span className="ml-auto text-c2 text-text-tertiary flex-shrink-0">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                <p className={cn(
                  'text-b3 text-text-primary',
                  isExpanded ? 'whitespace-pre-wrap' : 'truncate',
                )}>
                  {item.description}
                </p>
              </div>
            </div>

            {/* Expanded action bar */}
            {isExpanded && (
              <div className="flex items-center gap-2 px-kb-sm pb-kb-sm pt-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCopy(item); }}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 font-medium',
                    'transition-all duration-kb-fast',
                    isCopied
                      ? 'bg-semantic-success/10 text-semantic-success'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary',
                  )}
                >
                  {isCopied ? (
                    <><CheckCircle className="w-3 h-3" /> 已复制</>
                  ) : (
                    <><Copy className="w-3 h-3" /> 复制内容</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                    setExpandedId(null);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 font-medium',
                    'bg-bg-tertiary text-text-tertiary hover:text-semantic-error',
                    'transition-all duration-kb-fast',
                  )}
                >
                  <Trash2 className="w-3 h-3" /> 删除
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────

export default function FeedbackPanel({ isOpen, onClose }: FeedbackPanelProps) {
  const [items, setItems] = useState<FeedbackItem[]>(() => loadFeedback());

  // Sync to localStorage whenever items change
  useEffect(() => {
    saveFeedback(items);
  }, [items]);

  const handleSubmit = useCallback((item: FeedbackItem) => {
    setItems((prev) => [item, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // 使用 createPortal 渲染到 body，避免 Sidebar 的 backdrop-blur
  // 创建新包含块导致 fixed 定位元素被约束在侧边栏内
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm',
          'transition-opacity duration-kb-normal',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-screen w-[360px] max-w-[90vw]',
          'bg-bg-elevated border-l border-border/50 shadow-kb-lg',
          'flex flex-col',
          'transition-transform duration-kb-normal ease-kb-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-label="反馈面板"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-kb-lg py-kb-md border-b border-border/30 flex-shrink-0">
          <h2 className="text-h3 font-semibold text-text-primary">
            反馈
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-1 rounded-kb-md',
              'text-text-tertiary hover:text-text-primary hover:bg-bg-secondary',
              'transition-colors duration-kb-fast',
            )}
            aria-label="关闭反馈面板"
          >
            <X className="w-icon-md h-icon-md" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-kb-lg py-kb-md space-y-kb-lg">
          {/* Form section */}
          <section>
            <h3 className="text-b2 font-medium text-text-secondary mb-kb-sm">
              提交反馈
            </h3>
            <FeedbackForm onSubmit={handleSubmit} />
          </section>

          {/* Divider */}
          <div className="border-t border-border/30" />

          {/* History section */}
          <section>
            <div className="flex items-center justify-between mb-kb-sm">
              <h3 className="text-b2 font-medium text-text-secondary">
                历史记录
              </h3>
              {items.length > 0 && (
                <span className="text-c2 text-text-tertiary/50">{items.length} 条</span>
              )}
            </div>
            <FeedbackHistory items={items} onDelete={handleDelete} />
          </section>
        </div>

        {/* Footer */}
        <div className="px-kb-lg py-kb-md border-t border-border/30 flex-shrink-0">
          <p className="text-c2 text-text-tertiary">
            点击历史反馈可展开，复制内容后通过其他渠道发送
          </p>
          <p className="text-c2 text-text-tertiary mt-0.5">
            您的反馈将帮助我们改进熵减
          </p>
        </div>
      </aside>
    </>,
    document.body,
  );
}
