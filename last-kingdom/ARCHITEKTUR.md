# Architektur – The Last Kingdom

Technik: **Three.js 0.180, TypeScript 5, Vite 7, WebGL, Gamepad API, Web Audio API.** Keine weiteren Laufzeitabhängigkeiten. Alles unter `src/` ist in Module nach Zuständigkeit geteilt; Daten (Items, Gegner, Gebiete, Gebäude, Fähigkeiten) sind reine TypeScript-Tabellen, Logik ist nach Möglichkeit frei von DOM und Three.js und per vitest getestet.

## Ordner

| Ordner | Inhalt |
|---|---|
| `src/core/` | Typen (`types.ts`), Zufall mit Seed (`rng.ts`), Rauschen (`noise.ts`), Ereignisbus (`events.ts`), Mathe, lokaler Speicher (`storage.ts`) |
| `src/input/` | Aktionen und Standardbelegung (`bindings.ts`), Tastensymbole je Gerät (`glyphs.ts`), vereinheitlichte Eingabe für Tastatur/Maus/Gamepad inkl. Hot-Plug, Neubelegung, Vibration (`input.ts`). Klicks auf Menü-Bildschirme (`#ui`) sind keine Spieleingabe; beim Schließen eines Bildschirms (`consumeAll`) werden wartende Tasten und Maustasten verworfen, sonst schwingt die Figur beim Aufbruch oder nach der Pause das Schwert |
| `src/render/` | Prozedurale Texturen, Material-Cache mit Wind-Shader, Skelett-Figur (`humanoid.ts`), Animationen (`animator.ts`), Waffenmodelle, Schwerttrail (`trail.ts`), Requisiten/Gebäude (`props.ts`), statisches Zusammenfassen (`batcher.ts`), Gras als Instanzen (`grass.ts`), Himmel/Tag-Nacht mit Wolken (`sky.ts`), Wetter (`weather.ts`), Partikel, Blutspuren (`decals.ts`), Nachbearbeitung mit Bloom/Vignette (`postprocess.ts`), Krähenschwärme (`crows.ts`), Third-Person-Kamera, Lager-Hintergrundszene |
| `src/world/` | Gebietsdefinitionen (`areas.ts`), Gelände-Heightmap (`terrain.ts`), Kollision (`collision.ts`), Navigationsgitter mit A* (`nav.ts`), Weltgenerator je Biom (`worldgen.ts`) |
| `src/entities/` | Spieler (`player.ts`), Zombie-KI und Bosse (`zombie.ts`), Projektile, Schadensformeln (`combat.ts`), Gegnerliste (`zombieTypes.ts`), Kontext-Schnittstelle (`context.ts`) |
| `src/items/` | Item-Definitionen und Affixe (`itemData.ts`), Instanzen und wirksame Werte (`items.ts`), Inventar (`inventory.ts`), Beutetabellen (`loot.ts`), Händler (`merchant.ts`) |
| `src/meta/` | Profil/Spielstand (`profile.ts`), Erfahrung und Ränge (`progression.ts`), Klassen, Lager-Gebäude, Fähigkeitenbaum (mit aktiven Fähigkeiten), Missionen, Erfolge (`achievements.ts`) |
| `src/ui/` | DOM-Menüsystem mit Controller-Navigation (`ui.ts`), HUD (`hud.ts`), Bildschirme unter `screens/` |
| `src/audio/` | Prozeduraler Klang (Web Audio): Effekte, Ambiente, Musikzustände |
| `src/game/` | `game.ts` (Zustände Menü/Lager/Expedition, Profile, Ergebnis), `expedition.ts` (Spielschleife eines Einsatzes), `api.ts` (Schnittstelle für Menüs) |
| `src/dev/` | Test-Hooks `window.__lastKingdom` für die Playwright-Prüfskripte; automatischer Testspieler (`bot.ts`), der über `Input.virtual` plündert, kämpft, Tränke nutzt und extrahiert |
| `scripts/` | `build-single.mjs` (Einzeldatei), `verify-*.mjs` (Browser-Tests) |

