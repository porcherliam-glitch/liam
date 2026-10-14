# Testanleitung: Bildschirmanzeige und Menüs (Oberfläche)

> Hauptmenü, Ladebildschirm, HUD, Meldungen, Pausemenü, Speichern und Laden über das Menü, Todesbildschirm, Gamepad-Bedienung · Stand: 2026-10-14 · Bezug: [Architektur 3.3, 4.4, 4.5, 4.9, 12](../Technik/01_Architektur.md) · [GDD 05, Abschnitte 1 und 5](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) · [Master-Prompt §24, §32.9](../00_Master-Prompt.md)

Das Spiel bekommt seine **erste echte Oberfläche**. Wenn du die Boot-Szene startest, erscheint jetzt ein **Hauptmenü** mit dem Titel „Chroniken von Aetherfall“. „Neues Spiel“ zeigt einen **Ladebildschirm** und lädt das Testgelände. Im Spiel siehst du ein **HUD**: Lebens-, Ausdauer- und Manabalken, oben einen Kompass, bei Lock-On den Namen und die Balken des Ziels, unten rechts Fähigkeiten und Schnellslots, unter der Bildmitte den Hinweis „E Aufheben: …“ und rechts **Meldungen** wie „Wolfsfell ×2“. **Esc** öffnet ein **Pausemenü** zum Schnellspeichern, Laden und Zurückkehren ins Hauptmenü. Stirbt die Figur, erscheint ein **Todesbildschirm** „Du bist gefallen“.

Alles ist vollständig mit **Tastatur, Maus oder Gamepad** bedienbar. Die Tastensymbole passen sich dem Gerät an (Tastatur, Xbox, PlayStation).

Die bisherigen Entwickler-Anzeigen (Overlays) gibt es weiter, sie sind aber zuerst **ausgeblendet**: **F3** blendet sie ein und aus.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 06](./06_Test_Items_Loot.md) sind erledigt (Testgelände mit Kampf, Wölfen und Truhen läuft).

