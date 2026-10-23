# Offene Fragen an den Auftraggeber

> Teil der Phase-0-Planung · Stand: 2026-10-13 · Quelle: [Master-Prompt](./00_Master-Prompt.md)

Dieses Dokument erfüllt §33.5 („Stelle mir bis zu 10 Fragen zu Entscheidungen, die bei mir liegen“). Es bündelt die mit ❓ markierten offenen Entscheidungen aller Phase-0-Dokumente:

- **Die 10 wichtigsten Fragen** bestimmen das Projekt-Setup (Phase 0, Schritt 4), Phase 1 und den Umfang am stärksten. Sie sind nach Dringlichkeit sortiert. Verwandte Entscheidungen sind gebündelt.
- **Alle weiteren offenen Entscheidungen** stehen in der Tabelle darunter, damit nichts verloren geht.

**Regel:** Bis zur Antwort gilt bei jeder Frage die Empfehlung als vorläufiger Standard. Die Planung rechnet damit. Code entsteht erst nach dem OK zu Phase 0 (§32.1). Beantwortete Fragen trägt der [Projektstatus](./Status.md#entscheidungs-log) im Entscheidungs-Log ein.

**Kurzantwort möglich:** Wer allen Empfehlungen folgt, kann so antworten: „Empfehlungen 1–10 angenommen. Team: … Personen mit … Wochenstunden, Budget … €. Firma: …, Produktname: …“

**Inhalt:** [Überblick](#überblick) · [Die 10 wichtigsten Fragen](#die-10-wichtigsten-fragen) · [Alle weiteren offenen Entscheidungen](#alle-weiteren-offenen-entscheidungen)

---

## Überblick

| # | Thema | Kurzfrage | Empfehlung (vorläufiger Standard) | Spätestens vor |
|---|---|---|---|---|
| 1 | Kapazität | Team, Zeitrahmen, Geldbudget? | Ehrliche Zahl nennen. Bis dahin „1 Person + Zukauf“ | Abschluss Phase 0 |
| 2 | Projekt-Setup | Engine, Versionsverwaltung, Name, Hardware? | Unity 6.3 LTS, Wechsel auf 6.7 LTS vor Phase 3; Git + LFS mit Budget-Limit; Name festlegen; Windows-PC ab Phase 2 | Phase 0, Schritt 4 |
| 3 | Sprachen | Code-Sprache, Schreibreihenfolge der Texte? | Code Englisch; Texte zuerst Deutsch, Englisch extern je Meilenstein | Phase 1, Schritt 1.1 |
| 4 | Roadmap | VV1–VV10, Leitplanken L1–L10, Länge des Vertical Slice? | Alles übernehmen; Slice ~3,5–4 h | Beginn Phase 1 |
| 5 | Erste Veröffentlichung | Zielstufe, Early Access, Preismodell, Plattform? | Early Access ab B-Minimal, Premium, Steam für Mac und Windows | Beginn Phase 1 (endgültig nach Gate G2) |
| 6 | Spielerfigur | Frei gestaltbar? Vertont? | Frei gestaltbar, unvertont; bis Stufe B nur Barks und Kampflaute | Phase 3 (erster Dialog) |
| 7 | Quests | Budget 427 + 33? Proben mit Würfeln? | Budget annehmen; Proben deterministisch | Phase 3 (erster Dialogtext) |
| 8 | Progression | Story-Korridor? Dauer Level 60–80? | Story-Korridor mit Story-Zonen; ~80 h | Phase 3 (XP-System) |
| 9 | Story und Ton | Antagonist, Altersfreigabe, Romanzen? | Valerian (A) mit Element aus C; USK 16; 4 Romanzen | Akt-1-Dialoge (Phase 4) |
| 10 | Welt und Kunststil | Weltgröße, Grad der Stilisierung? | ~46 km² mit 70 %-Option; Stil „Mitte“ | erster Asset-Kauf, Kalkulation Stufe B |

---

## Die 10 wichtigsten Fragen

### 1. Kapazität: Team, Zeitrahmen und Budget

**Frage:** Wie viele Personen arbeiten mit wie vielen Wochenstunden am Projekt? Bis wann soll die erste Version erscheinen? Welches Geldbudget steht zur Verfügung (Zukäufe, Windows-PC, Lizenzen, Übersetzung)?

- **Warum jetzt:** Davon hängt ab, welche Umfangsstufe realistisch ist. Der Vertical Slice kostet geschätzt ≈ 225 Personenwochen (PW, Bandbreite 160–315 PW): solo ≈ 4,9 Jahre, mit 2 Personen ≈ 2,7 Jahre, mit 3 Personen ≈ 1,8 Jahre. Der kritische Pfad allein liegt bei ≈ 57,5 PW ≈ 15 Monaten. Die volle Vision (Stufe C) liegt bei über 25 Personenjahren. Ohne diese Zahlen lassen sich weder die Zielstufe (Frage 5) noch Zukäufe planen.
- **Optionen:**
  1. Solo (mit KI-Unterstützung), nur kostenlose Platzhalter.
  2. Solo plus Zukauf: Animations-, VFX- und Umgebungspakete, Windows-PC, Übersetzung je Meilenstein.
  3. 2–3 Personen (Gameplay, Systeme/Werkzeuge, Inhalte) plus Zukauf.
  4. 4–6 Personen, zusätzlich externe Grafik ab Stufe B.
- **Empfehlung:** Eine ehrliche Zahl nennen (Personen, Wochenstunden, Euro). Bis dahin plant das Projekt mit Option 2 („1 Person + Zukauf“) und der Zielstufe B-Minimal. Animationspakete für Nahkampf, Bogen und Klettern werden ab Phase 1 gekauft.
  **Begründung:** Zukauf ist der einzige Hebel, der den kritischen Pfad verkürzt, ohne Team oder Umfang zu ändern: Nahkampf, KI, Begleiterin und Klettern hängen an Animationen. Kürzen am Rand spart dagegen nur ~5 % (Streichliste „Slice-Lite“, −10,5 PW).
- **Bündelt:** Teamgröße und Budget, Zeitrahmen (GDD 00) · Teamgröße bis zum Vertical Slice, zugekaufte Bausteine (Technik/02) · Teamgröße, Budget und Zeitrahmen, Zukauf und externe Grafik (Risiken R1, R3).
- **Betroffene Dokumente:** [Risiken, R1](./Risiken.md#r1--der-umfang-übersteigt-die-kapazität-das-projekt-wird-nie-veröffentlicht) · [Technik/02, Kritischer Pfad und Gesamtaufwand](./Technik/02_Systeme_und_Abhaengigkeiten.md#kritischer-pfad-bis-zum-vertical-slice) · [GDD 00, Umfangsstufen](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen)

- ✅ **Antwort (2026-10-13):** Solo, Budget **50 €** (verfügbar in zwei Tagen). Damit gilt Option 1 („Solo, kostenlose Platzhalter“) mit kleinem Reservetopf. Konsequenzen siehe [Status, Kurskorrektur](./Status.md#kurskorrektur-nach-antwort-1-solo-50-).

### 2. Projekt-Setup: Engine, Versionsverwaltung, Name und Hardware

**Frage:** Dürfen wir Phase 0, Schritt 4 so aufsetzen, und unter welchem Namen?
- (a) **Unity 6.3 LTS** (neuester 6000.3-Patch). Wechsel auf **Unity 6.7 LTS**, sobald es mindestens 2 Patch-Releases hat, spätestens vor Phase 3.
- (b) **Git + GitHub mit Git LFS**, privates Repository, Budget-Limit ~25 USD/Monat statt 0-USD-Sperre.
- (c) **Firmenname, Produktname und Bundle-ID** (Schema `com.<firma>.aetherfall`): welche?
- (d) **Referenz-Hardware:** MacBook Pro 14" mit M3 Pro oder neuer, 18 GB (das eigene MacBook, falls es mindestens M3 Pro hat) und ein PC mit RTX-4060-Klasse. Ein eigener Windows-PC steht spätestens ab Phase 2 bereit.

- **Warum jetzt:** Das Setup ([Technik/01, Abschnitt 2](./Technik/01_Architektur.md#2-projekt-setup-checkliste)) braucht alle vier Punkte vor dem ersten Commit.
  - Firmen- und Produktname sind Teil von `persistentDataPath` und der Steam-Cloud-Pfade. Eine spätere Änderung „verliert“ Spielstände.
  - 6.3 LTS hat Support bis 12/2027. 6.7 LTS bringt Graph Toolkit als Editor-Modul, ein reiferes UI Toolkit und Addressables 4. Ein frühes Upgrade ist billig, weil noch wenig Inhalt existiert.
  - Eine 0-USD-Sperre blockiert Git LFS bis zum Monatsende, die Arbeit steht dann.
  - Windows-IL2CPP lässt sich nicht auf dem Mac bauen. „60 FPS“ (§4.4) ist ohne feste Geräte nicht prüfbar.
- **Optionen:**
  1. Alles wie unter (a)–(d).
  2. Bei 6.3 LTS bleiben, Graph-Editor später mit GraphView (Support endet 12/2027, ein späteres Upgrade wird teurer).
  3. Unity Version Control statt Git + LFS (lohnt sich erst, wenn mehrere Artists mitarbeiten).
  4. Kein eigener Windows-PC, nur Windows-Runner in der CI (keine echte FPS-Messung, Kosten pro Minute).
- **Empfehlung:** Option 1. Für (c) **Vorschlag:** einen kurzen, sprachneutralen Produktnamen wie „Aetherfall“ wählen, der unabhängig vom späteren Verkaufstitel bleibt; „Chroniken von Aetherfall“ ist laut Master-Prompt ein Arbeitstitel.
  **Begründung:** Diese Kombination ist in [Technik/03](./Technik/03_Technik-Recherche.md#empfehlungen-für-aetherfall) gegen Changelogs und Preislisten geprüft und in den Architektur-Entscheidungen A01, A40 und A41 hinterlegt. Hinweis: [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) nennt als Mac-Referenz „Basischip, 16 GB“. Maßgeblich wird die Antwort auf diese Frage.
- **Bündelt:** Firmen- und Produktname/Bundle-ID, Versionsverwaltung und Budget, Zeitpunkt des Engine-Upgrades, Referenz- und Mindest-Hardware, Windows-Hardware (Technik/01) · Engine-Upgrade VV10, Windows-Testrechner (Technik/02) · Versionsverwaltung, LFS- und Actions-Budget, Repo-Sichtbarkeit, Windows-Hardware, Engine-Upgrade, Firmen- und Produktname (Technik/03) · Referenz-Hardware (GDD 05, Risiken R5).
- **Betroffene Dokumente:** [Technik/01, Projekt-Setup-Checkliste](./Technik/01_Architektur.md#2-projekt-setup-checkliste) · [Technik/01, Zielhardware](./Technik/01_Architektur.md#131-zielhardware-vorschlag) · [Technik/03, Kurzfazit](./Technik/03_Technik-Recherche.md#kurzfazit) · [Technik/02, Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge)

### 3. Sprachen: Code und Spieltexte

**Frage:**
- (a) Schreiben wir Code, Kommentare und Commit-Nachrichten auf **Englisch**? Editor-Menüs und Dokumente bleiben Deutsch.
- (b) Werden Spieltexte **zuerst auf Deutsch** geschrieben und je Meilenstein von einer muttersprachlichen Fachkraft ins **Englische** übersetzt?

- **Warum jetzt:** §0 verlangt eine einheitliche Kommentarsprache. Sie gilt ab der ersten Datei (Phase 1, Schritt 1.1). Die Schreibreihenfolge bestimmt die Key-Erzeugung, den Übersetzungsfluss und die Pseudo-Locale-Tests. Das Localization-Paket wird in Schritt 1.6 eingerichtet. Die englische Übersetzung kostet bei ~650.000 Wörtern geschätzt 65.000–97.500 € (eigene Rechnung in [Risiken, R2](./Risiken.md#r2--content-produktion-quests-dialoge-lokalisierung-de--en-sprachausgabe)) und gehört ins Budget (Frage 1).
- **Optionen:**
  1. Code Englisch · Texte Deutsch zuerst, Englisch extern je Meilenstein.
  2. Code Deutsch · Texte Deutsch zuerst.
  3. Code Englisch · Texte Englisch zuerst (größerer Markt, aber Ton und Anrede sind auf Deutsch ausgearbeitet).
  4. Code Englisch · Deutsch und Englisch parallel durch dieselbe Person (spart Übersetzungsbudget, verdoppelt die Schreibzeit).
- **Empfehlung:** Option 1.
  **Begründung:** Unity-APIs, Fehlermeldungen und Werkzeuge sind englisch, ein späterer Wechsel der Code-Sprache wäre teuer. Ton, Humor (§3) und die Anrede du/Ihr sind in GDD 02 auf Deutsch ausgearbeitet. Eine muttersprachliche Übersetzung je Meilenstein hält die Qualität und verhindert einen Übersetzungsstau am Ende.
- **Bündelt:** Kommentarsprache im Code, Schreibreihenfolge der Texte (Technik/01) · Erste Schreibsprache (GDD 02) · Übersetzung extern oder intern (Risiken R2).
- **Betroffene Dokumente:** [Technik/01, Coding-Konventionen](./Technik/01_Architektur.md#15-coding-konventionen-32) · [GDD 02, Lokalisierung](./GDD/02_Quests_und_Dialoge.md#134-lokalisierung-de--en-von-anfang-an-42) · [GDD 02, Offene Entscheidungen](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen)

### 4. Roadmap-Anpassungen, Leitplanken und Ziel des Vertical Slice

**Frage:** Übernehmen wir
- (a) die Roadmap-Anpassungen **VV1–VV10** aus Technik/02,
- (b) die Leitplanken **L1–L10** mit den Go/No-Go-Gates G0–G3 aus den Risiken und
- (c) einen Vertical Slice im **vollen Umfang** von §31 mit ~3,5–4 h Spielzeit statt 2–3 h?

Kurz zu (a): VV1–VV4 ziehen IDs mit Validator, Conditions & Actions, Weltzustand, die Speicher-Rundreise mit Golden Saves und den UI-Spike in Phase 1 vor. VV5–VV6 bringen Fraktions- und NPC-Kern in Phase 3. VV7 teilt Phase 4 in Slice-Systeme (4a) und Inhalte (4b). VV8–VV9 bringen Streaming-Spike, Build-Pipeline, Windows-Mono-Build und Telemetrie in Phase 2. VV10 ist das Engine-Upgrade aus Frage 2.

- **Warum jetzt:** Die Anpassungen ändern Inhalt und Abnahme schon in Phase 1. Ohne VV1 und VV3 würde Speichern erst in Phase 4 vollständig getestet; ein Formatfehler träfe dann alle Systeme gleichzeitig. Die Leitplanken sollen ab Gate G0 (Ende Phase 0) gelten. Die 8 Beispiel-Quests aus §16.9 dauern laut GDD 02 zusammen 210 min plus Wege, also ~3,5–4 h.
- **Optionen:**
  1. (a), (b) und (c) vollständig übernehmen.
  2. VV1–VV10 übernehmen, Leitplanken nur teilweise (z. B. ohne Feature-Freeze nach Gate G2).
  3. §31 unverändert lassen und die 8 Quests auf zusammen ≤ 180 min kürzen, damit der Slice 2–3 h dauert.
- **Empfehlung:** Option 1. Die Streichliste „Slice-Lite“ wird nur angewendet, wenn die Messung nach Phase 2 Verzug zeigt. Neu kalkuliert wird nach Phase 2 (Systeme) und nach Phase 4 (Inhalte). Das Kriterium von Gate G2 („2–3 h spielbar“) wird auf ~3,5–4 h angepasst.
  **Begründung:** Gates (L2) und Messen (L8) wirken am stärksten gegen das größte Risiko R1. Vollständige Quests liefern eine belastbarere Produktionsrate für die Kalkulation von Stufe B als gekürzte.
- **Bündelt:** Roadmap-Anpassung VV1–VV10, Umfang des Vertical Slice, Zeitpunkt der Neu-Kalkulation (Technik/02) · Leitplanken L1–L10 (Risiken) · Verbesserungsvorschlag „Länge des Vertical Slice“ (GDD 00).
- **Betroffene Dokumente:** [Technik/02, Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge) · [Risiken, Leitplanken](./Risiken.md#empfohlene-leitplanken) · [GDD 00, Umfangsstufen](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen)

### 5. Erste Veröffentlichung: Zielstufe, Release-Modell, Preis und Plattform

**Frage:**
- (a) Zielstufe der ersten Veröffentlichung: **B-Minimal** (Eichental und Goldküste, 14 Hauptquests, ~70 Quests, ~40 h) oder **B** (3 Regionen plus Aurelion-Hub, ~150 Quests, ~75–90 h)?
- (b) **Early Access** oder Vollversion?
- (c) **Premium-Einmalkauf** ohne Mikrotransaktionen und Lootboxen?
- (d) **Steam zuerst**, für Mac und Windows gleichzeitig?

- **Warum jetzt:** Die Zielstufe ist die Planungsgrundlage für Phase 5 und für den Feature-Freeze nach Gate G2 (L1). Ab dem ersten externen Build sind IDs und Speicherformat eingefroren (Technik/01, A12 und A18). Early Access verlangt deshalb Migrationen über viele Updates. Die Plattform bestimmt Cloud-Speicher, Erfolge, die Schnittstelle `IPlatformServices`, die Notarisierung und ggf. Unity Pro (Steam im Platform Toolkit nur mit Pro). Echtgeld im Spiel würde Loot-, Gold- und Pity-Design grundlegend ändern.
- **Optionen:**
  1. Early Access ab B-Minimal, Version 1.0 ab Stufe C1; Premium; Steam (Mac und Windows).
  2. Early Access ab B, Version 1.0 ab C1; Premium; Steam.
  3. Kein Early Access: kostenlose Demo (Vertical Slice), Vollversion ab B oder später.
  4. Andere oder mehrere Plattformen zuerst (GOG, itch.io, Mac App Store).
- **Empfehlung:** Option 1. Die endgültige Zielstufe fällt nach Gate G2 (Messung nach dem Vertical Slice). Technik: Steamworks.NET hinter `IPlatformServices`, Steam Auto-Cloud mit gemeinsamen Spielständen für Mac und PC.
  **Begründung:** B-Minimal ist bei kleinem Team die einzige Stufe in erreichbarer Nähe. Early Access bringt früh Rückmeldung und eventuell Einnahmen. Premium ohne Zufallspacks passt zu Säule 6 und zum Wirtschaftsmodell in GDD 04. Steam deckt Mac und Windows mit einer Anbindung ab.
- **Bündelt:** Release-Modell, Vertriebsplattform, Plattform-Priorität, Monetarisierung, Umfang von Stufe B (GDD 00) · Monetarisierung (GDD 04, Nr. 5) · Cloud-Speicher (GDD 05) · Vertriebsplattform (Technik/01, Technik/03) · Zielstufe der ersten Veröffentlichung, Release-Modell (Risiken R1, R4).
- **Betroffene Dokumente:** [GDD 00, Umfangsstufen](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen) · [GDD 00, Offene Entscheidungen](./GDD/00_Vision_und_Ueberblick.md#offene-entscheidungen) · [Technik/01, Plattform & Builds](./Technik/01_Architektur.md#16-plattform--builds) · [Risiken, R4](./Risiken.md#r4--systemverflechtung-verzweigungen-und-speicherstände-über-updates)

### 6. Spielerfigur und Sprachausgabe

**Frage:**
- (a) Ist die Spielfigur **frei gestaltbar** (2 Körpertypen, Presets, wenige Regler, Pronomen getrennt wählbar, Name frei) oder ein **fester Charakter**?
- (b) Bleibt der Protagonist **unvertont**, mit Sprachausgabe bis Stufe B nur für **Barks und Kampflaute**? Über eine vertonte Hauptstory würde nach Stufe B mit eigenem Budget entschieden.

- **Warum jetzt:** Die Antwort bestimmt die Figuren-Pipeline (jede Rüstung je Körpertyp), Dialogkamera und Dialogtexte (Pronomen, Anrede) ab dem ersten Dialog in Phase 3 sowie die Zwischensequenzen des Prologs. Ein unvertonter Protagonist spart bei Deutsch und Englisch geschätzt 8.000–12.000 Aufnahmen.
- **Optionen:**
  1. Frei gestaltbar, unvertont; bis Stufe B nur Barks und Kampflaute.
  2. Frei gestaltbar, vertont (2 Stimmen × 2 Sprachen).
  3. Fester Charakter mit festem Namen und Aussehen, vertont (wie Geralt).
  4. Fester Charakter, unvertont.
- **Empfehlung:** Option 1, dazu 2 Sets Kampf- und Anstrengungslaute für den Protagonisten.
  **Begründung:** Stärkt die Identifikation („Du bist der Rissgeborene“) und ist die günstigste Variante. Rüstungen brauchen nur 2 Körpertypen. Vertonte Dialoge in zwei Sprachen übersteigen jedes kleine Budget (GDD 00, Referenzspiele).
- **Bündelt:** Spielfigur (GDD 00) · Geschlecht und Aussehen, Stimme des Protagonisten (GDD 01) · Umfang der Sprachausgabe (GDD 05) · Sprachausgabe und Spielfigur (Risiken R2, R3).
- **Betroffene Dokumente:** [GDD 01, Die Spielerfigur](./GDD/01_Welt_Story_Fraktionen.md#26-die-spielerfigur-rissgeborener) · [GDD 00, Spielerfantasie](./GDD/00_Vision_und_Ueberblick.md#elevator-pitch--spielerfantasie) · [GDD 05, Offene Entscheidungen](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen)

### 7. Quest-Umfang und Dialogproben

**Frage:**
- (a) Gilt das **Quest-Budget 427 + 33** statt der Summe der Kategorien-Minima aus §16.2 (464)? Das sind 427 handgemachte Quests für Stufe C (darunter 60 Haupt-, 15 Fraktionsquests je Fraktion und 126 Nebenquests) plus 33 legendäre Endgame-Quests, dazu die Wortbudgets aus GDD 02 (Hauptquest ≤ 4.000, Nebenquest ≤ 1.500 Wörter).
- (b) Werden Dialogproben (Überzeugen, Einschüchtern, Lügen) **deterministisch** entschieden (Wert ≥ Schwelle, gesperrte Option mit Schwelle und eigenem Wert sichtbar) oder **mit Würfeln** (W20 + Bonus)?

- **Warum jetzt:** Die Probenart muss vor dem ersten Dialogtext feststehen (Phase 3, Harrik-Dialog). Würfel verlangen für jede Probe einen Misserfolgszweig, also +30–50 % Dialogtext und doppelten Testaufwand. Das Budget steuert die Zähler im Quest-Editor (Leitplanke L3) und trägt die Spielzeitrechnung (~198 h „Hauptstory + Nebenquests“, ~320–360 h Komplettierung).
- **Optionen:**
  1. Budget 427 + 33, deterministische Proben.
  2. Budget 427 + 33, Würfel.
  3. Kategorien-Minima aus §16.2 (≥ 464 Quests, ~37 mehr ≈ 120–220 Personentage), deterministische Proben.
  4. Bis zu 25 Fraktionsquests je Fraktion (Obergrenze laut Master-Prompt, bis zu ~70 Quests mehr).
- **Empfehlung:** Option 1.
  **Begründung:** Das Budget erreicht die Spielzeitziele aus §1 bereits und spart gegenüber den Minima geschätzt 120–220 Personentage. Deterministische Proben sind planbar und für den Spieler transparent. Das Datenmodell trägt beide Varianten; ein späterer Wechsel bleibt technisch möglich, kostet dann aber Text.
- **Bündelt:** Quest-Menge (GDD 00) · Würfel oder feste Werte bei Proben, Fraktionsquests je Fraktion (GDD 01) · Proben im Dialog, Quest-Budget und Feinverteilung (GDD 02) · Würfel oder feste Werte (Technik/01) · Quest-Budget, Wortbudgets und Dialogproben (Risiken R2).
- **Betroffene Dokumente:** [GDD 02, Mengen-Hochrechnung](./GDD/02_Quests_und_Dialoge.md#24-mengen-hochrechnung-nachweis--400) · [GDD 02, Fertigkeitsproben](./GDD/02_Quests_und_Dialoge.md#123-fertigkeitsproben) · [GDD 02, Wortbudgets](./GDD/02_Quests_und_Dialoge.md#133-wortbudgets-vorschlag) · [GDD 00, Spielzeiten](./GDD/00_Vision_und_Ueberblick.md#ziel-spielzeiten--plausibilität)

### 8. Level-Kurve gegen Regionslevel: Story-Korridor

**Frage:** Lösen wir den Zielkonflikt zwischen der Zeitkurve aus §28 (Level 30 nach ~40 h, Level 60 nach ~120 h) und den Regionslevels aus §14.2 so?
- (a) Hauptquests bekommen einen eigenen **Story-Korridor**: Akt 1–5 mit Level 1–10, 10–24, 24–32, 32–42 und 42–48. Gegner und Dungeons auf dem kritischen Pfad tragen als **Story-Zonen** das Korridor-Level und wechseln nach dem Akt auf das Regionsband. Quest-XP folgt ab Level 11 dem Minuten-Äquivalent aus GDD 03, 12.7.
- (b) Der Weg von Level 60 bis 80 dauert **~80 h** (Level 80 nach ~200 h).

- **Warum jetzt:** Das XP- und Level-System entsteht in Phase 3 (System S21). Die Belohnungsbänder im Quest-Editor hängen daran und müssen vor der Massenproduktion von Quests feststehen. Ohne Lösung käme ein reiner Story-Spieler in Akt 4 (Regionen mit Level 35–60) 5–20 Level zu schwach an; Akt 5 spielt in einer Region mit Level 60–80. Grinden für die Hauptstory wäre Pflicht, im Widerspruch zu §23.
- **Optionen:**
  1. Story-Korridor mit Story-Zonen und Minuten-Äquivalent; Level 60 → 80 in ~80 h.
  2. Deutlich mehr XP aus Hauptquests (Story-Spieler holen auf, Mischspieler überleveln stärker, die Zeitkurve aus §28 wird verfehlt).
  3. Regionslevel aus §14.2 absenken.
  4. Status quo: Story-Spieler müssen Nebeninhalte spielen.
- **Empfehlung:** Option 1.
  **Begründung:** Die Regionslevel aus §14.2 und die festen Gebietslevel aus §20.4 bleiben erhalten; auch eine Story-Zone hat ein festes Level, es hängt nur vom Story-Fortschritt ab. XP-Abschwächung bei Überlevel und die Telemetrie „Level bei Hauptquest-Start“ (Alarm bei mehr als 3 Level Abstand) sichern beide Richtungen ab. ~80 h für Level 60–80 halten das Endgame motivierend, bevor Paragon übernimmt.
- **Bündelt:** Story-Level-Lücke (GDD 00) · Dauer von Level 60 bis 80 (GDD 03) · Abstimmung des XP-Modells zwischen GDD 02 und 03 (Risiken W4) · Verbesserungsvorschlag „Story-Zonen“ (GDD 01, 2.1).
- **Betroffene Dokumente:** [GDD 00, Story-Level-Lücke](./GDD/00_Vision_und_Ueberblick.md#story-level-lücke-wichtig) · [GDD 01, Hauptstory im Überblick](./GDD/01_Welt_Story_Fraktionen.md#21-überblick) · [GDD 03, Herleitung der XP-Kurve](./GDD/03_Kampf_Charakter_Progression.md#124-herleitung) · [GDD 02, Kategorien-Tabelle](./GDD/02_Quests_und_Dialoge.md#22-kategorien-tabelle)

### 9. Story und Ton: Antagonist, Altersfreigabe, Romanzen

**Frage:**
- (a) **Wer hat den Großen Riss geöffnet?**
- (b) Welche **Ziel-Altersfreigabe** gilt?
- (c) Gibt es **Romanzen**, und bei wie vielen Begleitern?

- **Warum jetzt:** Der Antagonist muss vor den Akt-1-Dialogen feststehen, denn Quest 1, 3 und 6 des Vertical Slice deuten die Graumäntel an. Die Altersfreigabe bestimmt Finisher-Animationen und Blut, Questinhalte schon im Prolog und den Deskriptor „simuliertes Glücksspiel“. Romanzen liegen innerhalb der Begleiterquests und kosten je ~1.000–1.500 Wörter plus Testzweige.
- **Optionen:**
  - (a) A: Magister Valerian Ascor öffnete das „Himmelstor“ aus Größenwahn und ist der Graue Wanderer · B: Silberwacht-Gründer Aldric Sturmfels öffnete es als Waffe, die „Guten“ haben gelogen · C: Seraphine, die Erste Rissgeborene, öffnete es kontrolliert als Ventil gegen die Leere („der Damm“).
  - (b) USK 12 · USK 16 / PEGI 16 · USK 18.
  - (c) keine · bei 4 von 8 Begleitern · bei allen 8.
- **Empfehlung:**
  - (a) **A mit einem Element aus C:** Valerian handelte aus Größenwahn, aber seine Warnung, dass die Leere ohnehin durchbricht, stimmt.
  - (b) **USK 16 / PEGI 16** mit diesen Folgen: Blut an, keine Zerstückelung; ein benannter NPC darf schon im Prolog durch eine Spielerentscheidung sterben (mit sichtbarem Countdown); Kinder kommen nie dauerhaft zu Schaden; Würfeln, Wetten und Blinde Ware nur mit Spielgold, nie mit Echtgeld.
  - (c) **4 Romanzen** (Maren, Jasper, Ilvy, Kael), unabhängig vom Körpertyp, höchstens 1 aktive, keine expliziten Szenen.

  **Begründung:** Option A gibt einen klaren Gegenspieler mit nachvollziehbarem Motiv, passt zu allen vier Enden und belastet keine spielbare Fraktion so stark wie B. USK 16 passt zu „High Fantasy mit dunklen Untertönen“ (§3) und zur Zielgruppe von 25–45 Jahren. Vier Romanzen erfüllen „Romanze (bei manchen)“ aus §19 bei halbem Schreibaufwand.
- **Bündelt:** Wer hat den Großen Riss geöffnet, Romanzen (GDD 01) · Ziel-Altersfreigabe (GDD 00) · Tod eines benannten NPC im Prolog, Kinder als Folge von Spielerentscheidungen (GDD 02) · Darstellung von Finishern und Blut (GDD 03) · Glücksspiel-Elemente mit Spielwährung (GDD 04, Nr. 4) · offene Story-Kernentscheidung und Altersfreigabe (Risiken W9, W10).
- **Betroffene Dokumente:** [GDD 01, Antagonist und Akt-3-Enthüllung](./GDD/01_Welt_Story_Fraktionen.md#22-der-antagonist-und-die-akt-3-enthüllung) · [GDD 01, Begleiter](./GDD/01_Welt_Story_Fraktionen.md#10-begleiter-19) · [GDD 02, Offene Entscheidungen](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen) · [GDD 03, Finisher](./GDD/03_Kampf_Charakter_Progression.md#410-finisher-vorschlag) · [GDD 04, Offene Entscheidungen](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen)

### 10. Welt und Kunststil

**Frage:**
- (a) Planen wir mit **~46 km² begehbarer Welt** (Kontinent ~41 km² plus Zerbrochener Himmel ~5 km²)? Kar'Zul und die Frostgipfel würden auf 70 % ihrer Fläche verkleinert, falls die Messung nach Stufe A mehr als 40 Personentage je km² ergibt.
- (b) Welcher **Grad der Stilisierung** gilt: nah an The Witcher 3 (realistisch), Mitte („leicht stilisierter Realismus“) oder nah an Genshin Impact (stark stilisiert)?

- **Warum jetzt:** Die Weltgröße ist der größte Einzelfaktor der Welt-Art: 25–40 Personentage je km², bei 46 km² also 5–8 Personenjahre. Der Stil ist Grundlage jedes Blender-Modells, der Shader-Regeln und jedes Asset-Kaufs (Frage 1) und später nicht mehr änderbar.
- **Optionen:**
  - (a) ~46 km² mit 70 %-Option · kleiner (~30 km²) · größer (technische Grenze 16 × 16 km).
  - (b) realistisch · Mitte · stark stilisiert.
- **Empfehlung:** (a) ~46 km² mit 70 %-Option. (b) Stil „Mitte“, abgenommen über ein Referenzboard mit 10–15 Bildern vor dem ersten Asset-Kauf.
  **Begründung:** 46 km² liegt in der Größenordnung von Skyrim und hält Reisezeiten kurz (Kontinent West → Ost ~27 min zu Fuß), Schnellreise bleibt Bequemlichkeit. Die 70 %-Option begrenzt das Risiko, ohne die zusammenhängende Welt aus §14.1 aufzugeben. Der mittlere Stil bleibt aus 4–6 m Kameraabstand lesbar und verträgt Platzhalter und zugekaufte Kits besser als Fotorealismus.
- **Bündelt:** Weltgröße (GDD 01) · Grad der Stilisierung (GDD 05) · Weltgröße und Stil (Risiken R3).
- **Betroffene Dokumente:** [GDD 01, Weltgröße](./GDD/01_Welt_Story_Fraktionen.md#31-weltgröße-vorschlag) · [GDD 05, Leicht stilisierter Realismus](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#31-leicht-stilisierter-realismus-konkret-vorschlag) · [Risiken, R3](./Risiken.md#r3--art--animations--und-welt-pipeline-blender)

---

## Alle weiteren offenen Entscheidungen

Diese Entscheidungen bestimmen Phase 0.4 und Phase 1 weniger stark. **Bis zur Antwort gilt jeweils die Empfehlung als vorläufiger Standard.** Doppelte Einträge aus mehreren Dokumenten sind zusammengefasst; die Quelle nennt alle Fundstellen. Entscheidungen, die schon in einer der 10 Fragen stecken, stehen dort unter „Bündelt“.

| Thema | Frage | Empfehlung (vorläufiger Standard) | Quelle |
|---|---|---|---|
| Story | Persönlicher roter Faden: Schwester Lina, die im Prolog vom Riss verschluckt wird? | Ja (Prolog-Zeile, Visionen, Echo, Epilog) | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen) |
| Story | Fünftes Ende „Das Opfer“ (Begleiter mit Loyalität ≥ 90 opfert sich)? | Ja | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen) |
| Story | Spielbare Echo-Sequenzen in Akt 3? | 3 kurze Sequenzen mit wiederverwendeten Assets | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen) |
| Welt | Völker: nur Menschen und Zwerge oder weitere (z. B. Elfen)? | Nur Menschen und Zwerge, Vielfalt über Kulturen | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen) |
| Welt | Saisonale Ereignisse: Spieljahr oder echtes Kalenderdatum? | Spieljahr (112 Spieltage), Option „Feste nach echtem Datum“ (aus); GDD 01, 6.1 folgt bereits dem Spieljahr | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen), [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 2) |
| Fraktionen | Beitritt zum Kult der Leere? | Verdeckter Pfad ab Akt 3 (Option B) | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#85-beitritt-zum-kult-der-leere) |
| Begleiter | Verrat durch Begleiter: keiner, 3 oder alle? | 3 (Kael, Jasper, Maren) | [GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen) |
| Begleiter | Friendly Fire auf Begleiter? | Aus | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Onboarding | Zeitpunkt der Klassenwahl: im Hauptmenü oder nach dem Prolog? | Nach dem Prolog (~0:40) im Dialog | [GDD 00](./GDD/00_Vision_und_Ueberblick.md#offene-entscheidungen) |
| Klassen | Rissläufer als Startklasse? | Nein: Story-Klasse, der Baum öffnet sich für alle nach Akt 1 (Option B) | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Klassen | Anzahl der Hybridklassen? | 6 in Stufe C1–C2, die übrigen 4 später | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Kampf | Strafe beim Tod? | Keine; Neustart am letzten Checkpoint, < 30 s bis zum neuen Versuch | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Tag/Nacht | Was heißt „Dämmerung“ für die Schleich-KI? | Die Phasen Morgen (5–8) und Abend (18–21) mit 0,7, als Stufe an den Phasengrenzen (wie HUD und Tagesabläufe) | [Status](./Status.md) |
| Tag/Nacht | Ändert die Nacht auch die Sichtweite? | Nein, nur die Entdeckungsrate (GDD 03 9.2); die 22 m bleiben | [Status](./Status.md) |
| Tag/Nacht | Welche Lichter zählen für die Schleich-KI? | Brennende Feuer und Lampen bis 5 m (registrierte Lichtquellen); leuchtende Fenster nicht | [Status](./Status.md) |
| Tag/Nacht | Lichtwert in der Gruft? | Vorerst 1,0 (wie bisher); später 0,7 mit Fackel-Inseln 0,9 | [Status](./Status.md) |
| Tag/Nacht | Was heißt „tagsüber“ für Glutfang? | Offen: Phase Tag (8–18) oder 6–20 Uhr | [Status](./Status.md) |
| Zwischensequenz | Oberfläche der Zwischensequenzen (Balken, Untertitel, Abblende)? | UI Toolkit wie alle anderen Bildschirme statt uGUI/TMP (Technik/01 Z. 2219); Untertitel und Abblenden sind Daten am Abspieler, keine eigene Timeline-Spur | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Zwischensequenz | Pause während einer Zwischensequenz? | Vorerst nein: Esc und B tun nichts (Technik/01 4.4 statt GDD 03 Z. 256); Pause mit Rückkehr in die Sequenz in Stufe B | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Zwischensequenz | Überspringen: wie lange halten, welche Tasten? | A oder Leertaste so lange wie „Halten zum Bestätigen“ (1 s, Option 0,5–1,5 s), nur nach neuem Drücken; Enter überspringt nicht | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Zwischensequenz | Kinobalken? | Bild auf 2,35:1, je Balken höchstens 13 % der Höhe; bei 21:9 und 32:9 keine Balken | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Zwischensequenz | Aufteilung der Assembly 29? | 29 Aetherfall.Cinematics (reine Logik, mit Verweis auf Dialogue) und 29b Aetherfall.Cinematics.Playback (Timeline/Cinemachine) | [Technik/01](./Technik/01_Architektur.md) |
| Dialogkamera | Übergänge und Schnittrhythmus? | 0,4 s weich hinein und hinaus, dazwischen harte Schnitte; mindestens 1,5 s je Einstellung, höchstens ein Schnitt je Zeile (GDD 02 12.6), nach 3 Zeilen auf derselben Einstellung einmal die Halbtotale (GDD 03) | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Dialogkamera | Wann Nahaufnahmen? | Nur beim Kamera-Hinweis „Nah“ am Knoten, weil es noch kein Gefühls-Merkmal „stark“ gibt | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Dialogkamera | Was zeigt die Kamera bei der Antwortauswahl? | Gegenschuss auf den Spieler; GDD 02 nennt für einen stummen Helden den zuhörenden NPC in Nah (Frage 6 offen) – als Einstellung am Kamera-Rig umschaltbar | [Anleitung 16](./Anleitungen/16_Test_Zwischensequenzen.md) |
| Dialogkamera | Wo liegen die Dialogkameras? | In der Boot-Szene (Objekt „Dialogkamera“), damit sie in jeder Weltszene ohne Neubau funktionieren; Blenden über eine Cinemachine-Blendregel statt eines CustomBlends-Assets | [Technik/01](./Technik/01_Architektur.md) |
| Sammeln | Wann blüht die Nachtschattenblüte? | 22 bis 4 Uhr (GDD 02 Z. 1470), als Daten am Sammelpunkt (`activeHours`); die helle Nacht der Beleuchtung bleibt 21–5 | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Was zeigt die Nachtschattenblüte am Tag? | Die geschlossene Knospe ohne Aufforderung; der Kompass-Marker bleibt, damit die Quest „Das Kraut der Kräuterfrau“ den Ort zeigen kann | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Ertrag je Sammelpunkt? | 1–3 Stück für alle Kräuter (GDD 04 Z. 1074); +1 je 25 Stufen Kräuterkunde erst mit dem Beruf in Stufe B | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Kennungen der Kräuter? | `item.herb.blutwurz`, `item.herb.rissmoos`, `item.herb.nachtschattenbluete` (Material, Stapel 99, 0,05 kg, verkäuflich, keine Questgegenstände) | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Grundwert der Kräuter? | Blutwurz 2, Rissmoos 6, Nachtschattenblüte 8 Gold (Entwurf); die 60 Gold für Rissmoos bei Corvin (GDD 02 Z. 1498) sind ein Quest-Handel in 1b | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Wann wächst ein Kraut nach? | Nach 1 Spieltag (Blutwurz) oder 3 Spieltagen (Rissmoos, Nachtschattenblüte) in Spielzeit, nur wenn der Spieler mindestens 50 m entfernt ist; beim Laden sofort. Kein Sonderfall für Rasten und Schnellreise (die Uhr läuft dabei stundenweise, die 50-m-Regel gilt weiter) | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Wo wachsen die Kräuter im Eichental? | Neuer Ort „Kräuterwiese“ (GDD 01 Z. 654) mit 6 Blutwurz und 2 Nachtschattenblüten, 4 Rissmoos am Riss-Rand; Alwines Hütte und der Steinkreis kommen mit 1b | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Sammeln | Wie fallen Kräuter auf? | Kräftigere Farben als die Wiese, leuchtende Rissmoos-Punkte und nachts eine leuchtende Blüte (GDD 05 Z. 594); das Glitzern ab 10 m kommt später, das Leuchten mit R bleibt Hinweisen und Spuren vorbehalten | [Anleitung 17](./Anleitungen/17_Test_Sammeln.md) |
| Kampf | Kampf vom Reittier? | Nur Reiterhieb und Bogen/Armbrust (~15 statt ~60 Animationen) | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Kampf | Alle 11 Waffentypen als Ziel für Stufe C? | Ja, Faustwaffen und Armbrust zuletzt | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Steuerung | Fähigkeiten am Controller: nur Rad (§7.1) oder Rad + Akkord? | Rad + Akkord (RB + Taste), „nur Rad“ als Option | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Steuerung | Schleichen auf Maus/Tastatur: C oder V (§7.2)? | C, Ausweichen nur noch auf Strg | [GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen) |
| Vertical Slice | Ende der Schatzsuche im Vertical Slice? | Letzte Stages bis Stufe B sperren, mit Teaser-Text | [GDD 02](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen) |
| Vertical Slice | Alchemie im Vertical Slice? | Nein, nur Sammeln; Trank als Belohnung | [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#offene-entscheidungen) |
| Quests | Folgen im Entscheidungs-Ledger anzeigen? | Ja: Entscheidungen und Folgen, Folgen erst nach Eintreten | [GDD 02](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen) |
| Quests | Tägliche und wöchentliche Aufträge: Reset nach Echtzeit oder Spieltagen? | Echtzeit (täglich 05:00, wöchentlich Montag 05:00), bis 3 Tage ansammelbar; Händler und Auktionshaus nach Spielwochen | [GDD 02](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen), [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 3) |
| Dialog | Anrede im Deutschen: du/Ihr nach Stand oder überall „du“? | du/Ihr nach Stand, Feld je NPC | [GDD 02](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen) |
| Items | Haltbarkeit und Reparatur von Ausrüstung? | Keine | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 1) |
| Items | Gewicht von Materialien? | Leicht (0,05–1 kg) plus Lagerkisten-Zugriff an den Werkbänken im Haus | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 12) |
| Loot | Smart Loot (Build-Bias bei Affixen)? | 30 % | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 9) |
| Loot | Pity-Zähler für Spieler sichtbar? | Unsichtbar, nur im Entwickler-Overlay | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 13) |
| Wirtschaft | Respec-Preise? | Preise aus GDD 03 plus Teil-Respec je Punkt | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 10) |
| Haus | Anzahl der Häuser in Stufe C? | Gut Eichenruh plus Velmara, Aurelion und Refugium; weitere als Update | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 6) |
| Endgame | Raid-Bosse in Stufe C? | 2 (Brutmutter, Triumvirat), die übrigen 3 als Update | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 7) |
| Endgame | Paragon-Deckel? | 300 Punkte | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 11) |
| Minispiele | Kartenspiel „Rissduell“ schon in Stufe B? | Erst ab C1; eine Lite-Fassung nur, wenn die Messung nach Stufe A Luft zeigt | [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen) (Nr. 8) |
| UI | UI-Kunststil? | Schlicht mit dezenten Fantasy-Ornamenten (Rahmen, Titel) | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| UI | Schriftarten? | 2 Schriften mit Open Font License (Serife für Titel, Sans für Text) | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| UI | Standard für Questmarker? | Abfrage im Erststart-Assistenten, vorausgewählt „Genau“ | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| UI | Schadenszahlen standardmäßig an? | An (Gesammelt) | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| UI | Farbe der Fraktionsquest-Symbole? | Einheitlich Bronze mit Fraktionsemblem | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| UI | Pausieren Hub-Menüs das Spiel? | Ja (`timeScale` 0, Spieluhr steht) | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen) |
| Barrierefreiheit | Zielniveau der Barrierefreiheit? | Grundstufe der Game Accessibility Guidelines komplett, ausgewählte Punkte der Mittelstufe; Screenreader für Menüs ab Stufe B | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| Barrierefreiheit | Option für langsameres Kampftempo? | Ja, mit Ausschluss von den Arena-Rangstufen | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| Audio | Musikproduktion? | Library-Platzhalter; ab Stufe B Auftragskomposition für Hauptthema und Regionsthemen | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| Assets | KI-generierte Platzhalter (Audio, Grafik)? | Nur intern, im Lizenzregister gekennzeichnet, nie im Release | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| Speichern | Speichersperren über §25 hinaus (Dialog, Zwischensequenz, Fall/Sprung/Tauchen, Boss-Arena, zeitkritische Stages)? | Ja, übernehmen (Verbesserungsvorschlag GDD 05, 5.2) | [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen) |
| Speichern | Kompression der Spielstände im Release? | GZip an; Lesbarkeit über Dev-Builds und „Speicherordner öffnen“ | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen) |
| Performance | Notfall-Rückfall für Aurelion: kurze, verdeckte Ladeübergänge erlauben? | Nur, wenn der Performance-Spike scheitert (Abweichung von §4.4) | [Risiken](./Risiken.md#offene-entscheidungen) |
| Telemetrie | Telemetrie bei externen Testern? | Lokal mit Einwilligungsdialog, manuelle Übermittlung | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen) |
| Plattform | Anbindung der Plattformdienste (Erfolge, Cloud)? | Hinter `IPlatformServices`; Steamworks.NET, solange kein Unity Pro (folgt aus Frage 5) | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen) |
| Plattform | Signierung: Apple Developer Program und Windows-Codesignatur? | Apple ab der ersten externen Mac-Version, Windows-Zertifikat vor dem Release | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen), [Technik/03](./Technik/03_Technik-Recherche.md#offene-entscheidungen) |
| Lizenz | Unity Personal oder Pro? | Personal, solange Umsatz plus Finanzierung < 200.000 USD; danach Pro (Pflicht, 2.310 USD je Sitz und Jahr) | [Technik/03](./Technik/03_Technik-Recherche.md#offene-entscheidungen) |
| CI | Umfang der CI? | Linux-Runner für Tests, Mac-Builds lokal oder self-hosted, Windows-IL2CPP ab Phase 4 | [Technik/03](./Technik/03_Technik-Recherche.md#offene-entscheidungen) |
| Technik | Modding-Unterstützung? | Nein, aber das Daten- und ID-Modell nicht verbauen | [Technik/01](./Technik/01_Architektur.md#offene-entscheidungen) |
| Prozess | Abnahme-Verfahren je Phase? | Auftraggeber testet jede Phase mit Controller auf dem MacBook; Windows-Test ab Phase 2 | [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#offene-entscheidungen) |

**Vorschlag:** Neben den ❓-Entscheidungen enthalten die Kapitel begründete Abweichungen vom Master-Prompt, markiert als **Verbesserungsvorschlag** (z. B. Story-Zonen, Quest-Budget, Länge des Vertical Slice, VV1–VV10, Speichersperren). Sie gelten mit dem OK zu Phase 0 als angenommen, solange der Auftraggeber einzelne nicht ausdrücklich ablehnt. Die wichtigsten davon stecken in den Fragen 4, 7 und 8.
