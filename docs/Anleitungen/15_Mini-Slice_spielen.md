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
| Aether-Stoß (ab dem Riss im Prolog): stößt alle Gegner vor dir 3 m zurück, 15 Mana, danach 8 s warten | **4** |
| Heiltrank trinken: +35 % Leben, dauert knapp eine Sekunde, ein harter Treffer bricht ab (3 Stück zu Beginn) | **5** |
| Manatrank trinken (Magier, 3 Stück zu Beginn): +40 % Mana | **6** |
| Inventar und Charakter | **Tab** |
| Questlog | **J** |
| Schnell speichern / laden | **F5** / **F9** |
| Pause, Menü, Spiel speichern | **Esc** |
| Im Gespräch: Antwort wählen | **1–9** oder Maus, weiter mit **E** oder **Leertaste** |

Mit Gamepad geht es auch (Xbox-Belegung: A springen und benutzen, X/Y angreifen, B ausweichen, LB blocken, RB + A Aether-Stoß).

Unten rechts im HUD leuchtet Feld 4 blau, sobald du den Aether-Stoß kannst. Nach dem Einsatz läuft dort die Wartezeit in Sekunden ab; grau heißt: zu wenig Mana.

## 3. Was dich erwartet

1. **Asche über Eichental** (startet sofort): Hedda am Brunnen, das brennende Dorf, Tobold und Wenna retten, Kreaturen aus dem Riss, der Spur folgen. Am Riss bekommst du die Aether-Kraft: Triff die Rissbrut mit dem Aether-Stoß (**4**). Zum Schluss Hedda in Lindenhain.
2. **Die Wölfe vom Nordhang**: Hollmann am Hof im Nordwesten. Am Ende eine Entscheidung im Wolfsbau.
3. **Die vergessene Gruft**: Corvin im Gasthaus in Lindenhain. Tor-Rätsel mit Grabplatten (die Wandreliefs verraten die Reihenfolge), Hallen mit Skeletten, Spiegel-Rätsel, der Wachende Ritter. Am Ende: Siegelstein nehmen oder liegen lassen.

**Begleiterin Ser Maren Falkenried:** Wenn „Die Wölfe vom Nordhang“ erledigt ist, wartet am Wachposten von Lindenhain (neben Hauptmann Dorn) eine Ritterin der Silberwacht. Sie will dich als „Rissgeborenen“ prüfen. Ob du die Prüfung annimmst oder ablehnst, sie kommt in jedem Fall mit (nach der Ablehnung „auf Befehl“, dann mag sie dich weniger). Sie läuft hinter dir her, kämpft gegen alles, was dich oder sie angreift, und hält dir den Rücken frei. Fällt sie im Kampf, steht sie nach 12 Sekunden wieder auf. Sprich sie an, wenn sie stehen bleiben („Warte hier.“) oder wieder mitkommen soll („Komm mit.“). In die Gruft kommt sie mit.

Sprich auch mit den anderen Leuten (**E**): Wirt Ulf im Gasthaus kennt Gerüchte, Tobold und Wenna (wenn du sie gerettet hast), Pim auf dem Hof, Hannes und Liese an der Mühle.

**Händler in Lindenhain:** Bei **Tobold** (Schmied: Schwerter, Streitkolben, Schilde, Plattenrüstung) und bei **Ulf** (Heiltränke, Leder- und Stoffkleidung) wählst du im Gespräch „Zeig mir deine Waren.“ bzw. „Was verkaufst du?“. Im Handelsfenster wechselst du mit **Q/E** zwischen Kaufen, Verkaufen und Zurückkaufen; **Enter** handelt ein Stück, **F** alle bzw. den ganzen Stapel, **Esc** schließt. Händler haben nur begrenzt Gold und füllen ihre Waren alle drei Spieltage (etwa 2,4 Stunden Spielzeit) wieder auf. Verkauftes kannst du bis dahin zum selben Preis zurückkaufen.

**Würfeln mit Ulf („Krähenwurf“):** Frag Ulf „Würfeln wir eine Runde?“. Zuerst wählst du den Einsatz mit **◄ ►** (10 bis 500 Gold) und klickst „Spiel beginnen“. Dann klickst du auf „Würfeln“. Nach jedem Wurf klickst du die Würfel an, die Punkte bringen, und wählst:
- „Beiseitelegen und weiterwürfeln“: Die übrigen Würfel rollen noch einmal. Bringt der neue Wurf keinen Punkt, sind alle Punkte dieser Runde weg.
- „Beiseitelegen und sichern“: Die Punkte zählen fest, dann ist Ulf dran.

Punkte: eine 1 = 100, eine 5 = 50, drei gleiche = Augenzahl × 100 (drei Einsen 1000), die Straße 1-2-3-4-5 = 500. Wer zuerst 2000 Punkte hat, gewinnt. Gewinnst du, bekommst du den doppelten Einsatz. Mit **Esc** stehst du auf; mitten im Spiel ist der Einsatz dann verloren.

Oben rechts steht immer dein aktuelles Ziel. Die Gruft ist auf Stufe 4 eingestellt; nach den ersten beiden Quests bist du ungefähr Stufe 3–4. Wenn es zu schwer ist: erst ein paar Wölfe besiegen.

## 4. Bekannte Lücken

- Du selbst bist jetzt ein Krieger aus Blender (Arme, Beine und Schwert bewegen sich per Code, noch ohne fertige Animationen). Dorfbewohner, Wölfe, Skelette, der Wachende Ritter sowie Fenster, Türen, Schornsteine und Brücken sind ebenfalls aus Blender.
- Keine Musik, keine Zwischensequenzen, kein Bogen. Der Aether-Stoß erhöht noch keine Verderbnis (die gibt es noch nicht).
- Die Gruft ist dunkel. Das ist Absicht, kann aber nachgebessert werden.

## 5. Rückmeldung an Claude

Am meisten hilft:
- Wo du festhängst (welches Ziel steht oben rechts?).
- Was zu leicht oder zu schwer ist (besonders der Wachende Ritter).
- Rote Fehler in der **Console** (Screenshot).
- Wie lange du gebraucht hast.
