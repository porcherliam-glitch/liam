import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CaseSensitive, ChevronRight, Regex, Search, SearchX } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../../../components/ui';
import { useDebouncedValue, useRpc } from '../../../hooks';
import { cn } from '../../../lib/cn';
import { plural } from '../../../lib/format';
import { FileIcon } from '../FileIcon';
import { fileName, groupSearchMatches, highlightSegments, parentPath, regexError } from '../studio-utils';

export const SEARCH_LIMIT = 500;

export interface SearchPanelProps {
  projectId: string;
  onOpen: (path: string, line: number, column: number) => void;
  /** Changes when the search should get the keyboard focus (Strg+Umschalt+F). */
  focusToken?: number;
}

/** Full-text search in the project files (files.search) with case/regex toggles, results grouped by file. */
export function SearchPanel({ projectId, onOpen, focusToken }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(query, 350);
  const term = debounced.trim();
  const invalid = regex && term ? regexError(term) : null;
  const params = term && !invalid ? { projectId, query: term, regex, caseSensitive, limit: SEARCH_LIMIT } : null;
  const search = useRpc('files.search', params, { keepPreviousData: true });

  useEffect(() => {
    if (focusToken === undefined || focusToken === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const active = params !== null;
  const groups = useMemo(() => (active && search.data ? groupSearchMatches(search.data) : []), [active, search.data]);
  const total = search.data?.length ?? 0;
  const pending = query.trim() !== term;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (params) void search.refetch();
  };

  const toggleGroup = (path: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  let body;
  if (!term) {
    body = <EmptyState compact icon={Search} title="Im Projekt suchen" description="Suchbegriff eingeben – die Treffer erscheinen hier, ein Klick öffnet die Stelle im Editor." />;
  } else if (invalid) {
    body = null;
  } else if (search.error && !search.data) {
    body = <ErrorState compact error={search.error} title="Die Suche hat nicht geklappt" onRetry={() => void search.refetch()} />;
  } else if (!search.data) {
    body = <LoadingState compact label="Suche läuft …" />;
  } else if (total === 0) {
    body = <EmptyState compact icon={SearchX} title={`Keine Treffer für „${term}“`} description="Andere Schreibweise versuchen oder die Optionen für Groß-/Kleinschreibung und reguläre Ausdrücke prüfen." />;
  } else {
    body = (
      <div>
        <p className="px-3 py-1.5 text-xs text-muted" aria-live="polite">
          {plural(total, 'Treffer', 'Treffer')} in {plural(groups.length, 'Datei', 'Dateien')}
          {total >= SEARCH_LIMIT && ` – es werden nur die ersten ${SEARCH_LIMIT} angezeigt. Bitte die Suche genauer fassen.`}
        </p>
        <ul aria-label="Suchergebnisse" className="pb-2">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.path);
            const dir = parentPath(group.path);
            return (
              <li key={group.path}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.path)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-surface-2 focus-visible:outline-offset-[-2px]"
                >
                  <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 shrink-0 text-subtle transition-transform duration-150', !isCollapsed && 'rotate-90')} />
                  <FileIcon name={group.path} />
                  <span className="truncate font-medium">{fileName(group.path)}</span>
                  {dir && <span className="min-w-0 truncate text-xs text-subtle">{dir}</span>}
                  <span className="ml-auto shrink-0 rounded-full bg-surface-3 px-1.5 text-[11px] leading-4 text-muted tabular-nums">{group.matches.length}</span>
                </button>
                {!isCollapsed && (
                  <ul aria-label={`Treffer in ${group.path}`}>
                    {group.matches.map((m) => (
                      <li key={`${m.line}:${m.column}`}>
                        <button
                          type="button"
                          onClick={() => onOpen(m.path, m.line, m.column)}
                          aria-label={`${m.path}, Zeile ${m.line}: ${m.preview}`}
                          className="flex w-full items-baseline gap-2 py-0.5 pr-3 pl-9 text-left font-mono text-xs hover:bg-surface-2 focus-visible:outline-offset-[-2px]"
                        >
                          <span className="w-9 shrink-0 text-right text-subtle tabular-nums">{m.line}</span>
                          <span className="min-w-0 truncate text-text/90">
                            {highlightSegments(m.preview, term, { regex, caseSensitive }).map((seg, i) =>
                              seg.match ? (
                                <mark key={i} className="rounded-sm bg-warning/30 px-px text-text">
                                  {seg.text}
                                </mark>
                              ) : (
                                <span key={i}>{seg.text}</span>
                              ),
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form role="search" aria-label="In Projektdateien suchen" onSubmit={onSubmit} className="flex shrink-0 flex-col gap-1 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen …"
              aria-label="Suchbegriff"
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? 'studio-search-error' : undefined}
              spellCheck={false}
              className={cn(
                'h-8 w-full rounded-lg border bg-surface-2 pr-8 pl-8 text-[13px] text-text transition-colors duration-150 hover:border-border-strong focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/60',
                invalid ? 'border-danger/70' : 'border-border',
              )}
            />
            {(pending || search.refreshing) && params !== null && <Spinner size="xs" label="Suche läuft" className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />}
          </div>
          <ToggleButton pressed={caseSensitive} onChange={setCaseSensitive} label="Groß-/Kleinschreibung beachten" icon={CaseSensitive} />
          <ToggleButton pressed={regex} onChange={setRegex} label="Regulärer Ausdruck" icon={Regex} />
        </div>
        {invalid && (
          <p id="studio-search-error" role="alert" className="px-1 text-xs text-danger-fg">
            {invalid}
          </p>
        )}
      </form>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  );
}

function ToggleButton({ pressed, onChange, label, icon: Icon }: { pressed: boolean; onChange: (v: boolean) => void; label: string; icon: typeof Search }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
        pressed ? 'border-violet/60 bg-violet/18 text-violet-fg' : 'border-transparent text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}
