# Renderer foundation – guide for page developers

Everything a page needs is already here. Pages never talk to Electron or the daemon directly – only through
`api()` / `useRpc()` / `useMutation()` (which call `window.nova.invoke` via `getBridge()`). Never touch
`window.nova` yourself.

```
lib/       api.ts (typed RPC), format.ts (German formatting), labels.ts (enum → label/tone/icon),
           paths.ts (route helpers), texts.ts (agreed German sentences), mock-bridge.ts + mock-data.ts (demo data),
           test-utils.tsx (test setup), cn.ts (class names)
hooks/     useRpc, useMutation, useNovaEvent, useNow, useDebouncedValue, useStoredState, useProjects, useProjectNames
stores/    daemon (connection, daemon/work status, counters, isMethodSupported), events (one global subscription),
           toasts, ui (page title, sidebar, demo flag)
components/ui/      generic building blocks (no data access)
components/common/  domain components (ErrorCard, ApprovalCard, badges, WorkControls …)
components/layout/  AppShell, Page, Sidebar, TopBar, menus
```

## Page skeleton

Every page renders exactly one `<Page>` – it sets the title in the top bar and the window title.

```tsx
import { Page } from '../../components/layout/Page';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useRpc, useMutation } from '../../hooks';
import { paths } from '../../lib/paths';

export default function TasksPage() {
  const tasks = useRpc('tasks.list', { limit: 500 }, { refetchOn: ['task.updated', 'task.removed'] });
  const pause = useMutation('tasks.pause', { successToast: 'Aufgabe wird pausiert' });

  return (
    <Page title="Aufgaben" description="Alle Aufgaben aller Projekte." actions={<Button variant="primary">Aufgabe anlegen</Button>}>
      {tasks.loading ? <LoadingState /> :
       tasks.error && !tasks.data ? <ErrorState error={tasks.error} onRetry={tasks.refetch} /> :
       tasks.data?.length === 0 ? <EmptyState title="Noch keine Aufgaben" /> :
       /* … list … */ null}
    </Page>
  );
}
```

`back={{ to: paths.projects, label: 'Projekte' }}` shows a back link; `fullBleed` removes padding (studio).

## Data

- **`useRpc(method, params, options)`** → `{ data, error, loading, refreshing, refetch, setData }`.
  - Params are compared by JSON (inline objects are fine). `params = null` disables the query.
  - `refetchOn: NovaEventType[]` re-fetches debounced (250 ms) on events; narrow it with
    `eventFilter: (e) => e.type === 'task.updated' && e.payload.projectId === projectId`.
  - Re-fetches automatically after a reconnect and when events were missed (sequence gap).
  - `intervalMs` polls (paused while the window is hidden). `keepPreviousData` avoids flicker on param changes.
  - `setData(fn)` patches the data locally, e.g. to apply an event payload without a round trip.
- **`useMutation(method, options)`** → `{ run, runAsync, loading, error, reset }`.
  - `run(params)` never throws; it resolves `undefined` on error and shows an error toast.
  - Options: `successToast` (string or `(result) => string`), `errorToast` (title, or `false` to handle `error` inline,
    e.g. validation errors next to fields – see `validationIssues(err)` in api.ts), `onSuccess`, `onError`.
  - Refuses (with toast) while the daemon is disconnected.
- **`api(method, params)`** for imperative code; throws `NovaRpcError { code, message, details, info }`.
  `errorMessage(e)` gives a German message for anything thrown.
- **`useNovaEvent(type | types[], handler)`** for live data (`resources.snapshot`, `run.step`, `terminal.output` …).
- **`useDaemonOnline()`**, **`useSupports('notifications.list')`** / `isMethodSupported()` (hide features the
  connected daemon does not offer), `useDaemonStore(s => s.work)` for the work status.
- **`useProjects()` / `useProjectNames()`** when a list only carries project ids.

While the daemon is disconnected the AppShell disables every form control inside the page (`<fieldset disabled>`)
and greys the content; links keep working. Dialogs are portaled – mutations are guarded anyway.

## Labels and formatting

- `labels.ts`: one `Record<Enum, EnumMeta>` per enum (`TASK_STATUS`, `AGENT_ROLE`, `CHECK_KIND`, `APPROVAL_KIND`,
  `ERROR_SEVERITY`, `PROVIDER_HEALTH`, `MEMORY_KIND`, `OPERATION_KIND` …) with `{ label, tone, icon, description?, spin? }`.
  Use `metaOf(MAP, value)` (safe fallback for unknown values) and `<StatusBadge meta={…} />`.
  `toneClasses[tone]` gives matching Tailwind classes. `blockerAction(task.blockerCode)` suggests where to go
  (Modelle, Kosten, Freigaben, Werkzeuge) or `{ path: null }` for "Frage beantworten".
