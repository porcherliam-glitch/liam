# Testanleitung: Die vergessene Gruft

> Dungeon „Die vergessene Gruft“ mit zwei Rätseln, Skelett-Kriegern und dem Mini-Boss „Der Wachende Ritter“ · Stand: 2026-10-14 · Bezug: [GDD 02, 11.0 und 11.7](../GDD/02_Quests_und_Dialoge.md) · [GDD 01, 4.1, 6.7 und 11](../GDD/01_Welt_Story_Fraktionen.md) · [GDD 03, 4 und 9](../GDD/03_Kampf_Charakter_Progression.md) · [GDD 04, 5.2 und 5.7](../GDD/04_Items_Crafting_Wirtschaft_Endgame.md) · [GDD 05, 3.4 und 5.3](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) · [Architektur 3.3, 4.3, 9 und 10.8](../Technik/01_Architektur.md)

In diesem Schritt entsteht der erste **Dungeon** des Mini-Slice: die Gruft der Eichenritter unter dem Rabenfels. Es gibt jetzt:

- eine **Layout-Datei** (`gruft_layout.json`), in der die ganze Gruft steht: Räume, Gänge, Treppen, Türen, Rätsel, Fallen, Gegner, Truhen, Inschriften, Boss-Arena, Licht und die beiden Ausgänge. **Unity und Blender bauen beide aus genau dieser Datei.** Ein Prüfprogramm (Validator) meldet Fehler, bevor etwas gebaut wird.
- das Menü **Aetherfall > Gruft erstellen**. Es baut daraus die Szene `Assets/_Project/Scenes/Dungeons/Gruft.unity`: dunkle Steinräume aus einfachen Formen, Fackeln, Feuerschalen und türkises Aether-Leuchten.
- **Rätsel 1 „Die drei Grabplatten“**: Die Inschrift am Tor nennt die Reihenfolge. Falsche Reihenfolge → Pfeilfalle (10 % der Lebenspunkte), die Platten springen zurück.
- **Rätsel 2 „Die drei Spiegel“**: Ein Aether-Strahl fällt durch einen Spalt. Drei Spiegel drehen, bis der Strahl das Siegel an der Tür trifft. Rußspuren am Boden zeigen den Weg.
- **Bausteine für spätere Dungeons**: Hebel, Druckplatte, Tür, die auf Bedingungen reagiert, Käfig, lesbare Inschriften, Hinweis nach 120 s ohne Fortschritt, Checkpoint vor dem Boss.
- **6 Skelett-Krieger** in den Hallen (einer davon Elite mit Turmschild, der von vorne alles blockt).
- den Mini-Boss **„Der Wachende Ritter“** mit Boss-Lebensbalken, zwei Phasen, angekündigten Angriffen und dem Spiegel-Strahl, der ihn betäubt.
- **Speichern**: gelöste Rätsel, offene Türen, Hebel, Spiegel, der Käfig, aufgehobene Belohnungen und „Boss besiegt“ bleiben nach dem Laden erhalten. **Besiegt bleibt besiegt.**

