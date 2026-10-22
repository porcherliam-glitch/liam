import { describe, it, expect } from 'vitest';
import { chooseTemplate, type TemplateChoiceInput } from './template-choice';

function pick(partial: Partial<TemplateChoiceInput>): string {
  return chooseTemplate({ kind: null, technologies: [], name: '', description: '', answers: {}, ...partial }).templateId;
}

describe('chooseTemplate', () => {
  it.each([
    ['Ein Browserspiel, in dem man Sterne sammelt', 'web-game'],
    ['A small game for the browser', 'web-game'],
    ['Ein Jump’n’Run mit Highscore', 'web-game'],
    ['Ein 3D-Spiel mit Unity', 'unity'],
    ['Eine Windows-Anwendung zum Verwalten von Rezepten', 'desktop-dotnet'],
    ['Desktop-Programm mit WPF und C#', 'desktop-dotnet'],
    ['Programm mit .NET 8', 'desktop-dotnet'],
    ['Eine REST-API mit Datenbank für Bestellungen', 'backend-api'],
    ['Backend für eine App', 'backend-api'],
    ['Eine Webseite für meinen Verein', 'web-app'],
    ['Webanwendung für Notizen', 'web-app'],
    ['Etwas Schönes', 'web-app'],
  ])('%s → %s', (description, expected) => {
    expect(pick({ description })).toBe(expected);
  });

  it('does not treat "Beispiel" or "abspielen" as a game', () => {
    expect(pick({ description: 'Eine Webseite, zum Beispiel mit Kontaktformular' })).toBe('web-app');
    expect(pick({ description: 'Webseite zum Musik abspielen' })).toBe('web-app');
  });

  it('does not match "api" inside other words', () => {
    expect(pick({ description: 'Eine Webseite mit Kapiteln und Papier-Design' })).toBe('web-app');
  });

  it('prefers explicit technologies, then the kind', () => {
    expect(pick({ technologies: ['Unity'], description: 'Webseite' })).toBe('unity');
    expect(pick({ technologies: ['HTML', 'Canvas'] })).toBe('web-game');
    expect(pick({ technologies: ['JavaScript'], description: 'ein Spiel' })).toBe('web-game');
    expect(pick({ kind: 'backend', description: 'Spiel' })).toBe('backend-api');
    expect(pick({ kind: 'web', description: 'Ein Spiel' })).toBe('web-game');
    expect(pick({ kind: 'desktop' })).toBe('desktop-dotnet');
    expect(pick({ kind: 'godot' })).toBe('empty');
  });

  it('uses wizard answers and explains the choice in German', () => {
    const c = chooseTemplate({ kind: null, technologies: [], name: 'Projekt', description: '', answers: { art: 'Spiel für den Browser' } });
    expect(c.templateId).toBe('web-game');
    expect(c.reason).toMatch(/Gewählt anhand der Beschreibung/);
    expect(chooseTemplate({ kind: null, technologies: [], name: '', description: '', answers: {} }).reason).toMatch(/Standard/);
  });
});
