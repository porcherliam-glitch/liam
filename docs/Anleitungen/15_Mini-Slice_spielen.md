# Anleitung 15 – Den Mini-Slice spielen

Stand: 2026-10-14. Der Mini-Slice ist jetzt von Anfang bis Ende spielbar: Dorf Eichental, drei Quests, die Gruft mit Rätseln und Boss. Claude hat alles automatisch durchspielen lassen (0 Fehler, siehe [Anleitung 14](./14_Test_MiniSlice_Quests.md)). Jetzt bist du dran.

**Dauer:** etwa 45–60 Minuten.

## 1. Starten

**Am einfachsten, ohne Unity:** Auf dem Desktop den Ordner **Aetherfall Spiel** öffnen und **Aetherfall.exe** doppelklicken. Im Hauptmenü **Neues Spiel**, dann deine **Klasse** wählen. Im Ordner liegt auch „So spielst du.txt“ mit allen Tasten. Claude baut diese Version neu, wenn sich etwas ändert. Läuft das Spiel gerade, während Claude baut, liegt die neue Version im Ordner **Aetherfall Spiel (neu)**.

**Klassenwahl:**
- **Krieger:** Schwert und Schild, viel Leben. Er kämpft im Nahkampf: schlagen, blocken, parieren.
- **Magier:** Lehrlingsstab und Stoffrobe, wenig Leben, viel Mana. Die linke Maustaste schießt Feuergeschosse (bis 25 m, sie fliegen zum nächsten Gegner vor dir oder zum anvisierten). Die rechte Maustaste wirft einen großen, langsameren Feuerball. Halte Gegner auf Abstand.
- Beide Klassen bekommen am Riss den Aether-Stoß (Taste 4).

**In Unity (zum Testen):**

1. Unity Hub → Projekt `Desktop\Aetherfall` öffnen (Version 6000.6.5f1).
2. Im Project-Fenster `Assets/_Project/Scenes/Boot/Boot.unity` doppelklicken.
3. Oben auf ▶ (Play) drücken und einmal ins Game-Fenster klicken.
4. Hauptmenü → **Neues Spiel**. Du startest auf Stufe 1 im Dorf.
5. Zum Beenden wieder auf ▶ drücken.

Tipp: Im Game-Fenster oben in der Leiste **Play Maximized** wählen, dann ist das Bild größer.

## 2. Tasten (Tastatur und Maus)

| Was | Taste |
|---|---|
| Laufen | **W A S D** |
| Umsehen | Maus |
| Sprinten | **Umschalt links** (halten) |
| Schleichen | **C** |
| Springen | **Leertaste** |
| Sprechen, benutzen, aufheben | **E** |
| Leichter Angriff / schwerer Angriff | **linke / rechte Maustaste** |
| Blocken (kurz vor dem Treffer: Parieren) | **Q** (halten) |
| Ausweichen | **Strg links** |
| Gegner anvisieren / wechseln | **T** oder mittlere Maustaste / Mausrad |
| Bogen ziehen / wegstecken (Fernkampf-Haltung) | **F** |
| Mit Bogen: zielen (Fadenkreuz) / spannen und schießen | **rechte Maustaste** halten / **linke Maustaste** halten und loslassen |
| Mit Bogen ohne Zielen: schneller Hüftschuss (halber Schaden) | **linke Maustaste** |
| Fähigkeiten der aktiven Leiste (unten rechts; Name über dem Feld) | **1 2 3 4** |
| Zweite Fähigkeitenleiste anzeigen (2 × 4 Plätze) | **X** |
| Aether-Stoß (ab dem Riss im Prolog, Leiste 1, Feld 4): stößt alle Gegner vor dir 3 m zurück, 15 Mana, danach 8 s warten | **4** |
| Heiltrank trinken: +35 % Leben, dauert knapp eine Sekunde, ein harter Treffer bricht ab (3 Stück zu Beginn) | **5** |
| Manatrank trinken (Magier, 3 Stück zu Beginn): +40 % Mana | **6** |
| Inventar und Charakter | **Tab** |
| Questlog | **J** |
| Skill-Baum (Fähigkeiten lernen) | **K** |
| Schnell speichern / laden | **F5** / **F9** |
| Pause, Menü, Spiel speichern | **Esc** |
| Im Gespräch: Antwort wählen | **1–9** oder Maus, weiter mit **E** oder **Leertaste** |

