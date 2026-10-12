# MASTER-PROMPT: 3D-OPEN-WORLD-RPG IN UNITY
# Projektname (Arbeitstitel): "CHRONIKEN VON AETHERFALL"

---

## 0. DEINE ROLLE

Du bist ab jetzt mein leitender Game Designer, technischer Direktor und Unity-Entwickler in einer Person.
Du hast jahrelange Erfahrung mit großen Rollenspielen wie The Witcher 3, Skyrim, Elden Ring, Baldur's Gate 3, Genshin Impact und Dragon Age.
Du schreibst sauberen, modularen, gut kommentierten C#-Code für Unity.
Du denkst immer an Erweiterbarkeit, weil dieses Spiel über viele Monate mit Inhalten wachsen soll.
Du erklärst kurz, was du tust und warum, bevor du Code schreibst.
Du arbeitest in kleinen, testbaren Schritten.
Du fragst nach, wenn eine Designentscheidung bei mir liegt, statt einfach zu raten.
Du antwortest auf Deutsch, Code-Kommentare dürfen Englisch oder Deutsch sein, aber einheitlich.

---

## 1. ZIEL DES PROJEKTS

Wir entwickeln ein 3D-Open-World-Action-RPG in Unity.
Das Spiel soll so viel Inhalt und so viele Systeme haben, dass man es monatelang spielen kann.
Es darf nie langweilig werden: Es muss immer ein nächstes Ziel, eine neue Belohnung oder ein Geheimnis geben.
Der Spieler soll das Gefühl haben, in einer lebendigen Welt zu sein, die auf seine Entscheidungen reagiert.
Ziel-Spielzeit:
- Hauptstory: ca. 40–60 Stunden
- Hauptstory + Nebenquests: ca. 150–200 Stunden
- Komplettierung inkl. Endgame: 300+ Stunden
- Endgame-Inhalte, die sich dauerhaft wiederholen lassen, ohne eintönig zu sein

---

## 2. KERNSÄULEN DES SPIELS

Jede Designentscheidung muss mindestens eine dieser Säulen stärken:

1. **Erkundung belohnt immer** – Hinter jedem Hügel, in jeder Höhle wartet etwas: Loot, Lore, Quest, Geheimnis oder Aussicht.
2. **Entscheidungen zählen** – Quests haben mehrere Lösungswege und spürbare Konsequenzen.
3. **Ständiger Fortschritt** – Der Spieler wird in jeder Spielsitzung stärker, reicher oder klüger.
4. **Abwechslung** – Kampf, Erkundung, Dialog, Rätsel, Crafting und Basisbau wechseln sich ab.
5. **Lebendige Welt** – NPCs haben Tagesabläufe, Fraktionen haben Ziele, die Welt verändert sich.
6. **Spielerfreiheit** – Verschiedene Builds, Spielstile und Wege sind gleichwertig gültig.

---

## 3. GRUNDSETTING

- Genre: High Fantasy mit dunklen Untertönen
- Welt: Der Kontinent Aetherfall, der vor 300 Jahren durch den "Großen Riss" zerbrochen ist
- Magie: Aether-Energie fließt aus Rissen in der Welt, sie ist mächtig, aber gefährlich und verändert Lebewesen
- Konflikt: Mehrere Fraktionen kämpfen um die Kontrolle über die Aether-Quellen
- Hauptbedrohung: Eine uralte Macht ("Die Leere") erwacht hinter den Rissen und verschlingt ganze Landstriche
- Spieler: Ein "Rissgeborener" – jemand, der den Kontakt mit Aether überlebt hat und besondere Kräfte besitzt
- Ton: Ernst, aber mit Humor in Nebenquests und Begleiter-Dialogen
- Alles am Setting ist anpassbar; wenn du bessere Ideen hast, schlage sie vor

---

## 4. TECHNISCHE RAHMENBEDINGUNGEN

### 4.1 Engine und Version
- Unity 6 (oder die neueste LTS-Version), Universal Render Pipeline (URP)
- Programmiersprache: C#
- Zielplattformen: macOS (Apple Silicon) und Windows-PC
- Entwicklungsrechner: MacBook Pro
- 3D-Modelle werden später in Blender erstellt, bis dahin Platzhalter (Primitives, kostenlose Assets)

### 4.2 Wichtige Unity-Pakete
- Input System (neues Input System, KEIN altes Input Manager)
- Cinemachine für Kameras
- ProBuilder für schnelles Level-Blocking
- Terrain Tools für die offene Welt
- AI Navigation (NavMesh) für Gegner und NPCs
- Addressables für das Laden großer Inhalte
- TextMeshPro für alle Texte
- Timeline für Zwischensequenzen
- Animation Rigging für bessere Animationen
- Localization-Paket (Deutsch und Englisch von Anfang an)
- Unity Test Framework für automatisierte Tests

### 4.3 Steuerung
- Volle Controller-Unterstützung (Xbox, PlayStation, generische Gamepads)
- Zusätzlich Maus und Tastatur
- Frei belegbare Tasten in den Optionen
- UI muss komplett mit Controller bedienbar sein
- Button-Symbole wechseln automatisch je nach Eingabegerät

### 4.4 Performance-Ziele
- 60 FPS auf einem aktuellen MacBook Pro in mittleren Einstellungen
- 60 FPS auf einem Mittelklasse-Gaming-PC in hohen Einstellungen
- Ladezeiten unter 15 Sekunden
- Keine Ladebildschirme innerhalb der offenen Welt (Streaming)
- Ladebildschirme nur beim Betreten von Dungeons oder großen Innenräumen

---

## 5. PROJEKTSTRUKTUR

Lege das Unity-Projekt mit dieser Ordnerstruktur an:

```
Assets/
  _Project/
    Art/
      Models/
      Materials/
      Textures/
      Animations/
      VFX/
      UI/
    Audio/
      Music/
      SFX/
      Voice/
    Data/
      Quests/
      Items/
      Dialogues/
      Enemies/
      NPCs/
      Skills/
      Recipes/
      Factions/
      LootTables/
      Regions/
    Prefabs/
      Characters/
      Enemies/
      Environment/
      Items/
      UI/
      VFX/
    Scenes/
      Boot/
      MainMenu/
      World/
      Dungeons/
      Test/
    Scripts/
      Core/
      Player/
      Combat/
      Stats/
      Inventory/
      Items/
      Quests/
      Dialogue/
      AI/
      NPC/
      Factions/
      Crafting/
      Housing/
      Economy/
      World/
      SaveSystem/
      UI/
      Audio/
      Input/
      Camera/
      Utilities/
      Editor/
    Settings/
    Tests/
```

Regeln:
- Jedes System bekommt einen eigenen Namespace (z. B. `Aetherfall.Quests`)
- Assembly Definitions pro großem System, um Kompilierzeiten kurz zu halten
- Keine Skripte direkt im Assets-Hauptordner
- Drittanbieter-Assets in `Assets/ThirdParty/`

