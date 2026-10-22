// Protokolle (UI-SPEC §4 Foundation): daemon logs with level/scope filter, live append and diagnostics bundle.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronRight, Copy, FolderSearch, PackageCheck, RefreshCw, ScrollText, Search, Stethoscope, X } from 'lucide-react';
import { create } from 'zustand';
import type { LogEntry, LogLevel } from '@shared/schemas';
import { Page } from '../components/layout/Page';
import { Button, Card, CodeBlock, copyToClipboard, EmptyState, ErrorState, IconButton, Input, LoadingState, Select, SegmentedControl, StatusBadge, Switch } from '../components/ui';
import { useMutation, useRpc } from '../hooks/useRpc';
import { useNovaEvent } from '../hooks/useEvents';
import { useStoredState } from '../hooks/useStoredState';
import { getBridge } from '../lib/api';
import { cn } from '../lib/cn';
import { dirname, formatBytes, formatDate, formatFullDate, formatTime } from '../lib/format';
import { LOG_LEVEL, metaOf } from '../lib/labels';
import { toast } from '../stores/toasts';

type LevelFilter = 'all' | LogLevel;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const FETCH_LIMIT = 1500;
/** Info/debug entries are not pushed as events (only warn/error), so the list is refreshed periodically while live. */
const POLL_MS = 5000;
const MAX_ENTRIES = 5000;

interface Row extends LogEntry {
  key: string;
}

function matchesLevel(entry: { level: LogLevel }, level: LevelFilter): boolean {
  return level === 'all' || LEVEL_ORDER[entry.level] >= LEVEL_ORDER[level];
}

