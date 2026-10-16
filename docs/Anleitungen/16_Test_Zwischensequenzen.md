# Anleitung 16 – Zwischensequenzen und Dialogkamera testen

Stand: 2026-10-16. Neu sind die **Prolog-Zwischensequenz** „Erwachen“ (cs.prolog.erwachen) und die **Dialogkamera**. Die Zwischensequenz läuft einmal am Anfang eines neuen Spiels, du kannst sie überspringen. Die Dialogkamera zeigt Gespräche wie im Film (Abschnitt 5). Claude hat beides automatisch geprüft (Rundgang „zwischensequenz“, siehe Abschnitt 6).

**Dauer:** etwa 15 Minuten.

## 1. Starten

1. **Aetherfall.exe** im Ordner **Aetherfall Spiel** auf dem Desktop starten. Oder in Unity die Szene `Assets/_Project/Scenes/Boot/Boot.unity` öffnen und ▶ drücken.
2. Im Hauptmenü **Neues Spiel** wählen, dann eine Klasse.
3. Nach dem Laden beginnt sofort die Zwischensequenz. Du siehst kein Bild vom Spiel davor.

## 2. Was du sehen solltest (26,5 Sekunden)

| Zeit | Einstellung | Was zu sehen ist |
|---|---|---|
| 0–3,5 s | Titelkarte | Schwarz, in der Mitte „Eichental, am Tag des Erntefests.“ Oben und unten schieben sich schwarze Kinobalken ins Bild. |
| 3,5–9,5 s | Riss über dem Dorf | Das Bild blendet auf. Die Kamera senkt sich über das brennende Dorf zum leuchtenden Riss. Untertitel: „Mitten im Fest reißt der Himmel über dem Dorf auf.“ |
| 9,5–15 s | Lina im Licht | Nah bei Lina vor dem Riss, ein kaltes Licht fällt von oben auf sie. Untertitel **Lina**: „Das Licht zieht mich fort! Halt mich fest!“ Am Ende ein weißer Blitz. |
| 15–18,5 s | Schwarz | Schwarzes Bild mit „Dann nur noch Feuer und Rauch.“ |
| 18,5–26,5 s | Erwachen | Tief und schräg hinter deiner Figur im brennenden Dorf. Untertitel **Eine Stimme**: „Hilfe! Hört mich denn niemand?“ Dann fährt die Kamera hoch hinter die Figur. |

Danach gehen die Balken weg, das HUD erscheint, und du spielst. Die Kamera springt beim Übergang **nicht**. Das Questlog zeigt „Asche über Eichental“ mit dem Ziel „Zum Dorfplatz gehen“.

Bitte achte auf:
- Steht eine Kamera in einer Wand, einem Haus oder im Boden?
- Sind Texte abgeschnitten oder schwer lesbar?
- Sind während der Zwischensequenz NPC-Namensschilder zu sehen? (Sollten sie nicht.)
- Ist der Mauszeiger zu sehen? (Sollte er nicht.)

## 3. Überspringen

- **Leertaste** (Tastatur) oder **A** (Xbox-Pad) **gedrückt halten**. Unten rechts steht „Überspringen (halten)“ mit einem Balken. Der Balken füllt sich in 1 Sekunde (genauso lange wie „Halten zum Bestätigen“ in den Menüs). Eine Option für die Haltedauer (0,5–1,5 s) kommt erst mit dem Optionen-Schritt.
- Wenn der Balken voll ist: Das Bild wird schwarz und blendet zurück ins Spiel. Alles ist so wie nach dem normalen Ende.
- **Früher loslassen** bricht ab. Der Balken springt auf 0 zurück.
- **Esc, B, Start und Enter tun nichts.** Eine Pause gibt es in der Zwischensequenz noch nicht.
- Eine Taste, die du schon vorher gehalten hast (zum Beispiel A von „Neues Spiel“), zählt nicht. Du musst neu drücken.

## 4. Wann sie nicht läuft

- Beim **Laden** eines Spielstands läuft sie nicht noch einmal.
- Wenn du in Unity direkt die Szene `Eichental.unity` startest (ohne Hauptmenü), läuft sie auch nicht.
- Speichern geht während der Zwischensequenz nicht. Das automatische Speichern wartet bis danach.

