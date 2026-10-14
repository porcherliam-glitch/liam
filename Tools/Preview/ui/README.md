# UI-Vorschau ohne Unity (HTML-Nachbau)

Stand: 2026-10-14 (Panel-Größe, 150-%-Szenen, Layout-Prüfung)

## Wozu?

Die Oberfläche (Hauptmenü, Pausemenü, HUD, Todesbildschirm, Ladebildschirm) ist mit **UI Toolkit** gebaut: Layouts als UXML, Aussehen als USS. Solange Unity nicht läuft, kann man sie nicht ansehen. Dieses Werkzeug baut die Bildschirme deshalb als **HTML-Seite im Browser** nach und macht davon Bilder (900 Pixel hoch, bei 16:9 also 1600 × 900). Dabei prüft es, ob etwas aus dem Bild ragt, ob Texte in ihre Felder passen und ob sich Teile überlappen (Abschnitt „Layout-Prüfung“).

**Wichtig: Das sind Vorschauen, keine Unity-Screenshots.** Jedes Bild trägt unten den Balken „Vorschau – HTML-Nachbau der Unity-Oberfläche (kein Unity-Screenshot)“.

## Woher die Werte kommen

Nichts ist von Hand abgezeichnet. Das Skript liest bei jedem Lauf **dieselben Dateien wie Unity**:

| Teil | Quelle |
|---|---|
| Aufbau (welches Element wo, Namen, Klassen) | `Assets/_Project/Art/UI/Layouts/*.uxml` |
| Farben, Maße, Abstände, Schriftgrößen | `Assets/_Project/Art/UI/Theme/AetherfallTheme.tss` und die USS-Dateien, die es einbindet (`Styles/Tokens.uss`, `Base.uss`, `Menus.uss`, `Hud.uss`, `Toasts.uss`, `Loading.uss`) |
| Alle Texte | `Assets/_Project/Scripts/UI/Framework/UiTexts.cs` (zentrale Texttabelle) |
| Tastensymbole je Gerät | `Assets/_Project/Scripts/UI/Framework/GlyphCatalog.cs` und `GlyphNames.cs` |
| Größe der Oberfläche bei einer UI-Größe | `Assets/_Project/Scripts/UI/Framework/UiScaleRules.cs` (Grenzen `MinLogicalWidth`/`MinLogicalHeight`, gleiche Rechnung wie in Unity) |
| Zustand im Bild (Fokus, Balken, Meldungen) | `szenen.js`: bildet den Code in `Assets/_Project/Scripts/UI/Screens/` nach (z. B. `MainMenuScreen`, `PauseMenuScreen`, `HudView`, `ToastView`) |

Ändert sich eine UXML-, USS- oder Textdatei, zeigt der nächste Lauf automatisch den neuen Stand. Wird ein Element in einer UXML-Datei umbenannt, das der Code braucht, bricht das Skript mit einer Meldung ab.

Nur die **Beispielwerte** in `szenen.js` sind ausgedacht: Lebenspunkte, Gegnername „Grauwolf“, Spielstände vom 13./14.10.2026, Meldungen wie „Wolfsfell ×2“ oder „Stufe 2 erreicht!“.

## Was entsteht?

