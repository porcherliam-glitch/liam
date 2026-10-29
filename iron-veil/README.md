# OPERATION IRON VEIL

Ein 3D-Extraction-Shooter in der Ego-Perspektive mit Unternehmensverwaltung, der komplett im Browser läuft. Sie führen einen kleinen Sicherheitsdienst: Sie gehen in gefährliche Gebiete, bergen Versorgungskisten, rufen einen Hubschrauber und bauen mit dem Erlös Ihre Basis aus.

Alles wird im Browser erzeugt: 3D-Grafik, Texturen und Geräusche. Es wird nichts aus dem Internet geladen und nichts installiert.

## Spielen

**Am einfachsten:** Die Datei `OperationIronVeil.html` in diesem Ordner doppelklicken. Sie öffnet sich im Browser (Chrome, Edge oder Firefox empfohlen).

Der Spielstand liegt im Browser (localStorage). Mit einem anderen Browser oder nach dem Löschen der Browserdaten beginnt ein neues Unternehmen.

## Steuerung

| Tastatur und Maus | Controller | Aktion |
|---|---|---|
| W A S D | linker Stick | Bewegen |
| Maus | rechter Stick | Umsehen |
| Linke Maustaste | RT | Feuern |
| Rechte Maustaste | LT | Zielen (Kimme/Zielfernrohr) |
| Shift | linken Stick drücken | Sprinten (kostet Ausdauer) |
| C (umschalten) oder Strg (halten) | B | Ducken: leiser, ruhiger, hinter niedriger Deckung unsichtbar |
| R | X | Nachladen |
| 1 / 2 oder Mausrad | Y | Hauptwaffe / Pistole |
| E halten | A halten | Kiste oder gefallenen Gegner durchsuchen, Evakuierung anfordern |
| Q | RB | Trauma-Set benutzen (Heilung) |
| G | LB | Granate werfen |
| F | Steuerkreuz ↑ | Taschenlampe |
| M | Steuerkreuz ↓ | Taktische Karte |
| Tab | Back/Select | Raid-Inventar |
| Esc | Start | Pause |

In den Menüs funktionieren Maus, Tastatur (Tab/Enter) und Controller (Steuerkreuz, A = auswählen, B = zurück). Auf dem Hauptmenü startet die **Leertaste** sofort einen Einsatz.

## So läuft ein Einsatz

1. **Ausrüsten** (Lager & Ausrüstung): Hauptwaffe wählen, Weste anlegen, Trauma-Sets und Granaten einpacken. Bis zu 6 Munitionspakete werden automatisch mitgenommen.
2. **Operation wählen**: Jede Operation hat ein eigenes Gebiet, eine Tageszeit, eine Feindlage und einen zufälligen **Nebenauftrag** mit Zusatzlohn.
3. **Bergen**: Kisten erscheinen als Rauten auf dem Kompass, sobald Sie nah genug sind. E gedrückt halten öffnet sie. Gefallene Gegner tragen oft Munition, Trauma-Sets oder Wertsachen.
4. **Überleben**: Gegner sehen und hören Sie. Schüsse sind weit zu hören, Sprinten ist laut, Ducken leise. Rote Bögen um das Fadenkreuz zeigen, woher Sie beschossen werden. Nachts macht die Taschenlampe Sie sichtbar.
5. **Extrahieren**: Mit genug Kisten wird der Evakuierungspunkt grün (Pfeil auf dem Kompass, Karte mit M). Dort E halten, um den Hubschrauber zu rufen, und im Kreis bleiben, bis er landet. Dann rückt feindliche Verstärkung an.
6. **Ausbauen**: Beute beim Händler verkaufen, Gebäude bauen, Personal einteilen, forschen, neue Waffen kaufen.

Wer fällt, abbricht oder zu lange braucht, verliert die Beute und die mitgenommene Ausrüstung (Weste, Trauma-Sets, Granaten, die Hälfte der Munition). Gekaufte Waffen bleiben immer erhalten.

## Inhalt

- **3 Operationen**: Grauzone (Industriegebiet in der Abenddämmerung), Stahlhafen (Containerterminal am Abend), Nachtgitter (Sperranlage bei Nacht). Jede Operation hat mehrere Einstiegs- und Evakuierungspunkte, die bei jedem Einsatz zufällig gewählt werden.
- **5 Waffen**: P9 Dienstpistole (immer dabei, unbegrenzte Munition), MK-4 Sturmgewehr, VX-9 Maschinenpistole, KV-12 Schrotflinte, DR-7 Präzisionsgewehr mit Zielfernrohr.
- **4 Gegnerarten**: Späher (schnell, flankieren), Schützen (nutzen Deckung), schwere Einheiten (gepanzert, Schrotflinte), Scharfschützen (roter Laser warnt vor dem Schuss).
- **Basis**: Kommandozentrale, Munitionswerkstatt, Feldlazarett, Forschungslabor mit 6 Forschungsprogrammen. Produktion läuft auch, wenn das Spiel geschlossen ist (bis zu 2 Stunden).
- **6 Nebenaufträge**: Kopfjäger, Schwere Ziele, Leise Hand, Großer Fang, Schnell rein – schnell raus, Unversehrt.
- **Einstellungen**: Mausempfindlichkeit (auch beim Zielen), Sichtfeld, Lautstärke, Schwierigkeit (Leicht/Normal/Schwer), Grafikqualität, Bildschirmwackeln, Bildrate.

## Für Entwickler

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev          # Entwicklungsserver mit automatischem Neuladen (http://localhost:3000)
npm run build        # Prüft Typen, baut dist/ und die Einzeldatei OperationIronVeil.html
npm test             # Logik-Tests (Vitest)
npm run verify:all   # Browser-Tests mit Playwright (vorher bauen)
```

Weitere Prüfstände (nur mit `npm run dev`): `dev.html` (Karten und Gegner ohne Spiel), `dev-audio.html` (alle Geräusche).

| Datei | Inhalt |
|---|---|
| `src/game/data.ts` | Alle Zahlen und Inhalte: Waffen, Gegner, Operationen, Gebäude, Forschung, Schwierigkeit, Nebenaufträge |
| `src/game/raid.ts` | Der Einsatz: Spieler, Waffen, Durchsuchen, Evakuierung, Schaden, Ergebnis |
| `src/game/enemies.ts`, `soldier.ts` | Gegner-KI und Figuren |
| `src/game/maps.ts`, `world.ts` | Kartenaufbau (reine Daten) und 3D-Umgebung |
| `src/game/weapons.ts`, `viewmodel.ts` | Waffenlogik und Waffen in der Hand |
| `src/game/collision.ts`, `nav.ts` | Kollision, Sichtlinien, Wegfindung |
| `src/game/effects.ts`, `grenades.ts`, `loot.ts` | Effekte, Granaten, Kisten und Beute |
| `src/game/audio.ts` | Erzeugte Geräusche, Raumklang, Hintergrund |
| `src/game/profile.ts`, `storage.ts` | Unternehmen, Wirtschaft, Spielstand (mit Übernahme alter Spielstände) |
| `src/game/ui.ts`, `hud.ts`, `gamepad.ts` | Menüs, Einsatz-Anzeige, Controller |

Der aktuelle Stand steht in [STATUS.md](STATUS.md).
