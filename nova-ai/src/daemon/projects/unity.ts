// Unity helpers shared by the Unity template, the detector and the CheckService.
// Key decisions:
// - Commands embed the editor executable in quotes; CheckService re-resolves the editor that matches the project's
//   ProjectSettings/ProjectVersion.txt right before running (an upgraded/missing editor never runs the wrong version).
// - EditMode tests write NUnit XML to TestResults/editmode.xml; Unity's exit codes: 0 = all passed, 2 = failures,
//   3 = run error. `-logFile -` streams the editor log to stdout.
// - "Project is open in Unity": Unity holds Temp/UnityLockfile exclusively on Windows (open → EBUSY/EPERM). On other
//   platforms the file's existence is used (Unity deletes Temp/ on a clean exit; a crash leaves it behind – honest
//   limitation, documented).
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const UNITY_RESULTS_FILE = 'TestResults/editmode.xml';
/** Build script written by the Unity template (Assets/Editor/NovaBuild.cs). */
export const NOVA_BUILD_SCRIPT = 'Assets/Editor/NovaBuild.cs';

function quoteExe(exe: string): string {
  return `"${exe.replace(/"/g, '')}"`;
}

export function unityTestCommand(exe: string): string {
  return `${quoteExe(exe)} -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults ${UNITY_RESULTS_FILE} -logFile -`;
}

/** Windows player build: NovaBuild.BuildWindows when the template script exists, else Unity's built-in switch. */
export function unityPackageCommand(exe: string, opts: { novaBuildScript: boolean; productName: string }): string {
  if (opts.novaBuildScript) return `${quoteExe(exe)} -batchmode -nographics -quit -projectPath . -executeMethod NovaBuild.BuildWindows -logFile -`;
  const safe = opts.productName.replace(/[^A-Za-z0-9_-]+/g, '') || 'Spiel';
  return `${quoteExe(exe)} -batchmode -nographics -quit -projectPath . -buildWindows64Player Builds/Windows/${safe}.exe -logFile -`;
}

/** True for command lines that start the Unity editor in batch mode. */
export function isUnityBatchCommand(command: string): boolean {
  return /-batchmode\b/i.test(command) && /-projectPath\b/i.test(command) && /unity(\.exe)?["']?\s/i.test(command);
}

/** Replaces the leading (quoted or bare) executable of a Unity command line. */
export function replaceUnityExecutable(command: string, exe: string): string {
  const t = command.trim();
  let rest: string;
  if (t.startsWith('"')) {
    const end = t.indexOf('"', 1);
    rest = end === -1 ? '' : t.slice(end + 1);
  } else {
    const sp = t.search(/\s/);
    rest = sp === -1 ? '' : t.slice(sp);
  }
  return `${quoteExe(exe)} ${rest.trim()}`.trim();
}

/** m_EditorVersion from ProjectSettings/ProjectVersion.txt, or null. */
export function readUnityVersion(root: string): string | null {
  try {
    const text = readFileSync(join(root, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8');
    const m = /^m_EditorVersion:\s*(\S+)/m.exec(text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Results file path from a Unity command line (-testResults <path>), relative to the project root. */
export function unityResultsPath(command: string): string | null {
  const m = /-testResults\s+(?:"([^"]+)"|(\S+))/i.exec(command);
  return m ? (m[1] ?? m[2]) : null;
}

/** True when the Unity editor currently has the project open. */
export function isUnityProjectOpen(root: string, platform: NodeJS.Platform): boolean {
  const lock = join(root, 'Temp', 'UnityLockfile');
  if (!existsSync(lock)) return false;
  if (platform !== 'win32') return true;
  try {
    const fd = openSync(lock, 'r+');
    closeSync(fd);
    return false;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
  }
}
