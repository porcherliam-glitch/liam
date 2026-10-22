// Minimal Semantic Versioning 2.0 parser/comparator for the update check (no dependency).
// Key decisions:
// - Accepts "1.2.3", "v1.2.3", "1.2.3-beta.2", "1.2.3+build.5" (build metadata is ignored for precedence).
// - Precedence per semver.org §11: numeric core first; a version WITH pre-release is lower than the same version
//   without; pre-release identifiers compare numerically when both are numeric, otherwise ASCII, numeric < alphanumeric,
//   and a shorter identifier list is lower when all shared identifiers are equal.
// - Unparsable input returns null (the caller reports it in German instead of guessing).

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  /** Normalized text without a leading "v" and without build metadata. */
  text: string;
}

const SEMVER_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(input: string): SemVer | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 256) return null;
  const m = SEMVER_RE.exec(raw);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  const prerelease = m[4] ? m[4].split('.') : [];
  return { major, minor, patch, prerelease, text: `${major}.${minor}.${patch}${prerelease.length ? `-${prerelease.join('.')}` : ''}` };
}

function compareIdentifiers(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) {
    const d = Number(a) - Number(b);
    return d === 0 ? 0 : d > 0 ? 1 : -1;
  }
  if (an) return -1;
  if (bn) return 1;
  return a === b ? 0 : a > b ? 1 : -1;
}

/** >0 when a is newer than b, <0 when older, 0 when equal precedence. */
export function compareSemver(a: SemVer, b: SemVer): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const n = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < n; i++) {
    const d = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (d !== 0) return d;
  }
  return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length > b.prerelease.length ? 1 : -1;
}