function scopePrefixes(scope: string): string[] {
  const parts = scope.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

export default function LogsPage() {
  const [level, setLevel] = useStoredState<LevelFilter>('logs.level', 'info');
  const [scope, setScope] = useState('');
  const [query, setQuery] = useState('');
  const [live, setLive] = useState(true);
  const [appended, setAppended] = useState<Row[]>([]);
  const [knownScopes, setKnownScopes] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const logs = useRpc(
    'daemon.logs',
    { limit: FETCH_LIMIT, level: level === 'all' ? undefined : level, scope: scope || undefined },
    { intervalMs: live ? POLL_MS : undefined, keepPreviousData: true },
  );

  // A fresh load replaces the live-appended entries.
  useEffect(() => {
    setAppended([]);
  }, [logs.data]);

  useEffect(() => {
    if (!logs.data?.length) return;
    setKnownScopes((prev) => {
      const next = new Set(prev);
      for (const e of logs.data ?? []) for (const s of scopePrefixes(e.scope)) next.add(s);
      return next.size === prev.size ? prev : next;
    });
  }, [logs.data]);

  useNovaEvent(
    'log',
    (e) => {
      setKnownScopes((prev) => {
        const missing = scopePrefixes(e.scope).filter((s) => !prev.has(s));
        if (!missing.length) return prev;
        return new Set([...prev, ...missing]);
      });
      if (!matchesLevel(e, level) || (scope && !e.scope.startsWith(scope))) return;
      setAppended((prev) => [...prev, { ...e, key: `live-${seq.current++}` }].slice(-MAX_ENTRIES));
    },
    live,
  );

  const rows: Row[] = useMemo(() => {
    const base = (logs.data ?? []).map((e, i) => ({ ...e, key: `${e.ts}-${i}` }));
    return [...base, ...appended].slice(-MAX_ENTRIES);
  }, [logs.data, appended]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? rows.filter((r) => r.msg.toLowerCase().includes(q) || r.scope.toLowerCase().includes(q)) : rows), [rows, q]);
  const counts = useMemo(() => ({ error: visible.filter((r) => r.level === 'error').length, warn: visible.filter((r) => r.level === 'warn').length }), [visible]);

  const scopeOptions = useMemo(
    () => [...knownScopes].sort((a, b) => a.localeCompare(b, 'de')).map((s) => ({ value: s, label: s })),
    [knownScopes],
  );

  return (
    <Page
      title="Protokolle"
      description="Was der Hintergrunddienst gerade tut – hilfreich, wenn etwas nicht klappt. Geheimnisse wie API-Schlüssel werden nie protokolliert."
      actions={<DiagnosticsButton />}
    >
      <div className="space-y-3">
        <DiagnosticsResult />
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text">Stufe (ab)</span>
              <SegmentedControl<LevelFilter>
                label="Stufe (ab)"
                value={level}
                onChange={setLevel}
                options={[
                  { value: 'all', label: 'Alle' },
                  { value: 'info', label: 'Info' },
                  { value: 'warn', label: 'Warnungen' },
                  { value: 'error', label: 'Fehler' },
                ]}
              />
            </div>
            <Select
              label="Bereich"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Alle Bereiche"
              options={scopeOptions}
              containerClassName="w-48"
            />
            <Input
              label="Suchen"
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Text in den Meldungen"
              containerClassName="min-w-48 flex-1"
              suffix={query ? <IconButton icon={X} label="Suche leeren" size="sm" onClick={() => setQuery('')} /> : undefined}
            />
            <div className="flex items-center gap-3 pb-1">
              <Switch checked={live} onChange={setLive} label="Live" size="sm" />
              <Button size="sm" icon={RefreshCw} loading={logs.refreshing && !logs.loading} onClick={() => void logs.refetch()}>
                Neu laden
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-4 py-1.5 text-[11px] text-muted">
            <span>
              {visible.length} Einträge
              {counts.error > 0 && <span className="text-danger-fg"> · {counts.error} Fehler</span>}
              {counts.warn > 0 && <span className="text-warning-fg"> · {counts.warn} Warnungen</span>}
            </span>
            <span>{live ? 'Live: Warnungen und Fehler sofort, alles andere alle 5 Sekunden' : 'Live-Anzeige pausiert'}</span>
          </div>
          {logs.loading ? (
            <LoadingState compact label="Protokolle werden geladen …" />
          ) : logs.error && !logs.data ? (
            <ErrorState compact error={logs.error} onRetry={() => void logs.refetch()} />
          ) : (
            <LogList rows={visible} filtered={!!q || (level !== 'all' && level !== 'info') || !!scope} />
          )}
        </Card>
      </div>
    </Page>
  );
}

// --- log list --------------------------------------------------------------------

