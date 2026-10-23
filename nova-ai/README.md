# NOVA AI

NOVA AI ist ein KI-Entwicklungsstudio für Windows 10 und 11. Du beschreibst ein Projekt, zum Beispiel ein Browserspiel
oder eine kleine Windows-App. NOVA plant die Arbeit, schreibt den Code, testet ihn und prüft das Ergebnis. Das passiert
mit KI-Modellen auf deinem eigenen PC (über Ollama) oder auf Wunsch mit bezahlten Cloud-Modellen.

NOVA meldet nur Erfolge, die echt geprüft wurden. Eine Aufgabe gilt erst als fertig, wenn Build, Tests und Prüfung
wirklich bestanden sind.

Stand: 22.10.2026, Version 0.1.0. Was fertig ist und was noch fehlt, steht ehrlich in [TASKS.md](TASKS.md).

---

## 1. Installieren (empfohlen)

1. `NOVA-AI-Setup-0.1.0.exe` doppelklicken.
2. Windows zeigt eventuell „Der Computer wurde durch Windows geschützt“. Das liegt daran, dass die Datei nicht
   kostenpflichtig signiert ist. Auf **Weitere Informationen** und dann **Trotzdem ausführen** klicken.
3. Den **vorgeschlagenen Ordner übernehmen** und **Installieren** klicken. Bitte keinen eigenen Ordner wählen (siehe
   [TASKS.md](TASKS.md), offener Punkt R6-1).
4. Das Installationsprogramm fragt, ob es eine Verknüpfung auf dem Desktop anlegen soll. Im Startmenü steht NOVA AI
   immer.

Für die Installation sind **keine Administratorrechte** nötig. NOVA wird nur für dein Windows-Konto installiert.

### Die setup.exe selbst bauen

Falls du keine fertige setup.exe hast: Im Ordner `nova-ai` die Datei **`SETUP-ERSTELLEN.cmd`** doppelklicken. Sie
installiert, was fehlt, baut die setup.exe und öffnet danach den Ordner `release`, in dem sie liegt. Der erste Lauf
dauert einige Minuten.

### Ohne Installation starten

Im Ordner `nova-ai` die Datei **`NOVA-STARTEN.cmd`** doppelklicken. Beim ersten Mal lädt sie die nötigen Pakete
herunter (einige Minuten), danach startet NOVA direkt.

Beide Dateien brauchen **Node.js** (Version 22.13 oder neuer). Fehlt es, bieten sie an, es mit `winget` zu installieren.

---

## 2. Erste Schritte

1. **Ollama installieren** (kostenlos): <https://ollama.com/download> herunterladen und installieren. Ollama startet
   danach im Hintergrund.
2. NOVA öffnen und links **Modelle** wählen. NOVA zeigt, ob Ollama läuft und welche Modelle da sind.
3. Ein Modell herunterladen, das Werkzeuge kann. Gute Wahl für den Anfang: `qwen2.5-coder:7b` (etwa 5 GB, braucht
   etwa 6 GB Grafikspeicher). Mit 16 GB Grafikspeicher geht auch `qwen2.5-coder:14b`.
4. Das Modell als **Standardmodell** festlegen.
5. Links **Projekte** wählen, **Neues Projekt** klicken und beschreiben, was entstehen soll. NOVA legt einen Plan mit
   Aufgaben an.
6. Unter **Agenten** und **Aufgaben** siehst du, woran gerade gearbeitet wird.
7. **Eigenes Modell pro Projekt:** Im Projekt den Reiter mit den Einstellungen öffnen, bei **„KI-Modell für dieses
   Projekt“** ein Modell wählen und **Speichern**. Es gilt für alle Agenten in diesem Projekt; „Standardmodell verwenden“
   nimmt wieder das Modell aus **Modelle**. Du kannst jede Aufgabe pausieren,
   fortsetzen, stoppen oder ihre Priorität ändern.

