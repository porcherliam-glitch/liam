# Welt, Story & Fraktionen

> Teil der Phase-0-Planung · Stand: 2026-10-12 · Quelle: [Master-Prompt](../00_Master-Prompt.md)

**Kennzeichnungen** (wie in [00_Vision_und_Ueberblick](./00_Vision_und_Ueberblick.md)):
- **Vorschlag:** füllt eine Lücke im Master-Prompt.
- **Verbesserungsvorschlag:** weicht bewusst vom Master-Prompt ab. Das Original bleibt erkennbar.
- ❓ **Offene Entscheidung:** liegt beim Auftraggeber. Am Dateiende gesammelt.

**ID-Schema in dieser Datei (Vorschlag, gilt projektweit):** stabile String-IDs in snake_case mit Punkt-Hierarchie (§6.3).

| Präfix | Beispiel | Verwendung |
|---|---|---|
| `region.` | `region.eichental` | Region |
| `loc.<region>.` | `loc.eichental.vergessene_gruft` | Ort, Dungeon, POI, Siedlung |
| `npc.<region>.` | `npc.eichental.bauer_hollmann` | NPC (Begleiter: `npc.begleiter.<name>`) |
| `faction.` | `faction.silberwacht` | Fraktion |
| `quest.<kategorie>.` | `quest.main.asche_ueber_eichental` | Quest |
| `flag.<bereich>.` | `flag.eichental.dorf_zerstoert` | Weltzustand-Flag (Bool) |
| `stat.<bereich>.` | `stat.player.leere_resonanz` | Weltzustand-Zahl |
| `enemy.<familie>.` | `enemy.wolf.grauwolf` | Gegnertyp |
| `boss.<region>.` | `boss.eichental.grimmbart` | Dungeon-, Welt- oder Story-Boss |
| `event.welt.` | `event.welt.riss_ausbruch` | Weltereignis |

