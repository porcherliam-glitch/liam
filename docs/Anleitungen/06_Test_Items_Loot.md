# Testanleitung Phase 2: Items, Inventar und Beute

> Items, Affixe, Seltenheiten, Inventar mit Traglast, Ausrüstung, Gold, Beute von Wölfen, Truhen, Lichtsäulen, Debug-Inventar · Stand: 2026-10-13 · Bezug: [Architektur 4.1, 4.3, 6.1, 9.3, 11.3, 11.6](../Technik/01_Architektur.md) · [GDD 04, Abschnitte 1–5](../GDD/04_Items_Crafting_Wirtschaft_Endgame.md) · [GDD 03, 8.2, 8.3, 10, 11.2](../GDD/03_Kampf_Charakter_Progression.md)

> **Hinweis seit [Anleitung 07](./07_Test_Oberflaeche.md) (Oberfläche):** Die Entwickler-Overlays starten ausgeblendet – **F3** blendet sie ein und aus. **Esc** öffnet jetzt das neue Pausemenü; zum Klicken auf Overlay-Knöpfe geht auch **Tab** (Debug-Inventar, der Mauszeiger erscheint). Stirbt die Figur, erscheint der Todesbildschirm statt des automatischen Wiederbelebens. Mit Hauptmenü startest du über die Boot-Szene, der direkte Start im Testgelände geht weiterhin.

In diesem Schritt bekommt das Spiel **echte Gegenstände**. Schwert, Schild und Rüstung der Figur sind jetzt Items mit Item-Level, Seltenheit und Werten – der Waffenschaden kommt aus dem angelegten Schwert, die Rüstung aus den angelegten Rüstungsteilen. **Wölfe lassen Beute fallen** (Fell, Fleisch, Gold, selten Ausrüstung), gute Funde leuchten mit einer **Lichtsäule** in ihrer Seltenheitsfarbe. Im Testgelände stehen **drei Truhen** (Holz, Eisen, versteckt), die sich je einmal öffnen lassen. Mit **Tab** öffnest du ein einfaches **Debug-Inventar**: Dort siehst du Rucksack, Gewicht, Gold und Ausrüstung und kannst per Mausklick an- und ablegen oder wegwerfen. Wer zu viel trägt, wird **langsamer**. Speichern (F5) und Laden (F9) behalten Inventar, Ausrüstung, Gold und geöffnete Truhen.