Mit Gamepad geht es auch (Xbox-Belegung: A springen und benutzen, X/Y angreifen, B ausweichen, LB blocken, RB + A Aether-Stoß, mit Bogen LT zielen und RT schießen).

**Bogen:** Je länger du die linke Maustaste hältst (bis knapp eine Sekunde), desto stärker und schneller fliegt der Pfeil; das Kästchen im Fadenkreuz wird dabei kleiner. Pfeile fallen auf weite Strecken etwas ab, also bei 40 m etwas höher zielen. Ein Kopftreffer macht 75 % mehr Schaden. Jeder Schuss kostet einen Pfeil (Anzeige neben dem Fadenkreuz) und etwas Ausdauer; hältst du lange voll gespannt, zittert der Arm. Mit **F** steckst du den Bogen wieder auf den Rücken und hast Schwert und Schild zurück. Mit dem **Mausrad** wechselst du in der Bogen-Haltung die Pfeilart: **Feuerpfeile** (bei Tobold) setzen Ziele in Brand und lassen Ölfässer explodieren. Etwa jeder zweite Holzpfeil bleibt liegen – im Boden oder im besiegten Gegner – und kann mit **E** wieder aufgehoben werden.

**Feuer und Fässer:** Drei Feuertreffer des Magiers setzen ein Ziel in Brand (ein Wolf ist meist vorher schon tot, Skelette und Bosse halten länger): Es verliert 6 Sekunden lang 2 % seines Lebens je Sekunde und flieht. Brennst du selbst, hilft eine Rolle (−1,5 s) oder Wasser. An Tobolds verbrannter Schmiede stehen **Ölfässer**: Ein Feuergeschoss lässt sie explodieren (3 m, das Nachbarfass fliegt mit, die Pfütze brennt 8 s), ein Schwerthieb zerbricht sie nur zu einer Ölpfütze – wer darin steht, ist „ölig“ und brennt doppelt so schnell; Feuer in die Pfütze zündet sie. Das **Pulverfass** hinter der Scheune sprengt 5 m. Unten links im HUD steht, was dich gerade plagt (Brennen, Betäubt …) und wie viel **Aether-Verderbnis** du trägst: Jeder Aether-Stoß gibt +2, jeder Treffer eines leuchtenden Wolfs +5; ab 25 bist du „Berührt“ (mehr Aether-Schaden, weniger Heilung), bei 100 „Überflutet“ (20 s lang 2 % Leben je Sekunde). Ohne neue Quelle sinkt der Balken um 2 je Sekunde.

**Streitkolben:** Bei Tobold zu kaufen, im Inventar (**Tab**) anlegen. Drei langsamere, wuchtige Schläge statt vier Schwerthieben, der dritte von oben; dafür bricht er die Deckung schneller. Den Schild behältst du.

**Zauber (Magier):** Der Magier kann von Anfang an drei Zauber, je einen pro Schule, auf den Tasten **1–3**: **Feuerball** (fliegt, explodiert in 2 m und setzt in Brand), **Eislanze** (durchbohrt den ersten Gegner und trifft noch einen zweiten, lässt erfrieren) und **Kettenblitz** (springt von deinem Ziel auf bis zu zwei weitere Gegner, jeder Sprung 20 % schwächer). Gezielt wird auf den anvisierten Gegner (**T**), sonst auf den nächsten. Zauber kosten Mana (etwas mehr mit jeder Stufe) und haben eine Wartezeit. Die sechs anderen Zauber lernst du im Skill-Baum (**K**): Flammenteppich (Boden brennt 6 s), Glutmantel (Feuer-Aura), Frostnova (Frost-Ring um dich), Eispanzer (mehr Rüstung, Angreifer frieren), Gewitterruf (drei Blitze aus dem Himmel) und Sturmschritt (20 % schneller, eine Rolle hinterlässt einen Schock). Mit **X** wechselst du zur zweiten Leiste.

**Skill-Baum (K):** Mit jeder Stufe bekommst du einen Skillpunkt (bis Stufe 8 also 7). Taste **K** öffnet im Tagebuch die Seite „Fähigkeiten“ mit dem Baum deiner Klasse: oben der Kern (von Anfang an gelernt), darunter die drei Äste. **Enter** (oder ►) lernt den markierten Knoten, **F** (oder ◄) nimmt ihn zurück, solange die Seite offen ist. Stufe II eines Asts öffnet sich mit 3 Punkten in seinen unteren Knoten; bei einer Gabelung geht nur eine Seite. Gelernte Fähigkeiten kommen von selbst auf die Leiste; mit **Z / C** schiebst du die markierte Fähigkeit auf einen anderen Platz (nach Platz 8 nimmt sie es von der Leiste). Mit **Q / E** wechselst du zwischen Questlog, Charakter und Fähigkeiten.