**Inhalt**
1. [Setting & Lore](#1-setting--lore-3)
2. [Hauptstory](#2-hauptstory-18)
3. [Weltaufbau](#3-weltaufbau-141)
4. [Regionen](#4-regionen-142)
5. [Content-Mengen](#5-content-mengen-143)
6. [Lebendige Welt & Erkundung](#6-lebendige-welt-144--erkundung-145)
7. [NPCs](#7-npcs-151)
8. [Fraktionen](#8-fraktionen-152)
9. [Ruf-System](#9-ruf-system-153)
10. [Begleiter](#10-begleiter-19)
11. [Gegner-Roster & Bosse](#11-gegner-roster-201--bosse-203)
12. [Offene Entscheidungen](#offene-entscheidungen)
13. [Risiken & Hinweise](#risiken--hinweise)

---

## 1. Setting & Lore (§3)

### 1.1 Der Kontinent und der Große Riss

| Feld | Festlegung |
|---|---|
| Genre | High Fantasy mit dunklen Untertönen (§3) |
| Kontinent | Aetherfall (§3) |
| Zeitrechnung | **Vorschlag:** Jahre „v. R.“ / „n. R.“ (vor/nach dem Riss). Spielbeginn: Herbst 300 n. R., am Erntefest in Eichental. |
| Vor dem Riss | **Vorschlag:** Das Aurelische Kaiserreich beherrschte den Kontinent. Sein Herzland **Caelum** trug die Himmelsakademie, die als Erste Aether-Adern unter der Erde anzapfte. |
| Der Große Riss (Jahr 0) | **Vorschlag:** Unter Caelum brach ein ~3 km breiter Spalt auf, **der Schlund**. Caelum wurde zerrissen, seine Trümmer schweben seitdem als Inseln über dem Schlund. Das ist der **Zerbrochene Himmel** (Region 8). Rund ein Drittel der Bevölkerung starb. Das Kaiserreich zerfiel. Aurelion am Rand des Schlunds überlebte als Hauptstadt ohne Kaiser. |
| Heute | Kleine Risse öffnen sich immer häufiger. Sieben Fraktionen streiten um die Aether-Quellen. Hinter den Rissen erwacht die Leere und verschlingt Landstriche (§3). |

### 1.2 Regeln des Aether (spielmechanisch nutzbar)

**Vorschlag:** Die neun Regeln gelten für Lore-Texte, Quest-Design und Systeme gleichermaßen. Endgültige Zahlen legt [03_Kampf_Charakter_Progression](./03_Kampf_Charakter_Progression.md) fest. Die Werte hier sind Startwerte.

| Nr. | Regel (Lore) | Umsetzung im Spiel |
|---|---|---|
| A1 | **Herkunft:** Aether ist ungeformte Ur-Energie an der Grenze zwischen Welt und Leere. Sie tritt nur an Rissen, Adern und Kristallen aus. | Jede Weltzelle und jedes Volumen hat eine **Aether-Dichte 0–3**. Dichte 3 gibt es nur direkt an Rissen. Sie ist sichtbar als Partikel und Farbstich. |
| A2 | **Macht:** Aether verstärkt jede Magie. | Zauberkraft +10 % bei Dichte 2, +20 % bei Dichte 3. Das gilt für Spieler und Gegner. |
| A3 | **Preis I, Verderbnis:** Jeder Kontakt hinterlässt Spuren im Körper. | Statuseffekt **Aether-Verderbnis** (§9.6) mit Aufbau-Balken 0–100. Aufbau: Dichte 1 = +0,2/s, Dichte 2 = +1/s, Dichte 3 = +3/s. Jeder Einsatz einer Aether-Fähigkeit +2, Treffer eines verderbten Gegners +5. Abbau −2/s bei Dichte 0. |
| A4 | **Preis II, Veränderung:** Lebewesen, die lange in Dichte ≥ 2 leben, mutieren. | Gegnervariante **Aether-verderbt** (§20.1, siehe [11.2](#112-variantensystem)) mit Kristallwucherungen und Kristallkern als Schwachpunkt. |
| A5 | **Aetherbrand:** Die meisten Menschen sterben bei starkem Kontakt. Sie kristallisieren oder werden zu **Gebrochenen**, hirnlosen Kristallghulen. | Riss-Ausbrüche hinterlassen Kristallleichen als Lore- und Loot-Objekte. Gebrochene sind ein Gegnertyp der Rissbrut-Familie. |
| A6 | **Rissgeborene:** Etwa 1 von 10.000 überlebt. Der Körper „lernt“ Aether. | Beim Spieler ist Verderbnis 100 nicht tödlich, sondern löst eine Überflutung aus (Tabelle unten). Das ist die Basis für Aether-Sicht, Riss-Siegel und die Klasse Rissläufer (§11.1). |
| A7 | **Kristallisierung:** Aether verfestigt sich mit der Zeit zu Kristall. | Aether-Kristalle sind Crafting-Material, **Aether-Splitter** die Endgame-Währung (§22). Abbau eines Kristalls kostet +5 Verderbnis. |
| A8 | **Abzapfen dünnt die Grenze:** Wo viel Aether entnommen wird, wird die Haut der Welt dünn und die Leere sickert ein. | Kernkonflikt: Konvent und Gilde zapfen ab, Stämme und Silberwacht warnen. Story-Flags wie `flag.karzul.ir_hamad_verschlungen` lassen **Leere-Zonen** wachsen. |
| A9 | **Risse schließen:** Siegelsteine der Silberwacht schließen einen Riss für ~50 Jahre. Ein Rissgeborener kann ihn dauerhaft schließen. | Fähigkeit **Riss-Siegel**: 5 s kanalisieren, bei Treffer abgebrochen, +30 Verderbnis. Abschluss des Weltereignisses „Riss-Ausbruch“. |

**Verderbnis-Stufen beim Spieler (Vorschlag):**

| Stufe | Balken | Bonus | Malus | Sichtbar/hörbar |
|---|---|---|---|---|
| Rein | 0–24 | – | – | – |
| Berührt | 25–49 | +5 % Aether-Schaden | −5 % erhaltene Heilung | Adern glimmen |
| Durchdrungen | 50–74 | +10 % Aether-Schaden | −10 % Heilung, −10 % Ausdauer-Regeneration | Flüstern im Audio |
| Gezeichnet | 75–99 | +15 % Aether-Schaden | −15 % Heilung. NPCs reagieren ängstlich, Händler +10 % | Augen leuchten |
| Überflutet | 100 | 20 s lang +25 % Aether-Schaden | 20 s lang 2 % max. LP pro Sekunde. Danach fällt der Balken auf 60. | Leuchten, verzerrter Ton |

- **Reinigung:** Silberwacht-Schrein (auf 0), Läuterungstrank (−50, Alchemie), 8 h Schlaf (auf 0), Dichte 0 (−2/s).
- **Begleiter** (keine Rissgeborenen außer Kael): Bei 100 sind sie 3 s betäubt, verlieren 20 % LP, der Balken fällt auf 0.
- Verderbnis ist eine **riskante Ressource**, kein reiner Malus. Das stärkt Säule 6 (Aether-Builds spielen bewusst „heiß“).

**Leere-Resonanz (Story-Wert, Vorschlag):** `stat.player.leere_resonanz`, 0–100.
- Verändert sich **nur durch Story-Entscheidungen**, nie im Kampf. Beispiele: Riss-Aether aufnehmen statt versiegeln +10, Leere-Visionen annehmen +5 bis +15, Pakt mit dem Grauen Wanderer +15, Riss versiegeln −5.
- Bestimmt mit, welche Enden offenstehen (siehe [2.4](#24-enden)), und färbt NPC-Zeilen.
- Ab Akt 3 im Charakterbogen sichtbar, vorher nur durch Flüstern und Visionen angedeutet.

### 1.3 Die Leere

- **Was sie ist (Vorschlag):** das Nichts vor der Schöpfung. Kein Wesen mit Plan, sondern ein Hunger mit Bewusstseinsresten. Sie „erinnert sich“ an alles, was sie verschlingt. Daraus entstehen Echos und Leergeborene.
- **Verhältnis zum Aether:** Aether ist die Haut der Welt. Wo sie reißt oder dünn wird (Regel A8), sickert die Leere ein.

| Erscheinungsform | Beschreibung | Spielmechanik (Vorschlag) |
|---|---|---|
| Leere-Zone | Entsättigte Landstriche, Materie zerfällt zu grauem Staub. | Mana-Regeneration 0. Ohne Schutz −1 % max. LP pro Sekunde. Schutz: **Leere-Laterne** (Questitem Akt 3) mit 120 s Brenndauer, an Aether-Kristallen aufladbar. |
| Leergeborene | Kreaturen aus verschlungenen Erinnerungen: Schatten mit Rissen, deren Form an Verlorenes erinnert (Ritter, Tiere, Kinder). | Gegnerfamilie „Leere“ (ab Akt 3). Schwäche Aether, Resistenz Schatten. |
| Echos | Erinnerungsfetzen an Orten, an denen die Leere fraß. | Rissgeborenen-Fähigkeit **Echo-Lesen** (ab Akt 3) spielt kurze Rückblenden ab. Das ist ein Werkzeug für Lore und Rätsel. |
| Leere-Stille | Kurzzeitige Ausdehnung: Farben verblassen, Geräusche verstummen. | Weltereignis, siehe [6.4](#64-zufällige-weltereignisse). |
| Flüstern | Nur Rissgeborene hören es. | Audio-Hinweise, Visionen, Entscheidungen mit Leere-Resonanz. |

- **Was die Leere will,** bleibt bis Akt 5 bewusst offen. Für das Ende „Leere besänftigen“ muss sie ansprechbar sein: Sie lässt sich mit Erinnerungen „sättigen“, die ihr freiwillig gegeben werden (Motiv „Lied“, siehe [2.4](#24-enden)).

### 1.4 Rissgeborene

| Aspekt | Festlegung |
|---|---|
| Häufigkeit | **Vorschlag:** ~40 bekannte Rissgeborene auf dem Kontinent. Die meisten verstecken sich. |
| Merkmale | Aether-Adern unter der Haut, die bei Verderbnis leuchten. Sie hören das Flüstern der Leere. |
| Ansehen | Silberwacht: „Gefäße“, die beaufsichtigt werden müssen. Konvent: wertvolle Forschungspartner. Kult: „Erwählte“. Wilde Stämme: „Kinder der Wunde“, mit Scheu respektiert. Volk: Angst. |
| Kernfähigkeiten des Spielers (klassenunabhängig, Vorschlag) | 1. **Aether-Stoß** (erste Kraft, Akt 1, ~0:25 Spielzeit). 2. **Aether-Sicht**: Detektiv-Modus aus §16.4, zeigt Aether-Spuren, verborgene Wege und Hinweise. 3. **Riss-Siegel** (Ende Akt 1). 4. **Echo-Lesen** (Akt 3). Die Klasse Rissläufer vertieft diese Fähigkeiten, siehe [03](./03_Kampf_Charakter_Progression.md). |
| Bekannte andere Rissgeborene | Kael (Begleiter), Jorin Falkenried (Bruder von Begleiterin Maren, in Silberwacht-Verwahrung), der Graue Wanderer |

### 1.5 Zeitstrahl der Welt (Vorschlag)

| Jahr | Ereignis | Spielrelevanz |
|---|---|---|
| ~1200 v. R. | Zwerge gründen **Khaz Morund** in den Frostgipfeln und lernen, Aether mit Runen stabil zu binden. | Runenkunde ist Voraussetzung für den Riss-Schlüssel in Akt 4. |
| ~800 v. R. | Gründung des Aurelischen Kaiserreichs, Hauptstadt **Aurelion**. | Ruinen und Lore im ganzen Kontinent |
| ~60 v. R. | Die Himmelsakademie von **Caelum** entdeckt Aether-Adern unter dem Herzland und beginnt das Projekt „Himmelstor“. | Akt-3-Enthüllung, Archiv von Ir-Hamad |
| **0** | **Der Große Riss.** Caelum zerbricht, der Schlund entsteht, das Kaiserreich fällt. | Grundkonflikt, Zerbrochener Himmel |
| 1–30 n. R. | Die Dunklen Jahre: Aetherbrand, erste Rissgeborene, Gebrochene ziehen durchs Land. | Lore-Bücher, Gruften (z. B. die vergessene Gruft im Eichental) |
| 34 n. R. | Gründung der **Silberwacht** in Aurelion, erste Siegelsteine. | Fraktion 1 |
| 61 n. R. | Überlebende Magister gründen den **Aether-Konvent**. | Fraktion 2, Verbindung zum Antagonisten |
| 112 n. R. | **Die Rissjagd:** Die Silberwacht nimmt Rissgeborene in „Verwahrung“. Aether-Magie in Aurelion wird verboten. | Delikt „Verbotene Magie“ in Aurelion, Begleiterquest Maren |
| 147 n. R. | **Charta von Velmara:** Die Handelsgilde erhält das Monopol auf Aether-Kristallhandel. | Fraktion 3, Konflikt mit den Stämmen |
| 190 n. R. | **Der Torschluss:** Die Zwerge verriegeln Khaz Morund. Offizieller Grund: Verrat der Menschen. Wahrer Grund: ein Leere-Einbruch in den Tiefen. | Fraktion 7, Akt 4 |
| 233 n. R. | Erste dokumentierte Leere-Zone, **die Graue Stelle** im Süden von Kar'Zul. Der **Kult der Leere** tritt erstmals auf. | Fraktion 6, Akt 3 |
| 271 n. R. | Der Vulkan **Ashkarr** bricht aus. Feuerelementare tauchen auf, der Kult verschanzt sich in den Glutlanden. | Region 6 |
| 296–299 n. R. | Riss-Ausbrüche verdreifachen sich. Silberwacht und Konvent streiten im **Rat der Sieben** von Aurelion. | Akt-2-Politik |
| **300 n. R.** | Ein Riss verwüstet das Dorf **Eichental** am Erntefest. **Spielbeginn.** | Akt 1 |

### 1.6 Völker und Kulturen

**Vorschlag:** Nur **zwei Völker**, Menschen und Zwerge, dazu Kreaturen. Grund: Jedes weitere Volk kostet Körpermodelle, Animationen, Rüstungsvarianten und Gesichter. Vielfalt entsteht über menschliche Kulturen:

| Kultur | Region | Erkennungsmerkmale |
|---|---|---|
| Aurelier | Aurelion, Eichental | Kaiserreichs-Erbe, Stein und Banner, Ordnung |
| Velmarer | Goldküste | Seefahrt, Handel, bunte Stoffe |
| Moorvolk | Moorschatten | Pfahlbauten, Schilf, Ahnenmasken |
| Sandläufer | Kar'Zul | Nomaden, Tücher, Sternkunde |
| Grünmäntel | Wälder des Eichentals | Waldläufer-Sippen, gehören zu den Wilden Stämmen |
| Nordleute | Frostgipfel (Menschendörfer) | Pelze, Jagd, Handel mit den Zwergen |
| Zwerge von Khaz Morund | Frostgipfel | Runen, Clans, Ahnenkult |

- Hinweis Kar'Zul: Wüstenkulturen werden respektvoll als eigene Fantasy-Kultur gestaltet, ohne reale Klischees zu kopieren (Kleidung, Musik, Namen).

### 1.7 Ton: Ernst und Humor (§3)

**Regeln (Vorschlag):**
1. Die **Hauptstory ist ernst.** Humor kommt dort nur aus Figuren (trockene Begleiterkommentare), nie aus Situationskomik.
2. **Nebenquests und Begleiter** dürfen komisch sein. Jede komische Quest hat aber einen Kern, der ernst genommen wird (Twist, Verlust, Entscheidung).
3. **Kein Humor auf Kosten von Opfern** im selben Moment. Nach einer Tragödie gilt eine „Stille-Regel“ von 5 min ohne Witz-Barks.
4. **Keine Meta-Witze,** keine Popkultur-Zitate, keine vierte Wand. Easter Eggs nur als versteckte Geheimnisse (§23).
5. **Begleiter haben unterschiedliche Humor-Arten** (trocken, frech, schwarz, laut), siehe [10](#10-begleiter-19).

| Situation | Ernste Ebene | Humor-Ebene |
|---|---|---|
| „Die Wölfe vom Nordhang“ | Die Wölfe sind Aether-verändert. Das erste Zeichen, dass der Riss das ganze Tal vergiftet. | Bauer Hollmann hat jedem Schaf einen Namen gegeben und zählt die Vermissten einzeln auf. |
| Velmara, Gildenhaus | Die Gilde verkauft Aether-Kristalle, deren Abbau Oasen tötet. | Ein Patrizier führt den Spieler durch eine endlose Gebührenliste („Atemgebühr im Kontor: 2 Kupfer“). |
| Lagerfeuer nach dem Fall der Oase Ir-Hamad | Ashka trauert um ihren Stamm. | Keine Witze (Stille-Regel). Jasper bietet ihr wortlos seinen Mantel an. |
| Riss-Ausbruch im Moorschatten | Gebrochene, Aetherbrand, Tote | Pater Ludo segnet hinterher die Kröten, „damit wenigstens die in den Himmel kommen“. |
| Akt-3-Enthüllung | Wer den Riss geöffnet hat | Nichts. Die Szene bleibt ernst. |

---

## 2. Hauptstory (§18)

### 2.1 Überblick

Die 5 Akte und ihre Regionen stammen aus §18. Die Zahl der Hauptquests (≈ 60, §16.2) ist hier auf die Akte verteilt (**Vorschlag**). Story-Level nach dem Story-Korridor aus [00](./00_Vision_und_Ueberblick.md#story-level-lücke-wichtig).

| Akt | Titel (§18) | Regionen | Hauptquests | Story-Level | Dauer (Hauptstory) | Akt-Boss |
|---|---|---|---|---|---|---|
| 1 | Der Riss | Eichental | 10 | 1–10 | 6–8 h | Ealdor, der Aschenhirsch |
| 2 | Bündnisse | Goldküste, Moorschatten, Aurelion | 16 | 10–24 | 14–18 h | Hierophant Kaldris |
| 3 | Die Wahrheit im Sand | Sonnenwüste von Kar'Zul | 12 | 24–32 | 9–11 h | Ankhar, der letzte Sonnenkönig |
| 4 | Feuer und Eis | Frostgipfel, Glutlande, Aurelion (Belagerung) | 13 | 32–42 | 10–12 h | Ignareth, der Leere-Drache |
| 5 | Der Zerbrochene Himmel | Zerbrochener Himmel (Story-Bereich) | 9 | 40–48 | 6–8 h | Der Graue Wanderer / Herz der Leere |
| **Σ** | | | **60** | | **45–57 h** | |

```mermaid
flowchart LR
  A1["Akt 1: Der Riss"] --> A2["Akt 2: Bündnisse"]
  A2 --> P{"Pakt mit einer Fraktion"}
  P --> A3["Akt 3: Die Wahrheit im Sand"]
  A3 --> R["Enthüllung: Wer öffnete den Riss?"]
  R --> A4["Akt 4: Feuer und Eis"]
  A4 --> S{"Ally-Score bestimmt die Belagerung"}
  S --> A5["Akt 5: Der Zerbrochene Himmel"]
  A5 --> E{"Wahl des Weges"}
  E --> E1["Siegel"]
  E --> E2["Krone"]
  E --> E3["Lied"]
  E --> E4["Tor"]
```

### 2.2 Der Antagonist und die Akt-3-Enthüllung

In Akt 1 folgt der Spieler einer mysteriösen Gestalt, die den Riss über Eichental geöffnet hat (§18). Arbeitsname: **der Graue Wanderer**. Akt 3 enthüllt, dass der Große Riss absichtlich geöffnet wurde, und von wem (§18). Alle Story-Beats unten funktionieren mit jeder der drei Optionen.

❓ **Offene Entscheidung: Wer hat den Großen Riss geöffnet?**

| Option | Kern | Stärken | Schwächen |
|---|---|---|---|
| **A – Der Magister (empfohlen)** | **Valerian Ascor**, Erzmagister der Himmelsakademie von Caelum, öffnete das „Himmelstor“, um unbegrenzten Aether für das sterbende Kaiserreich zu gewinnen. Er überlebte als erster Rissgeborener und ist der Graue Wanderer. Heute will er das Tor vollständig öffnen, weil er glaubt, die Leere beherrschen zu können. | Klarer Gegenspieler mit nachvollziehbarem Motiv. Der Konvent (von seinen Schülern gegründet) wird moralisch belastet, bleibt aber spielbar. Passt zu allen vier Enden, besonders zu „Aether kontrollieren“ als Versuchung. | Der „größenwahnsinnige Magier“ ist ein bekanntes Muster. Gegenmittel: Er hat recht damit, dass die Leere ohnehin kommt. |
| B – Der Gründer | **Hochmeister Aldric Sturmfels**, Gründer der Silberwacht, öffnete den Riss als Waffe in einem Bürgerkrieg und gründete den Orden, um die Tat zu vertuschen. Die heutige Hochmeisterin weiß davon. Der Graue Wanderer ist ein Rissgeborener, der die Wahrheit enthüllen will, und dabei über Leichen geht. | Starker Twist: Die „Guten“ haben gelogen. Graue Moral. | Bestraft Spieler, die sich der Silberwacht angeschlossen haben. Das Ende „Riss versiegeln“ wird ideologisch belastet. Höherer Schreibaufwand für zwei Antagonisten. |
| C – Der Damm | **Seraphine**, die Erste Rissgeborene, öffnete den Riss **kontrolliert**, um einen viel größeren Einbruch der Leere zu verhindern. Der Riss war ein Ventil. Sie ist der Graue Wanderer und öffnet heute neue Risse, weil das Ventil versagt. | Tragischer Gegenspieler. Die Leere bleibt die eigentliche Bedrohung. Stärkt das Ende „Leere besänftigen“. | Weniger klares Feindbild für Akt 4–5. Erfordert sehr präzises Schreiben. |

**Empfehlung:** Option A mit einem Element aus C. Valerian handelte aus Größenwahn, **aber** seine Warnung, dass die Leere ohnehin durchbrechen wird, stimmt. Das gibt dem Pakt mit ihm (E3.3) echtes Gewicht.

### 2.3 Akte im Detail

#### Akt 1 – Der Riss (Eichental, Level 1–10, 10 Hauptquests)

**Kernbeats:**
1. **Prolog am Erntefest:** Ein Riss öffnet sich über dem Dorf Eichental. Im Lichtsturm steht der Graue Wanderer. Die jüngere Schwester der Spielfigur, **Lina**, wird vom Riss verschluckt (**Vorschlag:** persönlicher roter Faden bis Akt 5).
2. Die Spielfigur berührt den Aether und überlebt. Sie erwacht in der Asche und sucht Überlebende (Hauptquest „Asche über Eichental“, §16.9).
3. Erste Aether-Kraft (Aether-Stoß). Erste Kämpfe gegen Risslinge und Wölfe.
4. Eine Silberwacht-Patrouille unter **Ser Maren Falkenried** will den Rissgeborenen prüfen (E1.1).
5. Die Spur des Wanderers führt zum **Steinkreis von Altenhain** und zu einem verbrannten Brief mit dem Siegel des Hafens von Velmara.
6. Der Dorfvogt überlässt der Spielfigur das verfallene Anwesen **Gut Eichenruh** (§21, Haus Stufe 1).
7. Der Hüter des Tals, ein uralter Hirschgeist, ist vom Riss verdorben. Bosskampf gegen **Ealdor, den Aschenhirsch**.
8. Die Spielfigur schließt oder nutzt den Eichental-Riss (E1.3), lernt das Riss-Siegel und bricht zur Goldküste auf.

**Hauptquests (Vorschlag, IDs `quest.main.*`):**

| Nr. | Titel | ID |
|---|---|---|
| 1 | Asche über Eichental (§16.9) | `quest.main.asche_ueber_eichental` |
| 2 | Die Prüfung der Silberwacht | `quest.main.pruefung_der_silberwacht` |
| 3 | Spuren im Lichtsturm | `quest.main.spuren_im_lichtsturm` |
| 4 | Der Steinkreis von Altenhain | `quest.main.steinkreis_von_altenhain` |
| 5 | Ein Dach über dem Kopf | `quest.main.ein_dach_ueber_dem_kopf` |
| 6 | Stimmen aus dem Riss | `quest.main.stimmen_aus_dem_riss` |
| 7 | Der Hüter des Tals | `quest.main.hueter_des_tals` |
| 8 | Der Zorn des Waldes (Boss) | `quest.main.zorn_des_waldes` |
| 9 | Das erste Siegel | `quest.main.das_erste_siegel` |
| 10 | Nach Westen | `quest.main.nach_westen` |

**Entscheidungen:**

| ID | Entscheidung | Optionen | Sofort | Verzögert | Flag |
|---|---|---|---|---|---|
| E1.1 | Prüfung der Silberwacht | annehmen / fliehen | Annehmen: Maren schließt sich als Aufpasserin an (Loyalität 40). Fliehen: Maren stellt den Spieler am Nordhang, nach Duell oder Gespräch schließt sie sich an (Loyalität 25). | Annehmen: Silberwacht +100, in Aurelion legaler Status per Siegelbrief. Fliehen: Silberwacht −50, in Aurelion gilt das Delikt „Verbotene Magie“. | `flag.main.a1_pruefung_angenommen` |
| E1.2 | Wen rettest du zuerst? | Mühle (Müllerin Berta, zwei Kinder) / Kapelle (Bruder Anselm, Verwundete) | Die andere Gruppe stirbt. | Mühle: Wiederaufbau mit Bäckerei, günstige Nahrung. Kapelle: Heilschrein im Dorf (kostenlose Reinigung). Anselm erscheint in Akt 4 als Feldkaplan. | `flag.eichental.gerettet_muehle` / `flag.eichental.gerettet_kapelle` |
| E1.3 | Eichental-Riss | versiegeln / Aether aufnehmen | Versiegeln: Silberwacht +50, Leere-Resonanz −5. Aufnehmen: Aether-Stoß sofort Stufe 2, Leere-Resonanz +10. | Aufnehmen: Ein ruhender Riss (Dichte 1) bleibt, mit abbaubaren Kristallen in der Nähe. Der Wiederaufbau dauert eine Stufe länger. | `flag.eichental.riss_versiegelt` |

#### Akt 2 – Bündnisse (Goldküste, Moorschatten, Aurelion, Level 10–24, 16 Hauptquests)

**Kernbeats:**
1. **Velmara:** Das Hafenregister zeigt, dass der Graue Wanderer große Mengen Aether-Kristalle von der Handelsgilde gekauft hat.
2. **Akademie Lumenspitze:** Der Aether-Konvent untersucht die Spielfigur. Erste Vision der Leere (Lina ruft).
3. **Moorschatten:** Ein Totenriss bei Bernwald erweckt Untote. Die Silberwacht jagt den Hexenzirkel, das Moorvolk schützt ihn. Die Hexen wissen mehr über Rissgeborene als jede Fraktion.
4. **Aurelion:** Im Rat der Sieben bieten fünf Fraktionen Hilfe gegen die Leere an, jede mit einem Preis (Tabelle unten).
5. **Die Nacht der Stillen Glocken:** Der Kult der Leere greift die Ratsversammlung an. Hierophant Kaldris öffnet einen Riss im Glockenturm. Bosskampf.
6. **Der Pakt:** Die Spielfigur wählt eine Hauptverbündete (E2.4). Mit dem Pakt werden die Ausschlussregeln der Fraktionen wirksam (siehe [8.3](#83-ausschlussregeln-wiederspielwert)).
7. Ausblick: Der Wanderer sucht die Grabmäler der Sonnenkönige in Kar'Zul.

**Der Preis der Fraktionen (Vorschlag):**

| Fraktion | Hilfe | Preis |
|---|---|---|
| Silberwacht | Ritter-Eskorte, Siegelsteine | **Siegelband**: Die Verderbnis bleibt maximal bei 74 (keine Überflutung), dafür +10 % Aether-Resistenz. Entfernbar ab Akt 4. |
| Aether-Konvent | Leere-Laterne früher, Wissen über Echos | Blutproben und Experimente: Leere-Resonanz +10 |
| Handelsgilde | Schiff, 5.000 Gold, Karawane | Unterstützung der Kristallcharta-Erweiterung: Wilde Stämme −300 |
| Schattenhand | Informanten, Zugang zum Ratsarchiv | Diebstahl eines Siegelsteins aus der Silberwacht-Schatzkammer: Silberwacht −200, falls entdeckt |
| Wilde Stämme | Sandläufer-Führer durch Kar'Zul, das Wissen vom „Lied“ | Sabotage einer Gilden-Aethermine: Handelsgilde −300 |
| Kein Pakt (Alleingang, **Vorschlag**) | – | Keine Eskorte. Ally-Score in Akt 4 niedriger, dafür bleiben alle Fraktionen offen. |

**Entscheidungen:**

| ID | Entscheidung | Optionen | Konsequenz | Flag |
|---|---|---|---|---|
| E2.1 | Kristalllager der Gilde in Velmara | beschlagnahmen lassen / schützen / selbst ausräumen | Silberwacht + bzw. Gilde + bzw. Schattenhand +. In Akt 4 fehlen oder liefern die Kristalle Material für den Riss-Schlüssel. | `stat.goldkueste.kristalllager` (1/2/3) |
| E2.2 | Hexenzirkel im Moorschatten | ausliefern / schützen | Ausliefern: Silberwacht +200, Stämme −300, Kräuterfrau Ysolde flieht aus dem Eichental. Schützen: umgekehrt. Bedingung für das Ende „Lied“. | `flag.moorschatten.zirkel_geschuetzt` |
| E2.3 | Nacht der Stillen Glocken | Ratsherrin Elvira Quast (Konvent) retten / Glockenviertel evakuieren | Rettung: Der Konvent stimmt im Rat für den Spieler. Evakuierung: Das Glockenviertel bleibt bewohnt, sonst brennt es ab. | `flag.aurelion.glockenviertel_gerettet` |
| E2.4 | Der Pakt | Silberwacht / Konvent / Gilde / Schattenhand / Stämme / keiner | Bestimmt Expedition, Ally-Score, Enden | `flag.main.pakt_<fraktion>` (genau eines) |

#### Akt 3 – Die Wahrheit im Sand (Kar'Zul, Level 24–32, 12 Hauptquests)

**Kernbeats:**
1. Expedition mit der Pakt-Fraktion zur Karawanserei Drei Brunnen. Begegnung mit den Sandläufer-Nomaden (Begleiterin Ashka).
2. **Grabmal der Sonnenkönige:** Licht- und Spiegelrätsel. Die Spielfigur lernt **Echo-Lesen**.
3. **Echo-Sequenzen (Vorschlag):** 3 kurze spielbare Rückblenden ins Jahr 0, in denen der Spieler eine Figur in Caelum steuert. Die Assets werden mit Farbfilter wiederverwendet.
4. **Oase Ir-Hamad:** Die Graue Stelle dehnt sich aus (E3.2).
5. **Archiv von Ir-Hamad:** Die **Vier Tafeln** beschreiben vier Wege, einen Riss zu beenden: Siegel, Krone, Lied, Tor. Damit sind die Enden im Spiel benannt.
6. **Die Enthüllung:** Wer den Großen Riss geöffnet hat (Option A/B/C).
7. Der Graue Wanderer erscheint und bietet einen Pakt an (E3.3).
8. Boss **Ankhar, der letzte Sonnenkönig**. Danach entzündet der Kult Signalfeuer über allen Regionen: offener Krieg (Übergang zu Akt 4).

| ID | Entscheidung | Optionen | Konsequenz | Flag |
|---|---|---|---|---|
| E3.1 | Die Wahrheit | dem Rat offenlegen / geheim halten / an die Schattenhand verkaufen | Offenlegen (bei Option A): Konvent −300, Silberwacht +150, Unruhen in Aurelion. Geheim halten: Druckmittel gegen den Konvent als Dialogoptionen in Akt 4. Verkaufen: 3.000 Gold, Schattenhand +200, Wahrheit wird als Gerücht verzerrt. | `stat.main.wahrheit` (1/2/3) |
| E3.2 | Oase Ir-Hamad | Nomaden evakuieren / Archiv sichern | Evakuieren: Ally-Score +1, Stämme +200, nur 2 von 4 Tafeln. Die anderen 2 gibt es über das Geheimnis von Kar'Zul und eine legendäre Quest. Archiv sichern: alle 4 Tafeln, Oase verschlungen, Ashka-Loyalität −25. | `flag.karzul.ir_hamad_verschlungen` |
| E3.3 | Pakt mit dem Grauen Wanderer | annehmen / ablehnen | Annehmen: Leere-Resonanz +15. Er hilft in Akt 4 gegen den Kult und öffnet das Ende „Krone“ über ihn. In Akt 5 verrät er den Spieler, außer die Leere-Resonanz ist ≥ 50. Ablehnen: Er sabotiert in Akt 4 den Riss-Schlüssel, eine Zusatzquest wird nötig. | `flag.main.a3_pakt_wanderer` |

#### Akt 4 – Feuer und Eis (Frostgipfel, Glutlande, Level 32–42, 13 Hauptquests)

**Kernbeats:**
1. **Die Signalfeuer:** Der Kult greift an mehreren Orten gleichzeitig an. Nur einen Ort kann der Spieler sofort verteidigen (E4.1). „Städte fallen“ (§18).
2. **Frostgipfel:** Das Tor von Khaz Morund muss geöffnet werden (E4.2). In den Tiefen liegt der **Runenamboss**, und dort sitzt die Wahrheit über den Torschluss: ein Leere-Einbruch.
3. **Glutlande:** Durchbruch zur Kathedrale der Stille. Bergung des **Aether-Herzens** aus dem Krater Ashkarr.
4. Schmieden des **Riss-Schlüssels** aus Runenamboss, Aether-Herz und Kristallen.
5. **Die Belagerung von Aurelion:** Der Verlauf hängt vom **Ally-Score** ab (Tabelle unten).
6. **Begleiter-Krise:** Begleiter mit Loyalität ≤ 10 verlassen die Gruppe. Kael, Jasper und Maren können sich gegen den Spieler stellen (siehe [10.3](#103-loyalität)).
7. Boss **Ignareth, der Leere-Drache**, über dem Krater Ashkarr.
8. Der Himmelssteg am Schlundrand von Aurelion öffnet sich.

**Ally-Score (Vorschlag):** Zahl, die beim Start der Belagerung berechnet wird (`stat.main.ally_score`).

| Quelle | Punkte |
|---|---|
| Pakt-Fraktion (E2.4) | +2 |
| Jede weitere Fraktion mit Ruf ≥ Geachtet | +1 (max. +3) |
| Tor von Khaz Morund friedlich geöffnet (E4.2) | +1 |
| Nomaden von Ir-Hamad evakuiert (E3.2) | +1 |
| Verschonte Banditin Rika Dornfeld als Informantin in Aurelion (§16.5) | +1 |
| Je 2 Begleiter mit Loyalität ≥ 70 | +1 (max. +2) |

| Ally-Score | Ergebnis der Belagerung |
|---|---|
| ≥ 6 | Aurelion hält. Zusätzliche Truppen in Akt 5. |
| 3–5 | Glockenviertel und Hafenviertel fallen. Wiederaufbau als Endgame-Questreihe. |
| ≤ 2 | Halb Aurelion wird zerstört. Händler ziehen in ein Notlager. Endgame-Questreihe „Aurelion erhebt sich“. |

| ID | Entscheidung | Optionen | Konsequenz | Flag |
|---|---|---|---|---|
| E4.1 | Signalfeuer | Velmara verteidigen / Kaltenbrunn (Frostgipfel) verteidigen | Der andere Ort brennt: Velmaras Hafen wird zur Ruine, oder Kaltenbrunn wird zum Flüchtlingslager. Dauerhaft bis zu einer Wiederaufbau-Quest. | `flag.goldkueste.velmara_gebrannt` / `flag.frostgipfel.kaltenbrunn_gefallen` |
| E4.2 | Tor von Khaz Morund | Gundra überzeugt den Ahnenrat / Runenamboss stehlen | Überzeugen: Zwerge werden Verbündete, Ally-Score +1. Stehlen: Zwerge bleiben feindlich bis zu einer Sühnequest nach der Story. | `flag.frostgipfel.tor_offen` |
| E4.3 | Gefangene Kultisten | hinrichten / bekehren / freilassen | Bekehren: ein abtrünniger Kult-Zweig bietet nach der Story Händler und Quests. Freilassen: Sie verstärken den Kult in Akt 5. | `stat.glutlande.kultisten` (1/2/3) |

#### Akt 5 – Der Zerbrochene Himmel (Story-Bereich, Level 40–48, 9 Hauptquests)

**Kernbeats:**
1. Aufstieg über den Himmelssteg mit dem Riss-Schlüssel.
2. **Ankerplatz:** Brückenkopf der Pakt-Fraktion auf der ersten Insel.
3. **Echo-Stadt Caelum:** Ruinen der Himmelsakademie. Lina erscheint als Echo.
4. Abschied der Begleiter: Wer hohe Loyalität hat, kommt mit bis ins Herz des Risses.
5. Konfrontation mit dem Grauen Wanderer, als Kampf oder als Verhandlung (E3.3).
6. **Herz der Leere:** Wahl des Weges. Gesperrte Wege werden grau angezeigt, mit Grund („Du hast den Zirkel ausgeliefert“). So sieht der Spieler, dass andere Entscheidungen etwas anderes bewirkt hätten (Säule 2).
7. Finale je nach Ende.
8. **Epilog:** Pro Region, Fraktion und Begleiter ein Standbild mit Text (günstig umsetzbar). Danach Rückkehr in die offene Welt.

**Akt-5-Bereich:** Der Story-Teil des Zerbrochenen Himmels hat ein festes Level (Story-Korridor). Die offene Endgame-Region (Level 60–80) wird erst nach dem Finale vollständig freigeschaltet (§18).

### 2.4 Enden

§16.5 fordert mindestens 4 Enden, §18 nennt sie: Riss versiegeln, Aether kontrollieren, Leere besänftigen, selbst Teil der Leere werden. Die Bedingungen sind ein **Vorschlag**.

| Ende | Bedingungen (Fraktionen, Flags, Entscheidungen) | Weltzustand danach | Endgame-Auswirkung |
|---|---|---|---|
| **1 – Siegel** (Riss versiegeln) | Riss-Schlüssel geschmiedet **und** Leere-Resonanz ≤ 69 **und** (Pakt Silberwacht **oder** Silberwacht ≥ Geachtet **oder** Tor von Khaz Morund offen) | Aether nimmt um ~70 % ab, Magie wird schwächer. Leere-Zonen heilen langsam. Die Silberwacht wird zur führenden Macht. | Zerbrochener Himmel stabil. Riss-Expeditionen heißen „Echo-Risse“. Aether-Splitter −25 %, dafür Siegel-Sets als Belohnung. |
| **2 – Krone** (Aether kontrollieren) | Leere-Resonanz 20–79 **und** (Pakt Konvent **oder** Pakt Gilde **oder** Pakt mit dem Wanderer) | Aether-Türme speisen Städte. Wohlstand, aber Stämme und Zwerge gehen in Opposition. Neue Risse entstehen dort, wo zu viel abgezapft wird. | Aether-Splitter +25 %. Weltereignis „Aether-Turm überlastet“. Stämme starten als Misstrauisch. |
| **3 – Lied** (Leere besänftigen) | Alle 4 Tafeln gefunden **und** Leere-Resonanz 30–79 **und** (Zirkel geschützt **oder** Wilde Stämme ≥ Geachtet) | Die Leere zieht sich zurück. Risse bleiben offen, aber ruhig. Leere-Zonen werden zu „Stillen Gärten“. Lina kann erlöst werden. | Neues Biom „Stiller Garten“. Leergeborene teils friedlich. Der Kult spaltet sich in Pilger und Fanatiker. |
| **4 – Tor** (Teil der Leere werden) | Leere-Resonanz ≥ 70 **oder** Kult-Pfad (siehe [8.2](#82-die-sieben-fraktionen)) | Die Spielfigur wird zum Herold der Leere. Die Welt liegt in Dämmerung, Leere-Zonen wachsen in Kar'Zul und den Glutlanden. | Die meisten Fraktionen starten als Feindlich. Der Kult wird Händler und Questgeber. Eigene Endgame-Questreihe „Hof der Stille“. |
| **Rückfall – Brüchiges Siegel** | Keine der Bedingungen oben erfüllt | Der Riss wird notdürftig geschlossen und bricht nach der Story wieder auf. | Endgame-Questreihe „Das Siegel hält nicht“, die in Ende 1 mündet. |
| **5 – Das Opfer** (**Vorschlag**) | Bedingungen von Ende 1 oder 3 **und** ein Begleiter mit Loyalität ≥ 90 ist in der Gruppe | Der Begleiter opfert sich. Der Riss wird versiegelt, **ohne** dass der Aether schwindet: das hellste Ende, mit spürbarem Verlust. | Der Begleiter fehlt dauerhaft. Gedenkstätte im Haus. Einzigartiger Titel. |

- Jeder Spielstand erreicht **mindestens ein Ende** (Rückfall). Keine Sackgasse.
- Mit E2.2, E3.2 und E3.3 schließen sich Enden gegenseitig aus. Das erfüllt „Kein Spieler soll beim ersten Durchgang alles sehen können“ (§16.5).

### 2.5 Nach der Story und New Game+

**Nach der Story (§18):**
- Die Welt bleibt offen. Weltzustand, Fraktionen und Händler richten sich nach dem Ende (Tabelle oben).
- Der Zerbrochene Himmel wird vollständig freigeschaltet (Level 60–80, Weltstufen, Riss-Expeditionen). Details in [04](./04_Items_Crafting_Wirtschaft_Endgame.md).

**New Game+ (Vorschlag, Kurzbeschreibung):**

| Bereich | Regel |
|---|---|
| Wird übernommen | Level, Skills, Ausrüstung (ohne Questitems), Rezepte, Berufsstufen, Sammlungen, Titel, Erfolge |
| Wird zurückgesetzt | Quests, Weltzustand, Fraktionsruf, Begleiter-Loyalität, Haus, Gold auf 25 % |
| Gegner | Regionslevel +20, mindestens Spielerlevel −5. Bis NG+3 stapelbar, ab NG+2 mit Champion-Affixen (§20.1). |
| Neu | ~150 „Déjà-vu“-Zeilen: Der Wanderer erkennt die Spielfigur, Lina erinnert sich. Neue Prolog-Option „Den Wanderer am Riss stellen“ als kurzer Kampf, der verloren werden darf. NG+-exklusive Items und Rezepte (siehe [04](./04_Items_Crafting_Wirtschaft_Endgame.md)). |

### 2.6 Die Spielerfigur (Rissgeborener)

| Aspekt | Festlegung |
|---|---|
| Herkunft | **Vorschlag:** fest, Bewohner des Dorfes Eichental. Der Prolog braucht diese Bindung. |
| Hintergrund | **Vorschlag:** 3 wählbare Hintergründe ohne Werte-Effekt: „Kind der Schmiede“, „Findelkind der Kapelle“, „Heimkehrer“ (ehemaliger Söldner). Je ~15 zusätzliche Dialogzeilen und 1 eigene Nebenquest. |
| Familie | Jüngere Schwester **Lina**, im Prolog vom Riss verschluckt. Roter Faden bis Akt 5. |
| Name | Frei wählbar. NPCs sprechen die Figur mit Titeln an („Rissgeborene/r“, später Fraktionstitel). Der Name wird nie vertont. |
| Geschlecht und Aussehen | ❓ **Offene Entscheidung** (bereits in [00](./00_Vision_und_Ueberblick.md)): Empfohlen: frei gestaltbar, 2 Körpertypen, Presets und wenige Regler. Pronomen getrennt vom Körpertyp wählbar. |
| Stimme | ❓ **Offene Entscheidung:** Empfohlen: Protagonist ohne Sprachausgabe in Dialogen, aber mit 2 Sets Kampf- und Anstrengungslauten. Spart bei DE + EN geschätzt 8.000–12.000 vertonte Zeilen. |
| Persönlichkeit | Dialogoptionen mit Tonfall (empathisch, pragmatisch, spöttisch). Keine Gut/Böse-Leiste. |
| Volk | Mensch (siehe [1.6](#16-völker-und-kulturen)). |

---

## 3. Weltaufbau (§14.1)

### 3.1 Weltgröße (Vorschlag)

**Technische Grenze:** Alle spielbaren Punkte liegen ≤ 8 km vom Ursprung, die Welt misst also höchstens 16 × 16 km. Das Raster besteht aus Zellen von 512 m (siehe [03_Technik-Recherche](../Technik/03_Technik-Recherche.md)).

**Vorschlag:**
- **Kontinent:** Raster von 8 × 8 km (64 km², 16 × 16 Zellen). Davon sind **~41 km² begehbar**. Der Rest ist Meer, Gebirgskulisse und der Schlund.
- **Zerbrochener Himmel:** eigener Weltbereich von ~5 km² mit eigenem Ursprung. Erreichbar über den Himmelssteg mit einer Aufstiegs-Sequenz, die das Laden verdeckt.
- **Gesamt begehbar: ~46 km².** Zum Vergleich: Für Skyrim werden häufig ~37–40 km² genannt (Schätzung, keine offizielle Angabe).

**Laufzeiten** (Bewegungswerte als Vorschlag, endgültig in [03](./03_Kampf_Charakter_Progression.md): Laufen 5 m/s, Sprinten 7 m/s, Pferd im Galopp 13 m/s):

| Strecke | Luftlinie | Laufen | Pferd |
|---|---|---|---|
| Eichental quer | 2,2 km | ~7 min | ~3 min |
| Dorf Eichental → Velmara | 4 km | ~13 min | ~5 min |
| Kontinent West → Ost | 8 km | ~27 min | ~10 min |
| Kontinent diagonal | 11 km | ~37 min | ~14 min |

Diese Zeiten liegen in einer Größenordnung, in der Schnellreise eine Bequemlichkeit bleibt und keine Pflicht wird.

**Content-Dichte:** Die 90-Sekunden-Regel aus [00](./00_Vision_und_Ueberblick.md#säule-1--erkundung-belohnt-immer) bedeutet bei 5 m/s alle ~450 m einen Interessenspunkt. Auf 41 km² sind das mindestens ~200 Punkte entlang der Wege. Die Mindestmengen aus §14.3 ergeben ~70 markierte Orte je Region, also ~560 auf dem Kontinent (~12 je km²). Das reicht, wenn die Orte gleichmäßig verteilt sind.

| Region | Begehbare Fläche | ≈ Zellen (512 m) | Begründung |
|---|---|---|---|
| Eichental | 4 km² | 16 | Startregion: dicht, überschaubar, Tutorial |
| Goldküste | 7 km² | 28 | Große Stadt Velmara und Küstenlinie |
| Moorschatten | 6 km² | 24 | Nebel und Sicht < 50 m lassen die Region größer wirken |
| Kar'Zul | 8 km² | 32 | Weite ist Teil der Fantasie. Darf dünner besiedelt sein, aber nicht leer. |
| Frostgipfel | 7 km² | 28 | Viel Vertikalität, die begehbare Grundfläche ist kleiner als sie wirkt |
| Glutlande | 6 km² | 24 | Lavaflüsse begrenzen den Raum |
| Aurelion | 3 km² | 12 | Stadt ~1,2 km² plus Umland und Schlundrand |
| Zerbrochener Himmel | 5 km² | eigener Bereich | Inseln, vertikal, teils prozedural |
| **Summe** | **46 km²** | | |

**Ehrliche Einordnung:**
- Welt-Art (Terrain, Vegetation, Set-Dressing, Wege, Beleuchtung) kostet mit einem fertigen Asset-Kit grob **25–40 Personentage (PT) je km²**. Für 46 km² sind das ~1.150–1.850 PT, also **5–8 Personenjahre** allein für die Welt-Art. Quests, Dungeons und Figuren kommen noch dazu.
- Realistische Etappen: Vertical Slice ~1 km² Eichental plus 1 Küstenzelle. Stufe B ~18 km² (Eichental, Goldküste, Moorschatten, Aurelion-Hub).
- **Verbesserungsvorschlag:** Liegt der gemessene Wert nach Stufe A über 40 PT/km², werden Kar'Zul und die Frostgipfel auf 70 % ihrer Fläche verkleinert. Original (§14.1): „eine große, zusammenhängende offene Welt“ – das bleibt erhalten, nur kleiner.

### 3.2 Nachbarschaft der Regionen

Lage (**Vorschlag**): Aurelion liegt in der Mitte am Rand des Schlunds, darüber schwebt der Zerbrochene Himmel. Das Eichental liegt im Südwesten, die Goldküste im Westen, der Moorschatten im Süden, Kar'Zul im Südosten, die Glutlande im Osten, die Frostgipfel im Norden.

```mermaid
graph LR
  EI["Eichental (1-10)"] ---|"Mühlbachfurt"| GK["Goldküste (10-20)"]
  EI ---|"Kronenhügel-Pass"| AU["Aurelion (20-60)"]
  EI ---|"Krähenmoor"| MS["Moorschatten (18-28)"]
  GK ---|"Fluss Aurel"| AU
  MS ---|"Dunkelstrom-Fähre"| AU
  MS ---|"Bleiche Klippen"| KZ["Kar'Zul (25-38)"]
  AU ---|"Sonnentor-Schlucht"| KZ
  AU ---|"Grauer Kamm"| FG["Frostgipfel (35-48)"]
  KZ ---|"Obsidianrücken"| GL["Glutlande (45-60)"]
  FG ---|"Dampfpass"| GL
  AU ---|"Himmelssteg"| ZH["Zerbrochener Himmel (60-80)"]
```

| Grenze | Natürliche Grenze (§14.1) | Übergänge |
|---|---|---|
| Eichental – Goldküste | Fluss Silberlauf mit Steilufer | Mühlbachfurt, Fähre bei Möwenbucht |
| Eichental – Aurelion | Hügelkette Kronenhügel | Kronenhügel-Pass (Straße) |
| Eichental – Moorschatten | Krähenmoor (Sumpfgürtel) | Bohlenweg |
| Goldküste – Aurelion | Fluss Aurel (Delta bei Velmara) | Brücke und Flussschiff |
| Moorschatten – Aurelion | Fluss Dunkelstrom | Dunkelstrom-Fähre |
| Moorschatten – Kar'Zul | Bleiche Klippen (Steilstufe ~80 m) | Serpentinenpfad, später Gleitschirm abwärts |
| Aurelion – Kar'Zul | Sonnentor-Schlucht | Karawanenstraße |
| Aurelion – Frostgipfel | Gebirgsausläufer Grauer Kamm | Bergstraße (im Winter-Wetter gesperrt, Umweg) |
| Kar'Zul – Glutlande | Obsidianrücken | Schwarzer Pass |
| Frostgipfel – Glutlande | Gebirge, wo Eis auf Lava trifft | Dampfpass |
| Aurelion – Zerbrochener Himmel | Der Schlund (~3 km breit) | Himmelssteg (ab Ende Akt 4) |

**Regionsfreigabe:** Keine unsichtbaren Wände. Regionen mit hohem Level sind früh betretbar, aber gefährlich (§14.1: „gefährliche Ausnahmen“). Harte Sperren gibt es nur für Story-Bereiche (Kathedrale der Stille, Herz des Risses).

### 3.3 Streaming-Hinweis

- Jede Region besteht aus Zellen (512 m) als additive Szenen, geladen über Addressables in Ringen. Dungeons und große Innenräume sind eigene Szenen mit Ladebildschirm (§4.4).
- Jede Zelle gehört zu genau einer Region (für Musik, Wetter, Gegnerlevel, Fundort-Zähler). Feinere Übergänge laufen über Volumes.
- Aurelion braucht wegen der Objektdichte eventuell kleinere Zellen (256 m). Das wird im Prototyp gemessen.
- Details: [Technik/01_Architektur](../Technik/01_Architektur.md) und [Technik/03_Technik-Recherche](../Technik/03_Technik-Recherche.md).

---

## 4. Regionen (§14.2)

### 4.0 Übersicht

Name und Level stammen aus §14.2. Alles andere ist ein **Vorschlag**.

| # | Region | ID | Level | Biom | Hauptkonflikt | Präsente Fraktionen | Regionsmechanik | Wetter |
|---|---|---|---|---|---|---|---|---|
| 1 | Das Eichental | `region.eichental` | 1–10 | Mischwald, Felder, Hügel | Riss-Verwüstung und Wiederaufbau, Banditen nutzen das Chaos | Silberwacht (Vorposten), Wilde Stämme (Grünmäntel), Kult (Zelle) | Keine harte Mechanik. Sanfte Aether-Nachbeben am Riss (Dichte 1–2). | Klar, Regen, Gewitter, Morgennebel |
| 2 | Die Goldküste | `region.goldkueste` | 10–20 | Klippen, Strände, Weinberge, Hafenstadt | Gilde gegen Piraten und Schmuggler, Aether-Kristallhandel | Handelsgilde (Sitz), Aether-Konvent (Sitz), Schattenhand, Silberwacht | **Gezeiten:** Ebbe öffnet Watthöhlen und Wracks. Schwimmen und Tauchen. | Klar, Regen, Sturm, Seenebel |
| 3 | Der Moorschatten | `region.moorschatten` | 18–28 | Nebelsumpf, Schilf, versunkene Ruinen | Silberwacht-Hexenjagd gegen Moorvolk und Hexen, Totenriss erweckt Untote | Wilde Stämme (Sitz), Silberwacht, Kult | **Gift-Sumpf** (Gift-Aufbau im Wasser), Irrlichter führen in die Irre, Untote meiden Fackellicht | Nebel (häufig), Regen, Schwüle |
| 4 | Die Sonnenwüste von Kar'Zul | `region.karzul` | 25–38 | Dünen, Felsplateaus, Oasen, Grabmäler | Die Leere frisst Oasen, Konvent-Grabungen gegen Nomaden | Wilde Stämme (Sandläufer), Aether-Konvent, Handelsgilde, Kult | **Hitze** am Tag, Kälte in der Nacht, Treibsand | Klar, Hitzewelle, Sandsturm |
| 5 | Die Frostgipfel | `region.frostgipfel` | 35–48 | Hochgebirge, Gletscher, Zwergenfestung | Zwerge isoliert, Leere aus den Tiefen, Runenbrecher | Zwerge (Sitz), Silberwacht, Kult | **Kälte als Überlebensmechanik** (§14.2), Lawinen, glattes Eis | Klar, Schneefall, Schneesturm, Bergnebel |
| 6 | Die Glutlande | `region.glutlande` | 45–60 | Vulkane, Lavaflüsse, Ascheebenen | Der Kult (Aschenzungen) beherrscht den Vulkan, Flüchtlinge | Kult der Leere (Sitz), Silberwacht, Zwerge | **Hitze und Lava**, Schwefelzonen, Ausbruchszyklus alle 3 Spieltage | Ascheregen, Hitzewelle, Glutsturm |
| 7 | Die Hauptstadt Aurelion | `region.aurelion` | 20–60 | Großstadt mit Vierteln, Schlundrand | Politik im Rat der Sieben, Intrigen, Schattenhand gegen Obrigkeit | Alle; Silberwacht und Schattenhand (Sitze) | **Stadtregeln:** hohe Wachendichte, Sperrstunde 22–5 Uhr, Dächerwege, Viertel wachsen mit der Story (§14.2) | Klar, Regen, Gewitter, Smog über der Senke |
| 8 | Der Zerbrochene Himmel | `region.zerbrochener_himmel` | 60–80 | Schwebende Inseln im Riss | Die Leere selbst, Reste von Caelum | Pakt-Fraktion (Ankerplatz), Kult | **Inseldrift** (Layout ändert sich wöchentlich), Schwerkraft-Anomalien, Leere-Zonen, Abgründe | Aethersturm, Leere-Stille, Klar |

**Aurelion „wächst mit der Story“ (§14.2, Vorschlag):**

| Viertel | Level | Frei ab |
|---|---|---|
| Gildenmarkt, Glockenviertel, Hafenviertel | 20–26 | Akt 2 |
| Tempelviertel (Ordensburg Weißwall), Die Senke (Unterstadt) | 22–30 | Akt 2 |
| Kronenviertel (Rat der Sieben, Adel) | 30–40 | Akt 3 |
| Kanalisation und Katakomben (Dungeon-Netz) | 25–45 | Akt 2, tiefere Ebenen später |
| Schlundrand (Ruinen des Kaiserpalasts) | 50–60 | nach der Belagerung (Akt 4) |

### 4.1 Das Eichental (Level 1–10)

**Siedlungen und Hauptorte** (§14.3 verlangt 1 große Stadt oder 2 Dörfer und 3–5 kleinere Siedlungen):

| Ort | ID | Typ | Beschreibung |
|---|---|---|---|
| Dorf Eichental | `loc.eichental.dorf_eichental` | Dorf 1 | Oberdorf um den Riss zerstört (`flag.eichental.dorf_zerstoert`). Das Unterdorf am Mühlbach steht noch: Taverne, Schmiede, Anschlagbrett. **Das Dorf des Vertical Slice.** |
| Brunnfeld | `loc.eichental.brunnfeld` | Dorf 2 | Unversehrtes Marktdorf im Osten des Tals. Ab Stufe B. |
| Hollmannshof am Nordhang | `loc.eichental.hollmannshof` | Hof | Schafzucht am Nordhang |
| Holzfällerlager Rotbuche | `loc.eichental.lager_rotbuche` | Lager | Grünmäntel und Holzfäller |
| Wachtposten Hagenwacht | `loc.eichental.hagenwacht` | Vorposten | Silberwacht, Zugang zu Begleiterin Maren |
| Gut Eichenruh | `loc.eichental.gut_eichenruh` | Anwesen | Verfallenes Anwesen der Spielfigur (§21) |

**Orte und NPCs für die 8 Beispiel-Quests (§16.9):** Der Quest-Inhalt steht in [02_Quests_und_Dialoge](./02_Quests_und_Dialoge.md). Diese Tabelle legt die Orte und Figuren fest. Mit „(Vorschlag 02)“ markierte Nebenfiguren darf 02 anpassen.

| Ort / NPC | ID | Rolle | Quest |
|---|---|---|---|
| Riss von Eichental (Krater im Oberdorf) | `loc.eichental.riss_eichental` | Ziel von Quest 1 | 1 |
| Dorfvogt Alwin Brandt | `npc.eichental.vogt_brandt` | Überlebender, übergibt Gut Eichenruh | 1 |
| Schmiedin Hedda Kolb | `npc.eichental.schmiedin_hedda` | Überlebende, Händlerin | 1 |
| Bruder Anselm / Müllerin Berta | `npc.eichental.bruder_anselm` / `npc.eichental.muellerin_berta` | Überlebende, Entscheidung E1.2 | 1 |
| Lina (Schwester der Spielfigur) | `npc.eichental.lina` | Verschwindet im Riss | 1 |
| Taverne „Zur Krummen Eiche“ mit Anschlagbrett | `loc.eichental.taverne_krumme_eiche` | Hub im Unterdorf, Kopfgeldaushang | 6, 8 |
| Wirtin Greta Lindner | `npc.eichental.wirtin_greta` | Gerüchte, Unterkunft | – |
| Nordhang | `loc.eichental.nordhang` | Weidehänge oberhalb des Hollmannshofs | 2 |
| Bauer Gerd Hollmann | `npc.eichental.bauer_hollmann` | Verliert Schafe | 2 |
| Wolfshöhle am Nordhang | `loc.eichental.wolfshoehle_nordhang` | Bau der Aether-verderbten Wölfe | 2 |
| Lene Hollmann (Vorschlag 02) | `npc.eichental.lene_hollmann` | Empfängerin des Briefes, Tochter des Bauern | 3 |
| Tobias Kerber (Vorschlag 02) | `npc.eichental.tobias_kerber` | Absender, Holzfäller, seit dem Riss vermisst | 3 |
| Zerstörte Poststation am Hohlweg | `loc.eichental.poststation_hohlweg` | Fundort des Briefes | 3 |
| Mühlbach | `loc.eichental.muehlbach` | Bach durch das Tal, Mühle am Unterdorf | 4 |
| Banditenlager in der Mühlbachklamm | `loc.eichental.muehlbach_lager` | Lager der Mühlbach-Bande | 4 |
| Rika Dornfeld | `npc.eichental.rika_dornfeld` | Anführerin der Mühlbach-Bande. Verhandelbar. Wird sie verschont, taucht sie ~30 h später als Informantin in Aurelion auf (§16.5, `flag.eichental.rika_verschont`) | 4 |
| Kräuterkate am Krähenmoor | `loc.eichental.kraeuterkate` | Hütte am Rand zum Moorschatten | 5 |
| Kräuterfrau Ysolde | `npc.eichental.kraeuterfrau_ysolde` | In Wahrheit eine Hexe vom Zirkel der Nebelmütter aus dem Moorschatten, Mentorin von Begleiterin Morwen | 5 |
| Bandit Grimmbart (Hagen Grimm) | `npc.eichental.grimmbart` / `boss.eichental.grimmbart` | Ehemaliger Söldner, aus der Mühlbach-Bande verstoßen, zu brutal selbst für Banditen. Kopfgeld am Anschlagbrett. | 6 |
| Grimmbarts Bau (alter Steinbruch) | `loc.eichental.grimmbarts_bau` | Arena für die Bossmechanik | 6 |
| Kapellenruine am Rabenhügel | `loc.eichental.kapellenruine_rabenhuegel` | Eingang zur Gruft | 7 |
| Die vergessene Gruft | `loc.eichental.vergessene_gruft` | Kleiner Dungeon aus den Dunklen Jahren, mit Rätsel | 7 |
| Ritter Odric, der Eidgebundene | `boss.eichental.ritter_odric` | Mini-Boss der Gruft, untoter Ritter | 7 |
| Der alte Seemann Hennek Salzbart | `npc.eichental.seemann_hennek` | Stammgast der Taverne, Besitzer der Schatzkarte | 8 |
| Alter Hafen von Möwenbucht | `loc.goldkueste.moewenbucht_alter_hafen` | Verfallener Hafen im südlichsten Zipfel der Goldküste, direkt an der Grenze zum Eichental. Ziel der Schatzkarte. Im Vertical Slice eine einzelne Küstenzelle. | 8 |

**Gegnerfamilien:** Wölfe, Banditen, Rissbrut, Untote (Gruft), Wildtiere (Keiler). Details siehe [11](#11-gegner-roster-201--bosse-203).

**Ressourcen:** Eichenholz, Kupfererz, Eisenerz (selten, Mine), Wundkraut, Silberblatt, Nachtschatten (nur nachts), Wolfsfell, Honig, Forellen (Mühlbach), kleine Aether-Splitter (nur am Riss).

**Tag/Nacht:** Nachts treiben Irrlichter am Riss, Wolfsrudel sind größer (+1–2 Tiere), Banditen schlafen (Schleichweg in Quest 4), Nachtschatten blüht.

**Musikstimmung:** Folk mit Laute, Holzflöte und Streichern. Das Oberdorf in Moll, nach dem Wiederaufbau eine Dur-Variante desselben Themas.

**Weltbosse:**

| Boss | ID | Konzept |
|---|---|---|
| Borkenvater | `boss.eichental.borkenvater` | Uralter Baumhirte, Aether-verderbt. Wurzelflächen, Kristallkern im Stamm als Schwachpunkt. |
| Hauerkönig Brakk | `boss.eichental.hauerkoenig_brakk` | Riesenkeiler. Ansturm, Schlammsuhle verlangsamt. Lehrt Ausweichen. |
| Die Graue Mutter | `boss.eichental.graue_mutter` | Aether-Wölfin, nur nachts. Ruft ihr Rudel, verschwindet im Nebel. |
| Der Kopflose Vogt | `boss.eichental.kopfloser_vogt` | Geist eines Vogts aus den Dunklen Jahren, nur bei Neumond. Erst ab Level 10 sinnvoll („gefährliche Ausnahme“). |

**Dungeon-Ideen:** Die vergessene Gruft · Wolfshöhle am Nordhang · Grimmbarts Bau · Kupfermine Rotbuche · Keller des Hagenturms · Riss-Kaverne unter Eichental (Story) · Hügelgrab Altenhain · Schmugglerpfad nach Möwenbucht.

**Großes Geheimnis:** **Der versunkene Hain** unter dem Steinkreis von Altenhain. Nur bei Vollmond (alle 8 Spieltage) und mit Aether-Sicht zugänglich. Darin das legendäre Amulett „Eichenherz“ und der erste Hinweis auf den Zirkel der Nebelmütter.

### 4.2 Die Goldküste (Level 10–20)

- **Siedlungen:** **Velmara** (`loc.goldkueste.velmara`, große Stadt mit Hafen, Kanälen, Gildenhaus „Goldene Waage“) · Möwenbucht (Fischerdorf mit altem Hafen) · Akademie Lumenspitze (Konvent, Klippeninsel vor Velmara) · Salzwerk Weißstrand · Leuchtturm Kap Varro · Weingut Dalcastro · Piratenlager Schädelbucht (feindlich).
- **Gegnerfamilien:** Piraten, Schmuggler, Krabben, Harpyien, Ertrunkene, Korallenrufer.
- **Ressourcen:** Salz, Perlen, Korallen, Seetang, Meeresfische (Angeln), Weintrauben, Zinnerz, Aether-Kristalle aus Küstenadern.
- **Tag/Nacht:** Die Gezeiten wechseln alle 12 Spielstunden (24 min Echtzeit). Nachts finden Schmuggler-Übergaben statt, bei Flut steigen Ertrunkene aus dem Meer, der Leuchtturm dient als Orientierung.
- **Musik:** Mandoline, Fidel, Bordun-Töne, tiefer Männerchor. Velmara geschäftig und hell.

| Weltboss | Konzept |
|---|---|
| Tiefmaul | Riesenkrabbe, nur bei Ebbe im Watt. Panzer bricht nur durch Wucht oder nach einem Parieren. |
| Kapitänin Morra Rotzahn | Geisterpiratin, nur nachts auf ihrem Wrack. Ruft Ertrunkene, Enterhaken zieht den Spieler heran. |
| Kreischkrone | Harpyien-Matriarchin auf den Klippen. Windböen schieben den Spieler zum Abgrund. |
| Der Korallenkoloss | Aether-verderbter Korallengolem am Riff, nur bei Ebbe. Kristallkern im Rücken. |

- **Dungeon-Ideen:** Schmugglertunnel unter Velmara · Wrack der „Goldenen Gans“ (Tauchen) · Leuchtturmruine Kap Varro · Piratenfeste Schädelbucht · Salzmine Weißstrand · Versunkener Gezeitentempel (nur bei Ebbe) · Versuchskeller der Lumenspitze · Harpyiennest.
- **Großes Geheimnis:** **Die Stadt unter der Flut.** Bei Springebbe (1 × pro Spielwoche, am Ruhetag) liegt ein versunkener Vorposten des Kaiserreichs frei. Darin der legendäre Speer „Gezeitenbrecher“.

### 4.3 Der Moorschatten (Level 18–28)

- **Siedlungen:** Dunkelwasser (Pfahldorf des Moorvolks, Dorf 1) · Bernwald (Pilgerdorf mit Hospiz, Dorf 2) · Ahnenhain Wurzelthron (Sitz der Wilden Stämme) · Silberwacht-Feldlager Graufels · Torfstecherlager · Fährhaus am Dunkelstrom · Zirkel der Nebelmütter (versteckt).
- **Gegnerfamilien:** Untote, Moorgetier (Kröten, Spinnen), abtrünnige Hexen, Trolle, Irrlichter.
- **Ressourcen:** Torf, Moorbeeren, Alraune, Giftpilze, Raseneisenerz, Schilf, Krötenschleim, Knochenmehl.
- **Tag/Nacht:** Morgens 80 % Nebelwahrscheinlichkeit. Nachts doppelte Untoten-Dichte, Irrlichter locken vom Weg.
- **Musik:** Bordun-Drones, tiefe Streicher, Flüsterchor, Maultrommel. Viel Stille.

| Weltboss | Konzept |
|---|---|
| Der Moorkönig | Untoter Fürst am Totenriss. Beschwört Moorleichen, Phase im Nebel. |
| Großmutter Kröte | Riesenkröte. Verschlingt den Spieler (Ausbruch durch Schaden von innen), Giftflächen. |
| Ugrak, der Schlammtroll | Regeneriert im Schlamm. Der Spieler muss ihn auf festen Boden locken oder Feuer einsetzen. |
| Die Hungrige Weide | Lebender Baum, nur nachts. Ranken fesseln, Feuer und Schnitt helfen. |

- **Dungeon-Ideen:** Moorgrab der Fürsten (Totenriss, Story) · Versunkene Abtei · Hexenbrunnen · Trollhöhle · Pestkeller von Bernwald · Ruinen von Alt-Morvath · Torfstollen.
- **Großes Geheimnis:** **Der Neunte Zirkel.** Eine Insel im Moor, nur nachts bei Nebel sichtbar. Sie enthüllt Ysoldes Vergangenheit. Darin das legendäre Zauberbuch „Foliant der Neun Nebel“.

### 4.4 Die Sonnenwüste von Kar'Zul (Level 25–38)

- **Siedlungen:** **Sar'Hadun** (Oasenstadt, große Stadt der Region) · Oase Ir-Hamad (Story, kann verschlungen werden) · Wanderlager der Sandläufer (wechselt alle 3 Spieltage zwischen 3 Orten) · Karawanserei Drei Brunnen · Grabungslager des Konvents · Salzpfannen-Posten.
- **Gegnerfamilien:** Skorpione, Sandkriecher, Grabwächter (Mumien), Sandgeister, Wüstenräuber, Skarabäen, Obelisk-Konstrukte.
- **Ressourcen:** Sonnenstein, Golderz, Kaktusfrucht, Wüstensalbei, Skorpiongift, Datteln, Glassand, Obsidian (am Rand zu den Glutlanden).
- **Tag/Nacht:** Hitze von 10 bis 17 Uhr, kühle Nächte. Nachts erscheinen Sandgeister. Sternbild-Rätsel funktionieren nur nachts.
- **Musik:** Zupfinstrumente, Rahmentrommeln, tiefe Holzbläser. Eigene Fantasy-Kultur, keine Kopie realer Musik.

| Weltboss | Konzept |
|---|---|
| Ghul-Arak, der Sandwurm | Taucht unter, Erschütterungen im Sand kündigen ihn an. Schwachpunkt im offenen Maul. |
| Skorpionmutter Zhar | Gift, Brut-Wellen, Panzer an den Scheren |
| Der Wandernde Obelisk | Konstrukt, das über die Dünen wandert. Sonnenstrahl, Spiegel reflektieren ihn zurück. |
| Sturmreiter | Sandsturm-Elementar, nur während eines Sandsturms. Sicht 15 m, Windstöße. |

- **Dungeon-Ideen:** Grabmal der Sonnenkönige (Story) · Archiv von Ir-Hamad (Story) · Skorpionnest · Versunkene Pyramide · Spiegeltempel · Goldmine der Räuber · Sternwarte der Wüste.
- **Großes Geheimnis:** **Das Grab des Namenlosen Königs.** Nur über 3 Sternbilder in 3 verschiedenen Nächten auffindbar. Darin eine der Vier Tafeln (für das Ende „Lied“) und das legendäre Dolchpaar „Sonnensicheln“.

### 4.5 Die Frostgipfel (Level 35–48)

- **Siedlungen:** **Khaz Morund** (Zwergenfestung, große Stadt, bis Akt 4 verschlossen) · Kaltenbrunn (Dorf der Nordleute) · Jägerlager Weißfell · Runentor (zwergischer Außenposten) · Kloster der Stillen Höhe · Lager der Runenbrecher (feindlich).
- **Gegnerfamilien:** Frostwölfe, Frostriesen, Eisharpyien, Frostgeister, Eiswyrmlinge, Runenbrecher, Runenwächter-Konstrukte, Eiskriecher.
- **Ressourcen:** Eisenerz, Silbererz, Sternsilber (selten), Frostkristall, Schneelotus, Yetifell, Drachenschuppen, Bergkiefernholz.
- **Tag/Nacht:** Nachts Kälte-Aufbau ×1,5 und Frostgeister. Polarlichter erhöhen nachts die Aether-Dichte an Gipfeln (Kristalle abbaubar).
- **Musik:** Tiefe Hörner, Zwergen-Männerchor, kalte Glockenspiele.

| Weltboss | Konzept |
|---|---|
| Frostschwinge Ysgrim | Eisdrache (§14.2). Luft- und Bodenphase, Frostatem friert Wasserflächen zu Plattformen. |
| Hrimgar, der Frostriese | Wirft Eisbrocken, stampft Eisschollen auf. Feuer schwächt seine Rüstung. |
| Die Lawinenmutter | Yeti-Matriarchin. Löst Lawinen aus, die Spieler und Gegner treffen. |
| Der Runenkoloss | Außer Kontrolle geratenes Zwergenkonstrukt. Runen-Schwachpunkte in Reihenfolge zerstören. |

- **Dungeon-Ideen:** Die Tiefen von Khaz Morund (Leere-Einbruch, Story) · Eisdrachenhorst · Mine Grauzahn · Gefrorener Seepalast · Katakomben des Klosters · Ahnenschmiede (Runenamboss, Story) · Gletscherspalte.
- **Großes Geheimnis:** **Die Gletscher-Ahnenhalle.** Eine Halle im Eis, die erst erscheint, wenn an 5 Punkten das Eis mit Feuer geschmolzen wird (Zauber, Feuerpfeil oder Fackel). Darin der legendäre Hammer „Erbe der Tiefe“.

### 4.6 Die Glutlande (Level 45–60)

- **Siedlungen:** Brandwall (Grenzfeste von Silberwacht und Zwergen, Dorf 1) · Glimmhain (Bergbaudorf, Dorf 2) · Flüchtlingslager Funkenrast · Schwefelminen-Lager · Obsidian-Klause (Eremit) · Kathedrale der Stille (Sitz des Kults, feindlich).
- **Gegnerfamilien:** Feuerelementare, Glutimps, Aschenzungen (militanter Zweig des Kults, der „Dämonenkult“ aus §14.2), Magmaschlangen, Schlackengolems, Glutmastiffs.
- **Ressourcen:** Obsidian, Schwefel, Feuerkristall, Glutsalamanderhaut, Aschenblüte, Magmaeisen, Basalt.
- **Tag/Nacht:** Nachts leuchten die Lavaflüsse heller, Kultprozessionen ziehen umher. Tagsüber Hitze-Aufbau.
- **Ausbruchszyklus:** Alle 3 Spieltage bricht Ashkarr für 6 Spielstunden aus. Lavabomben fallen, neue Lavaflüsse sperren Wege und legen andere frei (seltene Erze).
- **Musik:** Tiefe Trommeln, verzerrtes Blech, dissonanter Chor nahe Kult-Orten.

| Weltboss | Konzept |
|---|---|
| Die Glutmutter | Riesensalamander. Taucht in Lava, Feuerresistenz sinkt nach Eis-Treffern. |
| Der Brandprophet | Kult-Champion. Beschwört Imps, opfert sie für Heilung (Adds zuerst töten). |
| Zerberax | Alpha eines Glutmastiff-Rudels. Dreifacher Ansturm, Rudel greift koordiniert an. |
| Der Schlackenkönig | Riesiger Golem. Panzer platzt nach Abkühlung mit Wasser oder Eis. |

- **Dungeon-Ideen:** Kathedrale der Stille (Story) · Krater Ashkarr (Story) · Schwefelminen · Lavaröhren · Dämonengrube der Aschenzungen · Versteinerter Wald · Kerker von Brandwall.
- **Großes Geheimnis:** **Das Auge des Vulkans.** Nur während der Ausbruchsruhe im Krater erreichbar. Darin die legendäre Brustrüstung „Phönixpanzer“.

### 4.7 Die Hauptstadt Aurelion (Level 20–60)

- **Hauptorte:** Ratshalle des Rats der Sieben (Kronenviertel) · Ordensburg Weißwall (Silberwacht, Tempelviertel) · Gildenkontor (Gildenmarkt) · Arena (§23) · „Das Gebrochene Rad“ (Versteck der Schattenhand, Senke) · Glockenturm (Glockenviertel). Viertel und Freischaltung siehe [4.0](#40-übersicht).
- **Kleinere Siedlungen im Umland:** Vorstadt Kronenfeld (Bauern) · Söldnerlager am Sonnentor · Pilgerherberge am Schlundrand.
- **Gegnerfamilien:** Stadtwache (nur bei Kopfgeld), Meuchler, Kult-Schattenwirker, Ratten, Kanalghule, Bombenwerfer, Söldner.
- **Ressourcen:** Kaum Sammelgüter. Dafür Bücher, Rezepte, Handel, Diebesgut, Dachgärten mit Kräutern.
- **Tag/Nacht:** Sperrstunde 22–5 Uhr, Wachen kontrollieren. Schattenhand-Aufträge meist nachts. Tavernen voll von 18 bis 24 Uhr. Stündliche Glockenschläge zur Orientierung.
- **Musik:** Orchestral mit Glocken. Jedes Viertel hat eine Variante (Senke: Fidel und Perkussion, Kronenviertel: Cembalo-Klang).

| Weltboss | Konzept |
|---|---|
| Die Kanalmutter | Mutierte Rattenkönigin in der Kanalisation. Schwärme, Gift, enge Arena. |
| Der Glockengeist | Nur um Mitternacht im Glockenturm. Glockenschläge erzeugen Schockwellen im Takt. |
| Der Schlundwächter | Aether-Golem am Schlundrand (Level 60). Erst nach der Belagerung erreichbar. |

- **Dungeon-Ideen:** Kanalisation (3 Ebenen) · Katakomben unter dem Tempelviertel · Schatzkammer des Rats · Ruine des Kaiserpalasts am Schlundrand · Gefängnis „Der Turm“ · Zisternen der Schattenhand · Uhrwerkturm (Gleitschirm-Quest).
- **Großes Geheimnis:** **Die Kaiserkrypta.** 7 Siegel liegen verteilt in den Vierteln. Wer alle findet, öffnet die Krypta des letzten Kaisers. Darin der legendäre Helm „Krone des Letzten Kaisers“ und Lore über Caelum.

### 4.8 Der Zerbrochene Himmel (Level 60–80, Endgame)

- **Siedlungen:** Ankerplatz (Brückenkopf der Pakt-Fraktion) · Echo-Stadt Caelum (Ruinen) · Leuchtfeuer-Inseln (Wegpunkte) · Lager der Kult-Pilger oder Kult-Stützpunkt (je nach Ende).
- **Gegnerfamilien:** Leere, Echo-Ritter, Fragmentgolems, Aetherschlangen.
- **Ressourcen:** Aether-Splitter, Sternenglas, Leere-Essenz, Himmelserz, Wolkenmoos.
- **Tag/Nacht:** Ewiges Zwielicht. Ein Aether-Puls im Takt des Spieltags (alle 48 min) ersetzt Sonnenauf- und -untergang. In der „Nacht“ kommt Leere-Stille häufiger vor.
- **Musik:** Ätherische Flächen, Chor ohne Worte, „zerbrochene“ Varianten der Themen aller Regionen.

| Weltboss | Konzept |
|---|---|
| Der Sternverschlinger | Leere-Leviathan, der zwischen Inseln fliegt. Frisst Plattformen, Kampf beim Gleiten. |
| Die Echo-Kaiserin | Echo der letzten Kaiserin. Kopiert die zuletzt benutzten Fähigkeiten des Spielers. |
| Der Fragmentkönig | Golem aus Inseltrümmern. Zerstört Plattformen, die Arena schrumpft. |
| Der Erste Gebrochene | Der erste Mensch, der am Aetherbrand zerbrach. Verderbnis-Aufbau ×3. |

- **Dungeons:** Riss-Expeditionen (prozedural, §23, Details in [04](./04_Items_Crafting_Wirtschaft_Endgame.md)) plus handgemacht: Sternwarte von Caelum · Gefallene Akademie · Herz des Risses (Story) · Leerenkathedrale · Archiv der Himmelsakademie.
- **Großes Geheimnis:** **Die Insel, die nicht da ist.** Sie erscheint nur während einer Leere-Stille. Darin der legendäre Zauberstab „Splitter des Ersten Tages“.

---

## 5. Content-Mengen (§14.3)

Die Mindestmengen stammen aus §14.3. Die Personentage (PT) je Einheit sind eine **Schätzung** unter der Annahme, dass Asset-Kits und Editor-Werkzeuge bereits existieren. 1 Personenjahr ≈ 220 PT.

| Inhalt | Minimum je Region (§14.3) | × 8 Regionen | Ideen-Pool in diesem Dokument | PT je Einheit | PT gesamt (Minimum) |
|---|---|---|---|---|---|
| Große Stadt oder 2 Dörfer | 1 Stadt / 2 Dörfer | 4 Städte (Velmara, Sar'Hadun, Khaz Morund, Aurelion), 3 × 2 Dörfer, Ankerplatz | – | Aurelion ~200, andere Stadt ~80, Dorf ~25, Ankerplatz ~20 | ~610 |
| Kleinere Siedlungen oder Lager | 3–5 | 24–40 | ~40 | ~8 | ~190 |
| Dungeons | 5–8 | 40–64 | 7–8 je Region | ~20 (mit Kit) | ~800 |
| Points of Interest | 10–15 | 80–120 | – | ~3 | ~240 |
| Weltbosse | 3–5 | 24–40 | 31 | ~12 (Rig wiederverwendet, eigene Arena und Mechanik) | ~290 |
| Versteckte Truhen | 20+ | 160+ | – | ~0,25 | ~40 |
| Lore-Gegenstände | 10+ | 80+ | – | ~0,5 (Text DE + EN, Platzierung) | ~40 |
| Großes Geheimnis | 1 | 8 | 8 | ~10 | ~80 |
| **Vorschlag:** Aussichtspunkte | 3 | 24 | – | ~1 | ~25 |
| **Vorschlag:** Umgebungsrätsel außerhalb von Dungeons | 4 | 32 | – | ~2 | ~65 |
| **Summe** | | **~560 Orte und Objekte** | | | **≈ 2.400 PT ≈ 11 Personenjahre** |

**Ehrliche Einschätzung:**
- Die ~2.400 PT gelten **nur für den Ortsbau** (Layout, Platzierung, Scripting, Feinschliff). Sie überlappen teilweise mit der Welt-Art aus [3.1](#31-weltgröße-vorschlag). Zusammen sind es grob **3.500–4.500 PT**.
- Dazu kommen die Quests (~2.000–2.500 PT laut [00](./00_Vision_und_Ueberblick.md#risiken--hinweise)), Figuren, Animation, Audio und Code. Der Inhalt von Stufe C liegt damit bei **über 25 Personenjahren**. Für ein kleines Team ist das nur über Jahre und in Etappen machbar.
- **Gegenmaßnahmen:**
  - **Dungeon-Kits** je Bautyp (Höhle, Gruft, Mine, Ruine, Tempel). Jedes Kit wird in mehreren Regionen mit anderem Material wiederverwendet.
  - **POI-Vorlagen** (Banditenlager, Wachturm, Wrack, Schrein) mit 3 Varianten pro Vorlage.
  - **Weltbosse** als Champion-Variante eines vorhandenen Rigs plus eigene Arena und **eine** besondere Mechanik.
  - **Truhen und Lore-Items** werden per Editor-Werkzeug platziert. Ein Validator prüft die Mindestmengen je Region und die 90-Sekunden-Regel.
  - Geplant wird mit den Minimalwerten. Mehr gibt es erst, wenn die Messung nach Stufe A Luft zeigt.

---

## 6. Lebendige Welt (§14.4) & Erkundung (§14.5)

### 6.1 Tag/Nacht und Kalender

- 1 Spieltag = **48 min Echtzeit** (§14.4), also 1 Spielstunde = 2 min. **Vorschlag:** In den Optionen einstellbar von 24 bis 96 min.

| Phase | Spielzeit | Echtzeit | Wirkung |
|---|---|---|---|
| Morgen | 5–8 Uhr | 6 min | NPCs stehen auf, Morgennebel, Tiere an Wasserstellen |
| Tag | 8–18 Uhr | 20 min | Arbeit, Handel, volle Sicht |
| Abend | 18–21 Uhr | 6 min | Taverne, Ambient-Gespräche, Händler schließen |
| Nacht | 21–5 Uhr | 16 min | Nacht-Gegner, Schleichbonus, Schlaf der NPCs |

**Kalender (Vorschlag):**
- **Woche mit 7 Tagen:** Erdtag, Wassertag, Windtag, Feuertag, Aethertag, Markttag, Ruhetag. Am Markttag gibt es Märkte und mehr Wanderhändler. Am Ruhetag gehen NPCs in den Tempel, Läden öffnen 2 h später.
- **Mondzyklus von 8 Spieltagen:** Vollmond an Tag 1, Neumond an Tag 5. Daran hängen Geheimnisse (Versunkener Hain) und Bosse (Kopfloser Vogt).
- **Keine Jahreszeiten in der Landschaft** (zu teuer). Saisonale Ereignisse richten sich nach dem echten Kalender, siehe [04](./04_Items_Crafting_Wirtschaft_Endgame.md).
- **Nachtregel (§14.4):** Nachts erscheinen andere, gefährlichere Gegner (+2 Level oder eigene Nacht-Typen). Dafür +25 % XP und +1 Stufe Loot-Qualitätswurf.

### 6.2 Wetter mit Gameplay-Effekten

Wetter wechselt alle 2–6 Spielstunden (4–12 min) mit 1 Spielstunde Übergang. Jede Region hat eigene Wahrscheinlichkeiten (§14.4). Effektwerte sind **Vorschlag**, endgültig in [03](./03_Kampf_Charakter_Progression.md).

| Wetter | Gameplay-Effekte |
|---|---|
| Klar | keine |
| Regen | Blitzschaden +20 %, Feuerschaden −20 %. Zustand „Nass“: Schock-Aufbau +50 %, Brennen-Aufbau −50 %. Schritte leiser (Schleichen +15 %). |
| Gewitter / Sturm | Wie Regen. Zusätzlich alle ~45 s ein Blitzeinschlag an hohen Punkten, 3 s vorher angekündigt durch Leuchten. Trifft auch Gegner. |
| Nebel (Morgen-, See-, Berg-) | Sichtweite 25 m. Sichtkegel der Gegner −40 %. Fernkampf-Lock-On maximal 20 m. Der Kompass zeigt keine unentdeckten Orte. |
| Schwüle | Gift-Aufbau ×1,5 |
| Schneefall | Spuren bleiben 60 s sichtbar (Fährten). Eisschaden +10 %. Kälte-Aufbau +0,5/s. |
| Schneesturm | Sicht 20 m, Bewegung −15 %, Kälte-Aufbau ×3, Pfeile driften |
| Hitzewelle | Hitze-Aufbau, Feuerschaden +10 % |
| Sandsturm | Sicht 15 m. Ausdauer-Regeneration −25 % ohne Tuch oder Maske. Projektile driften. Spuren verschwinden. Weltboss Sturmreiter kann erscheinen. |
| Ascheregen | Sicht 40 m. Feuerschaden +15 %. Ohne Maske maximale Ausdauer −15 %. |
| Glutsturm | Brennen-Aufbau +1/s im Freien. Unterstände schützen. |
| Smog (nur Senke in Aurelion) | Sicht 50 m, Schleichen +10 % |
| Aethersturm | Aether-Dichte +1, Aether-Schaden +25 %, Verderbnis-Aufbau ×2. Kleine Teleport-Wirbel erscheinen. |
| Leere-Stille | Mana-Regeneration 0, Farben entsättigt, doppelt so viele Leergeborene (Weltereignis) |

| Region | Wetteranteile |
|---|---|
| Eichental | Klar 50 % · Regen 25 % · Morgennebel 15 % · Gewitter 10 % |
| Goldküste | Klar 55 % · Regen 20 % · Sturm 15 % · Seenebel 10 % |
| Moorschatten | Nebel 45 % · Regen 25 % · Schwüle 20 % · Klar 10 % |
| Kar'Zul | Klar 60 % · Hitzewelle 25 % · Sandsturm 15 % |
| Frostgipfel | Klar 35 % · Schneefall 35 % · Schneesturm 15 % · Bergnebel 15 % |
| Glutlande | Ascheregen 35 % · Hitzewelle 35 % · Glutsturm 15 % · Klar 15 % |
| Aurelion | Klar 55 % · Regen 25 % · Gewitter 10 % · Smog in der Senke 10 % |
| Zerbrochener Himmel | Klar 50 % · Aethersturm 35 % · Leere-Stille 15 % |

**Klima-Mechaniken (Vorschlag, ein gemeinsames System auf Basis der Statuseffekt-Balken aus §9.6):**

| Mechanik | Aufbau | Abbau / Schutz | Effekte bei 50 / 75 / 100 |
|---|---|---|---|
| Kälte (Frostgipfel) | Höhe über 1.200 m +0,5/s, Schneesturm +1,5/s, im Wasser +5/s, nachts ×1,5 | Lagerfeuer −5/s, in Gebäuden −2/s. Warme Mahlzeit stoppt den Aufbau für 10 min. Kälteschutz der Rüstung senkt den Aufbau (Pelz-Set −50 %). | Ausdauer-Regeneration −25 % / Bewegung und Angriffstempo −10 % / −1 % max. LP pro Sekunde |
| Hitze (Kar'Zul am Tag, Glutlande) | Sonne +0,5/s, Hitzewelle +1,5/s, nahe Lava +3/s | Schatten −2/s, Wasser trinken −30, Hitzetrank stoppt den Aufbau 10 min, leichte Rüstung | maximale Ausdauer −15 % / Mana-Regeneration −25 % / −1 % max. LP pro Sekunde |
| Gift-Sumpf (Moorschatten) | Im Sumpfwasser +4/s Gift-Aufbau | Bohlenwege, Gift-Resistenz | Statuseffekt Gift (§9.6) |

Auf dem Schwierigkeitsgrad „Geschichte“ verursacht Klima keinen LP-Verlust.

### 6.3 Nacht-Gegner und Wildtiere

| Region | Nacht-Gegner (zusätzlich oder anstelle) |
|---|---|
| Eichental | Größere Wolfsrudel, Irrlicht-Risslinge am Riss |
| Goldküste | Ertrunkene (bei Flut), Schmuggler |
| Moorschatten | Untote in doppelter Dichte, Irrlichter, Hungrige Weide |
| Kar'Zul | Sandgeister, aktivere Riesenskorpione |
| Frostgipfel | Frostgeister |
| Glutlande | Kultprozessionen, Glutmastiff-Rudel |
| Aurelion | Meuchler, Kult-Schattenwirker in der Senke |
| Zerbrochener Himmel | Leergeborene in höherer Dichte |

| Verhalten (§14.4) | Tiere | Regel (Vorschlag) |
|---|---|---|
| Fliehen | Reh, Hase, Fasan, Steinbock, Wüstenfuchs | Fliehen bei 15 m Abstand, beim Schleichen erst bei 5 m |
| Herde | Hirsche, Schafe, Wildpferde, Bergziegen | Fliehen als Gruppe hinter einem Leittier |
| Jagen | Wölfe, Bären, Luchse | Jagen sichtbar Herdentiere. Greifen den Spieler an, wenn er näher als 10 m kommt. |
| Wehrhaft | Wildschwein, Elch, Wisent | Greifen nur an, wenn sie provoziert werden oder der Spieler näher als 4 m kommt |
| Aasfresser | Krähen, Geier, Möwen | Kreisen über Leichen und Kadavern. Das ist ein bewusster Hinweis auf Loot oder Ereignisse (Säule 1). |

Kostenrahmen: 4 Basis-Rigs (kleiner Vierbeiner, großer Vierbeiner, Hirschartige, Vogel) decken alle Wildtiere ab.

### 6.4 Zufällige Weltereignisse

Die fünf Beispiele aus §14.4 (Karawanen, Überfälle, Riss-Ausbrüche, Wanderhändler, Duellanten) sind enthalten. Der Rest ist **Vorschlag**. Belohnungen skalieren mit dem Regionslevel.

| # | Ereignis | ID | Auslöser / Bedingungen | Ablauf | Belohnung | Häufigkeit |
|---|---|---|---|---|---|---|
| 1 | Händlerkarawane | `event.welt.haendlerkarawane` | Straße, 6–20 Uhr, ab Akt 2 | Karawane zieht zwischen zwei Siedlungen. Handeln oder bis zum Ziel eskortieren. | Seltene Waren. Eskorte: Gold, Handelsgilde +25. | 1 je Spieltag und Region |
| 2 | Überfall | `event.welt.ueberfall` | Straße, Banditen oder Piraten in der Region | Angriff auf Reisende. Eingreifen oder weitergehen. | Loot, Gerücht oder Rezept von Überlebenden. Wer weitergeht, hört später ein Gerücht über die Toten. | 1 je 2 Spieltage |
| 3 | Riss-Ausbruch | `event.welt.riss_ausbruch` | Ab Ende Akt 1, außerhalb von Siedlungen, Aether-Dichte ≥ 1 | Kleiner Riss, 3 Wellen Rissbrut (60–90 s), danach Riss-Siegel (5 s) | Aether-Splitter, Kristalle, XP, Silberwacht +15 | 1 je 2 Spieltage und Region, max. 1 aktiv |
| 4 | Wanderhändler | `event.welt.wanderhaendler` | Tag, an Wegen. Am Markttag doppelte Chance. | Pim Tausendtasche (`npc.welt.pim_tausendtasche`) rastet 3 Spielstunden an einem Rastplatz | Seltene Rezepte, Schatzkarten, Kosmetik | 1 je 3 Spieltage |
| 5 | Duellant | `event.welt.duellant` | Ab Level 8, Tag | Herausforderung mit Einsatz 50–500 Gold. Nur Nahkampf, endet bei 10 % LP, kein Tod. | Doppelter Einsatz. Nach 5 Siegen Titel „Klingenbrecher“, nach 10 Siegen eine Duellmeister-Questreihe. | 1 je 2 Spieltage, 12 Duellanten mit Namen |
| 6 | Rissgeborenen-Jagd | `event.welt.rissjagd` | Akt 2–4, Silberwacht in der Region | Patrouille jagt einen flüchtigen Rissgeborenen. Der Wache helfen oder dem Flüchtling. | Silberwacht +50, oder Konvent/Schattenhand +50. Der Flüchtling kann später als NPC im Haus wohnen. | 1 je 4 Spieltage |
| 7 | Kult-Ritual | `event.welt.kult_ritual` | Nachts, ab Akt 2, nahe Ruinen | Kultistenkreis mit 3-min-Timer | Leere-Essenz, Kult-Lore, Silberwacht +25. Misslingt es, entsteht 3 Spieltage lang eine kleine Leere-Zone (Radius 50 m). | 1 je 3 Nächte |
| 8 | Verwundeter Reisender | `event.welt.verwundeter_reisender` | Tag, an Wegen | Heilen oder Trank geben. In 20 % der Fälle ist es ein Hinterhalt. | Schatzkarten-Fragment oder Gerücht | 1 je 2 Spieltage |
| 9 | Aether-Meteor | `event.welt.aether_meteor` | Nachts, klares Wetter, ab Akt 2 | Lichtstreif, Einschlag 5 min auf der Karte markiert. Nach 3 min kommen Plünderer. | Sternmetall (Crafting), Aether-Splitter | 1 je 5 Nächte |
| 10 | Der Weiße Hirsch | `event.welt.weisser_hirsch` | Morgendämmerung, Wälder | Der Hirsch flieht. 2 min unentdeckt folgen. | Segen: +10 % XP für 1 Spieltag. Nach 3 Begegnungen ein Hinweis auf ein seltenes Reittier. | 1 je 6 Spieltage |
| 11 | Schmuggler-Übergabe | `event.welt.schmuggel` | Nachts, Küste oder Fluss | Melden, mitmachen oder ausrauben | Gilde +50 / Schattenhand +50 / Beute mit Kopfgeld-Risiko | 1 je 3 Nächte (Goldküste, Aurelion) |
| 12 | Gefangenentransport | `event.welt.gefangenentransport` | Straße, Wachen in der Region. Kann einen Quest-NPC transportieren (z. B. Rika). | Befreien (Delikt, Kopfgeld 150) oder vorbeiziehen lassen | Information, Hehler-Kontakt, Schattenhand + | 1 je 4 Spieltage |
| 13 | Jahrmarkt | `event.welt.jahrmarkt` | Markttag, in einer Siedlung je Region | Buden, Gaukler, Minispiele (Armdrücken, Würfeln, Rissduell) | Minispiel-Preise, Kosmetik, Gerüchte | Jeder Markttag |
| 14 | Angriff auf eine Siedlung | `event.welt.siedlungsangriff` | Ab Akt 4 und nach der Story, nicht in Städten | Wellenverteidigung: 3 Wellen in 3 min | Ruf der Siedlungsfraktion +100. Ohne Hilfe ist die Siedlung 2 Spieltage beschädigt und die Händler haben zu. | 1 je 5 Spieltage |
| 15 | Leere-Stille | `event.welt.leere_stille` | Ab Akt 3 nahe Leere-Zonen, im Zerbrochenen Himmel häufig | 5 min: Farben verschwinden, doppelt so viele Leergeborene, Echos und verborgene Orte erscheinen | Leere-Essenz, Echos, Zugang zu Geheimnissen | 1 je 4 Spieltage |

**Regeln für die Ereignis-Steuerung (Vorschlag):**
- Höchstens 1 aktives Ereignis im Umkreis von 300 m um den Spieler, mindestens 4 min Abstand zwischen zwei Ereignissen in seiner Nähe.
- Keine Ereignisse in Dungeons, im Kampf oder während Hauptquest-Stufen mit Story-Sperre.
- Ereignisse entstehen außer Sicht (≥ 80 m oder hinter einer Sichtkante). Ausnahme: der Meteor, der absichtlich sichtbar ist.
- Abklingzeit je Typ. Die Gewichte je Region liegen in den Regionsdaten (`Assets/_Project/Data/Regions/`).
- Weltereignis-Quests (§16.2) entstehen aus Ereignis plus Folgeaktion. Beispiel: Ein geretteter Überlebender vergibt einen Auftrag. Details in [02](./02_Quests_und_Dialoge.md).

### 6.5 Orte, die sich durch Quests verändern

| Ort | Auslöser | Vorher | Nachher |
|---|---|---|---|
| Oberdorf Eichental | Ende Akt 1, Spende von 500 Gold, Quest „Neue Wurzeln“ (`stat.eichental.wiederaufbau` 0–3) | Ruine und Asche | Stufe 1: Zelte und Zimmerleute. Stufe 2: Häuser stehen. Stufe 3: Dorf mit Markt, dazu Bäckerei oder Heilschrein (E1.2). |
| Banditenlager Mühlbachklamm | Quest 4 | Lager der Mühlbach-Bande | Angegriffen: verlassen, später ziehen Wildtiere ein. Verhandelt: „Rikas Holzwerk“, eine Holzfällersiedlung mit Händlerin. |
| Hollmannshof | Quest 2 | Schafe verschwinden | Gelöst: Die Herde wächst, Hollmann verkauft Wolle. Gescheitert: Hof verlassen. |
| Riss von Eichental | E1.3 | Offener Riss | Versiegelt: Gedenkstein. Aufgenommen: ruhender Riss mit Kristallen. |
| Zirkel der Nebelmütter | E2.2 | Verborgen | Geschützt: offen, mit Händlerin und Lehrerin. Ausgeliefert: Scheiterhaufenplatz in Bernwald, die Hexen sind fort. |
| Glockenviertel (Aurelion) | E2.3 und Ally-Score | Bewohnt | Abgebrannt, danach Wiederaufbau als Questreihe |
| Oase Ir-Hamad | E3.2 | Oase | Leere-Zone wächst. Bei Evakuierung entsteht ein Nomadenlager in der Vorstadt Kronenfeld. |
| Velmara / Kaltenbrunn | E4.1 | Intakt | Hafen in Ruinen bzw. Flüchtlingslager, bis eine Wiederaufbau-Quest abgeschlossen ist |
| Tor von Khaz Morund | E4.2 | Verschlossen | Offen: Handelsposten im Tal, Zwergenhändler in Aurelion. Gestohlen: Tor zu, Wachen feindlich. |
| Leere-Zonen | Ende 3 (Lied) | Grau, tödlich | „Stille Gärten“, begehbar mit eigenen Ressourcen |
| Gut Eichenruh | Haus-Ausbau (§21) | Ruine | Ausbaustufen, siehe [04](./04_Items_Crafting_Wirtschaft_Endgame.md) |

### 6.6 Erkundung (§14.5)

Die Darstellung (HUD, Karte) steht in [05](./05_UI_Audio_Grafik_Barrierefreiheit.md). Hier stehen die Regeln (**Vorschlag**).

| Element | Regel |
|---|---|
| Kartennebel | Lichtet sich im Radius von 60 m um den Spieler. Der aufgedeckte Bereich wird gespeichert. |
| Aussichtspunkte | 3 je Region, erreichbar über eine Kletterpassage. Aktivieren startet eine Kamerafahrt (5 s, überspringbar), lichtet den Nebel im Radius von 600 m und markiert Orte in diesem Radius als „?“. Jeder Aussichtspunkt ist auch ein Schnellreise-Punkt. |
| Schnellreise | Zwischen entdeckten Wegpunkten (Aussichtspunkte, Siedlungen, Dungeon-Eingänge). Nicht im Kampf. Kostenlos. |
| Kompass | Oben am Bildschirm. Zeigt Quest-Marker (bis zu 3 verfolgte Quests, §16.6), eigene Marker, entdeckte Orte bis 300 m, unentdeckte Orte erst ab 100 m als „?“ (nicht bei Nebel) und ein Gefahrensymbol bei Elite-Gegnern oder Weltbossen bis 150 m. |
| Eigene Marker | Bis zu 50, mit 6 Symbolen, Farbe und kurzer Notiz |
| Fundort-Zähler | Je Region und Kategorie mit der tatsächlichen Anzahl, z. B. Eichental: Truhen x/24, Lore x/12, Aussichtspunkte x/3, Dungeons x/8, Weltbosse x/4, Geheimnis 0/1 (als „?“ bis zum Fund). Eine komplett erkundete Region bringt einen Titel und eine Kosmetik. |
| Kletter- und Sprungpassagen | Kletterbare Flächen sind dezent markiert (Ranken, helle Kanten, abschaltbar). |
| Gleitschirm (ab ~20 h) | Jede Region ab der Goldküste hat ≥ 3 Orte, die nur gleitend erreichbar sind. Das Eichental hat 2. Das ist ein Grund für die Rückkehr in alte Regionen. |
| Aether-Sicht | ≥ 2 Geheimnisse je Region sind nur mit Aether-Sicht auffindbar (verborgene Wege, unsichtbare Plattformen). |

### 6.7 Umgebungsrätsel-Typen

Regel (Säule 6): Jedes Rätsel ist mit jedem Build lösbar. Elementrätsel haben immer einen Weg ohne Magie. **Vorschlag:** Nach 120 s ohne Fortschritt gibt ein Begleiter einen Hinweis (abschaltbar).

| Typ (§14.5) | Mechanik | Weg ohne Magie | Beispielort |
|---|---|---|---|
| Druckplatten | Gewicht durch Kisten, Spieler, Begleiter (auf Befehl) oder Leichen | Kisten schieben | Die vergessene Gruft |
| Hebel und Sequenzen | Reihenfolge aus Lore-Buch oder Wandbild | – | Gruft, Khaz Morund |
| Spiegel und Licht | Strahl über drehbare Spiegel auf Kristalle lenken | – | Grabmal der Sonnenkönige, Spiegeltempel |
| Elementrätsel | Feuer entzündet Fackeln und Netze, Eis friert Wasser zu Plattformen, Blitz lädt Kristalle, Aether-Stoß bewegt Objekte | Fackel, Öl, Element-Pfeile (§9.4), Bomben aus der Alchemie | Gletscher-Ahnenhalle, Moorschatten |
| Zeit und Gezeiten | Zugang nur bei Ebbe, Vollmond, Nacht oder Sternbild | Warten oder schlafen | Stadt unter der Flut, Versunkener Hain |
| Klang | Glocken in der Reihenfolge einer Melodie anschlagen. Die Melodie wird auch als Symbolfolge gezeigt (Barrierefreiheit). | – | Glockenturm, Kloster der Stillen Höhe |
| Aether-Resonanz | Aether-Sicht zeigt unsichtbare Plattformen. Mini-Risse in Reihenfolge schließen. | Aether-Sicht ist klassenunabhängig | Steinkreis, Zerbrochener Himmel |
| Sternbild | Steinscheiben drehen, bis das Sternbild stimmt (nur nachts) | – | Kar'Zul |
| Hinweise untersuchen | Detektiv-Modus (§16.4) | normales Untersuchen | Aurelion |
| Kletter- und Sprungparcours | Route zu versteckten Truhen | – | überall |

---

## 7. NPCs (§15.1)

### 7.1 Tagesablauf-Schema

**Vorschlag:** ~10 Tagesablauf-Vorlagen. Wichtige NPCs (15–25 je Region) bekommen eine Vorlage plus eigene Abweichungen. Hintergrund-NPCs nutzen nur die Vorlage.

| Zeit | Bauer / Handwerker | Händler | Wache Tagschicht | Wache Nachtschicht | Wirt |
|---|---|---|---|---|---|
| 5–7 | Aufstehen, Frühstück zu Hause | Aufstehen | Schichtwechsel um 6 | Patrouille, Schichtende um 6 | Schlaf |
| 7–12 | Arbeit (Feld, Werkstatt) | Laden ab 8 | Posten oder Patrouille | Schlaf | Schlaf bis 10, dann Vorbereitung |
| 12–13 | Mittag in Taverne oder zu Hause | Mittag im Laden | Mittag in der Kaserne | Schlaf | Mittagstisch |
| 13–18 | Arbeit | Laden | Patrouille | Schlaf bis 17 | Taverne offen |
| 18–21 | Taverne oder Familie | Laden schließt um 18, Taverne | Schichtende um 18, Taverne | Essen, Schichtbeginn um 18 | Hochbetrieb |
| 21–5 | Schlaf | Schlaf | Schlaf | Patrouille mit Fackel | Taverne bis 24, dann Schlaf |

**Vorrang bei Konflikten** (höchster zuerst):
1. Quest-Vorgabe (eine aktive Quest-Stufe bindet den NPC an einen Ort)
2. Gefahr (Kampf in der Nähe, Weltereignis): fliehen oder verstecken
3. Wetter: Bei Regen gehen NPCs unter Dächer oder arbeiten drinnen
4. Wochentag: Markttag (Händler auf dem Markt), Ruhetag (Tempel 9–11 Uhr)
5. Standard-Tagesablauf

**UX-Regeln:**
- Questrelevante NPCs sind während der passenden Quest-Stufe immer erreichbar. Falls nicht, nennt das Questlog das Zeitfenster („Hollmann ist von 7 bis 18 Uhr am Nordhang“).
- Händler außerhalb der Ladenzeit: Anklopfen startet einen Dialog. Mit Charisma-Probe gibt es einen Nachtverkauf mit +20 % Preisaufschlag.
- NPCs außerhalb der geladenen Zellen werden nicht simuliert. Beim Laden stehen sie dort, wo ihr Plan sie zu dieser Uhrzeit vorsieht. Technik siehe [Technik/01_Architektur](../Technik/01_Architektur.md).

### 7.2 Reaktionsregeln

| Auslöser | Bürger | Wachen | Händler | Begleiter |
|---|---|---|---|---|
| Gezogene Waffe in einer Siedlung (> 5 s, < 8 m) | Bark „Steck das weg“, nach 10 s gehen sie auf Abstand | Warnung, nach 20 s Ansprache. Kein Delikt. | Kein Handel, solange die Waffe gezogen ist | Kommentar je nach Persönlichkeit |
| Aether-Fähigkeit in einer Siedlung | Erschrecken, fliehen 10 m | Aurelion ohne Siegelbrief: Delikt „Verbotene Magie“. Sonst Warnung. | +10 % Preise für 1 Spieltag | Maren tadelt, Kael verteidigt |
| Gesehener Diebstahl | Ruft die Wache, Beziehung −20 | Ansprache oder Verfolgung, Kopfgeld | Hausverbot 3 Spieltage (Bestechung möglich) | Loyalität je nach Begleiter (Maren −5, Jasper +2) |
| Angriff auf einen NPC | Flieht und ruft | Greift an | Flieht | Je nach KI-Einstellung |
| Leichenfund | Panik, holt Wache | 1 Spielstunde erhöhte Wachsamkeit (Sichtweite +20 %) | Schließt | – |
| Private Räume betreten (nachts oder verschlossen) | „Raus hier!“, nach 5 s Delikt Hausfriedensbruch | Kommt bei Hilferuf | – | – |
| Ruf ≥ Geachtet (lokale Fraktion) | Grüßen mit Titel | Übersehen 1 kleines Delikt (Kopfgeld ≤ 25) pro Spieltag | −10 % Preise | – |
| Ruf ≤ Feindlich | Meiden, abfällige Barks | Verweigern Zutritt zu Fraktionsorten | Verweigern Handel | – |
| Ruf = Verhasst | Fliehen | Greifen im Fraktionsgebiet auf Sicht an | – | – |
| Verderbnis ≥ 75 | Ängstliche Barks | Misstrauisch: Sichtweite für Delikte +20 % | +10 % Preise | Kommentar |

### 7.3 Verbrechen und Kopfgeld

- **Rechtsgebiete:** je Region eines. Aurelion und Khaz Morund haben eigene (Zwergenrecht: Kopfgeld ×2). Im Zerbrochenen Himmel gibt es kein Recht.
- **Zeugen:** Nur gesehene Delikte zählen. Ein Zeuge muss eine Wache erreichen oder in 30 m Umkreis rufen. Wer einen Zeugen tötet, begeht Mord.

| Delikt | Kopfgeld (Vorschlag) |
|---|---|
| Hausfriedensbruch, Schlossknacken | 10 / 15 |
| Taschendiebstahl | 25 |
| Diebstahl | 50 % des Warenwerts, mindestens 5 |
| Vieh stehlen oder töten | 30 |
| Verbotene Magie (Aurelion, ohne Siegelbrief) | 40 |
| Körperverletzung | 40 |
| Gefängnisausbruch | 100 |
| Gefangenenbefreiung, Angriff auf eine Wache | 150 |
| Mord | 1.000 |

| Kopfgeld | Verhalten der Wachen |
|---|---|
| 1–99 | Ansprechen mit Dialog |
| 100–999 | Ansprechen. Bei Flucht Verfolgung, bei Gegenwehr Kampf (+150). |
| ≥ 1.000 | Angriff auf Sicht im Rechtsgebiet. Zusätzlich Kopfgeldjäger als Weltereignis. |

**Optionen bei der Ansprache:**

| Option | Regel |
|---|---|
| Bezahlen | Kopfgeld zahlen. Gestohlene Ware wird konfisziert. |
| Gefängnis | Dauer = Kopfgeld / 10 Spielstunden, höchstens 48. Die Zeit wird übersprungen (Abblende), keine Echtzeit-Wartezeit. Kein XP-Verlust. Gestohlenes wird konfisziert. Die Ausrüstung liegt in der Truhe der Wache und wird bei der Entlassung zurückgegeben. |
| Ausbruch aus dem Gefängnis | Dietrich in der Zelle, Schleichpassage. Kopfgeld +100. |
| Bestechen | 50 % des Kopfgelds plus Charisma-Probe, oder Ruf ≥ Freundlich bei der lokalen Fraktion |
| Überreden | Charisma-Probe, nur bei Kopfgeld ≤ 50, einmal pro Spieltag |
| Ordensrecht | Silberwacht-Mitglied mit Ruf ≥ Geachtet: einmal pro Spielwoche Kopfgeld ≤ 100 erlassen (Aurelion) |
| Flucht oder Widerstand | Verfolgung, bei Gegenwehr Kampf |

- **Schattenhand:** löscht Kopfgeld gegen 50 % der Summe (Ruf ≥ Freundlich) bzw. 30 % (≥ Geachtet).
- **Verfall:** −5 % pro Spieltag ohne neues Delikt. Ab ≤ 25 erlischt das Kopfgeld.
- **Gestohlene Ware** ist markiert und nur beim Hehler verkäuflich (§22).
- Ob Proben gewürfelt werden oder feste Schwellen haben, entscheidet der Auftraggeber (siehe [02](./02_Quests_und_Dialoge.md)).

### 7.4 Ambient-Dialoge und Gerüchte

| Art | Umfang | Auslöser | Regel |
|---|---|---|---|
| Bark | 1 Zeile | Nähe, Wetter, Tageszeit, Spieleraktion, Weltzustand | Dieselbe Zeile frühestens nach 10 min wieder |
| Ambient-Gespräch | 2 NPCs, 3–6 Zeilen | Spieler < 10 m, beide NPCs untätig | Höchstens 1 Gespräch gleichzeitig in Hörweite (15 m) |
| Gerücht | Ambient-Gespräch oder Thema beim Wirt | Wie oben, oder kaufbar beim Wirt (10–50 Gold) | Trägt einen Quest-Hinweis: Eintrag im Questlog-Tab „Gerüchte“ und ein ungefährer „?“-Kreis (150 m) auf der Karte |

- Die Auswahl läuft über Conditions (§6.4). Neue Weltereignisse haben Vorrang: Nach einem Questabschluss sprechen NPCs 2 Spieltage lang darüber.
- **Mengen je Region (Vorschlag):** 40 Barks plus 20 reaktive Barks, 12 Ambient-Gespräche, 10 Gerüchte. Das sind ~140 Zeilen je Region, ~1.100 Zeilen insgesamt (je Sprache).

### 7.5 Gedächtnis für Entscheidungen

NPCs erinnern sich auf drei Ebenen (**Vorschlag**):

| Ebene | Inhalt | Beispiel |
|---|---|---|
| Weltzustand-Flags (global, §6.5) | Große Entscheidungen | `flag.eichental.rika_verschont` |
| NPC-Beziehung (−100 bis +100) | Haltung eines wichtigen NPCs zum Spieler | Hollmann +40 nach geretteten Schafen |
| NPC-Erinnerungen (Tags, max. ~8 je NPC) | Konkrete Ereignisse, die nur dieser NPC kennt | `mem.hat_mich_bestohlen`, `mem.hat_lene_den_brief_gebracht` |

| Beziehung | Spanne | Wirkung |
|---|---|---|
| Feind | −100 bis −50 | Verweigert Hilfe, kann Gegner informieren |
| Abneigung | −49 bis −10 | Weniger Dialogoptionen, +10 % Preise |
| Neutral | −9 bis +9 | Standard |
| Freundlich | +10 bis +49 | Zusätzliche Themen, −5 % Preise |
| Vertraut | +50 bis +100 | Gefälligkeiten, Geschenke per Bote, −10 % Preise |

**Beispiele für verzögerte Erinnerung:**
- Rika Dornfeld verschont → ~30 h später Informantin in Aurelion, Ally-Score +1 (§16.5).
- Ysolde enttarnt und verraten → Morwen beginnt mit Loyalität −15.
- Vor der Silberwacht geflohen (E1.1) → Wachen in Aurelion sprechen den Spieler bis Akt 3 öfter an.

Ein Register aller verzögerten Konsequenzen wird im Quest-Editor geführt (siehe [02](./02_Quests_und_Dialoge.md)).

---

## 8. Fraktionen (§15.2)

### 8.1 Überblick

Namen und Grundziele stammen aus §15.2. Alles andere ist **Vorschlag**. Questzahl je Fraktion: 15 nach dem Quest-Budget aus [00](./00_Vision_und_Ueberblick.md#ziel-spielzeiten--plausibilität) (Original §15.3: 15–25). Die Kapitelstruktur erlaubt eine spätere Erweiterung auf 20.

| # | Fraktion | ID | Sitz | Anführer (Vorschlag) | Beitritt | Erstkontakt |
|---|---|---|---|---|---|---|
| 1 | Die Silberwacht | `faction.silberwacht` | Ordensburg Weißwall, Aurelion | Hochmeisterin Adelind Sturmfels | ja | Akt 1 (Eichental) |
| 2 | Der Aether-Konvent | `faction.aether_konvent` | Akademie Lumenspitze, Goldküste | Erzmagistra Selene Varrow | ja | Akt 2 (Goldküste) |
| 3 | Die Handelsgilde von Velmara | `faction.handelsgilde` | Gildenhaus „Goldene Waage“, Velmara | Handelsfürstin Liora Dalcastro | ja | Akt 2 (Goldküste) |
| 4 | Die Schattenhand | `faction.schattenhand` | „Das Gebrochene Rad“, Senke, Aurelion | „Die Witwe“ (Corvina Asch) | ja | Akt 2 (Aurelion) |
| 5 | Die Wilden Stämme | `faction.wilde_staemme` | Ahnenhain Wurzelthron, Moorschatten | Seherin Ahn-Maru | ja | Akt 1 (Grünmäntel), Akt 2 (Moorschatten) |
| 6 | Der Kult der Leere | `faction.kult_der_leere` | Kathedrale der Stille, Glutlande | Die Stille Prophetin Nhalia | ❓ siehe [8.5](#85-beitritt-zum-kult-der-leere) | Akt 2 (Nacht der Stillen Glocken) |
| 7 | Die Zwerge von Khaz Morund | `faction.zwerge_khaz_morund` | Khaz Morund, Frostgipfel | Runenkönig Durmar Eisenwort | eingeschränkt (Ehrentitel) | Akt 2 (Gundra in Aurelion), Akt 4 (Festung) |

**Allgemeine Regel:** Jede Questreihe hat 4 Kapitel. Kapitel I (4 Quests) ist für alle offen („Anwärter“). Der **Eid** (Beitritt) folgt am Ende von Kapitel I, frühestens mit dem Pakt am Ende von Akt 2. Erst der Eid löst Ausschlüsse aus (siehe [8.3](#83-ausschlussregeln-wiederspielwert)). So sieht jeder Spieler ~20 Fraktionsquests, bevor er sich festlegen muss.

### 8.2 Die sieben Fraktionen

#### 1 – Die Silberwacht

| Feld | Inhalt |
|---|---|
| Ziel | Alle Risse versiegeln (§15.2), Aether-Missbrauch verhindern |
| Ideologie | „Ein versiegelter Riss ist ein gerettetes Dorf.“ Pflicht, Ordnung, Opferbereitschaft. Schattenseite: Fanatismus, Verwahrung von Rissgeborenen. |
| Haltung zu Aether | Notwendiges Übel, nur zum Versiegeln. Rissgeborene sind „Gefäße“, die beaufsichtigt werden müssen. |
| Haltung zur Leere | Absoluter Feind |
| Sitz | Ordensburg Weißwall (Aurelion), Vorposten Hagenwacht (Eichental), Feldlager Graufels (Moorschatten), Brandwall (Glutlande) |
| Anführerin | Hochmeisterin Adelind Sturmfels. Bei Antagonist-Option B ist sie Nachfahrin des Gründers Aldric Sturmfels. |
| Ränge | Anwärter → Knappe → Ritter → Ordensmarschall |
| Belohnungen | Freundlich: Siegelwasser (Verderbnis −50) beim Händler · Geachtet: Plattenset „Silberwacht“, Titel „Schild der Wacht“ · Verehrt: Reittier „Silberhengst“ · Legende: legendärer Schild „Letztes Gebot“, Titel „Schild von Aurelion“ |
| Questreihe (15) | I „Der Knappeneid“ (4, Eichental und Aurelion) · II „Die Verwahrung“ (4, Moorschatten: Hexenjagd und Rissgeborenen-Verwahrung, moralisch grau) · III „Die Siegelkette“ (4, Kar'Zul und Frostgipfel: Siegelsteine setzen) · IV „Das letzte Gebot“ (3, Akt 4–5) |
| Fraktions-Ende | **Reform:** Die Verwahrung endet, Rissgeborene können Ritter werden. **Oder Härte:** Der Orden übernimmt Aurelion, Rissgeborene stehen unter Ausgangssperre. Die Spielfigur wird Ordensmarschall. |

#### 2 – Der Aether-Konvent

| Feld | Inhalt |
|---|---|
| Ziel | Aether erforschen und nutzen (§15.2) |
| Ideologie | „Wissen ist die einzige Mauer, die hält.“ Fortschritt. Schattenseite: Hybris, Experimente an Menschen. |
| Haltung zu Aether | Schlüssel zur Zukunft. Rissgeborene sind Partner und Forschungsobjekte zugleich. |
| Haltung zur Leere | Ein Phänomen, das man verstehen und vielleicht anzapfen kann |
| Sitz | Akademie Lumenspitze (Goldküste), Grabungslager (Kar'Zul), Sitz im Rat der Sieben |
| Anführerin | Erzmagistra Selene Varrow. Bei Option A wurde der Konvent von Valerians Schülern gegründet. Selene kennt Bruchstücke der Wahrheit. |
| Ränge | Hörer → Adept → Magister → Erzmagister |
| Belohnungen | Freundlich: Zauberrollen, Rezept „Aether-Tinte“ · Geachtet: Stoffset „Magisterrobe“, Titel „Magister“ · Verehrt: Reittier „Aetherross“ · Legende: legendärer Zauberstab „Stab der Ersten Formel“, Titel „Erzmagister“ |
| Questreihe (15) | I „Die Adeptenprüfung“ (4) · II „Resonanz“ (4, Experimente, verbunden mit Ilvys Begleiterquest) · III „Das Archiv“ (4, Kar'Zul, Wettlauf mit dem Wanderer) · IV „Die Krone“ (3, Aether-Türme, Akt 4–5) |
| Fraktions-Ende | **Offene Akademie:** Wissen wird geteilt, Aether-Regeln gemeinsam mit den Stämmen. **Oder Aetherkratie:** Der Konvent kontrolliert die Aether-Türme und den Rat. |

#### 3 – Die Handelsgilde von Velmara

| Feld | Inhalt |
|---|---|
| Ziel | Profit (§15.2), Kontrolle über Kristallhandel und Seewege |
| Ideologie | „Alles hat einen Preis, auch der Frieden.“ Stabilität durch Handel. Schattenseite: Gier, einzelne Patrizier handeln heimlich mit dem Kult. |
| Haltung zu Aether | Eine Ware |
| Haltung zur Leere | Schlecht fürs Geschäft. Die Gilde finanziert jeden, der sie aufhält. |
| Sitz | Gildenhaus „Goldene Waage“ (Velmara), Kontor am Gildenmarkt (Aurelion), Karawanserei Drei Brunnen (Kar'Zul) |
| Anführerin | Handelsfürstin Liora Dalcastro |
| Ränge | Kontorist → Faktor → Kaufherr → Patrizier |
| Belohnungen | Freundlich: Kontor-Lagerkiste in Velmara · Geachtet: Lederset „Kaufherr“ (Charisma-Boni), Titel „Kaufherr“ · Verehrt: Stadthaus in Velmara zum halben Preis, Reittier „Velmarer Zelter“ · Legende: legendärer Ring „Goldene Waage“, Titel „Patrizier“ |
| Questreihe (15) | I „Das Kontor“ (4, Schmuggel stoppen) · II „Die Kristallcharta“ (4, Konflikt mit den Stämmen) · III „Der Verräter im Rat“ (4, Kult-Patrizier entlarven, Seekrieg gegen Piraten) · IV „Die Bilanz“ (3, Flotte und Velmara in Akt 4) |
| Fraktions-Ende | **Freie Stadt Velmara:** Bürgerrat, die Gilde verliert ihr Monopol, gewinnt Vertrauen. **Oder Gildenherrschaft:** Monopol ausgebaut, Preise überall +5 %, für den Patrizier −15 %. |

#### 4 – Die Schattenhand

| Feld | Inhalt |
|---|---|
| Ziel | Macht im Verborgenen, Schutz der Unterstadt vor der Obrigkeit |
| Ideologie | „Gesetze schreiben die Reichen. Wir schreiben die Ausnahmen.“ Loyalität untereinander. Schattenseite: Erpressung, Gewalt. |
| Haltung zu Aether | Ware und Werkzeug. Rissgeborene sind willkommene Talente. |
| Haltung zur Leere | Pragmatisch dagegen: „Tote zahlen keine Schulden.“ |
| Sitz | „Das Gebrochene Rad“ in der Senke (Aurelion), Schmugglertunnel unter Velmara |
| Anführerin | „Die Witwe“, wahre Identität Corvina Asch, enthüllt in Kapitel III |
| Ränge | Lehrling → Finger → Hand → Kopf der Hand |
| Belohnungen | Freundlich: Hehler mit vollen Preisen, Kopfgeld löschen für 50 % · Geachtet: Lederset „Nachtfinger“, Dietrich-Rezepte, Titel „Hand“ · Verehrt: Reittier „Rabenrappe“ (leise Hufe) · Legende: legendäre Dolche „Witwenkuss“, Titel „Kopf der Hand“ |
| Questreihe (15) | I „Lehrling der Dächer“ (4) · II „Der Ratsraub“ (4, Akt 2) · III „Das Netz“ (4, Spionage in allen Regionen, Rika als Kontakt) · IV „Die Krone ohne Kopf“ (3, Sabotage hinter den Kult-Linien bei der Belagerung) |
| Fraktions-Ende | **Gilde im Licht:** Die Schattenhand wird legal zur Wache der Senke. **Oder Herrschaft der Schatten:** Der Rat wird erpresst, das Kopfgeld des Spielers in Aurelion steigt nie über 100. |

#### 5 – Die Wilden Stämme

| Feld | Inhalt |
|---|---|
| Ziel | Das Land schützen (§15.2): Abbau stoppen, Risse „heilen“ statt versiegeln |
| Aufbau | Bund aus drei Völkern: Grünmäntel (Eichental), Moorvolk (Moorschatten), Sandläufer (Kar'Zul). Der Hexenzirkel der Nebelmütter ist verbündet. |
| Ideologie | „Das Land vergisst nicht.“ Gleichgewicht. Schattenseite: Gewalt gegen Siedler und Minenarbeiter. |
| Haltung zu Aether | Das Blut der Welt. Man darf es nicht abzapfen. |
| Haltung zur Leere | Ein Hunger, der sich mit dem „Lied“ sättigen lässt. Grundlage für das Ende „Lied“. |
| Sitz | Ahnenhain Wurzelthron (Moorschatten), Lager Rotbuche (Eichental), Wanderlager der Sandläufer (Kar'Zul) |
| Anführerin | Seherin Ahn-Maru (Moorvolk), Sprecherin des Rats der Drei Feuer |
| Ränge | Gast → Blutsfreund → Hüter → Stimme des Rats |
| Belohnungen | Freundlich: Jagd- und Kräuterrezepte, Ausrüstung für Tierbegleiter · Geachtet: Lederset „Hüter“, Titel „Blutsfreund“ · Verehrt: exotisches Reittier „Großhirsch der Grünmäntel“ · Legende: legendärer Bogen „Lied der Erde“, Titel „Stimme des Landes“ |
| Questreihe (15) | I „Die Prüfung der Sinne“ (4, Jagd und Spurenlesen) · II „Das Gift der Minen“ (4, gegen Gilde und Konvent) · III „Der Sandpfad“ (4, Kar'Zul) · IV „Das Lied der Erde“ (3, Akt 4–5) |
| Fraktions-Ende | **Bund der Wildnis:** Schutzgebiete, Minen geschlossen, Rohstoffpreise +10 %. **Oder Neuer Frieden:** Verträge mit der Gilde, die Stämme werden Wächter mit Handelsrechten. |

#### 6 – Der Kult der Leere (Gegenfraktion)

| Feld | Inhalt |
|---|---|
| Ziel | Die Leere vollständig erwecken |
| Ideologie | „Form ist Schmerz. Die Stille erlöst.“ Massenmord gilt als Gnade. |
| Haltung zu Aether | Das Gift der Wunde. Rissgeborene sind „Erwählte“ und „Pforten“. |
| Haltung zur Leere | Erlösung, Gottheit |
| Sitz | Kathedrale der Stille (Glutlande). Militanter Zweig: die **Aschenzungen** (der „Dämonenkult“ aus §14.2). Geheime Zellen in jeder Region. |
| Anführerin | Die Stille Prophetin Nhalia. Hierophant Kaldris (Akt-2-Boss) ist ihre Stimme in Aurelion. Der Graue Wanderer benutzt den Kult, gehört ihm aber nicht an. |
| Beitritt | ❓ Offene Entscheidung, siehe [8.5](#85-beitritt-zum-kult-der-leere) |
| Belohnungen (nur bei Beitritt) | Freundlich: Händler für Leere-Essenz · Geachtet: Set „Stille Robe“ · Verehrt: Reittier „Leerenross“ · Legende: legendäre Faustwaffe „Hand der Stille“, Titel „Herold der Stille“ |
| Questreihe (15, bei Empfehlung B) | I „Der Köder“ (4, Infiltration als Spion für Silberwacht oder Schattenhand **oder** aus Überzeugung) · II „Die Prüfungen der Stille“ (4) · III „Der Hof der Stille“ (4) · IV „Die letzte Glocke“ (3) |
| Fraktions-Ende | **Verrat:** Der Spieler liefert den Kult aus, die Kathedrale fällt früher, Ally-Score +1. **Oder Bekehrung:** öffnet das Ende „Tor“, alle anderen Fraktionen fallen auf Feindlich. |

#### 7 – Die Zwerge von Khaz Morund

| Feld | Inhalt |
|---|---|
| Ziel | Isolation, Bewahrung der Runenkunst, die Tiefen versiegelt halten |
| Ideologie | „Das Wort hält, der Stein hält.“ Ahnen und Clans. Schattenseite: Starrsinn, Schweigen über die Leere seit 190 n. R. |
| Haltung zu Aether | Nur durch Runen gebunden nutzbar. Die sicherste Aether-Kunst des Kontinents. |
| Haltung zur Leere | Kennen sie aus den eigenen Tiefen und haben darüber geschwiegen |
| Sitz | Khaz Morund (Frostgipfel), Außenposten Runentor, Exilschmiede in Aurelion (Gundra) |
| Anführer | Runenkönig Durmar Eisenwort und der Ahnenrat |
| Beitritt | Eingeschränkt: Ehrentitel statt Volkszugehörigkeit. Ränge: Gast → Steinfreund → Runenträger → Ahnenfreund. |
| Belohnungen | Freundlich: Runensteine für Sockel · Geachtet: schweres Set „Runenwacht“, Titel „Steinfreund“ · Verehrt: Reittier „Bergwidder“ · Legende: legendärer Hammer „Ahnenwort“, Titel „Ahnenfreund“ |
| Questreihe (15) | I „Die Exilschmiede“ (4, Aurelion, Akt 2, über Gundra) · II „Das Tor“ (4, Akt 4) · III „Die Tiefen“ (4) · IV „Der Ahnenrat“ (3, auch nach der Story) |
| Fraktions-Ende | **Offenes Tor:** Handel, Zwergenhändler überall, Rezepte für Runenschmiedekunst. **Oder Wacht der Tiefe:** Die Zwerge bleiben isoliert, übernehmen aber die Versiegelung der Tiefen. Einzigartiges Runen-Set. |

### 8.3 Ausschlussregeln (Wiederspielwert)

**Beziehungsmatrix (Vorschlag)** – V = verbündet, N = neutral, R = rivalisierend, F = verfeindet

| | Silberwacht | Konvent | Gilde | Schattenhand | Stämme | Kult | Zwerge |
|---|---|---|---|---|---|---|---|
| **Silberwacht** | – | R | N | F | R | F | V |
| **Konvent** | R | – | V | N | F | F | N |
| **Gilde** | N | V | – | R | F | F | N |
| **Schattenhand** | F | N | R | – | N | F | N |
| **Stämme** | R | F | F | N | – | F | N |
| **Kult** | F | F | F | F | F | – | F |
| **Zwerge** | V | N | N | N | N | F | – |

Begründungen in Kurzform: Silberwacht und Konvent streiten über Versiegeln oder Nutzen. Die Silberwacht jagt die mit den Stämmen verbündeten Hexen. Konvent und Gilde zapfen Aether auf Stammesland ab. Gilde und Schattenhand konkurrieren im Schmuggel. Die Zwerge teilen das Ziel der Silberwacht und sind sonst neutral. Ihr Misstrauen gegenüber dem Konvent läuft als Dialog-Färbung, nicht als Ausschluss.

**Regeln:**
1. **Anwärter-Phase:** Kapitel I jeder Fraktion ist für alle offen. Keine Ausschlüsse.
2. **Eid:** Frühestens mit dem Pakt am Ende von Akt 2. Ein Eid löst die Regeln 3–5 aus.
3. **Verfeindet (F) schließt aus:** Wer einer Fraktion den Eid leistet, kann der verfeindeten nicht beitreten. Laufende Quests der anderen Fraktion scheitern mit einer Abschiedsszene. Betroffen: Silberwacht ⟂ Schattenhand, Konvent ⟂ Stämme, Gilde ⟂ Stämme.
4. **Rivalisierend (R) erzwingt einen Bruch:** Der Eid bei beiden ist möglich. In Kapitel IV muss der Spieler sich entscheiden. Die andere Fraktion endet mit dem Ende „Bruch“ (keine Stufe Legende). Betroffen: Silberwacht–Konvent, Silberwacht–Stämme, Gilde–Schattenhand.
5. **Kult:** Ein echter Beitritt schließt alle anderen aus. Der verdeckte Pfad (Empfehlung B) bleibt bis Kapitel IV mit allen vereinbar.
6. **Zwerge** sind mit allen außer dem Kult vereinbar.

### 8.4 Beispiel-Kombinationen

| Spielweise | Vollständig spielbar | Mit Bruch in Kapitel IV | Ausgeschlossen |
|---|---|---|---|
| Ordnung | Silberwacht, Gilde, Zwerge | Konvent (gegen Silberwacht) | Schattenhand, Stämme |
| Wissen | Konvent, Gilde, Zwerge | Silberwacht (gegen Konvent) oder Schattenhand (gegen Gilde) | Stämme |
| Schatten | Schattenhand, Konvent, Zwerge | Gilde (gegen Schattenhand) | Silberwacht, Stämme |
| Wildnis | Stämme, Schattenhand, Zwerge | – | Silberwacht, Konvent, Gilde |
| Stille | Kult (verdeckt) zusätzlich zu einer der Kombinationen oben | – | Bei Bekehrung in Kapitel IV alle anderen |

Ergebnis: Pro Durchgang lassen sich 3 Fraktionen vollständig, höchstens 1 weitere bis zum Bruch und der verdeckte Kult-Pfad spielen. Das sind ~45–71 Fraktionsquests und passt zu „4 von 7 Fraktionen spielbar“ in [00](./00_Vision_und_Ueberblick.md#überschlag). Die Zwerge sind in jeder Kombination dabei, außer bei Bekehrung zum Kult.

### 8.5 Beitritt zum Kult der Leere

❓ **Offene Entscheidung:** Kann sich der Spieler dem Kult anschließen?

| Option | Beschreibung | Aufwand | Bewertung |
|---|---|---|---|
| A – Kein Beitritt | Der Kult bleibt reiner Gegner. Das Ende „Tor“ erreicht man nur über Leere-Resonanz ≥ 70. | gering | Widerspricht §15.3 („Jede Fraktion hat eine eigene Questreihe“). Das Ende „Tor“ wirkt unvorbereitet. |
| **B – Verdeckter Pfad (empfohlen)** | Ab Akt 3. Dieselben 15 Quests dienen als Spionage-Auftrag (für Silberwacht oder Schattenhand) **und** als Weg der Bekehrung. Erst in Kapitel IV entscheidet der Spieler: Verrat oder Bekehrung. | mittel (Assets und Orte des Kults sind ohnehin nötig) | Erfüllt §15.3, bereitet das Ende „Tor“ glaubwürdig vor, die Quests werden in fast jedem Durchgang gespielt. |
| C – Voller Beitritt | Eigene Questreihe ab Akt 2 mit eigenen Gebieten, eigenem Hub und eigener Version von Akt 4. | hoch | Viel exklusiver Inhalt, den die meisten Spieler nie sehen. Für ein kleines Team nicht zu empfehlen. |

---

## 9. Ruf-System (§15.3)

### 9.1 Stufen und Schwellen

Die 8 Stufennamen stammen aus §15.3. Die Punkteschwellen sind ein **Vorschlag** (Wertebereich −1.500 bis +3.000, ID je Fraktion `stat.ruf.<fraktion>`).

| Stufe | Punkte | Zusatzbedingung |
|---|---|---|
| Verhasst | −1.500 bis −1.000 | – |
| Feindlich | −999 bis −400 | – |
| Misstrauisch | −399 bis −1 | – |
| Neutral | 0 bis 299 | Startwert der meisten Fraktionen |
| Freundlich | 300 bis 899 | – |
| Geachtet | 900 bis 1.799 | – |
| Verehrt | 1.800 bis 2.999 | Kapitel III der Fraktion abgeschlossen. Sonst bleibt der Ruf bei 1.799 stehen. |
| Legende | 3.000 | Fraktions-Ende (Kapitel IV) abgeschlossen. Sonst bleibt der Ruf bei 2.999 stehen. |

**Startwerte:** Silberwacht 0, danach +100 oder −50 durch E1.1 · Wilde Stämme +50 (Grünmäntel im Eichental) · Zwerge −100 (Isolation) · Kult −400 · alle anderen 0.

**Kontrollrechnung** (mit den Quellen aus 9.2): Kapitel I ergibt 4 × 100 + 250 = 650 (Freundlich). Kapitel II ergibt 1.300 (Geachtet). Kapitel III ergibt 1.950 (Verehrt). Kapitel IV ergibt 2.750, dazu ~250 aus Hauptquest-Entscheidungen, Ereignissen und Aufträgen, also Legende. Ohne Grinden erreichbar, aber nur für die Fraktionen, deren Reihe man abschließt.

### 9.2 Ruf-Quellen und -Senken

| Quelle | Ruf |
|---|---|
| Fraktionsquest | +60 bis +150 (Ø 100) |
| Kapitel I–III abgeschlossen | je +250 |
| Fraktions-Ende | +500 |
| Entscheidung in einer Hauptquest | +50 bis +300 |
| Auftrag vom Fraktionsbüro (prozedural, §16.7) | +15, höchstens 3 pro Spieltag |
| Weltereignis | +15 bis +100 |
| Spende (100 Gold) | +5, höchstens +300 je Fraktion insgesamt |
| Feinde der Fraktion besiegen (z. B. Kultisten für die Silberwacht) | +2, höchstens +50 pro Spieltag |

| Senke | Ruf |
|---|---|
| Mitglied angreifen | −50 |
| Mitglied töten | −150 (plus Kopfgeld) |
| Gesehener Diebstahl von Fraktionseigentum | −25 |
| Fraktionsquest gescheitert | −100 |
| Entscheidung gegen die Fraktion | −100 bis −300 |
| Eid bei einer verfeindeten Fraktion | −500 |

- **Charisma:** +1 % Ruf-Gewinn je Charisma-Punkt über 10, höchstens +20 % (endgültig in [03](./03_Kampf_Charakter_Progression.md)).
- **Fraktionsmarken** (§22): 5–20 Marken je Fraktionsquest. Verwendung in [04](./04_Items_Crafting_Wirtschaft_Endgame.md).

### 9.3 Übertragung zwischen Fraktionen

§15.3: „Ruf bei einer senkt Ruf bei der anderen.“ **Vorschlag:**

| Beziehung (Matrix in [8.3](#83-ausschlussregeln-wiederspielwert)) | Übertragungsfaktor |
|---|---|
| Verbündet | +25 % |
| Neutral | 0 % |
| Rivalisierend | −25 % |
| Verfeindet | −50 % |

- Gilt für Gewinne und Verluste aus Quests, Entscheidungen und Ereignissen, nicht für Spenden.
- **Untergrenze:** Übertragung allein senkt den Ruf nicht unter −399 (Misstrauisch). Feindlich wird man nur durch direkte Taten oder einen Eid.
- **Kult:** Auf dem verdeckten Pfad gibt es bis Kapitel IV keine Übertragung (Tarnung).
- **Beispiel:** Silberwacht +100 → Zwerge +25, Konvent −25, Stämme −25, Schattenhand −50, Kult −50, Gilde 0.

### 9.4 Freischaltungen je Stufe

§15.3 nennt Händler-Items, Rezepte, Quests, Titel, Reittiere und Rüstungssets. Die konkreten Belohnungen je Fraktion stehen in [8.2](#82-die-sieben-fraktionen).

| Stufe | Händler | Preise | Quests | Weiteres |
|---|---|---|---|---|
| Verhasst | – | – | – | Angriff auf Sicht im Fraktionsgebiet. Kopfgeldjäger der Fraktion als Weltereignis. |
| Feindlich | verweigert | – | Nur eine Sühnequest (setzt den Ruf auf −399) | Fraktionsorte gesperrt |
| Misstrauisch | Grundsortiment | +20 % | Sühnequest | Wachen kontrollieren öfter |
| Neutral | Grundsortiment | ±0 % | Kapitel I | – |
| Freundlich | Stufe 2, erste Rezepte | −5 % | Eid möglich (ab Pakt), Kapitel II | Fraktionsmarken-Händler, Aufträge im Fraktionsbüro |
| Geachtet | Stufe 3, erste Set-Teile | −10 % | Kapitel III | Titel, Nachsicht bei kleinen Delikten |
| Verehrt | Volles Rüstungsset, Rezepte Stufe II | −15 % | Legendärer Fraktionsauftrag | Reittier |
| Legende | Einzigartige Waren | −20 % | Fraktions-Ende abgeschlossen | Legendäres Item, Titel, Trophäe im Haus, Fraktionstruppen in Endgame-Ereignissen |

---

## 10. Begleiter (§19)

Rahmen aus §19: 8 Begleiter, höchstens 2 gleichzeitig in der Gruppe, Loyalität, persönliche Questreihe (4–6 Quests, §16.2), Spezialfähigkeit, Romanze bei manchen, Verlassen oder Verrat bei niedriger Loyalität. Alle Figuren unten sind **Vorschlag**.

### 10.1 Steckbriefe

| Name | ID | Volk / Herkunft | Klasse / Rolle | Persönlichkeit | Humor-Art | Fraktionsnähe | Rekrutierung |
|---|---|---|---|---|---|---|---|
| Ser Maren Falkenried | `npc.begleiter.maren_falkenried` | Mensch, Aurelierin | Krieger, Tank (Einhandschwert + Schild) | pflichtbewusst, trocken, zweifelnd | trocken | Silberwacht | Akt 1, Eichental (Hagenwacht), ~2 h |
| Jasper „Fuchs“ Krähenfeld | `npc.begleiter.jasper_kraehenfeld` | Mensch, Hafenkind aus Velmara | Schurke, Hinterhalt (Dolche, Gift) | charmant, gierig, heimlich treu | frech | Schattenhand | Akt 2, Velmara, ~12 h |
| Magistra Ilvy Sternweber | `npc.begleiter.ilvy_sternweber` | Mensch, Aurelierin | Magierin, Elementarschaden (Feuer, Blitz) | neugierig, rücksichtslos, warmherzig | begeistert, nerdig | Aether-Konvent | Akt 2, Akademie Lumenspitze, ~14 h |
| Morwen Schilfrohr | `npc.begleiter.morwen_schilfrohr` | Mensch, Moorvolk (Hexe) | Magierin, Beschwörung und Flüche (Natur, Schatten) | rätselhaft, boshaft, beschützend | schwarz | Wilde Stämme, Hexenzirkel | Akt 2, Moorschatten, ~17 h |
| Pater Ludo Weinrich | `npc.begleiter.ludo_weinrich` | Mensch, Aurelier, ehemaliger Feldkaplan | Kleriker, Heiler und Unterstützung (Streitkolben) | zynisch, gütig, trinkfest | zynisch | keine (früher Silberwacht) | Akt 2, Armenhospiz in der Senke (Aurelion), ~19 h |
| Gundra Steinwort | `npc.begleiter.gundra_steinwort` | Zwergin, im Exil | Kriegerin, Kontrolle und Haltung brechen (Zweihandhammer) | stur, laut, sentimental | derb, laut | Zwerge | Akt 2, Exilschmiede (Aurelion), ~21 h |
| Ashka vom Sandpfad | `npc.begleiter.ashka` | Mensch, Sandläuferin | Waldläuferin, Fernkampf (Bogen, Speer, Fallen) | stolz, spöttisch, spirituell | spöttisch | Wilde Stämme | Akt 3, Karawanserei Drei Brunnen, ~30 h |
| Kael | `npc.begleiter.kael` | Mensch, Rissgeborener | Rissläufer, Hybrid (Teleport, Aether, Nahkampf) | melancholisch, unberechenbar, sanft | unfreiwillig komisch (versteht Alltägliches nicht) | Kult-Vergangenheit, geflohen | Akt 3, Grabmal der Sonnenkönige, ~33 h |

- **Abdeckung:** Jede Klasse aus §11.1 ist mindestens einmal vertreten (Krieger 2, Magier 2, Waldläufer, Schurke, Kleriker, Rissläufer).
- **Morwen ist verpassbar:** Wird der Zirkel ausgeliefert (E2.2), flieht sie und ist erst in Kar'Zul rekrutierbar, mit Loyalität 10.
- Stufe B (laut [00](./00_Vision_und_Ueberblick.md#umfangsstufen)) enthält 3 Begleiter: Maren, Jasper oder Ilvy, Morwen.

### 10.2 Vorlieben, Questreihen, Spezialfähigkeiten

| Name | Mag | Hasst | Persönliche Questreihe (Prämisse) | Spezialfähigkeit (Loyalität ≥ 60) | Romanze |
|---|---|---|---|---|---|
| Maren | Unschuldige schützen, Ehrlichkeit, Risse versiegeln. Geschenk: Waffenpflege. | Diebstahl, Lügen, Verderbnis ≥ 75 | **„Der Bruder in Weißwall“ (5):** Ihr Bruder Jorin, ein Rissgeborener, sitzt in Silberwacht-Verwahrung. Sie entdeckt, was die Verwahrung wirklich ist. Ende: Jorin befreien (Bruch mit dem Orden) oder den Orden von innen reformieren. | **Schildwall:** 6 s lang erleidet der Spieler 50 % weniger Schaden, Gegner greifen Maren an. | ❓ ja (Empfehlung) |
| Jasper | Diebstahl, Bestechung, clevere Lösungen. Geschenk: Schmuck, Münzen. | Gilden-Patrizier, Silberwacht-Prahlerei, Grausamkeit gegen Wehrlose | **„Schuld und Schwester“ (4):** Er schuldet der Gilde ein Vermögen. Seine Schwester ist die rechte Hand von Liora Dalcastro. Höhepunkt: Raubzug auf die Goldene Waage. Ende: Versöhnung oder Bruch. | **Schattenwechsel:** Spieler und Jasper sind 4 s unsichtbar, der nächste Angriff ist kritisch. | ❓ ja (Empfehlung) |
| Ilvy | Wissen teilen, Experimente, Lore-Funde. Geschenk: Aether-Kristalle, Bücher. | Bücherverbrennung, Aberglaube, das Siegelband | **„Der kleine Riss“ (4):** Ihr Experiment hat im Keller der Lumenspitze einen Mini-Riss erzeugt, der wächst. Sie braucht Blut eines Rissgeborenen. Ende: Riss schließen (sie verliert einen Teil ihrer Magie) oder stabilisieren (Aether-Quelle, Leere-Resonanz +5). | **Überladung:** Der nächste Zauber des Spielers macht +50 % Schaden und löst eine Elementkombination aus. | ❓ ja (Empfehlung) |
| Morwen | Geheimnisse, Rache an Unterdrückern, Kröten. Geschenk: Pilze, Alraunen. | Hexenjagd, Feuer als Strafe, Lügen über Ysolde | **„Die Neun Nebel“ (4):** Eine Intrige im Zirkel. Ihre Mentorin Ysolde (die Kräuterfrau aus dem Eichental) soll den Zirkel verraten haben. Ende: Ysolde rehabilitieren oder Morwen wird selbst Zirkelmutter. | **Krötenfluch:** Verwandelt einen Nicht-Boss-Gegner für 8 s in eine Kröte. | nein |
| Ludo | Barmherzigkeit, Wein, Verlierern helfen. Geschenk: guter Wein. | Fanatismus, Folter, die Verwahrung | **„Die letzte Beichte“ (4):** Vor 20 Jahren segnete er die Rissjagd-Truppe, die das Dorf Weidenbruch auslöschte. Er sucht den einzigen Überlebenden, und das ist Kael. | **Letzte Ölung:** Heilt die Gruppe um 40 %, entfernt Statuseffekte und belebt einmal pro Kampf einen gefallenen Begleiter. | nein |
| Gundra | Handwerk, Ehrlichkeit, Bier. Geschenk: seltene Erze. | Feigheit, Diebstahl von Ahnengut | **„Heimkehr“ (5):** Sie wurde verbannt, weil sie vor dem Schweigen über die Tiefen warnte. Sie will den Ahnenrat überzeugen, das Tor zu öffnen (verknüpft mit E4.2). | **Ahnenhammer:** Bodenschlag, der alle Gegner im Radius von 5 m betäubt (Haltung sofort leer). | nein |
| Ashka | Natur schützen, Sterne und Geschichten, Jagd. Geschenk: Federn, Sternkarten. | Minen, Gier, die Leere | **„Das Lied von Ir-Hamad“ (4):** Sie sucht das alte Lied, um die Toten ihres Stammes zu ehren. Am Ende liefert sie eine der Vier Tafeln. Das ist ein zweiter Weg zum Ende „Lied“. | **Sternenschuss:** Markiert bis zu 5 Gegner. Markierte Gegner erleiden 8 s lang +30 % Schaden. | nein |
| Kael | Ehrlichkeit über die Leere, Aether-Nutzung, Ruhe. Geschenk: kleine Alltagsdinge (Spielzeug, Musikinstrument). | Käfige und Verwahrung, der Kult, als Werkzeug benutzt zu werden | **„Der Junge aus Weidenbruch“ (5):** Seine Erinnerungen kehren zurück. Er überlebte das Massaker, wuchs beim Kult auf und soll in Akt 5 dessen „Pforte“ werden. Ende: Er bricht die Bindung oder er wird zur Pforte (Verrat). | **Rissschritt:** Teleportiert die Gruppe 15 m weit und hinterlässt am Startpunkt eine Aether-Explosion. | ❓ ja (Empfehlung) |

Summe der Begleiterquests: 5 + 4 + 4 + 4 + 4 + 5 + 4 + 5 = **35** (Budget in [00](./00_Vision_und_Ueberblick.md): 32; §16.2: 32–48).

### 10.3 Loyalität

**Vorschlag:** Skala 0–100, Startwert 30 (Maren 40 oder 25 nach E1.1, Morwen 10 nach Auslieferung des Zirkels). ID `stat.begleiter.<name>.loyalitaet`.

| Schwelle | Wirkung |
|---|---|
| ≤ 10 | Der Begleiter verlässt die Gruppe. Vorher gibt es bei 20 ein Warngespräch. Rückkehr nur über eine Versöhnungsquest (eine je Begleiter). |
| ≤ 10 in Akt 4 | **Verrat** (nur Kael, Jasper, Maren): Kael schließt sich dem Kult an, Jasper verkauft Informationen an die Gilde oder den Kult, Maren stellt sich gegen den Spieler, wenn dessen Leere-Resonanz ≥ 70 ist. Der Begleiter wird zum Gegner mit eigenem Kampf. |
| 25 | Normale Kommentare und Kampf-KI |
| 40 | Persönliche Questreihe startet |
| 60 | Spezialfähigkeit, Questreihe Teil 2 und folgende |
| 75 | Romanze möglich (falls vorgesehen), Ausrüstungs-Upgrade |
| 90 | Spezialfähigkeit Stufe 2. Voraussetzung für Ende 5 „Das Opfer“. |

| Quelle | Loyalität |
|---|---|
| Entscheidung, die der Begleiter mag / hasst | +3 / −3, bei großen Entscheidungen +10 / −10 |
| Schritt der persönlichen Questreihe | +10 |
| Lagerfeuer-Gespräch / persönliches Gespräch | +2 / +5 |
| Geschenk: normal / gemocht / Lieblingsgeschenk / verhasst | +1 / +3 / +6 / −3. Höchstens 1 Geschenk pro Begleiter und Spieltag. Geschenke allein heben die Loyalität höchstens bis 60. |
| Charisma | +2 % auf Gewinne je Punkt über 10, höchstens +20 % |

- **Anzeige:** Balken mit Stufenwort (Abweisend, Kühl, Kollegial, Vertraut, Verbunden), ohne Zahl. Jede Änderung wird kurz eingeblendet („Maren missbilligt das“, abschaltbar).
- **Ausrüstung und Skilltree:** Jeder Begleiter hat eigene Slots und einen kleinen Baum (Vorschlag: 12 Knoten). KI-Verhalten Aggressiv, Defensiv, Unterstützend, Passiv (§19). Details in [03](./03_Kampf_Charakter_Progression.md).

### 10.4 Lagerfeuer-Gespräche

- **Auslöser:** Rast an einem Lagerplatz mit 2 Begleitern nach einem Meilenstein (Questabschluss, neue Region, Aktwechsel).
- **Inhalt:** Gespräche zwischen Paaren mit Spannung, dazu Einzelgespräche mit dem Spieler.
- **12 Paare (Vorschlag):** Maren–Kael (Verwahrung) · Maren–Jasper (Gesetz und Dieb) · Ludo–Kael (Weidenbruch) · Ilvy–Morwen (Wissenschaft und Hexerei) · Gundra–Ilvy (Runen und Aether) · Ashka–Jasper (Gier) · Ashka–Ilvy (Minen) · Morwen–Maren (Hexenjagd) · Gundra–Ludo (Trinkwettstreit, rein komisch) · Jasper–Ludo (Beichte eines Diebes) · Kael–Ashka (die Leere) · Gundra–Maren (Pflicht und Ehre).
- **Umfang:** 12 Paare × 3 Gespräche plus 8 × 3 Einzelgespräche = 60 Gespräche à ~12 Zeilen, ~720 Zeilen je Sprache.
- Am Lagerfeuer kann man außerdem kochen (§13) und Zeit überspringen.

### 10.5 Tierbegleiter

Regeln (§19): Nur für Waldläufer bzw. wer den Waldläufer-Ast „Tierbund“ erlernt. Mit Tierbegleiter ist höchstens 1 humanoider Begleiter dabei. Es ist immer nur ein Tier aktiv, gewechselt wird im Stall von Gut Eichenruh. Ein gefallenes Tier kehrt nach 60 s zurück.

| Tier | Rolle | Fähigkeit | Erhalt (Vorschlag) |
|---|---|---|---|
| Wolf | Schaden, Blutung | **Rudelruf:** Biss mit Blutung und hohem Haltungsschaden | Eichental: Welpe in der Wolfshöhle am Nordhang (Quest 2). Nicht-Waldläufer können ihn als Haustier im Haus halten. |
| Falke | Aufklärung, Störung | Markiert Gegner durch Wände (30 m). Blendung unterbricht Fernkämpfer und Magier. | Goldküste: Nest an den Klippen von Kap Varro |
| Bär | Tank | Spott, hohe LP, Haltungsschaden | Frostgipfel: Bärenjunges im Jägerlager Weißfell |

### 10.6 Begleiter im Vertical Slice

**Vorschlag: Ser Maren Falkenried.** Gründe:
1. Sie nutzt Einhandschwert und Schild, also einen der 3 Waffentypen des Vertical Slice. Die Animationen des Spielers lassen sich wiederverwenden.
2. Als Tank ergänzt sie beide Klassen des Vertical Slice (Krieger, Magier).
3. Sie hängt an der ersten Story-Entscheidung (E1.1) und stellt die Silberwacht vor.
4. Ihr trockener, ernster Ton setzt den Maßstab für die übrigen Begleiter.

Umfang im Vertical Slice: Rekrutierung, Loyalität (Warnung bei 20, Verlassen bei 10), Kommentare zu den 8 Beispiel-Quests, 2 Einzelgespräche am Lagerfeuer, KI-Verhalten. Bei Loyalität 40 gibt es nur ein Ausblick-Gespräch. Ihre persönliche Questreihe kommt erst in Stufe B.

❓ **Offene Entscheidung: Romanzen.** Optionen: keine · bei 4 von 8 Begleitern · bei allen. Empfehlung: 4 (Maren, Jasper, Ilvy, Kael), unabhängig vom Körpertyp der Spielfigur, höchstens 1 aktive Romanze, keine expliziten Szenen (passend zu USK 16).

---

## 11. Gegner-Roster (§20.1) & Bosse (§20.3)

Kampfverhalten, KI-Zustände, Wahrnehmung und das Token-System stehen in [03_Kampf_Charakter_Progression](./03_Kampf_Charakter_Progression.md). Hier stehen nur Roster und Konzepte (**Vorschlag**). Rollen nach §20.1: Nahkämpfer, Fernkämpfer, Magier, Heiler, Tank, Schwarm, Hinterhalt, Beschwörer.

### 11.1 Gegnerfamilien pro Region

| Region | Familien | Typen (Rolle) | Anzahl |
|---|---|---|---|
| Eichental | Wölfe, Wildtiere, Banditen, Untote, Rissbrut | Grauwolf (Schwarm) · Wildkeiler (Tank) · Bandit-Schläger (Nahkämpfer) · Bandit-Armbrustschütze (Fernkämpfer) · Gruftskelett (Nahkämpfer) · Rissling (Hinterhalt) | 6 |
| Goldküste | Piraten, Schmuggler, Krustentiere, Harpyien, Ertrunkene | Pirat-Entermesser (Nahkämpfer) · Pirat-Harpunier (Fernkämpfer) · Sturmrufer (Magier) · Riesenkrabbe (Tank) · Klippenharpyie (Schwarm) · Ertrunkener (Nahkämpfer, Nacht) · Schmuggler-Messerwerfer (Hinterhalt) · Korallenrufer (Beschwörer) | 8 |
| Moorschatten | Untote, Hexen, Moorgetier, Trolle, Irrlichter | Moorleiche (Nahkämpfer) · Skelett-Bogenschütze (Fernkämpfer) · Totenbeschwörer (Beschwörer) · Abtrünnige Hexe (Magier) · Sumpfspinne (Hinterhalt) · Giftkröte (Fernkämpfer) · Moortroll (Tank) · Irrlicht (Schwarm) · Pestpriester (Heiler) | 9 |
| Kar'Zul | Skorpione, Grabwächter, Geister, Wüstenräuber, Konstrukte | Riesenskorpion (Tank) · Sandkriecher (Hinterhalt) · Grabwächter (Nahkämpfer) · Mumienpriester (Heiler) · Sandgeist (Magier) · Wüstenräuber-Speerwerfer (Fernkämpfer) · Skarabäenschwarm (Schwarm) · Obelisk-Konstrukt (Fernkämpfer) | 8 |
| Frostgipfel | Frostbestien, Riesen, Drachenbrut, Runenbrecher, Konstrukte | Frostwolf (Schwarm) · Frostriese (Tank) · Eisharpyie (Fernkämpfer) · Frostgeist (Magier) · Eiswyrmling (Nahkämpfer) · Runenbrecher (Nahkämpfer) · Runenwächter (Tank) · Eiskriecher (Hinterhalt) | 8 |
| Glutlande | Elementare, Dämonen, Aschenzungen (Kult), Golems | Feuerelementar (Magier) · Glutimp (Schwarm) · Aschenzungen-Berserker (Nahkämpfer) · Flammenrufer (Beschwörer) · Magmaschlange (Hinterhalt) · Schlackengolem (Tank) · Glutmastiff (Nahkämpfer) · Blutpriester (Heiler) | 8 |
| Aurelion | Stadtwache, Unterwelt, Kult, Kanalgetier | Stadtwache-Hellebardier (Tank) · Meuchler (Hinterhalt) · Kult-Schattenwirker (Magier) · Rattenschwarm (Schwarm) · Kanalghul (Nahkämpfer) · Bombenwerfer (Fernkämpfer) · Söldner-Feldscher (Heiler) | 7 |
| Zerbrochener Himmel | Leere, Echos, Fragmente | Leerwandler (Nahkämpfer) · Leere-Auge (Fernkämpfer) · Fragmentgolem (Tank) · Aetherschlange (Hinterhalt) · Echo-Ritter (Nahkämpfer) · Leere-Schwärmer (Schwarm) · Sternenmagier-Echo (Magier) · Leere-Prediger (Beschwörer) | 8 |
| Überregional | Rissbrut, Kult der Leere | Gebrochener (Nahkämpfer) · Rissbestie (Tank, ab Akt 2) · Riss-Speier (Fernkämpfer) · Kult-Klinge (Nahkämpfer, ab Akt 2) · Kult-Akolyth (Heiler, ab Akt 2) | 5 |
| **Summe** | | | **67** (§20.1: ≥ 60) |

- **ID-Schema:** `enemy.<familie>.<typ>`, z. B. `enemy.pirat.harpunier`, `enemy.untot.moorleiche`.
- **Rigs:** Die 67 Typen kommen mit ~12 Basis-Rigs aus: Mensch, Zwerg, kleiner Vierbeiner, großer Vierbeiner, Gliederfüßer (Spinne, Skorpion, Krabbe), Flugwesen, großer Humanoid (Troll, Riese, Golem), Schlange, schwebend/amorph (Geist, Elementar, Irrlicht), Kleinkreatur (Rissling, Imp, Ratte), Drache, Leere-Gestalt.
- **Gemischte Gruppen** (§20.1) als Datenvorlagen je Familie. Beispiele: Banditen = 2 Schläger + 1 Armbrustschütze, ab Level 6 mit Elite-Anführer. Moorschatten = 3 Moorleichen + 1 Totenbeschwörer + 1 Pestpriester.

### 11.2 Variantensystem

Jeder Typ existiert in den Varianten aus §20.1. Die Varianten sind **Daten-Overrides** desselben Typs, keine eigenen Modelle.

| Variante | Werte (Vorschlag) | Verhalten / Moveset | Optik | Loot | Anteil |
|---|---|---|---|---|---|
| Normal | Basiswerte nach Regionslevel | Grund-Moveset (3–4 Angriffe) | Basis-Material | Standard-Lootliste | ~80 % |
| Elite | Level +2, LP ×2, Schaden ×1,3, Haltung ×1,5 | +1 Angriff, kontert nach einem Parieren | Rüstungs- oder Farbvariante, Elite-Symbol | 2 Würfe, höhere Chance auf eine bessere Seltenheit | ~15 % |
| Champion | Level +3, LP ×4, Schaden ×1,5, Haltung ×2 | 1–2 Affixe aus einem Pool: Schnell, Feuer-Aura, Frost-Aura, Spiegelnd (reflektiert 15 % Fernkampf), Beschwörer (2 Diener), Unerschütterlich, Regenerierend, Teleportierend | Eigener Name (z. B. „Grimma die Unbeugsame“), Mini-Boss-Balken | Mindestens Selten, Chance auf Episch | ≤ 1 je Gruppe, ~5 % |
| Aether-verderbt (Modifikator, mit jeder der drei Stufen kombinierbar) | +25 % Schaden als Aether-Schaden, Aether-Resistenz +50 % | Treffer erzeugen +5 Verderbnis beim Spieler. **Kristallkern** als Schwachpunkt-Hurtbox: ×2 Schaden. Zerbricht der Kern, ist der Gegner 3 s betäubt und verliert den Aether-Bonus. | Kristallwucherungen (universelles Mesh-Kit plus Shader) | Aether-Kristalle, Splitter | Nahe Rissen (Dichte ≥ 1) 30–60 %, sonst 0–5 % |

- Kosten: ein Material-Set je Familie für Elite und Champion, ein universelles Kristall-Kit für alle verderbten Varianten.
- Ab der Weltstufe im Endgame werden Gegner auf das Spielerlevel gehoben (§20.4), siehe [04](./04_Items_Crafting_Wirtschaft_Endgame.md).

### 11.3 Bosse

**Story-Bosse je Akt** (§20.3: mehrere Phasen, eigene Arena, Musik und Mechaniken):

| Akt | Boss | ID | Arena | Phasen |
|---|---|---|---|---|
| 1 | Ealdor, der Aschenhirsch | `boss.story.ealdor_aschenhirsch` | Lichtung am Steinkreis von Altenhain | **P1 (100–60 %):** Geweih-Ansturm, Hufstampfer. Haltung brechen legt den Kristallkern frei. **P2 (60–25 %):** Kristalle wachsen aus dem Boden, Mini-Risse spawnen Risslinge und Wölfe. **P3 (< 25 %):** Eine Aschewand lässt die Arena schrumpfen. Das Riss-Siegel ist der Finisher (Tutorial). |
| 2 | Hierophant Kaldris | `boss.story.hierophant_kaldris` | Glockenturm von Aurelion, mehrere Ebenen | **P1:** Duell mit Kultisten, Akolythen heilen ihn (zuerst ausschalten). **P2:** Leere-Zonen breiten sich am Boden aus, der Spieler weicht auf Glockenplattformen aus. **P3:** Der Turm bricht, Kampf in der Glockenstube, Glockenschläge erzeugen Schockwellen im Takt. |
| 3 | Ankhar, der letzte Sonnenkönig | `boss.story.ankhar` | Sarkophagkammer im Grabmal der Sonnenkönige | **P1:** Sonnenklinge, Mumienwächter. **P2:** Die Kammer wird dunkel, nur Lichtstrahlen über Spiegel machen ihn verwundbar. **P3:** Sandsturm in der Kammer, Echo-Kopien. Echo-Lesen zeigt das echte Ziel. |
| 4 | Ignareth, der Leere-Drache | `boss.story.ignareth` | Krater Ashkarr | **P1 (Boden):** Feueratem, Schwanzfeger. **P2 (Luft):** Lavaregen. Der Spieler holt den Drachen mit Ballisten herunter. Wie viele Ballisten bemannt sind, hängt vom Ally-Score ab. **P3 (Leere):** Teile der Arena verschwinden, der Drache wechselt zwischen Feuer- und Leere-Atem. |
| 5 | Der Graue Wanderer | `boss.story.grauer_wanderer` | Sternwarte von Caelum | **P1:** Duell mit gespiegeltem Rissläufer-Moveset (Teleport). **P2:** Er ruft Echo-Ritter aus der Vergangenheit. **P3:** Er zapft das Herz an, die Inseln der Arena driften. Bei Pakt (E3.3) und Leere-Resonanz ≥ 50 folgt eine Verhandlung statt eines Kampfes. |
| 5 | Finale je Ende | `boss.story.herz_der_leere` | Herz des Risses | **Siegel / Opfer:** Avatar der Leere in 3 Phasen, Plattformen schließen sich, Riss-Siegel als Kernmechanik. **Krone:** Avatar der Leere, dazu Aether-Türme laden (Kanalisieren unter Druck). **Lied:** kein Kampf, sondern eine Prüfung aus Echo-Rätseln und Dialog mit Lina. **Tor:** Kampf gegen die eigenen Verbündeten (Pakt-Anführer und ein Begleiter). |

**Weitere Bosse:**
- **Dungeon-Bosse:** Jeder Dungeon hat einen Boss (§20.3), also 40–64. **Vorschlag:** 60 % als Champion-Variante eines vorhandenen Typs mit eigener Arena-Mechanik, 40 % als eigener Boss.
- **Weltbosse:** 31 Konzepte in den Regionsprofilen ([4.1](#41-das-eichental-level-110)–[4.8](#48-der-zerbrochene-himmel-level-6080-endgame)). **Vorschlag:** Respawn nach 3 Spieltagen. Loot in [04](./04_Items_Crafting_Wirtschaft_Endgame.md).
- **Musik:** 1 eigenes Thema je Story-Boss, 1 gemeinsames Weltboss-Thema je Region.

### 11.4 Gegner im Vertical Slice (§31 Phase 4)

**Vorschlag:** Diese 5 Gegnertypen decken die 8 Beispiel-Quests ab und brauchen nur 3 Rigs (Mensch, kleiner Vierbeiner, Kleinkreatur).

| # | Typ | ID | Rolle | Varianten im Vertical Slice | Einsatz | Lehrt |
|---|---|---|---|---|---|---|
| 1 | Grauwolf | `enemy.wolf.grauwolf` | Schwarm | Normal, Elite (Rudelführer), Aether-verderbt | Quest 1 und 2, Wildnis | Ausweichen, Gruppen lesen. Die verderbte Variante trägt „Die Wölfe vom Nordhang“. |
| 2 | Bandit-Schläger | `enemy.bandit.schlaeger` | Nahkämpfer | Normal, Elite | Quest 4 und 6 | Parieren gegen klar angekündigte Schläge |
| 3 | Bandit-Armbrustschütze | `enemy.bandit.armbrustschuetze` | Fernkämpfer | Normal | Quest 4 und 6 | Deckung, Positionswechsel, Schleichziel |
| 4 | Gruftskelett | `enemy.untot.gruftskelett` | Nahkämpfer | Normal, Elite (mit Schild, blockt frontal) | Quest 7 | Haltung brechen, Schwäche gegen Wucht |
| 5 | Rissling | `enemy.rissbrut.rissling` | Hinterhalt | Normal, Elite | Quest 1, Wildnis am Riss | Aether-Bedrohung, springt aus Spalten |

**Bosse im Vertical Slice:**
- **Grimmbart** (`boss.eichental.grimmbart`): **Vorschlag** für die Mechanik (Details in [02](./02_Quests_und_Dialoge.md)): P1 Duell mit Zweihandaxt, wirft Brandöl-Flaschen (Feuer + Öl = Explosion, §9.5). P2 ab 50 %: ruft 2 Banditen und zündet Ölfässer im Steinbruch. Der Spieler kann die Fässer selbst nutzen.
- **Ritter Odric, der Eidgebundene** (`boss.eichental.ritter_odric`): Schwert und Schild. In der Eidphase ist er unverwundbar, bis der Spieler zwei Eidsiegel im Raum zerstört. Damit verbindet sich der Kampf mit dem Gruft-Rätsel.

---

## Offene Entscheidungen

| Frage | Optionen | Empfehlung | Warum wichtig |
|---|---|---|---|
| Wer hat den Großen Riss geöffnet? ([2.2](#22-der-antagonist-und-die-akt-3-enthüllung)) | A: Magister Valerian Ascor · B: Silberwacht-Gründer Aldric Sturmfels · C: Seraphine, die Erste Rissgeborene („der Damm“) | A, mit dem Element aus C, dass seine Warnung vor der Leere stimmt | Bestimmt Akt 3–5, die Rolle von Konvent und Silberwacht und den Ton der Enden |
| Persönlicher roter Faden: Schwester Lina | ja · nein | ja | Gibt der Hauptstory eine emotionale Achse. Kostet wenig (Prolog, Echos, Epilog). |
| Spielfigur: Geschlecht und Aussehen (auch in [00](./00_Vision_und_Ueberblick.md)) | frei gestaltbar · fester Charakter | Frei, 2 Körpertypen, Presets, Pronomen getrennt wählbar | Kosten für Modelle und Rüstungen, Identifikation |
| Stimme des Protagonisten | unvertont · vertont (DE + EN) | Unvertont, mit 2 Sets Kampflauten | Spart geschätzt 8.000–12.000 Aufnahmen |
| Völker | nur Menschen und Zwerge · weitere Völker (z. B. Elfen) | Nur Menschen und Zwerge, Vielfalt über Kulturen | Jedes Volk kostet Körpermodelle, Animationen und Rüstungsvarianten |
| Beitritt zum Kult der Leere ([8.5](#85-beitritt-zum-kult-der-leere)) | A: kein Beitritt · B: verdeckter Pfad ab Akt 3 · C: voller Beitritt | B | Erfüllt §15.3, bereitet das Ende „Tor“ vor, ohne teure exklusive Gebiete |
| Romanzen ([10.6](#106-begleiter-im-vertical-slice)) | keine · 4 von 8 · alle | 4 (Maren, Jasper, Ilvy, Kael), keine expliziten Szenen | Schreibaufwand, Altersfreigabe, Erwartung der Zielgruppe |
| Verrat durch Begleiter | keiner · 3 Begleiter · alle | 3 (Kael, Jasper, Maren) | Jeder Verrat braucht einen eigenen Kampf und Dialoge |
| Fünftes Ende „Das Opfer“ | ja · nein | ja | Günstig (eine Szene und Epilog), belohnt hohe Loyalität |
| Spielbare Echo-Sequenzen in Akt 3 | 3 kurze Sequenzen · nur Zwischensequenzen · keine | 3 kurze Sequenzen mit wiederverwendeten Assets | Zeigt die Enthüllung, statt sie zu erzählen. Kostet Level-Design-Zeit. |
| Weltgröße ([3.1](#31-weltgröße-vorschlag)) | ~46 km² begehbar · kleiner (~30 km²) · größer | ~46 km², mit Option auf 70 % für Kar'Zul und Frostgipfel nach Messung | Größter Einzelfaktor für Welt-Art-Kosten |
| Würfel oder feste Werte bei Proben (Bestechen, Überreden) | Würfel · feste Schwellen | Wird in [02](./02_Quests_und_Dialoge.md) geführt | Betrifft Kopfgeld-Dialoge und Ruf-Nachsicht hier |
| Fraktionsquests je Fraktion | 15 (Budget aus 00) · bis 25 (§15.3) | 15, Kapitelstruktur erweiterbar auf 20 | ~70 Quests Unterschied über alle Fraktionen |

---

## Risiken & Hinweise

1. **Der Umfang der Welt allein übersteigt ein kleines Team.** Ortsbau (~2.400 PT) und Welt-Art (~1.150–1.850 PT) ergeben zusammen grob 3.500–4.500 PT, ohne Quests, Figuren und Audio.
   → Gegenmaßnahme: Mit den Minimalwerten aus §14.3 planen. Dungeon- und POI-Kits. PT pro km² und pro Dungeon nach Stufe A messen, danach neu rechnen (Schrumpfoption in 3.1).
2. **Verzweigungs-Explosion:** 13 Story-Entscheidungen, Ally-Score, 5 Enden und Fraktionsausschlüsse ergeben sehr viele Kombinationen, die getestet werden müssen.
   → Gegenmaßnahme: Nur 3 strukturelle Verzweigungen (Pakt, Belagerung, Ende). Alle anderen Entscheidungen ändern Details, nicht die Struktur. Automatisierte Tests, die Flag-Kombinationen per Debug-Konsole setzen (`set_flag`) und prüfen, ob jedes Ende erreichbar bleibt.
3. **Teure Inhalte, die viele Spieler nie sehen** (Fraktionsenden, verpasste Begleiter, 4 von 5 Enden).
   → Gegenmaßnahme: Kapitel I aller Fraktionen für alle offen. Exklusive Inhalte als Dialog und Epilog statt neuer Gebiete. Orte und Assets zwischen Fraktionsreihen teilen.
4. **Aurelion ist der teuerste Einzelort und ein Performance-Risiko** (NPC-Dichte, Draw Calls, Tagesabläufe).
   → Gegenmaßnahme: In Stufe B nur 2 Viertel. NPC-Budget je aktiver Zelle festlegen (Vorschlag: ≤ 40 simulierte NPCs). Früher Performance-Test auf dem MacBook.
5. **Inseldrift im Zerbrochenen Himmel** ist technisch heikel (NavMesh, Speichern, Orientierung).
   → Gegenmaßnahme: 3–4 vorgefertigte Layouts, die wöchentlich wechseln, statt freier Bewegung. Eigener Weltbereich mit eigenem Ursprung.
6. **67 Gegnertypen** bedeuten viel Animation.
   → Gegenmaßnahme: ~12 Basis-Rigs, Varianten nur über Daten, zugekaufte Animationspakete für Standard-Rigs. Neue Typen nur, wenn eine Rolle in der Region fehlt.
7. **Textvolumen:** Barks (~1.100 Zeilen), Lagerfeuer (~720 Zeilen), Gerüchte und Dialoge, jeweils in DE und EN.
   → Gegenmaßnahme: Wortbudgets je Kategorie im Quest- und Dialog-Editor, Übersetzung je Akt.
8. **Sensible Themen:** Hexenverbrennung, Massaker an Rissgeborenen, Verwahrung, eine an Wüstenkulturen angelehnte Region.
   → Gegenmaßnahme: Abgleich mit der Ziel-Altersfreigabe (Empfehlung USK 16 in [00](./00_Vision_und_Ueberblick.md)). Keine realen Religionen oder Kulturen kopieren. Externes Sensitivity-Review für Kar'Zul vor dem Content-Lock.
9. **Zeitgebundene Inhalte** (Gezeiten, Mondphasen, Nacht, Ladenzeiten) können zu Wartezeit führen.
   → Gegenmaßnahme: Warten und Schlafen überall außerhalb des Kampfes. Das Questlog nennt Zeitfenster. Kein Pflichtinhalt der Hauptstory hängt an Mondphase oder Gezeiten.
10. **Klima und Verderbnis können frustrieren.**
    → Gegenmaßnahme: Klare HUD-Anzeige mit Vorwarnung, kein LP-Verlust auf „Geschichte“, im Vertical Slice die Verderbnis per Playtest-Telemetrie messen (wie oft erreichen Spieler 100?).
11. **Parallele Autoren können Namen und IDs unterschiedlich vergeben.**
    → Gegenmaßnahme: Die IDs aus diesem Dokument sind Kanon für Welt, Orte und NPCs. Der ID-Validator (§6.3) prüft Dubletten. Abweichungen werden hier nachgetragen, nicht in Kopien.
