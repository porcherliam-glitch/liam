import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toasts';
import { IconButton } from './Button';

/** Copies text to the clipboard (with a fallback for restricted contexts). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface CodeBlockProps {
  code: string;
  /** Small caption above the code (e.g. "Befehl"). */
  label?: string;
  /** Show the copy button (default true). */
  copy?: boolean;
  /** Max height before scrolling (default 320px). */
  maxHeight?: number | string;
  /** Wrap long lines instead of horizontal scrolling. */
  wrap?: boolean;
  className?: string;
}

/**
 * Monospace code/output block with a copy button.
 * @example <CodeBlock label="Befehl" code="npx playwright install chromium" />
 */
export function CodeBlock({ code, label, copy = true, maxHeight = 320, wrap = false, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Kopieren nicht möglich', 'Die Zwischenablage ist gerade nicht verfügbar.');
    }
  };

  return (
    <div className={cn('group/code relative min-w-0 rounded-lg border border-border bg-bg', className)}>
      {label && <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>}
      <pre
        className={cn('overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-text', wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre', copy && 'pr-10')}
        style={{ maxHeight }}
        tabIndex={0}
      >
        <code>{code}</code>
      </pre>
      {copy && (
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? 'Kopiert' : 'In die Zwischenablage kopieren'}
          size="sm"
          onClick={() => void onCopy()}
          className={cn('absolute right-1.5', label ? 'top-9' : 'top-1.5', copied && 'text-success-fg')}
        />
      )}
    </div>
  );
}