- `format.ts`: `formatBytes`, `formatDuration` ("3 Min. 12 Sek."), `formatClock`, `formatRelativeTime`, `formatDate(Time)`,
  `formatUsd` ("0,42 $", optional estimate flag), `formatPercent`, `formatTokens` ("12,3 Tsd."), `withEstimate`,
  `plural`, `splitModelRef`, `dirname`, `basename`, `truncate`. Estimated values always get " (geschätzt)".
- `texts.ts`: sentences that must be worded exactly (honest limits, trust warning for opened/imported projects,
  secret store, unclean shutdown, free cloud provider).
- `paths.ts`: `paths.project(id, { tab, task })`, `paths.studio(id, { file, line })`, `paths.newProject` (`?new=1`) …

## Components

- `components/ui`: `Button` (primary/secondary/ghost/danger/subtle, `loading`, `icon`), `IconButton` (label required),
  `Card`, `Badge`/`StatusBadge`, `StatusDot`, `Tabs`/`TabPanel`, `Table` (sortable columns, empty state),
  `Dialog`/`ConfirmDialog` (focus trap, Esc), `Input`/`Textarea`/`Select`/`Field`, `Switch`/`Checkbox`, `Tooltip`,
  `ProgressBar` (null = indeterminate), `Meter` (with "geschätzt"), `EmptyState`/`LoadingState`/`ErrorState`, `Spinner`,
  `KeyValue`, `CodeBlock` (copy button), `SectionHeader`, `SegmentedControl`, `Stat`, `Popover`, `Toaster`.
- `components/common`: `ErrorCard` (MASTERPROMPT §19 incl. jump links and "Reparatur-Aufgabe anlegen"),
  `ApprovalCard` (once/always/deny; "Immer erlauben" hidden for `APPROVAL_KINDS_ONCE_ONLY`), `TaskStatusBadge`,
  `RunStatusBadge`, `VerificationBadge`, `RoleBadge`, `ModelBadge`, `PriorityBadge`, `PrioritySelect`, `CheckStatusBadge`,
  `SeverityBadge`, `ProjectKindBadge`, `EstimatedBadge`, `RelativeTime`, `LiveDuration`, `RunDuration` (uses
  `activeMs`), `WorkControls` (global or `projectId`; `confirmStart={TRUST_PROJECT_TEXT}` for opened/imported projects),
  `DaemonBanner`, `ShutdownNotice`, `ErrorBoundary`.
- Status is always color + icon + text. All user-visible text is German, neutral (no "du"/"Sie").

## Demo data and tests

- In a plain browser (no preload) `main.tsx` installs `lib/mock-bridge.ts` (latency + live simulation) and shows the
  "Demo-Daten" marker in the sidebar. Every RPC method is implemented on coherent demo data (3 projects, tasks in all
  states, runs with steps, approvals, checks, models, budget, resources with a GPU, errors, memory, files, logs,
  notifications, operations); mutations emit the matching events. Browser console: `__NOVA_MOCK__.setMockConnection(…)`.
- Tests (`/** @vitest-environment jsdom */` as first line):

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError, emitMockEvent } from '../../lib/mock-bridge';

setupRendererTest(); // fresh mock + data + stores per test, RTL cleanup

it('pauses a task', async () => {
  renderWithRouter(<TasksPage />, { route: '/tasks' }); // or path: '/projects/:projectId', route: '/projects/prj_pixel'
  await userEvent.click(await screen.findByRole('button', { name: /Pausieren/ }));
  await waitFor(() => expect(getMockCalls('tasks.pause')[0]?.params).toEqual({ id: 'task_px3' }));
});

it('shows the error toast', async () => {
  mockHandlers.set('tasks.pause', () => { throw new MockRpcError('CONFLICT', 'Läuft nicht'); });
  // …
});
```

  Fixture ids: projects `prj_pixel` (web), `prj_aether` (Unity, work stopped), `prj_rezept` (backend, no git);
  tasks `task_px1…9`, `task_rz1…7`, `task_ae1…4`; runs `run_px3` / `run_rz3` (running); approvals `apr_px_cmd`
  (command), `apr_rz_del` (delete); check runs `crun_px_t2` (failed tests) …; see `mock-data.ts`.
  `renderApp(route)` renders the whole shell. There is no jest-dom: use `toBeTruthy()`, `getAttribute()` etc.
