# Testanleitung Phase 1: Werte, Lebenspunkte, Ausdauer und Speichern

> Werte-System, Lebenspunkte/Schaden, Ausdauer der Spielfigur, Speichersystem, Spieler-Overlay · Stand: 2026-10-13 · Bezug: [Architektur 4.1, 4.4, 9, 11.4](../Technik/01_Architektur.md) · [GDD 03, Abschnitte 3.1, 4.3, 8, 10](../GDD/03_Kampf_Charakter_Progression.md) · [GDD 05, Abschnitt 5](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#5-speichern-aus-spielersicht-25)

> **Hinweis seit [Anleitung 07](./07_Test_Oberflaeche.md) (Oberfläche):** Die Entwickler-Overlays starten ausgeblendet – **F3** blendet sie ein und aus. **Esc** öffnet jetzt das neue Pausemenü; zum Klicken auf Overlay-Knöpfe geht auch **Tab** (Debug-Inventar, der Mauszeiger erscheint). Stirbt die Figur, erscheint der Todesbildschirm statt des automatischen Wiederbelebens. Mit Hauptmenü startest du über die Boot-Szene, der direkte Start im Testgelände geht weiterhin.

In diesem Schritt bekommt die Spielfigur **Werte**: Lebenspunkte (LP), Ausdauer und Mana. Sprinten und Springen kosten jetzt Ausdauer. Außerdem kann das Spiel zum ersten Mal **speichern und laden**: Position und Blickrichtung der Figur, LP, Ausdauer, Mana und die Spielzeit. Ein neues Fenster rechts oben im Spiel (das **Spieler-Overlay**) zeigt die Werte an und hat Knöpfe zum Testen: Schnellspeichern, Schnellladen, 10 Schaden, Heilen.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md), [Anleitung 02](./02_Test_Phase1_Fundament.md) und [Anleitung 03](./03_Test_Spielfigur.md) sind erledigt (Unity 6.3 LTS, Testgelände läuft, die Figur lässt sich steuern).

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Paket prüfen (Newtonsoft JSON)](#3-paket-prüfen-newtonsoft-json)
4. [Testgelände neu aufbauen](#4-testgelände-neu-aufbauen)
5. [Spielen](#5-spielen)
6. [Das Spieler-Overlay](#6-das-spieler-overlay)
7. [Prüfliste](#7-prüfliste)
8. [Automatische Tests](#8-automatische-tests)
9. [Was du zurückmelden sollst](#9-was-du-zurückmelden-sollst)
10. [Häufige Fehler und Lösungen](#10-häufige-fehler-und-lösungen)
11. [Dateien und wohin sie gehören](#11-dateien-und-wohin-sie-gehören)
12. [Hinweise, Vorschläge und Abweichungen](#12-hinweise-vorschläge-und-abweichungen)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Werte** (`Aetherfall.Stats`) | Die sechs Attribute (Stärke, Geschick, Intelligenz, Weisheit, Konstitution, Charisma), Stufe und alle abgeleiteten Werte aus GDD 03, Abschnitt 10 (max. LP, max. Ausdauer, max. Mana, Krit-Chance …). Ausrüstung, Buffs und Talente verändern Werte später über „Modifikatoren“ (fest, Prozent addiert, Prozent multipliziert) in genau der Reihenfolge und mit den Obergrenzen aus GDD 03, 10.4/10.5. Dazu „Ressourcen-Töpfe“ für LP, Ausdauer und Mana mit Regeneration. |
| **Lebenspunkte und Schaden** (`Aetherfall.Combat`) | Lebenspunkte mit Schaden, Heilung, Tod (genau einmal), Unverwundbarkeit und Regeneration. Der komplette **Schadensrechner** aus GDD 03, Abschnitt 8 (Rüstung, Resistenzen, Krit, Trefferzonen, Stufenunterschied, Blocken/Parieren, Wucht) ist fertig und getestet, wird aber erst mit dem Kampfsystem benutzt. |
| **Ausdauer der Spielfigur** | Sprinten kostet **12 Ausdauer pro Sekunde**, Springen **10**. Bei 0 endet der Sprint und die Figur ist **1,2 s erschöpft**; ein neuer Sprint startet erst ab **10 Ausdauer**. Ausdauer lädt sich **0,8 s** nach dem letzten Verbrauch mit **25 pro Sekunde** wieder auf. |
| **Speichersystem** (`Aetherfall.SaveSystem`) | Speichert in lesbare JSON-Dateien mit Kopfdatei, sicher gegen Abstürze (erst in eine Zwischendatei, dann prüfen, dann austauschen; die vorige Datei bleibt als Sicherung `.bak`). Spielstände aus alten Versionen werden automatisch aktualisiert (Migration). Schnellspeichern (**F5**), Schnellladen (**F9**, zweimal drücken), automatisches Speichern alle 10 Minuten Spielzeit. |
| **Spielzeit** (`Aetherfall.GameTime`) | zählt die Spielzeit (auch in Menüs und Dialogen, nicht in Pause und Ladebildschirm) und speichert sie mit. |
| **Spieler-Overlay** (nur Editor/Entwicklungs-Build) | Fenster rechts oben: LP, Ausdauer, Mana, Spielzeit, ob Speichern gerade erlaubt ist, letztes Speichern/Laden, Knöpfe zum Testen. |
| **Tests** | 291 neue automatische Testfälle, darunter das **Rechenbeispiel aus GDD 03, 8.3** (schwerer Krit-Treffer 123, ohne Krit 82, leichter Angriff 55, Wolfsbiss 25) und ein „Golden-Save“-Test (eine Beispiel-Speicherdatei wird geladen und wieder gespeichert – Byte für Byte gleich). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts kurz einen drehenden Kreis (Unity kompiliert). Das kann diesmal etwas länger dauern (viele neue Dateien).
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

> Rote Fehler nach dem Pull? Nicht weitermachen, sondern zuerst Abschnitt [3](#3-paket-prüfen-newtonsoft-json) erledigen (fehlt das Paket, entstehen **keine** roten Fehler, aber Teile fehlen). Bleiben rote Fehler: Abschnitt [10](#10-häufige-fehler-und-lösungen) lesen bzw. die Fehlermeldung an Claude schicken.

---

## 3. Paket prüfen (Newtonsoft JSON)

Das Speichersystem schreibt JSON mit dem Unity-Paket **Newtonsoft JSON** (`com.unity.nuget.newtonsoft-json`). Das Setup-Werkzeug installiert es; in vielen Projekten ist es auch schon da.

1. Menü **Aetherfall > Projekt-Setup …** öffnen.
   **Du siehst danach:** das Fenster **Projekt-Setup** mit den Schritten a) bis f).
2. Bei **a) Pakete installieren** nachsehen: Steht `com.unity.nuget.newtonsoft-json` mit ✓ da, weiter mit Abschnitt 4.
3. Sonst oben **Alles ausführen** klicken und die Fragen beantworten wie in [Anleitung 01, Abschnitt 6.3](./01_Projekt-Setup.md#63-alles-ausführen).
   **Du siehst danach:** nach einer Weile im Protokoll die Zeile **„a) abgeschlossen: …“**, darin `com.unity.nuget.newtonsoft-json@3.…`. Unity kompiliert danach neu.
4. Auf **Status aktualisieren** klicken.
   **Du siehst danach:** bei a) ein ✓.

> Solange das Paket fehlt, bleibt das Projekt fehlerfrei, aber Speichersystem, Spielfigur, Overlays und das Menü **Testgelände erstellen** werden nicht kompiliert. Das Menü zeigt dann nur den Hinweis „Für das Testgelände fehlen noch Pakete“ mit dem Knopf **Projekt-Setup öffnen**.

---

## 4. Testgelände neu aufbauen

Die Spielfigur braucht neue Bausteine (Werte, Lebenspunkte, Speichern), und die BootConfig braucht zwei neue Installer. Beides erledigt das Menü.

1. Läuft das Spiel noch: oben auf **Play** klicken, um den Play-Modus zu beenden.
2. Menü **Aetherfall > Testgelände erstellen** klicken.
   **Du siehst danach:** das Fenster **Testgelände erstellen**. In der Liste steht neu: „SaveInstaller und GameTimeInstaller in der BootConfig (hinter dem Input-Installer)“.
3. **Neu aufbauen** klicken. Fragt Unity vorher **Scene(s) Have Been Modified**: **Don't Save** (oder **Save**, wenn du in der offenen Szene etwas behalten willst).
   **Du siehst danach:** „Fertig! Die Szene „Testgelaende“ ist geöffnet.“ Darin auch der Hinweis auf diese Anleitung. **OK** klicken.

**Was das Menü neu anlegt bzw. ändert:**

| Was | Wo | Hinweis |
|---|---|---|
| Speicher-Installer | `Assets/_Project/Settings/Boot/SaveInstaller.asset` | wird nicht überschrieben, deine Einstellungen bleiben |
| Spielzeit-Installer | `Assets/_Project/Settings/Boot/GameTimeInstaller.asset` | wird nicht überschrieben |
| BootConfig | `Assets/_Project/Settings/Boot/BootConfig.asset` | beide Installer werden eingetragen bzw. an die richtige Stelle verschoben; mehrfaches Ausführen ändert nichts mehr |
| Spielfigur `Player` | Szene `Testgelaende` | neue Komponenten **Character Stats Component** (Werte, Ausdauer, Mana), **Damageable Component** (Lebenspunkte), **Player Persistence** (Speichern der Figur) |
| neue Objekte | Szene `Testgelaende` | `QuickSaveInput` (F5/F9) und `PlayerStatusOverlay` (Spieler-Overlay) |

**Prüfen:** `Assets/_Project/Settings/Boot/BootConfig.asset` anklicken → im Inspector hat die Liste **Installers** jetzt **6 Einträge** in dieser Reihenfolge:

1. Log-Installer
2. EventBus-Installer
3. GameState-Installer
4. Input-Installer
5. **Save-Installer** (neu)
6. **GameTime-Installer** (neu)

Steht die Reihenfolge anders: das Menü einfach noch einmal ausführen, es sortiert die beiden neuen Einträge selbst richtig ein.

---

## 5. Spielen

1. Ist die Szene nicht offen: im Project-Fenster `Assets/_Project/Scenes/Test/Testgelaende.unity` doppelklicken.
2. In der Console oben **Clear** klicken.
3. **Play** drücken und **einmal ins Game-Fenster klicken**.
   **Du siehst danach:** die Figur wie in Anleitung 03, links oben das Zustands-Overlay aus Anleitung 02 und **neu rechts oben das Spieler-Overlay** mit dem Titel **„Spieler & Speichern (Debug)“**.

**Erwartete Console-Zeilen** (Auszug, Reihenfolge wichtig, Zahlen und Pfade können abweichen):

| # | Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] Step 3/7: Installer order validated (6 installer(s)).` | 6 Installer, inklusive Save und GameTime |
| 2 | `[Boot] Step 4/7: Installed 'SaveInstaller' (provides: ISaveManager, IJsonSerializer).` | Speichersystem ist da |
| 3 | `[Boot] Step 4/7: Installed 'GameTimeInstaller' (provides: IPlaytimeClock).` | Spielzeit-Uhr ist da |
| 4 | `[Save] Save folder: /Users/<du>/…/liam/SavesDev/char_01 (1 saveable(s) registered, readable JSON).` | **hier** landen die Spielstände (siehe Abschnitt 7.4) |
| 5 | `[GameState] Loading -> Playing (DevPlayStarter (test scene)). …` | Spiel läuft |
| 6 | `[Player] Player spawned at (0.00, 0.00, 0.00) in 'worldspace.test.testgelaende'.` | Figur steht am Startpunkt |

**Keine roten Fehler.** Steht eine gelbe Zeile mit `PlayerPersistence` oder `QuickSaveInput` und „missing“/„no ISaveManager“, fehlt der Save-Installer in der BootConfig → Abschnitt 4 wiederholen.

---

## 6. Das Spieler-Overlay

Das Overlay liegt rechts oben im Game-Fenster. **Zum Klicken brauchst du die Maus:** Im Spiel ist der Mauszeiger gesperrt, also erst **Esc** drücken (Pause, der Zeiger erscheint), dann klicken. Danach **Esc** zum Weiterspielen. Mit **Zuklappen** wird es zu einem kleinen Knopf **„Spieler-Overlay“**.

| Zeile / Knopf | Bedeutung |
|---|---|
| **LP: 115 / 115** | Lebenspunkte. Mit den Startwerten (alle Attribute 11, Stufe 1) sind es 115. Nach Schaden steht dahinter, wann die Regeneration beginnt (8 s ohne Schaden, dann 1 % pro Sekunde). **TOT** = 0 LP. |
| **Ausdauer: 102 / 102** | Ausdauer. Dahinter „Sprint möglich“ oder „kein Sprint-Start (unter 10)“, bei 0 „erschöpft (… s)“. |
| **Mana: 55 / 55** | Mana (wird noch nicht verbraucht). |
| **Spielzeit: 0:01:23** | Stunden:Minuten:Sekunden; „(angehalten)“ in der Pause. |
| **Speichern: erlaubt / gesperrt – …** | ob gerade gespeichert werden darf (z. B. gesperrt beim Laden oder während die Figur springt oder fällt). |
| **Letztes Speichern / Letztes Laden** | **OK** mit Speicherplatz und Uhrzeit, oder **FEHLER** mit Grund. |
| **Schnellspeichern (F5)** | speichert sofort in einen Schnellspeicher-Platz (`quick_0`, `quick_1`, `quick_2`, reihum). |
| **Schnellladen (F9)** | lädt sofort den **neuesten** Schnellspeicher (der Knopf fragt nicht nach; die Taste F9 schon, siehe 7.3). |
| **10 Schaden** | zieht der Figur 10 LP ab. |
| **Heilen** | füllt die LP ganz auf; ist die Figur tot, wird sie wiederbelebt. |
| **Speicherordner öffnen** | öffnet den Ordner mit den Spielständen im Finder. Darunter steht der Pfad als Text. |

Ausdauer und LP kannst du im Inspector live beobachten: in der Hierarchy `Player` anklicken. Die Startwerte (Attribute, Stufe) stehen an der Komponente **Character Stats Component**. Änderungen dort wirken beim nächsten Play; im Play-Modus geänderte Werte verschwinden beim Beenden.

---

## 7. Prüfliste

Hake ab, was klappt. Bei „Nein“ bitte kurz notieren, was passiert ist.

### 7.1 Ausdauer (Tastatur)

- [ ] **Shift** halten und mit **W** laufen: Die Ausdauer im Overlay sinkt gleichmäßig, etwa **12 pro Sekunde** (von 102 auf 0 in gut 8 Sekunden).
- [ ] Bei **0** endet der Sprint von selbst, obwohl Shift gehalten wird; die Figur läuft normal weiter. Das Overlay zeigt kurz „erschöpft“.
- [ ] Shift **weiter gehalten**: Nach gut einer Sekunde (1,2 s erschöpft, Ausdauer wieder bei 10) sprintet die Figur von selbst wieder los.
- [ ] Shift loslassen und warten: Nach knapp einer Sekunde füllt sich die Ausdauer schnell (25 pro Sekunde, von 0 auf voll in gut 4 Sekunden).
- [ ] Mit weniger als 10 Ausdauer startet **kein** Sprint (Overlay: „kein Sprint-Start (unter 10)“).
- [ ] **Leertaste**: jeder Sprung kostet **10** Ausdauer.
- [ ] Mit wenig Ausdauer (z. B. 5) geht ein Sprung noch, danach steht die Ausdauer auf 0. Bei **0** springt die Figur **nicht**.
- [ ] Normales Laufen und Gehen kostet keine Ausdauer.

**Gamepad** (falls vorhanden): **L3** bei vollem Stick sprintet wie gehabt; bei 0 Ausdauer endet der Sprint und startet **nicht** von selbst neu – erst ein neuer Druck auf L3 (ab 10 Ausdauer) sprintet wieder.

### 7.2 Lebenspunkte (Overlay-Knöpfe)

- [ ] **10 Schaden**: LP sinken um 10 (115 → 105). Das Overlay schreibt „10 Schaden: 10 LP abgezogen.“
- [ ] Danach **8 Sekunden** nichts tun (Esc für Pause zählt **nicht**, die Zeit steht dann): Die LP steigen langsam wieder (gut 1 pro Sekunde), bis 115.
- [ ] Mehrmals **10 Schaden**, bis die LP auf 0 sind: Das Overlay zeigt **TOT**, in der Console steht `[Combat] 'Player' died (last damage from 'debug.overlay').` **genau einmal**. Weitere Klicks auf „10 Schaden“ werden ignoriert.
- [ ] **Heilen** belebt die Figur mit vollen LP wieder. Nach Schaden füllt **Heilen** die LP ganz auf.

Hinweis: Der Tod hat noch keine Folgen (kein Umfallen, kein Neustart) – das kommt mit dem Kampfsystem.

### 7.3 Schnellspeichern und Schnellladen

- [ ] Irgendwo hinlaufen, z. B. auf die grüne Plattform der 30°-Rampe. Mit **10 Schaden** ein paar LP abziehen und etwas sprinten, damit die Ausdauer nicht voll ist. Werte merken.
- [ ] **F5** drücken.
  **Du siehst danach:** in der Console `[Save] Saved 'char_01/quick_0' (Quick)`, im Overlay „Letztes Speichern: OK – char_01/quick_0 um …“.
- [ ] Weit weglaufen (z. B. in den Tunnel), die Kamera drehen, **Heilen** drücken.
- [ ] **F9** drücken.
  **Du siehst danach:** noch **nichts** passiert, in der Console steht `[Save] Quick load: press F9 again within 3 s to load 'char_01/quick_0' (…). Progress since then is lost.`
- [ ] Innerhalb von 3 Sekunden **noch einmal F9**.
  **Du siehst danach:** Die Figur steht sofort wieder auf der Plattform und schaut in dieselbe Richtung wie beim Speichern. LP, Ausdauer und Spielzeit haben die Werte von damals. In der Console in dieser Reihenfolge: `[GameState] Playing -> Loading (Load save)`, `[Player] Player placed from save 'char_01/quick_0' at …`, `[GameState] Loading -> Playing (Load save)`, `[Save] Loaded 'char_01/quick_0' (v1)`.
- [ ] Nach dem Laden lässt sich die Figur sofort normal steuern; sie fällt nicht durch den Boden und hängt nicht in der Luft.
- [ ] Nur **einmal F9** und 3 Sekunden warten: Es wird **nicht** geladen.
- [ ] Dreimal **F5** an verschiedenen Orten: Es entstehen `quick_0`, `quick_1`, `quick_2`; das vierte F5 überschreibt den ältesten. **F9 F9** lädt immer den **neuesten** – auch wenn du **F5** zweimal ganz schnell hintereinander drückst.
- [ ] Dasselbe mit den Overlay-Knöpfen **Schnellspeichern (F5)** und **Schnellladen (F9)** (in der Pause; der Knopf lädt ohne zweites Drücken).
- [ ] **Leertaste** (Sprung) und **noch in der Luft F5** drücken.
  **Du siehst danach:** Es wird **nicht** gespeichert. In der Console die weiße Zeile `[Save] Save Quick failed [save.blocked.falling] Saving is not allowed right now.`, im Overlay „Letztes Speichern: FEHLER um … – Speichern beim Fallen oder Springen nicht möglich (…)“. Während des Sprungs steht darüber kurz „Speichern: gesperrt – Speichern beim Fallen oder Springen nicht möglich“.
- [ ] Nach der Landung noch einmal **F5**: Jetzt wird normal gespeichert („Letztes Speichern: OK …“).
- [ ] Optional: oben auf einer grünen Rampen-Plattform über die Kante laufen und **im Fallen F5** drücken – gleiche Meldung wie im Sprung. Fällt dir auf, dass F5 beim normalen Treppe-Runtergehen gesperrt ist, bitte melden.

### 7.4 Speicherordner ansehen

Im Editor speichert das Spiel **nicht** in den versteckten Mac-Ordner, sondern in den Projektordner (damit du die Dateien leicht findest). Der Ordner heißt **`SavesDev`** und liegt neben `Assets`; Git ignoriert ihn, er taucht also **nicht** in GitHub Desktop auf.

1. Im Overlay (Pause mit **Esc**) **Speicherordner öffnen** klicken.
   **Du siehst danach:** ein Finder-Fenster mit dem Ordner `…/liam/SavesDev/char_01`.
   Alternativ: im Finder **Cmd+Shift+G** drücken und den Pfad aus der Console-Zeile „Save folder: …“ (Abschnitt 5, Zeile 4) einfügen.
2. Darin liegen je Speicherplatz zwei Dateien, z. B. `quick_0.sav` (der Spielstand) und `quick_0.head.json` (Kopfdaten für die spätere Ladeliste). Wird ein Platz zum zweiten Mal beschrieben (beim Schnellspeichern also ab dem vierten F5, weil sich drei Plätze abwechseln), kommt z. B. `quick_0.sav.bak` dazu: die vorige Fassung als Sicherung.
3. Optional: `quick_0.sav` mit **TextEdit** öffnen (Rechtsklick > Öffnen mit > TextEdit). Du siehst lesbaren Text, u. a. `"playtimeSeconds"`, `"health"`, `"stamina"`, `"cellX"`, `"localX"`. **Bitte nichts ändern und nicht speichern** – eine veränderte Datei erkennt das Spiel als beschädigt und nimmt dann die Sicherung. Gibt es noch keine Sicherung (z. B. bei `quick_1` vor dem fünften F5), meldet F9 einen Fehler, und das nächste **F9 F9** lädt den nächstälteren Schnellspeicher.
- [ ] Ordner gefunden, Dateien wie beschrieben vorhanden.

### 7.5 Neustart und Laden

- [ ] Mit **F5** speichern, dann den Play-Modus beenden (oben **Play** klicken).
- [ ] Erneut **Play** drücken. Die Figur startet wie immer am Startpunkt, die Spielzeit beginnt bei 0:00:00.
- [ ] **F9 F9** drücken (oder Overlay **Schnellladen**).
  **Du siehst danach:** Die Figur steht dort, wo du vor dem Beenden gespeichert hast, mit denselben LP, derselben Ausdauer und der gespeicherten Spielzeit (die dann weiterläuft).
- [ ] Optional: Unity ganz beenden, neu öffnen, Play, **F9 F9** – gleiches Ergebnis.

### 7.6 Automatisches Speichern (optional, dauert 1–2 Minuten)

1. Play-Modus beenden. `Assets/_Project/Settings/Boot/SaveInstaller.asset` anklicken.
2. Im Inspector **Autosave Interval Minutes** von **10** auf **1** stellen (der Wert bleibt gespeichert – nach dem Test bitte wieder auf **10** zurückstellen).
3. Play drücken und einfach 1–2 Minuten herumlaufen (Pause zählt nicht).
   **Du siehst danach:** in der Console `[Save] Saved 'char_01/auto_0' (Auto)` und im Speicherordner `auto_0.sav`. Nach jeder weiteren Minute `auto_1`, `auto_2`, dann wieder `auto_0`.
- [ ] Autospeichern funktioniert. Kein Ruckeln beim Speichern spürbar.

Gut zu wissen: Ein Autospeichern kommt frühestens 1 Minute nach dem letzten Speichern (auch nach einem F5). Ist Speichern gerade gesperrt, wartet das Autospeichern bis zu 2 Minuten und fällt dann aus.

### 7.7 Pause und Speichern

- [ ] In der Pause (**Esc**) zeigt das Overlay „Speichern: erlaubt“; **Schnellspeichern** im Overlay klappt.
- [ ] Die Spielzeit steht in der Pause still („(angehalten)“) und läuft nach dem Fortsetzen weiter.

---

## 8. Automatische Tests

1. **Window > General > Test Runner** → Reiter **EditMode** → **Run All**.
2. **Erwartung:** drei Test-Assemblies, alle grün:

| Assembly | Testfälle | Prüft unter anderem |
|---|---|---|
| `Aetherfall.Tests.EditMode` | **283** (157 aus Anleitung 03 + 126 neue) | neu: `StatCalculatorTests` (Reihenfolge der Modifikatoren, höchstens 3 multiplikative, weiche/harte Obergrenzen), `StatFormulasTests` (LP, Ausdauer, Mana, Krit … aus GDD 03, 10.3), `StatCollectionTests` (Änderungs-Event, kein Speicher pro Abfrage, „alles von einer Quelle entfernen“), `ResourcePoolTests`, `HealthTests` (u. a. „Heilung im Schadens-Event verhindert den Tod“), `DamageCalculatorTests` (alle Schritte aus GDD 03, 8, **Rechenbeispiel 8.3**), `Pcg32RandomTests` (Referenzwerte des Zufallsgenerators), `WorldGridTests`, `GameStateRulesTests`, `SaveAndCombatEventTests`, `TickLoopTests` (Echtzeit-Takt) |
| `Aetherfall.Tests.EditMode.Gameplay` | **149** (114 aus Anleitung 03 + 35 neue) | neu: `PlayerStaminaTests` (Sprint 12/s, Start ab 10, Erschöpfung, Sprung 10), `AirborneSaveLockTests` (kein Speichern im Sprung oder Fall), `PlayerSaveablesTests` (Position in 512-m-Zellen, LP/Ausdauer/Mana laden), `GoldenSaveTests` (Beispiel-Spielstand laden und Byte für Byte gleich wieder speichern, alter Stand v0 wird zu v1) |
| `Aetherfall.Tests.EditMode.Save` | **130** (neu) | `SaveManagerTests` (Speichern/Laden, Reihenfolge, Sperren, Sicherung bei beschädigter Datei, Schnellspeicher-Rotation, zwei F5 in derselben Sekunde, Daten ohne angemeldetes System bleiben erhalten, kein Speicherverbrauch pro Frame), `SaveSlotStorageTests` (Zwischendatei, Austausch, Sicherung), `SaveMigrationTests`, `SaveDocumentCodecTests`, `SaveDtoValidatorTests`, `SaveRulesTests`, `AutosaveSchedulerTests`, `PlaytimeClockTests`, `SystemFileStoreTests` |

Die Assemblies `…Gameplay` und `…Save` erscheinen nur, wenn die nötigen Pakete installiert sind (Input System bzw. Newtonsoft JSON).
Die Beispiel-Spielstände der Tests liegen in `Assets/_Project/Tests/TestData/Saves/` (siehe die `README.md` dort).

---

## 9. Was du zurückmelden sollst

Schick Claude bitte:
1. die **Prüfliste** aus Abschnitt 7 (abgehakt bzw. mit kurzer Notiz bei „Nein“),
2. **rote Fehler oder gelbe Warnungen** aus der Console (Zeile anklicken, unten erscheint der ganze Text – den kopieren),
3. dein **Gefühl** zur Ausdauer: Reicht ein voller Balken (gut 8 s Sprint) für das Testgelände? Ist die Pause nach „erschöpft“ zu lang oder zu kurz? Stört es, dass Springen Ausdauer kostet?
4. ob **Laden** sich gut anfühlt: Steht die Figur nach dem Laden sauber auf dem Boden? Springt die Kamera unschön?
5. den **Pfad des Speicherordners** aus der Console-Zeile „Save folder: …“ und ob du die Dateien gefunden hast,
6. das Ergebnis des **Test Runners** (Abschnitt 8): alle grün oder welche rot,
7. optional ein kurzes Bildschirmvideo (macOS: Cmd+Shift+5).

---

## 10. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Menü **Testgelände erstellen** zeigt „Für das Testgelände fehlen noch Pakete“ mit „Newtonsoft JSON“ | Paket `com.unity.nuget.newtonsoft-json` fehlt | Abschnitt 3 |
| Rechts oben kein Spieler-Overlay | Szene nicht neu aufgebaut | Abschnitt 4 (Menü **Neu aufbauen**) |
| Overlay zeigt „Kein Speichersystem: SaveInstaller fehlt in der BootConfig“ | Save-Installer nicht in der BootConfig | Abschnitt 4 wiederholen, dann `BootConfig.asset` prüfen (6 Einträge) |
| Overlay zeigt „Spielzeit: (GameTimeInstaller fehlt)“ | GameTime-Installer fehlt in der BootConfig | wie oben |
| Boot bricht ab, Fehlerbildschirm `… requires 'Aetherfall.Core.IGameStateService' …` beim SaveInstaller bzw. `… requires 'Aetherfall.SaveSystem.ISaveManager' …` beim GameTimeInstaller | falsche Reihenfolge in der BootConfig | Menü **Testgelände erstellen** erneut ausführen (sortiert selbst) oder in `BootConfig.asset` von Hand: Save hinter Input, GameTime ganz ans Ende |
| Overlay-Knöpfe reagieren nicht | Mauszeiger gesperrt | erst **Esc** (Pause), dann klicken |
| **F5/F9** tun nichts | Game-Fenster ohne Fokus, oder das Spiel ist pausiert (die Tasten gehören zur Spielsteuerung) | ins Game-Fenster klicken; aus der Pause mit **Esc** zurück |
| **F9** lädt nicht | F9 muss **zweimal** innerhalb von 3 s gedrückt werden; oder es gibt noch keine Schnellspeicherung | zweimal F9; vorher F5. Die Console sagt, was fehlt („there is no quick save yet“) |
| Am Mac löst **F5/F9** Systemfunktionen aus (z. B. Tastaturbeleuchtung, Diktat) | die F-Tasten sind am Mac Sondertasten | **fn+F5** bzw. **fn+F9** drücken, oder Systemeinstellungen > Tastatur > „F1, F2 usw. als Standard-Funktionstasten verwenden“; sonst die Overlay-Knöpfe nutzen |
| Rote Zeile `[Save] Save Quick failed [save.error.io] …` | Datei konnte nicht geschrieben werden (Ordner nicht beschreibbar, Festplatte voll) | Pfad aus der Zeile „Save folder: …“ prüfen; Meldung an Claude schicken. Der vorige Spielstand bleibt unverändert |
| Console `[Save] Loaded '…' (v1, from backup) …`, im Overlay „aus Sicherung“ | die Hauptdatei war beschädigt (z. B. von Hand geändert) | harmlos: Die beschädigte Datei liegt jetzt im Unterordner `Beschaedigt` des Speicherordners, geladen wurde die Sicherung `.bak` |
| Rote Zeile `[Save] Load '…' failed [load.error.corrupt] …` | Hauptdatei beschädigt und noch keine Sicherung `.bak` vorhanden | Die Datei liegt jetzt in `Beschaedigt`; der Platz gilt als beschädigt. Noch einmal **F9 F9** lädt den nächstälteren Schnellspeicher |
| Weiße Zeile `[Save] Save Quick failed [save.blocked.falling] …` | F5 im Sprung oder während die Figur fällt | gewollt (Speichersperre): nach der Landung noch einmal F5 |
| Ausdauer sinkt beim Sprinten nicht | Feld **Stats** am `PlayerMotor` leer (Console: „no CharacterStatsComponent … stamina is unlimited“) | Szene neu aufbauen (Abschnitt 4) |
| Figur steht nach dem Laden in der Luft oder im Boden | sollte nicht vorkommen | bitte mit Ort und kurzem Video melden |

---

## 11. Dateien und wohin sie gehören

Alle Pfade relativ zu `Assets/_Project/`. **Keine Komponente musst du von Hand an ein GameObject hängen** – das Menü „Testgelände erstellen“ erledigt das. `.meta`-Dateien legt Unity selbst an; bitte mit committen.

### 11.1 Hilfsmittel `Scripts/Utilities/` (Assembly `Aetherfall.Utilities`, Nr. 1)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `Aetherfall.Utilities.asmdef` | Assembly ohne Abhängigkeiten | nein |
| `IRandom.cs`, `Pcg32Random.cs` | Zufallszahlen (PCG32, mit Startwert wiederholbar – für Tests und später für Beute) | nein |
| `WorldGrid.cs` | Weltraster mit 512-m-Zellen (Position im Spielstand als Zelle + Position in der Zelle) | nein |

### 11.2 Werte `Scripts/Stats/` (Assembly `Aetherfall.Stats`, Nr. 11)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `CharacterStatsComponent.cs` | Werte einer Figur (Attribute, Stufe), Ausdauer und Mana | **ja:** `Player` |
| `StatId.cs`, `StatIds.cs`, `StatModifier.cs`, `StatModifierKind.cs`, `StatSourceIds.cs` | Wert-Kennungen und Modifikatoren (Quelle z. B. `item:…`, `buff:…`, `skill:…`) | nein |
| `Stat.cs`, `StatCalculator.cs`, `StatRule.cs`, `StatRuleSet.cs`, `StatActorKind.cs` | Berechnung mit Reihenfolge und Obergrenzen (GDD 03, 10.4/10.5) | nein |
| `StatCollection.cs`, `IStatReader.cs`, `AttributeSet.cs` | alle Werte einer Figur, Änderungs-Event | nein |
| `StatFormulas.cs`, `StatFormula.cs`, `StatFormulaSet.cs`, `LinearStatFormula.cs`, `SpellPowerFormula.cs`, `WisdomFactorFormula.cs` | abgeleitete Werte (GDD 03, 10.3) | nein |
| `ResourcePool.cs`, `ResourcePoolSettings.cs` | LP/Ausdauer/Mana-Töpfe mit Regeneration und Erschöpfung | nein |

### 11.3 Kampf `Scripts/Combat/` (Assembly `Aetherfall.Combat`, Nr. 16)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `DamageableComponent.cs` | Lebenspunkte eines Objekts | **ja:** `Player` |
| `IDamageable.cs`, `Health.cs`, `DamageInfo.cs`, `DamageOutcome.cs`, `DamageTaken.cs`, `DamageIgnoredReason.cs` | Schaden, Heilung, Tod, Unverwundbarkeit | nein |
| `DamageCalculator.cs`, `DamageBalancing.cs`, `DamageRequest.cs`, `DamageResult.cs`, `AttackerSnapshot.cs`, `DefenderSnapshot.cs`, `AttributeScaling.cs` | Schadensrechner (GDD 03, 8) | nein |
| `DamageType.cs`, `DamageTypes.cs`, `DamageTypeValues.cs`, `DamagePacket.cs`, `ResistanceProfile.cs`, `HitZone.cs`, `HitFlags.cs`, `BlockState.cs`, `StatusEffectId.cs`, `StatusBuildup.cs` | Schadensarten, Resistenzen, Trefferzonen, Status-Aufbau | nein |

### 11.4 Speichern `Scripts/SaveSystem/` (Assembly `Aetherfall.SaveSystem`, Nr. 6, nur mit Newtonsoft JSON)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `SaveInstaller.cs` | Installer: Charakter-Ordner, Kompression, Autospeichern | nein, Asset `Settings/Boot/SaveInstaller.asset` |
| `ISaveable.cs`, `Saveable.cs`, `IPostLoad.cs`, `LoadContext.cs`, `ISaveHeaderContributor.cs` | Schnittstelle für alles, was gespeichert wird (Architektur 9.1) | nein |
| `ISaveManager.cs`, `SaveManager.cs`, `SaveManagerExtensions.cs`, `SaveManagerSettings.cs` | der Speicher-Dienst | nein (läuft als Dienst) |
| `SaveFormat.cs`, `SaveHeader.cs`, `SaveHeaderCharacter.cs`, `SaveHeaderLocation.cs`, `SaveDocumentCodec.cs`, `SaveSnapshot.cs`, `SaveSection.cs`, `SaveCompression.cs`, `SaveChecksum.cs` | Dateiformat (JSON, Kopfdatei, GZip, Prüfsumme) | nein |
| `IJsonSerializer.cs`, `NewtonsoftJsonSerializer.cs`, `SaveJsonSettings.cs`, `RejectAllSerializationBinder.cs`, `SaveDtoValidator.cs` | JSON-Umwandlung, nur erlaubte Datentypen | nein |
| `ISaveMigration.cs`, `SaveMigrationChain.cs`, `SaveMigrationV0ToV1.cs`, `MigrationContext.cs`, `MigrationOutcome.cs`, `MigrationStatus.cs` | Versionen und Migration alter Spielstände | nein |
| `IFileStore.cs`, `SystemFileStore.cs`, `SaveSlotStorage.cs`, `StorageWriteResult.cs`, `SavePaths.cs`, `ISaveLocation.cs`, `UnitySaveLocation.cs`, `FixedSaveLocation.cs` | Dateien sicher schreiben (Zwischendatei, Austausch, Sicherung), Speicherort | nein |
| `SaveSlotId.cs`, `SaveSlotInfo.cs`, `SaveSlotRotation.cs`, `SaveKindIds.cs`, `SaveRequest.cs`, `SaveResult.cs`, `LoadResult.cs`, `NewGameSettings.cs`, `SaveReasonKeys.cs`, `SaveCompressionMode.cs` | Speicherplätze, Ergebnisse, Fehlertexte | nein |
| `SavePermissionRules.cs`, `SaveBlockerSet.cs`, `AutosaveScheduler.cs`, `AutosaveDecision.cs`, `QuickLoadConfirmation.cs` | wann gespeichert werden darf, Autospeichern, F9-Bestätigung | nein |

### 11.5 Spielzeit `Scripts/Time/` (Assembly `Aetherfall.GameTime`, Nr. 9)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `GameTimeInstaller.cs` | Installer der Spielzeit-Uhr | nein, Asset `Settings/Boot/GameTimeInstaller.asset` |
| `IPlaytimeClock.cs`, `PlaytimeClock.cs`, `PlaytimeDto.cs` | zählt und speichert die Spielzeit | nein |

### 11.6 Spielfigur `Scripts/Player/` (neu bzw. geändert)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `PlayerPersistence.cs` | meldet Position und LP/Ausdauer/Mana beim Speichersystem an | **ja:** `Player` |
| `QuickSaveInput.cs` | F5 = Schnellspeichern, F9 zweimal = Schnellladen | **ja:** `QuickSaveInput` |
| `PlayerLocationSaveable.cs`, `PlayerLocationDto.cs`, `PlayerResourcesSaveable.cs`, `PlayerResourcesDto.cs`, `PlayerPose.cs`, `IPlayerPlacement.cs` | was von der Figur gespeichert wird | nein |
| `AirborneSaveLock.cs` | sperrt das Speichern, solange die Figur springt oder fällt | nein (läuft in `PlayerPersistence`) |
| geändert: `PlayerMovementModel.cs`, `PlayerMovementTuning.cs`, `PlayerMovementSettings.cs`, `PlayerMotor.cs` | Ausdauerkosten, Teleport beim Laden, „in der Luft“ für die Speichersperre | `PlayerMotor` wie bisher an `Player` |

### 11.7 Entwickler-Werkzeuge und Editor

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `PlayerStatusDebugOverlay.cs` | `Scripts/DevTools/` | Spieler-Overlay rechts oben | **ja:** `PlayerStatusOverlay` |
| geändert: `TestGroundMenu.cs`, `TestGroundSceneBuilder.cs`, `TestGroundAssets.cs`, `TestGroundPaths.cs` | `Scripts/Editor/World/` | Menü legt Installer und neue Komponenten an | nein |
| geändert: `TestGroundMenuFallback.cs`, `BootContentSetupStep.cs` | `Scripts/Editor/Core/` | Hinweise, wenn Newtonsoft JSON fehlt | nein |

Kleinere Änderungen an vorhandenen Dateien: `TickLoop.cs`, `TickRunner.cs`, `ITickable.cs` und neu `IUnscaledTickable.cs` (Takt in Echtzeit für Spielzeit und Autospeichern), `GameStateRules.cs` (wann die Spielzeit läuft), neue Events `SaveKind.cs`, `SaveEvents.cs`, `CombatEvents.cs` in `Scripts/Events/`, mehrere `.asmdef`-Dateien (neue Referenzen, Paket-Erkennung für Newtonsoft JSON).

### 11.8 Tests

| Datei | Ordner | Zweck |
|---|---|---|
| `StatCalculatorTests.cs`, `StatFormulasTests.cs`, `StatCollectionTests.cs`, `ResourcePoolTests.cs`, `HealthTests.cs`, `DamageCalculatorTests.cs`, `Pcg32RandomTests.cs`, `WorldGridTests.cs`, `GameStateRulesTests.cs`, `SaveAndCombatEventTests.cs` | `Tests/EditMode/` | Werte, Schaden, Hilfsmittel |
| `SequenceRandom.cs`, `TestDataFiles.cs` | `Tests/Shared/` | Test-Helfer (feste Zufallsfolge, Testdaten finden) |
| `PlayerStaminaTests.cs`, `PlayerSaveablesTests.cs`, `AirborneSaveLockTests.cs`, `GoldenSaveTests.cs`, `FakePlayerPlacement.cs`, geändert `MovementSimulator.cs` | `Tests/EditModeGameplay/` | Ausdauer, Speichern der Figur, Speichersperre im Sprung, Golden-Save |
| `Aetherfall.Tests.EditMode.Save.asmdef` und alle Dateien darin | `Tests/EditModeSave/` | Speichersystem (nur mit Newtonsoft JSON) |
| `golden_v0.sav.json`, `golden_v1.sav.json`, `README.md` | `Tests/TestData/Saves/` | Beispiel-Spielstände für die Tests |

---

## 12. Hinweise, Vorschläge und Abweichungen

**Vorschläge** (Werte, die das GDD offenlässt – bitte beim Testen bewerten):

| Wert | Vorschlag | Wo änderbar |
|---|---|---|
| Bestätigung für Schnellladen (GDD 05, 5.4: Abfrage, zweiter Druck auf F9 bestätigt) | zweites **F9** innerhalb von **3 s**; die Abfrage steht vorerst nur in der Console (es gibt noch keine Benutzeroberfläche) | `QuickSaveInput` › **Confirm Window Seconds** |
| Mindestabstand zwischen zwei Autospeicherungen | 60 s | im Code (`AutosaveScheduler`) |
| Autospeichern aufschieben, solange Speichern gesperrt ist | höchstens 120 s, dann fällt es aus | im Code (`AutosaveScheduler`) |
| Anzahl Schnell- und Autospeicherplätze | je 3, reihum | im Code (`SaveSlotRotation`) |

**Bewusste Abweichungen bzw. Entscheidungen in diesem Schritt:**
- **Spielstände im Editor unter `<Projekt>/SavesDev/`** (Architektur 9.9), im fertigen Spiel unter `Application.persistentDataPath/Saves/` (Mac: `~/Library/Application Support/unity.<Firma>.<Produkt>/Saves/` bzw. `~/Library/Application Support/<Firma>/<Produkt>/Saves/`, falls dieser Ordner schon existiert – den genauen Pfad nennt die Log-Zeile „Save folder: …“). Im Editor und in Entwicklungs-Builds lesbares JSON, im Release GZip (einstellbar am SaveInstaller).
- **Noch kein Vorschaubild** im Spielstand (Feld `screenshot` ist leer); kommt mit dem Lade-Menü.
- **Laden prüft erst die Datei, dann wechselt der Spielzustand auf „Laden“**: Ist die Datei kaputt oder zu neu, bleibt das Spiel im aktuellen Zustand stehen statt im Ladebildschirm zu hängen.
- **Kampfsperre fürs Speichern** ist eingebaut (Event `CombatStateChanged`), wird aber erst vom Kampfsystem ausgelöst.
- **Speichersperre beim Springen und Fallen** (Architektur 9.8, GDD 05 5.2): sofort beim Absprung; wer von einer Kante läuft, ist erst nach 0,12 s gesperrt (wie die Coyote-Zeit, damit Treppen und kleine Stufen nicht kurz sperren). Rutschen auf einem zu steilen Hang sperrt nicht. Ein fälliges Autospeichern wartet bis zur Landung. Tauchen kommt mit dem Schwimmen.
- **Daten von Systemen, die beim Laden (noch) nicht angemeldet sind**, gehen nicht verloren: Das Speichersystem schreibt sie unverändert in jeden weiteren Spielstand und gibt sie dem System, sobald es sich anmeldet (z. B. die Figur einer später geladenen Szene).
- **Zwei Spielstände in derselben Sekunde** (zweimal F5 schnell hintereinander) werden über eine laufende Nummer im Kopf (`saveSequence`) sortiert. Beim ersten Spielstand eines Charakters fehlt das Feld (bedeutet 0).
- **Spielzeit** zählt in Echtzeit in den Zuständen Spielen, Menü, Dialog, Zwischensequenz und Bau-Modus (Architektur 4.4), nicht in Pause, Hauptmenü und Ladebildschirm.
- **Sprung mit weniger als 10 Ausdauer** ist erlaubt, solange mehr als 0 da ist (GDD 03, 4.3: „Eine Aktion ist erlaubt, solange Ausdauer > 0 ist. Die Kosten können den Wert auf 0 senken, nicht darunter.“).
- **Gamepad-Sprint (L3, umschalten)** startet nach Erschöpfung nicht von selbst neu; mit **Shift (halten)** dagegen schon, sobald wieder 10 Ausdauer da sind.
- **Schadensrechner – Auslegungen, wo GDD 03, 8 nicht eindeutig ist:** Resistenz-Durchdringung wird von positiven Resistenzen **abgezogen** (nicht unter 0); der Wucht-Faktor bei gemischtem Schaden wird nach Schadensanteilen gewichtet; pro Treffer gibt es **einen** Krit-Wurf, der Stich-Bonus (+5 Prozentpunkte) gilt, wenn Stich die größte Schadensart ist. Bitte bestätigen oder korrigieren.
- **Spielfigur, Overlays und Gameplay-Tests brauchen jetzt auch Newtonsoft JSON** (weil die Figur gespeichert wird). Ohne das Paket bleibt das Projekt fehlerfrei, diese Teile werden dann nur nicht kompiliert.
- **Tod hat noch keine Folgen** und die Figur kann sich weiter bewegen; Sterben, Respawn und Kampfzustand kommen mit dem Kampfsystem.

**Noch nicht enthalten** (kommt später): Lade-/Speichermenü mit Vorschaubildern und Bestätigungsdialog, Speichern von Inventar, Quests, Welt und Begleitern, Autospeichern bei Questfortschritt/Ortswechsel, Kampf mit Gegnern, Mana-Verbrauch, Ausweichrolle (kostet später auch Ausdauer), Anzeige von LP/Ausdauer in der richtigen Benutzeroberfläche (HUD).