## Datenfluss

```
main.ts → Game
  Game besitzt: WebGLRenderer, Input, AudioEngine, UI, Settings, Profile
  Zustände: menu (Hauptmenü, Charakterwahl) → camp (Hub-Menüs, 3D-Lager im Hintergrund) → expedition
  Expedition besitzt: Scene, WorldBuild (Terrain, Kollision, Nav, Props), Player, Zombie[], Projectiles,
                      Particles, Sky, Weather, Hud, Interaktionen, Beute, Missionen, Extraktion
```

- **Definition vs. Instanz:** `ItemDef` (statisch) ↔ `ItemInstance` (uid, Seltenheit, Affixe, Haltbarkeit, Aufwertung). `ZombieTypeDef` ↔ `Zombie`. `AreaDef` ↔ `WorldBuild`.
- **Ereignisse:** `events.emit("enemyKilled" | "playerDamaged" | "itemPickedUp" | "toast" | …)`; Expedition und Game abonnieren für Missionen, Statistiken, Meldungen.
- **Kontext:** Entitäten bekommen ein `EntityContext` (Welt, Partikel, Audio, Kamera, Spieler, Zombies, Hilfsfunktionen für Lärm, Beute, Beschwörung, Pestwolken). So gibt es keine zyklischen Importe.
- **Speicherstand:** `Profile` (Version 1) wird nach jeder Änderung im Lager und am Ende jeder Expedition in `localStorage` unter `lastKingdom.profile.<slot>` gespeichert; Einstellungen unter `lastKingdom.settings`, Tastenbelegung unter `lastKingdom.bindings`. Migrationen laufen in `profile.ts`.

## Welt

- Jedes Gebiet ist 280–360 m breit. Das Gelände ist eine Heightmap aus Rauschen plus Merkmalen (Einebnen, Flüsse, Seen, Straßen). `heightAt(x, z)` ist die einzige Quelle für Bodenhöhe.
- `worldgen.ts` legt pro Biom Straßen, Gebäude, Mauern, Bäume, Gräber, Container, Fackeln, Extraktionspunkte, Hebel, Geheimtruhen mit Schlüsselgegenständen, Pestzonen und Orte (POIs) an. Alles ist deterministisch aus dem Gebiets-Seed; Beute und Gegnerplatzierung nutzen einen Laufzeit-Seed.
- Statische Meshes werden pro 64-m-Zelle und Materialfamilie zusammengefasst (`StaticBatcher`): Materialien, die sich nur in der Farbe unterscheiden, teilen ein weißes Material mit Vertexfarben (`familyOf`, `familyMaterial`, `bakeColor` in `materials.ts`); kleine Gruppen wandern in 128-m-Zellen, nicht indizierte Geometrien werden verschweißt. Dadurch bleiben die Draw-Calls im Bereich von einigen Hundert.
- Gelände (`terrain.ts`): Mehrschicht-Shader (Gras, Erde, Schlamm am Ufer, Pflaster/Kies an Straßen, Fels an Hängen), Schichten ohne Gewicht werden übersprungen; `grass.ts` füllt einen Ring von 42 m um die Kamera (Dichte aus `grassOptions.count` je Qualität). `textures.ts` erzeugt alle Texturen im Code (512 px, nahtlos) samt Normal-Maps aus Höhenfeldern (`materialQuality.normalMaps`, aus bei „niedrig“).
- Kollision: gedrehte Boxen und Zylinder in einem Raster. Figuren sind Kreise auf der XZ-Ebene mit Höhenbereich. Die Kamera nutzt einen Segment-Cast gegen dieselben Kollider.
- Navigation: 0,5-m-Gitter; eine Zelle ist blockiert, wenn ein Kreis mit 0,38 m Radius an ihrem Mittelpunkt einen Kollider berührt (Türen von 1,3 m bleiben offen, dünne Wände sperren), dazu Wasser und Steilhänge. A* mit Heap, einmalig angelegten, pro Suche gestempelten Arrays (keine Allokation) und Sichtlinien-Glättung; Budget von 3 Pfaden pro Frame, Gegner mit freier Sichtlinie steuern direkt.