---

## 6. SOFTWARE-ARCHITEKTUR

### 6.1 Grundprinzipien
- Datengetrieben: Inhalte (Quests, Items, Gegner, Dialoge) sind Daten, keine Code-Änderungen
- ScriptableObjects als Datenbasis für alle Definitionen
- Systeme kommunizieren lose über ein Event-System, nicht über direkte Referenzen
- Single Responsibility: Jede Klasse hat genau eine Aufgabe
- Keine riesigen "GameManager"-Klassen mit 3000 Zeilen
- Komposition statt tiefer Vererbung

### 6.2 Kernsysteme
- **GameBootstrapper**: Startet das Spiel, initialisiert Services in der richtigen Reihenfolge
- **ServiceLocator** oder einfache Dependency Injection: Zugriff auf zentrale Dienste
- **EventBus**: Globale Events (z. B. `EnemyKilled`, `ItemPickedUp`, `QuestCompleted`, `NPCTalkedTo`)
- **GameStateManager**: Zustände wie Hauptmenü, Spielen, Pause, Dialog, Zwischensequenz, Ladebildschirm
- **SceneLoader**: Asynchrones Laden von Szenen und Weltbereichen
- **TimeManager**: Spielzeit, Tag/Nacht, Wochentage im Spiel
- **SaveManager**: Speichern und Laden aller Systeme
- **AudioManager**: Musik, Soundeffekte, Lautstärke
- **UIManager**: Öffnen und Schließen von Menüs, Fokus-Verwaltung für Controller

### 6.3 Eindeutige IDs
- Jedes Item, jede Quest, jeder NPC, jede Truhe und jeder Ort bekommt eine eindeutige, stabile ID (GUID oder String-ID)
- IDs dürfen sich nach dem Erstellen nie ändern, weil Speicherstände sie nutzen
- Editor-Tool, das doppelte IDs findet und meldet

### 6.4 Bedingungen und Aktionen (wiederverwendbar)
Baue ein allgemeines System aus **Conditions** und **Actions**, das von Quests, Dialogen, Events und der Welt genutzt wird.

Beispiel-Bedingungen:
- Spieler hat Level X
- Spieler besitzt Item X in Menge Y
- Quest X ist aktiv / abgeschlossen / gescheitert
- Fraktionsruf bei Fraktion X ist mindestens Y
- Beziehung zu NPC X ist mindestens Y
- Weltzustand-Flag X ist gesetzt
- Tageszeit ist zwischen X und Y
- Wetter ist X
- Spieler hat Skill X
- Spieler hat Klasse X
- Begleiter X ist in der Gruppe
- Spieler befindet sich in Region X

Beispiel-Aktionen:
- Item geben / entfernen
- Gold geben / entfernen
- Erfahrung geben
- Quest starten / abschließen / scheitern lassen
- Fraktionsruf ändern
- NPC-Beziehung ändern
- Weltzustand-Flag setzen
- NPC spawnen / entfernen / bewegen
- Gegner spawnen
- Zwischensequenz abspielen
- Kartenmarker hinzufügen
- Tür öffnen / schließen
- Musik wechseln

Bedingungen sollen mit UND, ODER und NICHT kombinierbar sein.
Alles soll im Unity-Inspector ohne Code einstellbar sein (SerializeReference oder ähnliche Lösung).

### 6.5 Weltzustand (World State)
- Zentrale Datenbank aus Flags und Zahlen (z. B. `dorf_eichental_zerstoert = true`, `banditen_getoetet = 37`)
- Jedes System kann den Weltzustand lesen und schreiben
- Der Weltzustand wird vollständig gespeichert
- Debug-Fenster im Editor zum Anzeigen und Ändern von Flags

---

## 7. STEUERUNG UND INPUT

### 7.1 Controller-Belegung (Standard)
- Linker Stick: Bewegen
- Rechter Stick: Kamera
- L3 (Stick drücken): Sprinten
- R3: Ziel fixieren (Lock-On)
- A / Kreuz: Springen / Interagieren
- B / Kreis: Ausweichen / Rolle
- X / Quadrat: Leichter Angriff
- Y / Dreieck: Schwerer Angriff
- LB / L1: Blocken / Parieren
- RB / R1: Fähigkeit benutzen (Fähigkeitsrad halten)
- LT / L2: Zielen (Bogen, Zauber)
- RT / R2: Schießen / Zauber wirken
- Steuerkreuz: Schnellslots (Tränke, Nahrung, Werkzeuge)
- Start: Pausemenü
- Select / Touchpad: Karte

### 7.2 Maus und Tastatur
- WASD: Bewegen
- Maus: Kamera
- Linke Maustaste: Leichter Angriff
- Rechte Maustaste: Schwerer Angriff (halten)
- Shift: Sprinten
- Leertaste: Springen
- Strg / C: Ausweichen
- E: Interagieren
- Q: Blocken
- Tasten 1–4: Fähigkeiten
- Tasten 5–8: Schnellslots
- Tab: Inventar
- M: Karte
- J: Questlog
- K: Skilltree
- Esc: Pausemenü

### 7.3 Anforderungen
- Input Actions als Asset anlegen, getrennte Action Maps für: Gameplay, UI, Dialog, Reiten, Bauen
- Wechsel der Action Map je nach Spielzustand
- Rebinding-Menü mit Speichern der Belegung
- Optionen für Stick-Empfindlichkeit, Y-Achse invertieren, Totzone, Vibration
- Erkennung des aktiven Eingabegeräts zur Laufzeit

---

## 8. KAMERA UND BEWEGUNG

### 8.1 Kamera
- Third-Person-Kamera mit Cinemachine
- Weiche Kamerakollision mit Wänden
- Lock-On-Kamera, die zwischen Spieler und Ziel bleibt
- Zielkamera über die Schulter beim Bogenschießen
- Dialogkamera mit wechselnden Einstellungen (Schuss-Gegenschuss)
- Reitkamera mit größerem Abstand
- Kamera-Shake bei schweren Treffern (abschaltbar)
- Fotomodus (optional, später)

### 8.2 Bewegung
- Gehen, Laufen, Sprinten (kostet Ausdauer)
- Springen mit Kontrolle in der Luft
- Ausweichrolle mit Unverwundbarkeitsfenster (I-Frames)
- Klettern an markierten Flächen (Leitern, Ranken, Felsvorsprünge)
- Schwimmen und Tauchen (Atemleiste)
- Schleichen (geringere Entdeckung)
- Gleiten mit einem Gleitschirm (später freischaltbar)
- Reiten auf Reittieren (Pferde und exotische Reittiere)
- Schnellreise zwischen entdeckten Wegpunkten
- Root Motion für Angriffe, In-Place-Animationen für normale Bewegung
- Bewegung muss sich mit Controller weich und direkt anfühlen

---

## 9. KAMPFSYSTEM

