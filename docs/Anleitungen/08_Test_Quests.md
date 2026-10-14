# Testanleitung Phase 3: Bedingungen, Weltzustand und Quests

> Bedingungen und Aktionen, Weltzustand (Flags), Quest-System mit Zielen, Verzweigungen, Scheitern, Speichern, Quest-Prüfung · Stand: 2026-10-14 · Bezug: [Architektur 3.3, 4.3, 5, 6, 7, 8, 9, 11.7](../Technik/01_Architektur.md) · [GDD 02, Abschnitte 4–7, 10, 11](../GDD/02_Quests_und_Dialoge.md) · Master-Prompt §6.4, §6.5, §16

In diesem Schritt bekommt das Spiel sein **Quest-Gehirn**. Es gibt jetzt:

- **Bedingungen** („Ist Quest X abgeschlossen?“, „Ist Flag Y gesetzt?“) und **Aktionen** („Setze Flag“, „Starte Quest“), die du im Inspector aus einem **deutschen Auswahlmenü** zusammenklickst – mit UND, ODER und NICHT.
- Den **Weltzustand**: ein zentrales Gedächtnis der Welt aus Ja/Nein-Schaltern und Zählern (z. B. „Dorf zerstört = ja“, „getötete Banditen = 37“). Er wird gespeichert und geladen.
- Das **Quest-System**: Quests mit Stufen (Stages), 14 Zieltypen („Töte 3 Wölfe“, „Rede mit Hollmann“, „Untersuche 3 Hinweise“ …), optionalen Zielen mit Bonus, Verzweigungen („Glutfang getötet → Ende A, Splitter zerstört → Ende B“), Scheitern, Belohnungen, Folgequests, wiederholbaren Quests, höchstens 3 verfolgten Quests und dem **Entscheidungs-Ledger** („Du hast den Splitter behalten.“). Alles wird gespeichert.
- Die **Quest-Prüfung**: Menü **Aetherfall > Quests prüfen** findet Fehler in Quest-Daten (kaputte Verweise, Sackgassen, unerreichbare Stages …) nach den Regeln aus GDD 02, 10.2.

