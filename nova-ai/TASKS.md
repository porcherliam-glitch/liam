# NOVA AI – Aufgabenübersicht

Stand: 22.10.2026. Diese Datei wird nach jedem größeren Schritt aktualisiert. Sie beschreibt ehrlich, was fertig, was
in Arbeit und was offen ist.

## Erledigt

| Bereich | Inhalt | Prüfung |
|---|---|---|
| Phase 1 – Bestandsaufnahme | Umgebung geprüft: Node 22, Git 2.43, Electron 45 (Node 24, SQLite 3.53 mit Volltextsuche), Xvfb. Ollama und KI-Modelle sind in der Cloud-Umgebung gesperrt. | – |
| Grundgerüst | Ordner `nova-ai/`, Build-Kette (esbuild für Hauptprozess/Preload/Dienst, Vite für die Oberfläche), TypeScript, Vitest | Build und Typprüfung fehlerfrei |
| Vertrag | Datenmodell (`src/shared`), RPC-Schnittstelle, Ereignisse, Einstellungen, Service-Verträge (`src/daemon/contracts.ts`), Spezifikation `docs/SPEC.md`, `docs/UI-SPEC.md` | Drei unabhängige Prüfungen, 101 Befunde eingearbeitet |
| Kern des Hintergrunddienstes | SQLite mit Migrationen (WAL, synchronous=FULL), Protokolle mit Rotation und Schwärzung von Geheimnissen, Fehlermodell, Benachrichtigungen, lange Vorgänge mit Fortschritt/Abbruch, Einzelinstanz-Sperre, absturzsicheres Schreiben, saubere Umgebung für Unterprogramme | Kern-Tests grün |
| Verbindung (server/client) | Authentifiziert über Named Pipe/Unix-Socket, Token + HMAC-Gegenprobe, SSE-Ereignisse mit Begrenzung, Client mit Wiederverbindung | 81 Tests grün |
| KI-Anbieter | Ollama (Status, Modelle, Herunterladen mit Fortschritt, Löschen, VRAM-Prüfung), OpenAI-kompatibel, Anthropic, Modellwahl mit freigegebenen Ersatzmodellen, Budgets mit Reservierung, Kostenerfassung | 96 Tests grün |
| Datei-Werkzeuge | Pfadschutz (Windows-Regeln), Änderungsjournal mit Wiederherstellung, Dateisperren, Dateidienst, Dateiüberwachung, Agenten-Werkzeuge für Dateien | 125 Tests grün |
| Agenten | Laufzeit mit nativen Werkzeugaufrufen und JSON-Ersatzprotokoll, Pause/Fortsetzen, Wiederaufnahme nach Absturz, Rollen Planer/Programmierer/Tester/Prüfer | 59 Tests grün |
| Arbeitszyklus | Aufgaben, Planung, Abhängigkeiten, Prioritäten, Verifikation nur aus echten Prüfergebnissen, Wiederholungs-Erkennung, Freigaben, Wiederherstellung nach Neustart | 66 Tests grün |
| Projekte | 5 Modi (Beschreiben, Assistent, Vorlage, Öffnen, Importieren), 6 Vorlagen (Browserspiel, Webanwendung, Unity, Windows-Desktop .NET, Backend-API, leer), Erkennung, Prüfläufe (Tests/Build/…), Live-Vorschau | 187 Tests grün |
| Befehlsfilter | Fail-closed: automatische Erlaubnis nur für einfache Befehle ohne Sonderzeichen auf der Liste; Blockliste, Freigabe-Klassen, Netzwerk, „selbst geschriebene Datei ausführen“ | 89 Tests grün |
| Oberfläche – Fundament | Design (dunkel, violett/blau), Navigation, Datenanbindung, Übersicht, Freigaben, Protokolle, Benachrichtigungen, laufende Vorgänge | 87 Tests grün |

## In Arbeit

- Hintergrunddienst: Befehls-Werkzeuge (Prozesse, Terminal, Werkzeug-Registry), Gedächtnis, Umgebung (Schlüsselspeicher, Freigaben, Ressourcen, Werkzeugerkennung, Updates), Git/Wiederherstellung/Backups
- Electron-Hauptprozess (Dienst-Aufsicht, sichere Brücke, Taskleiste, Autostart, Benachrichtigungen, Installer)
- Oberfläche: Projekte/Agenten/Aufgaben, Studio (Editor, Terminal, Vorschau), Modelle/Kosten/Wissen/Werkzeuge/Einstellungen

## Offen (nächste Schritte)

1. Zusammenbau des Hintergrunddienstes (`src/daemon/app.ts`) und Ende-zu-Ende-Test mit nachgebautem Ollama-Server (`tests/integration/daemon-e2e.test.ts`).
2. Electron-App mit echtem Hintergrunddienst starten, Screenshots prüfen, Playwright-E2E.
3. Unabhängige Code-Prüfung (mehrere Prüfer) und Fehlerbehebung.
4. Windows-Installer (NSIS) bauen und prüfen.
5. **Auf dem Windows-PC:** `npm run verify:ollama` mit echtem Ollama-Modell ausführen (in der Cloud nicht möglich).

## Blocker

- Ollama und KI-Modelle können in dieser Cloud-Umgebung nicht heruntergeladen werden (Netzwerksperre). Die echte
  Ollama-Prüfung muss auf dem PC laufen (`npm run verify:ollama`).
- Windows-spezifische Teile (Named Pipes, DPAPI, taskkill, PowerShell-Abfragen, NSIS-Installer) können hier nur mit
  simulierten Windows-Bedingungen getestet werden.

## Bekannte Einschränkungen (ehrlich)

Siehe `docs/SPEC.md` §6.0: Agenten-Befehle laufen mit den Rechten des Windows-Kontos (keine Sandbox ohne native
Programme), die Blockliste ist bestmöglich, aber nie vollständig, „Netzwerk aus“ kann Programme nicht am Verbinden
hindern, DPAPI schützt nicht vor Programmen desselben Kontos.
