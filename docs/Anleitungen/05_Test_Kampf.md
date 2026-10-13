# Testanleitung Phase 2: Der erste Kampf (Schwert und Schild gegen Wölfe)

> Kampfsystem, Lock-On, Gegner-KI (Wolf, Aether-Wolf), Trainingspuppe, Kampf-Overlay · Stand: 2026-10-13 · Bezug: [Architektur 4.1, 4.3, 4.4, 11.4, 11.10](../Technik/01_Architektur.md) · [GDD 03, Abschnitte 1–4, 8, 9](../GDD/03_Kampf_Charakter_Progression.md) · [GDD 01, 11.2 (Aether-verderbt)](../GDD/01_Welt_Story_Fraktionen.md)

In diesem Schritt kann die Spielfigur zum ersten Mal **kämpfen**: mit einem Einhandschwert und einem Holzschild (beides vorerst graue Quader). Es gibt leichte Kombo-Angriffe, schwere Angriffe zum Aufladen, Blocken, Parieren mit Konter, Ausweichrolle, Lock-On und Finisher. Im Testgelände stehen jetzt eine **Trainingspuppe** zum Üben und eine **Arena mit zwei Grauwölfen und einem Aether-Wolf**. Die Wölfe bemerken dich, umkreisen dich, greifen abwechselnd an, fliehen bei wenig Lebenspunkten und kehren zurück, wenn du zu weit wegläufst. Stirbt die Figur, erscheint sie nach 3 Sekunden wieder am Startpunkt.

Es gibt **noch keine Animationen**: Ein Angriff ist eine Abfolge von Zeitfenstern (Ausholen, Treffer, Erholung), das Schwert schwingt per Code. Achte beim Testen deshalb vor allem auf das **Timing und das Gefühl**, nicht auf das Aussehen.

Voraussetzung: [Anleitung 01](./01_Projekt-Setup.md) bis [Anleitung 04](./04_Test_Werte_Speichern.md) sind erledigt (Unity 6.3 LTS, Testgelände läuft, Figur, Ausdauer und Speichern funktionieren).

---

## Inhalt

