# Vorschau-Bilder und -Videos ohne Unity (Blender-Nachbau)

Stand: 2026-10-13

## Wozu?

Das Testgelände entsteht in Unity über das Menü **Aetherfall > Testgelände erstellen**. Solange Unity nicht läuft, kann man es nicht ansehen. Diese Skripte bauen das Testgelände deshalb in **Blender** nach und rendern daraus Bilder und Videos. Dazu kommen die Planungsdiagramme aus `docs/` als Bilder.

**Die Oberfläche** (Hauptmenü, HUD, Pausemenü, Todes- und Ladebildschirm) hat ein eigenes Werkzeug: [ui/README.md](ui/README.md) baut sie aus den UXML-, USS- und Textdateien als HTML nach und macht daraus Bilder.

**Wichtig: Das sind Vorschauen, keine Unity-Screenshots.** Jedes Bild und jedes Video trägt unten einen Balken mit diesem Hinweis. Formen, Positionen, Drehungen, Maße und Farben stammen aus dem Code des Generators. Licht, Schatten, Schrift und Materialien sehen in Unity aber anders aus (siehe [Grenzen](#grenzen)).

## Was entsteht?

| Datei | Inhalt |
|---|---|
| `01_uebersicht.png` | Schrägansicht über das ganze Testgelände |
| `02_arena.png` | Kampfarena nah: Spieler mit Schwert und Schild, 2 Grauwölfe, Aether-Wolf, Felsen, Beute mit Loot-Strahlen |
| `02b_truhen.png` | Die drei Truhen, die Eisentruhe geöffnet (Deckel −105°) |
| `03_spielersicht.png` | Third-Person-Sicht am Startpunkt mit den Werten des Kamera-Rigs (4 m Abstand, Pivot 1,6 m, 15° Neigung, Sichtfeld 55°, Spieler leicht links) |
| `04_karte.png` | Draufsicht (orthografisch, Norden oben) mit Beschriftung, Farblegende, Maßstab |
| `05_rundflug.mp4` | Kameraflug (14 s) vom Startpunkt über alle Bereiche bis in die Arena |
| `06_sprungtest.mp4` | Spieler-Kapsel läuft vom Start zu den Sprungplattformen und springt auf 0,4 m und 0,8 m. Die Bahn ist mit den echten Bewegungswerten berechnet (gelbe Punkte = berechnete Bahn). |
| `07_spielzustaende.png` | Zustandsdiagramm GameStateManager (Architektur 4.4) |
| `08_assembly_graph.png` | Assembly-Graph (Architektur 3.4) |
| `09_regionen.png` | Nachbarschaft der Regionen (GDD 01, 3.2) |
| `10_session_loop.png` | Session-Loop (GDD 00, Core Loops) |

## Voraussetzungen

- **Blender 4.x** (getestet mit 4.0.2), kostenlos von blender.org
- **Python 3** mit **Pillow** (`pip install pillow`)
- **ffmpeg** mit H.264 (libx264) für die Videos
- Für die Videos unter Linux ohne Bildschirm: **xvfb-run** (virtueller Bildschirm für EEVEE). Ohne xvfb-run nimmt das Skript Cycles, das dauert etwa viermal so lange.
- Für die Diagramme: **mermaid-cli** (`mmdc`, über npm)

## Aufruf

Alles auf einmal (vom Repo-Ordner aus):

```bash
Tools/Preview/alles_rendern.sh                 # Ausgabe nach Tools/Preview/Ausgabe/ (von Git ignoriert)
Tools/Preview/alles_rendern.sh /pfad/zum/ordner
```

Einzelne Teile:

```bash
# Einzelbilder (Cycles, CPU, ohne Entrauschen). Jobs: uebersicht, arena, truhen, spielersicht, karte, alle_bilder
blender -b -P Tools/Preview/testgelaende_preview.py -- --job alle_bilder --samples 48 --out AUSGABE
python3 -I Tools/Preview/nachbearbeiten.py bilder --dir AUSGABE      # Balken, Kartenbeschriftung, Legende

# Videos als Einzelbilder, dann MP4 (EEVEE braucht unter Linux ohne Bildschirm xvfb-run)
xvfb-run -a blender -b -P Tools/Preview/testgelaende_preview.py -- --job rundflug --engine eevee --samples 16 --out AUSGABE
xvfb-run -a blender -b -P Tools/Preview/testgelaende_preview.py -- --job sprungtest --engine eevee --samples 16 --out AUSGABE
python3 -I Tools/Preview/nachbearbeiten.py video --dir AUSGABE --name 05_rundflug
python3 -I Tools/Preview/nachbearbeiten.py video --dir AUSGABE --name 06_sprungtest

# Diagramme aus docs/ (immer der aktuelle Stand der Dokumente)
python3 -I Tools/Preview/diagramme_rendern.py --mmdc /pfad/zu/mmdc --out AUSGABE
```

Die Diagramme 07 (Spielzustände) und 09 (Regionen) nutzen das Layout „ELK“ von Mermaid, weil sich beim Standard-Layout Beschriftungen überlappen. Der Inhalt bleibt genau der aus den Dokumenten.

Hilfreiche Schalter für `testgelaende_preview.py`:

- `--test` rendert halb so groß und mit wenigen Samples (zum schnellen Prüfen).
- `--kamera=px,py,pz,tx,ty,tz,fov` setzt für ein Einzelbild eine andere Kamera (Unity-Koordinaten: Position, Ziel, senkrechtes Sichtfeld). Das Gleichheitszeichen ist nötig, wenn die erste Zahl negativ ist.
- `--name datei.png` speichert ein Einzelbild unter einem anderen Namen.
- `--frames a-b` rendert bei Videos nur die Bilder a bis b.

Rechenzeit auf 4 CPU-Kernen ohne Grafikkarte (gemessen am 2026-10-13): Einzelbilder etwa 1 Minute je Bild (5 Bilder: 5,5 Minuten), beide Videos zusammen 22 Minuten mit EEVEE (660 Bilder, beide gleichzeitig gerendert). Mit Cycles bräuchte ein Videobild etwa 9 s.

## Woher die Werte kommen

| Teil | Quelle im Code |
|---|---|
| Boden, Linien, Rampen, Treppen, Plattformen, Lücken, Wand, Säulen, Tunnel, Schilder | `Assets/_Project/Scripts/Editor/World/TestGroundGeometry.cs` |
| Licht (Sonne 50°/−30°, Stärke 1,2), Spieler-Kapsel 1,8 m mit „Nase“, Kamera-Rig | `TestGroundSceneBuilder.cs` |
| Schwert, Schild, Arena, Felsen, Trainingspuppe, Wölfe, Kristallkern | `TestGroundCombatBuilder.cs`; Ruhe-Pose aus `PlayerWeaponPose.cs` |
| Truhen und Deckel | `TestGroundItemBuilder.cs`; Öffnungswinkel aus `LootChest.cs` |
| Farben | `TestGroundMaterials.cs`, `TestGroundItemAssets.cs`, Seltenheit aus `RarityRules.cs` |
| Loot-Strahlen und Beutewürfel | `LootBeamPool.cs` (Höhe je Seltenheit, 8 cm dick, ab „Selten“), `LootWorldSpawner.cs` (Würfel 0,3 m, Streuung), `InventoryDebugOverlay.cs` („Test-Beute“ 1,6 m vor der Figur) |
| Sprungbahn | `PlayerMovementSettings.cs` und `PlayerMovementModel.cs` (Laufen 5 m/s, Beschleunigung in 0,15 s, Sprunghöhe 1,2 m, g = 9,81 m/s², fallend ×1,6, Luftkontrolle 0,4, Drehen 720°/s) |

Die Werte sind ins Skript **kopiert**, nicht zur Laufzeit gelesen. Ändert sich der Generator, muss `testgelaende_preview.py` angepasst werden.

### Koordinaten

Unity: x rechts (Osten), y oben, z vorne (Norden), linkshändig. Blender: x Osten, y Norden, z oben, rechtshändig. Das Skript rechnet alles in Unity-Zahlen und wandelt erst am Ende um: Position (x, y, z) → (x, z, y), Maße (sx, sy, sz) → (sx, sz, sy), ganze Matrizen mit M_Blender = P · M_Unity · P (P vertauscht y und z). Weil P eine Spiegelung ist, kehrt sich dabei der Drehsinn automatisch richtig um. Geprüft an den Bildern: Rampen und Treppen im Norden steigen nach Norden an, Plattformen im Osten werden nach Osten höher, Lücken im Westen, Wand und Tunnel im Süden, der Spieler schaut am Start nach Norden, Schatten fallen nach Nordnordwest (Sonne aus Südsüdost).

## Grenzen

- **Nachbau, kein Unity-Rendering:** Blender-Shader statt URP/Lit, eigenes Himmels-Licht statt Unitys Skybox und Umgebungslicht, andere Schatten. Farben und Formen stimmen, die Stimmung kann in Unity anders wirken.
- **Schrift:** Unity nutzt „LegacyRuntime.ttf“, hier Liberation Sans (gleiche Maße wie Arial). Die Größe ist aus `fontSize × characterSize × 0,1` geschätzt. Dezimalzahlen mit Komma, so wie es ein deutsches Windows/macOS in Unity ausgibt.
- **Schilder sind einseitig lesbar:** Sie zeigen vom Ursprung weg, wie im Generator. Von hinten wären sie spiegelverkehrt, deshalb schauen die Kameras möglichst von der Startseite.
- **Laufzeit-Zustand:** Schwert und Schild stehen in der Ruhe-Pose, die `PlayerWeaponPose` im Spiel setzt. Das Schild der Trainingspuppe zeigt den Text, den `TrainingDummy` im Spiel schreibt. Im Editor ohne Play-Modus stünden Schwert und Schild gerade und die Puppe zeigte nur „Trainingspuppe“.
- **Inszeniert:** In `02_arena.png` steht der Spieler in der Arena (im Spiel startet er am Ursprung) und hat „Test-Beute“ gedrückt. Loot-Strahlen gibt es im Spiel nur für Beute, die in der Welt liegt. Truhen-Beute geht direkt in den Rucksack. In `02b_truhen.png` ist die Eisentruhe geöffnet.
- **Keine Spiellogik:** Wölfe stehen still (keine KI, keine Animation). Kamera-Kollision mit Wänden, Lock-On und Kamera-Wackeln sind nicht nachgebaut.
- **Sprungtest:** Die Bahn nutzt die Formeln von `PlayerMovementModel` (Bodenbeschleunigung, Sprung, steigende und fallende Schwerkraft, Luftsteuerung ohne Umkehr). Kollisionen sind vereinfacht (Kapsel gegen Plattform-Quader). Die „Eingaben“ sind ausgedacht: kurz stehen, laufen, springen, im Sprung den Stick zurückziehen, damit die Figur auf der 2,4 m kleinen Plattform landet. Die Kamera-Drehung beim Laufen ist ein simuliertes Maus-Nachführen (im Spiel dreht die Kamera nicht von selbst mit).
- **Videos mit EEVEE:** Cycles bräuchte für 1280×720 bei 16 Samples etwa 9 s je Bild (über 1,5 Stunden für beide Videos). EEVEE (Rasterisierung wie in Unity, 16 Samples zur Kantenglättung und für weiche Schatten) braucht etwa 2 s. Die Einzelbilder sind mit Cycles gerendert, daher wirken Schatten und Licht in Bildern und Videos leicht unterschiedlich. Der Rundflug ist 14 s lang, damit beide Videos in rund 22 Minuten fertig sind.

## Eichental

Das Dorf Eichental (Mini-Slice, [Anleitung 11](../../docs/Anleitungen/11_Test_Eichental.md)) hat eigene Skripte. Anders als beim Testgelände sind die Werte hier **nicht kopiert**: Unity-Generator und Vorschau lesen **dieselbe Datei** `Assets/_Project/Data/Regions/Eichental/eichental_layout.json`.

| Datei | Aufgabe |
|---|---|
| `eichental_layout.py` | Python-Zwilling der C#-Logik in `Assets/_Project/Scripts/World/Layout/`: Höhen (`LayoutHeightField`), Bodenarten (`LayoutGroundMap`), Pflanzen-Verteilung (`VegetationScatter`, gleicher PCG32-Zufall), Gegnerpositionen und Riss-Kristalle (`LayoutPlacement`). |
| `eichental_referenz.py` | Schreibt Vergleichswerte des Python-Zwillings nach `Assets/_Project/Tests/EditModeWorld/EichentalPreviewReference.cs`. Die EditMode-Tests prüfen damit, dass C# und Python gleich rechnen. **Nach jeder Änderung der Layout-Datei ausführen.** |
| `eichental_preview.py` | Baut das Eichental in Blender nach (Gelände mit Bodenfarben, Bäche, Häuser mit Dächern, verbrannte und eingestürzte Häuser mit Glut und Rauch, Pflanzen, Felsen, Requisiten, Riss, Wölfe, Truhen, NPC-Platzhalter, Spielfigur) und rendert. Jobs: `uebersicht`, `dorf`, `karte`, `alle_bilder`, `rundflug`. |
| `eichental_nachbearbeiten.py` | Hinweis-Balken, Ortsnamen in der Übersicht, Beschriftung, Legende, Maßstab und Nordpfeil der Karte; setzt das Video zusammen (Zwischenbilder auf 30 fps, leichtes Entrauschen, H.264). |

```bash
blender -b -P Tools/Preview/eichental_preview.py -- --job alle_bilder --samples 96 --out AUSGABE
python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir AUSGABE
blender -b -P Tools/Preview/eichental_preview.py -- --job rundflug --samples 2 --fps 15 --fast --out AUSGABE
python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir AUSGABE --video --render-fps 15
python3 -I Tools/Preview/eichental_referenz.py
```

Ergebnis: `eichental_uebersicht.png`, `eichental_dorf.png`, `eichental_karte.png` (1920 × 1080 bzw. 2300 × 1600) und `eichental_rundflug.mp4` (15 s, 1280 × 720). Weitere Schalter: `--test` (halbe Größe), `--first-frame`/`--last-frame` (Teil des Videos), `--overwrite`. Höhen, Bodenarten und Pflanzen werden beim ersten Lauf berechnet und als `eichental_cache_*.pickle` im Ausgabeordner zwischengespeichert (neu, sobald sich die Layout-Datei ändert).

Rechenzeit auf 4 CPU-Kernen ohne Grafikkarte (gemessen am 2026-10-14): drei Einzelbilder mit Cycles und 96 Samples zusammen 11–12 Minuten; Rundflug RUNDFLUGZEIT. Für den Rundflug ist Cycles im Modus `--fast` vereinfacht: Umgebungslicht als Eigenleuchten statt indirektem Licht, 2 Samples, 15 Bilder pro Sekunde, die Zwischenbilder für 30 fps rechnet ffmpeg (`minterpolate`). EEVEE läuft in dieser Umgebung nicht.

**Grenzen:** wie oben (Nachbau, kein Unity-Rendering). Rauch ist in der Vorschau eine Volumen-Wolke (im Video weggelassen), in Unity ein Partikelsystem. Gezeigt werden nur Gegner, die von Anfang an da sind; die Quest-Gruppen sind in Unity ausgeschaltet. Glut-Lichter, Riss-Licht und Lagerfeuer sind in Blender und Unity unterschiedlich hell.
