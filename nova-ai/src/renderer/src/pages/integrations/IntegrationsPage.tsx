// Werkzeuge (UI-SPEC §4 UI-4, §7, MASTERPROMPT §16): detected development tools grouped by category with
// availability, version, path and diagnosis; manual path (file dialog → integrations.setPath), reset to automatic
// detection, installation request (creates a Freigabe, never runs silently) and a fresh scan.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, CircleX, Download, ExternalLink, FolderSearch, Hand, MonitorUp, RefreshCw, RotateCcw, ShieldAlert, Wrench } from 'lucide-react';
import type { IntegrationStatus, ProjectKind, ProjectSummary } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import { Page } from '../../components/layout/Page';
import { Badge, Button, Card, CodeBlock, EmptyState, ErrorState, IconButton, LoadingState, SectionHeader, Select } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { useMutation, useNovaEvent, useProjects, useRpc } from '../../hooks';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { INTEGRATION_CATEGORY, INTEGRATION_NAME, metaOf } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { chooseFile, dialogUnavailable, openWebsite, PROGRAM_FILTER, revealInExplorer } from '../settings/shared/files';
import { Notice } from '../settings/shared/ui';

const CATEGORY_ORDER = Object.keys(INTEGRATION_CATEGORY) as Array<IntegrationStatus['category']>;

/** Engines open only projects of their own kind; editors and terminals open every project. */
const ENGINE_KIND: Record<string, ProjectKind> = { unity: 'unity', godot: 'godot', unreal: 'unreal' };

