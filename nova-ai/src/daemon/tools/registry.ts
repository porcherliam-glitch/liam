// ToolRegistry: the generic agent tools (file tools + command tools) behind one interface for the AgentRunner
// (SPEC §4.3, §6.0.4, contract ToolRegistry).
// Key decisions:
// - specs(names) = z.toJSONSchema(schema, {io:'input'}) minus $schema (cached per tool); unknown names are skipped.
// - execute() never throws: unknown tool → NOT_FOUND result, zod validation errors → VALIDATION result listing the
//   problems (the model can correct itself), thrown NovaErrors keep their code, unexpected errors → INTERNAL.
// - EVERY result content passes through redactString before it reaches a model (SPEC §6.0.4) and is capped at
//   100 000 characters with a German note; result data is deep-redacted too.
// - Tool names are snake_case and unique (registering a second tool with the same name is a programming error).
import { z } from 'zod';
import type { AgentTool, ChatToolSpec, Services, ToolContext, ToolResult, ToolRegistry } from '../contracts';
import { NovaError, errorMessage, validation } from '../core/errors';
import { redact, redactString } from '../core/redact';
import { createFileTools } from './files';
import { createCommandTools } from './commands';

export interface ToolRegistryOptions {
  /** Tools to register instead of the default set (file tools + command tools). */
  tools?: AgentTool[];
}

export const MAX_TOOL_RESULT_CHARS = 100_000;

/** Short German list of zod issues: "path: Pflichtangabe fehlt; depth: Zahl zu groß". */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((i) => {
      const path = i.path.length > 0 ? i.path.map(String).join('.') : '(Argumente)';
      return `${path}: ${i.message}`;
    })
    .join('; ');
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function capContent(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;
  return `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n… [gekürzt: Ergebnis länger als ${MAX_TOOL_RESULT_CHARS.toLocaleString('de-DE')} Zeichen]`;
}

function sanitize(result: ToolResult): ToolResult {
  const content = capContent(redactString(typeof result.content === 'string' ? result.content : String(result.content ?? '')));
  switch (result.status) {
    case 'ok':
      return {
        status: 'ok',
        content,
        ...(result.data !== undefined ? { data: redact(result.data) } : {}),
        ...(result.filesChanged ? { filesChanged: [...result.filesChanged] } : {}),
      };
    case 'error':
      return { status: 'error', content, ...(result.code ? { code: result.code } : {}) };
    case 'approval_required':
      return { status: 'approval_required', approvalId: result.approvalId, content };
    case 'needs_input':
      return { status: 'needs_input', noteId: result.noteId, content };
    default:
      return { status: 'error', code: 'INTERNAL', content: 'Das Werkzeug hat ein ungültiges Ergebnis geliefert.' };
  }
}

export function createToolRegistry(s: Services, opts: ToolRegistryOptions = {}): ToolRegistry {
  const tools = new Map<string, AgentTool>();
  const specCache = new Map<string, ChatToolSpec>();
  const log = s.core.log.child('tools');

  const registry: ToolRegistry = {
    register(tool) {
      if (!tool || typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) {
        throw validation(`Ungültiger Werkzeugname: ${String(tool?.name)}`);
      }
      if (tools.has(tool.name)) throw validation(`Das Werkzeug „${tool.name}“ ist bereits registriert.`);
      if (typeof tool.execute !== 'function' || typeof tool.describe !== 'function' || !tool.schema) {
        throw validation(`Das Werkzeug „${tool.name}“ ist unvollständig.`);
      }
      tools.set(tool.name, tool);
      specCache.delete(tool.name);
    },

    get(name) {
      return tools.get(name) ?? null;
    },

    names() {
      return [...tools.keys()];
    },

    specs(names) {
      const out: ChatToolSpec[] = [];
      for (const name of names) {
        const tool = tools.get(name);
        if (!tool) {
          log.debug('Unbekanntes Werkzeug in der Rollenliste', { name });
          continue;
        }
        let spec = specCache.get(name);
        if (!spec) {
          let parameters: Record<string, unknown>;
          try {
            parameters = jsonSchemaOf(tool.schema);
          } catch (e) {
            log.warn('JSON-Schema eines Werkzeugs konnte nicht erzeugt werden', { name, error: errorMessage(e) });
            parameters = { type: 'object' };
          }
          spec = { name, description: tool.description, parameters };
          specCache.set(name, spec);
        }
        out.push({ name: spec.name, description: spec.description, parameters: spec.parameters });
      }
      return out;
    },

    async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
      const tool = tools.get(name);
      if (!tool) {
        return sanitize({ status: 'error', code: 'NOT_FOUND', content: `Unbekanntes Werkzeug „${name}“. Verfügbar: ${[...tools.keys()].join(', ')}.` });
      }
      if (ctx.signal.aborted) return { status: 'error', code: 'CANCELLED', content: 'Abgebrochen – das Werkzeug wurde nicht ausgeführt.' };
      const parsed = tool.schema.safeParse(args ?? {});
      if (!parsed.success) {
        return sanitize({
          status: 'error',
          code: 'VALIDATION',
          content: `Ungültige Argumente für ${name}: ${formatZodIssues(parsed.error)}. Bitte die Argumentnamen und -typen prüfen und das Werkzeug erneut aufrufen.`,
        });
      }
      try {
        const result = await tool.execute(parsed.data, ctx);
        if (!result || typeof result !== 'object' || typeof (result as { status?: unknown }).status !== 'string') {
          return { status: 'error', code: 'INTERNAL', content: 'Das Werkzeug hat ein ungültiges Ergebnis geliefert.' };
        }
        return sanitize(result);
      } catch (e) {
        if (e instanceof NovaError) return sanitize({ status: 'error', code: String(e.code), content: e.message });
        log.warn('Werkzeug fehlgeschlagen', { name, error: errorMessage(e) });
        return sanitize({ status: 'error', code: 'INTERNAL', content: `Unerwarteter Fehler im Werkzeug ${name}: ${errorMessage(e)}` });
      }
    },
  };

  for (const tool of opts.tools ?? [...createFileTools(s), ...createCommandTools(s)]) registry.register(tool);
  return registry;
}
