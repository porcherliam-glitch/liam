# CLAUDE.md – Chroniken von Aetherfall

Übergabe für jede Claude-Sitzung in diesem Repo, vor allem für die Sitzung **auf dem PC des Auftraggebers** mit Unity und Blender.
Stand: 2026-10-14. Den laufenden Stand führt [docs/Status.md](docs/Status.md), diese Datei beschreibt Regeln und Arbeitsweise.

## Projekt in drei Sätzen

- 3D-Open-World-Action-RPG in **Unity 6.6 (6000.6.x, URP, C# 9, .NET Standard 2.1)** für macOS (Apple Silicon) und Windows.
- Die verbindliche Spezifikation des Auftraggebers ist [docs/00_Master-Prompt.md](docs/00_Master-Prompt.md). Ihre Abschnitte heißen §1–§33; besonders wichtig sind §31 (Roadmap) und §32 (Arbeitsregeln).
- Der Auftraggeber arbeitet **allein**, ist **Einsteiger**, will **0 € ausgeben** und möchte, dass Claude möglichst alles selbst macht.

## Wichtigste Dokumente

| Datei | Inhalt |
|---|---|
| [docs/Status.md](docs/Status.md) | **Erledigt / In Arbeit / Als Nächstes**, Entscheidungs-Log, Kurskorrektur „Mini-Slice“ |
| [docs/Technik/01_Architektur.md](docs/Technik/01_Architektur.md) | **Verbindliche Architektur**: 40 Assemblies mit Nummern (3.3), Schichtregel, Kernsysteme (4), Events (4.3), GameState-Tabelle (4.4), Speichern (9), Streaming (10), Konventionen (15) |
| [docs/Technik/02_Systeme_und_Abhaengigkeiten.md](docs/Technik/02_Systeme_und_Abhaengigkeiten.md) | 70 Systeme, Bau-Reihenfolge, kritischer Pfad |
| [docs/GDD/](docs/GDD/) | Game-Design-Dokument in 6 Kapiteln (Werte, Formeln und Tuning stehen in 03 und 04) |
| [docs/Offene_Fragen.md](docs/Offene_Fragen.md) | Offene Entscheidungen. Bis zur Antwort gilt die Empfehlung. |
| [docs/Anleitungen/](docs/Anleitungen/) | Einsteiger-Anleitungen (Setup, je Baustein eine Testanleitung) |
| [Tools/Harness/README.md](Tools/Harness/README.md) | Compile- und Test-Harness ohne Unity (Linux/.NET 8) |

## Ziel jetzt: „Mini-Slice“ (Stufe A0)

Siehe [Status, Kurskorrektur](docs/Status.md). Das Ziel ist ein Ausschnitt des Eichentals, in 30–60 Minuten spielbar:
- Orte: Dorf Eichental und „Die vergessene Gruft“ (Rätsel und Mini-Boss Gruftwächter)
- Quests: „Asche über Eichental“, „Die Wölfe vom Nordhang“, „Die vergessene Gruft“ (Daten-Outlines in [GDD 02, Abschnitt 11](docs/GDD/02_Quests_und_Dialoge.md))
- Gegner: Wolf und Aether-Wolf. Ausrüstung: Schwert und Schild. Klasse: Krieger.
- Speichern und Laden müssen vollständig funktionieren.

Der Rest ist Platzhalter: einfache Formen, später Blender-Modelle oder kostenlose CC0-Assets.

## Arbeitsregeln (aus §32 und Architektur 15)

- **Sprache:** Mit dem Auftraggeber **Deutsch**, einfach und ohne Fachjargon. Code, Kommentare, Bezeichner und Commit-Texte im Code auf **Englisch**. Editor-Menüs, Tooltips und alle Dateien in `docs/` auf Deutsch.
- **Vollständige Dateien** liefern, keine Ausschnitte. Bei jedem Skript sagen, in welchen Ordner es gehört und an welches GameObject es kommt.
- **Code-Regeln:**
  - `[SerializeField] private` statt öffentlicher Felder
  - keine `Find*`-Aufrufe im Laufzeitcode
  - kein `UnityEngine.Input`, nur das Input System
  - `Services.Locator` nur in `Awake`/`Start`/Installern, Ergebnis cachen
  - Events in `OnEnable` abonnieren, in `OnDisable` abmelden
- **Domain Reload ist aus:** Jeden statischen Zustand per `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]` zurücksetzen.
- **Assemblies:** Namen, Namespaces und Referenzen exakt nach Architektur 3.3. Assembly Nr. n darf nur Nummern < n referenzieren.
- **Paketabhängige Assemblies** (Input System, Cinemachine, Newtonsoft …) absichern mit asmdef-`versionDefines` + `defineConstraints`. Sonst blockieren fehlende Pakete beim ersten Öffnen alles.
- **Testbarkeit:** Reine Logik ohne UnityEngine-Laufzeitaufrufe in eigene Klassen legen und mit EditMode-Tests absichern. Dünne MonoBehaviour-Adapter nur für Unity-Zugriffe.
- **Speichern mitdenken:** Jedes System mit Zustand implementiert `ISaveable` (Architektur 9).
- **Controller mitdenken:** Jede UI muss vollständig mit dem Gamepad bedienbar sein.
- **Bilder für den Auftraggeber (Wunsch vom 2026-10-14):** Nach den Vorschaubildern von Dorf Eichental und Gruft keine neuen Vorschaubilder oder Videos mehr erstellen, außer er fragt ausdrücklich danach. Screenshots, mit denen Claude die eigene Arbeit prüft, sind weiter erlaubt.
- **Nach jedem Baustein:**
  - Tests grün
  - Testanleitung `docs/Anleitungen/NN_….md` schreiben
  - `docs/Status.md` aktualisieren
  - committen und pushen
- **Git:** Arbeits-Branch `claude/new-session-2ye8ds`. Commit-Nachrichten auf Deutsch. Unity-Dateien (`.meta`, Szenen, Assets) mit committen. Nie `Library/`, `Temp/`, `Logs/`, `UserSettings/`.

## Was es schon gibt (Code unter `Assets/_Project/`)

| Assembly | Inhalt |
|---|---|
| `Core` | `GameBootstrapper`, `BootConfig`, Installer, `ServiceLocator`, `EventBus`, `GameStateService`, Logging, `TickRunner`, `EditorBootstrap` |
| `Utilities`, `Data`, `Events` | Zufall (`Pcg32Random`), Definitionen/IDs, globale Event-Structs |
| `Input` | Action Maps im Code, Geräteerkennung, Cursor, Pause |
| `Player` | Bewegung (CharacterController), Ausdauer, Kampf-Anbindung, Lock-On |
| `CameraSystem` | Cinemachine-3-Third-Person, Lock-On-Kamera, Impulse |
| `Stats`, `Combat` | Attribute, Modifikatoren, Ressourcen, `DamageCalculator`, `CombatStateMachine`, Hitbox/Hurtbox, Haltung |
| `AI` | Wolf und Aether-Wolf, Wahrnehmung, Angriffs-Token, Leash |
| `SaveSystem` | `ISaveable`, `SaveManager`, JSON, Backups, Migration, F5/F9 |
| `Items`, `Inventory` | Items, Affixe, Loot, Inventar, Ausrüstung, Truhen |
| `Conditions`, `WorldState` | Bedingungen und Aktionen mit `[SerializeReference]`, Weltzustand (Flags, Zähler) |
| `Quests` | Quest-System (Stufen, 14 Zieltypen, Belohnungen, Ledger), Prüfregeln V01–V18 |
| `Progression` | EP-Kurve, Stufen, Attribut- und Skillpunkte |
| `Dialogue`, `NPC` | Dialog-Graph (8 Knotentypen, Skill-Checks), NPCs mit Interaktion |
| `GameTime` | Spielzeit |
| `UI.Framework`, `UI.Screens` | UI Toolkit: Screen-/Fokus-Stapel, Glyphen, HUD, Haupt-/Pause-/Todesmenü, Questlog, Charakter, Dialog |
| `World` | Layout-Leser, Eichental-Daten, `AreaTrigger`, NPC-Marker |
| `DevTools` | IMGUI-Debug-Overlays |
| `EditorTools.Core` | Menü **Aetherfall > Projekt-Setup …** (Pakete, Einstellungen, Ordner, Boot-Szene) |
| `World` (Ordner `World/Dungeons`, `World/Puzzles`), `World.Gameplay` | Dungeon-Layout und -Prüfung, Rätsel-Logik, Weltobjekt-Zustände, Portale, Checkpoints, Speicher-Anbindung der Gruft |
| `AI` (Ordner `AI/Bosses`) | Mini-Boss „Der Wachende Ritter“ (Phasen, Bossbalken-Dienst), Skelett-Krieger mit Turmschild |
| `EditorTools.World` | **Testgelände erstellen**, **Eichental erstellen**, **Gruft erstellen**, **Oberfläche einrichten**, **Neues Spiel startet in …**, **Szene öffnen …** |
| `EditorTools.Narrative` | **Quests prüfen** (Dialoge prüfen liegt in `Dialogue`) |

Tests liegen unter `Assets/_Project/Tests/` (EditMode, getrennt nach Bereich). Stand 2026-10-14 nach Dorf und Gruft: **2159 Tests grün im Harness** (dazu 1 nur in Unity; 1194 auch ohne Pakete).

**Zuletzt fertig (Cloud-Sitzung, 2026-10-14):**
- **Dorf Eichental:** Generator und Layout fertig, alle 11 Prüfbefunde eingearbeitet ([Anleitung 11](docs/Anleitungen/11_Test_Eichental.md)).
- **Die vergessene Gruft:** eigene Szene mit 2 Rätseln, Skelett-Kriegern und dem Mini-Boss „Der Wachende Ritter“, alle 11 Prüfbefunde eingearbeitet ([Anleitung 12](docs/Anleitungen/12_Test_Gruft.md)).
  - Sie wurde parallel gebaut, ohne bestehende Dateien zu ändern. Deshalb fehlt noch die **Integration nach Anleitung 12, Abschnitt 11**: Portal im Dorf, Laden und Szenenwechsel über die Welt-ID, Lebenspunkte über den Portalwechsel mitnehmen, echter Bossbalken im HUD.
- **Dialog-Integration** ist ebenfalls noch offen. Die genaue Arbeitsanweisung steht in [Anleitung 10, Abschnitt 12](docs/Anleitungen/10_Test_Dialoge.md); sie wurde gegen einen älteren Stand geprüft. Mit den Eichental-Änderungen an `TestGroundMenu`, `TestGroundUiBuilder` und der World-Editor-asmdef abgleichen.

**Erster Unity-Lauf (PC-Sitzung, 2026-10-14):** Projekt liegt auf dem PC unter `C:\Users\limap\Desktop\Aetherfall`, geöffnet mit **Unity 6000.6.5f1** (installiert sind auch 6000.0.84f1 und 6000.6.3f1). Setup im Batchmode fehlerfrei, kompiliert, **2159/2161 EditMode-Tests grün in Unity** (2 inconclusive: Allokationsmessung), Generatoren Testgelände/Eichental/Gruft laufen durch. Der Play Mode wurde noch **nicht** angesehen. Lehren aus dem Lauf:
- Ein Szenenwechsel im Single-Modus (`NewScene`/`OpenScene`) entlädt Assets, die nur in lokalen Variablen stehen → in Generatoren über `GeneratorAssetPins.Hold` festhalten oder nach dem Wechsel neu laden.
- `Awaitable.NextFrameAsync` wartet in Unity wirklich einen Frame (im Harness sofort). Logik, die in Tests synchron laufen soll, bekommt ein `FrameWait` (Tests: `ImmediateFrames.Wait`).
- `[DisallowMultipleComponent]` wird nur in Unity durchgesetzt; `AddComponent` liefert dann null.
- Die 6.6-Vorlage `urp-blank` setzt keine Default Render Pipeline; Schritt b) setzt sie jetzt.
- Szenen neu erzeugen ändert die internen IDs (Eichental.unity: ~10 MB Diff bei gleichem Inhalt). Nur committen, wenn sich der Inhalt wirklich geändert hat, sonst `git checkout` auf die erzeugten Dateien.
- Screenshots im Batchmode: immer eine frische Kamera rendern (die Spielkamera zeigte durch ihre GPU-Culling-Daten zeitweise nur das Terrain); die UI kommt über `PanelSettings.targetTexture` ins Bild (siehe `PlayTour`).

