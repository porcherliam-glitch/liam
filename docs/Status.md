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
| Phase 0, Schritt 4 – Projekt-Setup | `.gitignore`, `.gitattributes`, Editor-Werkzeug „Aetherfall > Projekt-Setup …“ und Anleitung [Anleitungen/01](./Anleitungen/01_Projekt-Setup.md) | Claude (Code), danach Auftraggeber in Unity |
| Phase 1, Schritt 1 – Fundament | `GameBootstrapper`, `ServiceLocator`, `EventBus`, `GameStateManager`, Logging, Installer, Debug-Overlay, EditMode-Tests; Testanleitung [Anleitungen/02](./Anleitungen/02_Test_Phase1_Fundament.md) | Claude (Code), danach Auftraggeber in Unity |
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

## Entscheidungs-Log

Hier stehen nur Entscheidungen des Auftraggebers. Bis zu einem Eintrag gilt die Empfehlung aus [Offene Fragen](./Offene_Fragen.md) als vorläufiger Standard.

| Datum | Entscheidung | Quelle |
|---|---|---|
| 2026-10-13 | OK für Phase 0, Schritt 4 (Projekt-Setup) und Phase 1. Offene Fragen gelten bis zur Antwort mit der Empfehlung (Unity 6.3 LTS, Code und Kommentare auf Englisch). | Chat ("OK, fang an") |
