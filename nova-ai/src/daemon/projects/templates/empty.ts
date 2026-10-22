// Template "empty" – generic project with only a German README and a .gitignore. Used for project kinds without a
// dedicated template (Godot, Unreal, generic) and when the user explicitly wants to start from nothing.
// Key decision: no commands are invented – everything stays null until the detector finds real project files.
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { GITIGNORE_COMMON, HONEST_LIMITS_DE, markdownParagraph, writeScaffold } from './common';

function readme(name: string, description: string): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Ein leeres Projekt, angelegt mit NOVA AI. Es enthält noch keinen Code.

## Nächste Schritte

- In NOVA ein Ziel beschreiben („Neues Ziel planen“) – der Planer zerlegt es in Aufgaben.
- Sobald Projektdateien vorhanden sind (z. B. \`package.json\`, \`*.csproj\`, \`pyproject.toml\`, \`project.godot\`),
  erkennt NOVA Befehle für Tests und Builds über „Projekt erkennen“.

## Grenzen (ehrlich)

- Ohne Test- oder Build-Befehl kann NOVA Änderungen nicht automatisch prüfen; Aufgaben werden dann als „nicht geprüft“ angezeigt.
${HONEST_LIMITS_DE}
`;
}

export function createEmptyTemplate(): ProjectTemplate {
  return {
    info: {
      id: 'empty',
      name: 'Leeres Projekt',
      description: 'Nur README und .gitignore – für eigene Projektarten oder um bei null anzufangen.',
      kind: 'generic',
      technologies: [],
      requiredTools: [],
      previewKind: 'none',
    },
    async scaffold(dir, opts) {
      return {
        files: writeScaffold(dir, { 'README.md': readme(opts.name, opts.description), '.gitignore': GITIGNORE_COMMON }),
        config: { commands: emptyCommands(), preview: { kind: 'none', entry: null, url: null }, artifactGlobs: [] },
        notes: [],
      };
    },
  };
}
