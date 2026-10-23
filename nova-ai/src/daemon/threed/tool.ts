// Agent tool generate_3d_model (docs/SPEC-3D.md §6): lets the coder role create a textured .glb asset in the project
// from a description (text → reference image → 3D) or from a project image (image → 3D) through the 3D workshop.
// Key decisions:
// - Not read-only (writes files through the ChangeJournal), no approval: local, free, writes only into the project's
//   output folder (settings threeD.outputFolder) and never overwrites a file (numeric suffix).
// - Disabled with a clear tool error the model can act on when settings threeD.agentsMayGenerate is off, the engine
//   is missing/not running/too old, or model files are missing (codes TOOL_MISSING / MODEL_UNAVAILABLE).
// - The call waits for the job; when the run is aborted the job is cancelled. The result names the project-relative
//   .glb path (and the reference image), the size and a German summary; the files are added to the task.
import { z } from 'zod';
import type { AgentTool, Services } from '../contracts';
import { NovaError, errorMessage, isAbortError } from '../core/errors';
import { formatSize } from './catalog';

const Schema = z
  .object({
    description: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .optional()
      .describe('Text to 3D: what the object looks like (one single object, e.g. "a wooden treasure chest with iron fittings"). German or English. Leave out when you pass image.'),
    image: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe('Image to 3D: project-relative path of a PNG, JPEG or WebP image showing one object on a plain background. Leave out when you pass description.'),
    name: z.string().trim().min(1).max(80).describe('File name of the model without extension, e.g. "treasure-chest". The model is saved as <outputFolder>/<name>.glb.'),
    quality: z.enum(['draft', 'standard', 'high']).optional().describe('draft = fast, fewer faces and 1K textures; standard (default) = 2K textures; high = slow, 4K textures.'),
    model: z.enum(['trellis2', 'pixal3d']).optional().describe('3D generator. trellis2 (default) or pixal3d (often finer detail). Only if installed.'),
  })
  .refine((v) => !!v.description !== !!v.image, { message: 'Provide exactly one of "description" (text to 3D) or "image" (image to 3D).' });

export type Generate3dParams = z.output<typeof Schema>;

const QUALITY_LABEL = { draft: 'Entwurf', standard: 'Standard', high: 'Hoch' } as const;
const MODEL_LABEL = { trellis2: 'TRELLIS.2', pixal3d: 'Pixal3D' } as const;