## Cloud-Sitzung und PC-Sitzung: wer arbeitet wann

- **Immer nur eine Sitzung schreibt.** Die Cloud-Sitzung hat am 2026-10-14 mit der ZIP-Übergabe aufgehört. Ab jetzt arbeitet nur die PC-Sitzung.
- **Vor jeder Arbeit:** `git pull origin claude/new-session-2ye8ds`. **Vor jedem Push:** noch einmal pullen.
- Kein `--force`, kein Rebase auf gepushter Historie. Bei Konflikten zusammenführen (Merge-Commit).

## Auf dem PC mit Unity: erste Aufgaben, in dieser Reihenfolge

**Unity-Version (Entscheidung des Auftraggebers, 2026-10-14):** **Unity 6.6 (6000.6.5f1)**, installiert unter `C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe`. Damit ersetzt 6.6 die frühere Planung „6.3 LTS“ (Architektur 1.1, Status Entscheidungs-Log).
- Wo in älteren Dokumenten „6.3 LTS“ oder „6000.3“ steht, gilt jetzt 6.6 bzw. 6000.6.
- 6.6 ist kein LTS. Wenn 6.7 LTS erscheint, wie geplant umsteigen (Architektur 1.1).
- Unity 6.0 (6000.0.84f1) ist auch installiert, wird aber nicht verwendet.
- Der Harness prüft gegen Unity-2021-Referenzen mit Unity-6-Ergänzungen. Was in 6.4–6.6 als veraltet (`[Obsolete]`) oder entfernt markiert ist, sieht er nicht. Solche Warnungen und Fehler in Unity beheben.

