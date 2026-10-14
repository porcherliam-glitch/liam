#!/usr/bin/env node
/*
 * UI preview without Unity: rebuilds the UI Toolkit screens of Aetherfall as HTML from the SAME files Unity uses and takes
 * screenshots with Playwright/Chromium.
 *
 *   - Layout:  Assets/_Project/Art/UI/Layouts/*.uxml  (parsed in the page, every element becomes a flex <div>)
 *   - Styles:  Assets/_Project/Art/UI/Theme/AetherfallTheme.tss and the USS files it imports (converted to CSS below)
 *   - Texts:   Assets/_Project/Scripts/UI/Framework/UiTexts.cs  (the central German text table)
 *   - Glyphs:  Assets/_Project/Scripts/UI/Framework/GlyphCatalog.cs and GlyphNames.cs
 *
 *   - Scale:   Assets/_Project/Scripts/UI/Framework/UiScaleRules.cs (logical panel size at a UI size, GDD 05 1.6)
 *
 * The runtime state of each screen (which item has the focus, bar values, messages ...) is set by szenen.js, which mirrors
 * the view code in Assets/_Project/Scripts/UI/Screens. Nothing here is a Unity screenshot.
 *
 * Usage (from the repository root):
 *   node Tools/Preview/ui/vorschau_ui.cjs [--out DIR] [--szene NAME ...] [--nur-html] [--hintergrund BILD.png]
 *                                         [--panel BREITExHOEHE] [--streng]
 * Needs Node 18+ and the npm package "playwright" with Chromium (see README.md).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const UI_ART = path.join(REPO, 'Assets', '_Project', 'Art', 'UI');
const UI_CODE = path.join(REPO, 'Assets', '_Project', 'Scripts', 'UI', 'Framework');
const THEME = path.join(UI_ART, 'Theme', 'AetherfallTheme.tss');

/** Height of the screenshots in pixels; the width follows the aspect ratio of the panel (1600 x 900 for 16:9). */
const SHOT_HEIGHT = 900;

const BAR_TEXT = 'Vorschau – HTML-Nachbau der Unity-Oberfläche (kein Unity-Screenshot)';

/**
 * Scenes and their file names; the builders live in szenen.js. "screen" = screen size in pixels and UI size option: the
 * logical panel size follows from UiScaleRules (default: 1920 x 1080 screen at 100 %, i.e. the reference 1920 x 1080).
 */
