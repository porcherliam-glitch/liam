# Anleitung 01: Projekt-Setup (Phase 0, Schritt 4)

> Für Einsteiger auf einem MacBook mit Apple Silicon · Kosten: 0 € · Stand: 2026-10-13 · Bezug: [Master-Prompt §31 Phase 0.4, §32.4](../00_Master-Prompt.md) · [Architektur, Abschnitt 2 (Projekt-Setup-Checkliste)](../Technik/01_Architektur.md#2-projekt-setup-checkliste) · [Architektur 3.1 (Ordner)](../Technik/01_Architektur.md#31-ordnerstruktur)

Diese Anleitung bringt dich vom Mac ohne Unity bis zu einem fertig eingerichteten Unity-Projekt, das auf GitHub liegt. Die Aufgaben sind so verteilt: **Claude schreibt Code und Anleitungen, du klickst in Unity.** Claude kann Unity nicht selbst starten. Deshalb öffnest du das Projekt, klickst die genannten Knöpfe, drückst Play und meldest zurück, was du siehst. Den größten Teil der Einrichtung erledigt das Unity-Werkzeug **Aetherfall > Projekt-Setup …** mit einem einzigen Knopf.

| | |
|---|---|
| **Kosten** | 0 €. Unity Personal, GitHub Desktop und GitHub Free sind kostenlos. Du gibst nirgends Zahlungsdaten ein. |
| **Zeit** | etwa 2 Stunden. Das meiste davon ist Wartezeit für Downloads. |
| **Speicherplatz** | rund 30 GB frei (Unity allein braucht mehrere GB) |
| **Terminal** | ein einziger Befehl (Schritt 4.1). Mit dem Finder-Weg (4.2) brauchst du gar keinen. |

---

## Inhalt

0. [Bevor du anfängst](#0-bevor-du-anfängst)
1. [Kostenlose Programme installieren](#1-kostenlose-programme-installieren)
2. [Das Repository holen](#2-das-repository-holen)
3. [Vorlagen-Projekt erzeugen](#3-vorlagen-projekt-erzeugen)
4. [Vorlage in das Repository kopieren](#4-vorlage-in-das-repository-kopieren)
5. [Projekt in Unity öffnen](#5-projekt-in-unity-öffnen)
6. [Setup-Werkzeug ausführen](#6-setup-werkzeug-ausführen)
7. [Play-Test](#7-play-test)
8. [Ergebnis an Claude zurückmelden (Commit und Push)](#8-ergebnis-an-claude-zurückmelden-commit-und-push)
9. [Updates von Claude holen](#9-updates-von-claude-holen)
10. [Fehlerbehebung](#10-fehlerbehebung)
- [Anhang A: Für Fortgeschrittene (UnityYAMLMerge, Kommandozeile)](#anhang-a-für-fortgeschrittene-unityyamlmerge-kommandozeile)
- [Anhang B: Was das Werkzeug noch nicht erledigt](#anhang-b-was-das-werkzeug-noch-nicht-erledigt)
- [Anhang C: Dateien dieses Schritts](#anhang-c-dateien-dieses-schritts)

---

## 0. Bevor du anfängst

### 0.1 Mini-Wörterbuch

| Begriff | Bedeutung |
|---|---|
| **Unity Hub** | Startprogramm von Unity. Es installiert Unity-Versionen und öffnet Projekte. |
| **Unity** (der Editor) | das eigentliche Programm, in dem das Spiel entsteht |
| **Projekt** | ein Ordner mit allem, was zum Spiel gehört. Wichtig sind die Unterordner `Assets` (Inhalte), `Packages` (Paketliste) und `ProjectSettings` (Einstellungen). |
| **Vorlage** (engl. Template) | ein fertig eingerichtetes Startprojekt von Unity. Wir nutzen die Vorlage „Universal 3D“. |
| **Paket** (engl. Package) | ein Zusatzbaustein für Unity, z. B. für Kameras oder die Eingabe |
| **Console** | Unity-Fenster mit Meldungen: weiß = Information, gelb = Warnung, rot = Fehler |
| **Project, Hierarchy, Inspector** | drei Unity-Fenster: **Project** zeigt die Dateien des Projekts, **Hierarchy** die Objekte der offenen Szene, **Inspector** die Einstellungen dessen, was du gerade angeklickt hast |
| **Szene** | eine Spielumgebung in Unity, gespeichert als `.unity`-Datei. Unsere Start-Szene heißt `Boot`. |
| **Kompilieren** | Unity übersetzt den Code in ein lauffähiges Programm. Das dauert Sekunden bis Minuten; unten rechts im Unity-Fenster läuft dann eine Anzeige. |
| **Play Mode** | Unity startet das Spiel direkt im Editor (Knopf ▶) |
| **Safe Mode** | Notbetrieb von Unity, wenn der Code Fehler enthält |
| **Build** | eine fertige, startbare Spielversion (z. B. für Mac oder Windows) |
| **GitHub** | Webseite, auf der die Projektdateien online liegen. Dort arbeitet auch Claude. |
| **Repository** (kurz Repo) | der Projektordner samt Versionsgeschichte. Unseres heißt `porcherliam-glitch/liam`. |
| **Branch** | eine eigene Arbeitslinie im Repo. Wir arbeiten auf `claude/new-session-2ye8ds`. |
| **Commit** | ein gespeicherter Zwischenstand mit kurzer Beschreibung, zunächst nur auf deinem Mac |
| **Push / Pull / Fetch** | Push lädt deine Commits zu GitHub hoch. Pull holt neue Commits (z. B. von Claude) herunter. Fetch fragt nur nach, ob es Neues gibt. |
| **Git LFS** | Zusatz für große Dateien wie Bilder und Sounds. Steckt schon in GitHub Desktop. |
| **`.meta`-Datei** | Unity legt zu jeder Datei eine `.meta`-Datei an. Sie ist der „Ausweis“ der Datei mit einer eindeutigen Nummer (GUID) und gehört immer mit ins Repo. |
| **Terminal** | Mac-Programm, in das man Befehle tippt. Du brauchst es höchstens einmal. |

### 0.2 So liest du diese Anleitung

- **A > B > C** heißt: auf A klicken, dann auf B, dann auf C (meist im Menü ganz oben am Bildschirm).
- Der Finder ist deutsch, die Pfade in dieser Anleitung sind englisch. **Dokumente** im Finder ist derselbe Ordner wie `~/Documents`, **Programme** ist `Applications`. Das Zeichen `~` steht für deinen Benutzerordner.
- Unity Hub, Unity und GitHub Desktop sind englisch. Knopf- und Menünamen stehen hier genau so, wie sie dort heißen.
- Fragt macOS, ob ein Programm (Unity Hub, Unity, Terminal, GitHub Desktop) auf den Ordner **Dokumente** zugreifen darf: **Erlauben** bzw. **OK**.
- Sieht etwas anders aus als beschrieben oder erscheint eine rote Meldung, rate nicht. Mach ein Bildschirmfoto und schick es Claude ([Abschnitt 8.3](#83-wenn-etwas-nicht-klappt-fehler-an-claude-schicken)).

---

## 1. Kostenlose Programme installieren

### 1.1 Unity Hub und Unity-Konto

1. Im Browser **unity.com/download** öffnen und den Download für den Mac starten (bei der Auswahl **Apple silicon** nehmen, falls gefragt).
   **Du siehst danach:** eine Datei `UnityHubSetup….dmg` im Ordner **Downloads**.
2. Die `.dmg`-Datei doppelklicken. Im Fenster, das aufgeht, das Symbol **Unity Hub** auf den Ordner **Applications** ziehen.
   **Du siehst danach:** Unity Hub im Finder unter **Programme**.
3. Unity Hub starten: **Cmd + Leertaste** drücken, `Unity Hub` tippen, Enter. Fragt macOS, ob du ein Programm aus dem Internet öffnen willst: **Öffnen**.
   **Du siehst danach:** das Hub-Fenster mit einem Anmeldeknopf.
4. **Sign in** klicken und dich im Browser mit deinem Unity-Konto anmelden. Hast du keines: **Create account** (kostenlos, danach die E-Mail bestätigen). Fragt der Browser, ob er Unity Hub öffnen darf: erlauben.
   **Du siehst danach:** oben links im Hub dein Konto-Symbol statt des Anmeldeknopfs.
5. Lizenz prüfen: Der Hub aktiviert die kostenlose Lizenz „Personal“ meist von selbst. Zur Kontrolle oben links auf das Zahnrad (Settings) klicken, dann **Licenses**. Steht dort keine Lizenz: **Add license** > **Get a free personal license** > **Agree and get personal edition license**.
   **Du siehst danach:** unter **Licenses** eine Lizenz „Personal“.
6. Bietet der Hub beim ersten Start an, eine Unity-Version zu installieren: nur annehmen, wenn die Nummer mit **6000.3** beginnt (das ist Unity 6.3 LTS; LTS heißt „Long Term Support“, also lange gepflegt). Sonst den Vorschlag überspringen, die richtige Version kommt in 1.2.
   **Du siehst danach:** das normale Hub-Fenster mit **Projects** und **Installs** links.

### 1.2 Unity 6.3 LTS installieren

1. Im Hub links **Installs** klicken, dann oben rechts **Install Editor**.
   **Du siehst danach:** eine Liste mit den Reitern **Official releases**, **Pre-releases** und **Archive**.
2. Reiter **Official releases**: beim Eintrag **Unity 6.3 (LTS)** mit der höchsten Nummer `6000.3.…` auf **Install** klicken. Fragt der Hub nach „Apple silicon“ oder „Intel“: **Apple silicon**.
   **Du siehst danach:** die Liste der Zusatzmodule („Add modules“).
3. Genau diese zwei Haken setzen:
   - **Mac Build Support (IL2CPP)**
   - **Windows Build Support (Mono)**

   Alle anderen Haken bleiben aus (Android, iOS, Web, Linux, Sprachpakete, Visual Studio). „Documentation“ darfst du dazunehmen, musst aber nicht. Dann **Continue** bzw. **Install** klicken und Lizenzbedingungen bestätigen, falls gefragt.
   **Du siehst danach:** einen Fortschrittsbalken bei **Installs**. Am Ende steht dort `6000.3.…` mit dem Zusatz **LTS**.

> Warum diese Module: Damit lassen sich später Spielversionen für Mac und Windows bauen. „IL2CPP“ und „Mono“ sind zwei Arten, wie Unity den Code für die fertige Spielversion übersetzt. Windows-Versionen mit IL2CPP lassen sich nur auf einem Windows-PC bauen, deshalb auf dem Mac für Windows „Mono“ (Architektur 1.3).

### 1.3 GitHub Desktop

1. Im Browser **desktop.github.com** öffnen und **Download for macOS** klicken.
   **Du siehst danach:** GitHub Desktop (oder eine `.zip`-Datei) im Ordner **Downloads**.
2. Eine `.zip`-Datei doppelklicken, damit sie entpackt wird. Dann **GitHub Desktop** in den Ordner **Programme** ziehen und von dort starten. Frage von macOS: **Öffnen**.
   **Du siehst danach:** „Welcome to GitHub Desktop“.
3. **Sign in to GitHub.com** klicken. Im Browser mit **dem GitHub-Konto anmelden, dem das Repo `porcherliam-glitch/liam` gehört**. Erscheint **Authorize desktop**: klicken. Fragt der Browser, ob er GitHub Desktop öffnen darf: erlauben.
   **Du siehst danach:** in GitHub Desktop die Seite **Configure Git**.
4. Bei **Configure Git** den Vorschlag (Name und E-Mail deines GitHub-Kontos) übernehmen und **Finish** klicken.
   **Du siehst danach:** das Hauptfenster von GitHub Desktop.

GitHub Desktop bringt Git und Git LFS selbst mit und richtet Git LFS bei jedem Start ein. Homebrew und Terminal-Befehle brauchst du dafür nicht.

---

## 2. Das Repository holen

1. In GitHub Desktop: **File > Clone Repository…**, dann Reiter **GitHub.com**.
   **Du siehst danach:** das Fenster „Clone a Repository“ mit einer Liste deiner Repos.
2. Ins Suchfeld `liam` tippen und **porcherliam-glitch/liam** anklicken. Das Feld **Local Path** zeigt `/Users/<dein Name>/Documents/GitHub/liam` – so lassen. Dann **Clone** klicken.
   **Du siehst danach:** einen Fortschritt, dann das Repo im Hauptfenster. Erscheint das Fenster **Initialize Git LFS** („This repository uses Git LFS …“): auf **Initialize Git LFS** klicken.
3. Oben in der Mitte auf **Current Branch** klicken, ins Suchfeld `new-session` tippen und **claude/new-session-2ye8ds** anklicken. (Der Eintrag kann auch als `origin/claude/new-session-2ye8ds` erscheinen – dann diesen nehmen.)
   **Du siehst danach:** unter **Current Branch** steht `claude/new-session-2ye8ds`.
4. Zur Kontrolle **Repository > Show in Finder** klicken.
   **Du siehst danach:** ein Finder-Fenster **Dokumente > GitHub > liam** mit den Ordnern `Assets` und `docs` und der Datei `README.md`. Im Ordner `Assets` liegt nur `_Project`.

Fehlt `Assets/_Project`, steht noch der falsche Branch. Dann Punkt 3 wiederholen.

---

## 3. Vorlagen-Projekt erzeugen

Unity soll für deine genaue Unity-Version die passenden Grafik-Einstellungen (URP, die Render-Pipeline von Unity) und Paketversionen erzeugen. Dafür legst du ein Wegwerf-Projekt aus der Vorlage an. Drei Teile davon kopierst du in Schritt 4 ins Repo, den Rest brauchst du nicht mehr.

1. Im Unity Hub links **Projects** klicken, dann oben rechts **New project**.
   **Du siehst danach:** die Vorlagen-Auswahl.
2. Ganz oben bei **Editor Version** deine `6000.3.…` wählen.
   **Du siehst danach:** die Vorlagen für diese Version.
3. Die Vorlage **Universal 3D** anklicken. Steht rechts **Download template**, zuerst darauf klicken und warten.
   **Du siehst danach:** rechts die Felder für Name und Speicherort.
4. Rechts ausfüllen:
   - **Project name:** `AetherfallVorlage` (genau so, ohne Leerzeichen)
   - **Location:** auf das Ordner-Symbol klicken und **Dokumente** wählen
   - **Use Unity Version Control:** aus
   - Gibt es eine Unity-Cloud-Option (z. B. den Haken „Connect to Unity Cloud“ oder eine Auswahl ohne Cloud): ausschalten bzw. die Variante ohne Cloud wählen. Lässt sie sich nicht ausschalten, ist das kein Problem – einfach weiter.

   **Du siehst danach:** als Speicherort `/Users/<dein Name>/Documents`.
5. **Create project** klicken.
   **Du siehst danach:** Unity startet und importiert. Nach einigen Minuten ist der Editor offen und zeigt eine Beispielszene.
6. Warten, bis unten rechts im Unity-Fenster kein Fortschritt mehr läuft. Dann Unity beenden: **Unity > Quit Unity** (Cmd + Q). Fragt Unity nach dem Speichern: **Don't Save**.
   **Du siehst danach:** Unity ist geschlossen. Im Finder gibt es **Dokumente > AetherfallVorlage** mit den Ordnern `Assets`, `Library`, `Logs`, `Packages`, `ProjectSettings` und `UserSettings`.

---

## 4. Vorlage in das Repository kopieren

Unity muss dabei geschlossen sein. Kopiert werden genau drei Dinge:

| Aus `Dokumente/AetherfallVorlage/` | Nach `Dokumente/GitHub/liam/` | Was es ist |
|---|---|---|
| der **Inhalt** von `Assets` | in den vorhandenen Ordner `Assets` (neben `_Project`) | Beispielinhalte und Grafik-Einstellungen der Vorlage. Das Setup-Werkzeug räumt sie in Schritt 6 auf. |
| der Ordner `Packages` | als neuer Ordner `Packages` | Paketliste mit den passenden Versionen |
| der Ordner `ProjectSettings` | als neuer Ordner `ProjectSettings` | Projekteinstellungen, darin auch die Unity-Version |

**Nicht** kopieren: `Library`, `Logs`, `UserSettings`. Das sind Zwischenspeicher, die Unity selbst neu anlegt.

Wähle **einen** der beiden Wege.

### 4.1 Mit dem Terminal (empfohlen, ein Befehl)

1. Terminal öffnen: **Cmd + Leertaste**, `Terminal` tippen, Enter.
   **Du siehst danach:** ein Fenster mit einer Zeile, die auf `%` endet.
2. Diese **eine** Zeile vollständig kopieren, im Terminal einfügen (Cmd + V) und Enter drücken:

   ```
   cd ~/Documents/GitHub/liam && rsync -a ~/Documents/AetherfallVorlage/Assets ~/Documents/AetherfallVorlage/Packages ~/Documents/AetherfallVorlage/ProjectSettings ./
   ```

   Fragt macOS, ob das Terminal auf **Dokumente** zugreifen darf: **Erlauben** (danach den Befehl noch einmal einfügen und Enter drücken).
   **Du siehst danach:** keine Meldung, nur eine neue Zeile mit `%`. Genau so soll es sein.
3. Terminal beenden (Cmd + Q).
   **Du siehst danach:** nichts mehr vom Terminal. Weiter mit [4.3](#43-prüfen).

**Was der Befehl tut:**

- `cd ~/Documents/GitHub/liam` wechselt in den Repo-Ordner. Gibt es ihn nicht, bricht der Befehl mit `no such file or directory` ab und kopiert nichts.
- `&&` bedeutet: den zweiten Teil nur ausführen, wenn der erste geklappt hat.
- `rsync -a` kopiert die drei Ordner mit allen Unterordnern und Dateien in den aktuellen Ordner `./` (also ins Repo). Hinter den drei Quellordnern steht absichtlich **kein** Schrägstrich: Dann entstehen im Repo die Ordner `Assets`, `Packages` und `ProjectSettings`, und der Inhalt von `Assets` wird mit dem vorhandenen `Assets`-Ordner **zusammengeführt**. rsync löscht dabei nichts. `Assets/_Project` bleibt unverändert.
- Die Pfade enthalten keine Leerzeichen, deshalb braucht der Befehl keine Anführungszeichen. Hast du in Schritt 2 oder 3 einen anderen Ort oder Namen gewählt, passt der Befehl nicht. Dann frag Claude nach einer angepassten Zeile.

**Mögliche Meldungen:**

| Meldung | Bedeutung und Lösung |
|---|---|
| `cd: no such file or directory: …/GitHub/liam` | Das Repo liegt nicht in **Dokumente > GitHub > liam**. Schritt 2 prüfen. |
| `rsync: … No such file or directory` | Die Vorlage liegt nicht in **Dokumente > AetherfallVorlage** oder ist anders geschrieben. Schritt 3 prüfen. |
| `Operation not permitted` | macOS hat den Zugriff verweigert. **Systemeinstellungen > Datenschutz & Sicherheit > Dateien und Ordner > Terminal > Ordner „Dokumente“** einschalten und den Befehl wiederholen. |

### 4.2 Alternative: mit dem Finder (ohne Terminal)

1. Zwei Finder-Fenster öffnen (im Finder Cmd + N). Im ersten **Dokumente > AetherfallVorlage** öffnen, im zweiten **Dokumente > GitHub > liam**.
   **Du siehst danach:** links die Vorlage, rechts das Repo.
2. Links den Ordner **Assets** per Doppelklick **öffnen**. Mit **Cmd + A** alles darin markieren (auch die `.meta`-Dateien) und mit **Cmd + C** kopieren.
   **Du siehst danach:** alle Einträge in der Vorlage blau markiert.
3. Rechts den Ordner **Assets** per Doppelklick **öffnen** (darin liegt `_Project`) und **Cmd + V** drücken.
   **Du siehst danach:** rechts neben `_Project` die Vorlagen-Inhalte (z. B. `Scenes`, `Settings`, `TutorialInfo`, `Readme.asset`), jeweils mit `.meta`-Datei.
4. Links zurück in den Ordner **AetherfallVorlage**. **Packages** anklicken, mit gedrückter Cmd-Taste zusätzlich **ProjectSettings** anklicken, Cmd + C. Rechts zurück in den Ordner **liam** (nicht in `Assets`) und Cmd + V.
   **Du siehst danach:** in **liam** die Ordner `Assets`, `docs`, `Packages`, `ProjectSettings`.

> **Achtung:** Kopiere niemals den **ganzen Ordner** `Assets` in den Ordner `liam`. Fragt der Finder „Ein Objekt mit dem Namen „Assets“ existiert bereits … ersetzen?“, klicke **Abbrechen** bzw. **Stopp**. „Ersetzen“ würde `Assets/_Project` mit dem ganzen Code löschen.

### 4.3 Prüfen

1. Im Finder **Dokumente > GitHub > liam** öffnen.
   **Du siehst danach:** die Ordner `Assets`, `docs`, `Packages`, `ProjectSettings` und `README.md`. In `Assets` liegen `_Project` und daneben die Vorlagen-Inhalte (z. B. `Scenes`, `Settings`, `TutorialInfo`, `Readme.asset`, `InputSystem_Actions.inputactions`, jeweils mit `.meta`).
2. Zu GitHub Desktop wechseln.
   **Du siehst danach:** links unter **Changes** sehr viele neue Dateien. Das ist richtig. **Noch nicht committen** – das kommt erst in Schritt 8, nachdem Unity aufgeräumt hat.

---

## 5. Projekt in Unity öffnen

1. Im Unity Hub links **Projects** klicken. Oben rechts beim Knopf **Add** auf den kleinen Pfeil klicken und **Add project from disk** wählen.
   **Du siehst danach:** ein Fenster zur Ordnerauswahl.
2. **Dokumente > GitHub > liam** einmal anklicken (nicht hineingehen) und **Öffnen** (bzw. **Open**) klicken.
   **Du siehst danach:** das Projekt **liam** in der Projektliste, daneben die Editor-Version `6000.3.…`. Das Projekt **AetherfallVorlage** steht auch in der Liste – das ist die Vorlage, **nicht** öffnen.
3. Nur falls bei **liam** statt der Version ein Warnsymbol oder „not installed“ steht: auf die Versionsangabe klicken und die installierte `6000.3.…` wählen.
   **Du siehst danach:** bei **liam** die Version `6000.3.…` ohne Warnsymbol.
4. Auf **liam** klicken.
   **Du siehst danach:** Unity startet und importiert alle Dateien (beim ersten Mal 5 bis 20 Minuten). Danach ist der Editor offen, und in der Menüleiste ganz oben gibt es den Eintrag **Aetherfall**.

Erscheint beim Öffnen das Fenster **Enter Safe Mode?**, enthält der Code einen Fehler: siehe [Abschnitt 10](#10-fehlerbehebung), Zeile „Safe Mode“.

---

## 6. Setup-Werkzeug ausführen

### 6.1 Fenster öffnen

1. Menü **Aetherfall > Projekt-Setup …** klicken.
   **Du siehst danach:** das Fenster **Projekt-Setup** mit den Schritten a) bis f), dem Knopf **Alles ausführen** oben und dem **Protokoll** unten. Zieh das Fenster ruhig größer.

| Zeichen | Bedeutung |
|---|---|
| **✓** grün | erledigt |
| **✗** rot | noch offen |
| **–** grau | nur ein Hinweis oder nicht prüfbar – kein Problem |

| Schritt im Fenster | Was er tut |
|---|---|
| a) Pakete installieren | installiert die Pakete aus Architektur 1.4 und entfernt zwei unnötige Vorlagen-Pakete |
| b) Editor- und Player-Einstellungen | setzt die Projekteinstellungen aus Architektur 2.3/2.4 |
| c) Ordnerstruktur anlegen | legt alle Projektordner an |
| d) Template aufräumen | wirft die Beispielinhalte der Vorlage in den Papierkorb und verschiebt ihre Einstellungen nach `Assets/_Project/Settings/` |
| e) Boot-Inhalte und Boot-Szene | legt die Start-Szene `Assets/_Project/Scenes/Boot/Boot.unity` und ihre Einstellungsdateien an |
| f) Prüfungen (nur lesen) | prüft Unity-Version, Grafik und Git, ändert nichts |

Jeder Schritt hat rechts einen eigenen Knopf (**Ausführen**, bei f **Prüfen**). Du brauchst sie normalerweise nicht – **Alles ausführen** reicht.

### 6.2 Optional: Firmen- und Produktname

Im Schritt b) stehen die Felder **Firmenname (Company Name)** = `AetherfallStudio` und **Produktname (Product Name)** = `Aetherfall`. Du kannst beide so lassen. Möchtest du deinen eigenen Namen als Firmenname: einfach ins Feld tippen, ohne die Zeichen `/ \ : * ? " < > |`.

Die beiden Namen bestimmen, in welchem Ordner später die Spielstände liegen. Ändern ist kein Problem, solange noch keine Spielversion an andere Leute gegangen ist. Danach nie mehr ändern.

### 6.3 Alles ausführen

1. Oben auf **Alles ausführen** klicken.
   **Du siehst danach:** die Frage **Alle Schritte ausführen?** Dort **Ausführen** klicken.
2. Jetzt erscheinen nacheinander einige Fragen. Nicht jede kommt jedes Mal. Klicke jeweils:

   | Fenster (Titel) | Klicken | Was passiert |
   |---|---|---|
   | **Firmen- und Produktname** („Firmen- und Produktname jetzt festlegen?“) | **Übernehmen** | trägt die Namen aus 6.2 ein |
   | **Template aufräumen?** | **Aufräumen** | Beispielinhalte in den Papierkorb (wiederherstellbar), Einstellungen nach `Assets/_Project/Settings/` |
   | **Scene(s) Have Been Modified** (von Unity) | **Don't Save** | die Beispielszene wird nicht mehr gebraucht |
   | **Szenenliste ersetzen?** | **Ersetzen** | `Boot.unity` wird die einzige Start-Szene |
   | **Boot-Szene ergänzen?** oder **Installer-Liste ersetzen?** (nur bei einem zweiten Lauf) | **Ergänzen** bzw. **Ersetzen** | fehlende Teile der Boot-Szene werden nachgetragen |
   | **Pakete entfernen?** (Visual Scripting, Multiplayer Center) | **Entfernen** | zwei unnötige Vorlagen-Pakete fliegen raus |
   | **Warning** („… Do you want to enable the backends? Doing so will \*RESTART\* the editor.“) | **Yes** | schaltet die neue Eingabe (Input System) ein. Unity startet neu. |

3. Warten. Zuerst erledigt das Werkzeug b) bis f). Schritt a) (Pakete) startet erst danach von selbst, sobald Unity mit dem Kompilieren fertig ist – oben im Fenster steht solange „Schritt a) Pakete startet automatisch, sobald Unity mit dem Kompilieren fertig ist …“. Dann lädt der Package Manager die Pakete (einige Minuten), und Unity kompiliert neu, eventuell mehrmals. Im Fenster stehen solange **läuft …** und „Unity kompiliert bzw. importiert gerade. Bitte warten …“. Fenster offen lassen und nichts anklicken.
   **Du siehst danach:** keine Fortschrittsbalken mehr. Im Protokoll steht eine Zeile, die mit **„a) abgeschlossen:“** beginnt, z. B. „a) abgeschlossen: installiert com.unity.cinemachine@3.…, com.unity.probuilder@6.…, … · entfernt com.unity.visualscripting, com.unity.multiplayer.center.“ Hat Unity zwischendurch neu geladen, steht davor „a) Unity hat neu geladen, während eine Paketänderung lief …“ – das ist normal, das Fenster prüft dann selbst weiter. Fehlt die Zeile „a) abgeschlossen“, weil Unity nach **Yes** im Input-System-Fenster neu gestartet hat: auch normal, weiter mit Punkt 4.
4. Hat Unity neu gestartet (nach **Yes** im Input-System-Fenster), ist das Setup-Fenster zu. Dann wieder **Aetherfall > Projekt-Setup …** öffnen.
   **Du siehst danach:** das Fenster wie vorher.
5. Auf **Status aktualisieren** klicken.
   **Du siehst danach:** im Idealfall bei a) bis f) überall ✓. Bei f) sind einzelne – normal.