## Modelle (CC0)

- `render/assets.ts` (`models`): lädt GLB-Dateien aus `public/models/` (meshopt-komprimiert, Texturen WebP) einmal beim Start (`Game.modelsReady`); die Einzeldatei bettet sie als Base64 ein (`window.__LK_MODELS`). Expeditionen warten auf das Laden, das Menü nicht. Fehlende Modelle melden sich in `models.failed`, dann gilt der prozedurale Fallback.
- `render/rig.ts`: Figuren aus Outfit + Kopf + Haaren auf einem 65-Knochen-Skelett. Vorlagen pro Kombination werden einmal gebaut (Teile pro Material zusammengefasst, Sockel für Waffe/Schild/Augen/Rücken an der prozeduralen Figur ausgerichtet) und per `SkeletonUtils.clone` vervielfältigt; Materialien pro Figur (Tönung, Blut, Trefferblitz über eine gemeinsame Emissionsfarbe). `bakedCorpse()` backt eine liegende Leiche zu statischen Meshes.
- `Animator` erkennt `humanoid.rig` und steuert einen `AnimationMixer`: Tabelle `MIX` bildet die Spiel-Clips auf die Clips der Animationsbibliothek ab; nicht schleifende Clips werden auf die Dauer des Spiel-Clips gestreckt (Trefferzeitpunkte unverändert), Zusatzdrehungen (`add`, `overlay`) werden im Figurenrahmen über ausgerichtete Elternrahmen aufgeschlagen und jedes Bild zurückgesetzt.
- `render/weaponModels.ts`, `render/kitProps.ts`, `render/kitHouse.ts`: Waffen/Schilde, Requisiten (Truhe mit Deckel-Knochen), Natur (Bäume, Büsche, Felsen auf Zielhöhe skaliert) und Häuser aus 2-m-Modulen (Grundriss auf das Raster gerundet, Kollider aus demselben Layout, Türlücke 1,3 m). Statische Teile laufen durch den Batcher (behält Vertexfarben, wandelt glTF-Attribute in Floats). Truhen sind gehäutet (Deckel an einem Knochen): `rigidify()` macht daraus starre Teile unter den Knochen, der Korpus wandert in den Batcher, und `instanceParts()` zeichnet alle Deckel eines Gebiets als ein `InstancedMesh` pro Material; beim Öffnen überträgt `syncInstancedParts()` die Scharnierdrehung auf die Instanz. Kleine Hausteile (Fensterrahmen, Läden, Türen, Ranken, Böden) tragen `userData.cullRange`; der Batcher fasst sie in eigenen 32-m-Zellen zusammen, und die Expedition blendet diese Gruppen jenseits ihrer Reichweite (35–80 m) aus.

## Licht, Himmel und Wetter

