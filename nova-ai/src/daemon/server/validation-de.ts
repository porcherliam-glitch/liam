// Plain-language German texts for zod validation issues (RPC params) without touching zod's global config.
// Key decisions:
// - Used as a per-parse error map (`schema.safeParse(x, { error: germanErrorMap })`): schema-level messages that are
//   already German (e.g. "Ungültige Git-Referenz.") keep precedence, everything else gets a German text here.
// - The same function formats final issues of ZodErrors thrown inside handlers; English zod default messages are
//   replaced, custom messages are kept.
// - No jargon: "Text erwartet, Zahl erhalten." instead of "expected string, received number".

type IssueLike = Record<string, unknown> & { code?: unknown; path?: unknown; message?: unknown };

const TYPE_NAMES: Record<string, string> = {
  string: 'Text',
  number: 'Zahl',
  int: 'ganze Zahl',
  bigint: 'ganze Zahl',
  boolean: 'Ja/Nein-Wert',
  object: 'Objekt',
  record: 'Objekt',
  array: 'Liste',
  tuple: 'Liste',
  null: 'leerer Wert (null)',
  undefined: 'keine Angabe',
  date: 'Datum',
  nan: 'keine gültige Zahl',
  function: 'Funktion',
  symbol: 'Symbol',
  map: 'Zuordnung',
  set: 'Menge',
  file: 'Datei',
  literal: 'fester Wert',
  enum: 'Auswahlwert',
};

function typeName(t: unknown): string {
  return typeof t === 'string' ? (TYPE_NAMES[t] ?? t) : 'Wert';
}