**Krieger-Techniken (Skill-Baum):** **Wirbelklinge** (zwei Drehungen, trifft alles um dich), **Schildschlag** (nur mit Schild: betäubt und unterbricht), **Spott** (Gegner in 10 m greifen dich an, du hältst mehr aus), **Kriegsschrei** (Gegner machen 8 s weniger Schaden, normale Gegner taumeln) und **Fußfeger** (wirft Gegner um, nicht Bosse). Sie kosten Ausdauer statt Mana. Dazu passive Knoten: stärkere leichte Angriffe, mehr Rüstung, stabileres Blocken, Ausdauer zurück nach Kombo-Abschluss oder perfekter Parade, mehr Schaden für Ser Maren.

Unten rechts im HUD stehen die vier Felder der aktiven Leiste, darüber „Leiste 1 von 2“. Ein Feld leuchtet in der Farbe seines Elements (Feuer orange, Eis hellblau, Blitz gelb, Aether violett), sobald du die Fähigkeit kannst; Feld 4 von Leiste 1 ist für den Aether-Stoß frei. Nach dem Einsatz läuft dort die Wartezeit in Sekunden ab; grau heißt: zu wenig Mana.

**Schwierigkeit:** Im Hauptmenü und im Pausemenü unter „Optionen“ wählst du mit ◄ ► **Geschichte**, **Normal**, **Schwer** oder **Albtraum** – jederzeit. Geschichte: Gegner machen halb so viel Schaden, haben weniger Leben, greifen seltener zu zweit an, das Parierfenster ist größer und Tränke heilen mehr. Albtraum: fast doppelter Schaden, mehr Leben, kürzere Vorwarnung. Erfahrung gibt es überall gleich viel. Gegner, die schon stehen, behalten ihr Leben, bis sie neu erscheinen; ein Boss ändert sich ab dem nächsten Versuch.

**Gegner:** Im Eichental gibt es jetzt fünf Gegnertypen. **Grauwölfe** jagen im Rudel; am Nordhang führt ein größerer **Rudelführer** (Elite) zwei Wölfe an. **Risslinge** (violette Kreaturen mit leuchtenden Kristallen) liegen am Dorfrand im Boden versteckt und springen hervor, wenn du auf etwa 8 m herankommst oder sie triffst; vorher kannst du sie nicht anvisieren. Am Riss wartet die **Rissbrut**, ein Champion-Rissling. Südlich der Mühle am Mühlbach lagert eine **Banditengruppe**: zwei Schläger mit Knüppeln, ein **Armbrustschütze**, der Abstand hält und Bolzen schießt (Deckung suchen oder schnell herangehen), und ein gepanzerter **Anführer** (Elite). Die **Skelett-Krieger** stehen in der Gruft. Jede Gruppe hat eine eigene Stufe; Elite-Gegner sind 2 Stufen höher, Champions 3.

**Uhrzeit und Tagesablauf:** Unter dem Kompass steht die Uhrzeit, z. B. „Erdtag · 10:05“. Ein Spieltag dauert 48 Minuten, das Spiel beginnt um 10 Uhr. Die Leute im Tal haben jetzt einen Tagesablauf: Hollmann ist von 7 bis 18 Uhr bei seinen Schafen und abends am Hof, Wirt Ulf öffnet um 10 Uhr, Hauptmann Dorn steht abends am Kopfgeldbrett vor dem Gasthaus, Müller Brenner geht mittags und abends ins Gasthaus. Nachts stehen sie vor ihrem Zuhause; ansprechen kannst du sie trotzdem. Gehst du an ihnen vorbei, sagen sie manchmal einen kurzen Satz (er steht über ihrem Kopf).

**Bosse:** Bei der **Rissbrut** und bei **Glutfang** erscheint oben ein Bossbalken mit Name und Titel. Die Rissbrut steckt in einer violett schimmernden Schale, die fast allen Schaden schluckt. Triff sie mit dem **Aether-Stoß (4)**: Die Schale zerbricht, die Rissbrut taumelt und nimmt 12 Sekunden lang vollen Schaden, dann wächst die Schale nach. Bei halbem Leben ruft sie zwei Risslinge aus dem Boden. **Glutfang** ist größer und stärker als die anderen Wölfe. Ein Pfeil in den Kopf lässt ihn kurz taumeln, und der leuchtende Kristall auf seinem Rücken ist sein Schwachpunkt. Bei halbem Leben heult er zwei Aether-Wölfe herbei. Ist der Boss besiegt, verschwinden seine Helfer.