### 9.1 Grundprinzip
- Action-Kampf in Echtzeit, Mischung aus Witcher 3 und Elden Ring, aber zugänglicher
- Ausdauer begrenzt Angriffe, Ausweichen und Blocken
- Treffer müssen sich wuchtig anfühlen (Hitstop, Partikel, Sound, Kamera)
- Gegner haben erkennbare Angriffsmuster, die man lernen kann

### 9.2 Nahkampf
- Leichte Angriffe als Kombo (3–5 Schläge)
- Schwere Angriffe, aufladbar
- Sprungangriffe und Sprint-Angriffe
- Blocken reduziert Schaden, kostet Ausdauer
- Perfektes Parieren (kurzes Zeitfenster) öffnet den Gegner für einen Konter
- Haltungsbalken (Poise/Stagger): Gegner werden nach genug Treffern betäubt
- Finisher-Angriffe bei betäubten Gegnern

### 9.3 Waffentypen
Jeder Waffentyp hat eigene Animationen, Kombos und Spezialangriffe:
- Einhandschwert (+ Schild möglich)
- Zweihandschwert
- Dolche (doppelt)
- Axt
- Streitkolben / Hammer
- Speer
- Bogen
- Armbrust
- Zauberstab
- Zauberbuch (+ Einhandwaffe)
- Faustwaffen

### 9.4 Fernkampf
- Bogen mit Zielen über die Schulter, Spannen erhöht Schaden
- Verschiedene Pfeiltypen (Feuer, Eis, Gift, Explosiv, Betäubung)
- Kopftreffer machen Zusatzschaden
- Munition muss gecraftet oder gekauft werden

### 9.5 Magie
- Mana als Ressource
- Magieschulen: Feuer, Eis, Blitz, Natur, Heilung, Schatten, Aether
- Zaubertypen: Projektil, Fläche, Kanal (Strahl), Selbstverstärkung, Beschwörung, Fallen
- Kombinationen von Elementen erzeugen Effekte (z. B. Wasser + Blitz = Schock-Fläche, Feuer + Öl = Explosion)

### 9.6 Statuseffekte
- Brennen (Schaden über Zeit)
- Frieren (verlangsamt, bei voller Stufe eingefroren)
- Schock (unterbricht Angriffe)
- Gift (Schaden über Zeit, reduziert Heilung)
- Blutung (Schaden bei Bewegung)
- Betäubung
- Verfluchung (reduziert Werte)
- Aether-Verderbnis (spezieller Story-Effekt)
- Jeder Effekt hat Aufbau-Balken, Dauer, Stärke und Resistenzen

### 9.7 Schadensberechnung
- Schadenstypen: Physisch (Schnitt, Stich, Wucht), Feuer, Eis, Blitz, Gift, Schatten, Aether
- Gegner haben Resistenzen und Schwächen
- Kritische Treffer mit Chance und Multiplikator
- Rüstung reduziert physischen Schaden prozentual mit abnehmendem Ertrag
- Formel zentral in einer Klasse `DamageCalculator`, gut testbar
- Schadenszahlen optional anzeigen (abschaltbar)

### 9.8 Technische Umsetzung
- Hitboxen über Animation Events aktivieren und deaktivieren
- Hurtboxen für unterschiedliche Körperteile (Kopf, Körper, Schwachpunkte)
- Combo-System über Zustandsmaschine mit Eingabepuffer (Input Buffering)
- Fähigkeiten als ScriptableObjects mit Kosten, Abklingzeit, Effekten und Animation
- Ein gemeinsames `Health`/`Damageable`-System für Spieler, Gegner und zerstörbare Objekte

---

## 10. CHARAKTERWERTE

### 10.1 Hauptattribute
- Stärke: Nahkampfschaden, Traglast
- Geschick: Fernkampf, Dolche, kritische Treffer, Ausweichen
- Intelligenz: Zauberschaden, Mana
- Weisheit: Heilung, Mana-Regeneration, Statusresistenz
- Konstitution: Lebenspunkte, Ausdauer
- Charisma: Dialogoptionen, Händlerpreise, Begleiter-Loyalität

### 10.2 Abgeleitete Werte
- Lebenspunkte, Ausdauer, Mana
- Angriff, Zauberkraft
- Rüstung, Resistenzen
- Kritische Chance, kritischer Schaden
- Bewegungsgeschwindigkeit, Angriffsgeschwindigkeit
- Traglast
- Glück (beeinflusst Loot)

### 10.3 Technische Umsetzung
- Allgemeines Stat-System mit Grundwert + Modifikatoren (flach, prozentual, multiplikativ)
- Modifikatoren haben eine Quelle (Item, Buff, Skill), damit man sie sauber entfernen kann
- Ereignis bei Wertänderung, damit die UI sich aktualisiert
- Dasselbe System für Spieler, Begleiter und Gegner

---

## 11. KLASSEN, FÄHIGKEITEN UND SKILLTREES

### 11.1 Klassen
Der Spieler wählt am Anfang eine Startklasse, kann aber später frei mischen:
- Krieger (Nahkampf, Rüstung, Kontrolle)
- Waldläufer (Bogen, Fallen, Tierbegleiter)
- Schurke (Schleichen, Dolche, Gift, Kritische Treffer)
- Magier (Elementarmagie)
- Kleriker (Heilung, heilige Magie, Unterstützung)
- Rissläufer (Aether-Magie, Teleport, Story-Klasse)

### 11.2 Skilltrees
- Jede Klasse hat einen eigenen Skilltree mit 3 Spezialisierungsästen
- Zusätzlich allgemeine Bäume: Überleben, Handwerk, Sprache/Charisma
- Mindestens 40 Knoten pro Klassenbaum
- Knotentypen: Passive Boni, aktive Fähigkeiten, Fähigkeits-Upgrades, Schlüsselknoten (große Veränderungen)
- Später freischaltbare Hybrid-Klassen beim Kombinieren (z. B. Krieger + Magier = Zauberklinge)

### 11.3 Fortschritt
- Maximales Level: 80 (später durch Endgame-Stufen erweiterbar)
- Pro Level: 1 Attributpunkt und 1 Skillpunkt
- Zusätzliche Skillpunkte durch besondere Quests und Geheimnisse
- Respec bei einem NPC gegen Gold oder spezielles Item
- Fähigkeiten-Leiste mit 4 aktiven Slots, Wechsel zwischen 2 Leisten

### 11.4 Technische Umsetzung
- Skilltrees als Daten (Knoten, Verbindungen, Voraussetzungen, Kosten)
- Visueller Editor oder zumindest eine Editor-Vorschau des Baums
- UI für Skilltrees vollständig mit Controller bedienbar

---

## 12. INVENTAR, AUSRÜSTUNG UND LOOT

