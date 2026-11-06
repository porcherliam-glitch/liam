# THE LAST KINGDOM

Ein düsteres Mittelalter-Zombie-Extraction-Spiel in 3D, das komplett im Browser läuft. Ein Königreich ist an einer Seuche zugrunde gegangen; du bist ein Überlebender, der aus dem sicheren Lager heraus Expeditionen in acht verseuchte Gebiete unternimmt: Beute finden, Missionen erfüllen, lebend extrahieren, das Lager ausbauen, stärker werden.

Figuren, Waffen, Häuser, Bäume und Requisiten sind echte 3D-Modelle aus kostenlosen CC0-Paketen (Quaternius, gemeinfrei, siehe `public/models/LICENSES.md`); Texturen von Gelände und Himmel, Geräusche und Musik entstehen im Browser. Zur Laufzeit wird nichts aus dem Internet geladen: Die Einzeldatei enthält alle Modelle.

## Spielen

**Am einfachsten:** Die Datei `TheLastKingdom.html` doppelklicken (entsteht mit `npm run build`). Sie öffnet sich im Browser (Chrome, Edge oder Firefox empfohlen, WebGL nötig).

**Entwicklung:**

```
npm install
npm run dev        # http://localhost:3100
npm run build      # dist/ und die Einzeldatei TheLastKingdom.html
npm test           # Unit-Tests der Spiellogik (vitest)
npm run verify:all # Browser-Tests mit Playwright (Spielablauf, Systeme, Controller, alle Welten, Belastungstest)
```

In den Einstellungen gibt es drei Schwierigkeitsgrade (Leicht, Normal, Schwer), Grafikqualität, Kameraabstand, Empfindlichkeit, Blut an/aus und Vibration.

Der Spielstand liegt im Browser (localStorage, drei Charakterplätze). In den Einstellungen lässt er sich als Datei exportieren und bei der Charakterauswahl wieder importieren.

## Steuerung

| Tastatur & Maus | Xbox | PlayStation | Aktion |
|---|---|---|---|
| W A S D | linker Stick | linker Stick | Bewegen |
| Maus | rechter Stick | rechter Stick | Kamera |
| Mausrad | – | – | Zoom |
| Leertaste | A | ✕ | Springen |
| C / Alt | B | ○ | Ausweichen (unverwundbar während der Rolle) |
| E | X | □ | Interagieren (Truhen, Hebel, Extraktion, Überlebende) |
| Tab / I | Y | △ | Inventar (gedrückt halten: aktive Fähigkeit) |
| linke Maustaste | RT | R2 | Leichter Angriff (Kombos), Bogen spannen |
| Q | RB | R1 | Schwerer Angriff |
| rechte Maustaste | LT | L2 | Blocken (mit Bogen/Armbrust: Zielen) |
| R | LB | L1 | Waffe wechseln (aus dem Schnellzugriff) |
| Shift | L3 | L3 | Sprinten |
| T / mittlere Maustaste | R3 | R3 | Ziel anvisieren |
| 1 2 3 4 | Steuerkreuz | Steuerkreuz | Schnellzugriff (Tränke, Nahrung, Zweitwaffe) |
| G | Y halten | △ halten | Aktive Fähigkeit |
| M | Back | Share | Karte |
| Esc | Start | Options | Pause |

Alle Menüs sind vollständig mit dem Controller bedienbar (Steuerkreuz/Stick zum Navigieren, A bestätigen, B zurück, LB/RB Reiter, X/Y Zweitaktionen). Controller werden automatisch erkannt, auch beim Anstecken während des Spiels, und die passenden Tastensymbole werden angezeigt. Jede Taste lässt sich unter **Steuerung** neu belegen.

## Spielablauf

1. **Charakter anlegen:** Ritter (Schild und Schwert, viel Leben), Waldläufer (Bogen, schnell) oder Schattendieb (Dolche, kritische Treffer, bessere Beute).
2. **Lager:** Acht ausbaubare Gebäude: Schmiede, Waffenkammer, Lagerhaus, Krankenstation, Händler, Werkstatt, Alchemielabor, Verteidigungsanlagen. Jede Stufe schaltet Rezepte, Plätze, Heilung, Reparatur, Aufwertungen oder versicherte Rucksackplätze frei.
3. **Missionen** vom Brett annehmen (bis zu 3): Sammeln, Bossjagd, Rettung, Erkundung, Schatzsuche, Ressourcen, Säuberung.
4. **Expedition** in eines der Gebiete (die Kartenübersicht zeigt vorab Start, Boss und Extraktionspunkte samt Aktivierung): Verlassenes Dorf, Verseuchter Wald, Alte Burg, Friedhof, Kloster, Katakomben, Mittelalterliche Stadt, Verlassene Militärfestung. Jedes Gebiet hat eigene Gegner, Beutetabellen, Geheimnisse, Gefahren und einen Boss.
5. **Überleben:** Tag und Nacht, Wetter (klar, bewölkt, Nebel, Regen, Sturm), Pestnebel, Horden. Zombies sehen und hören dich.
6. **Extrahieren:** Drei bis vier Extraktionspunkte pro Karte (Stadttor, Karren, Tunnel, Flussübergang, Waldweg, Boot, Seil). Manche müssen erst aktiviert werden: Hebel, Schlüssel aus der Karte, Fackel, Reparatur mit Holz. Am Punkt einige Sekunden im Lichtkreis bleiben.
7. **Tod:** Alles Mitgeführte ist verloren – außer den versicherten Rucksackplätzen (Verteidigungsanlagen, Fähigkeit „Versichert“) und ab Verteidigung Stufe 3 der ausgerüsteten Waffe. Die Hälfte der Erfahrung bleibt. Bleibt gar keine Waffe übrig (auch nicht in der Lagerkiste), gibt die Lagerwache eine Notausrüstung: die Anfangswaffe der Klasse, beim Bogen dazu 20 Pfeile.
8. **Nacht-Expeditionen:** Nach dem Sieg über den Boss eines Gebiets lässt sich das Gebiet bei Nacht betreten: anderthalbmal so viele Untote, deutlich bessere Beute und 40 % mehr Erfahrung. Eine Fackel in der linken Hand spendet Licht, lockt aber Untote an.
9. **Expeditionsbedingungen:** Jede dritte Expedition hat eine Besonderheit – Blutmond, dichter Nebel, Totenstille, reiche Ernte oder Unwetter – mit eigenen Vor- und Nachteilen.
10. **Schriftstücke:** In Geheimverstecken liegen acht lesbare Dokumente (Zettel des Müllers, Tagebuch des Abts, Brief an die Königin, …), die die Geschichte der Seuche erzählen. Lesen bringt einmalig Erfahrung.
11. **Erfolge:** Zwölf Erfolge (erste Extraktion, hundert Untote, alle Bosse, legendäre Beute, …) und eine Statistik im Lager.

