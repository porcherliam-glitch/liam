# NOVA AI – 3D-Werkstatt (local text → 3D and image → 3D)

Status: binding engineering spec for the 3D workshop, written 2026-10-22. It extends `docs/SPEC.md` (global rules §3,
honest limits §6.0 apply). Customer wish (German): an extra slot for 3D models – local AI models only for 3D, so the
user can turn text or an image into a 3D model. UI texts German, code/comments English.

## 1. What the user gets

- New page **„3D-Werkstatt“** (route `#/threed`, nav group "Arbeit" after "Freigaben", lucide icon `Box`) with two
  modes: **„Text zu 3D“** (description → reference image → 3D model) and **„Bild zu 3D“** (own image → 3D model).
  Result: a textured `.glb` (PBR materials) saved into the chosen project (`settings.threeD.outputFolder`, default
  `assets/3d/<name>.glb`, plus `<name>.png` reference image in text mode) or into NOVA's 3D library
  (`<dataDir>/3d/<jobId>/`), with an orbit 3D preview, job list with progress/cancel, "Im Explorer zeigen".
- New card **„3D-Modelle“** on the Models page (the separate "slot"): the 3D models with install state, size,
  license, download with progress/cancel, delete; engine status (ComfyUI) with fix hints; link to the 3D-Werkstatt.
- Settings section `threeD` (see `src/shared/settings.ts` `ThreeDSettingsSchema`), editable on the 3D page
  ("Einstellungen" card) and in Einstellungen (section "3D-Werkstatt").
- Agents can create assets with the tool **`generate_3d_model`** (coder role; only when `threeD.agentsMayGenerate`).

## 2. Engine: ComfyUI (not bundled)

All generation runs in a local **ComfyUI** (GPL-3.0, free; NOVA never bundles or modifies it). ComfyUI ≥ the 2026-08-22
core merge (PR #14718) contains native, dependency-free TRELLIS.2 and Pixal3D nodes (`comfy_extras/nodes_trellis2.py`,
no nvdiffrast/CUDA extensions). Install options shown to the user: ComfyUI Desktop via winget
(`winget install -e --id Comfy.ComfyUI-Desktop`, through the existing integrations install flow with approval kind
`install`) or a manual/portable installation.

