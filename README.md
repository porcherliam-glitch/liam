# Chroniken von Aetherfall

Ein 3D-Open-World-Action-RPG in Unity 6 (Universal Render Pipeline, C#) für macOS mit Apple Silicon und Windows-PC. Als Rissgeborener erkundet der Spieler den vor 300 Jahren zerbrochenen Kontinent Aetherfall, entscheidet zwischen sieben Fraktionen und stellt sich der erwachenden Leere: mit wuchtigem Echtzeit-Kampf, Quests mit echten Konsequenzen und einem Endgame für Monate. Grundlage ist die verbindliche Spezifikation des Auftraggebers im [Master-Prompt](./docs/00_Master-Prompt.md).

**Status:** Phase 0 – Planung (Stand 2026-10-13). Es gibt noch **keinen Code und kein Unity-Projekt**. Code entsteht erst nach dem OK des Auftraggebers (§32.1). Aktueller Stand: [Projektstatus](./docs/Status.md) · Fragen an den Auftraggeber: [Offene Fragen](./docs/Offene_Fragen.md)

**Inhalt:** [GDD auf einen Blick](#gdd-auf-einen-blick) · [Dokumente](#dokumente) · [Arbeitsweise](#arbeitsweise) · [Nächste Schritte](#nächste-schritte)

---

## GDD auf einen Blick

Verdichtet aus den Phase-0-Dokumenten. Viele Werte sind **Vorschläge** und Startwerte für das Balancing; mit ❓ markierte Punkte entscheidet der Auftraggeber ([Offene Fragen](./docs/Offene_Fragen.md)).

| Bereich | Kernaussage |
|---|---|
| Vision | Quests mit Konsequenzen wie in The Witcher 3, lernbarer, wuchtiger Kampf wie in Elden Ring, aber zugänglicher, und ein Endgame für Monate. Sechs Kernsäulen: Erkundung belohnt immer, Entscheidungen zählen, ständiger Fortschritt, Abwechslung, lebendige Welt, Spielerfreiheit. Ziel-Spielzeit 40–60 h Story, 150–200 h mit Nebenquests, 300+ h komplett ([GDD 00](./docs/GDD/00_Vision_und_Ueberblick.md)). |
| Welt | Kontinent Aetherfall mit 8 Regionen vom Eichental (Level 1–10) bis zum Zerbrochenen Himmel (60–80), ~46 km² begehbar (❓ Frage 10), feste Gebietslevel, ~480 markierte Orte, Tag/Nacht, Wetter mit Gameplay-Effekten, Weltereignisse und NPC-Tagesabläufe ([GDD 01](./docs/GDD/01_Welt_Story_Fraktionen.md)). |
| Story | 5 Akte mit 60 Hauptquests (45–57 h). Persönlicher Faden: die Schwester Lina. Gegenspieler ist der Graue Wanderer, wer den Großen Riss öffnete, ist offen (❓ Frage 9). Vier Enden laut §18 plus Rückfall-Ende, optional ein fünftes; danach New Game+ ([GDD 01](./docs/GDD/01_Welt_Story_Fraktionen.md)). |
| Fraktionen und Begleiter | 7 Fraktionen mit Ruf in 8 Stufen; der Pakt am Ende von Akt 2 schließt andere Wege aus. 8 Begleiter mit Loyalität, Lagerfeuer-Gesprächen und eigenen Questreihen, dazu Tierbegleiter Wolf, Falke, Bär ([GDD 01](./docs/GDD/01_Welt_Story_Fraktionen.md)). |
| Quests und Dialoge | Budget 427 handgemachte Quests plus 33 legendäre (❓ Frage 7), ≥ 60 % mit mehreren Lösungswegen, verzögerte Konsequenzen über Weltzustand-Flags, Entscheidungs-Ledger im Questlog, 12 prozedurale Vorlagen, Quest- und Dialog-Editor, Dialogproben ohne Würfel (Empfehlung) ([GDD 02](./docs/GDD/02_Quests_und_Dialoge.md)). |
| Kampf | Echtzeit mit Ausdauer, Ausweichrolle, Blocken, perfektem Parieren, Haltung und Finishern. 11 Waffentypen, Magie in 7 Schulen × 6 Zaubertypen, 8 Statuseffekte, Element-Kombinationen, Gegner mit lernbaren Mustern, 4 Schwierigkeitsgrade jederzeit änderbar ([GDD 03](./docs/GDD/03_Kampf_Charakter_Progression.md)). |
| Charakter und Progression | 6 Attribute, 6 Klassen frei mischbar plus Hybridklassen, Skilltrees mit ≥ 40 Knoten. Level 1–80 mit je 1 Attribut- und 1 Skillpunkt, XP-Kurve als Formel (Level 10 / 30 / 60 nach ~4 / 39 / 119 h), Story-Korridor für Hauptquests (❓ Frage 8) ([GDD 03](./docs/GDD/03_Kampf_Charakter_Progression.md)). |
| Items und Loot | Inventar ohne Platzlimit, begrenzt durch Traglast. 7 Seltenheitsstufen mit festen Farben, Affixe, Sockel, Sets, Transmog. Loot-Qualitätsstufen, Glück und Bad-Luck-Protection (Legendär spätestens nach 200 Ausrüstungs-Drops) ([GDD 04](./docs/GDD/04_Items_Crafting_Wirtschaft_Endgame.md)). |
| Crafting, Haus, Wirtschaft | 12 Berufe (7 Herstellung, 5 Sammeln) mit Stufen 1–100. Anwesen Gut Eichenruh in 3 Ausbaustufen mit Bau-Modus. Währungen: Gold, 7 Fraktionsmarken, Aether-Splitter; Gold-Bilanz je Spielphase durchgerechnet ([GDD 04](./docs/GDD/04_Items_Crafting_Wirtschaft_Endgame.md)). |
| Endgame | 10 Weltstufen, Riss-Expeditionen mit 18 Modifikatoren, Arena, Raid-Bosse, Paragon bis 300 Punkte, 11 legendäre Waffen-Questreihen, Sammlungen, Erfolge, saisonale Feste; keine Grind-Pflicht ([GDD 04](./docs/GDD/04_Items_Crafting_Wirtschaft_Endgame.md)). |
| UI/UX, Audio, Grafik | Controller zuerst, Button-Glyphen je Gerät, Menüs öffnen in ≤ 0,15 s, Erststart-Assistent, Barrierefreiheit nach den Game Accessibility Guidelines. Musik-Zustandsmaschine, Stil „leicht stilisierter Realismus“, 4 Grafik-Presets ([GDD 05](./docs/GDD/05_UI_Audio_Grafik_Barrierefreiheit.md)). |
| Technik-Stack | Unity 6.6 (seit 2026-10-14, vorher geplant 6.3 LTS), Wechsel auf 6.7 LTS vor Phase 3. URP mit Forward+, Render Graph und GPU Resident Drawer. Input System, Cinemachine 3, Addressables, Localization (DE/EN), Newtonsoft JSON für Spielstände. Releases mit IL2CPP, Mac nur Apple Silicon. Git + LFS, GameCI ([Technik/01](./docs/Technik/01_Architektur.md), [Technik/03](./docs/Technik/03_Technik-Recherche.md)). |
| Architektur-Kernideen | Bootstrapper und ServiceLocator, typisierter EventBus, ScriptableObject-Definitionen getrennt von speicherbaren Laufzeit-Instanzen, stabile String-IDs, Conditions & Actions per `[SerializeReference]`, Weltzustand aus Flags, versionierte Spielstände mit Migration und Golden Saves, Welt-Streaming in 512-m-Zellen. 40 Assemblies in Schichten, 70 Systeme ([Technik/01](./docs/Technik/01_Architektur.md), [Technik/02](./docs/Technik/02_Systeme_und_Abhaengigkeiten.md)). |
| Umfangsstufen und Aufwand | **A** Vertical Slice: ~1 km² Eichental, 8 Beispiel-Quests, ~3,5–4 h. **B** erste Veröffentlichung: ~150 Quests, ~75–90 h; Rückfallebene B-Minimal mit ~70 Quests, ~40 h. **C** volle Vision. Aufwand bis zum Slice ≈ 225 Personenwochen, Stufe C über 25 Personenjahre ([GDD 00](./docs/GDD/00_Vision_und_Ueberblick.md#umfangsstufen), [Risiken](./docs/Risiken.md)). |

---

## Dokumente

| Dokument | Inhalt |
|---|---|
| [Master-Prompt](./docs/00_Master-Prompt.md) | Verbindliche Spezifikation des Auftraggebers (§0–§33) |
| [GDD 00 – Vision und Überblick](./docs/GDD/00_Vision_und_Ueberblick.md) | Vision in 10 Sätzen, Säulen, Zielgruppe, Core Loops, Pacing, Spielzeiten, Umfangsstufen, Dokumenten-Index, Glossar |
| [GDD 01 – Welt, Story, Fraktionen](./docs/GDD/01_Welt_Story_Fraktionen.md) | Setting, Lore, Hauptstory und Enden, Regionen, lebendige Welt, NPCs, Fraktionen, Ruf, Begleiter, Gegner-Roster, Bosse |
| [GDD 02 – Quests und Dialoge](./docs/GDD/02_Quests_und_Dialoge.md) | Quest-Kategorien und Budget, Ziel-Typen, Konsequenzen, Questlog, prozedurale Aufträge, Quest-Editor, die 8 Beispiel-Quests, Dialogsystem, Lokalisierung |
| [GDD 03 – Kampf, Charakter, Progression](./docs/GDD/03_Kampf_Charakter_Progression.md) | Steuerung, Kamera, Bewegung, Kampf, Waffen, Magie, Statuseffekte, Schaden, Gegner-KI, Werte, Klassen, Skilltrees, Erfahrung und Level |
| [GDD 04 – Items, Crafting, Wirtschaft, Endgame](./docs/GDD/04_Items_Crafting_Wirtschaft_Endgame.md) | Inventar, Ausrüstung, Seltenheit, Loot, Crafting und Berufe, Haus, Wirtschaft, Endgame, Minispiele |
| [GDD 05 – UI, Audio, Grafik, Barrierefreiheit](./docs/GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) | HUD, Menüs, Bedienregeln, Audio, Art Direction, Grafikoptionen, Barrierefreiheit, Speichern aus Spielersicht |
| [Technik/01 – Architektur](./docs/Technik/01_Architektur.md) | Tech-Stack, Projekt-Setup-Checkliste, Assemblies, Kernsysteme, Daten, IDs, Speichern, Streaming, Performance, Konventionen, ADRs |
| [Technik/02 – Systeme und Abhängigkeiten](./docs/Technik/02_Systeme_und_Abhaengigkeiten.md) | 70 Systeme, Abhängigkeitsgraph, Bau-Reihenfolge, kritischer Pfad, Schnittstellen |
| [Technik/03 – Technik-Recherche](./docs/Technik/03_Technik-Recherche.md) | Geprüfte Fakten zu Unity-Versionen, Paketen, APIs, Git LFS, Builds und CI (Stand Oktober 2026) |
| [Risiken](./docs/Risiken.md) | Die 5 größten Risiken mit Gegenmaßnahmen, Risiko-Register, Leitplanken mit Gates |
| [Offene Fragen](./docs/Offene_Fragen.md) | Die 10 wichtigsten Fragen an den Auftraggeber und alle weiteren offenen Entscheidungen |
| [Projektstatus](./docs/Status.md) | Erledigt / In Arbeit / Als Nächstes, Entscheidungs-Log |

---

## Arbeitsweise

Kurzfassung der Arbeitsregeln aus §32 des Master-Prompts:

- **Reihenfolge:** Zuerst Phase 0. Code erst nach dem OK des Auftraggebers. Große Lieferungen in nummerierten Teilen, kleine testbare Schritte, nach jedem größeren Schritt eine kurze Testanleitung.
- **Skripte:** immer vollständig, ohne „Rest bleibt gleich“. Zu jedem Skript stehen Ordner und GameObject dabei. Unity-Einstellungen werden Schritt für Schritt erklärt (Menü, Haken).
- **Code-Regeln:** Ordnerstruktur und Namespaces einhalten. Keine veralteten APIs (kein altes Input-System, kein `FindObjectOfType` in Update-Schleifen). `[SerializeField] private` statt öffentlicher Felder. Kommentare einheitlich in einer Sprache (Empfehlung Englisch, ❓ Frage 3).
- **Jedes System:** denkt Speichern und Laden mit; jede UI ist voll mit dem Controller bedienbar; alles läuft auf Mac und PC.
- **Mitdenken:** Verbesserungen vorschlagen, auf Risiken hinweisen (Performance, Umfang, Komplexität), bei Entscheidungen des Auftraggebers nachfragen statt raten.
- **Status:** Die laufende Liste „Erledigt / In Arbeit / Als Nächstes“ steht in [docs/Status.md](./docs/Status.md).
- **Dokumente:** Sprache Deutsch. Kennzeichnungen: **Vorschlag:** füllt eine Lücke · **Verbesserungsvorschlag:** weicht begründet vom Master-Prompt ab · ❓ **Offene Entscheidung:** liegt beim Auftraggeber und wird am Dateiende gesammelt. IDs sind stabile Strings in snake_case mit Punkt-Hierarchie, ohne Umlaute (z. B. `quest.main.asche_ueber_eichental`).

---

## Nächste Schritte

1. Der Auftraggeber liest die Dokumente und beantwortet die [10 Fragen](./docs/Offene_Fragen.md#die-10-wichtigsten-fragen). Bis dahin gelten die Empfehlungen als vorläufiger Standard.
2. Die Antworten kommen ins [Entscheidungs-Log](./docs/Status.md#entscheidungs-log) und in die betroffenen Kapitel (Gate G0).
3. Nach dem OK: Phase 0, Schritt 4 – Projekt-Setup nach [Technik/01, Abschnitt 2](./docs/Technik/01_Architektur.md#2-projekt-setup-checkliste) (Unity-Version, Pakete, Ordner, Assemblies, Git mit `.gitignore`, `.gitattributes` und Git LFS).
4. Phase 1 – Fundament nach der [Bau-Reihenfolge](./docs/Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge): Test- und CI-Gerüst, Bootstrapper, ServiceLocator, EventBus, GameStateManager, danach Input, Spielercontroller und Kamera, Stats und Health, Speicher-Grundgerüst.
