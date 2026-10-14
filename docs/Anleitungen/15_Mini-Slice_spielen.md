# Anleitung 15 – Den Mini-Slice spielen

Stand: 2026-10-14. Der Mini-Slice ist jetzt von Anfang bis Ende spielbar: Dorf Eichental, drei Quests, die Gruft mit Rätseln und Boss. Claude hat alles automatisch durchspielen lassen (0 Fehler, siehe [Anleitung 14](./14_Test_MiniSlice_Quests.md)). Jetzt bist du dran.

**Dauer:** etwa 45–60 Minuten.

## 1. Starten

**Am einfachsten, ohne Unity:** Auf dem Desktop den Ordner **Aetherfall Spiel** öffnen und **Aetherfall.exe** doppelklicken. Im Hauptmenü **Neues Spiel**. Im Ordner liegt auch „So spielst du.txt“ mit allen Tasten. Claude baut diese Version neu, wenn sich etwas ändert.

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
| Heiltrank (3 Stück zu Beginn) | **5** |
| Inventar und Charakter | **Tab** |
| Questlog | **J** |
| Schnell speichern / laden | **F5** / **F9** |
| Pause, Menü, Spiel speichern | **Esc** |
| Im Gespräch: Antwort wählen | **1–9** oder Maus, weiter mit **E** oder **Leertaste** |

Mit Gamepad geht es auch (Xbox-Belegung: A springen und benutzen, X/Y angreifen, B ausweichen, LB blocken).

## 3. Was dich erwartet

1. **Asche über Eichental** (startet sofort): Hedda am Brunnen, das brennende Dorf, Tobold und Wenna retten, Kreaturen aus dem Riss, der Spur folgen, die Rissbrut, zum Schluss Hedda in Lindenhain.
2. **Die Wölfe vom Nordhang**: Hollmann am Hof im Nordwesten. Am Ende eine Entscheidung im Wolfsbau.
3. **Die vergessene Gruft**: Corvin im Gasthaus in Lindenhain. Tor-Rätsel mit Grabplatten (die Wandreliefs verraten die Reihenfolge), Hallen mit Skeletten, Spiegel-Rätsel, der Wachende Ritter. Am Ende: Siegelstein nehmen oder liegen lassen.

Sprich auch mit den anderen Leuten (**E**): Wirt Ulf im Gasthaus kennt Gerüchte, Tobold und Wenna (wenn du sie gerettet hast), Pim auf dem Hof, Hannes und Liese an der Mühle.

**Händler in Lindenhain:** Bei **Tobold** (Schmied: Schwerter, Streitkolben, Schilde, Plattenrüstung) und bei **Ulf** (Heiltränke, Leder- und Stoffkleidung) wählst du im Gespräch „Zeig mir deine Waren.“ bzw. „Was verkaufst du?“. Im Handelsfenster wechselst du mit **Q/E** zwischen Kaufen, Verkaufen und Zurückkaufen; **Enter** handelt ein Stück, **F** alle bzw. den ganzen Stapel, **Esc** schließt. Händler haben nur begrenzt Gold und füllen ihre Waren alle drei Spieltage (etwa 2,4 Stunden Spielzeit) wieder auf. Verkauftes kannst du bis dahin zum selben Preis zurückkaufen.

Oben rechts steht immer dein aktuelles Ziel. Die Gruft ist auf Stufe 4 eingestellt; nach den ersten beiden Quests bist du ungefähr Stufe 3–4. Wenn es zu schwer ist: erst ein paar Wölfe besiegen.

## 4. Bekannte Lücken

- Du selbst bist jetzt ein Krieger aus Blender (Arme, Beine und Schwert bewegen sich per Code, noch ohne fertige Animationen). Dorfbewohner, Wölfe, Skelette, der Wachende Ritter sowie Fenster, Türen, Schornsteine und Brücken sind ebenfalls aus Blender.
- Keine Musik, keine Zwischensequenzen, kein Bogen, keine Aether-Fähigkeit.
- Die Gruft ist dunkel. Das ist Absicht, kann aber nachgebessert werden.

## 5. Rückmeldung an Claude

Am meisten hilft:
- Wo du festhängst (welches Ziel steht oben rechts?).
- Was zu leicht oder zu schwer ist (besonders der Wachende Ritter).
- Rote Fehler in der **Console** (Screenshot).
- Wie lange du gebraucht hast.
