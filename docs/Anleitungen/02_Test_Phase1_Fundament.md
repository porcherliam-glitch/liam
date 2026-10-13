# Testanleitung Phase 1, Schritt 1: Fundament

> Bootstrapper, ServiceLocator, EventBus, GameStateManager · Stand: 2026-10-13 · Bezug: [Master-Prompt §31 Phase 1.1, §32.3, §32.10](../00_Master-Prompt.md) · [Architektur 4.1–4.4](../Technik/01_Architektur.md#4-kernsysteme-62) · [Systeme, Schritt 1.2](../Technik/02_Systeme_und_Abhaengigkeiten.md#phase-1--fundament)

Diese Anleitung beschreibt, welche Dateien neu sind, was das Setup-Werkzeug im Editor anlegt und wie du das Fundament in Unity prüfst. Sie setzt voraus, dass das Projekt-Setup (Phase 0, Schritt 4, Anleitung 01) erledigt ist: Unity 6.3 LTS, Domain Reload aus, Test Framework installiert.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Dateien und wohin sie gehören](#2-dateien-und-wohin-sie-gehören)
3. [Was das Setup-Werkzeug anlegt](#3-was-das-setup-werkzeug-anlegt)
4. [EditMode-Tests ausführen](#4-editmode-tests-ausführen)
5. [Play Mode in der Boot-Szene testen](#5-play-mode-in-der-boot-szene-testen)
6. [Fail-Fast prüfen (absichtlich falsch konfigurieren)](#6-fail-fast-prüfen-absichtlich-falsch-konfigurieren)
7. [Start aus einer anderen Szene (EditorBootstrap)](#7-start-aus-einer-anderen-szene-editorbootstrap)
8. [Typische Fehler und Lösungen](#8-typische-fehler-und-lösungen)
9. [Hinweise, Abweichungen und nächste Schritte](#9-hinweise-abweichungen-und-nächste-schritte)

---

## 1. Was dieser Schritt liefert

| Baustein | Aufgabe | Architektur |
|---|---|---|
| `GameBootstrapper` | Startet das Spiel in 7 Schritten: Log-Ausgabe setzen → ServiceLocator erzeugen → Installer-Reihenfolge prüfen → Installer ausführen → Dienste asynchron initialisieren → `PostInitialize` → Wechsel ins Hauptmenü. Fehler oder Zeitüberschreitung (Standard 20 s) führen zu einem Fehlerbildschirm statt zu einem halb gestarteten Spiel. | 4.1 |
| `ServiceLocator` + `Services` | Zentrale Ablage der Dienste. Doppelte Registrierung und fehlende Dienste melden den genauen Typnamen. | 4.2 |
| `EventBus` | Synchrone, typisierte Events. 0 Byte Speicher pro `Publish`, Schutz vor Endlosschleifen (Tiefe 8), Fehler in einem Empfänger stoppen die anderen nicht. | 4.3 |
| `GameStateService` | Spielzustand mit Basiszustand (Boot, Hauptmenü, Laden, Spielen) und Stapel für Menü, Pause, Dialog, Zwischensequenz, Bau-Modus. Setzt die Zeitskala (Menü und Pause = 0). | 4.4 |
| `Log` | Logging mit Kategorien und Mindest-Stufe je Kategorie. `Trace`/`Debug` fehlen im Release-Build vollständig. | 14.4 |
| `GameStateDebugOverlay` | Entwickler-Overlay mit Zustand, Stapel, Zeitskala, letzten 10 Zustandswechseln und Test-Knöpfen (nur Maus). | 14.3 |
| EditMode-Tests | 136 Testfälle für EventBus, ServiceLocator, Installer-Prüfung, Übergangstabelle, GameStateService, Log und TickLoop. | 14.1 |

---

## 2. Dateien und wohin sie gehören

Alle Pfade relativ zu `Assets/_Project/`. **Keine Datei musst du von Hand an ein GameObject hängen, wenn du das Setup-Werkzeug benutzt** (Abschnitt 3). Die Spalte „GameObject“ sagt, wo die Komponente nach dem Setup sitzt.

### 2.1 Laufzeit-Code `Scripts/Core/` (Assembly `Aetherfall.Core`)

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `Aetherfall.Core.asmdef` | `Scripts/Core/` | Assembly-Definition Nr. 2 (Auto Referenced aus, keine Paket-Referenzen) | nein |
| `AssemblyInfo.cs` | `Scripts/Core/` | erlaubt den Test-Assemblies Zugriff auf interne Methoden | nein |
| `CoreEvents.cs` | `Scripts/Core/` | Events `GameStateChanged`, `SceneLoadStarted`, `SceneLoadCompleted` (liegen in Core, weil Core sie sendet und `Aetherfall.Events` nicht referenzieren darf) | nein |
| `GameBootstrapper.cs` | `Scripts/Core/Boot/` | startet das Spiel (Abschnitt 5) | **ja:** GameObject `GameBootstrapper` in `Scenes/Boot/Boot.unity` |
| `TickRunner.cs` | `Scripts/Core/Boot/` | zentraler `Update` für alle `ITickable`-Dienste | **ja:** dasselbe GameObject `GameBootstrapper` (fehlt er, ergänzt ihn der Bootstrapper selbst) |
| `BootFailureScreen.cs` | `Scripts/Core/Boot/` | einfacher Fehlerbildschirm | **nein, nicht von Hand:** wird nur im Fehlerfall automatisch an `GameBootstrapper` angehängt |
| `BootConfig.cs` | `Scripts/Core/Boot/` | Daten-Asset mit der geordneten Installer-Liste und dem Zeitlimit | nein, Asset `Settings/Boot/BootConfig.asset` |
| `BootPhase.cs`, `TickLoop.cs` | `Scripts/Core/Boot/` | interner Ablaufzustand bzw. testbare Logik des TickRunners | nein |
| `EditorBootstrap.cs` | `Scripts/Core/Boot/` | nur im Editor: lädt die Boot-Szene nach, wenn du Play in einer anderen Szene drückst (Abschnitt 7) | nein, läuft automatisch |
| `IServiceRegistry.cs`, `IServiceLocator.cs`, `ServiceLocator.cs`, `Services.cs` | `Scripts/Core/Services/` | Dienst-Ablage und einziger statischer Zugangspunkt `Services.Locator` | nein |
| `ServiceInstaller.cs` | `Scripts/Core/Services/` | Basisklasse aller Installer (je System ein Asset) | nein |
| `IInstallerDescription.cs`, `InstallerDescription.cs`, `InstallerOrderValidator.cs`, `InstallerValidationResult.cs`, `RecordingServiceRegistry.cs` | `Scripts/Core/Services/` | Reihenfolge-Prüfung der Installer (Fail-Fast) | nein |
| `IInitializable.cs`, `IPostInitializable.cs`, `ITickable.cs`, `ISessionService.cs` | `Scripts/Core/Services/` | Lebenszyklus-Schnittstellen der Dienste | nein |
| `IGameEvent.cs`, `IEventBus.cs`, `EventBus.cs` | `Scripts/Core/Events/` | EventBus | nein |
| `EventBusInstaller.cs` | `Scripts/Core/Events/` | Installer für den EventBus | nein, Asset `Settings/Boot/EventBusInstaller.asset` |
| `LogLevel.cs`, `LogCategory.cs`, `ILogSink.cs`, `Log.cs`, `UnityLogSink.cs`, `LogCategoryLevel.cs` | `Scripts/Core/Logging/` | Logging | nein |
| `LogSettings.cs` | `Scripts/Core/Logging/` | Daten-Asset mit Log-Stufen | nein, Asset `Settings/Boot/LogSettings.asset` (optional) |
| `LogInstaller.cs` | `Scripts/Core/Logging/` | erster Installer: übernimmt die Log-Stufen | nein, Asset `Settings/Boot/LogInstaller.asset` |
| `GameState.cs`, `ModalPushMode.cs`, `GameStateTransitions.cs`, `IGameStateService.cs`, `GameStateService.cs` | `Scripts/Core/GameState/` | Zustandsmaschine (Übergangstabelle exakt nach Architektur 4.4) | nein |
| `ITimeScaleService.cs`, `UnityTimeScaleService.cs` | `Scripts/Core/GameState/` | einziger Schreiber von `Time.timeScale`, pausiert bei 0 auch `AudioListener` | nein |
| `GameStateInstaller.cs` | `Scripts/Core/GameState/` | Installer für Zeitskala und GameState | nein, Asset `Settings/Boot/GameStateInstaller.asset` |

### 2.2 Entwickler-Werkzeuge `Scripts/DevTools/` (Assembly `Aetherfall.DevTools`)

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `Aetherfall.DevTools.asmdef` | `Scripts/DevTools/` | Assembly-Definition Nr. 32, referenziert `Aetherfall.Core` | nein |
| `GameStateDebugOverlay.cs` | `Scripts/DevTools/` | Debug-Overlay (Abschnitt 5.3), aktiv nur im Editor und in Development-Builds | **ja:** ein GameObject in `Boot.unity` (das Setup-Werkzeug legt es an) |

### 2.3 Tests `Tests/`

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `Aetherfall.Tests.Shared.asmdef` | `Tests/Shared/` | Test-Hilfen (Assembly Nr. 38), auch für spätere PlayMode-Tests | nein |
| `FakeLogSink.cs`, `CapturedLogEntry.cs`, `LogCapture.cs`, `FakeTimeScaleService.cs`, `EventRecorder.cs` | `Tests/Shared/` | Test-Doubles: Log mitschreiben, Zeitskala ohne Unity, Events aufzeichnen | nein |
| `Aetherfall.Tests.EditMode.asmdef` | `Tests/EditMode/` | EditMode-Test-Assembly (Nr. 39, nur Editor) | nein |
| `EventBusTests.cs`, `EventBusAllocationTests.cs`, `ServiceLocatorTests.cs`, `InstallerOrderValidatorTests.cs`, `GameStateTransitionsTests.cs`, `GameStateServiceTests.cs`, `LogTests.cs`, `TickLoopTests.cs`, `TestEvents.cs` | `Tests/EditMode/` | die Unit-Tests | nein |

> `.meta`-Dateien legt Unity beim ersten Öffnen selbst an. Bitte mit committen.

---

## 3. Was das Setup-Werkzeug anlegt

Das Setup-Werkzeug aus dem Projekt-Setup (Menü **Aetherfall** in der Unity-Menüleiste, siehe Anleitung 01) erzeugt Szene und Assets mit eindeutigen GUIDs. Nach dem Lauf sollte Folgendes existieren:

| Was | Wo | Inhalt |
|---|---|---|
| Boot-Szene | `Assets/_Project/Scenes/Boot/Boot.unity` | GameObject `GameBootstrapper` mit den Komponenten **Game Bootstrapper** und **Tick Runner**; ein GameObject mit **Game State Debug Overlay** |
| Build-Liste | File > Build Profiles > Scene List | `Scenes/Boot/Boot.unity` als **einzige** Szene mit Index 0 |
| Boot-Konfiguration | `Assets/_Project/Settings/Boot/BootConfig.asset` | Liste **Installers** in dieser Reihenfolge: Element 0 = Log-Installer, Element 1 = EventBus-Installer, Element 2 = GameState-Installer; **Initialization Timeout Seconds** = 20 |
| Installer-Assets | `Assets/_Project/Settings/Boot/` | je ein Asset für Log, EventBus, GameState |
| Verknüpfung | Inspector von `GameBootstrapper` | Feld **Boot Config** zeigt auf `BootConfig.asset` |

**Prüfen:** Doppelklick auf `Boot.unity` → in der Hierarchy `GameBootstrapper` anklicken → im Inspector muss **Boot Config** belegt sein. Dann `BootConfig.asset` im Project-Fenster anklicken → die Liste **Installers** hat 3 Einträge in der Reihenfolge oben.

### 3.1 Von Hand anlegen (falls das Setup-Werkzeug nicht lief)

1. Project-Fenster: Ordner `Assets/_Project/Settings/Boot/` öffnen (fehlt er: Rechtsklick > Create > Folder).
2. Rechtsklick > **Create > Aetherfall > Boot > Boot-Konfiguration** → Name `BootConfig`.
3. Rechtsklick > **Create > Aetherfall > Boot > Installer: Log**, danach **Installer: EventBus** und **Installer: GameState**.
4. Optional: Rechtsklick > **Create > Aetherfall > Boot > Log-Einstellungen** → `LogSettings`. Dieses Asset in das Feld **Log Settings** des Log-Installers ziehen.
5. `BootConfig` anklicken → bei **Installers** auf **+** klicken, bis 3 Einträge da sind → Log-, EventBus- und GameState-Installer in genau dieser Reihenfolge hineinziehen.
6. **File > New Scene** (Vorlage „Basic (Built-in)“ oder „Empty“) → speichern als `Assets/_Project/Scenes/Boot/Boot.unity`.
7. In der Hierarchy: Rechtsklick > **Create Empty** → Name `GameBootstrapper` → im Inspector **Add Component** > `Game Bootstrapper` und `Tick Runner`. Feld **Boot Config** mit `BootConfig.asset` belegen.
8. Noch ein **Create Empty** → Name `DevTools` → **Add Component** > `Game State Debug Overlay`.
9. **File > Build Profiles** → Scene List → **Add Open Scenes**; `Boot` muss Index 0 sein, andere Szenen entfernen.
10. Szene speichern (Cmd+S).

---

## 4. EditMode-Tests ausführen

1. Menü **Window > General > Test Runner**.
2. Reiter **EditMode** wählen.
3. Es erscheint `Aetherfall.Tests.EditMode.dll` mit den Klassen `EventBusTests`, `EventBusAllocationTests`, `GameStateServiceTests`, `GameStateTransitionsTests`, `InstallerOrderValidatorTests`, `LogTests`, `ServiceLocatorTests`, `TickLoopTests`.
4. **Run All** klicken.

**Erwartung:** alle **136** Testfälle grün (parametrisierte Tests zählen einzeln). Dauer wenige Sekunden.

| Testklasse | Prüft unter anderem |
|---|---|
| `EventBusTests` | Zustellung, Reihenfolge, Abmelden (auch während einer Zustellung), Anmelden während einer Zustellung, Verschachtelung bis Tiefe 8 und Abbruch bei Tiefe 9 mit Fehler-Log, Fehler in einem Empfänger, doppeltes Abonnieren (wird mit Warnung ignoriert), Aufruf aus einem Hintergrund-Thread |
| `EventBusAllocationTests` | `Publish` allokiert nach dem Aufwärmen 0 Byte (1.000 Aufrufe) |
| `ServiceLocatorTests` | Registrieren, doppelte Registrierung, fehlender Dienst mit Typname, `TryGet`, Reihenfolge der Instanzen, `Services` setzen/zurücksetzen |
| `InstallerOrderValidatorTests` | gültige Reihenfolge, fehlender/zu später/eigener Bedarf, doppelte Dienste, leere Slots, Klassen statt Interfaces, Abgleich „deklariert ↔ registriert“ |
| `GameStateTransitionsTests` | die komplette Übergangstabelle (jede Kombination aus 9 × 9 Zuständen) gegen das Diagramm in Architektur 4.4 |
| `GameStateServiceTests` | alle erlaubten Übergänge, Auswahl verbotener Übergänge, `Pop` mit falschem oberstem Eintrag, Zeitskala je Zustand, Events und Reihenfolge |
| `LogTests` | Filter je Kategorie, `Off`, Rückfall auf die globale Stufe, `Reset`, ohne Ausgabeziel keine Fehler |
| `TickLoopTests` | Reihenfolge, fehlerhafter Dienst wird einmal gemeldet und danach übersprungen |

> Hinweis zu `EventBusAllocationTests`: Der Test misst mit `GC.GetAllocatedBytesForCurrentThread`. Liefert dieser Zähler in einer Unity-Version nichts (bekannter, inzwischen behobener Mono-Fehler), schaltet der Test automatisch auf Unitys eigene Messung `Is.Not.AllocatingGCMemory()` um. Er ist also in jedem Fall aussagekräftig.

---

## 5. Play Mode in der Boot-Szene testen

### 5.1 Vorbereitung

1. `Assets/_Project/Scenes/Boot/Boot.unity` öffnen (Doppelklick).
2. **Console** öffnen (**Window > General > Console**), oben **Clear** klicken und **Clear on Play** einschalten.
3. Game-Fenster sichtbar machen (Reiter **Game**).

### 5.2 Erwartete Konsolen-Ausgabe

Drücke **Play**. In der Console erscheinen diese Zeilen **in genau dieser Reihenfolge** (Asset-Namen können je nach Setup-Werkzeug leicht abweichen, Zeiten schwanken):

| # | Erwartete Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] Step 1/7: Log sink set. Boot started (Unity 6000.3.…, OSXEditor).` | Log-Ausgabe aktiv |
| 2 | `[Boot] Step 2/7: ServiceLocator created.` | neue, leere Dienst-Ablage |
| 3 | `[Boot] Step 3/7: Installer order validated (3 installer(s)).` | Reihenfolge-Prüfung bestanden |
| 4 | `[Core] Log settings applied from 'LogSettings': global minimum level Info, 0 category level(s).` – oder ohne Log-Einstellungen: `[Core] No LogSettings assigned to 'LogInstaller'. Using defaults (global minimum level Info).` | Log-Installer lief |
| 5 | `[Boot] Step 4/7: Installed 'LogInstaller' (provides: -).` | |
| 6 | `[Boot] Step 4/7: Installed 'EventBusInstaller' (provides: IEventBus).` | |
| 7 | `[Boot] Step 4/7: Installed 'GameStateInstaller' (provides: ITimeScaleService, IGameStateService).` | |
| 8 | `[Boot] Step 5/7: 0 service(s) initialized in 0.00 s.` | noch kein Dienst braucht asynchrones Laden (kommt ab Schritt 1.3) |
| 9 | `[Boot] Step 6/7: PostInitialize called on 0 service(s); 0 tickable(s) registered.` | |
| 10 | `[Boot] Step 7/7: Switching to MainMenu.` | |
| 11 | `[GameState] Boot -> MainMenu (Boot completed). Base: MainMenu, modal stack: 0, time scale: 1.` | erster Zustandswechsel |
| 12 | `[Boot] Boot completed in 0.0x s (3 service(s)).` | fertig |

**Keine** gelben Warnungen oder roten Fehler. Beim Beenden von Play Mode erscheint zusätzlich `[Boot] Services shut down (2 disposed in reverse registration order).` (Zeitskala-Dienst und EventBus räumen auf).

### 5.3 Debug-Overlay bedienen (nur Maus)

Links oben im Game-Fenster erscheint das Overlay **Game State (debug)**:

- `Current:` aktueller Zustand · `Base state:` Basiszustand · `Modal stack:` Stapel über dem Basiszustand
- `Time.timeScale` und `AudioListener.pause`
- Knöpfe **SwitchBase** (MainMenu, Loading, Playing), **Push** (Menu, Paused, Dialogue, Cutscene, Building) und **Pop**
- unten die letzten 10 Zustandswechsel, neuester oben (direkt nach dem Start: `Boot -> MainMenu`)

**Blasse Knöpfe** sind Übergänge, die die Tabelle vom aktuellen Zustand aus nicht erlaubt. Ein Klick darauf ist trotzdem möglich und zeigt die Ablehnung als gelbe Warnung, z. B. `[GameState] Rejected SwitchBase(Playing) [Debug overlay]: not allowed from MainMenu. Current: MainMenu, base: MainMenu.` Das ist gewollt.

Mit **Hide** klappst du das Overlay zu, mit dem kleinen Knopf **GameState overlay** wieder auf.

### 5.4 Testablauf mit erwarteten Ergebnissen

Klicke die Knöpfe nacheinander. Nach jedem Klick erscheint genau eine Zeile `[GameState] … -> …` in der Console und eine neue Zeile im Overlay.

| # | Klick | Current danach | Modal stack | `Time.timeScale` | `AudioListener.pause` |
|---|---|---|---|---|---|
| 1 | (nach dem Start) | MainMenu | (empty) | 1 | False |
| 2 | SwitchBase **Loading** | Loading | (empty) | 1 | False |
| 3 | SwitchBase **Playing** | Playing | (empty) | 1 | False |
| 4 | Push **Menu** | Menu | Playing > Menu | **0** | **True** |
| 5 | **Pop (Menu)** | Playing | (empty) | 1 | False |
| 6 | Push **Dialogue** | Dialogue | Playing > Dialogue | 1 | False |
| 7 | Push **Paused** | Paused | Playing > Dialogue > Paused | **0** | **True** |
| 8 | **Pop (Paused)** | Dialogue | Playing > Dialogue | 1 | False |
| 9 | Push **Cutscene** | Cutscene | Playing > Cutscene (der Dialog wird **ersetzt**) | 1 | False |
| 10 | **Pop (Cutscene)** | Playing | (empty) | 1 | False |
| 11 | Push **Building** → **Pop (Building)** | Building → Playing | Playing > Building → (empty) | 1 | False |
| 12 | Push **Paused** | Paused | Playing > Paused | 0 | True |
| 13 | SwitchBase **MainMenu** | MainMenu | (empty) – der Stapel wird geleert | 1 | False |
| 14 | SwitchBase **Playing** (blass) | MainMenu (unverändert) | (empty) | 1 | False – gelbe Warnung „Rejected …“ |

Zusätzlich prüfen:
- **Spielzeit steht bei 0:** In Schritt 4 und 7 bleiben Animationen und Physik in der Szene stehen (sobald welche existieren).
- **Erneut Play drücken:** Der Start läuft wieder vollständig mit Schritt 1–7. Erscheint `A second GameBootstrapper … was started while services are already running`, wurde der statische Zustand nicht zurückgesetzt → Abschnitt 8.

---

## 6. Fail-Fast prüfen (absichtlich falsch konfigurieren)

Ziel aus [Systeme, Schritt 1.2](../Technik/02_Systeme_und_Abhaengigkeiten.md#phase-1--fundament): „Einen Installer aus der Liste nehmen → klare Fehlermeldung.“ Mach jede Änderung **nach dem Test wieder rückgängig** (Cmd+Z oder Reihenfolge zurückziehen).

| # | Änderung an `BootConfig.asset` bzw. `GameBootstrapper` | Erwartung beim Drücken von Play |
|---|---|---|
| 1 | EventBus-Installer aus der Liste entfernen (Element markieren, **−**) | Schwarzer Fehlerbildschirm „Aetherfall could not start“. Console, rot: `[Boot][Fatal] Boot failed: BootConfig 'BootConfig' is invalid. …` mit `1. Installer 'GameStateInstaller' (Element 1) requires 'Aetherfall.Core.IEventBus', but no installer in the list provides it. …` |
| 2 | Reihenfolge tauschen: GameState vor EventBus | Fehlermeldung `… requires 'Aetherfall.Core.IEventBus', which is provided later by Installer 'EventBusInstaller' (Element 2). Move 'EventBusInstaller' before 'GameStateInstaller'.` |
| 3 | GameState-Installer entfernen | `The boot sequence requires 'Aetherfall.Core.IGameStateService' after all installers ran, but no installer in the list provides it. …` |
| 4 | Einen leeren Eintrag anhängen: **+** klicken (Unity kopiert dabei den letzten Eintrag), dann im neuen Element 3 das Feld leeren (Feld anklicken und Entf/Backspace drücken oder im Objekt-Picker „None“ wählen) | `Element 3 is empty. Assign an installer asset or remove the element.` (Ohne das Leeren meldet die Prüfung stattdessen `… is listed twice …` – auch das ist ein gültiger Fail-Fast-Test.) |
| 5 | Feld **Boot Config** am `GameBootstrapper` leeren | `No BootConfig assigned. Select the GameObject 'GameBootstrapper' …` |

In allen Fällen gilt: Es erscheint **kein** `[GameState] Boot -> MainMenu`, das Overlay zeigt `Waiting for services …`, und der Fehlerbildschirm nennt den Pfad der Log-Datei. Der Knopf **Quit** beendet nur einen Build; im Editor stoppst du Play Mode wie gewohnt.

---

## 7. Start aus einer anderen Szene (EditorBootstrap)

1. **File > New Scene** → Vorlage „Basic (Built-in)“ → speichern als `Assets/_Project/Scenes/Test/Test_Leer.unity`. Diese Szene **nicht** in die Build-Liste aufnehmen.
2. Play drücken.

**Erwartung:**
- Erste Zeile in der Console: `[Boot] EditorBootstrap: Play Mode started in 'Test_Leer'. Loading boot scene 'Assets/_Project/Scenes/Boot/Boot.unity' additively.`
- Danach dieselben Zeilen wie in Abschnitt 5.2.
- Hierarchy zeigt **zwei** Szenen: `Test_Leer` und `Boot`. Das Overlay erscheint.
- Play beenden: Die Boot-Szene verschwindet wieder, `Test_Leer` ist unverändert.

Wichtig für spätere Skripte in Test- und Zellen-Szenen: Diese Szene startet **einen Frame vor** der Boot-Szene. Skripte dort dürfen sich nicht darauf verlassen, dass `Services.Locator` schon in `Awake` gesetzt ist. Muster: in `Start` prüfen, ob `Services.Locator` gesetzt ist, dann `TryGet` aufrufen und bei Bedarf pro Frame warten (so macht es `GameStateDebugOverlay`).

Der EditorBootstrap greift **nicht**, wenn die Boot-Szene schon geöffnet ist, die Build-Liste leer ist (dann gelbe Warnung) oder der Test Runner PlayMode-Tests startet.

---

## 8. Typische Fehler und Lösungen

| Symptom | Ursache | Lösung |
|---|---|---|
| Rote Compiler-Fehler „The type or namespace name 'NUnit' could not be found“ | Test Framework fehlt | **Window > Package Manager** → Unity Registry → „Test Framework“ installieren (ist bei Unity 6 normalerweise schon dabei) |
| Test Runner zeigt keine Tests | Test-Assemblies werden nicht kompiliert | Console auf Compiler-Fehler prüfen; in `Aetherfall.Tests.EditMode.asmdef` muss im Inspector **Define Constraints** `UNITY_INCLUDE_TESTS` und **Platforms** nur „Editor“ stehen |
| „Can't add script component 'GameBootstrapper' because the script class cannot be found“ | Compiler-Fehler im Projekt oder Datei umbenannt | erst alle roten Fehler in der Console beheben; Dateiname muss exakt dem Klassennamen entsprechen |
| Fehlerbildschirm „No BootConfig assigned“ | Feld **Boot Config** leer | `GameBootstrapper` anklicken, `BootConfig.asset` hineinziehen |
| `A second GameBootstrapper … is ignored` | Boot-Szene zweimal geladen, z. B. ein zweites `GameBootstrapper`-Objekt in einer anderen Szene | nur **ein** `GameBootstrapper` im ganzen Projekt, nur in `Boot.unity` |
| Beim zweiten Play fehlen Boot-Zeilen oder Dienste sind „already registered“ | statischer Zustand alt (sollte durch den Reset nie passieren) | prüfen, ob Compiler-Fehler das Laden der neuen Skripte verhindern; Unity neu starten |
| `Time.timeScale` bleibt nach einem Absturz auf 0 | Play Mode wurde mitten im Fehler beendet | **Edit > Project Settings > Time** → Time Scale = 1 (der Dienst setzt beim normalen Beenden selbst wieder 1) |
| Start bricht beim Debuggen mit „Initialization timed out“ ab | Haltepunkt während der Initialisierung, die 20 s laufen in Echtzeit weiter | `BootConfig` → **Initialization Timeout Seconds** vorübergehend erhöhen (z. B. 600), danach wieder 20 |
| Overlay fehlt | Komponente deaktiviert, **Hide** gedrückt, Release-Build oder Game-Fenster zu klein | Komponente prüfen; im Release-Build ist das Overlay absichtlich aus; Feld **Ui Scale** anpassen |
| Overlay winzig auf dem Retina-Display | IMGUI rechnet in Pixeln | Feld **Ui Scale** am Overlay erhöhen (z. B. 1,5) |
| Gelbe Warnung `Rejected …` | verbotener Übergang angeklickt | gewollt, siehe 5.3 |
| Gelbe Warnung `… is already subscribed …` | ein Skript abonniert ein Event doppelt (z. B. `OnEnable` ohne `OnDisable`) | Abo in `OnEnable`, Abmelden in `OnDisable` |
| Rider/VS: „Namespace does not correspond to file location“ | alle Core-Dateien nutzen bewusst den Namespace `Aetherfall.Core` (Abschnitt 9) | Hinweis ignorieren oder in Rider für die Unterordner „Namespace Provider“ abschalten |
| `[Core] No LogSettings assigned …` | Log-Installer ohne Log-Einstellungen | nur Info, keine Fehler; optional `LogSettings` anlegen (3.1, Punkt 4) |

---

## 9. Hinweise, Abweichungen und nächste Schritte

**Wichtige Feldnamen** (für das Setup-Werkzeug und spätere Tests): `GameBootstrapper.bootConfig`, `GameBootstrapper.tickRunner` (optional), `BootConfig.installers`, `BootConfig.initializationTimeoutSeconds`, `LogInstaller.logSettings`, `LogSettings.globalMinLevel`, `LogSettings.categoryLevels`.

**Bewusste Entscheidungen in diesem Schritt:**

| Thema | Entscheidung | Grund |
|---|---|---|
| Namespaces in Core | Alle Core-Dateien im Namespace `Aetherfall.Core`, die Unterordner dienen nur der Ordnung | so zeigen es die Code-Skizzen in Architektur 4.1–4.4; ein Unter-Namespace `Aetherfall.Core.Services` würde mit der Klasse `Services` kollidieren |
| Installer melden ihre Dienste | Jeder Installer deklariert `Provides` und `Requires`. Der Bootstrapper prüft die Reihenfolge **vor** dem ersten Installer und vergleicht danach `Provides` mit den tatsächlichen Registrierungen | echte Fail-Fast-Prüfung ohne Nebenwirkungen; die Prüfung ist reine Logik und ohne Unity testbar |
| Doppeltes Abonnieren | wird ignoriert und als Warnung gemeldet | ein Handler wird nie doppelt aufgerufen; die Warnung zeigt fehlendes Abmelden |
| Abmelden während einer Zustellung | Der abgemeldete Empfänger bekommt auch das laufende Event nicht mehr | verhindert Aufrufe auf gerade deaktivierte Objekte |
| Zwischensequenz aus einem Dialog | ersetzt den Dialog im Stapel; nach der Zwischensequenz geht es zurück zu „Spielen“ | entspricht dem Diagramm 4.4 (Pfeil Zwischensequenz → Spielen) |
| Hub-Menüs | Zeitskala 0 | dokumentierte Empfehlung der offenen Entscheidung, gilt bis zur Antwort |
| Overlay-Knopf „Loading“ | zusätzlich zu MainMenu/Playing | ohne ihn ist „Spielen“ vom Hauptmenü aus laut Tabelle nicht erreichbar |
| Lesender Zugriff auf den Stapel | `IGameStateService` hat zusätzlich `ModalCount` und `GetModalAt(i)` | für Overlay und spätere Debug-Seite „Zustand“ (14.3) |

**Grenzen dieses Schritts:** Beim Wechsel ins Hauptmenü wird noch keine Hauptmenü-Szene geladen – das übernimmt der SceneLoader (Schritt 1.4). Tastatur und Gamepad steuern noch nichts (Input System, Schritt 1.7). Der Zeitüberschreitungs-Fall lässt sich erst prüfen, sobald es einen Dienst mit `IInitializable` gibt (ab Schritt 1.3).

**Als Nächstes:** Phase 1, Schritt 1.3 – IDs, Content-Datenbank und Validator (siehe [Status](../Status.md)).
