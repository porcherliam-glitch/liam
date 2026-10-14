# Figuren aus Blender (Skript, keine Handarbeit)

Stand: 2026-10-14.

`build_characters.py` baut die Figuren von Aetherfall in Blender aus Code und schreibt je Figur eine FBX-Datei nach `Assets/_Project/Art/Models/Characters/`. Alles ist eigene Arbeit (keine fremden Modelle oder Texturen), siehe `Assets/ThirdParty/THIRDPARTY.md`.

| Datei | Inhalt |
|---|---|
| `Krieger.fbx` | Spielfigur (Krieger mit Wams, Gürtel, Stiefeln) |
| `Schwert.fbx` | Schwert der Startausrüstung, Griff im Ursprung, Klinge nach vorne |
| `Holzschild.fbx` | Runder Holzschild mit Eisenrand, Griff im Ursprung |
| `Wolf.fbx` | Grauwolf (Gelenke `Torso`, `Head`, `Tail`, `FrontUpper/FrontLower`, `HindUpper/HindLower` je `.L/.R`), bewegt von `QuadrupedPuppet` |
| `AetherWolf.fbx` | Aether-Wolf: dunkles Fell, leuchtende Augen, Kristalle auf dem Rücken (Materialien mit „_Leuchten“ bekommen in Unity das Kristall-Material) |
| `Dorfbewohner.fbx` | Grundfigur aller NPCs mit Zubehör `Acc_<Name>@<Gelenk>` (Haare, Zopf, Bart, Haarkranz, Strohhut, Mütze, Kapuze, Schürze, Latz, Tuch, Rock, Robe, Mantel, Wappenrock, Rüstung) und Farb-Plätzen `Dorf_<Platz>` (Haut, Haare, Oberteil, Ärmel, Unterteil, Schuhe, Gürtel, Schürze, Akzent, Metall). `VillagerFigures` behält je Person das passende Zubehör und färbt die Plätze. |
| `Skelett.fbx` | Skelett-Krieger der Gruft: Knochen, rostiger Brustpanzer, zerrissener Lendenschurz, leuchtende Augenhöhlen (Material-Plätze `Gruft_<Platz>` werden in Unity zu den Gruft-Materialien) |
| `Ritter.fbx` | Der Wachende Ritter: Plattenpanzer, Topfhelm mit leuchtendem Sehschlitz, Wappenrock, Umhang (in Unity 1,22-fach) |
| `Turmschild.fbx` | Turmschild der Elite-Skelette und des Ritters (Platz `Gruft_Schild`: Holz bzw. Ritterpanzer) |

## Aufbau der Figuren

- Jede Figur besteht aus **starren Teilen** mit Gelenk-Namen: `Pelvis`, `Torso`, `Head`, `UpperArm.R/L`, `Forearm.R/L`, `Thigh.R/L`, `Shin.R/L`. `.R` ist die rechte Seite der Figur.
- Der Ursprung jedes Teils liegt auf seinem Gelenk (Hüfte, Knie, Schulter, Ellbogen …).
- Die FBX enthält die Teile **flach nebeneinander** (das Achsen-Einrechnen beim Export zerlegt verschachtelte Teile). Unity setzt die Gelenkkette beim Aufbau wieder zusammen (`CharacterModels.Instantiate`).
- Bewegt werden die Teile in Unity per Code (`HumanoidPuppet`): Gehen und Laufen nach der echten Geschwindigkeit, Arme greifen Schwert und Schild, Zucken bei Treffern, Umfallen beim Tod. Es gibt keine fertigen Animationen und kein Skelett.
- In Unity schaut die Figur nach +Z, rechts ist +X, die Füße stehen auf y = 0, alle Teile ohne Drehung.

## Aufruf

Blender 5.2 ist über Steam installiert:

```
"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe" -b --factory-startup -P Tools/Blender/build_characters.py
```

- `-- --only krieger,schwert` baut nur diese Figuren.
- `-- --preview <Ordner>` rendert Prüfbilder statt zu exportieren (nur zur Selbstkontrolle).

Danach in Unity prüfen (Achsen, Gelenke):

```
Unity.exe -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.World.CharacterModels.CheckBatch -logFile Logs\models.log
```

Ergebnis in der Logdatei: `Blick +Z True, rechts +X True, Kopf oben True`. Danach die Szenen neu erzeugen (Testgelände, Gruft, Eichental – Eichental zuletzt, es setzt die Mini-Slice-Startwerte).