### 3D-Modelle erzeugen (3D-Werkstatt)

NOVA kann aus einer Beschreibung („Text zu 3D“) oder einem Bild („Bild zu 3D“) ein 3D-Modell (.glb mit Farben und
Materialien) machen – lokal auf deinem PC, kostenlos.

1. **ComfyUI installieren** (kostenloses Programm, macht die eigentliche Arbeit): links **3D-Werkstatt**, dann
   **ComfyUI installieren** (NOVA fragt vorher um Freigabe) oder selbst von <https://www.comfy.org/download>.
   ComfyUI einmal starten.
2. Links **Modelle**, ganz unten **3D-Modelle**: **TRELLIS.2** herunterladen (etwa 9 GB), für „Text zu 3D“ zusätzlich
   **Z-Image Turbo** (etwa 12 GB). Beim ersten Download fragt NOVA, ob es huggingface.co verwenden darf.
3. In der **3D-Werkstatt** eine Beschreibung eingeben oder ein Bild wählen und **3D-Modell erzeugen** klicken. Das Ergebnis
   lässt sich drehen und liegt im Projektordner (`assets/3d/`) oder in der NOVA-Bibliothek.

Am besten klappt es mit **einem** Objekt, vollständig sichtbar, vor schlichtem Hintergrund. Empfohlen ist eine
NVIDIA-Grafikkarte mit 16 GB; mit 8 GB geht es langsamer, ohne NVIDIA-Karte sehr langsam oder gar nicht. Alle Modelle
(TRELLIS.2, Pixal3D, Z-Image Turbo) haben freie Lizenzen (MIT bzw. Apache-2.0) und dürfen in Deutschland genutzt werden.
Prüfung mit echtem ComfyUI auf dem PC: `npm run verify:comfyui` (siehe `docs/SPEC-3D.md`).

### Echte Ollama-Prüfung

Für Entwickler: `npm run verify:ollama` prüft mit deinem echten Ollama, ob ein Modell eine kleine Aufgabe in einem
Testprojekt löst. In der Cloud-Umgebung, in der NOVA gebaut wurde, war Ollama gesperrt. Diese Prüfung ist deshalb
auf dem PC wichtig.

---

## 3. Was NOVA kann

| Bereich | Inhalt |
|---|---|
| Übersicht | Projekte, Agenten, Aufgaben, Builds, fehlgeschlagene Tests, Fehler, Modellstatus, CPU/RAM/GPU/VRAM, Kosten |
| Projekte | Neu beschreiben, Assistent, Vorlage, vorhandenen Ordner öffnen, importieren. Vorlagen: Browserspiel, Webanwendung, Unity, Windows-Desktop (.NET), Backend-API, leer |
| Studio | Editor (Monaco) mit Dateibaum, Tabs, Suche, Vergleichsansicht, Änderungsmarkierungen und Sprung zum Fehler; Terminal; Live-Vorschau |
| Agenten | Planer, Programmierer, Tester, Prüfer. Arbeitszyklus läuft im Hintergrund weiter und setzt nach einem Neustart sicher fort |
| Modelle | Ollama (Status, Modelle, Herunterladen mit Fortschritt, Löschen, Grafikspeicher-Prüfung), Cloud-Anbieter (OpenAI-kompatibel, Anthropic) mit Budgets und Freigabe vor bezahlter Nutzung |
| Gedächtnis | Wissen pro Projekt und projektübergreifend, nie mit Geheimnissen |
| Sicherheit | Freigaben für Admin-Aktionen, systemweite Änderungen, Löschen, Dateien außerhalb des Projekts, Sicherheitseinstellungen, Veröffentlichen, sensible Daten und bezahlte Nutzung |
| Git und Sicherungen | Prüfpunkte, Wiederherstellen ohne deine eigenen Änderungen zu überschreiben, Datenbanksicherungen, Export/Import ohne Klartext-Schlüssel |
| 3D-Werkstatt | Text zu 3D und Bild zu 3D mit lokalen KI-Modellen (TRELLIS.2, Pixal3D, Z-Image Turbo) über ComfyUI, 3D-Vorschau, eigener Bereich „3D-Modelle“, Agenten können 3D-Modelle für Spiele erzeugen |
| Hintergrund | Läuft weiter, wenn das Fenster zu ist (Symbol in der Taskleiste), optional Autostart, Wiederherstellung nach Absturz |

