# Testanleitung: Dorf Eichental als begehbarer Rohbau

> Eichental aus einer Layout-Datei: Gelände, Bäche, Häuser (heil, verbrannt, eingestürzt), Wald, Felder, Aether-Riss, Wölfe, Truhen, Orts-Zonen, Spuren, NPC-Platzhalter · Stand: 2026-10-14 (nach der Prüfung überarbeitet) · Bezug: [GDD 01, Abschnitte 3.1 und 4.1](../GDD/01_Welt_Story_Fraktionen.md) · [GDD 02, Abschnitt 11](../GDD/02_Quests_und_Dialoge.md) · [GDD 05, Abschnitt 3](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) · [Architektur 2.8, 3.1, 10](../Technik/01_Architektur.md) · [Status, Kurskorrektur „Mini-Slice“](../Status.md)

Bisher gab es nur das Testgelände: eine flache Fläche mit Rampen, Treppen und einer Arena. Jetzt gibt es den ersten **echten Ort** des Mini-Slice: das **Dorf Eichental** mit seiner Umgebung. Es ist ein **Rohbau** (englisch „Blockout“): Häuser aus Quadern mit Satteldach, Bäume aus Stamm und Krone, Wölfe aus Würfeln. Schöne Modelle kommen später aus Blender oder als kostenlose CC0-Pakete. Aber du kannst schon **herumlaufen**, die Wege, Abstände und Höhen ausprobieren und gegen Wölfe kämpfen.

- Du **wachst im brennenden Dorf auf**, neben dem eingestürzten Elternhaus. Es ist später Nachmittag, die Sonne steht tief im Westen.
- Im Dorf sind die meisten Häuser **verbrannt** (dunkle Wände, Dach zum Teil weg, Glut, Rauch) oder **eingestürzt** (nur Mauerreste und Balken). Nordöstlich leuchtet **der Riss** türkis in einem Krater.
- Im Westen liegt **Lindenhain** mit dem Gasthaus „Zum Krummen Kessel“ und dem **Anschlagbrett**, im Südwesten die **Mühle** am Mühlbach, im Nordwesten der **Hollmann-Hof** und dahinter der **Nordhang** mit Birkenwald, **Wölfen** und dem **Wolfsbau**. Im Norden steht der **Rabenfels** mit dem (noch verschlossenen) Eingang der **vergessenen Gruft**.
- Begehbar sind **400 × 400 m**. Quer durch läufst du in etwa 80 Sekunden.