const SCENES = [
  { name: 'hud', title: 'HUD (Tastatur)' },
  { name: 'hud_gamepad', title: 'HUD (PlayStation-Glyphen)' },
  { name: 'pausemenue', title: 'Pausemenü' },
  { name: 'pausemenue_laden', title: 'Pausemenü, Reiter Laden' },
  { name: 'hauptmenue', title: 'Hauptmenü' },
  { name: 'hauptmenue_optionen', title: 'Hauptmenü, Optionen (Xbox-Glyphen)' },
  { name: 'todesbildschirm', title: 'Todesbildschirm' },
  { name: 'ladebildschirm', title: 'Ladebildschirm' },
  { name: 'hauptmenue_laden_150', title: 'Hauptmenü, Laden, UI-Größe 150 % (16:10, 2880 × 1800)', screen: { width: 2880, height: 1800, uiPercent: 150 }, builder: 'hauptmenue_laden' },
  { name: 'pausemenue_150', title: 'Pausemenü, UI-Größe 150 % (16:9, 1920 × 1080)', screen: { width: 1920, height: 1080, uiPercent: 150 }, builder: 'pausemenue' }
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });

  const css = buildCss();
  const scale = readScaleRules();
  const data = {
    texts: readTexts(),
    glyphs: readGlyphCatalog(),
    glyphIds: readGlyphIds(),
    uxml: readLayouts(),
    barText: BAR_TEXT
  };

  const background = options.background ? toDataUrl(options.background) : '';
  const scenes = options.scenes.length > 0 ? SCENES.filter((s) => options.scenes.includes(s.name)) : SCENES;
  if (scenes.length === 0) {
    fail('Keine bekannte Szene ausgewählt. Bekannt: ' + SCENES.map((s) => s.name).join(', '));
  }

  fs.writeFileSync(path.join(options.out, 'aetherfall_ui.css'), css.text, 'utf8');
  const pages = [];
  for (const scene of scenes) {
    const screen = scene.screen || { width: scale.referenceWidth, height: scale.referenceHeight, uiPercent: scale.defaultUiPercent };
    const panel = options.panel || panelSize(scale, screen);
    const uiPercent = options.panel ? scale.defaultUiPercent : scale.clampUiPercent(screen.uiPercent);
    const html = buildPage(scene, css.text, Object.assign({ panel, uiPercent }, data), background);
    const file = path.join(options.out, scene.name + '.html');
    fs.writeFileSync(file, html, 'utf8');
    pages.push({ scene, file, panel, png: path.join(options.out, scene.name + '.png') });
  }

  report('USS-Dateien: ' + css.files.map((f) => path.relative(REPO, f)).join(', '));
  if (css.dropped.size > 0) {
    report('Nicht nachgebaute USS-Eigenschaften (wirken nur in Unity): ' + Array.from(css.dropped).sort().join(', '));
  }

  report(Object.keys(data.texts).length + ' Texte aus UiTexts.cs, ' + Object.keys(data.uxml).length + ' UXML-Layouts.');
  if (options.htmlOnly) {
    report('Nur HTML erzeugt: ' + options.out);
    return Promise.resolve();
  }

  return takeScreenshots(pages, options.strict).then(() => report('Fertig: ' + options.out));
}

function parseArgs(args) {
  const options = { out: path.join(HERE, 'Ausgabe'), scenes: [], htmlOnly: false, background: '', panel: null, strict: false };
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
    } else if (arg === '--panel') {
      const match = /^(\d{3,4})x(\d{3,4})$/.exec(args[++i] || '');
      if (!match) {
        fail('--panel erwartet BREITExHOEHE in logischen Punkten, z. B. --panel 1280x720');
      }

      options.panel = { width: Number(match[1]), height: Number(match[2]) };
    } else if (arg === '--streng') {
      options.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('node Tools/Preview/ui/vorschau_ui.cjs [--out DIR] [--szene NAME ...] [--nur-html] [--hintergrund BILD.png]');
      console.log('                                     [--panel BREITExHOEHE] [--streng]');
      console.log('Szenen: ' + SCENES.map((s) => s.name).join(', '));
      process.exit(0);
    } else {
      fail('Unbekannte Option: ' + arg);
    }
  }

  return options;
}

// ---------------------------------------------------------------------------------------------------------------------
// USS -> CSS
// ---------------------------------------------------------------------------------------------------------------------

/** Reads the theme, follows its @import list (the built-in default theme is skipped) and converts every sheet. */
function buildCss() {
  const theme = fs.readFileSync(THEME, 'utf8');
  const files = [];
  const importRegex = /@import\s+url\("([^"]+)"\)\s*;/g;
  let match;
  while ((match = importRegex.exec(theme)) !== null) {
    if (match[1].startsWith('unity-theme://')) {
      continue;
    }

    files.push(path.resolve(path.dirname(THEME), match[1]));
  }

  const dropped = new Set();
  const parts = [];
  for (const file of files) {
    parts.push('/* ===== ' + path.relative(REPO, file) + ' (converted from USS) ===== */');
    parts.push(convertUss(fs.readFileSync(file, 'utf8'), dropped));
  }

  return { text: parts.join('\n\n') + '\n', files, dropped };
}