function LogList({ rows, filtered }: { rows: Row[]; filtered: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Follow new entries while the view is scrolled to the end.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={ScrollText}
        title={filtered ? 'Keine Einträge für diese Filter' : 'Noch keine Protokolleinträge'}
        description={filtered ? 'Andere Stufe oder anderen Bereich wählen.' : 'Sobald der Hintergrunddienst arbeitet, erscheinen hier seine Meldungen.'}
      />
    );
  }

  let lastDay = '';
  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
          atBottomRef.current = bottom;
          if (bottom !== atBottom) setAtBottom(bottom);
        }}
        className="h-[calc(100vh-330px)] min-h-72 overflow-y-auto font-mono text-xs"
        role="log"
        aria-live="off"
        aria-label="Protokolleinträge"
        tabIndex={0}
      >
        <ol>
          {rows.map((r) => {
            const day = formatDate(r.ts);
            const dayHeader = day !== lastDay;
            lastDay = day;
            const meta = metaOf(LOG_LEVEL, r.level);
            const hasData = r.data !== undefined && r.data !== null;
            const expanded = open.has(r.key);
            return (
              <li key={r.key}>
                {dayHeader && <div className="sticky top-0 z-[1] border-b border-border bg-surface px-4 py-1 font-sans text-[11px] font-medium text-muted">{day}</div>}
                <div
                  className={cn(
                    'grid grid-cols-[64px_92px_minmax(80px,140px)_1fr] items-start gap-2 border-b border-border/40 px-4 py-1 hover:bg-surface-2/60',
                    r.level === 'error' && 'bg-danger/5',
                    r.level === 'warn' && 'bg-warning/5',
                  )}
                >
                  <time dateTime={new Date(r.ts).toISOString()} title={formatFullDate(r.ts)} className="text-muted tabular-nums">
                    {formatTime(r.ts, true)}
                  </time>
                  <span className="font-sans">
                    <StatusBadge meta={meta} />
                  </span>
                  <span className="truncate text-violet-fg/80" title={r.scope}>
                    {r.scope}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start gap-1">
                      {!hasData && <span aria-hidden className="w-3.5 shrink-0" />}
                      {hasData && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.key)) next.delete(r.key);
                              else next.add(r.key);
                              return next;
                            })
                          }
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Details ausblenden' : 'Details anzeigen'}
                          className="mt-px rounded text-muted hover:text-text"
                        >
                          <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', expanded && 'rotate-90')} />
                        </button>
                      )}
                      <span className={cn('break-words whitespace-pre-wrap', r.level === 'error' ? 'text-danger-fg' : 'text-text')}>{r.msg}</span>
                    </div>
                    {hasData && expanded && <CodeBlock code={JSON.stringify(r.data, null, 2)} className="mt-1 mb-1" maxHeight={200} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {!atBottom && (
        <Button
          size="sm"
          variant="primary"
          icon={ArrowDown}
          className="absolute right-5 bottom-4 shadow-lg"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            atBottomRef.current = true;
            setAtBottom(true);
          }}
        >
          Zum neuesten Eintrag
        </Button>
      )}
    </div>
  );
}

// --- diagnostics ---------------------------------------------------------------------

/** Shared state between the header button and the result card. */
interface DiagnosticsState {
  result: { path: string; sizeBytes: number } | null;
  set: (r: { path: string; sizeBytes: number } | null) => void;
}
const useDiagnostics = create<DiagnosticsState>((set) => ({ result: null, set: (result) => set({ result }) }));

function DiagnosticsButton() {
  const setResult = useDiagnostics((s) => s.set);
  const diag = useMutation('daemon.diagnostics', {
    errorToast: 'Diagnose-Paket konnte nicht erstellt werden',
    successToast: 'Diagnose-Paket erstellt',
    onSuccess: (r) => setResult(r),
  });
  return (
    <Button icon={Stethoscope} loading={diag.loading} onClick={() => void diag.run()}>
      Diagnose-Paket erstellen
    </Button>
  );
}

function DiagnosticsResult() {
  const result = useDiagnostics((s) => s.result);
  const setResult = useDiagnostics((s) => s.set);
  useEffect(() => () => setResult(null), [setResult]);
  if (!result) return null;

  const showInExplorer = async () => {
    const ok = await getBridge()?.app.showInFolder(result.path);
    if (!ok) toast.error('Explorer konnte nicht geöffnet werden', dirname(result.path));
  };
  const copyPath = async () => {
    if (await copyToClipboard(result.path)) toast.success('Pfad kopiert');
  };

  return (
    <Card padding="sm" className="border-success/35">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/12 text-success-fg">
          <PackageCheck aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Diagnose-Paket erstellt ({formatBytes(result.sizeBytes)})</p>
          <p className="truncate font-mono text-xs text-muted" title={result.path}>
            {result.path}
          </p>
          <p className="mt-0.5 text-[11px] text-subtle">Enthält Protokolle und Systemangaben, Geheimnisse sind geschwärzt. Das Paket wird nirgendwohin gesendet.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" icon={FolderSearch} onClick={() => void showInExplorer()}>
            Im Explorer zeigen
          </Button>
          <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copyPath()}>
            Pfad kopieren
          </Button>
          <IconButton icon={X} label="Hinweis schließen" size="sm" onClick={() => setResult(null)} />
        </div>
      </div>
    </Card>
  );
}
