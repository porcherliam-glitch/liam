// Live activity of the agents: newest steps of recent runs plus every new `run.step`, and the task conversation
// (`task.note`: agent questions, user hints/answers). Newest first.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Activity } from 'lucide-react';
import type { AgentRun, AgentStep, Task, TaskNote } from '@shared/schemas';
import { useNovaEvent } from '../../hooks/useEvents';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatFullDate, formatTime } from '../../lib/format';
import { AGENT_STEP_KIND, metaOf, TASK_NOTE_KIND, toneClasses } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { RoleBadge } from '../common/StatusBadges';

export interface ActivityFeedProps {
  /** Known runs (for the role of a step and to pick the runs whose history is shown first). undefined = loading. */
  runs: readonly AgentRun[] | undefined;
  tasksById: ReadonlyMap<string, Task>;
  /** Only activity of this project. */
  projectId?: string;
  /** Project names (shown when the feed spans several projects). */
  projectNames?: ReadonlyMap<string, string>;
  /** Max entries kept (default 150). */
  limit?: number;
  maxHeight?: number;
  className?: string;
}

interface FeedItem {
  key: string;
  ts: number;
  projectId: string;
  taskId: string;
  runId: string | null;
  meta: ReturnType<typeof metaOf>;
  text: string;
  /** User/agent conversation entry. */
  note: boolean;
}

const SEED_RUNS = 5;
const SEED_STEPS = 6;
const SEED_NOTES = 3;

function stepItem(s: AgentStep): FeedItem {
  return { key: `s${s.id}`, ts: s.ts, projectId: s.projectId, taskId: s.taskId, runId: s.runId, meta: metaOf(AGENT_STEP_KIND, s.kind), text: s.summary, note: false };
}

function noteItem(n: TaskNote): FeedItem {
  const who = n.author === 'user' ? 'Hinweis von mir' : n.author === 'agent' ? 'Agent' : 'NOVA';
  const prefix = n.kind === 'question' ? 'Frage des Agenten: ' : n.kind === 'answer' ? 'Antwort: ' : `${who}: `;
  return { key: `n${n.id}`, ts: n.createdAt, projectId: n.projectId, taskId: n.taskId, runId: n.consumedRunId, meta: metaOf(TASK_NOTE_KIND, n.kind), text: `${prefix}${n.text}`, note: true };
}

async function latestSteps(runId: string): Promise<AgentStep[]> {
  let all: AgentStep[] = [];
  let afterId: number | undefined;
  for (let page = 0; page < 3; page++) {
    const batch = await api('agents.steps', { runId, limit: 300, ...(afterId !== undefined ? { afterId } : {}) });
    all = all.concat(batch);
    if (batch.length < 300) break;
    afterId = batch[batch.length - 1].id;
  }
  return all.slice(-SEED_STEPS);
}

export function ActivityFeed({ runs, tasksById, projectId, projectNames, limit = 150, maxHeight = 520, className }: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [seeding, setSeeding] = useState(true);
  const seededFor = useRef<string | null>(null);
  const runsById = useMemo(() => new Map((runs ?? []).map((r) => [r.id, r])), [runs]);

  const add = (next: FeedItem[]) =>
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.key, i]));
      for (const i of next) map.set(i.key, i);
      return [...map.values()].sort((a, b) => b.ts - a.ts).slice(0, limit);
    });

  // Seed once per scope with the newest steps/notes of the most recent runs. Later `runs` updates (live patches)
  // must not cancel the seed, so a token identifies the current scope instead of an effect cleanup.
  const seedToken = useRef(0);
  useEffect(
    () => () => {
      seedToken.current++;
      seededFor.current = null;
    },
    [],
  );
  useEffect(() => {
    const scope = projectId ?? '*';
    if (!runs || seededFor.current === scope) return;
    seededFor.current = scope;
    const token = ++seedToken.current;
    setItems([]);
    const recent = [...runs]
      .filter((r) => !projectId || r.projectId === projectId)
      .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.updatedAt - a.updatedAt)
      .slice(0, SEED_RUNS);
    if (!recent.length) {
      setSeeding(false);
      return;
    }
    setSeeding(true);
    const taskIds = [...new Set(recent.map((r) => r.taskId))];
    void Promise.allSettled([
      ...recent.map((r) => latestSteps(r.id).then((steps) => steps.map(stepItem))),
      ...taskIds.map((id) => api('tasks.notes', { taskId: id }).then((notes) => notes.slice(-SEED_NOTES).map(noteItem))),
    ]).then((results) => {
      if (token !== seedToken.current) return;
      add(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
      setSeeding(false);
    });
  }, [runs, projectId]);

  useNovaEvent('run.step', (s) => {
    if (projectId && s.projectId !== projectId) return;
    add([stepItem(s)]);
  });
  useNovaEvent('task.note', (n) => {
    if (projectId && n.projectId !== projectId) return;
    add([noteItem(n)]);
  });

  if (seeding && items.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 px-1 py-4 text-xs text-muted', className)}>
        <Spinner size="sm" label={null} /> Aktivität wird geladen …
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState compact icon={Activity} title="Noch keine Aktivität" description="Sobald ein Agent arbeitet, erscheinen seine Schritte hier – live." className={className} />;
  }

  return (
    <ol
      aria-label="Live-Aktivität"
      aria-live="polite"
      aria-relevant="additions"
      style={{ maxHeight }}
      className={cn('-mx-1 space-y-0.5 overflow-y-auto px-1', className)}
    >
      {items.map((i) => {
        const run = i.runId ? runsById.get(i.runId) : undefined;
        const task = tasksById.get(i.taskId);
        const Icon = i.meta.icon;
        return (
          <li key={i.key} className={cn('flex gap-2.5 rounded-lg px-2 py-1.5', i.note && 'bg-surface-2')}>
            <span className={cn('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-2', toneClasses[i.meta.tone].text)} title={i.meta.label}>
              <Icon aria-hidden className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs break-words text-text">
                <span className="sr-only">{i.meta.label}: </span>
                {i.text}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
                <time dateTime={new Date(i.ts).toISOString()} title={formatFullDate(i.ts)} className="tabular-nums">
                  {formatTime(i.ts, true)}
                </time>
                {run && <RoleBadge role={run.role} />}
                <Link to={paths.project(i.projectId, { tab: 'tasks', task: i.taskId })} className="max-w-64 truncate text-muted hover:text-text">
                  {task?.title ?? 'Aufgabe'}
                </Link>
                {projectNames && !projectId && <span className="truncate text-subtle">· {projectNames.get(i.projectId) ?? 'Projekt'}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
