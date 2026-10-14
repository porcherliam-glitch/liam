/*
 * Browser side of the UI preview (loaded into every page by vorschau_ui.cjs).
 * Builds UI Toolkit-like DOM from the UXML files and mirrors the helpers of
 * Assets/_Project/Scripts/UI/Framework/UiElementUtility.cs (texts, glyph labels, display, bar fill, focus frame, open state).
 */
(function () {
  'use strict';

  const D = window.AF_DATA;
  const errors = [];
  const ALIGN_VERTICAL = { upper: 'flex-start', middle: 'center', lower: 'flex-end' };
  const ALIGN_HORIZONTAL = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const FAMILIES = ['KeyboardMouse', 'Xbox', 'PlayStation', 'Nintendo', 'Generic'];

  function fail(message) {
    errors.push(message);
  }

  /** Converts one UXML element (and its children) into divs below parent. */
  function convert(node, parent) {
    const type = node.localName;
    const element = document.createElement('div');
    element.dataset.type = type;
    if (type === 'Label') {
      element.classList.add('unity-text-element', 'unity-label');
    } else if (type === 'Button') {
      // UiElementUtility.BindItem removes "unity-button" from every menu item (the default theme does not style them).
      element.classList.add('unity-text-element');
    } else if (type !== 'VisualElement') {
      fail('Unbekannter UXML-Typ <' + node.nodeName + '> – bitte in seite.js ergänzen.');
    }

    for (const cls of (node.getAttribute('class') || '').split(/\s+/)) {
      if (cls) {
        element.classList.add(cls);
      }
    }

    const name = node.getAttribute('name');
    if (name) {
      element.dataset.name = name;
    }

    if (node.hasAttribute('text')) {
      element.dataset.text = node.getAttribute('text');
    }

    parent.appendChild(element);
    for (const child of node.children) {
      convert(child, element);
    }

    return element;
  }

  const AF = {
    errors,
    fail,

    /** Creates the panel (D.panel, 1920 x 1080 at 100 %) and one document root per layer, sorted like UILayer (HUD 0 ... Loading 40). */
    createPanel() {
      const panel = document.createElement('div');
      panel.className = 'af-panel-preview';
      const layers = {};
      for (const layer of ['hud', 'screens', 'toasts', 'loading']) {
        const root = document.createElement('div');
        root.className = 'unity-ui-document__root';
        root.dataset.layer = layer;
        panel.appendChild(root);
        layers[layer] = root;
      }

      document.body.appendChild(panel);
      return layers;
    },

    /** VisualTreeAsset.CloneTree(parent): the top elements of the UXML become children of parent. */
    clone(file, parent) {
      const source = D.uxml[file];
      if (!source) {
        fail('UXML fehlt: ' + file);
        return [];
      }

      const xml = new DOMParser().parseFromString(source, 'application/xml');
      const parserError = xml.querySelector('parsererror');
      if (parserError) {
        fail('UXML ' + file + ' ist fehlerhaft: ' + parserError.textContent);
        return [];
      }

      const created = [];
      for (const node of xml.documentElement.children) {
        created.push(convert(node, parent));
      }

      return created;
    },

    /** CloneTree into parent and return the first new child (UIRoot.CloneScreen). */
    cloneScreen(file, parent) {
      const created = AF.clone(file, parent);
      return created.length > 0 ? created[0] : null;
    },

    /** root.Q(name): the root itself or the first descendant with this name. Missing names are errors (renamed in UXML?). */
    q(root, name) {
      if (!root) {
        return null;
      }

      if (root.dataset && root.dataset.name === name) {
        return root;
      }

      const found = root.querySelector('[data-name="' + CSS.escape(name) + '"]');
      if (!found) {
        fail('Element „' + name + '“ nicht gefunden (in einer UXML-Datei umbenannt?)');
      }

      return found;
    },

    /** root.Q(className: cls). */
    qClass(root, cls) {
      return root ? root.querySelector('.' + CSS.escape(cls)) : null;
    },

    // ----- Texts (UiTexts.cs) -----

    text(key) {
      return Object.prototype.hasOwnProperty.call(D.texts, key) ? D.texts[key] : key;
    },

    /** UiTexts.Format: {0}, {1} ... */
    format(key, ...args) {
      return AF.text(key).replace(/\{(\d+)\}/g, (m, index) => String(args[Number(index)]));
    },

    /** UiTexts.ForElement: entry of the element name, else of the part after the first hyphen. */
    forElement(name) {
      if (!name) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(D.texts, name)) {
        return D.texts[name];
      }

      const hyphen = name.indexOf('-');
      if (hyphen > 0 && hyphen < name.length - 1) {
        const shared = name.substring(hyphen + 1);
        if (Object.prototype.hasOwnProperty.call(D.texts, shared)) {
          return D.texts[shared];
        }
      }

      return null;
    },

    /** UiElementUtility.ApplyTexts. */
    applyTexts(root) {
      for (const element of [root, ...root.querySelectorAll('div')]) {
        const type = element.dataset.type;
        if (type !== 'Label' && type !== 'Button') {
          continue;
        }

        const text = AF.forElement(element.dataset.name);
        if (text !== null) {
          AF.setText(element, text);
        }
      }
    },

    // ----- Glyphs (GlyphCatalog.cs, GlyphNames.cs) -----

    glyphOfName(name) {
      if (!name) {
        return null;
      }

      const marker = name.lastIndexOf(D.glyphIds.marker);
      if (marker < 0) {
        return null;
      }

      const id = name.substring(marker + D.glyphIds.marker.length);
      return Object.prototype.hasOwnProperty.call(D.glyphIds.ids, id) ? D.glyphIds.ids[id] : null;
    },

    /** UiElementUtility.CollectGlyphLabels. */
    collectGlyphLabels(root) {
      const labels = [];
      for (const element of [root, ...root.querySelectorAll('div')]) {
        if (element.dataset.type !== 'Label') {
          continue;
        }

        const glyph = AF.glyphOfName(element.dataset.name);
        if (glyph) {
          labels.push([element, glyph]);
        }
      }

      return labels;
    },

    glyph(glyph, family) {
      const map = D.glyphs.families[family];
      return map && Object.prototype.hasOwnProperty.call(map, glyph) ? map[glyph] : '?';
    },

    /** UiElementUtility.RefreshGlyphs: family class on the root, glyph texts on the labels. */
    refreshGlyphs(root, labels, family) {
      for (const each of FAMILIES) {
        root.classList.toggle(D.glyphs.styleClasses[each], each === family);
      }

      for (const [label, glyph] of labels) {
        AF.setText(label, AF.glyph(glyph, family));
      }
    },

    // ----- Element state (UiElementUtility) -----

    setText(element, text) {
      if (element) {
        element.dataset.text = text == null ? '' : String(text);
      }
    },

    setDisplayed(element, displayed) {
      if (element) {
        element.style.display = displayed ? 'flex' : 'none';
      }
    },

    setFill(element, normalized) {
      if (element) {
        const value = Number.isNaN(normalized) ? 0 : Math.max(0, Math.min(1, normalized));
        element.style.width = value * 100 + '%';
      }
    },

    setFocused(element, focused) {
      if (element) {
        element.classList.toggle('is-focused', focused);
      }
    },

    setDisabled(element, disabled) {
      if (element) {
        element.classList.toggle('is-disabled', disabled);
      }
    },

    enableClass(element, cls, enabled) {
      if (element) {
        element.classList.toggle(cls, enabled);
      }
    },

    hideImmediately(root) {
      root.classList.add('is-hidden', 'is-closing');
      root.style.display = 'none';
    },

    /** End state of ShowAnimated: classes removed (transition finished), displayed, in front. */
    showOpen(root) {
      root.classList.remove('is-closing', 'is-hidden');
      root.style.display = 'flex';
      root.parentNode.appendChild(root);
    },

    // ----- Finish -----

    /** Draws the texts like a TextElement: in the content box, aligned by -unity-text-align. */
    renderTexts() {
      for (const element of document.querySelectorAll('.af-panel-preview div[data-text]')) {
        const text = element.dataset.text;
        if (!text) {
          continue;
        }

        const style = getComputedStyle(element);
        const align = (style.getPropertyValue('--uta').trim() || 'upper-left').split('-');
        const vertical = ALIGN_VERTICAL[align[0]] || 'flex-start';
        const horizontal = ALIGN_HORIZONTAL[align[1]] || 'flex-start';
        const span = document.createElement('span');
        span.className = 'u-text';
        span.textContent = text;
        span.style.textAlign = align[1] || 'left';
        const hasChildren = element.querySelector(':scope > div') !== null;
        if (hasChildren) {
          span.classList.add('u-text--overlay');
          span.style.left = style.paddingLeft;
          span.style.right = style.paddingRight;
          span.style.top = style.paddingTop;
          span.style.bottom = style.paddingBottom;
          span.style.alignItems = vertical;
          span.style.justifyContent = horizontal;
          element.insertBefore(span, element.firstChild);
        } else {
          element.style.flexDirection = 'row';
          element.style.alignItems = vertical;
          element.style.justifyContent = horizontal;
          element.appendChild(span);
        }
      }
    },

    addBackground(kind) {
      const background = document.createElement('div');
      background.className = 'sh';
      if (D.background) {
        background.classList.add('sh--bild');
        background.style.backgroundImage = 'url("' + D.background + '")';
      } else {
        background.innerHTML = [
          '<div class="sh__boden"></div>',
          '<div class="sh__raster"></div>',
          '<div class="sh__dunst"></div>',
          '<div class="sh__block" style="left:140px;top:388px;width:300px;height:120px"></div>',
          '<div class="sh__block" style="left:470px;top:410px;width:180px;height:96px;background:#7A838B"></div>',
          '<div class="sh__block" style="left:1500px;top:396px;width:260px;height:110px;background:#6A737B"></div>',
          kind === 'kampf' ? [
            '<div class="sh__schatten" style="left:1100px;top:556px;width:240px;height:26px"></div>',
            '<div class="sh__wolf">',
            '<div class="sh__wolf-bein" style="left:48px"></div><div class="sh__wolf-bein" style="left:74px"></div>',
            '<div class="sh__wolf-bein" style="left:140px"></div><div class="sh__wolf-bein" style="left:164px"></div>',
            '<div class="sh__wolf-koerper"></div><div class="sh__wolf-kopf"></div>',
            '</div>',
            '<div class="sh__schatten" style="left:850px;top:718px;width:90px;height:20px"></div>',
            '<div class="sh__beute"></div>'
          ].join('') : '',
          '<div class="sh__schatten" style="left:880px;top:890px;width:260px;height:56px"></div>',
          '<div class="sh__schild"></div>',
          '<div class="sh__spieler"></div>'
        ].join('');
      }

      // The stand-in is drawn for 1920 x 1080: scale it so it covers the panel and centre it.
      const scale = Math.max(D.panel.width / 1920, D.panel.height / 1080);
      background.style.transform = 'translate(' + (D.panel.width - 1920 * scale) / 2 + 'px, ' + (D.panel.height - 1080 * scale) / 2 +
        'px) scale(' + scale + ')';
      document.body.insertBefore(background, document.body.firstChild);
    },

    addPreviewBar() {
      const bar = document.createElement('div');
      bar.className = 'af-preview-bar';
      bar.textContent = D.barText;
      // Same size in the image at every panel size (the bar is drawn for 1080 lines).
      const factor = D.panel.height / 1080;
      bar.style.height = 29 * factor + 'px';
      bar.style.fontSize = 16 * factor + 'px';
      document.body.appendChild(bar);
    },

    /**
     * Layout check (warnings, no errors): finds parts of the screens that stick out of the panel, texts that do not fit
     * into their element and items that overlap (e.g. a footer hint over a button). Hidden elements and the decorative
     * main menu backdrop are skipped. Meant for the larger UI sizes (GDD 05 1.6: "damit sich nichts überlappt").
     */
    checkLayout() {
      const warnings = [];
      const panel = document.querySelector('.af-panel-preview');
      if (!panel) {
        return warnings;
      }

      const bounds = panel.getBoundingClientRect();
      const tolerance = 1.5;
      const visible = (element) => {
        for (let e = element; e && e !== panel; e = e.parentElement) {
          const style = getComputedStyle(e);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
          }
        }

        return true;
      };
      // Decorative shapes that are meant to reach beyond the screen edge.
      const skipped = (element) => element.closest('.af-mainmenu__backdrop, .af-loading__glow') !== null;
      const describe = (element) => {
        const textElement = element.dataset.text ? element : element.querySelector('[data-text]:not([data-text=""])');
        const text = textElement ? textElement.dataset.text : '';
        const cls = Array.from(element.classList).filter((c) => c.startsWith('af-') && c !== 'af-text').join('.');
        return (element.dataset.name || '.' + cls) + (text ? ' („' + text.replace(/\s+/g, ' ').trim().substring(0, 28) + '“)' : '');
      };

      // 1) Sticks out of the panel.
      for (const element of panel.querySelectorAll('div[data-type]')) {
        if (skipped(element) || !visible(element)) {
          continue;
        }

        const r = element.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          continue;
        }

        if (r.left < bounds.left - tolerance || r.top < bounds.top - tolerance || r.right > bounds.right + tolerance ||
            r.bottom > bounds.bottom + tolerance) {
          const parent = element.parentElement && element.parentElement.closest('div[data-type]');
          // Report only the outermost element that sticks out, not all of its children.
          const parentOut = parent && !skipped(parent) && (() => {
            const p = parent.getBoundingClientRect();
            return p.left < bounds.left - tolerance || p.top < bounds.top - tolerance || p.right > bounds.right + tolerance ||
              p.bottom > bounds.bottom + tolerance;
          })();
          if (!parentOut) {
            warnings.push('ragt aus dem Bild: ' + describe(element) + ' [' + Math.round(r.left) + ', ' + Math.round(r.top) + ' – ' +
              Math.round(r.right) + ', ' + Math.round(r.bottom) + ']');
          }
        }
      }

      // 1b) Sticks out of the framed box it belongs to (page panel of the main menu, pause panel).
      for (const element of panel.querySelectorAll('.af-button, .af-menu-list, .af-slot-list, .af-page__title, .af-hint')) {
        const frame = element.parentElement ? element.parentElement.closest('.af-mainmenu__page, .af-panel') : null;
        if (!frame || skipped(element) || !visible(element)) {
          continue;
        }

        const r = element.getBoundingClientRect();
        const f = frame.getBoundingClientRect();
        if (r.left < f.left - tolerance || r.top < f.top - tolerance || r.right > f.right + tolerance || r.bottom > f.bottom + tolerance) {
          warnings.push('ragt aus seinem Feld: ' + describe(element) + ' (Feld ' + describe(frame) + ')');
        }
      }

      // 2) Text wider or taller than its element.
      for (const span of panel.querySelectorAll('.u-text')) {
        const element = span.parentElement;
        if (skipped(element) || !visible(element)) {
          continue;
        }

        const r = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const left = r.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = r.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const range = document.createRange();
        range.selectNodeContents(span);
        const t = range.getBoundingClientRect();
        if (t.width > 0 && (t.left < left - tolerance || t.right > right + tolerance)) {
          warnings.push('Text passt nicht hinein: ' + describe(element) + ' (Text ' + Math.round(t.width) + ' px, Platz ' +
            Math.round(right - left) + ' px)');
        }
      }

      // 3) Items that overlap each other (neither contains the other).
      const solid = Array.from(panel.querySelectorAll(
        '.af-button, .af-tab, .af-hint, .af-version, .af-title, .af-subtitle, .af-divider, .af-page__title, .af-page__note, ' +
        '.af-page__empty, .af-page__status, .af-pause__info-title, .af-pause__last-save, .af-pause__status, .af-death__title, ' +
        '.af-death__subtitle, .af-death__info, .af-mainmenu__page'))
        .filter((element) => !skipped(element) && visible(element));
      const rects = solid.map((element) => element.getBoundingClientRect());
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
          if (solid[i].contains(solid[j]) || solid[j].contains(solid[i])) {
            continue;
          }

          const a = rects[i];
          const b = rects[j];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) {
            warnings.push('überlappt: ' + describe(solid[i]) + ' und ' + describe(solid[j]));
          }
        }
      }

      return warnings;
    }
  };

  window.AF = AF;
})();
