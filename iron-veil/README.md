# OPERATION IRON VEIL

Ein lokaler 3D-Extraction-Shooter mit Unternehmensverwaltung. Sie starten als kleiner Sicherheitsdienst, bergen Versorgungsgüter aus drei Industriegebieten und investieren die Erträge in Personal, Produktion und Forschung.

## Start

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run build
npm run preview
```

Die Vorschau im Browser öffnen. Nach dem einmaligen Installieren und Erstellen werden keine Internetressourcen mehr geladen. Zum lokalen Start des Builds genügt ein statischer HTTP-Server; `file://` wird wegen der ES-Module nicht empfohlen.

## Steuerung

| Eingabe | Funktion |
| --- | --- |
| W / A / S / D oder Pfeiltasten | Bewegen |
| Maus | Umsehen |
| Linke Maustaste | Automatikfeuer |
| Rechte Maustaste | Visier |
| Shift | Sprinten |
| R | Nachladen |
| E | Kiste bergen; in der Extraktionszone halten |
| Q | Trauma-Set verwenden |
| Tab | Raid-Inventar |
| Escape | Pause |

## Spielkreislauf

1. Im Lager Munition kaufen, eine Schutzweste und bis zu drei Trauma-Sets ausrüsten.
2. Eine Operation auswählen. Stahlhafen benötigt Kommando Ebene 2, Nachtgitter Ebene 3.
3. Die geforderte Anzahl Versorgungskisten bergen. Gegner patrouillieren, hören Schüsse, suchen und greifen an.
4. Die südöstliche Extraktionszone erreichen und drei Sekunden `E` halten.
5. Erfolgreich extrahierte Beute landet im Lager. Vertragssumme und Ressourcen werden gutgeschrieben.
6. Beute verkaufen und Basis, Personal und Forschung ausbauen.

Bei Tod, Zeitablauf oder Abbruch gehen Raid-Beute, mitgeführte Weste und Trauma-Sets verloren. Nur ein Teil der Reservemunition wird geborgen. Das Sturmgewehr bleibt als Unternehmenswaffe erhalten.

## Unternehmen

- **Kommandozentrale:** mehr Personal und zusätzliche Operationen.
- **Munitionswerkstatt:** produziert mit Technikern Munitionspakete.
- **Feldlazarett:** produziert mit Sanitätern Trauma-Sets.
- **Forschungslabor:** Analysten erschließen Ballistik, Rüstungs- und Händlerboni.
- Produktion und Forschung werden auch beim Laden aus verstrichener Zeit berechnet; die Offline-Produktion ist auf zwei Stunden begrenzt.

## Technik und Projektstruktur

- TypeScript, React nur als DOM-Shell, Three.js als 3D-Renderer, Vite für den lokalen Build.
- Feste Simulation mit 60 Hz, Pointer Lock, Raycast-Treffer, kollidierende Industriegeometrie.
- Prozedurale Modelle und Texturen; keine externen Modelle, Bilder, Schriftarten oder Audiodateien.
- Web-Audio-Synthesizer für Waffen, Treffer, Interaktionen und UI.
- `src/game/raid.ts`: Raid, Spieler, Waffe, Schaden und Extraktion.
- `src/game/entities.ts`: Gegner-KI, Loot und Effekte.
- `src/game/world.ts`: Weltgenerierung und Kollisionen.
- `src/game/profile.ts` / `data.ts`: Wirtschaft, Produktion, Forschung und Inhalte.
- `src/game/ui.ts`: Menüs, HUD, Handel und Basis.
- `src/game/storage.ts`: defensive lokale Speicherung.

## Speicherung

Fortschritt und Einstellungen liegen ausschließlich in `localStorage` dieses Browsers. Es gibt keine Cloud-Synchronisation. Browserdaten löschen oder ein anderes Gerät verwenden bedeutet einen anderen beziehungsweise verlorenen Spielstand.

## Verifikation

```bash
npm run check
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run verify
CHROMIUM_PATH=/usr/bin/chromium npm run verify:systems
CHROMIUM_PATH=/usr/bin/chromium npm run verify:edge
```

`CHROMIUM_PATH` kann entfallen, wenn Playwright einen eigenen Browser findet. Die Systemtests verwenden einen frischen Browserkontext und reduzierte Grafik für reproduzierbare Logiktests auf Software-WebGL.

Der aktuelle verifizierte Umfang und bekannte Grenzen stehen in `PROJECT_STATUS.md`.