| Datei | Inhalt |
|---|---|
| `hud.png` | HUD im Kampf über einem neutralen Spielhintergrund: Kompass, Zielanzeige „Grauwolf“ mit Haltung, Lebens-, Ausdauer- und Manabalken mit Verzögerungsbalken, Fähigkeiten 1–4, Schnellslots, Hinweis „[E] Aufheben: Wolfsfell“, Meldungen (Stufe, Speichern, Beute, Gold, EP), Speicher-Anzeige; Tastatur-Symbole |
| `hud_gamepad.png` | dasselbe mit **PlayStation**-Symbolen (× ○ □ ▲, L1/R1) |
| `pausemenue.png` | Pausemenü, Reiter System: Fokus auf „Hauptmenü“, Halten-zum-Bestätigen zu 55 % gefüllt, rechts der letzte Spielstand |
| `pausemenue_laden.png` | Pausemenü, Reiter Laden: Liste der Spielstände mit Art, Datum und Spielzeit, ein beschädigter Stand (nicht wählbar); PlayStation-Symbole |
| `hauptmenue.png` | Hauptmenü mit Titel „Chroniken von Aetherfall“, Fokus auf „Neues Spiel“, „Fortsetzen“ mit dem neuesten Stand |
| `hauptmenue_optionen.png` | Hauptmenü mit geöffneter Optionen-Seite (UI-Größe, HUD-Anzeige, Tastensymbole); **Xbox**-Symbole |
| `todesbildschirm.png` | „Du bist gefallen“ mit „Letzten Stand laden“ und „Am Spawnpunkt wiederbeleben“; Xbox-Symbole |
| `ladebildschirm.png` | Ladebildschirm „Testgelände“ bei 64 % |
| `hauptmenue_laden_150.png` | Hauptmenü mit geöffneter Seite „Spielstand laden“ bei **UI-Größe 150 %** auf einem Mac-Bildschirm (16:10, 2880 × 1800): durch die Grenze aus `UiScaleRules` etwa 107 %, Panel 1620 × 1013 |
| `pausemenue_150.png` | Pausemenü bei **UI-Größe 150 %** auf 1920 × 1080 (16:9): etwa 118 %, Panel 1620 × 911 |
| `*.html`, `aetherfall_ui.css` | die erzeugten Seiten (im Browser öffnen) und das umgewandelte CSS |

## Voraussetzungen

- **Node.js** 18 oder neuer
- npm-Paket **playwright** mit Chromium: `npm install -g playwright` und danach `npx playwright install chromium`
- Schrift **Liberation Sans** (unter Linux meist vorhanden; sonst nimmt der Browser Arial)

## Aufruf

Vom Repo-Ordner aus:

```bash
node Tools/Preview/ui/vorschau_ui.cjs                       # alle Bilder nach Tools/Preview/ui/Ausgabe/ (von Git ignoriert)
node Tools/Preview/ui/vorschau_ui.cjs --out /pfad/zum/ordner
node Tools/Preview/ui/vorschau_ui.cjs --szene hud --szene hauptmenue   # nur einzelne Bilder
node Tools/Preview/ui/vorschau_ui.cjs --nur-html            # nur die HTML-Seiten, ohne Browser
node Tools/Preview/ui/vorschau_ui.cjs --hintergrund Tools/Preview/Ausgabe/03_spielersicht_roh.png
node Tools/Preview/ui/vorschau_ui.cjs --panel 1620x840 --streng   # alle Bilder in einer festen Panel-Größe, Layout-Warnungen = Fehler
```

`--panel BREITExHOEHE` legt die **logische** Größe der Oberfläche fest (in Punkten, wie das Panel in Unity sie sieht): `1920x1080` ist 100 % auf 16:9, `1280x720` wäre 150 % ohne Grenze, `1620x840` die kleinste Fläche, die `UiScaleRules` zulässt. Ohne die Option nimmt jede Szene ihre eigene Größe (100 %, bzw. die 150-%-Szenen ihre begrenzte Größe).

Mit `--hintergrund` liegt ein beliebiges Bild hinter HUD, Pausemenü und Todesbildschirm, z. B. die Spielersicht aus dem Blender-Nachbau des Testgeländes ([../README.md](../README.md)). Ohne die Option malt das Skript einen schlichten grauen Hintergrund (Himmel, Boden mit Raster, Figur, ein Wolf).

Ein Lauf dauert wenige Sekunden (alle zehn Bilder etwa 5 s).

## Layout-Prüfung

Nach dem Aufbau jeder Szene misst das Skript im Browser nach und meldet **LAYOUT-WARNUNG** mit dem Elementnamen, wenn

