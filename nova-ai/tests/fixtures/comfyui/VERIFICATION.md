# Verification against a real ComfyUI (2026-10-22)

Proof that NOVA's converter (`src/daemon/threed/workflow.ts`) and client (`src/daemon/threed/comfy-client.ts`) drive a
real ComfyUI: every prompt NOVA builds passed ComfyUI's own `POST /prompt` validation. Real generation with model
weights on a GPU was **not** part of this run (see "Not verified").

## Environment

| Item | Value |
|---|---|
| ComfyUI | fresh clone, commit `1a82e6d01f395b43275c77acd289af1eb7090bb9` (2026-10-21 23:43 -0400, contains `comfy_extras/nodes_trellis2.py`), `system_stats.comfyui_version` **0.42.0** |
| Packages | comfyui-frontend-package 1.57.1, comfyui-workflow-templates 0.11.94, Python 3.12.3, torch 2.14.1+cpu (Linux, no GPU) |
| Start | `python main.py --cpu --listen 127.0.0.1 --port 8188 --disable-auto-launch` (venv and clone outside the project) |
| Template | `src/daemon/threed/workflows/3d_pixal3d_trellis2_image_to_model.json` – JSON-identical to the copy shipped in comfyui-workflow-templates 0.11.94 |
| Model files | **empty** (0 byte) dummy files with the exact catalog names: `diffusion_models/{trellis_2_int8_convrot, pixal3d_int8_convrot, z_image_turbo_int8_convrot}.safetensors`, `clip_vision/dino_v3_L_naf_fp32.safetensors`, `vae/{trellis_2_shape_vae_bf16, trellis_2_texture_vae_bf16, ae}.safetensors`, `background_removal/birefnet.safetensors`, `geometry_estimation/moge_2_vitl_normal_fp16.safetensors`, `text_encoders/qwen_3_4b_fp8_mixed.safetensors` |

Recorded fixtures (same server): `object_info.json` (all 50 node classes of the template and the Z-Image graph; model
combos list the dummy files), `system_stats.json` (trimmed), `history_samples.json` (real `/history` entries).

## What was run

A scratch script (bundled with esbuild, run with Node 22) used only the project code:
`ComfyClient.objectInfo(workflowNodeClasses(template) + TEXT_TO_IMAGE_NODE_CLASSES)` → `uploadImage` →
`buildImageTo3dPrompt` / `buildTextToImagePrompt` → `queuePrompt` → `watch`.

| Prompt | Nodes | `POST /prompt` validation | Execution (expected to fail: empty weights) |
|---|---|---|---|
| image → 3D, TRELLIS.2, draft | 37 | **passed** (HTTP 200, `node_errors: {}`) | `execution_error` at VAELoader #117 (`SafetensorError: header too small`) |
| image → 3D, TRELLIS.2, standard | 37 | **passed** | same |
| image → 3D, TRELLIS.2, high | 37 | **passed** | same |
| image → 3D, Pixal3D, draft | 40 | **passed** | same |
| image → 3D, Pixal3D, standard | 40 | **passed** | same |
| image → 3D, Pixal3D, high | 40 | **passed** | same |
| text → image (Z-Image Turbo) | 10 | **passed** | `execution_error` at VAELoader #8 |
| text → image, client without WebSocket (polling) | 10 | **passed** | same, detected by polling `/history` + `/queue` |
| negative: UNETLoader with a file that does not exist | – | rejected (HTTP 400) | – |

