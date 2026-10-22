# NOVA AI – Aufgabenübersicht

Stand: 22.10.2026. Diese Datei beschreibt ehrlich, was fertig ist, was geprüft wurde und was noch offen ist.
Grundlage: Commit 54c221f (geprüfter Stand der Vorabversion), danach kam die 3D-Werkstatt dazu.

## Fertig

| Bereich | Inhalt |
|---|---|
| Hintergrunddienst | SQLite mit Migrationen, Protokolle mit Schwärzung, Fehlermodell, Benachrichtigungen, lange Vorgänge mit Fortschritt/Abbruch, Einzelinstanz, absturzsicheres Schreiben, authentifizierte Verbindung über Named Pipe (Windows) |
| Agenten und Arbeitszyklus | Planer, Programmierer, Tester, Prüfer; Pause/Fortsetzen/Stopp, Prioritäten, Abhängigkeiten, Wiederaufnahme nach Neustart |
| Modelle | Ollama (Status, Modelle, Herunterladen mit Fortschritt, Löschen, Grafikspeicher-Prüfung), OpenAI-kompatibel, Anthropic, Budgets mit Freigabe vor bezahlter Nutzung, freigegebene Ersatzmodelle, eigenes KI-Modell pro Projekt |
| Projekte | 6 Vorlagen (Browserspiel, Webanwendung, Unity, Windows-Desktop .NET, Backend-API, leer), Öffnen/Importieren, Prüfläufe, Live-Vorschau |
| Sicherheit | Befehlsfilter (fail-closed), Freigaben für Admin-, System-, Lösch-, Außerhalb-Projekt-, Sicherheits-, Veröffentlichungs- und Cloud-Daten-Aktionen, Pfadschutz, DPAPI für Schlüssel |
| Git und Sicherungen | Prüfpunkte, Wiederherstellen, Datenbanksicherungen mit Aufbewahrung, Export/Import ohne Schlüssel |
| Oberfläche | Übersicht, Projekte, Agenten, Aufgaben, Freigaben, Studio (Monaco-Editor, Dateibaum, Suche, Vergleich, Terminal, Vorschau), Modelle, Kosten, Wissen, Werkzeuge, Einstellungen, Protokolle |
| Windows | NSIS-Installer (pro Benutzer, Startmenü, optional Desktop), Taskleiste, Hintergrundbetrieb, Autostart, `--stop-daemon` |
| Doku | README.md (Deutsch), Doppelklick-Dateien `NOVA-STARTEN.cmd` und `SETUP-ERSTELLEN.cmd` |
| 3D-Werkstatt | Text zu 3D (Z-Image Turbo → TRELLIS.2/Pixal3D) und Bild zu 3D über eine lokale ComfyUI, eigener Bereich „3D-Modelle“ mit Downloads, Aufträge mit Fortschritt/Abbruch, drehbare Vorschau, Agenten-Werkzeug `generate_3d_model` (Spezifikation `docs/SPEC-3D.md`) |

## Geprüft

- **Linux:** 1962 Tests grün, Typprüfung ohne Fehler, Ende-zu-Ende-Test des Hintergrunddienstes mit nachgebautem Ollama.
- **Echtes Windows (GitHub Actions, windows-latest):** Typprüfung, 1731 Tests, Playwright-Ende-zu-Ende-Test der echten
  App, NSIS-Installer gebaut, still installiert, gestartet (Named Pipe, DPAPI, Werkzeugerkennung inkl. .NET, falsches
  Token abgelehnt, sauberes Beenden, Dienst-Aufsicht, `--stop-daemon`), deinstalliert, Benutzerdaten bleiben erhalten.
  Ablauf: `.github/workflows/nova-ai-windows.yml`, die setup.exe liegt dort als Artefakt „NOVA-AI-Setup“.
- **Unabhängige Code-Prüfung** (6 Prüfer): 50 Befunde, siehe [docs/Pruefbefunde.md](docs/Pruefbefunde.md).
- **3D-Werkstatt:** alle von NOVA gebauten ComfyUI-Aufträge (TRELLIS.2 und Pixal3D in 3 Qualitätsstufen, Text zu Bild)
  wurden von einer echten ComfyUI 0.42.0 (CPU) als gültig angenommen ([Nachweis](tests/fixtures/comfyui/VERIFICATION.md));
  der ganze Ablauf bis zur GLB-Datei ist mit einem nachgebauten ComfyUI getestet. **Nicht geprüft:** eine echte Erzeugung
  mit den Modellgewichten auf einer NVIDIA-Grafikkarte – das geht nur auf dem PC (`npm run verify:comfyui`).

## Offen

1. **Befunde der Code-Prüfung:** 46 offen (7 hoch, 18 mittel, 21 niedrig), Einzelheiten und Lösungsvorschläge in
   [docs/Pruefbefunde.md](docs/Pruefbefunde.md). Die Behebung wurde auf Wunsch des Auftraggebers angehalten. Die
   wichtigsten:
   - R6-1: Wer bei der Installation einen eigenen Ordner wählt (z. B. `%LOCALAPPDATA%`), riskiert, dass Update oder
     Deinstallation Daten löschen. **Bis zur Behebung den vorgeschlagenen Installationsordner verwenden.**
   - R4-1/R4-2/R4-3: „Geprüft ✓“ ist zu großzügig (Tester ohne Testlauf, reines KI-Review, „fertig“ ohne Änderung).
   - R3-1/R3-2: Zweimaliges Wiederherstellen kann Änderungen zurückholen; Dateien, die man während eines
     Agentenbefehls selbst bearbeitet, können als NOVA-Änderung gelten.
   - R4-4: Ollama-Antworten, die länger als 300 s dauern, brechen ab (Einstellung „Zeitlimit“ wirkt nicht darüber).
   - R5-2: Ungespeicherte Änderungen im Editor gehen beim Beenden ohne Rückfrage verloren.
2. **Auf dem Windows-PC:** `npm run verify:ollama` mit echtem Ollama-Modell und `npm run verify:comfyui` mit echtem
   ComfyUI und installierten 3D-Modellen (in der Cloud nicht möglich).

## Bekannte Einschränkungen (ehrlich)

Siehe `docs/SPEC.md` §6.0: Agenten-Befehle laufen mit den Rechten des Windows-Kontos (keine Sandbox), die Blockliste ist
bestmöglich, aber nie vollständig, „Netzwerk aus“ kann Programme nicht am Verbinden hindern, DPAPI schützt nicht vor
Programmen desselben Kontos. Die setup.exe ist nicht signiert (SmartScreen-Warnung beim ersten Start).
