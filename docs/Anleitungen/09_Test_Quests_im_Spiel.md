# Testanleitung: Quests im Spiel, Questlog und Charakter

> Erfahrung und Stufen, Quest-Bedingungen für Inventar und Stufe, zwei Test-Quests im Testgelände (Anschlagtafel, Wölfe, Übungsplatz), Quest-Verfolgung im HUD, Meldungen, Questlog, Charakter-Seite · Stand: 2026-10-14 · Bezug: [Architektur 3.3, 4.3, 4.4, 7, 9, 11](../Technik/01_Architektur.md) · [GDD 02, Abschnitte 7 und 11](../GDD/02_Quests_und_Dialoge.md) · [GDD 03, Abschnitte 11.3 und 12](../GDD/03_Kampf_Charakter_Progression.md) · [GDD 05, Abschnitte 1.2, 1.3, 1.7](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) · Master-Prompt §16

In [Anleitung 08](./08_Test_Quests.md) hat das Spiel sein Quest-Gehirn bekommen, aber man konnte es noch nicht sehen. Jetzt ist es **im Spiel**:

- Im Testgelände steht eine **Anschlagtafel**. Sie glitzert gelb, solange sie eine Quest anbietet oder eine Quest abgegeben werden kann.
- **Quest 1 „Wolfsjagd im Testgelände“:** Aushang lesen → 3 Wölfe besiegen → ein Wolfsfell aufheben → an der Tafel melden → Belohnung (Erfahrung, Gold, 2 Heiltränke).
- **Quest 2 „Die Bewährungsprobe“** (erst nach Quest 1): zum Übungsplatz gehen → **entweder** eine Truhe öffnen **oder** die Trainingspuppe dreimal treffen. Je nach Wahl gibt es einen anderen Bonus und einen anderen Eintrag unter „Entscheidungen“.
- **Erfahrung und Stufen:** Jeder besiegte Gegner gibt Erfahrung (EP), Quests auch. Mit genug EP steigst du eine Stufe auf und bekommst **1 Attributpunkt** und **1 Skillpunkt**. Im Testgelände beginnt die Figur auf **Stufe 10** (wie in Anleitung 05 und 06); nach beiden Test-Quests erreicht sie **Stufe 11**.
- **Anzeige:** rechts oben die **verfolgten Quests** (bis zu 3) mit Zielen wie „Wölfe besiegen 1/3“; ein erledigtes Ziel wird mit einem grünen Haken **abgehakt**. Unten in der Mitte eine dünne **EP-Leiste**. Rechts erscheinen **Meldungen** („Neue Quest: …“, „Wölfe besiegen (2/3)“, „Quest abgeschlossen: …“, „Stufe 11 erreicht!“).
- **Questlog** (Taste **J** oder im Pausemenü **„Questlog & Charakter“**) mit 7 Kategorien, Details zu jeder Quest und den abgeschlossenen Quests samt Entscheidungen.
- **Charakter-Seite** (im selben Fenster, zweiter Reiter): Stufe, EP, freie Punkte, die sechs Attribute und abgeleitete Werte. Hier verteilst du Attributpunkte.

