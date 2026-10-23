// Pure helpers of the 3D-Werkstatt (SPEC-3D): engine state, create blockers, GPU advice, names, image checks and
// base64 decoding. No React and no data access here, so everything is unit-testable.
import { CircleCheck, CircleX, PowerOff, TriangleAlert } from 'lucide-react';
import type { ThreeDEngineStatus, ThreeDGenerator, ThreeDJob, ThreeDModel, ThreeDQuality } from '@shared/schemas';
import type { EnumMeta, Tone } from '../../lib/labels';
import { formatBytes } from '../../lib/format';

export const COMFYUI_INTEGRATION_ID = 'comfyui';
export const COMFYUI_DOWNLOAD_URL = 'https://www.comfy.org/download';
export const COMFYUI_UPDATE_GUIDE_URL = 'https://docs.comfy.org/installation/update_comfyui';
/** Poll interval while ComfyUI is not running (turns green soon after the user starts it). */
export const ENGINE_POLL_MS = 10_000;
/** Largest image the daemon accepts (contract: ≤ 20 MB, base64 ≤ 28 000 000 characters). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_NAME_LENGTH = 80;
const GiB = 1024 ** 3;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type EngineState = 'missing' | 'stopped' | 'outdated' | 'ready';

/** Running beats "installed": a portable ComfyUI that NOVA did not find on disk still counts when its API answers. */
export function engineState(s: Pick<ThreeDEngineStatus, 'installed' | 'running' | 'supports3d'>): EngineState {
  if (s.running) return s.supports3d ? 'ready' : 'outdated';
  return s.installed ? 'stopped' : 'missing';
}

export const ENGINE_STATE: Record<EngineState, EnumMeta> = {
  missing: { label: 'Nicht installiert', tone: 'danger', icon: CircleX, description: 'ComfyUI wurde auf diesem PC nicht gefunden.' },
  stopped: { label: 'Nicht gestartet', tone: 'warning', icon: PowerOff, description: 'ComfyUI ist installiert, antwortet aber nicht.' },
  outdated: { label: 'Zu alt', tone: 'warning', icon: TriangleAlert, description: 'Diese ComfyUI-Version kennt die 3D-Bausteine noch nicht.' },
  ready: { label: 'Läuft', tone: 'success', icon: CircleCheck, description: 'ComfyUI ist bereit für 3D-Modelle.' },
};

export interface GpuAdvice {
  tone: Tone;
  label: string;
  text: string;
}

/** Honest guide from SPEC-3D §3: 16 GB NVIDIA recommended, 8 GB slower, AMD/Intel/CPU very slow or unsupported. */
export function gpuAdvice(gpu: ThreeDEngineStatus['gpu']): GpuAdvice {
  if (!gpu) {
    return { tone: 'warning', label: 'Keine Grafikkarte erkannt', text: 'ComfyUI meldet keine Grafikkarte. Auf dem Prozessor ist die 3D-Erzeugung sehr langsam oder nicht möglich.' };
  }
  const nvidia = /nvidia|geforce|rtx|quadro|tesla/i.test(gpu.name);
  if (!nvidia) {
    return { tone: 'warning', label: 'Sehr langsam oder nicht unterstützt', text: 'Die 3D-Modelle sind für NVIDIA-Grafikkarten gebaut. Mit AMD- oder Intel-Grafik ist die Erzeugung sehr langsam oder nicht möglich.' };
  }
  const total = gpu.vramTotalBytes;
  if (total == null) return { tone: 'neutral', label: 'Grafikspeicher unbekannt', text: 'Empfohlen sind 16 GB Grafikspeicher, mit 8 GB geht es langsamer.' };
  if (total >= 15.5 * GiB) return { tone: 'success', label: 'Gut geeignet', text: `${formatBytes(total)} Grafikspeicher reichen für alle Qualitätsstufen.` };
  if (total >= 7.5 * GiB) return { tone: 'warning', label: 'Geht, aber langsamer', text: `Mit ${formatBytes(total)} Grafikspeicher lagert ComfyUI Teile aus. Das dauert länger; „Entwurf“ oder „Standard“ wählen.` };
  return { tone: 'danger', label: 'Zu wenig Grafikspeicher', text: `${formatBytes(total)} Grafikspeicher sind sehr knapp. Die Erzeugung schlägt wahrscheinlich fehl oder ist sehr langsam.` };
}