**Wichtig:** Die Gruft ist **noch nicht mit dem Dorf Eichental verbunden**, und die Quest „Die vergessene Gruft“ gibt es noch nicht als Daten (das kommt in Baustein 8 des Mini-Slice). Du testest die Gruft, indem du ihre Szene direkt startest. Was später noch eingebaut werden muss, steht in [Abschnitt 11, Integration](#11-integration).

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 10](./10_Test_Dialoge.md) sind erledigt. Das Testgelände wurde mindestens einmal erstellt (Menü **Aetherfall > Testgelände erstellen**), denn die Gruft nutzt dieselbe Spielfigur, Kamera und Ausrüstung.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Automatische Tests](#3-automatische-tests)
4. [Gruft erstellen](#4-gruft-erstellen)
5. [So sieht die Gruft aus (Vorschau)](#5-so-sieht-die-gruft-aus-vorschau)
6. [Tasten auf einen Blick](#6-tasten-auf-einen-blick)
7. [Durchspielen: Prüfliste](#7-durchspielen-prüfliste)
8. [Was du zurückmelden sollst](#8-was-du-zurückmelden-sollst)
9. [Häufige Fehler und Lösungen](#9-häufige-fehler-und-lösungen)
10. [Dateien und wohin sie gehören](#10-dateien-und-wohin-sie-gehören)
11. [Integration](#11-integration)
12. [Für Claude: ohne Klicks (Batchmode)](#12-für-claude-ohne-klicks-batchmode)
13. [Hinweise, Abweichungen und offene Punkte](#13-hinweise-abweichungen-und-offene-punkte)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Layout-Datei** `Assets/_Project/Data/Regions/Eichental/gruft_layout.json` | Die Gruft als Daten, Maße in Metern: 7 Räume, 8 Gänge (Treppen und Rampen), 6 Türen, 2 Rätsel, 2 Fallen, 61 Objekte, 1 Gegnergruppe, Boss-Arena, 28 Lichter, 4 Orts-Zonen, 1 Checkpoint, Start und 2 Ausgänge. Alle IDs genau wie in GDD 02, 11.7 (z. B. `puzzle.eichental.gruft_grabplatten`, `door.eichental.gruft_tor`, `boss.eichental.wachender_ritter`). |
| **Layout-Leser und Validator** (`Aetherfall.World`, Ordner `World/Dungeons`) | Liest die Datei streng (falsches JSON → Meldung mit Zeile und Spalte) und prüft: IDs eindeutig, jeder Raum erreichbar, Türen in Öffnungen, Rampen nicht zu steil, Rätsel lösbar und nicht schon am Anfang gelöst, Arena mindestens 25 × 25 m mit Deckung, Checkpoint vor (nicht in) der Arena, Ausgänge vorhanden. |
| **Geometrie** (`DungeonGeometry`) | Rechnet aus Räumen und Gängen Böden, Decken, Wände, Stürze über niedrigen Durchgängen und Stufen. Das Blender-Skript rechnet nach denselben Regeln (ein Test prüft, dass beide dieselben Zahlen ergeben). |
| **Rätsel-Logik** (Ordner `World/Puzzles`, reine Logik mit Tests) | `SequencePuzzle` (Reihenfolge), `MirrorPuzzle` + `MirrorBeamTracer` (Strahl über Spiegel), `PuzzleHintTimer` (Hinweis nach 120 s), `WorldDoorRules` (wann eine Tür offen ist). |
| **Rätsel-Bausteine in der Szene** | `PuzzleSwitch` (Grabplatte, Hebel), `PressurePlate`, `RotatableMirror`, `WorldDoor` (Tor, Gitter, verborgene Wand), `StateInteractable` (Käfig, Siegelstein, Klingenfragment), `ReadableObject` (Inschrift, Reliefs, Tafeln), `HintHighlight`, `ActivateOnState`, `CheckpointZone`, `DungeonPortal` (Ausgang). |
| **Weltobjekt-Zustände** (`WorldObjectStateService`, Speicher-Sektion `worldobjects`) | Merkt sich je ID eine Zahl (0 = nichts passiert, 1 = gelöst/offen/besiegt, bei Spiegeln die Richtung). Wird gespeichert und geladen. Bedingungen „Rätsel gelöst“ und „Weltobjekt-Zustand“ für Quests und Türen. |
| **Neue Events** (`Aetherfall.Events`) | `PuzzleSolved`, `PuzzleFailed`, `WorldObjectStateChanged`, `BossEncounterStarted`, `BossEncounterEnded`, `BossPhaseChanged` (Architektur 4.3). `BossDefeated` und `Interacted` gab es schon. |
| **Skelett-Krieger** (Daten im Generator) | `enemy.untot.skelett_krieger` als Normal (Stufe 6, 140 LP), Elite mit Turmschild (Stufe 8, 328 LP) und Champion (Stufe 9, 704 LP, Grundlage des Bosses). Schwäche Wucht +25 %, Resistenz Stich 30 %. Werte nach GDD 01, 11.2 und GDD 03, 9.7. |
| **Turmschild** (`EnemyShieldGuard`) | Der Elite-Skelettkrieger blockt alle Treffer von vorne, solange er nicht gerade zuschlägt. Von hinten, von der Seite oder während er zuschlägt ist er verwundbar. |
| **Boss „Der Wachende Ritter“** (`AI/Bosses`) | `BossBrain` (Entscheidungen als reine Logik mit Tests), `BossPhaseTracker` (Phasen nach LP), `BossController` (Unity-Teil), `BossDefinition` (Daten), Boss-Lebensbalken über `IBossBarService` und einen einfachen Platzhalter-Balken (`BossBarOverlay`). |
| **Speichern und Boss** (`Aetherfall.World.Gameplay`) | Speicher-Anbindung der Weltobjekte, kein Speichern während des Bosskampfs, automatisches Speichern am Checkpoint und nach dem Sieg, Pfeilfalle, Bedingungs-Tor, Aktionen beim Aufheben (Item geben). |
| **Menü** „Aetherfall > Gruft erstellen“ | Baut die Szene, legt Gegner-, Boss-, Angriffs- und Beute-Daten an, trägt drei neue Installer in die BootConfig ein und hängt die Szene an die Szenenliste. Mehrfach ausführbar. |
| **Blender-Vorschau** `Tools/Preview/gruft_preview.py` | Baut die Gruft aus derselben Layout-Datei in Blender nach und rendert Karte, Halle und Boss-Arena (Abschnitt 5). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** steht der Eintrag „Die vergessene Gruft“.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Es sind rund 140 neue Dateien.
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu.

---

## 3. Automatische Tests

1. **Window > General > Test Runner**, Reiter **EditMode**, oben **Run All**.
2. **Du siehst danach:** Alles ist grün. Neu sind zwei Gruppen:

| Test-Gruppe | Anzahl | Was geprüft wird |
|---|---|---|
| `Aetherfall.Tests.EditMode.Gruft` | 69 | **Layout-Datei** (die echte Datei: alle IDs aus GDD 02, 11.7, Grabplatten-Reihenfolge Eiche → Krone → Schild laut Inschrift, Spiegel-Lösung Ost/Nord/West, Rußspuren auf dem Strahlweg, 6 Skelette mit 1 Elite, Arena-Regeln, Spawn, Ausgänge, Checkpoint), **Validator** (kaputtes JSON, doppelte IDs, unerreichbare Räume, unlösbare Spiegel, zu kleine Arena), **Geometrie**, **Grabplatten-Rätsel** (richtige und falsche Reihenfolge, Hinweis nach 120 s), **Spiegel-Rätsel** (Strahlverfolgung, Sperre nach dem Lösen, Laden), **Boss** (Erwachen, Schildhaltung, Telegrafie, Phase 2 bei 50 % mit 2 Helfern, Sturmangriff erst in Phase 2, Strahl-Betäubung 5 s mit Abklingzeit, Parieren öffnet die Deckung, Tod genau einmal, Neustart nach dem Tod des Spielers), **Weltobjekt-Zustände** und **Türregeln** |
| `Aetherfall.Tests.EditMode.GruftSave` | 8 | **Speichern**: Rätsel, Spiegel und Boss überstehen Speichern/Laden, neues Spiel löscht alles, kein Speichern im Bosskampf, automatisches Speichern nach dem Sieg, Bedingungen lesen die Zustände, Pfeilfalle trifft 10 % der maximalen LP |

Außerhalb von Unity wurden alle Tests mit dem Harness geprüft: **1935 bestanden** (977 ohne Pakete), 0 fehlgeschlagen.

---

## 4. Gruft erstellen

1. Oben im Menü **Aetherfall > Gruft erstellen** klicken.
   **Du siehst danach:** ein Fenster mit einer Liste, was gebaut wird.
2. **Erstellen** klicken (beim zweiten Mal heißt der Knopf **Neu aufbauen**).
   **Du siehst danach:** Nach einigen Sekunden das Fenster „Fertig! Die Szene „Gruft“ ist geöffnet.“ Im **Hierarchy**-Fenster links steht die Szene **Gruft** mit den Gruppen `Gruft` (Böden, Decken, Wände, Objekte, Türen, Rätsel, Lichter), `Gegner`, `Player` und den Kameras.
3. Stehen im Fertig-Fenster **Hinweise**, lies sie. Typisch ist „Inhaltskatalog fehlt“: Dann zuerst **Aetherfall > Testgelände erstellen** ausführen und danach die Gruft noch einmal.
4. In der Console steht unter anderem `Layout gelesen und geprüft: 7 Räume, 8 Gänge, 61 Objekte, 0 Hinweise.` und `Szene gespeichert: Assets/_Project/Scenes/Dungeons/Gruft.unity`.

Das Menü legt außerdem an (nur wenn es sie noch nicht gibt):
- Gegnerdaten `Skelett_Krieger`, `Skelett_Krieger_Elite`, `Skelett_Krieger_Champion`, Bossdaten `Boss_Wachender_Ritter` und sechs Angriffe (Ordner der Testgelände-Daten),
- Beute-Tabellen `Loot_Skelett` und `Loot_Boss_Wachender_Ritter`, Questgegenstände `Klingenfragment_Eidwahrer` und `Siegelstein_Gruft`,
- die Installer **WorldObjectsInstaller**, **BossInstaller** und **WorldSaveInstaller** in der BootConfig.

**Achtung:** „Neu aufbauen“ ersetzt die Szene Gruft komplett. Eigene Änderungen in dieser Szene gehen verloren. Ändere stattdessen die Layout-Datei und baue neu.

---

## 5. So sieht die Gruft aus (Vorschau)

Claude hat die Gruft in Blender aus **derselben Layout-Datei** nachgebaut und drei Bilder gerendert (sie hängen im Chat an). Jedes Bild trägt unten den Balken „Vorschau – Blender-Nachbau aus den Layout-Daten (kein Unity-Screenshot)“. In Unity sieht es ähnlich, aber nicht gleich aus (andere Lichtberechnung, Unity-Grundformen).

| Bild | Was du siehst |
|---|---|
| `gruft_karte.png` | Draufsicht ohne Decken mit allen Räumen, Rätseln, Gegnern, Türen, dem Lösungsweg des Spiegel-Strahls, Boss-Kampfbereich (rot gestrichelt), Checkpoint, Start und Ausgängen. Rechts der Weg durch die Gruft in 6 Schritten. |
| `gruft_halle.png` | Blick von der Treppe in die Hallen der Eichenritter: Pfeiler, Sarkophage, Feuerschalen, Aether-Riss im Boden, Skelett-Krieger mit Rundschild, hinten der Elite-Krieger mit Turmschild. |
| `gruft_bossarena.png` | Siegelkammer in Phase 2: Spiegel 4 lenkt den Aether-Strahl auf den Wachenden Ritter, er ist betäubt und hat den Turmschild gesenkt. |

Selbst erzeugen (nur wenn du Blender hast; dauert ca. 20 Minuten):

```
blender -b -P Tools/Preview/gruft_preview.py -- --out <Ordner> --samples 96
```

Schneller Probelauf: `--test --percent 50`.

---

## 6. Tasten auf einen Blick

| Was | Tastatur und Maus | Xbox-Controller | PlayStation-Controller |
|---|---|---|---|
| Inschrift lesen, Grabplatte drücken, Spiegel drehen, Hebel ziehen, Käfig öffnen, Truhe öffnen, aufheben, Gruft verlassen | **E** | **A** | **×** |
| Angreifen | **linke Maustaste** | **X** | **□** |
| Blocken / Parieren | **Q** halten / kurz vor dem Treffer | **LB** | **L1** |
| Ausweichrolle | **Strg** mit Richtung | **B** | **○** |
| Lock-On an/aus | **mittlere Maustaste** oder **T** | **R3** | **R3** |
| Schnellspeichern / Schnellladen | **F5** / **F9** | – | – |
| Inventar (Debug) | **Tab** | – | – |

Der Hinweis unten in der Mitte nennt immer, was **E** gerade tut, z. B. „[E] Lesen: Inschrift am Tor“ oder „[E] Drehen: Spiegel 1“.

---

## 7. Durchspielen: Prüfliste

Szene starten: Im **Project**-Fenster `Assets/_Project/Scenes/Dungeons/Gruft` doppelklicken, dann oben **Play** drücken und einmal ins Game-Fenster klicken. Die Szene startet wie das Testgelände ein neues Testspiel (Spielfigur auf Stufe 10, siehe [Anleitung 09, Abschnitt 15](./09_Test_Quests_im_Spiel.md#15-hinweise-abweichungen-und-offene-punkte)).

### 7.1 Vorraum und Grabplatten (Rätsel 1)

- [ ] Du stehst im **Vorraum** vor einem geschlossenen **Steintor**. Es ist dunkel, an den Wänden brennen vier Fackeln, hinter dir fällt Tageslicht die Treppe herunter.
- [ ] Rechts neben dem Tor hängt die **Inschrift**. **E** → Text: „Erst die Eiche, die den Schild trug, dann die Krone, die sich beugte, zuletzt der Schild, der nie brach.“
- [ ] An den Wänden drei **Wandreliefs**. **E** auf jedes zeigt einen kurzen Text (das dritte nennt den Codex „Die Eichenritter“).
- [ ] Vor dem Tor liegen drei **Grabplatten** nebeneinander, von links: **Schild**, **Eiche**, **Krone**. (Sie liegen absichtlich nicht in der Lösungs-Reihenfolge.)
- [ ] **Falsch drücken**, z. B. zuerst die Schild-Platte: Aus den Wandschlitzen links und rechts schießen Pfeile, du verlierst **10 % deiner maximalen LP**, alle Platten springen zurück. Console: `Puzzle 'puzzle.eichental.gruft_grabplatten': wrong step …` und `Trap 'trap.eichental.gruft_pfeilfalle' hits the player for …`.
- [ ] **Richtig drücken: Eiche → Krone → Schild.** Jede Platte sinkt ein und bleibt unten. Nach der dritten: Console `Puzzle 'puzzle.eichental.gruft_grabplatten' solved.` und `Door 'door.eichental.gruft_tor' opens.` Das **Tor fährt hoch**.
- [ ] **Hinweis:** Warte im Vorraum **120 s**, ohne eine Platte zu drücken. Die **Inschrift leuchtet auf** (pulsiert). Console: `… hint shown after 120 s without progress.`

### 7.2 Hallen der Eichenritter

- [ ] Hinter dem Tor führt eine Treppe 3 m hinab in eine große Halle mit 8 Pfeilern, Sarkophagen an den Seiten, vier Feuerschalen und einem türkis leuchtenden Riss im Boden.
- [ ] **Erst jetzt** (nach dem Lösen des Rätsels) stehen **6 Skelett-Krieger** in der Halle: zwei bewachen den Eingang, zwei laufen Patrouille, einer steht in der Mitte, hinten vor dem Ausgang der **Elite mit Turmschild**.
- [ ] Die Skelette greifen an wie die Wölfe (Ausholen, Zuschlagen, Abstand). Wuchtwaffen wirken stärker (+25 %), Stiche schwächer.
- [ ] **Elite mit Turmschild:** Schläge von vorne werden **geblockt** (kein Schaden). Von hinten, von der Seite oder während er selbst zuschlägt (nach dem Ausholen) triffst du ihn.
- [ ] Getötete Skelette lassen manchmal Beute fallen (Gold, Tränke, selten Ausrüstung).

### 7.3 Käfig, Fenn und Nebenkammer (optional)

- [ ] An der Westwand steht ein **Käfig** mit dem Grabräuber **Fenn**. **E** („Befreie den Grabräuber“) → das Gitter verschwindet, über Fenn steht für einige Sekunden sein Satz über die lose Platte hinter dem dritten Grab.
- [ ] Gleichzeitig öffnet sich in der Westwand eine **verborgene Tür** zur **Nebenkammer**. Darin: Fenns Notiz (**E** lesen) und eine **versteckte Truhe** (Seltenheit mindestens Selten).

### 7.4 Seitengang für Schleicher (optional)

- [ ] In der rechten hinteren Ecke der Halle (Ostwand, nahe der Treppe) steht eine **Kiste als Kletterstelle**. Darüber kommst du auf den 1 m höheren, schmalen **Seitengang** hinter der Ostwand.
- [ ] In der Mitte des Seitengangs liegt eine **Druckplatte**. Draufsteigen → Pfeile aus der Wand, 10 % LP.
- [ ] Am Ende des Gangs zieht der **Hebel** (**E**) das **Gitter** hoch (noch einmal **E** lässt es wieder herunter). Du kommst hinter den Skeletten heraus, direkt vor dem Gang zum Spiegelsaal.

### 7.5 Spiegelsaal (Rätsel 2)

- [ ] Der **Spiegelsaal** ist in türkises Licht getaucht. Gleich links neben dem Eingang fällt ein **Aether-Strahl** aus einem Spalt in der Wand.
- [ ] Drei **Spiegel** auf Ständern. Ein kleiner leuchtender Pfeil am Fuß zeigt, wohin ein Spiegel den Strahl lenkt. Jedes **E** dreht einen Spiegel **eine Vierteldrehung im Uhrzeigersinn** (Nord → Ost → Süd → West).
- [ ] Der Strahl ist als leuchtende Linie zu sehen und endet am ersten Hindernis.
- [ ] **Lösung:** Spiegel 1 → **Ost**, Spiegel 2 → **Nord**, Spiegel 3 → **West**. Dann trifft der Strahl das **Siegel** an der Tür links. Console: `Puzzle 'puzzle.eichental.gruft_spiegel' solved: the beam reaches the seal.` Die **Siegeltür** öffnet sich, danach lassen sich die Spiegel nicht mehr drehen.
- [ ] **Keine Strafe** bei falschen Stellungen.
- [ ] **Hinweis:** 120 s im Saal ohne Fortschritt → die **Rußspuren** am Boden (der alte Strahlenweg) leuchten auf.

### 7.6 Vorkammer und Checkpoint

- [ ] Hinter der Siegeltür geht es abwärts in eine kleine **Vorkammer**. Beim Betreten: Console `Checkpoint 'checkpoint.gruft.vorkammer' reached.` und `Autosave 'checkpoint.gruft.vorkammer'.`
- [ ] Ab jetzt erscheinst du nach dem Tod **hier** wieder (nicht am Eingang).

### 7.7 Bosskampf: Der Wachende Ritter

- [ ] Die **Siegelkammer** ist groß (26 × 26 m), 6 m tiefer als der Eingang, mit vier dicken Pfeilern, Feuerschalen und einem Altar mit dem Siegelstein. Der Ritter **kniet** vor dem Altar.
- [ ] Sobald du ein paar Schritte in die Kammer gehst: Das **Fallgitter hinter dir schließt sich**, der Ritter **steht auf** (ca. 1,5 s, in dieser Zeit unverwundbar). Unten erscheint der **Boss-Lebensbalken** mit „Der Wachende Ritter“ und „Letzter Wächter der Eichenritter“. Console: `Boss 'boss.eichental.wachender_ritter' awakens (music mus.boss_gruft).`
- [ ] **F5** während des Kampfs → **nicht gespeichert** (Boss-Arena gesperrt).
- [ ] **Phase 1 (100–50 %):** Der Ritter hält den **Turmschild** vor sich. Treffer von vorne: **geblockt**. Treffer von hinten: Schaden.
- [ ] **Schildstoß:** Der Ritter zieht den Schild **0,8 s** zurück (Ankündigung, gelbes Aufleuchten). **Pariere** (Q im richtigen Moment) → der Schild hängt kurz zur Seite, **1,5 s offene Deckung** für Treffer von vorne. Console: `… parried, the guard is open.`
- [ ] **Bei 50 % LP:** kurze Pause (unverwundbar, ca. 2,5 s), Console `Boss '…': phase 2.` **Zwei Skelett-Krieger** stehen an den Seitenwänden auf. In der Ostwand bricht ein **Spalt** auf, ein Aether-Strahl fällt auf **Spiegel 4**.
- [ ] **Phase 2:** Neu sind ein **Sturmangriff** (leuchtet vorher **rot**, lässt sich weder blocken noch parieren – ausweichen!) und ein **Rundumschlag** (blocken geht, parieren nicht). Bei beiden senkt der Ritter den Schild.
- [ ] **Spiegel-Strahl:** Drehe Spiegel 4 (**E**) so, dass der Strahl den Ritter trifft, oder locke den Ritter in den Strahl. Er wird **5 s betäubt** (türkis, Schild unten) und ist von vorne verwundbar. Danach wirkt der Strahl erst nach **8 s** wieder.
- [ ] **Sieg:** Der Ritter fällt, die zwei Helfer zerfallen mit ihm. Console **genau einmal** `Boss 'boss.eichental.wachender_ritter' defeated.` Der Balken verschwindet, das **Fallgitter** geht auf, ebenso das **Gitter zum Fluchtweg**. Danach `Autosave 'boss.eichental.wachender_ritter'.`
- [ ] **Beute:** Gold, ein Ausrüstungsteil (mindestens Selten) und ein Verbrauchsgegenstand fallen zu Boden. Vor dem Altar erscheint das leuchtende **Klingenfragment „Eidwahrer“** (**E** → im Inventar).
- [ ] **Siegelstein:** Erst nach dem Sieg zeigt der Altar „[E] Nimm den Siegelstein“. **E** → der Stein ist im Inventar.
- [ ] Die **Truhe** in der Ecke der Siegelkammer (Eisen) lässt sich öffnen.

### 7.8 Sterben im Bosskampf

- [ ] Lass dich vom Ritter besiegen. Nach 3 s stehst du in der **Vorkammer** (Checkpoint). Der Ritter kniet wieder mit **vollen LP**, das Fallgitter ist **offen**, die Helfer sind weg, der Balken ist verschwunden. Console: `Boss '…' reset.`

### 7.9 Speichern und Laden

- [ ] Löse Rätsel 1, drücke **F5**, dann **F9** → das Tor bleibt offen, die Platten bleiben unten.
- [ ] Drehe zwei Spiegel, **F5**, **F9** → die Spiegel stehen wie vorher.
- [ ] Besiege den Ritter, hebe das Klingenfragment auf, **F5**, **Play** beenden, **Play** wieder starten, **F9** → der Ritter ist **nicht mehr da** (besiegt bleibt besiegt), das Fragment liegt nicht noch einmal da, beide Gitter sind offen.
- [ ] Neues Spiel (Play neu starten ohne F9) → alles ist wieder im Anfangszustand.

### 7.10 Ausgänge

- [ ] Ganz hinten im Vorraum (Treppe nach oben, Tageslicht) und hinter dem Fluchtweg nach dem Boss steht je ein **Ausgang** „[E] Gruft verlassen“.
- [ ] **Solange das Dorf Eichental noch nicht eingebaut ist**, passiert beim Drücken nichts, und die Console meldet: `Portal 'obj.eichental.gruft_ausgang_eingang': the scene 'Assets/_Project/Scenes/World/Eichental.unity' is not in the scene list …`. Das ist richtig so. Nach der Integration (Abschnitt 11.2) erscheint der Ladebildschirm „Eichental“ und du stehst vor dem Gruft-Eingang.

---

## 8. Was du zurückmelden sollst

1. Läuft **Aetherfall > Gruft erstellen** ohne rote Fehler durch? Welche Hinweise standen im Fertig-Fenster?
2. Ist die Gruft **zu dunkel**, **zu hell** oder passend? Erkennst du Türen, Spiegel und Platten gut?
3. **Rätsel 1:** Hast du die Reihenfolge aus der Inschrift verstanden? War die Pfeilfalle fair?
4. **Rätsel 2:** War klar, wie die Spiegel drehen und wohin der Strahl geht?
5. **Skelette:** zu stark, zu schwach, passend? Ist der Turmschild-Elite verständlich?
6. **Boss:** Erkennst du den Schildstoß rechtzeitig? Hat das Parieren funktioniert? Hast du den Spiegel-Strahl gefunden und genutzt? Wie lange hat der Kampf gedauert?
7. **Speichern/Laden:** Ist nach dem Laden alles so, wie es war?
8. Screenshot der Console, falls rote Fehler auftauchen.

---

## 9. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Fertig-Fenster: „Spielfigur-, Kampf-, Item- oder Gegnerdaten fehlen“ | Testgelände-Daten fehlen | Zuerst **Aetherfall > Testgelände erstellen**, dann die Gruft neu bauen |
| „Layout-Datei … ist fehlerhaft: … Zeile X, Spalte Y“ | Tippfehler in `gruft_layout.json` (z. B. fehlendes Komma) | Die genannte Stelle in der Datei korrigieren, dann neu bauen |
| „Das Layout hat N Fehler – Szene nicht erstellt.“ | Der Validator hat Fehler gefunden | Die Zeilen „Layout-Fehler: …“ in der Console nennen ID und Grund |
| Kein Boss-Lebensbalken | **BossInstaller** fehlt in der BootConfig | Gruft neu bauen (trägt ihn ein) oder in der BootConfig unter „Installers“ prüfen |
| Rätsel und Boss sind nach dem Laden zurückgesetzt | **WorldSaveInstaller** fehlt (Paket Newtonsoft fehlt?) | Hinweis im Fertig-Fenster lesen; Projekt-Setup (Anleitung 01) erneut ausführen |
| Skelette erscheinen nicht | Rätsel 1 noch nicht gelöst (gewollt) | Grabplatten Eiche → Krone → Schild drücken |
| Hinweis „[E] …“ erscheint nicht | Zu weit weg oder falsche Blickrichtung | Direkt davor stellen (bis 2 m) und hinschauen |
| Ausgang tut nichts | Dorf Eichental noch nicht eingebaut | Erwartet, siehe 7.10 |
| Bild ruckelt in der großen Halle | 28 Punktlichter mit Schatten | Bitte melden (Grafikkarte, Bildrate); später Lichter backen |

---

## 10. Dateien und wohin sie gehören

Alle Dateien sind **neu**. Bestehende Dateien wurden **nicht** geändert.

| Datei / Ordner | Ordner im Projekt | Inhalt | Kommt an ein GameObject? |
|---|---|---|---|
| `gruft_layout.json` | `Assets/_Project/Data/Regions/Eichental/` | Die Gruft als Daten (eine Quelle für Unity und Blender) | nein |
| `PuzzleEvents.cs`, `BossEncounterEvents.cs`, `WorldObjectEvents.cs` | `Assets/_Project/Scripts/Events/` | neue Events | nein |
| 42 Dateien `Dungeon*.cs`, `ArrivalAnchor.cs`, `CheckpointZone.cs`, `WorldTravelService.cs` … | `Assets/_Project/Scripts/World/Dungeons/` (Assembly `Aetherfall.World`) | Layout lesen und prüfen, Geometrie, Ausgang, Ankunftspunkt, Checkpoint | `DungeonPortal` an den Ausgängen, `ArrivalAnchor` am Start, `CheckpointZone` in der Vorkammer |
| 37 Dateien (`SequencePuzzle*.cs`, `MirrorPuzzle*.cs`, `PuzzleSwitch.cs`, `RotatableMirror.cs`, `WorldDoor.cs`, `PressurePlate.cs`, `StateInteractable.cs`, `ReadableObject.cs`, `WorldObjectState*.cs` …) | `Assets/_Project/Scripts/World/Puzzles/` (Assembly `Aetherfall.World`) | Rätsel-Logik und -Bausteine, Weltobjekt-Zustände | ja, setzt der Generator: Grabplatten, Spiegel, Türen, Hebel, Käfig, Inschriften, Rätsel-Steuerung |
| `Aetherfall.World.Gameplay.asmdef` + 11 Dateien | `Assets/_Project/Scripts/World/Gameplay/` | Speichern der Weltobjekte, Boss-Speichersperre, Pfeilfalle, Bedingungen/Aktionen | `ArrowTrap` an den Fallen, `ConditionGate` am Siegelstein, `StateActions` an Belohnungen |
| `EnemyShieldGuard.cs`, `ShieldGuardRules.cs` | `Assets/_Project/Scripts/AI/` | Turmschild des Elite-Skeletts | `EnemyShieldGuard` am Elite-Skelett |
| 16 Dateien `Boss*.cs`, `IBossBarService.cs` | `Assets/_Project/Scripts/AI/Bosses/` | Boss-Logik, -Daten, -Balken | `BossController` am Ritter, `BossBarOverlay` am Objekt „Boss-Lebensbalken (Platzhalter)“ |
| 13 Dateien `Gruft*.cs` | `Assets/_Project/Scripts/Editor/World/` | Menü „Gruft erstellen“ und Bauteile | nein (Editor) |
| `Aetherfall.Tests.EditMode.Gruft.asmdef` + Tests, `Persistence/` mit `…GruftSave.asmdef` | `Assets/_Project/Tests/EditModeGruft/` | 77 Tests | nein |
| `gruft_preview.py` | `Tools/Preview/` | Blender-Vorschau | nein |
| `12_Test_Gruft.md` | `docs/Anleitungen/` | diese Anleitung | nein |

Vom Generator erzeugt (nicht im Repo, entsteht beim Klick): Szene `Assets/_Project/Scenes/Dungeons/Gruft.unity`, Materialien `Assets/_Project/Art/Materials/Gruft/`, Gegner-, Boss-, Angriffs- und Beutedaten, zwei Questgegenstände, drei Installer.

---

## 11. Integration

Diese Arbeit entstand **parallel** zum Dorf Eichental in einer eigenen Arbeitskopie. Damit nichts kollidiert, wurden **keine bestehenden Dateien geändert**. Folgende Einbauten fehlen noch. Claude erledigt sie beim Zusammenführen; die Liste ist die Arbeitsanweisung dafür.

### 11.1 BootConfig (Installer)

Erledigt der Generator automatisch (Abschnitt 4). Reihenfolge, die er herstellt:

| Installer | nach | Registriert |
|---|---|---|
| `WorldObjectsInstaller` | `EventBusInstaller` | `IWorldObjectStateStore` (`WorldObjectStateService`) |
| `BossInstaller` | `AIInstaller` | `IBossBarService` |
| `WorldSaveInstaller` | `WorldObjectsInstaller`, `SaveInstaller` | Speicher-Sektion `worldobjects` (Ladereihenfolge 85), `IWorldAutosave`, Boss-Speichersperre |

`IWorldTravelService` (Ankunftsanker) registriert der `WorldObjectsInstaller` mit. Soll das Dorf-Menü die BootConfig ebenfalls vollständig herstellen, ruft es `GruftInstallers.EnsureAll(report)` auf.

### 11.2 Eingang im Dorf Eichental

Im Eichental-Layout steht der Eingang als Objekt `obj.eichental.gruft_eingang` (Position x 2, z 157, Blick nach Süden). Dazu kommt beim Bau der Dorfszene:

1. **Portal** am Eingang: Komponente `DungeonPortal` (Ordner `World/Dungeons`) mit Trigger-Collider auf dem Layer Interactable. Felder: `objectId` = `obj.eichental.gruft_eingang`, `prompt` = „Gruft betreten“, `targetSceneKey` = `Assets/_Project/Scenes/Dungeons/Gruft.unity`, `targetTitle` = „Die vergessene Gruft“, `targetAnchorId` = `anchor.gruft.eingang`.
2. **Ankunftspunkt** vor dem Eingang: leeres GameObject mit `ArrivalAnchor`, `anchorId` = `anchor.eichental.gruft_eingang`, ca. 3–4 m südlich vor dem Eingang (z. B. x 2, z 153), Blick nach Süden (Y-Rotation 180). Beide Gruft-Ausgänge führen dorthin. Das Feld `player` zeigt auf die Spielfigur der Dorfszene, `spawnPoint` auf deren `PlayerSpawnPoint`.
3. **Szenenliste:** Die Dorfszene muss in **File > Build Profiles > Scene List** stehen (das Dorf-Menü erledigt das), die Gruft hängt ihr Menü selbst an.
4. Die Ausgänge der Gruft stehen in `gruft_layout.json` unter `exits` (Zielszene `Assets/_Project/Scenes/World/Eichental.unity`). Ändert sich der Pfad der Dorfszene, dort anpassen und die Gruft neu bauen.

### 11.3 Boss-Lebensbalken im HUD

Bis zur Anbindung zeigt der Platzhalter `BossBarOverlay` (IMGUI) den Balken unten im Bild. Für den echten HUD-Balken (GDD 05, 1.2):

1. `HudView`/HUD-Presenter in `Aetherfall.UI.Screens` holt in `Start` einmal `IBossBarService` aus dem Service-Locator (Ergebnis cachen) und abonniert `Changed` in `OnEnable`, abmelden in `OnDisable`.
2. Bei `BossBarState.Visible` zeigt das HUD den breiten Balken mit `DisplayName`, `Title`, `HealthFraction` (verzögerter Verlustbalken wie beim Zielbalken) und Phasenmarken (`Phase`/`PhaseCount`); ohne sichtbaren Boss den normalen Lock-On-Zielbalken.
3. Danach im Generator die Zeile mit `BossBarOverlay` (`GruftEnemyBuilder`) entfernen.

Alternativ ohne Service: Die Events `BossEncounterStarted`, `BossPhaseChanged` und `BossEncounterEnded` reichen für Ein-/Ausblenden und Musik; die LP liefert dann der Lock-On-Zielbalken.

### 11.4 Quest „Die vergessene Gruft“ (Baustein 8)

Die Quest-Daten entstehen im Baustein 8. Was die Gruft dafür schon liefert:

| Stage (GDD 02, 11.7) | Ziel in den Quest-Daten | Quelle in der Gruft |
|---|---|---|
| s10 `GeheZu(loc.eichental.vergessene_gruft)` | „Gehe zu“ | Zone `zone.gruft.vorraum` (`AreaEntered`) |
| s20 `Rätsel(puzzle.eichental.gruft_grabplatten)` | „Bedingung erfüllt“ mit **Welt/Rätsel gelöst** | `PuzzleSolved` / Zustand gespeichert |
| s20 o2 `Untersuche(clue.eichental.gruft_wandrelief_*, 3)` | „Untersuche Hinweise“ | Reliefs melden beim Lesen `ClueInspected` mit den Hinweis-IDs `clue.eichental.gruft_wandrelief_1…3` (aus dem Layout) |
| s30 `GeheZu(loc.eichental.gruft_siegelkammer_vorraum)` | „Gehe zu“ | Zone `zone.gruft.siegelkammer_vorraum` |
| s30 o2 `Interagiere(obj.eichental.gruft_kaefig)` | „Interagiere“ | Käfig (`Interacted`, Verb use) |
| s30 Start `Gegner+(spawn.eichental.gruft_hallen)` | – | Die Skelette erscheinen schon beim Lösen von Rätsel 1 (gleicher Zeitpunkt) |
| s40 `Rätsel(puzzle.eichental.gruft_spiegel)` | „Bedingung erfüllt“ mit **Welt/Rätsel gelöst** | `PuzzleSolved` |
| s50 `TöteBestimmten(boss.eichental.wachender_ritter)` | „Töte bestimmten Gegner“ | `BossDefeated` |
| s50 Abschluss: Loot Klingenfragment | – | Belohnungsobjekt in der Arena (gibt das Item beim Aufheben) |
| s60 a `Interagiere(obj.eichental.gruft_siegelstein)` / b `GeheZu(loc.eichental.gruft_ausgang)` | „Wähle“ | Siegelstein (`Interacted`, Verb pickup) bzw. Zonen `zone.gruft.ausgang_*` |
| s70_genommen `SetzeFlag(flag.eichental.gruft_untote_nachts, true)` | Aktion in den Quest-Daten | – |

Der Siegelstein ist gesperrt, sobald die Quest Stage `s70_belassen` erreicht (Bedingung am Objekt „Bedingung Siegelstein“). „Tür(id, auf)“ aus Quest-Aktionen geht mit der neuen Aktion **Welt/Weltobjekt-Zustand setzen** (`SetWorldObjectState`, Zustand 1 = offen).

### 11.5 Assemblies

- Die Rätsel und Dungeon-Klassen liegen in **`Aetherfall.World`** (Nr. 20). Die bestehende `Aetherfall.World.asmdef` referenziert hier nur Core und Events; der neue Code braucht nichts weiter.
- Speichern, Pfeilfalle und Bedingungen brauchen SaveSystem, Conditions, Stats und Combat. Weil die World-asmdef nicht geändert werden durfte, liegen sie in einer **Unter-Assembly `Aetherfall.World.Gameplay`** (Ordner `World/Gameplay`, Referenzen nur auf Nummern ≤ 20, abgesichert mit `defineConstraints` für Newtonsoft). **Beim Zusammenführen:** `Aetherfall.World.asmdef` um `Aetherfall.Utilities`, `Aetherfall.Data`, `Aetherfall.Conditions`, `Aetherfall.SaveSystem`, `Aetherfall.Stats`, `Aetherfall.Combat` ergänzen (alle in Tabelle 3.3 für World erlaubt), die Unter-asmdef löschen und den Namespace `Aetherfall.World.Gameplay` behalten oder nach `Aetherfall.World` verschieben. Achtung: Die Dorf-Arbeitskopie ändert die World-asmdef bereits (Utilities, Data, Conditions). Wird die Unter-Assembly aufgelöst, müssen die Typnamen in `GruftInstallers` (Konstanten `…Type`) und die Assembly-Namen in bereits gespeicherten `[SerializeReference]`-Daten mitgezogen werden (Architektur 3.3: Assembly-Namen sind ab dem ersten Content-Asset eingefroren). Einfacher: die Unter-Assembly behalten und in Tabelle 3.3 als „20b“ eintragen.
- `Aetherfall.EditorTools.World` referenziert `Aetherfall.World.Gameplay` nicht (asmdef durfte nicht geändert werden). Der Generator findet die Typen deshalb über ihren Namen (`GruftInstallers.FindType`). Nach dem Eintrag der Referenz kann das direkt typisiert werden.

### 11.6 Status-Liste

`docs/Status.md` wurde in dieser Arbeitskopie nicht geändert (wird parallel im Haupt-Branch gepflegt). Beim Zusammenführen unter „In Arbeit“ eintragen: „Mini-Slice, Baustein 7 – Die vergessene Gruft: Code fertig und geprüft (Layout-Datei, Validator, zwei Rätsel, Skelett-Krieger, Mini-Boss Der Wachende Ritter, Speichern, Generator, Blender-Vorschau), 1935 Tests grün im Harness (977 ohne Pakete). Wartet auf den Test in Unity (Anleitung 12).“

---

## 12. Für Claude: ohne Klicks (Batchmode)

Gruft bauen (Exit-Code 0 = Szene erstellt, 1 = Fehler; Protokoll im Log):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.GruftMenu.RunBatch -logFile Logs\gruft.log
```

Vorher muss das Testgelände einmal gebaut sein (`Aetherfall.EditorTools.World.TestGroundMenu.RunBatch`). Tests wie in der [CLAUDE.md](../../CLAUDE.md) (`-runTests -testPlatform EditMode`). Harness ohne Unity:

```
Tools/Harness/run_checks.sh --project <Projekt>
```

---

## 13. Hinweise, Abweichungen und offene Punkte

- **Name des Bosses:** In der CLAUDE.md heißt der Mini-Boss „Gruftwächter“. Das GDD (02, 11.7 und 01, 11.4) nennt ihn verbindlich **„Der Wachende Ritter“** (`boss.eichental.wachender_ritter`). Umgesetzt ist der GDD-Name.
- **Vorschlag: Vierter Spiegel erst ab Phase 2.** GDD 02 sagt, der vierte Spiegel steht im Kampfraum und betäubt den Ritter in Phase 2. Damit der Strahl nicht schon in Phase 1 wirkt, bricht der Spalt in der Ostwand erst beim Phasenwechsel auf (der Ritter schlägt mit dem Schild auf den Boden).
- **Vorschlag: Hinweis ohne Begleiter.** GDD 02 lässt Maren nach 120 s einen Hinweis geben. Im Mini-Slice gibt es keinen Begleiter; stattdessen leuchten die Fairness-Hinweise (Inschrift bzw. Rußspuren) auf.
- **Vorschlag: Skelette erscheinen beim Lösen von Rätsel 1.** Stage s30 spawnt sie beim Start; das ist derselbe Moment (Ende s20). So funktioniert es auch ohne Quest-Daten.
- **Vorschlag: Helfer fallen mit dem Ritter.** Die zwei gerufenen Skelette zerfallen, wenn der Ritter stirbt (kein Aufräumkampf nach dem Boss).
- **Vorschlag: Untote fliehen nie** (Fluchtschwelle 0) und Skelette laufen langsamer als Wölfe.
- **Boss-Beute nach GDD 04, 5.7 (Mini-Boss):** garantiert das Boss-Unique (Klingenfragment, als Belohnungsobjekt in der Arena, damit es Speichern/Laden übersteht) und 1 Ausrüstungsteil mit Beutequalität 3 (mindestens Selten), dazu Gold und ein Verbrauchsgegenstand. **Offen:** der **2-%-Legendär-Sonderwurf** braucht eine Erweiterung des Loot-Systems (Sonderwurf je Bosstyp) und fehlt noch.
- **Truhen-Stufen:** Nebenkammer = „versteckt“ (GDD 02: Selten), Siegelkammer = „Eisen“ (GDD 02: Ungewöhnlich), passend zu GDD 04, 5.6.
- **Speichern der Weltobjekte:** Architektur 9.7 sieht `IPersistentObject` je Objekt vor. Umgesetzt ist ein zentraler Speicher mit einer Zahl je ID (`WorldObjectStateStore`, Sektion `worldobjects`). Das ist einfacher und reicht für Türen, Hebel, Rätsel, Spiegel und Bosse; Objekte mit mehr Zustand können später `IPersistentObject` nutzen.
- **Musik:** `mus.boss_gruft` wird nur im Log genannt; ein Audio-System gibt es noch nicht.
- **Schleichweg:** Die Kletterstelle ist im Platzhalter eine Kiste (1 m Stufe). Echtes Klettern kommt mit dem Bewegungs-Ausbau.
- **Startstufe:** Die Gruft nutzt dieselbe Test-Einstellung wie das Testgelände (neues Spiel auf Stufe 10). Für den Mini-Slice ist Stufe 6 empfohlen (Status, „Als Nächstes“ 7).
- **Licht:** 28 Echtzeit-Punktlichter. Auf schwachen Macs evtl. zu teuer; später Lichter backen (Lightmaps) oder Schatten nur für die Fackeln nahe der Kamera.