- `render/sky.ts`: Himmelskuppel (Radius 400) mit Verlauf, Dämmerung, Sternen, Milchstraße, Mond und Shader-Wolken; eine Lichttabelle nach Sonnenhöhe setzt Sonne/Mond (nur eine Schattenkarte), Halbkugel- und Aufhelllicht, Belichtung und Nebelfarbe. Der Schattenkasten folgt der Blickrichtung und rastet auf Texel. Das Umgebungslicht (PMREM aus der Kuppel) wird nur bei Licht- oder Wetterwechsel neu gebaut.
- `render/weather.ts`: Regen als Liniensegmente in einer Box vor der Kamera, Blitze mit Doppelschlag und Donner nach Laufzeit, Bodennebel-Schwaden. Die Expedition macht den Boden bei Regen nass (`setWetness`) und steuert den Höhennebel (`fogUniforms`: Boden, Abfall, Anteil je Biom und Nebel).
- `render/postprocess.ts`: Bloom in halber Auflösung, Grading je Biom (Stimmung nachts kühler und gedämpfter), Filmkorn, Vignette, Schadensrand. Alle Shader werden vor dem ersten Bild kompiliert.
- Flammen (`render/flame.ts`): drei gekreuzte Quads mit einem Flammen-Shader (Rauschen, Teardrop-Form, Farbverlauf rot–orange–gelb, Flackern aus der Weltposition), additiv und bewusst unter der Bloom-Schwelle; das Leuchten kommt aus einem weichen Sprite-Schein. Eine Geometrie und ein Material für alle Fackeln, das Lagerfeuer und die Fackel in der Hand.
- Licht für Flammen: fester Pool aus 3/5/8 PointLights (Platz 0 Spielerfackel bzw. nächste Flamme, Platz 1 Extraktion oder epische Beute, der Rest die nächsten Flammen mit Rauschflackern); die Zahl der Lichter ändert sich nie, also auch keine Shader-Neubauten. Statische Meshes und Zombies jenseits der Nebelgrenze werden ausgeblendet.

## Gore

- `render/gore.ts` (`Gore`, über `EntityContext.gore`): `spray` (gerichteter Kegel + gestreckte Bodenflecken), `burst`, `pool` (wachsende Lache), `drip`, `stain` (Körper röten), `bloodyWeapon`, `splatScreen` (SVG-Spritzer im DOM), `sever` (Körperteil aus den gehäuteten Ecken backen, Knochen auf 0 skalieren, Fleischkappe + Knochenstumpf, pulsierende Fontäne), `amputate` (alte Wunde), `explode` (alle Teile + Brocken). Gibs haben einfache Physik (Schwerkraft, Abprall, Blutspur), höchstens 140, 70 s Lebensdauer.
- `render/decals.ts`: ein `InstancedMesh` mit 1200 Flecken und Deckkraft pro Instanz (`onBeforeCompile`), Flecken trocknen nach und verblassen nach Minuten. `spawnWall` stellt Flecken aufrecht an Wände (Basis aus Wandnormale, Längsachse senkrecht für herablaufende Streifen); `Gore.wallSplat` findet die Wand per Segment-Cast der Kollision (`Gore.wallCast`) und lässt dünne Pfosten und Stämme aus. `render/particles.ts` hat `spray()` für Kegel entlang einer Richtung (4000 Partikel).
- Zombies wählen beim Tod je nach letztem Treffer (kritisch/schwer/Overkill) Zerplatzen, Enthauptung, Arm oder Bein; kritische schwere Treffer reißen auch lebenden Gegnern einen Arm ab.
- Kriecher: Schwere Treffer können Wanderern und Sprintern ein Bein abtrennen, ohne sie zu töten (`Zombie.startCrawling`). Der Animator spielt dann über `Animator.remap = CRAWL_REMAP` Kriech-Clips statt der stehenden: `Swim_Fwd_Loop` aus der Animationsbibliothek, flach am Boden und per `lift` angehoben (Beckenhöhe im Z-oben-Rahmen des Wurzelknochens), Kopf per Zusatzdrehung gehoben. Kriecher sind langsamer und ziehen eine Schleifspur (`Gore.smear`).
- Waffe: `bloodyWeapon` färbt die Klinge (eigene Materialkopie mit gemerkter Grundfarbe und Rauheit), `weaponDrips` lässt eine blutige Klinge tropfen, `rinseWeapon` wäscht sie im Regen langsam sauber.

## Figuren

