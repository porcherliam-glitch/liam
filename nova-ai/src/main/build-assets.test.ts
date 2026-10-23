// Sanity checks of the packaging assets owned by the main module: generated icons (reproducible, valid PNG/ICO),
// the NSIS include script and the security-relevant electron-builder settings.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { AUTOSTART_NAME } from './autostart';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel));

interface PngInfo {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  raw: Buffer;
}

function parsePng(buf: Buffer): PngInfo {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let off = 8;
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  let ended = false;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') ended = true;
    off += 12 + len;
  }
  expect(ended).toBe(true);
  expect(ihdr).not.toBeNull();
  return { width: ihdr!.readUInt32BE(0), height: ihdr!.readUInt32BE(4), bitDepth: ihdr![8], colorType: ihdr![9], raw: inflateSync(Buffer.concat(idat)) };
}

describe('icons', () => {
  it('build/icon.png is a valid 512×512 RGBA PNG', () => {
    const png = parsePng(read('build/icon.png'));
    expect(png).toMatchObject({ width: 512, height: 512, bitDepth: 8, colorType: 6 });
    expect(png.raw.length).toBe((512 * 4 + 1) * 512);
  });

  it('build/icon.ico embeds PNGs of 16, 32, 48 and 256 px with a correct directory', () => {
    const ico = read('build/icon.ico');
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBe(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const e = 6 + i * 16;
      const w = ico[e] === 0 ? 256 : ico[e];
      const h = ico[e + 1] === 0 ? 256 : ico[e + 1];
      expect(w).toBe(h);
      expect(ico.readUInt16LE(e + 4)).toBe(1);
      expect(ico.readUInt16LE(e + 6)).toBe(32);
      const size = ico.readUInt32LE(e + 8);
      const offset = ico.readUInt32LE(e + 12);
      const png = parsePng(ico.subarray(offset, offset + size));
      expect(png.width).toBe(w);
      sizes.push(w);
    }
    expect(sizes).toEqual([16, 32, 48, 256]);
  });

  it('scripts/make-icon.mjs reproduces the committed files byte for byte', async () => {
    const mod = (await import(pathToFileURL(join(ROOT, 'scripts', 'make-icon.mjs')).href)) as {
      renderIcon(size: number): Buffer;
      encodePng(rgba: Buffer, w: number, h: number): Buffer;
      encodeIco(images: Array<{ size: number; png: Buffer }>): Buffer;
      crc32(buf: Buffer): number;
    };
    expect(mod.crc32(Buffer.from('IEND', 'ascii'))).toBe(0xae426082);
    expect(mod.encodePng(mod.renderIcon(512), 512, 512).equals(read('build/icon.png'))).toBe(true);
    const ico = mod.encodeIco([16, 32, 48, 256].map((size) => ({ size, png: mod.encodePng(mod.renderIcon(size), size, size) })));
    expect(ico.equals(read('build/icon.ico'))).toBe(true);
    // The artwork: transparent corners, opaque gradient, white letter in the centre band.
    const px = mod.renderIcon(64);
    const at = (x: number, y: number) => [...px.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    expect(at(0, 0)[3]).toBe(0);
    expect(at(32, 4)[3]).toBe(255);
    expect(at(20, 32).slice(0, 3)).toEqual([255, 255, 255]);
  }, 20_000);
});

describe('NSIS include (build/installer.nsh)', () => {
  const raw = read('build/installer.nsh');
  const text = raw.toString('utf8');

  it('is UTF-8 with BOM (German umlauts)', () => {
    expect(raw.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(text).toContain('Desktop-Verknüpfung erstellen?');
  });

  it('defines the hooks electron-builder calls and stops the daemon gracefully', () => {
    for (const macro of ['customInit', 'customInstall', 'customUnInit', 'customUnInstall']) expect(text).toMatch(new RegExp(`!macro ${macro}\\r?\\n`));
    expect(text).toContain(`'"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" --stop-daemon'`);
    expect(text).toMatch(/MessageBox MB_YESNO\|MB_ICONQUESTION "Desktop-Verknüpfung erstellen\?" \/SD IDNO IDYES/);
  });

  it('removes the autostart entry and the desktop shortcut only on a real uninstall', () => {
    expect(text).toContain(`DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${AUTOSTART_NAME}"`);
    expect(text).toContain(`DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" "${AUTOSTART_NAME}"`);
    expect(text).toContain('Delete "$DESKTOP\\${SHORTCUT_NAME}.lnk"');
    expect((text.match(/\$\{IfNot\} \$\{isUpdated\}/g) ?? []).length).toBe(2);
  });

  it('declares no Functions or Vars (unused ones are NSIS warnings = errors)', () => {
    expect(text).not.toMatch(/^\s*Function\b/m);
    expect(text).not.toMatch(/^\s*Var\b/m);
  });
});

describe('electron-builder.yml', () => {
  const yml = read('electron-builder.yml').toString('utf8');
  const has = (line: RegExp) => expect(yml).toMatch(line);

  it('identity, files and unpacked daemon', () => {
    has(/^appId: ai\.nova\.studio$/m);
    has(/^productName: NOVA AI$/m);
    has(/^files:\n {2}- out\/\*\*\n {2}- package\.json$/m);
    has(/^asarUnpack:\n {2}- out\/daemon\/\*\*$/m);
    has(/^publish: null$/m);
  });

  it('fuses: RunAsNode on (daemon), NODE_OPTIONS and inspect off', () => {
    has(/^ {2}runAsNode: true$/m);
    has(/^ {2}enableNodeOptionsEnvironmentVariable: false$/m);
    has(/^ {2}enableNodeCliInspectArguments: false$/m);
    has(/^ {2}grantFileProtocolExtraPrivileges: false$/m);
  });

  it('NSIS per UI-SPEC §5', () => {
    has(/^ {2}oneClick: false$/m);
    has(/^ {2}perMachine: false$/m);
    has(/^ {2}allowToChangeInstallationDirectory: true$/m);
    has(/^ {2}createStartMenuShortcut: true$/m);
    has(/^ {2}createDesktopShortcut: false$/m);
    has(/^ {2}deleteAppDataOnUninstall: false$/m);
    has(/^ {2}include: build\/installer\.nsh$/m);
    has(/^ {2}installerLanguages:\n {4}- de_DE$/m);
    has(/^ {6}arch:\n {8}- x64$/m);
    has(/^linux:\n {2}target:\n {4}- dir$/m);
    expect(yml).not.toMatch(/^\s*signAndEditExecutable:/m);
  });
});
