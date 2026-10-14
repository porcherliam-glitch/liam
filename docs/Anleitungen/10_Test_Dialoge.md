# Testanleitung: Dialogsystem und NPCs

> Dialoge mit Knoten, Fertigkeitsproben, Bestechung und Themen · NPC-Daten, Beziehung und Ansprechen · Dialog-Bildschirm · Stand: 2026-10-14 · Bezug: [Architektur 3.3, 4.3, 7, 9, 11.8, 11.10, 11.11](../Technik/01_Architektur.md) · [GDD 02, Abschnitt 12](../GDD/02_Quests_und_Dialoge.md) · [GDD 01, Abschnitt 7](../GDD/01_Welt_Story_Fraktionen.md) · [GDD 05, Abschnitte 1.4, 2.4, 4.2](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) · Master-Prompt §15

In diesem Schritt lernen die Figuren **sprechen**. Es gibt jetzt:

- **Dialoge** als Dateien (Assets): NPC-Zeilen, Antworten des Spielers, Weichen nach Bedingungen, Aktionen, **Fertigkeitsproben** (Überzeugen, Einschüchtern, Lügen), Zufall, Sprünge in andere Dialoge und Enden mit einem **Ausgang** (z. B. „abzug“), auf den Quests reagieren.
- **Markierungen an Antworten** wie im GDD: „[Überzeugen 12]“, „[80 Gold]“, „[Angriff]“, „[Töten]“, „[Ende]“ und die Quest-Raute ◆. Sie entstehen **automatisch** aus dem, was hinter einer Antwort passiert.
- **NPCs** als Dateien: Name, Rolle („Banditenanführer“, solange man den Namen nicht kennt), Stufe, Gier (für Bestechungspreise), **Beziehung** von −100 bis +100.
- Den **Dialog-Bildschirm**: Untertitel mit Sprecher, Schreibmaschinen-Effekt, Antwortliste, komplett mit dem **Gamepad** bedienbar (Steuerkreuz, A/Kreuz, B/Kreis, „[Töten]“ gedrückt halten).
- Die **Dialog-Prüfung**: Menü **Aetherfall > Dialoge prüfen** findet Sackgassen, kaputte Verweise, fehlende Texte und Endlosschleifen.
- Das Beispiel aus dem GDD, **„Verhandlung mit Harrik am Mühlbach“**, ist als Testdaten komplett nachgebaut und wird von den automatischen Tests in **allen Ausgängen** durchgespielt.