export function createGenerate3dModelTool(s: Services): AgentTool<Generate3dParams> {
  return {
    name: 'generate_3d_model',
    description:
      'Create a textured 3D model (.glb with PBR materials) for the project with the local 3D workshop (ComfyUI, TRELLIS.2/Pixal3D). Give either a description (text to 3D: NOVA first generates a reference image, then the model) or a project-relative image (image to 3D). Takes several minutes. Returns the project-relative path of the .glb. Use it for game/app assets like props, items or characters.',
    schema: Schema as unknown as z.ZodType<Generate3dParams>,
    readOnly: false,
    describe: (p) => (p.description ? `Erzeugt das 3D-Modell „${p.name}“ aus einer Beschreibung` : `Erzeugt das 3D-Modell „${p.name}“ aus ${p.image}`),
    async execute(p, ctx) {
      if (ctx.signal.aborted) return { status: 'error', code: 'CANCELLED', content: 'Abgebrochen – es wurde kein 3D-Modell erzeugt.' };
      const settings = s.core.settings.section('threeD');
      if (!settings.agentsMayGenerate) {
        return {
          status: 'error',
          code: 'TOOL_MISSING',
          content:
            'Die 3D-Erzeugung durch Agenten ist in den Einstellungen ausgeschaltet (3D-Werkstatt → „Agenten dürfen 3D-Modelle erzeugen“). Bitte ohne 3D-Modell weiterarbeiten (z. B. einen Platzhalter verwenden) und das im Abschlussbericht erwähnen.',
        };
      }
      if (p.image && (/^[A-Za-z]:[\\/]/.test(p.image) || p.image.startsWith('/') || p.image.startsWith('\\'))) {
        return { status: 'error', code: 'VALIDATION', content: `„image“ muss ein Pfad relativ zum Projektordner sein (z. B. "assets/bilder/truhe.png"), nicht „${p.image}“.` };
      }
      let jobId: string | null = null;
      try {
        const status = await s.threed.status(true);
        if (!status.running || !status.supports3d) {
          return { status: 'error', code: 'TOOL_MISSING', content: `3D-Erzeugung nicht möglich: ${status.message} Bitte ohne 3D-Modell weiterarbeiten oder den Blocker im Abschlussbericht nennen.` };
        }
        const job = await s.threed.generate(
          {
            mode: p.description ? 'text' : 'image',
            prompt: p.description,
            imagePath: p.image,
            name: p.name,
            quality: p.quality,
            model: p.model,
            projectId: ctx.project.id,
          },
          { taskId: ctx.task.id, runId: ctx.runId },
        );
        jobId = job.id;
        ctx.step('status', `3D-Auftrag „${job.name}“ gestartet (${MODEL_LABEL[job.model]}, Qualität ${QUALITY_LABEL[job.quality]}). Das dauert einige Minuten.`, { jobId: job.id });
        const final = await s.threed.wait(job.id, ctx.signal);
        if (final.status !== 'done' || !final.outputRel) {
          const why = final.status === 'cancelled' ? 'Der 3D-Auftrag wurde abgebrochen.' : (final.error ?? 'Der 3D-Auftrag ist fehlgeschlagen.');
          return { status: 'error', code: final.status === 'cancelled' ? 'CANCELLED' : 'DEPENDENCY_FAILED', content: `Kein 3D-Modell erzeugt: ${why}` };
        }
        const files = [final.outputRel];
        // Text mode: the reference image is saved next to the model with the same base name.
        const imageRel = final.mode === 'text' && final.imagePath ? final.outputRel.replace(/\.glb$/i, '.png') : null;
        if (imageRel) files.push(imageRel);
        let size = 0;
        try {
          size = s.threed.readFile(final.id, 'model').sizeBytes;
        } catch (e) {
          ctx.log.debug('Größe des 3D-Modells nicht lesbar', { error: errorMessage(e) });
        }
        try {
          s.tasks.addFiles(ctx.task.id, files);
        } catch (e) {
          ctx.log.warn('Dateien des 3D-Modells konnten der Aufgabe nicht zugeordnet werden', { error: errorMessage(e) });
        }
        const lines = [
          `3D-Modell erstellt: ${final.outputRel}${size ? ` (${formatSize(size)})` : ''}, ${MODEL_LABEL[final.model]}, Qualität ${QUALITY_LABEL[final.quality]}.`,
          imageRel ? `Referenzbild: ${imageRel}.` : null,
          'Die Datei ist ein binäres glTF (.glb) mit PBR-Materialien und lässt sich in Unity, Godot, Unreal, Blender oder three.js laden. Nicht mit read_file/edit_file bearbeiten.',
        ].filter(Boolean);
        return { status: 'ok', content: lines.join('\n'), filesChanged: files, data: { path: final.outputRel, sizeBytes: size, jobId: final.id, referenceImage: imageRel } };
      } catch (e) {
        if (jobId && (ctx.signal.aborted || isAbortError(e))) {
          try {
            s.threed.cancel(jobId);
          } catch (err) {
            ctx.log.debug('3D-Auftrag konnte nicht abgebrochen werden', { error: errorMessage(err) });
          }
          return { status: 'error', code: 'CANCELLED', content: 'Abgebrochen – der 3D-Auftrag wurde gestoppt.' };
        }
        if (e instanceof NovaError) {
          return { status: 'error', code: String(e.code), content: `${e.message}${e.userAction ? ` ${e.userAction}` : ''}` };
        }
        return { status: 'error', code: 'INTERNAL', content: `Unerwarteter Fehler bei der 3D-Erzeugung: ${errorMessage(e)}` };
      }
    },
  };
}