- `buildHumanoid()` liefert die glTF-Figur aus `rig.ts`, wenn die Modelle geladen sind; sonst erzeugt es eine `SkinnedMesh` mit 17 Knochen aus Kapseln, Kugeln und Boxen; Stoff/Haut und Metall liegen in zwei Materialgruppen (zwei Draw-Calls pro Figur). Aussehen (Haut, Kleidung, Rüstung, Helm, Größe, Masse, Untot, Boss-Silhouette, Figur, Robe) wird per Parameter bestimmt; der Spieler wird beim Wechsel der Ausrüstung neu gebaut. Trefferblitze setzen die Emissionsfarbe des Stoffmaterials.
- `Animator` mischt Clips: prozedurale Laufzyklen (Phase aus zurückgelegter Strecke) und Keyframe-Clips (Angriffe, Blocken, Treffer, Tod, Zombie-Angriffe, Boss-Fähigkeiten). Übergänge werden geblendet.
- Angriffe: pro Waffengattung eine Kombofolge mit Trefferzeitpunkt (`hitAt`); zum Zeitpunkt werden Gegner im Bogen vor dem Spieler getroffen (`performMeleeHit`). Treffer lösen Trefferpause (`hitStop`), Trefferblitz und Blutspuren aus. Ein Block, der weniger als 0,22 s vor dem Treffer gehoben wurde, ist ein perfekter Block. Fernkampf spawnt Projektile mit Ballistik.

## KI

Zustände `idle → wander → investigate → chase → attack / ability → stagger → dead`. Wahrnehmung alle 0,25 s: Sichtweite × Tageslicht × Wetter × Tarnung, Sichtkegel, Sichtlinie gegen Kollider; Gehör über `onNoise`-Ereignisse. Verfolgung direkt bei freier Linie, sonst Pfad. Separation zwischen Zombies, Steckenbleib-Erkennung. Weit entfernte, nicht alarmierte Zombies schlafen (günstiger Update). **Angriffs-Token:** Gleichzeitig greifen höchstens 1/2/3 Gegner (leicht/normal/schwer) an; wer keinen Token bekommt oder gerade zugeschlagen hat, hält Armlänge (Angriffsreichweite + 0,1 m), driftet mit Gehtempo seitlich um den Spieler und bleibt ihm zugewandt (`holdRing` in `Zombie.update`, `Zombie.attackTokens`). Bosse sind ausgenommen. Steht ein Zombie durch einen großen Frameschritt exakt auf dem Spieler, wird er entlang seiner Blickrichtung zurückgesetzt. Bosse haben Phasen (100/60/30 %) mit Rufen, Sturmangriff, Sprung, Bodenschlag, Pestwolke.

## Endgame und Komfort

- Nacht-Expeditionen (`Expedition.night`): nach dem Boss-Sieg eines Gebiets wählbar; Start um 22:30, 1,5-fache Bevölkerung, +0,35 Beuteglück, +40 % Erfahrung.
- Expeditionsbedingungen (`Expedition.modifier`): mit 35 % Wahrscheinlichkeit erhält ein Einsatz Blutmond, Nebel, Totenstille, reiche Ernte oder Unwetter; sie verändern Beuteglück, Horden-Takt, Bevölkerung oder sperren das Wetter. Bei Regen und Sturm trägt Lärm nur 70 % so weit.
- Erfolge werden beim Rückweg ins Lager aus den Profilstatistiken abgeleitet (`checkAchievements`).
- Schriftstücke (`meta/lore.ts`) sind Questgegenstände mit Text; das Inventar bietet „Lesen“, der erste Lesevorgang bringt 120 EP (`profile.loreRead`).
- Schwierigkeit (leicht/normal/schwer) skaliert Lebenspunkte und Schaden der Gegner beim Spawnen bzw. Treffen.
- Die Fackel (`torch_item`) kann in die linke Hand genommen werden und erzeugt ein flackerndes Punktlicht; Zombies sehen den Träger weiter.

## UI

DOM-basiert. `UI` verwaltet einen Bildschirm-Stapel; jedes `Screen` liefert HTML und reagiert auf `onAction(action, element, button)`. Fokus-Navigation ist räumlich (nächstes Element in Richtung), Mausbewegung setzt den Fokus, Klick löst die Aktion aus; Controller A/B/X/Y, Steuerkreuz, Stick und Schultertasten bedienen alles. Die Hinweisleiste zeigt die Symbole des aktiven Geräts.