### Freigaben

NOVA fragt dich, bevor es etwas Kritisches tut. Du siehst dann, **was** passieren soll, **warum** und **welche Folgen**
es hat. Ohne deine Zustimmung passiert es nicht. Beispiele:

- Befehle mit Administratorrechten oder Änderungen am System
- Löschen von Dateien oder Git-Verlauf
- Schreiben außerhalb des Projektordners
- Veröffentlichen (zum Beispiel `git push`, `npm publish`)
- Senden von Projektdaten an ein Cloud-Modell
- Jede bezahlte Modellnutzung ohne freigegebenes Budget

### Kosten

Lokale Modelle über Ollama kosten nichts. Cloud-Modelle sind **aus**, bis du einen Schlüssel einträgst und ein Budget
festlegst. Das Tages- und Monatsbudget steht anfangs auf 0 (Beträge in US-Dollar, wie die Anbieter abrechnen). Ist das Budget aufgebraucht, nimmt NOVA wieder das
lokale Modell oder hält an.

---

## 4. Wo NOVA Daten speichert

| Was | Ort |
|---|---|
| Datenbank, Protokolle, Sicherungen | `%LOCALAPPDATA%\NOVA AI` |
| Fenstergröße und Oberflächen-Einstellungen | `%APPDATA%\NOVA AI` |
| Deine Projekte | der Ordner, den du beim Anlegen wählst |
| API-Schlüssel | verschlüsselt mit Windows-DPAPI (nur dein Windows-Konto kann sie lesen), nie in Protokollen oder Exporten |

Beim Deinstallieren bleiben deine Daten und Projekte erhalten. Wer alles entfernen will, löscht danach die Ordner
`%LOCALAPPDATA%\NOVA AI` und `%APPDATA%\NOVA AI` von Hand.

## 5. Updates

NOVA aktualisiert sich **nie von selbst**. Für ein Update die neue setup.exe ausführen. Das Installationsprogramm
beendet den Hintergrunddienst, und NOVA legt beim ersten Start der neuen Version eine Sicherung der Datenbank an,
bevor es sie umstellt.

## 6. Wenn etwas nicht klappt

Jede Fehlermeldung in NOVA beantwortet sechs Fragen: Was ist passiert? Wo? Warum? Was bedeutet das? Was kann ich tun?
Wurde etwas geändert? Außerdem zeigt sie, wie schwer der Fehler ist (Hinweis, Warnung, Fehler, kritisch).

Häufige Fälle:

| Problem | Lösung |
|---|---|
| „Ollama nicht erreichbar“ | Ollama starten (Startmenü) oder neu installieren |
| Modell fehlt oder kann keine Werkzeuge | Unter **Modelle** ein Modell mit „Werkzeuge“ herunterladen |
| Aufgabe hängt bei „Wartet auf Freigabe“ | Links **Freigaben** öffnen und entscheiden |
| NOVA reagiert nicht | Rechtsklick auf das NOVA-Symbol unten rechts in der Taskleiste, **NOVA vollständig beenden**, dann neu starten |
| Diagnose für Hilfe | Links **Protokolle**, dann **Diagnose-Paket erstellen** (enthält keine Schlüssel) |

---

## 7. Ehrliche Grenzen

- Befehle der Agenten laufen mit den Rechten deines Windows-Kontos. Es gibt keine abgeschottete Sandbox. Die
  Blockliste für gefährliche Befehle ist sorgfältig, aber nie vollständig. Deshalb fragt NOVA bei allem Unbekannten
  nach.