**Wichtig:** Dieser Schritt ist **noch nicht ins Spiel eingebaut**. Im Testgelände steht noch kein NPC, und der Dialog-Bildschirm wird noch nicht geöffnet. Getestet wird über die **automatischen Tests**, den **Inspector** (NPC und kleinen Dialog anlegen, prüfen) und **Vorschaubilder** des Bildschirms. Der Einbau folgt im nächsten Schritt (siehe [Abschnitt 12, Integration](#12-integration-für-den-nächsten-schritt)).

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 08](./08_Test_Quests.md) sind erledigt.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Automatische Tests im Test Runner](#3-automatische-tests-im-test-runner)
4. [Einen NPC anlegen](#4-einen-npc-anlegen)
5. [Einen kleinen Dialog anlegen](#5-einen-kleinen-dialog-anlegen)
6. [Dialoge prüfen](#6-dialoge-prüfen)
7. [So sieht der Dialog-Bildschirm aus (Vorschau)](#7-so-sieht-der-dialog-bildschirm-aus-vorschau)
8. [Prüfliste](#8-prüfliste)
9. [Was du zurückmelden sollst](#9-was-du-zurückmelden-sollst)
10. [Häufige Fehler und Lösungen](#10-häufige-fehler-und-lösungen)
11. [Dateien und wohin sie gehören](#11-dateien-und-wohin-sie-gehören)
12. [Integration (für den nächsten Schritt)](#12-integration-für-den-nächsten-schritt)
13. [Hinweise, Abweichungen und offene Punkte](#13-hinweise-abweichungen-und-offene-punkte)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Dialogsystem** (`Aetherfall.Dialogue`, neu, Assembly Nr. 17) | `DialogueDefinition` (Asset) mit einer Liste von **8 Knotentypen** (GDD 02, 12.2): **NPC-Zeile** (Text, Sprecher, Varianten mit Bedingung, Stimmung, Kamera-Hinweis, Aktionen), **Spieler-Auswahl** (bis 6 Antworten, im Hub bis 9; je Antwort Sichtbar-wenn, Wählbar-wenn mit Grund, „nur einmal“, „unumkehrbar“, Aktionen), **Bedingungsweiche**, **Aktion**, **Probe**, **Zufall** (Gewichte; gleicher NPC am gleichen Spieltag = gleiches Ergebnis), **Sprung** (in einen anderen Dialog, wahlweise mit Rückkehr) und **Ende** (Ausgangs-ID, danach Spiel, Handel oder Kampf). Der **DialogueRunner** spielt das ab; der **DialogueService** schaltet dabei den Spielzustand auf „Dialog“, sperrt das Speichern und merkt sich gewählte Antworten, Proben-Ergebnisse, freigeschaltete Themen und bekannte Namen (Speicher-Abschnitt `dialogue`). |
| **Fertigkeitsproben** | Wert = Attribut + 2 × Rang + Situationsbonus (höchstens ±6), Schwellen 10/12/14/16/18/24/30 (GDD 02, 12.3). Überzeugen und Lügen nutzen Charisma, Einschüchtern den höheren Wert aus Charisma und Stärke. Stufenvorteil +2 je 3 Stufen über dem NPC (höchstens +6). Standard: **feste Proben** – reicht der Wert nicht, ist die Antwort grau und zeigt „[Überzeugen 12 · dein Wert 9]“. Wahlweise **Würfelmodus** (W20, Anzeige „[Überzeugen · 45 %]“). Ergebnisse werden gemerkt: ein zweites Gespräch würfelt nicht neu. |
| **Markierungen** | Werden aus dem Inhalt abgeleitet, nicht von Hand gesetzt: Ziel ist eine Probe → „[Überzeugen 12]“; Ziel ist ein Ende → „[Ende]“ (bzw. „[Handel]“, „[Angriff]“); „Bestechen“ dahinter → „[80 Gold]“ (Preis mit Gier des NPC und Charisma-Rabatt bis 30 %); „unumkehrbar“ → „[Töten]“ mit Gedrückthalten; Weg endet in einem Quest-Ausgang → ◆. Schon gewählte Antworten erscheinen mit 60 % Deckkraft, „nur einmal“-Antworten danach grau. |
| **NPC-System** (`Aetherfall.NPC`, neu, Assembly Nr. 22) | `NpcDefinition` (Asset): Anzeigename, Rolle, Name von Anfang an bekannt, Standard-Dialog, Stufe, Gier, unbestechlich, Start-Beziehung. `NpcService`: Beziehung −100 … +100 mit den 5 Stufen aus GDD 01, 7.5 (Feind, Abneigung, Neutral, Freundlich, Vertraut), Tod, Feindseligkeit (auch für Gruppen wie `group.banditen_muehlbach`), Speicher-Abschnitt `npcs`. **`NpcInteractable`** (Komponente): Interaktion „Sprechen: Harrik“ startet den Dialog. **`NpcLookAt`** (Komponente): der NPC dreht sich zur Spielfigur, im Gespräch zum Gesprächspartner, schaut im Leerlauf ab und zu zur Seite. |
| **Bedingungen und Aktionen** (im bekannten Auswahlmenü) | Bedingungen **Dialog > Thema bekannt**, **Dialog > Option gewählt**, **Dialog > Probe bestanden**, **NPC > Beziehung mindestens**, **NPC > Lebt**. Aktionen **Dialog > Thema freischalten**, **Dialog > Name bekannt**, **Dialog > Bestechen**, **Dialog > Dialog starten**, **NPC > Beziehung ändern**, **NPC > Kampf beginnen**, **NPC > Töten (lautlos)**. |
| **Dialog-Bildschirm** (`UI.Screens`, neuer Ordner `Dialogue`, `Dialogue.uxml`, `Dialogue.uss`) | Untertitel unten (Sprecher, höchstens 2 Zeilen à 45 Zeichen je Seite, ▼ zum Weiterblättern), Schreibmaschinen-Effekt (langsam/normal/schnell/sofort), **1. Drücken zeigt die ganze Seite, 2. Drücken geht weiter**, automatisches Weiter mit Lesefaktor, Antwortliste mit Fokusrahmen, graue Antworten werden beim Blättern übersprungen, „[Töten]“ 1 s gedrückt halten, B/Kreis wählt „[Ende]“, Tasten 1–9 wählen direkt. Die letzte Zeile bleibt über den Antworten sichtbar. |
| **Ereignisse** (`Aetherfall.Events`, neue Dateien) | `DialogueStarted`, `SkillCheckResolved`, `TopicUnlocked`, `RelationshipChanged`, `NPCDied` (dazu `DialogueMode`, `SkillCheckType`). Die vorhandenen `NPCTalkedTo`, `ChoiceMade` und `DialogOutcome` sendet jetzt der Dialog. |
| **Dialog-Prüfung** | Menü **Aetherfall > Dialoge prüfen** und Batchmode-Einstieg (Abschnitt 6). Regeln aus GDD 02, 10.2 und 12.2: V01 doppelt, V02 ID-Schema, V04 kaputter Verweis, V05 unerreichbar, V06 Sackgasse, V07 Zyklus ohne Ausgang, V09 Weiche ohne Standard, V10 Text fehlt, W04 Text zu lang (Zeile 180, Antwort 60 Zeichen), D01–D06 dialogspezifisch (zu viele Antworten, kein Ende, fehlender Ausgang, leere Aktion, Knoten-Namensregel, Probe ohne Misserfolg). |
| **Vorschau** (`Tools/Preview/ui/vorschau_dialog.cjs`, `szenen_dialog.js`) | Baut den Dialog-Bildschirm aus denselben UXML-, USS- und Textdateien als HTML nach und macht Bilder (Abschnitt 7). |
| **Tests** | **169 neue automatische Testfälle** (145 Dialog/NPC, 24 Bildschirm; insgesamt jetzt 1618): alle Knotentypen, Ereignisse, einmalige Antworten, Proben, Bestechung, Speichern und Laden, Prüfung, Bildschirm-Logik – und **der Mühlbach-Dialog in allen Ausgängen**. |

**Die Ausgänge des Mühlbach-Dialogs** (GDD 02, 12.10), wie die Tests sie durchspielen:

| Ausgang | Weg im Dialog | Was danach gilt |
|---|---|---|
| `abzug` | Überzeugen (12) → „Ich bürge bei Hedda für euch.“ **oder** „[80 Gold] Nehmt das Gold …“ | Ausgang 3 (abgezogen), Harrik verschont |
| `muehlenwache` | Überzeugen (12) → „Bewacht die Mühle für Brenner.“ | Mühlenwache |
| `vertrieben` | Einschüchtern (14, +4 mit Messer an der Kehle, Stufenvorteil) **oder** Lügen (12, −5 nach bemerkter Lüge) | Ausgang 2 (vertrieben); bei Lüge `harrik_belogen` |
| `abmachung` | „Ihr seid alle aus Eichental?“ (schaltet Thema Grimmbart frei) → „Wem zahlt ihr eigentlich Tribut?“ → „Ich kümmere mich um Grimmbart.“ | Schwäche von Grimmbart bekannt |
| `kampf` | „Ich bin hier, um euch zu erledigen.“ oder „[Angriff] Dann regeln wir das mit Stahl.“ | Bandengruppe feindlich, danach Kampf |
| `attentat` | nur mit Messer an der Kehle: „[Töten] Du drückst die Klinge tiefer.“ (gedrückt halten) | Harrik tot (`NPCDied`), Ausgang 1 |
| `vertagt` | „[Ende] Ich komme wieder.“ oder B/Kreis | nichts (kein Quest-Ausgang) |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Es sind rund 150 neue Dateien.
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu. Ein **neues Testgelände ist nicht nötig**.

---

## 3. Automatische Tests im Test Runner

Das ist der wichtigste Test in diesem Schritt.

1. Menü **Window > General > Test Runner** öffnen, Reiter **EditMode** wählen.
2. Oben **Run All** klicken.
   **Du siehst danach:** nach einer Weile grüne Haken. Neu sind die Gruppen **Aetherfall.Tests.EditMode.Dialogue** und **Aetherfall.Tests.EditMode.DialogueScreen**.
3. **Aetherfall.Tests.EditMode.Dialogue** aufklappen, darin **MuehlbachDialogueTests**.
   **Du siehst danach:** u. a. `Persuade_ThenGuarantee_EndsWithAbzug`, `Bribe_PaysTheGold_AndEndsWithAbzug`, `KnifeOption_IsAKillWithHold_AndEndsWithAttentat`, `TopicGrimmbart_UnlocksTheDeal_AndEndsWithAbmachung`, `DiceMode_FailedPersuasion_LeadsToN120_AndGreysTheOption` – alle grün. Diese Tests führen das Gespräch mit Harrik so, wie es ein Spieler tun würde (Antwort wählen, weiterklicken), und prüfen Texte, Markierungen, Flags und Ereignisse.
4. Daneben gibt es **DialogueRunnerTests** (alle Knotentypen, Abbrechen, Sprünge), **SkillCheckRulesTests** (Formeln), **DialogueSaveTests** (Speichern/Laden), **DialogueValidatorTests** (Prüfung), **NpcTests** und **SubtitleAndMarkingTests**.

**Zwei Tests in der Gruppe „…EditMode.UI“ sind bis zum Einbau rot:** `Theme_ImportsTheDefaultThemeFirst_AndOnlyExistingSheets` („sheet not imported by the theme: Dialogue.uss“) und `StaticLabels_HaveATextEntry` („Dialogue.uxml: no text for 'dialogue-speaker'“). Das ist **erwartet**: Diese Tests verlangen Einträge in bestehenden Dateien (Theme, Texttabelle), die dieser Schritt absichtlich nicht ändert. Abschnitt 12.2 beschreibt den Einbau; danach sind sie grün (vorab in einer Kopie des Projekts geprüft).

Ist ein **anderer** Test rot: anklicken, unten erscheint die Meldung. Bitte den Text abschreiben bzw. einen Screenshot an Claude schicken.

Für Claude auf deinem PC (ohne Klicks, Windows-Beispiel, Pfad anpassen):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults Logs\editmode-results.xml -logFile Logs\editmode.log
```

---

## 4. Einen NPC anlegen

1. Im **Project**-Fenster den Ordner `Assets/_Project/Data` öffnen. Rechtsklick > **Create > Folder**, Name `NPCs`.
2. Rechtsklick in den neuen Ordner > **Create > Aetherfall > NPCs > NPC**. Name: `Npc_Ulf`.
   **Du siehst danach:** im **Inspector** die Felder **Id**, **Status**, **Display Name**, **Role Name**, **Name Known From Start**, **Default Dialogue Id**, **Level**, **Greed**, **Unbribable**, **Start Relationship**, **Notes**. Fährst du mit der Maus über ein Feld, erscheint ein deutscher Hinweis.
3. Eintragen: **Id** `npc.test.wirt_ulf`, **Display Name** „Ulf“, **Role Name** „Wirt“, Haken bei **Name Known From Start**, **Default Dialogue Id** `dlg.test.ulf_gruss`, **Level** 3.
4. Noch einen NPC mit unbekanntem Namen: **Create > Aetherfall > NPCs > NPC**, Name `Npc_Fremder`. **Id** `npc.test.fremder`, **Display Name** „Ansgar“, **Role Name** „Wanderer“, **kein** Haken bei **Name Known From Start**, **Start Relationship** auf −20 schieben.
   Im Spiel heißt er in Untertiteln und beim Ansprechen „Wanderer“, bis ein Dialog die Aktion **Dialog > Name bekannt** ausführt.

---

## 5. Einen kleinen Dialog anlegen

Der Dialog: Ulf grüßt, der Spieler kann einmal nach den Geschäften fragen oder sich verabschieden.

1. In `Assets/_Project/Data` einen Ordner `Dialogues` anlegen. Rechtsklick hinein > **Create > Aetherfall > Dialoge > Dialog**. Name: `Dlg_Ulf_Gruss`.
   **Du siehst danach:** im Inspector die Abschnitte **Allgemein** (Title, Mode, Speaker Id, Start Node Id, Cancelable), **Quest**, **Knoten** und **Produktion**.
2. **Id** `dlg.test.ulf_gruss`, **Title** „Ulf grüßt“, **Speaker Id** `npc.test.wirt_ulf`.
3. Knoten fügst du über das **Drei-Punkte-Menü** oben rechts im Inspector hinzu (das Symbol **⋮** neben dem Fragezeichen): **Knoten hinzufügen > NPC-Zeile**.
   **Du siehst danach:** In der Liste **Nodes** steht ein Eintrag mit **Id** `n010`. Aufklappen: **Text**, **Next Node Id**, **Exit Id**, **Follow Up**, **Speaker Id**, **Variants**, **Emotion**, **Camera**, **Actions**.
   Bitte **nicht** das **+** unter **Nodes** benutzen – das kann erst der nächste Schritt richtig (siehe Abschnitt 10).
4. In `n010`: **Text** „Na, Rissgeborener? Was gibt's?“, **Next Node Id** `n020`.
5. **⋮ > Knoten hinzufügen > Spieler-Auswahl** (bekommt `n020`). Aufklappen, bei **Options** zweimal auf **+**:
   - Antwort 1: **Id** `a`, **Text** „Wie laufen die Geschäfte?“, **Target Node Id** `n030`, Haken bei **Once**.
   - Antwort 2: **Id** `b`, **Text** „Bis später.“, **Target Node Id** `n040`.
6. **⋮ > Knoten hinzufügen > NPC-Zeile** (`n030`): **Text** „Schlecht. Seit dem Riss trinkt keiner mehr.“, **Next Node Id** `n020` (zurück zur Auswahl).
7. **⋮ > Knoten hinzufügen > Ende** (`n040`): **Exit Id** `tschuess`.
8. **File > Save Project** (oder Strg+S / Cmd+S).

So läuft das Gespräch später: Ulf grüßt → Auswahl mit „Wie laufen die Geschäfte?“ und „[Ende] Bis später.“ (das „[Ende]“ setzt das Spiel selbst davor) → nach der Frage kommt Ulfs Antwort, dann wieder die Auswahl, jetzt mit der Frage **grau** (nur einmal).

---

## 6. Dialoge prüfen

1. Menü **Aetherfall > Dialoge prüfen**.
   **Du siehst danach:** ein Fenster **Dialoge prüfen** mit „1 Dialog(e) geprüft: 0 Fehler, 0 Warnung(en).“ In der Console steht dieselbe Zeile mit „[Dialoge prüfen]“ davor.
2. Absichtlich einen Fehler einbauen: im Knoten `n030` bei **Next Node Id** `n099` eintragen. **Aetherfall > Dialoge prüfen** noch einmal.
   **Du siehst danach:** „1 Dialog(e) geprüft: 2 Fehler, 0 Warnung(en).“ In der Console zwei rote Zeilen: „Fehler V04 [dlg.test.ulf_gruss / n030]: Ziel-Knoten 'n099' existiert nicht.“ und „Fehler V07 [dlg.test.ulf_gruss / n030]: Von 'n030' aus kann das Gespräch nie enden …“. Ein Klick auf eine der Zeilen hebt das Dialog-Asset im Project-Fenster gelb hervor.
3. Zurück auf `n020` stellen und erneut prüfen: keine roten Zeilen mehr.
4. Noch ein Versuch: **Speaker Id** auf `npc.test.wirt_uff` (Tippfehler) ändern und prüfen.
   **Du siehst danach:** „Fehler V04 [dlg.test.ulf_gruss]: NPC 'npc.test.wirt_uff' existiert nicht (NpcDefinition fehlt).“ Wieder zurückändern.

Für Claude ohne Klicks:

```
Unity.exe -batchmode -nographics -projectPath . -executeMethod Aetherfall.Dialogue.DialogueValidationMenu.RunBatch -logFile Logs\dialoge.log
```

Exit-Code 0 = keine Fehler, 1 = Fehler (Meldungen in der Logdatei, beginnen mit „[Dialoge prüfen]“).

---

## 7. So sieht der Dialog-Bildschirm aus (Vorschau)

Weil der Bildschirm noch nicht im Spiel geöffnet wird, gibt es Vorschaubilder. Sie werden – wie bei Anleitung 07 – aus **denselben Dateien** gebaut, die Unity benutzt (`Dialogue.uxml`, `Dialogue.uss`, Theme, Texttabellen, Tastensymbole). Unten im Bild steht „Vorschau – HTML-Nachbau der Unity-Oberfläche (kein Unity-Screenshot)“.

| Bild | Inhalt |
|---|---|
| `dialog.png` | Auswahl am Mühlbach mit Tastatur-Symbolen: oben Harriks letzte Zeile (gedimmt), darunter 8 Antworten. „Ihr seid alle aus Eichental?“ grau (schon gefragt), „[Überzeugen 12]“ mit Fokusrahmen, „[Einschüchtern 14 · dein Wert 12]“ grau, „[Lügen 12]“, „[77 Gold]“ (Charisma 12 senkt den Preis von 80), „[Angriff]“ rot, „[Ende]“. Unten „E Auswählen“ und „RMT Gespräch beenden“ (rechte Maustaste). |
| `dialog_zeile.png` | Eine Zeile: Sprecher „Banditenanführer“ (Name noch unbekannt), 2 Untertitelzeilen, ▼ rechts unten, Hinweis „E Weiter“. |
| `dialog_gamepad.png` | Dieselbe Auswahl mit Messer an der Kehle und **PlayStation**-Symbolen: „[Töten] Du drückst die Klinge tiefer.“ wird gerade gehalten (roter Rahmen, Balken zu 60 %), unten „× Halten = bestätigen“ und rechts „Automatisch weiter“. |

Neu erzeugen (für Claude; braucht Node.js und Playwright wie in `Tools/Preview/ui/README.md`):

```bash
node Tools/Preview/ui/vorschau_dialog.cjs                 # Bilder nach Tools/Preview/ui/Ausgabe/
node Tools/Preview/ui/vorschau_dialog.cjs --szene dialog --out /pfad
node Tools/Preview/ui/vorschau_dialog.cjs --streng        # Layout-Warnungen = Fehler
```

Das Skript nutzt die Funktionen von `vorschau_ui.cjs` mit. Die Antworten und Markierungen in `szenen_dialog.js` sind genau die, die das Dialogsystem für die angegebenen Spielerwerte berechnet (die Tests prüfen dieselben Texte).

---

## 8. Prüfliste

| # | Prüfung | Erwartung |
|---|---|---|
| 1 | Console nach dem Kompilieren | keine roten Fehler |
| 2 | Test Runner, EditMode, **Run All** | alles grün außer den zwei erwarteten UI-Tests (Abschnitt 3); Gruppen „…Dialogue“ und „…DialogueScreen“ vorhanden |
| 3 | **Create > Aetherfall > NPCs > NPC** | NPC-Asset mit deutschen Hinweisen |
| 4 | **Create > Aetherfall > Dialoge > Dialog** | Dialog-Asset mit Abschnitten Allgemein, Quest, Knoten, Produktion |
| 5 | **⋮ > Knoten hinzufügen** | 8 Einträge (NPC-Zeile, Spieler-Auswahl, Bedingungsweiche, Aktion, Probe, Zufall, Sprung, Ende); neue Knoten heißen n010, n020, … |
| 6 | **Actions** einer NPC-Zeile, **+** und Typ wählen | Menü **Aktion wählen** mit neuen Ordnern **Dialog** und **NPC** |
| 7 | **Visible If** einer Antwort | Menü **Bedingung wählen** mit **Dialog > Thema bekannt**, **NPC > Beziehung mindestens** … |
| 8 | **Aetherfall > Dialoge prüfen** | Fenster mit Zusammenfassung; eingebaute Fehler werden gemeldet (Abschnitt 6) |
| 9 | Vorschaubilder (von Claude erzeugt) | Untertitel und Antworten lesbar, nichts ragt aus dem Bild |
| 10 | **Gamepad** | Im Spiel erst nach dem Einbau; die Bedienlogik ist durch die Tests „DialogueScreenPresenterTests“ abgesichert |

---

## 9. Was du zurückmelden sollst

- Ergebnis von **Run All** im Test Runner (Anzahl grün/rot; bei Rot den Text – die zwei erwarteten UI-Tests musst du nicht melden).
- Ob das **⋮**-Menü **Knoten hinzufügen** erscheint und die Knoten n010, n020 … heißen.
- Was das Fenster **Dialoge prüfen** in Abschnitt 6 anzeigt (Screenshot genügt).
- Wie dir die Vorschaubilder gefallen (Größe der Schrift, Farben der Markierungen, Platz für 8 Antworten).
- Alle roten Meldungen aus der Console.

---

## 10. Häufige Fehler und Lösungen

| Problem | Lösung |
|---|---|
| Rote Fehler mit `Aetherfall.Dialogue`, `Aetherfall.NPC` oder `UI.Screens.Dialogue` | Screenshot an Claude. Diese Bausteine liefen noch nie in Unity, nur im Prüfprogramm (Harness). |
| Menü **Aetherfall > Dialoge prüfen** fehlt, **Create > Aetherfall > Dialoge** fehlt | Das Paket **Newtonsoft Json** fehlt (Dialog und NPC brauchen das Speichersystem). **Aetherfall > Projekt-Setup …** einmal ausführen, neu kompilieren lassen. |
| Im **⋮**-Menü steht kein **Knoten hinzufügen** | Das Asset ist kein Dialog (z. B. ein NPC) – das richtige Asset anklicken. |
| Bei **Nodes** wurde **+** gedrückt: der neue Eintrag ist leer, oder zwei Knoten ändern sich gleichzeitig | Unity legt bei **+** in dieser Liste einen leeren Eintrag oder einen Verweis auf den vorigen Knoten an, solange die Typauswahl für Knoten fehlt (Abschnitt 12.4). Den neuen Eintrag mit Rechtsklick > **Delete Array Element** löschen und Knoten über **⋮ > Knoten hinzufügen** anlegen. **Dialoge prüfen** meldet leere Einträge als „Knoten fehlt oder hat einen unbekannten Typ“ und doppelte als **V01**. |
| **Dialoge prüfen** meldet **V02** „passt nicht zum Schema dlg.<region>.<npc>_<thema>“ | Nur kleine Buchstaben, Ziffern, `_` und `.`; vorne `dlg.` |
| **Dialoge prüfen** meldet **D05** (blauer Hinweis) | Knoten-ID folgt nicht n010, n020 … – erlaubt, aber unübersichtlich |
| **Dialoge prüfen** meldet **V07** obwohl es ein Ende gibt | Von diesem Knoten führt kein Weg zu einem Ende (z. B. Auswahl, deren Antworten nur zurückführen). Eine Antwort mit Ziel **Ende** ergänzen. |
| Zwei rote Tests in „…EditMode.UI“ | Erwartet bis zum Einbau (Abschnitt 3). |
| Im Testgelände passiert nichts mit NPCs | Richtig so: der Einbau ins Spiel folgt im nächsten Schritt. |

---

## 11. Dateien und wohin sie gehören

Die Daten-Assets (NPC, Dialog) legst du selbst an (Abschnitte 4 und 5). Zwei Komponenten kommen später an NPC-Objekte in der Szene; alles andere sind reine Dateien.

| Ordner | Inhalt | Kommt an … |
|---|---|---|
| `Assets/_Project/Scripts/Dialogue/` | Knoten (`LineNode`, `ChoiceNode`, `DialogueOption`, `BranchNode`, `ActionNode`, `CheckNode`, `RandomNode`, `JumpNode`, `EndNode`), `DialogueDefinition`, `DialogueRunner`, `DialogueService`, `DialogueSaveable`, `DialogueInstaller`, Proben (`SkillCheckRules`, `SkillCheckEvaluator`), Markierungen (`DialogueOptionAnalyzer`, `DialogueOptionFormatter`, `DialogueBadgeRules`), Untertitel (`SubtitlePager`, `SubtitleTiming`), Bedingungen und Aktionen, `DialogueValidator`, Menü **Dialoge prüfen** (`DialogueValidationMenu`, nur im Editor) | kein GameObject; `DialogueInstaller` als Asset in die BootConfig (Abschnitt 12.1) |
| `Assets/_Project/Scripts/NPC/` | `NpcDefinition`, `NpcService`, `NpcSaveable`, `NpcInstaller`, Beziehungsregeln, Bedingungen und Aktionen, `NpcLookModel`, **`NpcInteractable`**, **`NpcLookAt`** | `NpcInteractable` und `NpcLookAt` an das NPC-GameObject (Abschnitt 12.5); `NpcInstaller` in die BootConfig |
| `Assets/_Project/Scripts/UI/Screens/Dialogue/` | `DialogueScreen` (Ansicht), `DialogueScreenPresenter` (Logik), `DialogueScreenDirector`, `DialogueTypewriter`, `DialogueScreenPreferences`, Schnittstellen `IDialogueScreenSource`, `IDialogueScreenInput`, `DialogueScreenTexts` | kein GameObject; wird vom `UIRoot` gebaut (Abschnitt 12.2) |
| `Assets/_Project/Art/UI/Layouts/Dialogue.uxml`, `Art/UI/Styles/Dialogue.uss` | Aufbau und Aussehen des Bildschirms | Feld **Dialogue Layout** am `UIRoot` (nach dem Einbau) |
| `Assets/_Project/Scripts/Events/` | `DialogueFlowEvents.cs`, `NpcEvents.cs`, `DialogueMode.cs`, `SkillCheckType.cs` | – |
| `Assets/_Project/Tests/EditModeDialogue/` | Tests, Testdialoge, **`MuehlbachDialogueFixture`** (der GDD-Dialog als Code) | Test Runner |
| `Assets/_Project/Tests/EditModeDialogue/Screen/` | Tests des Bildschirms (ohne Unity-Oberfläche) | Test Runner |
| `Tools/Preview/ui/vorschau_dialog.cjs`, `szenen_dialog.js` | Vorschaubilder des Bildschirms | – |
| `Assets/_Project/Data/NPCs/`, `Data/Dialogues/` (von dir angelegt) | NPC- und Dialog-Assets | in den Inhaltskatalog (Abschnitt 12.6) |

---

## 12. Integration (für den nächsten Schritt)

Dieser Abschnitt ist die Arbeitsliste für Claude beim Einbau ins Spiel. Du musst hier nichts tun. Alle Änderungen unten wurden in einer **Kopie** des Projekts (Stand dieses Schritts) angewendet und mit dem Harness geprüft: **1618 Tests grün, 887 ohne Pakete grün, keine Lint-Meldung**, Editor-Assemblies kompilieren. Auf dem Zwischenstand `8f09ff2` des Haupt-Branches („WIP: Quest-Einbindung …“) kompilieren Dialog und NPC ebenfalls fehlerfrei; der Zwischenstand selbst hatte zu diesem Zeitpunkt eigene, davon unabhängige Fehler in `UI.Screens`.

### 12.1 BootConfig (Reihenfolge der Installer, Architektur 4.1)

| Installer (Asset unter `Assets/_Project/Settings/Boot/`) | Menü zum Anlegen | muss hinter … stehen | stellt bereit |
|---|---|---|---|
| `DialogueInstaller.asset` | Create > Aetherfall > Boot > Installer: Dialoge | InventoryInstaller (braucht `IInventoryService`), SaveInstaller, GameStateInstaller, ContentInstaller | `IDialogueService`, `IDialogueMemory`, `IDialogueCheckStats`, `IDialogueWallet` |
| `NpcInstaller.asset` | Create > Aetherfall > Boot > Installer: NPCs | DialogueInstaller; **vor** QuestInstaller | `INpcService`, `IDialogueSpeakerDirectory` |

- Feld **Check Mode** am `DialogueInstaller`: **Deterministic** (Standard, GDD-Empfehlung) oder **Dice** (offene Entscheidung, siehe Abschnitt 13).
- Der `DialogueService` holt Sprecher und Spieltag in `PostInitialize` (deshalb darf der NpcInstaller hinter ihm stehen) und ist `ISessionService`: `EndSession()` beendet ein laufendes Gespräch still. Auf dem Haupt-Branch ruft `SessionLifecycle` das beim Wechsel ins Hauptmenü auf – sonst bliebe der Dialog-Bildschirm über dem Hauptmenü offen.
- Saveables registrieren sich selbst: `dialogue` (Reihenfolge 60), `npcs` (70). Laden während eines Gesprächs beendet es ohne Ereignisse.
- Im Testgelände-Generator (geprüft): in `TestGroundPaths`

```csharp
        /// <summary>Installer asset of the dialogue system.</summary>
        public const string DialogueInstallerPath = "Assets/_Project/Settings/Boot/DialogueInstaller.asset";

        /// <summary>Installer asset of the NPC system.</summary>
        public const string NpcInstallerPath = "Assets/_Project/Settings/Boot/NpcInstaller.asset";
```

  in `TestGroundAssets` (hinter `EnsureItemInstallersInBootConfig`)

```csharp
        /// <summary>Dialogue and NPC installers into the BootConfig: DialogueInstaller after InventoryInstaller, NpcInstaller after it.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the BootConfig contains both installers afterwards.</returns>
        public static bool EnsureDialogueInstallersInBootConfig(TestGroundReport report)
        {
            bool dialogue = EnsureInstallerInBootConfig<Aetherfall.Dialogue.DialogueInstaller>(TestGroundPaths.DialogueInstallerPath, report,
                typeof(InventoryInstaller), typeof(SaveInstaller), typeof(GameStateInstaller));
            return dialogue && EnsureInstallerInBootConfig<Aetherfall.NPC.NpcInstaller>(TestGroundPaths.NpcInstallerPath, report,
                typeof(Aetherfall.Dialogue.DialogueInstaller));
        }
```

  in `TestGroundMenu` direkt nach `TestGroundAssets.EnsureItemInstallersInBootConfig(…)` die Zeile `TestGroundAssets.EnsureDialogueInstallersInBootConfig(report);`, und in `Aetherfall.EditorTools.World.asmdef` die Verweise `"Aetherfall.Dialogue"`, `"Aetherfall.NPC"`. Wenn der QuestInstaller im Generator schon eingetragen wird, den NpcInstaller zusätzlich **vor** ihn setzen (Quest-Bedingungen wie **NPC > Lebt** fragen `INpcService` erst zur Laufzeit ab, die Reihenfolge ist also nur sauberer, nicht zwingend).

### 12.2 Dialog-Bildschirm einbauen

1. **`Assets/_Project/Scripts/UI/Screens/Aetherfall.UI.Screens.asmdef`**: bei `references` `"Aetherfall.Dialogue"` und `"Unity.InputSystem"` ergänzen (Dialogue ist Nr. 17 < UI.Screens; beide stehen schon unter denselben `defineConstraints`).
2. **Neue Datei `Assets/_Project/Scripts/UI/Screens/Dialogue/DialogueServiceScreenSource.cs`** (verbindet Bildschirm und Dienst):

```csharp
using System;
using System.Collections.Generic;
using Aetherfall.Dialogue;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Connects the dialogue screen with the dialogue service: turns the <see cref="DialogueView"/> into what the screen shows
    /// (mode, speaker, subtitle pages, answers with tag and symbol) and passes continue, choose and back on.
    /// </summary>
    public sealed class DialogueServiceScreenSource : IDialogueScreenSource
    {
        private static readonly IReadOnlyList<string> NoPages = Array.Empty<string>();

        private readonly IDialogueService _service;

        /// <summary>Creates the adapter.</summary>
        /// <param name="service">Dialogue service.</param>
        public DialogueServiceScreenSource(IDialogueService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public int Revision => _service.View.Revision;

        /// <inheritdoc />
        public DialogueScreenMode Mode
        {
            get
            {
                switch (_service.View.State)
                {
                    case DialogueViewState.Line: return DialogueScreenMode.Line;
                    case DialogueViewState.Choice: return DialogueScreenMode.Choice;
                    default: return DialogueScreenMode.None;
                }
            }
        }

        /// <inheritdoc />
        public string SpeakerName => _service.View.Line != null ? _service.View.Line.SpeakerName : string.Empty;

        /// <inheritdoc />
        public IReadOnlyList<string> LinePages => _service.View.Line != null ? _service.View.Line.Pages : NoPages;

        /// <inheritdoc />
        public float LineSeconds => _service.View.Line != null ? _service.View.Line.DisplaySeconds : 0f;

        /// <inheritdoc />
        public int OptionCount => _service.View.Options.Count;

        /// <inheritdoc />
        public int BackOptionIndex => _service.View.BackOptionIndex;

        /// <inheritdoc />
        public bool CanCancel => _service.View.CanCancel;

        /// <inheritdoc />
        public DialogueScreenOption GetOption(int index)
        {
            DialogueOptionView option = _service.View.Options[index];
            return new DialogueScreenOption(option.Text, option.TagText, TagOf(option.Tag), DialogueOptionFormatter.SymbolText(option.Symbol),
                option.IsEnabled, option.IsAlreadyChosen, option.RequiresHold, option.AttributeKey);
        }

        /// <inheritdoc />
        public void Continue()
        {
            _service.Continue();
        }

        /// <inheritdoc />
        public void Choose(int index)
        {
            _service.Choose(index);
        }

        /// <inheritdoc />
        public void Back()
        {
            _service.Back();
        }

        private static DialogueScreenTag TagOf(DialogueOptionTag tag)
        {
            switch (tag)
            {
                case DialogueOptionTag.Check: return DialogueScreenTag.Check;
                case DialogueOptionTag.Bribe: return DialogueScreenTag.Bribe;
                case DialogueOptionTag.Requirement: return DialogueScreenTag.Requirement;
                case DialogueOptionTag.Combat: return DialogueScreenTag.Combat;
                case DialogueOptionTag.Kill: return DialogueScreenTag.Kill;
                case DialogueOptionTag.Trade: return DialogueScreenTag.Trade;
                case DialogueOptionTag.End: return DialogueScreenTag.End;
                default: return DialogueScreenTag.None;
            }
        }
    }
}
```

3. **Neue Datei `Assets/_Project/Scripts/UI/Screens/Dialogue/DialogMapScreenInput.cs`** (liest die Action Map „Dialog“):

```csharp
using System;
using Aetherfall.Input;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Reads the action map "Dialog" (GDD 03 1.5) for the dialogue screen: DialogNavigate, DialogSubmit (A / Cross / E / Space
    /// / Enter / left mouse button), DialogBack (B / Circle / right mouse button) and, once they exist in
    /// GameInputBindings, DialogDirect1-9 (keys 1-9) and DialogAuto (X / F). Active only while the input service
    /// has the Dialog map on (game state Dialogue; off under the pause menu).
    /// </summary>
    public sealed class DialogMapScreenInput : IDialogueScreenInput
    {
        /// <summary>Name prefix of the direct choice actions ("DialogDirect1" ... "DialogDirect9").</summary>
        public const string DirectPrefix = "DialogDirect";

        /// <summary>Name of the action that switches automatic continue.</summary>
        public const string AutoName = "DialogAuto";

        private readonly IInputService _input;
        private readonly InputAction _navigate;
        private readonly InputAction _submit;
        private readonly InputAction _back;
        private readonly InputAction[] _direct = new InputAction[9];
        private readonly InputAction _auto;

        /// <summary>Creates the reader.</summary>
        /// <param name="input">Input service.</param>
        public DialogMapScreenInput(IInputService input)
        {
            _input = input ?? throw new ArgumentNullException(nameof(input));
            InputActionMap map = input.Actions.Dialog;
            _navigate = map.FindAction(InputActionNames.Dialog.DialogNavigate, true);
            _submit = map.FindAction(InputActionNames.Dialog.DialogSubmit, true);
            _back = map.FindAction(InputActionNames.Dialog.DialogBack, true);
            for (int i = 0; i < _direct.Length; i++)
            {
                _direct[i] = map.FindAction(DirectPrefix + (i + 1), false);
            }

            _auto = map.FindAction(AutoName, false);
        }

        /// <inheritdoc />
        public bool IsActive => _input.ActiveMap == ActionMapId.Dialog;

        /// <inheritdoc />
        public void Read(ref DialogueInputFrame frame)
        {
            Vector2 navigate = _navigate.ReadValue<Vector2>();
            frame.NavigateX = navigate.x;
            frame.NavigateY = navigate.y;
            frame.SubmitPressed = _submit.WasPressedThisFrame();
            frame.SubmitHeld = _submit.IsPressed();
            frame.BackPressed = _back.WasPressedThisFrame();
            for (int i = 0; i < _direct.Length; i++)
            {
                if (_direct[i] != null && _direct[i].WasPressedThisFrame())
                {
                    frame.DirectNumber = i + 1;
                    break;
                }
            }

            frame.AutoTogglePressed = _auto != null && _auto.WasPressedThisFrame();
        }
    }
}
```

4. **`UIRoot.cs`** (geprüfte Änderungen):
   - `using Aetherfall.Dialogue;` und `using Aetherfall.UI.Screens.Dialogue;` ergänzen.
   - Neues Feld unter `toastEntryLayout`:

```csharp
        [Tooltip("Dialogue.uxml (Dialog-Bildschirm: Untertitel und Antworten)")]
        [SerializeField] private VisualTreeAsset dialogueLayout = null;
```

   - Felder unter `_deathScreen`:

```csharp
        private DialogueScreen _dialogueScreen;
        private DialogueScreenDirector _dialogueDirector;
        private readonly DialogueScreenPreferences _dialoguePreferences = new DialogueScreenPreferences();
```

   - in `Build()` nach `_ui.RegisterScreen(_deathScreen);` die Zeile `BuildDialogueScreen(screensRoot);`, und die Methode:

```csharp
        private void BuildDialogueScreen(VisualElement screensRoot)
        {
            // Without DialogueInstaller in the BootConfig, or without the layout, there is simply no dialogue screen.
            if (dialogueLayout == null || !Services.Locator.TryGet(out IDialogueService dialogues))
            {
                Log.Warning(LogCategory.UI, "UIRoot: no dialogue screen (field 'Dialogue Layout' empty or DialogueInstaller missing).");
                return;
            }

            var source = new DialogueServiceScreenSource(dialogues);
            _dialogueScreen = new DialogueScreen(CloneScreen(dialogueLayout, screensRoot), _glyphs, source, new DialogMapScreenInput(_input),
                _dialoguePreferences);
            _ui.RegisterScreen(_dialogueScreen);
            _dialogueDirector = new DialogueScreenDirector(_ui, _dialogueScreen, source);
        }
```

   - in `Update()` nach `_director.Update(dt);`: `if (_dialogueDirector != null) { _dialogueDirector.Update(); }`
   - in `OnGlyphsChanged()`: `if (_dialogueScreen != null) { _dialogueScreen.RefreshGlyphs(); }`
   - Der Generator der Oberfläche (`TestGroundUiBuilder` bzw. **Aetherfall > Oberflaeche einrichten**) muss das neue Feld **Dialogue Layout** mit `Assets/_Project/Art/UI/Layouts/Dialogue.uxml` füllen.
   - **`UiStateDirector`** braucht keine Änderung: Im Zustand „Dialog“ schließt er Haupt-, Pause- und Todesbildschirm (Standardzweig); der Dialog-Bildschirm wird vom `DialogueScreenDirector` geöffnet, solange ein Gespräch läuft. Das Pausemenü legt sich darüber; die Dialog-Eingabe ist dann aus (`IsActive` = Dialog-Map aktiv), ein laufendes Halten bricht ab. Der `UIManager` tickt alle offenen Bildschirme, also auch den Dialog-Bildschirm, obwohl die UI-Map im Dialog aus ist.
5. **Theme und Texte** (die zwei roten UI-Tests aus Abschnitt 3):
   - `Art/UI/Theme/AetherfallTheme.tss`: nach der Loading-Zeile `@import url("../Styles/Dialogue.uss");` und in `Dialogue.uxml` die Zeile `<Style src="../Styles/Dialogue.uss" />` löschen (sonst doppelt geladen; die Vorschau erkennt beides).
   - `UiTexts.cs` hinter `new UiTextEntry("hint-hold", …)`:

```csharp
            new UiTextEntry("dialogue-hint-continue", "Weiter"),
            new UiTextEntry("dialogue-hint-select", "Auswählen"),
            new UiTextEntry("dialogue-hint-end", "Gespräch beenden"),
            new UiTextEntry("dialogue-hint-hold", "Halten = bestätigen"),
            new UiTextEntry("dialogue-continue", "▼"),
            new UiTextEntry("dialogue-auto-on", "Automatisch weiter"),
            new UiTextEntry("dialogue-glyph-back-keyboard", "RMT"),
```

     `DialogueScreenTexts` kann bleiben (gleiche Texte, gewinnt bei Abweichung) oder auf `UiTexts.Get` umgestellt und gelöscht werden.
   - `Tests/EditModeUI/UiAssetTests.cs`, Test `StaticLabels_HaveATextEntry`: in `dynamicNames` `"dialogue-speaker", "dialogue-text", "dialogue-hint-action"` ergänzen und in der Bedingung `name.StartsWith("dialogue-option-", StringComparison.Ordinal) ||` (Antwortzeilen füllt der Code).

### 12.3 Eingabe: Direktwahl und automatisches Weiter (GDD 03 1.5)

In `InputActionNames.Dialog`:

```csharp
            /// <summary>Prefix of the direct choice actions DialogDirect1 ... DialogDirect9 (keys 1-9).</summary>
            public const string DialogDirectPrefix = "DialogDirect";
            /// <summary>Automatic continue on/off (X / F).</summary>
            public const string DialogAuto = "DialogAuto";
```

In `GameInputBindings.AddDialog` statt des TODO-Kommentars:

```csharp
            for (int i = 1; i <= 9; i++)
            {
                Button(map, Names.Dialog.DialogDirectPrefix + i, null, "<Keyboard>/" + i);
            }

            Button(map, Names.Dialog.DialogAuto, "<Gamepad>/buttonWest", "<Keyboard>/f");
            // TODO: DialogDetails (R3 / Shift), DialogLog (Y / Tab) – GDD 03 1.5.
```

Ohne diese Aktionen funktioniert alles andere; `DialogMapScreenInput` findet sie dann nur nicht.

### 12.4 Editor: Typauswahl für Knoten und Asset-Schreiber

- `Scripts/Editor/Narrative/ManagedReferenceTypeDrawer.cs`: zusätzliches Attribut `[CustomPropertyDrawer(typeof(Aetherfall.Dialogue.DialogueNode), true)]`; `Aetherfall.EditorTools.Narrative.asmdef` bekommt `"Aetherfall.Dialogue"` und `"Aetherfall.NPC"`. Dann hat die Liste **Nodes** dieselbe Typauswahl wie Quest-Ziele (Menü **Knoten > …**, die Knoten tragen schon `[TypeMenu]`), und das **+** erzeugt keine leeren Einträge mehr.
- Das Menü **Dialoge prüfen** liegt mit `#if UNITY_EDITOR` in der Laufzeit-Assembly `Aetherfall.Dialogue` (damit dieser Schritt keine bestehende Editor-Assembly ändern musste). Es kann unverändert bleiben oder nach `Editor/Narrative` umziehen (Namespace und Batchmode-Pfad in Abschnitt 6 dann anpassen).
- **Neue Datei `Assets/_Project/Scripts/Editor/Narrative/DialogueAssetWriter.cs`** (schreibt in Code gebaute Dialoge und NPCs als Assets; geprüft):

```csharp
using System;
using System.IO;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Writes dialogues and NPCs built in code (like <c>MuehlbachDialogueFixture</c>) as assets: a <see cref="DialogueDefinition"/>
    /// with the same nodes, or a <see cref="NpcDefinition"/>. Existing assets at the path are overwritten in place (the GUID and
    /// every reference to the asset stay). Used by the test ground generator; pure editor code.
    /// </summary>
    public static class DialogueAssetWriter
    {
        /// <summary>Writes a dialogue asset.</summary>
        /// <param name="spec">Dialogue built in code.</param>
        /// <param name="assetPath">Path below Assets/, ending in .asset.</param>
        /// <returns>The asset.</returns>
        public static DialogueDefinition WriteDialogue(DialogueSpec spec, string assetPath)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            DialogueDefinition asset = LoadOrCreate<DialogueDefinition>(assetPath);
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("id").stringValue = spec.Id;
            serialized.FindProperty("title").stringValue = spec.Title;
            serialized.FindProperty("mode").enumValueIndex = (int)spec.Mode;
            serialized.FindProperty("speakerId").stringValue = spec.SpeakerId;
            serialized.FindProperty("startNodeId").stringValue = spec.StartNodeId;
            serialized.FindProperty("cancelable").boolValue = spec.Cancelable;
            serialized.FindProperty("questId").stringValue = spec.QuestId;
            SerializedProperty exits = serialized.FindProperty("questExitIds");
            exits.arraySize = 0;
            foreach (string exit in spec.QuestExitIds)
            {
                exits.arraySize++;
                exits.GetArrayElementAtIndex(exits.arraySize - 1).stringValue = exit;
            }

            SerializedProperty nodes = serialized.FindProperty("nodes");
            nodes.arraySize = spec.Nodes.Count;
            for (int i = 0; i < spec.Nodes.Count; i++)
            {
                nodes.GetArrayElementAtIndex(i).managedReferenceValue = spec.Nodes[i];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        /// <summary>Writes an NPC asset.</summary>
        /// <param name="spec">NPC data.</param>
        /// <param name="assetPath">Path below Assets/, ending in .asset.</param>
        /// <returns>The asset.</returns>
        public static NpcDefinition WriteNpc(NpcSpec spec, string assetPath)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            NpcDefinition asset = LoadOrCreate<NpcDefinition>(assetPath);
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("id").stringValue = spec.Id;
            serialized.FindProperty("displayName").stringValue = spec.Name;
            serialized.FindProperty("roleName").stringValue = spec.Role;
            serialized.FindProperty("nameKnownFromStart").boolValue = spec.NameKnownFromStart;
            serialized.FindProperty("defaultDialogueId").stringValue = spec.DefaultDialogueId;
            serialized.FindProperty("level").intValue = spec.Level;
            serialized.FindProperty("greed").floatValue = spec.Greed;
            serialized.FindProperty("unbribable").boolValue = spec.Unbribable;
            serialized.FindProperty("startRelationship").intValue = spec.StartRelationship;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        private static T LoadOrCreate<T>(string assetPath) where T : ScriptableObject
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(assetPath);
            if (existing != null)
            {
                return existing;
            }

            string folder = Path.GetDirectoryName(assetPath);
            if (!string.IsNullOrEmpty(folder) && !AssetDatabase.IsValidFolder(folder))
            {
                Directory.CreateDirectory(folder);
                AssetDatabase.Refresh();
            }

            var asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, assetPath);
            return asset;
        }
    }
}
```

### 12.5 NPC im Testgelände

Im Szenen-Generator (`TestGroundSceneBuilder`, nach dem Muster der Truhen) einen NPC aufstellen:

| Teil | Einstellung |
|---|---|
| GameObject | `NPC_Harrik`, Kapsel (Höhe 2 m, Pivot am Boden), etwa 6 m vor dem Spawnpunkt, Blick zur Spielfigur; Material wie die Platzhalter |
| Collider | `CapsuleCollider` auf **Layer 10 „Interactable“** (wie die Truhen; die Interaktion sucht auf diesem Layer) |
| `NpcInteractable` | **Npc** = `Data/NPCs/Npc_Harrik.asset` (aus 12.6), **Dialogue Override** leer (nimmt den Standard-Dialog), **Priority** 20 (vor Truhen 10 und Beute 0), **Interaction Point** = Kind-Objekt in Brusthöhe (1,5 m), **Look At** = die `NpcLookAt` am selben Objekt |
| `NpcLookAt` | **Body** leer (dreht das GameObject), **Look Target** = Transform der Spielfigur, **Look Radius** 4, **Turn Speed** 180, **Glance Angle** 25 |

- Der Hinweis zeigt dann „E Sprechen: Banditenanführer“, nach dem Gespräch (Name bekannt) „Sprechen: Harrik“. Im Kampf, bei feindlichen oder toten NPCs gibt es keinen Hinweis.
- Damit `kampf` im Testgelände sichtbar wird: Die KI muss auf `INpcService.HostilityChanged` hören (Gruppe `group.banditen_muehlbach` wird feindlich) – das gibt es noch nicht; bis dahin endet der Dialog mit `DialogueEndInfo.FollowUp = Combat` und sonst passiert nichts.
- Für ein Gespräch mit Messer an der Kehle braucht es das Flag `quest.side.eichental.banditen_am_muehlbach.lokal.messer_an_kehle` (im Spiel setzt es die Quest beim Anschleichen; zum Testen per Debug-Konsole bzw. `IWorldStateDebug.TrySetFromText`).

### 12.6 Generator für den Mühlbach-Dialog (aus der Code-Vorlage)

Der GDD-Dialog steht als Code in `Tests/EditModeDialogue/MuehlbachDialogueFixture.cs` (alle 28 Knoten, Flags, Harrik). Ein Generator macht daraus Assets:

1. **Bibliothek anlegen:** `Assets/_Project/Scripts/Editor/Narrative/MuehlbachDialogueLibrary.cs` mit den Methoden `Build()`, `HarrikNpc()` und `Flags()` – Inhalt 1:1 aus der Vorlage kopieren (Editor-Code darf Testcode nicht referenzieren). Dabei die zwei **Test-Platzhalter** ersetzen:

| in der Vorlage | im Generator | Warum |
|---|---|---|
| `new SwitchOn(SwitchGrimmbartActive)` | `new QuestStatusIs("quest.bounty.eichental.grimmbart", QuestStatus.Active)` | echte Quest-Bedingung |
| `new Not(new SwitchOn(SwitchGrimmbartDone))` | `new Not(new QuestStatusIs("quest.bounty.eichental.grimmbart", QuestStatus.Completed))` | ebenso |
| `new RecordEffect("NPC+(group…, loc.eichental.lindenhain)")` (n130) | `new SetFlag("flag.eichental.banditen_in_lindenhain", 1)` bis es eine Aktion „NPC verlegen“ gibt | Platzhalter für NPC-Bewegung (GDD 02, 12.10 „NPC+“) |
| `new RecordEffect("Übrige Banditen fliehen …")` (n910) | `new SetFlag("flag.eichental.banditen_geflohen", 1)` | Platzhalter für die Welt-Reaktion |

2. **Schreiben:** im Testgelände-Generator `DialogueAssetWriter.WriteDialogue(MuehlbachDialogueLibrary.Build(), "Assets/_Project/Data/Dialogues/Eichental/Dlg_Harrik_Verhandlung.asset")` und `DialogueAssetWriter.WriteNpc(MuehlbachDialogueLibrary.HarrikNpc(), "Assets/_Project/Data/NPCs/Npc_Harrik.asset")`; die Flags aus `Flags()` als `FlagDefinition`-Assets (wie bei den Quest-Flags), die zwei Ersatz-Flags dazu.
3. **Inhaltskatalog:** Dialog, NPC und Flags in `Assets/_Project/Data/ContentCatalog.asset` eintragen; `DialogueInstaller` und `NpcInstaller` lesen über die `ContentDatabase` (`DialogueCatalog.FromDatabase`, `NpcCatalog.FromDatabase`).
4. **Prüfen:** **Aetherfall > Dialoge prüfen** muss „0 Fehler, 2 Warnung(en)“ melden: **W04** für zwei lange Antworten (n040 c mit 63 und n510 a mit 65 Zeichen; das GDD gibt sie so vor). `DialogueValidatorTests.Muehlbach_HasNoErrors_AndWarnsAboutTwoLongOptions` prüft dasselbe.
5. Optional die Test-Vorlage danach auf die Bibliothek umstellen (Test-asmdef referenziert dann `Aetherfall.EditorTools.Narrative`), damit es nur eine Quelle gibt; `RecordEffect`/`SwitchOn` bleiben nur für die Tests.

### 12.7 Quests, KI und Sonstiges

- **Quest „Banditen am Mühlbach“:** Stage `s30_verhandlung` wartet auf `DialogOutcome` mit `DialogueId = dlg.eichental.harrik_verhandlung` und einer der Ausgangs-IDs `abzug`, `vertrieben`, `muehlenwache`, `abmachung`, `kampf`, `attentat`. Dafür fehlt im Quest-System noch der Zieltyp **Überzeuge** (GDD 02, 5.3; hört auf `DialogOutcome`) – nach dem Muster von „Rede mit NPC“ (`NPCTalkedTo` sendet der Dialog schon).
- **Wähle-Ziele:** `ChoiceMade` hat als `ChoiceId` `<dialog>.<knoten>` und als `OptionId` die Antwort-ID. Soll eine Antwort eine Quest-Entscheidung melden, an der Antwort **Choice Id**/**Choice Option Id** setzen (z. B. `quest….wahl_harrik`, `verschont`).
- **KI:** `INpcService.HostilityChanged(id, feindlich)` abonnieren (Gegnergruppen tragen eine Gruppen-ID) und nach `GameLoaded` `IsHostile` abfragen (Laden sendet keine Ereignisse).
- **Debug-Overlay „Dialog“** (DevTools): `IDialogueService.View`, `DialogueService.Memory` (`DialogueDto` über `Capture()`), `INpcService.GetRelationship`; Konsolenbefehle später (`start_dialogue`, `set_relationship`).
- **Optionen-Menü:** Textgeschwindigkeit, automatisches Weiter und Lesefaktor liegen in `DialogueScreenPreferences` (wie `UiPreferences` nur für die laufende Sitzung), Einträge im Optionen-Menü fehlen noch.
- **Badge `RemoveCurrency`:** Auf dem Haupt-Branch gibt es die Aktion **Inventar > Währung entfernen**. Sie wird über den Namen schon als Bestechung erkannt, zeigt aber nur „[Gold]“ ohne Betrag (nur **Dialog > Bestechen** kennt seinen Preis). Bei Bedarf in `DialogueOptionAnalyzer.BribePrice` den Betrag von `RemoveCurrency` mitzählen (`Aetherfall.Dialogue` referenziert `Aetherfall.Inventory` schon).
- **`docs/Status.md`** um diesen Schritt ergänzen (in diesem Arbeitsschritt bewusst nicht geändert, damit das Zusammenführen einfach bleibt).

---

## 13. Hinweise, Abweichungen und offene Punkte

**Abweichungen und Entscheidungen:**

| Was | GDD/Architektur sagt | Umgesetzt | Warum |
|---|---|---|---|
| Proben | offene Entscheidung „fest oder gewürfelt“ (GDD 02, 12.3) | **fest** als Standard, Würfelmodus per Installer-Feld **Check Mode** | GDD-Empfehlung; beides getestet. Gewürfelt wird reproduzierbar (NPC, Spieltag, Dialog, Knoten), Laden und erneut versuchen ändert nichts. |
| Proben ohne Misserfolgs-Ausgang | – | zurück zur letzten Auswahl, Prüfung meldet **D06** (Hinweis) | Im festen Modus ist eine misslingende Probe ohnehin nicht wählbar. |
| Bestechung | Option „[80 Gold]“ (12.4) | Aktion **Dialog > Bestechen** im Weg hinter der Antwort; die Antwort zeigt den Preis automatisch, ist bei zu wenig Gold grau und bei unbestechlichen NPCs unsichtbar | Preis hängt von NPC (Gier) und Charisma ab, deshalb berechnet statt eingetippt. |
| Markierungen | Kennzeichnung je Option (12.4) | aus Ziel-Knoten und Aktionen abgeleitet; Raute ◆ nur ohne andere Markierung | Das Beispiel 12.10 zeigt „[80 Gold] Nehmt das Gold …“ ohne Raute. |
| Rang der Dialog-Fertigkeit | Fertigkeitsbaum | vorerst 0 (`PlayerStatsCheckSource`) | Fertigkeiten gibt es noch nicht. Stufe kommt aus dem Wert `Level` der Spieler-Werte. |
| Speichern im Dialog | „laufende Dialoge werden nicht gespeichert“ (GDD 05 5.2) | Speichersperre `dialogue` während eines Gesprächs, auch unter dem Pausemenü; Laden beendet ein Gespräch ohne Ereignisse | Gemerkt werden nur gewählte Antworten, Proben-Ergebnisse, Themen und bekannte Namen. |
| Dialog-Texte des Bildschirms | zentrale Texttabelle `UiTexts` | vorerst `DialogueScreenTexts` (gleiche Form) | `UiTexts.cs` ist eine bestehende Datei; Umzug in 12.2. |
| Tastatur-Symbol für „Zurück“ | Glyphe Back = Esc | „RMT“ (rechte Maustaste) | Esc öffnet im Dialog das Pausemenü (GDD 03 1.5); DialogBack liegt auf der rechten Maustaste. |
| Kontext über den Antworten | – | die letzte Zeile ohne Seitenumbrüche, gedimmt | Die 45-Zeichen-Umbrüche sind für Untertitel gedacht; über den Antworten passt mehr in eine Zeile (siehe `dialog.png`). |

**Noch nicht umgesetzt (TODO):**

| Was | Wo | Warum noch nicht |
|---|---|---|
| Dialogkamera (Kamera-Hinweise der Zeilen: nah, weit, über die Schulter …), Uhr anhalten im Voll-Modus | CameraSystem, GameTime | Daten sind in jeder Zeile (`Camera`, `Mode`), die Kamera-Seite fehlt (GDD 02, 12.6). |
| Barks (kurze Zurufe im Vorbeigehen) | NPC/Welt | Modus `Bark` wird nicht als Gespräch gestartet; Abspielen als Sprechblase folgt. |
| NPC-Erinnerungen (`mem.*`), Stimmung | NPC | GDD 02, 12.5; Beziehung ist fertig. |
| Tagesabläufe (Schedules) | NPC (Architektur 11.10) | für den Mini-Slice nicht nötig |
| Dialog-Protokoll (DialogLog, Y/Tab), Details (R3/Shift) | UI | GDD 03 1.5 |
| Sprachausgabe | Audio | Clip-IDs werden schon gebildet (`VO_<sprecher>_<dialog>.<knoten>`), die Anzeigedauer nimmt Cliplänge + 0,5 s, sobald es Clips gibt. |
| Lokalisierung | Lokalisierungs-Schritt | Jede Zeile und Antwort hat schon ihren Schlüssel (`<dialog>.<knoten>[.<antwort>]`, Varianten `.v1` …). |
| Grafischer Dialog-Editor (Knotenansicht) | Architektur 11.11 Stufe 2 | Knoten haben schon ein verstecktes Feld für ihre Position im Editor. |