/** Converts one USS file. USS is close to CSS; the differences are mapped in convertDeclaration. */
function convertUss(uss, dropped) {
  const source = uss.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  const out = [];
  let match;
  while ((match = ruleRegex.exec(source)) !== null) {
    // Hover and pressed states are not part of a still image (the mouse is not over the window).
    const selectors = match[1].split(',').map((s) => s.trim()).filter((s) => s.length > 0 && !/:hover|:active|:focus/.test(s));
    if (selectors.length === 0) {
      continue;
    }

    const declarations = [];
    for (const raw of match[2].split(';')) {
      const colon = raw.indexOf(':');
      if (colon < 0) {
        continue;
      }

      const property = raw.substring(0, colon).trim();
      const value = raw.substring(colon + 1).trim();
      for (const declaration of convertDeclaration(property, value, dropped)) {
        declarations.push('  ' + declaration + ';');
      }
    }

    if (declarations.length > 0) {
      out.push(selectors.join(',\n') + ' {\n' + declarations.join('\n') + '\n}');
    }
  }

  return out.join('\n\n');
}

function convertDeclaration(property, value, dropped) {
  if (property.startsWith('--')) {
    return [property + ': ' + value];
  }

  switch (property) {
    case '-unity-font-style':
      // normal | bold | italic | bold-and-italic
      return [
        'font-weight: ' + (value.includes('bold') ? 'bold' : 'normal'),
        'font-style: ' + (value.includes('italic') ? 'italic' : 'normal')
      ];
    case '-unity-text-align':
      // Inherited in USS as in this custom property; seite.js aligns the text spans with it.
      return ['--uta: ' + value];
    case 'white-space':
      // UI Toolkit keeps repeated spaces ("◄  100 %  ►"); CSS would collapse them with normal/nowrap.
      return ['white-space: ' + (value === 'nowrap' ? 'pre' : 'pre-wrap')];
    case 'transition-property':
    case 'transition-duration':
    case 'transition-timing-function':
    case 'transition-delay':
    case 'transition':
      // Still images show the end state of the open/close transitions (0.15 s / 0.10 s in Base.uss).
      dropped.add(property);
      return [];
    case 'cursor':
      dropped.add(property);
      return [];
    default:
      if (property.startsWith('-unity-')) {
        dropped.add(property);
        return [];
      }

      return [property + ': ' + value];
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Texts, glyphs, layouts (read from the C# sources and the UXML files)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Reads the constants of UiScaleRules.cs and mirrors its rules (ClampUiPercent, MaxScaleFor, PanelScale), so the preview
 * uses the same logical panel size as Unity at a given screen and UI size.
 */
function readScaleRules() {
  const source = fs.readFileSync(path.join(UI_CODE, 'UiScaleRules.cs'), 'utf8');
  const constant = (name) => {
    const match = new RegExp('public const (?:int|float) ' + name + ' = ([0-9.]+)f?;').exec(source);
    if (!match) {
      fail('UiScaleRules.cs: Konstante ' + name + ' nicht gefunden.');
    }

    return Number(match[1]);
  };
  const rules = {
    minUiPercent: constant('MinUiPercent'),
    maxUiPercent: constant('MaxUiPercent'),
    stepPercent: constant('StepPercent'),
    defaultUiPercent: constant('DefaultUiPercent'),
    referenceWidth: constant('ReferenceWidth'),
    referenceHeight: constant('ReferenceHeight'),
    minLogicalWidth: constant('MinLogicalWidth'),
    minLogicalHeight: constant('MinLogicalHeight')
  };
  rules.clampUiPercent = (percent) => {
    const clamped = Math.max(rules.minUiPercent, Math.min(rules.maxUiPercent, percent));
    return rules.minUiPercent + Math.round((clamped - rules.minUiPercent) / rules.stepPercent) * rules.stepPercent;
  };
  rules.maxScaleFor = (width, height) => {
    const aspect = width / height;
    const byWidth = rules.referenceHeight * aspect / rules.minLogicalWidth;
    const byHeight = rules.referenceHeight / rules.minLogicalHeight;
    return Math.max(rules.minUiPercent / 100, Math.min(byWidth, byHeight));
  };
  rules.panelScale = (uiPercent, width, height) => Math.min(rules.clampUiPercent(uiPercent) / 100, rules.maxScaleFor(width, height));
  return rules;
}

/** Logical panel size on a screen (ScaleWithScreenSize with match = height, times PanelSettings.scale). */
function panelSize(rules, screen) {
  const scale = rules.panelScale(screen.uiPercent, screen.width, screen.height);
  const height = rules.referenceHeight / scale;
  return { width: Math.round(height * screen.width / screen.height), height: Math.round(height), scale };
}

/** Reads the entries "new UiTextEntry("key", "text")" of UiTexts.cs in table order. */
function readTexts() {
  const source = fs.readFileSync(path.join(UI_CODE, 'UiTexts.cs'), 'utf8');
  const regex = /new UiTextEntry\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)/g;
  const texts = {};
  let match;
  while ((match = regex.exec(source)) !== null) {
    texts[match[1]] = unescapeCSharp(match[2]);
  }

  if (Object.keys(texts).length < 20) {
    fail('UiTexts.cs: zu wenige Einträge gefunden – hat sich das Format "new UiTextEntry(\\"key\\", \\"text\\")" geändert?');
  }

  return texts;
}

/** Reads the per-family switch methods of GlyphCatalog.cs; gamepad families fall back to the D-pad method. */
function readGlyphCatalog() {
  const source = fs.readFileSync(path.join(UI_CODE, 'GlyphCatalog.cs'), 'utf8');
  const methods = {};
  const methodRegex = /private static string (\w+)\(UiGlyph glyph\)\s*\{([\s\S]*?)\n        \}/g;
  let match;
  while ((match = methodRegex.exec(source)) !== null) {
    const map = {};
    const caseRegex = /case UiGlyph\.(\w+): return "((?:[^"\\]|\\.)*)";/g;
    let c;
    while ((c = caseRegex.exec(match[2])) !== null) {
      map[c[1]] = unescapeCSharp(c[2]);
    }

    methods[match[1]] = { map, usesDPad: /default: return DPad\(glyph\);/.test(match[2]) };
  }

  const families = { KeyboardMouse: 'Keyboard', Xbox: 'Xbox', PlayStation: 'PlayStation', Nintendo: 'Nintendo', Generic: 'Generic' };
  const styleClasses = {};
  const styleRegex = /case GlyphFamily\.(\w+): return "(glyphs-[a-z]+)";/g;
  while ((match = styleRegex.exec(source)) !== null) {
    styleClasses[match[1]] = match[2];
  }

  const defaultStyle = /default: return "(glyphs-[a-z]+)";/.exec(source);
  styleClasses.KeyboardMouse = styleClasses.KeyboardMouse || (defaultStyle ? defaultStyle[1] : 'glyphs-keyboard');

  const result = { families: {}, styleClasses };
  for (const family of Object.keys(families)) {
    const method = methods[families[family]];
    if (!method) {
      fail('GlyphCatalog.cs: Methode ' + families[family] + ' nicht gefunden.');
    }

    const map = Object.assign({}, method.usesDPad && methods.DPad ? methods.DPad.map : {}, method.map);
    result.families[family] = map;
  }

  return result;
}