## 5. Dialogkamera (Schuss und Gegenschuss)

In **vollen Gesprächen** (mit Antwortauswahl) zeigt die Kamera jetzt wie im Film abwechselnd die Gesprächspartner. Kurze Gespräche im Vorbeigehen behalten die normale Spielkamera.

So testest du es:
1. Nach dem Prolog zu **Hollmann** auf seinem Hof gehen (im Nordwesten, Kompass hilft) und mit **E** ansprechen. Oder mit **Hedda** am Dorfplatz sprechen, sobald sie dort steht.
2. Achte auf diese Reihenfolge:
   - **Eröffnung:** Die Kamera gleitet in 0,4 s weich von hinten seitlich auf euch beide (Halbtotale).
   - Nach etwa 1,5 s **Schnitt**: über deine Schulter auf Hollmann (**Schuss**).
   - Bei der **Antwortauswahl** Schnitt auf dich über seine Schulter (**Gegenschuss**).
   - Nach deiner Antwort wieder auf ihn.
   - Nach 3 Zeilen am Stück auf derselben Einstellung kommt einmal die Halbtotale.
   - Hedda beginnt mit einer **Nahaufnahme** (sie ist traurig).
3. Am Ende gleitet die Kamera in 0,4 s zurück hinter deine Figur.

Bitte achte auf:
- Springt die Kamera einmal auf die andere Seite (sie soll immer auf derselben Seite bleiben)?
- Steht eine Kamera in einer Wand oder einem Baum? (Sie soll dann eine andere Einstellung nehmen.)
- Wird zu oft geschnitten (öfter als alle 1,5 s)?

Mit der Pause (Esc) im Gespräch bleibt die Kamera stehen. Spricht ein Partner, der keine Figur in der Welt hat (die graue Gestalt), bleibt die Spielkamera.

## 6. Automatischer Rundgang

```bash
"/c/Program Files/Unity/Hub/Editor/6000.6.5f1/Editor/Unity.exe" -batchmode -projectPath "C:/Users/limap/Desktop/Aetherfall" -executeMethod Aetherfall.EditorTools.World.PlayTour.RunBatch -tourScene Assets/_Project/Scenes/Boot/Boot.unity -tourMode zwischensequenz -logFile Logs/tour_zwischensequenz.log
```

Ergebnis: `Logs/Tour/Boot_Zwischensequenz/bericht.txt` und die Bilder `z01_titelkarte.png` bis `z10_spiel.png`, dazu die Dialogkamera `z11_dialog_eroeffnung.png` bis `z16_dialog_nah.png`. Der Rundgang prüft unter anderem: Start im selben Bild wie das Spiel, HUD aus, Speichern gesperrt, Schilder aus, saubere Übergabe an die Spielkamera, Überspringen, bei der Dialogkamera die Einstellungen, eine Seite (180°-Regel), Sichtfeld 32–40° und mindestens 1,5 s zwischen zwei Schnitten. Alle anderen Rundgänge überspringen die Zwischensequenz gleich am Anfang.

## 7. Bekannte Grenzen (Stufe A)

- Die Figuren sind Platzhalter und bewegen sich nicht. Lina „schwebt“ nicht ins Licht, die Kamera, das Licht und die Texte erzählen die Szene.
- Es gibt noch **keine Musik** (kommt mit der Aufgabe Musik und Ambience).
- Die Zwischensequenzen bei s40 (die graue Gestalt) und s50 (Aether-Berührung) fehlen noch. Bei s50 läuft weiter das kurze Gespräch „Du bist es also.“.
- Die Texte sind Entwürfe.
- Die Untertitel der Zwischensequenz folgen noch nicht den Untertitel-Optionen (Größe, Hintergrund).
- Dialogkamera: Begleiter-Einwürfe, eigene Einstellungen für Gruppen und Tiefenunschärfe kommen später. Deine Figur dreht sich noch nicht zum Gesprächspartner.

## 8. Was du Claude melden kannst

Schreib einfach, was dir auffällt, zum Beispiel: „Bei Lina steht die Kamera im Felsen“ oder „Leertaste halten hat nicht übersprungen“. Ein Screenshot hilft.