The execution errors arrived through the WebSocket (`/ws?clientId=…`) and through the polling fallback and became the
German error „ComfyUI meldet einen Fehler im Knoten „VAELoader“ (#117): Error while deserializing header: header too
small“ (code `DEPENDENCY_FAILED`). The negative case became „ComfyUI kann den Auftrag nicht starten: Es fehlen
Modelldateien – „gibt_es_nicht.safetensors“ (Ordner „diffusion_models“).“ (code `VALIDATION`, `details.missingModels`).

Also verified on the real server:

- `GET /system_stats` (version, CPU device), `GET /object_info/<class>` for 47 classes (an unknown class is absent),
  `GET /models/diffusion_models` (lists the dummy files), unknown folder → `null`.
- `POST /upload/image` with a Windows-style name `C:\Users\x\Bilder\axe test.png` → stored and returned as
  `nova/axe_test.png`; `GET /view?type=input` returned identical bytes; `LoadImage` accepted the value in validation.
- A weight-free graph (EmptyImage → SaveImage) ran to the end: `watch()` resolved with the history entry,
  `view()` downloaded the PNG.
- Slow weight-free job + a second queued job: `deleteFromQueue` removed the queued one, `interrupt(promptId)` stopped the
  running one → `execution_interrupted` via WebSocket → `CANCELLED` (`details.interrupted`), then `free()`.
- Aborting the caller's `AbortSignal` → `CANCELLED` (ComfyUI untouched).
- Real 3D output: Load3D(cube.obj) → Get3DComponents → MeshSmoothNormals → MeshToFile3D → **Save3DAdvanced** (same
  output tail as the template) produced `outputs["5"] = { "3d": [{ "filename": "job_demo_00001.glb", "subfolder":
  "nova", "type": "output" }], "camera_info": [null], "model_3d_info": [] }` (see `history_samples.json`).

## Findings that shaped the converter (version caveats)

1. **PreviewImage and MaskPreview are pass-through nodes** in this ComfyUI (they return their input). The template routes
   the cropped image (PreviewImage 302), the mask (MaskPreview 303) and all baked textures through them. They are
   bypassed (consumers rewired to the preview input), not just deleted.
2. **Dynamic combos** (`COMFY_DYNAMICCOMBO_V3`): `DecimateMesh.placement_mode` and `RemeshMesh.sign_mode`. The selected
   option's sub-inputs follow in `widgets_values` and must be sent as `"sign_mode.fill"`, `"sign_mode.qef"`.
3. Frontend 1.57 keeps the value slot of **linked widget inputs** in `widgets_values` (e.g. UnwrapMesh.resolution,
   BakeTextureFromVoxel.texture_size, ComfySwitchNode.switch, Pixal3DConditioning.camera_angle_x).
4. `Save3DAdvanced` requires `viewport_state` (type `LOAD_3D`, value `""` in the template): accepted by validation, the
   node treats non-dict values as empty. `ImageCropToMask.background` is a socketless `COLOR` widget.
5. `PrimitiveInt` reports `control_after_generate: "fixed"` (a string), KSampler `true`; both are followed by a control
   value in `widgets_values`.
6. The template bakes textures at 4096 through one `PrimitiveInt` (UnwrapMesh + BakeTextureFromVoxel), normal map 2048,
   AO 1024, 700 000 faces. NOVA replaces these with the preset constants (draft 1024/200 000, standard 2048/700 000,
   high 4096/1 500 000; normal map = texture size, AO = half) clamped to object_info limits.
7. The template uses `ImageCropToMask.pad_factor` 1.1 for both branches; the node docs say 1.0 for TRELLIS.2 and 1.1
   for Pixal3D – NOVA follows the node docs.
8. The model folders `background_removal` and `geometry_estimation` exist only in recent ComfyUI; older versions answer
   `/models/<folder>` with 404 (`listModels` → `null`).
9. `POST /interrupt` accepts `{ "prompt_id": … }` (targeted interrupt); older versions ignore the body (global).
10. Output names: 3D files `<prefix>_00001.glb` (no trailing underscore), images `<prefix>_00001_.png`; SaveImage entries
    carry an extra `metadata` object.
11. Very short prompts can finish before the WebSocket is connected (execution messages are sent only to the socket of
    the `client_id`); `watch()` therefore checks `/history` right after the socket opens.

## Not verified

- Real generation with weights on a GPU (needs an NVIDIA GPU and about 20 GB of model downloads); this is the job of
  `scripts/verify-comfyui.mjs` on the user's PC.
- ComfyUI Desktop on Windows (port 8000) – the API is the same server code.

## Reproduce

```
git clone https://github.com/comfyanonymous/ComfyUI && cd ComfyUI   # commit above or newer
python -m venv venv && venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
# create the empty dummy files listed above under models/<folder>/
venv/bin/python main.py --cpu --listen 127.0.0.1 --port 8188
```

Then build the prompts with `buildImageTo3dPrompt` / `buildTextToImagePrompt` and send them with
`ComfyClient.queuePrompt` (validation passes; execution stops at the first loader because the weights are empty).
