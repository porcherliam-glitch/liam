#!/usr/bin/env node
/*
 * Preview of the dialogue screen without Unity (same approach as vorschau_ui.cjs, which this script reuses):
 *
 *   - Layout:  Assets/_Project/Art/UI/Layouts/Dialogue.uxml (and Hud.uxml for the HUD below the dialogue)
 *   - Styles:  the theme (AetherfallTheme.tss and its imports) plus Art/UI/Styles/Dialogue.uss, which Dialogue.uxml loads
 *              with <Style> as long as the theme does not import it
 *   - Texts:   UiTexts.cs plus Assets/_Project/Scripts/UI/Screens/Dialogue/DialogueScreenTexts.cs (the screen's own texts
 *              win, like DialogueScreen.ApplyOwnTexts)
 *   - State:   szenen_dialog.js mirrors DialogueScreen, DialogueScreenPresenter and SubtitlePager; the example lines and
 *              answers are the Muehlbach dialogue (GDD 02, 12.10) with the markings the dialogue system computes for them.
 *
 * Usage (from the repository root):
 *   node Tools/Preview/ui/vorschau_dialog.cjs [--out DIR] [--szene NAME ...] [--nur-html] [--hintergrund BILD.png] [--streng]
 * Scenes: dialog (choice, keyboard), dialog_zeile (line with typewriter end), dialog_gamepad (PlayStation, hold on "[Toeten]").
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const DIALOGUE_USS = path.join(REPO, 'Assets', '_Project', 'Art', 'UI', 'Styles', 'Dialogue.uss');
const DIALOGUE_TEXTS = path.join(REPO, 'Assets', '_Project', 'Scripts', 'UI', 'Screens', 'Dialogue', 'DialogueScreenTexts.cs');

const SCENES = [
  { name: 'dialog', title: 'Dialog: Auswahl am Mühlbach (Tastatur)' },
  { name: 'dialog_zeile', title: 'Dialog: Zeile mit Sprecher (Tastatur)' },
  { name: 'dialog_gamepad', title: 'Dialog: Auswahl mit [Töten] gehalten (PlayStation-Glyphen)' }
];

/** Loads vorschau_ui.cjs as a library: its functions without running its main(). */
function loadUiPreview() {
  const file = path.join(HERE, 'vorschau_ui.cjs');
  let source = fs.readFileSync(file, 'utf8').replace(/^#!.*\n/, '');
  const tail = source.lastIndexOf('main().catch(');
  if (tail < 0) {
    fail('vorschau_ui.cjs: Aufruf "main().catch(" nicht gefunden – Aufbau geändert?');
  }

  source = source.substring(0, tail) +
    'module.exports = { buildCss, convertUss, readScaleRules, panelSize, readTexts, readGlyphCatalog, readGlyphIds, readLayouts, ' +
    'unescapeCSharp, takeScreenshots, toDataUrl, escapeHtml, BAR_TEXT, SHOT_HEIGHT };\n';
  const library = new Module(file, module);
  library.filename = file;
  library.paths = Module._nodeModulePaths(HERE);
  library._compile(source, file);
  return library.exports;
}

function main() {
  const ui = loadUiPreview();
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });

  const css = ui.buildCss();
  // Until the theme imports Dialogue.uss, Dialogue.uxml loads it itself (<Style>): add it here unless the theme has it.
  const themeHasSheet = css.files.some((file) => path.resolve(file) === DIALOGUE_USS);
  const cssText = themeHasSheet ? css.text : css.text +
    '\n/* ===== Assets/_Project/Art/UI/Styles/Dialogue.uss (converted from USS, loaded by Dialogue.uxml) ===== */\n' +
    ui.convertUss(fs.readFileSync(DIALOGUE_USS, 'utf8'), new Set()) + '\n';
  const layouts = ui.readLayouts();
  if (!layouts['Dialogue.uxml']) {
    fail('Dialogue.uxml fehlt in Assets/_Project/Art/UI/Layouts.');
  }

  // <Style src="..."/> is loaded above as CSS; the HTML rebuild only knows visual elements.
  layouts['Dialogue.uxml'] = layouts['Dialogue.uxml'].replace(/<Style\b[^>]*\/>\s*/g, '');
  const texts = Object.assign(ui.readTexts(), readDialogueTexts(ui));
  const scale = ui.readScaleRules();
  const panel = { width: scale.referenceWidth, height: scale.referenceHeight, scale: 1 };
  const data = {
    texts,
    glyphs: ui.readGlyphCatalog(),
    glyphIds: ui.readGlyphIds(),
    uxml: layouts,
    barText: ui.BAR_TEXT,
    panel,
    uiPercent: scale.defaultUiPercent
  };

  const background = options.background ? ui.toDataUrl(options.background) : '';
  const scenes = options.scenes.length > 0 ? SCENES.filter((s) => options.scenes.includes(s.name)) : SCENES;
  if (scenes.length === 0) {
    fail('Keine bekannte Szene ausgewählt. Bekannt: ' + SCENES.map((s) => s.name).join(', '));
  }

  const pages = [];
  for (const scene of scenes) {
    const html = buildPage(scene, cssText, data, background, ui);
    const file = path.join(options.out, scene.name + '.html');
    fs.writeFileSync(file, html, 'utf8');
    pages.push({ scene, file, panel, png: path.join(options.out, scene.name + '.png') });
  }

  report('USS: Theme-Importe' + (themeHasSheet ? '' : ' + ' + path.relative(REPO, DIALOGUE_USS)) + '; Texte: ' + Object.keys(texts).length +
    ' (UiTexts.cs + DialogueScreenTexts.cs).');
  if (options.htmlOnly) {
    report('Nur HTML erzeugt: ' + options.out);
    return Promise.resolve();
  }

  return ui.takeScreenshots(pages, options.strict).then(() => report('Fertig: ' + options.out));
}

