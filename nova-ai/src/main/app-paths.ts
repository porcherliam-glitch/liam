// File locations of the Electron app itself (not the data dir): daemon bundle, renderer, preload and icons.
// Key decisions:
// - Development (unpackaged): everything comes from <appPath>/out/… and <appPath>/build/….
// - Packaged: the renderer, main and preload live inside app.asar (Electron's patched fs reads them); the daemon is
//   unpacked (`asarUnpack: out/daemon/**`) because a separate Node process (ELECTRON_RUN_AS_NODE=1) must be able to
//   load it from disk: <resources>/app.asar.unpacked/out/daemon/index.cjs. Icons are copied next to app.asar via
//   `extraResources` (build/ is not part of the packaged files).
// - Pure (no Electron import) and platform-aware joins, so Windows layouts are testable on Linux.
import { posix, win32 } from 'node:path';

export interface AppPathInputs {
  /** app.getAppPath(): the project dir in development, <resources>/app.asar when packaged. */
  appPath: string;
  /** process.resourcesPath */
  resourcesPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
}

export interface AppPaths {
  daemonEntry: string;
  rendererRoot: string;
  preload: string;
  /** Icon for the tray (ICO on Windows: contains 16/32/48/256 px). */
  trayIcon: string;
  /** Window icon (PNG; Windows uses the exe icon anyway). */
  windowIcon: string;
}

export function resolveAppPaths(i: AppPathInputs): AppPaths {
  const p = i.platform === 'win32' ? win32 : posix;
  const asar = i.isPackaged && /\.asar$/i.test(i.appPath);
  const unpackedRoot = asar ? p.join(p.dirname(i.appPath), 'app.asar.unpacked') : i.appPath;
  const iconDir = i.isPackaged ? i.resourcesPath : p.join(i.appPath, 'build');
  return {
    daemonEntry: p.join(unpackedRoot, 'out', 'daemon', 'index.cjs'),
    rendererRoot: p.join(i.appPath, 'out', 'renderer'),
    preload: p.join(i.appPath, 'out', 'preload', 'index.cjs'),
    trayIcon: p.join(iconDir, i.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    windowIcon: p.join(iconDir, 'icon.png'),
  };
}
