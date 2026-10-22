// 3D model catalog of the 3D workshop (docs/SPEC-3D.md §3): the exact files ComfyUI needs for TRELLIS.2, Pixal3D and
// Z-Image Turbo, where they come from (Hugging Face, Comfy-Org repackaged weights), their licenses, and the presence
// check against the ComfyUI models folder.
// Key decisions:
// - Every file is listed once with its ComfyUI sub folder; files shared by two models (DINOv3, the TRELLIS VAEs,
//   BiRefNet) are the SAME entry, so a download never fetches them twice and deleteModel can tell which files another
//   installed model still needs.
// - Sizes and sha256 values were read from the Hugging Face API (paths-info, lfs.oid) on 2026-10-22. Downloads prefer
//   the live values from the API (the repo may update a file) and fall back to these.
// - Presence = a regular, non-empty file at <modelsDir>/<folder>/<name> (".part" leftovers never count). The catalog
//   size is not enforced for presence: an upstream re-upload would otherwise make a correct file look missing.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { ThreeDModel, ThreeDModelFile, ThreeDModelId } from '@shared/schemas';

export interface CatalogFile {
  /** Stable key "<folder>/<name>". */
  key: string;
  folder: string;
  name: string;
  /** Hugging Face repository, e.g. "Comfy-Org/TRELLIS.2". */
  repo: string;
  /** Path inside the repository. */
  repoPath: string;
  url: string;
  sizeBytes: number;
  /** sha256 recorded 2026-10-22 (fallback when the Hugging Face API does not answer). */
  sha256: string | null;
}

export interface CatalogModel {
  id: ThreeDModelId;
  name: string;
  purpose: ThreeDModel['purpose'];
  description: string;
  license: string;
  source: string;
  vramRecommendedBytes: number;
  files: CatalogFile[];
}

const GiB = 1024 ** 3;
const HF = 'https://huggingface.co';

function hfFile(repo: string, repoPath: string, folder: string, sizeBytes: number, sha256: string): CatalogFile {
  const name = repoPath.split('/').pop() as string;
  return {
    key: `${folder}/${name}`,
    folder,
    name,
    repo,
    repoPath,
    url: `${HF}/${repo}/resolve/main/${repoPath.split('/').map(encodeURIComponent).join('/')}`,
    sizeBytes,
    sha256,
  };
}

// Shared files (TRELLIS.2 and Pixal3D).
const DINO = hfFile('Comfy-Org/Pixal3D', 'clip_vision/dino_v3_L_naf_fp32.safetensors', 'clip_vision', 1_215_214_176, '4ad2ec4e0879a5b5b04cd97325cc37da954a7b6edca5170b86510f17f2b2290f');
const SHAPE_VAE = hfFile('Comfy-Org/Pixal3D', 'vae/trellis_2_shape_vae_bf16.safetensors', 'vae', 1_095_844_024, 'de0cb4949a76c59ee5c091a995a69bcc8c51d5aeda939f0c641a50d2a72341f4');
const TEXTURE_VAE = hfFile('Comfy-Org/Pixal3D', 'vae/trellis_2_texture_vae_bf16.safetensors', 'vae', 948_461_364, '714e5ebf094a610e12a8e3b5175c18a62f37f6ea4218acb6073644456b73ab0e');
const BIREFNET = hfFile('Comfy-Org/BiRefNet', 'background_removal/birefnet.safetensors', 'background_removal', 444_473_596, '9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154');

