# Anleitung 14 – Die drei Quests des Mini-Slice

Stand: 2026-10-14. Die Quests „Asche über Eichental“, „Die Wölfe vom Nordhang“ und „Die vergessene Gruft“ sind jetzt als Daten im Spiel (GDD 02, Abschnitte 11.1, 11.2 und 11.7). Diese Anleitung sagt dir, wie du sie ausprobierst und was noch fehlt.

## 1. Vorbereitung

1. Unity öffnen (siehe [Anleitung 13](./13_Erster_Start_in_Unity.md)).
2. Nur wenn Claude es sagt: Menü **Aetherfall > Eichental erstellen**. Das schreibt die Quests, Gespräche und Figuren neu.
3. `Assets/_Project/Scenes/Boot/Boot.unity` öffnen, ▶ drücken, **Neues Spiel**.

Du startest auf Stufe 1 mit der Ausrüstung des Kriegers (Schwert, Holzschild, Gambeson, Lederstiefel, 3 Heiltränke). Die Gegner im Dorf sind entsprechend schwächer als im Testgelände.

## 2. Quest 1 – Asche über Eichental (ca. 15–25 Minuten)

Startet automatisch. Oben rechts im HUD steht immer das aktuelle Ziel.

| Schritt | Was du tust |
|---|---|
| 1 | Zum Dorfplatz gehen (Brunnen, westlich vom Start). |
| 2 | Mit **Hedda** sprechen (orange Figur am Brunnen, **E**). |
| 3 | Zum Dorfrand im Südwesten gehen. Unterwegs, wenn du willst: **Tobold befreien** (Balken bei der Schmiede, **E**) und innerhalb von 2 Minuten zur **Tür der Bäckerei** laufen (rettet Wenna). |
| 4 | Die Kreaturen aus dem Riss besiegen (vorerst leuchtende Wölfe als Platzhalter). |
| 5 | Der Spur der grauen Gestalt nach Osten folgen (leuchtende Markierungen). Optional: zwei verbrannte Runen untersuchen. |
| 6 | Zum Riss am Waldrand gehen und die Rissbrut besiegen. |
| 7 | Nach Lindenhain (Westen, hinter der Mühle) gehen und mit Hedda sprechen. |

Danach geht der Brand im Dorf aus. Wer gerettet wurde, steht jetzt in Lindenhain.

## 3. Quest 2 – Die Wölfe vom Nordhang

Nach Quest 1 mit **Hollmann** am Hof im Nordwesten sprechen und annehmen. Dann: Weide untersuchen (3 Hinweise), der Wolfsspur folgen, zum Wolfsbau gehen. Im Bau entscheidest du: **Glutfang töten**, den **Splitter zerschlagen** oder ihn **herausbrechen**. Zum Schluss wieder mit Hollmann sprechen.

## 4. Quest 7 – Die vergessene Gruft

Nach Quest 1 mit **Corvin** im Gasthaus in Lindenhain sprechen. Oder einfach zum Gruft-Eingang unter dem Rabenfels gehen, dann beginnt sie von selbst. In der Gruft: Grabplatten-Rätsel, Hallen, Spiegel-Rätsel, der Wachende Ritter. Am Ende entscheidest du, ob du den **Siegelstein** nimmst (dann zu Corvin bringen) oder liegen lässt (dann mit Corvin sprechen).

## 5. Automatischer Durchlauf (macht Claude)

Claude lässt alle drei Quests von einem Werkzeug durchspielen (`PlayTour`, Modus `quests`). Die Spielfigur geht dabei wie ein Spieler zu jedem Ort, jeder Figur und jedem Objekt und drückt dort **Interagieren**: Hedda, Tobold und Wenna retten, Kreaturen besiegen, Spur folgen, Hollmann, Wolfsbau (Splitter herausbrechen), Corvin, durch das Portal in die Gruft, Wandreliefs, Grabplatten in der richtigen Reihenfolge, Spiegel drehen, Wachender Ritter, Siegelstein nehmen, zurück zu Corvin. Nach jedem Schritt prüft das Werkzeug die Quest-Stufe. Die Spielfigur ist dabei unverwundbar, Kämpfe werden abgekürzt.

Ergebnis steht in `Logs/Tour/Boot_Quests/` (Bericht `bericht.txt` und 11 Bilder). Du musst dafür nichts tun.

## 6. Was du prüfen sollst

- Steht oben rechts immer ein sinnvolles Ziel?
- Erscheinen Hedda, Tobold und Wenna an den richtigen Orten?
- Wird jede Quest abgeschlossen (Meldung „Quest abgeschlossen“, Eintrag im Questlog)?
- Speichern (F5) und Laden (F9) mitten in einer Quest: Geht es danach richtig weiter?

## 7. Was noch fehlt (bewusst, kommt später)

| Was | Warum |
|---|---|
| Zwischensequenzen, Musik | Gibt es noch nicht. |
| Aether-Stoß (Fähigkeit) | Gibt es noch nicht. Der Splitter wird deshalb „zerschlagen“. |
| Bogen und Strohziele | Es gibt noch keinen Bogen. Die Strohziele werden nur geprüft (**E**). |
| Risslinge, Rissbrut, Glutfang | Noch Wölfe als Platzhalter. |
| Fraktionsruf (Konvent, Silberwacht) | Gibt es noch nicht. |
| Figuren | Noch orange Kapseln. Echte Figuren mit mehr Gesprächen kommen im nächsten Schritt. |