**Wichtig:** Dieser Schritt ist **noch nicht ins Spiel eingebaut**. Im Testgelände passiert deshalb noch nichts Neues – es gibt noch keine Questlog-Anzeige, keine Dialoge und keine Questgeber. Getestet wird diesmal vor allem über die **automatischen Tests** (darunter „Die Wölfe vom Nordhang“ komplett in allen drei Lösungswegen) und über den **Inspector** (Quest anlegen, Auswahlmenü, Prüfung). Der Einbau ins Spiel folgt im nächsten Schritt (siehe [Abschnitt 11, Integration](#11-integration-für-den-nächsten-schritt)).

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 06](./06_Test_Items_Loot.md) sind erledigt.

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Automatische Tests im Test Runner](#3-automatische-tests-im-test-runner)
4. [Ein Flag anlegen](#4-ein-flag-anlegen)
5. [Eine kleine Test-Quest anlegen](#5-eine-kleine-test-quest-anlegen)
6. [Quests prüfen](#6-quests-prüfen)
7. [Prüfliste](#7-prüfliste)
8. [Was du zurückmelden sollst](#8-was-du-zurückmelden-sollst)
9. [Häufige Fehler und Lösungen](#9-häufige-fehler-und-lösungen)
10. [Dateien und wohin sie gehören](#10-dateien-und-wohin-sie-gehören)
11. [Integration (für den nächsten Schritt)](#11-integration-für-den-nächsten-schritt)
12. [Hinweise, Abweichungen und offene Punkte](#12-hinweise-abweichungen-und-offene-punkte)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Bedingungen & Aktionen** (`Aetherfall.Conditions`, neu, Assembly Nr. 5) | Grundbausteine `Condition` (Bedingung) und `GameAction` (Aktion). Logik: **UND (alle)**, **ODER (eines)**, **NICHT**, **Mindestens n von m**, **Immer**, **Nie** und die Aktion **Wenn – dann – sonst**. Jede Bedingung meldet, welche Ereignisse sie ändern können; der **ConditionWatcher** prüft sie nur dann neu (ereignisgetrieben, höchstens 0,5 ms pro Bild). Bedingungen ohne solche Meldung prüft er einmal pro Sekunde. Dazu ein **Prüfbericht** (`ValidationReport`) für Fehlermeldungen mit Ort („quest… / s20 / o1“). |
| **Weltzustand** (`Aetherfall.WorldState`, neu) | Flags als Ja/Nein (Bool), Zähler, Aufzählung (Enum, z. B. 1 = getötet, 2 = vertrieben) und Story-Zahl mit Min/Max. **Flag-Definitionen** als Assets schützen vor Tippfehlern: Unbekannte IDs werden trotzdem gespeichert, aber im Log gemeldet. Jede echte Änderung sendet `FlagChanged`. Speichert nur geänderte Werte samt Spielzeit der Änderung (für „Flag seit mindestens 15 Stunden“). Debug-Abfragen für die spätere Konsole (`list_flags`, `get_flag`, `set_flag`), Änderungsverlauf (letzte 200) und „alles zurücksetzen, was Quest X geschrieben hat“. Bedingungen **Welt/Flag** und **Welt/Flag seit mindestens n Stunden**, Aktionen **Welt/Flag setzen** und **Welt/Flag erhöhen**. |
| **Quest-System** (`Aetherfall.Quests`, neu) | `QuestDefinition` (Asset) mit allen Feldern aus GDD 02, 4.1 (Titel, Kategorie, Questgeber mit Ersatz, Startauslöser, Startbedingungen, Start-Stage, Belohnungen, Folgequests, wiederholbar, Scheitern, Kette, Ledger, Begleiter-Reaktionen, Produktionsdaten). Stages mit allen Feldern aus 4.2 (Questlog-Text, Erkundungshinweis, Ziele, Modus alle/eines/mindestens n, optionale Ziele mit Bonus-Aktionen, Aktionen beim Start/Abschluss, Verzweigungen mit Standard-Ausgang, Fehlschlag-Regeln, Endstage Erfolg/Misserfolg, Ledger-Eintrag, Speichersperre, Marker). **14 Zieltypen** (Liste unten). `QuestService`: Start mit Startbedingungen, Fortschritt über Ereignisse, Stage-Wechsel, Abschluss mit Belohnungen, Scheitern, Abklingzeit bei Wiederholung, Folgequests, höchstens 3 verfolgte Quests mit Fokus-Quest, Ledger, Entscheidungen, Debug-Funktionen (Ziel erfüllen, zu Stage springen, Quest zurücksetzen). Questgeber-Verfügbarkeit (`QuestAvailabilityChanged` für die „!“-Symbole). Speichern im Abschnitt `quests`. |
| **Ereignisse** (`Aetherfall.Events`, neue Dateien) | `FlagChanged`, `QuestStarted`, `QuestStageChanged`, `QuestCompleted`, `QuestFailed`, `ObjectiveProgressed`, `QuestAvailabilityChanged`, dazu die Ziel-Ereignisse `NPCTalkedTo`, `DialogOutcome`, `ChoiceMade`, `ItemDelivered`, `AreaEntered`, `ClueInspected`, `TrailNodeReached`, `EnemyDefeated`, `BossDefeated`, `AbilityUsedAt`, `TimeOfDayChanged` (Namen und Inhalt laut Architektur 4.3). |
| **Editor** (`Aetherfall.EditorTools.Narrative`, neu) | **Typauswahl** für Bedingungen, Aktionen und Ziele: ein Knopf mit Suchmenü und deutschen Menüpfaden, Kopfzeile mit Kurzbeschreibung, Rechtsklick **Kopieren / Einfügen / Leeren**. Menü **Aetherfall > Quests prüfen** mit Ergebnisfenster. |
| **Tests** | 188 neue automatische Testfälle (insgesamt jetzt 1234, davon 721 auch ohne Pakete) für Weltzustand, Bedingungen, alle Zieltypen, Quest-Ablauf, Verzweigung, Scheitern, Speichern und Laden mitten in einer Quest, Quest-Prüfung, Typauswahl – und **„Die Wölfe vom Nordhang“ komplett** (alle drei Wege, Speichern mitten auf der Spur, Folgequest). |

**Die 14 Zieltypen** (Menü **Ziele/…**, Kürzel aus GDD 02, 5.1):

| Menüpfad | Kürzel | Erfüllt durch Ereignis | Sender im Spiel |
|---|---|---|---|
| Töte Gegner (Anzahl) | `Töte` | `EnemyKilled` (Typ, Variante, Gebiet) | KI – **gibt es schon** |
| Töte bestimmten Gegner | `TöteBestimmten` | `EnemyKilled` (Spawner-/Boss-ID), `BossDefeated`, optional `EnemyDefeated` | KI – Boss-Ereignisse fehlen noch |
| Sammle Items | `Sammle` | `InventoryChanged` (zählt das Inventar, kann wieder sinken) | Inventar – **gibt es schon** |
| Bringe Item zu NPC | `Bringe` | `ItemDelivered` | fehlt noch (Dialog/Übergabe) |
| Rede mit NPC | `Rede` | `NPCTalkedTo` | fehlt noch (Dialoge) |
| Gehe zu Ort | `GeheZu` | `AreaEntered` | fehlt noch (Orts-Zonen) |
| Interagiere mit Objekt | `Interagiere` | `Interacted` (auch Gruppen wie `obj.eichental.strohziel_*`) | Interaktion – **gibt es schon** |
| Wähle eine Seite (Entscheidung) | `Wähle` | `ChoiceMade` | fehlt noch (Dialoge) |
| Warte bis Tageszeit | `WarteBis` | `TimeOfDayChanged` | fehlt noch (Spieluhr) |
| Untersuche Hinweise | `Untersuche` | `ClueInspected` | fehlt noch (Untersuchen) |
| Folge einer Spur | `Folge` | `TrailNodeReached` | fehlt noch (Spur-Knoten) |
| Fähigkeit einsetzen | `Fähigkeit` | `AbilityUsedAt` | fehlt noch (Fähigkeiten) |
| Erreiche Ort in Zeit | `ZeitLauf` | `AreaEntered` + Zeitlimit | fehlt noch (Orts-Zonen) |
| Bedingung erfüllt | `Bedingung` | jede Bedingung (z. B. „Flag gesetzt“) | Weltzustand – **gibt es schon** |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Es sind rund 190 neue Dateien, das dauert etwas.
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

Es kommen **keine neuen Pakete** dazu. Ein **neues Testgelände ist nicht nötig**.

---

## 3. Automatische Tests im Test Runner

Das ist diesmal der wichtigste Test.

1. Menü **Window > General > Test Runner** öffnen.
   **Du siehst danach:** das Fenster **Test Runner** mit den Reitern **EditMode** und **PlayMode**.
2. Reiter **EditMode** wählen.
3. Oben **Run All** klicken.
   **Du siehst danach:** nach einer Weile (bis zu einer Minute) grüne Haken. Neu sind die Gruppen **Aetherfall.Tests.EditMode.Quests** und **Aetherfall.Tests.EditMode.Conditions**.
4. Die Gruppe **Aetherfall.Tests.EditMode.Quests** aufklappen und darin **WolvesQuestTests**.
   **Du siehst danach:** u. a. `WayOfTheFight_KillGlutfang_EndsAtS50Kampf`, `WayOfStealth_DestroyTheSplinterByDay_…`, `WayOfGreed_RecoverTheSplinter_…` und `SaveAndLoad_InTheMiddleOfTheTrail_…` – alle grün. Diese Tests spielen „Die Wölfe vom Nordhang“ vom Prolog bis zum Gespräch mit Hollmann durch.

Ist ein Test **rot**: anklicken, unten erscheint die Meldung. Bitte den Text abschreiben bzw. einen Screenshot machen und an Claude schicken.

Für Claude auf deinem PC (ohne Klicks, Windows-Beispiel, Pfad anpassen):

```
"C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults Logs\editmode-results.xml -logFile Logs\editmode.log
```

---

## 4. Ein Flag anlegen

Flags sind die Schalter des Weltzustands. Jedes Flag bekommt eine kleine Datei (Asset), damit man IDs nicht vertippen kann.

1. Im **Project**-Fenster den Ordner `Assets/_Project/Data` öffnen. Rechtsklick > **Create > Folder**, Name `WorldState`.
2. Rechtsklick in den neuen Ordner > **Create > Aetherfall > Welt > Flag**. Name: `Flag_Pim_Fieber_Bekannt`.
   **Du siehst danach:** im **Inspector** die Felder **Id**, **Status**, **Kind**, **Default Value**, **Min**, **Max**, **Enum Values**, **Description**, **Carry To New Game Plus**. Zu jedem Feld erscheint ein deutscher Hinweis, wenn du mit der Maus darüber fährst.
3. **Id**: `flag.eichental.pim_fieber_bekannt` eintippen. **Kind**: **Bool**. **Description**: „Hollmann hat von Pims Fieber erzählt (Wölfe vom Nordhang).“
4. Noch ein Flag: Rechtsklick > **Create > Aetherfall > Welt > Flag**, Name `Flag_Woelfe_Ausgang`. **Id**: `flag.eichental.woelfe_ausgang`, **Kind**: **Enum**. Bei **Enum Values** mit **+** vier Einträge anlegen: `unbekannt`, `Kampf`, `zerstört`, `geborgen`.

---

## 5. Eine kleine Test-Quest anlegen

Hier probierst du die **Typauswahl** aus. Die Quest ist absichtlich klein (zwei Stages).

1. Im Ordner `Assets/_Project/Data` einen Ordner `Quests` anlegen. Rechtsklick hinein > **Create > Aetherfall > Quests > Quest**. Name: `Quest_Test_Hollmann`.
   **Du siehst danach:** im Inspector die Abschnitte **Anzeige**, **Start**, **Stages**, **Belohnungen und Folgen**, **Scheitern**, **Kette und Entscheidungen**, **Produktion**.
2. **Id**: `quest.side.eichental.test_hollmann`. **Title**: „Test bei Hollmann“. **Description**: „Ein kurzer Test.“ **Giver Id**: `npc.eichental.bauer_hollmann`.
3. Bei **Start Condition** steht ein Knopf **(keine – Typ wählen)**. Draufklicken.
   **Du siehst danach:** ein Menü **Bedingung wählen** mit Suchfeld und den Ordnern **Logik**, **Quest**, **Welt**.
4. **Welt > Flag** wählen.
   **Du siehst danach:** Der Knopf zeigt jetzt „Flag – Flag ? = 1“. Links ein kleiner Pfeil zum Aufklappen. Aufklappen und bei **Flag Id** `flag.eichental.pim_fieber_bekannt` eintragen. Die Kopfzeile zeigt dann „Flag flag.eichental.pim_fieber_bekannt = 1“.
5. Bei **Stages** auf **+** klicken. Im neuen Eintrag: **Id** `s10`, **Journal Text** „Sprich mit Hollmann.“.
6. In dieser Stage bei **Objectives** auf **+** klicken, dann auf **(keine – Typ wählen)** > **Ziele > Rede mit NPC**. Aufklappen, **Id** `o1`, **Npc Id** `npc.eichental.bauer_hollmann`.
7. In derselben Stage bei **On Complete** auf **+** > **(keine – Typ wählen)** > **Welt > Flag setzen**. **Flag Id** `flag.eichental.woelfe_ausgang`, **Value** `2`.
8. **Default Next Stage Id**: `s20`.
9. Zweite Stage mit **+** anlegen. Unity kopiert dabei die erste – das ist normal. Ziele und Aktionen der Kopie sind **eigene** Kopien (die Typauswahl trennt sie automatisch vom Original). Ändere **Id** auf `s20`, **Journal Text** auf „Fertig.“, **Default Next Stage Id** leeren und **End Type** auf **Success** stellen.
10. **Rewards** lässt du absichtlich leer – die Prüfung in Abschnitt 6 soll das melden.
11. Rechtsklick auf die Kopfzeile einer Bedingung oder Aktion (dort, wo der Typ steht).
    **Du siehst danach:** ein kleines Menü **Kopieren**, **Einfügen**, **Leeren**.
12. **File > Save Project** (oder Strg+S / Cmd+S).

---

## 6. Quests prüfen

1. Menü **Aetherfall > Quests prüfen**.
   **Du siehst danach:** ein Fenster **Quests prüfen** mit der Zusammenfassung „1 Quest(s) geprüft: 0 Fehler, 3 Warnung(en).“ und einer Liste. Jede Zeile hat ein Symbol (rot = Fehler, gelb = Warnung, blau = Hinweis), den Regel-Code und eine deutsche Meldung: **W01** „Keine Belohnung“, zweimal **V16** („wird gelesen, aber … nie geschrieben“ bzw. „wird geschrieben, aber … nie gelesen“ – Dialoge, die solche Flags setzen, gibt es noch nicht). In der Console stehen dieselben Meldungen.
2. Mit **Zeigen** springt Unity zum Quest-Asset.
3. Absichtlich einen Fehler einbauen: in Stage `s10` bei **Default Next Stage Id** `s99` eintragen. Oben im Fenster **Erneut prüfen** klicken.
   **Du siehst danach:** rote Einträge **V04** „Standard-Ausgang zeigt auf unbekannte Stage 's99'.“, **V05** „'s20' ist von der Start-Stage 's10' aus nicht erreichbar.“ und **V08** „Keine erreichbare Erfolgs-Endstage …“.
4. Den Fehler wieder zurücksetzen (`s20`) und **Erneut prüfen**: die roten Einträge sind weg.
5. Noch ein Versuch: bei **Flag Id** der Bedingung `flag.eichental.pim_fiber_bekannt` (Tippfehler) eintragen und **Erneut prüfen**.
   **Du siehst danach:** **V04** „Flag 'flag.eichental.pim_fiber_bekannt' ist nicht definiert (FlagDefinition fehlt). Meintest du 'flag.eichental.pim_fieber_bekannt'?“

Die Test-Quest und die Flags darfst du danach löschen oder behalten. Sie stören nichts.

---

## 7. Prüfliste

| # | Prüfung | Erwartung |
|---|---|---|
| 1 | Console nach dem Kompilieren | keine roten Fehler |
| 2 | Test Runner, EditMode, **Run All** | alles grün, Gruppen „…Quests“ und „…Conditions“ vorhanden |
| 3 | **Create > Aetherfall > Welt > Flag** | Flag-Asset mit deutschen Hinweisen |
| 4 | **Create > Aetherfall > Quests > Quest** | Quest-Asset mit Abschnitten Anzeige, Start, Stages … |
| 5 | Knopf **(keine – Typ wählen)** bei **Start Condition** | Menü **Bedingung wählen** mit Suche und Ordnern Logik/Quest/Welt |
| 6 | Ziele-Liste einer Stage, **+** und Typ wählen | Menü **Ziel wählen** mit 14 Einträgen unter **Ziele** |
| 7 | Aktionen (**On Start**, **On Complete**, **Rewards**) | Menü **Aktion wählen** mit Logik/Quest/Welt |
| 8 | Kopfzeile zeigt Kurztext | z. B. „Rede mit NPC – o1: Rede(npc.eichental.bauer_hollmann)“ |
| 9 | Rechtsklick auf Kopfzeile | **Kopieren**, **Einfügen**, **Leeren** funktionieren |
| 10 | Neuer Listeneintrag mit **+** | eigener Eintrag, ändert den vorherigen nicht mit |
| 11 | **Aetherfall > Quests prüfen** | Fenster mit Zusammenfassung; eingebaute Fehler werden gemeldet |
| 12 | **Gamepad** | Für die Editor-Fenster nicht nötig (Spieler-Oberflächen kommen mit Questlog/HUD) |

---

## 8. Was du zurückmelden sollst

- Ergebnis von **Run All** im Test Runner (Anzahl grün/rot; bei Rot den Text).
- Ob das Auswahlmenü bei Bedingungen, Aktionen und Zielen erscheint und ob die Kopfzeile den Kurztext zeigt.
- Ob beim **+** in einer Ziele-Liste ein **eigener** Eintrag entsteht (Schritt 9 in Abschnitt 5: Ändere die Ziel-ID der zweiten Stage und schau, ob die der ersten gleich bleibt).
- Was das Fenster **Quests prüfen** anzeigt (Screenshot genügt).
- Alle roten Meldungen aus der Console (Screenshot oder abschreiben).

---

## 9. Häufige Fehler und Lösungen

| Problem | Lösung |
|---|---|
| Rote Fehler in der Console mit `Aetherfall.Quests`, `Aetherfall.WorldState` oder `Aetherfall.Conditions` | Screenshot an Claude. Diese Bausteine liefen noch nie in Unity, nur im Prüfprogramm (Harness). |
| Das Menü **Aetherfall > Quests prüfen** fehlt | Das Paket **Newtonsoft Json** fehlt. Menü **Aetherfall > Projekt-Setup …** einmal ausführen (installiert es), danach neu kompilieren lassen. |
| Bei **Start Condition** erscheint kein Knopf, sondern nur ein grauer Text | Screenshot an Claude (dann greift die Typauswahl in deiner Unity-Version nicht; Rückfall laut Architektur 7.4 wäre ein fertiges kostenloses Paket). |
| Nach **+** in einer Liste ändern sich zwei Einträge gleichzeitig | Den neuen Eintrag mit Rechtsklick > **Leeren** leeren und den Typ neu wählen. Bitte an Claude melden. |
| „Keine FlagDefinitions gefunden – Flag-IDs nicht geprüft“ | Normal, solange es keine Flag-Assets gibt (Abschnitt 4). |
| Im Spiel passiert nichts mit Quests | Richtig so: der Einbau ins Spiel folgt im nächsten Schritt. |
| Test Runner zeigt keine Gruppe „…Quests“ | **Edit > Preferences > General > Auto Refresh** prüfen oder **Assets > Refresh**. Fehlt Newtonsoft (siehe oben), werden diese Tests absichtlich nicht gebaut. |

---

## 10. Dateien und wohin sie gehören

Alle Skripte sind reine Dateien im Projekt; du musst nichts an GameObjects hängen. Kein Skript in diesem Schritt ist ein MonoBehaviour – die Dienste laufen später über die Installer in der BootConfig.

| Ordner | Inhalt | Kommt an … |
|---|---|---|
| `Assets/_Project/Scripts/Conditions/` | `Condition`, `GameAction`, Logik-Typen, `ConditionWatcher`, `ConditionsInstaller`, `TypeMenuAttribute`, Prüfbericht | kein GameObject; `ConditionsInstaller` als Asset in die BootConfig (Abschnitt 11) |
| `Assets/_Project/Scripts/WorldState/` | `WorldStateService`, `FlagDefinition`, `FlagIs`, `FlagAge`, `SetFlag`, `AddToFlag`, `WorldStateSaveable`, `WorldStateInstaller` | kein GameObject; `WorldStateInstaller` in die BootConfig |
| `Assets/_Project/Scripts/Quests/` | `QuestDefinition`, `StageDefinition`, 14 Zieltypen, Quest-Bedingungen und -Aktionen, `QuestService`, `QuestSaveable`, `QuestValidator`, `QuestInstaller` | kein GameObject; `QuestInstaller` in die BootConfig |
| `Assets/_Project/Scripts/Events/` | `QuestEvents.cs`, `WorldStateEvents.cs`, `DialogueEvents.cs`, `ExplorationEvents.cs`, `EncounterEvents.cs`, `TimeEvents.cs`, `ItemDelivered.cs`, `DayPhase.cs` | – |
| `Assets/_Project/Scripts/Editor/Narrative/` | Typauswahl (`ManagedReferenceTypeDrawer`, `TypeMenuCatalog`, `TypeMenuDropdown`), Menü **Quests prüfen** und Ergebnisfenster | nur im Editor |
| `Assets/_Project/Tests/EditModeConditions/` | Tests der Bedingungen (laufen auch ohne Pakete) | Test Runner |
| `Assets/_Project/Tests/EditModeQuests/` | Tests für Weltzustand, Quests, Prüfung, Typauswahl, „Die Wölfe vom Nordhang“ | Test Runner |
| `Assets/_Project/Data/WorldState/` (von dir angelegt) | Flag-Assets | in den Inhaltskatalog (Abschnitt 11) |
| `Assets/_Project/Data/Quests/` (von dir angelegt) | Quest-Assets | in den Inhaltskatalog (Abschnitt 11) |

---

## 11. Integration (für den nächsten Schritt)

Dieser Abschnitt ist die Arbeitsliste für Claude beim Einbau ins Spiel. Du musst hier nichts tun.

**11.1 BootConfig (Reihenfolge der Installer, Architektur 4.1):**

| Installer (Asset unter `Assets/_Project/Settings/Boot/`) | Menü zum Anlegen | muss hinter … stehen | braucht |
|---|---|---|---|
| `ConditionsInstaller.asset` | Create > Aetherfall > Boot > Installer: Bedingungen | EventBusInstaller (sinnvoll: hinter GameTimeInstaller) | `IEventBus` |
| `WorldStateInstaller.asset` | Create > Aetherfall > Boot > Installer: Weltzustand | ConditionsInstaller, SaveInstaller, GameTimeInstaller, ContentInstaller | `IEventBus`, `IContentDatabase`, `ISaveManager`, `IPlaytimeClock` |
| `QuestInstaller.asset` | Create > Aetherfall > Boot > Installer: Quests | WorldStateInstaller, InventoryInstaller | zusätzlich `IConditionWatcher`, `IWorldState`, `IInventoryService` |

- Am einfachsten im Testgelände-Generator: in `TestGroundAssets` eine Methode `EnsureNarrativeInstallersInBootConfig` nach dem Muster von `EnsureItemInstallersInBootConfig` (`EnsureInstallerInBootConfig<ConditionsInstaller>(…, typeof(EventBusInstaller), typeof(GameTimeInstaller))`, dann `WorldStateInstaller` hinter `ConditionsInstaller`, `SaveInstaller`, `GameTimeInstaller`, `ContentInstaller`, dann `QuestInstaller` hinter `WorldStateInstaller`, `InventoryInstaller`), dazu die Pfade in `TestGroundPaths` und eine Zeile im Fenstertext von `TestGroundMenu`.
- Der `ConditionWatcher` und der `QuestService` sind `ITickable`/`IDisposable`, der `QuestService` zusätzlich `IPostInitializable` (startet die Verfügbarkeit) und `ISessionService` – der Bootstrapper erkennt das automatisch.
- Die Saveables registrieren sich selbst beim `ISaveManager`: `worldstate` (Reihenfolge 20) und `quests` (100, mit `OnAfterLoad`).

**11.2 Inhalte:**

- Alle `FlagDefinition`- und `QuestDefinition`-Assets müssen im **Inhaltskatalog** (`Assets/_Project/Data/ContentCatalog.asset`) stehen, sonst kennt die `ContentDatabase` sie nicht (`QuestCatalog.FromDatabase`, `FlagRegistry.FromDatabase`).
- Für den Mini-Slice die drei Quests „Asche über Eichental“, „Die Wölfe vom Nordhang“ und „Die vergessene Gruft“ als Assets anlegen (Vorlage für die Wölfe: `Tests/EditModeQuests/NordhangQuestFixture.cs`, Stage für Stage gleich) und die Flags aus GDD 02, 11 als `FlagDefinition`s. Ein Editor-Skript kann das aus dem Fixture-Aufbau erzeugen.
- Danach **Aetherfall > Quests prüfen**: 0 Fehler. Erwartete Warnung bei den Wölfen: **W12** (4 Flags wirken über die Quest hinaus – so steht es im GDD; Konsequenz-Budget ist 3).

**11.3 Ereignis-Sender, die noch fehlen** (die Ziele warten schon darauf):

| Ereignis | Wer soll es senden | für |
|---|---|---|
| `NPCTalkedTo`, `DialogOutcome`, `ChoiceMade` | Dialogsystem (`Aetherfall.Dialogue`) | Rede, Wähle, Überzeuge |
| `ItemDelivered` | Dialog-/Übergabefenster | Bringe |
| `AreaEntered` | Orts-Zonen in der Welt (Trigger mit `UniqueId` `loc.…`) | GeheZu, ZeitLauf |
| `ClueInspected` | Untersuchen-Interaktion (Hinweis-Objekte `clue.…`) | Untersuche |
| `TrailNodeReached` | Spur-Knoten (`spur.…`, Index 0, 1, 2 …) | Folge |
| `BossDefeated`, `EnemyDefeated` | KI (Boss-Ende, lebend bezwungen) | TöteBestimmten |
| `AbilityUsedAt` | Fähigkeiten (Aether-Stoß) | Fähigkeit |
| `TimeOfDayChanged` | Spieluhr in `Aetherfall.GameTime` | WarteBis, `FlagAge` (bis dahin prüft der Watcher `FlagAge` jede Sekunde) |

Schon vorhanden: `EnemyKilled` (KI), `Interacted` (Interaktion), `InventoryChanged` (Inventar), `FlagChanged` (Weltzustand).

**11.4 Anzeige und Debug:**

- HUD-Tracker (bis zu 3 verfolgte Quests, Fokus-Quest) und Questlog (Tabs laut GDD 02, 7.1) lesen `IQuestService` (`Instances`, `TrackedQuestIds`, `FocusQuestId`, `GetLedger`, lokales Ereignis `Changed`) und reagieren auf `ObjectiveProgressed`, `QuestStarted`, `QuestCompleted`, `QuestFailed` (Meldungen laut GDD 02, 7.5). Questgeber-Symbole hören auf `QuestAvailabilityChanged`. Alles muss mit dem Gamepad bedienbar sein.
- Debug-Overlay „Quests“ (DevTools) mit den Funktionen aus GDD 02, 10.3: `TryStartForced`, `TrySetStage`, `TryCompleteObjective`, `TrySetObjectiveProgress`, `TryComplete`, `TryFail`, `ResetQuest`; Weltzustand über `IWorldStateDebug` (`Query`, `TrySetFromText`, `GetRecentChanges`).
- Konsolenbefehle (später, Architektur 14.2): `start_quest`, `set_stage`, `complete_objective`, `complete_quest`, `fail_quest`, `reset_quest`, `set_flag`, `get_flag`, `list_flags`.
- `docs/Status.md` um diesen Schritt ergänzen (in diesem Arbeitsschritt bewusst nicht geändert, damit das Zusammenführen einfach bleibt).

**11.5 Batchmode:** Die Quest-Prüfung hat schon einen Einstiegspunkt ohne Klicks:

```
Unity.exe -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.Narrative.QuestValidationMenu.RunBatch -logFile Logs\quests.log
```

Exit-Code 0 = keine Fehler, 1 = Fehler (Meldungen in der Logdatei).

---

## 12. Hinweise, Abweichungen und offene Punkte

**Abweichungen von der Architektur:**

| Was | Architektur sagt | Umgesetzt | Warum |
|---|---|---|---|
| `TypeMenuAttribute`, `IValidationReport` | in `Aetherfall.Core` (3.3) | in `Aetherfall.Conditions` | Core war nicht Teil dieses Schritts. Verschieben ist später gefahrlos (Attribute und Schnittstellen stehen nicht in Assets). |
| Typauswahl-Drawer | in `EditorTools.Core`, UI Toolkit (7.4) | in `EditorTools.Narrative` (Nr. 35), IMGUI mit `AdvancedDropdown` (Suche eingebaut) | Der Schritt, der sie braucht; IMGUI-Drawer funktionieren auch in UI-Toolkit-Inspektoren. |
| Auswertung des ConditionWatchers | in `LateUpdate` (7.5) | im zentralen `TickRunner` (Update) | Änderungen aus Bild n werden in Bild n + 1 ausgewertet; gleiche Wirkung, kein eigenes MonoBehaviour. |
| Zeitbedingungen ohne Spieluhr | `OnGameHour` | solange keine Spieluhr `TimeOfDayChanged` sendet, prüft der Watcher stündliche Bedingungen jede Sekunde | sonst würde `FlagAge` nie wahr |
| Weltzustand im Save | Liste `[id, wert, changedAtPlaytime]` (8.3) | Liste von Objekten `{ id, value, changedAt }` | Das Speichersystem erlaubt nur typisierte DTO-Klassen; Inhalt identisch. |
| `ObjectiveProgressed.ObjectiveId` | Ziel-ID | `s20.o1` (Stage + Ziel) | eindeutig, weil Ziel-IDs nur je Stage eindeutig sind |

**Noch nicht umgesetzt (TODO, wartet auf andere Bausteine):**

| Was | Wo es hingehört | Warum noch nicht |
|---|---|---|
| Bedingungen `HasItem`, `CurrencyAtLeast`; Aktionen `GiveItem`, `RemoveItem`, `GiveCurrency`, `RemoveCurrency` | `Aetherfall.Inventory` (Architektur 7.7) | Dafür muss `Aetherfall.Inventory.asmdef` die Assembly `Aetherfall.Conditions` referenzieren (erlaubt: Nr. 13 → Nr. 5) – das ist eine Änderung an einer bestehenden Datei und gehört in den Integrationsschritt. Bis dahin nutzen die Tests Platzhalter (`GiveTestItem`, `GiveTestGold`). |
| `PlayerLevelAtLeast`, `GiveXp` (auch „als Level-Anteil“), `HasSkill`, `HasClass` | `Aetherfall.Progression` | Assembly gibt es noch nicht |
| `TimeOfDayBetween`, `DayOfWeekIs`; Spieluhr als Sender von `TimeOfDayChanged`; Frist zeitlich begrenzter Quests | `Aetherfall.GameTime` | Es gibt nur die Spielzeit-Uhr (Playtime), noch keine Tageszeit. Das Ziel „Warte bis Tageszeit“ ist fertig und wartet auf das Ereignis. Wiederholbare Quests rechnen „täglich/wöchentlich“ vorerst in Stunden aktiver Spielzeit. |
| `ReputationAtLeast`, `ChangeReputation`; Status „Gesperrt“ durch Fraktionsausschluss | `Aetherfall.Factions` | Assembly gibt es noch nicht |
| `RelationshipAtLeast`, `ChangeRelationship`, `NpcAlive`, `SpawnNpc`, `DespawnNpc`, `MoveNpc`; Prüfregel V12 (sterbliche NPCs) | `Aetherfall.NPC` | Assembly gibt es noch nicht |
| `WeatherIs`, `PlayerInRegion`, `SpawnEncounter`, `AddMapMarker`, `SetDoorState` | `Aetherfall.World` | Assembly gibt es noch nicht |
| `CompanionInParty`, Begleiter-Reaktionen anwenden | `Aetherfall.Companions` | Daten sind schon im Quest-Asset, Wirkung folgt |
| `PlayCutscene`, `SetMusicOverride`, `ShowNotification`, `StartDialogue` | Cinematics, Audio, UI.Screens, Dialogue | Assemblies gibt es noch nicht |
| Zieltypen Erkunde, Eskortiere, Beschütze, Verteidige, Stelle her, Benutze an, Rätsel, Schleiche, Überzeuge, Minispiel, Ruf, Lies, Quest-Zustand | `Aetherfall.Quests` | Für den Mini-Slice nicht nötig; jeder ist eine neue Klasse nach dem Muster der vorhandenen (GDD 02, 5.3). „Quest-Zustand“ geht schon heute mit **Ziele > Bedingung erfüllt** + **Quest > Status ist**. |
| Texte als `LocalizedString` (DE/EN), Prüfregel V10 für Englisch | Lokalisierungs-Schritt | Texte sind vorerst deutsche Felder |
| Prüfregeln W02, W03, W06, W08, W09, W11, W13, W14 | `QuestValidator` | brauchen XP-Kurve, Regionen, Wortzählung, Item-Tags oder Test-Status |
| Grafischer Quest-Editor (Knoten-Ansicht) | Architektur 11.9, Stufe 2 | laut Auftrag nicht in diesem Schritt; die Listen-/Inspector-Bearbeitung ist Stufe 1 |
| Flag-Browser, Debug-Fenster Weltzustand | `EditorTools.World` (Architektur 8.4) | Daten-API ist fertig (`IWorldStateDebug`), Fenster folgt |

**Vorschlag:** Die Wölfe-Quest schreibt laut GDD 4 dauerhafte Flags (`woelfe_ausgang`, `pim_fieber_bekannt`, `nordhang_aether_aktiv`, `wolfswelpe_gerettet`), das Konsequenz-Budget aus GDD 02, 6.2 erlaubt 3. Die Prüfung meldet das als Warnung W12. Entweder das Budget für diese Quest begründen oder `wolfswelpe_gerettet` erst mit Stufe B (Tierbegleiter) einführen.