export default function IntegrationsPage() {
  const integrations = useRpc('integrations.list', { refresh: false });
  const projects = useProjects();
  const [scanning, setScanning] = useState(false);
  const [installResults, setInstallResults] = useState<Record<string, RpcResult<'integrations.install'>>>({});

  useNovaEvent('integrations.updated', (list) => integrations.setData(list));

  const scan = async () => {
    setScanning(true);
    try {
      integrations.setData(await api('integrations.list', { refresh: true }));
      toast.success('Werkzeuge neu geprüft');
    } catch (e) {
      toast.fromError(e, 'Die Werkzeuge konnten nicht geprüft werden');
    } finally {
      setScanning(false);
    }
  };

  const replace = (item: IntegrationStatus) => integrations.setData((prev) => prev?.map((i) => (i.id === item.id ? item : i)));

  const list = integrations.data ?? [];
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: list.filter((i) => i.category === category).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      })).filter((g) => g.items.length > 0),
    [list],
  );
  const unknown = list.filter((i) => !CATEGORY_ORDER.includes(i.category));
  const available = list.filter((i) => i.available).length;

  return (
    <Page
      title="Werkzeuge"
      description="Programme, die NOVA für Projekte verwendet – zum Beispiel Git, Node.js oder Unity. Fehlende Werkzeuge werden nur für bestimmte Projektarten gebraucht. Installiert wird nie ohne Freigabe."
      actions={
        <Button icon={RefreshCw} loading={scanning} onClick={() => void scan()}>
          Erneut suchen
        </Button>
      }
    >
      {integrations.loading ? (
        <LoadingState label="Werkzeuge werden geprüft …" />
      ) : integrations.error && !integrations.data ? (
        <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={Wrench} title="Noch keine Werkzeuge erkannt" description="„Erneut suchen“ prüft, welche Programme auf diesem PC installiert sind." />
      ) : (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">
            <span className="font-semibold text-text">
              {available} von {list.length}
            </span>{' '}
            Werkzeugen sind verfügbar.
          </p>
          {[...groups, ...(unknown.length ? [{ category: null, items: unknown }] : [])].map((g) => {
            const meta = g.category ? metaOf(INTEGRATION_CATEGORY, g.category) : null;
            return (
              <section key={g.category ?? 'other'} className="space-y-2.5">
                <SectionHeader title={meta?.label ?? 'Weitere'} icon={meta?.icon ?? Wrench} count={g.items.length} />
                <div className="grid gap-3 lg:grid-cols-2">
                  {g.items.map((i) => (
                    <IntegrationCard
                      key={i.id}
                      integration={i}
                      installResult={installResults[i.id]}
                      projects={projects.data ?? []}
                      onChanged={replace}
                      onInstallRequested={(r) => setInstallResults((prev) => ({ ...prev, [i.id]: r }))}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}

interface IntegrationCardProps {
  integration: IntegrationStatus;
  projects: ProjectSummary[];
  installResult: RpcResult<'integrations.install'> | undefined;
  onChanged: (i: IntegrationStatus) => void;
  onInstallRequested: (r: RpcResult<'integrations.install'>) => void;
}

function IntegrationCard({ integration: i, projects, installResult, onChanged, onInstallRequested }: IntegrationCardProps) {
  const name = i.name || INTEGRATION_NAME[i.id] || i.id;
  const setPath = useMutation('integrations.setPath', {
    errorToast: 'Der Pfad konnte nicht übernommen werden',
    successToast: (r, p) => (p?.path ? `${name}: Pfad übernommen` : `${name} wird wieder automatisch gesucht`),
    onSuccess: onChanged,
  });
  const install = useMutation('integrations.install', {
    errorToast: 'Die Installation konnte nicht angefragt werden',
    onSuccess: (r) => {
      onInstallRequested(r);
      if (r.approvalId) toast.info('Freigabe angelegt', `${name} wird erst installiert, wenn die Freigabe erteilt ist.`);
    },
  });

  const choosePath = async () => {
    const path = await chooseFile({ title: `Programmdatei von ${name} auswählen`, defaultPath: i.manualPath ?? i.path ?? undefined, filters: PROGRAM_FILTER });
    if (path === undefined) return dialogUnavailable();
    if (path === null) return;
    await setPath.run({ id: i.id, path });
  };

  const hint = i.installHint;
  const canInstall = !i.available && !!hint?.command;

  return (
    <Card as="article" padding="none" className={cn(!i.available && 'border-warning/30')}>
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {i.available ? (
                <Badge tone="success" icon={CircleCheck}>
                  Verfügbar
                </Badge>
              ) : (
                <Badge tone="warning" icon={CircleX}>
                  Nicht verfügbar
                </Badge>
              )}
              {i.version && <Badge tone="neutral">Version {i.version}</Badge>}
              {i.manualPath && (
                <Badge tone="violet" icon={Hand} title={i.manualPath}>
                  Pfad von Hand gewählt
                </Badge>
              )}
              {i.canOpen && i.available && (
                <Badge tone="info" icon={MonitorUp} title="Kann Projekte direkt öffnen">
                  Kann Projekte öffnen
                </Badge>
              )}
            </div>
          </div>
          <RelativeTime ts={i.checkedAt} prefix="geprüft" className="text-[11px] text-subtle" />
        </div>

        <p className="text-[13px] text-muted">{i.message}</p>

        {i.path && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-text" title={i.path}>
              {i.path}
            </span>
            <IconButton icon={FolderSearch} size="sm" label={`${name} im Explorer zeigen`} onClick={() => void revealInExplorer(i.path as string)} />
          </div>
        )}

        {i.installations.length > 1 && (
          <div>
            <p className="text-xs font-medium text-text">Gefundene Installationen</p>
            <ul className="mt-1 space-y-1">
              {i.installations.map((inst) => (
                <li key={inst.path} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 font-mono text-text">{inst.version}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-muted" title={inst.path}>
                    {inst.path}
                  </span>
                  {inst.path === i.path && <Badge tone="success">wird verwendet</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!i.available && hint && (
          <div className="space-y-2">
            {hint.command && <CodeBlock label="Installationsbefehl" code={hint.command} />}
            <div className="flex flex-wrap items-center gap-2">
              {hint.requiresAdmin && (
                <Badge tone="warning" icon={ShieldAlert}>
                  Braucht Administratorrechte
                </Badge>
              )}
              {hint.url && (
                <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void openWebsite(hint.url as string)}>
                  Webseite öffnen
                </Button>
              )}
            </div>
          </div>
        )}

        {i.canOpen && i.available && <OpenProject integrationId={i.id} name={name} projects={projects} />}

        {installResult && (
          <Notice
            tone={installResult.approvalId ? 'info' : 'warning'}
            title={installResult.approvalId ? 'Freigabe angelegt' : undefined}
            actions={
              installResult.approvalId ? (
                <Link to={paths.approvals} className="text-xs font-medium">
                  Zu den Freigaben
                </Link>
              ) : undefined
            }
          >
            {installResult.message}
          </Notice>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2.5">
        {i.manualPath && (
          <Button size="sm" variant="ghost" icon={RotateCcw} loading={setPath.loading} onClick={() => void setPath.run({ id: i.id, path: null })}>
            Automatisch suchen
          </Button>
        )}
        <Button size="sm" icon={FolderSearch} disabled={setPath.loading} onClick={() => void choosePath()} aria-label={`Pfad für ${name} wählen`}>
          Pfad wählen …
        </Button>
        {canInstall && (
          <Button size="sm" variant="primary" icon={Download} loading={install.loading} disabled={!!installResult?.approvalId} onClick={() => void install.run({ id: i.id })}>
            Installieren
          </Button>
        )}
      </footer>
    </Card>
  );
}

/** "Projekt in <Werkzeug> öffnen" (integrations.open) for editors, terminals and engines. */
function OpenProject({ integrationId, name, projects }: { integrationId: string; name: string; projects: ProjectSummary[] }) {
  const kind = ENGINE_KIND[integrationId];
  const candidates = projects.filter((p) => !kind || p.kind === kind);
  const [projectId, setProjectId] = useState('');
  const open = useMutation('integrations.open', {
    errorToast: `${name} konnte nicht geöffnet werden`,
    successToast: (_r, p) => `${projects.find((x) => x.id === p?.projectId)?.name ?? 'Projekt'} wird in ${name} geöffnet`,
  });
  if (candidates.length === 0) {
    return <p className="text-xs text-muted">{kind ? `Kann ${name}-Projekte öffnen – es gibt aber noch keins.` : `Kann Projekte öffnen – es gibt aber noch keins.`}</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        size="sm"
        label={`Projekt in ${name} öffnen`}
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        placeholder="Projekt wählen …"
        options={candidates.map((p) => ({ value: p.id, label: p.name }))}
        containerClassName="min-w-48 flex-1"
      />
      <Button size="sm" icon={MonitorUp} loading={open.loading} disabled={!projectId} onClick={() => void open.run({ id: integrationId, projectId })}>
        Öffnen
      </Button>
    </div>
  );
}