**So soll es ungefähr aussehen:** Claude hat Vorschaubilder geschickt (`hauptmenue.png`, `hud.png`, `pausemenue.png`, `todesbildschirm.png` …). Das sind **Nachbauten im Browser** aus denselben Layout-, Farb- und Textdateien, **keine** Unity-Bilder. Du kannst sie selbst erzeugen, siehe [Tools/Preview/ui/README.md](../../Tools/Preview/ui/README.md). Schrift und kleine Abstände können in Unity leicht anders aussehen.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Oberfläche und Testgelände neu aufbauen](#3-oberfläche-und-testgelände-neu-aufbauen)
4. [Spielen über das Hauptmenü](#4-spielen-über-das-hauptmenü)
5. [Steuerung in den Menüs](#5-steuerung-in-den-menüs)
6. [Prüfliste](#6-prüfliste)
7. [Automatische Tests](#7-automatische-tests)
8. [Was du zurückmelden sollst](#8-was-du-zurückmelden-sollst)
9. [Häufige Fehler und Lösungen](#9-häufige-fehler-und-lösungen)
10. [Dateien und wohin sie gehören](#10-dateien-und-wohin-sie-gehören)
11. [Hinweise, Vorschläge und Abweichungen](#11-hinweise-vorschläge-und-abweichungen)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Oberflächen-Grundgerüst** (`Aetherfall.UI.Framework`, Nr. 30, neu) | Verwaltet die Bildschirme in einem Stapel: Der oberste Bildschirm hat den **Fokus**. Eigene Fokus-Steuerung für Gamepad und Tastatur (der erste Knopf hat den Fokus, sichtbarer weißgoldener Rahmen, A/Enter = Bestätigen, B/Esc = Zurück, LB/RB bzw. Q/E = Reiter, nach 0,4 s Halten schnelles Weiterblättern), **Halten zum Bestätigen** (1,0 s) für Aktionen, die etwas verwerfen, **Tastensymbole** je Gerät, **Meldungs-Warteschlange** nach GDD 05, 1.7 (3 Klassen, Höchstzahl, Dauer, Zusammenfassen „Wolfsfell ×3“), **UI-Größe** 80–150 %, alle Farben als benannte Farb-Tokens (Seltenheitsfarben exakt nach GDD 05, 1.10), alle Texte in **einer** Tabelle (`UiTexts.cs`, später Übersetzungstabelle). |
| **Bildschirme** (`Aetherfall.UI.Screens`, Nr. 31, neu) | Hauptmenü, Pausemenü mit den Reitern System, Laden und Optionen, Todesbildschirm, Ladebildschirm, HUD, Meldungen und Speicher-Anzeige. Dazu der **Spielablauf** (Neues Spiel, Fortsetzen, Laden, Schnellspeichern, Hauptmenü, Wiederbeleben, Beenden). Alle Wechsel des Spielzustands halten sich an die Tabelle in Architektur 4.4. |
| **Szenen-Lader** (`Aetherfall.Core`, neu) | Lädt das Testgelände **zusätzlich** zur Boot-Szene und entlädt es wieder („Hauptmenü“), mit Ladebildschirm und den Ereignissen `SceneLoadStarted`/`SceneLoadCompleted` (Architektur 4.5, vorerst ohne Addressables). |
| **Layouts und Aussehen** (`Assets/_Project/Art/UI/`) | 10 Layout-Dateien (UXML), 6 Stil-Dateien (USS) und das Theme `AetherfallTheme.tss`. Das sind Textdateien; Unity liest sie wie Bilder oder Modelle ein. |
| **Editor-Menü** | **Aetherfall > Oberfläche einrichten** legt alles an, was die Oberfläche braucht (Installer, Panel Settings, Objekt „UI“ in der Boot-Szene, Szenenliste). **Aetherfall > Testgelände erstellen** erledigt das jetzt automatisch mit. |
| **Spielfigur** | Statt nach 3 s automatisch wiederzuerscheinen, wartet die Figur nach dem Tod auf deine Wahl im Todesbildschirm. Solange sie tot ist, ist Speichern gesperrt. Neue Komponente **Player Hud Link** verbindet die Figur mit HUD und Todesbildschirm. |
| **Entwickler-Overlays** | starten ausgeblendet, **F3** blendet alle ein und aus. Das Spieler-Overlay hat neue Knöpfe **Tödlich**, **Meldung: +50 EP** und **Meldung: Level-Up** zum Testen. |
| **Vorschau-Werkzeug** (`Tools/Preview/ui/`) | baut die Bildschirme ohne Unity im Browser nach und macht Bilder davon. |
| **Tests** | 203 neue automatische Testfälle (Fokus und Navigation, Halten zum Bestätigen, Meldungs-Regeln, Tastensymbole, Texte, Farb-Tokens, Prüfung der Layout- und Stil-Dateien, Szenen-Lader, Spielablauf, Bildschirm-Wechsel je Spielzustand). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert und liest die neuen Dateien ein). Das dauert diesmal etwas länger (rund 160 neue oder geänderte Dateien).
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu. UI Toolkit ist fest in Unity eingebaut.

---

## 3. Oberfläche und Testgelände neu aufbauen

1. Läuft das Spiel noch: oben auf **Play** klicken, um den Play-Modus zu beenden.
2. Menü **Aetherfall > Testgelände erstellen** klicken.
   **Du siehst danach:** das Fenster **Testgelände erstellen**. In der Liste steht neu: „Oberfläche: SceneLoaderInstaller und UIInstaller in der BootConfig, Assets/_Project/Settings/UI/AetherfallPanelSettings.asset, Objekt „UI“ in der Boot-Szene (Hauptmenü, HUD, Pausemenü, Todesbildschirm, Ladebildschirm, Menükamera), Szenenliste Boot + Testgelände“.
3. **Neu aufbauen** klicken. Fragt Unity vorher **Scene(s) Have Been Modified**: **Don't Save**.
   **Du siehst danach:** „Fertig! Die Szene „Testgelaende“ ist geöffnet. … Mit Hauptmenü startest du über die Boot-Szene …“. **OK** klicken. Steht darunter „Hinweise (…)“, bitte den Text abschreiben bzw. fotografieren und an Claude schicken.

> Das Menü öffnet dabei kurz die Boot-Szene, ergänzt dort das Objekt „UI“ und speichert sie. Danach baut es das Testgelände wie gewohnt neu.
>
> Steht in den Hinweisen „Theme … fehlt oder ist noch nicht importiert“: Unity hat die neuen Dateien noch nicht ganz eingelesen. Einmal ins Unity-Fenster klicken, warten, bis der drehende Kreis unten rechts weg ist, dann **Aetherfall > Oberfläche einrichten** klicken (macht nur den Oberflächen-Teil) und **Einrichten** bestätigen.

**Was das Menü neu anlegt bzw. ändert:**

| Was | Wo | Hinweis |
|---|---|---|
| Installer | `Assets/_Project/Settings/Boot/SceneLoaderInstaller.asset`, `UIInstaller.asset` | in die BootConfig eingetragen |
| Panel Settings | `Assets/_Project/Settings/UI/AetherfallPanelSettings.asset` | Referenzgröße 1920 × 1080, wächst mit der Bildschirmhöhe mit, Theme `AetherfallTheme` |
| Objekt **UI** | Boot-Szene (`Assets/_Project/Scenes/Boot/Boot.unity`) | Komponente **UI Root**, darunter vier Objekte mit je einem **UI Document**: `HUD` (Sort Order 0), `Screens` (10), `Toasts` (30), `Loading` (40), und das Objekt `MenuCamera` mit einer **Camera** (füllt im Hauptmenü und beim Laden das Bild mit der dunklen Menüfarbe; im Spiel ist sie aus) |
| Szenenliste | **File > Build Profiles > Scene List** | 0: `Boot`, 1: `Testgelaende` (andere Einträge bleiben dahinter) |
| Spielfigur `Player` | Szene Testgelände | neue Komponente **Player Hud Link** |

**Prüfen 1 – BootConfig:** `Assets/_Project/Settings/Boot/BootConfig.asset` anklicken → im Inspector hat die Liste **Installers** jetzt **12 Einträge** in dieser Reihenfolge:

1. Log-Installer
2. EventBus-Installer
3. GameState-Installer
4. **SceneLoader-Installer** (neu)
5. Input-Installer
6. Content-Installer
7. Save-Installer
8. GameTime-Installer
9. Inventory-Installer
10. Combat-Installer
11. AI-Installer
12. **UI-Installer** (neu)

Steht die Reihenfolge anders: das Menü einfach noch einmal ausführen, es sortiert die Einträge selbst ein.

**Prüfen 2 – UIInstaller:** `Assets/_Project/Settings/Boot/UIInstaller.asset` anklicken → **Gameplay Scene Path** = `Assets/_Project/Scenes/Test/Testgelaende.unity`, **Gameplay Scene Title** = `Testgelände`, **Hold Duration** = 1.

**Prüfen 3 – Szenenliste:** **File > Build Profiles** → links **Scene List**: oben `Scenes/Boot/Boot` mit der Zahl **0**, darunter `Scenes/Test/Testgelaende` mit **1**, beide mit Haken.

---

## 4. Spielen über das Hauptmenü

Ab jetzt startest du das Spiel **über die Boot-Szene**. (Der direkte Start im Testgelände geht weiterhin, siehe [6.11](#611-direkter-start-im-testgelände).)

1. Im Project-Fenster `Assets/_Project/Scenes/Boot/Boot.unity` doppelklicken.
2. In der Console oben **Clear** klicken.
3. **Play** drücken und **einmal ins Game-Fenster klicken**.
   **Du siehst danach:** das **Hauptmenü** auf dunklem Grund: links groß „Chroniken von Aetherfall“, darunter „Mini-Slice · Testversion“ und fünf Knöpfe (Neues Spiel, Fortsetzen, Laden, Optionen, Beenden). „Neues Spiel“ hat einen **weißgoldenen Rahmen** (das ist der Fokus). Rechts ein türkiser Kreis mit einem leuchtenden Strich (Platzhalter-Bild). Unten links „Enter Auswählen“, unten rechts die Versionsnummer.
4. **Enter** drücken (oder „Neues Spiel“ anklicken).
   **Du siehst danach:** kurz den **Ladebildschirm** mit „Testgelände“, einem Tipp und einem goldenen Balken mit Prozentzahl (lädt das Testgelände schnell, ist er nur einen Moment zu sehen). Dann das Testgelände mit der Figur am Startpunkt und oben in der Mitte den **Kompass**.

**Erwartete Console-Zeilen** (Auszug, Zahlen und Reihenfolge können leicht abweichen):

| # | Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] Step 3/7: Installer order validated (12 installer(s)).` | 12 Installer, inklusive SceneLoader und UI |
| 2 | `[GameState] Boot -> MainMenu (Boot completed). …` | Hauptmenü-Zustand |
| 3 | `[Input] Pause button routing of the input service off (the UI pause menu handles Start/Esc).` | Esc gehört jetzt dem Pausemenü |
| 4 | `[UI] UIRoot: user interface ready (main menu, pause menu, death screen, HUD, messages, loading screen).` | Oberfläche aufgebaut |
| 5 | `[GameState] MainMenu -> Loading (New game). …` | nach „Neues Spiel“ |
| 6 | `[Streaming] Scene 'Assets/_Project/Scenes/Test/Testgelaende.unity' loaded in … s.` | Testgelände geladen |
| 7 | `[Streaming] World space is now 'Assets/_Project/Scenes/Test/Testgelaende.unity'.` | ist jetzt die aktive Szene |
| 8 | `[UI] PlayerHudLink: player connected to the HUD and the death screen.` | Figur ist mit dem HUD verbunden |
| 9 | `[GameState] Loading -> Playing (…). …` | Spiel läuft |

**Keine roten Fehler.** In der Hierarchy stehen jetzt **zwei** Szenen: `Boot` und `Testgelaende`.

---

## 5. Steuerung in den Menüs

| Aktion | Tastatur | Maus | Gamepad (Xbox · PlayStation) |
|---|---|---|---|
| Fokus bewegen | **Pfeiltasten** oder **W A S D** | Zeiger über einen Eintrag | linker Stick oder Steuerkreuz |
| Bestätigen | **Enter** oder **Leertaste** | Linksklick | **A** · **✕** |
| Zurück | **Esc** | Rechtsklick | **B** · **○** |
| Reiter wechseln (Pausemenü) | **Q** / **E** | Klick auf den Reiter | **LB** / **RB** · **L1** / **R1** |
| Wert ändern (Optionen) | **←** / **→** (oder A / D) | Klick = nächster Wert | Stick oder Steuerkreuz links/rechts |
| Halten zum Bestätigen | **Enter 1 s halten** | linke Maustaste 1 s halten | **A** · **✕** 1 s halten |
| Pausemenü öffnen | **Esc** | – | **Start** · **Options** |
| Pausemenü schließen | **Esc**, **Tab** oder „Fortsetzen“ | – | **B** · **○** oder **Start** · **Options** |

- Hältst du eine Richtung gedrückt, springt der Fokus nach **0,4 s** schnell weiter (12 Schritte pro Sekunde).
- Hältst du beim Öffnen oder Schließen eines Menüs noch eine Richtung gedrückt (z. B. **W** oder den Stick vom Laufen), bewegt sie den Fokus nicht. Erst nach einmal Loslassen reagiert sie wieder.
- Am Ende einer Liste springt der Fokus wieder an den Anfang (und umgekehrt).
- Knöpfe mit dem Zusatz „Gedrückt halten“ reagieren **nicht** auf kurzes Drücken. Beim Halten füllt sich am unteren Rand des Knopfs ein weißgoldener Balken; lässt du vorher los, leert er sich wieder.

**Im Spiel neu:** **M** (bzw. **Select**/**View** am Gamepad) **0,4 s halten** blendet alle HUD-Teile 5 Sekunden lang ein („Schnellansicht“).

---

## 6. Prüfliste

Hake ab, was stimmt. Notiere bei Abweichungen die Nummer des Abschnitts (z. B. „6.5, dritter Punkt“).

### 6.1 Hauptmenü

- [ ] Titel „Chroniken von Aetherfall“ in zwei Zeilen, darunter „Mini-Slice · Testversion“ und fünf Knöpfe. Der Fokus liegt auf **Neues Spiel**: Rahmen weißgold, der Knopf ist etwas größer und heller.
- [ ] **↓** bzw. **S** bewegt den Fokus nach unten. Von „Beenden“ springt er wieder zu „Neues Spiel“, mit **↑** von oben nach unten.
- [ ] Gibt es noch **keinen Spielstand**: „Fortsetzen“ ist ausgegraut, darunter steht „Kein Speicherstand vorhanden“, und der Fokus springt darüber hinweg.
- [ ] **Maus:** Der Zeiger über einem Knopf setzt den Fokus dorthin, ein Klick führt ihn aus.
- [ ] **Esc** im Hauptmenü bewirkt nichts.
- [ ] **Laden** öffnet rechts die Seite „Spielstand laden“ mit der Liste (oder „Noch keine Spielstände vorhanden.“). Unten erscheint zusätzlich „Esc Zurück“. **Esc** führt zurück, der Fokus steht wieder auf „Laden“.
- [ ] **Optionen** öffnet rechts drei Zeilen (UI-Größe, HUD-Anzeige, Tastensymbole) und einen Hinweis-Text, siehe [6.9](#69-optionen).
- [ ] Menüs öffnen und schließen **sofort** (eine kurze Einblendung von höchstens 0,15 s, nie Warten).

### 6.2 Neues Spiel und Ladebildschirm

- [ ] „Neues Spiel“ zeigt kurz den Ladebildschirm: dunkler Grund, links unten „Testgelände“, ein Tipp, ein goldener Balken mit „… %“.
- [ ] Danach steht die Figur am Startpunkt, das Spiel läuft, der Mauszeiger ist im Spiel wieder versteckt.
- [ ] Während des Ladens reagieren Tasten nicht (kein doppeltes Starten).

### 6.3 HUD

Das HUD steht auf **„Kontextabhängig“** (GDD 05, 1.2): Teile erscheinen nur, wenn sie gebraucht werden. **Bei vollen Lebenspunkten und außerhalb des Kampfes siehst du deshalb unten links zunächst keinen Balken** – das ist so gewollt.

- [ ] **Kompass** oben in der Mitte: N, NO, O … Drehst du die Kamera, wandern die Buchstaben. „N“ ist goldfarben. Schaust du genau nach Norden, steht „N“ unter dem kleinen Strich in der Mitte.
- [ ] **Shift** halten und laufen: unten links erscheint der grüne **Ausdauerbalken** und wird kürzer. 2 Sekunden nachdem er wieder voll ist, verschwindet er.
- [ ] Ausdauer auf 0: Unter den Balken blinkt rot **„Erschöpft“**, der Ausdauerbalken hat einen roten Rahmen.
- [ ] Schaden nehmen (Wolf oder **F3** → Spieler-Overlay → **10 Schaden**): Der rote **Lebensbalken** erscheint. Das verlorene Stück bleibt **hell** stehen und zieht nach etwa **0,6 s** nach (Verzögerungsbalken). Unter 30 % wird der Balken heller rot.
- [ ] **Im Kampf** (ein Wolf hat dich bemerkt): unten rechts erscheinen die **Fähigkeitenleiste** (4 leere Rauten mit „1“ bis „4“) und darunter die **Schnellslots** in Kreuzform. Oben steht „Kleiner Heiltrank“ mit der Zahl **3** und der Taste „5“, die anderen zeigen „–“ (6, 7, 8). Der blaue **Manabalken** erscheint neben der Ausdauer. 4 Sekunden nach dem Kampf verschwinden Leiste und Slots wieder.
- [ ] **Lock-On** auf einen Wolf (**mittlere Maustaste** oder **T**, am Gamepad **R3**): oben unter dem Kompass erscheint ein dunkles Feld mit dem Namen („Grauwolf“ bzw. „Aether-Wolf“), seinem roten Lebensbalken (auch mit hellem Verzögerungsstück) und darunter dem gelben **Haltung**-Balken. Ist die Haltung gebrochen, wird der Haltungsbalken weißgold. Lock-On lösen: das Feld verschwindet.
- [ ] **Interaktions-Hinweis:** Gehe zu einer Truhe oder zu Beute am Boden. Unter der Bildmitte erscheint ein Tastensymbol **E** und daneben z. B. „Öffnen: Holztruhe“ bzw. „Aufheben: …“. Gehst du weg, verschwindet er.
- [ ] **M** 0,4 s halten: alle HUD-Teile erscheinen für 5 Sekunden (auch bei vollen Werten).

### 6.4 Meldungen

- [ ] Beute aufheben (Wolf besiegen und darüberlaufen, oder Truhe öffnen): rechts in der Mitte erscheint z. B. „Wolfsfell“ mit grauem Rand links. Hebst du innerhalb von 3 s noch eins auf, wird daraus **„Wolfsfell ×2“** (keine zweite Zeile).
- [ ] Gold: „+6 Gold“ mit goldenem Rand; mehrere Funde kurz nacheinander werden zusammengezählt.
- [ ] Seltene Gegenstände haben die **Seltenheitsfarbe** am Rand: grau, grün, blau, lila, orange (zum Testen im Debug-Inventar, **Tab**, den Knopf **Testbeute (je Seltenheit)** drücken und die Teile aufheben).
- [ ] Höchstens **5** Beute-Meldungen gleichzeitig; weitere warten und rücken nach.
- [ ] **F5** (Schnellspeichern): rechts oben „Schnellspeicherung erstellt“ mit türkisem Rand, unten rechts dreht sich kurz eine türkise Raute mit „Speichert …“.
- [ ] **F3** → **Tab** (Debug-Inventar, der Mauszeiger erscheint) → im Spieler-Overlay rechts oben **Meldung: Level-Up** klicken → **Tab** (weiterspielen): oben in der Mitte erscheint groß **„Stufe 2 erreicht!“** (3 Sekunden). **Meldung: +50 EP** zeigt rechts „+50 EP“. Solange ein Menü offen ist, warten Meldungen, bis du weiterspielst.

### 6.5 Pausemenü

- [ ] **Esc** im Spiel: Das Spiel steht still (Wölfe frieren ein), das Bild wird abgedunkelt, in der Mitte erscheint das Fenster **„Pause“** mit den Reitern **System**, **Laden**, **Optionen** und links und rechts davon den Tasten **Q** und **E**. Der Fokus liegt auf **Fortsetzen**. Der Mauszeiger ist sichtbar.
- [ ] Rechts im Fenster steht „Letzter Spielstand“ mit Art und Datum (oder „Kein Speicherstand vorhanden“).
- [ ] Das HUD bleibt hinter dem Fenster abgedunkelt sichtbar.
- [ ] **Fortsetzen**, **Esc** oder **Tab**: das Spiel läuft weiter.
- [ ] **Q** / **E** wechselt die Reiter (nach „Optionen“ wieder „System“). **Esc** auf „Laden“ oder „Optionen“ führt zurück zu „System“.
- [ ] **Hauptmenü** und **Spiel beenden** zeigen rechts „Gedrückt halten“. Kurz Enter drücken: nichts passiert. **Enter halten:** am unteren Rand füllt sich in 1 Sekunde ein weißgoldener Balken; erst dann wird ausgeführt. Früher loslassen: der Balken leert sich, nichts passiert.
- [ ] **Laufen und pausieren:** **W** gedrückt halten (die Figur läuft) und dabei **Esc** drücken, **W** weiter halten: Der Fokus bleibt auf **Fortsetzen**, auch nach mehreren Sekunden. W loslassen, dann **↓**: Der Fokus geht zu „Schnellspeichern“. Am Gamepad dasselbe mit dem linken Stick und **Start**.
- [ ] **Maus über ausgegraute Einträge und Reiter:** Mauszeiger langsam über die Reiter **System**, **Laden**, **Optionen** und über einen ausgegrauten Eintrag (z. B. „Schnellspeichern“ im Kampf, siehe 6.6) bewegen und die linke Maustaste gedrückt halten: Es erscheint **kein heller Hintergrund**. Auf Einträgen erscheint nur der weißgoldene Fokus-Rahmen, die Schrift bleibt gut lesbar.
- [ ] Console beim Öffnen und Schließen: `[GameState] Playing -> Paused (Pause menu). …` und `[GameState] Paused -> Playing (…). …`

### 6.6 Speichern und Laden über das Menü

- [ ] Pausemenü → **Schnellspeichern**: rechts erscheint grün **„Gespeichert: Schnellspeicherung“**, „Letzter Spielstand“ zeigt jetzt die neue Uhrzeit. Nach dem Weiterspielen erscheint rechts oben „Schnellspeicherung erstellt“.
- [ ] **Im Kampf** (ein Wolf greift an) Esc drücken: „Schnellspeichern“ ist ausgegraut, rechts steht rot „Speichern nicht möglich: Speichern im Kampf nicht möglich“.
- [ ] Ein Stück weglaufen, dann Pausemenü → Reiter **Laden**: eine Liste mit höchstens 5 Spielständen, der neueste oben. Jede Zeile zeigt die Art (z. B. „Schnellspeicherung“), Datum und Uhrzeit und rechts „Spielzeit 0:12 h“.
- [ ] Auf einem Eintrag **Enter 1 s halten**: kurz der Ladebildschirm, danach steht die Figur wieder dort, wo gespeichert wurde. Rechts oben „Spielstand geladen“.
- [ ] Zurück ins Hauptmenü (siehe [6.10](#610-zurück-ins-hauptmenü-und-beenden)): **Fortsetzen** ist jetzt aktiv und zeigt darunter z. B. „Schnellspeicherung · 14.10.2026, 21:14“. Enter: Ladebildschirm, das Testgelände lädt, die Figur steht an der **gespeicherten** Stelle (nicht am Startpunkt).
- [ ] Hauptmenü → **Laden** → Eintrag mit Enter wählen (hier ohne Halten, es geht kein Fortschritt verloren): wie „Fortsetzen“.
- [ ] Ein **beschädigter** Spielstand (falls einer da ist) steht rot mit „– beschädigt“ in der Liste und lässt sich nicht wählen.

### 6.7 Tod und Wiedereinstieg

- [ ] Figur sterben lassen: in der Arena nicht blocken und die Wölfe beißen lassen, oder schneller: **F3** → **Tab** (Debug-Inventar, der Mauszeiger erscheint) → im Spieler-Overlay rechts oben **Tödlich** klicken. Das Debug-Inventar schließt sich dann von selbst.
- [ ] Etwa **1,5 Sekunden** nach dem Tod erscheint der **Todesbildschirm**: dunkelroter Grund, groß „Du bist gefallen“, eine rote Linie, „Dein Weg endet hier nicht.“ und zwei Knöpfe: **Letzten Stand laden** (darunter Art und Datum des neuesten Spielstands) und **Am Spawnpunkt wiederbeleben**. Das Spiel steht still. **Esc**/**B** bewirkt hier nichts.
- [ ] **Am Spawnpunkt wiederbeleben:** Die Figur steht am Startpunkt mit vollen Lebenspunkten, das Spiel läuft weiter.
- [ ] Noch einmal sterben → **Letzten Stand laden**: kurz der Ladebildschirm, danach steht die Figur an der gespeicherten Stelle mit den gespeicherten Lebenspunkten und kann sich bewegen.
- [ ] Gibt es **noch gar keinen** Spielstand (das ist nur so, bevor du zum ersten Mal gespeichert hast, also vor Abschnitt 6.6), ist „Letzten Stand laden“ ausgegraut, darunter „Kein Speicherstand vorhanden“. Gibt es schon einen, auch aus einer **früheren Sitzung**, ist der Knopf aktiv und lädt den **neuesten** Stand. „Neues Spiel“ löscht keine Spielstände.
- [ ] **Sterben beim Laufen:** **W** gedrückt halten, bis der Todesbildschirm erscheint, und weiter halten: Der Fokus bleibt auf **Letzten Stand laden** (bzw. auf „Am Spawnpunkt wiederbeleben“, wenn es noch keinen Spielstand gibt).
- [ ] Console beim Tod: `[Player] Player died (killer '…'), waiting for the death screen.`

### 6.8 Gamepad und Tastensymbole

- [ ] Gamepad anschließen und eine Taste drücken: **alle Tastensymbole wechseln** – bei Xbox „A Auswählen“, „B Zurück“, „LB“/„RB“; bei PlayStation „✕“, „○“, „L1“/„R1“ in runden Feldern. Im HUD: Hinweis „A“ bzw. „✕“, Fähigkeiten „RB+X …“ bzw. „R1+□ …“, Schnellslots ↑ → ↓ ←.
- [ ] Eine Taste der Tastatur drücken oder die Maus bewegen: die Symbole wechseln zurück („Enter“, „Esc“, „Q“/„E“, „E“, „1“–„4“, „5“–„8“).
- [ ] **Nur mit dem Gamepad** durchspielen: Hauptmenü → Neues Spiel (A) → **Start** (Pause) → **LB**/**RB** (Reiter) → **B** (zurück zu System) → **A** auf „Fortsetzen“. Pause → **A halten** auf „Hauptmenü“ → Hauptmenü. Stick und Steuerkreuz bewegen beide den Fokus.

### 6.9 Optionen

Die Werte gelten bis zum Ende des Play-Modus (Speichern der Einstellungen kommt mit dem Optionen-Schritt).

- [ ] **UI-Größe:** **←**/**→** ändert in 10er-Schritten zwischen 80 % und 150 %. Die ganze Oberfläche wird sofort kleiner bzw. größer. **Enter** schaltet weiter (nach 150 % wieder 80 %).
- [ ] **Große UI-Größe:** Die Oberfläche wächst nur so weit, dass sich nichts überlappt (GDD 05, 1.6). Auf einem Bildschirm im Format 16:9 (z. B. 1920 × 1080) ist das etwa **118 %**, auf einem Mac mit 16:10 etwa **106 %**. Stellst du mehr ein, zeigt die Option zwar „150 %“, die Oberfläche bleibt aber bei dieser Grenze. Prüfen bei **150 %**: Hauptmenü → **Laden** und **Optionen** öffnen und das Pausemenü mit allen drei Reitern ansehen. Nichts ragt aus dem Bild, die Fußzeile („Auswählen“, „Zurück“) überlappt keinen Knopf, alle Texte stehen vollständig in ihren Feldern.
- [ ] **HUD-Anzeige:** „Kontextabhängig“ (Standard), „Vollständig“ (alle Balken, Leisten und Slots immer sichtbar), „Minimal“ (Lebensbalken erst unter 30 %, Kompass aus).
- [ ] **Tastensymbole:** „Automatisch“, „Tastatur“, „Xbox“, „PlayStation“, „Nintendo“, „Generisch“. Ein fester Stil bleibt, egal welches Gerät du benutzt.

### 6.10 Zurück ins Hauptmenü und Beenden

- [ ] Pausemenü → **Hauptmenü** 1 s halten: Das Hauptmenü erscheint. In der Hierarchy steht nur noch die Szene `Boot` (das Testgelände wurde entladen). Console: `[GameState] Paused -> MainMenu (Main menu). …` und `[Streaming] Scene 'Assets/_Project/Scenes/Test/Testgelaende.unity' unloaded.`
- [ ] Danach **Neues Spiel**: Das Testgelände startet frisch (Wölfe wieder da, Truhen wieder zu).
- [ ] **Beenden** im Hauptmenü bzw. **Spiel beenden** (halten) im Pausemenü: Im Editor endet der Play-Modus (in einem fertigen Spiel schließt sich das Fenster).

### 6.11 Direkter Start im Testgelände

Für schnelle Tests geht der alte Weg weiter:

- [ ] `Testgelaende.unity` öffnen und **Play**: Das Spiel startet **ohne** Hauptmenü direkt im Testgelände, mit HUD. Console: `[GameState] Loading -> Playing (DevPlayStarter (test scene)). …`
- [ ] **Esc** öffnet auch hier das neue Pausemenü. **Hauptmenü** (halten) führt ins Hauptmenü, **Neues Spiel** lädt das Testgelände dann über den Ladebildschirm neu.

### 6.12 Entwickler-Anzeigen (F3)

- [ ] Beim Start sind die alten Anzeigen (Zustand links oben, Spieler-Overlay rechts oben, Kampf-Overlay links unten, Hinweistext unten) **ausgeblendet**.
- [ ] **F3** blendet alle gleichzeitig ein, noch einmal **F3** aus.
- [ ] Zum Klicken brauchst du den Mauszeiger: **Tab** (Debug-Inventar) oder **Esc** (Pausemenü). Bitte melde, ob die Overlay-Knöpfe auch bei offenem Pausemenü sichtbar und klickbar sind (das abgedunkelte Pausemenü liegt über dem ganzen Bild).
- [ ] Debug-Inventar (**Tab**) und Schadenszahlen funktionieren wie bisher.

> **Für die älteren Anleitungen 02 bis 06 gilt ab jetzt:** Die dort beschriebenen Overlays erscheinen erst nach **F3**, und **Esc** öffnet das neue Pausemenü statt nur anzuhalten. Wo dort „erst Esc, dann klicken“ steht, geht auch **Tab** (Debug-Inventar): Der Mauszeiger erscheint, ohne dass das Pausemenü das Bild abdunkelt.

---

## 7. Automatische Tests

1. **Window > General > Test Runner** öffnen, Reiter **EditMode**.
2. **Run All** klicken.
   **Du siehst danach:** alle Einträge mit grünem Haken. Neu sind die Gruppen **Aetherfall.Tests.EditMode.UI** (Grundgerüst: Fokus, Navigation, Halten zum Bestätigen, Meldungen, Tastensymbole, Texte, Farb-Tokens, Prüfung der UXML- und USS-Dateien) und **Aetherfall.Tests.EditMode.UIScreens** (Spielablauf und Bildschirm-Wechsel), dazu Tests für den Szenen-Lader in **Aetherfall.Tests.EditMode**.

Außerhalb von Unity hat Claude alle Tests mit dem Prüfwerkzeug laufen lassen: **1249 Tests grün**, ohne die Pakete Input System, Cinemachine und Newtonsoft **834 grün** (die Teile, die diese Pakete brauchen, werden dann wie vorgesehen übersprungen).

---

## 8. Was du zurückmelden sollst

1. **Rote Fehler** in der Console: den Text kopieren (Zeile anklicken, unten erscheint der ganze Text) und schicken.
2. Welche Punkte der Prüfliste **nicht** stimmen (Abschnittsnummer und was du stattdessen gesehen hast).
3. **Bildschirmfotos** (am Mac **Cmd+Shift+4**, dann Leertaste und ins Game-Fenster klicken; unter Windows **Win+Shift+S**) von: Hauptmenü, HUD im Kampf mit Lock-On, Pausemenü, Todesbildschirm. Claude vergleicht sie mit den Vorschaubildern.
4. **Gamepad:** Welches Gerät (Xbox, PlayStation, anderes)? Wechseln die Symbole? Ließ sich alles ohne Maus bedienen?
5. **Zeichen:** Werden alle Symbole angezeigt (✕ ○ □ ▲, ◄ ►, ↑ → ↓ ←, „…“) oder erscheinen leere Kästchen?
6. **Gefühl:** Sind die Texte auf deinem Bildschirm gut lesbar (welche UI-Größe passt dir)? Ist 1 Sekunde „Halten“ angenehm? Reagieren die Menüs ohne Verzögerung?
7. Steht in der Console eine gelbe Warnung mit „UI“ oder „UIRoot“, bitte mitschicken.

---

## 9. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Boot-Szene gestartet, aber kein Hauptmenü (nur dunkler Hintergrund, schwarz oder „Display 1 – No cameras rendering“) | Oberfläche nicht oder nicht vollständig eingerichtet | **Aetherfall > Oberfläche einrichten** → **Einrichten**. Danach BootConfig prüfen (12 Einträge, Abschnitt 3) und die Console auf rote Zeilen mit „UIRoot“ ansehen (nächste Zeilen) |
| Hauptmenü erscheint, aber im Game-Fenster steht zusätzlich „Display 1 – No cameras rendering“ (am Mac evtl. kurz flackernde Pixel beim Einblenden) | Boot-Szene ohne Objekt `MenuCamera` (Oberfläche vor diesem Update eingerichtet) | **Aetherfall > Oberfläche einrichten** ergänzt die Kamera unter „UI“ |
| Console: „UIRoot: the field 'Panel Settings' is empty“ oder „UIDocuments or UXML layouts are missing“ | Objekt „UI“ unvollständig | **Aetherfall > Oberfläche einrichten** erneut ausführen (füllt nur leere Felder) |
| Console: „UIRoot: no IUIManager is registered - the UIInstaller is missing in the BootConfig.“ | UI-Installer fehlt in der BootConfig | wie oben |
| Console: „UIRoot could not build the user interface. …“ mit einer Fehlermeldung darunter | unerwarteter Fehler beim Aufbau | den ganzen Text an Claude schicken |
| Menü erscheint, sieht aber ungestaltet aus (weiße Standard-Knöpfe, kleine Schrift) | Panel Settings ohne Theme | `Assets/_Project/Settings/UI/AetherfallPanelSettings.asset` anklicken → Feld **Theme Style Sheet** = `AetherfallTheme`; oder das Menü erneut ausführen |
| „Neues Spiel“: Console „Scene '…Testgelaende.unity' could not be loaded. Is it in the scene list …?“, das Hauptmenü zeigt „Laden fehlgeschlagen: Testgelände“ | Testgelände fehlt in der Szenenliste | **Aetherfall > Testgelände erstellen** (oder **Oberfläche einrichten**) erneut; Szenenliste prüfen (Abschnitt 3) |
| Tasten im Menü reagieren nicht | Game-Fenster hat keinen Fokus | einmal ins Game-Fenster klicken |
| Mausklicks im Menü bewirken nichts | (unerwartet) | prüfen, ob in einer Szene ein Objekt **EventSystem** liegt; Fehlermeldungen mitschicken |
| Nach dem Tod erscheint die Figur nach 3 s von selbst wieder, kein Todesbildschirm | Figur ohne **Player Hud Link** (Testgelände nicht neu aufgebaut) oder Oberfläche fehlt | Abschnitt 3 wiederholen |
| HUD fehlt, Kompass fehlt | Spiel direkt im Testgelände gestartet, aber Boot-Szene ohne „UI“ | **Aetherfall > Oberfläche einrichten** |
| Unten links kein Lebensbalken | Absicht: „Kontextabhängig“ zeigt ihn erst bei Schaden oder im Kampf | Optionen → HUD-Anzeige „Vollständig“, oder **M** halten |
| Die alten Overlays sind weg | Absicht: Entwickler-Anzeigen starten ausgeblendet | **F3** |
| Statt Symbolen erscheinen leere Kästchen | Die Standardschrift kennt das Zeichen nicht | Bildschirmfoto schicken; Bilder statt Textsymbolen folgen später |
| **F5** im Pausemenü speichert nicht | Absicht: F5 gehört zur Spielsteuerung | im Pausemenü **Schnellspeichern** wählen |

---

## 10. Dateien und wohin sie gehören

Alle Skripte liegen schon an der richtigen Stelle, du musst nichts verschieben. **An GameObjects** hängen nur **UI Root** (Objekt „UI“ in der Boot-Szene) und **Player Hud Link** (Spielfigur im Testgelände); beides erledigt das Menü. Alles andere sind reine C#-Klassen, Installer-Assets oder Textdateien.

### 10.1 Layouts und Aussehen `Assets/_Project/Art/UI/`

| Datei | Inhalt |
|---|---|
| `Layouts/MainMenu.uxml` | Hauptmenü mit Titel, Knöpfen, Seite für Laden/Optionen, Fußzeile mit Tastenhinweisen |
| `Layouts/PauseMenu.uxml` | Pausemenü mit Reitern System/Laden/Optionen, Infospalte, Fußzeile |
| `Layouts/DeathScreen.uxml` | Todesbildschirm |
| `Layouts/LoadPage.uxml`, `SaveSlotRow.uxml` | Spielstand-Liste und eine Zeile (Art, Datum, Spielzeit) |
| `Layouts/OptionsPage.uxml` | Optionen-Seite (UI-Größe, HUD-Anzeige, Tastensymbole) |
| `Layouts/Hud.uxml` | HUD: Kompass, Zielanzeige, Hinweis, Balken, Fähigkeiten, Schnellslots |
| `Layouts/Toasts.uxml`, `ToastEntry.uxml` | Meldungsbereiche P0/P1/P2, eine Meldung, Speicher-Anzeige |
| `Layouts/Loading.uxml` | Ladebildschirm |
| `Styles/Tokens.uss` | alle Farb-Tokens (Seltenheit, Fokus, Schaden, Aether, Questgeber, Attribute) und Schriftgrößen |
| `Styles/Base.uss` | Knöpfe mit Fokus-Rahmen und Halte-Balken, Tastensymbole, Fußzeilen, Listen, Öffnen/Schließen-Übergang |
| `Styles/Menus.uss`, `Hud.uss`, `Toasts.uss`, `Loading.uss` | Aussehen der einzelnen Bildschirme |
| `Theme/AetherfallTheme.tss` | Theme: bindet das Unity-Standard-Theme und die USS-Dateien ein (wird in den Panel Settings eingetragen) |

### 10.2 Szenen-Lader `Scripts/Core/` (Assembly `Aetherfall.Core`, Nr. 2)

| Datei | Inhalt |
|---|---|
| `Scenes/ISceneLoader.cs`, `SceneLoader.cs` | Szenen additiv laden, aktivieren, entladen, Weltwechsel mit Ladebildschirm (Architektur 4.5) |
| `Scenes/ISceneBackend.cs`, `ISceneLoadOperation.cs`, `UnitySceneBackend.cs`, `UnitySceneLoadOperation.cs` | Anbindung an Unitys `SceneManager` (austauschbar für Tests) |
| `Scenes/SceneHandle.cs`, `SceneKeys.cs`, `WorldSpaceRequest.cs` | Szenen-Schlüssel (Pfad oder `#Index`), Fortschritt, Anfrage |
| `Scenes/ILoadingScreen.cs` | Schnittstelle des Ladebildschirms (umgesetzt in UI.Screens) |
| `Scenes/SceneLoaderInstaller.cs` | Installer (Asset `Settings/Boot/SceneLoaderInstaller.asset`) |
| `Boot/PlayModeStart.cs` | merkt sich im Editor, ob direkt in einer Testszene gestartet wurde |
| `CoreEvents.cs`, `Boot/EditorBootstrap.cs`, `Boot/GameBootstrapper.cs` | geändert: Ereignisse `SceneLoadStarted`/`SceneLoadCompleted`, Start-Szene merken |

### 10.3 Oberflächen-Grundgerüst `Scripts/UI/Framework/` (Assembly `Aetherfall.UI.Framework`, Nr. 30)

| Datei | Inhalt |
|---|---|
| `IUIManager.cs`, `UIManager.cs`, `UIScreen.cs`, `ScreenStack.cs`, `UILayer.cs`, `IUiLayerHost.cs`, `BackOutcome.cs` | Bildschirm-Stapel mit Fokus, Ebenen (HUD 0, Screens 10, Toasts 30, Loading 40) |
| `UiNavigationController.cs`, `NavigationRepeater.cs`, `FocusGroup.cs`, `FocusLayout.cs`, `FocusMemory.cs`, `NavDirection.cs`, `UiInputFrame.cs`, `UiNavResult.cs`, `IUiCommandSource.cs`, `IUiScreenNode.cs` | eigene Fokus- und Navigationsschicht (A/B, Reiter, Auto-Wiederholung, Fokus-Gedächtnis) |
| `HoldToConfirm.cs`, `HoldStep.cs` | Halten zum Bestätigen (1,0 s, einstellbar 0,5–1,5 s) |
| `IGlyphService.cs`, `GlyphService.cs`, `GlyphCatalog.cs`, `GlyphNames.cs`, `UiGlyph.cs` | Tastensymbole je Gerät (Tastatur, Xbox, PlayStation, Nintendo, Generisch) |
| `Notification*.cs`, `ActiveNotification.cs` | Meldungs-Warteschlange nach GDD 05, 1.7 |
| `HudVisibilityRules.cs`, `HudContext.cs`, `HudMode.cs`, `DelayedBar.cs`, `CompassMath.cs` | Regeln für HUD-Sichtbarkeit, Verzögerungsbalken, Kompass |
| `UiTexts.cs`, `UiTextKeys.cs`, `UiTextEntry.cs` | **alle** deutschen Texte der Oberfläche an einer Stelle |
| `UiColorTokens.cs`, `UiScaleRules.cs`, `UiPreferences.cs`, `UiFlowRules.cs`, `SaveSlotText.cs` | Farb-Tokens, UI-Größe, Optionen, Zuordnung Spielzustand → Oberfläche, Spielstand-Texte |
| `UiElementUtility.cs` | Hilfen für UI Toolkit (Texte, Symbole, Übergänge, Fokus-Rahmen) |
| `Aetherfall.UI.Framework.asmdef`, `AssemblyInfo.cs` | Assembly-Definition |

### 10.4 Bildschirme `Scripts/UI/Screens/` (Assembly `Aetherfall.UI.Screens`, Nr. 31)

| Datei | Inhalt | An GameObject? |
|---|---|---|
| `UIRoot.cs` | baut in der Boot-Szene alle Bildschirme auf und verbindet sie mit den Ereignissen | **ja:** Objekt „UI“ in `Boot.unity` |
| `PlayerHudLink.cs` | Brücke von der Spielfigur zu HUD und Todesbildschirm | **ja:** `Player` im Testgelände |
| `UIInstaller.cs` | Installer (Asset `Settings/Boot/UIInstaller.asset`) | nein (Asset) |
| `MainMenuScreen.cs`, `PauseMenuScreen.cs`, `DeathScreen.cs`, `MenuScreen.cs`, `MenuItemList.cs`, `SaveSlotListView.cs`, `OptionsPageView.cs`, `IErrorDisplay.cs` | Menüs | nein |
| `HudView.cs`, `HudTargetInfo.cs`, `ToastView.cs`, `LoadingScreenView.cs`, `LoadingScreenProxy.cs` | HUD, Meldungen, Ladebildschirm | nein |
| `IGameFlow.cs`, `GameFlow.cs`, `UiStateDirector.cs` | Spielablauf und Bildschirm je Spielzustand | nein |
| `IPlayerHudSource.cs`, `IPlayerHudRegistry.cs`, `PlayerHudRegistry.cs`, `InputUiCommandSource.cs` | Anbindung von Figur und Eingabe | nein |
| `Aetherfall.UI.Screens.asmdef` | Assembly-Definition (wird ohne Input System bzw. Newtonsoft übersprungen) | – |

### 10.5 Weitere Änderungen

| Datei | Änderung |
|---|---|
| `Scripts/Events/UiEvents.cs`, `ProgressionEvents.cs` (neu) | Ereignisse `ScreenOpened`, `XpGained`, `LevelUp` |
| `Scripts/Input/IUiInput.cs`, `UiInput.cs`, `IInputService.cs`, `InputService.cs`, `InputInstaller.cs`, `PauseRouting.cs` | Menü-Navigation und Halten lesbar; die Oberfläche übernimmt Esc/Start |
| `Scripts/Player/PlayerRespawn.cs`, `PlayerCombatController.cs`, `PlayerSpawnPoint.cs`, `Scripts/Combat/Combatant.cs` | Todesbildschirm statt Auto-Wiederbeleben, Speichersperre „tot“, Laden belebt die Figur |
| `Scripts/SaveSystem/SaveReasonKeys.cs` | Grund „Speichern nach dem Tod nicht möglich“ |
| `Scripts/DevTools/DevOverlaySwitch.cs` (neu) und alle Overlays | F3 blendet die Entwickler-Anzeigen ein und aus; neue Test-Knöpfe |
| `Scripts/DevTools/DevPlayStarter.cs` | startet nur noch, wenn das Testgelände direkt im Editor gestartet wird |
| `Scripts/Editor/World/TestGroundUiBuilder.cs` (neu), `TestGroundMenu.cs`, `TestGroundSceneBuilder.cs` | Menü **Oberfläche einrichten**, Einbau ins Testgelände-Menü |
| `Scripts/Editor/Core/BootContentSetupStep.cs`, `SetupPaths.cs` | Szenenliste: Boot bleibt Index 0, weitere Szenen dürfen dahinter stehen |

### 10.6 Tests `Assets/_Project/Tests/`

| Ordner | Inhalt |
|---|---|
| `EditModeUI/` (Assembly `Aetherfall.Tests.EditMode.UI`, neu) | Fokus, Navigation, Halten, Bildschirm-Stapel, Meldungen, Tastensymbole, Texte, Werte-Regeln, Prüfung der UXML-/USS-Dateien |
| `EditModeUIScreens/` (Assembly `Aetherfall.Tests.EditMode.UIScreens`, neu) | Spielablauf (`GameFlowTests`) und Bildschirm-Wechsel (`UiStateDirectorTests`) mit Test-Attrappen |
| `EditMode/` | Szenen-Lader (`SceneLoaderTests`, `SceneKeysTests`), neue Ereignisse |

---

## 11. Hinweise, Vorschläge und Abweichungen

- **Todesbildschirm als Pause-Zustand:** Die Zustands-Tabelle (Architektur 4.4) kennt keinen Todeszustand. Der Todesbildschirm liegt deshalb als **Paused** über dem Spiel: Die Zeit steht, die Menü-Steuerung ist aktiv, und beide Wege sind erlaubte Übergänge (Paused → Loading zum Laden, Paused → Playing zum Wiederbeleben).
- **Bestätigungsdialog folgt später:** Architektur 4.9 sieht `ConfirmAsync` (Dialog mit Fokus auf „Abbrechen“) vor. Für die Aktionen dieses Schritts genügt **Halten zum Bestätigen** (GDD 05, 1.4). Der Dialog kommt mit dem ersten Bildschirm, der ihn braucht.
- **Eigene Fokus-Steuerung:** Die Knöpfe sind für UI Toolkit absichtlich „nicht fokussierbar“; die Navigation übernimmt die eigene Schicht (Architektur 12). So kann die eingebaute Navigation von UI Toolkit nicht dazwischenfunken.
- **Kamera für das Hauptmenü:** UI Toolkit braucht zum Zeichnen keine Kamera. Ohne jede Kamera meldet Unity im Game-Fenster aber „No cameras rendering“, und am Mac kann beim Einblenden kurz Bildmüll durchscheinen. Die Boot-Szene hat deshalb eine sehr einfache Kamera `MenuCamera`: Sie zeichnet nichts außer der dunklen Menüfarbe und ist nur beim Start, im Hauptmenü und beim Laden eingeschaltet. Im Spiel zeichnet die Kamera des Testgeländes.
- **UI-Größe mit Grenze:** Das Hauptmenü mit geöffneter Seite und das Pausemenü belegen bei 100 % etwa 1620 × 840 der 1920 × 1080 Bildpunkte. Größer darf die Oberfläche nur werden, solange das noch auf den Bildschirm passt: bei 16:9 höchstens etwa 118 %, bei 16:10 etwa 106 %. Auf alten 4:3-Bildschirmen wird sie sogar unter 100 % verkleinert. Eine Anordnung, die bei 150 % umbricht (z. B. Titel über den Knöpfen), kann später mit dem Optionen-Schritt kommen.
- **Hauptmenü in der Boot-Szene:** Architektur 4.5 nennt eine eigene MainMenu-Szene. Solange das Menü keine 3D-Inhalte hat, ist es ein Bildschirm der Boot-Szene; die Oberfläche bleibt so auch über Szenenwechsel erhalten.
- **Szenen per Pfad statt Addressables:** vorerst über die Szenenliste. Der Umstieg auf Addressables ändert nur den Szenen-Lader.
- **Ladebildschirm auch bei „Neues Spiel“:** GDD 05, 1.1 sieht Ladebildschirme nur für Dungeons und große Innenräume vor. Beim Start aus dem Hauptmenü wird aber die ganze Spielwelt geladen; dafür ist er nötig.
- **Zielanzeige oben:** Bei Lock-On zeigt der Platz „Boss-Lebensbalken“ (oben Mitte) das gewählte Ziel. Balken direkt über den Gegnern (Ebene „WorldMarkers“) folgen später.
- **Optionen noch ohne Speichern:** UI-Größe, HUD-Anzeige und Tastensymbole gelten bis zum Ende des Play-Modus. Das Speichern in `settings.json` kommt mit dem Optionen-Schritt.
- **Tastensymbole als Text:** Bilder (Sprites) folgen später. Die Tastatur-Symbole zeigen die Standardbelegung; nach dem Umbelegen (später) zeigen sie die neue Taste.
- **Erfahrung und Level:** Das Fortschrittssystem kommt in einem späteren Schritt. Bis dahin lassen sich „+50 EP“ und „Stufe 2 erreicht!“ nur über die Test-Knöpfe im Spieler-Overlay auslösen.
- **Schnellslots mit Namen statt Bildern:** Item-Symbole folgen mit dem Inventar-Bildschirm.
- **Schrift:** Unity-Standardschrift. Die Wahl einer eigenen Schrift ist eine offene Entscheidung (GDD 05, 1.6).
- **Vorschläge zur Gestaltung** (Farben, Größen, Anordnung) nimmt Claude gern entgegen. Fast alles steht in den USS-Dateien und lässt sich ohne Programmcode ändern.
