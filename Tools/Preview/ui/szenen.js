/*
 * Scenes of the UI preview. Every builder mirrors the C# view code in Assets/_Project/Scripts/UI/Screens (constructor + OnOpen
 * + the state of one moment): MainMenuScreen, PauseMenuScreen, DeathScreen, SaveSlotListView, OptionsPageView, HudView with
 * HudVisibilityRules, ToastView with NotificationRules.FormatText, LoadingScreenView, and UiStateDirector for the layers.
 * Element names, classes and texts come from the UXML files and UiTexts.cs; only the example values (bars, saves, messages)
 * are made up here. If the C# views change, change the matching builder.
 */
(function () {
  'use strict';

  const AF = window.AF;
  const D = window.AF_DATA;

  /** Application.version of a new Unity project (Player Settings > Version). */
  const VERSION = '0.1';

  /** Example saves of the test character, newest first (ISaveManager.ListSlots). Local date: year, month, day, hour, minute. */
  const SAVES = [
    { slotId: 'char_01/quick_0', kind: 'Quick', local: [2026, 10, 14, 21, 14], playtime: 1394, damaged: false },
    { slotId: 'char_01/auto_1', kind: 'Auto', local: [2026, 10, 14, 21, 2], playtime: 1301, damaged: false },
    { slotId: 'char_01/manual_000', kind: 'Manual', local: [2026, 10, 14, 20, 37], playtime: 655, damaged: false },
    { slotId: 'char_01/auto_0', kind: 'Auto', local: [2026, 10, 13, 22, 48], playtime: 412, damaged: true }
  ];

  /** UiPreferences defaults: 100 %, contextual HUD, automatic glyphs (the UI size of the scene comes from vorschau_ui.cjs). */
  const PREFERENCES = { uiPercent: D.uiPercent || 100, hudMode: 'Contextual', glyphStyle: null };

  // ===================================================================================================================
  // Framework mirrors (pure logic of Aetherfall.UI.Framework)
  // ===================================================================================================================

  /** SaveSlotText */
  const SlotText = {
    kindName(kind) {
      switch (kind) {
        case 'Auto': return AF.text('slot-kind-auto');
        case 'Quick': return AF.text('slot-kind-quick');
        case 'Milestone': return AF.text('slot-kind-milestone');
        default: return AF.text('slot-kind-manual');
      }
    },
    playtime(seconds) {
      const totalMinutes = seconds > 0 ? Math.floor(seconds / 60) : 0;
      return AF.format('fmt-playtime', String(Math.floor(totalMinutes / 60)), String(totalMinutes % 60).padStart(2, '0'));
    },
    dateTime(local) {
      const two = (n) => String(n).padStart(2, '0');
      return two(local[2]) + '.' + two(local[1]) + '.' + local[0] + ', ' + two(local[3]) + ':' + two(local[4]);
    },
    playtimeLine(seconds) {
      return AF.format('fmt-slot-playtime', SlotText.playtime(seconds));
    }
  };

  /** NotificationRules.FormatText */
  function formatNotification(kind, text, amount) {
    switch (kind) {
      case 'Item': return amount > 1 ? AF.format('fmt-note-item-count', text, amount) : text;
      case 'Currency': return AF.format(amount >= 0 ? 'fmt-note-currency-gain' : 'fmt-note-currency-loss', Math.abs(amount), text);
      case 'Experience': return AF.format('fmt-note-xp', amount);
      case 'LevelUp': return AF.format('fmt-note-levelup', amount);
      case 'Summary': return AF.format('fmt-note-summary', amount);
      default: return text;
    }
  }

  /** UiFlowRules.ShowsHud */
  function showsHud(state) {
    return ['Playing', 'Paused', 'Menu', 'Dialogue', 'Building'].includes(state);
  }

  /** HudVisibilityRules.Update for one frame after Reset (contextual mode). */
  function hudVisibility(context, mode) {
    const sinceCombat = context.inCombat ? 0 : Infinity;
    const staminaFullFor = context.stamina01 >= 1 ? Infinity : 0;
    const manaFullFor = context.mana01 >= 1 ? Infinity : 0;
    if (mode === 'Full') {
      return { health: true, stamina: true, mana: true, abilities: true, quick: true, compass: true };
    }

    if (mode === 'Minimal') {
      return { health: context.health01 < 0.3, stamina: context.exhausted, mana: false, abilities: false, quick: false, compass: false };
    }

    const combatGlow = sinceCombat <= 4;
    return {
      health: context.health01 < 1 || sinceCombat <= 4,
      stamina: staminaFullFor <= 2 || context.exhausted,
      mana: manaFullFor <= 2 || context.inCombat,
      abilities: combatGlow,
      quick: combatGlow,
      compass: true
    };
  }

  /** CompassMath.DeltaAngle / TryGetStripPosition */
  function deltaAngle(from, to) {
    let delta = (to - from) % 360;
    if (delta <= -180) {
      delta += 360;
    } else if (delta > 180) {
      delta -= 360;
    }

    return delta;
  }

  // ===================================================================================================================
  // UI.Screens mirrors
  // ===================================================================================================================

  /** MenuItemList with its FocusGroup (vertical, wrapping). */
  class MenuList {
    constructor() {
      this.items = [];
      this.hold = [];
      this.fills = [];
      this.enabled = [];
      this.current = -1;
    }

    add(element, requiresHold) {
      if (!element) {
        return -1;
      }

      this.items.push(element);
      this.hold.push(!!requiresHold);
      this.fills.push(element.querySelector('.af-button__hold-fill'));
      this.enabled.push(true);
      if (this.current < 0) {
        this.current = 0;
      }

      return this.items.length - 1;
    }

    setEnabled(index, enabled) {
      this.enabled[index] = enabled;
      AF.setDisabled(this.items[index], !enabled);
      if (!enabled && this.current === index) {
        this.current = this.nearestEnabled(index);
      }
    }

    nearestEnabled(position) {
      for (let offset = 0; offset < this.items.length; offset++) {
        if (position + offset < this.items.length && this.enabled[position + offset]) {
          return position + offset;
        }

        if (position - offset >= 0 && this.enabled[position - offset]) {
          return position - offset;
        }
      }

      return -1;
    }

    focusFirst() {
      this.current = this.enabled.indexOf(true);
    }

    restore(index) {
      this.current = this.enabled[index] ? index : this.nearestEnabled(Math.max(0, Math.min(index, this.items.length - 1)));
    }

    refreshFocus(active = true) {
      this.items.forEach((item, i) => AF.setFocused(item, active && i === this.current));
    }

    setHoldProgress(index, progress01) {
      AF.setFill(this.fills[index], progress01);
    }
  }

  /** MenuScreen: root, active list, glyph labels. */
  class Screen {
    constructor(file, screensRoot, family) {
      this.root = AF.cloneScreen(file, screensRoot);
      this.family = family;
      AF.applyTexts(this.root);
      AF.hideImmediately(this.root);
      this.active = null;
      this.glyphLabels = [];
    }

    activate(list, focusIndex = -1) {
      if (this.active && this.active !== list) {
        this.active.refreshFocus(false);
      }

      this.active = list;
      if (focusIndex >= 0) {
        list.restore(focusIndex);
      } else if (list.current < 0) {
        list.focusFirst();
      }

      list.refreshFocus();
    }

    bindGlyphs() {
      this.glyphLabels = AF.collectGlyphLabels(this.root);
      AF.refreshGlyphs(this.root, this.glyphLabels, this.family);
    }

    open() {
      AF.refreshGlyphs(this.root, this.glyphLabels, this.family);
      AF.showOpen(this.root);
    }
  }

  /** SaveSlotListView */
  class SlotListView {
    constructor(host, list, holdToLoad) {
      this.list = list;
      this.holdToLoad = holdToLoad;
      AF.clone('LoadPage.uxml', host);
      AF.applyTexts(host);
      this.rows = AF.q(host, 'load-list');
      this.empty = AF.q(host, 'load-empty');
      this.status = AF.q(host, 'load-status');
      this.setStatus('');
    }

    refresh(slots) {
      this.rows.innerHTML = '';
      const count = Math.min(5, slots.length);
      for (let i = 0; i < count; i++) {
        const slot = slots[i];
        AF.clone('SaveSlotRow.uxml', this.rows);
        const row = this.rows.lastElementChild;
        AF.setText(AF.q(row, 'slot-kind'), slot.damaged ? AF.format('fmt-slot-damaged', SlotText.kindName(slot.kind)) : SlotText.kindName(slot.kind));
        AF.setText(AF.q(row, 'slot-date'), SlotText.dateTime(slot.local));
        AF.setText(AF.q(row, 'slot-playtime'), SlotText.playtimeLine(slot.playtime));
        AF.enableClass(row, 'is-damaged', slot.damaged);
        const index = this.list.add(row, this.holdToLoad);
        if (slot.damaged) {
          this.list.setEnabled(index, false);
        }
      }

      AF.setDisplayed(this.empty, count === 0);
      this.list.focusFirst();
      this.list.refreshFocus();
    }

    setStatus(text) {
      AF.setText(this.status, text);
      AF.setDisplayed(this.status, !!text);
    }
  }

  /** OptionsPageView */
  function optionsPage(host, list, preferences) {
    AF.clone('OptionsPage.uxml', host);
    AF.applyTexts(host);
    list.add(AF.q(host, 'options-ui-scale'));
    list.add(AF.q(host, 'options-hud-mode'));
    list.add(AF.q(host, 'options-glyphs'));
    const hudModeKey = { Full: 'hud-mode-full', Minimal: 'hud-mode-minimal', Contextual: 'hud-mode-contextual' }[preferences.hudMode];
    const glyphKey = preferences.glyphStyle === null ? 'glyph-style-auto'
      : { KeyboardMouse: 'glyph-style-keyboard', Xbox: 'glyph-style-xbox', PlayStation: 'glyph-style-playstation',
        Nintendo: 'glyph-style-nintendo', Generic: 'glyph-style-generic' }[preferences.glyphStyle];
    AF.setText(AF.q(host, 'options-ui-scale-value'), AF.format('fmt-option-value', AF.format('fmt-percent', preferences.uiPercent)));
    AF.setText(AF.q(host, 'options-hud-mode-value'), AF.format('fmt-option-value', AF.text(hudModeKey)));
    AF.setText(AF.q(host, 'options-glyphs-value'), AF.format('fmt-option-value', AF.text(glyphKey)));
  }

  /** MainMenuScreen. options: family, page ('main' | 'load' | 'options'), focus, hasSave. */
  function mainMenu(screensRoot, options) {
    const screen = new Screen('MainMenu.uxml', screensRoot, options.family);
    const root = screen.root;
    const main = new MenuList();
    for (const name of ['mainmenu-new-game', 'mainmenu-continue', 'mainmenu-load', 'mainmenu-options', 'mainmenu-quit']) {
      main.add(AF.q(root, name));
    }

    const pagePanel = AF.q(root, 'mainmenu-page');
    const loadHost = AF.q(root, 'mainmenu-load-page');
    const optionsHost = AF.q(root, 'mainmenu-options-page');
    const backHint = AF.q(root, 'mainmenu-hint-back-group');
    const continueInfo = AF.q(root, 'mainmenu-continue-info');
    const status = AF.q(root, 'mainmenu-status');
    const loadList = new MenuList();
    const loadPage = new SlotListView(loadHost, loadList, false);
    const optionsList = new MenuList();
    optionsPage(optionsHost, optionsList, PREFERENCES);
    AF.setText(AF.q(root, 'mainmenu-version'), AF.format('fmt-version', VERSION));
    screen.bindGlyphs();

    // OnOpen: ShowStatus(""), RefreshContinue(), ShowMainPage(NewGameItem)
    AF.setText(status, '');
    AF.setDisplayed(status, false);
    main.setEnabled(1, options.hasSave);
    const latest = SAVES[0];
    AF.setText(continueInfo, options.hasSave
      ? AF.format('fmt-continue-info', SlotText.kindName(latest.kind), SlotText.dateTime(latest.local))
      : AF.text('no-save'));

    const showPage = (page) => {
      AF.setDisplayed(pagePanel, true);
      AF.setDisplayed(loadHost, page === loadHost);
      AF.setDisplayed(optionsHost, page === optionsHost);
      AF.setDisplayed(backHint, true);
      main.refreshFocus(false);
    };

    AF.setDisplayed(pagePanel, false);
    AF.setDisplayed(backHint, false);
    screen.activate(main, options.focus);
    if (options.page === 'load') {
      loadPage.setStatus('');
      loadPage.refresh(SAVES);
      showPage(loadHost);
      screen.activate(loadList, options.pageFocus || 0);
    } else if (options.page === 'options') {
      showPage(optionsHost);
      screen.activate(optionsList, options.pageFocus || 0);
    }

    screen.open();
  }

  /** PauseMenuScreen. options: family, tab (0 System, 1 Laden, 2 Optionen), focus, hold {index, progress}, status {text, error}. */
  function pauseMenu(screensRoot, options) {
    const screen = new Screen('PauseMenu.uxml', screensRoot, options.family);
    const root = screen.root;
    const system = new MenuList();
    system.add(AF.q(root, 'pause-resume'));
    system.add(AF.q(root, 'pause-quicksave'));
    system.add(AF.q(root, 'pause-load'));
    system.add(AF.q(root, 'pause-options'));
    system.add(AF.q(root, 'pause-main-menu'), true);
    system.add(AF.q(root, 'pause-quit'), true);
    const status = AF.q(root, 'pause-status');
    const pages = [AF.q(root, 'pause-system-page'), AF.q(root, 'pause-load-page'), AF.q(root, 'pause-options-page')];
    const tabs = [AF.q(root, 'pause-tab-system'), AF.q(root, 'pause-tab-load'), AF.q(root, 'pause-tab-options')];
    const loadList = new MenuList();
    const loadPage = new SlotListView(pages[1], loadList, true);
    const optionsList = new MenuList();
    optionsPage(pages[2], optionsList, PREFERENCES);
    screen.bindGlyphs();

    let tab = 0;
    const selectTab = (next, focusIndex) => {
      tab = next;
      pages.forEach((page, i) => AF.setDisplayed(page, i === next));
      tabs.forEach((button, i) => AF.enableClass(button, 'is-selected', i === next));
      if (next === 1) {
        loadPage.setStatus('');
        loadPage.refresh(SAVES);
        screen.activate(loadList, 0);
      } else if (next === 2) {
        screen.activate(optionsList, 0);
      } else {
        screen.activate(system, focusIndex);
      }
    };

    const showStatus = (message, isError) => {
      if (tab === 1) {
        loadPage.setStatus(message);
      }

      AF.setText(status, message);
      AF.enableClass(status, 'is-error', isError && !!message);
      AF.enableClass(status, 'is-ok', !isError && !!message);
    };

    // OnOpen: ShowStatus, FocusFirst, SelectTab(System), RefreshSaveState, RefreshLastSave
    showStatus('', false);
    system.focusFirst();
    selectTab(0, 0);
    system.setEnabled(1, options.saveAllowed !== false);
    const latest = SAVES[0];
    AF.setText(AF.q(root, 'pause-last-save'), AF.format('fmt-continue-info', SlotText.kindName(latest.kind), SlotText.dateTime(latest.local)));

    // The moment shown
    selectTab(options.tab || 0, options.focus || 0);
    if (options.tab === 1 && typeof options.focus === 'number') {
      loadList.restore(options.focus);
      loadList.refreshFocus();
    }

    if (options.hold) {
      (options.tab === 1 ? loadList : system).setHoldProgress(options.hold.index, options.hold.progress);
    }

    if (options.status) {
      showStatus(options.status.text, options.status.error);
    }

    screen.open();
  }

  /** DeathScreen. options: family, hasSave. */
  function deathScreen(screensRoot, options) {
    const screen = new Screen('DeathScreen.uxml', screensRoot, options.family);
    const root = screen.root;
    const list = new MenuList();
    list.add(AF.q(root, 'death-load-last'));
    list.add(AF.q(root, 'death-respawn'));
    const loadInfo = AF.q(root, 'death-load-info');
    const status = AF.q(root, 'death-status');
    screen.bindGlyphs();
    screen.activate(list, 0);

    // OnOpen
    AF.setText(status, '');
    AF.setDisplayed(status, false);
    list.setEnabled(0, options.hasSave);
    const latest = SAVES[0];
    AF.setText(loadInfo, options.hasSave
      ? AF.format('fmt-continue-info', SlotText.kindName(latest.kind), SlotText.dateTime(latest.local))
      : AF.text('no-save'));
    list.focusFirst();
    screen.activate(list);
    screen.open();
  }

  /** HudView (constructor + one Tick). */
  function hud(hudRoot, state) {
    AF.clone('Hud.uxml', hudRoot);
    const root = hudRoot;
    AF.applyTexts(root);
    const glyphLabels = AF.collectGlyphLabels(root);
    const q = (name) => AF.q(root, name);
    const healthBar = q('hud-health');
    const staminaBar = q('hud-stamina');
    const manaBar = q('hud-mana');
    const exhausted = q('hud-stamina-exhausted');
    const targetPanel = q('hud-target');
    const prompt = q('hud-prompt');
    AF.setDisplayed(exhausted, false);
    AF.setDisplayed(targetPanel, false);
    AF.setDisplayed(prompt, false);
    AF.refreshGlyphs(root, glyphLabels, state.family);

    // Bars (DelayedBar: value and trail)
    AF.setFill(q('hud-health-fill'), state.health[0]);
    AF.setFill(q('hud-health-trail'), state.health[1]);
    AF.setFill(q('hud-stamina-fill'), state.stamina[0]);
    AF.setFill(q('hud-stamina-trail'), state.stamina[1]);
    AF.setFill(q('hud-mana-fill'), state.mana[0]);
    AF.setFill(q('hud-mana-trail'), state.mana[1]);
    AF.enableClass(healthBar, 'is-low', state.health[0] < 0.3);
    AF.enableClass(staminaBar, 'is-exhausted', !!state.exhausted);

    const rules = hudVisibility({
      health01: state.health[0], stamina01: state.stamina[0], mana01: state.mana[0], inCombat: state.inCombat, exhausted: !!state.exhausted
    }, PREFERENCES.hudMode);
    AF.setDisplayed(healthBar, rules.health);
    AF.setDisplayed(staminaBar, rules.stamina);
    AF.setDisplayed(manaBar, rules.mana);
    AF.setDisplayed(q('hud-abilities'), rules.abilities);
    AF.setDisplayed(q('hud-quickslots'), rules.quick);
    AF.setDisplayed(q('hud-compass'), rules.compass);
    AF.setDisplayed(exhausted, !!state.exhausted);

    // Target bar (lock-on)
    AF.setDisplayed(targetPanel, !!state.target);
    if (state.target) {
      AF.setText(q('hud-target-name'), state.target.name);
      AF.setFill(q('hud-target-health-fill'), state.target.health[0]);
      AF.setFill(q('hud-target-health-trail'), state.target.health[1]);
      AF.setFill(q('hud-target-poise-fill'), state.target.poise);
      AF.enableClass(q('hud-target-poise'), 'is-broken', !!state.target.poiseBroken);
    }

    // Interaction prompt
    AF.setDisplayed(prompt, !!state.prompt);
    if (state.prompt) {
      AF.setText(q('hud-prompt-text'), state.prompt);
    }

    // Compass (CompassMath, ±90°)
    const names = ['hud-compass-n', 'hud-compass-ne', 'hud-compass-e', 'hud-compass-se', 'hud-compass-s', 'hud-compass-sw', 'hud-compass-w', 'hud-compass-nw'];
    names.forEach((name, i) => {
      const label = q(name);
      const delta = deltaAngle(state.heading, i * 45);
      const visible = Math.abs(delta) <= 90;
      AF.setDisplayed(label, visible);
      if (visible) {
        label.style.left = (0.5 + delta / 180) * 100 + '%';
      }
    });

    // Quick slots (equipment)
    for (let i = 0; i < 4; i++) {
      const prefix = 'hud-quick-' + (i + 1);
      const item = state.quickSlots[i];
      AF.setText(q(prefix + '-name'), item ? item.name : AF.text('quick-empty'));
      AF.setText(q(prefix + '-count'), item ? String(item.count) : '');
      AF.enableClass(q(prefix), 'is-empty', !item);
    }
  }

  /** ToastView (one rebuild) with the save indicator. */
  function toasts(toastsRoot, entries, saving) {
    AF.clone('Toasts.uxml', toastsRoot);
    const root = toastsRoot;
    AF.applyTexts(root);
    const containers = [AF.q(root, 'toast-p0'), AF.q(root, 'toast-p1'), AF.q(root, 'toast-p2')];
    const indicator = AF.q(root, 'save-indicator');
    const icon = AF.q(root, 'save-indicator-icon');
    AF.setDisplayed(indicator, false);
    for (const entry of entries) {
      const container = containers[entry.priority];
      const element = AF.clone('ToastEntry.uxml', container)[0];
      AF.setText(AF.q(element, 'toast-text'), formatNotification(entry.kind, entry.text || '', entry.amount || 0));
      element.className = '';
      element.classList.add('af-toast', 'af-toast--p' + entry.priority);
      if (entry.accent) {
        element.classList.add('af-toast--' + entry.accent);
      }
    }

    AF.setDisplayed(indicator, !!saving);
    if (saving) {
      icon.style.rotate = 45 + saving.angle + 'deg';
    }
  }

  /** LoadingScreenView + LoadingScreenProxy (layer visible). */
  function loading(loadingRoot, title, progress) {
    AF.clone('Loading.uxml', loadingRoot);
    AF.applyTexts(loadingRoot);
    AF.setText(AF.q(loadingRoot, 'loading-title'), title || AF.text('loading-default'));
    AF.setFill(AF.q(loadingRoot, 'loading-progress-fill'), progress);
    AF.setText(AF.q(loadingRoot, 'loading-percent'), AF.format('fmt-percent', Math.round(progress * 100)));
  }

  /** UiStateDirector.Apply + LoadingScreenProxy: layer visibility of a game state (document root display). */
  function applyLayers(layers, state, loadingVisible) {
    AF.setDisplayed(layers.hud, showsHud(state));
    AF.setDisplayed(layers.loading, !!loadingVisible);
  }

  // ===================================================================================================================
  // Example states
  // ===================================================================================================================

  const QUICK_SLOTS = [{ name: 'Kleiner Heiltrank', count: 3 }, null, null, null];

  /** In combat with a locked-on wolf, loot on the ground. */
  function combatHud(family) {
    return {
      family,
      health: [0.64, 0.79],
      stamina: [0.38, 0.52],
      mana: [0.85, 0.85],
      inCombat: true,
      exhausted: false,
      target: { name: 'Grauwolf', health: [0.42, 0.61], poise: 0.55, poiseBroken: false },
      prompt: 'Aufheben: Wolfsfell',
      heading: 24,
      quickSlots: QUICK_SLOTS
    };
  }

  /** Out of combat, slightly hurt (context mode hides stamina, mana, abilities and quick slots). */
  function calmHud(family) {
    return {
      family,
      health: [0.72, 0.72],
      stamina: [1, 1],
      mana: [1, 1],
      inCombat: false,
      exhausted: false,
      target: null,
      prompt: '',
      heading: 338,
      quickSlots: QUICK_SLOTS
    };
  }

  const COMBAT_MESSAGES = [
    { priority: 0, kind: 'LevelUp', amount: 2, accent: 'levelup' },
    { priority: 1, kind: 'Message', text: 'Schnellspeicherung erstellt', accent: 'saved' },
    { priority: 2, kind: 'Item', text: 'Wolfsfell', amount: 2, accent: 'rarity-common' },
    { priority: 2, kind: 'Item', text: 'Lederwams', amount: 1, accent: 'rarity-rare' },
    { priority: 2, kind: 'Currency', text: 'Gold', amount: 23, accent: 'currency' },
    { priority: 2, kind: 'Experience', amount: 50, accent: 'xp' }
  ];

  const SCENES = {
    hud(layers) {
      AF.addBackground('kampf');
      applyLayers(layers, 'Playing', false);
      hud(layers.hud, combatHud('KeyboardMouse'));
      toasts(layers.toasts, COMBAT_MESSAGES, { angle: 30 });
    },
    hud_gamepad(layers) {
      AF.addBackground('kampf');
      applyLayers(layers, 'Playing', false);
      hud(layers.hud, combatHud('PlayStation'));
      toasts(layers.toasts, COMBAT_MESSAGES, { angle: 30 });
    },
    pausemenue(layers) {
      AF.addBackground('ruhe');
      applyLayers(layers, 'Paused', false);
      hud(layers.hud, calmHud('KeyboardMouse'));
      toasts(layers.toasts, [], null);
      pauseMenu(layers.screens, {
        family: 'KeyboardMouse',
        tab: 0,
        focus: 4,
        hold: { index: 4, progress: 0.55 },
        status: { text: AF.format('fmt-save-ok', SlotText.kindName('Quick')), error: false }
      });
    },
    pausemenue_laden(layers) {
      AF.addBackground('ruhe');
      applyLayers(layers, 'Paused', false);
      hud(layers.hud, calmHud('PlayStation'));
      toasts(layers.toasts, [], null);
      pauseMenu(layers.screens, { family: 'PlayStation', tab: 1, focus: 1, hold: { index: 1, progress: 0.3 } });
    },
    hauptmenue(layers) {
      applyLayers(layers, 'MainMenu', false);
      toasts(layers.toasts, [], null);
      mainMenu(layers.screens, { family: 'KeyboardMouse', page: 'main', focus: 0, hasSave: true });
    },
    hauptmenue_optionen(layers) {
      applyLayers(layers, 'MainMenu', false);
      toasts(layers.toasts, [], null);
      mainMenu(layers.screens, { family: 'Xbox', page: 'options', focus: 3, pageFocus: 0, hasSave: true });
    },
    hauptmenue_laden(layers) {
      applyLayers(layers, 'MainMenu', false);
      toasts(layers.toasts, [], null);
      mainMenu(layers.screens, { family: 'KeyboardMouse', page: 'load', focus: 2, pageFocus: 0, hasSave: true });
    },
    todesbildschirm(layers) {
      AF.addBackground('kampf');
      applyLayers(layers, 'Paused', false);
      const state = combatHud('Xbox');
      state.health = [0, 0.18];
      state.target = null;
      state.prompt = '';
      hud(layers.hud, state);
      toasts(layers.toasts, [], null);
      deathScreen(layers.screens, { family: 'Xbox', hasSave: true });
    },
    ladebildschirm(layers) {
      applyLayers(layers, 'Loading', true);
      toasts(layers.toasts, [], null);
      loading(layers.loading, 'Testgelände', 0.64);
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
