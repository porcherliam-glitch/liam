# Architektur – The Last Kingdom

Technik: **Three.js 0.180, TypeScript 5, Vite 7, WebGL, Gamepad API, Web Audio API.** Keine weiteren Laufzeitabhängigkeiten. Alles unter `src/` ist in Module nach Zuständigkeit geteilt; Daten (Items, Gegner, Gebiete, Gebäude, Fähigkeiten) sind reine TypeScript-Tabellen, Logik ist nach Möglichkeit frei von DOM und Three.js und per vitest getestet.

## Ordner

| Ordner | Inhalt |
|---|---|
| `src/core/` | Typen (`types.ts`), Zufall mit Seed (`rng.ts`), Rauschen (`noise.ts`), Ereignisbus (`events.ts`), Mathe, lokaler Speicher (`storage.ts`) |
| `src/input/` | Aktionen und Standardbelegung (`bindings.ts`), Tastensymbole je Gerät (`glyphs.ts`), vereinheitlichte Eingabe für Tastatur/Maus/Gamepad inkl. Hot-Plug, Neubelegung, Vibration (`input.ts`) |
| `src/render/` | Prozedurale Texturen, Material-Cache mit Wind-Shader, Skelett-Figur (`humanoid.ts`), Animationen (`animator.ts`), Waffenmodelle, Schwerttrail (`trail.ts`), Requisiten/Gebäude (`props.ts`), statisches Zusammenfassen (`batcher.ts`), Gras als Instanzen (`grass.ts`), Himmel/Tag-Nacht mit Wolken (`sky.ts`), Wetter (`weather.ts`), Partikel, Blutspuren (`decals.ts`), Nachbearbeitung mit Bloom/Vignette (`postprocess.ts`), Third-Person-Kamera, Lager-Hintergrundszene |
| `src/world/` | Gebietsdefinitionen (`areas.ts`), Gelände-Heightmap (`terrain.ts`), Kollision (`collision.ts`), Navigationsgitter mit A* (`nav.ts`), Weltgenerator je Biom (`worldgen.ts`) |
| `src/entities/` | Spieler (`player.ts`), Zombie-KI und Bosse (`zombie.ts`), Projektile, Schadensformeln (`combat.ts`), Gegnerliste (`zombieTypes.ts`), Kontext-Schnittstelle (`context.ts`) |
| `src/items/` | Item-Definitionen und Affixe (`itemData.ts`), Instanzen und wirksame Werte (`items.ts`), Inventar (`inventory.ts`), Beutetabellen (`loot.ts`), Händler (`merchant.ts`) |
| `src/meta/` | Profil/Spielstand (`profile.ts`), Erfahrung und Ränge (`progression.ts`), Klassen, Lager-Gebäude, Fähigkeitenbaum (mit aktiven Fähigkeiten), Missionen, Erfolge (`achievements.ts`) |
| `src/ui/` | DOM-Menüsystem mit Controller-Navigation (`ui.ts`), HUD (`hud.ts`), Bildschirme unter `screens/` |
| `src/audio/` | Prozeduraler Klang (Web Audio): Effekte, Ambiente, Musikzustände |
| `src/game/` | `game.ts` (Zustände Menü/Lager/Expedition, Profile, Ergebnis), `expedition.ts` (Spielschleife eines Einsatzes), `api.ts` (Schnittstelle für Menüs) |
| `src/dev/` | Test-Hooks `window.__lastKingdom` für die Playwright-Prüfskripte |
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
- Statische Meshes werden pro 48-m-Zelle und Material zusammengefasst (`StaticBatcher`), dadurch bleiben die Draw-Calls im Bereich von einigen Hundert.
- Kollision: gedrehte Boxen und Zylinder in einem Raster. Figuren sind Kreise auf der XZ-Ebene mit Höhenbereich. Die Kamera nutzt einen Segment-Cast gegen dieselben Kollider.
- Navigation: 0,5-m-Gitter; eine Zelle ist blockiert, wenn ein Kreis mit 0,38 m Radius an ihrem Mittelpunkt einen Kollider berührt (Türen von 1,3 m bleiben offen, dünne Wände sperren), dazu Wasser und Steilhänge. A* mit Heap, einmalig angelegten, pro Suche gestempelten Arrays (keine Allokation) und Sichtlinien-Glättung; Budget von 3 Pfaden pro Frame, Gegner mit freier Sichtlinie steuern direkt.

## Figuren

- `buildHumanoid()` erzeugt eine `SkinnedMesh` mit 17 Knochen aus Kapseln, Kugeln und Boxen; Stoff/Haut und Metall liegen in zwei Materialgruppen (zwei Draw-Calls pro Figur). Aussehen (Haut, Kleidung, Rüstung, Helm, Größe, Masse, Untot, Boss-Silhouette, Figur, Robe) wird per Parameter bestimmt; der Spieler wird beim Wechsel der Ausrüstung neu gebaut. Trefferblitze setzen die Emissionsfarbe des Stoffmaterials.
- `Animator` mischt Clips: prozedurale Laufzyklen (Phase aus zurückgelegter Strecke) und Keyframe-Clips (Angriffe, Blocken, Treffer, Tod, Zombie-Angriffe, Boss-Fähigkeiten). Übergänge werden geblendet.
- Angriffe: pro Waffengattung eine Kombofolge mit Trefferzeitpunkt (`hitAt`); zum Zeitpunkt werden Gegner im Bogen vor dem Spieler getroffen (`performMeleeHit`). Treffer lösen Trefferpause (`hitStop`), Trefferblitz und Blutspuren aus. Ein Block, der weniger als 0,22 s vor dem Treffer gehoben wurde, ist ein perfekter Block. Fernkampf spawnt Projektile mit Ballistik.

## KI

Zustände `idle → wander → investigate → chase → attack / ability → stagger → dead`. Wahrnehmung alle 0,25 s: Sichtweite × Tageslicht × Wetter × Tarnung, Sichtkegel, Sichtlinie gegen Kollider; Gehör über `onNoise`-Ereignisse. Verfolgung direkt bei freier Linie, sonst Pfad. Separation zwischen Zombies, Steckenbleib-Erkennung. Weit entfernte, nicht alarmierte Zombies schlafen (günstiger Update). Bosse haben Phasen (100/60/30 %) mit Rufen, Sturmangriff, Sprung, Bodenschlag, Pestwolke.

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
- `npm run verify:systems`: Ausbau, Herstellen, Reparatur, Aufwertung, Händler, Fähigkeiten, Lagerkiste, Todesstrafe, Missionsabgabe, Export/Import.
- `npm run verify:gamepad`: simulierter Xbox-/PlayStation-Controller: Menüs, Erstellen, Expedition, Stick-Bewegung, Kamera, Angriff, Block, Inventar, Pause, Hot-Plug und Symbolwechsel.
- `npm run verify:worlds`: baut alle acht Gebiete, prüft Bevölkerung, Beute, Draw-Calls, begehbaren Start und die Erreichbarkeit von Boss und allen Extraktionspunkten über das Navigationsgitter.
- `npm run verify:stress`: Belastungstest mit allen Gegnertypen, Horde, Bogen, Nacht, Sturm, Nebel, Bosskampf mit Phasenwechsel, Katakomben und Pestnebel; mehrere simulierte Minuten ohne Konsolenfehler.