**Alles kommt aus einer einzigen Datei:** `Assets/_Project/Data/Regions/Eichental/eichental_layout.json`. Daraus baut Unity die Szene (Menü **Aetherfall > Eichental erstellen**), und daraus hat Claude auch die **Vorschaubilder** in Blender gerendert. Was in der Vorschau steht, steht auch in Unity an derselben Stelle.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 09](./09_Test_Quests_im_Spiel.md) sind erledigt (mindestens einmal **Aetherfall > Testgelände erstellen** ausgeführt).

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Eichental erstellen](#3-eichental-erstellen)
4. [Automatische Tests](#4-automatische-tests)
5. [Spielen: zwei Wege](#5-spielen-zwei-wege)
6. [Rundgang: die Orte](#6-rundgang-die-orte)
7. [Kämpfen, Truhen, Speichern](#7-kämpfen-truhen-speichern)
8. [Prüfliste](#8-prüfliste)
9. [Was noch fehlt](#9-was-noch-fehlt)
10. [Was du zurückmelden sollst](#10-was-du-zurückmelden-sollst)
11. [Häufige Fehler und Lösungen](#11-häufige-fehler-und-lösungen)
12. [Dateien und wohin sie gehören](#12-dateien-und-wohin-sie-gehören)
13. [Das Layout ändern](#13-das-layout-ändern)
14. [Für Claude: ohne Klicks (Batchmode) und Vorschau](#14-für-claude-ohne-klicks-batchmode-und-vorschau)
15. [Hinweise, Abweichungen und offene Punkte](#15-hinweise-abweichungen-und-offene-punkte)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Layout-Datei** `eichental_layout.json` | Beschreibt den ganzen Ausschnitt in Zahlen: Größe und Höhen des Geländes, Bäche (Linie mit Breite), Wege, Brücken, 20 Gebäude (Art, Lage, Drehung, Größe, Dach, Zustand), Zäune, Felder, Waldgebiete, Felsen, Requisiten (Brunnen, Lagerfeuer, Zelte …), den Riss, 13 Orte mit den IDs aus GDD 02, 7 Gegnergruppen, 5 Truhen, 18 NPC-Platzhalter, 13 Quest-Objekte, 2 Spuren für „Folge der Spur“, den Startpunkt und die Farbpalette nach GDD 05. Lesbar mit jedem Texteditor. |
| **Layout-Leser und Prüfung** (`Aetherfall.World`, Ordner `Scripts/World/Layout`) | Liest die Datei und prüft sie: Version, Pflichtfelder, keine doppelten IDs, alles innerhalb des begehbaren Bereichs, **kein Haus im Bach**, keine Häuser übereinander, Gegner, NPC-Platzhalter und Spur-Knoten nicht im Wasser oder in Häusern, Brücken wirklich über einem Bach. Fehlermeldungen auf Deutsch mit Zeile und Feld. Rechnet auch die Geländehöhen, die Bodenarten (Gras, Erde, Fels, Asche), die Verteilung von Bäumen und Büschen und die Formen von Felsen und Brückenbogen aus. |
| **Generator** (Menü **Aetherfall > Eichental erstellen**) | Baut daraus die Szene `Assets/_Project/Scenes/World/Eichental.unity`: Gelände (Terrain) mit vier Bodenschichten, Wasser, Häuser mit eigenem Dachmodell, verbrannte Häuser dunkel mit Glut und Rauch, eingestürzte als Mauerreste, rund 2 450 Bäume, Büsche und Steine, Felder, Zäune, Brücken, Requisiten, den leuchtenden Riss, Licht, Himmel und leichten Dunst. Dazu Spielfigur, Kamera, Bildschirmanzeige, Wölfe, Truhen, Orts-Zonen, Spuren, Anschlagbrett, NPC-Platzhalter und Quest-Objekte. **Idempotent:** Du kannst das Menü beliebig oft ausführen; es baut die Szene jedes Mal frisch aus der Datei. |
| **Neues Spiel** | „Neues Spiel“ im Hauptmenü startet jetzt im **Eichental**. Die Szenenliste ist **Boot → Eichental → Testgelände**. Das Testgelände bleibt erreichbar (siehe [Abschnitt 5](#5-spielen-zwei-wege)). |
| **Welt-Bausteine** | `NpcMarker` (Figur mit NPC-ID aus GDD 02, Phase und Quest-Stufe), `QuestObjectMarker` (Objekt-ID für Quests), `SpawnGroupMarker` (Gegnergruppe mit ID; meldet sich beim Dienst `ISpawnGroupRegistry` an), `TrailNodeTrigger` (Knoten einer Spur, meldet „Spur-Knoten erreicht“), `ConditionalObjectGroup` (zeigt den Brand im Dorf nur während des Prologs), Quest-Aktion **„Welt/Gegner spawnen“** (`SpawnEncounter`, im GDD `Gegner+(spawn-id)`). |
| **Vorschau** (`Tools/Preview/eichental_preview.py`) | Baut das Eichental aus derselben Datei in **Blender** nach und rendert Übersicht, Dorfansicht, beschriftete Karte und einen 15-Sekunden-Rundflug. Unten auf jedem Bild steht „Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)“. |
| **Tests** | Neue Test-Gruppe `Aetherfall.Tests.EditMode.World` (204 Testfälle). Sie lesen die **echte** Layout-Datei und prüfen u. a., dass sie fehlerfrei ist, dass alle Orts-, NPC- und Gegner-IDs aus GDD 02 vorkommen und dass Unity und die Blender-Vorschau dieselben Höhen, Bäume, Gegnerpositionen und Kristalle berechnen. |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert).
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu.

---

## 3. Eichental erstellen

1. Falls das Spiel läuft: oben auf **Play** klicken, damit es stoppt.
2. Menü **Aetherfall > Eichental erstellen**.
   **Du siehst danach:** das Fenster **Eichental erstellen** mit einer Liste, was gebaut wird (Szene, Gelände, Häuser, Wölfe, Truhen …).
3. **Erstellen** klicken (beim zweiten Mal heißt der Knopf **Neu aufbauen**). Fragt Unity, ob die offene Szene gespeichert werden soll: **Save** oder **Don't Save**, je nachdem, ob du dort etwas geändert hast.
   **Du siehst danach:** Unity arbeitet etwa eine Minute (der Mauszeiger dreht sich, vielleicht ein Fortschrittsbalken). Dann: „Fertig! Die Szene „Eichental“ ist geöffnet. …“. **OK** klicken.
4. Steht im Fenster unter „Hinweise (…)“ etwas, bitte abschreiben oder fotografieren und an Claude schicken.
5. Im **Hierarchy**-Fenster (links) stehen jetzt u. a.: **Sonne**, **Main Camera**, **Landschaft**, **Siedlungen** (darin **Gebäude** und **Brand (Prolog)**), **Der Riss von Eichental**, **Player**, **PlayerSpawnPoint**, **CM_Explore**, **CM_LockOn**, **Spiel** (darin **Gegner**, **Truhen**, **Orte**, **NPC-Platzhalter**, **Quest-Objekte**, **Spuren**).
6. Im **Scene**-Fenster (Mitte) siehst du das Tal. Zum Umsehen: rechte Maustaste halten und mit **W A S D** fliegen, Mausrad zum Zoomen. Doppelklick auf **Player** in der Hierarchy holt die Ansicht zur Spielfigur.

**Was angelegt wird:**

| Was | Wo |
|---|---|
| Szene `Eichental.unity` | `Assets/_Project/Scenes/World/` |
| Gelände-Daten `TD_Eichental_MiniSlice.asset` | `Assets/_Project/Art/Terrain/Data/eichental/` |
| 4 Bodenschichten mit selbst erzeugten Texturen (Gras, Erde, Fels, Asche) | `Assets/_Project/Art/Terrain/Eichental/` |
| Materialien in den Farben aus der Layout-Datei (`M_Eichental_…`), Himmel, Rauch | `Assets/_Project/Art/Materials/Eichental/` |
| Alle erzeugten Modelle (Dächer, Bäume, Felsen, Zäune, Felder, Wasser …) in einer Datei | `Assets/_Project/Art/Models/Generated/Eichental/EichentalMeshes.asset` |
| Layer 12 „Terrain“ (falls frei) | Projekt-Einstellungen |
| Eintrag „Neues Spiel startet in: Eichental“ | am `UIInstaller` in `Assets/_Project/Settings/Boot/` |
| `WorldInstaller.asset` (Dienst für die Gegnergruppen), in der BootConfig vor dem `QuestInstaller` | `Assets/_Project/Settings/Boot/` |
| Szenenliste Boot → Eichental → Testgelände | **File > Build Profiles** (bzw. Build Settings) |

**Startstufe:** Das Eichental-Menü **ändert die „Startstufe neues Spiel (nur Test)“ am `ProgressionInstaller` nicht** (nur „Testgelände erstellen“ stellt sie auf 10). Das Fenster nennt den aktuellen Wert, z. B. „ProgressionInstaller: Startstufe neues Spiel = 10 (unverändert …)“. Die Figur in der Szene bekommt dieselbe Stufe.

> **Wichtig:** Änderungen, die du **von Hand in der Szene** machst (z. B. ein Haus verschieben), gehen beim nächsten Ausführen des Menüs verloren. Dauerhafte Änderungen gehören in die Layout-Datei (siehe [Abschnitt 13](#13-das-layout-ändern)).

---

## 4. Automatische Tests

1. Menü **Window > General > Test Runner**.
2. Reiter **EditMode** wählen, oben **Run All** klicken.
   **Du siehst danach:** grüne Haken. Neu ist der Eintrag **Aetherfall.Tests.EditMode.World** mit 204 Tests.
3. Ist etwas rot: auf den roten Eintrag klicken, unten steht die Meldung. Bitte als Text oder Foto an Claude schicken.

Die wichtigsten neuen Tests:

| Test | Prüft |
|---|---|
| `EichentalLayoutFileTests` | Die echte Datei ist fehlerfrei, alle Orte, NPCs, Gegnergruppen und Quest-Objekte aus GDD 02 haben ihre IDs, Startpunkt im Dorf. |
| `RegionLayoutValidatorTests` | Die Prüfung findet absichtlich eingebaute Fehler (Haus im Bach, doppelte ID, außerhalb des Bereichs …). |
| `LayoutHeightFieldTests`, `VegetationScatterTests`, `LayoutPlacementTests` | Unity und die Blender-Vorschau rechnen **dieselben** Höhen, Bäume, Gegnerpositionen und Kristalle (Vergleich mit Werten aus der Vorschau). |
| `RoofGeometryTests` | Die Dächer sind geschlossen und zeigen mit der richtigen Seite nach außen. |
| `RockAndBridgeGeometryTests` | Felsen liegen mit ihrer flachen Unterseite auf dem Drehpunkt (schweben nicht), haben einen Collider unter der Grenze von 255 Dreiecken und **dieselben Eckpunkte wie in der Vorschau**; der Bogen der Steinbrücke liegt ganz unter der Fahrbahn. |
| `TrailAndNpcMarkerValidationTests` | Spuren brauchen mindestens 2 Knoten, nicht im Bach, nicht in Häusern; mehrere Platzhalter eines NPC in einer Phase nur mit verschiedener Stufe; Platzhalter nicht in Hauswänden (außer mit `insideBuilding`). |
| `SpawnGroupRegistryTests`, `SpawnGroupSaveableTests` | Quest-Gegnergruppen bleiben aus, bis „Gegner spawnen“ sie einschaltet; nach dem Laden sind eingeschaltete Gruppen wieder da und besiegte bleiben weg. |

---

## 5. Spielen: zwei Wege

**Weg A – direkt (schnell zum Testen):**

1. Die Szene **Eichental** ist offen (sonst: Menü **Aetherfall > Szene öffnen > Eichental**).
2. **Play** drücken und einmal ins **Game**-Fenster klicken.
   **Du siehst danach:** Die Figur (hellgraue Kapsel mit gelber „Nase“, Schwert und Schild) steht zwischen verbrannten Häusern und schaut nach Westen auf den Dorfplatz. Links neben dir liegt das eingestürzte Elternhaus. Rauch steigt auf, einige Ruinen glühen rot.

**Weg B – mit Hauptmenü (wie im fertigen Spiel):**

1. Menü **Aetherfall > Szene öffnen > Boot (mit Hauptmenü)**.
2. **Play** drücken.
   **Du siehst danach:** das Hauptmenü.
3. **Neues Spiel** wählen.
   **Du siehst danach:** den Ladebildschirm mit „Eichental“, dann das Dorf wie bei Weg A.

**Testgelände trotzdem nutzen:** Menü **Aetherfall > Szene öffnen > Testgelände** und dort Play drücken. Soll auch „Neues Spiel“ wieder ins Testgelände führen: Menü **Aetherfall > Neues Spiel startet in > Testgelände** (zurück mit **… > Eichental**; ein Haken zeigt die aktuelle Wahl).

Steuerung wie in [Anleitung 03](./03_Test_Spielfigur.md) und [05](./05_Test_Kampf.md): **W A S D** laufen, **Shift** sprinten, **Leertaste** springen, Maus = Kamera, **linke Maustaste** angreifen, **Q** halten blocken, **T** Lock-On, **E** öffnen/lesen, **Tab** Inventar, **J** Questlog, **F5/F9** schnell speichern/laden, **Esc** Pause. Mit Controller wie dort beschrieben.

---

## 6. Rundgang: die Orte

Der Startpunkt liegt bei **x 80, z −40** (Koordinaten in Metern; x = Osten, z = Norden, die Mitte des Tals ist 0/0). Die Position der Figur siehst du während des Spiels im Inspector, wenn du **Player** in der Hierarchy anklickst (Transform › Position). Mit „Laufen“ (5 m/s) brauchst du für 100 m etwa 20 Sekunden.

| Ort | Wo vom Start aus | Was du dort siehst |
|---|---|---|
| **Dorfplatz** mit Brunnen | 40 m nach Westen | Brunnen mit Dächlein, Wege in alle Richtungen, ringsum verbrannte Häuser |
| **Kapelle** | 60 m nach Nordwesten | verbrannte Kapelle mit Turm, Dachsparren ohne Dach |
| **Schmiede, Haus von Hedda, Bäckerei** | 70–90 m nach Westen | eingestürzte Schmiede (Esse, Amboss, glühende Reste), Bäckerei mit Tür (Quest-Objekt) und Glut |
| **Der Riss** | 90 m nach Nordnordost | Krater mit Brandspur, ein 13 m hoher türkis leuchtender Spalt, Kristallsplitter, leuchtende Bruchlinien im Boden; türkises Licht bis 40 m |
| **Dorfrand** | 100 m nach Westen | Lagerfeuer der Überlebenden, Karren, Wegweiser, ein unversehrtes Haus |
| **Lindenhain** mit Gasthaus „Zum Krummen Kessel“ | 240 m nach Westen über die Reichsstraße | große Dorflinde, Gasthaus mit Schild, **Anschlagbrett** (E: „Lesen“), Zelte der Flüchtlinge, Wachposten der Silberwacht mit Banner |
| **Mühle** am Mühlbach | 230 m nach Südwesten | Mühle mit Wasserrad, Mehlsäcke, eine Truhe |
| **Hollmann-Hof** | 280 m nach Nordwesten, über die **Steinbrücke** am Birkenbach | Wohnhaus, Scheune, Zaun, Schafe, Heuballen, Strohziele (Quest-Objekte) |
| **Nordhang** | ganz im Nordwesten, Birkenwald am Hang | **2 Grauwölfe** (einer patrouilliert), Wildpfad mit Holzsteg über den Birkenbach, ein toter Postreiter |
| **Wolfsbau** | Nordhang, unter dem Wolfskopf-Felsen | dunkle Höhlenöffnung, Aether-Splitter im Fels, Wolfswelpe, eine Eisentruhe |
| **Rabenfels** und **Gruft-Eingang** | 230 m nach Norden | Senke mit dem steinernen Eingang der Gruft (noch verschlossen, Schild „Eingang folgt später“), Aufstieg zur Spitze mit Steinmann, Aussicht über das ganze Tal, versteckte Truhe |
| **Talrand** | überall außen | Hügel und dichter Wald; an den Enden der Reichsstraße liegen umgestürzte Bäume bzw. eine Wagenburg. Weiter als etwa 15 m hinter den begehbaren Bereich kommst du nicht (unsichtbare Wand). |

In der Vorschau-Karte `eichental_karte.png` (von Claude mitgeschickt) sind alle Orte, Zonen, Gegner, Truhen, NPC-Platzhalter und die beiden Spuren (lila gestrichelt) eingezeichnet. Die Nahaufnahmen `eichental_nah_gruft.png`, `eichental_nah_wolfsbau.png` und `eichental_nah_steinbruecke*.png` zeigen, wie die Felsen am Gruft-Eingang und am Wolfsbau auf dem Boden sitzen und dass die Steinbrücke oben frei ist. So sollte es in Unity auch aussehen.

**Dorfbewohner (Stand 2026-10-14):** An ihren Plätzen stehen **einfache Figuren aus Grundformen** (Beine oder Rock, Körper, Arme, Kopf, Haare; je Figur eigene Kleidung: Tobold mit Lederschürze, Wenna mit weißer Schürze, Hollmann mit Strohhut, Dorn in Rüstung, die graue Gestalt mit Kapuze, Pim und Lina kleiner). Das Schild zeigt Name und Rolle, z. B. „Tobold Kern – Schmied“. Figuren, die im Prolog den Platz wechseln, erscheinen je nach Quest-Stand (GDD 02, 11.1): Hedda auf dem Dorfplatz (s20) und am Dorfrand (s25), Tobold unter dem Balken (s25) und gerettet am Dorfrand (s30), Wenna im brennenden Haus (s25) und gerettet am Dorfrand (s30), Gerettete nach dem Prolog in Lindenhain. **Wenna im Haus** ist absichtlich im Gebäude: Ihre Figur steckt in der Bäckerei, ihr Schild schwebt über dem Dach. Mit **E** ansprechen lassen sich alle außer den beiden Eingeklemmten (sonst würde das Gespräch das Befreien blockieren) und der grauen Gestalt (sie spricht einmal von selbst, wenn du den Riss erreichst).

**Spuren:** Kleine **gelb leuchtende Scheiben am Boden** markieren die Knoten der zwei Spuren für „Folge der Spur“: die **Spur der grauen Gestalt** (Quest 1, s40) vom Dorfrand durch das Dorf und die Brandspur bis vor den Riss, und die **Wolfsspur** (Quest 2, s20) von der oberen Weide über den Wildpfad am toten Postreiter vorbei bis kurz vor den Wolfsbau. Jeder Knoten ist eine unsichtbare Zone, die beim Betreten „Spur-Knoten erreicht“ meldet (Hierarchy: **Spiel > Spuren**).

**Orts-Zonen:** Die 13 Orte sind unsichtbare Zonen (Area Trigger). Sie melden „Ort betreten“ an das Quest-System. Sehen kannst du sie im Scene-Fenster, wenn du unter **Spiel > Orte** einen Eintrag anklickst (grüner Umriss).

---

## 7. Kämpfen, Truhen, Speichern

- **Wölfe:** Am Nordhang streifen **2 Grauwölfe**, im Wald nordöstlich des Risses lauert **1 Aether-Wolf** (leuchtender Kristallkern), gut 60 m vom Krater entfernt, damit er den Prolog am Riss nicht stört. Besiegte Wölfe kommen nach 3 bzw. 4 Minuten zurück. Sie verfolgen dich nicht beliebig weit (Leash). Hügel verdecken die Sicht: Hinter einer Kuppe sehen sie dich nicht.
- **Weitere Gegnergruppen** (Rudel am Nordhang, Leitwolf Glutfang, Risslinge am Dorfrand, Prolog-Rissbrut) sind **schon platziert, aber ausgeschaltet**: In der Hierarchy ist bei ihnen das Kind **Gruppe** grau. Die Quest-Aktion „Gegner spawnen“ schaltet sie ein. Ob eine Gruppe eingeschaltet oder schon besiegt ist, wird **gespeichert**; nach dem Laden mitten in einer Quest ist das Rudel also wieder da, ein besiegtes kommt nicht zurück.
- **Truhen:** 5 Stück – Holztruhe in der Schmiede, Eisentruhe hinter der Kapelle, Holztruhe an der Mühle, Eisentruhe im Wolfsbau, versteckte Truhe auf dem Rabenfels. **E** öffnet sie, die Beute landet im Rucksack (**Tab**).
- **Speichern:** **F5** speichert, **F9** (zweimal) lädt. Nach dem Laden stehst du wieder an der gespeicherten Stelle im Eichental, offene Truhen bleiben offen.
- **Sterben:** Nach dem Tod belebt dich das Spiel nach 3 Sekunden am Startpunkt im Dorf wieder.

---

## 8. Prüfliste

Bitte abhaken, was stimmt. Was nicht stimmt, bitte mit kurzer Beschreibung (oder Foto) zurückmelden.

**Erstellen**
- [ ] **Aetherfall > Eichental erstellen** läuft ohne roten Fehler in der Console durch.
- [ ] Ein zweites Mal ausführen („Neu aufbauen“) funktioniert genauso.
- [ ] Test Runner: alle EditMode-Tests grün, auch **Aetherfall.Tests.EditMode.World**.

**Aussehen**
- [ ] Das Gelände hat Gras, Erdwege, Felsen an steilen Stellen und graue Asche im Dorf (nicht rosa, nicht einfarbig grau).
- [ ] Die Bäche haben dunkles Wasser, das ungefähr in Höhe der Ufer liegt (nicht schwebend, nicht tief unter dem Boden).
- [ ] Verbrannte Häuser sind dunkel und haben Löcher im Dach, eingestürzte zeigen nur Mauerreste und Balken; heile Häuser (Lindenhain, Hof, Mühle) haben ganze Dächer.
- [ ] Glut leuchtet rot an einigen Ruinen, darüber steigt Rauch auf. In der Hierarchy liegen Glut, Glutlicht und Rauch aller Häuser unter **Siedlungen > Brand (Prolog)**.
- [ ] Die Felsen am Rabenfels und am Wolfskopf stehen **auf dem Boden** (keine Lücke darunter), Gruft-Eingang und Wolfsbau sind von Fels eingerahmt (vergleiche mit `eichental_nah_gruft.png` und `eichental_nah_wolfsbau.png`). Auch die kleinen Findlinge am Nordhang sitzen halb im Boden.
- [ ] Auf der **Steinbrücke** steht nichts im Weg: Der Steinbogen liegt unter der Fahrbahn (vergleiche mit `eichental_nah_steinbruecke_oben.png`).
- [ ] Gelb leuchtende **Spurzeichen** am Boden: vom Dorfrand zum Riss und von der Hollmann-Weide zum Wolfsbau.
- [ ] Der Riss leuchtet türkis und färbt die Umgebung leicht ein.
- [ ] Dächer sind von außen und von innen zu sehen (keine „unsichtbaren“ Dachflächen von außen).
- [ ] Bäume stehen auf dem Boden (nicht schwebend) und nicht auf Wegen, in Häusern oder im Wasser.
- [ ] In der Ferne liegt leichter Dunst, der Himmel ist abendlich.

**Laufen**
- [ ] Vom Start aus lassen sich Dorfplatz, Riss, Lindenhain, Mühle, Hollmann-Hof, Nordhang, Wolfsbau und Rabenfels erreichen.
- [ ] Die Steinbrücke und der Holzsteg über den Birkenbach sind begehbar.
- [ ] Durch Bäche kommt man auch ohne Brücke hindurch (das Wasser ist flach, Schwimmen gibt es noch nicht) und kommt am anderen Ufer wieder heraus.
- [ ] Man läuft nicht durch Hauswände, Zäune, Felsen, Baumstämme, Karren oder Brunnen, und nicht unter den großen Felsen hindurch.
- [ ] Der Aufstieg zum Rabenfels geht über den Pfad; der Gruft-Eingang ist zu.
- [ ] Am Rand des Tals geht es nicht weiter (Hügel und unsichtbare Wand).
- [ ] Die Kamera verschwindet nicht im Boden, wenn du am Hang stehst und nach unten schaust.

**Spiel**
- [ ] Am Nordhang greifen die Grauwölfe an; der Aether-Wolf im Wald nordöstlich des Risses auch (am Riss selbst ist kein Wolf). Lock-On (**T**) funktioniert.
- [ ] Die 5 Truhen lassen sich öffnen.
- [ ] Am Anschlagbrett in Lindenhain erscheint „Lesen: Anschlagbrett am Gasthaus“.
- [ ] **F5**, ein Stück laufen, **F9** zweimal: Die Figur steht wieder an der gespeicherten Stelle.
- [ ] Boot-Szene → **Neues Spiel** startet im Eichental (Ladebildschirm „Eichental“).
- [ ] Die Bildrate ist flüssig (oben rechts im Game-Fenster **Stats** einschalten; über 30 FPS reicht für den Rohbau).

---

## 9. Was noch fehlt

Das Eichental ist ein **Rohbau zum Laufen und Ausprobieren**. Noch nicht dabei (kommt in den nächsten Bausteinen):

| Was | Stand | Kommt mit |
|---|---|---|
| **Echte Modelle der Dorfbewohner** | Die Figuren sind aus Grundformen gebaut (Stand 2026-10-14, alle mit Gesprächen außer der grauen Gestalt). | Blender-Modelle und Animationen (Mini-Slice 7) ersetzen sie an derselben Stelle mit derselben ID. |
| **Die drei Quests als Daten** | Orte, Gegnergruppen, Spuren, Quest-Objekte und Anschlagbrett haben ihre IDs aus GDD 02, 11; die Aktion „Gegner spawnen“ und die Spur-Knoten sind bereit. Die Quest-Dateien selbst („Asche über Eichental“, „Die Wölfe vom Nordhang“, „Die vergessene Gruft“) gibt es noch nicht; deshalb bietet das Anschlagbrett nichts an und die Quest-Gegner sind ausgeschaltet. Das Ziel „Folge der Spur“ braucht dort dieselbe Knotenzahl wie die Layout-Datei (graue Gestalt 7, Wolfsspur 6). | Baustein „Die 3 Quests als Daten“ |
| **Prolog-Ablauf** | Du startest im brennenden Dorf, aber ohne Ereignisse (Balken anheben, Wenna retten, Risslinge, Rissbrut). Die Figuren aller Prolog-Stufen und nach dem Prolog stehen gleichzeitig da. Der Brand geht von selbst aus, sobald „Asche über Eichental“ abgeschlossen ist (Bedingung an **Brand (Prolog)**); prüfen lässt sich das erst mit den Quest-Daten. | Quests als Daten + NPCs (Phasen und Stufen schalten) |
| **Die vergessene Gruft** | Nur der verschlossene Eingang am Rabenfels. Das Innere mit Rätsel und Gruftwächter wird eine eigene Szene. | Baustein „Die vergessene Gruft“ |
| **Risslinge** | Gibt es als Gegnertyp noch nicht. Ihre Gruppen benutzen vorerst **Aether-Wölfe als Platzhalter** (im Namen „(Platzhalter)“). | eigener Gegner-Baustein |
| **Balance** | Wölfe sind noch **Stufe 8** (Werte aus dem Testgelände), die Figur beginnt auf der Stufe, die am `ProgressionInstaller` steht (nach „Testgelände erstellen“ **10**, Testeinstellung aus [Anleitung 09](./09_Test_Quests_im_Spiel.md)). Das Eichental-Menü lässt diesen Wert jetzt unverändert. Im fertigen Mini-Slice: Figur Stufe 1, Gebiet Stufe 1–3. | Baustein „Erfahrung und Level“ / Mini-Slice-Abstimmung (stellt dann auf 1) |
| **Schöne Modelle, Animationen, Ton** | Alles aus einfachen Formen; Wölfe ohne Animation; kein Ton. | Blender-Modelle oder CC0-Pakete (Lizenzregister) |
| **Wasser, Schwimmen** | Wasser ist eine dunkle Fläche ohne Bewegung; man watet durch den Bach. | später |
| **Wegfindung der Wölfe** | Wölfe weichen nur einfachen Hindernissen aus (keine NavMesh-Wege). An steilen Hängen oder Zäunen können sie hängen bleiben. | später (NavMesh) |
| **Karte und Kompass im Spiel** | Nur die Vorschau-Karte als Bild. | Baustein „Karte“ |

---

## 10. Was du zurückmelden sollst

1. Die abgehakte **Prüfliste** (Abschnitt 8), mit Fotos bei allem, was komisch aussieht.
2. Die **Hinweise** aus dem Fenster nach dem Erstellen (falls welche da waren).
3. **Dein Eindruck:** Ist das Tal zu groß, zu klein, zu leer, zu voll? Sind Wege zu lang? Findest du dich zurecht? Gefällt dir die Stimmung (Abendlicht, Rauch, Riss)?
4. Die **Bildrate** (Stats-Fenster: „FPS“) im Dorf und am Riss.

---

## 11. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Fenster „Die Layout-Datei hat … Fehler“ | In `eichental_layout.json` stimmt etwas nicht (z. B. nach einer eigenen Änderung). | Die Hinweise nennen Zeile und Feld (z. B. „Zeile 812, Spalte 7: … erwartet“). Änderung rückgängig machen oder Claude die Meldung schicken. |
| Alles ist **rosa** | URP-Shader fehlen (Projekt-Setup nicht vollständig). | [Anleitung 01](./01_Projekt-Setup.md), Schritt URP, dann das Menü erneut ausführen. |
| Gelände **grau** oder ohne Bodenschichten | Shader „Terrain/Lit“ nicht gefunden (Hinweis im Fenster). | Wie oben; danach das Menü erneut ausführen. |
| Hinweis „Layer „Terrain“ nicht angelegt: User Layer 12 heißt bereits …“ | Der Platz für den Layer „Terrain“ ist schon anders benannt. | Edit > Project Settings > Tags and Layers: Layer 12 in „Terrain“ umbenennen (wenn er nicht benutzt wird) und das Menü erneut ausführen. |
| Die Figur fällt durch den Boden | Terrain ohne Kollision oder Figur unter dem Gelände. | Menü erneut ausführen; tritt es wieder auf, Foto der Hierarchy (aufgeklappt **Landschaft > Terrain**) und des Inspectors an Claude. |
| „Neues Spiel“ startet das Testgelände | Startszene steht auf Testgelände. | Menü **Aetherfall > Neues Spiel startet in > Eichental**. |
| „Laden“ eines alten Spielstands aus dem Testgelände: Figur steht am Start | Gewollt: Positionen aus einer anderen Welt werden nicht übernommen (Console-Warnung „The saved position is ignored“). | Im Eichental neu speichern. |
| Das Erstellen dauert lange oder Unity reagiert kurz nicht | Gelände und rund 2 450 Pflanzen werden erzeugt. | 1–2 Minuten warten. |
| Ruckeln | Viele Einzelobjekte, Schatten, Dunst. | Edit > Project Settings > Quality: eine niedrigere Stufe testen und die FPS zurückmelden. |

---

## 12. Dateien und wohin sie gehören

Alles kommt mit dem Pull; du musst nichts kopieren. Zur Orientierung:

| Datei(en) | Ordner | Kommt an ein GameObject? |
|---|---|---|
| `eichental_layout.json` | `Assets/_Project/Data/Regions/Eichental/` | nein (Daten) |
| `RegionLayoutReader.cs`, `RegionLayoutValidator.cs`, `LayoutHeightField.cs`, `LayoutGroundMap.cs`, `VegetationScatter.cs`, `LayoutPlacement.cs`, `RoofGeometry.cs`, `BlobGeometry.cs`, `RockGeometry.cs`, `BridgeGeometry.cs`, `LayoutJsonParser.cs` und die Datenklassen (`RegionLayout.cs`, `LayoutBuilding.cs`, `LayoutTrail.cs` …) | `Assets/_Project/Scripts/World/Layout/` | nein (reine Logik, getestet) |
| `NpcMarker.cs`, `QuestObjectMarker.cs`, `SpawnGroupMarker.cs`, `TrailNodeTrigger.cs`, `ConditionalObjectGroup.cs` | `Assets/_Project/Scripts/World/` | ja – setzt der Generator an NPC-Platzhalter, Quest-Objekte, Gegnergruppen (Wurzel „Gegner …“), Spur-Knoten und an „Brand (Prolog)“ |
| `ISpawnGroup.cs`, `ISpawnGroupRegistry.cs`, `SpawnGroupRegistry.cs`, `SpawnEncounter.cs` (Quest-Aktion), `WorldInstaller.cs` | `Assets/_Project/Scripts/World/` | nein (Dienst und Aktion; `WorldInstaller.asset` legt das Menü in `Settings/Boot/` an) |
| `SpawnGroupSaveable.cs`, `SpawnGroupsDto.cs` | `Assets/_Project/Scripts/Quests/` | nein (Speicher-Sektion `spawners`, registriert vom `QuestInstaller`) |
| `EichentalMenu.cs`, `EichentalSceneBuilder.cs`, `EichentalTerrainBuilder.cs`, `EichentalBuildingBuilder.cs`, `EichentalNatureBuilder.cs`, `EichentalPropBuilder.cs`, `EichentalGameplayBuilder.cs`, `EichentalMaterials.cs`, `EichentalMeshBuilder.cs`, `EichentalMeshLibrary.cs`, `EichentalSmoke.cs`, `EichentalLabel.cs`, `EichentalPaths.cs`, `WorldSetup.cs`, `WorldLayers.cs` | `Assets/_Project/Scripts/Editor/World/` | nein (Editor-Werkzeuge) |
| Tests | `Assets/_Project/Tests/EditModeWorld/` | nein |
| `eichental_layout.py`, `eichental_preview.py`, `eichental_nachbearbeiten.py`, `eichental_referenz.py` | `Tools/Preview/` | nein (Blender-Vorschau, außerhalb von Unity) |

Geändert wurden außerdem: `TestGroundMenu.cs` (nutzt jetzt `WorldSetup`), `TestGroundUiBuilder.cs` (Szenenliste mit Eichental), `TestGroundItemBuilder.cs` und `TestGroundCombatBuilder.cs` (Truhen und Wölfe auch für andere Szenen), `PlayerPersistence.cs` (Position aus einer anderen Welt wird nicht übernommen), `TestGroundAssets.cs` (WorldInstaller in die BootConfig; Startstufe nur beim Testgelände), `EnemySpawner.cs` (meldet eine besiegte Quest-Gruppe), `QuestInstaller.cs` (registriert die Sektion `spawners`), `ProjectSettingsSetupStep.cs` (Empfehlung „Static Batching aus“).

---

## 13. Das Layout ändern

Die Datei kannst du mit jedem Texteditor öffnen (z. B. in Unity doppelklicken). Ein Beispiel – ein Haus verschieben:

```json
{ "id": "obj.eichental.haus_dorfrand", "name": "Haus am Dorfrand (unversehrt)", "kind": "house", "state": "intact",
  "position": [-22, -58], "yaw": 20, "size": [7, 4, 9], "roof": "gable", "roofPitch": 48, "glow": false }
```

- `position` ist **[Osten, Norden]** in Metern, `yaw` die Drehung im Uhrzeigersinn (0 = Tür nach Norden).
- `state` kann `intact`, `burned` oder `collapsed` sein, `glow: true` lässt die Ruine glühen und rauchen.
- Danach **Aetherfall > Eichental erstellen** ausführen. Ist etwas ungültig (z. B. das Haus steht jetzt im Bach), meldet das Fenster den Fehler und baut nichts um.

**Am besten sagst du Claude, was du ändern möchtest.** Claude ändert die Datei, prüft sie mit den Tests, rechnet die Vergleichswerte der Vorschau neu (`eichental_referenz.py`) und schickt neue Vorschaubilder. Änderst du die Datei selbst, schlagen danach eventuell die Vergleichstests (`LayoutHeightFieldTests`, `VegetationScatterTests`, `LayoutPlacementTests`) fehl, weil die gespeicherten Vergleichswerte noch zur alten Fassung passen. Das ist kein Fehler im Spiel; Claude bringt sie beim nächsten Mal wieder in Ordnung.

---

## 14. Für Claude: ohne Klicks (Batchmode) und Vorschau

Eichental bauen ohne Dialoge (Exit-Code 0 = Szene gebaut, 1 = Fehler; Protokoll in der Logdatei):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.EichentalMenu.RunBatch -logFile Logs\eichental.log
```

Blender-Vorschau aus derselben Layout-Datei (Linux/macOS, vom Repo-Ordner; Ausgabe in einen beliebigen Ordner):

```bash
blender -b -P Tools/Preview/eichental_preview.py -- --job alle_bilder --samples 96 --out AUSGABE
blender -b -P Tools/Preview/eichental_preview.py -- --job nah --samples 96 --out AUSGABE
python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir AUSGABE
blender -b -P Tools/Preview/eichental_preview.py -- --job rundflug --samples 2 --fps 12 --fast --out AUSGABE
python3 -I Tools/Preview/eichental_nachbearbeiten.py --dir AUSGABE --video --render-fps 12
# nach jeder Änderung der Layout-Datei:
python3 -I Tools/Preview/eichental_referenz.py
```

Details in [Tools/Preview/README.md](../../Tools/Preview/README.md#eichental).

---

## 15. Hinweise, Abweichungen und offene Punkte

- **Größe (Vorschlag):** begehbar 400 × 400 m, Terrain 512 × 512 m = genau eine Streaming-Zelle (Architektur 10.1/10.5). Begründung (steht auch in der Datei unter `sizeRationale`): Die Strecke aller drei Quests zusammen (Start → Dorfplatz → Dorfrand → Riss → Lindenhain → Hof → Wolfsbau → Hof → Lindenhain → Gruft → Lindenhain) ist in Luftlinie etwa 1,5 km, auf den Wegen etwa 1,8–2 km. Bei 5 m/s sind das 6–7 Minuten – rund 10–20 % von 30–60 Minuten Spielzeit; der Rest ist Kampf, Gespräch und Rätsel. Ein Test rechnet die Luftlinie aus den Orten nach. Gegenüber dem Plan für den Vertical Slice (GDD 01, 4.1.2: etwa 1,16 × 0,97 km) sind die Abstände auf rund die Hälfte verdichtet, die Himmelsrichtungen bleiben gleich.
- **IDs mit „(Vorschlag)“** (z. B. Rabenfels-Spitze als Aussichtspunkt, Dorfschenke, Elternhaus der Spielfigur, die beiden immer aktiven Wolfsgruppen) stehen noch nicht im GDD. Bitte bestätigen oder ablehnen.
- **Eine Szene, kein Streaming:** Der Mini-Slice passt in eine Zelle. Das Zellen-Streaming aus Architektur 10 kommt erst, wenn die Welt größer wird.
- **Pflanzen als Einzelobjekte:** Bäume und Büsche sind normale Objekte mit Kollision am Stamm, keine Terrain-Bäume. So sehen sie in Unity und in der Vorschau gleich aus. Der Generator setzt **kein „Batching Static“** mehr: Der GPU Resident Drawer (Architektur 1.2) zeichnet gleiche Modelle gebündelt, und Unity rät, Static Batching dafür abzuschalten ([Unity-Handbuch](https://docs.unity3d.com/Manual/urp/gpu-resident-drawer-performance.html)). Die Liste im **Projekt-Setup, Schritt b)** zeigt dazu „Static Batching: aus“ als Empfehlung (Edit > Project Settings > Player > Other Settings > Rendering > Static Batching). Gebäude, Felsen und Gelände tragen nur noch die Flags für die Verdeckung (Occluder/Occludee), Quest-Objekte gar keine (sie werden später bewegt). Wird die Bildrate zu niedrig, stellt Claude auf Terrain-Bäume um.
- **Unsichtbare Wand** 14 m hinter dem begehbaren Rand (in den Randhügeln). Sie hält Figur und Wölfe auf, die Kamera nicht.
- **Glut-Lichter:** Jede glühende Ruine hat ein kleines oranges Punktlicht, dazu das Lagerfeuer und das Licht des Risses. Unity zeigt in URP nur eine begrenzte Zahl zusätzlicher Lichter pro Objekt; flackert es, bitte melden. Glut (eigenes Modell), Glutlicht und Rauch hängen nicht mehr an den Häusern, sondern je Haus unter **Siedlungen > Brand (Prolog)**. Die Komponente `ConditionalObjectGroup` dort zeigt sie, solange „Asche über Eichental“ nicht abgeschlossen ist (GDD 01, 6.5: danach „Ruine und Asche“).
- **Startstufe 10 und Wolfsstufe 8** sind Testeinstellungen aus dem Testgelände ([Anleitung 09, Abschnitt 15](./09_Test_Quests_im_Spiel.md#15-hinweise-abweichungen-und-offene-punkte)). Vor dem fertigen Mini-Slice: Figur Stufe 1, Gegner passend zum Gebietslevel 1–3 (steht in der Layout-Datei je Truhe und Ort).
- **Truhen-Beute** nutzt die Loot-Tabellen des Testgeländes (Holz, Eisen, versteckt) mit dem Gebietslevel aus der Layout-Datei.
- **Nach der Prüfung geändert (2026-10-14):** Felsen schwebten in Unity, weil ihr Modell unten abgeschnitten war; die Vorschau zeigte sie richtig. Jetzt rechnen Unity und Vorschau die Felsen **mit demselben Code-Zwilling** (gleiche Eckpunkte, per Test geprüft). Der Bogen der Steinbrücke stand 3 m hoch auf der Fahrbahn (in Unity und Vorschau); er liegt jetzt darunter. Neu sind die Spuren, die Stufen bei den NPC-Platzhaltern, die gespeicherten Gegnergruppen und die Brand-Gruppe. Der Aether-Wolf am Riss steht jetzt im Wald nordöstlich davon. Das Schild „Wachposten der Silberwacht“ verdeckte auf der Karte die Mühle; die Karte prüft die Schilder jetzt selbst.
- **Weidezaun ohne Tor:** Die obere Weide der Hollmanns ist rundum eingezäunt (1,1 m). Für die Hinweise auf der Weide (Quest 2, s10) springst du darüber (Sprunghöhe 1,2 m). Ist das zu knapp, bekommt der Zaun ein Tor.
- **Vorschau ≠ Unity:** Die Blender-Bilder zeigen Formen, Lage, Farben und Licht nach denselben Zahlen, aber mit Blenders Renderer. In Unity wirken Licht, Schatten und Dunst anders; Rauch ist in Unity ein Partikelsystem, in der Vorschau eine Wolke.