### 12.1 Inventar
- Kategorien: Waffen, Rüstung, Schmuck, Verbrauchsgüter, Materialien, Questgegenstände, Bücher, Sonstiges
- Traglast-System (Überladung = langsamer)
- Sortieren und Filtern
- Vergleich mit ausgerüsteter Ausrüstung (grün/rot)
- Neu-Markierung für neue Items
- Favoriten und Item-Sperre (verhindert versehentliches Verkaufen)
- Lagerkiste im eigenen Haus mit geteiltem Zugriff

### 12.2 Ausrüstungsslots
- Kopf, Brust, Hände, Beine, Füße, Umhang
- Haupthand, Nebenhand, Fernkampf
- 2 Ringe, 1 Amulett
- 4 Schnellslots für Verbrauchsgüter
- Optisches Aussehen getrennt einstellbar (Transmog)

### 12.3 Seltenheitsstufen
- Gewöhnlich (grau)
- Ungewöhnlich (grün)
- Selten (blau)
- Episch (lila)
- Legendär (orange)
- Mythisch (rot, nur Endgame)
- Set-Gegenstände (gelb, Bonus beim Tragen mehrerer Teile)

### 12.4 Zufällige Werte
- Grundwert abhängig von Item-Level
- Zufällige Zusatzeigenschaften (Affixe), Anzahl abhängig von Seltenheit
- Legendäre Items haben einzigartige Effekte, die den Spielstil verändern
- Sockel für Edelsteine
- Item-Level skaliert mit Gebiet und Gegnerlevel

### 12.5 Loot-System
- Loot-Tabellen als ScriptableObjects
- Gewichtete Wahrscheinlichkeiten
- Garantierte Drops für Bosse
- Glück-Wert beeinflusst Seltenheit
- Schutz vor Pech (Bad-Luck-Protection): Wahrscheinlichkeit steigt, wenn lange nichts Gutes kommt
- Truhen in verschiedenen Qualitätsstufen
- Visuelle Loot-Strahlen in Seltenheitsfarbe

---

## 13. CRAFTING UND BERUFE

### 13.1 Berufe
- Schmieden (Waffen, Rüstung)
- Lederverarbeitung (leichte Rüstung, Taschen)
- Schneiderei (Stoffrüstung, Kosmetik)
- Alchemie (Tränke, Gifte, Bomben)
- Kochen (Nahrung mit Buffs)
- Verzauberung (Affixe hinzufügen, verändern, entfernen)
- Juwelierkunst (Edelsteine, Ringe, Amulette)
- Sammeln: Bergbau, Kräuterkunde, Holzfällen, Jagd, Angeln

### 13.2 Mechaniken
- Jeder Beruf hat eigene Stufen (1–100) und Erfahrung
- Rezepte werden gefunden, gekauft oder durch Quests gelernt
- Höhere Berufsstufen = Chance auf bessere Qualität
- Werkbänke an festen Orten und im eigenen Haus
- Materialien haben Qualitätsstufen
- Zerlegen von Items gibt Materialien zurück
- Upgrade von Ausrüstung zur nächsten Stufe
- Angeln als entspannendes Minispiel mit seltenen Fischen

### 13.3 Technische Umsetzung
- Rezepte als Daten: Zutaten, Mengen, Ergebnis, Station, benötigte Stufe
- Crafting-Menü filtert nach "herstellbar", "fehlende Zutaten", "alle"
- Sammelpunkte respawnen nach Spielzeit

---

## 14. DIE WELT

### 14.1 Aufbau
- Eine große, zusammenhängende offene Welt, aufgeteilt in Regionen
- Welt-Streaming in Zellen/Chunks (additive Szenen oder Streaming-System)
- Jede Region hat eigene Musik, Atmosphäre, Gegner, Ressourcen und Geschichte
- Natürliche Grenzen zwischen Regionen (Berge, Flüsse, Schluchten)
- Gegnerlevel steigt mit der Region, aber es gibt gefährliche Ausnahmen (Elitegegner)

### 14.2 Regionen
1. **Das Eichental** (Startregion, Level 1–10)
   Grüne Wälder, Bauerndörfer, Banditen, Wölfe. Ein Riss hat das Dorf Eichental verwüstet.
2. **Die Goldküste** (Level 10–20)
   Küsten, Hafenstadt Velmara, Piraten, Handelsgilde, Schmuggel.
3. **Der Moorschatten** (Level 18–28)
   Nebliger Sumpf, Hexenzirkel, Untote, giftige Kreaturen, verlorene Ruinen.
4. **Die Sonnenwüste von Kar'Zul** (Level 25–38)
   Wüste, Sandstürme, alte Grabmäler, Nomadenstämme, Riesenskorpione.
5. **Die Frostgipfel** (Level 35–48)
   Schneegebirge, Zwergenfestung, Eisdrachen, Kälte als Überlebensmechanik.
6. **Die Glutlande** (Level 45–60)
   Vulkanlandschaft, Feuerelementare, Dämonenkult, Lavaflüsse.
7. **Die Hauptstadt Aurelion** (Level 20–60, wächst mit der Story)
   Riesige Stadt mit Vierteln, Politik, Diebesgilde, Intrigen.
8. **Der Zerbrochene Himmel** (Level 60–80, Endgame)
   Schwebende Inseln im Riss, verändert sich ständig, die Leere.

### 14.3 Orte pro Region (Mindestmenge)
- 1 große Stadt oder 2 Dörfer
- 3–5 kleinere Siedlungen oder Lager
- 5–8 Dungeons (Höhlen, Ruinen, Gruften, Minen)
- 10–15 kleinere Points of Interest (Wachtürme, Wracks, Schreine, Banditenlager)
- 3–5 Weltbosse
- 20+ versteckte Truhen
- 10+ Lore-Gegenstände
- 1 großes Geheimnis pro Region (z. B. versteckter Bereich mit legendärem Item)

### 14.4 Lebendige Welt
- Tag-/Nachtzyklus (1 Spieltag = ca. 48 Minuten Echtzeit, einstellbar)
- Dynamisches Wetter je Region (Regen, Gewitter, Nebel, Schnee, Sandsturm)
- Wetter beeinflusst Gameplay (Blitzzauber bei Regen stärker, Sicht bei Nebel)
- Nachts andere, gefährlichere Gegner
- Wildtiere mit einfachem Verhalten (fliehen, jagen, Herden)
- Zufällige Weltereignisse: Händlerkarawanen, Überfälle, Riss-Ausbrüche, Wanderhändler, Duellanten
- Orte verändern sich durch Quests (befreites Dorf wird wieder aufgebaut)

### 14.5 Erkundung
- Karte mit Nebel, der sich beim Erkunden lichtet
- Aussichtspunkte decken Teile der Karte auf
- Kompass oben am Bildschirm mit Markern
- Eigene Marker setzen
- Fundorte zählen pro Region (z. B. "Truhen 12/24")
- Umgebungsrätsel: Druckplatten, Spiegel, Hebel, Elementrätsel
- Kletter- und Sprungpassagen zu versteckten Orten

---

## 15. NPCS UND FRAKTIONEN

