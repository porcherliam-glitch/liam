// Normalized approval subjects: the ONE definition used by ApprovalService.fingerprint, so "always" rules and
// once-approvals match exactly the same action regardless of which module asked.
import type { ApprovalKind } from '@shared/schemas';

/** Collapses whitespace outside quotes. */
function collapseWhitespace(input: string): string {
  let out = '';
  let quote: string | null = null;
  let lastSpace = false;
  for (const ch of input.trim()) {
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      lastSpace = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!lastSpace) out += ' ';
      lastSpace = true;
      continue;
    }
    out += ch;
    lastSpace = false;
  }
  return out;
}

const PATH_KINDS: ApprovalKind[] = ['delete', 'outside_project', 'security_config'];

export function normalizeSubject(kind: ApprovalKind, subject: string, platform: NodeJS.Platform = process.platform): string {
  let s = collapseWhitespace(subject);
  if (platform === 'win32') {
    if (PATH_KINDS.includes(kind) && !s.includes(' ')) {
      s = s.replace(/\//g, '\\').toLowerCase();
    } else {
      // case-fold only the first command token (cmd/PowerShell are case-insensitive, arguments may not be)
      const i = s.indexOf(' ');
      s = i === -1 ? s.toLowerCase() : s.slice(0, i).toLowerCase() + s.slice(i);
    }
  }
  if (kind === 'network') s = s.toLowerCase();
  return s;
}
