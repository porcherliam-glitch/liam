# DEAD ZONE: EXTRACTION – 3D-Version (Unity)

Die 3D-Fassung des Zombie-Extraction-Shooters. Es ist dasselbe Spiel wie die HTML-Version (`deadzone/`), nur in echtem 3D
und aus der **Ego-Perspektive** (First Person): Du siehst durch die Augen deiner Figur, die Waffe in der Hand.
Mit **V** wechselst du jederzeit zur Ansicht von oben.

Vier Gebiete, acht Zombie-Arten mit KI, Waffen, Granaten, Inventar mit Gewicht, Basis mit Händler, Werkstätten,
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
| W A S D | Bewegen (in Blickrichtung) |
| Maus | Umsehen und zielen (in der Ansicht von oben: auf das Ziel zeigen) |
| Linke Maustaste | Schießen (halten = Dauerfeuer) |
| Rechte Maustaste | Heranzoomen und genauer zielen – du gehst dabei langsamer (Scharfschützengewehr stark) |
| R | Nachladen |
| E | Interagieren (Kisten, Türen, Beute – hinschauen); am Generator gedrückt halten |
| Shift | Sprinten |
| C / Strg | Ducken |
| F | Taschenlampe |
| Tab / I | Inventar (das Spiel läuft weiter!) |
| M | Karte |
| G | Granate (nach oben schauen = weiter werfen) |
| Q | Schnellheilung |
| 1 – 5 | Primär, Sekundär, Nahkampf, Granate, Medizin |
| Mausrad | Waffe wechseln (Ansicht von oben: Kamera zoomen) |
| X | Ausgewählten Gegenstand ablegen |
| V | Ansicht wechseln: Ego-Perspektive oder von oben |
| Esc / P | Pause / Fenster schließen – gibt auch die Maus frei |
| F1 | Hilfe |

Gamepad: linker Stick bewegen, rechter Stick umsehen, RT schießen, LT zoomen, A benutzen, X nachladen, B ducken,
LB sprinten, RB Granate, R3 Ansicht wechseln, Steuerkreuz oben Taschenlampe / unten Heilung / links-rechts Waffe,
Start Pause, View Inventar, Y Karte.

In der Ego-Perspektive wird die Maus im Einsatz eingefangen (unsichtbar). Sobald du Inventar, Karte oder Pause öffnest,
ist sie wieder frei. Wechselst du mit Alt+Tab aus dem Fenster, pausiert der Einsatz. Im Unity-Editor erst einmal ins
Spielbild klicken, damit die Maus eingefangen wird.
Mausempfindlichkeit, Sichtfeld, „Maus umkehren“ und „Kopfwippen“ stellst du unter **Einstellungen** ein. Wird dir
schwindelig: Kopfwippen ausschalten und das Sichtfeld größer stellen.
**Lauftempo** „Ruhig“ (Standard) lässt dich und die Zombies in der Ego-Perspektive langsamer laufen, „Original“ ist
das Tempo der Ansicht von oben. Sprinten geht in der Ego-Perspektive nur vorwärts.
Mit dem Scharfschützengewehr zeigt die rechte Maustaste ein Zielfernrohr. Orange Pfeile am Bildrand zeigen Zombies, die
dich von der Seite oder von hinten angreifen.
Der Schuss geht genau dorthin, wohin das Fadenkreuz zeigt – auch nach oben und unten: **Kopftreffer** machen viel mehr Schaden.
Zombies **versperren dir den Weg**: Du kannst nicht durch sie hindurchlaufen und sie nur langsam wegschieben, große kaum.
Oben in der Mitte zeigt ein Kompass die Himmelsrichtung, Extraktionspunkte (grün, gesperrt orange) und Auftragsziele
(gelb) mit Entfernung.

Im Inventar: Gegenstände **ziehen und ablegen**, **Rechtsklick** = schnell verschieben (beim Händler: verkaufen),
**Doppelklick** = ausrüsten oder benutzen.

## Spielprinzip

- **Einsatz:** Gebiet betreten, Gebäude durchsuchen (von oben verschwindet das Dach, sobald du drin bist), Zombies bekämpfen
  oder umgehen, Aufträge erfüllen und an einem **Extraktionspunkt** (grüner Lichtstrahl) lebend raus.
- **Risiko:** Wer stirbt, verliert alles am Körper und im Rucksack. Nur der **sichere Behälter** bleibt.
- **Schließen während eines Einsatzes** zählt beim nächsten Start als **vermisst** (Ausrüstung verloren).
- **Basis:** Händler, Waffenwerkstatt, Werkstatt, Krankenstation, Funkstation (Aufträge), Basisausbau, Statistik.

Der Spielstand liegt in `%USERPROFILE%\AppData\LocalLow\DeadZoneStudio\Dead Zone Extraction\`.

## Automatischer Test

Menü **Dead Zone → Automatischer Test (mit Bildern)**. Das Spiel spielt sich etwa 30 Sekunden lang selbst: neues Spiel,
Einsatz in der Stadt, umsehen, laufen, schießen, nachladen, Inventar, Granate, Ansicht von oben und zurück, Tod,
zurück zur Basis. Dabei macht es Bilder und schreibt einen Bericht. Dein echter Spielstand bleibt dabei unverändert.

Ohne Editor-Fenster (Windows, im Ordner `DeadZone3D`):

```
"C:\Program Files\Unity\Hub\Editor\6000.6.5f1\Editor\Unity.exe" -batchmode -projectPath . -executeMethod DeadZone.EditorTools.PlayTest.RunBatch -logFile Logs\playtest.log
```

Wichtig: **ohne** `-nographics` (sonst gibt es keine Bilder) und **ohne** `-quit` (Unity beendet sich am Ende selbst,
Rückgabewert 0 = keine Fehler, 1 = Probleme gefunden).

Die Bilder (`01_hauptmenue.png` bis `15_basis_zurueck.png`) und der Bericht `report.txt` landen in
**`DeadZone3D\Logs\DeadZoneTest\`**. Der Bericht listet jeden Schritt, Fehler und Warnungen, Bildzeiten (Durchschnitt und
langsamstes Bild), die Zahl der Zombies und auffällige Bilder (schwarz, einfarbig, Magenta = fehlender Shader).
Damit kann Claude auf dem PC Probleme finden, ohne dass du selbst spielen musst. Die Bilder zeigen nur die 3D-Welt, nicht
die Menüs. Auch das fertige Spiel kann sich selbst testen: `DeadZone.exe -dzAutoTest` (Bilder im Spielordner unter
`Logs\DeadZoneTest`, mit Menüs).

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
  MG-Munition, mitgebrachte Gegenstände zählen nicht als Beute) und 7 Tests für die Ego-Perspektive (Benutzen durch
  Hinschauen, keine Beute durch Wände, Wurfweite, Blickrichtungs-Mathematik, neue Einstellungen) und 8 Tests für Lauftempo,
  Zielen und Streuung – zusammen 45 Tests grün.
- Für den ersten Lauf in Unity gibt es den **automatischen Test** (siehe oben): Er spielt das Spiel kurz selbst an, macht
  Bilder und schreibt einen Bericht mit allen Fehlern.
- Der Unity-Teil kompiliert fehlerfrei gegen die Unity-Referenzbibliotheken, wurde aber **noch nicht in Unity selbst
  gestartet** (in der Cloud gibt es kein Unity). Beim ersten Öffnen auf dem PC können kleine Anpassungen nötig sein.