export const THREED_CATALOG: readonly CatalogModel[] = [
  {
    id: 'trellis2',
    name: 'TRELLIS.2',
    purpose: 'image_to_3d',
    description: 'Erzeugt aus einem Bild ein texturiertes 3D-Modell (Standard). Gut für Gegenstände, Figuren und Requisiten.',
    license: 'MIT (TRELLIS.2, BiRefNet)',
    source: 'microsoft/TRELLIS.2-4B',
    vramRecommendedBytes: 10 * GiB,
    files: [
      hfFile('Comfy-Org/TRELLIS.2', 'diffusion_models/trellis_2_int8_convrot.safetensors', 'diffusion_models', 5_253_048_192, 'd01952ad137213f6a868f86b6b877026276f84af5eec23069217475a0bad3a31'),
      DINO,
      SHAPE_VAE,
      TEXTURE_VAE,
      BIREFNET,
    ],
  },
  {
    id: 'pixal3d',
    name: 'Pixal3D',
    purpose: 'image_to_3d',
    description: 'Alternative zu TRELLIS.2 für Bild zu 3D, liefert oft feinere Details. Nutzt zusätzlich eine Tiefenschätzung (MoGe).',
    license: 'MIT (Pixal3D, MoGe, BiRefNet)',
    source: 'TencentARC/Pixal3D',
    vramRecommendedBytes: 10 * GiB,
    files: [
      hfFile('Comfy-Org/Pixal3D', 'diffusion_models/pixal3d_int8_convrot.safetensors', 'diffusion_models', 5_584_555_824, '4621eac3b715484f79303c7152af641fe0b2b14f4d0e3d394fd6922d00f955ec'),
      hfFile('Comfy-Org/MoGe', 'geometry_estimation/moge_2_vitl_normal_fp16.safetensors', 'geometry_estimation', 661_859_924, 'cb1a692d03235671e959e81360d7b4d9f44aefadb1f852d6ca6aa17799d5e31f'),
      DINO,
      SHAPE_VAE,
      TEXTURE_VAE,
      BIREFNET,
    ],
  },
  {
    id: 'z_image_turbo',
    name: 'Z-Image Turbo',
    purpose: 'text_to_image',
    description: 'Erzeugt aus einer Beschreibung zuerst ein Referenzbild. Wird für „Text zu 3D“ gebraucht.',
    license: 'Apache-2.0',
    source: 'Tongyi-MAI/Z-Image-Turbo',
    vramRecommendedBytes: 12 * GiB,
    files: [
      hfFile('Comfy-Org/z_image_turbo', 'split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors', 'diffusion_models', 6_201_001_296, 'be517ebd47c912a5626a588e1aeea43e6be4a43c0cdcd2b48a2a780d9f358635'),
      hfFile('Comfy-Org/z_image_turbo', 'split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors', 'text_encoders', 5_631_994_051, '72450b19758172c5a7273cf7de729d1c17e7f434a104a00167624cba94f68f15'),
      hfFile('Comfy-Org/z_image_turbo', 'split_files/vae/ae.safetensors', 'vae', 335_304_388, 'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38'),
    ],
  },
];

export function catalogModel(id: ThreeDModelId): CatalogModel {
  const m = THREED_CATALOG.find((x) => x.id === id);
  if (!m) throw new Error(`unknown 3D model: ${id}`);
  return m;
}

/** Every distinct file of the catalog (shared files once). */
export function allCatalogFiles(): CatalogFile[] {
  const seen = new Map<string, CatalogFile>();
  for (const m of THREED_CATALOG) for (const f of m.files) if (!seen.has(f.key)) seen.set(f.key, f);
  return [...seen.values()];
}

/** Absolute path of a catalog file inside the models folder. */
export function filePath(modelsDir: string, file: Pick<CatalogFile, 'folder' | 'name'>): string {
  return join(modelsDir, file.folder, file.name);
}

export type FileExists = (absPath: string) => boolean;

/** Regular non-empty file. */
export const regularFileExists: FileExists = (p) => {
  try {
    const st = statSync(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
};

/** Catalog with presence flags (all files missing when the models folder is unknown). */
export function modelsWithPresence(modelsDir: string | null, exists: FileExists = regularFileExists): ThreeDModel[] {
  const present = new Map<string, boolean>();
  const isPresent = (f: CatalogFile): boolean => {
    if (!modelsDir) return false;
    let v = present.get(f.key);
    if (v === undefined) {
      v = exists(filePath(modelsDir, f));
      present.set(f.key, v);
    }
    return v;
  };
  return THREED_CATALOG.map((m) => {
    const files: ThreeDModelFile[] = m.files.map((f) => ({ name: f.name, folder: f.folder, url: f.url, sizeBytes: f.sizeBytes, sha256: f.sha256, present: isPresent(f) }));
    const totalBytes = files.reduce((n, f) => n + f.sizeBytes, 0);
    const missingBytes = files.filter((f) => !f.present).reduce((n, f) => n + f.sizeBytes, 0);
    return {
      id: m.id,
      name: m.name,
      purpose: m.purpose,
      description: m.description,
      license: m.license,
      source: m.source,
      vramRecommendedBytes: m.vramRecommendedBytes,
      files,
      installed: files.every((f) => f.present),
      totalBytes,
      missingBytes,
    };
  });
}

/** Files of `id` that no OTHER installed model needs (what deleteModel may remove). */
export function filesExclusiveTo(id: ThreeDModelId, installedIds: ThreeDModelId[]): CatalogFile[] {
  const others = new Set<string>();
  for (const m of THREED_CATALOG) {
    if (m.id === id || !installedIds.includes(m.id)) continue;
    for (const f of m.files) others.add(f.key);
  }
  return catalogModel(id).files.filter((f) => !others.has(f.key));
}

/** German size, e.g. "5,3 GB", "420 MB", "12 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}
