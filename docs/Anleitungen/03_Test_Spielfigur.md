# Testanleitung Phase 1: Spielfigur, Kamera und Testgelände

> Eingabe (Input System), Spielfigur, Third-Person-Kamera, Testgelände · Stand: 2026-10-13 · Bezug: [Master-Prompt §7, §8, §32.3, §32.10](../00_Master-Prompt.md) · [Architektur 4.3, 4.4, 11.1–11.3](../Technik/01_Architektur.md#11-systemarchitekturen) · [GDD 03, Abschnitte 1–3](../GDD/03_Kampf_Charakter_Progression.md#1-steuerung-7)

In diesem Schritt bekommt das Spiel zum ersten Mal etwas zum Anfassen: eine Spielfigur (vorerst eine Kapsel mit „Nase“), die du mit **Tastatur und Maus oder mit einem Gamepad** durch ein Testgelände steuerst. Die Kamera folgt ihr, lässt sich drehen und weicht Wänden aus. **Esc** bzw. die **Menü-/Start-Taste** pausiert.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) und [Anleitung 02](./02_Test_Phase1_Fundament.md) sind erledigt (Unity 6.3 LTS, Setup-Fenster überall ✓, Boot-Szene läuft).

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Pakete nachinstallieren (Cinemachine)](#3-pakete-nachinstallieren-cinemachine)
4. [Testgelände erstellen](#4-testgelände-erstellen)
5. [Spielen](#5-spielen)
6. [Steuerung](#6-steuerung)
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
| **Eingabe** (`Aetherfall.Input`) | Alle Tasten aus GDD 03, Abschnitt 1.5, für Tastatur/Maus und Gamepad, aufgeteilt in fünf „Action Maps“ (Gameplay, UI, Dialog, Reiten, Bauen). Je nach Spielzustand ist genau eine davon aktiv – im Pausemenü kann die Figur also nicht laufen. Erkennt, ob du gerade Tastatur oder Gamepad benutzt (Xbox, PlayStation, Nintendo, sonstige). Sperrt den Mauszeiger im Spiel und gibt ihn in Menüs frei. |
| **Spielfigur** (`Aetherfall.Player`) | Laufen, Gehen, Sprinten, Schleichen, Springen (mit „Coyote-Time“ und Sprungpuffer), Schwerkraft, Hänge bis 45°, Abrutschen ab 50°, Treppen. Alle Werte aus GDD 03, Abschnitt 3.1, stehen in einer Einstellungsdatei, die du im Inspector ändern kannst. |
| **Kamera** (`Aetherfall.CameraSystem`) | Third-Person-Kamera mit Cinemachine 3: 4 m Abstand, Blickhöhe 1,6 m, Sichtfeld 55°, weiche Wandkollision. Maus und Stick drehen sie, mit getrennter Empfindlichkeit. |
| **Testgelände** | Ein Menüpunkt baut eine Szene mit Rampen (15°, 30°, 45°, 60°), Treppen, Sprungplattformen, Lücken, einer Wand und einem Tunnel. |
| **Entwickler-Helfer** | `DevPlayStarter` schaltet das Spiel nach dem Start automatisch auf „Spielen“, weil es noch kein Hauptmenü gibt. |
| **Tests** | 123 neue automatische Testfälle (Bewegungsregeln, Tastenzuordnung je Spielzustand, Geräteerkennung, Feststelltaste am Mac, Pause-Regel, Event-Regeln). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts kurz einen drehenden Kreis (Unity kompiliert). Danach ist Unity wieder bedienbar.
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

> Rote Fehler nach dem Pull? Nicht weitermachen, sondern Abschnitt [10](#10-häufige-fehler-und-lösungen) lesen bzw. die Fehlermeldung an Claude schicken.

---

## 3. Pakete nachinstallieren (Cinemachine)

Für die Kamera braucht das Projekt das Paket **Cinemachine 3**, für die Eingabe das **Input System**. Das Setup-Werkzeug installiert beide. Hast du in Anleitung 01 schon „Alles ausführen“ gemacht, sind sie wahrscheinlich da – ein zweiter Lauf schadet nie.

1. Menü **Aetherfall > Projekt-Setup …** öffnen.
   **Du siehst danach:** das Fenster **Projekt-Setup** mit den Schritten a) bis f).
2. Bei **a) Pakete installieren** nachsehen: Stehen `com.unity.inputsystem` und `com.unity.cinemachine` mit ✓ da, weiter mit Abschnitt 4.
3. Sonst oben **Alles ausführen** klicken und die Fragen beantworten wie in [Anleitung 01, Abschnitt 6.3](./01_Projekt-Setup.md#63-alles-ausführen).
   **Du siehst danach:** nach einigen Minuten im Protokoll die Zeile **„a) abgeschlossen: …“**, darin `com.unity.cinemachine@3.…`. Unity kompiliert danach neu.
4. Auf **Status aktualisieren** klicken.
   **Du siehst danach:** bei a) ein ✓.

> Solange ein Paket fehlt, zeigt der Menüpunkt **Aetherfall > Testgelände erstellen** nur einen Hinweis „Für das Testgelände fehlen noch Pakete“ mit dem Knopf **Projekt-Setup öffnen**. Das ist Absicht: Das Projekt bleibt ohne die Pakete fehlerfrei, nur die Spielfigur und die Kamera werden dann nicht kompiliert.

---

## 4. Testgelände erstellen

1. Menü **Aetherfall > Testgelände erstellen** klicken.
   **Du siehst danach:** ein Fenster **Testgelände erstellen** mit einer Liste, was angelegt wird.
2. **Erstellen** klicken (beim zweiten Mal heißt der Knopf **Neu aufbauen** – dann wird die Szene frisch gebaut: Bewegungswerte (`PlayerMovementSettings`) und Materialien bleiben erhalten, Werte an Objekten der Szene (`CM_Explore`, `Player` mit `PlayerMotor`) werden zurückgesetzt).
   Fragt Unity vorher **Scene(s) Have Been Modified**: **Save** klicken, wenn du in der offenen Szene etwas behalten willst, sonst **Don't Save**.
   **Du siehst danach:** ein Fenster „Fertig! Die Szene „Testgelaende“ ist geöffnet.“ Klicke **OK**. Im Scene-Fenster siehst du eine graue Fläche mit bunten Hindernissen, in der **Hierarchy** u. a. `Player`, `CM_Explore`, `Main Camera`, `Environment`, `PlayerSpawnPoint`, `DevPlayStarter`.

Steht unter „Hinweise“ etwas im Fertig-Fenster, lies es kurz. Meistens ist es harmlos (z. B. „Layer … nicht angelegt“, weil der Platz schon belegt ist).

**Was das Menü anlegt bzw. ändert:**

| Was | Wo | Hinweis |
|---|---|---|
| Szene | `Assets/_Project/Scenes/Test/Testgelaende.unity` | wird bei jedem Aufruf neu gebaut (nach Rückfrage) |
| Materialien (bunt) | `Assets/_Project/Art/Materials/Test/` | Shader „Universal Render Pipeline/Lit“, werden nicht überschrieben |
| Bewegungswerte | `Assets/_Project/Settings/Player/PlayerMovementSettings.asset` | Werte aus GDD 03, 3.1; **deine Änderungen bleiben erhalten** |
| Eingabe-Installer | `Assets/_Project/Settings/Boot/InputInstaller.asset` | wird in `BootConfig.asset` **hinter** dem GameState-Installer eingetragen |
| Layer | Edit > Project Settings > Tags and Layers | User Layer 6 = `Player`, 11 = `Environment` (Architektur 2.8), nur wenn frei |

**Prüfen:** `Assets/_Project/Settings/Boot/BootConfig.asset` anklicken → im Inspector hat die Liste **Installers** jetzt 4 Einträge: Log-, EventBus-, GameState- und **Input**-Installer, in dieser Reihenfolge.

**Das Gelände** (Blick vom Startpunkt nach vorne):

| Richtung | Hindernis | Zum Testen |
|---|---|---|
| vorne links | 4 orange Rampen 15°, 30°, 45°, 60° mit grünen Plattformen oben | bis 45° hochlaufen, 60° rutscht ab |
| vorne rechts | blaue Treppe (Stufen 0,2 m) und „Hohe Stufen 0,45 m“ | Treppe ohne Springen, hohe Stufen nur mit Sprung |
| rechts | 5 grüne Sprungplattformen 0,4 / 0,8 / 1,0 / 1,2 / 1,5 m | bis 1,0 m sicher, 1,2 m knapp (genau die Sprunghöhe), 1,5 m ist zu hoch |
| links hinten | Reihe aus Blöcken (1 m hoch) mit Lücken 1,5 / 2,5 / 3,5 / 4,5 / 6,0 m | Sprungweite laufend ca. 4,4 m, sprintend ca. 6,2 m (siehe Abschnitt 12) |
| hinten | rote Wand mit Ecke und drei Säulen | Kamera zieht sich vor die Wand |
| rechts hinten | lila Tunnel (3 m breit, 2,6 m hoch) | Kamera rückt im Tunnel nah heran |

Graue Linien auf dem Boden liegen im Abstand von 5 m – so kannst du Strecken abschätzen.

---

## 5. Spielen

1. Ist die Szene nicht offen: im Project-Fenster `Assets/_Project/Scenes/Test/Testgelaende.unity` doppelklicken.
2. In der Console oben **Clear** klicken.
3. **Play** drücken (Dreieck oben in der Mitte).
4. **Einmal ins Game-Fenster klicken.** Erst dann bekommt das Spiel Tastatur, Maus und Gamepad.
   **Du siehst danach:** die Kapsel von hinten, der Mauszeiger verschwindet. Links oben liegt das Debug-Overlay aus Anleitung 02 (es zeigt `Current: Playing`).

**Erwartete Console-Zeilen** (Auszug, Reihenfolge wichtig, Zahlen können abweichen):

| # | Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] EditorBootstrap: Play Mode started in 'Testgelaende'. Loading boot scene …` | Boot-Szene wird dazugeladen |
| 2 | `[Boot] Step 3/7: Installer order validated (4 installer(s)).` | 4 Installer, inklusive Input |
| 3 | `[Boot] Step 4/7: Installed 'InputInstaller' (provides: IInputService).` | Eingabe-Dienst ist da |
| 4 | `[Input] InputService ready: maps Gameplay (41), UI (9), Dialog (4), Riding (4), Building (4), pause button routing on, active map None.` | alle fünf Action Maps gebaut |
| 5 | `[Boot] Step 6/7: PostInitialize called on 1 service(s); 1 tickable(s) registered.` | |
| 6 | `[GameState] Boot -> MainMenu (Boot completed). …` | |
| 7 | `[GameState] MainMenu -> Loading (DevPlayStarter (test scene)). …` | der Entwickler-Helfer startet das Spiel |
| 8 | `[GameState] Loading -> Playing (DevPlayStarter (test scene)). …` | |
| 9 | `[Player] Player spawned at (0.00, 0.00, 0.00) in 'worldspace.test.testgelaende'.` | Figur steht am Startpunkt |
| 10 | `[DevTools] DevPlayStarter: MainMenu -> Loading -> Playing. Have fun testing.` | fertig |

**Keine roten Fehler.** Zum Beenden: **Esc** (Mauszeiger kommt zurück) und dann oben wieder auf **Play** klicken.

---

## 6. Steuerung

Was in diesem Schritt schon funktioniert:

| Aktion | Tastatur / Maus | Gamepad (Xbox / PlayStation) |
|---|---|---|
| Laufen | **W A S D** | linker Stick (weit) |
| Gehen | **Feststelltaste** (umschalten, jedes Drücken wechselt) | linker Stick nur halb auslenken (unter 50 %) |
| Sprinten | **Shift** halten | linken Stick **drücken** (L3) bei weit ausgelenktem Stick – schaltet um; endet, wenn du den Stick loslässt |
| Schleichen | **C** (umschalten) | linken Stick **drücken** (L3) im Stand oder bei halbem Stick – schaltet um |
| Springen | **Leertaste** | **A** / **✕** |
| Kamera drehen | **Maus** bewegen | rechter Stick |
| Pause | **Esc** | **Menü** / **Options** |
| Weiter (aus der Pause) | **Esc** oder **rechte Maustaste** | **Menü** / **Options** oder **B** / **○** |

Alle anderen Tasten aus GDD 03 (Angriff, Blocken, Ausweichen, Fähigkeiten, Schnellslots …) sind schon belegt, tun aber noch nichts. Das kommt mit den nächsten Schritten.

Gut zu wissen:
- Die Figur läuft immer **relativ zur Kamera**: W bzw. Stick nach vorne = in Blickrichtung der Kamera. Die gelbe „Nase“ zeigt, wohin die Figur schaut; sie dreht sich in die Laufrichtung.
- **Gamepad am Mac:** Xbox- und PlayStation-Controller per Bluetooth koppeln (Systemeinstellungen > Bluetooth), dann Unity neu in den Vordergrund holen und ins Game-Fenster klicken.
- Wechselst du zwischen Tastatur und Gamepad, merkt das Spiel das automatisch (sichtbar wird das erst mit den Tastensymbolen der Benutzeroberfläche).
- Ob Sprinten **gehalten** oder **umgeschaltet** wird, richtet sich nach der Taste, mit der du es auslöst: **Shift** = halten, **L3** = umschalten – auch direkt nach einem Gerätewechsel.
- Die Lampe der Feststelltaste ist kein verlässlicher Hinweis auf den Gehen-Modus: War sie beim Start schon an, leuchtet sie genau dann, wenn die Figur läuft. Am Mac meldet das System die Feststelltaste anders als unter Windows; das Spiel gleicht das aus.

---

## 7. Prüfliste

Hake ab, was klappt. Bei „Nein“ bitte kurz notieren, was passiert ist.

**Bewegung (Tastatur und Maus)**
- [ ] Mit **W A S D** läuft die Figur flüssig, startet und stoppt fast sofort (kein Rutschen wie auf Eis).
- [ ] Die Figur dreht sich in die Laufrichtung, die gelbe Nase zeigt nach vorne.
- [ ] **Shift** gehalten = deutlich schneller (Sprinten), loslassen = wieder normal.
- [ ] **C** = langsam schleichen; nochmal **C** = normal. Sprinten beendet das Schleichen.
- [ ] **Feststelltaste** = Gehen (langsam); nochmal = wieder Laufen; ein drittes Mal = wieder Gehen. Jedes Drücken wechselt (auch am Mac).
- [ ] **Leertaste** = Sprung, etwa 1,2 m hoch. In der Luft kannst du die Richtung etwas korrigieren, aber nicht umdrehen.
- [ ] Springen kurz **nach** dem Verlassen einer Kante klappt noch (Coyote-Time). Leertaste kurz **vor** der Landung gedrückt → die Figur springt direkt wieder ab (Sprungpuffer).

**Gelände**
- [ ] Rampen **15°, 30° und 45°**: hochlaufen geht, oben auf der grünen Plattform stehen geht.
- [ ] Rampe **60°**: die Figur kommt nicht hoch und rutscht wieder herunter. Springen geht dort nicht.
- [ ] **Treppe (0,2 m)**: hoch und runter ohne Springen, ohne Ruckeln oder „Hüpfen“ beim Runtergehen.
- [ ] **Hohe Stufen (0,45 m)**: nur mit Springen.
- [ ] **Sprungplattformen**: 0,4 / 0,8 / 1,0 m sicher erreichbar, 1,2 m nur knapp (das ist genau die Sprunghöhe; Anlauf hilft nicht – klappt es nie, bitte melden), 1,5 m nicht.
- [ ] **Lücken**: 1,5 / 2,5 / 3,5 m laufend sicher; 4,5 m laufend knapp (Absprung direkt an der Kante), sprintend sicher; 6,0 m nur sprintend (laufend nicht zu schaffen).

**Kamera**
- [ ] Maus links/rechts dreht die Kamera um die Figur, Maus hoch/runter neigt sie. Nach 2 s ohne Kamera-Eingabe neigt sie sich langsam zurück in die Grundhöhe. Solange du die Kamera nur seitlich drehst, bleibt die Neigung, wo sie ist.
- [ ] An der **roten Wand**: Gehst du mit dem Rücken an die Wand, rückt die Kamera vor die Wand (sie schaut nicht durch die Wand). Weg von der Wand fährt sie in etwa einer halben Sekunde zurück.
- [ ] Im **Tunnel**: Die Kamera rückt nah heran und bleibt im Tunnel.
- [ ] Hinter den **Säulen**: Die Figur bleibt sichtbar.

**Pause**
- [ ] **Esc** pausiert: Figur und Kamera bleiben stehen, der Mauszeiger erscheint, das Overlay zeigt `Current: Paused`.
- [ ] Nochmal **Esc** (oder rechte Maustaste) setzt fort, der Mauszeiger verschwindet wieder (falls nicht: einmal ins Game-Fenster klicken).

**Gamepad** (falls vorhanden)
- [ ] Linker Stick bewegt die Figur; halbe Auslenkung = gehen, volle = laufen.
- [ ] Rechter Stick dreht die Kamera gleichmäßig (nicht zu schnell, nicht zu langsam).
- [ ] **L3** bei vollem Stick = Sprinten (bleibt an, bis du den Stick loslässt); **L3** im Stand = Schleichen an/aus.
- [ ] **A / ✕** springt, **Menü / Options** pausiert, **Menü** oder **B / ○** setzt fort.
- [ ] Mitten im Spiel zwischen Gamepad und Tastatur wechseln: beides funktioniert sofort. Direkt nach dem Gamepad mit **W** laufen und **Shift** halten: Sprinten endet beim Loslassen von Shift (halten, nicht umschalten) – auch bei eingeschalteter Feststelltaste.

---

## 8. Automatische Tests

1. **Window > General > Test Runner** → Reiter **EditMode** → **Run All**.
2. **Erwartung:** zwei Test-Assemblies, alle grün:

| Assembly | Testfälle | Prüft unter anderem |
|---|---|---|
| `Aetherfall.Tests.EditMode` | **157** (148 aus Anleitung 02 + 9 neue) | neu: `GameEventStructureTests` (globale Events sind `readonly struct`, nur Werte, höchstens 64 Byte), `ServicesWaitForAsyncTests` |
| `Aetherfall.Tests.EditMode.Gameplay` | **114** | `PlayerMovementModelTests` (Beschleunigung 0 → 5 m/s in 0,15 s, Stopp in 0,12 s, Sprunghöhe 1,2 m bei 30, 60 und 144 Bildern pro Sekunde, Sprungweite ca. 4,4 / 6,2 m, Coyote-Time 0,12 s, Sprungpuffer 0,15 s, Luftkontrolle ohne Umkehr, Hänge, Sprint/Schleichen/Gehen, Drehrate), `PlayerMovementMathTests`, `KeyboardPlatformRulesTests` (Feststelltaste unter Windows und macOS), `ActionMapTableTests` (welche Tastenbelegung in welchem Spielzustand aktiv ist, komplett nach Architektur 4.4), `DeviceDetectionTests` (Xbox/PlayStation/Nintendo/sonstige, 0,3 s Wechselsperre), `PauseAndCursorRulesTests`, `InputActionNamesTests` |

Die zweite Assembly erscheint nur, wenn das Input System installiert ist (genau wie die Spielfigur selbst).

---

## 9. Was du zurückmelden sollst

Schick Claude bitte:
1. die **Prüfliste** aus Abschnitt 7 (abgehakt bzw. mit kurzer Notiz bei „Nein“),
2. **rote Fehler oder gelbe Warnungen** aus der Console (in der Console die Zeile anklicken, unten erscheint der ganze Text – den kopieren),
3. dein **Gefühl** beim Steuern: Ist Laufen/Sprinten zu schnell oder zu langsam? Springt die Figur zu hoch/zu tief? Ist die Kamera mit Maus bzw. Stick zu empfindlich oder zu träge? Ist der Abstand der Kamera angenehm?
4. **welches Gamepad** du benutzt hast (z. B. „Xbox Series, Bluetooth“ oder „PS5 DualSense“),
5. das Ergebnis des **Test Runners** (Abschnitt 8): alle grün oder welche rot,
6. optional ein kurzes Bildschirmvideo (macOS: Cmd+Shift+5).

Werte selbst ausprobieren ist erlaubt: `Assets/_Project/Settings/Player/PlayerMovementSettings.asset` anklicken und im Inspector ändern (z. B. **Run Speed**, **Jump Height**). Die Änderung wirkt beim nächsten Play und bleibt auch beim „Neu aufbauen“ erhalten. Kamera-Empfindlichkeit: in der Hierarchy `CM_Explore` anklicken → Komponente **Camera Look Input** → **Mouse Degrees Per Pixel** bzw. **Stick Degrees Per Second**. Das sind Werte an Objekten der Szene: **im Play-Modus ausprobieren, die guten Werte notieren und an Claude schicken** – Änderungen im Play-Modus verschwinden beim Beenden, und „Neu aufbauen“ setzt sie ebenfalls zurück. Schreib dazu, welche Werte sich besser anfühlen.

---

## 10. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Menü **Aetherfall > Testgelände erstellen** zeigt „Für das Testgelände fehlen noch Pakete“ | Input System oder Cinemachine 3 fehlt | Knopf **Projekt-Setup öffnen** → **Alles ausführen** (Abschnitt 3) |
| Menü **Aetherfall** fehlt ganz oder hat nur wenige Punkte | rote Compiler-Fehler in der Console | Fehlertext kopieren und an Claude schicken |
| Game-Fenster zeigt „Display 1 – No cameras rendering“ | die Boot-Szene statt des Testgeländes ist offen | `Testgelaende.unity` öffnen (Abschnitt 5) |
| Figur bewegt sich nicht, Kamera dreht sich nicht | Game-Fenster hat keinen Fokus | einmal ins Game-Fenster klicken |
| Figur bewegt sich nicht, Overlay zeigt `Current: MainMenu` | `DevPlayStarter` fehlt in der Szene | Menü **Aetherfall > Testgelände erstellen** erneut ausführen (**Neu aufbauen**) |
| Rote Zeile `PlayerInputReader: no IInputService registered …` | InputInstaller fehlt in der BootConfig | Menü **Aetherfall > Testgelände erstellen** erneut ausführen; dann `BootConfig.asset` prüfen (Abschnitt 4) |
| Rote Zeile `Active Input Handling does not include the Input System Package …` | die neue Eingabe ist nicht eingeschaltet | Edit > Project Settings > Player > Other Settings > **Active Input Handling** = **Input System Package (New)**, Unity neu starten lassen |
| Boot bricht ab, Fehlerbildschirm `… requires 'Aetherfall.Core.IGameStateService' …` beim InputInstaller | InputInstaller steht in der BootConfig **vor** dem GameState-Installer | in `BootConfig.asset` den InputInstaller ans Ende ziehen |
| Alle Hindernisse sind **rosa/pink** | URP-Shader nicht gefunden (Render-Pipeline nicht eingestellt) | Edit > Project Settings > Graphics: **Default Render Pipeline** muss ein URP-Asset sein; dann die Materialien in `Art/Materials/Test/` löschen und das Menü erneut ausführen |
| Keine Schilder („Rampe 15°“ …) im Gelände | eingebaute Schrift nicht gefunden (Hinweis im Fertig-Fenster) | harmlos, die Hindernisse funktionieren trotzdem |
| Mauszeiger verschwindet nicht | Game-Fenster ohne Fokus oder Spiel pausiert | ins Game-Fenster klicken; ggf. **Esc** zum Fortsetzen |
| Gamepad reagiert nicht | nicht gekoppelt oder Unity nicht im Vordergrund | Bluetooth prüfen; **Window > Analysis > Input Debugger** zeigt unter **Devices**, ob Unity den Controller sieht |
| Kamera wackelt oder springt an Wänden | Kamera-Kollision zu empfindlich | bitte mit kurzer Beschreibung melden (Werte stehen an `CM_Explore` › **Cinemachine Deoccluder**; im Play-Modus ausprobieren und die Werte notieren, siehe Abschnitt 9) |
| Figur „schwebt“ beim Treppe-Runtergehen kurz | Bodenhaftung zu schwach | melden; zum Ausprobieren im Play-Modus `Player` › `PlayerMotor` › **Ground Snap Distance** auf 0,5 stellen und das Ergebnis notieren (der Wert verschwindet beim Beenden) |
| Mac: Feststelltaste schaltet das Gehen nur bei jedem zweiten Drücken um | macOS meldet bei der Feststelltaste die Sperre (an/aus) statt des Tastendrucks; das Spiel zählt deshalb am Mac Ein- **und** Ausschalten der Sperre als je einen Wechsel | sollte nicht vorkommen – bitte mit „Mac, Feststelltaste“ melden. Dass die Lampe der Taste nicht zum Gehen-Modus passt, ist dagegen normal (Abschnitt 6) |

---

## 11. Dateien und wohin sie gehören

Alle Pfade relativ zu `Assets/_Project/`. **Keine Komponente musst du von Hand an ein GameObject hängen** – das Menü „Testgelände erstellen“ erledigt das. `.meta`-Dateien legt Unity selbst an; bitte mit committen.

### 11.1 Events `Scripts/Events/` (Assembly `Aetherfall.Events`, Nr. 3)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `Aetherfall.Events.asmdef` | Assembly-Definition, referenziert nur `Aetherfall.Core` | nein |
| `InputEvents.cs` | Event `InputDeviceChanged` (Gerät + Tastensymbol-Familie) | nein |
| `PlayerEvents.cs` | Event `PlayerSpawned` (Position, WorldSpace-ID) | nein |
| `DeviceKind.cs`, `GlyphFamily.cs` | Aufzählungen Tastatur/Gamepad bzw. Xbox/PlayStation/Nintendo/Generisch | nein |

### 11.2 Eingabe `Scripts/Input/` (Assembly `Aetherfall.Input`, Nr. 8, nur mit Input System)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `Aetherfall.Input.asmdef` | referenziert Core, Events, `Unity.InputSystem`; wird nur kompiliert, wenn das Input System installiert ist | nein |
| `GameInputBindings.cs`, `GameInputActions.cs`, `InputActionNames.cs` | baut alle Action Maps und Tastenbelegungen im Code (GDD 03, 1.5) | nein |
| `IInputService.cs`, `InputService.cs` | Dienst: aktiviert die passende Map je Spielzustand, Geräteerkennung, Pause-Taste | nein (läuft als Dienst) |
| `InputInstaller.cs` | Installer für den Eingabe-Dienst | nein, Asset `Settings/Boot/InputInstaller.asset` |
| `IGameplayInput.cs`, `GameplayInput.cs`, `GameplayButton.cs` | Lesezugriff auf die Gameplay-Tasten für Spielfigur und Kamera | nein |
| `ActionMapTable.cs`, `ActionMapId.cs`, `PlayerControlMode.cs` | Tabelle „welche Map in welchem Spielzustand“ (Architektur 4.4) | nein |
| `DeviceClassifier.cs`, `ActiveDeviceTracker.cs`, `InputDeviceActivityPoller.cs` | Geräteerkennung (GDD 05, 1.5) | nein |
| `KeyboardPlatformRules.cs` | Unterschiede der Tastatur je Plattform (Feststelltaste am Mac) | nein |
| `PauseRouting.cs`, `PauseCommand.cs` | Regel für Esc/Start (Pause/Fortsetzen) | nein |
| `CursorPolicy.cs`, `ICursorController.cs`, `UnityCursorController.cs` | Mauszeiger sperren/freigeben | nein |

### 11.3 Spielfigur `Scripts/Player/` (Assembly `Aetherfall.Player`, Nr. 24, nur mit Input System)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `PlayerMotor.cs` | bewegt die Figur mit dem CharacterController | **ja:** `Player` (neben `CharacterController`) |
| `PlayerInputReader.cs` | liest die Tasten und gibt sie an den Motor | **ja:** `Player` |
| `PlayerSpawnPoint.cs` | Startpunkt, setzt die Figur beim Spielstart dorthin, sendet `PlayerSpawned` | **ja:** `PlayerSpawnPoint` |
| `PlayerMovementSettings.cs` | Einstellungs-Asset mit allen Bewegungswerten | nein, Asset `Settings/Player/PlayerMovementSettings.asset` |
| `PlayerMovementModel.cs`, `PlayerMovementMath.cs`, `PlayerGaitRules.cs`, `PlayerMovementTuning.cs`, `PlayerMovementInput.cs`, `GroundContact.cs`, `MotionVector.cs`, `PlayerGait.cs` | die Bewegungsregeln als reine, getestete Logik | nein |

### 11.4 Kamera `Scripts/Camera/` (Assembly `Aetherfall.CameraSystem`, Nr. 27, nur mit Input System + Cinemachine)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `CameraLookInput.cs` | dreht die Cinemachine-Kamera mit Maus/Stick | **ja:** `CM_Explore` (neben `CinemachineCamera`, `CinemachineOrbitalFollow`, `CinemachineRotationComposer`, `CinemachineDeoccluder`) |

### 11.5 Entwickler-Werkzeuge und Editor

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `DevPlayStarter.cs` | `Scripts/DevTools/` | schaltet im Testgelände auf „Spielen“ | **ja:** `DevPlayStarter` |
| `Aetherfall.EditorTools.World.asmdef` + `TestGroundMenu.cs`, `TestGroundSceneBuilder.cs`, `TestGroundGeometry.cs`, `TestGroundAssets.cs`, `TestGroundMaterials.cs`, `TestGroundPaths.cs`, `TestGroundReport.cs`, `ProjectLayers.cs` | `Scripts/Editor/World/` | Menü „Testgelände erstellen“ (nur Editor, nur mit beiden Paketen) | nein |
| `TestGroundMenuFallback.cs` | `Scripts/Editor/Core/` | Hinweis-Menü, solange ein Paket fehlt | nein |

### 11.6 Tests

| Datei | Ordner | Zweck |
|---|---|---|
| `GameEventStructureTests.cs`, `ServicesWaitForAsyncTests.cs` | `Tests/EditMode/` | Event-Regeln, Warten auf Dienste |
| `Aetherfall.Tests.EditMode.Gameplay.asmdef` und alle Dateien darin | `Tests/EditModeGameplay/` | Tests der Spielfigur und der Eingabe (nur mit Input System) |

Kleinere Änderungen an vorhandenen Dateien: `LogCategory.cs` (neue Kategorien `Player`, `Camera`), `Services.cs` (Hilfsmethode `WaitForAsync`), `Aetherfall.EditorTools.Core.asmdef` und `Aetherfall.Tests.EditMode.asmdef` (Paket-Erkennung bzw. Referenz auf Events).

---

## 12. Hinweise, Vorschläge und Abweichungen

**Vorschläge** (Werte, die das GDD offenlässt – bitte beim Testen bewerten):

| Wert | Vorschlag | Wo änderbar |
|---|---|---|
| Stufenhöhe ohne Springen | 0,3 m | `PlayerMovementSettings` › Step Offset |
| Höchste Rutschgeschwindigkeit | 12 m/s | `PlayerMovementSettings` › Max Slide Speed |
| Maus-Empfindlichkeit | 0,1° pro Pixel | `CM_Explore` › Camera Look Input |
| Stick-Drehgeschwindigkeit | 200°/s seitlich, 130°/s hoch/runter | `CM_Explore` › Camera Look Input |
| Kamera-Neigung | −20° bis 70°, Grundstellung 15°, kehrt nach 2 s zurück | `CM_Explore` › Cinemachine Orbital Follow › Vertical Axis |
| Schulterversatz 0,3 m | als leichte Bildverschiebung der Figur nach links umgesetzt | `CM_Explore` › Cinemachine Rotation Composer › Screen Position |

**Bewusste Abweichungen bzw. Entscheidungen in diesem Schritt:**
- **Tastenbelegung im Code statt als `.inputactions`-Datei** (Architektur 11.1 nennt eine Datei `AetherfallInput.inputactions`): Die Belegung entsteht beim Start im Code und liegt damit prüfbar im Repository. Die Datei `InputSystem_Actions.inputactions` aus der Unity-Vorlage wird vom Spiel nicht benutzt.
- **InputInstaller hinter dem GameState-Installer** (Architektur 4.1 sieht „Input“ vor GameState): Der Eingabe-Dienst braucht den Spielzustand schon beim Erzeugen (erste Map, Pause-Taste).
- **Schleichen auf C** (offene Entscheidung K3 in GDD 03, 1.3): empfohlener Standard umgesetzt; Ausweichen liegt nur auf Strg.
- **Automatisches Zurückdrehen der Kamera hinter die Figur ist aus** (GDD 05: nach 2 s): Weil die Figur relativ zur Kamera läuft, würde die Kamera beim Rückwärtslaufen ständig umschwenken. Nur die Neigung kehrt nach 2 s zurück. Eine bessere Regel (nur beim Vorwärtslaufen) kommt mit dem Kamera-Ausbau.
- **Pause per Esc/Start** übernimmt vorerst der Eingabe-Dienst; mit dem Pausemenü (UI-Schritt) wird das abgeschaltet (Haken **Route Pause Button** am InputInstaller).
- **Eigene Test-Assembly** `Aetherfall.Tests.EditMode.Gameplay` (nicht in Tabelle 3.3): Sie wird nur mit Input System kompiliert, damit die übrigen Tests auch ohne das Paket laufen.
- **Kamera-Steuerung per `CameraLookInput` statt `CinemachineInputAxisController`** (Architektur 11.2): Die Kamera liest die Eingabe über den Eingabe-Dienst. So gibt es nur eine Instanz der Tastenbelegung, und die Kamera hört automatisch auf, wenn der Spielzustand die Gameplay-Map abschaltet (Pause, Menüs, Dialoge).
- **Noch kein `CinemachineDecollider`** an `CM_Explore` (Architektur 11.2: Kollision mit dem Terrain): Das Testgelände hat kein Terrain. Der Decollider kommt mit dem Terrain-Schritt dazu; Wände und Hindernisse deckt der `CinemachineDeoccluder` ab.
- **Slope Limit 45,5° statt 45°** am CharacterController: Unity/PhysX vergleicht Winkel über Kosinuswerte; bei genau 45° entschiede die Rundung, ob die 45°-Rampe begehbar ist. Rutschen beginnt unverändert erst ab 50°.
- **GDD 3.1: Sprungweite ~3,5 m laufend / ~4,6 m sprintend ist mit 1,2 m Sprunghöhe bei 1,0 g steigend / 1,6 g fallend nicht erreichbar.** Umgesetzt sind Höhe und Schwerkraft; die Weite ergibt sich daraus: ca. 0,89 s Flugzeit, also **ca. 4,4 m laufend und ca. 6,2 m sprintend**. Die Lücken im Testgelände sind darauf ausgelegt (neue Lücke 6,0 m: nur sprintend). **Bitte entscheiden:** Sollen Höhe und Schwerkraft bleiben (Weite wie jetzt) oder soll die Weite des GDD gelten? Für ~3,5 / ~4,6 m müsste entweder die Schwerkraft rund 1,6- bis 1,8-mal so stark sein (der Sprung wäre kürzer und „härter“) oder der Sprung nur ca. 0,7 m hoch – oder die Weite im GDD wird auf ~4,4 / ~6,2 m angepasst. Bis zu deiner Entscheidung bleibt es, wie es ist.

**Noch nicht enthalten** (kommt später): Ausdauer beim Sprinten/Springen (Werte-System), Ausweichrolle, Klettern, Schwimmen, Gleiten, Reiten, Lock-On, Zielen, Kamera-Wackeln, Animationen, Optionen-Menü (Empfindlichkeit, Y-Achse invertieren, Totzone, Tastenbelegung ändern und speichern), Tastensymbole in der Oberfläche.