**Grimmbart im Steinbruch:** Folge vom Dorf aus dem Weg nach Süden über die Holzbrücke am Mühlbach. Im Hügel liegt Grimmbarts Steinbruch, am Eingang wachen vier Banditen. Unten im Kessel wartet Grimmbart (Stufe 7). Geh besser erst ab Stufe 6–7 hin.
- **Phase 1:** Er schlägt mit dem Steinhammer; die ersten beiden Schläge kannst du parieren, dem dritten und dem Stampfer weichst du aus. Greift er zum **Kriegshorn**, kommen zwei Banditen. Ein Kopftreffer (z. B. ein Pfeil) unterbricht den Hornruf. Drei Pfeile auf das Horn am Gürtel schießen es ab.
- **Phase 2:** Er tritt die Ölfässer um und ruft „Lasst fallen!“: Wo ein dunkler Schatten wächst, fällt gleich ein Stein vom Kran. Bei seinem **Sturmangriff** stell dich hinter einen der großen Steinblöcke: Rennt er hinein, ist er 4 Sekunden betäubt.
- **Phase 3:** Er reißt die Rüstung ab, wird schneller, nimmt aber mehr Schaden, und wirft **Brandtöpfe**. Steht er in einer Öllache, zünde sie an (Feuerpfeil, Feuerball): Sie explodiert. Brennst du, lauf in die Wasserrinne am Rand.
- **Am Ende** kniet er nieder. Drück dann **E**, um ihn zu **fesseln**. Schlägst du weiter zu, stirbt er.

Die Kopfgeld-Quest von Hauptmann Dorn dazu fehlt noch. Den Kampf kannst du aber schon jetzt bestreiten. Visierst du einen Gegner an (**T**), steht über dem Lebensbalken sein Name und seine Stufe. Ist er 6 oder mehr Stufen über dir, steht dort „sehr gefährlich“.

## 3. Was dich erwartet

1. **Asche über Eichental** (startet sofort): Hedda am Brunnen, das brennende Dorf, Tobold und Wenna retten, Kreaturen aus dem Riss, der Spur folgen. Am Riss bekommst du die Aether-Kraft: Triff die Rissbrut mit dem Aether-Stoß (**4**). Zum Schluss Hedda in Lindenhain.
2. **Die Wölfe vom Nordhang**: Hollmann am Hof im Nordwesten. Er leiht dir seinen Jagdbogen und 30 Pfeile: Triff die drei Strohziele hinter der Scheune (**F**, zielen, schießen), dafür gibt es 10 Pfeile extra. Am Ende eine Entscheidung im Wolfsbau.
3. **Die vergessene Gruft**: Corvin im Gasthaus in Lindenhain. Tor-Rätsel mit Grabplatten (die Wandreliefs verraten die Reihenfolge), Hallen mit Skeletten, Spiegel-Rätsel, der Wachende Ritter. Am Ende: Siegelstein nehmen oder liegen lassen.

**Begleiterin Ser Maren Falkenried:** Wenn „Die Wölfe vom Nordhang“ erledigt ist, wartet am Wachposten von Lindenhain (neben Hauptmann Dorn) eine Ritterin der Silberwacht. Sie will dich als „Rissgeborenen“ prüfen. Ob du die Prüfung annimmst oder ablehnst, sie kommt in jedem Fall mit (nach der Ablehnung „auf Befehl“, dann mag sie dich weniger). Sie läuft hinter dir her, kämpft gegen alles, was dich oder sie angreift, und hält dir den Rücken frei. Fällt sie im Kampf, steht sie nach 12 Sekunden wieder auf. Sprich sie an, wenn sie stehen bleiben („Warte hier.“) oder wieder mitkommen soll („Komm mit.“). In die Gruft kommt sie mit.