- „Netzwerk für Agenten aus“ verhindert bekannte Netzwerkbefehle, kann aber nicht jedes Programm am Verbinden hindern.
- DPAPI schützt Schlüssel vor anderen Windows-Konten, nicht vor anderen Programmen in deinem eigenen Konto.
- Die Qualität der Ergebnisse hängt stark vom Modell ab. Kleine lokale Modelle scheitern öfter an großen Aufgaben.
  NOVA erkennt das an fehlgeschlagenen Prüfungen und meldet es, statt Erfolg vorzutäuschen.
- Die setup.exe ist nicht kostenpflichtig signiert. Windows SmartScreen warnt deshalb beim ersten Start.
- GPU-Werte liest NOVA über Windows-Leistungsindikatoren und, falls vorhanden, `nvidia-smi`. Nicht jede Grafikkarte
  liefert alle Werte.

---

## 8. Für Entwickler

Voraussetzungen: Node.js 22.13 oder neuer, Git. Unter Windows reicht das. Für den Windows-Installer unter Linux
braucht es zusätzlich wine (64 und 32 Bit) und xvfb.

```
npm install
npm start              # bauen und Electron starten
npm run dev            # Entwicklungsmodus mit Neuladen
npm run daemon         # nur den Hintergrunddienst im Vordergrund starten
npm run typecheck      # TypeScript prüfen
npm test               # Vitest (Einheiten- und Integrationstests)
npm run e2e            # Playwright: echte Electron-App mit nachgebautem Ollama-Server
npm run verify:ollama  # Prüfung mit echtem Ollama (nur auf dem PC)
npm run dist:win       # Windows-Installer nach release/
```

### Aufbau

```
src/shared     Vertrag: Datenmodell (Zod), RPC-Methoden, Ereignisse, Einstellungen, Fehlercodes
src/daemon     Hintergrunddienst (Node, läuft als eigener Prozess weiter)
  core/        Datenbank (SQLite mit Migrationen), Protokolle, Fehler, Benachrichtigungen, Vorgänge
  server/      authentifizierte RPC über Named Pipe (Windows) bzw. Unix-Socket, Ereignisstrom (SSE)
  agents/      Agenten-Laufzeit (Planer, Programmierer, Tester, Prüfer)
  tasks/       Arbeitszyklus, Planung, Verifikation, Wiederaufnahme
  providers/   Ollama, OpenAI-kompatibel, Anthropic, Modellwahl, Budgets
  tools/       Datei- und Befehlswerkzeuge, Befehlsfilter (fail-closed)
  changes/     Änderungsjournal, Pfadschutz, Dateisperren
  git/, checkpoints/, backup/   Git, Prüfpunkte, Sicherungen, Export/Import
  projects/, checks/, preview/  Projekte, Vorlagen, Prüfläufe, Live-Vorschau
  memory/      Projektgedächtnis und Wissensbasis
  env/, secrets/, approvals/, resources/, integrations/, updates/
src/main       Electron-Hauptprozess: Dienst-Aufsicht, sichere Brücke, Taskleiste, Autostart
src/preload    `window.nova` (contextIsolation, Sandbox)
src/renderer   React-Oberfläche (Tailwind, Monaco, xterm.js)
tests/         Integrationstests und Testdoubles (nachgebaute Ollama-/OpenAI-/Anthropic-Server)
e2e/           Playwright-Tests der echten Electron-App
```

Die Oberfläche spricht nie direkt mit dem Dateisystem. Sie ruft über die Preload-Brücke den Hauptprozess, der die
Anfrage geprüft an den Hintergrunddienst weitergibt. Der Dienst prüft jeden Aufruf noch einmal mit Zod und einem
geheimen Token.

Ausführliche Spezifikation: [docs/SPEC.md](docs/SPEC.md) und [docs/UI-SPEC.md](docs/UI-SPEC.md).