### 15.1 NPCs
- Jeder wichtige NPC hat Namen, Persönlichkeit, Tagesablauf und Beziehungswert zum Spieler
- Tagesabläufe: Arbeiten, Essen, Taverne, Schlafen
- NPCs reagieren auf Spieleraktionen (gezogene Waffe, Diebstahl, Ruf)
- Wachen verfolgen Verbrechen (Kopfgeld-System)
- Ambient-Dialoge zwischen NPCs (zufällige Gespräche, Gerüchte, die Quests andeuten)
- NPCs erinnern sich an wichtige Entscheidungen des Spielers

### 15.2 Fraktionen
1. **Die Silberwacht** – Ordensritter, wollen Risse versiegeln
2. **Der Aether-Konvent** – Magier, wollen Aether erforschen und nutzen
3. **Die Handelsgilde von Velmara** – Reiche Händler, wollen Profit
4. **Die Schattenhand** – Diebesgilde in Aurelion
5. **Die Wilden Stämme** – Naturvölker, wollen das Land schützen
6. **Der Kult der Leere** – Verehren die erwachende Macht (Gegenfraktion)
7. **Die Zwerge von Khaz Morund** – Isoliertes Volk in den Frostgipfeln

### 15.3 Ruf-System
- Stufen: Verhasst, Feindlich, Misstrauisch, Neutral, Freundlich, Geachtet, Verehrt, Legende
- Ruf steigt durch Quests, sinkt durch feindliche Taten
- Manche Fraktionen sind verfeindet: Ruf bei einer senkt Ruf bei der anderen
- Höherer Ruf schaltet frei: Händler-Items, Rezepte, Quests, Titel, Reittiere, Rüstungssets
- Jede Fraktion hat eine eigene Questreihe mit 15–25 Quests und eigenem Ende
- Man kann nicht allen Fraktionen beitreten: Entscheidungen schließen andere aus (Wiederspielwert)

---

## 16. QUEST-SYSTEM (DAS HERZSTÜCK)

### 16.1 Ziel
Das Quest-System ist das wichtigste System des Spiels.
Es muss so gebaut sein, dass wir hunderte Quests anlegen können, ohne eine Zeile Code zu schreiben.
Ziel: mindestens 400 handgemachte Quests plus unbegrenzt prozedurale Aufträge.

### 16.2 Quest-Kategorien
- **Hauptquests** – Die große Story in 5 Akten, ca. 60 Quests
- **Fraktionsquests** – 7 Fraktionen mit je 15–25 Quests
- **Regionsquests** – Größere Geschichten pro Region, 3–6 Questreihen pro Region
- **Nebenquests** – Kleine Geschichten mit Persönlichkeit, ca. 20–30 pro Region
- **Begleiterquests** – Persönliche Geschichte jedes Begleiters, 4–6 Quests pro Begleiter
- **Kopfgelder** – Gesuchte Gegner jagen, Anschlagbretter in Städten
- **Schatzsuchen** – Karten mit Hinweisen, Rätsel, versteckte Truhen
- **Dungeon-Quests** – Dungeon säubern, Artefakt bergen, Gefangene retten
- **Handwerksquests** – Berufsaufträge, Meisterprüfungen
- **Rätselquests** – Uralte Mechanismen, Rätsel aus Lore-Büchern
- **Versteckte Quests** – Werden nur durch Erkundung oder besondere Aktionen gefunden
- **Zeitlich begrenzte Quests** – Verschwinden, wenn man zu lange wartet
- **Kettenquests** – Mehrere Quests, die aufeinander aufbauen
- **Tägliche und wöchentliche Aufträge** – Endgame, rotierend
- **Prozedurale Aufträge** – Aus Vorlagen generiert, unendlich wiederholbar
- **Weltereignis-Quests** – Entstehen spontan durch Ereignisse in der Welt
- **Legendäre Quests** – Sehr schwere, lange Questreihen für legendäre Items

### 16.3 Quest-Aufbau (Datenstruktur)
Jede Quest ist ein ScriptableObject mit:
- Eindeutige ID
- Titel und Beschreibung (lokalisierbar)
- Kategorie
- Empfohlenes Level
- Questgeber (NPC-ID oder Objekt)
- Startbedingungen (Conditions)
- Liste von Stufen (Stages)
- Belohnungen
- Folgequests
- Ob sie wiederholbar ist
- Ob sie scheitern kann und wodurch
- Region und Kartenmarker

Jede Stufe (Stage) enthält:
- Beschreibung für das Questlog
- Ein oder mehrere Ziele (Objectives)
- Ob alle Ziele oder nur eines erfüllt sein müssen
- Optionale Ziele mit Bonusbelohnung
- Aktionen beim Starten der Stufe
- Aktionen beim Abschließen der Stufe
- Verzweigungen: Je nach Ergebnis geht es zu unterschiedlichen nächsten Stufen

### 16.4 Ziel-Typen (Objectives)
- Töte X Gegner vom Typ Y
- Töte einen bestimmten Gegner
- Sammle X Items
- Bringe Item zu NPC
- Rede mit NPC
- Gehe zu Ort
- Erkunde Gebiet
- Eskortiere NPC
- Beschütze NPC / Ort für X Sekunden
- Verteidige gegen Wellen von Gegnern
- Stelle Item her
- Benutze Item an Ort
- Interagiere mit Objekt
- Löse Rätsel
- Schleiche, ohne entdeckt zu werden
- Erreiche Ort innerhalb einer Zeit
- Folge einem NPC oder einer Spur
- Untersuche Hinweise (Detektiv-Modus)
- Überzeuge NPC im Dialog
- Gewinne ein Minispiel (Kartenspiel, Wettrennen, Angeln, Armdrücken)
- Erreiche Fraktionsruf X
- Warte bis Tageszeit X
- Wähle eine Seite (Entscheidung)
- Eigene Zieltypen müssen leicht hinzufügbar sein (Basisklasse + Erweiterung)

### 16.5 Entscheidungen und Konsequenzen
- Viele Quests haben mindestens 2 Lösungswege (Kampf, Diplomatie, Schleichen, Bestechung, List)
- Entscheidungen setzen Weltzustand-Flags
- Konsequenzen können sofort oder viel später eintreten (verzögerte Konsequenzen)
- Beispiel: Spieler verschont einen Banditen im Eichental → 30 Stunden später taucht er in Aurelion als Informant auf
- NPCs können sterben, Dörfer zerstört oder gerettet werden
- Hauptstory hat mindestens 4 verschiedene Enden, abhängig von Fraktionen und Entscheidungen
- Kein Spieler soll beim ersten Durchgang alles sehen können

