// Settings service: one JSON row per section, validated with the shared schema, defaults filled in.
import { SettingsSchema, SETTINGS_SECTIONS, type Settings, type SettingsSection, type SettingsPatch } from '@shared/settings';
import type { Db } from '../db/database';
import type { EventBus } from './bus';
import { validation } from './errors';

export class SettingsService {
  private cache: Settings | null = null;
  private listeners = new Set<(s: Settings, changed: SettingsSection[]) => void>();

  constructor(private db: Db, private bus: EventBus | null) {}

  get(): Settings {
    if (this.cache) return this.cache;
    const rows = this.db.all<{ section: string; value: string }>('SELECT section, value FROM settings');
    const raw: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        raw[r.section] = JSON.parse(r.value);
      } catch {
        /* corrupt section -> defaults */
      }
    }
    const parsed = SettingsSchema.safeParse(raw);
    if (parsed.success) {
      this.cache = parsed.data;
    } else {
      // Fall back section by section so one bad value does not reset everything.
      const fixed: Record<string, unknown> = {};
      for (const section of SETTINGS_SECTIONS) {
        const one = SettingsSchema.shape[section].safeParse(raw[section]);
        fixed[section] = one.success ? one.data : undefined;
      }
      this.cache = SettingsSchema.parse(fixed);
    }
    return this.cache;
  }

  section<K extends SettingsSection>(key: K): Settings[K] {
    return this.get()[key];
  }

  /** Merge a partial patch. Unknown sections are rejected, values are validated. */
  update(patch: SettingsPatch | Record<string, Record<string, unknown>>): Settings {
    const current = this.get();
    const next: Record<string, unknown> = { ...current };
    const changed: SettingsSection[] = [];
    for (const [section, values] of Object.entries(patch)) {
      if (!SETTINGS_SECTIONS.includes(section as SettingsSection)) throw validation(`Unbekannter Einstellungsbereich: ${section}`);
      if (!values || typeof values !== 'object') continue;
      next[section] = { ...(current as Record<string, Record<string, unknown>>)[section], ...values };
      changed.push(section as SettingsSection);
    }
    const parsed = SettingsSchema.safeParse(next);
    if (!parsed.success) {
      throw validation('Ungültige Einstellungen: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), parsed.error.issues);
    }
    const now = Date.now();
    this.db.transaction(() => {
      for (const section of changed) {
        this.db.run(
          'INSERT INTO settings(section, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(section) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          [section, JSON.stringify(parsed.data[section]), now],
        );
      }
    });
    this.cache = parsed.data;
    for (const l of this.listeners) l(parsed.data, changed);
    this.bus?.emit('settings.updated', parsed.data);
    return parsed.data;
  }

  onChange(listener: (s: Settings, changed: SettingsSection[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