> Steht im Protokoll „Hinweis: Active Input Handling steht noch nicht auf „Input System Package (New)“ …“: Bei der Frage **„… enable the backends?“** (Tabelle oben) **Yes** klicken. Von Hand umstellen musst du nur, wenn bei b) die Zeile **Active Input Handling** danach immer noch ein ✗ zeigt ([6.5 A](#65-nur-falls-noch-ein--bleibt-drei-handgriffe)).

### 6.4 Wenn danach noch ✗ zu sehen sind

1. Einfach noch einmal **Alles ausführen** klicken und die Fragen wie in 6.3 beantworten. Jeder Schritt erledigt nur, was noch fehlt, und lässt Fertiges unverändert. Das kann nach einem Neustart von Unity nötig sein: Ein Neustart beendet eine laufende Prüfung des Werkzeugs (nach bloßem Neukompilieren macht das Fenster dagegen selbst weiter).
   **Du siehst danach:** weniger oder keine ✗ mehr.
2. Bleibt dieselbe Zeile auch nach dem zweiten oder dritten Lauf ✗: in 6.5 nachsehen. Steht sie dort nicht, im Protokoll auf **Kopieren** klicken und den Text an Claude schicken.
   **Du siehst danach:** entweder alles ✓ oder eine konkrete Zeile für Claude.

### 6.5 Nur falls noch ein ✗ bleibt: drei Handgriffe

Für diese drei Punkte gibt es keinen automatischen Weg. Mach sie **nur**, wenn genau diese Zeile ✗ zeigt.

**A) Schritt b), Zeile „Active Input Handling: Input System Package (New)“ zeigt ✗**