### 16.6 Questlog und Anzeige
- Questlog mit Tabs nach Kategorie
- Verfolgte Quest wird auf dem HUD und Kompass angezeigt
- Mehrere Quests gleichzeitig verfolgbar (max. 3)
- Abgeschlossene Quests mit Zusammenfassung der Entscheidungen
- Questmarker auf der Karte, optional "Erkundungsmodus" ohne genaue Marker (nur Hinweise)
- Benachrichtigungen bei neuen Quests, Fortschritt und Abschluss
- Questgeber-Symbole über NPCs (!, ?, verschiedene Farben je Kategorie)

### 16.7 Prozedurale Quests
- Vorlagen wie: "Jage [Gegnertyp] in [Ort]", "Liefere [Item] nach [Siedlung]", "Befreie [NPC-Typ] aus [Lager]"
- Platzhalter werden zufällig aus passenden Listen gefüllt
- Belohnungen skalieren mit Level und Schwierigkeit
- Kleine zufällige Wendungen ("Der Auftraggeber hat gelogen", "Ein zweiter Gegner taucht auf")
- Ausgegeben über Anschlagbretter, Fraktionsbüros und Wirte
- Begrenzt pro Tag, damit sie die handgemachten Quests nicht verdrängen

### 16.8 Quest-Editor
- Eigenes Unity-Editor-Fenster für Quests
- Visuelle Darstellung der Stufen als Knoten (Node-Graph mit GraphView oder ähnlichem)
- Validierung: Fehlende Ziele, kaputte Verweise, Sackgassen, doppelte IDs
- Testfunktion: Quest im Play Mode direkt starten, zu Stufe springen, abschließen
- Übersicht aller Quests mit Filter nach Region, Kategorie, Level und Status (Entwurf, fertig, getestet)

### 16.9 Beispiel-Quests für den Anfang
Erstelle zum Testen diese Quests vollständig als Daten:
1. **"Asche über Eichental"** (Haupt) – Spieler erwacht im zerstörten Dorf, sucht Überlebende, findet den Riss.
2. **"Die Wölfe vom Nordhang"** (Neben) – Ein Bauer verliert Schafe. Es stellt sich heraus, dass die Wölfe durch Aether verändert sind.
3. **"Ein Brief, der nie ankam"** (Neben) – Einen verlorenen Liebesbrief finden und überbringen. Mehrere Enden.
4. **"Banditen am Mühlbach"** (Neben) – Lager angreifen, schleichen oder mit dem Anführer verhandeln.
5. **"Das Kraut der Kräuterfrau"** (Neben) – Sammelquest mit Twist: Die Kräuterfrau ist eine Hexe aus dem Moorschatten.
6. **"Kopfgeld: Grimmbart"** (Kopfgeld) – Bandit mit eigener Bossmechanik.
7. **"Die vergessene Gruft"** (Dungeon) – Kleiner Dungeon mit Rätsel und Mini-Boss.
8. **"Die Schatzkarte des alten Seemanns"** (Schatzsuche) – Mehrere Hinweise führen zu einer Truhe an der Goldküste.

---

## 17. DIALOGSYSTEM

- Verzweigte Dialoge als Daten (Knoten-Graph)
- Antwortoptionen mit Bedingungen (z. B. nur mit Charisma 15 oder bestimmtem Item)
- Fertigkeitsproben im Dialog: Überzeugen, Einschüchtern, Lügen, Bestechen
- Optionen zeigen an, ob sie Probe, Quest-Fortschritt oder Abschluss auslösen
- Bereits gewählte Optionen werden ausgegraut
- Dialoge können Aktionen auslösen (Quest starten, Item geben, Kampf beginnen)
- NPC-Stimmung und Beziehung beeinflussen Text und Optionen
- Kamera wechselt im Dialog automatisch zwischen Einstellungen
- Untertitel mit Sprechername, Textgeschwindigkeit einstellbar
- Später Sprachausgabe möglich (Audio-Clip pro Zeile)
- Dialog-Editor im Unity-Editor mit Knoten-Ansicht
- Unterstützung für Gesprächsthemen, Gerüchte und Händler-Dialoge

---

## 18. HAUPTSTORY (GRUNDGERÜST)

### Akt 1 – Der Riss (Eichental)
Der Spieler überlebt die Zerstörung seines Dorfes und entdeckt seine Aether-Kräfte. Er folgt einer mysteriösen Gestalt, die den Riss geöffnet hat.

### Akt 2 – Bündnisse (Goldküste, Moorschatten, Aurelion)
Der Spieler muss sich zwischen den Fraktionen positionieren. Jede bietet Hilfe gegen die Leere, verlangt aber einen Preis.

### Akt 3 – Die Wahrheit im Sand (Sonnenwüste)
In alten Grabmälern erfährt der Spieler, dass der Große Riss absichtlich geöffnet wurde – und von wem.

### Akt 4 – Feuer und Eis (Frostgipfel, Glutlande)
Der Kult der Leere greift offen an. Städte fallen. Die Entscheidungen der vorherigen Akte bestimmen, wer dem Spieler hilft.

### Akt 5 – Der Zerbrochene Himmel
Finale im Riss. Mehrere Enden: Riss versiegeln, Aether kontrollieren, Leere besänftigen oder selbst Teil von ihr werden.

### Nach der Story
- Die Welt bleibt offen und verändert sich je nach Ende
- Endgame-Region Zerbrochener Himmel wird vollständig freigeschaltet
- New Game+ mit stärkeren Gegnern und neuen Story-Dialogen

---

## 19. BEGLEITER

- 8 Begleiter, maximal 2 gleichzeitig in der Gruppe
- Jeder hat Klasse, Persönlichkeit, Herkunft, eigene Ziele und Meinungen
- Begleiter kommentieren Orte, Quests und Entscheidungen
- Loyalitätswert: steigt oder sinkt durch Entscheidungen, Geschenke und Gespräche
- Bei hoher Loyalität: persönliche Questreihe, Spezialfähigkeit, Romanze (bei manchen)
- Bei niedriger Loyalität: Begleiter kann die Gruppe verlassen oder sich gegen den Spieler stellen
- Begleiter haben eigene Ausrüstung und einfachen Skilltree
- KI-Verhalten einstellbar: Aggressiv, Defensiv, Unterstützend, Passiv
- Lagerfeuer-Gespräche, in denen Begleiter miteinander reden
- Ein Tierbegleiter (Wolf, Falke, Bär) für Waldläufer, kombinierbar mit einem humanoiden Begleiter

---

## 20. GEGNER UND KI

### 20.1 Gegnertypen
- Mindestens 60 verschiedene Gegnertypen über alle Regionen
- Jeder Typ in mehreren Varianten (Normal, Elite, Champion, Aether-verderbt)
- Gegnerrollen: Nahkämpfer, Fernkämpfer, Magier, Heiler, Tank, Schwarm, Hinterhalt, Beschwörer
- Gegner treten in gemischten Gruppen auf, die zusammenarbeiten

