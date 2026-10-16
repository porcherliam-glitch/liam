# Aufgabenliste – alles, was bis zum fertigen Spiel zu tun ist

Stand: 2026-10-14, 21:10 UTC. Angelegt von der Cloud-Sitzung auf Wunsch des Auftraggebers („schicke ihm alle Aufgaben, also alles“).

Diese Liste ist der **Arbeitsvorrat für die PC-Sitzung**. Quellen:
- [Technik/02, Bau-Reihenfolge](./Technik/02_Systeme_und_Abhaengigkeiten.md#bau-reihenfolge): Phasen 4–7, Systeme S01–S70
- [GDD 00, Umfangsstufen](./GDD/00_Vision_und_Ueberblick.md#umfangsstufen): Stufe A, B, B-Minimal, C
- [Master-Prompt §31](./00_Master-Prompt.md): Roadmap

Den aktuellen Stand führt weiter [Status.md](./Status.md).

## So wird die Liste benutzt

1. **Von oben nach unten abarbeiten.**
   - Ist ein Punkt blockiert (Entscheidung oder Klick des Auftraggebers, Geld, Anmeldung), kommt er in den Abschnitt „Braucht den Auftraggeber“ ganz unten.
   - Dann geht es sofort mit dem nächsten Punkt weiter.
2. **Nach jedem Punkt bzw. Baustein:**
   - Tests grün und Rundgang (`PlayTour`) ohne Fehler.
   - Testanleitung bzw. Doku, Status.md und diese Liste aktualisieren: `- [x]`, Datum, Commit.
   - Committen, pushen, die .exe neu bauen. Läuft das Spiel gerade, in `Aetherfall Spiel (neu)` bauen.
   - Dann 3–5 Zeilen Bericht auf Deutsch und **sofort weiter**. Nicht fragen, ob weitergemacht werden soll.
3. **Was der Auftraggeber beim Spielen meldet** (Fehler, zu schwer, festgehangen, sieht komisch aus), hat immer Vorrang vor dieser Liste.
4. **Neue Ideen oder Lücken**, die beim Arbeiten auffallen, an passender Stelle in die Liste eintragen.
5. **0 €:** nur kostenlose Werkzeuge und CC0-Assets. Jede fremde Quelle ins Lizenzregister.

---

## 0. Schon erledigt (Kurzfassung)

- [x] Fundament, Spielfigur, Kamera, Kampf, Items/Inventar/Loot, Oberfläche, Bedingungen/Weltzustand/Quests, Fortschritt, Dialoge, NPCs (Phasen 0–3)
- [x] Mini-Slice:
  - Dorf Eichental und Gruft mit Rätseln und dem Wachenden Ritter
  - 3 Quests, Dorfbewohner, Start auf Stufe 1, Speichern/Laden/Tod
  - Blender-Modelle (Spielfigur, Wölfe, Dorfbewohner, Skelette, Ritter, Häuser, Brücken)
  - .exe-Build
- [x] Stufe A, Schritte 1–6: Händler, Würfelspiel „Krähenwurf“, Aether-Stoß, Ser Maren, Magier und Klassenwahl, Streitkolben und Bogen

---

## 1. Stufe A – Vertical Slice fertigstellen (Phase 4)

Ziel: ein Teil des Eichentals (~1,1 km²), alle 8 Beispiel-Quests, etwa 3,5–4 Stunden Spielzeit, Stufe 1–8.

### 1a. Systeme für den Slice (Technik/02, 4.1–4.7)

- [x] **Statuseffekte und Element-Reaktionen (S25):** 2026-10-15, Commit 92cec17
  - Brennen, Betäubung, Aether-Verderbnis (alle 8 Balken, Nass/Ölig, Bosse, Immunitäten)
  - Reaktion „Explosion“ (Ölfass + Feuer, 3 m) und „Kettenexplosion“ (Pulverfass 5 m), nach GDD 03, 6.6; Ölpfütze
  - Offen (später mit den Zauberschulen): Schock-Fläche, Flächenbrand, Eis-Reaktionen; Blutung je Meter; Fässer im Spielstand
- [x] **Bogen voll ausbauen (S27):** Schulterzielen, Spannen, Kopftreffer mit Zusatzschaden, Pfeiltypen, Munition – 2026-10-15
  - Stufe A: Holz- und Feuerpfeil, Wechsel per Mausrad/Steuerkreuz, 50 % der Holzpfeile wieder aufsammelbar
  - Offen für Stufe B: Breitkopf-, Eis-, Gift-, Explosiv-, Betäubungspfeil, Dreifachschuss
- [x] **Magie (S28):** – 2026-10-15, Commit 5426c64
  - 3 Schulen Feuer, Eis und Blitz mit je 3 Knoten in Stufe A, nach GDD 03, 11.5
  - Fähigkeitenleiste (2 × 4 Slots), Mana
  - Erledigt: 9 Zauber, Leiste mit X, Mana je Stufe; der Magier kann die 3 Startzauber. Die übrigen 6 lernt man mit dem Skill-Baum (nächster Punkt)
  - Offen: Kanal-Zauber (Flammenstrahl …), Bodenmarker zum Zielen, Reaktionen Schock-Fläche, Flächenbrand, Eis
- [x] **Gegner (S41) auf 5 Typen** nach GDD 01, 11.4: – 2026-10-15, Commits 66ee19f und fafe243
  - Varianten Normal, Elite, Champion, Aether-verderbt
  - Gebietsstufe, Schwierigkeitsgrade
  - Teil 1 erledigt (2026-10-15): Schwierigkeitsgrade Geschichte/Normal/Schwer/Albtraum mit allen Faktoren aus GDD 03, 9.7, in den Optionen
  - Teil 2 erledigt (2026-10-15): Bandit-Schläger und Anführer, Armbrustschütze, Rissling (Normal, Elite, Champion) im Hinterhalt, Rudelführer; gemischte Gruppen und Gebietsstufe je Spawner; Mühlbach-Banditen; Name und Stufe am Ziel
  - Offen (Stufe B): Champion-Zusatzeigenschaften (Schnell, Feuer-Aura …); Skelette nachts um die Gruft kommen mit Tag und Nacht
- [x] **Bosse (S42):** – 2026-10-15, Commits b2d716c und b066835
  - Grimmbart mit 3 Phasen und Arena (Kopfgeld)
  - Glutfang, Prolog-Rissbrut
  - Bossbalken für alle
  - Teil 1 erledigt (2026-10-15): Bossbalken und Phasen für Rissbrut und Glutfang; Aether-Schale der Rissbrut (nur der Aether-Stoß bricht sie), Glutfang als Elite-Typ mit Kopftreffer-Schwäche; Helfer in Phase 2
  - Teil 2 erledigt (2026-10-15): Grimmbart mit 3 Phasen (Kriegshorn, Kran, Sturmangriff gegen Steinblöcke, Ölfässer, Rüstung ab, Brandtöpfe) und Fesseln bei 10 %, Steinbruch-Arena im Südosten
  - Offen: Kopfgeld-Quest 11.6 selbst (kommt mit den Quests 11.3–11.8), Boss-Musik, Glutfang schläft tagsüber (Tag/Nacht)
- [x] **Skill-Baum** mit etwa 15 Knoten je Klasse (Krieger, Magier), Stufen 1–8, Skill-Baum-Oberfläche mit Gamepad (S21, S61) – 2026-10-15, Commit 3312593
  - Erledigt: je 15 Knoten, Seite „Fähigkeiten“ (K) im Tagebuch, 5 Krieger-Techniken, Zauber und Verbesserungen über den Baum
  - Offen: grafischer Baum, Respec beim Lehrmeister, Stufen III–V (Stufe B)
- [x] **NPC-Tagesabläufe (S43) und Barks (S44):** – 2026-10-15, Commit 42c0a6c
  - Erledigt: Spieluhr (48 min je Tag, Uhr im HUD), Tagesabläufe für 8 Dorfbewohner, 33 Sprüche; offen: Ambient-Gespräche, Gerüchte, Warten/Schlafen
  - Hollmann von 7 bis 18 Uhr bei der Herde, Ole von 10 bis 24 Uhr, usw.
  - Kurze Sprüche im Vorbeigehen
- [x] **Ser Maren voll (S46):** – 2026-10-15, Commit 04e6c24
  - Erledigt: Loyalität mit Warnung/Verlassen, Reaktionen (Gruft), 4 KI-Modi, Rasten am Lagerfeuer, 2 Lagerfeuer-Gespräche; offen: Kommentare zu den Quests 3–6 und 8 (kommen mit den Quests), Schildwall, Befehlsrad
  - Loyalität (Warnung bei 20, Verlassen bei 10), Kommentare zu allen 8 Quests
  - 4 KI-Modi, 2 Lagerfeuer-Gespräche, nach GDD 01, 10.6
- [x] **Klettern (S48):** – 2026-10-15, Commit 09a57d5
  - Erledigt: Fels, Ranken, Leitern, Rastpunkte, Ausdauer, Klettersprung, Zittern und Absturz, Wachturm Grauwacht mit Kletterpfad (vorläufig am Westrand); offen: Kletter-Kamera, Animation, Aussichtspunkt-Funktion Fels, Ranken, Leitern, Ausdauer, Klettersprung. Krähennest der Grauwacht als Kletterpassage.
- [x] **Untersuchen, Aether-Sicht, Spuren (S37):** – 2026-10-15, Commit 06b9c6c
  - Erledigt: R halten lässt Hinweise und Spuren in 5 m leuchten (Weide, Runen, Spurknoten, Gruft-Tafeln), HUD-Rand und Zähler, Aether-Sicht (40 m, türkis, nur Gehen) per Welt-Flag; offen: Aether-Sicht erlernen (HQ 4), verborgene Wege in der Welt Detektiv-Modus nach GDD 02, für Quest 2 und 3
- [ ] **Weltkarte und Erkundung (S34, S63, S60):**
  - Teil 1 erledigt (2026-10-15): Karte (M) mit gemaltem Kartenbild, Nebel, entdeckten Orten und „?“, Aussichtspunkte Krähennest und Rabenfels-Spitze, Speichern im Abschnitt world
  - Karte mit Nebel, Aussichtspunkte, eigene Marker
  - Kompass mit Questmarkern
  - Schnellreise zwischen Wegpunkten (S50), die Spieluhr springt um die Reisedauer
- [ ] **Tag/Nacht (S35):** Licht folgt der Uhr, Lichtwert für die Schleich-KI
- [ ] **Musik und Ambience (S57):**
  - CC0-Musik für Erkundung, Spannung, Kampf und Boss mit Überblendung
  - Umgebungsgeräusche, Schritte, Kampfgeräusche, Audio-Mixer
- [ ] **Zwischensequenzen (S58):** Prolog-Sequenz von „Asche über Eichental“ mit „Überspringen halten“, Dialogkamera (Schuss/Gegenschuss)
- [ ] **Sammeln (S30, Teil):** Kräuter-Sammelpunkte mit Respawn, für „Das Kraut der Kräuterfrau“
- [ ] **Optionen und Barrierefreiheit (S11, S12)** nach GDD 05, 4.2:
  - Untertitel, Farbenblind-Modi, Halten statt Drücken, Wackeln aus, UI-Größe, Schwierigkeit
  - Grafik-Presets, Auflösung, FPS-Limit, V-Sync
  - Tastenbelegung ändern (S14)
- [ ] **Deutsch/Englisch (S13):** Sprachwechsel zur Laufzeit, alle Texte als Tabellen
- [ ] **Speicherstände migrierbar (S10):** Golden Save `slice_v1`. Alte Spielstände müssen ab jetzt immer laden.

### 1b. Gebiet und Inhalte (Technik/02, 4.8–4.9)

- [ ] **Slice-Gebiet ~1,1 km²** nach GDD 01, 4.1.2:
  - Orte: Lindenhain als eigener Ort, Hollmann-Hof, Mühle, Banditenlager, Steinbruch, Krähennest
  - Layout-Datei und Generator wie beim Eichental, Blender-Modelle
  - Zellbudget: höchstens 1.500 Renderer und 150 Gameplay-Objekte je Zelle
- [ ] **Welt-Streaming (S33):** 512-m-Zellen mit gestaffeltem Laden, sobald das Gebiet größer als eine Zelle ist
- [ ] **Die 5 übrigen Beispiel-Quests** als Daten, in der Reihenfolge aus GDD 02, 11.0:
  - [ ] 11.3 „Ein Brief, der nie ankam“ (mehrere Enden)
  - [ ] 11.4 „Banditen am Mühlbach“
  - [ ] 11.5 „Das Kraut der Kräuterfrau“
  - [ ] 11.6 „Kopfgeld: Grimmbart“
  - [ ] 11.8 „Die Schatzkarte des alten Seemanns“ (letzte Stufen bis Stufe B gesperrt, mit Teaser-Text)
- [ ] **Rundgang** spielt alle 8 Quests durch, mit 2 Durchgängen und verschiedenen Entscheidungen. An jeder Quest-Stufe speichern und laden.
- [ ] **Weitere Blender-Modelle:**
  - Banditen, Grimmbart, Glutfang, Rissbrut
  - Lindenhain-Gebäude, Mühle, Hof, Steinbruch
  - Bäume, Felsen, Requisiten
  - Bogen, Zauberstab, Streitkolben, Pfeile
- [ ] **Animationen:** Laufen, Angriffe, Treffer, Tod für Spielfigur, Wölfe, Menschen und Skelette. Eigene einfache Rigs oder CC0, z. B. Quaternius.
- [ ] **Effekte (VFX):** Treffer, Zauber, Brennen, Aether, Loot-Strahlen, Riss

### 1c. Abnahme Stufe A (Technik/02, 4.10)

- [ ] 60 FPS auf dem PC (Hoch). Engpässe mit dem Profiler finden und beheben.
- [ ] Windows-Build mit IL2CPP (braucht die Visual-Studio-C++-Werkzeuge, kostenlos; sonst weiter Mono)
- [ ] Pacing-Bericht aus der Telemetrie (S64): Spielminuten je Quest
- [ ] Spielanleitung für die ganze Stufe A (wie Anleitung 15), aktuelle .exe

## 2. Messung und Entscheidung (Gate G2)

- [ ] Bericht in `docs/`:
  - Wie lange haben Quest, Gegnertyp, Dungeon und km² Welt wirklich gedauert?
  - Was heißt das für Stufe B?
- [ ] Dem Auftraggeber in einfachen Worten empfehlen: Stufe B, **B-Minimal** oder kleiner.
  - **Bis zu seiner Antwort mit B-Minimal weitermachen.**
  - B-Minimal ist ein Teil von B. Dabei geht keine Arbeit verloren.

## 3. Stufe B-Minimal → Stufe B (Phase 5, erste veröffentlichbare Version)

Reihenfolge: zuerst alles, was B-Minimal braucht (Eichental komplett, Goldküste, Akt 1 und HQ 11–14, ~70 Quests, ~40 h), danach der Rest von Stufe B (zusätzlich Moorschatten und Aurelion-Hub, Akt 1–2, ~150 Quests).

### 3a. Systeme (Technik/02, 5.1–5.9)

- [ ] **Crafting, Berufe, Sammeln (S30):**
  - Rezepte, Stationen, Qualität, Zerlegen, Upgrade, Verzauberung
  - Filter „herstellbar / fehlende Zutaten / alle“, Sammelpunkte
- [ ] **Wirtschaft voll (S31):** Bestand und Restock, Spezial- und Wanderhändler, Hehler, Diebesgut
- [ ] **Fraktionen und Ruf (S22):** 8 Stufen, Beitritt und Ausschluss, Ruf-Bildschirm
- [ ] **Verbrechen und Kopfgeld (S45):** Zeugen, Wachen, bezahlen oder absitzen
- [ ] **Haus und Bau-Modus (S51):**
  - Gut Eichenruh Stufe 1–2, Möbel im Raster und frei
  - Garten, Lagerkiste, Rückgängig
- [ ] **Fortbewegung (S49):** Reiten mit Pferd und Reitkamera, Schwimmen, Tauchen mit Atem, Gleitschirm (Aurelion)
- [ ] **Wetter je Region (S35) und Weltereignisse (S38):**
  - Regen verstärkt Blitzschaden
  - Karawanen, Überfälle, Riss-Ausbrüche, Wanderhändler, Duellanten
- [ ] **Prozedurale Aufträge (S53):** 4–6 Vorlagen, Seeds, Tageslimit
- [ ] **Weitere Klassen:** Waldläufer, Schurke, Rissläufer mit 1 Ast. Skill-Bäume mit ≥ 40 Knoten und Baum „Überleben“. Stufen 1–30.
- [ ] **Weitere Waffen:** Zweihandschwert, Dolche, Axt (zusammen 7)
- [ ] **Weitere Begleiter:** Jasper oder Ilvy, Morwen, Tierbegleiter Wolf
- [ ] **Transmog (S19) und Wildtiere (S39)**
- [ ] **Minispiel Angeln (S54)**
- [ ] **Sammlungen (S62):** Bestiarium, Lore-Bibliothek, Codex, Titel
- [ ] **Erweiterte Editoren (S66–S69):**
  - CSV-Balancing-Import, Loot-Simulation
  - Flag-Fenster, Zellen-Werkzeuge

### 3b. Welt und Inhalte

- [ ] **Eichental komplett:** alle Orte nach GDD 01, Region 1
- [ ] **Goldküste:** Gebiet, Orte, Gegner, Quests (B-Minimal)
- [ ] **Moorschatten**
- [ ] **Aurelion als Story-Hub** mit 2 Vierteln. Vorher ein Performance-Test mit 40 NPCs (Risiken.md).
- [ ] **Hauptquests:**
  - Akt 1, dann HQ 11–14 (B-Minimal)
  - Danach der Rest von Akt 2 (zusammen 26 Hauptquests, GDD 01/02)
- [ ] **Nebenquests:**
  - Fraktion: 20 (Kapitel I von 5 Fraktionen)
  - Region: 27
  - Neben: 50
  - Begleiter: 13
  - Kleinformate: 14
- [ ] **Gegner und Bosse:**
  - ~22 Gegnertypen
  - Story-Bosse Ealdor und Kaldris, ~17 Dungeon-Bosse, ~10 Weltbosse
  - Dazu die Dungeons
- [ ] **Riss-Expeditionen „Lite“** ab Stufe 25 (Vorschlag aus GDD 00)
- [ ] **Grafik, Animationen und Ton** für alle neuen Inhalte. Musik je Region (CC0).
- [ ] **Abnahme je Region:** Rundgang, Pacing-Bericht, 60 FPS, Golden Saves

## 4. Phase 6 – Inhalte in Masse

- [ ] Weitere Minispiele: Rissduell (Kartenspiel), Armdrücken, Pferderennen
- [ ] Quest- und Dialog-Editor mit Graph-Ansicht (falls sinnvoll), Undo/Redo
- [ ] Hauptstory Akt für Akt, jeweils mit Playtest und Pacing-Auswertung
- [ ] Geheimnisse, Easter Eggs, legendäre Waffen-Questreihen, geheime Bosse

## 5. Stufe C – volle Vision (Phase 6–7, in Akt-Updates)

- [ ] **C1:** Akt 3, Region Kar'Zul, Klasse Kleriker
- [ ] **C2:** Akt 4, Frostgipfel, Glutlande, Aurelion vollständig
- [ ] **C3:** Akt 5, Zerbrochener Himmel, volles Endgame
- [ ] **Alle 8 Regionen (~46 km²):** Stufe 1–80, 6 Klassen und Hybridklassen, 11 Waffentypen, 67 Gegnertypen, 8 Begleiter mit Wolf, Falke und Bär
- [ ] **Endgame (S55):**
  - Weltstufen 1–10, Paragon, New Game+
  - Riss-Expeditionen, Arena, Raid-Bosse
  - Wöchentliche Herausforderungen, saisonale Ereignisse, tägliche und wöchentliche Aufträge
- [ ] **Erfolge und Plattform-Anbindung (S62), Fotomodus (S56)**
- [ ] **Feinschliff (Phase 7):** Balancing (S66), Performance, Release-Builds (S70)

## 6. Immer nebenher

- [ ] Fehler beheben, die der Auftraggeber oder der Rundgang findet. Das hat Vorrang.
- [ ] Rundgang und Tests erweitern, sobald etwas Neues dazukommt.
- [ ] Testanleitungen und Spielanleitung aktuell halten. Die .exe nach jedem größeren Schritt neu bauen.
- [ ] Lizenzregister pflegen (jede fremde Quelle).
- [ ] Aufräumen: veralteter Code, Warnungen aus Unity 6.6 (`[Obsolete]`), doppelte Hilfsfunktionen
- [ ] Wenn Unity 6.7 LTS erscheint: Umstieg planen und durchführen (Architektur 1.1)

## 7. Braucht den Auftraggeber (nicht selbst entscheiden; vormerken und weitermachen)

- Geld: Steam-Gebühr (100 $), Apple-Entwicklerkonto (99 $/Jahr) für signierte Mac-Builds, gekaufte Assets. Gilt erst bei einer Veröffentlichung; bis dahin 0 €.
- Anmeldungen: Mixamo (Adobe-Konto) nur, wenn er das möchte.
- Entscheidungen:
  - Stufe B, B-Minimal oder kleiner (Empfehlung siehe Abschnitt 2)
  - Veröffentlichungsmodell (Early Access ja/nein)
  - Spielname
- Externe Playtests: Freunde oder Familie spielen lassen; er entscheidet, wer.
