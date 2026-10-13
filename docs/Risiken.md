# Risiken & Gegenmaßnahmen

> Teil der Phase-0-Planung · Stand: 2026-10-13 · Quelle: [Master-Prompt](./00_Master-Prompt.md)

Dieses Dokument erfüllt §33.4 („Nenne die 5 größten Risiken des Projekts und wie wir sie verringern“) und §32.13 („Weise mich auf Risiken hin“). Es bündelt und gewichtet die Abschnitte „Risiken & Hinweise“ aller Phase-0-Kapitel. Die Detailrisiken bleiben in den Kapiteln.

**Kennzeichnungen:** **Vorschlag:** füllt eine Lücke · **Verbesserungsvorschlag:** weicht begründet vom Master-Prompt ab · ❓ **Offene Entscheidung:** liegt beim Auftraggeber, gesammelt unter [Offene Entscheidungen](#offene-entscheidungen).

**Inhalt:** [Kurzfazit](#kurzfazit) · [Bewertungsmaßstab](#bewertungsmaßstab) · [Die 5 größten Risiken](#die-5-größten-risiken) · [Weitere Risiken (Register)](#weitere-risiken-register) · [Empfohlene Leitplanken](#empfohlene-leitplanken) · [Offene Entscheidungen](#offene-entscheidungen)

---

## Kurzfazit

1. **Das größte Risiko ist nicht technisch.** Es liegt im Verhältnis von Umfang zu Kapazität. Der Master-Prompt beschreibt ein Spiel in der Größenordnung von The Witcher 3 oder Skyrim. Allein der Vertical Slice (2–3 h Spielzeit) kostet laut [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#kritischer-pfad-bis-zum-vertical-slice) ≈ 225 Personenwochen (PW). Für eine Person sind das ≈ 4,9 Jahre. Die volle Vision (Stufe C) liegt bei über 25 Personenjahren.
2. **Das Projekt ist nur in Etappen machbar:** mit harten Go/No-Go-Punkten, gemessenen statt geschätzten Produktionsraten und der Bereitschaft, die erste Veröffentlichung deutlich kleiner als die Vision zu planen ([Umfangsstufen](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen)).
3. **Alle Zahlen in diesem Dokument sind Planungsschätzungen** aus den Phase-0-Kapiteln, nicht gemessen. Rechnungen, die nur hier stehen, sind als „eigene Rechnung“ markiert. Die erste echte Messung gibt es nach Phase 2 (Systeme) und nach dem Vertical Slice (Inhalte).

---

## Bewertungsmaßstab

| Stufe | Wahrscheinlichkeit | Auswirkung |
|---|---|---|
| **hoch** | > 50 % ohne Gegenmaßnahmen | bedroht die Veröffentlichung, kostet > 3 Monate oder zerstört Spielervertrauen (z. B. Datenverlust) |
| **mittel** | 20–50 % | kostet Wochen bis 3 Monate oder senkt die Qualität spürbar |
| **niedrig** | < 20 % | kostet Tage, ist lokal behebbar |

Einheiten: 1 PW = 5 Personentage (PT). 1 Personenjahr ≈ 220 PT ≈ 46 produktive Wochen (Annahme aus [GDD 01](./GDD/01_Welt_Story_Fraktionen.md) und [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md)).

---

## Die 5 größten Risiken

### Überblick

| # | Risiko | Wahrscheinlichkeit | Auswirkung | Wichtigster Hebel | Entscheidung nötig |
|---|---|---|---|---|---|
| R1 | Umfang übersteigt die Kapazität: Das Projekt wird nie veröffentlicht | hoch | hoch | Teamgröße/Budget festlegen, erste Veröffentlichung klein planen, Gates | ja (sofort) |
| R2 | Content-Produktion: Quests, Dialoge, DE + EN, Sprachausgabe | hoch | hoch | Quest- und Wortbudgets, Produktionsrate messen, Sprachausgabe begrenzen | ja |
| R3 | Art-, Animations- und Welt-Pipeline (Blender, Movesets, 46 km²) | hoch | hoch | Zukauf von Animationen und Kits, Moveset-Familien, Stilabnahme | ja |
| R4 | Systemverflechtung, Verzweigungen und Speicherstände über Updates | mittel | hoch | Speicher-Rundreise ab Phase 1, ID-Freeze, Golden Saves, Konsequenz-Budget | ja |
| R5 | Open-World-Streaming und 60 FPS auf dem MacBook (und Windows) | mittel | hoch | Streaming- und Performance-Spike in Phase 2, Windows-PC, Benchmark-Route | ja |

### Warum diese fünf

- **R1–R3 sind Mengenrisiken.** Sie treten mit hoher Wahrscheinlichkeit ein, weil die Mengen aus §14.3, §16.2, §9.3 und §20.1 jede realistische Kapazität übersteigen. Technik lässt sich durch Spikes absichern, Menge nicht.
- **R4 und R5 sind die technischen Risiken mit den teuersten Fehlern.** Ein kaputter Speicherstand nach 100 Stunden oder ein Streaming-Konzept, das nach Phase 4 nicht trägt, lassen sich nur mit großem Aufwand reparieren ([ADR A18, A20, A21](./Technik/01_Architektur.md#architektur-entscheidungen-adr-kurzform): „nein“ bzw. „teuer nach Phase 4“). R5 steht hinter R4, weil es sich schon in Phase 2 messen lässt.
- **Bewusst nicht in den Top 5:**
  - **Unity-Versionen und Pakete:** Die Wahrscheinlichkeit ist hoch, die Auswirkung aber mittel. Feste Versionen und Upgrade-Fenster halten das Risiko klein. → Register W1.
  - **Balancing eines 300-h-Spiels:** Die Auswirkung ist mittel. Werte liegen in Daten und lassen sich nach der Veröffentlichung nachjustieren. → W4.
  - **Asset-Lizenzen:** Die Auswirkung ist hoch, das Risiko lässt sich aber mit einem Register billig beherrschen. → W5.
  - **Motivation und Durchhaltevermögen eines langen Solo-Projekts:** Die Ursache ist der Umfang. Das Risiko ist deshalb Teil von R1.

---

### R1 – Der Umfang übersteigt die Kapazität: Das Projekt wird nie veröffentlicht

**Beschreibung:**
Der Master-Prompt verlangt ≥ 400 handgemachte Quests, 8 Regionen, ≥ 60 Gegnertypen, 11 Waffentypen, 70 Systeme und ein Endgame für Monate. Teamgröße und Budget sind nicht festgelegt. §0 („in einer Person“) und der Entwicklungsrechner (ein MacBook Pro, §4.1) deuten auf ein sehr kleines Team hin, wahrscheinlich eine Person mit KI-Unterstützung. Die Gefahr: Jahre Arbeit ohne veröffentlichtes Spiel, am Ende Abbruch aus Erschöpfung, Geldmangel oder Motivationsverlust.

**Warum gerade hier groß:**
- **Vertical Slice ≈ 225 PW** (Bandbreite 160–315 PW). Das entspricht solo ≈ 4,9 Jahren, mit 2 Personen ≈ 2,7 Jahren, mit 3 Personen ≈ 1,8 Jahren ([Technik/02, Gesamtaufwand](./Technik/02_Systeme_und_Abhaengigkeiten.md#kritischer-pfad-bis-zum-vertical-slice)).
- **Kritischer Pfad ≈ 56 PW ≈ 13 Monate.** Schneller geht es auch mit einem großen Team nicht. Zwei XL-Blöcke liegen nacheinander: Nahkampf (8 PW) sowie Quest-Laufzeit und Quest-Editor (13 PW).
- **~60 der 70 Systeme** werden für 2–3 Stunden Spielzeit mindestens teilweise gebraucht. Die Streichliste „Slice-Lite“ spart nur ~10,5 PW (≈ 5 %).
- **Stufe B** (erste veröffentlichbare Version, ~150 Quests) kostet allein für Quest-Inhalte 700–1.000 PT ≈ 3–4,5 Personenjahre, zusätzlich zum Slice ([GDD 02, 10.6](./GDD/02_Quests_und_Dialoge.md#106-authoring-pipeline-und-produktionsrate)).
- **Stufe C** (volle Vision) liegt laut [GDD 00](./GDD/00_Vision_und_Ueberblick.md#risiken--hinweise) bei über 25 Personenjahren.
  - Eigene Rechnung aus den Kapitelwerten: Quests 2.000–3.100 PT + Welt (Ortsbau und Welt-Art) 3.500–4.500 PT + Waffen-Animation 125–250 PT + Endgame 500–800 PT + legendäre Effekte und Set-Boni 90–270 PT ≈ **6.200–8.900 PT ≈ 28–40 Personenjahre**.
  - Darin fehlen noch: Code jenseits des Slice, Figuren, Gegner-Animation, Musik und Übersetzung.
- **Lange Laufzeit verschärft andere Risiken.** Startet Phase 1 im November 2026, endet der Slice mit 3 Personen rechnerisch im Herbst 2028, solo um 2031. Unity 6.3 LTS hat nur Support bis 12/2027 ([Technik/03](./Technik/03_Technik-Recherche.md#1-unity-versionen-plattform-support-lizenz)). Damit ist mindestens ein Engine-Wechsel sicher (W1).
- **Feature-Creep ist eingebaut.** Jede der 6 Säulen lässt sich als Begründung für „noch ein System“ nutzen ([GDD 00](./GDD/00_Vision_und_Ueberblick.md#risiken--hinweise), Risiko 6).
- **Hinweis zur KI-Unterstützung:** Sie kann Code und Textentwürfe beschleunigen. Spielgefühl-Tuning, Playtests, Abnahmen, Animations-Feinschliff und Entscheidungen beschleunigt sie kaum. Wie viel sie spart, ist unbekannt. Es wird in Phase 1–2 gemessen, nicht vorab eingerechnet.

**Bewertung:** Wahrscheinlichkeit **hoch** · Auswirkung **hoch** (Projektabbruch). Bei einer Person ohne Budget ist das Risiko am größten.

**Frühwarnzeichen:**
- Ist-Aufwand nach Phase 2 liegt > 30 % über Plan (Schwelle aus [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#risiken--hinweise), Risiko 11).
- Ein Glied des kritischen Pfads überschreitet seine Timebox um > 50 % (z. B. Nahkampf > 12 PW).
- Features ohne Steckbrief und ohne Umfangsstufe tauchen auf; die Liste „später“ wächst schneller als die Liste „fertig“.
- Mehr als 8 Wochen ohne neuen spielbaren Stand; sinkende Wochenstunden; Phasen-Abnahmen werden verschoben.
- Planung wächst schneller als das Spiel. Phase 0 umfasst bereits ~1,1 MB Text in 10 Dokumenten.

**Gegenmaßnahmen:**
1. **Sofort (Abschluss Phase 0):** Teamgröße, Budget und Zeitrahmen als ehrliche Zahlen festlegen und daraus die Zielstufe der ersten Veröffentlichung ableiten. **Vorschlag:** Ohne diese Zahlen gilt als Planungsgrundlage „1 Person + Zukauf“ mit dem Ziel **B-Minimal** (Eichental + Goldküste, ~70 Quests, ~40 h, [GDD 00](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen)).
2. **Ab Phase 0.4:** Scope-Lock nach [Leitplanke L1](#empfohlene-leitplanken). Jedes Feature braucht einen Steckbrief mit Umfangsstufe. Neue Features kommen nur gegen eine gleich große Streichung hinein.
3. **Ende Phase 2 (Gate G1):** Ist-PW je System mit dem Plan vergleichen. Bei > 30 % Abweichung wird neu geplant und die Streichliste „Slice-Lite“ angewendet.
4. **Ende Phase 4 (Gate G2):** PT je Quest, Gegnertyp, Dungeon und km² messen. Danach entscheiden: Stufe B, B-Minimal oder Neuausrichtung.
5. **Ab Phase 1:** Zukauf statt Eigenbau für alles, was nicht Kern ist: Animationspakete, VFX, Umgebungs-Kits ([Leitplanke L9](#empfohlene-leitplanken)). Das ist der einzige Hebel, der den kritischen Pfad verkürzt, ohne Team und Umfang zu ändern.
6. **Laufend ab Phase 1:** Alle 6–8 Wochen ein spielbarer Meilenstein mit kurzer Demo-Aufnahme. Feste Wochenstunden statt Crunch. Ein Early Access ab B-Minimal bringt früh Rückmeldung und eventuell Einnahmen.

**Entscheidung des Auftraggebers:**
- ❓ **Offene Entscheidung:** Teamgröße, Budget und Zeitrahmen bis zur ersten Veröffentlichung.
- ❓ **Offene Entscheidung:** Zielstufe der ersten Veröffentlichung (B oder B-Minimal), endgültig nach Gate G2.

---

### R2 – Content-Produktion: Quests, Dialoge, Lokalisierung DE + EN, Sprachausgabe

**Beschreibung:**
Quests sind laut §16.1 das Herzstück. Gefordert sind mindestens 400 handgemachte Quests, jede mit mehreren Lösungswegen (§16.5), Dialogen, Begleiter-Reaktionen und Deutsch und Englisch von Anfang an (§4.2). Jede Quest durchläuft 8 Schritte: Idee, Outline, Daten, Dialoge, Platzierung, Test, Übersetzung, Abnahme. Das Tempo des Schreibens bestimmt die Spielzeit.

**Warum gerade hier groß:**
- **Produktionsrate für eine Person** ([GDD 02, 10.6](./GDD/02_Quests_und_Dialoge.md#106-authoring-pipeline-und-produktionsrate)):

  | Kategorie | PT je Quest | Quests je Woche |
  |---|---|---|
  | Nebenquest | ~3,4 | ~1,5 |
  | Fraktions-, Regions- oder Begleiterquest | ~6 | ~0,8 |
  | Hauptquest | ~12,5 | ~0,4 |
  | Kleinformat (Kopfgeld, Schatz …) | ~1,5–2 | ~2,5–3 |

- **Budget 427 + 33 Quests ≈ 2.000–3.100 PT ≈ 9–14 Personenjahre.** Eigene Rechnung mit diesen Raten: 60 Hauptquests ÷ 0,4 + 206 Fraktions-, Regions- und Begleiterquests ÷ 0,8 + 126 Nebenquests ÷ 1,5 + 35 Kleinformate ÷ 2,75 + 33 legendäre ÷ 0,8 ≈ **545 Wochen ≈ 12 Jahre** für eine Person. Allein die 60 Hauptquests kosten 750 PT ≈ 3,4 Personenjahre.
- Die Raten setzen fertige Werkzeuge, Gegner und Umgebungen voraus. **Neue Zwischensequenzen, Gegnertypen und Mechaniken sind nicht enthalten.** Die ersten 10 Quests dauern erfahrungsgemäß doppelt so lange. Schon der Slice braucht 36 PT ≈ 7–8 Wochen reine Quest-Arbeit. Dazu kommen 3 eigene Movesets und 2 Rätsel ([GDD 02](./GDD/02_Quests_und_Dialoge.md#risiken--hinweise), Risiko 11).
- **Textvolumen:** Die Obergrenze liegt bei ~1,02 Mio. Wörtern Deutsch, realistisch bei ~650.000 Wörtern ([GDD 02, 13.3](./GDD/02_Quests_und_Dialoge.md#133-wortbudgets-vorschlag)). Dazu kommen ~1.100 Bark-Zeilen, ~720 Lagerfeuer-Zeilen, Codex und Items (~430 Rezepte, ~300 Basistypen, [GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#risiken--hinweise)).
- **Übersetzung EN** (eigene Rechnung mit 0,10–0,15 € je Wort aus GDD 02): 650.000 Wörter ≈ **65.000–97.500 €**, bei der Obergrenze ≈ 100.000–150.000 €. Ohne externe Übersetzung kostet sie Zeit: 0,3 PT je Nebenquest, 1 PT je Hauptquest.
- **Sprachausgabe:** Allein der unvertonte Protagonist spart geschätzt 8.000–12.000 Aufnahmen ([GDD 00](./GDD/00_Vision_und_Ueberblick.md#elevator-pitch--spielerfantasie)). Eine vertonte Hauptstory in zwei Sprachen wäre ein eigener Kostenblock, der in keinem Kapitel beziffert ist.
- **Proben mit Würfeln** statt fester Schwellen bringen +30–50 % Dialogtext und doppelten Testaufwand ([GDD 02](./GDD/02_Quests_und_Dialoge.md#offene-entscheidungen)).
- **Spannung zur Kernsäule 2:** ≥ 60 % der Quests mit ≥ 2 Lösungswegen ([GDD 00](./GDD/00_Vision_und_Ueberblick.md#die-6-kernsäulen)) erhöhen den Aufwand je Quest direkt.

**Bewertung:** Wahrscheinlichkeit **hoch** · Auswirkung **hoch** (Spielzeit-Ziele aus §1 werden verfehlt oder die Qualität sinkt zu Füllquests).

**Frühwarnzeichen:**
- Die 8 Beispiel-Quests brauchen > 45 PT (25 % über 36 PT).
- Nach der Einarbeitung (ab Quest 11) liegt der Durchsatz unter 1 Nebenquest pro Woche.
- Der Längen-Validator meldet regelmäßig Wörter über Budget.
- Der Übersetzungsstand hängt mehr als einen Meilenstein zurück.
- Quests im Status „Entwurf“ stauen sich. Das Konsequenz-Register enthält offene Haken.

**Gegenmaßnahmen:**
1. **Abschluss Phase 0:** Quest-Budget 427 + 33 und Wortbudgets (Hauptquest ≤ 4.000, Nebenquest ≤ 1.500 Wörter) verbindlich machen. Proben deterministisch statt mit Würfeln.
2. **Phase 3 (Schritt 3.6):** Zuerst einen Listen-Editor mit voller Validierung bauen, den Graph erst nach dem Spike. Das spart 3–6 Wochen auf dem kritischen Pfad. Budget-Zähler je Kategorie und Region im Editor. Quest-Vorlagen je Kategorie und wiederverwendbare Mechanik-Bausteine (Feuer + Öl, Licht-Strahl, Umgebungs-Stagger).
3. **Ende Phase 4 (Gate G2):** PT je Quest messen. **Vorschlag:** Liegt die Rate > 30 % unter Plan, sinkt für Stufe B die Zahl der Nebenquests je Region (z. B. von 18 auf 12), bevor bei der Qualität gespart wird.
4. **Ab Phase 1:** Lokalisierungs-Pipeline nach [GDD 02, 13.4](./GDD/02_Quests_und_Dialoge.md#134-lokalisierung-de--en-von-anfang-an-42): Deutsch zuerst, Englisch je Meilenstein durch eine muttersprachliche Fachkraft, Pseudo-Lokalisierung (+30–40 % Länge) ab dem ersten Build, Kontextnotiz je Eintrag. Übersetzungsbudget je Meilenstein einplanen.
5. **Stufe A und B:** Sprachausgabe nur für Barks und Kampflaute, Protagonist unvertont. Über eine vertonte Hauptstory wird erst nach Stufe B mit eigenem Budget entschieden.
6. **Vorschlag ab Stufe B:** Nebenquests teilweise an externe Autorinnen oder Autoren vergeben, mit Styleguide (Ton, Anrede, Twist-Katalog) und dem Quest-Editor als einzigem Werkzeug.

**Entscheidung des Auftraggebers:**
- ❓ **Offene Entscheidung:** Quest-Budget 427 + 33 statt der Kategorien-Summe (464–750).
- ❓ **Offene Entscheidung:** Umfang der Sprachausgabe und Budget für die englische Übersetzung.
- ❓ **Offene Entscheidung:** Dialogproben deterministisch (empfohlen) oder mit Würfeln.

---

### R3 – Art-, Animations- und Welt-Pipeline (Blender)

**Beschreibung:**
§4.1 sieht Modelle aus Blender vor, bis dahin Platzhalter. Eine Person für Grafik oder Animation ist nicht benannt. Animationen sind kein eigenes System, blockieren aber vier Systeme, darunter zwei auf dem kritischen Pfad: Nahkampf (S26), KI (S39), Begleiterin (S46) und Klettern (S48) ([Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#risiken--hinweise), Risiko 8). Die Welt mit ~46 km² und ~560 Orten muss gebaut, bepflanzt und beleuchtet werden.

**Warum gerade hier groß:**
- **Spieler-Animationen für Waffen:** 11 Typen × ~14 eigene Clips + 5 Familien × ~20 gemeinsame Clips ≈ **250 Clips**. Bei 0,5–1 PT je Clip sind das **125–250 PT**, nur für Waffen ([GDD 03, 5.2](./GDD/03_Kampf_Charakter_Progression.md#52-animationsaufwand--ehrliche-einordnung)).
- **Gegner-Animationen** (eigene Rechnung, in keinem Kapitel beziffert):
  - 67 Gegnertypen auf ~12 Basis-Rigs ([GDD 01, 11](./GDD/01_Welt_Story_Fraktionen.md#11-gegner-roster-201--bosse-203)).
  - Je Typ ~5 eigene Clips (3–4 Angriffe, Elite-Angriff) ≈ 335 Clips. Je Rig ~15 gemeinsame Clips (Bewegung, Treffer, Tod) ≈ 180 Clips.
  - Zusammen **~500 Clips ≈ 250–500 PT**.
  - Für nicht-humanoide Rigs (Vierbeiner, Spinnen, Drachen, Schlangen) funktioniert das Humanoid-Retargeting von Unity nicht. Gekaufte Menschen-Animationen helfen dort nicht.
- **Bosse:** 5 Story-Bosse plus Finale mit je 3 Phasen, 40–64 Dungeon-Bosse (davon 40 % als eigener Boss), 31 Weltboss-Konzepte (~290 PT inkl. Arena und Mechanik). Dazu kommen Reiten (~15 Clips nur für Hiebe und Bogen, ~60 für ein volles Moveset), Klettern, Schwimmen und Begleiter.
- **Welt:**
  - Welt-Art: 25–40 PT je km² × 46 km² = 1.150–1.850 PT (5–8 Personenjahre) ([GDD 01, 3.1](./GDD/01_Welt_Story_Fraktionen.md#31-weltgröße-vorschlag)).
  - Ortsbau für ~560 Orte und Objekte: ~2.400 PT ([GDD 01, 5](./GDD/01_Welt_Story_Fraktionen.md#5-content-mengen-143)).
  - Beides überlappt teilweise und ergibt zusammen 3.500–4.500 PT.
- **Musik:** ~90 Tracks in Stufe C, der größte Audio-Kostenblock ([GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#risiken--hinweise)).
- **Frei gestaltbare Spielfigur:** 2 Körpertypen verdoppeln die Anpassungsarbeit für jedes Rüstungsteil (~75 Set-Teile, Transmog).
- **Stil:** Gemischte Gratis-Assets erzeugen Stilbrüche. Der Grad der Stilisierung ist „später nicht mehr änderbar“ ([GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen)). Der GPU Resident Drawer schließt `MaterialPropertyBlock` aus. Asset-Store-Inhalte können das unterlaufen ([Technik/01](./Technik/01_Architektur.md#risiken--hinweise), Risiko 10).

**Bewertung:** Wahrscheinlichkeit **hoch** · Auswirkung **hoch** (blockiert den kritischen Pfad; ohne Grafikkapazität bleibt das Spiel auf Platzhalter-Niveau).

**Frühwarnzeichen:**
- Der Kampf-Prototyp in Phase 2 (Schritt 2.2) wartet auf Clips oder läuft mit Animationen, die sich nicht nachjustieren lassen.
- Ist-PT je Clip liegt über 1. Retargeting-Fehler (Füße rutschen, Hände treffen den Griff nicht) häufen sich.
- PT je km² im Slice (1,1 km²) liegen über 40.
- Die Stilabnahme wird verschoben. Das Team gewöhnt sich an den Platzhalter-Look.
- Import-Fehler aus Blender (Maßstab, Achsen, Pivot) wiederholen sich.

**Gegenmaßnahmen:**
1. **Abschluss Phase 0:** Über den Zukauf entscheiden. Empfehlung aus [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#offene-entscheidungen): Animationspakete für Grundbewegung, Nahkampf, Bogen und Klettern auf einem Humanoid-Rig. Dazu ein Kreaturen-Paket für die 3 Slice-Rigs. Jede Lizenz wird vor dem Kauf geprüft ([Leitplanke L7](#empfohlene-leitplanken)).
2. **Phase 1:** Blender-Pipeline-Test mit Vorlage-`.blend`, Test-FBX und Import-Validator. Eine Animationsliste je Phase hält fest, welcher Clip welches System entsperrt.
3. **Phase 2–4:** Moveset-Familien (5 statt 11 Grundsätze), Gegnervarianten als Daten (12 Rigs für 67 Typen), 60 % der Bosse als Champion-Variante mit eigener Arena. Hybride bauen auf vorhandenen Fähigkeiten auf.
4. **Vor der Blender-Produktion (spätestens Ende Phase 4):** Stilabnahme mit einem Referenzboard aus 10–15 Bildern. Modul-Kits für Dungeons, POIs und Siedlungen statt Einzelbau.
5. **Nach Gate G2:** PT je Clip, je km² und je Dungeon messen. Bei > 40 PT/km² schrumpfen Kar'Zul und die Frostgipfel auf 70 % ([GDD 01, 3.1](./GDD/01_Welt_Story_Fraktionen.md#31-weltgröße-vorschlag)). Faustwaffen und Armbrust kommen zuletzt oder als Erweiterung.
6. **Vorschlag ab Stufe B:** Externe Grafik- und Animationskapazität (Freelancer) für Figuren, Rüstungen und Kreaturen-Rigs budgetieren. Eine Person, die Code, Design und Text trägt, kann 46 km² Welt nicht zusätzlich bauen.

**Entscheidung des Auftraggebers:**
- ❓ **Offene Entscheidung:** Animations- und Umgebungspakete zukaufen? Wenn ja, welches Budget?
- ❓ **Offene Entscheidung:** Externe Grafik ab Stufe B. Weltgröße (~46 km² oder 70 %-Option). Grad der Stilisierung.
- ❓ **Offene Entscheidung:** Spielfigur frei gestaltbar (2 Körpertypen) oder fest. Kampf vom Reittier nur mit Hieben und Bogen.

---

### R4 – Systemverflechtung, Verzweigungen und Speicherstände über Updates

**Beschreibung:**
70 Systeme hängen über Conditions/Actions, den Weltzustand, stabile IDs und den EventBus zusammen. Entscheidungen wirken verzögert, teils 30 Stunden später (§16.5). §25 verlangt: „Speicherstände dürfen bei Updates nicht kaputtgehen.“ Das empfohlene Early-Access-Modell ([GDD 00](./GDD/00_Vision_und_Ueberblick.md#offene-entscheidungen)) macht daraus viele Updates mit ladbaren Ständen. Die Gefahr: Soft-Locks, tote Konsequenz-Haken und verlorene Spielstände. Laut [GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#risiken--hinweise) ist das „der schlimmste Vertrauensverlust bei 100+ h Spielzeit“.

**Warum gerade hier groß:**
- **70 Systeme in 40 Assemblies.** Schon auf dem Papier fallen 14 Widersprüche zwischen Abhängigkeiten und Architektur auf (K1–K14, [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#konsistenz-prüfung-gegen-die-architektur)).
- **Die 8 Beispiel-Quests schreiben bereits ~30 Flags** und verknüpfen sich gegenseitig: Mühlbach wirkt auf Brief, Grimmbart, Schatzkarte und Aurelion. Hochgerechnet auf 400+ Quests ist die Kombinatorik von Hand nicht mehr testbar ([GDD 02](./GDD/02_Quests_und_Dialoge.md#risiken--hinweise), Risiko 2).
- **Story-Kombinatorik:** 13 Story-Entscheidungen, 5 Enden, Ally-Score und Fraktionsausschlüsse ([GDD 01](./GDD/01_Welt_Story_Fraktionen.md#risiken--hinweise), Risiko 2).
- **Tote Haken:** Ein Haken aus Stufe A (Harrik im Eichental) wird erst in Stufe B (Aurelion) eingelöst. Wird Aurelion gekürzt, bleibt der Haken tot.
- **Fundament-Entscheidungen sind ab dem ersten externen Build nicht mehr umkehrbar:** ID-Format (A12), Speicherformat (A18), Migrationskette (A20). `[SerializeReference]`-Typnamen sind ab dem ersten Content-Asset eingefroren. Umbenennen macht Bedingungen und Aktionen in allen Quests „missing“ ([Technik/01](./Technik/01_Architektur.md#risiken--hinweise), Risiko 2).
- **Datenmenge im Spielstand:** bis zu 1.000 Inventar-Einträge, 650 Lagerplätze und bis zu 800 Möbel je Haus in bis zu 7 Häusern ([GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#risiken--hinweise), Risiko 6). Trotzdem gilt: Laden in unter 15 s (§4.4).

**Bewertung:** Wahrscheinlichkeit **mittel** (mit [Leitplanke L6](#empfohlene-leitplanken); ohne sie hoch) · Auswirkung **hoch** (Datenverlust, Soft-Locks, schlechte Bewertungen im Early Access).

**Frühwarnzeichen:**
- Die Speicher-Rundreise schlägt in einer Phasen-Abnahme fehl, oder ein Golden-Save-Test wird rot.
- Validator-Warnungen wie „Flag ohne Leser“, „kaputter `[IdRef]`“ oder „fehlender Typ“ nehmen von Phase zu Phase zu.
- Playtests melden „Quest nicht abschließbar“ oder „NPC fehlt“.
- Der Event-Tracer zeigt Ketten, die niemand mehr erklären kann.
- Das Laden eines Spielstands dauert länger als 15 s, oder der Spielstand wächst unkontrolliert.

**Gegenmaßnahmen:**
1. **Vor Phase 0.4:** K1–K14 in [Technik/01](./Technik/01_Architektur.md) einarbeiten. Ab Schritt 1.1 prüft ein Assembly-Regel-Test in der CI jede Referenz.
2. **Phase 1:** VV1–VV3 aus der [Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge) übernehmen: IDs und Validator in 1.3, Speicher-Kern mit Golden-Save-Gerüst in 1.5, Conditions und Weltzustand in 1.8. Jedes neue System liefert sein `ISaveable` sofort mit.
3. **Ab Phase 3:**
   - Konsequenz-Budget: höchstens 3 externe Flags je Quest.
   - Nur 3 strukturelle Verzweigungen (Pakt, Belagerung, Ende). Alle anderen Entscheidungen ändern Details.
   - Konsequenz-Register im Editor. Jeder Haken hat eine günstige Rückfallebene (Bark, Brief, Ledger-Satz).
4. **Ab Phase 3:**
   - Automatisierte Pfadtests je Quest-Ausgang in der CI.
   - Erreichbarkeitstest aller Enden über `set_flag`-Kombinationen.
   - Soft-Lock-Regeln aus [GDD 02](./GDD/02_Quests_und_Dialoge.md#risiken--hinweise): Hauptquests scheitern nie, nur der Spieler tötet benannte NPCs, Nachlass-Truhen.
5. **Ab dem ersten externen Build:**
   - ID- und Typnamen-Freeze, `[MovedFrom]` ist Pflicht.
   - Golden Saves je veröffentlichter Version.
   - Eine Formatänderung ohne Migration ergibt einen roten Build.
   - Atomares Schreiben mit `.bak`-Rotation ([Technik/01, 9](./Technik/01_Architektur.md#9-speichersystem-25)).

**Entscheidung des Auftraggebers:**
- ❓ **Offene Entscheidung:** Release-Modell (Early Access ja oder nein) und Zeitpunkt des ersten externen Builds. Ab diesem Build gilt der Freeze.
- ❓ **Offene Entscheidung:** Roadmap-Anpassungen VV1–VV10 übernehmen (Empfehlung: vollständig).

---

### R5 – Open-World-Streaming und 60 FPS auf dem MacBook (und Windows)

**Beschreibung:**
§4.4 verlangt:
- 60 FPS auf einem aktuellen MacBook Pro mit mittleren Einstellungen und auf einem Mittelklasse-PC mit hohen Einstellungen,
- keine Ladebildschirme innerhalb der offenen Welt,
- Ladezeiten unter 15 s.

URP bietet kein fertiges Open-World-Streaming ([Technik/03](./Technik/03_Technik-Recherche.md#kurzfazit)). Entwickelt wird auf dem Mac, der größere Markt ist Windows. Windows-IL2CPP-Builds lassen sich auf macOS nicht erstellen.

**Warum gerade hier groß:**
- **Frame-Budget 16,67 ms je Frame.** Davon entfallen auf KI 2,0 ms, auf Streaming 1,5 ms (Spitzen ≤ 3,0 ms), auf den Render-Thread 3,5 ms. Die Reserve beträgt nur 2,67 ms ([Technik/01, 13](./Technik/01_Architektur.md#13-performance-44-27)).
- **Streaming-Konzept A21:** Zellen mit 512 m Kantenlänge, 3 × 3 aktiv, 5 × 5 vorgeladen. Eigene Rechnung: 46 km² ≈ **175 Zellen**. Abbruchkriterium des Spikes: Frame-Spitzen > 33 ms an Zellgrenzen. A21 ist „teuer nach Phase 4“, der Render-Pfad A02 „teuer ab Phase 2“.
- **MacBook:**
  - Native Retina-Auflösung ist für 60 FPS zu teuer. Geplant ist eine Render-Skalierung von 75 %. Ob ein temporaler Upscaler unter Metal verfügbar ist, ist nicht verifiziert.
  - Unified Memory (Referenz 18 GB, App ≤ 6 GB), thermische Drosselung nach ~10 min. Messungen im Editor täuschen.
- **Aurelion** ist der teuerste Einzelort: 13 der 60 Hauptquests spielen dort, das Budget beträgt ≤ 40 simulierte NPCs je aktiver Zelle ([GDD 01](./GDD/01_Welt_Story_Fraktionen.md#risiken--hinweise), Risiko 4). Dazu kommen der Bau-Modus mit bis zu 800 Objekten, Gruppen-KI (Stresstest mit 30 Gegnern) und die Inseldrift im Zerbrochenen Himmel.
- **Windows:** IL2CPP, DX12-Treiber und Controller-Unterschiede fallen vom Mac aus erst spät auf. Ein Windows-PC ist noch nicht entschieden.
- **Paket-Verhalten:** AI Navigation 2.0.16 backt Terrain-Bäume in das NavMesh ein. Dichte Wälder können Wege verlieren ([Technik/03](./Technik/03_Technik-Recherche.md#risiken--hinweise)).

**Bewertung:** Wahrscheinlichkeit **mittel** · Auswirkung **hoch** (ein Umbau des Streamings nach Phase 4 betrifft jede Zelle und jede Quest-Platzierung).

**Frühwarnzeichen:**
- Die Benchmark-Route liegt schon mit Platzhaltern unter 60 FPS, oder die 1 %-Tiefs liegen unter 45.
- Streaming-Spitzen über 3 ms. Der Speicher wächst über 20 Minuten Spielzeit (Addressables-Lecks).
- Nach 10 Minuten Aufwärmen fällt die Leistung deutlich ab (Drosselung).
- Der Windows-Build ist seit mehr als 2 Wochen nicht getestet.
- Neue Asset-Store-Inhalte fallen im Frame Debugger aus dem GPU Resident Drawer.

**Gegenmaßnahmen:**
1. **Abschluss Phase 0:** Referenz-Hardware festlegen (Vorschlag: MacBook Pro M3 Pro mit 18 GB und PC mit RTX-4060-Klasse, [Technik/01, 13.1](./Technik/01_Architektur.md#131-zielhardware-vorschlag)). Windows-PC spätestens bis Phase 2 beschaffen.
2. **Phase 2 (Schritt 2.6):** Streaming-Spike mit 4 × 4 Zellen und festem Abbruchkriterium. Rückfall: den Slice in einer großen Szene bauen und A21 vor Phase 4 neu bewerten.
3. **Ab Phase 2:**
   - Wöchentliche Benchmark-Route im Build, nie im Editor, mit Performance-Log.
   - Frame- und Speicherbudgets je System. KI-LOD und zeitgeteilte Wahrnehmung.
   - Shader- und GRD-Regeln vor der ersten Asset-Welle. Den Upscaler im Grafik-Spike prüfen.
4. **Ab Phase 1:** Wöchentlicher Windows-Mono-Build, Windows-PC ab Phase 2, IL2CPP-Build ab Phase 4. Controller-Matrix (Xbox, DualSense, DualShock 4, generisch) auf beiden Systemen.
5. **Vor Stufe B:** Ein Aurelion-Prototyp mit 1 Viertel und 40 NPCs als Performance-Test auf dem MacBook. Rückfall: Viertel als eigene Streaming-Bereiche mit verdeckten Übergängen (Stadttore). Ein echter Ladebildschirm wäre eine Abweichung von §4.4 und bräuchte das OK des Auftraggebers.

**Entscheidung des Auftraggebers:**
- ❓ **Offene Entscheidung:** Referenz-Hardware für Mac und PC sowie Anschaffung eines Windows-PCs ab Phase 2.
- ❓ **Offene Entscheidung:** Darf Aurelion im Notfall kurze, verdeckte Ladeübergänge bekommen? Das wäre ein **Verbesserungsvorschlag** gegenüber §4.4, nur wenn die Messung es erzwingt.

---

## Weitere Risiken (Register)

W = Wahrscheinlichkeit, A = Auswirkung. Die Phase nennt den Zeitpunkt der Gegenmaßnahme (§31, Schritte laut [Technik/02, Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge)).

| # | Risiko | W | A | Gegenmaßnahme | Phase |
|---|---|---|---|---|---|
| W1 | **Engine- und Paket-Umbruch:** 6.3 LTS (Support bis 12/2027) → 6.7 LTS → Unity 7 mit CoreCLR ohne Mono. Graph Toolkit bricht seine API noch. Addressables läuft in zwei Linien. Paket-Patches ändern Verhalten (NavMesh 2.0.16). | hoch | mittel | Exakt gepinnte Pakete. Upgrade-Fenster von 1–2 PW auf eigenem Branch mit Tests, Golden Saves und Validator. CoreCLR-Regeln ab Tag 1. Listen-Editor vor Graph-Editor. Keine Kernlogik auf Unity Behavior. | 0.4, 3.0, danach jährlich |
| W2 | **Kampfgefühl erreicht „wuchtig“ (§9.1) nicht.** Hitstop, Puffer und Parierfenster wirken erst im Spiel. Platzhalter-Animationen verfälschen das Gefühl. | mittel | hoch | Kampf-Prototyp in Schritt 2.2 mit allen Tuningwerten in ScriptableObjects. Wöchentliche Playtests mit Controller und Maus/Tastatur auf Mac und Windows. Kampfgefühl als Kriterium von Gate G1. | 2 |
| W3 | **UI Toolkit und 100 % Controller-Bedienung:** 28 Systeme mit eigener Controller-UI, 10 Hub-Tabs, die Fokus-Navigation gilt als Schwachstelle. | mittel | mittel | UI-Spike in Schritt 1.11 mit Abbruchkriterium und uGUI-Rückfall. Komponentenbibliothek (Tabs, Fokusliste, Tooltip, Vergleich). Inventar als Referenzmenü in Phase 2. | 1–2 |
| W4 | **Balancing eines 300-h-Spiels:** 6 Attribute × 11 Waffen × 7 Schulen × 8 Statuseffekte × 16 Reaktionen × 4 Schwierigkeiten. Die XP-Bänder aus GDD 02 bringen Level 30 nach ~21 h statt ~40 h. Story-Level-Lücke in Akt 4–5. Endgame-Inflation bis ~10.000 Gold je h. ~90 legendäre und Set-Verhaltensweisen. | hoch | mittel | Alle Werte in Balancing-SOs und CSV. DPS-Rechner in Phase 3, Simulationsskripte im Repo. XP-Modell zwischen [GDD 02](./GDD/02_Quests_und_Dialoge.md) und [GDD 03](./GDD/03_Kampf_Charakter_Progression.md) vor der Massenproduktion abstimmen. Telemetrie „Level bei Queststart“. Kalibrierung nach Stufe A und B. | 3, 4, 7 |
| W5 | **Asset-Lizenzen (rechtlich):** Platzhalter mit unklarer Lizenz rutschen in den Release. CC BY-SA, CC BY-NC und „nur privat“ sind ausgeschlossen. KI-generierte Inhalte sind urheberrechtlich unsicher. | mittel | hoch | Lizenzregister `Assets/ThirdParty/THIRDPARTY.md` ab dem ersten Import. Präfix `PH_`. Der Release-Build bricht bei `PH_` oder ungeklärter Lizenz ab. KI-Inhalte nie im Release. Credits werden aus dem Register erzeugt ([Technik/01, 1.5](./Technik/01_Architektur.md); [GDD 05, 2.6](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md)). | 0.4, 1, vor jedem externen Build |
| W6 | **Kanon-Abweichungen zwischen parallel geschriebenen Kapiteln:** Aether-Sicht bei ~1:15 (00) oder erst in HQ 4 (01). Begleiterquests 35 statt 32, Nebenquests 126 statt 129. Festkalender in 04 und 01 verschieden. Doppelte Namen („Maren“). XP-Bänder 02 gegen 03. | hoch | mittel | Ein Kanon-Abgleich aller Kapitel vor Phase 0.4 und vor Phase 3. Je Thema genau ein Kanon-Kapitel ([GDD 01](./GDD/01_Welt_Story_Fraktionen.md) für Welt und IDs). Der ID-Validator prüft auch gleiche Vornamen. | 0, 3 |
| W7 | **Windows-Qualität bei Mac-Entwicklung:** IL2CPP nicht vom Mac baubar, DX12-Treiber, Controller-Unterschiede. | hoch (ohne PC) | mittel | Wöchentlicher Windows-Mono-Build ab Phase 1, eigener Windows-PC ab Phase 2, IL2CPP ab Phase 4, Controller-Matrix je Meilenstein. | 1, 2, 4 |
| W8 | **Endgame-Umfang** größer als der ganze Vertical Slice: 500–800 PT, Expeditionen mit ≈ 250 Prefabs, 5 Raids, Begleiter-KI in Raid-Mechaniken. | hoch | mittel | Stufe C3 bewusst schneiden: 2 Raids, 2 Feste, Expeditionen aus den Dungeon-Kits, Biome von 3 auf 8 wachsen lassen. Früher Prototyp mit einem Raid vor C3. | ab B planen, 7 bauen |
| W9 | **Offene Story-Kernentscheidung:** Der Antagonist (wer öffnete den Großen Riss) ist offen, der Slice deutet ihn aber an (Graumäntel in Quest 1, 3, 6). | mittel | mittel | Slice-Texte nennen nur gemeinsame Elemente aller Optionen. Die Entscheidung fällt vor den Akt-1-Dialogen, spätestens vor Phase 6 ([GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen)). | 3 |
| W10 | **Sensible Themen und Altersfreigabe:** Hexenverbrennung, Massaker, ein Kind mit Aether-Fieber, eine an Wüstenkulturen angelehnte Region. Simuliertes Glücksspiel (Würfeln, Arena-Wetten, Blinde Ware). Blut und Finisher. | mittel | mittel | Ziel-Freigabe früh festlegen (Empfehlung USK 16 / PEGI 16). Externes Sensitivity-Review für Kar'Zul vor dem Content-Lock. Glücksspiel nur mit Spielgold. Kinder nie dauerhaft geschädigt. | 0, vor 6 |
| W11 | **Repo-, LFS- und CI-Kosten:** Texturen und Audio erreichen leicht 100+ GiB. Das Freikontingent beträgt 10 GiB je Monat. macOS-Runner kosten ~10× so viel wie Linux-Runner. Eine 0-USD-Sperre blockiert die Arbeit mitten im Monat. | hoch | niedrig | Budget-Limit ~25 USD je Monat mit Alarm. `.blend` und `.psd` außerhalb des Repos oder nur als Meilensteine. LFS-Cache in der CI. Tests auf Linux, Mac-Builds lokal. | 0.4 |
| W12 | **Bus-Faktor und Wissensverlust:** Das Wissen steckt bei einer Person und im Gesprächskontext der KI-Unterstützung. Die Phase-0-Dokumente umfassen ~1,1 MB. | mittel | hoch | Status-Liste „Erledigt / In Arbeit / Als Nächstes“ (§32.14), ADRs, Testanleitung je Schritt (§32.10). Remote-Repository plus Offline-Backup. Kurze Übergabenotiz je Phase. | ab 0.4, laufend |
| W13 | **Kosten- und Plattformpflichten:** Unity Pro ist ab 200.000 USD Umsatz plus Funding Pflicht (2.310 USD je Sitz und Jahr). Steam-Support im Platform Toolkit nur mit Pro. Apple Developer Program für die Notarisierung. Windows-Codesignatur gegen SmartScreen. | mittel | niedrig | Kosten in das Budget aufnehmen. Bei jeder Finanzierungsrunde die Schwelle prüfen. Steamworks.NET hinter `IPlatformServices`. Notarisierung ab dem ersten externen Mac-Build. | 4, Release |
| W14 | **Spielstände „verschwinden“ durch Namensänderung:** Firmen- und Produktname sind Teil von `persistentDataPath` und der Steam-Cloud-Pfade. | mittel | hoch | Firmen-, Produktname und Bundle-ID vor dem Projekt-Setup festlegen und danach nie ändern ([Technik/01](./Technik/01_Architektur.md#offene-entscheidungen)). | 0.4 |
| W15 | **Systemüberladung für Spieler:** 12 Berufe, Gold + 7 Fraktionsmarken + Aether-Splitter, Weltstufen, Paragon, Sets, Sockel, Verzauberung. Die dichte Controller-Belegung führt zu Fehleingaben. | mittel | mittel | Freischaltung in Etappen ([GDD 00, „Was ist neu nach Stunde X“](./GDD/00_Vision_und_Ueberblick.md#pacing--anti-langeweile)). Keine weitere Währung. Codex-Tutorials. Kontextregeln einzeln abschaltbar. Playtest-Metrik „ungewollte Sprünge und Rollen“. | 4–7 |

---

## Empfohlene Leitplanken

**Vorschlag:** Diese Regeln gelten verbindlich ab dem OK zu Phase 0. Sie halten die Risiken R1–R5 und W1–W15 klein. Ändern darf sie nur der Auftraggeber.

| # | Leitplanke | Regel | Wirkt gegen |
|---|---|---|---|
| L1 | **Scope-Lock und Feature-Steckbrief** | Kein Feature ohne Steckbrief (Säulen, Umfangsstufe, Kosten S/M/L/XL, [GDD 00](./GDD/00_Vision_und_Ueberblick.md#die-6-kernsäulen)). Neue Features nur gegen eine Streichung gleicher Größe („eins rein, eins raus“). Nach Gate G2 gilt ein Feature-Freeze für die Zielstufe: Danach kommen nur noch Inhalte und Fehlerbehebungen hinein. Die Nicht-Ziele werden bei jeder Phasen-Abnahme geprüft. | R1, W8, W15 |
| L2 | **Go/No-Go-Gates** | **G0** Ende Phase 0: offene Entscheidungen beantwortet, Kanon abgeglichen. **G1** Ende Phase 2: Kampf-Prototyp fühlt sich gut an, Streaming-Spike bestanden, Benchmark ≥ 60 FPS, Ist-PW ≤ Plan + 30 %. **G2** Ende Phase 4 (Vertical Slice): 2–3 h spielbar, Pacing-Report, 60 FPS auf beiden Referenzgeräten, Speichern vollständig, PT je Quest, Gegner, Dungeon und km² gemessen. Danach Wahl: B, B-Minimal oder Neuausrichtung. **G3** vor dem ersten externen Build: Freeze von IDs und Format, Lizenzprüfung bestanden. Ein nicht bestandenes Gate stoppt die nächste Phase, bis neu geplant ist. | R1, R2, R3, R5 |
| L3 | **Content-Budgets je Region und Kategorie** | Quest-Budget 427 + 33 und Wortbudgets je Kategorie, gezählt im Quest-Editor. Je Region feste Obergrenzen für Gegnertypen, Dungeons, POIs und km². Konsequenz-Budget: ≤ 3 externe Flags je Quest. Eine rote Zahl im Zähler stoppt neue Inhalte dieser Kategorie. | R2, R3, R4 |
| L4 | **Spike vor jedem Großsystem** | Jedes XL-System bekommt vorher einen Spike: Timebox 2–10 Tage, schriftliches Abbruchkriterium, dokumentierter Rückfall. Pflicht-Spikes: UI (1.11), Kampf (2.2), Streaming (2.6), Graph-Editor (nach 6.7), Aurelion-Performance (vor B), Raid-KI (vor C3). | R5, W2, W3, W1 |
| L5 | **Wöchentlicher Build auf Mac und Windows** | Ab Phase 1 jede Woche ein Mac-Build und ein Windows-Mono-Build. Ab Phase 2 die Benchmark-Route im Build mit Performance-Log. Ab Phase 4 Windows-IL2CPP. Controller-Matrix bei jedem Meilenstein. Ein Build, der seit mehr als 2 Wochen nicht auf Windows lief, gilt als Fehler. | R5, W7, W2 |
| L6 | **Speicherstand-Kompatibilität als Build-Kriterium** | Jede Phasen-Abnahme enthält eine Speicher-Rundreise aller `ISaveable`s. Ab dem ersten externen Build: Golden Saves je Version in der CI, Freeze von IDs und `[SerializeReference]`-Typnamen, `[MovedFrom]` ist Pflicht. Eine Formatänderung ohne Migration ergibt einen roten Build. | R4, W14 |
| L7 | **Lizenzregister und Platzhalter-Regel** | Kein Fremd-Asset ohne Registereintrag (Quelle, Lizenz, Datum, Credits-Pflicht). Platzhalter tragen das Präfix `PH_`. Der Release-Build bricht bei `PH_` oder ungeklärter Lizenz ab. KI-generierte Inhalte nie im Release. | W5 |
| L8 | **Messen statt schätzen** | Ist-PW und Ist-PT je System, Quest, Clip und km² stehen in der Status-Liste (§32.14). Neu-Kalkulation nach Phase 2 und nach dem Slice. Dieses Dokument wird bei jeder Phasen-Abnahme und mindestens monatlich überprüft: Bewertungen, Frühwarnzeichen und Status der Gegenmaßnahmen. | R1, R2, R3, W4 |
| L9 | **Zukauf vor Eigenbau außerhalb des Kerns** | Selbst gebaut werden nur die Kernsysteme (Quests, Dialoge, Conditions/Actions, Speichern, Kampf-Logik, Streaming-Steuerung). Animationen, VFX, Umgebungs-Kits, Kreaturen und Platzhalter-Audio werden gekauft oder lizenziert, wenn ein geprüftes Paket existiert. | R1, R3 |
| L10 | **Nachhaltiges Tempo** | Feste Wochenstunden, kein Crunch. Alle 6–8 Wochen ein spielbarer Meilenstein mit kurzer Aufnahme. Phase-0-Dokumente werden nach dem OK nur noch bei Entscheidungen geändert, nicht weiter ausgebaut. | R1, W12 |

❓ **Offene Entscheidung:** Die Leitplanken L1–L10 als verbindliche Projektregeln übernehmen? Empfehlung: ja, vollständig. L2 (Gates) und L8 (Messen) haben die größte Wirkung.

---

## Offene Entscheidungen

| Frage | Optionen | Empfehlung | Warum wichtig |
|---|---|---|---|
| Teamgröße, Budget und Zeitrahmen (R1) | Solo · 2–3 Personen · 4–6 Personen · zusätzlich externe Grafik | Eine ehrliche Zahl nennen. Ohne Zahl gilt „1 Person + Zukauf“ | Vertical Slice ≈ 225 PW: solo ≈ 4,9 Jahre, 3 Personen ≈ 1,8 Jahre |
| Zielstufe der ersten Veröffentlichung (R1) | Stufe B (~150 Quests, 3 Regionen + Aurelion-Hub) · B-Minimal (~70 Quests, 2 Regionen, ~40 h) | Planungsgrundlage B-Minimal. Endgültig nach Gate G2 | Allein die Quests der Stufe B kosten 3–4,5 Personenjahre |
| Quest-Budget, Wortbudgets und Dialogproben (R2) | Kategorien-Summe 464–750 · Budget 427 + 33; Proben mit Würfeln · deterministisch | Budget 427 + 33, Wortbudgets laut GDD 02, Proben deterministisch | ~12 Personenjahre Quest-Arbeit bei einer Person; Würfel bringen +30–50 % Text |
| Sprachausgabe und Übersetzung (R2) | keine · nur Barks · Hauptstory · voll; Übersetzung extern · intern | Stufe A/B nur Barks und Kampflaute, Protagonist unvertont; EN extern je Meilenstein | Übersetzung ≈ 65.000–97.500 € (eigene Rechnung); Vertonung ist ein unbezifferter Kostenblock |
| Zukauf und externe Grafik (R3) | nur Gratis-Platzhalter · Animations- und Umgebungspakete kaufen · zusätzlich Freelancer ab B | Pakete kaufen ab Phase 1, Freelancer ab Stufe B | ~250 Waffen-Clips und ~500 Gegner-Clips; Animationen blockieren den kritischen Pfad |
| Weltgröße und Stil (R3) | ~46 km² · 70 %-Option für Kar'Zul und Frostgipfel; Stilisierung realistisch · Mitte · stark | 46 km² mit 70 %-Option nach Messung; Stil „Mitte“ mit Referenzboard | Welt-Art 25–40 PT je km²; der Stil ist später nicht mehr änderbar |
| Release-Modell und erster externer Build (R4) | Early Access · Vollrelease · Demo + Vollrelease | Early Access ab B-Minimal oder B | Ab dem ersten externen Build sind IDs und Speicherformat eingefroren |
| Referenz-Hardware und Windows-PC (R5) | Vorschlag aus Technik/01, 13.1 · eigene Geräte; Windows-PC · nur CI · keiner | MacBook Pro M3 Pro 18 GB, PC mit RTX-4060-Klasse; eigener Windows-PC ab Phase 2 | Ohne feste Geräte ist §4.4 nicht prüfbar; Windows-IL2CPP geht nicht vom Mac |
| Notfall-Rückfall für Aurelion (R5) | strikt ohne Ladeübergang (§4.4) · verdeckte Übergänge erlaubt, falls die Messung es erzwingt | Erlauben, nur nach gescheitertem Performance-Spike | Aurelion ist der teuerste Ort und Schauplatz von 13 Hauptquests |
| Leitplanken L1–L10 | vollständig · teilweise · keine | vollständig | Ohne Gates und Messung wächst der Umfang unkontrolliert (R1) |

Verwandte Entscheidungen in den Kapiteln: Monetarisierung, Vertriebsplattform und Altersfreigabe ([GDD 00](./GDD/00_Vision_und_Ueberblick.md#offene-entscheidungen)), Antagonist und Romanzen ([GDD 01](./GDD/01_Welt_Story_Fraktionen.md#offene-entscheidungen)), Waffentypen in Stufe C ([GDD 03](./GDD/03_Kampf_Charakter_Progression.md#offene-entscheidungen)), Raid-Anzahl ([GDD 04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md#offene-entscheidungen)), KI-generierte Platzhalter ([GDD 05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md#offene-entscheidungen)), Firmen- und Produktname sowie Engine-Upgrade ([Technik/01](./Technik/01_Architektur.md#offene-entscheidungen), [Technik/03](./Technik/03_Technik-Recherche.md#offene-entscheidungen)).
