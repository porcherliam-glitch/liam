# DEAD ZONE: EXTRACTION – 3D-Version (Unity)

Die 3D-Fassung des Zombie-Extraction-Shooters. Es ist dasselbe Spiel wie die HTML-Version (`deadzone/`), nur in echtem 3D:
vier Gebiete, acht Zombie-Arten mit KI, Waffen, Granaten, Inventar mit Gewicht, Basis mit Händler, Werkstätten,
Krankenstation, Funkstation und Ausbau, Aufträge, Tag und Nacht mit Taschenlampe sowie Speichern.

Alles wird im Spiel erzeugt: Karten, 3D-Modelle, Figuren, Animationen und Töne. Es gibt keine gekauften oder
heruntergeladenen Grafiken – **0 € Kosten**.

## So startest du das Spiel (Windows, Unity 6.6)

1. **Unity Hub** öffnen → oben rechts **Add** → **Add project from disk**.
2. Den Ordner **`DeadZone3D`** in deinem Projektordner auswählen (nicht den Hauptordner!).
3. Das Projekt in der Liste anklicken. Unity **6000.6.5f1** öffnet es. Beim ersten Mal dauert das einige Minuten.
4. Es erscheint die Meldung „Das Projekt wurde eingerichtet“ → **OK**.
5. Oben in der Mitte auf **▶ (Play)** klicken. Das Spiel startet im Hauptmenü.

Falls die Meldung nicht kommt: Menü **Dead Zone → Projekt einrichten**, danach **Dead Zone → Spielen**.

### Eine Spieldatei (.exe) bauen

Menü **Dead Zone → Windows-Spiel bauen**. Das Spiel landet auf dem Desktop im Ordner **„Dead Zone Spiel“**
(`DeadZone.exe` doppelklicken). Der erste Bau dauert länger (Shader werden übersetzt).

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Bewegen |
| Maus / linke Maustaste | Zielen / Schießen (halten = Dauerfeuer) |
| R | Nachladen |
| E | Interagieren (Kisten, Türen, Beute); am Generator gedrückt halten |
| Shift | Sprinten |
| C / Strg | Ducken |
| F | Taschenlampe |
| Tab / I | Inventar (das Spiel läuft weiter!) |
| M | Karte |
| G | Granate |
| Q | Schnellheilung |
| 1 – 5 | Primär, Sekundär, Nahkampf, Granate, Medizin |
| X | Ausgewählten Gegenstand ablegen |
| Mausrad | Kamera zoomen |
| Esc | Pause / Fenster schließen |
| F1 | Hilfe |

Gamepad: linker Stick bewegen, rechter Stick zielen, RT schießen, A benutzen, X nachladen, B ducken, LB sprinten,
RB Granate, Steuerkreuz oben Taschenlampe / unten Heilung / links-rechts Waffe, Start Pause, View Inventar, Y Karte.

Im Inventar: Gegenstände **ziehen und ablegen**, **Rechtsklick** = schnell verschieben (beim Händler: verkaufen),
**Doppelklick** = ausrüsten oder benutzen.

## Spielprinzip

- **Einsatz:** Gebiet betreten, Gebäude durchsuchen (das Dach verschwindet, sobald du drin bist), Zombies bekämpfen
  oder umgehen, Aufträge erfüllen und an einem **Extraktionspunkt** (grüner Lichtstrahl) lebend raus.
- **Risiko:** Wer stirbt, verliert alles am Körper und im Rucksack. Nur der **sichere Behälter** bleibt.
- **Schließen während eines Einsatzes** zählt beim nächsten Start als **vermisst** (Ausrüstung verloren).
- **Basis:** Händler, Waffenwerkstatt, Werkstatt, Krankenstation, Funkstation (Aufträge), Basisausbau, Statistik.

Der Spielstand liegt in `%USERPROFILE%\AppData\LocalLow\DeadZoneStudio\Dead Zone Extraction\`.

## Aufbau (für Entwickler)

| Ordner | Inhalt |
|---|---|
| `Assets/_Project/Scripts/Core` | Spielkern ohne Unity (Assembly `DeadZone.Core`): Kartengenerator, Kollision, Wegfindung, KI, Waffen, Inventar, Beute, Aufträge, Extraktion, Profil, Speichern, Töne. Eine 1:1-Übertragung der HTML-Version; die Karten sind bitgenau gleich. |
| `Assets/_Project/Scripts/Core/Data/DataTables.Generated.cs` | Spieldaten, automatisch erzeugt aus `deadzone/src/0*_data_*.js` mit `node DeadZone3D/Tools/gen_data.mjs` |
| `Assets/_Project/Scripts/Game` | Unity-Teil (`DeadZone.Game`): 3D-Welt, Figuren, Kamera, Licht, Effekte, Ton, Eingabe, Oberfläche (IMGUI) |
| `Assets/_Project/Scripts/Editor` | Menü **Dead Zone** (Einrichten, Spielen, Bauen) |
| `Assets/_Project/Tests/EditMode` | Tests des Spielkerns (laufen auch im Unity Test Runner) |
| `Tools/check.sh` | Prüfung ohne Unity (Linux/macOS mit .NET 8): Tests + Kompilieren gegen Unity-Referenzen |

Batchmode (Windows, im Ordner `DeadZone3D`):

```
"C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe" -batchmode -nographics -projectPath . -executeMethod DeadZone.EditorTools.ProjectSetup.RunBatch -logFile Logs\setup.log
"C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults Logs\tests.xml -logFile Logs\tests.log
"C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe" -batchmode -projectPath . -executeMethod DeadZone.EditorTools.BuildTool.RunBatch -logFile Logs\build.log
```

## Stand der Prüfung

- In der Cloud geprüft: 21 Grundtests grün (Kartengenerator bitgenau wie die HTML-Version für alle 4 Gebiete,
  90 Sekunden Spielsimulation auf jedem Gebiet ohne Fehler, Kampf, Extraktion, Tod, „vermisst“ beim Neuladen,
  Speichern mit Sicherung, Händler, Werkstatt, Ausbau, Generator, Laborkarte, Granaten, alle 45 Töne).
- Dazu 9 Tests für die Funde aus zwei Prüfrunden (Rucksackwechsel ohne Verlust, Beute in den sicheren Behälter,
  MG-Munition, mitgebrachte Gegenstände zählen nicht als Beute) – zusammen 30 Tests grün.
- Der Unity-Teil kompiliert fehlerfrei gegen die Unity-Referenzbibliotheken, wurde aber **noch nicht in Unity selbst
  gestartet** (in der Cloud gibt es kein Unity). Beim ersten Öffnen auf dem PC können kleine Anpassungen nötig sein.
