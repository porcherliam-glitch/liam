# Anleitung 17 – Kräuter sammeln testen

Stand: 2026-10-16. Neu sind **Kräuter-Sammelpunkte** im Eichental. Du kannst drei Kräuter sammeln: **Blutwurz**, **Rissmoos** und **Nachtschattenblüte**. Nach dem Sammeln wächst ein Kraut erst nach Spieltagen nach, und nie direkt vor deinen Augen. Claude hat alles automatisch geprüft (Rundgang „sammeln“, siehe Abschnitt 6).

**Dauer:** etwa 15 Minuten.

## 1. Starten

1. **Aetherfall.exe** im Ordner **Aetherfall Spiel** auf dem Desktop starten. Oder in Unity die Szene `Assets/_Project/Scenes/Boot/Boot.unity` öffnen und ▶ drücken.
2. Im Hauptmenü **Neues Spiel** wählen, dann eine Klasse. Die Zwischensequenz kannst du mit **Leertaste halten** überspringen.

## 2. Wo die Kräuter wachsen

| Kraut | Wie viele | Wo | Wann sammelbar | Wächst nach |
|---|---|---|---|---|
| **Blutwurz** | 6 | **Kräuterwiese** zwischen dem Lindenhain und dem Dorf (westlich vom Dorfplatz, auf der Karte eingetragen) | immer | nach **1 Spieltag** |
| **Nachtschattenblüte** | 2 | am Nordostrand der Kräuterwiese | nur **nachts von 22 bis 4 Uhr** | nach **3 Spieltagen** |
| **Rissmoos** | 4 | am Rand des **Risses** im Osten (nicht im Krater) | immer | nach **3 Spieltagen** |

So sehen sie aus:
- **Blutwurz:** eine kniehohe Rosette aus kräftig grünen Blättern mit drei roten Samenköpfen.
- **Rissmoos:** ein flaches, blaugrünes Moospolster (gut 1 m breit) mit leuchtenden Aether-Punkten.
- **Nachtschattenblüte:** dunkle Blätter und drei Stängel. **Am Tag** sitzen oben geschlossene, dunkelviolette Knospen. **Nachts** öffnen sie sich zu violett leuchtenden Blüten mit hellem Herz.

## 3. Sammeln

1. Zur Kräuterwiese gehen. Vor einer Blutwurz erscheint unten **„Sammeln: Blutwurz“**.
2. **E** drücken (Xbox-Pad: **A**).
3. Du bekommst **1 bis 3** Stück. Oben erscheint die Meldung „Blutwurz ×2“ (die Zahl ist zufällig). Die Pflanze verschwindet.
4. Im Inventar (**Tab**) liegen die Kräuter unter **Material**. Sie stapeln sich bis 99, wiegen 0,05 kg und lassen sich beim Händler verkaufen. Ihr Grundwert ist 2 Gold (Blutwurz), 6 Gold (Rissmoos) und 8 Gold (Nachtschattenblüte); der Händler zahlt davon nur einen Teil.
5. Im **Kampf** kannst du nicht sammeln.

**Nachtschattenblüte am Tag:** Du siehst die geschlossene Knospe, aber es erscheint **keine** Aufforderung. Warte bis 22 Uhr (eine Spielstunde dauert etwa 2 Minuten echte Zeit). Dann öffnet sich die Blüte und du kannst sie sammeln. Tagsüber kannst du am Lagerfeuer in Lindenhain rasten (je 3 Stunden), um schneller zum Abend zu kommen. **Achtung:** Rasten ab 18 Uhr springt bis 8 Uhr morgens und überspringt die Blütezeit.

## 4. Nachwachsen

- Gesammelte Kräuter wachsen nach der Zeit aus der Tabelle oben nach, gezählt in **Spielzeit** (ein Spieltag dauert etwa 48 Minuten echte Zeit, oder du rastest).
- Ein Kraut wächst **nie, während du daneben stehst**. Du musst mindestens **50 m** weg sein. Komm danach zurück, dann ist es wieder da.
- Rasten und Schnellreise lassen die Zeit schneller laufen. Auch dann gilt die 50-m-Regel. Die Lagerfeuer sind weit genug von der Wiese entfernt.
- Beim **Laden** eines Spielstands und wenn du aus der Gruft zurückkommst, wachsen fällige Kräuter sofort nach, egal wo du stehst.

## 5. Speichern und Laden

1. Ein paar Kräuter sammeln.
2. Speichern (Pause-Menü → Speichern, oder Schnellspeichern).
3. Weitergehen, dann den Spielstand laden.
4. Die gesammelten Pflanzen sind weiterhin weg, und du hast genauso viele Kräuter im Inventar wie beim Speichern.

Alte Spielstände laden ohne Probleme. Dort sind einfach alle Kräuter reif.

Bitte achte auf:
- Schwebt eine Pflanze in der Luft oder steckt sie im Boden?
- Steht eine Pflanze in einem Bach, Weg oder Haus?
- Siehst du ein Kraut direkt vor dir nachwachsen? (Sollte nie passieren.)
- Erscheint die Aufforderung, obwohl die Pflanze schon gesammelt ist?

## 6. Automatischer Rundgang

```bash
"/c/Program Files/Unity/Hub/Editor/6000.6.5f1/Editor/Unity.exe" -batchmode -projectPath "C:/Users/limap/Desktop/Aetherfall" -executeMethod Aetherfall.EditorTools.World.PlayTour.RunBatch -tourScene Assets/_Project/Scenes/Boot/Boot.unity -tourMode sammeln -logFile Logs/tour_sammeln.log
```

Ergebnis: `Logs/Tour/Boot_Sammeln/bericht.txt` und die Bilder `sa_01_kraeuterwiese.png` bis `sa_08_ende.png` (Wiese von oben, Blutwurz, Meldung „Blutwurz ×…“, Knospe am Tag, Rissmoos, offene Blüte bei Nacht, nachgewachsene Blutwurz, Ende). Der Rundgang:
1. zählt die Sammelpunkte (6 Blutwurz, 4 Rissmoos, 2 Nachtschattenblüte) und ihre Kompass-Marker,
2. sammelt alle Blutwurz (Ertrag je 1–3, Pflanze weg, Marker weg),
3. prüft, dass die Nachtschattenblüte am Tag als Knospe ohne Aufforderung steht,
4. sammelt das Rissmoos am Riss,
5. sammelt nachts um 22:30 eine Nachtschattenblüte,
6. speichert, lässt die Zeit laufen, lädt und prüft, dass alles wie gespeichert ist,
7. prüft die 50-m-Regel (direkt daneben wächst nichts, aus 80 m schon),
8. prüft, dass Rissmoos und Nachtschattenblüte nach anderthalb Spieltagen noch fehlen und erst nach drei Spieltagen nachwachsen.

## 7. Bekannte Grenzen (Stufe A)

- Die Pflanzen sind einfache Platzhalter-Formen. Das Glitzern ab 10 m Nähe (GDD 05) kommt später.
- Es gibt noch **keinen Beruf Kräuterkunde**: keine Stufen, keine Erfahrung, keine Samen, keine Sichel. Der Ertrag ist immer 1–3.
- Die Quest „Das Kraut der Kräuterfrau“ mit Alwine, ihrer Hütte und dem Rezept kommt mit Teil 1b der Aufgabenliste. Die Kräuter dafür kannst du aber jetzt schon sammeln.
- Die Namen und Preise sind Entwürfe.