function receivedType(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  if (typeof input === 'number') return Number.isNaN(input) ? 'nan' : 'number';
  if (input instanceof Date) return 'date';
  return typeof input;
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return `„${v}“`;
  if (typeof v === 'bigint') return v.toString();
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function num(v: unknown): string {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : v > 0 ? 'unendlich' : '-unendlich';
  return String(v);
}

function sizeText(issue: IssueLike, small: boolean): string {
  const origin = issue.origin;
  const limit = small ? issue.minimum : issue.maximum;
  const inclusive = issue.inclusive !== false;
  const exact = issue.exact === true;
  switch (origin) {
    case 'string':
      if (exact) return `Genau ${num(limit)} Zeichen erforderlich.`;
      if (small) return Number(limit) <= 1 ? 'Darf nicht leer sein.' : `Mindestens ${num(limit)} Zeichen erforderlich.`;
      return `Höchstens ${num(limit)} Zeichen erlaubt.`;
    case 'array':
    case 'set':
    case 'map':
      if (exact) return `Genau ${num(limit)} Einträge erforderlich.`;
      if (small) return Number(limit) <= 1 ? 'Mindestens ein Eintrag erforderlich.' : `Mindestens ${num(limit)} Einträge erforderlich.`;
      return `Höchstens ${num(limit)} Einträge erlaubt.`;
    case 'number':
    case 'int':
    case 'bigint':
      if (small) return inclusive ? `Muss mindestens ${num(limit)} sein.` : `Muss größer als ${num(limit)} sein.`;
      return inclusive ? `Darf höchstens ${num(limit)} sein.` : `Muss kleiner als ${num(limit)} sein.`;
    case 'date':
      return small ? 'Das Datum liegt zu früh.' : 'Das Datum liegt zu spät.';
    case 'file':
      return small ? 'Die Datei ist zu klein.' : 'Die Datei ist zu groß.';
    default:
      return small ? 'Der Wert ist zu klein.' : 'Der Wert ist zu groß.';
  }
}

function formatText(issue: IssueLike): string {
  switch (issue.format) {
    case 'url':
      return 'Ungültige Internetadresse (URL).';
    case 'email':
      return 'Ungültige E-Mail-Adresse.';
    case 'starts_with':
      return `Muss mit ${formatValue(issue.prefix)} beginnen.`;
    case 'ends_with':
      return `Muss mit ${formatValue(issue.suffix)} enden.`;
    case 'includes':
      return `Muss ${formatValue(issue.includes)} enthalten.`;
    case 'datetime':
    case 'date':
    case 'time':
      return 'Ungültiges Datums- oder Zeitformat.';
    case 'uuid':
    case 'guid':
      return 'Ungültige Kennung.';
    default:
      return 'Ungültiges Format.';
  }
}

/** German message for one zod issue (raw issue during parsing or final issue). */
export function germanIssueMessage(issue: IssueLike): string {
  switch (issue.code) {
    case 'invalid_type': {
      const hasInput = Object.prototype.hasOwnProperty.call(issue, 'input');
      if (hasInput && issue.input === undefined) return 'Angabe fehlt.';
      const expected = typeName(issue.expected);
      return hasInput ? `${expected} erwartet, ${typeName(receivedType(issue.input))} erhalten.` : `${expected} erwartet.`;
    }
    case 'too_small':
      return sizeText(issue, true);
    case 'too_big':
      return sizeText(issue, false);
    case 'invalid_format':
      return formatText(issue);
    case 'not_multiple_of':
      return `Muss ein Vielfaches von ${num(issue.divisor)} sein.`;
    case 'invalid_value': {
      const values = Array.isArray(issue.values) ? issue.values : [];
      if (values.length === 1) return `Erwartet wird ${formatValue(values[0])}.`;
      const shown = values.slice(0, 12).map(formatValue).join(', ');
      return values.length > 0 ? `Ungültiger Wert. Erlaubt: ${shown}${values.length > 12 ? ', …' : ''}.` : 'Ungültiger Wert.';
    }
    case 'unrecognized_keys': {
      const keys = Array.isArray(issue.keys) ? issue.keys.map(String) : [];
      return keys.length === 1 ? `Unbekanntes Feld: ${keys[0]}.` : `Unbekannte Felder: ${keys.join(', ')}.`;
    }
    case 'invalid_union':
      return 'Ungültige Eingabe (keine der erlaubten Varianten passt).';
    case 'invalid_key':
      return 'Ungültiger Schlüssel.';
    case 'invalid_element':
      return 'Ungültiger Eintrag.';
    case 'custom':
      return typeof issue.message === 'string' && issue.message.length > 0 && !isEnglishDefault(issue.message) ? issue.message : 'Ungültige Eingabe.';
    default:
      return 'Ungültige Eingabe.';
  }
}

const ENGLISH_DEFAULT = /^(Invalid|Too (small|big)|Unrecognized|Expected|Required|Number must|String must|Array must)/;

function isEnglishDefault(message: string): boolean {
  return ENGLISH_DEFAULT.test(message);
}

/** Per-parse error map (zod v4 signature: returns a message string). */
export function germanErrorMap(issue: unknown): string {
  return germanIssueMessage((issue ?? {}) as IssueLike);
}

/** Path like `config.commands[0].name`; empty for the root. */
export function formatIssuePath(path: unknown): string {
  if (!Array.isArray(path)) return '';
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out.length === 0 ? String(seg) : `.${String(seg)}`;
  }
  return out;
}

export interface GermanIssue {
  path: string;
  message: string;
}

/** Converts final zod issues into German entries (keeps custom German messages, replaces English defaults). */
export function toGermanIssues(issues: readonly unknown[]): GermanIssue[] {
  return issues.map((raw) => {
    const issue = (raw ?? {}) as IssueLike;
    const given = typeof issue.message === 'string' ? issue.message : '';
    const message = given && !isEnglishDefault(given) ? given : germanIssueMessage(issue);
    return { path: formatIssuePath(issue.path), message };
  });
}

/** One-line German summary: "Die Eingabe ist ungültig: id: Text erwartet, Zahl erhalten." */
export function summarizeIssues(issues: GermanIssue[], prefix = 'Die Eingabe ist ungültig'): string {
  const shown = issues.slice(0, 5).map((i) => (i.path ? `${i.path}: ${i.message}` : i.message));
  const more = issues.length > 5 ? ` (und ${issues.length - 5} weitere Fehler)` : '';
  return `${prefix}: ${shown.join(' ')}${more}`;
}
