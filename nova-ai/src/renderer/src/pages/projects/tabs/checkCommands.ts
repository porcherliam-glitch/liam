// Which command a check kind uses and the honest German sentence when none is configured (UI-SPEC §4 Prüfungen).
import type { CheckKind, ProjectConfig } from '@shared/schemas';

/** Display order of the check kinds. test/build/lint are always offered; the others only when configured. */
export const CHECK_KIND_ORDER: CheckKind[] = ['test', 'build', 'lint', 'typecheck', 'e2e', 'security', 'runtime', 'package'];
export const PRIMARY_CHECK_KINDS: CheckKind[] = ['test', 'build', 'lint'];

const MISSING: Record<CheckKind, string> = {
  test: 'kein Testbefehl',
  build: 'kein Build-Befehl',
  lint: 'kein Lint-Befehl',
  typecheck: 'kein Befehl für die Typprüfung',
  e2e: 'kein Befehl für Oberflächentests',
  security: 'kein Befehl für die Sicherheitsprüfung',
  runtime: 'kein Start- oder Entwicklungsbefehl',
  package: 'kein Befehl zum Paketbau',
};

/** e.g. "Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich" (no trailing period). */
export function missingCommandText(kind: CheckKind): string {
  return `Für dieses Projekt ist ${MISSING[kind]} eingerichtet – Prüfung nicht möglich`;
}

/** Command used for a check kind (runtime starts the run command, else the dev command); null = not configured. */
export function commandFor(project: { config: Pick<ProjectConfig, 'commands'> }, kind: CheckKind): string | null {
  const c = project.config.commands;
  if (kind === 'runtime') return c.run ?? c.dev ?? null;
  return c[kind] ?? null;
}

/** Label of the "run" button per kind. */
export const RUN_CHECK_LABEL: Record<CheckKind, string> = {
  test: 'Tests ausführen',
  build: 'Build ausführen',
  lint: 'Lint ausführen',
  typecheck: 'Typprüfung ausführen',
  e2e: 'Oberflächentests ausführen',
  security: 'Sicherheitsprüfung ausführen',
  runtime: 'Startprüfung ausführen',
  package: 'Paket bauen',
};