1. **Edit > Project Settings…** öffnen und links **Player** wählen.
   **Du siehst danach:** rechts die Player-Einstellungen.
2. **Other Settings** aufklappen, nach unten zum Abschnitt **Configuration** scrollen, bei **Active Input Handling** die Auswahl **Input System Package (New)** wählen.
   **Du siehst danach:** ein Fenster, dass Unity neu starten muss.
3. **Apply** klicken.
   **Du siehst danach:** Unity startet neu.
4. **Aetherfall > Projekt-Setup …** öffnen, **Status aktualisieren**.
   **Du siehst danach:** bei b) die Zeile mit ✓.

**B) Schritt f), Zeile „Rendering Path: Forward+“ zeigt ✗**

Die Zeile nennt die betroffenen Dateien, z. B. `Mobile_Renderer = Forward`.

1. Im Fenster **Project** (unten) zu **Assets > _Project > Settings > Rendering** gehen.
   **Du siehst danach:** die Grafik-Dateien der Vorlage, z. B. `Mobile_Renderer` und `PC_Renderer`.
2. Die Datei mit dem Namen aus der Zeile anklicken (z. B. `Mobile_Renderer`).
   **Du siehst danach:** rechts im **Inspector** ihre Einstellungen.
3. Im Abschnitt **Rendering** bei **Rendering Path** die Auswahl **Forward+** wählen. Für jede genannte Datei wiederholen.
   **Du siehst danach:** **Rendering Path = Forward+**.
