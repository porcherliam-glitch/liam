/*
 * Scenes of the dialogue screen preview (loaded by vorschau_dialog.cjs after seite.js). The builders mirror the C# code in
 * Assets/_Project/Scripts/UI/Screens/Dialogue: DialogueScreen (constructor with the class queries, OnOpen, Render, RenderOption,
 * RefreshGlyphs),
 * DialogueScreenPresenter (focus on the first selectable answer, context line during a choice, continue mark, hold) and
 * Assets/_Project/Scripts/Dialogue/SubtitlePager.cs (45 characters per line, 2 lines per page). Behind the dialogue: the HUD
 * as HudView shows it out of combat (game state Dialogue shows the HUD, notifications are suppressed).
 *
 * The lines and answers are the Muehlbach dialogue (GDD 02, 12.10, test fixture MuehlbachDialogueFixture). Tags, symbols and
 * greyed answers are what DialogueOptionAnalyzer and DialogueOptionFormatter compute for the player values given per scene
 * (MuehlbachDialogueTests checks the same strings). If the C# view changes, change the builder here.
 */
(function () {
  'use strict';

  const AF = window.AF;
  const D = window.AF_DATA;

  const MAX_OPTIONS = 9;
  const CHARACTERS_PER_LINE = 45;
  const LINES_PER_PAGE = 2;
  const TAG_CLASSES = ['check', 'bribe', 'requirement', 'combat', 'kill', 'trade', 'end'];
  const ATTRIBUTES = ['strength', 'dexterity', 'intelligence', 'wisdom', 'constitution', 'charisma'];
  const SYMBOLS = { '◆': 'progress', '!': 'new', '★': 'complete' };

  // ===================================================================================================================
  // Mirrors of the pure logic
  // ===================================================================================================================

  /** SubtitlePager.Wrap */
  function wrap(text, width) {
    const lines = [];
    let line = '';
    for (let word of String(text || '').replace(/\n/g, ' ').split(' ')) {
      if (word.length === 0) {
        continue;
      }

      while (word.length > width) {
        if (line.length > 0) {
          lines.push(line);
          line = '';
        }

        lines.push(word.substring(0, width));
        word = word.substring(width);
      }

      if (line.length > 0 && line.length + 1 + word.length > width) {
        lines.push(line);
        line = '';
      }

      line = line.length > 0 ? line + ' ' + word : word;
    }

    if (line.length > 0 || lines.length === 0) {
      lines.push(line);
    }

    return lines;
  }

  /** SubtitlePager.Paginate */
  function paginate(text) {
    const lines = wrap(text, CHARACTERS_PER_LINE);
    const pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
    }

    return pages;
  }

  /** One answer as DialogueScreenOption (the adapter fills it from DialogueOptionView). */
  function answer(text, tagText, tag, extra) {
    return Object.assign({ text, tagText: tagText || '', tag: tag || 'none', symbolText: '', enabled: true, alreadyChosen: false,
      requiresHold: false, attributeKey: '' }, extra || {});
  }

  // ===================================================================================================================
  // DialogueScreen
  // ===================================================================================================================

  /**
   * DialogueScreen: constructor, RefreshGlyphs, OnOpen (Render + ShowAnimated). state: family, mode ('line' | 'choice'),
   * speaker, pages, page, visibleChars (typewriter; undefined = complete), options, focus, hold {index, progress}, canCancel,
   * auto.
   */
  function dialogueScreen(screensRoot, state) {
    const root = AF.cloneScreen('Dialogue.uxml', screensRoot);
    AF.applyTexts(root);
    const q = (name) => AF.q(root, name);
    // Labels whose text the code sets have no name in Dialogue.uxml: DialogueScreen finds them by class.
    const byClass = (cls) => {
      const found = AF.qClass(root, cls);
      if (!found) {
        AF.fail('Element mit Klasse „' + cls + '“ nicht gefunden (Dialogue.uxml geändert?)');
      }

      return found;
    };
    const speaker = byClass('af-dialogue__speaker');
    const text = byClass('af-dialogue__text');
    const continueMark = byClass('af-dialogue__continue');
    const autoLabel = byClass('af-dialogue__auto');
    const actionHint = byClass('af-dialogue__hint-action');
    const endHint = byClass('af-dialogue__hint-end');
    const optionsBox = q('dialogue-options');
    const backHint = q('dialogue-hint-back-group');
    const holdHint = q('dialogue-hint-hold-group');
    const backGlyph = q('dialogue-hint-glyph-back');
    AF.setText(continueMark, AF.text('dialogue-continue'));
    AF.setText(autoLabel, AF.text('dialogue-auto-on'));
    AF.setText(endHint, AF.text('dialogue-hint-end'));
    const rowElements = Array.from(optionsBox.querySelectorAll('.af-dialogue__option'));
    if (rowElements.length < MAX_OPTIONS) {
      AF.fail('Dialogue.uxml hat ' + rowElements.length + ' Antwortzeilen, gebraucht werden ' + MAX_OPTIONS + '.');
    }

    const rows = rowElements.slice(0, MAX_OPTIONS).map((row) => ({
      row,
      symbol: AF.qClass(row, 'af-dialogue__symbol'),
      tag: AF.qClass(row, 'af-dialogue__tag'),
      text: AF.qClass(row, 'af-dialogue__option-text'),
      fill: AF.qClass(row, 'af-button__hold-fill')
    }));

    const glyphLabels = AF.collectGlyphLabels(root);
    AF.refreshGlyphs(root, glyphLabels, state.family);
    if (state.family === 'KeyboardMouse') {
      // GDD 03 1.5: DialogBack on keyboard and mouse is the right mouse button.
      AF.setText(backGlyph, AF.text('dialogue-glyph-back-keyboard'));
    }

    AF.hideImmediately(root);

    // Presenter state of the moment
    const choice = state.mode === 'choice';
    const options = choice ? state.options.slice(0, MAX_OPTIONS) : [];
    let focus = state.focus;
    if (focus === undefined) {
      focus = options.findIndex((o) => o.enabled);
    }

    const pages = state.pages;
    const pageText = pages[state.page || 0] || '';
    const complete = state.visibleChars === undefined || state.visibleChars >= pageText.length;
    const contextText = pages.join(' ').replace(/\n/g, ' ');
    const visibleText = choice ? contextText : complete ? pageText : pageText.substring(0, state.visibleChars);
    const backIndex = options.reduce((found, o, i) => (o.tag === 'end' && o.enabled ? i : found), -1);
    const canGoBack = choice ? backIndex >= 0 || !!state.canCancel : !!state.canCancel;
    const focusedHold = choice && focus >= 0 && options[focus].requiresHold;
    const hold = state.hold || { index: -1, progress: 0 };

    // Render
    AF.enableClass(root, 'is-choice', choice);
    AF.setText(speaker, state.speaker);
    AF.setDisplayed(speaker, state.speaker.length > 0);
    AF.setText(text, visibleText);
    AF.setDisplayed(continueMark, !choice && complete);
    AF.setDisplayed(autoLabel, !!state.auto);
    AF.setDisplayed(optionsBox, choice);
    rows.forEach((parts, i) => {
      const shown = choice && i < options.length;
      AF.setDisplayed(parts.row, shown);
      if (shown) {
        renderOption(parts, options[i], i === focus, hold.index === i ? hold.progress : -1);
      }
    });

    AF.setText(actionHint, AF.text(choice ? 'dialogue-hint-select' : 'dialogue-hint-continue'));
    AF.setDisplayed(backHint, canGoBack);
    AF.setDisplayed(holdHint, focusedHold);
    AF.showOpen(root);
  }

  /** DialogueScreen.RenderOption */
  function renderOption(parts, option, focused, holdProgress) {
    const holding = holdProgress >= 0;
    AF.setFocused(parts.row, focused);
    AF.setDisabled(parts.row, !option.enabled);
    AF.enableClass(parts.row, 'is-chosen', option.alreadyChosen && option.enabled);
    AF.enableClass(parts.row, 'is-holding', holding);
    AF.setFill(parts.fill, holding ? holdProgress : 0);

    AF.setText(parts.symbol, option.symbolText);
    AF.setDisplayed(parts.symbol, option.symbolText.length > 0);
    for (const symbol of Object.keys(SYMBOLS)) {
      AF.enableClass(parts.symbol, 'af-dialogue__symbol--' + SYMBOLS[symbol], option.symbolText === symbol);
    }

    AF.setText(parts.tag, option.tagText);
    AF.setDisplayed(parts.tag, option.tagText.length > 0);
    for (const tag of TAG_CLASSES) {
      AF.enableClass(parts.tag, 'af-dialogue__tag--' + tag, option.tag === tag);
    }

    for (const attribute of ATTRIBUTES) {
      AF.enableClass(parts.tag, 'af-attr--' + attribute, option.tag === 'check' && option.attributeKey === attribute);
    }

    AF.setText(parts.text, option.text);
  }

  // ===================================================================================================================
  // HUD behind the dialogue (HudView out of combat, contextual mode)
  // ===================================================================================================================

  function deltaAngle(from, to) {
    let delta = (to - from) % 360;
    if (delta <= -180) {
      delta += 360;
    } else if (delta > 180) {
      delta -= 360;
    }

    return delta;
  }

  function calmHud(hudRoot, family, health) {
    AF.clone('Hud.uxml', hudRoot);
    const root = hudRoot;
    AF.applyTexts(root);
    const glyphLabels = AF.collectGlyphLabels(root);
    const q = (name) => AF.q(root, name);
    AF.refreshGlyphs(root, glyphLabels, family);
    AF.setFill(q('hud-health-fill'), health);
    AF.setFill(q('hud-health-trail'), health);
    // HudVisibilityRules (contextual): health below 100 %, stamina and mana full, no fight -> only health and compass.
    AF.setDisplayed(q('hud-health'), health < 1);
    AF.setDisplayed(q('hud-stamina'), false);
    AF.setDisplayed(q('hud-mana'), false);
    AF.setDisplayed(q('hud-stamina-exhausted'), false);
    AF.setDisplayed(q('hud-abilities'), false);
    AF.setDisplayed(q('hud-quickslots'), false);
    AF.setDisplayed(q('hud-target'), false);
    AF.setDisplayed(q('hud-prompt'), false);
    const heading = 12;
    ['hud-compass-n', 'hud-compass-ne', 'hud-compass-e', 'hud-compass-se', 'hud-compass-s', 'hud-compass-sw', 'hud-compass-w', 'hud-compass-nw']
      .forEach((name, i) => {
        const label = q(name);
        const delta = deltaAngle(heading, i * 45);
        const visible = Math.abs(delta) <= 90;
        AF.setDisplayed(label, visible);
        if (visible) {
          label.style.left = (0.5 + delta / 180) * 100 + '%';
        }
      });
  }

  function dialogueLayers(layers) {
    // UiStateDirector.Apply(Dialogue): HUD visible, notifications suppressed, no loading screen.
    AF.setDisplayed(layers.hud, true);
    AF.setDisplayed(layers.loading, false);
  }

  // ===================================================================================================================
  // Example states (Muehlbach, GDD 02 12.10)
  // ===================================================================================================================

  const HARRIK_ROLE = 'Banditenanführer';
  const N020 = 'Noch ein Schritt, und meine Jungs spicken dich mit Bolzen. Wer schickt dich – Brenner oder die Silberwacht?';
  const N030 = 'Seine Mühle. Ich hab sein Mehl zehn Jahre lang gefahren, drüben nach Eichental. Ich bin Harrik. Und Eichental gibt\'s nicht mehr.';

  /** n040 with Charisma 12, Strength 10, 100 gold, topic Grimmbart known (answer a was chosen before and is spent). */
  function mainChoiceTalker() {
    return [
      answer('Ihr seid alle aus Eichental?', '', 'none', { enabled: false, alreadyChosen: true }),
      answer('Lindenhain nimmt Flüchtlinge auf. Ihr müsst nicht stehlen.', '[Überzeugen 12]', 'check', { attributeKey: 'charisma' }),
      answer('Zieht ab, oder ich hole mir eure Köpfe. Einen nach dem anderen.', '[Einschüchtern 14 · dein Wert 12]', 'check',
        { enabled: false, attributeKey: 'charisma' }),
      answer('Die Silberwacht rückt morgen mit dreißig Mann an.', '[Lügen 12]', 'check', { attributeKey: 'charisma' }),
      answer('Nehmt das Gold und verschwindet.', '[77 Gold]', 'bribe'),
      answer('Wem zahlt ihr eigentlich Tribut?'),
      answer('Dann regeln wir das mit Stahl.', '[Angriff]', 'combat'),
      answer('Ich komme wieder.', '[Ende]', 'end')
    ];
  }

  /** n040 with the knife at Harrik's throat, default values (Charisma 10, Strength 10, no gold). */
  function mainChoiceKnife() {
    return [
      answer('Ihr seid alle aus Eichental?'),
      answer('Lindenhain nimmt Flüchtlinge auf. Ihr müsst nicht stehlen.', '[Überzeugen 12 · dein Wert 10]', 'check',
        { enabled: false, attributeKey: 'charisma' }),
      answer('Zieht ab, oder ich hole mir eure Köpfe. Einen nach dem anderen.', '[Einschüchtern 14]', 'check', { attributeKey: 'charisma' }),
      answer('Die Silberwacht rückt morgen mit dreißig Mann an.', '[Lügen 12 · dein Wert 10]', 'check',
        { enabled: false, attributeKey: 'charisma' }),
      answer('Nehmt das Gold und verschwindet.', '[80 Gold]', 'bribe', { enabled: false }),
      answer('Dann regeln wir das mit Stahl.', '[Angriff]', 'combat'),
      answer('Du drückst die Klinge tiefer.', '[Töten]', 'kill', { requiresHold: true }),
      answer('Ich komme wieder.', '[Ende]', 'end')
    ];
  }

  const HOLLMANN = 'Hollmann';
  const GREETING = 'Na, Rissgeborener? Was gibt\'s?';

  /**
   * A hub with every kind of marking of GDD 02, 12.4 (the examples of its table): new quest "!", quest progress ◆, quest
   * completion ★ (StartQuest / SetQuestStage / CompleteQuest behind the answer), a requirement that is not met ("[Tributbuch]",
   * greyed), trade, an answer chosen before (60 % opacity, still selectable) and the end.
   */
  function markingsHub() {
    return [
      answer('Was ist mit dem Steinbruch?', '', 'none', { symbolText: '!' }),
      answer('Ich kümmere mich um Grimmbart.', '', 'none', { symbolText: '◆' }),
      answer('Hier ist Grimmbarts Bart.', '', 'none', { symbolText: '★' }),
      answer('Hier steht, was ihr Grimmbart zahlt.', '[Tributbuch]', 'requirement', { enabled: false }),
      answer('Zeig mir deine Waren.', '[Handel]', 'trade'),
      answer('Ihr seid aus Eichental?', '', 'none', { alreadyChosen: true }),
      answer('Ich komme wieder.', '[Ende]', 'end')
    ];
  }

  const SCENES = {
    dialog(layers) {
      AF.addBackground('ruhe');
      dialogueLayers(layers);
      calmHud(layers.hud, 'KeyboardMouse', 0.72);
      dialogueScreen(layers.screens, {
        family: 'KeyboardMouse', mode: 'choice', speaker: 'Harrik', pages: paginate(N030), options: mainChoiceTalker(), focus: 1
      });
    },
    dialog_zeile(layers) {
      AF.addBackground('ruhe');
      dialogueLayers(layers);
      calmHud(layers.hud, 'KeyboardMouse', 0.72);
      dialogueScreen(layers.screens, { family: 'KeyboardMouse', mode: 'line', speaker: HARRIK_ROLE, pages: paginate(N020), page: 0 });
    },
    dialog_markierungen(layers) {
      AF.addBackground('ruhe');
      dialogueLayers(layers);
      calmHud(layers.hud, 'Xbox', 1);
      dialogueScreen(layers.screens, {
        family: 'Xbox', mode: 'choice', speaker: HOLLMANN, pages: paginate(GREETING), options: markingsHub(), focus: 2
      });
    },
    dialog_gamepad(layers) {
      AF.addBackground('ruhe');
      dialogueLayers(layers);
      calmHud(layers.hud, 'PlayStation', 0.72);
      dialogueScreen(layers.screens, {
        family: 'PlayStation', mode: 'choice', speaker: 'Harrik', pages: paginate(N030), options: mainChoiceKnife(), focus: 6,
        hold: { index: 6, progress: 0.6 }, auto: true
      });
    }
  };

  try {
    const build = SCENES[D.scene];
    if (!build) {
      AF.fail('Unbekannte Szene: ' + D.scene);
    } else {
      build(AF.createPanel());
    }

    AF.renderTexts();
    AF.addPreviewBar();
  } catch (error) {
    AF.fail(String(error && error.stack ? error.stack : error));
  }

  window.AF_DONE = true;
})();
