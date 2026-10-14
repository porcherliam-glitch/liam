# CLAUDE.md – Chroniken von Aetherfall

Übergabe für jede Claude-Sitzung in diesem Repo, vor allem für die Sitzung **auf dem PC des Auftraggebers** mit Unity und Blender.
Stand: 2026-10-14. Den laufenden Stand führt [docs/Status.md](docs/Status.md), diese Datei beschreibt Regeln und Arbeitsweise.

## Projekt in drei Sätzen

- 3D-Open-World-Action-RPG in **Unity 6.3 LTS (URP, C# 9, .NET Standard 2.1)** für macOS (Apple Silicon) und Windows.
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
| `EditorTools.World` | **Testgelände erstellen**, **Eichental erstellen**, **Oberfläche einrichten**, **Neues Spiel startet in …**, **Szene öffnen …** |
| `EditorTools.Narrative` | **Quests prüfen** (Dialoge prüfen liegt in `Dialogue`) |

Tests liegen unter `Assets/_Project/Tests/` (EditMode, getrennt nach Bereich). Stand 2026-10-14: **2066 Tests grün im Harness**.

**In Arbeit (Cloud-Sitzung, Stand 2026-10-14):**
- **Dorf Eichental:** Nachbesserung nach Prüfung läuft, Zwischenstand ist als `WIP`-Commit gepusht.
- **Die vergessene Gruft** (Rätsel, Gruftwächter, Anleitung 12): wird in einer eigenen Arbeitskopie gebaut und danach in den Arbeits-Branch zusammengeführt.

**Wichtig:** Bis 2026-10-14 ist **nichts davon jemals in Unity gelaufen**. Geprüft wurde nur mit dem Harness (Kompilieren gegen Unity-2021-Referenzen + Stubs) und mit Vorschaubildern aus Blender bzw. HTML (keine Unity-Screenshots). Die erste Aufgabe auf einem Rechner mit Unity ist deshalb, es wirklich in Unity zu öffnen und Fehler zu beheben.

## Cloud-Sitzung und PC-Sitzung: wer arbeitet wann

- **Immer nur eine Sitzung schreibt.** Sobald die PC-Sitzung läuft, sagt der Auftraggeber in der Cloud-Sitzung „stopp“. Die Cloud-Sitzung pusht dann nichts mehr.
- **Vor jeder Arbeit:** `git pull origin claude/new-session-2ye8ds`. **Vor jedem Push:** noch einmal pullen.
- Kein `--force`, kein Rebase auf gepushter Historie. Bei Konflikten zusammenführen (Merge-Commit).

## Auf dem PC mit Unity: erste Aufgaben, in dieser Reihenfolge

1. `git pull`, dann Projekt in Unity 6.3 LTS öffnen (beim ersten Mal über den Unity Hub, „Add project from disk“). Fehlende `ProjectSettings/` und `Packages/` legt Unity selbst an; danach Menü **Aetherfall > Projekt-Setup …** ausführen (installiert Pakete, setzt Einstellungen).
2. Kompilierfehler beheben, bis die Konsole leer ist. Häufige Ursachen: API-Unterschiede zwischen Unity 2021 (Harness) und Unity 6.3, Paketversionen (Input System, Cinemachine 3, Newtonsoft).
3. EditMode-Tests im Batchmode laufen lassen (Befehl unten) und rot gewordene Tests reparieren.
4. Generatoren im Batchmode ausführen (Testgelände, Eichental), Szenen öffnen, Play Mode starten, Screenshots machen und prüfen.
5. **Projekt-Setup** bekommt noch einen Batchmode-Einstiegspunkt (`RunBatch`), wie die anderen Menüs unten. `EditorUtility.DisplayDialog` darf im Batchmode nicht blockieren (`Application.isBatchMode` prüfen).
6. Danach die Testanleitungen 02–12 selbst durchgehen und Ergebnisse in `docs/Status.md` eintragen.

## Auf dem PC mit Unity: so testen

Unity im Batchmode (Pfad zur installierten 6000.3.x-Version anpassen; Windows-Beispiel):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults Logs\editmode-results.xml -logFile Logs\editmode.log
```

Batchmode-Einstiegspunkte (jeweils mit `-batchmode -nographics -projectPath . -quit -logFile Logs\<name>.log`):

| Zweck | `-executeMethod` |
|---|---|
| Testgelände erzeugen | `Aetherfall.EditorTools.World.TestGroundMenu.RunBatch` |
| Eichental erzeugen | `Aetherfall.EditorTools.World.EichentalMenu.RunBatch` |
| Quests prüfen | `Aetherfall.EditorTools.Narrative.QuestValidationMenu.RunBatch` |
| Dialoge prüfen | `Aetherfall.Dialogue.DialogueValidationMenu.RunBatch` |

- Kompilierfehler stehen in der Logdatei (nach `error CS` suchen).
- Ein Projekt, das gerade im Editor offen ist, kann nicht zusätzlich im Batchmode geöffnet werden.
- **Play-Mode-Prüfung:** Ein PlayMode-Test oder ein Editor-Skript kann Szenen laden und Screenshots per `ScreenCapture`/`RenderTexture` speichern. Diese Bilder kann Claude ansehen, um Aufbau, Kamera und Darstellung zu prüfen.
- Der Harness (`Tools/Harness/run_checks.sh`) läuft nur unter Linux. Auf Windows reicht der Unity-Batchmode.

## Blender (Modelle statt Platzhalter)

- Headless: `blender --background --python Tools/Blender/<skript>.py`. Modelle per `bpy` erzeugen und als `.fbx` nach `Assets/_Project/Art/Models/…` exportieren.
- Quelldateien (`.blend`) gehören nach `ArtSource/` (Git LFS), **nie** nach `Assets/` (Architektur 2.9).
- Konventionen: 1 Einheit = 1 m, Y-up beim Export, LOD-Suffixe `_LOD0…`, Pivot am Boden. Details in [GDD 05, Art Direction](docs/GDD/05_UI_Audio_Grafik_Barrierefreiheit.md).
- Animationen: Mixamo (kostenlos) oder eigene einfache Rigs. Jede Quelle kommt ins Lizenzregister.
- Die Vorschau-Skripte unter `Tools/Preview/` lesen dieselbe Layout-Datei wie der Unity-Generator. Sie sind Vorlagen für echte Modelle.

## Nächste Bausteine bis zum Mini-Slice

1. Erster echter Unity-Lauf, Fehler beheben, Projekt-Setup im Batchmode (siehe oben)
2. Dorf Eichental und Die vergessene Gruft fertigstellen (Cloud-Sitzung, siehe „In Arbeit“) und in Unity prüfen
3. Dialoge ins Spiel einbinden (Anleitung 10, Abschnitt „Integration“), echte NPCs statt Marker im Eichental
4. Gruft-Eingang im Eichental ↔ Gruft-Szene verbinden (Anleitung 12)
5. Die 3 Quests als Daten nach GDD 02, Abschnitt 11 („Asche über Eichental“, „Die Wölfe vom Nordhang“, „Die vergessene Gruft“)
6. Startstufe wieder auf 1 setzen, Neues Spiel/Laden aus dem Hauptmenü, Tod/Wiedereinstieg
7. Platzhalter durch Blender-Modelle ersetzen (Häuser, Gruft, Wolf), Animationen