4. **File > Save Project**, dann im Setup-Fenster **Status aktualisieren**.
   **Du siehst danach:** bei f) die Zeile mit ✓ (das Fenster schreibt den Wert als `ForwardPlus`).

**C) Schritt f), Zeile „Git LFS“ zeigt ✗**

1. GitHub Desktop einmal beenden (Cmd + Q) und neu starten. Es richtet Git LFS bei jedem Start ein. Erscheint **Initialize Git LFS**: darauf klicken.
   **Du siehst danach:** GitHub Desktop mit dem Repo **liam**.
2. Im Setup-Fenster **Status aktualisieren**.
   **Du siehst danach:** bei f) die Zeile **Git LFS** mit ✓.

**Zeilen mit – bei f) („UnityYAMLMerge …“):** nur eine Empfehlung für Fortgeschrittene ([Anhang A](#anhang-a-für-fortgeschrittene-unityyamlmerge-kommandozeile)). Für dich nicht nötig.

### 6.6 Speichern

1. **File > Save Project** klicken.
   **Du siehst danach:** keine Meldung. Unity hat alle Einstellungen in den Ordner `ProjectSettings` geschrieben.

---

## 7. Play-Test

1. Im Fenster **Project** zu **Assets > _Project > Scenes > Boot** gehen und **Boot** doppelklicken (oft ist sie schon offen).
   **Du siehst danach:** im Fenster **Hierarchy** die Szene **Boot** mit den Objekten `GameBootstrapper` und `DevTools`.
2. **Window > General > Console** öffnen und dort oben links **Clear** klicken.
   **Du siehst danach:** eine leere Console.
3. Oben in der Mitte auf **▶** (Play) klicken (oder Cmd + P).
   **Du siehst danach:**
   - Im Fenster **Game** links oben einen Kasten **Game State (debug)** mit `Current: MainMenu` und Knöpfen darunter. In der Mitte kann „Display 1 – No cameras rendering“ stehen. Das ist normal: Die Boot-Szene hat noch keine Kamera.
   - In der Console weiße Zeilen, die mit `[Boot] Step 1/7: …` beginnen. Die letzte heißt `[Boot] Boot completed in … s (3 service(s)).` **Keine roten Zeilen.**
4. Optional: Im Kasten auf **Loading** und dann auf **Playing** klicken.
   **Du siehst danach:** `Current:` wechselt auf `Loading`, dann auf `Playing`.
5. Noch einmal auf **▶** klicken, um Play zu beenden.
   **Du siehst danach:** den normalen Editor. In der Console steht zusätzlich `[Boot] Services shut down (2 disposed in reverse registration order).`

Siehst du rote Zeilen oder keinen Kasten: [Abschnitt 8.3](#83-wenn-etwas-nicht-klappt-fehler-an-claude-schicken). Alle Einzelheiten (erwartete Zeilen, Test-Knöpfe, automatische Tests): [Anleitung 02](./02_Test_Phase1_Fundament.md).

---

## 8. Ergebnis an Claude zurückmelden (Commit und Push)

### 8.1 Warum das wichtig ist

Unity und das Setup-Werkzeug haben viele Dateien erzeugt: `Packages/`, `ProjectSettings/`, die Ordner, die Boot-Szene und zu jeder Datei eine `.meta`-Datei. Erst wenn sie auf GitHub liegen, sieht Claude den echten Stand: deine genaue Unity-Version, die installierten Paketversionen, die Einstellungen und die Ausweis-Nummern (GUIDs) der Dateien. Darauf baut jeder nächste Schritt auf. Ohne Push arbeitet Claude blind, und spätere Änderungen von Claude können mit deinem Stand zusammenstoßen.

### 8.2 Commit und Push in GitHub Desktop

1. In Unity **File > Save Project**, dann **Unity > Quit Unity** (Cmd + Q).
   **Du siehst danach:** Unity ist geschlossen.
2. GitHub Desktop öffnen, links den Reiter **Changes** wählen.
   **Du siehst danach:** eine lange Liste (mehrere hundert Dateien), alle mit Haken, u. a. `Packages/manifest.json`, `ProjectSettings/…` und viele `….meta`. Kein Eintrag darf mit `Library/`, `Temp/`, `Logs/` oder `UserSettings/` beginnen – sonst hier stoppen und Claude fragen.
3. Unten links ins Feld **Summary (required)** `Unity-Setup` eintragen.
   **Du siehst danach:** der blaue Knopf darunter ist anklickbar.
4. Auf den blauen Knopf **Commit … to claude/new-session-2ye8ds** klicken (er zeigt die Zahl der Dateien, z. B. „Commit 734 files to claude/new-session-2ye8ds“).
   **Du siehst danach:** die Liste ist leer („No local changes“). Oben rechts steht **Push origin** mit einem Pfeil nach oben.
5. Auf **Push origin** klicken.
   **Du siehst danach:** einen Fortschritt, danach steht dort wieder **Fetch origin**.
6. Claude im Chat Bescheid geben, z. B. „Setup gepusht“, und kurz sagen, ob irgendwo ✗ oder rote Meldungen geblieben sind.
   **Du siehst danach:** Claude antwortet und macht mit deinem echten Stand weiter.

**Fertig, wenn:** im Setup-Fenster a) bis f) ✓ zeigen (bei f einzelne – sind in Ordnung), der Play-Test aus Schritt 7 geklappt hat und GitHub Desktop nach dem Push wieder **Fetch origin** und „No local changes“ zeigt.

### 8.3 Wenn etwas nicht klappt: Fehler an Claude schicken

- **Rote Meldung in Unity:** **Window > General > Console** öffnen, die **erste** rote Zeile anklicken, **Cmd + C** drücken und im Chat mit Cmd + V einfügen.
- **Bildschirmfoto:** **Cmd + Shift + 4** drücken und mit der Maus einen Rahmen um die Stelle ziehen. Das Bild landet auf dem Schreibtisch. Zieh es in den Chat.
- **Protokoll des Setup-Werkzeugs:** im Fenster **Projekt-Setup** unten auf **Kopieren** klicken und im Chat einfügen.
- Ändere keinen Code selbst. Claude schickt eine Korrektur, die du mit Schritt 9 holst.

---

## 9. Updates von Claude holen

Claude arbeitet auf demselben Branch `claude/new-session-2ye8ds`. So holst du neue Dateien:

1. In Unity speichern (Cmd + S) und Unity beenden (Cmd + Q). Das ist am sichersten. Lässt du Unity offen, musst du nach dem Pull warten, bis Unity fertig neu kompiliert hat.
   **Du siehst danach:** Unity ist geschlossen.
2. In GitHub Desktop auf **Changes** schauen. Stehen dort Dateien, zuerst committen wie in 8.2, Punkt 3–4 (Summary z. B. `Unity-Änderungen`).
   **Du siehst danach:** „No local changes“.
3. Oben rechts auf **Fetch origin** klicken.
   **Du siehst danach:** Gibt es etwas Neues, steht dort jetzt **Pull origin** mit einer Zahl und einem Pfeil nach unten. Sonst bleibt es bei **Fetch origin** – dann gibt es nichts Neues.
4. Auf **Pull origin** klicken.
   **Du siehst danach:** wieder **Fetch origin**. Hast du in Punkt 2 committet, steht dort stattdessen **Push origin** – dann auch darauf klicken.
5. Das Projekt **liam** im Unity Hub öffnen und warten, bis unten rechts kein Fortschritt mehr läuft.
   **Du siehst danach:** die neuen Dateien von Claude. Die Console zeigt keine roten Fehler.

---

## 10. Fehlerbehebung

| Problem | Lösung |
|---|---|
| **Hub findet den Editor nicht** („not installed“, Warnsymbol bei der Version) | Im Hub unter **Installs** prüfen, ob `6000.3.…` installiert ist, sonst 1.2 wiederholen. Dann unter **Projects** bei **liam** auf die Versionsangabe klicken und die installierte `6000.3.…` wählen. |
| Unity meldet, dass **keine gültige Lizenz** da ist | Hub > Zahnrad > **Licenses** > **Add license** > **Get a free personal license** (siehe 1.1, Punkt 5). Dann das Projekt neu öffnen. |
| **Pakete lösen nicht auf** (rote Meldungen wie „Unable to add package“ oder „Cannot connect to Unity Package Manager“, Schritt a) bleibt ✗) | Internet prüfen, im Hub angemeldet sein, VPN aus. Im Setup-Fenster **Status aktualisieren**, dann **Alles ausführen** noch einmal. Hilft das nicht: Unity beenden, im Finder in **liam > Library** den Ordner **PackageCache** in den Papierkorb legen (nur ein Zwischenspeicher), Projekt neu öffnen. |
| Schritt a) zeigt sehr lange **läuft …** | Bis zu 15 Minuten warten: Das Fenster prüft die Pakete alle 5 Sekunden selbst und schreibt danach entweder „a) abgeschlossen: …“ oder eine rote Zeile „a) Paketänderung nach 15 Minuten nicht bestätigt …“. Im zweiten Fall im aufgeklappten Schritt a) auf **Package Manager öffnen** klicken und dort nach roten Meldungen schauen (Internet, Anmeldung im Hub), dann **Alles ausführen** noch einmal. Hilft das nicht: Unity beenden, neu öffnen, Setup-Fenster öffnen, **Status aktualisieren** und **Alles ausführen**. |
| **Rote Fehler in der Console** | Nichts selbst ändern. Die erste rote Zeile kopieren oder ein Bildschirmfoto machen und an Claude schicken (8.3). Nach Claudes Korrektur Schritt 9. |
| Menü **Aetherfall** fehlt | Unity ist noch nicht fertig (unten rechts läuft noch etwas) oder es gibt rote Fehler in der Console. Warten bzw. die Fehler an Claude schicken. Das Werkzeug erscheint erst, wenn der ganze Code fehlerfrei kompiliert. |
| Fenster **Enter Safe Mode?** beim Öffnen | **Enter Safe Mode** klicken. Die Console zeigt die Fehler: an Claude schicken. Unity im Safe Mode offen lassen oder beenden. Sobald du Claudes Korrektur mit Schritt 9 geholt hast, verlässt Unity den Safe Mode von selbst bzw. öffnet normal. |
| Setup-Fenster zeigt „Play Mode ist aktiv“ | Play mit **▶** beenden. Das Werkzeug arbeitet nur außerhalb von Play. |
| Im Game-Fenster steht „No cameras rendering“ | Normal, die Boot-Szene hat noch keine Kamera. Der Kasten **Game State (debug)** muss trotzdem erscheinen. |
| **Pull-Konflikt** in GitHub Desktop (Fenster „Resolve conflicts before Merge“) | **Abort Merge** klicken. Dabei geht nichts verloren. Bildschirmfoto an Claude schicken – Claude sagt dir, welche Variante du nehmen sollst. |
| Push klappt nicht, oben steht **Pull origin** statt **Push origin** | Auf GitHub gibt es neuere Dateien von Claude. Erst **Pull origin**, dann **Push origin** (Schritt 9). |
| Fenster **Initialize Git LFS** in GitHub Desktop | **Initialize Git LFS** klicken. Das richtet die Behandlung großer Dateien für dieses Repo ein. |
| Setup-Fenster f) **Git LFS ✗** | GitHub Desktop beenden und neu starten, dann **Status aktualisieren** (6.5 C). |
| GitHub meldet beim Push etwas wie **„LFS … quota“** oder **„over its data quota“** | Das kostenlose Kontingent für große Dateien (10 GB Speicher und 10 GB Download pro Monat bei GitHub Free) ist erschöpft. Nichts bezahlen und keine Zahlungsdaten eingeben, sondern Claude Bescheid geben. Ohne hinterlegte Zahlungsweise sperrt GitHub nur bis zum Monatsende. |
| Bilder oder Sounds sind nach einem Pull kaputt, die Datei enthält nur Text mit `version https://git-lfs.github.com/spec/v1` | Git LFS war nicht eingerichtet. GitHub Desktop neu starten, bei **Initialize Git LFS** zustimmen, dann **Repository > Pull**. |
| GitHub Desktop listet Dateien aus `Library/`, `Temp/`, `Logs/` oder `UserSettings/` | Nicht committen. Wahrscheinlich liegt etwas im falschen Ordner. Bildschirmfoto an Claude. |
| Der Finder fragt beim Kopieren „… ersetzen?“ | **Abbrechen**. Siehe Warnung in 4.2. |
| Versehentlich **AetherfallVorlage** statt **liam** geöffnet | Unity beenden und im Hub **liam** öffnen. Die Vorlage darfst du nach Schritt 8 löschen (Ordner in den Papierkorb, im Hub beim Eintrag **…** > **Remove from list**). |

