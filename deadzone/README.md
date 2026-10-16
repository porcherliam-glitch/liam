# DEAD ZONE: EXTRACTION

Ein Top-down-Zombie-Extraction-Shooter in **einer einzigen Datei**: `index.html` im Projektordner.

## Spielen

1. `index.html` doppelklicken (öffnet sich im Browser: Chrome, Edge, Firefox oder Safari).
2. „Neues Spiel“ wählen.
3. In der Basis unter „Lager & Ausrüstung“ den Rucksack packen („Schnell packen“ hilft), dann „Einsatz planen“.

Es wird nichts installiert und nichts aus dem Internet geladen. Der Spielstand liegt im Browser (localStorage).

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Bewegen |
| Maus / linke Maustaste | Zielen / Schießen |
| R | Nachladen |
| E | Interagieren (Kisten, Türen, Beute; Generator: halten) |
| Shift | Sprinten |
| C | Ducken (leiser, ruhiger zielen) |
| F | Taschenlampe |
| Tab | Inventar |
| M | Karte |
| G | Granate |
| Q | Schnellheilung |
| 1–5 | Primär, Sekundär, Nahkampf, Granate, Medizin |
| X | Ausgewählten Gegenstand ablegen (im Inventar) |
| Esc | Pause / Fenster schließen |

Auf Smartphone und Tablet erscheint automatisch eine Touch-Steuerung (Querformat): linker Bewegungsstick, rechter Zielstick, FEUER-Knopf und Aktionsknöpfe.

## Spielprinzip

- **Raid:** Gebiet betreten, Gebäude durchsuchen, Zombies bekämpfen oder meiden, Aufträge erfüllen, einen Extraktionspunkt erreichen.
- **Risiko:** Wer stirbt, verliert alles am Körper und im Rucksack. Nur der sichere Behälter bleibt.
- **Basis:** Lager, Waffenwerkstatt, Krankenstation, Werkstatt, Funkstation, Verteidigungsanlage, Händler.
- **Fortschritt:** Erfahrung, Stufen, Basisausbau, vier Gebiete (Stadt, Industriegebiet, Militärbasis, Forschungsanlage mit Boss).
- **Neu laden während eines Einsatzes** zählt als „vermisst“: Die Ausrüstung ist dann verloren.

## Entwicklungsordner

- `src/` – Quellmodule (JavaScript und CSS); `build.mjs` baut daraus `index.html` (`node deadzone/build.mjs`).
- `tests/` – automatische Tests: `node deadzone/tests/run.mjs` (Logik in Node, Spielabläufe im Headless-Browser über Playwright).
- `SPEC.md` – Architektur-Vertrag, `MASTERPROMPT.md` – Vorgabe des Auftraggebers.

Das fertige Spiel hängt von keiner dieser Dateien ab.