1. **Projektordner prüfen.** Der Auftraggeber bekommt das Projekt als ZIP aus der Cloud-Sitzung. Die ZIP enthält den Ordner `.git`, ist also ein vollständiges Git-Repository mit Remote `https://github.com/porcherliam-glitch/liam` und Branch `claude/new-session-2ye8ds`.
   - `git status` und `git pull origin claude/new-session-2ye8ds` ausführen.
   - Will der Auftraggeber GitHub Desktop nutzen, dort „Add an Existing Repository from your Local Drive“ auf diesen Ordner.
   - Pushen braucht eine GitHub-Anmeldung auf dem PC (GitHub Desktop oder Git Credential Manager).
2. **Unity-Projektdateien anlegen.** Im Repo fehlen `Packages/` und `ProjectSettings/` absichtlich. Sie werden aus der Unity-Vorlage „Universal 3D“ der installierten Version erzeugt ([Anleitung 01](docs/Anleitungen/01_Projekt-Setup.md), Abschnitte 3–5; die Anleitung ist für macOS geschrieben).
   - Unter Windows legt der Auftraggeber im Unity Hub ein Projekt `AetherfallVorlage` aus „Universal 3D“ an, öffnet es einmal und schließt es wieder.
   - Danach kopiert Claude die drei Ordner ins Repo, zum Beispiel mit `robocopy <Vorlage>\Assets Assets /E`, `robocopy <Vorlage>\Packages Packages /E` und `robocopy <Vorlage>\ProjectSettings ProjectSettings /E`. Nichts löschen, `Assets/_Project` bleibt unverändert.
   - Dann das Repo im Unity Hub hinzufügen („Add project from disk“), öffnen und Menü **Aetherfall > Projekt-Setup …** ausführen (installiert Pakete, setzt Einstellungen, räumt Vorlagen-Inhalte auf).
   - `Packages/` und `ProjectSettings/` danach committen.