- **Integration module `comfyui`** (add `'comfyui'` to `BUILTIN_INTEGRATIONS` in `src/shared/schemas.ts` together with
  the module in `src/daemon/integrations/`, category `ai`): detects the Desktop app and portable installs, install
  hint (winget command + https://www.comfy.org/download), `canOpen` false.
- **Endpoint**: `settings.threeD.engineUrl`, else auto-detect by probing `http://127.0.0.1:8000` (Desktop default) and
  `http://127.0.0.1:8188` (portable/manual default) with `GET /system_stats`. Only local addresses
  (`core/net.ts isLocalEndpoint`); never send anything elsewhere.
- **Models folder** (where NOVA downloads into): `settings.threeD.modelsDir`, else auto-detect: ComfyUI Desktop keeps
  `basePath` in `%APPDATA%\ComfyUI\config.json` (models = `<basePath>\models`), portable = `<install>\ComfyUI\models`.
  If unknown, the UI asks the user to choose the folder (Electron folder dialog). Verify a folder by the presence of
  typical sub folders (`checkpoints`, `vae`, `diffusion_models`).
- **Status** (`ThreeDEngineStatus`): installed/running/version (`/system_stats` → `system.comfyui_version`), GPU from
  `/system_stats` devices (name, vram_total, vram_free), `supports3d` = `/object_info/Trellis2ShapeStage` exists,
  German message with the next step (install, start ComfyUI, update ComfyUI, choose models folder, download models).

## 3. Model catalog (exact files; all licenses verified 2026-10-22)

| id | purpose | files (`folder/name` – size) | source / license |
|---|---|---|---|
| `trellis2` | image → 3D (default) | `diffusion_models/trellis_2_int8_convrot.safetensors` 5 253 048 192 (Comfy-Org/TRELLIS.2) · `clip_vision/dino_v3_L_naf_fp32.safetensors` 1 215 214 176 · `vae/trellis_2_shape_vae_bf16.safetensors` 1 095 844 024 · `vae/trellis_2_texture_vae_bf16.safetensors` 948 461 364 (these three from Comfy-Org/Pixal3D) · `background_removal/birefnet.safetensors` 444 473 596 (Comfy-Org/BiRefNet) | microsoft/TRELLIS.2-4B, MIT; BiRefNet MIT |
| `pixal3d` | image → 3D (alternative, often finer detail) | `diffusion_models/pixal3d_int8_convrot.safetensors` 5 584 555 824 (Comfy-Org/Pixal3D) · `geometry_estimation/moge_2_vitl_normal_fp16.safetensors` 661 859 924 (Comfy-Org/MoGe) · plus the shared dino/VAE/BiRefNet files above | TencentARC/Pixal3D, MIT; MoGe MIT |
| `z_image_turbo` | text → reference image (needed for "Text zu 3D") | `diffusion_models/z_image_turbo_int8_convrot.safetensors` 6 201 001 296 · `text_encoders/qwen_3_4b_fp8_mixed.safetensors` 5 631 994 051 · `vae/ae.safetensors` 335 304 388 (all Comfy-Org/z_image_turbo, `split_files/<folder>/<name>`) | Tongyi-MAI/Z-Image-Turbo, Apache-2.0 |

Download URL pattern: `https://huggingface.co/<repo>/resolve/main/<path>`; repo paths: Comfy-Org/TRELLIS.2
`diffusion_models/…`; Comfy-Org/Pixal3D `diffusion_models/…`, `clip_vision/…`, `vae/…`; Comfy-Org/BiRefNet
`background_removal/…`; Comfy-Org/MoGe `geometry_estimation/…`; Comfy-Org/z_image_turbo `split_files/<folder>/…`.
Hugging Face hosts are not in the default `network.allowedHosts`: a model download needs a `network` approval for
`huggingface.co` (+ its CDN redirect host) the first time unless the user allowed it (the download is user-initiated
from the UI; still go through the approval/host rules, never silently widen them). sha256: take it from the
Hugging Face API (`https://huggingface.co/api/models/<repo>/paths-info/main` or the LFS pointer) when available and verify;
otherwise verify the size. Download to `<name>.part` with HTTP range resume, rename when complete; check free disk space
for the remaining bytes + 1 GB first (`statfs`); operation kind `threed_download` with progress and cancel. Files shared
by two models are downloaded once; `deleteModel` deletes only files no other installed model needs. VRAM guide shown in
the UI: 3D models ≈ 8–10 GB during generation, Z-Image ≈ 10–12 GB; 16 GB NVIDIA recommended, 8 GB works slower with
offloading; AMD/Intel GPUs/CPU: "sehr langsam oder nicht unterstützt" (honest).

## 4. Workflows

**Image → 3D**: NOVA bundles the official MIT-licensed ComfyUI template
`3d_pixal3d_trellis2_image_to_model.json` (Comfy-Org/workflow_templates, copy in
`src/daemon/threed/workflows/` with an attribution header file) – the UI-format workflow. At run time it is converted
to API format:
1. fetch `/object_info/<class>` for every node class used (cache per engine version);
2. drop UI-only nodes (`Note`, `MarkdownNote`, `PreviewImage`, `MaskPreview`, `Preview3DAdvanced`, nodes with mode
   2/4 = muted/bypassed per ComfyUI semantics);
3. resolve `ComfySwitchNode` whose switch is a constant (widget or `PrimitiveBoolean`) by rewiring consumers to the
   selected input – TRELLIS.2 or Pixal3D branch chosen by the job (template: `PrimitiveBoolean` "true = Trellis.2");
4. keep only nodes reachable (upstream) from the chosen output nodes (`Save3DAdvanced`), so files of the other branch
   are not needed;
5. map `widgets_values` to input names in `object_info` order (required then optional; skip inputs that are linked;
   INT inputs named `seed`/`noise_seed` with `control_after_generate` consume an extra widget value);
6. patch parameters: `LoadImage.image` = uploaded file name; KSampler seeds = job seed; quality preset →
   `DecimateMesh` target faces / texture bake sizes (draft: faces 200 000, textures 1024; standard: 700 000/2048;
   high: 1 500 000/4096 – clamp to the node's min/max from object_info); `Save3DAdvanced` filename prefix
   `nova/<jobId>`.
POST `/prompt` validates; `node_errors` → German job error naming the node and the missing file (most common cause:
model files missing → link to the download).

**Text → image** (first step of "Text zu 3D"): a hand-built API graph equivalent to the official template
`image_z_image_turbo_int8`: `UNETLoader(z_image_turbo_int8_convrot.safetensors, default)` →
`ModelSamplingAuraFlow(shift 3)`; `CLIPLoader(qwen_3_4b_fp8_mixed.safetensors, lumina2, default)` →
`CLIPTextEncode(prompt)` → positive, `ConditioningZeroOut` → negative; `EmptySD3LatentImage(1024, 1024, 1)`;
`KSampler(seed, steps 8, cfg 1, res_multistep, simple, denoise 1)`; `VAELoader(ae.safetensors)` → `VAEDecode` →
`SaveImage(nova/<jobId>-ref)`. The user prompt is extended for good 3D input (German or English user text is fine):
`"<prompt>. A single object, centered, complete and fully visible, plain white background, soft even studio
lighting, no text, no shadows."` The generated image becomes the job's `imagePath` and feeds the image → 3D step.

**ComfyUI API used**: `GET /system_stats`, `GET /object_info/{class}`, `POST /upload/image` (multipart, field
`image`, `overwrite=true`, `subfolder=nova`), `POST /prompt {prompt, client_id}` → `{prompt_id, node_errors}`,
`GET /history/{prompt_id}` (outputs: images / 3d files with filename/subfolder/type), `GET /queue`,
`POST /interrupt`, `POST /queue {delete:[id]}`, `POST /free {unload_models:true, free_memory:true}`,
`GET /view?filename=&subfolder=&type=output`, `GET /models/{folder}` (file list), WebSocket `/ws?clientId=<id>` for
`progress {value,max,node,prompt_id}`, `executing`, `execution_error`, `execution_success` (Node ≥ 22 has a global
WebSocket; fall back to polling `/history` every 1 s when the socket fails). Every request has a timeout and an
AbortSignal; generation itself may take minutes (no 300 s fetch limit: use node:http for the long calls or streaming).

## 5. Jobs

- `threed.generate` validates input (`ThreeDGenerateInputSchema`), resolves the image (project-relative paths via
  `s.pathGuard`, base64 → temp file in `<dataDir>/3d/<jobId>/`, PNG/JPEG/WebP only, ≤ 20 MB), checks the needed models
  are installed (else German error with the download hint), stores the job (`threed_jobs`, migration v2), queues it.
- One job at a time (GPU). Phases (German, shown in UI): „Wartet“, „Bild wird erzeugt“, „Bild wird übertragen“,
  „Form wird berechnet“, „Textur wird gebacken“, „Modell wird gespeichert“. Progress from WebSocket per phase,
  overall percentage weighted.
- Before a job, if `threed.unloadLanguageModels`: unload loaded Ollama models (`s.ollama.running()` then
  `POST <ollama>/api/generate {model, keep_alive: 0}`), log it; after the job: `POST /free`. Note in the UI that agents
  may be slower meanwhile.
- Cancel: `/interrupt` if running, `/queue delete` if queued in ComfyUI; job → `cancelled`.
- Output: fetch the `.glb` via `/view` and write it into the project through the change journal (actor `nova`,
  taskId of the job when created by an agent, otherwise `null`; never overwrite an existing user file: add a numeric
  suffix), so it appears in "Änderungen" and can be reverted; without project into the 3D library folder.
- Events `threed.job` on every change, `threed.status` when the status changes, `threed.models.changed` after
  downloads/deletes. Recovery on daemon start: jobs left `queued`/`running` → `failed` „Abgebrochen, weil NOVA neu
  gestartet wurde“. Shutdown: interrupt the running prompt.
- Errors use the NovaError model with German texts (what happened, what to do), e.g. ComfyUI not running, too old,
  model files missing, out of GPU memory (`execution_error` with `OutOfMemoryError`/"out of memory" → hint: close other
  GPU programs, quality „Entwurf“, unload language models).

## 6. Agent tool `generate_3d_model`

Args: `{ description?: string, image?: string (project-relative), name: string, quality?: 'draft'|'standard'|'high',
model?: 'trellis2'|'pixal3d' }` (exactly one of description/image). Not read-only, no approval needed (local, free,
writes only into the project's output folder) but disabled when `agentsMayGenerate` is false or models/engine are
missing (clear tool error text the model can act on). Waits for the job (abortable by the run), returns the
project-relative `.glb` path, size and a German summary. Available to the coder role.

## 7. Testing

- `tests/fakes/fake-comfyui.ts`: scripted fake ComfyUI server (system_stats, object_info subset from the real fixture,
  upload, prompt with validation of model file names against a configurable file list, history, view, queue,
  interrupt, free, models list, WebSocket progress) – clearly a test double, used by daemon tests, the e2e screenshot
  demo and UI development.
- `tests/fixtures/comfyui/object_info.json`: recorded from a REAL ComfyUI (CPU mode, git commit noted in the file) for
  every node class NOVA's workflows use. The converter is tested against the real template + this fixture, and
  verified once against the real ComfyUI's `/prompt` validation (dummy model files) – record that result.
- `scripts/verify-comfyui.mjs` (like `verify-ollama.mjs`): on the user's PC runs a real image → 3D job with the
  installed models and reports honestly.

## 8. Honest limits

- Generation needs a capable GPU; quality depends on the input image (single object, clean background works best).
- "Text zu 3D" is text → image → 3D (no direct text-to-3D model with a license usable in the EU; Hunyuan3D's license
  excludes the EU, UK and South Korea – never offered).
- ComfyUI is a separate program the user installs; NOVA controls it only through its local API.