/** VRAM guide text shown on the models card (SPEC-3D §3). */
export const VRAM_GUIDE_TEXT =
  'Beim Erzeugen brauchen TRELLIS.2 und Pixal3D etwa 8–10 GB Grafikspeicher, Z-Image Turbo etwa 10–12 GB. Empfohlen ist eine NVIDIA-Grafikkarte mit 16 GB; mit 8 GB geht es langsamer. Mit AMD- oder Intel-Grafik oder nur dem Prozessor ist es sehr langsam oder nicht möglich.';

// ---------------------------------------------------------------------------
// Creating jobs
// ---------------------------------------------------------------------------

/** Rough duration per quality on a 16 GB NVIDIA card (shown with "(geschätzt)"). */
export const QUALITY_TIME: Record<ThreeDQuality, string> = {
  draft: 'etwa 1–3 Min.',
  standard: 'etwa 3–6 Min.',
  high: 'etwa 8–15 Min.',
};

/** Time hint for the chosen quality and mode. */
export function timeHint(quality: ThreeDQuality, mode: ThreeDJob['mode']): string {
  return `Dauer: ${QUALITY_TIME[quality]}${mode === 'text' ? ' plus etwa 1 Min. für das Bild' : ''} (geschätzt, mit 16-GB-Grafikkarte). Der erste Auftrag dauert länger, weil ComfyUI die Modelle lädt.`;
}

export interface CreateBlocker {
  reason: string;
  /** Where the user fixes it: the engine card on this page or the 3D models card on the models page. */
  target: 'engine' | 'models';
}

/**
 * Why "3D-Modell erzeugen" is not possible right now (null = possible). Unknown data (still loading, load failed)
 * never blocks – the daemon checks again and answers with a German error.
 */
export function createBlocker(status: ThreeDEngineStatus | undefined, models: ThreeDModel[] | undefined, mode: ThreeDJob['mode'], generator: ThreeDGenerator): CreateBlocker | null {
  if (status) {
    const state = engineState(status);
    if (state === 'missing') return { reason: 'ComfyUI ist nicht installiert. Oben steht, wie es eingerichtet wird.', target: 'engine' };
    if (state === 'stopped') return { reason: 'ComfyUI läuft nicht. Bitte ComfyUI starten.', target: 'engine' };
    if (state === 'outdated') return { reason: 'Diese ComfyUI-Version kann noch keine 3D-Modelle erzeugen. Bitte ComfyUI aktualisieren.', target: 'engine' };
  }
  if (models) {
    const gen = models.find((m) => m.id === generator);
    if (gen && !gen.installed) return { reason: `${gen.name} ist noch nicht heruntergeladen.`, target: 'models' };
    const image = models.find((m) => m.id === 'z_image_turbo');
    if (mode === 'text' && image && !image.installed) return { reason: `Für „Text zu 3D“ fehlt noch das Bildmodell ${image.name}.`, target: 'models' };
  }
  return null;
}

const STOP_WORDS = new Set(['ein', 'eine', 'einer', 'eines', 'einem', 'einen', 'der', 'die', 'das', 'den', 'dem', 'des', 'mit', 'und', 'aus', 'im', 'in', 'von', 'vom', 'zum', 'zur', 'auf', 'fuer', 'a', 'an', 'the', 'with', 'of', 'and']);

/** File-name friendly base name from a description or an image file name ("Eine alte Holzkiste" → "alte-holzkiste"). */
export function suggestName(text: string): string {
  const words = text
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return words.slice(0, 3).join('-').slice(0, 40).replace(/-+$/, '');
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** German problem with a base file name, or undefined when it is fine. */
export function validateName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'Bitte einen Namen eingeben.';
  if (n.length > MAX_NAME_LENGTH) return `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`;
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(n)) return 'Diese Zeichen sind in Dateinamen nicht erlaubt: < > : " / \\ | ? *';
  if (/[. ]$/.test(n)) return 'Der Name darf nicht mit einem Punkt oder Leerzeichen enden.';
  if (RESERVED_NAMES.test(n)) return 'Dieser Name ist unter Windows reserviert.';
  return undefined;
}