3. Kompilierfehler beheben, bis die Konsole leer ist. Häufige Ursachen: API-Unterschiede zwischen Unity 2021 (Harness) und Unity 6.6, Paketversionen (Input System, Cinemachine 3, Newtonsoft).
4. EditMode-Tests im Batchmode laufen lassen (Befehl unten) und rot gewordene Tests reparieren.
5. Generatoren im Batchmode ausführen (Testgelände, Eichental), Szenen öffnen, Play Mode starten, Screenshots machen und prüfen.
6. ~~**Projekt-Setup** bekommt noch einen Batchmode-Einstiegspunkt~~ Erledigt: `ProjectSetupBatch.RunBatch`, Rückfragen über `SetupDialogs.Confirm`.
   Schritte 1–4 und 6 sind am 2026-10-14 erledigt; von 5 fehlt noch Play Mode mit Screenshots.
7. Danach die Testanleitungen 02–12 selbst durchgehen und Ergebnisse in `docs/Status.md` eintragen.

## Auf dem PC mit Unity: so testen

Unity im Batchmode (Windows, installierte Version 6000.6.5f1):

```
"C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults Logs\editmode-results.xml -logFile Logs\editmode.log
```

Batchmode-Einstiegspunkte (jeweils mit `-batchmode -nographics -projectPath . -quit -logFile Logs\<name>.log`):

