# DEAD ZONE: EXTRACTION – Entwicklungsordner

Stand: 2026-10-15, Arbeit läuft noch. **Die fertige `index.html` existiert noch nicht.**

Inhalt:
- `MASTERPROMPT.md` – die Vorgabe des Auftraggebers (Wortlaut).
- `SPEC.md` – der verbindliche Architektur-Vertrag, nach dem alle Module gebaut werden.
- `template.html` – HTML-Gerüst, in das CSS und JavaScript eingebaut werden.
- `build.mjs` – baut aus `src/*.js` und `src/style.css` die einzige Datei `index.html` (Aufruf: `node deadzone/build.mjs`).
- `src/` – die Spielmodule (werden gerade geschrieben).
- `tests/` – Testumgebung: `harness.mjs` (Headless-Browser über Playwright), `node_env.mjs` (Logik-Tests ohne Browser),
  `10_logic.test.mjs` (erste Logik-Tests), `run.mjs` (führt alle Tests aus).

Das fertige Spiel wird nach Abschluss als `index.html` im Projektordner liegen und ohne weitere Dateien laufen.
