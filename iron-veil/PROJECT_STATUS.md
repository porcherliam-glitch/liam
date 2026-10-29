# PROJECT STATUS — OPERATION IRON VEIL

Stand: 2026-10-29

## Projektprüfung

Das Ausgangsverzeichnis enthielt kein bestehendes Spielprojekt. Ein modulares Three.js-/TypeScript-Projekt wurde neu eingerichtet. Es gibt kein Backend und keine externen Laufzeit-Assets.

## Implementiert und im Browser ausgelöst

### Raid-Kern

- [x] 3D-Ego-Kamera mit Pointer Lock, WASD/Pfeiltasten, Sprint und Visier.
- [x] Kollisionen mit Gebäuden, Containern, Kisten und Begrenzungen.
- [x] MK-4 mit kurzen Einzelschüssen und gehaltenem Automatikfeuer.
- [x] Raycast-Treffer, Körper-/Kopfschaden, Trefferfeedback und Schussgeräusche.
- [x] Magazin, Reservemunition, Nachladen und korrekte Munitionsrückgabe.
- [x] Gesundheit, Rüstungsabsorption, Gegnerbeschuss und Heilung.
- [x] Gegnerpatrouillen, Sicht, Gehör, Suche, Verfolgung, Distanzkampf und drei Gegnervarianten.
- [x] Loot-Kisten mit echter `E`-Interaktion und Raid-Inventar.
- [x] Missionsziel öffnet die Extraktion; drei Sekunden `E` halten schließt den Raid ab.
- [x] Erfolg, Tod, Zeitablauf und Abbruch besitzen echte Konsequenzen.
- [x] Ergebnisbildschirme, erneuter Einsatz, Pause und Rückkehr zur Basis.

### Unternehmen

- [x] Drei Operationen mit unterschiedlichen Gegnerzahlen, Zielen und Belohnungen.
- [x] Missionsfreischaltung über die Kommandozentrale.
- [x] Händler mit Munitionspaketen, Trauma-Sets, Schutzwesten sowie Einzel- und Gesamtverkauf.
- [x] Lager und Ausrüstung mit Weste und bis zu drei Trauma-Sets.
- [x] Geld, Ressourcen, XP, Level und Unternehmensstatistiken.
- [x] Vier Gebäude mit Bau und Ausbaustufen.
- [x] Personal zuweisen und abziehen, PersonalLimit und Gebäudekapazitäten.
- [x] Munitions- und Medikamentenproduktion, inklusive begrenzter Offline-Produktion.
- [x] Drei Forschungsprogramme mit Dauer und dauerhaften Boni.

### Oberfläche und Speicherung

- [x] Hauptmenü, Missionsauswahl, Händler, Lager, Basis, Forschung und Einstellungen.
- [x] Taktisches HUD mit Gesundheit, Rüstung, Munition, Auftrag, Kontakten, Zeit und Raid-Wert.
- [x] Empfindlichkeit, Lautstärke, Stummschaltung, Y-Invertierung und Grafikqualität.
- [x] Automatisches und manuelles lokales Speichern; defensives Laden und Zurücksetzen.
- [x] Alle benötigten Assets werden lokal gebündelt oder prozedural erzeugt.

## Verifikationsnachweise

### Allgemeiner Browsercheck

`node scripts/verify-game.mjs` mit Chromium:

- Erster gerenderter Frame und nichtleerer WebGL-Buffer.
- Einsatzstart über Space.
- W vorwärts und D rechts anhand der Spielerkoordinaten.
- Pause über Escape.
- Keine Konsolenfehler.
- Screenshots von Hauptmenü, frühem Raid und Pause wurden visuell geprüft.

### Vollständiger Systemtest

`node scripts/verify-systems.mjs`:

- Missionsliste und Sperren.
- Händlerkauf und Ausrüsten.
- Drei gezielte Schüsse und Neutralisierung eines Gegners.
- Nachladen aus der Reserve.
- Zwei Kisten per `E`, Freischaltung und erfolgreiche Extraktion.
- Beuteübertrag, Vertrag und Statistik.
- Verkauf, Basisbau, Personal und Forschung.
- Forschungsabschluss und Offline-Produktion nach Neuladen.
- Tod, Fehlschlag und Rüstungsverlust.
- Qualitätseinstellungen und deren Persistenz.
- Keine Konsolen- oder Laufzeitfehler.

### Rand- und Inhaltstest

`node scripts/verify-edge.mjs`:

- Personal abziehen, Klinikproduktion und Gesamtverkauf.
- Empfindlichkeitsregler und Y-Invertierung.
- Alle Missionsfreischaltungen.
- Stahlhafen mit sieben und Nachtgitter mit neun Gegnern.
- Heilung und Medikamentenverbrauch.
- Raid-Abbruch und Fehlschlag.
- Keine Konsolen- oder Laufzeitfehler.

## Nach Sichtprüfung und Tests behoben

- Waffenmodell verkleinert, Materialhelligkeit verbessert und im Hauptmenü ausgeblendet.
- Sekündliches Neuaufbauen der Menüs entfernt; Klicks können nicht mehr durch DOM-Ersetzung verloren gehen.
- Kurze Mausklicks werden unabhängig vom nächsten Simulationsschritt als Feueraktion registriert.
- Alle Tasten werden als gehalten verfolgt; die `E`-Extraktion funktioniert dadurch zuverlässig.
- Startmagazin und Reserve erzeugen keine zusätzliche Munition mehr.
- Munitionspakete kosten korrekt 60 $ statt des Stückpreises einer einzelnen Kugel.

## Leistungsrahmen und Grenzen

- Maximal neun aktive Gegner, elf Loot-Kisten und 28 gepoolte Tracer.
- Gemessene Testszene: ungefähr 250–290 Draw Calls und 5.000–6.000 Dreiecke, abhängig von Mission und Qualität.
- Browserpfad: Chromium mit SwiftShader. Damit sind Rendering und Logik verifiziert, aber keine 60-FPS-Aussage für reale GPU-Hardware ableitbar.
- PC/Desktop ist der Ziel-View; schmale Ansichten besitzen eine angepasste Oberfläche, aber keine Touch-Steuerung.
- Eine Unternehmenswaffe, prozedurale Low-Poly-Modelle und lokale Einzelspieler-Verwaltung; kein Multiplayer und keine Cloud.

## Nächste sinnvolle Erweiterungen

- Weitere Waffen und Händlerausrüstung.
- Zusätzliche Kartenvarianten und Missionsmodi.
- GPU-Leistungsmessung auf Zielhardware und gegebenenfalls Instancing statischer Gebäudeteile.