## Systeme im Überblick

- **Kampf:** 9 Waffengattungen (Langschwert, Kurzschwert, Zweihänder, Streitaxt, Streitkolben, Speer, Dolch, Bogen, Armbrust) in je 2–4 Stufen plus 4 Schilde. Leichte Kombos, schwere Angriffe, Blocken, **perfekter Block** (Block kurz vor dem Treffer: kein Schaden, Gegner taumelt), Ausweichen mit Unverwundbarkeit, Ausdauer, kritische Treffer, Wucht und Taumeln, Trefferpause und Trefferblitz, Schwerttrails, Waffenhaltbarkeit, Aufwertungen bis +3, Waffenbeherrschung je Gattung.
- **Gegner:** Verseuchte (Bauer, Magd, Mönch, Soldat), Sprinter und Pestläufer, Brutale und Schlächter, Verseuchte Ritter und Hauptleute (blocken von vorn), acht Bosse mit Phasen und Fähigkeiten (Rufen, Sturmangriff, Sprung, Bodenschlag, Pestwolke).
- **KI:** Sicht (Sichtkegel, Tageslicht, Nebel, Tarnung) und Gehör (Sprinten, Kampf, Hebel), Wandern, Nachforschen, Verfolgen mit Wegfindung (A*), Angriffe mit Vorlauf, Gruppenalarm, Horden, die sich mit der Zeit verstärken. In Gruppen greifen je nach Schwierigkeit höchstens ein bis drei Gegner gleichzeitig an, die übrigen umstellen dich und warten auf ihre Gelegenheit.
- **Beute:** Sechs Seltenheiten (Gewöhnlich bis Mythisch) mit Affixen, Truhen, Kisten, Fässer, Säcke, Leichen, Schränke, Kräuter, Holz, Knochen, Eisen, Geheimverstecke mit Schlüsselgegenständen.
- **Inventar:** Rucksack mit Plätzen und Gewichtslimit, Ausrüstung (Waffe, Schild, Helm, Rüstung, 1–4 Schnellzugriffe), Lagerkiste im Camp, Vergleich mit der ausgerüsteten Ausrüstung, Händler mit Ruf und Rabatt.
- **Fortschritt:** Stufen bis 40, Fähigkeitenbaum mit drei Zweigen (Krieger, Waldläufer, Überlebender) à 6 Knoten, je eine aktive Fähigkeit pro Zweig (Kriegsschrei, Adrenalin, Notverband), Händler-Ruf, Waffenbeherrschung.

- **Gore (Einstellung „Blut“):** Köpfe, Arme und Beine werden abgetrennt und fliegen mit Physik davon, Stümpfe spritzen pulsierend Blut, harte Treffer lassen Gegner zerplatzen (Fleischbrocken, Gedärme, Knochensplitter). Jeder Treffer spritzt in Schlagrichtung, Blut färbt Kleidung und Klinge, Pfützen wachsen unter Leichen, verwundete Gegner hinterlassen Blutspuren, nahe Kills spritzen auf den Bildschirm. Manche Untote laufen schon mit fehlendem Arm herum, und in den Gebieten liegen tote Dorfbewohner in ihrem Blut.
- **Grafik:** 3D-Figuren mit Outfits (Bauer, Waldläufer), Köpfen, Frisuren und 34 Bewegungsabläufen, Häuser aus einem Fachwerk-Baukasten (Wände, Fenster, Türen, Ziegeldächer, Schornsteine), Bäume, Büsche und Felsen, Truhen, Kisten, Fässer, Waffen und Schilde als Modelle; Tag/Nacht mit Wolken und Sternen, Nebel, Regen, Sturm mit Blitzen, Wind in Bäumen und Gras, Bodenbewuchs, Wasser mit Wellen, Blutspuren, Bloom, Vignette und Kantenglättung (abschaltbar über die Grafikqualität).

Die Architektur ist in [ARCHITEKTUR.md](ARCHITEKTUR.md) beschrieben.

## Lizenz der Inhalte

Die 3D-Modelle und Bewegungsabläufe stammen aus kostenlosen Paketen von [Quaternius](https://quaternius.com) unter **CC0 1.0** (gemeinfrei; Liste mit Quellen in `public/models/LICENSES.md`, Aufbereitung in `tools/assets/`). Gelände- und Himmelstexturen, Partikel, Klänge und Musik werden im Code erzeugt. Einzige Abhängigkeit zur Laufzeit ist [Three.js](https://threejs.org) (MIT-Lizenz). Fehlt ein Modell, fällt das Spiel auf die prozeduralen Figuren und Gebäude zurück.