/** Entries "new UiTextEntry("key", "text")" of DialogueScreenTexts.cs. */
function readDialogueTexts(ui) {
  const source = fs.readFileSync(DIALOGUE_TEXTS, 'utf8');
  const regex = /new UiTextEntry\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)/g;
  const texts = {};
  let match;
  while ((match = regex.exec(source)) !== null) {
    texts[match[1]] = ui.unescapeCSharp(match[2]);
  }

  if (Object.keys(texts).length < 5) {
    fail('DialogueScreenTexts.cs: zu wenige Einträge gefunden – Format geändert?');
  }

  return texts;
}

function buildPage(scene, css, data, background, ui) {
  const base = fs.readFileSync(path.join(HERE, 'basis.css'), 'utf8');
  const runtime = fs.readFileSync(path.join(HERE, 'seite.js'), 'utf8');
  const builders = fs.readFileSync(path.join(HERE, 'szenen_dialog.js'), 'utf8');
  const json = JSON.stringify(Object.assign({ scene: scene.name, background }, data)).replace(/</g, '\\u003c');
  return [
    '<!DOCTYPE html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Aetherfall UI-Vorschau: ' + ui.escapeHtml(scene.title) + '</title>',
    '<style>',
    base,
    ':root { --panel-w: ' + data.panel.width + 'px; --panel-h: ' + data.panel.height + 'px; }',
    '</style>',
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    '<script>window.AF_DATA = ' + json + ';</script>',
    '<script>',
    runtime,
    '</script>',
    '<script>',
    builders,
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function parseArgs(args) {
  const options = { out: path.join(HERE, 'Ausgabe'), scenes: [], htmlOnly: false, background: '', strict: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      options.out = path.resolve(args[++i]);
    } else if (arg === '--szene') {
      options.scenes.push(args[++i]);
    } else if (arg === '--nur-html') {
      options.htmlOnly = true;
    } else if (arg === '--hintergrund') {
      options.background = path.resolve(args[++i]);
    } else if (arg === '--streng') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('node Tools/Preview/ui/vorschau_dialog.cjs [--out DIR] [--szene NAME ...] [--nur-html] [--hintergrund BILD.png] [--streng]');
      console.log('Szenen: ' + SCENES.map((s) => s.name).join(', '));
      process.exit(0);
    } else {
      fail('Unbekannte Option: ' + arg);
    }
  }

  return options;
}

function report(message) {
  console.log('[vorschau-dialog] ' + message);
}

function fail(message) {
  console.error('[vorschau-dialog] ' + message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
