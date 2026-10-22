// Unsaved changes of the settings page. Drafts are kept per field path for the whole page, so switching between
// sections never loses edits; each section saves only its own fields as one settings.update patch.
import { useCallback, useMemo, useState } from 'react';
import { defaultSettings, type Settings, type SettingsPatch } from '@shared/settings';
import { sameValue } from './shared/forms';
import { fromDraftValue, readSetting, toDraftValue, type DraftValue, type FieldDef, type FieldPath } from './fields';

export interface SettingsDraft {
  value: (field: FieldDef) => DraftValue;
  set: (field: FieldDef, value: DraftValue) => void;
  isDirty: (field: FieldDef) => boolean;
  anyDirty: (fields: readonly FieldDef[]) => boolean;
  discard: (fields: readonly FieldDef[]) => void;
  /** Fills the fields with the default values (still needs "Speichern"). */
  applyDefaults: (fields: readonly FieldDef[]) => void;
  /** Patch of the changed fields, or the field errors when a value is invalid. */
  buildPatch: (fields: readonly FieldDef[]) => { patch: SettingsPatch; errors: Record<string, string>; changed: number };
}

export function useSettingsDraft(saved: Settings | undefined): SettingsDraft {
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const defaults = useMemo(() => defaultSettings(), []);

  const savedValue = useCallback((field: FieldDef): DraftValue => (saved ? toDraftValue(field, readSetting(saved, field.path)) : toDraftValue(field, undefined)), [saved]);

  const value = useCallback((field: FieldDef) => (field.path in drafts ? drafts[field.path] : savedValue(field)), [drafts, savedValue]);

  const set = useCallback((field: FieldDef, next: DraftValue) => setDrafts((prev) => ({ ...prev, [field.path]: next })), []);

  const isDirty = useCallback((field: FieldDef) => field.path in drafts && !sameValue(drafts[field.path], savedValue(field)), [drafts, savedValue]);

  const anyDirty = useCallback((fields: readonly FieldDef[]) => fields.some((f) => isDirty(f)), [isDirty]);

  const discard = useCallback((fields: readonly FieldDef[]) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const f of fields) delete next[f.path];
      return next;
    });
  }, []);

  const applyDefaults = useCallback(
    (fields: readonly FieldDef[]) => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const f of fields) next[f.path] = toDraftValue(f, readSetting(defaults, f.path));
        return next;
      });
    },
    [defaults],
  );

  const buildPatch = useCallback(
    (fields: readonly FieldDef[]) => {
      const patch: Record<string, Record<string, unknown>> = {};
      const errors: Record<string, string> = {};
      let changed = 0;
      for (const f of fields) {
        if (!isDirty(f)) continue;
        const parsed = fromDraftValue(f, drafts[f.path]);
        if (parsed.error !== undefined) {
          errors[f.path] = parsed.error;
          continue;
        }
        const [section, key] = f.path.split('.') as [string, string];
        if (saved && sameValue(parsed.value, readSetting(saved, f.path as FieldPath))) continue;
        (patch[section] ??= {})[key] = parsed.value;
        changed++;
      }
      return { patch: patch as SettingsPatch, errors, changed };
    },
    [drafts, isDirty, saved],
  );

  return { value, set, isDirty, anyDirty, discard, applyDefaults, buildPatch };
}