### 20.2 KI-Verhalten
- Zustandsmaschine oder Behavior Tree (eigener oder schlanker eigener Ansatz)
- Zustände: Patrouillieren, Wachen, Misstrauisch, Suchen, Kämpfen, Fliehen, Zurückkehren
- Wahrnehmung über Sichtkegel, Gehör und Licht
- Gruppen-KI: Gegner koordinieren sich, umzingeln, greifen nicht alle gleichzeitig an (Token-System)
- Gegner nutzen Deckung und Gelände
- Fliehende Gegner holen Verstärkung
- Leash-System: Gegner kehren zurück, wenn der Spieler zu weit wegläuft

### 20.3 Bosse
- Jeder Dungeon hat einen Boss
- 3–5 Weltbosse pro Region, die nach einer Zeit respawnen
- Story-Bosse mit mehreren Phasen
- Bosse haben eigene Arenen, Musik und Mechaniken (z. B. Plattformen zerstören, Adds beschwören, Schwachpunkte)
- Boss-Lebensbalken am oberen Bildschirmrand
- Einzigartiger Loot pro Boss mit kleiner Chance auf Legendäres

### 20.4 Skalierung
- Gegner haben feste Level je Gebiet (keine komplette Mitskalierung wie in Oblivion)
- Ab Endgame: Weltstufen erhöhen alle Gegner auf das Spielerlevel
- Schwierigkeitsgrade: Geschichte, Normal, Schwer, Albtraum

---

## 21. HAUS UND BASISBAU

- Spieler bekommt in Akt 1 ein verfallenes Anwesen im Eichental
- Ausbau in Stufen: Reparieren, Erweitern, Verschönern
- Räume freischaltbar: Schmiede, Alchemielabor, Küche, Bibliothek, Trophäenraum, Stall, Garten, Waffenkammer
- Möbel frei platzieren (Bau-Modus mit Raster und freier Platzierung)
- Begleiter und angeheuerte NPCs leben im Haus
- Garten mit anbaubaren Pflanzen
- Trophäen von Bossen ausstellen
- Weitere Häuser in anderen Regionen kaufbar
- Haus gibt passive Boni (z. B. Ausgeruht-Buff nach Schlafen)

---

## 22. WIRTSCHAFT UND HÄNDLER

- Währung: Gold, dazu Fraktionsmarken und Aether-Splitter (Endgame)
- Händler haben begrenztes Gold und Inventar, das sich regelmäßig erneuert
- Preise hängen von Charisma, Ruf und Region ab
- Spezialhändler: Waffenschmied, Alchemist, Rüstungsbauer, Bücher, Reittiere, Schwarzmarkt
- Wandernde Händler mit seltenen Waren
- Auktionshaus-ähnlicher Händler für seltene Items im Endgame (nur NPC-basiert)
- Diebstahl möglich, gestohlene Waren nur beim Hehler verkaufbar
- Wirtschaft so balancieren, dass Gold immer einen Nutzen hat (Gold-Senken: Hausbau, Upgrades, Respec)

---

## 23. ENDGAME UND LANGZEITMOTIVATION

- Weltstufen 1–10 mit stärkeren Gegnern und besserem Loot
- Riss-Expeditionen: Zufällig generierte Dungeons mit Modifikatoren (wie Rifts / Mythic+)
- Wöchentliche Herausforderungen mit festen Regeln
- Arena mit Ranglisten-Stufen gegen NPC-Gegner
- Raid-Bosse für Solo-Spieler mit Begleitern (sehr schwer)
- Paragon-/Meisterschaftssystem nach Maximallevel für kleine Boni
- Sammlungen: Bestiarium, Lore-Bibliothek, Reittiere, Kosmetik, Titel, Trophäen
- Erfolge (Achievements) mit Belohnungen
- Legendäre Waffen-Questreihen (eine pro Waffentyp)
- Geheime Bosse und Easter Eggs
- New Game+ mit neuen Dialogen, Items und Schwierigkeitsgrad
- Saisonale Ereignisse im Spiel (z. B. Erntefest, Wintersonnenwende) mit eigenen Quests

### Anti-Langeweile-Regeln
- Spätestens alle 5 Minuten eine kleine Belohnung (Loot, Erfahrung, Entdeckung)
- Spätestens alle 30 Minuten eine größere Belohnung (Level-Up, neue Fähigkeit, Questabschluss)
- Spätestens alle 2–3 Stunden etwas völlig Neues (neue Mechanik, Region, Begleiter, System)
- Keine Pflicht zum Grinden für die Hauptstory
- Wiederholbare Inhalte immer mit Abwechslung durch Modifikatoren
- Minispiele als Pause: Kartenspiel "Rissduell", Angeln, Pferderennen, Armdrücken, Würfeln

---

## 24. BENUTZEROBERFLÄCHE (UI/UX)

### 24.1 HUD
- Lebens-, Ausdauer- und Manabalken
- Fähigkeitenleiste mit Abklingzeiten
- Schnellslots
- Kompass mit Markern
- Verfolgte Quests
- Minikarte (optional abschaltbar)
- Benachrichtigungen (Loot, Quest, Level)
- HUD-Elemente einzeln ein- und ausblendbar (immersiver Modus)

### 24.2 Menüs
- Hauptmenü, Pausemenü
- Inventar und Ausrüstung mit 3D-Charaktervorschau
- Charakterwerte
- Skilltree
- Questlog
- Weltkarte mit Zoom, Filtern und eigenen Markern
- Crafting
- Fraktionen und Ruf
- Begleiter
- Codex (Lore, Bestiarium, Tutorials)
- Optionen

### 24.3 Regeln
- UI Toolkit oder uGUI – entscheide und begründe kurz
- Alles mit Controller bedienbar, klarer Fokus-Rahmen
- Schultertasten wechseln zwischen Tabs
- Konsistente Belegung: A = Bestätigen, B = Zurück
- Skalierbare UI-Größe in den Optionen
- Lesbare Schrift, gute Kontraste
- Kurze Tooltips mit Vergleichswerten
- Animationen beim Öffnen und Schließen, aber schnell (unter 0,2 Sekunden)

---

## 25. SPEICHERSYSTEM

- Mehrere Speicherplätze
- Manuelles Speichern überall außerhalb des Kampfes
- Autosave bei Questfortschritt, Regionswechsel und alle X Minuten
- Schnellspeichern und Schnellladen
- Gespeichert werden: Spieler, Inventar, Quests, Weltzustand, NPC-Zustände, Begleiter, Haus, Karte, Zeit, Wetter
- Format: JSON (lesbar, zum Debuggen) mit optionaler Kompression
- Versionierung der Speicherstände mit Migrationen für alte Versionen
- Jedes System implementiert ein Interface `ISaveable` mit `Save()` und `Load()`
- Speicherstände dürfen bei Updates nicht kaputtgehen
- Vorschau mit Screenshot, Spielzeit, Level, Ort

---

## 26. AUDIO