- ein Element aus dem Bild ragt (ausgenommen die Zierformen im Hintergrund von Hauptmenü und Ladebildschirm),
- ein Knopf, eine Liste oder ein Tastenhinweis aus seinem Feld ragt (Seite im Hauptmenü, Fenster des Pausemenüs),
- ein Text breiter ist als sein Element,
- sich Knöpfe, Tastenhinweise, Titel und Hinweistexte überlappen (z. B. die Fußzeile über „Beenden“).

Mit `--streng` bricht das Skript dann mit Fehler ab. So wurden die Grenzen in `UiScaleRules.cs` bestimmt: Mit `--panel` schrittweise kleinere Flächen ausprobieren, bis die erste Warnung kommt (Stand 14.10.2026: ab etwa 1590 Punkten Breite bzw. 830 Punkten Höhe).

## So funktioniert der Nachbau

- **Größe:** Die Seite hat die logische Größe des Panels: 1920 × 1080 Punkte bei 100 % auf 16:9 (Referenzauflösung der Panel Settings), kleiner bei größerer UI-Größe (Bildschirm ÷ (Höhe/1080 × Skalierung), wie `UiScaleRules.PanelScale`). Aufgenommen wird mit 900 Pixeln Höhe. Das entspricht der Skalierung nach Bildschirmhöhe in Unity (`Scale With Screen Size`, Abgleich an der Höhe) mal der UI-Größe.
- **Layout:** Jedes UXML-Element wird ein `<div>` mit den Grundwerten von UI Toolkit: Flexbox in Spalten, `position: relative`, Rahmen und Innenabstand zählen zur Größe, keine Außenabstände.
- **USS → CSS:** fast alles wird 1:1 übernommen (USS ist CSS sehr ähnlich, auch die Farb-Variablen `var(--…)`). Angepasst werden nur:
  - `-unity-font-style` → `font-weight`/`font-style`
  - `-unity-text-align` → eigene Ausrichtung der Texte (wie in UI Toolkit im Inhaltsbereich des Elements)
  - `white-space` → mehrere Leerzeichen bleiben erhalten wie in Unity („◄  100 %  ►“)
  - `transition-*` entfällt: Die Bilder zeigen den Endzustand der Öffnen-Animation (0,15 s)
- **Texte von Knöpfen mit Kindelementen** (z. B. „Fortsetzen“ mit Datumszeile) liegen wie in Unity über dem Inhaltsbereich und nehmen keinen Platz im Layout ein.

## Grenzen

- **Schrift:** Unity nutzt die Standardschrift des Runtime-Themes, hier Liberation Sans (gleiche Maße wie Arial). Laufweite und Zeilenhöhe können um wenige Pixel abweichen, fett wirkt im Browser etwas kräftiger.
- **Unity-Standard-Theme:** Die eingebaute Datei `unity-theme://default` gibt es außerhalb von Unity nicht. Für die Menüknöpfe spielt sie keine Rolle: `UiElementUtility.BindItem` nimmt ihnen die Standardklasse `unity-button` weg (deren Zustände `:enabled:hover`/`:active` würden sonst die eigenen Regeln überstimmen). Knöpfe haben deshalb keinen eigenen Maus-Zustand, der Mauszeiger setzt nur den Fokus. Texte tragen die Klasse `af-text`, die Abstände und Ausrichtung selbst festlegt.
- **Keine Bewegung:** Öffnen/Schließen-Übergänge, Blinken bei „Erschöpft“, die drehende Speicher-Anzeige und der nachziehende Verlustbalken sind Standbilder eines Moments.
- **Kein Spiel dahinter:** Der Hintergrund ist eine Attrappe. Im Spiel liegt die 3D-Szene dahinter; Kontraste können sich dort anders anfühlen.
- **Zustand nachgebildet:** `szenen.js` muss angepasst werden, wenn sich die C#-Bildschirme ändern (welches Element was anzeigt). Farben, Maße und Texte dagegen kommen immer automatisch aus den Projektdateien.