/** Project-relative path of the result ("assets/3d/holzkiste.glb"). */
export function outputPreview(folder: string, name: string): string {
  const f = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return f ? `${f}/${name}.glb` : `${name}.glb`;
}

/** Inserts or replaces a job (event payloads) and keeps the newest first. */
export function upsertJob(list: ThreeDJob[] | undefined, job: ThreeDJob): ThreeDJob[] {
  const rest = (list ?? []).filter((j) => j.id !== job.id);
  return [job, ...rest].sort((a, b) => b.createdAt - a.createdAt);
}

export const isActiveJob = (j: Pick<ThreeDJob, 'status'>) => j.status === 'queued' || j.status === 'running';

/** Job that the result view shows first: a running job, else the newest finished one. */
export function defaultJobSelection(jobs: ThreeDJob[]): string | null {
  return jobs.find((j) => j.status === 'running')?.id ?? jobs.find((j) => j.status === 'done')?.id ?? jobs[0]?.id ?? null;
}

/** Files of `model` that no OTHER installed model needs – what deleteModel removes (for the confirmation text). */
export function filesFreedByDelete(model: ThreeDModel, all: ThreeDModel[]): ThreeDModel['files'] {
  const needed = new Set(all.filter((m) => m.id !== model.id && m.installed).flatMap((m) => m.files.map((f) => `${f.folder}/${f.name}`)));
  return model.files.filter((f) => f.present && !needed.has(`${f.folder}/${f.name}`));
}

// ---------------------------------------------------------------------------
// Images and base64
// ---------------------------------------------------------------------------

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Image type from the first bytes (PNG, JPEG, WebP – the formats the daemon accepts). */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Decoded byte length of base64 text (without decoding it). */
export function base64ByteLength(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - pad;
}

type Base64Uint8 = typeof Uint8Array & { fromBase64?: (s: string) => Uint8Array };

/**
 * base64 → bytes. Uses Uint8Array.fromBase64 where available (Chromium 140+), otherwise decodes in chunks so a
 * 150 MB model never needs one giant intermediate string.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const native = (Uint8Array as Base64Uint8).fromBase64;
  if (typeof native === 'function') return native.call(Uint8Array, clean);
  const out = new Uint8Array(base64ByteLength(clean));
  const CHUNK = 4 * 256 * 1024; // multiple of 4 → every chunk decodes on its own
  let offset = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const bin = atob(clean.slice(i, i + CHUNK));
    for (let k = 0; k < bin.length; k++) out[offset + k] = bin.charCodeAt(k);
    offset += bin.length;
  }
  return out;
}

/** ArrayBuffer of exactly the decoded bytes (three.js loaders want an ArrayBuffer). */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bytes = base64ToBytes(b64);
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes.buffer as ArrayBuffer) : (bytes.slice().buffer as ArrayBuffer);
}

export interface PickedImage {
  /** base64 without the data: prefix (contract field imageBase64). */
  base64: string;
  mimeType: ImageMime;
  sizeBytes: number;
  name: string;
  /** The original file (preview via object URL). */
  blob?: Blob;
}

export class ImageCheckError extends Error {}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** Reads a chosen, dropped or pasted image and checks size and format like the daemon does. */
export async function readImageFile(file: File): Promise<PickedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageCheckError(`Das Bild ist ${formatBytes(file.size)} groß. Erlaubt sind höchstens 20 MB.`);
  if (file.size === 0) throw new ImageCheckError('Die Datei ist leer.');
  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    throw new ImageCheckError('Das Bild konnte nicht gelesen werden.');
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const mimeType = sniffImageType(base64ToBytes(base64.slice(0, 24)));
  if (!mimeType) throw new ImageCheckError('Dieses Format wird nicht unterstützt. Bitte ein PNG-, JPEG- oder WebP-Bild wählen.');
  return { base64, mimeType, sizeBytes: file.size, name: file.name || 'Bild aus der Zwischenablage', blob: file };
}