| Zweck | `-executeMethod` |
|---|---|
| Testgelände erzeugen | `Aetherfall.EditorTools.World.TestGroundMenu.RunBatch` |
| Eichental erzeugen | `Aetherfall.EditorTools.World.EichentalMenu.RunBatch` |
| Gruft erzeugen | `Aetherfall.EditorTools.World.GruftMenu.RunBatch` |
| Spiel-Rundgang mit Screenshots (mit Grafik: **ohne** `-nographics` und ohne `-quit`; `-tourScene <Szenenpfad>`) | `Aetherfall.EditorTools.World.PlayTour.RunBatch` |
| Projekt-Setup (ohne `-quit`, beendet sich selbst; nach Paketänderungen ein zweites Mal ausführen) | `Aetherfall.EditorTools.Core.ProjectSetupBatch.RunBatch` |
| Quests prüfen | `Aetherfall.EditorTools.Narrative.QuestValidationMenu.RunBatch` |
| Dialoge prüfen | `Aetherfall.Dialogue.DialogueValidationMenu.RunBatch` |

- Kompilierfehler stehen in der Logdatei (nach `error CS` suchen).
- Ein Projekt, das gerade im Editor offen ist, kann nicht zusätzlich im Batchmode geöffnet werden.
- **Play-Mode-Prüfung:** Ein PlayMode-Test oder ein Editor-Skript kann Szenen laden und Screenshots per `ScreenCapture`/`RenderTexture` speichern. Diese Bilder kann Claude ansehen, um Aufbau, Kamera und Darstellung zu prüfen.
- Der Harness (`Tools/Harness/run_checks.sh`) läuft nur unter Linux. Auf Windows reicht der Unity-Batchmode.

## Blender (Modelle statt Platzhalter)

