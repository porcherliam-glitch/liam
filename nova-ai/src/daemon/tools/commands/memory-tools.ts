// Agent tools memory_search (all roles) and memory_note (all roles) over MemoryService (SPEC §4.3, §4.7, §6.4, §6.7).
// Key decisions:
// - memory_search: the project's entries plus shareable global knowledge (MemoryService decides what is visible;
//   never non-shareable entries of other projects). Compact numbered list with kind, title, scope, date, snippet.
// - memory_note: source 'agent' → MemoryService enforces memory.enabled / agentsMayWrite, redaction and the secret
//   check (VALIDATION → returned as tool error). shareable is requested only for kind 'insight' (MemoryService
//   additionally requires autoShareAgentInsights). Agents may not write the system kinds task_status/test_result
//   (those come from real results only). An optional `tags` list is accepted; a 'decision' whose title starts with
//   "Annahme" is tagged 'annahme' automatically (SPEC §6.4 planner assumptions).
import { z } from 'zod';
import type { MemoryKind } from '@shared/schemas';
import type { AgentTool, Services } from '../../contracts';
import { abortedResult, isoDay, oneLine, toolError } from './common';

export const AGENT_MEMORY_KINDS = ['goal', 'decision', 'requirement', 'convention', 'bug', 'attempt', 'question', 'next_step', 'note', 'insight'] as const satisfies readonly MemoryKind[];

const MemorySearchSchema = z.object({
  query: z.string().min(1).max(500).describe('Words to search for in the project memory (goals, decisions, conventions, earlier attempts, insights).'),
  limit: z.number().int().min(1).max(20).default(8).describe('Maximum number of results (1-20).'),
});
export type MemorySearchParams = z.output<typeof MemorySearchSchema>;

const MemoryNoteSchema = z.object({
  kind: z.enum(AGENT_MEMORY_KINDS).describe('Type of the entry. Use "decision" for assumptions/decisions, "insight" for general technical lessons, "next_step" for follow-ups.'),
  title: z.string().min(1).max(300).describe('Short German title.'),
  content: z.string().min(1).max(20000).describe('German content. Never store passwords, keys or tokens.'),
  tags: z.array(z.string().min(1).max(50)).max(10).optional().describe('Optional tags, e.g. ["annahme"].'),
});
export type MemoryNoteParams = z.output<typeof MemoryNoteSchema>;

const KIND_LABELS: Record<MemoryKind, string> = {
  goal: 'Ziel',
  decision: 'Entscheidung',
  requirement: 'Anforderung',
  convention: 'Konvention',
  task_status: 'Aufgabenstand',
  bug: 'Fehler',
  attempt: 'Versuch',
  test_result: 'Testergebnis',
  question: 'Frage',
  next_step: 'Nächster Schritt',
  note: 'Notiz',
  insight: 'Erkenntnis',
};

export function createMemorySearchTool(s: Services): AgentTool<MemorySearchParams> {
  return {
    name: 'memory_search',
    description: 'Search the project memory and the shared knowledge base (goals, requirements, decisions, conventions, earlier attempts, insights).',
    schema: MemorySearchSchema,
    readOnly: true,
    describe: (p) => `Durchsucht das Gedächtnis nach „${oneLine(p.query, 80)}“`,
    async execute(p, ctx) {
      try {
        const results = s.memory.search(p.query, { projectId: ctx.project.id, includeGlobal: true, limit: p.limit });
        if (results.length === 0) return { status: 'ok', content: `Keine Gedächtniseinträge zu „${oneLine(p.query, 80)}“ gefunden.`, data: { count: 0 } };
        const lines = [`${results.length} ${results.length === 1 ? 'Treffer' : 'Treffer'}:`];
        results.forEach((r, i) => {
          const scope = r.projectId === null ? 'global' : r.projectId === ctx.project.id ? 'dieses Projekt' : 'anderes Projekt';
          const text = oneLine(r.snippet || r.content, 400);
          const tags = r.tags.length > 0 ? ` #${r.tags.join(' #')}` : '';
          lines.push(`${i + 1}. [${KIND_LABELS[r.kind] ?? r.kind}] ${r.title} (${scope}, ${isoDay(r.updatedAt)})${tags}\n   ${text}`);
        });
        return { status: 'ok', content: lines.join('\n'), data: { count: results.length, ids: results.map((r) => r.id) } };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}

export function createMemoryNoteTool(s: Services): AgentTool<MemoryNoteParams> {
  return {
    name: 'memory_note',
    description:
      'Store a short entry in the project memory so later tasks know it (decisions and assumptions, requirements, conventions, next steps, general technical insights). Write title and content in German. Never store secrets.',
    schema: MemoryNoteSchema,
    readOnly: false,
    describe: (p) => `Merkt sich: ${oneLine(p.title, 100)}`,
    async execute(p, ctx) {
      const aborted = abortedResult(ctx);
      if (aborted) return aborted;
      try {
        const tags = [...new Set((p.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
        if (p.kind === 'decision' && /^annahme\b/i.test(p.title.trim()) && !tags.includes('annahme')) tags.push('annahme');
        const entry = s.memory.add(
          { projectId: ctx.project.id, kind: p.kind, title: p.title, content: p.content, tags, shareable: p.kind === 'insight', taskId: ctx.task.id },
          'agent',
        );
        const shared = entry.shareable ? ' (für andere Projekte freigegeben)' : '';
        return { status: 'ok', content: `Im Gedächtnis gespeichert: [${KIND_LABELS[entry.kind] ?? entry.kind}] ${entry.title}${shared}.`, data: { id: entry.id, kind: entry.kind, shareable: entry.shareable } };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}
