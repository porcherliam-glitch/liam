# Anleitung 01: Projekt-Setup (Phase 0, Schritt 4)

> Für Einsteiger auf einem MacBook mit Apple Silicon · Stand: 2026-10-13 · Bezug: [Master-Prompt §31 Phase 0.4, §32.4](../00_Master-Prompt.md) · [Architektur, Abschnitt 2 (Projekt-Setup-Checkliste)](../Technik/01_Architektur.md#2-projekt-setup-checkliste) · [Architektur 3.1 (Ordner)](../Technik/01_Architektur.md#31-ordnerstruktur) · [Technik-Recherche](../Technik/03_Technik-Recherche.md)

Diese Anleitung führt dich Schritt für Schritt vom leeren Mac bis zum ersten Commit des Unity-Projekts. Sie sagt bei jeder Einstellung, **welches Menü** und **welcher Haken**. Das meiste erledigt das Editor-Werkzeug **Aetherfall > Projekt-Setup …**. Von Hand bleiben nur Dinge, für die Unity keine öffentliche Schnittstelle hat (z. B. „Active Input Handling“).

**Zeitbedarf:** etwa 2–3 Stunden, davon viel Wartezeit für Downloads (Unity-Editor ca. 10 GB).

---

## Inhalt

0. [Überblick: Was am Ende dasteht](#0-überblick-was-am-ende-dasteht)
1. [Voraussetzungen installieren](#1-voraussetzungen-installieren)
2. [Zugriff auf GitHub](#2-zugriff-auf-github)
3. [Unity-Projekt anlegen](#3-unity-projekt-anlegen)
4. [Das Repository in den Projektordner holen](#4-das-repository-in-den-projektordner-holen)
5. [Setup-Werkzeug in Unity ausführen](#5-setup-werkzeug-in-unity-ausführen)
6. [Manuelle Prüf-Checkliste](#6-manuelle-prüf-checkliste)
7. [Erster Commit](#7-erster-commit)
8. [Fertig, wenn …](#8-fertig-wenn-)
9. [Fehlerbehebung](#9-fehlerbehebung)
10. [Dateien dieses Schritts](#10-dateien-dieses-schritts)

---

## 0. Überblick: Was am Ende dasteht

| Ergebnis | Wo |
|---|---|
| Unity 6.3 LTS mit den Modulen für Mac- und Windows-Builds | Unity Hub |
| Unity-Projekt „Aetherfall“ (Vorlage „Universal 3D“), das gleichzeitig das Git-Repository ist | z. B. `~/Projekte/Aetherfall` |
| Pakete aus Architektur 1.4 (Input System, Cinemachine, Addressables, Localization …) | `Packages/manifest.json` |
| Editor- und Player-Einstellungen aus Architektur 2.3/2.4 (Force Text, Domain Reload aus, Linear, .NET Standard 2.1 …) | `ProjectSettings/` |
| Ordnerstruktur aus Architektur 3.1 | `Assets/_Project/…`, `ArtSource/` |
| Boot-Szene mit Bootstrapper, Installern und Debug-Overlay | `Assets/_Project/Scenes/Boot/Boot.unity`, `Assets/_Project/Settings/Boot/` |
| Git mit LFS und UnityYAMLMerge, erster Commit auf GitHub | Branch `claude/new-session-2ye8ds` |

**Reihenfolge:** Unity legt zuerst ein leeres Projekt an (Abschnitt 3). Danach holst du das Repository mit Code und Dokumenten **in diesen Ordner** (Abschnitt 4). So entstehen keine Konflikte: Das Repository enthält keine Dateien, die Unity beim Anlegen erzeugt (kein `Packages/`, kein `ProjectSettings/`, keine `.meta`-Dateien).

> **Hinweis zum Terminal:** Kopiere Befehle aus den grauen Kästen Zeile für Zeile (oder den ganzen Kasten) ins Terminal und drücke Enter. Die Kästen enthalten bewusst keine Kommentarzeilen mit `#`: Die Standard-Shell des Mac (zsh) meldet bei eingefügten `#`-Zeilen sonst `command not found: #`.

---

## 1. Voraussetzungen installieren

### 1.1 Terminal öffnen

**Cmd + Leertaste** → „Terminal“ eintippen → Enter. (Oder Finder > Programme > Dienstprogramme > Terminal.)

### 1.2 Homebrew (Paketverwaltung für den Mac)

Prüfen, ob Homebrew schon da ist:

```bash
brew --version
```

Erscheint `command not found: brew`, installieren:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Das Skript fragt nach deinem Mac-Passwort (beim Tippen erscheint nichts – das ist normal) und installiert bei Bedarf die „Command Line Tools for Xcode“. Am Ende zeigt es unter **Next steps** zwei Befehle. Auf Apple Silicon sind das:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
brew --version
```

### 1.3 git, Git LFS und GitHub CLI

```bash
brew install git git-lfs gh
git --version
git lfs version
git lfs install
```

- `git --version` muss mindestens **2.23** zeigen (für `git switch`), Homebrew liefert die aktuelle Version.
- `git lfs version` soll **3.8.0 oder neuer** zeigen (Architektur 2.1 #2).
- `git lfs install` richtet Git LFS **einmal für deinen Benutzer** ein. Erwartete Ausgabe: `Git LFS initialized.`

Deinen Namen und deine E-Mail für Commits einmalig festlegen (die E-Mail ist in Commits sichtbar; GitHub bietet unter Settings > Emails eine „noreply“-Adresse an):

```bash
git config --global user.name "Dein Name"
git config --global user.email "deine-adresse@example.com"
```

### 1.4 Unity Hub

```bash
brew install --cask unity-hub
```

(Alternativ von https://unity.com/download laden.) Unity Hub starten → oben links mit deiner **Unity ID** anmelden (Konto bei Bedarf anlegen).

Lizenz aktivieren: **Unity Hub > Einstellungen (Zahnrad oben links) > Licenses > Add > „Get a free personal license“**. Unity Personal ist kostenlos bis 200.000 USD Umsatz und Finanzierung pro Jahr (Technik-Recherche §1).

### 1.5 Unity 6.3 LTS mit Modulen

1. **Unity Hub > Installs > Install Editor**.
2. Reiter **Official releases** → in der Gruppe **Unity 6.3 (LTS)** den **neuesten 6000.3.x**-Eintrag wählen (zum Zeitpunkt dieser Anleitung z. B. `6000.3.26f1`) → **Install**.
   Achte darauf, dass der Hub die **Apple-silicon**-Variante installiert (Standard auf M-Chips).
3. Im Dialog **Add modules** diese Haken setzen (Architektur 2.2 #6):
   - **Mac Build Support (IL2CPP)**
   - **Windows Build Support (Mono)**
   - **Documentation**
   Alle anderen Haken (Android, iOS, WebGL, Linux, Sprachpakete …) aus lassen. „Mac Build Support (Mono)“ ist automatisch dabei.
4. **Install** → Lizenzbedingungen bestätigen → warten (Fortschritt links unter „Downloads“).
5. **Notiere die genaue Version** (z. B. `6000.3.26f1`). Du brauchst sie für UnityYAMLMerge (4.3) und den Tag beim ersten Commit (7).

> Xcode (aus dem App Store) brauchst du erst später für IL2CPP-Release-Builds auf dem Mac. Für das Setup ist es nicht nötig.

### 1.6 Optional: Code-Editor (IDE)

Eine der beiden Möglichkeiten:

| IDE | Installation | Danach in Unity (nach Abschnitt 5) |
|---|---|---|
| **JetBrains Rider** (für nicht-kommerzielle Nutzung kostenlos) | `brew install --cask rider` | **Unity > Settings… > External Tools > External Script Editor** = Rider |
| **Visual Studio Code** | `brew install --cask visual-studio-code`, dann in VS Code links **Extensions** (Cmd+Shift+X): **C# Dev Kit** (Microsoft) und **Unity** (Microsoft) installieren | **Unity > Settings… > External Tools > External Script Editor** = Visual Studio Code. Das Unity-Paket „Visual Studio Editor“ (`com.unity.ide.visualstudio`) muss installiert sein – im Template ist es dabei. |

In beiden Fällen unter **External Tools** zusätzlich die Haken **Generate .csproj files for: Embedded packages** und **Local packages** setzen (Architektur 2.3 #14). Die `.csproj`/`.sln`-Dateien ignoriert Git automatisch.

---

## 2. Zugriff auf GitHub

- **Repository:** https://github.com/porcherliam-glitch/liam
- **Branch:** `claude/new-session-2ye8ds`

> **Wichtig:** Die Dateien kommen erst auf GitHub an, wenn der Claude-Zugriff auf das Repository freigeschaltet ist. Prüfe deshalb zuerst im Browser: Repository öffnen → oben links das Branch-Menü (zeigt meist `main`) → `claude/new-session-2ye8ds` wählen. Dort muss der Ordner `Assets/_Project/Scripts/Editor/Core/` mit der Datei `ProjectSetupWindow.cs` zu sehen sein. Fehlt der Branch oder die Datei, hier stoppen und Claude Bescheid geben.

Das Repository ist privat. Melde Git deshalb einmalig bei GitHub an:

```bash
gh auth login
```

Antworten: **GitHub.com** → **HTTPS** → „Authenticate Git with your GitHub credentials?“ **Yes** → **Login with a web browser** → den angezeigten Code im Browser eingeben. Danach prüfen:

```bash
git ls-remote --heads https://github.com/porcherliam-glitch/liam.git
```

In der Ausgabe muss eine Zeile mit `refs/heads/claude/new-session-2ye8ds` stehen.

---

## 3. Unity-Projekt anlegen

1. Projektordner anlegen:

   ```bash
   mkdir -p ~/Projekte
   ```

2. **Unity Hub > Projects > New project**.
3. Oben **Editor Version**: die installierte **6000.3.x** wählen.
4. Vorlage (Template) **Universal 3D** anklicken. Steht dort „Download template“, zuerst darauf klicken.
5. Rechts unter **Project settings**:
   - **Project name:** `Aetherfall`
   - **Location:** `~/Projekte` (über das Ordner-Symbol: Benutzerordner > Projekte)
   - Haken **Use Unity Version Control: AUS** (wichtig – wir nutzen Git, nicht Unity Version Control).
   - Haken **Connect to Unity Cloud:** aus (wird nicht gebraucht).
6. **Create project** → Unity öffnet sich und importiert das Template (einige Minuten).
7. Sobald der Editor bereit ist (unten rechts kein Fortschrittsbalken mehr): **Unity > Quit Unity** (Cmd+Q). Fragt Unity nach dem Speichern der Szene: **Don't Save**.

Unity muss **geschlossen** sein, bevor du im nächsten Abschnitt Dateien mit Git holst. Der Ordner `~/Projekte/Aetherfall` enthält jetzt `Assets/`, `Packages/`, `ProjectSettings/`, `Library/`, `Logs/` und `UserSettings/`.

---

## 4. Das Repository in den Projektordner holen

### 4.1 Befehle

```bash
cd ~/Projekte/Aetherfall
git init
git lfs install
git remote add origin https://github.com/porcherliam-glitch/liam.git
git fetch origin
git switch --track origin/claude/new-session-2ye8ds
```

Was die Befehle tun:

| Befehl | Wirkung |
|---|---|
| `git init` | macht den Projektordner zu einem (noch leeren) Git-Repository. Alle Unity-Dateien sind danach „untracked“ (Git kennt sie noch nicht). |
| `git lfs install` | installiert die Git-LFS-Hooks in diesem Repository. Erwartet: `Updated Git hooks. Git LFS initialized.` |
| `git remote add origin …` | merkt sich die GitHub-Adresse unter dem Namen `origin`. |
| `git fetch origin` | lädt alle Branches herunter, ohne Dateien im Ordner zu ändern. |
| `git switch --track origin/claude/new-session-2ye8ds` | legt den lokalen Branch `claude/new-session-2ye8ds` an, verbindet ihn mit dem GitHub-Branch und schreibt dessen Dateien in den Ordner: `docs/`, `README.md`, `.gitignore`, `.gitattributes` und den Code unter `Assets/_Project/`. |

**Warum das ohne Konflikt klappt:** Git bricht einen Checkout nur ab, wenn eine **untracked** Datei überschrieben würde. Das Repository enthält keine Datei, die Unity beim Anlegen erzeugt hat. Die Template-Dateien bleiben deshalb unverändert liegen und kommen erst mit dem ersten Commit (Abschnitt 7) dazu.

**Prüfen:**

```bash
git status
```

Erwartet: `On branch claude/new-session-2ye8ds`, `Your branch is up to date with 'origin/claude/new-session-2ye8ds'`, darunter **Untracked files** mit z. B. `Assets/Readme.asset`, `Assets/Scenes/`, `Assets/Settings/`, `Assets/TutorialInfo/`, `Packages/`, `ProjectSettings/`. **Nicht** in der Liste stehen dürfen `Library/`, `Logs/`, `Temp/` und `UserSettings/` – die ignoriert die `.gitignore`. Stehen sie doch da, fehlt die `.gitignore` (Checkout fehlgeschlagen → Abschnitt 4.2).

> **Branch-Name:** Die Anleitung legt den lokalen Branch mit **demselben Namen** wie auf GitHub an. Dann funktionieren `git pull` und `git push` ohne Zusatzangaben. Die Variante `git checkout -b main --track origin/claude/new-session-2ye8ds` funktioniert auch, aber dann verweigert ein einfaches `git push` den Upload (lokaler und entfernter Name unterscheiden sich). Du müsstest jedes Mal `git push origin HEAD:claude/new-session-2ye8ds` schreiben. Deshalb: gleicher Name.

### 4.2 Wenn Git einen Konflikt meldet

**Meldung:** `error: The following untracked working tree files would be overwritten by checkout:` mit einer Liste von Dateien, danach `Aborting`.

Git hat dann **nichts verändert**. Vorgehen:

1. Die genannten Dateien an einen sicheren Ort verschieben (Beispiel für eine Datei `README.md`):

   ```bash
   mkdir -p ~/Desktop/aetherfall-konflikt
   mv README.md ~/Desktop/aetherfall-konflikt/
   ```

   Bei Dateien in Unterordnern den Pfad mitnehmen, z. B. `mv Assets/_Project/irgendwas.cs ~/Desktop/aetherfall-konflikt/`.
2. Den Befehl `git switch --track origin/claude/new-session-2ye8ds` wiederholen.
3. Danach vergleichen: Die Version aus dem Repository gilt. Das gilt besonders für `.meta`-Dateien: Sie enthalten die GUID, über die Unity Verweise findet. Eine lokal erzeugte `.meta` darf eine `.meta` aus dem Repository nie ersetzen.

**Nicht** verwenden: `git switch -f` oder `git checkout -f`. Diese Befehle überschreiben ohne Sicherung.

**Meldung:** `fatal: invalid reference: origin/claude/new-session-2ye8ds` → Der Branch ist (noch) nicht auf GitHub. Mit `git branch -r` siehst du, welche Branches angekommen sind. Siehe Hinweis in Abschnitt 2 (Claude-Zugriff).

### 4.3 UnityYAMLMerge in der lokalen Git-Konfiguration

Szenen (`.unity`), Prefabs (`.prefab`) und andere Unity-Dateien sind Text im YAML-Format. Unity liefert dafür ein eigenes Zusammenführungs-Programm (Smart Merge). Die `.gitattributes` im Repository verweist schon darauf; Git muss nur noch wissen, **wo** das Programm liegt. Das trägst du einmal pro Rechner und Editor-Version ein (Architektur 2.9 #46).

**Einfachster Weg:** Nach Abschnitt 5 zeigt das Setup-Fenster in Schritt **f)** unter „Git-Befehle für UnityYAMLMerge (Smart Merge) anzeigen“ die fertigen Befehle **mit dem richtigen Pfad** und einem Knopf **Kopieren**.

**Von Hand:** Der Pfad auf dem Mac lautet:

```
/Applications/Unity/Hub/Editor/<Version>/Unity.app/Contents/Tools/UnityYAMLMerge
```

Deine Version findest du mit `ls /Applications/Unity/Hub/Editor/`. Beispiel für `6000.3.26f1` (Version anpassen):

```bash
UYM="/Applications/Unity/Hub/Editor/6000.3.26f1/Unity.app/Contents/Tools/UnityYAMLMerge"
ls -l "$UYM"
git config --local merge.tool unityyamlmerge
git config --local mergetool.unityyamlmerge.trustExitCode false
git config --local mergetool.unityyamlmerge.cmd "'$UYM' merge -p \"\$BASE\" \"\$REMOTE\" \"\$LOCAL\" \"\$MERGED\""
```

`ls -l` muss die Datei anzeigen (sonst stimmt der Pfad nicht – Hub-Installationsort unter **Unity Hub > Einstellungen > Installs** prüfen). Diese Einrichtung als **Merge-Tool** entspricht dem Unity-Handbuch („Smart Merge“). Bei einem Konflikt in einer Szene startest du es mit `git mergetool`.

**Optional – automatischer Merge-Treiber** (Architektur 2.9, dort als „nicht verifiziert“ markiert):

```bash
git config --local merge.unityyamlmerge.name "Unity SmartMerge"
git config --local merge.unityyamlmerge.driver "'$UYM' merge -p %O %B %A %A"
git config --local merge.unityyamlmerge.recursive binary
```

Damit versucht Git bei jedem Merge selbst, Unity-Dateien mit UnityYAMLMerge zusammenzuführen. Teste das **nach dem ersten Commit** (Abschnitt 7) einmal:

1. `git switch -c test/merge-a` → in Unity in `Boot.unity` das Objekt `GameBootstrapper` anklicken, im Inspector bei **Transform > Position X** `1` eintragen, speichern (Cmd+S) → `git commit -am "test: merge a"`.
2. `git switch claude/new-session-2ye8ds` → `git switch -c test/merge-b` → in Unity das Objekt `DevTools` auf **Position X** `2` setzen, speichern → `git commit -am "test: merge b"`.
3. `git merge test/merge-a` → Erwartung: Merge ohne Konflikt; in Unity hat `GameBootstrapper` X = 1 und `DevTools` X = 2.
4. Aufräumen: `git switch claude/new-session-2ye8ds`, dann `git branch -D test/merge-a test/merge-b`.

Gibt es dabei Fehlermeldungen von UnityYAMLMerge, den Treiber wieder entfernen (das Merge-Tool bleibt):

```bash
git config --local --remove-section merge.unityyamlmerge
```

> Nach einem Unity-Update ändert sich der Pfad (andere Versionsnummer). Dann die Befehle mit dem neuen Pfad erneut ausführen.

---

## 5. Setup-Werkzeug in Unity ausführen

### 5.1 Projekt öffnen

**Unity Hub > Projects** → `Aetherfall` anklicken. In der Spalte **Editor Version** muss `6000.3.x` stehen.

Unity importiert jetzt die Dateien aus dem Repository und kompiliert den Code. Dabei legt Unity für jede neue Datei unter `Assets/_Project/` eine `.meta`-Datei an. Das ist richtig so – sie kommen mit dem ersten Commit ins Repository.

Erscheint beim Öffnen der Dialog **„Enter Safe Mode?“**, gibt es Compiler-Fehler → **Enter Safe Mode** und Abschnitt 9 („Skripte kompilieren nicht“).

### 5.2 Das Fenster

Menü **Aetherfall > Projekt-Setup …** öffnet das Fenster „Projekt-Setup“. Am besten neben den Inspector andocken (Reiter mit der Maus ziehen).

| Element | Bedeutung |
|---|---|
| **✓** grün | erledigt |
| **✗** rot | offen – der Schritt erledigt es, oder die Zeile sagt, was du von Hand tun musst |
| **–** grau | unbekannt oder nur ein Hinweis (z. B. „noch nicht eingetragen – Empfehlung“) |
| **Ausführen** (je Schritt) | führt nur diesen Schritt aus. Jeder Schritt darf beliebig oft laufen und ändert nur, was fehlt. |
| **Alles ausführen** | führt alle Schritte in der Reihenfolge b → c → d → e → f → a aus (Pakete zuletzt, weil Unity danach neu kompiliert) |
| **Status aktualisieren** | liest alles neu, auch die Paketliste |
| **Protokoll** (unten) | jede Aktion mit Uhrzeit; dieselben Zeilen stehen mit `[Aetherfall-Setup]` in der Console. **Kopieren** legt das Protokoll in die Zwischenablage (praktisch für Rückfragen an Claude). |

Vor dem Löschen, Ersetzen oder Umbenennen fragt jeder Schritt in einem Dialog nach. Gelöschtes landet im **Papierkorb des Mac** und lässt sich von dort wiederherstellen.

### 5.3 Ablauf

Empfehlung: Zuerst in Schritt **b)** Firmen- und Produktnamen eintragen (siehe unten), dann **Alles ausführen** klicken. Die Dialoge erscheinen in dieser Reihenfolge:

**b) Editor- und Player-Einstellungen**

1. Vorher im aufgeklappten Schritt b) die Felder **Firmenname (Company Name)** und **Produktname (Product Name)** ausfüllen. Vorschlag: Produkt `Aetherfall` (Empfehlung aus [Offene Fragen, Frage 2 (c)](../Offene_Fragen.md)), Firma: dein eigener Name oder ein Label **ohne Sonderzeichen** (der Vorschlag `AetherfallStudio` ist nur ein Platzhalter).
   **Wichtig:** Beide Namen bestimmen den Speicherpfad der Spielstände (Windows: `%USERPROFILE%\AppData\LocalLow\<Firma>\<Produkt>`, macOS: unter `~/Library/Application Support/`). Nach dem ersten Build, der deinen Rechner verlässt, **nie mehr ändern** – sonst „verschwinden“ Spielstände.
2. Dialog **„Firmen- und Produktname jetzt festlegen?“** → **Übernehmen**.
3. Der Schritt setzt automatisch: Asset Serialization = **Force Text**, Version Control = **Visible Meta Files**, Enter Play Mode = **Reload Scene only** (Domain Reload aus), Zeilenenden neuer Skripte = **Unix**, Color Space = **Linear**, Api Compatibility Level = **.NET Standard 2.1**, Scripting Backend = **Mono**, **Use incremental GC** an, **Allow 'unsafe' Code** aus, Fullscreen Mode = **Fullscreen Window**, Grafik-API Windows = **Direct3D12, Direct3D11**. Unity importiert danach Texturen neu und kompiliert neu – kurz warten.
4. Zwei Zeilen bleiben vorerst ✗ und brauchen dich: **Active Input Handling** (Abschnitt 5.4) und – nur falls dort etwas steht – **Scripting Define Symbols** (Architektur 2.7 #43: Entwickler-Defines gehören in Build-Profile, nicht in die Player-Einstellungen).

**c) Ordnerstruktur anlegen** – kein Dialog. Legt alle Ordner aus Architektur 3.1 an (gut 100 Stück), dazu `Assets/ThirdParty/` und `ArtSource/` (neben `Assets/`, für Blender- und Photoshop-Quellen). Leere Ordner bekommen eine Datei `.gitkeep`, damit Git sie behält. Unity zeigt diese Datei nicht an.

**d) Template aufräumen**

1. Dialog **„Template aufräumen?“** listet, was passiert: `Assets/TutorialInfo`, `Assets/Readme.asset` und `Assets/Scenes/SampleScene.unity` kommen in den Papierkorb; der Inhalt von `Assets/Settings/` (URP-Assets, Renderer, Volume-Profile) wandert nach `Assets/_Project/Settings/Rendering/`; `Assets/InputSystem_Actions.inputactions` wandert nach `Assets/_Project/Settings/Input/`. → **Aufräumen**.
2. Ist die Beispielszene geöffnet und verändert, fragt Unity nach dem Speichern → **Don't Save**.

Verschieben über Unity behält die GUIDs. Deshalb bleiben URP-Pipeline, Qualitätsstufen und die projektweiten Input-Actions korrekt zugewiesen.

**e) Boot-Inhalte und Boot-Szene**

1. Legt in `Assets/_Project/Settings/Boot/` an: `LogSettings`, `LogInstaller`, `EventBusInstaller`, `GameStateInstaller`, `BootConfig` (Installer-Liste: Log → EventBus → GameState).
2. Legt `Assets/_Project/Scenes/Boot/Boot.unity` an: GameObject **GameBootstrapper** (Komponenten *Game Bootstrapper* mit Feld *Boot Config* und *Tick Runner*) und GameObject **DevTools** (Komponente *Game State Debug Overlay*). Die Szene bleibt danach geöffnet.
3. Dialog **„Szenenliste ersetzen?“** (die Liste enthält noch die gelöschte Beispielszene) → **Ersetzen**. Danach ist `Boot.unity` die einzige Szene mit Index 0 (**File > Build Profiles > Scene List**).

Vorhandene Assets überschreibt der Schritt nie. Fehlt in einer vorhandenen Boot-Szene etwas, fragt er vor dem Ergänzen.

**f) Prüfungen (nur lesen)** – ändert nichts, schreibt das Ergebnis ins Protokoll:

| Zeile | Erwartung | Wenn nicht |
|---|---|---|
| Unity-Version | 6000.3.x | Projekt im Hub mit 6000.3.x öffnen |
| URP ist aktive Render-Pipeline | ✓ (z. B. `PC_RPAsset`) | Projekt wurde nicht mit „Universal 3D“ angelegt → Abschnitt 3 neu |
| Qualitätsstufen nutzen URP | ✓ | **Edit > Project Settings > Quality** → je Stufe **Render Pipeline Asset** prüfen |
| Rendering Path: Forward+ | ✓ für alle Renderer | Project-Fenster: `Assets/_Project/Settings/Rendering/` → jedes Renderer-Asset (z. B. `PC_Renderer`, `Mobile_Renderer`) anklicken → Inspector **Rendering > Rendering Path = Forward+** |
| Git-Repository | ✓ | Abschnitt 4 |
| Git LFS | ✓ | `brew install git-lfs`, dann im Projektordner `git lfs install` |
| UnityYAMLMerge-Programm | ✓ mit Pfad | – (Hinweis) |
| UnityYAMLMerge in der lokalen Git-Konfiguration | ✓ | Befehle aus „Git-Befehle … anzeigen“ kopieren (Abschnitt 4.3) |

**a) Pakete installieren** (läuft als letzter Schritt)

1. Dialog **„Pakete entfernen?“** (Visual Scripting, Multiplayer Center) → **Entfernen**. Der Haken „Visual Scripting und Multiplayer Center entfernen“ in Schritt a) ist standardmäßig an; nimmst du ihn heraus, bleiben beide installiert.
2. Der Package Manager installiert die fehlenden Pakete: Input System, Cinemachine, ProBuilder, Terrain Tools, AI Navigation, Addressables, Timeline, Animation Rigging, Localization, Test Framework, Newtonsoft JSON und uGUI (enthält TextMeshPro). Das dauert je nach Internet einige Minuten; unten rechts läuft ein Fortschrittsbalken, danach kompiliert Unity neu.
3. Das Fenster liest die Paketliste danach selbst neu. Erwartung: alle Pakete ✓, Visual Scripting und Multiplayer Center „nicht installiert“.
4. Steht bei einem Paket **„Hinweis: weicht von der Planung ab“**, ist das kein Fehler: Das Werkzeug installiert die Version, die der Package Manager für 6.3 empfiehlt. Notiere die angezeigten Versionen (Protokoll → **Kopieren**) und gib sie Claude – sie werden in [Technik-Recherche, „Nicht verifiziert“](../Technik/03_Technik-Recherche.md#nicht-verifiziert) eingetragen.

Die Pakete stehen danach mit **exakter Version** in `Packages/manifest.json` (Architektur 1.4: keine Versionsbereiche).

### 5.4 Active Input Handling von Hand umstellen

Für diese Einstellung hat Unity keine öffentliche Schnittstelle, deshalb von Hand – **erst nachdem Schritt a) fertig ist** (das Input System muss installiert sein):

1. **Edit > Project Settings…** → links **Player**.
2. Reiter mit dem **Bildschirm-Symbol** (Windows, Mac, Linux) → **Other Settings** aufklappen → Abschnitt **Configuration**.
3. **Active Input Handling\*** → **Input System Package (New)** wählen.
4. Dialog „Unity editor restart required“ → **Apply** (bzw. **Yes**). Unity startet neu.
5. Danach **Aetherfall > Projekt-Setup …** → Schritt b) → Zeile **Active Input Handling** zeigt ✓.

### 5.5 TextMeshPro-Grundressourcen

**Window > TextMeshPro > Import TMP Essential Resources** → im Import-Dialog **Import**. Es entsteht `Assets/TextMesh Pro/` (von TMP erzwungene Ausnahme vom Ordnerschema, Architektur 3.1).

### 5.6 Speichern

**File > Save Project**. Erst dadurch stehen alle geänderten Einstellungen sicher in `ProjectSettings/`.

---

## 6. Manuelle Prüf-Checkliste

Alles, was das Werkzeug nicht setzen kann oder bewusst nicht anfasst (Architektur 2.3–2.7). Haken in der ersten Spalte zum Abhaken.

### 6.1 Jetzt (vor dem ersten Commit)

| ☐ | Architektur | Einstellung | Menüpfad | Wert |
|---|---|---|---|---|
| ☐ | 2.4 #20 | Active Input Handling | Abschnitt 5.4 | **Input System Package (New)**, Editor neu gestartet |
| ☐ | 2.3 #14 | Script-Editor | **Unity > Settings… > External Tools > External Script Editor** | Rider oder Visual Studio Code; Haken **Embedded packages** und **Local packages** bei „Generate .csproj files for“ |
| ☐ | 2.3 #15 | Auto Refresh | **Unity > Settings… > Asset Pipeline > Auto Refresh** | an (Standard) |
| ☐ | 2.3 #15 | Parallel Import | **Edit > Project Settings > Editor > Asset Pipeline > Parallel Import** | an (falls in 6.3 vorhanden – prüfen) |
| ☐ | 2.4 #16 | Version | **Edit > Project Settings > Player > Version** | `0.1.0` |
| ☐ | 2.4 #18 | Grafik-API Mac | **Player > Reiter Bildschirm-Symbol > Other Settings > Rendering > Auto Graphics API for Mac** | Liste enthält nur **Metal** (Standard) |
| ☐ | 2.4 #23b | Splash Screen | **Player > Splash Image > Splash Screen > Show Splash Screen** | aus (ab Unity 6 für Personal erlaubt) |
| ☐ | 2.5 #29 | Render Graph | **Player > Other Settings > Script Compilation > Scripting Define Symbols** | **kein** `URP_COMPATIBILITY_MODE` (das Werkzeug prüft das in Schritt b) |
| ☐ | 2.5 #30 | Zeit | **Edit > Project Settings > Time** | **Fixed Timestep** `0.02`, **Maximum Allowed Timestep** `0.1` |
| ☐ | 2.5 #33 | Audio | **Edit > Project Settings > Audio** | **Max Real Voices** `48`, **Max Virtual Voices** `256` |
| ☐ | 2.6 #35 | TMP Essentials | Abschnitt 5.5 | `Assets/TextMesh Pro/` vorhanden |
| ☐ | 2.6 #39 | Projektweite Input-Actions | **Edit > Project Settings > Input System Package > Project-wide Actions** | zeigt `InputSystem_Actions` (liegt nach Schritt d) in `Assets/_Project/Settings/Input/`; das eigene Asset `AetherfallInput` folgt in Phase 1, Schritt 1.7) |
| ☐ | 2.2 #9 | Template-Pakete | **Window > Package Manager > In Project** | kein „Visual Scripting“, kein „Multiplayer Center“ |
| ☐ | 2.1 #4 | GitHub-Budget | github.com > dein Profilbild > **Settings > Billing and licensing > Budgets and alerts** | Budget für Git LFS und Actions gesetzt. Laut [Status, Kurskorrektur](../Status.md#kurskorrektur-nach-antwort-1-solo-50-) **0 $**: keine Kosten, aber LFS sperrt bei Überschreitung bis Monatsende – Binärdateien klein halten |

### 6.2 Grafik: URP-Qualitätsstufen (Architektur 2.5 #24–#28)

Gehört zum Setup. Wenn die Zeit knapp ist, darf es als zweiter Commit kommen, aber vor dem nächsten Phase-1-Schritt.

1. Project-Fenster: `Assets/_Project/Settings/Rendering/` öffnen.
2. Renderer: `PC_Renderer` anklicken → **F2** → umbenennen in `UR_ForwardPlus`. Inspector: **Rendering > Rendering Path = Forward+**.
3. Pipeline-Assets: `PC_RPAsset` umbenennen in `URP_Hoch`. Dann `URP_Hoch` dreimal mit **Cmd+D** duplizieren und die Kopien `URP_Niedrig`, `URP_Mittel`, `URP_Ultra` nennen. In jedem: **Rendering > Renderer List** = `UR_ForwardPlus`; **Rendering > GPU Resident Drawer = Instanced Drawing**; **SRP Batcher** an (im Inspector ggf. über das Drei-Punkte-Menü „Show Additional Properties“ sichtbar machen). Die übrigen Werte kommen später aus [GDD 05, 3.7](../GDD/05_UI_Audio_Grafik_Barrierefreiheit.md).
4. **Edit > Project Settings > Graphics**: **Default Render Pipeline** = `URP_Mittel`. Weiter unten **Shader Stripping > BatchRendererGroup Variants = Keep All**.
5. **Edit > Project Settings > Quality**: vier Stufen `Niedrig`, `Mittel`, `Hoch`, `Ultra` (vorhandene Stufen umbenennen, fehlende mit **Add Quality Level** ergänzen, überzählige mit dem Papierkorb-Symbol löschen). Jede Stufe anklicken → **Render Pipeline Asset** = passendes URP-Asset. In der Tabelle oben in der Zeile **Default** (grüne Häkchen je Plattform): Mac/PC-Standalone = **Mittel**.
6. Die Mobile-Assets des Templates (`Mobile_RPAsset`, `Mobile_Renderer`) werden danach nicht mehr gebraucht und dürfen gelöscht werden, sobald keine Qualitätsstufe sie mehr nutzt.
7. **Aetherfall > Projekt-Setup … > f) Prüfen** → URP, Qualitätsstufen und Forward+ zeigen ✓.

> Hinweis zur Windows-Standardstufe „Hoch“ (Architektur 2.5 #28): Unity hat für Windows und Mac eine gemeinsame Standalone-Spalte. Die getrennte Vorgabe je Betriebssystem übernimmt später das Optionen-System beim ersten Start.

### 6.3 Später (mit dem jeweiligen System)

| Architektur | Was | Wann |
|---|---|---|
| 2.5 #31–#32 | Layer (**Edit > Project Settings > Tags and Layers**) und Physik-Matrix (**Edit > Project Settings > Physics > Settings > Reiter Shared > Layer Collision Matrix**, Tabelle 2.8) | mit dem Spielercontroller (Phase 1) |
| 2.6 #36, 2.7 #43 | Build-Profile `Mac_Dev`, `Mac_Release`, `Win_Dev`, `Win_Release` (**File > Build Profiles**) mit den Defines `AETHERFALL_DEV` usw. Unity 6 speichert neue Profile unter `Assets/Settings/Build Profiles/` – Schritt d) verschiebt sie beim nächsten Lauf nach `Assets/_Project/Settings/Build/` | spätestens mit dem ersten Windows-Mono-Build |
| 2.6 #37 | Localization-Einstellungen (**Edit > Project Settings > Localization > Create**, speichern in `Assets/_Project/Settings/Localization/`) | Phase 1, Optionen und Lokalisierung |
| 2.6 #38 | Addressables (**Window > Asset Management > Addressables > Groups > Create Addressables Settings**; Play Mode Script = **Use Asset Database**) | Phase 1, IDs und Content-Datenbank |
| 2.7 #41 | weitere Assembly Definitions aus Tabelle 3.3 | jeweils mit dem System, das sie füllt |

### 6.4 Notieren für „Nicht verifiziert“

Die [Technik-Recherche](../Technik/03_Technik-Recherche.md#nicht-verifiziert) listet Punkte, die erst im echten Editor prüfbar sind. Notiere beim Setup bitte und gib es Claude weiter:

- genaue Editor-Version (Unity Hub > Installs),
- Versionen von Addressables, Test Framework und den übrigen Paketen (Protokoll von Schritt a),
- welche Version von „Performance Testing“ der Package Manager anbietet (**Window > Package Manager > Unity Registry**, Suche „Performance“, nur ansehen),
- ob „Visible Meta Files“ vor Schritt b) schon gesetzt war (Protokoll von Schritt b: Steht dort „Version Control Mode = Visible Meta Files“, war es vorher nicht gesetzt).

---

## 7. Erster Commit

### 7.1 Was hinein gehört – und was nicht

| Gehört hinein | Gehört **nicht** hinein (ignoriert die `.gitignore`) |
|---|---|
| `Assets/` mit **allen `.meta`-Dateien** | `Library/` (Cache, wird neu erzeugt) |
| `Packages/manifest.json` und `Packages/packages-lock.json` | `Temp/`, `Logs/`, `obj/` |
| `ProjectSettings/` (alle Dateien) | `UserSettings/` (persönliche Editor-Einstellungen) |
| `.gitignore`, `.gitattributes` | `*.csproj`, `*.sln` (erzeugt die IDE) |
| `docs/`, `README.md` | `.DS_Store`, `.idea/`, `.vscode/` (außer `settings.json`) |
| `ArtSource/` und alle `.gitkeep`-Dateien | Builds (`Build/`, `Builds/`, `*.app`) |

**Regel für `.meta`-Dateien:** Jede Datei und jeder Ordner unter `Assets/` hat eine `.meta`-Datei mit einer GUID. Asset und `.meta` immer **zusammen** committen, nie einzeln löschen oder umbenennen. Dateien nur im Project-Fenster von Unity verschieben oder umbenennen, nicht im Finder.

### 7.2 Befehle

Unity vorher mit **File > Save Project** speichern und dann beenden (**Cmd+Q**), damit alle Dateien geschrieben sind.

```bash
cd ~/Projekte/Aetherfall
git status
git add -A
git status
git lfs status
```

Prüfen:

- `git status` nach `git add -A` zeigt unter **Changes to be committed** u. a. `Assets/…` (inklusive `.meta`), `Packages/manifest.json`, `Packages/packages-lock.json`, `ProjectSettings/ProjectVersion.txt` und viele `ProjectSettings/*.asset`.
- **Nicht** dabei: `Library/`, `Temp/`, `Logs/`, `UserSettings/`. Steht davon etwas da: `git reset` (nimmt alles wieder aus dem Commit-Vorrat, Dateien bleiben erhalten) und Abschnitt 9 „.gitignore greift nicht“.
- `git lfs status` listet unter **Objects to be committed** Binärdateien (z. B. die Schrift unter `Assets/TextMesh Pro/` als `LFS`). `.unity`, `.prefab`, `.asset` und `.meta` müssen dort als **Git** (nicht LFS) erscheinen oder fehlen.

Dann committen (Commit-Nachrichten auf Englisch, Architektur 15.3) und hochladen. Die Versionsnummer an deine Editor-Version anpassen:

```bash
git commit -m "chore(setup): Unity 6000.3.26f1 project, packages, settings, folders, boot scene"
git lfs ls-files
git check-attr -a Assets/_Project/Scenes/Boot/Boot.unity
git push
git tag setup-6000.3.26f1
git push origin setup-6000.3.26f1
```

Prüfen:

- `git lfs ls-files` listet **nur Binärdateien** (Schriften, Bilder, Audio). Keine `.meta`, `.unity`, `.prefab`, `.asset` (Architektur 2.9 #47). Eine leere Liste ist auch in Ordnung, falls noch keine Binärdateien im Projekt sind.
- `git check-attr` zeigt `diff: set`, `merge: unityyamlmerge`, `text: unset`.
- `git push` endet ohne Fehler; auf GitHub sind im Branch `claude/new-session-2ye8ds` jetzt `Packages/` und `ProjectSettings/` zu sehen.
- `git status` zeigt `nothing to commit, working tree clean`.

Gib Claude danach Bescheid („Setup gepusht“), damit der nächste Schritt auf deinem Stand aufbaut.

---

## 8. Fertig, wenn …

- [ ] **Aetherfall > Projekt-Setup …** zeigt bei **a) bis f)** jeweils **✓** (in f dürfen einzelne Hinweiszeilen „–“ zeigen).
- [ ] In Schritt b) ist **Active Input Handling** ✓ und der Editor wurde danach neu gestartet.
- [ ] Die Console (**Window > General > Console**) zeigt nach dem Neustart **keine roten Fehler**.
- [ ] `ProjectSettings/ProjectVersion.txt` nennt die installierte `6000.3.x`-Version.
- [ ] Die URP-Qualitätsstufen sind eingerichtet (6.2) oder als nächster Commit eingeplant.
- [ ] Der erste Commit ist gepusht, `git status` ist sauber, `git lfs ls-files` enthält nur Binärdateien, der Tag `setup-6000.3.x` ist gepusht.
- [ ] Weiter mit **[Anleitung 02: Test Phase 1, Schritt 1 (Fundament)](./02_Test_Phase1_Fundament.md)**: EditMode-Tests (alle grün) und Play Mode in `Boot.unity`.

---

## 9. Fehlerbehebung

| Problem | Ursache | Lösung |
|---|---|---|
| `command not found: brew` nach der Installation | Homebrew ist nicht im Suchpfad | Die zwei Zeilen aus 1.2 (`echo 'eval …' >> ~/.zprofile` und `eval …`) ausführen, Terminal neu öffnen |
| `zsh: command not found: #` | Kommentarzeile eingefügt | harmlos; nur die Befehlszeilen kopieren |
| `git: 'lfs' is not a git command` | Git LFS fehlt | `brew install git-lfs`, dann `git lfs install` (global) und im Projektordner noch einmal `git lfs install` |
| Bilder oder Schriften sind nach `git pull` kaputt; Inhalt beginnt mit `version https://git-lfs.github.com/spec/v1` | LFS war beim Holen nicht eingerichtet | `git lfs install`, dann `git lfs pull` |
| Push: `This repository is over its data quota` / LFS-Fehler | LFS-Kontingent oder Budget (0 $) erschöpft | GitHub > Settings > Billing prüfen; bis Monatsende keine großen Binärdateien committen |
| `Authentication failed` bei fetch/push | nicht bei GitHub angemeldet | `gh auth login` wiederholen, danach `gh auth setup-git` |
| `fatal: invalid reference: origin/claude/new-session-2ye8ds` | Branch noch nicht auf GitHub | `git branch -r` prüfen; Claude-Zugriff auf das Repo freischalten lassen (Abschnitt 2) |
| `untracked working tree files would be overwritten` | gleichnamige Datei liegt schon im Ordner | Abschnitt 4.2 |
| `Library/` oder `UserSettings/` erscheinen in `git status` | `.gitignore` fehlt (Checkout nicht gelaufen) | `ls -la` im Projektordner: `.gitignore` muss da sein; sonst Abschnitt 4.1 wiederholen |
| **Unity Hub findet den Editor nicht** / „Editor version not installed“ | Editor an anderem Ort oder falsche Version gewählt | **Unity Hub > Installs > Locate** → `/Applications/Unity/Hub/Editor/<Version>/Unity.app` wählen. In **Projects** beim Projekt die Spalte **Editor Version** anklicken und `6000.3.x` wählen |
| Hub fragt „Upgrade project?“ oder „Change Editor version?“ | Projekt wird mit anderer Version geöffnet | abbrechen, im Hub `6000.3.x` wählen |
| Mac meldet „Unity ist beschädigt“ | unvollständiger Download | Editor im Hub deinstallieren (**Installs** > Drei-Punkte-Menü > **Uninstall**) und neu installieren |
| **Pakete lösen nicht auf** (rote Meldungen wie `Cannot connect to Unity Package Manager local server`, `Unable to add package`, `No 'versions' key`) | keine Internetverbindung, Hub nicht angemeldet, Proxy/VPN, beschädigter Paket-Cache | Internet prüfen, im Hub angemeldet sein, VPN aus; Unity beenden, im Projektordner `rm -rf Library/PackageCache` (nur Cache, wird neu geladen), Unity neu öffnen, Schritt a) erneut ausführen. `Packages/manifest.json` nicht von Hand mit Tippfehlern versehen |
| Schritt a) bleibt bei „läuft …“ | Package Manager arbeitet noch oder hängt | warten; sonst **Window > Package Manager** öffnen (zeigt Fehler), Unity neu starten, im Fenster **Status aktualisieren** |
| **Skripte kompilieren nicht**, Menü **Aetherfall** fehlt, Safe-Mode-Dialog | Compiler-Fehler; das Setup-Werkzeug ist selbst ein Skript und erscheint erst, wenn alles kompiliert | **Window > General > Console** → den **ersten** roten Fehler lesen. Häufig: `NUnit`/`TestRunner` fehlt → **Window > Package Manager > Unity Registry > Test Framework > Install**; `Awaitable` unbekannt → falsche Unity-Version (muss 6000.x sein); Dateien fehlen → `git status` prüfen. Im Safe Mode ist das Menü nicht verfügbar – erst Fehler beheben |
| Gelbe Warnung `A meta data file (.meta) exists but its asset '…' can't be found` | Asset gelöscht, `.meta` übrig | die genannte `.meta`-Datei löschen (Finder: **Cmd+Shift+.** zeigt versteckte Dateien) |
| Warnung zu doppelten GUIDs (`GUID [...] for asset '…' conflicts with …`) | Datei samt `.meta` im Finder kopiert | Kopie in Unity löschen und über das Project-Fenster duplizieren (**Cmd+D**) |
| `.meta`-Dateien fehlen auf GitHub | nicht mit committet | `git add -A` erfasst sie; nie nur `git add Assets/*.cs` verwenden |
| Schritt b) zeigt **Active Input Handling ✗**, obwohl umgestellt | Editor nicht neu gestartet | Unity beenden und neu öffnen |
| Schritt f) zeigt **Forward+ ✗** | Renderer steht auf Forward/Deferred | Abschnitt 5.3, Tabelle bei f) |
| Schritt e) meldet „existiert, ist aber kein …“ | an diesem Pfad liegt eine andere Datei | Datei prüfen und umbenennen; das Werkzeug überschreibt nichts |
| Fenster zeigt „Play Mode ist aktiv“ | Setup läuft nur im Edit Mode | Play Mode beenden |

---

## 10. Dateien dieses Schritts

Nach §32.3: wohin jede Datei gehört und ob sie an ein GameObject kommt. **Keine** dieser Dateien kommt an ein GameObject – das Setup-Werkzeug ist ein Editor-Fenster.

| Datei | Ordner | Zweck |
|---|---|---|
| `.gitignore` | Repo-Wurzel | offizielle Unity-Vorlage (`github/gitignore`, unverändert) plus Aetherfall-Ergänzungen (Architektur 2.9) |
| `.gitattributes` | Repo-Wurzel | Zeilenenden, Smart Merge für Unity-YAML, Git LFS für Binärdateien (geprüfte Fassung von Architektur 2.9, Änderungen im Kopfkommentar) |
| `Aetherfall.EditorTools.Core.asmdef` | `Assets/_Project/Scripts/Editor/Core/` | Assembly Nr. 33, nur Editor, referenziert `Aetherfall.Core` und `Aetherfall.DevTools` |
| `ProjectSetupWindow.cs` | `Assets/_Project/Scripts/Editor/Core/` | das Fenster **Aetherfall > Projekt-Setup …** |
| `SetupStep.cs`, `SetupStatus.cs`, `SetupStatuses.cs`, `SetupCheckItem.cs`, `SetupLog.cs`, `SetupPaths.cs`, `AssetFolderUtility.cs` | `Assets/_Project/Scripts/Editor/Core/` | Grundgerüst: Schritt-Basis, Status ✓/✗/–, Protokoll, feste Pfade, Ordner-Hilfen |
| `PackageSetupStep.cs`, `PackageCatalog.cs`, `PackagePlanner.cs`, `PackagePlan.cs`, `PackageRequirement.cs`, `InstalledPackage.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt a) Pakete (Planung als reine Logik) |
| `ProjectSettingsSetupStep.cs`, `SettingRule.cs`, `ProductIdentity.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt b) Einstellungen, Firmen-/Produktname |
| `FolderSetupStep.cs`, `ProjectFolderLayout.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt c) Ordner aus Architektur 3.1 |
| `TemplateCleanupStep.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt d) Template aufräumen |
| `BootContentSetupStep.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt e) Boot-Assets, Boot-Szene, Szenenliste |
| `ProjectChecksStep.cs`, `GitRepositoryInspector.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt f) Prüfungen (URP, Forward+, Git, LFS, UnityYAMLMerge) |
| `01_Projekt-Setup.md` | `docs/Anleitungen/` | diese Anleitung |

**Was das Werkzeug erzeugt** (im Editor, mit eigenen GUIDs): die Ordner aus Architektur 3.1 mit `.gitkeep`, `ArtSource/`, die Assets in `Assets/_Project/Settings/Boot/`, `Assets/_Project/Scenes/Boot/Boot.unity` und die Einträge in `ProjectSettings/`. Szenen, Assets und `.meta`-Dateien werden bewusst nicht von Hand ins Repository geschrieben.

**Bewusste Entscheidungen:**

| Thema | Entscheidung | Grund |
|---|---|---|
| Paketversionen | Installation ohne Versionsangabe, Unity trägt die exakte Version ins Manifest ein; vorhandene Pakete werden nie geändert | Architektur 1.4: maßgeblich ist, was der Package Manager unter 6.3 als „released“ anbietet; Abweichungen zur Planung werden nur gemeldet |
| Indirekt installierte Pakete | werden mit ihrer aktuellen Version als direkte Abhängigkeit eingetragen (`name@version`) | kein unbemerkter Versionswechsel |
| `TickRunner` | am GameObject `GameBootstrapper` (kein eigenes GameObject) | so beschreiben es `TickRunner.cs` und Anleitung 02, Abschnitt 3 |
| Löschen | über den Papierkorb des Mac (`AssetDatabase.MoveAssetToTrash`) | wiederherstellbar |
| Prüfung der Boot-Szene | über die Abhängigkeiten der Szene, ohne sie zu öffnen | der Status lässt die geöffnete Szene unangetastet |
| URP-Prüfung | über den Typnamen, ohne Assembly-Referenz auf URP; Rendering Path über die öffentliche Eigenschaft `renderingMode` | das Editor-Werkzeug kompiliert auch, bevor Pakete installiert sind |
| Git-Prüfungen | lesen Dateien (`.git/config`, Hooks, `~/.gitconfig`), starten kein `git` | Unity sieht auf dem Mac den Homebrew-Pfad oft nicht |
| Active Input Handling | nur geprüft (über die Compiler-Symbole `ENABLE_INPUT_SYSTEM`/`ENABLE_LEGACY_INPUT_MANAGER`), nicht gesetzt | keine öffentliche Unity-API; keine Hacks über interne Felder |