- **Blender ist über Steam installiert.** Standardpfad unter Windows: `C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe`. Liegt die Steam-Bibliothek woanders, mit `where /r C:\ blender.exe` oder in Steam über „Verwalten > Lokale Dateien durchsuchen“ suchen. Steam muss dafür nicht laufen; `blender.exe` lässt sich direkt aufrufen.
- Steam aktualisiert Blender selbstständig. Die Vorschau-Skripte wurden mit Blender 4.0 geschrieben. Zuerst `blender.exe --version` prüfen. Bei API-Fehlern in einer neueren Version die Skripte anpassen; ein Downgrade ist nicht nötig.
- Headless: `blender --background --python Tools/Blender/<skript>.py`. Modelle per `bpy` erzeugen und als `.fbx` nach `Assets/_Project/Art/Models/…` exportieren.
- Quelldateien (`.blend`) gehören nach `ArtSource/` (Git LFS), **nie** nach `Assets/` (Architektur 2.9).
- Konventionen: 1 Einheit = 1 m, Y-up beim Export, LOD-Suffixe `_LOD0…`, Pivot am Boden. Details in [GDD 05, Art Direction](docs/GDD/05_UI_Audio_Grafik_Barrierefreiheit.md).
- Animationen: Mixamo (kostenlos) oder eigene einfache Rigs. Jede Quelle kommt ins Lizenzregister.
- Die Vorschau-Skripte unter `Tools/Preview/` lesen dieselbe Layout-Datei wie der Unity-Generator. Sie sind Vorlagen für echte Modelle. Sie rendern mit Cycles auf der CPU ohne Denoiser, weil die Cloud keine GPU hat. Auf dem PC (16 GB VRAM) stattdessen Cycles mit GPU (CUDA/OptiX bzw. HIP) und Denoiser oder EEVEE verwenden.

## Nächste Bausteine bis zum Mini-Slice

1. Erster echter Unity-Lauf, Fehler beheben, Projekt-Setup im Batchmode (siehe oben)
2. Generatoren laufen lassen (Testgelände, Eichental, Gruft), die Szenen in Unity prüfen und die Testanleitungen 02–12 durchgehen
3. ~~Dialoge ins Spiel einbinden (Anleitung 10, Abschnitt 12)~~ erledigt (12.1–12.6, Harrik im Testgelände); offen: echte NPCs statt Marker im Eichental, 12.7
4. ~~Gruft anbinden nach Anleitung 12, Abschnitt 11~~ erledigt (Portal, Laden über Welt-ID, Werte mitnehmen, Bossbalken im HUD)
5. Die 3 Quests als Daten nach GDD 02, Abschnitt 11 („Asche über Eichental“, „Die Wölfe vom Nordhang“, „Die vergessene Gruft“)
6. Startstufe wieder auf 1 setzen, Neues Spiel/Laden aus dem Hauptmenü, Tod/Wiedereinstieg
7. Platzhalter durch Blender-Modelle ersetzen (Häuser, Gruft, Wolf), Animationen

## Danach: wie es weitergeht

Der ganze Fahrplan steht in [docs/Status.md, „Als Nächstes“](docs/Status.md). Kurz:
1. **Mini-Slice** (oben) fertig und einmal komplett durchgespielt.
2. **Stufe A – Vertical Slice** (etwa 3,5–4 Stunden): die 5 übrigen Beispiel-Quests aus GDD 02, Abschnitt 11, Lindenhain mit Händlern, Würfeln, Begleiterin Maren, Klasse Magier. Danach die echte Arbeitsgeschwindigkeit messen (Gate G2).
3. **Stufe B / B-Minimal / C** erst nach dieser Messung entscheiden ([GDD 00, Umfangsstufen](docs/GDD/00_Vision_und_Ueberblick.md#umfangsstufen)).

Nach jedem Baustein: Tests grün, Testanleitung, `docs/Status.md` aktualisieren, committen und pushen (siehe Arbeitsregeln).