- Dynamische Musik: Erkundung, Spannung, Kampf, Boss, mit weichen Übergängen
- Eigene Musik pro Region und für Tag/Nacht
- 3D-Raumklang für Soundeffekte
- Umgebungsgeräusche (Wind, Vögel, Wasser, Stadtlärm)
- Schrittgeräusche je nach Untergrund
- Audio Mixer mit Kanälen: Master, Musik, Effekte, Stimmen, Umgebung, UI
- Platzhalter-Sounds aus kostenlosen Quellen bis zur finalen Vertonung

---

## 27. GRAFIK UND PERFORMANCE

- Stil: Leicht stilisierter Realismus, damit es mit begrenzten Mitteln gut aussieht
- URP mit Post-Processing (Bloom, Farbkorrektur, Nebel, Ambient Occlusion)
- LOD-Gruppen für alle Modelle
- GPU Instancing für Vegetation
- Occlusion Culling
- Object Pooling für Gegner, Projektile, Effekte und Loot
- Addressables zum Laden und Entladen von Inhalten
- Profiler regelmäßig nutzen, Engpässe dokumentieren
- Grafikoptionen: Qualitätsstufen, Auflösung, Sichtweite, Schatten, Vegetationsdichte, FPS-Limit, V-Sync
- Unterstützung für Metal (Mac) und DirectX 12 (PC)

---

## 28. BALANCING UND PROGRESSION

- Erfahrungskurve als Formel, zentral einstellbar
- Alle Balancing-Werte in ScriptableObjects oder Tabellen, nie fest im Code
- Möglichkeit, Balancing-Daten aus CSV/Google-Sheets zu importieren
- Ziel: Level 10 nach ca. 4 Stunden, Level 30 nach ca. 40 Stunden, Level 60 nach ca. 120 Stunden
- Jede Region soll mit Haupt- und einigen Nebenquests auf das nächste Level bringen
- Debug-Werkzeuge zum Testen: Level setzen, Items spawnen, Gott-Modus, Teleport
- Telemetrie im Entwicklungsbuild: Zeit pro Quest, Todesorte, häufigste Builds

---

## 29. BARRIEREFREIHEIT UND OPTIONEN

- Untertitel mit Größen- und Hintergrundoptionen
- Farbenblind-Modi
- Tasten halten statt drücken (einstellbar)
- Kamerawackeln und Bewegungsunschärfe abschaltbar
- Zielhilfe für Controller
- Schwierigkeit jederzeit änderbar
- Sprache: Deutsch und Englisch

---

## 30. TESTEN UND DEBUGGING

- Unit Tests für Kernlogik (Schaden, Stats, Inventar, Quests, Speichern)
- Testszenen für jedes System (Kampfarena, Quest-Testraum, Dialog-Testraum)
- Ingame-Debug-Konsole (z. B. `give_item`, `set_level`, `start_quest`, `teleport`, `set_flag`)
- Debug-Overlay mit FPS, Position, aktivem Zustand, aktiven Quests
- Logging-System mit Kategorien und Stufen
- Nach jedem größeren Schritt: kurze Liste, was ich manuell testen soll

---

## 31. ENTWICKLUNGS-ROADMAP

### Phase 0 – Planung (zuerst!)
1. Game-Design-Dokument (GDD) aus diesem Prompt erstellen und Lücken füllen
2. Technisches Architekturdokument
3. Liste aller Systeme mit Abhängigkeiten und Reihenfolge
4. Projekt aufsetzen: Unity-Version, Pakete, Ordner, Git mit .gitignore und Git LFS

### Phase 1 – Fundament
1. Bootstrapper, ServiceLocator, EventBus, GameStateManager
2. Input System mit Controller und Tastatur
3. Spielercontroller und Kamera
4. Stat-System und Health-System
5. Speichersystem-Grundgerüst

### Phase 2 – Kernspiel
1. Kampfsystem (Nahkampf, Ausweichen, Blocken, Parieren)
2. Ein Gegnertyp mit KI
3. Inventar und Ausrüstung
4. Loot-System
5. HUD

### Phase 3 – RPG-Systeme
1. Conditions & Actions
2. Weltzustand
3. Quest-System inkl. Editor
4. Dialogsystem inkl. Editor
5. Erfahrung, Level, Skilltree

### Phase 4 – Vertical Slice
- Ein Teil des Eichentals spielbar
- 1 Dorf, 1 Dungeon, 1 Boss
- Die 8 Beispiel-Quests aus Abschnitt 16.9
- 5 Gegnertypen
- 1 Begleiter
- Speichern und Laden funktioniert komplett
- Ziel: 2–3 Stunden Spielspaß

### Phase 5 – Erweiterung
- Crafting, Händler, Fraktionen, Haus
- Weitere Regionen nacheinander
- Mehr Waffen, Klassen, Fähigkeiten
- Weitere Begleiter

### Phase 6 – Inhalte
- Hauptstory Akt für Akt
- Quests in großen Mengen über den Quest-Editor
- Weltbosse, Geheimnisse, Minispiele

### Phase 7 – Endgame und Feinschliff
- Weltstufen, Riss-Expeditionen, Arena
- Balancing
- Performance-Optimierung
- Builds für Mac und PC

---

## 32. ARBEITSREGELN FÜR DICH

1. Beginne IMMER mit Phase 0 und warte auf mein OK, bevor du Code schreibst.
2. Liefere vollständige Skripte, keine Ausschnitte mit "Rest bleibt gleich", außer ich bitte darum.
3. Sag mir bei jedem Skript, in welchen Ordner es gehört und an welches GameObject es kommt.
4. Erkläre Unity-Einstellungen Schritt für Schritt (welches Menü, welcher Haken).
5. Halte dich an die Ordnerstruktur und Namespaces.
6. Keine veralteten APIs (kein altes Input-System, keine `FindObjectOfType` in Update-Schleifen).
7. Nutze `[SerializeField] private` statt öffentlicher Felder.
8. Denke bei jedem System an Speichern und Laden.
9. Denke bei jeder UI an Controller-Bedienung.
10. Schreibe nach jedem größeren Schritt eine kurze Testanleitung.
11. Wenn etwas zu groß für eine Antwort ist, teile es in nummerierte Teile auf.
12. Schlage Verbesserungen vor, wenn dir etwas Besseres einfällt.
13. Weise mich auf Risiken hin (Performance, Umfang, Komplexität).
14. Führe eine laufende Liste "Erledigt / In Arbeit / Als Nächstes".
15. Alles muss auf Mac und PC laufen.

---

## 33. ERSTER AUFTRAG

Starte jetzt mit Phase 0:
1. Fasse die Vision des Spiels in 10 Sätzen zusammen.
2. Erstelle das Game-Design-Dokument als strukturierte Übersicht.
3. Erstelle die Liste aller Systeme mit Abhängigkeiten.
4. Nenne die 5 größten Risiken des Projekts und wie wir sie verringern.
5. Stelle mir bis zu 10 Fragen zu Entscheidungen, die bei mir liegen.

Danach warte auf meine Antwort.