Alles ist vollständig mit dem **Gamepad** bedienbar.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 08](./08_Test_Quests.md) sind erledigt.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Testgelände neu erstellen](#3-testgelände-neu-erstellen)
4. [Automatische Tests](#4-automatische-tests)
5. [Tasten auf einen Blick](#5-tasten-auf-einen-blick)
6. [Quest 1: Wolfsjagd im Testgelände](#6-quest-1-wolfsjagd-im-testgelände)
7. [Quest 2: Die Bewährungsprobe (zwei Wege)](#7-quest-2-die-bewährungsprobe-zwei-wege)
8. [Charakter-Seite: Punkte verteilen](#8-charakter-seite-punkte-verteilen)
9. [Speichern und Laden mitten in einer Quest](#9-speichern-und-laden-mitten-in-einer-quest)
10. [Prüfliste](#10-prüfliste)
11. [Was du zurückmelden sollst](#11-was-du-zurückmelden-sollst)
12. [Häufige Fehler und Lösungen](#12-häufige-fehler-und-lösungen)
13. [Dateien und wohin sie gehören](#13-dateien-und-wohin-sie-gehören)
14. [Für Claude: ohne Klicks (Batchmode)](#14-für-claude-ohne-klicks-batchmode)
15. [Hinweise, Abweichungen und offene Punkte](#15-hinweise-abweichungen-und-offene-punkte)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Fortschritt** (`Aetherfall.Progression`, neu, Assembly Nr. 14) | EP-Kurve genau nach GDD 03, 12: EP für die nächste Stufe = 200 · Stufe · (1 + (Stufe/30)²), auf 10 gerundet; Stufe 1 bis 80 (insgesamt 2 851 020 EP). Ereignisse `XpGained` und `LevelUp`. Je Stufe 1 Attributpunkt und 1 Skillpunkt. Attributpunkte wirken als Stat-Modifikator (Quelle `progression:attributes`), höchstens bis 60. Punkte, die du im offenen Menü verteilt hast, kannst du zurücknehmen, bis du das Menü schließt. **EP für Gegner** nach GDD 03 (Grundwert 4 + 1,5 · Gegnerstufe, mal Variante – Elite ×3, Champion ×8, Mini-Boss ×15 … – mal Stufenabstand). **Quest-EP mit Überlevel-Abschwächung** (GDD 02, 8.4): Liegt deine Stufe mehr als 3 über der empfohlenen Stufe der Quest, gibt es 10 % weniger je Stufe, mindestens 25 %. Wird gespeichert (Abschnitt `progression`), die Stufe steht auch im Kopf des Spielstands. Einstellbar über **Create > Aetherfall > Fortschritt > XP-Kurve** (optional); im `ProgressionInstaller` das Feld **„Startstufe neues Spiel (nur Test)“** (im echten Spiel 1, im Testgelände 10). |
| **Bedingungen und Aktionen** (neu im Typ-Menü) | **Spieler/Level mindestens**, **Spieler/Erfahrung geben** (feste Zahl oder Anteil einer Stufe, z. B. „0,5 Stufen bei Stufe 2“), **Spieler/Skillpunkt geben**; **Inventar/Besitzt Item**, **Inventar/Währung mindestens**, **Inventar/Item geben**, **Inventar/Item entfernen**, **Inventar/Währung geben**, **Inventar/Währung entfernen**. |
| **Neue Ziel-Art** | **Ziele/Treffe Ziel** („Triff die Trainingspuppe dreimal“). |
| **Orts-Zonen** (`Aetherfall.World`, neu) | Komponente **Area Trigger**: unsichtbare Zone, die beim Betreten `AreaEntered` sendet (für „Gehe zu Ort“). Funktioniert auch nach Laden (F9) oder Wiederbeleben in der Zone: Danach zählt das nächste Betreten wieder. |
| **Anschlagtafel** (Komponente **Quest Board**) | Bietet Quests an („Aushang lesen: …“), nimmt sie zurück („Melden: …“), glitzert, solange es etwas zu tun gibt (GDD 02, 7.6: Gegenstände als Questgeber glitzern statt „!“). |
| **Testgelände** | Anschlagtafel nordwestlich vom Startpunkt, Zone „Übungsplatz“ (8 × 8 m) um die Trainingspuppe, Wölfe der Arena kommen nach 45 s zurück, zwei Test-Quests (für Stufe 10) und zwei Flags als Dateien (Assets), vier neue Installer in der BootConfig, **Startstufe 10** für ein neues Spiel (nur zum Testen), Quest-Prüfung läuft automatisch mit. |
| **Oberfläche** | Quest-Verfolgung im HUD mit Abhak-Animation, EP-Leiste, Quest-Meldungen (GDD 02, 7.5), Questlog, Charakter-Seite, neuer Eintrag im Pausemenü. |
| **Spielstart/Hauptmenü** | Beim Zurückkehren ins Hauptmenü räumen Quests und Bedingungen jetzt richtig auf; ein neues Spiel beginnt sauber. |
| **Tests** | rund 210 neue automatische Testfälle (insgesamt jetzt 1658, davon 908 auch ohne Pakete), u. a. die EP-Kurve bis Stufe 80, die Überlevel-Abschwächung, beide Test-Quests komplett durchgespielt (auch beide Wege der zweiten Quest, Stufe 11 und Speichern mitten in der Quest), Startstufe und Ausrüstung des Testgeländes, Orts-Zonen nach einem Teleport, Questlog, Meldungen, Charakter-Seite (abgerundete Werte), Taste J und Pausemenü-Eintrag. |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Das dauert etwas länger, es sind rund 100 neue Dateien.
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu.

---

## 3. Testgelände neu erstellen

Die Anschlagtafel, die Zone, die Quests und die neuen Installer entstehen über das Menü.

1. Falls das Spiel läuft: oben auf **Play** klicken, damit es stoppt.
2. Menü **Aetherfall > Testgelände erstellen**.
   **Du siehst danach:** das Fenster **Testgelände erstellen**. In der Liste steht neu: „Quests: Conditions-, WorldState-, Progression- und QuestInstaller in der BootConfig (Startstufe neues Spiel 10, nur zum Testen), 2 Test-Quests mit Flags (…), Anschlagtafel und Übungsplatz, Wölfe kehren nach 45 s zurück“ und bei den Layern zusätzlich „14 „TriggerVolume““.
3. **Neu aufbauen** klicken.
   **Du siehst danach:** „Fertig! Die Szene „Testgelaende“ ist geöffnet. …“. **OK** klicken. Steht darunter „Hinweise (…)“, bitte abschreiben bzw. fotografieren und an Claude schicken.
4. In der Console nach der Zeile **„Quests geprüft (wie „Aetherfall/Quests prüfen“): …“** suchen.
   **Du siehst danach:** „… 2 Quest(s), 0 Fehler, 0 Warnung(en).“ (Gibt es im Projekt schon eigene Quests, zählen sie mit.)

**Was neu angelegt wird:**

| Was | Wo |
|---|---|
| `Quest_side_test_wolfsjagd.asset`, `Quest_side_test_bewaehrungsprobe.asset` | `Assets/_Project/Data/Quests/Test/` |
| `Flag_test_wolfsjagd_erledigt.asset`, `Flag_test_bewaehrung_weg.asset` | `Assets/_Project/Data/WorldState/Test/` |
| `ConditionsInstaller`, `WorldStateInstaller`, `ProgressionInstaller`, `QuestInstaller` | `Assets/_Project/Settings/Boot/`, eingetragen in die BootConfig (jetzt 16 Einträge). Am `ProgressionInstaller` steht **„Startstufe neues Spiel (nur Test)“ auf 10**. |
| Objekt **Anschlagtafel** (mit **Quest Board**) und Objekt **Uebungsplatz** (mit **Area Trigger**) | Szene `Testgelaende` |
| Komponente **Player Progression** | an der Spielfigur (verbindet Stufe und Attributpunkte mit den Werten der Figur) |
| Neue Layouts für Questlog, Charakter-Seite und Quest-Verfolgung | eingetragen am Objekt **UI** der Boot-Szene |

> Vorhandene Quest-Dateien werden **nicht** überschrieben (du könntest sie im Inspector geändert haben). Willst du die neueste Fassung einer Test-Quest: die Datei im Project-Fenster löschen und das Menü noch einmal ausführen.

---

## 4. Automatische Tests

1. **Window > General > Test Runner**, Reiter **EditMode**, oben **Run All**.
   **Du siehst danach:** nach bis zu einer Minute grüne Haken. Neu ist die Gruppe **Aetherfall.Tests.EditMode.Progression**.
2. Darin **TestGroundQuestTests** aufklappen.
   **Du siehst danach:** u. a. `WolfHunt_FullPath`, `WolfHunt_WithoutFurAtTheBoard_GoesBackToCollecting`, `Trial_ChestBranch`, `Trial_DummyBranch` und `SaveInTheMiddle_ContinuesAfterLoading` – alle grün. Diese Tests spielen beide Test-Quests so durch, wie du es gleich von Hand machst. Daneben prüft **TestGroundLevelTests**, dass die Figur auf Stufe 10 beginnt (328 LP) und Startausrüstung, Truhen- und Wolfsbeute anlegen kann.
3. In **Aetherfall.Tests.EditMode.UIScreens** stehen die Tests für Questlog, Meldungen, Charakter-Seite und die Taste J (`QuestUiModelTests`, `QuestNotifierTests`, `CharacterSheetModelTests`, `JournalDirectorTests`).

Ist ein Test **rot**: anklicken, unten erscheint die Meldung. Text abschreiben oder Screenshot an Claude.

---

## 5. Tasten auf einen Blick

| Was | Tastatur und Maus | Xbox-Controller | PlayStation-Controller |
|---|---|---|---|
| Aushang lesen, Truhe öffnen, aufheben | **E** | **A** | **×** |
| Angreifen (z. B. Trainingspuppe) | **linke Maustaste** | **X** | **□** |
| Questlog öffnen | **J** | **Start** → „Questlog & Charakter“ | **Options** → „Questlog & Charakter“ |
| Reiter wechseln (Questlog ↔ Charakter) | **Q** / **E** | **LB** / **RB** | **L1** / **R1** |
| Kategorie wechseln (Haupt, Neben …) | **Z** / **C** (deutsche Tastatur: **Y** / **C**, siehe 15) | **LT** / **RT** | **L2** / **R2** |
| In der Liste bewegen | **W** / **S** oder Pfeiltasten | Steuerkreuz oder linker Stick | Steuerkreuz oder linker Stick |
| Quest verfolgen an/aus | **Enter** (oder Leertaste, oder Mausklick) | **A** | **×** |
| Quest als Fokus | **F** | **X** | **□** |
| Attributpunkt verteilen | **Enter** oder **→** / **D** | **A** oder Steuerkreuz **rechts** | **×** oder **rechts** |
| Punkt zurücknehmen | **F** oder **←** / **A** | **X** oder Steuerkreuz **links** | **□** oder **links** |
| Questlog schließen | **Esc** oder **J** | **B** oder **Start** | **○** oder **Options** |
| Alle HUD-Teile kurz einblenden | **M** 0,4 s halten | **View** halten | **Touchpad** halten |

---

## 6. Quest 1: Wolfsjagd im Testgelände

**Starten über das Hauptmenü** (so sind HUD, Meldungen und Questlog sicher da):

1. Im Project-Fenster `Assets/_Project/Scenes/Boot/Boot.unity` doppelklicken, oben **Play**, ins Game-Fenster klicken.
   **Du siehst danach:** das Hauptmenü „Chroniken von Aetherfall“.
2. **Neues Spiel** wählen.
   **Du siehst danach:** kurz den Ladebildschirm, dann das Testgelände mit der Spielfigur.

**Tipp:** Im Pausemenü (**Esc**) unter **Optionen > HUD-Anzeige** auf **„Vollständig“** stellen. Dann bleibt die Quest-Verfolgung rechts oben immer sichtbar. In der Standard-Einstellung „Kontextabhängig“ erscheint sie nur 8 Sekunden lang, wenn sich an einer Quest etwas ändert (so steht es in GDD 05, 1.2) – oder wenn du **M** hältst.

**Schritt für Schritt:**

1. Vom Startpunkt aus **links nach vorne** schauen (Nordwesten, etwa 6 m): Dort steht die **Anschlagtafel** – ein Holzbrett auf zwei Pfosten mit zwei hellen Zetteln und der Schrift „Anschlagtafel (E / A: lesen)“.
   **Du siehst danach:** über der Tafel drei **gelbe Kugeln** (das „Glitzern“).
2. Zur Tafel gehen, bis unten in der Bildmitte der Hinweis erscheint.
   **Du siehst danach:** „**E** Aushang lesen: Wolfsjagd im Testgelände“.
3. **E** drücken (Gamepad **A**).
   **Du siehst danach:**
   - rechts die Meldung „**Neue Quest: Wolfsjagd im Testgelände**“,
   - rechts oben die Quest-Verfolgung: eine Raute ◆, der Titel und darunter ☐ „Wölfe besiegen **0/3**“,
   - das gelbe Glitzern über der Tafel ist weg (gerade gibt es dort nichts zu tun).
4. **J** drücken.
   **Du siehst danach:** das **Questlog**, Kategorie **Neben** ist ausgewählt. Links die Quest mit dem Abzeichen „**Fokus**“, rechts Beschreibung, „Aktueller Stand“ und das Ziel „Wölfe besiegen 0/3“. **Esc** schließt es wieder.
5. Zur **Kampfarena** gehen: südwestlich vom Startpunkt, hinter der Trainingspuppe, zwischen den großen Felsen. Dort sind 2 graue Wölfe und 1 Aether-Wolf (türkis).
6. Einen **grauen Wolf** besiegen.
   **Du siehst danach:**
   - rechts „**Wölfe besiegen (1/3)**“ und „**+16 EP**“, unten in der Mitte für 4 Sekunden die dünne **EP-Leiste** mit „Stufe 10“ (sie ist erst ganz wenig gefüllt: 16 von 2.220 EP),
   - rechts oben „Wölfe besiegen **1/3**“,
   - am Boden das **Wolfsfell** (Beute). Mit **E** aufheben.
7. Den zweiten grauen Wolf besiegen.
   **Du siehst danach:** „Wölfe besiegen 2/3“. (Kommen zwei Fortschritte innerhalb von 2 Sekunden, zeigt die Meldung den zweiten etwas später – Absicht, GDD 02, 7.5.)
8. Auf den dritten Wolf warten: **45 Sekunden** nach ihrem Tod tauchen die Wölfe wieder auf. (Der Aether-Wolf zählt nicht, er ist eine andere Art.) Den nächsten grauen Wolf besiegen.
   **Du siehst danach:**
   - rechts oben wird „Wölfe besiegen **3/3**“ mit einem **grünen Haken** abgehakt und kurz grün hinterlegt; der Eintrag bleibt etwa 1,5 Sekunden stehen,
   - Meldungen „Wölfe besiegen (3/3)“ und „Wolfsjagd im Testgelände: Wolfsfell aufheben“.
   - Hast du schon ein Wolfsfell im Rucksack, wird „Wolfsfell aufheben“ **sofort** abgehakt („Erledigt: Wolfsfell aufheben“), und es geht weiter mit „**An der Anschlagtafel melden**“. Sonst: Fell aufheben, dann erscheint dasselbe.
9. Zurück zur Anschlagtafel.
   **Du siehst danach:** die Tafel **glitzert** wieder; unten steht „**E** Melden: Wolfsjagd im Testgelände“.
10. **E** drücken.
    **Du siehst danach:**
    - oben in der Mitte groß „**Quest abgeschlossen: Wolfsjagd im Testgelände**“,
    - rechts „+1110 EP“, „+50 Gold“, „Kleiner Heiltrank ×2“ (die EP-Leiste ist jetzt gut halb voll; eine neue Stufe gibt es erst mit Quest 2),
    - die Tafel glitzert weiter: Sie bietet jetzt **Quest 2** an.
11. **J** drücken und mit **C** (Gamepad **RT**) bis zur Kategorie **Abgeschlossen** gehen.
    **Du siehst danach:** „Wolfsjagd im Testgelände“ mit „Abgeschlossen“, rechts „Ausgang“ und unter „Entscheidungen“: „Du hast drei Wölfe in der Kampfarena erlegt und das Fell an der Anschlagtafel abgegeben.“ Unten in der Fußzeile fehlen hier „Verfolgen“ und „Als Fokus“ – abgeschlossene Quests kann man nicht verfolgen.

**Was passiert, wenn du das Fell vorher verkaufst oder wegwirfst?** Meldest du dich ohne Fell an der Tafel, springt die Quest zurück auf „Wolfsfell aufheben“. Einfach ein neues Fell besorgen.

---

## 7. Quest 2: Die Bewährungsprobe (zwei Wege)

Diese Quest gibt es erst, wenn Quest 1 abgeschlossen ist (Flag `flag.test.wolfsjagd_erledigt`).

1. An der Tafel **E** drücken („Aushang lesen: Die Bewährungsprobe“).
   **Du siehst danach:** „Neue Quest: Die Bewährungsprobe“, rechts oben das Ziel „Zum Übungsplatz gehen“.
2. Zur **Trainingspuppe** gehen (südwestlich vom Startpunkt). Um sie herum markieren vier kleine Pfosten den **Übungsplatz** (8 × 8 m).
   **Du siehst danach:** beim Betreten „Erledigt: Zum Übungsplatz gehen“ und „Die Bewährungsprobe: Eine Truhe öffnen“. Rechts oben stehen jetzt **zwei** Ziele: „Eine Truhe öffnen“ und „Trainingspuppe treffen 0/3“. Eines davon reicht.
3. **Weg A – Truhe:** Eine der drei Truhen beim Startpunkt öffnen (**E**).
   **Du siehst danach:** „Erledigt: Eine Truhe öffnen“, dann „Quest abgeschlossen: Die Bewährungsprobe“, Belohnung **+1110 EP, +20 Gold** und zusätzlich **+25 Gold** für die Truhe.
   **Weg B – Puppe:** Die Trainingspuppe dreimal treffen (linke Maustaste).
   **Du siehst danach:** „Trainingspuppe treffen (1/3)“ … „(3/3)“, dann „Quest abgeschlossen“, Belohnung **+1110 EP, +20 Gold** und zusätzlich **+60 EP**.
   **Bei beiden Wegen:** das Banner „**Stufe 11 erreicht!**“ und rechts „Neue Punkte – im Charakter-Menü verteilen“.
4. **J** → Kategorie **Abgeschlossen** → „Die Bewährungsprobe“.
   **Du siehst danach:** unter „Ausgang“ je nach Weg „Du hast eine Truhe geöffnet – Neugier zahlt sich aus.“ bzw. „Die Trainingspuppe hat drei Treffer eingesteckt – deine Technik sitzt.“ und unter „Entscheidungen“ der passende Satz („… 25 Gold extra …“ bzw. „… 60 Erfahrung extra …“).

**Beide Wege ausprobieren:** Vor Schritt 3 mit **F5** schnellspeichern. Weg A spielen, dann mit **F9** laden und Weg B spielen.

> Hast du alle drei Truhen schon früher geöffnet (sie bleiben offen, auch im Spielstand), geht nur Weg B. Mit „Testgelände erstellen“ und **Neues Spiel** sind sie wieder zu.

---

## 8. Charakter-Seite: Punkte verteilen

1. Nach Quest 2 bist du auf **Stufe 11**. **J** drücken, dann **E** (Gamepad **RB**) für den Reiter **Charakter**.
   **Du siehst danach:** links „Stufe 11“, einen goldenen EP-Balken, „48 / 2.500 EP“ (Weg B: 108; je nach besiegten Wölfen etwas mehr), „**Freie Attributpunkte: 1** · Freie Skillpunkte: 1“ in hellem Gelb, darunter die sechs Attribute mit farbigem Streifen (Stärke 20, Geschick 10, Intelligenz 11, Weisheit 11, Konstitution 18, Charisma 11) und rechts die Werte (Max. Lebenspunkte **340**, Ausdauer **121**, Mana 75, Rüstung 28, Standfestigkeit, Krit-Chance 5,0 %, Traglast 80 kg). Die Werte sind **abgerundet** (GDD 03, 10.3), z. B. erscheint 120,5 als 120.
2. **Stärke** auswählen und **Enter** (Gamepad **A**, oder Steuerkreuz **rechts**) drücken.
   **Du siehst danach:** Stärke steigt um 1 (auf 21), daneben steht grün „**+1**“, „Freie Attributpunkte: 0“. Die Werte rechts ändern sich mit (Traglast 82 kg).
3. **F** (Gamepad **X**, oder Steuerkreuz **links**) drücken.
   **Du siehst danach:** Der Punkt ist zurückgenommen, „Freie Attributpunkte: 1“.
4. Den Punkt wieder verteilen und das Fenster mit **Esc** schließen. Erneut öffnen.
   **Du siehst danach:** Der Punkt ist fest vergeben: kein „+1“ mehr, Zurücknehmen geht nicht mehr.

Skillpunkte werden gesammelt; den Skillbaum gibt es noch nicht.

---

## 9. Speichern und Laden mitten in einer Quest

1. Neues Spiel, Quest 1 annehmen, **einen** Wolf besiegen („Wölfe besiegen 1/3“).
2. **F5** (Schnellspeichern).
   **Du siehst danach:** „Schnellspeicherung erstellt“.
3. Einen zweiten Wolf besiegen („2/3“), dann **F9** (Schnellladen).
   **Du siehst danach:** nach dem Laden rechts oben wieder „Wölfe besiegen **1/3**“ (für 8 Sekunden), im Questlog ebenso. EP, Stufe und Gold sind wieder wie beim Speichern.
4. **Esc** → **Hauptmenü** (gedrückt halten) → **Neues Spiel**.
   **Du siehst danach:** Die Tafel bietet wieder „Wolfsjagd im Testgelände“ an, das Questlog ist leer, Stufe 10 (die Startstufe des Testgeländes) mit 0 EP.
5. **Orts-Zone nach dem Laden:** Quest 1 erledigen, Quest 2 aber **noch nicht** annehmen. Auf den Übungsplatz gehen (zwischen die vier Pfosten), **F5** drücken und gleich danach **F9**. Du stehst nach dem Laden wieder auf dem Übungsplatz. Jetzt den Übungsplatz verlassen, an der Tafel Quest 2 annehmen und zurück auf den Übungsplatz gehen.
   **Du siehst danach:** „Erledigt: Zum Übungsplatz gehen“ wie in Abschnitt 7, Schritt 2. (Früher konnte die Zone nach dem Laden „vergessen“, dass du sie verlassen hast, und meldete das Betreten dann nie wieder.)

---

## 10. Prüfliste

- [ ] Console nach dem Kompilieren ohne rote Fehler.
- [ ] Test Runner (EditMode): alles grün.
- [ ] „Testgelände erstellen“: Console meldet „Quests geprüft … 0 Fehler, 0 Warnung(en)“.
- [ ] Anschlagtafel glitzert am Anfang, Hinweis „Aushang lesen: Wolfsjagd im Testgelände“.
- [ ] Nach dem Lesen: Meldung „Neue Quest: …“ und Quest-Verfolgung rechts oben mit „Wölfe besiegen 0/3“.
- [ ] Jeder graue Wolf zählt hoch, der Aether-Wolf nicht. Nach 45 s kommen die Wölfe zurück.
- [ ] Beim 3. Wolf: grüner Haken mit kurzem grünem Aufleuchten, danach das nächste Ziel.
- [ ] Meldungen kommen höchstens alle 2 Sekunden je Quest („Wölfe besiegen (2/3)“ kommt ggf. etwas später).
- [ ] Neues Spiel: Figur auf Stufe 10, im Debug-Overlay „LP 328/328“ wie in Anleitung 05; Schild ablegen und wieder anlegen klappt (Anleitung 06, 7.2).
- [ ] Abgabe an der Tafel: Banner „Quest abgeschlossen“, +1110 EP, +50 Gold, 2 Heiltränke (noch keine neue Stufe).
- [ ] EP-Leiste unten in der Mitte erscheint 4 s nach jedem EP-Gewinn.
- [ ] Ohne Fell an der Tafel melden: Quest springt zurück auf „Wolfsfell aufheben“.
- [ ] Quest 2 erst nach Quest 1 verfügbar; Zone „Übungsplatz“ hakt „Zum Übungsplatz gehen“ ab.
- [ ] Weg A (Truhe) und Weg B (Puppe 3×) führen beide zum Abschluss, mit unterschiedlichem Bonus und Entscheidungs-Text, +1110 EP, „Stufe 11 erreicht!“ und Hinweis auf neue Punkte.
- [ ] Orts-Zone nach dem Laden: auf dem Übungsplatz F5 und F9, hinaus, Quest 2 annehmen, wieder hinein → „Zum Übungsplatz gehen“ wird abgehakt (Abschnitt 9, Schritt 5).
- [ ] Questlog: **J** öffnet, **Esc**/**J** schließt; mit dem Gamepad über **Start → Questlog & Charakter**, schließen mit **B**.
- [ ] Questlog: **Q/E** bzw. **LB/RB** wechseln den Reiter, **Z/C** (bzw. **Y/C**) bzw. **LT/RT** die Kategorie; leere Kategorien sind dunkler.
- [ ] Questlog: **Enter**/**A** schaltet „Verfolgt“ um (die Quest verschwindet rechts oben bzw. kommt zurück), **F**/**X** macht sie zur Fokus-Quest.
- [ ] Charakter-Seite: Punkt verteilen, zurücknehmen, nach dem Schließen fest; Max. Lebenspunkte 340 und Ausdauer 121 auf Stufe 11.
- [ ] F5/F9 mitten in der Quest: Fortschritt, EP und Stufe stimmen nach dem Laden.
- [ ] Hauptmenü → Neues Spiel: alles wieder am Anfang.
- [ ] Mit HUD-Anzeige „Kontextabhängig“: Quest-Verfolgung nur kurz sichtbar, **M** halten zeigt sie 5 s; mit „Vollständig“ immer sichtbar; mit „Minimal“ nie.

---

## 11. Was du zurückmelden sollst

1. Die Zeile „Quests geprüft …“ aus der Console.
2. Ein **Screenshot** rechts oben mit der Quest-Verfolgung (am besten direkt nach dem 3. Wolf) und einer vom **Questlog** und von der **Charakter-Seite**.
3. Ob Quest 1 und **beide Wege** von Quest 2 geklappt haben.
4. Alles, was komisch aussieht: Texte, die abgeschnitten sind, Überlappungen, Meldungen, die fehlen oder doppelt kommen, Tasten, die nicht reagieren.
5. **Rote Fehler** aus der Console (Text abschreiben oder Screenshot).

---

## 12. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Keine Anschlagtafel im Testgelände | Testgelände vor diesem Update erstellt | **Aetherfall > Testgelände erstellen** → **Neu aufbauen** |
| Tafel ist da, aber kein Hinweis „Aushang lesen“ | Quests fehlen in der BootConfig oder im Inhaltskatalog | Menü erneut ausführen; Console nach Zeilen mit „Quest“ ansehen. In `Assets/_Project/Settings/Boot/BootConfig.asset` müssen `ConditionsInstaller`, `WorldStateInstaller`, `ProgressionInstaller` und `QuestInstaller` stehen |
| Rechts oben erscheint nie etwas | HUD-Anzeige „Kontextabhängig“ und gerade keine Quest-Änderung, oder „Minimal“ | **M** halten, oder Optionen > HUD-Anzeige „Vollständig“ |
| **J** öffnet nichts | Spiel direkt im Testgelände gestartet, Boot-Szene ohne neue Layouts | **Aetherfall > Oberfläche einrichten** → **Einrichten** (trägt die 7 neuen Layouts am Objekt „UI“ ein). Console: Warnung „UIRoot: the journal layouts … are not set“ |
| Im Pausemenü ist „Questlog & Charakter“ grau | Pause über einem Dialog (noch nicht möglich) oder keine Journal-Layouts | wie oben; im normalen Spiel ist der Eintrag aktiv |
| Wölfe zählen nicht | Quest noch nicht angenommen (vorher besiegte Wölfe zählen nicht) oder Aether-Wolf besiegt | erst an der Tafel annehmen; graue Wölfe besiegen |
| Keine Wölfe mehr da | Wölfe kommen erst 45 s nach dem Tod zurück | kurz warten |
| „Zum Übungsplatz gehen“ wird nicht abgehakt | Zone nicht auf dem Layer „TriggerVolume“ oder Layer 14 war belegt | Menü erneut ausführen; Hinweise im Fenster beachten. Im Inspector muss das Objekt „Uebungsplatz“ einen **Box Collider** (Is Trigger an), einen **Rigidbody** (Is Kinematic an) und **Area Trigger** (Area Id `loc.test.uebungsplatz`) haben |
| Kategorie-Wechsel mit **Z** geht nicht | deutsche Tastatur: Unity benennt die Tasten nach ihrer Lage auf einer US-Tastatur | die Taste **Y** (unten links, neben X) drücken |
| Alte Fassung einer Test-Quest | Dateien werden nicht überschrieben | Datei in `Assets/_Project/Data/Quests/Test/` löschen und das Menü erneut ausführen |
| Console: „Quest-Prüfung V04 …“ | ein Verweis zeigt auf etwas, das es nicht gibt (z. B. umbenanntes Item) | Meldung an Claude schicken |

---

## 13. Dateien und wohin sie gehören

Alle Skripte liegen schon am richtigen Ort. **An GameObjects** hängen nur die vier Komponenten in der Tabelle unten; das Menü setzt sie automatisch.

| Datei (unter `Assets/_Project/`) | Inhalt | an GameObject? |
|---|---|---|
| `Scripts/Progression/` (neu, 18 Dateien) | EP-Kurve, Gegner-EP, Fortschritts-Dienst, Speichern, Installer, Bedingungen und Aktionen „Spieler/…“ | nein (Installer-Asset) |
| `Scripts/Player/PlayerProgression.cs` | verbindet die Werte der Figur mit Stufe und Attributpunkten | **ja:** Spielfigur |
| `Scripts/World/AreaTrigger.cs`, `AreaPresence.cs` (neu) | Orts-Zone für „Gehe zu Ort“ | **ja:** Objekt „Uebungsplatz“ |
| `Scripts/Quests/QuestBoard.cs`, `QuestBoardRules.cs` | Anschlagtafel als Questgeber | **ja:** Objekt „Anschlagtafel“ |
| `Scripts/Quests/HitTargetObjective.cs` | Ziel „Treffe Ziel“ | nein |
| `Scripts/Inventory/HasItem.cs`, `CurrencyAtLeast.cs`, `GiveItem.cs`, `RemoveItem.cs`, `GiveCurrency.cs`, `RemoveCurrency.cs`, `CurrencyRules.cs` | Bedingungen und Aktionen „Inventar/…“ | nein |
| `Scripts/AI/RespawnTimers.cs`, `EnemySpawner.cs` | Wölfe kommen nach 45 s zurück | (Spawner hängt schon in der Arena) |
| `Scripts/Core/Services/SessionLifecycle.cs` | räumt beim Wechsel ins Hauptmenü auf | nein |
| `Scripts/UI/Screens/JournalScreen.cs`, `QuestTrackerView.cs`, `XpBarView.cs`, `QuestNotifier.cs`, `ObjectiveRowView.cs` und die Modelle `QuestLog*.cs`, `QuestDetails*.cs`, `QuestTracker*.cs`, `CharacterSheetModel.cs`, `ListWindow.cs` … | Questlog, Charakter-Seite, Quest-Verfolgung, EP-Leiste, Meldungen | nein (das Objekt „UI“ baut sie auf) |
| `Art/UI/Layouts/Journal.uxml`, `QuestRow.uxml`, `ObjectiveRow.uxml`, `TrackedQuest.uxml`, `JournalLine.uxml`, `AttributeRow.uxml`, `ValueRow.uxml` | Aufbau der neuen Bildschirme | eingetragen am Objekt „UI“ (Boot-Szene) |
| `Art/UI/Styles/Journal.uss`, Ergänzungen in `Hud.uss`, `Toasts.uss` | Aussehen | über das Theme |
| `Scripts/Editor/Narrative/TestGroundQuestLibrary.cs`, `QuestAssetWriter.cs` | die beiden Test-Quests als Daten, Schreiben in Assets | nein (Editor) |
| `Scripts/Editor/World/TestGroundQuestAssets.cs`, `TestGroundQuestBuilder.cs` | Quest-Dateien, Tafel und Zone im Testgelände | nein (Editor) |
| `Tests/EditModeProgression/` (neu) und neue Dateien in `Tests/EditModeUIScreens/`, `EditModeUI/`, `EditModeInventory/`, `EditModeQuests/`, `EditMode/` | automatische Tests | nein |

Die **Vorschaubilder** der neuen Bildschirme (HTML-Nachbau ohne Unity) erzeugt `node Tools/Preview/ui/vorschau_ui.cjs` – neu sind `hud_quests.png`, `questlog.png`, `questlog_abgeschlossen.png`, `charakter.png` und `questlog_150.png` ([README](../../Tools/Preview/ui/README.md)).

---

## 14. Für Claude: ohne Klicks (Batchmode)

Testgelände bauen (inklusive Quests, Prüfung und Oberfläche), Exit-Code 0 = fertig:

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.TestGroundMenu.RunBatch -logFile Logs\testgelaende.log
```

Nur die Quests prüfen (Exit-Code 0 = keine Fehler):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.Narrative.QuestValidationMenu.RunBatch -logFile Logs\quests.log
```

Tests wie in der [CLAUDE.md](../../CLAUDE.md) (`-runTests -testPlatform EditMode`). Ein Projekt, das im Editor offen ist, kann nicht zusätzlich im Batchmode laufen.

---

## 15. Hinweise, Abweichungen und offene Punkte

**Abweichungen und Entscheidungen:**

| Was | Vorgabe | Umgesetzt | Warum |
|---|---|---|---|
| Questlog öffnen am Gamepad | GDD 05, 1.3: Hub mit Reitern (Karte, Questlog, Inventar, Charakter …) | eigenes Fenster „Questlog & Charakter“ mit zwei Reitern, erreichbar über **J** und den Pausemenü-Eintrag | Den Hub mit allen Reitern gibt es noch nicht (Karte, Inventar-Bildschirm, Skillbaum fehlen). Am Gamepad hat das Questlog laut GDD 03, 1.5 keine eigene Taste. |
| Spielzustand | Architektur 4.4: Menüs als `Menu` | Questlog schiebt `Menu` über `Playing`; aus dem Pausemenü wird `Paused` erst entfernt, dann `Menu` geschoben (der Stapel bleibt Playing → Menu) | Es soll nie zwei Menüs übereinander geben; B/Esc führt direkt zurück ins Spiel. |
| Pausemenü-Reihenfolge | GDD 05, 5.4: Schnellspeichern ist der 2. Eintrag | Fortsetzen, Schnellspeichern, **Questlog & Charakter**, Laden, Optionen, Hauptmenü, Beenden | Schnellspeichern bleibt an Platz 2 |
| Questlog-Sortierung | GDD 02, 7.1: nach Akt, Fraktion, Region, Entfernung | Fokus-Quest zuerst, dann verfolgte, dann der Rest in Start-Reihenfolge; „Abgeschlossen“: neueste zuerst | Akt, Region und Entfernung gibt es noch nicht. Filter-Chips und Gerüchte folgen später. |
| Punkte zurücknehmen | GDD 03, 11.3 | im offenen Charakter-Menü, beim Schließen fest | so in GDD 03 vorgesehen |
| Abgehakte Ziele | – | ein erledigtes Ziel bleibt 1,5 s abgehakt stehen, auch wenn die Stage im selben Moment wechselt | sonst wäre der Haken des letzten Ziels einer Stage nie zu sehen |
| P1-Meldungen | GDD 05, 1.7: „rechts unter der Questanzeige“ | rücken automatisch unter die Quest-Verfolgung, wenn sie sichtbar ist | wie im GDD |
| Quest-Meldungen beim Laden | – | während des Ladens keine Quest-Meldungen | ein geladenes Spiel zählt seine Ziele neu; das wären sonst falsche „Erledigt“-Meldungen |
| Tastenbeschriftung Z | – | die Tastensymbole zeigen die US-Beschriftung („Z“); auf deutschen Tastaturen ist es die Taste **Y** | Das Input System bindet Tasten nach ihrer Lage. **Vorschlag:** später die Beschriftung aus dem aktuellen Tastatur-Layout lesen. |
| Startstufe eines neuen Spiels | GDD 03, 12: Start auf Stufe 1 | Im Testgelände **Stufe 10**. Das Menü „Testgelände erstellen“ stellt am `ProgressionInstaller` das Feld „Startstufe neues Spiel (nur Test)“ auf 10; Standard ist 1 | Die Testfigur ist seit Anleitung 05 ein Krieger der Stufe 10 (328 LP). Startausrüstung und Truhen haben Item-Level 10, das ist ab Stufe 7 anlegbar (GDD 04, 2.4). Auf Stufe 1 ließe sich nichts davon wieder anlegen, und die Werte aus Anleitung 05 und 06 stimmten nicht mehr. **Vor dem Mini-Slice wieder auf 1 stellen** (steht auch in der Status-Liste). |
| Belohnung der Test-Quests | GDD 02, 2.2: Nebenquests bis Stufe 10 geben 0,3–0,5 Stufen | beide je 0,5 Stufen bei empfohlener Stufe 10 (je 1.110 EP) | So passt es zur Startstufe 10: keine Abschwächung, und der Stufenaufstieg kommt genau mit der zweiten Quest. |

**Noch offen (TODO):**

- Hub mit allen Reitern (Karte, Inventar, Skillbaum, Codex) – GDD 05, 1.3.
- Questgeber-„!“ an NPCs, Kompass- und Kartenmarker für Quest-Ziele (GDD 02, 7.3) – mit Dialogen/NPCs bzw. der Karte.
- Grund beim Scheitern einer Quest in der Meldung (GDD 02, 7.5) – braucht deutsche Texte je Grund.
- Fristen mit Sanduhr, Questketten „Teil 2/3“, Gerüchte-Abschnitt im Reiter „Neben“.
- Resistenzen, Verderbnis, Titel und Paragon auf der Charakter-Seite (GDD 05, 1.3) – mit ihren Systemen.
- Skillbaum für die Skillpunkte.
- Speichern der Optionen (HUD-Anzeige) – mit dem Optionen-Schritt.
- Hauptquests bekommen eine eigene, mildere Abschwächung: 10 % weniger je Stufe über „Story-Korridor + 3“, höchstens bis auf 50 % (GDD 03, 12.7). Das kommt, sobald es den Story-Korridor gibt. Bis dahin gilt für alle Quests mit empfohlener Stufe die Abschwächung aus GDD 02, 8.4.
- Vor dem Mini-Slice: „Startstufe neues Spiel (nur Test)“ am `ProgressionInstaller` zurück auf 1.