## Prüfungen

- `npm test`: Formeln, Inventar, Beute, Missionen, Gebiete, Kollision und Wegfindung.
- `npm run verify`: Hauptmenü → Charakter → Lager → Expedition → Bewegung → Beute → Kampf → Inventar → Pause/Karte → Extraktion → Ergebnis → Spielstand nach Neuladen.
- `npm run verify:systems`: Ausbau, Herstellen, Reparatur, Aufwertung, Händler, Fähigkeiten, Lagerkiste, Todesstrafe (inkl. Notausrüstung ohne verbliebene Waffe), Missionsabgabe, Export/Import.
- `npm run verify:gamepad`: simulierter Xbox-/PlayStation-Controller: Menüs, Erstellen, Expedition, Stick-Bewegung, Kamera, Angriff, Block, Inventar, Pause, Hot-Plug und Symbolwechsel.
- `npm run verify:worlds`: baut alle acht Gebiete, prüft Bevölkerung, Beute, Draw-Calls, begehbaren Start und die Erreichbarkeit von Boss und allen Extraktionspunkten über das Navigationsgitter. Jeder Extraktionspunkt muss außerdem frei begehbar sein (nächste freie Nav-Zelle höchstens 2,5 m vom Punkt; die Aufforderung gilt ab 3,2 m, die Extraktion bricht ab 3,6 m ab), damit kein Punkt in einem Kollider liegt. Schlüsseltruhen (`WorldBuild.keyChests`) müssen vom Start aus erreichbar sein; gewöhnliche Container, die keine Flutfüllung vom Start erreicht (`NavGrid.reachableMask`), entfernt der Weltaufbau vor dem Zusammenfassen der Meshes (`droppedContainers`, höchstens 8 %).
- `npm run balance -- <gebiet> <klasse> <schwierigkeit> <sekunden> [stufe|auto] [ausrüstung]`: der Bot spielt eine Expedition und meldet Kills, erlittenen Schaden, Container, Beute und Ausgang (extrahiert / gestorben / Zeit). Die Stufe ist standardmäßig die Freischaltstufe des Gebiets; `ausrüstung` ist eine Liste von Gegenstands-IDs (z. B. `longsword_2,armor_chain`), die vor dem Lauf angelegt werden. Dient der Balance-Prüfung ohne menschlichen Spieler.
  Messwerte vom 2026-11-05 (Bot, 360 s, Standardausrüstung): Dorf/Ritter/normal extrahiert nach 173 s mit 5 Kills und 35 Schaden; Dorf/Waldläufer/normal extrahiert nach 234 s mit 6 Kills und 90 Schaden; Dorf/Ritter/schwer extrahiert nach 128 s mit 3 Kills und 107 Schaden; Wald/Ritter/normal auf Stufe 3 gestorben nach 117 s (198 Schaden, Ausdauer leer). Der Bot spielt grob, die Zahlen sind Richtwerte, keine Zielwerte.
  Nach Einführung der Angriffs-Token und des Umkreisens (gleicher Tag, 240 s, stufengerechte Ausrüstung): Friedhof/Stufe 8 extrahiert nach 94 s (vorher gestorben nach 144 s), Kloster/Stufe 10 extrahiert nach 111 s mit 60 Schaden (vorher 126 Schaden), Burg/Stufe 6 und Festung/Stufe 18 sterben weiterhin an Gruppen von drei bis fünf Gegnern, weil der Bot weder gezielt blockt noch ausweicht. Stadt/Stufe 15 extrahiert nach 226 s mit 4 Containern und 456 Gold, nachdem der Karren-Extraktionspunkt aus dem Eckturm verlegt wurde (vorher Zeitlimit).
- `npm run verify:stress`: Belastungstest mit allen Gegnertypen, Horde, Bogen, Nacht, Sturm, Nebel, Bosskampf mit Phasenwechsel, Katakomben und Pestnebel; mehrere simulierte Minuten ohne Konsolenfehler.