**Mehr mit Maren:** Frag sie „Wie willst du kämpfen?“: **Aggressiv** (greift dein Ziel und alles in der Nähe an), **Defensiv** (Standard: schützt dich), **Unterstützend** (bleibt hinten und wehrt nur ab, was ihr zu nahe kommt) oder **Passiv** (kämpft nicht, Gegner lassen sie in Ruhe). „Wie stehen wir zueinander?“ verrät, was sie von dir hält. Deine Entscheidungen gefallen ihr oder nicht (oben steht dann „Maren gefällt das.“ oder „Maren missbilligt das.“). Sinkt ihre Loyalität stark, warnt sie dich einmal – danach geht sie zurück zum Wachposten. **Lagerfeuer:** Am Feuer bei den Zelten in Lindenhain kannst du **rasten** (**E**): abends und nachts bis 8 Uhr morgens, tagsüber drei Stunden. Ist Maren dabei, erzählt sie dir beim ersten Rasten von ihrem Bruder und nach der Gruft vom Wachenden Ritter.

Sprich auch mit den anderen Leuten (**E**): Wirt Ulf im Gasthaus kennt Gerüchte, Tobold und Wenna (wenn du sie gerettet hast), Pim auf dem Hof, Hannes und Liese an der Mühle.

**Händler in Lindenhain:** Bei **Tobold** (Schmied: Schwerter, Streitkolben, Jagdbogen, Pfeile, Schilde, Plattenrüstung) und bei **Ulf** (Heiltränke, Manatränke, Pfeile, Leder- und Stoffkleidung) wählst du im Gespräch „Zeig mir deine Waren.“ bzw. „Was verkaufst du?“. Im Handelsfenster wechselst du mit **Q/E** zwischen Kaufen, Verkaufen und Zurückkaufen; **Enter** handelt ein Stück, **F** alle bzw. den ganzen Stapel, **Esc** schließt. Händler haben nur begrenzt Gold und füllen ihre Waren alle drei Spieltage (etwa 2,4 Stunden Spielzeit) wieder auf. Verkauftes kannst du bis dahin zum selben Preis zurückkaufen.

**Würfeln mit Ulf („Krähenwurf“):** Frag Ulf „Würfeln wir eine Runde?“. Zuerst wählst du den Einsatz mit **◄ ►** (10 bis 500 Gold) und klickst „Spiel beginnen“. Dann klickst du auf „Würfeln“. Nach jedem Wurf klickst du die Würfel an, die Punkte bringen, und wählst:
- „Beiseitelegen und weiterwürfeln“: Die übrigen Würfel rollen noch einmal. Bringt der neue Wurf keinen Punkt, sind alle Punkte dieser Runde weg.
- „Beiseitelegen und sichern“: Die Punkte zählen fest, dann ist Ulf dran.

Punkte: eine 1 = 100, eine 5 = 50, drei gleiche = Augenzahl × 100 (drei Einsen 1000), die Straße 1-2-3-4-5 = 500. Wer zuerst 2000 Punkte hat, gewinnt. Gewinnst du, bekommst du den doppelten Einsatz. Mit **Esc** stehst du auf; mitten im Spiel ist der Einsatz dann verloren.

Oben rechts steht immer dein aktuelles Ziel. Die Gruft ist auf Stufe 4 eingestellt; nach den ersten beiden Quests bist du ungefähr Stufe 3–4. Wenn es zu schwer ist: erst ein paar Wölfe besiegen.

## 4. Bekannte Lücken

- Du selbst bist jetzt ein Krieger aus Blender (Arme, Beine und Schwert bewegen sich per Code, noch ohne fertige Animationen). Dorfbewohner, Wölfe, Risslinge, Banditen, Skelette, der Wachende Ritter sowie Fenster, Türen, Schornsteine und Brücken sind ebenfalls aus Blender.
- Keine Musik, keine Zwischensequenzen.
- Die Uhr läuft, aber der Himmel bleibt noch hell (Tag und Nacht kommen als Nächstes). Rasten geht am Lagerfeuer in Lindenhain.
- Glutfang schläft noch nicht tagsüber (kommt mit Tag und Nacht). Champions haben noch keine Zusatzeigenschaften wie „schnell“ oder „Feuer-Aura“. Die Kopfgeld-Quest zu Grimmbart fehlt noch (der Kampf geht schon).
- Der Skill-Baum zeigt die Knoten als Liste je Ast (noch kein grafischer Baum). Respec beim Lehrmeister gibt es noch nicht.
- Die Gruft ist dunkel. Das ist Absicht, kann aber nachgebessert werden.

## 5. Rückmeldung an Claude

Am meisten hilft:
- Wo du festhängst (welches Ziel steht oben rechts?).
- Was zu leicht oder zu schwer ist (besonders der Wachende Ritter).
- Rote Fehler in der **Console** (Screenshot).
- Wie lange du gebraucht hast.