/** Reads the glyph ids of GlyphNames.TryParseId ("confirm" -> Confirm ...). */
function readGlyphIds() {
  const source = fs.readFileSync(path.join(UI_CODE, 'GlyphNames.cs'), 'utf8');
  const ids = {};
  const regex = /case "([a-z0-9]+)": glyph = UiGlyph\.(\w+);/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    ids[match[1]] = match[2];
  }

  const marker = /public const string Marker = "([^"]+)";/.exec(source);
  return { ids, marker: marker ? marker[1] : '-glyph-' };
}

function readLayouts() {
  const folder = path.join(UI_ART, 'Layouts');
  const layouts = {};
  for (const file of fs.readdirSync(folder).sort()) {
    if (file.endsWith('.uxml')) {
      layouts[file] = fs.readFileSync(path.join(folder, file), 'utf8');
    }
  }

  return layouts;
}

function unescapeCSharp(text) {
  return text.replace(/\\(["\\nrt])/g, (m, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
}

// ---------------------------------------------------------------------------------------------------------------------
// Page and screenshots
// ---------------------------------------------------------------------------------------------------------------------

function buildPage(scene, css, data, background) {
  const base = fs.readFileSync(path.join(HERE, 'basis.css'), 'utf8');
  const runtime = fs.readFileSync(path.join(HERE, 'seite.js'), 'utf8');
  const builders = fs.readFileSync(path.join(HERE, 'szenen.js'), 'utf8');
  const json = JSON.stringify(Object.assign({ scene: scene.builder || scene.name, background }, data)).replace(/</g, '\\u003c');
  return [
    '<!DOCTYPE html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Aetherfall UI-Vorschau: ' + escapeHtml(scene.title) + '</title>',
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

async function takeScreenshots(pages, strict) {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch();
  let failed = false;
  let layoutProblems = 0;
  try {
    for (const page of pages) {
      // The page is laid out at the logical panel size (1920 x 1080 at 100 % on 16:9) and drawn with 900 lines, like the
      // panel settings (ScaleWithScreenSize, match = height, times the UI size) scale the UI on a screen.
      const context = await browser.newContext({
        viewport: { width: page.panel.width, height: page.panel.height },
        deviceScaleFactor: SHOT_HEIGHT / page.panel.height
      });
      const tab = await context.newPage();
      const problems = [];
      tab.on('pageerror', (error) => problems.push(String(error)));
      tab.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(message.text());
        }
      });
      await tab.goto('file://' + page.file);
      await tab.waitForFunction(() => window.AF_DONE === true, null, { timeout: 15000 });
      await tab.evaluate(() => document.fonts.ready);
      const errors = await tab.evaluate(() => (window.AF ? window.AF.errors : ['seite.js nicht geladen']));
      problems.push(...errors);
      const layout = await tab.evaluate(() => (window.AF ? window.AF.checkLayout() : []));
      await tab.screenshot({ path: page.png });
      await context.close();
      const size = page.panel.width + ' × ' + page.panel.height;
      if (problems.length > 0) {
        failed = true;
        console.error('[vorschau-ui] FEHLER in ' + page.scene.name + ':\n  ' + problems.join('\n  '));
      } else {
        report(page.scene.name + '.png  (' + page.scene.title + '; Panel ' + size + ')');
      }

      if (layout.length > 0) {
        layoutProblems += layout.length;
        console.warn('[vorschau-ui] LAYOUT-WARNUNG in ' + page.scene.name + ' (Panel ' + size + '):\n  ' + layout.join('\n  '));
      }
    }
  } finally {
    await browser.close();
  }

  if (failed) {
    fail('Mindestens eine Szene hatte Fehler (siehe oben). Meist wurde ein Element in einer UXML-Datei umbenannt.');
  }

  if (strict && layoutProblems > 0) {
    fail(layoutProblems + ' Layout-Warnung(en) (siehe oben): Teile ragen aus dem Bild, Texte passen nicht oder Elemente überlappen.');
  }
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      return require(path.join(globalRoot, 'playwright'));
    } catch (error2) {
      fail('Das npm-Paket "playwright" fehlt. Installieren: npm install -g playwright && npx playwright install chromium');
    }
  }

  return null;
}

function toDataUrl(file) {
  const extension = path.extname(file).toLowerCase();
  const type = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  return 'data:' + type + ';base64,' + fs.readFileSync(file).toString('base64');
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function report(message) {
  console.log('[vorschau-ui] ' + message);
}

function fail(message) {
  console.error('[vorschau-ui] ' + message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
