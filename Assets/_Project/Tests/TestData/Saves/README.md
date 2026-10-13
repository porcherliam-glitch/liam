# Golden Saves (Testdaten)

Golden Saves sichern das Speicherformat ab (Architektur 9.5): Jede veröffentlichte Formatversion bekommt hier einen
Ordner `v<N>/` mit einem kleinen Spielstand. Automatische Tests laden diese Dateien, migrieren sie und prüfen die Werte.

| Datei | Inhalt | Test |
|---|---|---|
| `v1/golden_v1.sav.json` | aktueller Stand (Version 1): Spielzeit, LP/Ausdauer/Mana, Spielerposition als Zelle + lokale Position | `GoldenSaveTests` (Rundreise: laden und wieder speichern ergibt dieselbe Datei) |
| `v0/golden_v0.sav.json` | Prototyp-Format (Version 0): Weltposition als `[x, y, z]`, LP als `hp`, kein `format`/`saveVersion` | `SaveMigrationTests`, `GoldenSaveTests` (Migration v0 → v1 ergibt genau `v1/golden_v1.sav.json`) |

Regeln:
- Diese Dateien nie „reparieren“, wenn ein Test rot wird – erst prüfen, ob eine Formatänderung eine Migration braucht.
- Neue Formatversion: neuen Ordner `v<N>/` anlegen, alte Ordner bleiben für immer.
- Die Dateien sind reiner Text (JSON, LF-Zeilenenden). Unity legt beim Öffnen automatisch `.meta`-Dateien an.
