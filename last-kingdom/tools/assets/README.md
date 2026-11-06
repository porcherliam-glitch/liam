# Modell-Aufbereitung

Diese Skripte erzeugen die Dateien in `public/models/` aus den heruntergeladenen CC0-Paketen (Quaternius).
Sie sind nicht Teil des Spiels und brauchen eigene Werkzeuge (`@gltf-transform/cli`, `meshoptimizer`, `sharp`, `fbx2gltf`), die in einem separaten Ordner installiert werden.

1. Pakete laden: `node scripts/fetch-itch.mjs <itch-url> <zielordner>` (lädt nur kostenlose Pakete, protokolliert den Lizenz-Link).
2. Figuren: `build-chars.mjs` – Outfits (vereinfacht, Texturen 512 px WebP), Köpfe aus den Basiskörpern (Dreiecke, deren Ecken überwiegend an `neck_01`/`Head` hängen), Frisuren, Animationsbibliothek (nur Skelett und Bewegungen; Verschiebungen nur für `root`/`pelvis`).
3. Requisiten: `build-props.mjs <glTF-Ordner> <ziel.glb> <Name> …` – packt ausgewählte Requisiten als benannte Knoten in eine Datei (gemeinsame Texturen nur einmal).

Die Pfade in den Skripten zeigen auf den Arbeitsordner der Cloud-Sitzung und müssen angepasst werden.