---

## Anhang A: Für Fortgeschrittene (UnityYAMLMerge, Kommandozeile)

**Für dich nicht nötig.** Nur als Hinweis, falls später mehrere Rechner oder Personen gleichzeitig an Szenen arbeiten.

- **UnityYAMLMerge (Smart Merge):** Ein Unity-Programm, das Änderungen von zwei Seiten an derselben Szene oder demselben Prefab zusammenführt. Die Datei `.gitattributes` verweist schon darauf. Git muss nur noch wissen, wo das Programm auf diesem Mac liegt. Im Setup-Fenster bei f) **Git-Befehle für UnityYAMLMerge (Smart Merge) anzeigen** aufklappen, auf **Kopieren** klicken, in GitHub Desktop **Repository > Open in Terminal** wählen und die Befehle einfügen. Beim ersten `git`-Befehl im Terminal bietet macOS an, die kostenlosen „Command Line Tools“ zu installieren. Details, der optionale Merge-Treiber und die Prüfbefehle (`git check-attr`, `git lfs ls-files`): [Architektur 2.9](../Technik/01_Architektur.md#29-git-und-lfs), Punkte #46 und #47.
- **Kommandozeile statt GitHub Desktop:** Klonen, Branch wechseln, Commit, Pull und Push gehen auch mit `git` im Terminal. GitHub Desktop reicht aber vollständig. Grundlagen und Regeln: [Architektur 2.9](../Technik/01_Architektur.md#29-git-und-lfs).

---

## Anhang B: Was das Werkzeug noch nicht erledigt

**Du musst jetzt nichts davon tun.** Diese Punkte aus [Architektur, Abschnitt 2](../Technik/01_Architektur.md#2-projekt-setup-checkliste) sind bewusst offen. Claude ergänzt sie später im Setup-Werkzeug oder in der Anleitung zu dem Schritt, der sie braucht:

| Architektur | Punkt | Wann |
|---|---|---|
| 2.5 #24–#28 | eigene URP-Qualitätsstufen (Niedrig, Mittel, Hoch, Ultra), gemeinsamer Forward+-Renderer, GPU Resident Drawer | vor dem ersten Grafik-Schritt |
| 2.5 #30, #33 | Zeit (Fixed Timestep 0,02, Maximum Allowed Timestep 0,1) und Audio-Stimmen (48/256) | mit Spieler-Controller bzw. Audio |
| 2.4 #16, #22, 23b | Version `0.1.0`, Bundle-ID (offene Entscheidung), Splash Screen aus | vor dem ersten Build |
| 2.6 #35 | TextMeshPro-Grundressourcen | mit der ersten Benutzeroberfläche |
| 2.6 #36, 2.7 #43 | Build-Profile `Mac_Dev`, `Mac_Release`, `Win_Dev`, `Win_Release` mit Entwickler-Defines | vor dem ersten Build |
| 2.6 #37–#39 | Einstellungen für Localization, Addressables und das eigene Input-Asset | Phase 1, mit dem jeweiligen System |
| 2.5 #31–#32 | Layer und Physik-Matrix | mit dem Spieler-Controller |
| 2.3 #14 | Code-Editor (Rider oder VS Code) | nicht nötig, solange Claude den Code schreibt |
| 2.10 #51 | Git-Tag `setup-6000.3.<patch>` für den Setup-Commit | kann Claude nach deinem Push setzen |

---

## Anhang C: Dateien dieses Schritts

Nach Master-Prompt §32.3: wohin jede Datei gehört und ob sie an ein GameObject kommt. **Keine** dieser Dateien kommt an ein GameObject. Das Setup-Werkzeug ist ein Editor-Fenster.

| Datei | Ordner | Zweck |
|---|---|---|
| `.gitignore` | Repo-Wurzel | sorgt dafür, dass Zwischenspeicher wie `Library/` nicht ins Repo kommen (Architektur 2.9) |
| `.gitattributes` | Repo-Wurzel | Zeilenenden, Smart Merge für Unity-Dateien, Git LFS für große Dateien (Architektur 2.9) |
| `Aetherfall.EditorTools.Core.asmdef` | `Assets/_Project/Scripts/Editor/Core/` | Assembly des Werkzeugs, nur im Editor. Referenziert nur `Aetherfall.Core` (Architektur 3.3, Nr. 33); das Overlay aus `Aetherfall.DevTools` findet Schritt e) über seinen Namen |
| `ProjectSetupWindow.cs` | `Assets/_Project/Scripts/Editor/Core/` | das Fenster **Aetherfall > Projekt-Setup …** |
| `SetupStep.cs`, `SetupStatus.cs`, `SetupStatuses.cs`, `SetupCheckItem.cs`, `SetupLog.cs`, `SetupPaths.cs`, `AssetFolderUtility.cs` | `Assets/_Project/Scripts/Editor/Core/` | Grundgerüst: Schritte, ✓/✗/–, Protokoll, feste Pfade |
| `PackageSetupStep.cs`, `PackageCatalog.cs`, `PackagePlanner.cs`, `PackagePlan.cs`, `PackageRequirement.cs`, `InstalledPackage.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt a) Pakete |
| `ProjectSettingsSetupStep.cs`, `SettingRule.cs`, `ProductIdentity.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt b) Einstellungen, Firmen- und Produktname |
| `FolderSetupStep.cs`, `ProjectFolderLayout.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt c) Ordner aus Architektur 3.1 |
| `TemplateCleanupStep.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt d) Vorlage aufräumen |
| `BootContentSetupStep.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt e) Boot-Assets, Boot-Szene, Szenenliste |
| `ProjectChecksStep.cs`, `GitRepositoryInspector.cs` | `Assets/_Project/Scripts/Editor/Core/` | Schritt f) Prüfungen |
| `PackagePlannerTests.cs` | `Assets/_Project/Tests/EditMode/` | automatische Tests der Paket-Planung von Schritt a) ([Anleitung 02, Abschnitt 4](./02_Test_Phase1_Fundament.md#4-editmode-tests-ausführen)) |
| `01_Projekt-Setup.md` | `docs/Anleitungen/` | diese Anleitung |

**Was in Unity entsteht** (mit eigenen GUIDs, nicht von Hand angelegt): `Packages/`, `ProjectSettings/`, alle `.meta`-Dateien, die Ordner aus Architektur 3.1 mit `.gitkeep`-Platzhaltern, `ArtSource/`, die Assets in `Assets/_Project/Settings/Boot/` und die Szene `Assets/_Project/Scenes/Boot/Boot.unity`.
