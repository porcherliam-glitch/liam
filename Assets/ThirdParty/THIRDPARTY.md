# Lizenzregister (Drittanbieter und eigene Inhalte)

Stand: 2026-10-14. Regeln: [Architektur 1.5](../../docs/Technik/01_Architektur.md) (erlaubt: MIT, BSD, Apache 2.0, Zlib, CC0, CC-BY 4.0 mit Nennung, Unity Asset Store EULA; verboten: GPL im Laufzeitcode, CC-BY-NC, CC-BY-ND, unklare Lizenzen). Jede neue Aufnahme ist ein eigener Commit.

## Fremde Inhalte

Zurzeit gibt es **keine** fremden Modelle, Texturen, Sounds oder Code-Bibliotheken im Ordner `Assets/`. Alles Sichtbare ist selbst erzeugt (siehe unten).

| Name | Version | Quelle | Lizenz | Datum | Verantwortlich | Nutzung | Nennung nötig |
|---|---|---|---|---|---|---|---|
| Schrift „LegacyRuntime.ttf“ (Schilder in der Welt) | mit Unity 6000.6.5f1 | eingebaute Unity-Ressource | Unity-Editor-Lizenz (Teil der Engine) | 2026-10-14 | Claude | Laufzeit | nein |

## Unity-Pakete

Über `Packages/manifest.json` (Unity Registry, Unity Companion License bzw. Unity Package Distribution License; Newtonsoft Json: MIT). Sie liegen nicht in `Assets/` und werden von Unity verwaltet.

| Paket | Version | Lizenz |
|---|---|---|
| com.unity.render-pipelines.universal | 17.6.0 | Unity Companion License |
| com.unity.inputsystem | 1.20.0 | Unity Companion License |
| com.unity.cinemachine | 6.6.0 | Unity Companion License |
| com.unity.ai.navigation | 2.0.15 | Unity Companion License |
| com.unity.nuget.newtonsoft-json | 3.2.2 | MIT (Newtonsoft.Json), Unity-Paket: Unity Companion License |
| com.unity.addressables, localization, timeline, ugui, probuilder, terrain-tools, animation.rigging, test-framework | siehe Manifest | Unity Companion License |

## Eigene Inhalte (kein Register-Zwang, zur Nachvollziehbarkeit)

| Inhalt | Wie entstanden | Ort |
|---|---|---|
| Figuren: Krieger (Spielfigur), Schwert, Holzschild | Blender 5.2 per Skript `Tools/Blender/build_characters.py` (Claude, 2026-10-14), keine fremden Vorlagen | `Assets/_Project/Art/Models/Characters/` |
| Dorfbewohner (Figuren aus Grundformen) | Unity-Generator `VillagerFigures.cs` | in den Szenen |
| Dorf Eichental, Gruft, Testgelände (Häuser, Gelände, Bäume, Requisiten) | Unity-Generatoren aus den Layout-Dateien | `Assets/_Project/Art/Models/Generated/`, Szenen |
| Shader „Aetherfall/WorldText“ | eigener Code (nach dem Muster des eingebauten „GUI/Text Shader“) | `Assets/_Project/Art/Shaders/` |