1. [Was dieser Schritt liefert](#1-was-dieser-schritt-liefert)
2. [Updates holen](#2-updates-holen)
3. [Testgelände neu aufbauen](#3-testgelände-neu-aufbauen)
4. [Spielen](#4-spielen)
5. [Steuerung im Kampf](#5-steuerung-im-kampf)
6. [Kampf-Overlay, Trainingspuppe und Schadenszahlen](#6-kampf-overlay-trainingspuppe-und-schadenszahlen)
7. [Prüfliste](#7-prüfliste)
8. [Automatische Tests](#8-automatische-tests)
9. [Was du zurückmelden sollst](#9-was-du-zurückmelden-sollst)
10. [Häufige Fehler und Lösungen](#10-häufige-fehler-und-lösungen)
11. [Dateien und wohin sie gehören](#11-dateien-und-wohin-sie-gehören)
12. [Hinweise, Vorschläge und Abweichungen](#12-hinweise-vorschläge-und-abweichungen)

---

## 1. Was dieser Schritt liefert

| Baustein | Was er tut |
|---|---|
| **Kampf-Kern** (`Aetherfall.Combat`) | Kampf-Zustandsmaschine als reine Logik: leichte Kombo (4 Schläge, der 4. ist ein Stich), schwerer Angriff mit zwei Aufladestufen und „Hyperarmor“, Sprint- und Sprungangriff, Blocken mit Ausdauer und Deckungsbruch, perfektes Parieren (150 ms) mit Konter, Ausweichrolle mit Unverwundbarkeit (I-Frames) und Rückwärtsschritt, Taumeln/Umwerfen, Finisher. Eingabepuffer (gedrückte Tasten gelten 0,2 s), Haltung (Poise) der Gegner, Standfestigkeit des Spielers. Angriffe sind Daten (`AttackDefinition`-Assets): Zeiten, Trefferbox, Schaden, Ausdauer, Vorschub. |
| **Treffer** | Hitbox (Abfrage pro Bild, jedes Ziel höchstens einmal pro Schlag, nie das eigene Team) und Trefferzonen (Körper, Kopf ×1,5, Schwachpunkt ×2). Schaden über den Schadensrechner aus Anleitung 04. Ereignisse `DamageDealt`, `EnemyKilled`, `CombatStateChanged` und `PlayerDied`. |
| **Trefferfeedback** | Hitstop **nur bei den Beteiligten** (nicht das ganze Spiel), Kamera-Wackeln (Cinemachine Impulse, abschaltbar), weißes Aufblitzen, Rückstoß, Schadenszahlen. |
| **Spieler** (`Aetherfall.Player`) | Kampfsteuerung (Tasten → Kampf-Logik → Bewegung), Lock-On mit Zielwechsel, Seitwärtslaufen (Strafing) im Lock-On, Schwert und Schild mit Code-Pose, Wiederbeleben nach 3 s. |
| **Kamera** (`Aetherfall.CameraSystem`) | Zweite Kamera `CM_LockOn`: hält Spieler und Ziel im Bild (Zielgruppe), Abstand 4,5–7 m je nach Ziel. Kamera-Wackeln bei Treffern. |
| **Gegner-KI** (`Aetherfall.AI`, neu) | Zustandsmaschine Wache/Patrouille → Misstrauisch → Kampf (anlaufen, umkreisen, ansetzen, angreifen mit sichtbarer **Telegrafie**, zurückweichen) → Suchen → Rückkehr, dazu Flucht, Betäubung und Tod. Wahrnehmung mit Sichtkegel, Gehör und Entdeckungswert 0–100. **Angriffs-Token**: höchstens 2 Wölfe greifen gleichzeitig an. Bewegung ohne NavMesh (einfaches Ausweichen um Hindernisse). |
| **Testgelände** | Arena mit 2 Grauwölfen (einer patrouilliert) und 1 Aether-Wolf mit Kristallkern, Trainingspuppe (unendlich LP, zeigt Schaden und Haltung), Kampf-Overlay links unten mit Knopf **Gegner neu spawnen**. |
| **Tests** | 232 neue automatische Testfälle (Kampf-Zustandsmaschine, Haltung, Hitstop, Trefferregistrierung, KI-Übergänge, Leash, Token, Wahrnehmung, Strafing …). |

---

## 2. Updates holen

1. **GitHub Desktop** öffnen. Oben links muss **Current Repository: liam** stehen.
2. Oben auf **Fetch origin** klicken.
   **Du siehst danach:** Der Knopf heißt jetzt **Pull origin** und zeigt eine Zahl mit Pfeil nach unten.
3. **Pull origin** klicken.
   **Du siehst danach:** Der Knopf heißt wieder **Fetch origin**, links unter **History** stehen neue Einträge von Claude.
4. Unity mit dem Projekt öffnen (Unity Hub > **Projects** > **Aetherfall**). War Unity schon offen: einfach ins Unity-Fenster klicken.
   **Du siehst danach:** unten rechts einen drehenden Kreis (Unity kompiliert). Das dauert diesmal etwas länger (über 100 neue Dateien).
5. **Window > General > Console** öffnen.
   **Du siehst danach:** die Console. **Rote Fehler** dürfen dort nicht stehen. Gelbe Warnungen sind erst einmal egal.

> Zwei Dateien sind umgezogen: `DamageType.cs` und `HitZone.cs` liegen jetzt in `Scripts/Events/` statt in `Scripts/Combat/`. Unity räumt die alten `.meta`-Dateien selbst auf. Zeigt GitHub Desktop danach gelöschte `.meta`-Dateien im Ordner `Combat` an, einfach mit committen.

Es kommen **keine neuen Pakete** dazu (Cinemachine, Input System und Newtonsoft JSON aus den Anleitungen 01–04 reichen).

---

## 3. Testgelände neu aufbauen

Die Figur braucht neue Bausteine (Kampf, Lock-On, Schwert, Schild), die BootConfig zwei neue Installer, und die Szene bekommt Arena und Trainingspuppe. Alles erledigt das Menü.

1. Läuft das Spiel noch: oben auf **Play** klicken, um den Play-Modus zu beenden.
2. Menü **Aetherfall > Testgelände erstellen** klicken.
   **Du siehst danach:** das Fenster **Testgelände erstellen**. In der Liste steht neu: „Kampf: Angriffe, Waffe, Schild, Gegnertypen …, CombatInstaller und AIInstaller in der BootConfig“, „Arena mit Trainingspuppe, 2 Wölfen und 1 Aether-Wolf“ und „Layer 6 „Player“, 7 „Enemy“, 9 „Hurtbox“ und 11 „Environment“, falls frei“.
3. **Neu aufbauen** klicken. Fragt Unity vorher **Scene(s) Have Been Modified**: **Don't Save**.
   **Du siehst danach:** „Fertig! Die Szene „Testgelaende“ ist geöffnet.“ mit dem Hinweis auf diese Anleitung. **OK** klicken. Steht darunter „Hinweise (…)“, bitte den Text abschreiben bzw. fotografieren und an Claude schicken.

**Was das Menü neu anlegt bzw. ändert:**

| Was | Wo | Hinweis |
|---|---|---|
| 12 Angriffe | `Assets/_Project/Data/Combat/Attacks/` | `Einhandschwert_Leicht1` bis `_Leicht4_Stich`, `_Schwer`, `_Sprint`, `_Sprung`, `_Konter`, `_Finisher`, `Wolf_Biss`, `Wolf_Schnappen`, `Wolf_Sprungangriff` |
| Waffe, Kombo, Schild | `Assets/_Project/Data/Combat/Weapons/` | `Einhandschwert`, `Einhandschwert_Kombo`, `Holzschild` |
| Gegnertypen | `Assets/_Project/Data/Enemies/` | `Grauwolf`, `AetherWolf` |
| Kampf-Regeln | `Assets/_Project/Settings/Combat/CombatSettings.asset` | Parierfenster, Rollen-Zeiten, Hitstop-Stärke … (Abschnitt 12) |
| Installer | `Assets/_Project/Settings/Boot/CombatInstaller.asset`, `AIInstaller.asset` | in die BootConfig eingetragen |
| Layer | Project Settings > Tags and Layers | 7 „Enemy“, 9 „Hurtbox“ (Trefferzonen kollidieren mit nichts, nur der Treffer-Abfrage) |
| Spielfigur `Player` | Szene | neue Komponenten **Combatant**, **Hitbox**, **Player Lock On**, **Player Combat Controller**, **Player Weapon Pose**, **Player Respawn**, **Hit Flash**; Kinder `Hurtbox_Body`, `Hurtbox_Head`, `SwordHand`, `ShieldHand`, `TargetPoint` |
| neue Objekte | Szene | `CM_LockOn`, `LockOnTargetGroup`, `CameraShake`, `Arena` (mit den Wölfen), `Trainingspuppe`, `CombatOverlay`, `DamageNumbers` |

**Alle Daten-Assets werden nur angelegt, wenn sie fehlen.** Änderst du z. B. Werte im Asset `Grauwolf`, bleiben sie beim nächsten „Neu aufbauen“ erhalten. Willst du die Standardwerte zurück: das Asset löschen und das Menü erneut ausführen.

**Prüfen:** `Assets/_Project/Settings/Boot/BootConfig.asset` anklicken → im Inspector hat die Liste **Installers** jetzt **8 Einträge** in dieser Reihenfolge:

1. Log-Installer
2. EventBus-Installer
3. GameState-Installer
4. Input-Installer
5. Save-Installer
6. GameTime-Installer
7. **Combat-Installer** (neu)
8. **AI-Installer** (neu)

Steht die Reihenfolge anders: das Menü einfach noch einmal ausführen, es sortiert die neuen Einträge selbst ein.

---

## 4. Spielen

1. Ist die Szene nicht offen: im Project-Fenster `Assets/_Project/Scenes/Test/Testgelaende.unity` doppelklicken.
2. In der Console oben **Clear** klicken.
3. **Play** drücken und **einmal ins Game-Fenster klicken**.
   **Du siehst danach:** die Figur mit einem grauen Schwert rechts und einem Schild links, links oben das Zustands-Overlay, rechts oben das Spieler-Overlay und **neu links unten das Kampf-Overlay „Kampf (Debug)“**.

**Erwartete Console-Zeilen** (Auszug, Zahlen können abweichen):

| # | Zeile | Bedeutung |
|---|---|---|
| 1 | `[Boot] Step 3/7: Installer order validated (8 installer(s)).` | 8 Installer, inklusive Combat und AI |
| 2 | `[Boot] Step 4/7: Installed 'CombatInstaller' (provides: ICombatService).` | Kampf-Dienst ist da |
| 3 | `[Boot] Step 4/7: Installed 'AIInstaller' (provides: IAttackTokenService, IAIManager).` | KI-Dienste (Token, Takt) sind da |
| 4 | `[GameState] Loading -> Playing (DevPlayStarter (test scene)). …` | Spiel läuft |

**Keine roten Fehler.** Gelbe Zeilen mit „CombatInstaller missing“ oder „AIInstaller missing“ bedeuten: BootConfig prüfen (Abschnitt 3).

**Wo ist was?** Du startest in der Mitte des Testgeländes und schaust nach Norden (zu den Rampen).

| Ort | Wie hinkommen |
|---|---|
| **Trainingspuppe** (Holzpfahl mit Kopf und Armen, Schrift „Trainingspuppe“) | umdrehen (nach Süden) und **rechts** an der grauen Wand vorbei, etwa 20 m |
| **Arena** (runde, dunkle Fläche mit zwei Felsen, Schrift „Kampfarena: 2 Wölfe + 1 Aether-Wolf“) | von der Puppe aus weiter nach Süden und etwas nach rechts, etwa 30 m. Die Wölfe stehen bzw. laufen in der Arena. |

Die Puppe steht mehr als 25 m von den Wölfen entfernt: Kampflärm an der Puppe hören sie nicht.

---

## 5. Steuerung im Kampf

| Aktion | Tastatur / Maus | Gamepad (Xbox · PlayStation) | Hinweis |
|---|---|---|---|
| Leichter Angriff | **linke Maustaste** | **X** · **□** | im Rhythmus drücken = Kombo (4 Schläge). Eine Pause über 0,6 s startet die Kombo neu. |
| Schwerer Angriff | **rechte Maustaste** tippen | **Y** · **△** | kurz tippen = normaler schwerer Schlag |
| Schwer aufladen | **rechte Maustaste halten** | **Y halten** · **△ halten** | ab 0,6 s Stufe I, ab 1,2 s Stufe II, nach 2 s löst er von selbst aus. Loslassen = zuschlagen. |
| Blocken | **Q halten** | **LB halten** · **L1 halten** | nur nach vorne (Schild 150°), langsam laufen, Ausdauer lädt halb so schnell |
| Parieren | **Q kurz vor dem Treffer drücken** | **LB** · **L1** im richtigen Moment | 150 ms nach dem Drücken = Parierfenster (Schild leuchtet golden). Danach 1 s lang: Angriff = **Konter** |
| Ausweichen (Rolle) | **Strg** (linke Ctrl-Taste) **mit Richtung** (WASD) | **B** · **○** mit Stick-Richtung | 4,2 m, kurz unverwundbar, kostet 12 Ausdauer |
| Rückwärtsschritt | **Strg ohne Richtung** | **B** · **○** ohne Stick | 2 m zurück, kostet 8 Ausdauer |
| Sprintangriff | beim Sprinten (Shift, mind. 0,5 s) **linke Maustaste** | beim Sprinten **X** · **□** | Ausfallschritt 2 m |
| Sprungangriff | in der Luft **linke Maustaste** | in der Luft **X** · **□** | |
| Finisher | **linke Maustaste** vor einem **betäubten** Gegner (orange) | **X** · **□** | bis 2,5 m Abstand, ±60° vor dir; du bist dabei unverwundbar |
| Lock-On an/aus | **mittlere Maustaste** oder **T** | **R3** (rechten Stick drücken) | wählt das Ziel nahe der Bildmitte (±30°, bis 25 m) |
| Ziel wechseln | **Mausrad** (hoch = rechts) oder Maus schnell zur Seite ziehen | rechten Stick **kippen** (links/rechts) | nur mit Lock-On |
| Waffenkunst | Q + rechte Maustaste | LB + Y | **noch nicht eingebaut** (Console-Hinweis) – der schwere Angriff wird dann ignoriert. Ausnahme: bis 1 s nach einer Parade ist es der **Konter** |

**Ohne Lock-On** dreht ein Angriff die Figur leicht (bis 30°) zum nächsten Gegner in 3 m („Soft-Lock“), sonst in Stick-/Tastenrichtung (bis 45°). **Mit Lock-On** zeigen alle Angriffe direkt aufs Ziel, und die Figur läuft seitwärts und rückwärts, ohne sich wegzudrehen (vorwärts 5 m/s, seitwärts 4 m/s, rückwärts 3,5 m/s). Sprinten im Lock-On dreht die Figur in Laufrichtung.

**Ausdauerkosten:** leichter Angriff 12, schwerer 24 (+6 bzw. +12 aufgeladen), Sprint- und Sprungangriff 18, Rolle 12, Rückwärtsschritt 8, geblockte Treffer je nach Wucht. Bei 0 Ausdauer startet kein Angriff und keine Rolle. Bringt ein geblockter Treffer die Ausdauer auf 0: **Deckungsbruch** (1 s wehrlos).

---

## 6. Kampf-Overlay, Trainingspuppe und Schadenszahlen

**Kampf-Overlay** (links unten, Titel „Kampf (Debug)“). Zum Klicken erst **Esc** (Pause, Mauszeiger erscheint). **Zuklappen** macht daraus einen kleinen Knopf „Kampf-Overlay“.

| Zeile / Knopf | Bedeutung |
|---|---|
| **Spieler: LP 328/328   Ausdauer …   Standfestigkeit …** | Lebenspunkte, Ausdauer (mit „erschöpft“) und Standfestigkeit der Figur |
| **Zustand: …** | Kampfzustand der Figur, z. B. „Bereit“, „Angriff: Kombo 2/4 (Ausholen)“, „Schwer aufladen: Stufe 1 (0.8 s), Hyperarmor“, „Blocken – PARIERFENSTER offen“, „Rolle (unverwundbar)“, „Taumeln (0.4 s)“, „Finisher (unverwundbar)“, „Tot“ |
| **Im Kampf (Speichern gesperrt) / Nicht im Kampf** | Kampfzustand fürs Speichern (ein Wolf kämpft mit dir oder Schaden in den letzten 5 s) |
| **Ziel: …** | nur mit Lock-On: Name, LP, **Haltung** (Poise, z. B. „Haltung 20/35“, „GEBROCHEN“) und der **KI-Zustand** des Wolfs, z. B. „Wache (Entdeckung 0)“, „Misstrauisch (Entdeckung 45)“, „Kampf: umkreist, Token: nein“, „Kampf: TELEGRAFIE attack.wolf.biss, Token: ja“, „Kehrt zurück (Leash)“ |
| **Letzte Treffer:** | die letzten 5 Treffer: „player → enemy.wolf.grauwolf#1: 48, Körper“, mit „KRIT“, „Kopf“, „Schwachpunkt“, „geblockt“, „HALTUNG GEBROCHEN“, „Taumeln“, „tot“; oder „ausgewichen (I-Frames)“ bzw. „PARIERT“ |
| **Gegner neu spawnen** | alle Wölfe zurück an ihren Platz, volle LP, wieder lebendig |
| **Spieler heilen** | LP und Ausdauer voll (wirkt nicht, solange die Figur tot ist) |
| **Zahlen an / aus** | Schadenszahlen über den Köpfen ein-/ausblenden |

**Trainingspuppe:** hat unendlich LP (sie heilt jeden Treffer sofort), Haltung 35 wie ein Wolf und zeigt über dem Kopf „Letzter Treffer“, „Schaden (5 s)“ und „Haltung“. Sie wehrt sich nicht. Ist ihre Haltung gebrochen, leuchtet sie **orange** („Haltung gebrochen – Finisher möglich“).

**Schadenszahlen:** weiß = normaler Treffer, **gelb mit „!“** = kritisch, **hellblau** = geblockt, **rot** = Treffer an dir, grau „Ausgewichen“, golden „Pariert!“.

**Wölfe:** Grauwolf grau, Aether-Wolf bläulich mit einem leuchtenden **Kristall auf dem Rücken**. Vor jedem Angriff **leuchten sie rot (pulsierend) und bäumen sich auf** – das ist die Telegrafie: jetzt ausweichen oder parieren. Betäubt: orange und schwankend. Tot: grau, kippen um und verschwinden nach gut einer Sekunde.

---

## 7. Prüfliste

Hake ab, was klappt. Bei „Nein“ bitte kurz notieren, was passiert ist. Die Werte unten (Schaden usw.) sind Richtwerte; kleine Abweichungen durch kritische Treffer sind normal.

### 7.1 An der Trainingspuppe

- [ ] **Kombo:** vor der Puppe 4× im Rhythmus linke Maustaste (etwa 2 Klicks pro Sekunde): 3 Schläge von wechselnden Seiten, der 4. ist ein Stich nach vorne. Das Overlay zeigt „Kombo 1/4“ bis „4/4“, danach beginnt sie wieder bei 1.
- [ ] Zu früh geklickt (während des Schlags) zählt trotzdem, wenn du höchstens 0,2 s vor dem nächsten möglichen Zeitpunkt klickst. Viel zu früh oder zu spät (Pause über 0,6 s): die Kombo startet neu bei 1/4.
- [ ] Jeder Treffer: Puppe blitzt weiß, ganz kurzer „Stopp“ im Schlag (Hitstop), Zahl über der Puppe (Körpertreffer etwa **48**), die Puppe zeigt „Letzter Treffer“.
- [ ] **Schwer tippen:** langsamer Schlag von oben (etwa 71), Kamera wackelt leicht.
- [ ] **Schwer halten:** das Schwert geht hoch und zittert; Overlay „Schwer aufladen: Stufe 1“ ab 0,6 s, „Stufe 2“ ab 1,2 s, „Hyperarmor“ ab 0,3 s. Loslassen schlägt zu (Stufe 2 deutlich stärker, mit längerem Hitstop und Kamera-Wackeln). Nach 2 s Halten schlägt die Figur von selbst zu.
- [ ] **Haltung brechen und Finisher:** 4 leichte Treffer (die ganze Kombo) → „Haltung: … GEBROCHEN“, die Puppe leuchtet orange (3 s). Jetzt **linke Maustaste** in ihrer Nähe → **Finisher** (die Figur holt lange aus, Overlay „Finisher (unverwundbar)“, große Zahl – bei der Puppe etwa 3500, weil der Finisher 35 % der max. LP abzieht und die Puppe 9999 hat).
- [ ] **Sprintangriff:** mit Shift auf die Puppe zu sprinten und klicken: Ausfallschritt mit Schlag.
- [ ] **Sprungangriff:** Leertaste, in der Luft klicken.
- [ ] **Ausdauer:** so lange angreifen, bis die Ausdauer leer ist → bei 0 startet kein weiterer Angriff (die Kombo bricht ab). Nach kurzer Pause lädt sie wieder.
- [ ] **Pause mitten im Aufladen:** rechte Maustaste halten, dabei **Esc** drücken und wieder fortsetzen, ohne die Taste loszulassen → das Aufladen läuft weiter, erst Loslassen schlägt zu. Genauso bleibt beim Blocken (Q gehalten) die Deckung über die Pause oben.
- [ ] **Hitbox sehen (optional):** im Play-Modus oben das **Scene**-Fenster neben dem Game-Fenster öffnen: während eines Schlags erscheint vor der Figur ein **rotes Drahtgitter** (die Trefferbox).

### 7.2 Ausweichen, Blocken, Parieren (an den Wölfen)

Lauf zur Arena. Ein Wolf bemerkt dich spätestens, wenn du nah herankommst (Abschnitt 7.4).

- [ ] **Rolle durch den Biss:** Wenn der Wolf rot aufleuchtet und sich aufbäumt, **Strg + Richtung** (zur Seite oder durch ihn hindurch). Richtig getroffen: graue Zahl „Ausgewichen“, im Overlay „ausgewichen (I-Frames)“, kein Schaden.
- [ ] Zu früh oder zu spät gerollt: du wirst getroffen (rote Zahl, etwa **25**).
- [ ] **Rückwärtsschritt:** Strg ohne Richtung → kurzer Hüpfer zurück.
- [ ] Mit 0 Ausdauer gibt es keine Rolle. Hältst du dabei Q (Blocken) und drückst Strg, bleibt die Deckung oben.
- [ ] **Blocken:** **Q halten**, Wolf beißt von vorne → hellblaue kleine Zahl, Ausdauer sinkt, die Figur wird ein Stück zurückgeschoben. Beim Blocken läuft die Figur langsam und kann nicht springen oder sprinten.
- [ ] **Biss von hinten** (Wolf seitlich/hinter dir) wird trotz Block normal getroffen.
- [ ] **Deckungsbruch:** mit wenig Ausdauer blocken, bis ein Biss sie auf 0 bringt → Overlay „Deckungsbruch“, 1 s wehrlos.
- [ ] **Parieren:** **Q genau kurz vor dem Biss drücken** (nicht halten-und-warten; das Fenster ist 150 ms kurz – das Schild leuchtet golden). Richtig: goldene Zahl „Pariert!“, kein Schaden, der Wolf ist kurz offen (Overlay: „Offen nach Parade“).
- [ ] Direkt danach (innerhalb 1 s) **linke oder rechte Maustaste** → **Konter** (schneller, sehr starker Schlag, kostet keine Ausdauer). Q darf dabei noch gedrückt sein.
- [ ] Q ständig drücken („spammen“) öffnet kein neues Parierfenster, wenn du Q weniger als 0,4 s vorher losgelassen hast.

### 7.3 Lock-On

- [ ] Wölfe vor dir: **mittlere Maustaste** (oder **T**) → die Kamera wechselt sanft auf eine Schulterkamera, die dich und den Wolf im Bild hält. Das Overlay zeigt „Ziel: enemy.wolf.grauwolf#…“ mit LP, Haltung und KI-Zustand.
- [ ] Mit Lock-On **A/D**: die Figur läuft seitlich um den Wolf und schaut ihn weiter an; **S**: läuft rückwärts.
- [ ] **Mausrad** oder Maus schnell nach links/rechts ziehen: Ziel wechselt zum nächsten Wolf auf dieser Seite. Gamepad: rechten Stick kippen.
- [ ] Nochmal mittlere Maustaste / T: Lock-On aus, normale Kamera, die hinter dir steht.
- [ ] Lock-On endet von selbst, wenn das Ziel stirbt (dann springt es auf den nächsten Wolf in der Nähe), weiter als 30 m weg ist oder 2 s hinter einem Felsen verschwindet.
- [ ] Ohne Lock-On: ein Wolf direkt neben dir (bis 3 m), du schaust leicht an ihm vorbei → der Angriff dreht die Figur ein Stück zu ihm (Soft-Lock).

### 7.4 Wölfe: Wahrnehmung und Verhalten

Tipp: Wolf per Lock-On anvisieren, dann zeigt das Overlay seinen KI-Zustand und den Entdeckungswert.

- [ ] Grauwolf 1 und der Aether-Wolf **wachen** und schauen nach Süden (von dir weg), Grauwolf 2 **patrouilliert** langsam zwischen zwei Punkten.
- [ ] **Schleichen (C)** von hinten: du kommst bis auf etwa 3 m heran, ohne dass sie reagieren. Noch näher bemerken sie dich nach gut einer Sekunde.
- [ ] **Sprinten** in bis zu 15 m Entfernung: der Wolf hört dich → „Misstrauisch“ (bleibt stehen, dreht sich zu dir). Läufst du weg und versteckst dich, sucht er nach 3 s („Sucht“) und kehrt nach 20 s an seinen Platz zurück.
- [ ] **Sieht** dich ein Wolf von vorne, steigt die Entdeckung schnell (Wildtiere sehen gut) → bei 100 „Kampf“.
- [ ] Im Kampf: der Wolf **rennt heran, umkreist** dich in 4–7 m und **greift dann an** (rot leuchtend, aufbäumend, dann Biss oder Schnappen; aus 3–6 m auch ein **Sprungangriff** mit Satz nach vorne). Nach dem Angriff weicht er kurz zurück.
- [ ] **Nie mehr als 2 Wölfe greifen gleichzeitig an.** Der dritte umkreist dich nur („Token: nein“). Zwischen zwei Angriffsstarts liegen mindestens 0,6 s.
- [ ] Ein Wolf, der getroffen wird, zuckt zurück (Rückstoß).
- [ ] **Flucht:** Fällt ein Grauwolf unter 25 % LP, rennt er 3 s weg („Flieht“) und kehrt dann an seinen Platz zurück. Stehst du dann noch nah bei ihm (bis 8 m), kämpft er weiter. Er flieht nur einmal.
- [ ] **Leash:** Lauf mit einem Wolf im Schlepptau zurück zum Startpunkt. Spätestens 40 m von seinem Platz entfernt dreht er um („Kehrt zurück (Leash)“), läuft zurück und regeneriert dabei LP. Triffst du ihn auf dem Rückweg, kämpft er wieder.
- [ ] Wolf getötet: er wird grau, kippt um, verschwindet. Console: `[AI] Enemy 'enemy.wolf.grauwolf#1' killed by 'player'.`
- [ ] **Gegner neu spawnen** im Overlay holt alle Wölfe zurück.

### 7.5 Haltung und Finisher am Wolf

- [ ] Ein Körpertreffer nimmt einem Grauwolf (144 LP) etwa 48 LP, ein **Kopftreffer** (von vorne) etwa 72. Nach 2–3 leichten Treffern ist er tot.
- [ ] **Haltung brechen am Wolf** ist mit den GDD-Werten schwer, weil der Wolf meist stirbt, bevor seine Haltung (35) bricht. Am **Aether-Wolf** geht es so: voll aufgeladener schwerer Angriff **von vorne** (nicht auf den Kristall), Stufe II (etwa 110 Schaden, Haltung 25), dann **innerhalb von etwa 2,5 s** seinen nächsten Biss **perfekt parieren** (Parade nimmt 35 % von 35 = 12,25 Haltung; 25 + 12,25 = 37,25 ≥ 35) → „HALTUNG GEBROCHEN“, Wolf orange → **linke Maustaste** = Finisher. Danach baut sich die Haltung wieder ab (nach 2,5 s ohne Haltungsschaden 15 % pro Sekunde), dann reicht die Parade nicht mehr. Ein kritischer Treffer tötet ihn sofort – dann **Gegner neu spawnen** und neu versuchen. Beim **Grauwolf** klappt dieser Weg nicht: Nach dem aufgeladenen Schlag hat er unter 25 % LP und flieht sofort. Für ihn siehe Abschnitt 12 („Base Poise“). Gelingt es dir nicht, ist das kein Fehler – bitte nur melden (Abschnitt 9).
- [ ] Während des Finishers greift dich kein anderer Wolf an (sie brechen ihr Ausholen ab).

### 7.6 Aether-Wolf

- [ ] Ein Biss des Aether-Wolfs macht etwas mehr Schaden als ein Grauwolf-Biss (+25 % als Aether-Schaden).
- [ ] Triffst du den **Kristall auf seinem Rücken** (von der Seite oder schräg hinten), steht im Overlay „Schwachpunkt“ und der Schaden ist doppelt.
- [ ] Sobald die Treffer auf den Kristall zusammen 25 % seiner LP erreichen (meist schon beim ersten Treffer), **zerbricht** er: der Kristall verschwindet, der Wolf ist 3 s betäubt (orange), Console `[AI] 'enemy.wolf.grauwolf#3': crystal core broken.` Danach macht er keinen Aether-Zusatzschaden mehr.
- [ ] Der Aether-Wolf flieht nicht.

### 7.7 Tod und Wiedererscheinen

- [ ] Lass dich von den Wölfen besiegen (oder im Spieler-Overlay rechts oben mehrmals **10 Schaden**). Bei 0 LP: Overlay „Tot“, die Figur reagiert nicht mehr, Console `[Player] Player died (killer 'enemy.wolf.grauwolf'), respawn in 3 s.`
- [ ] Nach **3 s** steht die Figur am Startpunkt, mit vollen LP und voller Ausdauer, kann sofort laufen und kämpfen. Lock-On ist aus.
- [ ] Die Wölfe hören auf zu kämpfen und gehen an ihre Plätze zurück.

### 7.8 Trefferfeedback

- [ ] **Hitstop:** bei Treffern stoppen **nur** Angreifer und Getroffener ganz kurz (60–120 ms). Andere Wölfe, die Kamera und die Spielzeit laufen weiter (es wird nicht das ganze Spiel langsamer).
- [ ] **Kamera-Wackeln:** bei schweren Treffern, Kombo-Abschluss, gebrochener Haltung, Paraden und wenn du getroffen wirst; **nicht** bei normalen leichten Treffern. Abschaltbar: in der Hierarchy `CameraShake` anklicken → **Camera Impulse On Hit** → **Shake Enabled** aus bzw. **Strength** kleiner (wirkt sofort, auch im Play-Modus).
- [ ] Getroffenes blitzt weiß auf, die Figur wird bei Treffern leicht zurückgestoßen.

### 7.9 Speichern im Kampf

- [ ] Während ein Wolf mit dir kämpft: **F5** → wird **nicht** gespeichert, Console `[Save] Save Quick failed [save.blocked.combat] …`, im Spieler-Overlay „Speichern im Kampf nicht möglich“.
- [ ] 5 s nach dem letzten Treffer und ohne kämpfenden Wolf (z. B. alle tot oder zurückgekehrt) steht im Kampf-Overlay „Nicht im Kampf“, und **F5** speichert wieder.
- [ ] **Keine LP-Regeneration im Kampf:** Solange „Im Kampf“ steht, steigen deine LP nicht (auch nicht, wenn dich die Wölfe nur umkreisen). Erst bei „Nicht im Kampf“ und 8 s ohne Schaden regenerieren sie, 1 % pro Sekunde.

---

## 8. Automatische Tests

1. **Window > General > Test Runner** → Reiter **EditMode** → **Run All**.
2. **Erwartung:** drei Test-Assemblies, alle grün:

| Assembly | Testfälle | Neu in diesem Schritt |
|---|---|---|
| `Aetherfall.Tests.EditMode` | **492** (283 aus Anleitung 04 + 209 neue) | `CombatStateMachineTests` (Kombo-Fenster, Puffer, Ausdauer-Abbruch, Aufladen, Parierfenster und Sperre ab dem Loslassen, Konter, Block-Bruch, Block ohne Ausdauer, I-Frames, Abbruch-Regeln, Taumeln, Finisher auch aus dem Puffer, Pause), `InputBufferTests`, `PoiseMeterTests` (u. a. GDD-Beispiel: Grauwolf bricht nach 10 + 10 + 10 + 13,5), `StabilityMeterTests`, `HitStopTimerTests` (höchstens 150 ms in 0,5 s), `HitRegistryTests` (einmal je Schwung, kein Eigentreffer, Zonenwahl), `AttackRunnerTests`, `CombatServiceTests` (`DamageDealt`, `CombatStateChanged` nach 5 s), `CombatStateTrackerTests`, `CombatMathTests`, `TargetingMathTests`, `HitFeedbackTableTests`, `CombatEventPayloadTests` (`EnemyKilled` genau 64 Byte), `EnemyBrainTests` (alle KI-Übergänge, Leash, unerreichbar, Sichtverlust, Flucht, Token, drei Wölfe, Angriffs-Takt bei unterschiedlicher Entfernung, Vorschub des Sprungangriffs), `AttackTokenServiceTests`, `PerceptionMathTests` (Sichtkegel, GDD-Beispiel 38/s), `DetectionMeterTests`, `EnemyScalingTests` (144 / 46 / 28 / 35), `EnemyAttackSelectorTests`, `CombatStateTextTests`, `EnemyStateTextTests` |
| `Aetherfall.Tests.EditMode.Gameplay` | **172** (149 + 23 neue) | `PlayerMovementOverrideTests` (Strafing 5 / 4 / 3,5 m/s, Sprint im Lock-On, Rolle, Block-Tempo, kein Sprung im Angriff), `PlayerCombatMotionTests` |
| `Aetherfall.Tests.EditMode.Save` | **130** (unverändert) | – |

---

## 9. Was du zurückmelden sollst

Schick Claude bitte:
1. die **Prüfliste** aus Abschnitt 7 (abgehakt bzw. mit kurzer Notiz bei „Nein“),
2. **rote Fehler oder gelbe Warnungen** aus der Console (Zeile anklicken, unten erscheint der ganze Text – den kopieren) und die „Hinweise“ aus dem Fenster „Testgelände erstellen“, falls es welche gab,
3. dein **Gefühl** – das ist diesmal das Wichtigste:
   - **Tempo der leichten Angriffe:** zu schnell, zu langsam, genau richtig? Fühlt sich der Kombo-Rhythmus gut an?
   - **Schwerer Angriff:** zu träge? Lohnt sich das Aufladen?
   - **Treffer-Gefühl:** Spürst du die Treffer (Hitstop, Wackeln, Aufblitzen)? Zu stark, zu schwach?
   - **Rolle:** zu weit, zu kurz, zu lang? Ist das Ausweichen durch einen Biss gut machbar?
   - **Parieren:** Ist das Fenster (150 ms) zu knapp oder zu leicht? Ist das goldene Leuchten hilfreich?
   - **Wölfe:** zu stark, zu schwach, zu schnell? Siehst du die Telegrafie rechtzeitig? Stört es, dass sie umkreisen?
   - **Lock-On-Kamera:** angenehm oder unruhig? Wechsel zwischen den Zielen verständlich?
   - **Finisher:** Hast du ihn am Wolf geschafft? Möchtest du ihn häufiger sehen (dann die Haltung der Wölfe senken, siehe Abschnitt 12)?
4. das Ergebnis des **Test Runners** (Abschnitt 8): alle grün oder welche rot,
5. optional ein kurzes **Bildschirmvideo** eines Kampfes (macOS: Cmd+Shift+5).

---

## 10. Häufige Fehler und Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Kein Kampf-Overlay links unten, keine Arena | Szene nicht neu aufgebaut | Abschnitt 3 (Menü **Neu aufbauen**) |
| Fenster „Testgelände erstellen“ meldet „Kampf-Daten unvollständig … ohne Kampf erstellt“ | ein Daten-Asset fehlt oder hat den falschen Typ | die Hinweise darüber lesen; das genannte Asset löschen und das Menü erneut ausführen |
| Overlay: „Kein Kampf-Dienst: CombatInstaller fehlt in der BootConfig“ | Combat-Installer fehlt | Abschnitt 3 wiederholen, `BootConfig.asset` prüfen (8 Einträge) |
| Gelbe Zeile `EnemyController '…': no IAttackTokenService (AIInstaller missing …)` | AI-Installer fehlt | wie oben; ohne ihn greifen alle Wölfe gleichzeitig an |
| Boot bricht ab, Fehlerbildschirm `… requires 'Aetherfall.Core.IEventBus' …` beim CombatInstaller bzw. `… requires …ICombatService …` | falsche Reihenfolge in der BootConfig | Menü **Testgelände erstellen** erneut ausführen (sortiert selbst) |
| Klick ins Game-Fenster löst einen Angriff aus | der erste Klick fängt die Maus, die linke Maustaste ist jetzt „Angriff“ | normal; einfach weiterspielen |
| Lock-On reagiert nicht | kein Wolf in ±30° um die Bildmitte und bis 25 m, oder keine mittlere Maustaste (Trackpad, Magic Mouse) | Kamera auf den Wolf richten; **T** benutzen |
| Wölfe bewegen sich nicht | KI-Dienst fehlt oder der Wolf hat dich noch nicht bemerkt | Console prüfen; näher heran oder sprinten |
| Wolf läuft gegen einen Felsen und bleibt hängen | einfaches Ausweichen ohne NavMesh (Abschnitt 12) | bitte mit Ort melden; nach 8 s „unerreichbar“ kehrt er zurück |
| Treffer gehen „durch“ den Wolf | Trefferzonen fehlen oder Layer 9 „Hurtbox“ war belegt | Hinweise des Menüs lesen; in **Project Settings > Tags and Layers** muss User Layer 9 „Hurtbox“ heißen |
| Rolle mit Strg macht am Mac etwas anderes (z. B. Rechtsklick-Menü bei Strg+Klick) | macOS-Tastenkürzel | Strg nur kurz tippen, nicht mit Klick kombinieren; bitte melden, wenn es stört |
| Das ganze Spiel ruckelt bei Treffern | sollte nicht sein (Hitstop ist nur lokal) | bitte melden, mit Video |
| Nach dem Tod erscheint die Figur nicht am Startpunkt | `Player Respawn` › **Spawn Point** leer | Szene neu aufbauen |

---

## 11. Dateien und wohin sie gehören

Alle Pfade relativ zu `Assets/_Project/`. **Keine Komponente musst du von Hand an ein GameObject hängen** – das Menü „Testgelände erstellen“ erledigt das. `.meta`-Dateien legt Unity selbst an; bitte mit committen.

### 11.1 Ereignisse `Scripts/Events/` (Nr. 3)

| Datei | Zweck |
|---|---|
| `CombatEvents.cs` (geändert) | neu `DamageDealt` (Angreifer, Ziel, Schaden, Art, Krit, Zone) und `EnemyKilled` (Typ, Variante, ID, Killer, Region, Beutetabelle, Level, Position – genau 64 Byte) |
| `PlayerEvents.cs` (geändert) | neu `PlayerDied` (Position, Typ des Killers, Region) |
| `DamageType.cs`, `HitZone.cs` (umgezogen aus `Combat/`) | Schadensarten und Trefferzonen; liegen jetzt hier, weil das globale Ereignis `DamageDealt` sie braucht |

### 11.2 Kampf `Scripts/Combat/` (Nr. 16)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `CombatStateMachine.cs`, `CombatStateId.cs`, `CombatInput.cs`, `CombatMovement.cs`, `CombatMovementMode.cs`, `InputBuffer.cs`, `BufferedAction.cs`, `AttackRunner.cs`, `AttackPhase.cs`, `IHitWindowReceiver.cs` | Kampf-Zustandsmaschine, Eingabepuffer, Angriffs-Zeitleiste | nein |
| `AttackSpec.cs`, `AttackKind.cs`, `HitboxShape.cs`, `WeaponSpec.cs`, `BlockSpec.cs`, `DodgeProfile.cs`, `CombatTuning.cs` | Angriffs-, Waffen- und Regelwerte als reine Daten | nein |
| `AttackDefinition.cs`, `ComboDefinition.cs`, `WeaponDefinition.cs`, `ShieldDefinition.cs`, `CombatSettings.cs` | Daten-Assets (ScriptableObjects) | nein, Assets in `Data/Combat/…`, `Settings/Combat/` |
| `PoiseMeter.cs`, `PoiseSettings.cs`, `PoiseOutcome.cs`, `StabilityMeter.cs`, `StaggerKind.cs` | Haltung der Gegner, Standfestigkeit des Spielers | nein |
| `HitStopTimer.cs`, `HitFeedbackTable.cs`, `HitFeedbackKind.cs` | lokaler Hitstop, Werte fürs Trefferfeedback (GDD 03, 4.11) | nein |
| `HitRegistry.cs`, `CombatTeam.cs`, `CombatTeams.cs`, `DefenseOutcome.cs`, `IncomingHit.cs`, `HitReport.cs`, `AttackProfile.cs` | Trefferregistrierung, Teams, Treffer-Ergebnis | nein |
| `CombatMath.cs`, `TargetingMath.cs`, `CombatantQueries.cs`, `CombatStateText.cs`, `PerceptionStance.cs` | Winkel/Abstände, Lock-On-Zielwahl, Zielsuche, Overlay-Texte, Haltung des Spielers für die Wahrnehmung | nein |
| `ICombatService.cs`, `CombatService.cs`, `CombatStateTracker.cs`, `CombatInstaller.cs` | Kampf-Dienst (Ereignisse, „im Kampf“) | nein, Asset `Settings/Boot/CombatInstaller.asset` |
| `Combatant.cs` | Kampf-Wurzel einer Figur (Team, Haltung, Hitstop, Treffer-Ablauf) | **ja:** `Player`, Wölfe, Trainingspuppe |
| `Hitbox.cs`, `Hurtbox.cs` | Treffer-Abfrage, Trefferzonen | **ja:** Figuren bzw. ihre `Hurtbox_…`-Kinder |
| `HitFlash.cs` | weißes Aufblitzen, Einfärben | **ja:** Figuren |
| `TrainingDummy.cs` | Trainingspuppe | **ja:** `Trainingspuppe` |
| `ICombatantController.cs`, `ICombatDebugSource.cs` | Schnittstellen zwischen Kampf-Wurzel und Spieler bzw. KI | nein |
| geändert: `DamageCalculator.cs`, `DamageBalancing.cs`, `DamageInfo.cs`, `DamagePacket.cs`, `DamageRequest.cs`, `DamageTypes.cs`, `DamageTypeValues.cs`, `ResistanceProfile.cs` | nur `using` für die umgezogenen Typen | – |

### 11.3 Gegner-KI `Scripts/AI/` (Assembly `Aetherfall.AI`, Nr. 21, neu)

| Datei | Zweck | Kommt an ein GameObject? |
|---|---|---|
| `EnemyBrain.cs`, `EnemyBrainSettings.cs`, `EnemyStateId.cs`, `EnemyCombatPhase.cs`, `EnemySenses.cs`, `EnemyIntent.cs`, `EnemyMoveMode.cs`, `EnemyAttackOption.cs`, `EnemyAttackSelector.cs`, `FlatPoint.cs` | KI-Zustandsmaschine als reine Logik | nein |
| `PerceptionMath.cs`, `PerceptionSettings.cs`, `DetectionMeter.cs` | Sichtkegel, Gehör, Entdeckungswert | nein |
| `AttackTokenService.cs`, `IAttackTokenService.cs`, `TokenKind.cs`, `AIManager.cs`, `IAIManager.cs`, `IAIAgent.cs`, `AIInstaller.cs` | Angriffs-Token, zentraler KI-Takt | nein, Asset `Settings/Boot/AIInstaller.asset` |
| `EnemyTypeDefinition.cs`, `EnemyAttackEntry.cs`, `ResistanceEntry.cs`, `EnemyScaling.cs` | Gegnertyp als Daten-Asset, Werte je Level | nein, Assets `Data/Enemies/…` |
| `EnemyController.cs`, `EnemyLocomotion.cs`, `EnemyVisuals.cs`, `EnemyStateText.cs` | ein Gegner in der Szene: Sinne, Bewegung, Telegrafie, Tod | **ja:** jeder Wolf (`EnemyController`) |
| `EnemyDeathReporter.cs` | sendet `EnemyKilled` | **ja:** jeder Wolf |
| `EnemySpawner.cs` | „Gegner neu spawnen“ | **ja:** `Arena` |

### 11.4 Spieler, Kamera, Eingabe

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `PlayerCombatController.cs`, `PlayerCombatMotion.cs` | `Scripts/Player/` | Kampfsteuerung der Figur, Bewegungsgrenzen im Kampf | **ja:** `Player` (`PlayerCombatController`) |
| `PlayerLockOn.cs` | `Scripts/Player/` | Lock-On und Zielwechsel | **ja:** `Player` |
| `PlayerWeaponPose.cs` | `Scripts/Player/` | Schwert- und Schild-Pose per Code | **ja:** `Player` |
| `PlayerRespawn.cs` | `Scripts/Player/` | Tod → `PlayerDied`, nach 3 s am Startpunkt | **ja:** `Player` |
| `PlayerMovementOverride.cs`; geändert `PlayerMovementModel.cs`, `PlayerMovementMath.cs`, `PlayerMovementTuning.cs`, `PlayerMovementSettings.cs`, `PlayerMotor.cs`, `PlayerSpawnPoint.cs` | `Scripts/Player/` | Bewegung im Kampf (Strafing, Rolle, gesperrt), Wiedererscheinen | wie bisher |
| `LockOnCamera.cs`, `CameraImpulseOnHit.cs`; geändert `CameraLookInput.cs`, `Aetherfall.CameraSystem.asmdef` | `Scripts/Camera/` | Lock-On-Kamera, Kamera-Wackeln | **ja:** `CM_LockOn`, `CameraShake` |
| geändert: `GameInputBindings.cs`, `GameplayInput.cs`, `IGameplayInput.cs` | `Scripts/Input/` | Zielwechsel (Mausrad/Stick), T als zweite Lock-On-Taste | nein |

### 11.5 Entwickler-Werkzeuge und Editor

| Datei | Ordner | Zweck | Kommt an ein GameObject? |
|---|---|---|---|
| `CombatDebugOverlay.cs` | `Scripts/DevTools/` | Kampf-Overlay links unten | **ja:** `CombatOverlay` |
| `FloatingDamageNumbers.cs` | `Scripts/DevTools/` | Schadenszahlen | **ja:** `DamageNumbers` |
| `TestGroundCombatAssets.cs`, `TestGroundCombatBuilder.cs`, `TestGroundFields.cs`; geändert `TestGroundMenu.cs`, `TestGroundSceneBuilder.cs`, `TestGroundAssets.cs`, `TestGroundPaths.cs`, `TestGroundMaterials.cs`, `ProjectLayers.cs` | `Scripts/Editor/World/` | Menü legt Kampf-Daten, Arena, Puppe und Installer an | nein |

### 11.6 Tests

| Datei | Ordner |
|---|---|
| `CombatStateMachineTests.cs`, `CombatTestData.cs`, `RecordingHitWindow.cs`, `InputBufferTests.cs`, `PoiseMeterTests.cs`, `StabilityMeterTests.cs`, `HitStopTimerTests.cs`, `HitRegistryTests.cs`, `AttackRunnerTests.cs`, `CombatServiceTests.cs`, `CombatStateTrackerTests.cs`, `CombatMathTests.cs`, `TargetingMathTests.cs`, `HitFeedbackTableTests.cs`, `CombatEventPayloadTests.cs`, `CombatStateTextTests.cs`, `EnemyBrainTests.cs`, `EnemyAttackSelectorTests.cs`, `EnemyStateTextTests.cs`, `AttackTokenServiceTests.cs`, `PerceptionMathTests.cs`, `DetectionMeterTests.cs`, `EnemyScalingTests.cs` | `Tests/EditMode/` |
| `PlayerMovementOverrideTests.cs`, `PlayerCombatMotionTests.cs`, geändert `MovementSimulator.cs` | `Tests/EditModeGameplay/` |

---

## 12. Hinweise, Vorschläge und Abweichungen

**Werte zum Ausprobieren** (alle im Inspector änderbar; Asset anklicken, Wert ändern, Play drücken):

| Was | Wert | Wo |
|---|---|---|
| Parierfenster | 0,15 s (GDD „Normal“; Geschichte 0,25 / Schwer 0,12 / Albtraum 0,10) | `Settings/Combat/CombatSettings.asset` › **Parry Window Seconds** |
| Konter-Zeit nach einer Parade | 1,0 s | › **Counter Window Seconds** |
| Eingabepuffer | 0,2 s (Ausweichen/Parieren 0,15 s) | › **Input Buffer Seconds**, **Defensive Buffer Seconds** |
| Kombo-Neustart | nach 0,6 s Pause | › **Combo Reset Seconds** |
| Rolle | 4,2 m in 0,55 s, unverwundbar 0,05–0,35 s, 12 Ausdauer | › **Roll Distance**, **Roll Duration**, **Roll I Frame Start/End**, **Roll Stamina** |
| Hitstop-Stärke | 1 = GDD-Werte, 0 = aus | › **Hit Stop Scale** |
| Tempo eines Angriffs | z. B. leichter Schlag 0,2 s Ausholen / 0,12 s Treffer / 0,5 s Erholung, Kombo-Fenster ab 0,45 s | `Data/Combat/Attacks/Einhandschwert_Leicht1.asset` usw. › **Windup/Active/Recovery Seconds**, **Combo Window Start Seconds** |
| Trefferbox eines Angriffs | Größe und Position vor der Figur | im selben Asset › **Offset**, **Size** |
| Wolf: Haltung | Base Poise 30 (→ 35 auf Level 8) | `Data/Enemies/Grauwolf.asset` › **Base Poise**. Zum Testen des Finishers z. B. **8**: dann bricht schon der erste Treffer die Haltung. Danach bitte wieder **30**. |
| Wolf: Telegrafie | Biss 0,45 s, Schnappen 0,4 s, Sprung 0,65 s Ausholen | `Data/Combat/Attacks/Wolf_….asset` › **Windup Seconds** |
| Kamera-Wackeln | an, Stärke 100 % | Szene › `CameraShake` › **Camera Impulse On Hit** |
| Angreifer gleichzeitig | 2 (GDD „Normal“), mindestens 0,6 s zwischen zwei Angriffsstarts | `Settings/Boot/AIInstaller.asset` › **Melee Tokens**, **Min Start Interval** (wirkt beim nächsten Play) |

**Testwerte der Figur:** Damit der Kampf so ist wie im Rechenbeispiel von GDD 03, 8.3, hat die Figur im Testgelände die Werte eines **Kriegers auf Stufe 10** (Stärke 20, Geschick 10, Konstitution 18, Rüstung 60, etwa 328 LP) und ein Schwert mit Grundschaden 50. Die Rüstung kommt bis zum Ausrüstungs-System aus dem Feld **Test Armor** am `Player Combat Controller`. Mit den Startwerten (Stufe 1, alle Attribute 11, keine Rüstung) bräuchte man etwa 9 leichte Treffer für einen Grauwolf, und ein Biss nähme rund 40 % der LP – das passt nicht zum Ziel „Normalgegner nach 3–5 Treffern“ und sollte im Balancing geklärt werden.

**Bewusste Entscheidungen bzw. Abweichungen in diesem Schritt:**
- **Keine Animationen:** Angriffe laufen über Zeitfenster aus den Daten; die Treffer-Fenster werden genau so geöffnet und geschlossen wie später über Animation Events (`OpenHitWindow`/`CloseHitWindow`). Schwert und Schild bewegt vorerst Code.
- **Trefferzone:** Berührt ein Schlag mehrere Zonen eines Gegners, zählt die Zone, die der Mitte der Trefferbox am nächsten ist (bei fast gleichem Abstand: Schwachpunkt vor Kopf vor Körper). Mit den großen Platzhalter-Boxen wäre sonst fast jeder Treffer ein Kopftreffer.
- **Haltung vs. Lebenspunkte beim Wolf:** Laut GDD 03 stirbt ein Grauwolf nach 3 leichten Treffern (8.3), seine Haltung bricht aber erst nach 4 (4.9). Ein Finisher am Wolf ist deshalb selten (Abschnitt 7.5). Bitte entscheiden: so lassen (Finisher für zähere Gegner) oder Wolf-Haltung senken.
- **Gegnerbewegung ohne NavMesh:** Die Wölfe laufen direkt auf ihr Ziel zu und weichen Hindernissen mit Strahlen aus (geradeaus, ±45°, ±90°). Für das kleine Testgelände reicht das; Wege um größere Hindernisse kommen mit dem NavMesh (TODO im Code).
- **Lock-On-Taste T** zusätzlich zur mittleren Maustaste (Vorschlag), weil Mac-Trackpads und die Magic Mouse keine mittlere Taste haben.
- **„Fokus“** ist als Fokusziel umgesetzt: das Lock-On-Ziel (GDD 03 nennt es „Fokusziel des Spielers“) mit Zielwechsel per Mausrad/Stick. Eine eigene Fokus-Taste gibt es in GDD 03, 1.5 nicht.
- **Waffenkunst** (Q + rechte Maustaste bzw. LB + Y) ist noch nicht eingebaut; solange Blocken gehalten wird, zählt ein schwerer Angriff deshalb nicht. Ausnahme: im Konter-Fenster (1 s nach einer Parade) ist er der Konter (GDD 03, 4.8: „Konter: X oder Y“).
- **Vorschub bei Angriffen:** Figur und Wölfe bewegen sich ab der Hälfte des Ausholens bis zum Ende des Treffer-Fensters nach vorne (Ersatz für die Bewegung aus Animationen). Ein Wolf setzt also schon während der Telegrafie zum Sprung an und dreht sich dabei weiter zu dir; der Sprungangriff legt so die vollen 4 m zurück.
- **Angriffs-Takt:** Die 0,6 s gelten für die Token-Vergabe und zusätzlich für den Angriffsstart selbst. Ein Wolf mit Token, der zu früh dran wäre, wartet kurz und schaut dich an.
- **Rückkehr (Leash):** Ein zurückkehrender Wolf kämpft nur wieder, wenn du ihn triffst (GDD 03, 9.1/9.4); sieht er dich nur, läuft er weiter zurück.
- **Kampfzustand** („Im Kampf“) gilt, solange ein Wolf mit dir kämpft oder bis 5 s nach dem letzten Schaden. Treffer an der Trainingspuppe zählen nicht als Kampf. Im Kampf regenerieren die LP nicht und das Mana nur langsam (GDD 03, 10.3).
- **Finisher** zieht mindestens 35 % der max. LP ab, Normalgegner mit höchstens 15 % LP danach sterben sofort (GDD 03, 4.10). Andere Gegner greifen während des Finishers nicht an.
- **Gegner-IDs** im Overlay sind „Typ#Nummer“, z. B. `enemy.wolf.grauwolf#3` für den Aether-Wolf (gleicher Typ, Variante `aether_verderbt`). Die Beutetabelle ist noch leer (`EnemyKilled` sendet einen leeren Wert).

**Noch nicht enthalten** (kommt später): Animationen und Waffenmodelle, Waffenkunst, Fernkampf und Zauber, Schleichangriff, Sturzangriff, **Ausweichangriff** (leichter Angriff bis 300 ms nach der Rolle, GDD 03, 4.6), Landerolle, **Zeitlupe** bei perfekter Parade (0,25 s auf 30 %) und beim Haltungsbruch (0,3 s auf 40 %, GDD 03, 4.11), eigene **Zuck-Reaktion** der Gegner ab 8 % Haltungsschaden (GDD 03, 4.11; vorerst nur ein stärkerer Rückstoß), Statuseffekte im Kampf, Beute, Erfahrungspunkte, HUD mit Lebensbalken und Gegner-Symbolen (gelb/rot), Kampfmusik, Schwierigkeitsgrade, NavMesh-Wege, Gruppenpositionen und Verstärkung holen.
