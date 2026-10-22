// Chooses a built-in template from the project kind, technologies and free text (German + English keywords).
// Key decisions:
// - Order of evidence: explicit technologies > explicit kind > weighted keywords in name/description/answers.
// - Keywords are matched on a normalized text (lower case, umlauts folded). Short English words use word
//   boundaries ("api" must not match "Kapitel"); German stems match inside compounds ("Browserspiel") but "spiel"
//   never matches "Beispiel"/"abspielen".
// - Default is the web application template (SPEC §4.8: "default web"). The result explains the choice in German so
//   ProjectService can store it as an assumption (memory kind 'decision', tag 'annahme').
import type { ProjectKind } from '@shared/schemas';

export type BuiltinTemplateId = 'web-game' | 'web-app' | 'unity' | 'desktop-dotnet' | 'backend-api' | 'empty';

export interface TemplateChoiceInput {
  kind: ProjectKind | null;
  technologies: string[];
  name: string;
  description: string;
  answers: Record<string, string>;
}

export interface TemplateChoice {
  templateId: BuiltinTemplateId;
  /** German explanation of why this template was chosen. */
  reason: string;
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

interface Rule {
  id: Exclude<BuiltinTemplateId, 'empty'>;
  weight: number;
  re: RegExp;
}

const RULES: Rule[] = [
  { id: 'unity', weight: 10, re: /\bunity\b/ },
  { id: 'desktop-dotnet', weight: 8, re: /(^|[^a-z0-9.])(wpf|winforms|windows forms|winui|\.net|dotnet|c#|csharp)(?![a-z0-9])/ },
  { id: 'desktop-dotnet', weight: 4, re: /(desktop|windows-?anwendung|windows-?programm|windows-?app\b|programm fuer windows|anwendung fuer windows|app fuer windows)/ },
  { id: 'desktop-dotnet', weight: 2, re: /\bwindows\b/ },
  { id: 'web-game', weight: 5, re: /((?<!bei|ab|vor|nach)spiel|\bgames?\b|\bgaming\b|browsergame|arcade|jump ?'?n'? ?run|plattformer|platformer|\bsnake\b|\btetris\b|\bpong\b|\bbreakout\b|\bcanvas\b|highscore|\blevel\b)/ },
  { id: 'backend-api', weight: 5, re: /(\bapis?\b|\brest\b|backend|datenbank|database|\bsqlite\b|\bsql\b|webservice|web-service|microservice|endpunkt|endpoint)/ },
  { id: 'backend-api', weight: 2, re: /(\bserver\b|\bjson\b|\bcrud\b)/ },
  { id: 'web-app', weight: 2, re: /(\bweb|browser|website|webseite|homepage|\bhtml\b|\bcss\b|javascript|typescript|frontend|\bspa\b|landingpage|landing page|formular|\breact\b|\bvue\b|\bsvelte\b)/ },
];

const TIE_ORDER: BuiltinTemplateId[] = ['unity', 'desktop-dotnet', 'web-game', 'backend-api', 'web-app'];

const NAMES: Record<BuiltinTemplateId, string> = {
  'web-game': 'Browserspiel',
  'web-app': 'Webanwendung',
  unity: 'Unity-Projekt',
  'desktop-dotnet': 'Windows-Desktop-Anwendung (WPF, .NET 8)',
  'backend-api': 'Backend / API (Node.js)',
  empty: 'Leeres Projekt',
};

function fromTechnologies(techs: string[]): BuiltinTemplateId | null {
  const t = techs.map(normalizeText);
  const has = (re: RegExp) => t.some((x) => re.test(x));
  if (has(/\bunity\b/)) return 'unity';
  if (has(/(wpf|winforms|\.net|dotnet|c#|csharp)/)) return 'desktop-dotnet';
  if (has(/(express|fastify|node\.?js|sqlite|\bapi\b|backend|rest)/)) return 'backend-api';
  if (has(/(phaser|canvas|game|spiel)/)) return 'web-game';
  if (has(/(html|css|javascript|typescript|react|vue|svelte|web)/)) return 'web-app';
  return null;
}

function scoreText(text: string): Map<BuiltinTemplateId, number> {
  const scores = new Map<BuiltinTemplateId, number>();
  for (const rule of RULES) {
    if (rule.re.test(text)) scores.set(rule.id, (scores.get(rule.id) ?? 0) + rule.weight);
  }
  return scores;
}

function best(scores: Map<BuiltinTemplateId, number>, allowed?: BuiltinTemplateId[]): BuiltinTemplateId | null {
  let winner: BuiltinTemplateId | null = null;
  let top = 0;
  for (const id of TIE_ORDER) {
    if (allowed && !allowed.includes(id)) continue;
    const s = scores.get(id) ?? 0;
    if (s > top) {
      top = s;
      winner = id;
    }
  }
  return winner;
}

export function templateDisplayName(id: BuiltinTemplateId): string {
  return NAMES[id];
}

export function chooseTemplate(input: TemplateChoiceInput): TemplateChoice {
  const text = normalizeText([input.name, input.description, ...Object.entries(input.answers).map(([k, v]) => `${k} ${v}`)].join('\n'));
  const scores = scoreText(text);

  const byTech = fromTechnologies(input.technologies);
  if (byTech) {
    // Technologies are explicit, but a web technology list plus clear game wording still means a browser game.
    if (byTech === 'web-app' && (scores.get('web-game') ?? 0) > 0) {
      return { templateId: 'web-game', reason: 'Gewählt, weil Web-Technologien angegeben sind und die Beschreibung ein Spiel beschreibt.' };
    }
    return { templateId: byTech, reason: `Gewählt anhand der angegebenen Technologien (${input.technologies.join(', ')}).` };
  }

  switch (input.kind) {
    case 'unity':
      return { templateId: 'unity', reason: 'Gewählt, weil als Projektart Unity angegeben ist.' };
    case 'desktop':
      return { templateId: 'desktop-dotnet', reason: 'Gewählt, weil als Projektart Desktop angegeben ist.' };
    case 'backend':
      return { templateId: 'backend-api', reason: 'Gewählt, weil als Projektart Backend angegeben ist.' };
    case 'web': {
      const game = (scores.get('web-game') ?? 0) > 0;
      return game
        ? { templateId: 'web-game', reason: 'Gewählt, weil als Projektart Web angegeben ist und die Beschreibung ein Spiel beschreibt.' }
        : { templateId: 'web-app', reason: 'Gewählt, weil als Projektart Web angegeben ist.' };
    }
    case 'godot':
    case 'unreal':
    case 'generic':
      return { templateId: 'empty', reason: 'Für diese Projektart gibt es keine eigene Vorlage; es wird ein leeres Projekt mit README angelegt.' };
    default:
      break;
  }

  const winner = best(scores);
  if (!winner) {
    return { templateId: 'web-app', reason: 'Keine eindeutigen Hinweise in der Beschreibung – als Standard wurde eine Webanwendung gewählt.' };
  }
  return { templateId: winner, reason: `Gewählt anhand der Beschreibung (Hinweise auf „${NAMES[winner]}“).` };
}
