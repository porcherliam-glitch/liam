# Projektstatus

> Laufende Status-Liste (§32.14) · Stand: 2026-10-13 · Quelle: [Master-Prompt](./00_Master-Prompt.md)

Laufende Liste „Erledigt / In Arbeit / Als Nächstes“ nach §32.14. Ab dem Abschluss von Phase 0 ist diese Datei die führende Status-Liste. Die [Status-Liste in Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md#status-liste-3214) hält den Stand während der Erstellung fest und wird nicht weitergeführt.

**Aktuelle Phase:** Phase 0 ist abgeschlossen (Schritte 1–3 als geprüfter Entwurf). Der Auftraggeber hat am 2026-10-13 das OK gegeben ("OK, fang an"). In Arbeit: Phase 0, Schritt 4 (Projekt-Setup) und Phase 1, Schritt 1 (Fundament). Bis zu Antworten auf die [offenen Fragen](./Offene_Fragen.md) gelten die Empfehlungen als Standard.

**Inhalt:** [Erledigt](#erledigt) · [In Arbeit](#in-arbeit) · [Als Nächstes](#als-nächstes) · [Entscheidungs-Log](#entscheidungs-log)

---

## Erledigt

| Auftrag | Ergebnis | Dokument |
|---|---|---|
| Master-Prompt analysiert | Spezifikation §0–§33 als verbindliche Grundlage | [Master-Prompt](./00_Master-Prompt.md) |
| §31 Phase 0, Schritt 1 – Game-Design-Dokument | GDD in 6 Kapiteln (Entwurf), Lücken als **Vorschlag**, Abweichungen als **Verbesserungsvorschlag** markiert | [GDD 00](./GDD/00_Vision_und_Ueberblick.md) · [01](./GDD/01_Welt_Story_Fraktionen.md) · [02](./GDD/02_Quests_und_Dialoge.md) · [03](./GDD/03_Kampf_Charakter_Progression.md) · [04](./GDD/04_Items_Crafting_Wirtschaft_Endgame.md) · [05](./GDD/05_UI_Audio_Grafik_Barrierefreiheit.md) |
| §31 Phase 0, Schritt 2 – Technisches Architekturdokument | Tech-Stack, Projekt-Setup-Checkliste, 40 Assemblies in Schichten, Kernsysteme, Datenmodell, Speichern, Streaming, ADR A01–A42 | [Technik/01](./Technik/01_Architektur.md) |
| Technik-Recherche (Grundlage für Schritt 2 und 4) | Unity-Version, Paketversionen, veraltete APIs, Git LFS, Builds, CI; Checkliste „Nicht verifiziert“ für das Setup | [Technik/03](./Technik/03_Technik-Recherche.md) |
| §31 Phase 0, Schritt 3 – Systeme mit Abhängigkeiten | 70 Systeme, Abhängigkeitsgraph, Bau-Reihenfolge Phase 1–7 mit Abweichungen VV1–VV10, kritischer Pfad (≈ 57,5 PW), Aufwand bis zum Vertical Slice (≈ 225 PW) | [Technik/02](./Technik/02_Systeme_und_Abhaengigkeiten.md) |
| §33.1 – Vision in 10 Sätzen | 10 Sätze, Elevator Pitch, Spielerfantasie | [GDD 00, Vision](./GDD/00_Vision_und_Ueberblick.md#vision-in-10-sätzen) |
| §33.2 – GDD als strukturierte Übersicht | Dokumenten-Index, Glossar, Umfangsstufen A/B/C; Kurzfassung im README | [GDD 00, Index](./GDD/00_Vision_und_Ueberblick.md#dokumenten-index) · [README](../README.md#gdd-auf-einen-blick) |
| §33.3 – Liste aller Systeme | siehe Schritt 3 | [Technik/02, Systemkatalog](./Technik/02_Systeme_und_Abhaengigkeiten.md#systemkatalog) |
| §33.4 – 5 größte Risiken | R1–R5 mit Gegenmaßnahmen, Register W1–W15, Leitplanken L1–L10 mit Gates G0–G3 | [Risiken](./Risiken.md) |
| §33.5 – bis zu 10 Fragen | 10 gebündelte Fragen mit Empfehlungen, dazu alle weiteren offenen Entscheidungen als Tabelle | [Offene Fragen](./Offene_Fragen.md) |
| Prüfung der Phase-0-Dokumente | Sechs Prüfdurchgänge: Konsistenz Welt/Quests, Konsistenz Systeme, Technik-Fakten, Abdeckung §1–§32, Zahlen GDD 00–02, Zahlen GDD 03–04 | Befunde in den Kapiteln |
| Projekt-README und diese Status-Liste | Einstieg, GDD auf einen Blick, Dokumente, Arbeitsweise | [README](../README.md) · diese Datei |

---

## In Arbeit

| Punkt | Stand | Wer |
|---|---|---|
| Phase 0, Schritt 4 – Projekt-Setup | Code fertig und geprüft: `.gitignore`, `.gitattributes`, Editor-Werkzeug „Aetherfall > Projekt-Setup …“, Einsteiger-Anleitung [Anleitungen/01](./Anleitungen/01_Projekt-Setup.md) (GitHub Desktop + Vorlagen-Kopie). **Wartet auf den ersten Lauf in Unity auf dem Mac.** | Auftraggeber |
| Phase 1, Schritt 1 – Fundament | Code fertig und geprüft: `GameBootstrapper`, `ServiceLocator`, `EventBus`, `GameStateService`, Logging, Installer, Debug-Overlay. Außerhalb von Unity mit .NET 8 kompiliert, 148 EditMode-Tests grün. **Wartet auf den Test in Unity** ([Anleitungen/02](./Anleitungen/02_Test_Phase1_Fundament.md)). | Auftraggeber |
| Phase 1 – Spielfigur, Steuerung, Kamera, Testgelände | Code fertig und geprüft: Input-System (5 Action Maps im Code, Geräteerkennung, Pause), Spielfigur (Gehen/Laufen/Sprinten/Schleichen/Springen, Coyote-Time, Hänge), Cinemachine-Kamera, Menü „Aetherfall > Testgelände erstellen“. Außerhalb von Unity kompiliert, 271 Tests grün (157 auch ohne Pakete). **Wartet auf den Test in Unity** ([Anleitungen/03](./Anleitungen/03_Test_Spielfigur.md)). | Auftraggeber |
| Phase 1 – Werte, Lebenspunkte, Ausdauer, Speichern | Code fertig und geprüft: Stat-System (Attribute, Modifikatoren, Formeln aus GDD 03), Ressourcen (LP/Ausdauer/Mana), Health/Damageable, DamageCalculator, Ausdauer beim Sprinten/Springen, Speicher-Kern (ISaveable, Slots, JSON, Backups, Migration, Sperren, Autosave), Schnellspeichern F5 / Schnellladen F9. 562 Tests grün (283 ohne Pakete). **Wartet auf den Test in Unity** ([Anleitungen/04](./Anleitungen/04_Test_Werte_Speichern.md)). | Auftraggeber |
| Phase 2 – Kampf und erster Gegner | Code fertig und geprüft: Nahkampf (leichte Kombo, schwerer Angriff, Sprint-/Sprungangriff, Blocken, perfektes Parieren, Ausweichrolle mit I-Frames, Haltung, Finisher), Lock-On, Treffer-Gefühl (lokaler Hitstop, Kamera-Impuls, Rückstoß, Schadenszahlen), Wolf und Aether-Wolf mit KI (Wahrnehmung, Angriffs-Token, Leash), Arena im Testgelände. 794 Tests grün (492 ohne Pakete). **Wartet auf den Test in Unity** ([Anleitungen/05](./Anleitungen/05_Test_Kampf.md)). | Auftraggeber |
| Phase 2 – Items, Inventar, Ausrüstung, Loot | Code fertig und geprüft: Item-Definitionen und -Instanzen, Seltenheiten mit Affixen, Inventar mit Traglast/Überladung, Ausrüstungsslots nach §12.2 mit Stat-Modifikatoren, Gold, Loot-Tabellen mit Glück und Bad-Luck-Schutz, Beute von Wölfen mit Loot-Strahl, Truhen, Interaktionssystem, Debug-Inventar (Tab), alles speicherbar. 1046 Tests grün (669 ohne Pakete). **Wartet auf den Test in Unity** ([Anleitungen/06](./Anleitungen/06_Test_Items_Loot.md)). | Auftraggeber |
| Antworten auf die [10 Fragen](./Offene_Fragen.md#die-10-wichtigsten-fragen) | Bis zur Antwort gelten die Empfehlungen als vorläufiger Standard (u. a. Unity 6.3 LTS, Kommentare auf Englisch) | Auftraggeber |

---

## Als Nächstes

1. **Auftraggeber:** Dokumente lesen, die [10 Fragen](./Offene_Fragen.md#die-10-wichtigsten-fragen) beantworten und das OK zu Phase 0 geben (§32.1, §33: „Danach warte auf meine Antwort“).
2. **Antworten übernehmen:** Jede Entscheidung ins [Entscheidungs-Log](#entscheidungs-log) eintragen und die betroffenen Kapitel anpassen, insbesondere VV1–VV10 in Technik/01 und Technik/02. Danach ist Gate G0 erreicht.
3. **Phase 0, Schritt 4 – Projekt-Setup** nach [Technik/01, Abschnitt 2](./Technik/01_Architektur.md#2-projekt-setup-checkliste), erst nach dem OK:
   - Unity 6.3 LTS (neuester 6000.3-Patch), URP-Projekt, Pakete exakt gepinnt.
   - Ordnerstruktur nach §5, 40 leere Assemblies (asmdefs), Boot-Szene.
   - Git mit `.gitignore`, `.gitattributes`, Git LFS und UnityYAMLMerge; erster Commit mit Tag `setup-6000.3.<patch>`.
   - Checkliste „Nicht verifiziert“ aus [Technik/03](./Technik/03_Technik-Recherche.md#nicht-verifiziert) im Unity Hub und Package Manager abarbeiten.
   - Testanleitung für den Auftraggeber (§32.10).
4. **Phase 1, Schritt 1.1:** Test- und CI-Gerüst (GameCI auf Linux, Assembly-Regel-Test) und Logging (S70, S01).
5. **Phase 1, Schritt 1.2:** Bootstrapper, ServiceLocator, EventBus und GameStateManager (S02–S04; §31, Phase 1.1).
6. **Phase 1, Schritte 1.3–1.11** laut [Technik/02, Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge): IDs und Validator, Szenen laden, Speicher-Kern mit Golden Saves, Optionen und Lokalisierung, Input System, Conditions & Actions mit Weltzustand, Stats und Health, Spielercontroller und Kamera, UI-Spike mit Haupt- und Pausemenü. Abnahme Phase 1: Golden Save `v1` lädt in der CI, Speicher-Rundreise aller Systeme, Windows-Mono-Build startet.

Ab Phase 1 bekommt jeder Schritt hier zusätzlich Ist-Aufwand (PW) und Datum der Abnahme, damit die Schätzung nach Phase 2 nachgerechnet werden kann ([Leitplanke L8](./Risiken.md#empfohlene-leitplanken)).

---

## Kurskorrektur nach Antwort 1 (Solo, 50 €)

Der Auftraggeber arbeitet allein, das Geldbudget beträgt 50 €. Das ändert nicht die Vision, aber die Reihenfolge der Ziele:

1. **Neues erstes Ziel: „Mini-Slice“ (Stufe A0, Vorschlag).** Ein Ausschnitt des Eichentals, der in 30–60 Minuten durchspielbar ist: Dorf Eichental mit Umgebung und „Die vergessene Gruft“. 3 der 8 Beispiel-Quests („Asche über Eichental“, „Die Wölfe vom Nordhang“, „Die vergessene Gruft“), 2–3 Gegnertypen (Wolf, Aether-Wolf, Gruftwächter als Mini-Boss), 1 Waffentyp (Einhandschwert mit Schild), 1 Startklasse (Krieger), kein Begleiter. Speichern und Laden funktionieren vollständig. Danach wird der echte Aufwand gemessen und der Vertical Slice (Stufe A, §31 Phase 4) neu geplant.
2. **Kostenlos statt gekauft:** Unity Personal (0 €), privates GitHub-Repo mit LFS-Freikontingent (10 GiB Speicher und 10 GiB Download pro Monat). Im GitHub-Billing ein Budget-Limit von **0 $** setzen: keine Überraschungskosten; bei Überschreitung sperrt LFS bis Monatsende, deshalb Binärdateien klein halten. Platzhalter aus CC0-Quellen (Kenney, Quaternius, Poly Haven, ambientCG), Unity „Starter Assets – Third Person“, Animationen über Mixamo (kostenlos mit Adobe-Konto), Sounds von Freesound (Lizenz je Datei prüfen). Jede Quelle kommt ins Lizenzregister ([Risiken, W5](./Risiken.md#weitere-risiken-register)).
3. **Die 50 € nicht vor Phase 2 ausgeben.** Größter Hebel laut [R3](./Risiken.md#r3--art--animations--und-welt-pipeline-blender) ist ein Nahkampf-Animationspaket (im Asset-Store-Sale). Entscheidung erst, wenn der Kampf-Prototyp mit Mixamo-Animationen steht.
4. **Kein Windows-PC nötig:** Windows-Testbuilds entstehen als Mono-Build auf dem Mac. IL2CPP-Builds für Windows erst, wenn ein Windows-Rechner verfügbar ist.
5. **Werkzeuge schlank:** Listen-Editor statt Graph-Editor für Quests und Dialoge (bereits Empfehlung), keine kostenpflichtigen CI-Runner. Tests laufen lokal im Unity Test Runner.
6. **Steam-Gebühr (100 $)** wird erst bei einer Veröffentlichung fällig und ist aus dem jetzigen Budget nicht eingeplant.

---

## Entscheidungs-Log

Hier stehen nur Entscheidungen des Auftraggebers. Bis zu einem Eintrag gilt die Empfehlung aus [Offene Fragen](./Offene_Fragen.md) als vorläufiger Standard.

| Datum | Entscheidung | Quelle |
|---|---|---|
| 2026-10-13 | OK für Phase 0, Schritt 4 (Projekt-Setup) und Phase 1. Offene Fragen gelten bis zur Antwort mit der Empfehlung (Unity 6.3 LTS, Code und Kommentare auf Englisch). | Chat ("OK, fang an") |
| 2026-10-13 | Frage 1 (Kapazität): Solo, Budget 50 € (verfügbar in zwei Tagen). Erstes Ziel wird der „Mini-Slice“ (Stufe A0), siehe Kurskorrektur. | Chat |