Das Inventar ist ein **Platzhalter** zum Testen (Textliste ohne Bilder). Die richtige Oberfläche mit Symbolen, Tooltips und Gamepad-Steuerung kommt mit dem UI-Schritt.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 05](./05_Test_Kampf.md) sind erledigt (Testgelände mit Kampf und Wölfen läuft).

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Testgelände neu aufbauen](#3-testgelände-neu-aufbauen)
4. [Spielen](#4-spielen)
5. [Steuerung](#5-steuerung)
6. [Debug-Inventar und Overlays](#6-debug-inventar-und-overlays)
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
| **Inhalts-Datenbank** (`Aetherfall.Data`, neu) | Jede Definition (Item, Affix, Loot-Tabelle) hat eine feste Text-ID wie `item.weapon.einhandschwert_eisen`. Ein **Inhaltskatalog** (`Data/ContentCatalog.asset`) listet alle Definitionen; der `ContentInstaller` lädt sie beim Start in die Datenbank. |
| **Items** (`Aetherfall.Items`, neu) | Item-Daten (Waffe, Schild, Rüstung, Schmuck, Trank, Material), **7 Seltenheiten** mit Farben und Affix-Anzahl aus GDD 04, **26 Affixe** aus dem GDD-Pool (z. B. „Scharf“, „Gepanzert“, „der Stärke“, „des Feuerschutzes“), der **Item-Generator** (Item-Level, Grundwert mit ±5 % Streuung, Affixe in Stufen I–VI mit Ausschlussregeln), **Loot-Tabellen** (Gewichte, „Nichts“, Gold als Vielfaches von G(L), verschachtelte Tabellen, garantierte Einträge, Level-Bedingungen) und der **Loot-Würfler** mit Glücks-Formel und **Pech-Schutz** (nach 50 Funden ohne Legendär steigt die Chance, nach 200 ist es garantiert). Alles reine Logik mit Tests. |
| **Inventar** (`Aetherfall.Inventory`, neu) | Rucksack mit Stapeln (z. B. Wolfsfell bis 99), höchstens 1000 Einträge, Sortieren und Filtern, **Traglast** (60 kg + 2 kg je Stärkepunkt über bzw. unter 10, oberhalb Stärke 40 nur noch 1 kg je Punkt – z. B. Stärke 20: 80 kg, Stärke 60: 140 kg; bei Überladung langsamer), Gold, **Ausrüstung** mit den 16 Plätzen aus §12.2 (Kopf, Brust, Hände, Beine, Füße, Umhang, Haupthand, Nebenhand, Fernkampf, 2 Ringe, Amulett, 4 Schnellslots). Angelegte Teile wirken als Werte-Modifikatoren auf die Figur. Ereignisse `ItemPickedUp`, `InventoryChanged`, `CurrencyChanged`, `ItemEquipped`, `LootDropped`. Speichern im Abschnitt `inventory`. |
| **Beute in der Welt** | Getötete Wölfe würfeln ihre Loot-Tabelle; die Beute liegt als kleine Würfel in Seltenheitsfarbe am Boden, ab **Selten** mit Lichtsäule (höchstens 30 gleichzeitig). Gold und Materialien hebt die Figur automatisch auf, alles andere mit **E** bzw. **A**. |
| **Truhen** | Holztruhe (Loot-Qualität 1), Eisentruhe (2), versteckte Truhe (3: Ausrüstung mindestens „Selten“). Jede öffnet sich einmal; der Inhalt kommt direkt in den Rucksack (ein Loot-Fenster kommt mit der Oberfläche). Passt der Inhalt nicht mehr in den Rucksack (1000 Einträge), bleibt die Truhe zu – es geht nichts verloren. |
| **Interaktion** | Die Figur sucht 5× pro Sekunde Objekte in 2 m vor sich (Truhen, Beute) und zeigt unten in der Bildmitte einen Hinweis wie „[E] Öffnen: Holztruhe“. |
| **Spieler** | Startausrüstung des Kriegers aus GDD 03, 11.2 als echte Items. Waffenschaden und Rüstung kommen aus der Ausrüstung, Schwert und Schild verschwinden beim Ablegen. Überladen: höchstens 3 m/s, kein Sprint, statt Rolle nur ein Ausweichschritt; schwer überladen: höchstens 1,5 m/s, kein Springen. |
| **Debug-Inventar** (`InventoryOverlay`) | Tab öffnet eine Liste mit Rucksack, Gewicht, Gold und Ausrüstung; Klick = an- bzw. ablegen, Rechtsklick = wegwerfen; Knöpfe für Testbeute, Ballast und Gold. Nur im Editor und in Entwickler-Builds. |
| **Tests** | 252 neue automatische Testfälle (Seltenheiten, Formeln, Affix-Stufen und Ausschlussregeln, Glück, Pech-Schutz, Loot-Tabellen mit 100.000 Würfen, Inventar, Ausrüstung, Traglast, Speichern und Laden, Truhen, Beute). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Das dauert diesmal etwas länger (rund 150 neue Dateien).
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu.

---

## 3. Testgelände neu aufbauen

Die Item-Daten (Items, Affixe, Loot-Tabellen, Startausrüstung, Katalog) entstehen über das Menü, ebenso die Truhen, die neuen Bausteine der Figur und zwei neue Installer in der BootConfig.

1. Läuft das Spiel noch: oben auf **Play** klicken, um den Play-Modus zu beenden.
2. Menü **Aetherfall > Testgelände erstellen** klicken.
   **Du siehst danach:** das Fenster **Testgelände erstellen**. In der Liste steht neu: „Items, Affixe, Loot-Tabellen und Startausrüstung …, ContentInstaller und InventoryInstaller in der BootConfig“, „3 Truhen (Holz, Eisen, versteckt) und Beute-Anzeige“ und bei den Layern zusätzlich „10 „Interactable““ und „16 „Pickup““.
3. **Neu aufbauen** klicken. Fragt Unity vorher **Scene(s) Have Been Modified**: **Don't Save**.
   **Du siehst danach:** „Fertig! Die Szene „Testgelaende“ ist geöffnet.“ mit dem Hinweis auf diese Anleitung. **OK** klicken. Steht darunter „Hinweise (…)“, bitte den Text abschreiben bzw. fotografieren und an Claude schicken.

**Was das Menü neu anlegt bzw. ändert:**

| Was | Wo | Hinweis |
|---|---|---|
| 31 Items | `Assets/_Project/Data/Items/` (Unterordner `Weapons`, `Armor`, `Jewelry`, `Consumables`, `Materials`, `Misc`) | 4 Waffen, Holz- und Eisenschild, je 5 Teile Stoff/Leder/Platte, Wollumhang, 2 Ringe, 2 Amulette, Kleiner Heiltrank, Wolfsfell, Wolfsfleisch, Aether-Wolfspelz, Ballaststein (Test, 25 kg) |
| 26 Affixe | `Assets/_Project/Data/Items/Affixes/` | aus GDD 04, 4.4 |
| 6 Loot-Tabellen | `Assets/_Project/Data/LootTables/` | `Loot_Wolf_Grauwolf`, `Loot_Wolf_Aether`, `Loot_Verbrauch_Test` (verschachtelt), `Loot_Truhe_Holz`, `Loot_Truhe_Eisen`, `Loot_Truhe_Versteckt` |
| Startausrüstung | `Assets/_Project/Settings/Items/Startausruestung_Krieger.asset` | Einhandschwert (Selten), Holzschild, Gambeson-Wams, Gambeson-Hose, Lederstiefel, 3 Heiltränke |
| Inhaltskatalog | `Assets/_Project/Data/ContentCatalog.asset` | alle 63 Definitionen; fehlende werden ergänzt, eigene Einträge bleiben |
| Gegnertypen | `Data/Enemies/Grauwolf.asset`, `AetherWolf.asset` | Feld **Loot Table Id** wird gefüllt, wenn es leer ist |
| Materialien | `Assets/_Project/Art/Materials/Test/` | `LootBeam`, `LootPickup`, `TestChestWood`, `TestChestIron`, `TestChestHidden` |
| Installer | `Assets/_Project/Settings/Boot/ContentInstaller.asset`, `InventoryInstaller.asset` | in die BootConfig eingetragen, Katalog und Startausrüstung zugewiesen |
| Layer | Project Settings > Tags and Layers, Physics > Layer Collision Matrix | 10 „Interactable“ (kollidiert mit nichts, nur Abfragen), 16 „Pickup“ (kollidiert nur mit Environment und Player, Architektur 2.8) |
| Spielfigur `Player` | Szene | neue Komponenten **Player Interactor**, **Player Loot Collector**, **Player Equipment** |
| neue Objekte | Szene | `Loot` (Beute und Lichtsäulen), `Truhen` (mit `Holztruhe`, `Eisentruhe`, `Versteckte Truhe`), `InventoryOverlay`, `InteractionPrompt` |

**Alle Daten-Assets werden nur angelegt, wenn sie fehlen.** Änderst du Werte, z. B. das Gewicht im Asset `Wolfsfell`, bleiben sie beim nächsten „Neu aufbauen“ erhalten. Willst du die Standardwerte zurück: das Asset löschen und das Menü erneut ausführen.

**Prüfen:** `Assets/_Project/Settings/Boot/BootConfig.asset` anklicken → im Inspector hat die Liste **Installers** jetzt **10 Einträge** in dieser Reihenfolge:

1. Log-Installer
2. EventBus-Installer
3. GameState-Installer
4. Input-Installer
5. **Content-Installer** (neu)
6. Save-Installer
7. GameTime-Installer
8. **Inventory-Installer** (neu)
9. Combat-Installer
10. AI-Installer

Steht die Reihenfolge anders: das Menü einfach noch einmal ausführen, es sortiert die neuen Einträge selbst ein.

**Auch prüfen:** `ContentInstaller.asset` anklicken → Liste **Catalogs** enthält `ContentCatalog`. `InventoryInstaller.asset` → **Starting Equipment** = `Startausruestung_Krieger`, **Auto Pickup** = „Gold And Materials“.

---

## 4. Spielen

1. Ist die Szene nicht offen: im Project-Fenster `Assets/_Project/Scenes/Test/Testgelaende.unity` doppelklicken.
2. In der Console oben **Clear** klicken.
3. **Play** drücken und **einmal ins Game-Fenster klicken**.
   **Du siehst danach:** die Figur mit Schwert und Schild, rechts oben im Spieler-Overlay neue Zeilen („Rüstung 28 …“, „Angriff … (Waffenschaden 50)“, „Traglast 11,4 kg / 80 kg – Normal“), unten in der Mitte einen Knopf **Inventar (Tab)**.

**Erwartete Console-Zeilen** (Auszug, Zahlen können abweichen):

| # | Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] Step 3/7: Installer order validated (10 installer(s)).` | 10 Installer, inklusive Content und Inventory |
| 2 | `[Data] Content database: 63 definitions from 1 catalog(s).` | Inhalts-Datenbank geladen |
| 3 | `[Data] Inventory: 31 items, 26 affixes, 6 loot tables.` | Inventar- und Loot-Dienst bereit |
| 4 | `[GameState] Loading -> Playing (DevPlayStarter (test scene)). …` | Spiel läuft |

**Keine roten Fehler.** Gelbe Zeilen mit „ContentInstaller has no catalog“ oder „no starting equipment assigned“ bedeuten: Abschnitt 3 wiederholen.

**Wo ist was?** Du startest in der Mitte des Testgeländes und schaust nach Norden (zu den Rampen).

| Ort | Wie hinkommen |
|---|---|
| **Truhen** (drei Kisten mit Deckel und Schildern „Holztruhe“, „Eisentruhe“, „Versteckte Truhe“, darüber „Truhen (E / A: öffnen)“) | rechts vorne, etwa 6–12 m: braun, grau, lila |
| **Wölfe** (Arena) | wie in Anleitung 05: nach Süden, an der Trainingspuppe vorbei |

---

## 5. Steuerung

| Aktion | Tastatur / Maus | Gamepad (Xbox · PlayStation) | Hinweis |
|---|---|---|---|
| Interagieren (Truhe öffnen, Beute aufheben) | **E** | **A** · **✕** | wirkt auf das Objekt, das der Hinweis unten in der Mitte nennt (bis 2 m vor der Figur). Auf dem Gamepad ist A auch „Springen“: mit Hinweis auf dem Bildschirm interagiert A, sonst springt die Figur. |
| Debug-Inventar öffnen | **Tab** | – | Das Spiel pausiert, der Mauszeiger erscheint. |
| Debug-Inventar schließen | **Tab** oder **Esc** | **B** · **○** oder **Start** · **Options** | |
| Im Inventar anlegen / ablegen | **linke Maustaste** auf einen Eintrag | – | Rucksack-Eintrag = anlegen, Ausrüstungs-Platz = ablegen |
| Im Inventar wegwerfen | **rechte Maustaste** auf einen Rucksack-Eintrag | – | der Gegenstand fällt vor der Figur auf den Boden. Die rechte Maustaste schließt das Inventar **nicht** (nur Tab, Esc bzw. B, Start). |
| Schnellspeichern / Schnellladen | **F5** / **F9** | – | wie in Anleitung 04 |

**Automatisch aufgehoben** (Einstellung „Gold und Materialien“, GDD 04 5.9) werden **Gold** im Umkreis von **5 m** und **Materialien** (Wolfsfell, Wolfsfleisch, Aether-Wolfspelz) im Umkreis von **3 m** – auch im Kampf. Ab 90 % Traglast nur noch Gold. Ausrüstung und Tränke hebst du mit **E** auf.

---

## 6. Debug-Inventar und Overlays

**Debug-Inventar** (Tab, Titel „Inventar (Debug)“):

| Bereich / Knopf | Bedeutung |
|---|---|
| **Kopfzeile** | „Gewicht 11,4 kg / 80 kg (14 %) – Normal“, Gold, Rüstungsklasse, Rüstung, Standfestigkeit, Tempo, Glück, Angriff (Waffenschaden), Pech-Schutz-Zähler |
| **Ausrüstung** | alle 16 Plätze. Jedes Teil mit Name in Seltenheitsfarbe, Seltenheit mit Formcode (◆ bis ◆◆◆◆◆), Stufe (Item-Level), Schaden bzw. Rüstung, Klasse und Gewicht, darunter Grundwert, Implizitwert und Affixe mit Stufe (z. B. „+4 Rüstung (Gepanzert, Stufe II)“). **Klick = ablegen.** |
| **Rucksack** | alle Einträge, neue mit „●“, gesperrte mit „[gesperrt]“. **Linksklick = anlegen** (Tränke kommen in einen Schnellslot), **Rechtsklick = wegwerfen** (bei Stapeln der ganze Stapel) |
| **Sortierung: …** | wechselt zwischen Seltenheit, Neu zuerst, Item-Level, Wert, Gewicht, Wert je kg, Name, Typ |
| **Alle als gesehen** | entfernt die „●“-Markierung |
| **Affixe zeigen** | Details unter den Ausrüstungsteilen ein/aus |
| **Testbeute (je Seltenheit)** | lässt vor der Figur je ein Ausrüstungsteil Gewöhnlich, Ungewöhnlich, Selten, Episch und Legendär fallen – zum Ansehen der Lichtsäulen (Entwickler-Knopf) |
| **+25 kg Ballast** | legt einen „Ballaststein (Test, 25 kg)“ in den Rucksack – zum Testen der Überladung (Entwickler-Knopf) |
| **+100 Gold** | Entwickler-Knopf |
| unterste Zeile | Ergebnis der letzten Aktion, z. B. „Angelegt: …“, „Anlegen nicht möglich: Ab Level 12.“ |

**Spieler-Overlay** (rechts oben) zeigt jetzt zusätzlich: **Rüstung**, **Standfestigkeit**, **Tempo** (100 % = normal), **Angriff** mit **Waffenschaden**, **Rüstungsklasse**, **Traglast** mit Stufe, **Gold** und **Glück**. Diese Werte ändern sich, sobald du etwas an- oder ablegst.

**Interaktions-Hinweis** (unten in der Bildmitte): „[E] Öffnen: Holztruhe“ bzw. „[E] Aufheben: …“ (mit Gamepad „[A]“). Darunter erscheinen kurz Meldungen wie „+ Wolfsfell“ oder „+ 6 Gold (jetzt 6)“.

**Beute am Boden:** kleine Würfel in der Farbe der Seltenheit – grau (Gewöhnlich), grün (Ungewöhnlich), blau (Selten), lila (Episch), orange (Legendär); Gold goldgelb. Ab **Selten** steht eine **Lichtsäule** darüber: Selten 1,5 m, Episch 3 m, Legendär 6 m hoch. Gewöhnliche und ungewöhnliche Beute verschwindet nach 10 Minuten.

---

## 7. Prüfliste

Hake ab, was klappt. Bei „Nein“ bitte kurz notieren, was passiert ist. Die Zahlen sind Richtwerte.

### 7.1 Startausrüstung und Werte

- [ ] Tab öffnet das Inventar, das Spiel pausiert (die Wölfe bewegen sich nicht), der Mauszeiger erscheint. Tab oder Esc schließt es wieder, danach lässt sich die Figur sofort steuern.
- [ ] **Ausrüstung:** Haupthand „Eisernes Einhandschwert“ (blau, Selten, Stufe 10, Schaden **50**), Nebenhand „Holzschild“ (Rüstung 12), Brust „Gambeson-Wams“ (Rüstung 6), Beine „Gambeson-Hose“ (Rüstung 4), Füße „Lederstiefel“ (Rüstung 6), Schnellslot 1 „Kleiner Heiltrank (3 im Rucksack)“.
- [ ] **Rucksack:** „Kleiner Heiltrank ×3“.
- [ ] Kopfzeile: Gewicht **11,4 kg / 80 kg**, Rüstungsklasse **Stoff (leicht)**, Rüstung **28**, Gold **0**.
- [ ] Spieler-Overlay rechts oben zeigt dieselbe Rüstung 28 und „Waffenschaden 50“.

### 7.2 Ausrüstung wechseln

- [ ] Im Inventar auf den Platz **Haupthand** klicken → das Schwert wandert in den Rucksack, **das Schwert an der Figur verschwindet**, „Waffenschaden 5“ (ohne Waffe), Gewicht bleibt gleich.
- [ ] Das Schwert im Rucksack anklicken → wieder angelegt, Schwert sichtbar, Waffenschaden 50.
- [ ] **Schild** ablegen → Rüstung sinkt um 12 (auf 16), der Schild an der Figur verschwindet. Wieder anlegen → 28.
- [ ] Gambeson-Wams ablegen → Rüstung 22. Wieder anlegen → 28.
- [ ] An der Trainingspuppe: **ohne Schwert** macht ein leichter Schlag nur noch wenige Punkte Schaden, **mit Schwert** wieder etwa 48 (Anleitung 05).
- [ ] Ein gefundenes Teil (z. B. aus einer Truhe, Abschnitt 7.5) anlegen → das alte Teil kommt in den Rucksack, die Werte im Overlay ändern sich sofort (Rüstung, ggf. Standfestigkeit, LP oder Glück durch Affixe).
- [ ] **Zweihandschwert** (falls gefunden oder per „Testbeute“) anlegen → der Schild kommt automatisch in den Rucksack; Schild anlegen geht dann nicht („Nebenhand gesperrt …“).
- [ ] **3 schwere Teile** (Platte an Kopf, Brust und Beinen) → Rüstungsklasse „Platte (schwer)“, Standfestigkeit +30.

### 7.3 Wölfe und Beute

- [ ] Einen **Grauwolf** töten → an seiner Stelle liegt Beute: immer **Wolfsfell**, dazu oft Gold, Wolfsfleisch, manchmal ein Heiltrank, selten ein Ausrüstungsteil.
- [ ] Stehst du in der Nähe (≤ 3 m), werden **Wolfsfell, Wolfsfleisch und Gold** (Gold schon ab 5 m) **automatisch aufgehoben**. Unten in der Mitte erscheint „+ Wolfsfell“ bzw. „+ 5 Gold (jetzt 5)“.
- [ ] Ein Heiltrank oder Ausrüstungsteil bleibt liegen. Davorstellen → Hinweis „[E] Aufheben: …“ → **E** → im Rucksack.
- [ ] Der **Aether-Wolf** lässt immer einen **Aether-Wolfspelz** fallen und etwas mehr Gold.
- [ ] Console beim Tod eines Wolfs: keine roten Fehler. (Gegner neu spawnen im Kampf-Overlay, um mehr Beute zu sammeln.)
- [ ] Ein Ausrüstungsteil von einem Wolf hat **Stufe 8** (Wolf-Level 8) und ist höchstens **Selten** (Episch und Legendär gibt es erst ab Item-Level 10, GDD 04 3.1).
- [ ] **Lichtsäule:** Lässt ein Wolf etwas **Seltenes** fallen (blau), steht eine blaue Lichtsäule darüber. Das ist selten (etwa jeder 50. Wolf). Schneller geht es mit Abschnitt 7.6.

### 7.4 Inventar

- [ ] Nach ein paar Wölfen: „Wolfsfell ×n“ ist **ein** Eintrag (Stapel bis 99), das Gewicht steigt um 1 kg je Fell.
- [ ] **Sortierung** umschalten → die Liste ändert die Reihenfolge (z. B. „Gewicht“: schwerste zuerst).
- [ ] Neue Einträge haben „●“; **Alle als gesehen** entfernt es. Anlegen entfernt es ebenfalls.
- [ ] **Rechtsklick** auf „Wolfsfleisch“ → es liegt vor der Figur auf dem Boden (Console bzw. Meldung „Weggeworfen …“). Inventar schließen → es wird sofort wieder automatisch aufgehoben (Material, ≤ 3 m) – das ist richtig so.
- [ ] Rechtsklick auf ein Ausrüstungsteil **im Rucksack** → fällt auf den Boden (mit Lichtsäule ab Selten), mit **E** wieder aufheben.
- [ ] Ein **angelegtes** Teil lässt sich nicht wegwerfen („Erst ablegen, dann wegwerfen.“). **Legendäre** Teile sind automatisch gesperrt („Gesperrt (Schloss) …“).

### 7.5 Truhen

- [ ] Vor die **Holztruhe** stellen → Hinweis „[E] Öffnen: Holztruhe“ → **E** → der Deckel klappt auf. Meldungen unten in der Mitte: etwa **15–23 Gold**, 0–3 Heiltränke, zu 50 % ein Ausrüstungsteil (Stufe 10). Console: `[Data] Chest 'obj.test.truhe_holz' opened: … drop(s), best …`.
- [ ] Danach zeigt die Truhe keinen Hinweis mehr; **E** bewirkt nichts.
- [ ] **Eisentruhe:** etwa **30–45 Gold**, immer mindestens 1 Ausrüstungsteil (zu 50 % ein zweites), 1–2 Wolfsfelle.
- [ ] **Versteckte Truhe:** etwa **60–90 Gold**, **2 Ausrüstungsteile, beide mindestens Selten** (blau oder besser), dazu Heiltränke.
- [ ] Mit Gamepad: **A** vor der Truhe öffnet sie, ohne dass die Figur springt.

### 7.6 Lichtsäulen

- [ ] Inventar öffnen → **Testbeute (je Seltenheit)** → schließen. Vor der Figur liegen 5 Teile: grau, grün, **blau mit 1,5 m Säule**, **lila mit 3 m Säule**, **orange mit 6 m Säule**.
- [ ] Die Säulen sind auch aus größerer Entfernung gut zu sehen. Aufheben mit **E** → Säule verschwindet.
- [ ] Mehrmals Testbeute (über 10×) → höchstens 30 Säulen gleichzeitig. Ist das Budget voll, verlieren Stücke **niedrigerer** Seltenheit ihre Säule (z. B. ein blaues für ein neues lila oder oranges); ein neues Stück **gleicher** Seltenheit bekommt dann keine Säule, die älteren behalten ihre.

### 7.7 Überladen

- [ ] Inventar → **+25 kg Ballast** dreimal → Gewicht **86,4 kg / 80 kg** → „Überladen (orange) …“. Schließen: die Figur läuft deutlich langsamer (höchstens 3 m/s), **Shift sprintet nicht**, **Strg** macht nur einen kurzen Ausweichschritt statt einer Rolle. Spieler-Overlay: Tempo **60 %**.
- [ ] Ein vierter Ballast (111,4 kg) → „Schwer überladen (rot) …“: höchstens 1,5 m/s, **kein Springen**, Tempo **40 %**.
- [ ] Den Stapel „Ballaststein ×4“ **wegwerfen** (Rechtsklick wirft den ganzen Stapel weg) → zurück auf „Normal“, die Figur ist wieder schnell und kann sprinten, rollen und springen. Die Steine liegen vor der Figur und werden nicht automatisch wieder aufgehoben (kein Material).
- [ ] Zwischen 72 und 80 kg steht „Fast voll (gelb)“; dann werden **Materialien nicht mehr automatisch aufgehoben**, Gold schon.

### 7.8 Speichern und Laden

- [ ] Ein paar Sachen sammeln, eine Truhe öffnen, ein Teil wechseln (z. B. Schild ablegen), Gold notieren. **F5** (nicht im Kampf).
- [ ] Danach etwas ändern, z. B. Schild wieder anlegen, die Heiltränke wegwerfen (liegen bleiben lassen) und eine **zweite Truhe** öffnen. Inhalt der zweiten Truhe notieren.
- [ ] **F9** → Inventar, Ausrüstung (Schild wieder abgelegt), Gold und Heiltränke sind wie beim Speichern. Die **zweite Truhe ist wieder zu** und lässt sich erneut öffnen – **mit genau demselben Inhalt** wie vorher (gegen Speichern/Laden-Tricks). Die erste Truhe bleibt offen.
- [ ] Rüstung, Waffenschaden und Traglast im Overlay passen nach dem Laden zu den angelegten Teilen.
- [ ] Beute, die beim Laden am Boden lag, ist verschwunden (wird noch nicht gespeichert, siehe Abschnitt 12).
- [ ] Play beenden und neu starten → neues Spiel mit Startausrüstung, alle Truhen zu. **F9** lädt den Spielstand mit dem gesammelten Inventar.

---

## 8. Automatische Tests

1. **Window > General > Test Runner** → Reiter **EditMode** → **Run All**.
2. **Erwartung:** vier Test-Assemblies, alle grün:

| Assembly | Testfälle | Neu in diesem Schritt |
|---|---|---|
| `Aetherfall.Tests.EditMode` | **669** (492 + 177 neue) | `RarityRulesTests` (Farben, Affix-Anzahl, Faktoren, Dropgewichte 59,7/27,9/9,0/3,0/0,45 %), `ItemFormulasTests` (Item-Level, Einhandschwert-Tabelle von Stufe 1 bis 80 inkl. **W = 50**, Rüstung 60 laut GDD-Prüfung, Handelswert 1.284, G(L)), `AffixTiersTests` (Stufen I–VI, „Lodernd“ Stufe III = 9–12 %, Stufenwahl 50/35/15 %, Weltstufen-Untergrenze, Mythisch obere Hälfte), `AffixPoolTests` (kein Affix doppelt, Familien, zwei Resistenzen, Blutegel/Dornen, höchstens 2 Präfixe und 2 Suffixe), `ItemGeneratorTests`, `RarityRollerTests` (Glücks-Tabelle aus GDD 04 5.3, Beispiele Champion/Riss-Truhe/Raid-Boss, Mindestseltenheit, Mythisch, **100.000 Würfe**, Toleranz je Seltenheit etwa 4 Standardabweichungen – auch Episch und Legendär werden wirklich geprüft), `PityStateTests` (M_Pity-Tabelle, Garantie bei 200, Reset, Mythisch-Zähler), `LootRollerTests` (garantierte Einträge, Verschachtelung bis Tiefe 4, Bedingungen, Gold 5 × G(11) = 405, Zyklen, „2 × Schwert“ = 2 einzelne Funde), `LootStatisticsTests` (**100.000 Würfe der GDD-Beispieltabelle, jede Zeile ±1 %**), `ContentIndexTests`, `InteractionSelectorTests` |
| `Aetherfall.Tests.EditMode.Gameplay` | **172** (unverändert) | – |
| `Aetherfall.Tests.EditMode.Inventory` (neu) | **75** | `InventoryContainerTests` (Stapeln, Einzelstücke je ein Eintrag, 1000 Einträge, Sortieren), `EquipmentRulesTests` (16 Plätze, Level, Zweihand, Rüstungsklasse), `InventoryServiceTests` (Startausrüstung, Modifikatoren mit Quelle `item:<ID>` und vollständiges Entfernen, Ereignisse, `CountInBag`), `EncumbranceTests`, `InventorySaveableTests` (**Speichern → JSON → Laden**, auch mehrere Einzelstücke, zu große Stapel, Schild neben Zweihandwaffe, über 1000 Einträge), `LootServiceTests` (Wolf-Beute, Truhe einmal, gleicher Inhalt nach Neuladen, voller Rucksack, automatisch aufheben, Wegwerfen nur mit Beute-Anzeige) |
| `Aetherfall.Tests.EditMode.Save` | **130** (unverändert) | – |

---

## 9. Was du zurückmelden sollst

Schick Claude bitte:
1. die **Prüfliste** aus Abschnitt 7 (abgehakt bzw. mit kurzer Notiz bei „Nein“),
2. **rote Fehler oder gelbe Warnungen** aus der Console (Zeile anklicken, unten erscheint der ganze Text – den kopieren) und die „Hinweise“ aus dem Fenster „Testgelände erstellen“, falls es welche gab,
3. dein **Gefühl**:
   - **Beute-Menge:** zu viel, zu wenig? Fühlt sich ein Wolf lohnend an? (Fell immer, Ausrüstung etwa bei jedem 6. Wolf.)
   - **Lichtsäulen:** gut sichtbar? Zu dick, zu dünn, zu hoch? Stören sie?
   - **Automatisch aufheben:** angenehm, oder würdest du lieber alles selbst aufheben?
   - **Truhen:** lohnt sich die versteckte Truhe spürbar mehr als die Holztruhe?
   - **Überladen:** sind 80 kg Traglast genug? Ist die Verlangsamung klar zu spüren?
   - **Wölfe** beißen jetzt etwas fester als in Anleitung 05 (Rüstung 28 statt 60, Abschnitt 12): zu schwer?
4. das Ergebnis des **Test Runners** (Abschnitt 8): alle grün oder welche rot,
5. optional einen **Bildschirmfoto** vom Inventar und von einer Lichtsäule (macOS: Cmd+Shift+4).

---

## 10. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Kein Knopf „Inventar (Tab)“, keine Truhen | Szene nicht neu aufgebaut | Abschnitt 3 (Menü **Neu aufbauen**) |
| Inventar zeigt „Kein Inventar: InventoryInstaller fehlt in der BootConfig“ | Installer fehlt | Abschnitt 3 wiederholen, `BootConfig.asset` prüfen (10 Einträge) |
| Boot bricht ab, Fehlerbildschirm `… requires 'Aetherfall.Data.IContentDatabase' …` | falsche Reihenfolge in der BootConfig | Menü **Testgelände erstellen** erneut ausführen (sortiert selbst) |
| Gelbe Zeile `ContentInstaller has no catalog` und leere Ausrüstung | Katalog fehlt im ContentInstaller | `ContentInstaller.asset` › **Catalogs** › `ContentCatalog` eintragen oder Menü erneut ausführen |
| Gelbe Zeilen `Item catalog: … The entry is skipped.` | ein Daten-Asset ist ungültig (z. B. leere ID) | das genannte Asset prüfen; im Zweifel löschen und das Menü erneut ausführen |
| Wölfe lassen nichts fallen | **Loot Table Id** am Gegnertyp leer | `Data/Enemies/Grauwolf.asset` › **Loot Table Id** = `loot.enemy.wolf.grauwolf` (bzw. Menü erneut ausführen) |
| Kein Hinweis „[E] Öffnen …“ vor der Truhe | Layer 10 „Interactable“ war belegt oder fehlt | Hinweise des Menüs lesen; **Project Settings > Tags and Layers**: User Layer 10 muss „Interactable“ heißen, 16 „Pickup“ |
| Beute fällt, kann aber nicht aufgehoben werden | Layer 16 „Pickup“ fehlt | wie oben |
| Keine Lichtsäulen, nur Würfel | Beute unter „Selten“ (normal) oder Shader fehlt | „Testbeute“ probieren; bei rosa Säulen bitte melden |
| Tab öffnet nichts | Spiel nicht im Zustand „Playing“ (z. B. Pause) oder Fokus nicht im Game-Fenster | einmal ins Game-Fenster klicken, Esc-Pause schließen |
| Meldung „Wegwerfen nicht möglich: Keine Beute-Anzeige in der Szene (LootWorldSpawner fehlt).“ | Objekt `Loot` fehlt in der Szene | Abschnitt 3 (Menü **Neu aufbauen**) |
| Truhe öffnet sich nicht, gelbe Zeile `Chest '…' stays closed: the bag is full (1000 entries).` | Rucksack hat 1000 Einträge | Sachen wegwerfen, dann erneut öffnen (der Inhalt ist derselbe) |
| Nach F9 sind die Rüstungswerte falsch | sollte nicht sein | bitte mit Bildschirmfoto des Spieler-Overlays melden |

---

## 11. Dateien und wohin sie gehören

Alle Pfade relativ zu `Assets/_Project/`. **Keine Komponente musst du von Hand an ein GameObject hängen** – das Menü „Testgelände erstellen“ erledigt das. `.meta`-Dateien legt Unity selbst an; bitte mit committen.

### 11.1 Grundlagen `Scripts/Core/Interaction/` (Nr. 2) und Ereignisse `Scripts/Events/` (Nr. 3)

| Datei | Zweck |
|---|---|
| `IInteractable.cs`, `InteractionContext.cs`, `InteractionVerbs.cs`, `InteractionCandidate.cs`, `InteractionSelector.cs` | Schnittstelle für alles, womit die Figur interagieren kann, und die Auswahl des besten Ziels (Priorität, Abstand, Winkel) |
| `ItemEvents.cs` (neu) | `ItemPickedUp`, `InventoryChanged`, `CurrencyChanged`, `ItemEquipped`, `LootDropped` |
| `WorldEvents.cs` (neu) | `Interacted` (Objekt-ID, Verb) |

### 11.2 Inhalts-Datenbank `Scripts/Data/` (Assembly `Aetherfall.Data`, Nr. 4)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `GameDefinition.cs`, `ContentStatus.cs`, `ContentIdRules.cs`, `IdRefAttribute.cs` | Basis aller Definitionen mit fester ID | nein |
| `IContentDatabase.cs`, `ContentDatabase.cs`, `ContentIndex.cs` | Nachschlagen per ID | nein |
| `ContentCatalog.cs`, `ContentInstaller.cs` | Katalog-Asset und Installer | nein, Assets `Data/ContentCatalog.asset`, `Settings/Boot/ContentInstaller.asset` |

### 11.3 Items `Scripts/Items/` (Assembly `Aetherfall.Items`, Nr. 12)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `ItemDefinition.cs`, `AffixDefinition.cs`, `LootTableDefinition.cs`, `LootEntry.cs` | Daten-Assets | nein, Assets in `Data/Items/…`, `Data/LootTables/` |
| `ItemSpec.cs`, `AffixSpec.cs`, `LootTableSpec.cs`, `LootEntrySpec.cs`, `IItemCatalog.cs`, `ItemCatalog.cs` | dieselben Daten als reine Logik, Katalog mit Prüfung | nein |
| `ItemInstance.cs`, `ItemInstanceIds.cs`, `AffixRoll.cs`, `ItemFlags.cs`, `ItemFlagIds.cs` | ein konkreter Gegenstand (ID, Item-Level, Seltenheit, Streuung, Affixe, Menge, Neu/Favorit/Gesperrt) | nein |
| `ItemRarity.cs`, `ItemRarityIds.cs`, `RarityRules.cs`, `RarityColor.cs`, `ItemCategory.cs`, `EquipKind.cs`, `EquipmentSlot.cs`, `EquipmentSlotIds.cs`, `EquipmentGroup.cs`, `WeaponType.cs`, `WeaponTypeRules.cs`, `ArmorClass.cs`, `ArmorRules.cs`, `AffixKind.cs`, `AffixSlots.cs`, `CurrencyIds.cs`, `ChestTier.cs`, `ChestTierRules.cs` | Tabellen und Regeln aus GDD 04 | nein |
| `ItemFormulas.cs`, `ItemStats.cs`, `ItemGenerator.cs`, `AffixPool.cs`, `AffixTiers.cs`, `ItemTexts.cs` | Formeln, Werte-Modifikatoren, Generator, Texte | nein |
| `LootRoller.cs`, `LootContext.cs`, `LootResult.cs`, `LootDrop.cs`, `LootEntryKind.cs`, `LootEntryFlags.cs`, `LootQualityRules.cs`, `LuckFormula.cs`, `RarityRoller.cs`, `PityState.cs` | Beute würfeln, Glück, Pech-Schutz | nein |

### 11.4 Inventar `Scripts/Inventory/` (Assembly `Aetherfall.Inventory`, Nr. 13)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `InventoryContainer.cs`, `InventoryOwners.cs`, `InventorySorting.cs`, `InventorySortMode.cs`, `InventoryFilter.cs`, `CurrencyWallet.cs`, `Equipment.cs` | Rucksack, Sortieren, Gold, Ausrüstungsplätze | nein |
| `EncumbranceLevel.cs`, `EncumbranceRules.cs`, `EncumbranceState.cs`, `PlayerStatBinding.cs` | Traglast und Werte-Modifikatoren der Figur | nein |
| `IInventoryService.cs`, `InventoryService.cs`, `StartingKit.cs`, `StartingKitItem.cs`, `StartingEquipment.cs`, `StartingEquipmentEntry.cs`, `InventoryInstaller.cs` | Inventar-Dienst, Startausrüstung | nein, Assets `Settings/Items/Startausruestung_Krieger.asset`, `Settings/Boot/InventoryInstaller.asset` |
| `ILootService.cs`, `LootService.cs`, `ILootSpawner.cs`, `LootSeeds.cs`, `ChestRegistry.cs`, `AutoPickupMode.cs`, `AutoPickupRules.cs` | Beute-Dienst (Wölfe, Truhen, Pech-Schutz, Seeds) | nein |
| `InventorySaveable.cs`, `InventoryDto.cs`, `ItemInstanceDto.cs`, `AffixRollDto.cs`, `InventoryDtoMapper.cs` | Speichern im Abschnitt `inventory` | nein |
| `LootWorldSpawner.cs`, `LootBeamPool.cs` | Beute in der Welt, Lichtsäulen | **ja:** `Loot` |
| `Pickup.cs` | ein Beute-Würfel | nein (erzeugt der `LootWorldSpawner`) |
| `LootChest.cs` | Truhe | **ja:** `Holztruhe`, `Eisentruhe`, `Versteckte Truhe` |

### 11.5 Spieler, Eingabe, Kampf

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `PlayerInteractor.cs` | `Scripts/Player/` | Interaktion (E / A) | **ja:** `Player` |
| `PlayerLootCollector.cs` | `Scripts/Player/` | automatisch aufheben | **ja:** `Player` |
| `PlayerEquipment.cs` | `Scripts/Player/` | Ausrüstung → Werte, Waffenschaden, Schild, Traglast-Grenzen, Sichtbarkeit von Schwert und Schild | **ja:** `Player` |
| geändert: `PlayerCombatController.cs`, `PlayerMotor.cs`, `PlayerMovementModel.cs`, `PlayerInputReader.cs`, `PlayerResourcesSaveable.cs`, `Aetherfall.Player.asmdef` | `Scripts/Player/` | Waffenschaden/Rüstung aus der Ausrüstung (statt Testwerten), Tempo und Grenzen bei Überladung, A = Interagieren vor Springen, LP nach dem Laden | wie bisher |
| `IUiInput.cs`, `UiInput.cs`, `UiButton.cs`; geändert `IInputService.cs`, `InputService.cs`, `InputActionNames.cs`, `GameInputBindings.cs` | `Scripts/Input/` | Menü-Eingaben (Schließen mit Tab/Esc/B) | nein |
| geändert: `DodgeProfile.cs` | `Scripts/Combat/` | Ausweichschritt bei Überladung | nein |

### 11.6 Entwickler-Werkzeuge und Editor

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `InventoryDebugOverlay.cs` | `Scripts/DevTools/` | Debug-Inventar (Tab) | **ja:** `InventoryOverlay` |
| `InteractionPromptOverlay.cs` | `Scripts/DevTools/` | Hinweis „[E] …“ und Beute-Meldungen | **ja:** `InteractionPrompt` |
| geändert: `PlayerStatusDebugOverlay.cs`, `Aetherfall.DevTools.asmdef` | `Scripts/DevTools/` | Zeilen Rüstung, Angriff, Traglast, Gold | wie bisher |
| `TestGroundItemAssets.cs`, `TestGroundAffixAssets.cs`, `TestGroundLootTableAssets.cs`, `TestGroundItemBuilder.cs`, `TestGroundSerialized.cs`; geändert `TestGroundMenu.cs`, `ProjectLayers.cs`, `TestGroundSceneBuilder.cs`, `TestGroundCombatBuilder.cs`, `TestGroundAssets.cs`, `TestGroundPaths.cs`, `Aetherfall.EditorTools.World.asmdef` | `Scripts/Editor/World/` | Menü legt Item-Daten, Truhen, Overlays und Installer an | nein |

### 11.7 Tests

| Datei | Ordner |
|---|---|
| `ItemTestCatalog.cs`, `RarityRulesTests.cs`, `ItemFormulasTests.cs`, `AffixTiersTests.cs`, `AffixPoolTests.cs`, `ItemGeneratorTests.cs`, `RarityRollerTests.cs`, `PityStateTests.cs`, `LootRollerTests.cs`, `LootStatisticsTests.cs`, `ContentIndexTests.cs`, `InteractionSelectorTests.cs`; geändert `Aetherfall.Tests.EditMode.asmdef` | `Tests/EditMode/` |
| `Aetherfall.Tests.EditMode.Inventory.asmdef`, `InventoryTestItems.cs`, `InventoryTestEnvironment.cs`, `RecordingLootSpawner.cs`, `InventoryContainerTests.cs`, `EquipmentRulesTests.cs`, `InventoryServiceTests.cs`, `EncumbranceTests.cs`, `InventorySaveableTests.cs`, `LootServiceTests.cs` | `Tests/EditModeInventory/` (neu) |

---

## 12. Hinweise, Vorschläge und Abweichungen

**Werte zum Ausprobieren** (alle im Inspector änderbar; Asset anklicken, Wert ändern, Play drücken):

| Was | Wert | Wo |
|---|---|---|
| Wolf-Beute | Fell garantiert; je Wurf (1–2): Nichts 200, Gold 300 (0,05–0,15 × G(8) = 3–9 Gold), Fleisch 300, Verbrauchsgüter 80, Ausrüstung 120 | `Data/LootTables/Loot_Wolf_Grauwolf.asset` › **Entries** |
| Truhen-Inhalt | Gold als Vielfaches von G(10) = 75 | `Data/LootTables/Loot_Truhe_….asset` |
| Automatisch aufheben | Gold und Materialien (Aus / Alles möglich) | `Settings/Boot/InventoryInstaller.asset` › **Auto Pickup** |
| Startwert der Beute | 0 = jedes neue Spiel anders; feste Zahl = immer gleiche Beute (zum Nachstellen von Fehlern) | › **Random Seed** |
| Lichtsäulen | höchstens 30, ab „Selten“, Breite 0,08 m | Szene › `Loot` › **Loot Beam Pool** › **Max Beams**, **Minimum Rarity**, **Beam Width** |
| Waffenschaden ohne Waffe | 5 (Vorschlag, GDD nennt keinen Wert) | Szene › `Player` › **Player Equipment** › **Unarmed Damage** |
| Gewicht, Wert, Grundwert eines Items | z. B. Wolfsfell 1 kg | `Data/Items/…` |
| Affix-Werte und -Gewichte | Stufe I und VI, Gewicht 100 / 50 (stark) / 60 (Nutzen) | `Data/Items/Affixes/…` |

**Bewusste Entscheidungen bzw. Abweichungen in diesem Schritt:**
- **Rüstung und Waffenschaden kommen jetzt aus der Ausrüstung.** Der Testwert „Rüstung 60“ aus Anleitung 05 entfällt. Die Startausrüstung aus GDD 03, 11.2 (Gambeson, Lederstiefel, Holzschild) ergibt Rüstung **28**; ein Wolfsbiss macht deshalb etwa 30–35 statt etwa 25 Schaden. GDD 03, 8.3 rechnet für Stufe 10 mit Rüstung 60 (Platte an Brust, Beinen, Kopf). Das Schwert ist „Selten“ auf Stufe 10 und hat damit genau den GDD-Wert **W = 50**.
- **Werte werden je Item auf ganze Zahlen gerundet** (z. B. 49,92 → 50). Die GDD-Prüfung „26 × 2,08 × 1,1 ≈ 59“ ergibt dadurch 60.
- **Interaktions-Schnittstelle in Core:** `IInteractable` liegt in `Aetherfall.Core` (Nr. 2), weil Inventar (13), Welt (20), NPC (22) und Spieler (24) sie alle kennen müssen und Core die niedrigste gemeinsame Assembly ist. Die spätere `Interactable`-Komponente der Welt (mit Verb, Priorität, Bedingung, Architektur 11.3) wird diese Schnittstelle umsetzen.
- **Beute-Dienst:** `LootService` übernimmt die Rolle des `LootDropService` aus Architektur 11.6 (Wolf stirbt → würfeln → Beute in die Welt) und zusätzlich Truhen und Pech-Schutz, weil alle denselben Spielstand-Seed und dieselben Zähler brauchen.
- **Geöffnete Truhen** werden vorerst im Spielstand-Abschnitt `inventory` gespeichert (TODO: in den `WorldObjectStateStore` der Welt umziehen, Architektur 9.7). **Beute am Boden** wird noch nicht gespeichert und verschwindet beim Laden (TODO: `IRuntimeSpawnRegistry`, Architektur 11.6).
- **Truhen-Inhalt** geht direkt in den Rucksack („Alles nehmen“), bis es ein Loot-Fenster gibt. Passt er nicht hinein (1000 Einträge), bleibt die Truhe zu und der Pech-Schutz-Zähler unverändert.
- **Einzelstücke** (Ausrüstung, Stapelgröße 1) liegen immer als eigene Einträge im Rucksack, auch wenn eine Loot-Tabelle oder die Startausrüstung „2 ×“ nennt. Spielstände mit mehreren Stück in einem Eintrag oder mit Stapeln über der Stapelgröße werden beim Laden aufgeteilt statt gekürzt; ein Schild neben einer Zweihandwaffe kommt beim Laden in den Rucksack.
- **Wegwerfen** geht nur, wenn die Beute-Anzeige (`Loot`) in der Szene ist – sonst landete der Gegenstand sofort wieder im Rucksack und meldete ein „Aufheben“.
- **Beute-Level von Gegnern:** Die Beute nimmt das Level aus dem Gegner-Ereignis unverändert. Elite +2 und Champion +3 (GDD 03, 9.7) gehören in das Level des Gegners selbst (Feld **Level** am Gegnertyp), damit Kampf, Erfahrung und Beute dasselbe Level nutzen.
- **Quest-Abgaben** prüfen künftig `CountInBag` (nur Rucksack), denn `TryRemove` nimmt nie angelegte Teile; `CountOf` zählt Rucksack und Ausrüstung.
- **Seed gegen Speichern/Laden-Tricks:** Truhen würfeln mit Spielstand-Seed + Truhen-ID (immer gleicher Inhalt), Wölfe mit Spielstand-Seed + Gegner-ID + fortlaufendem Zähler (gespeichert).
- **Affixe ohne passenden Wert** (Element-Zusatzschaden, Blutegel, Dornen, Reinheit, Nachtwandler, Sammler, Wuchtig, Blutig) sind noch nicht im Pool, weil die Kampf-Werte dafür fehlen; Regeln und Tests (z. B. Blutegel/Dornen-Ausschluss) gibt es schon.
- **Welche Affixe „stark“ (Gewicht 50) oder „Nutzen“ (60) sind**, legt GDD 04 nicht fest – die Zuordnung ist ein Vorschlag (stark: Scharf, Grausam, Präzise, Flink, Eile; Nutzen: Fuchs, Glück, Quelle, Heilkunst).
- **Debug-Inventar nur mit Maus und Tastatur.** Für das Gamepad gibt es noch keine Inventar-Taste (GDD 03, 1.5 nennt nur Tab); die Gamepad-Steuerung kommt mit der echten Oberfläche.
- **Wölfe (Level 8) liefern höchstens „Selten“**, weil Episch und Legendär laut GDD 04, 3.1 erst ab Item-Level 10 zufällig fallen. Truhen im Testgelände haben Gebietslevel 10.

**Noch nicht enthalten** (kommt später): richtige Inventar-Oberfläche mit Symbolen, Tooltips und Vergleich, Loot-Fenster für Truhen, Smart Loot (offene Entscheidung, GDD 04 4.3), Sockel und Edelsteine, legendäre Effekte und Set-Boni, Mythisch-Aufwertung (erst ab Weltstufe 1), Nacht-Bonus (+1 Loot-Qualität), Elite- und Champion-Varianten, Händler, Herstellen, Lagerkiste/Fundbüro, Tränke benutzen (Schnellslot-Taste), Diebesgut, Kompass-Marker und Zeitlupe bei Legendär, Optionen-Menü für „Automatisch aufheben“ und „Strahlen ab Seltenheit“, lokalisierte Namen (`LocalizedString`, bis dahin deutscher Text im Asset).
