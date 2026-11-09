# Gold1315 – MT5-Trading-Bot für Gold (XAUUSD)

Ein Expert Advisor (EA) für MetaTrader 5. Er entscheidet **nur einmal am Tag, um 13:15 Uhr deutscher Zeit**, ob er Gold kauft, verkauft oder nichts tut. Spätestens um **22:45 Uhr** schließt er den Trade.

> **Wichtig:** Das ist kein Geldautomat. Der Test über 17 Jahre zeigt einen **kleinen** Vorteil, und es gab auch Verlustjahre (zuletzt 2025). Zuerst im Strategietester und dann mindestens 1–3 Monate auf einem **Demokonto** laufen lassen. Nur Geld einsetzen, dessen Verlust du verkraften kannst. Das hier ist keine Anlageberatung.

---

## 1. Was der Bot macht

Um 13:15 Uhr schaut er auf zwei Dinge:

1. **Wie weit ist Gold seit 00:00 Uhr gelaufen?** Gemessen wird in „ATR“, der durchschnittlichen Tagesschwankung der letzten 14 Tage.
2. **Ist der Markt gerade ruhig?** Die Schwankung der letzten 14 Tage (ATR14) darf nicht größer sein als die der letzten 100 Tage (ATR100).

| Bedingung um 13:15 | Aktion |
|---|---|
| Gold ist seit 00:00 um mehr als 0,4 ATR **gestiegen** und der Markt ist ruhig | **Kaufen** |
| Gold ist seit 00:00 um mehr als 0,4 ATR **gefallen** und der Markt ist ruhig | **Verkaufen** |
| sonst | nichts tun |

- **Stop-Loss:** 0,75 ATR vom Einstieg (aktuell etwa 40–70 USD pro Unze)
- **Take-Profit:** keiner. Der Gewinn läuft bis 22:45 Uhr.
- **Ausstieg:** 22:45 Uhr deutsche Zeit, also vor der täglichen Handelspause um 23:00 Uhr.
- **Häufigkeit:** etwa 35–40 Trades pro Jahr, also nur an etwa jedem siebten Handelstag

**Warum das funktionieren kann:** Wenn Gold in einer ruhigen Marktphase schon bis zum Mittag klar in eine Richtung läuft, geht die Bewegung am Nachmittag etwas häufiger weiter als zurück. Am Nachmittag kommen die US-Wirtschaftsdaten (14:30 Uhr) und die US-Börseneröffnung (15:30 Uhr). In unruhigen Phasen ist die Morgenbewegung dagegen oft nur Rauschen. Dort handelt der Bot nicht.

## 2. Ehrliche Testergebnisse

Getestet mit echten Gold-Minutenkursen von **März 2009 bis Januar 2026**, mit Kosten (Spread und Ausführung) von etwa 0,40–0,60 USD pro Trade.

Die Regeln wurden **nur mit 2009–2019 ausgesucht**. 2020–2026 hat die Auswahl nie gesehen. Das ist der eigentliche Test.

| Zeitraum | Trades | Gewinn-Trades | Ø pro Trade | Profit-Faktor | größter Rückgang |
|---|---|---|---|---|---|
| 2009–2019 (Auswahl) | 402 | 49 % | +0,03 R | 1,10 | 13,6 R |
| **2020–2026 (unabhängiger Test)** | **216** | **54 %** | **+0,07 R** | **1,28** | **9,4 R** |

*R = der Betrag, den ein Trade bis zum Stop-Loss riskiert. Bei 1 % Risiko pro Trade ist 1 R = 1 % des Kontos.*

**Pro Jahr (Summe in R, ohne die Umstellungswochen, siehe Abschnitt 8):**

| 2009 | 2010 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| −1,9 | +4,6 | +1,8 | +2,4 | +5,7 | −1,9 | +1,2 | +0,6 | −0,5 | −4,2 | +4,3 | +8,9 | +8,5 | −1,3 | +1,9 | +3,8 | **−5,6** |

11 von 17 Jahren im Plus.

**Mit 1 % Risiko pro Trade** (Gewinne werden mitverzinst): Das Konto wäre in knapp 17 Jahren um etwa **+29 %** gewachsen, also rund **1,6 % pro Jahr**. Der größte Rückgang vom Höchststand betrug **13 %**. Die längste Verlustserie waren 7 Trades hintereinander.

**Was das bedeutet:**
- Der Vorteil ist echt messbar, aber **klein**. Er hält in beiden Zeiträumen und auch bei leicht verschobener Uhrzeit: 13:00, 13:30, 12:15 und 14:15 sind ebenfalls positiv.
- Er hängt stark an den **Kosten**. Bei doppelten Kosten bleibt fast nichts übrig, bei dreifachen ist die Regel im Minus. Ein Konto mit **niedrigem Spread auf Gold** ist deshalb Pflicht. Der Bot lässt Trades aus, wenn der Spread über 0,80 USD liegt.
- Vergangene Ergebnisse garantieren nichts für die Zukunft.

## 3. Installation (Windows, MetaTrader 5)

1. **MetaTrader 5** vom Broker installieren und ein **Demokonto** eröffnen (kostenlos). Am besten mit 10.000 USD Startkapital, siehe Abschnitt 6.
2. In MT5: **Datei → Dateiordner öffnen**. Dort in den Ordner `MQL5\Experts` gehen.
3. Den Ordner **`Gold1315`** aus diesem Repo (`TradingBot/MQL5/Experts/Gold1315`) dorthin kopieren.
4. Mit **F4** den **MetaEditor** öffnen, links unter *Experts → Gold1315* die Datei `Gold1315.mq5` doppelklicken und mit **F7** kompilieren.
   - Unten muss stehen: **„0 errors“**. Warnungen sind nicht schlimm.
   - Falls doch Fehler kommen: die komplette Fehlermeldung an Claude geben, dann wird sie behoben.
5. Zurück in MT5: Im **Navigator** (Strg+N) unter *Expert Advisors* rechtsklicken → **Aktualisieren**. Jetzt erscheint **Gold1315**.

## 4. Zuerst im Strategietester prüfen

1. **Strg+R** öffnet den Strategietester.
2. Einstellungen:
   - Expert: **Gold1315**
   - Symbol: **XAUUSD** (heißt bei manchen Brokern `GOLD` oder `XAUUSD.r`)
   - Zeitrahmen: egal, zum Beispiel M15
   - Zeitraum: **2020.01.01 bis heute**
   - Modellierung: **„Jeder Tick basierend auf echten Ticks“**
   - Einzahlung: 10.000 USD
3. Unter **Eingaben** die Broker-Zeitzone prüfen (Abschnitt 5) und dann **Start** klicken.
4. Im Reiter **Journal** steht jeden Tag eine Zeile wie
   `13:15 Uhr: Bewegung seit 00:00 = +0.52 ATR (Grenze 0.40), ATR14/ATR100 = 0.87 (Grenze 1.00) -> KAUFEN`.
   Im Reiter **Backtest** stehen Gewinn, Profit-Faktor und Rückgang.

**Erwartung:** etwa 35–40 Trades pro Jahr und ein Profit-Faktor um 1,1–1,3. Weicht es stark ab, ist meist die **Zeitzone** falsch eingestellt (Abschnitt 5) oder der Broker hat höhere Kosten.

## 5. Zeitzone des Brokers (wichtig für den Tester)

Der Bot rechnet die Serverzeit des Brokers in deutsche Zeit um. **Live** misst er die Zeitzone automatisch. **Im Strategietester** geht das nicht, dort gelten die Eingaben.

So findest du die richtige Einstellung: In MT5 die **Marktübersicht** öffnen (Strg+M). Die Uhrzeit oben ist die Serverzeit. Vergleiche sie mit der deutschen Uhrzeit:

| Serverzeit im Vergleich zur deutschen Zeit | „Server-Zeit = GMT + x im Winter“ | „Sommerzeit-Regel“ |
|---|---|---|
| immer **1 Stunde später** (die meisten Broker) | **2** (Standard) | **USA** (Standard) |
| genau **gleich** | 1 | Europa |
| immer **1 Stunde früher** | 0 | Europa |
| im Winter 1 Stunde früher, im Sommer 2 Stunden früher | 0 | keine Sommerzeit |

Die Zeitlogik ist mit der offiziellen Zeitzonen-Datenbank geprüft: für jede Stunde von 2009 bis 2030 und alle Zeilen der Tabelle. Das schließt die Wochen im März und im Oktober/November ein, in denen die USA und Europa die Uhr nicht gleichzeitig umstellen.

## 6. Auf dem Demokonto laufen lassen

1. Ein **XAUUSD-Chart** öffnen (beliebiger Zeitrahmen).
2. **Gold1315** aus dem Navigator auf den Chart ziehen. Im Fenster unter *Allgemein* „**Algo Trading erlauben**“ anhaken und **OK** klicken.
3. Oben in der Werkzeugleiste den Knopf **„Algo Trading“** einschalten (grün).
4. Oben links im Chart steht jetzt die deutsche Uhrzeit und was der Bot heute vorhat.
5. **Der PC und MT5 müssen von 13:15 bis 22:45 Uhr laufen.** Ist MT5 um 13:15 aus, gibt es an dem Tag keinen Trade. Ist MT5 um 22:45 aus, schließt der Bot den Trade beim nächsten Start. Der Stop-Loss liegt aber immer beim Broker und schützt auch bei ausgeschaltetem PC.

**Kontogröße:** Gold ist „schwer“. Schon die kleinste Größe (0,01 Lot) riskiert pro Trade aktuell etwa **40–70 USD**. Bei 0,5 % Risiko braucht man dafür etwa **8.000–14.000 USD** auf dem Konto. Ist das Konto kleiner, lässt der Bot den Trade aus und schreibt im Journal „Lotgroesse zu klein“. Für das Demokonto: 10.000 USD und **Risiko 1 %** einstellen.

## 7. Alle Einstellungen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Einstieg Stunde / Minute | 13 / 15 | Uhrzeit der täglichen Entscheidung (deutsche Zeit) |
| Einstiegsfenster | 5 Min. | Kommt um 13:15 kein Kurs (oder ist der Spread zu hoch), versucht er es bis 13:20 weiter |
| Ausstieg Stunde / Minute | 22 / 45 | Spätester Ausstieg (deutsche Zeit) |
| Zeitzone automatisch messen | an | Nur live. Im Tester gelten die zwei Felder darunter |
| Server-Zeit = GMT + x im Winter | 2 | siehe Abschnitt 5 |
| Sommerzeit-Regel | USA | siehe Abschnitt 5 |
| Mindestbewegung | 0,4 ATR | Wie weit Gold seit 00:00 gelaufen sein muss |
| Ruhe-Filter | 1,0 | Handelt nur, wenn ATR14 / ATR100 ≤ dieser Wert |
| ATR kurz / lang | 14 / 100 Tage | Länge der Schwankungs-Messung |
| Kaufen / Verkaufen erlaubt | an / an | Eine Richtung abschalten (nicht getestet) |
| Risiko pro Trade | 0,5 % | Verlust beim Stop-Loss in % des Kontos. Empfehlung 0,25–1 %, mehr als 5 % ist gesperrt |
| Feste Lotgröße | 0 (aus) | Statt Risiko-% immer dieselbe Lotgröße |
| Stop-Loss | 0,75 ATR | Abstand des Stop-Loss |
| Take-Profit | 0 (aus) | Optionales Gewinnziel in ATR (nicht empfohlen, siehe Test) |
| Höchster Spread | 0,80 USD | Bei höherem Spread kein Einstieg |
| Sicherheits-Stopp | 20 % | Keine neuen Trades mehr, wenn das Konto 20 % unter seinem Höchststand liegt |
| Magic Number | 131500 | Kennung, damit der Bot nur seine eigenen Trades anfasst |

**Sicherheits-Stopp zurücksetzen** (zum Beispiel nach einer Ein- oder Auszahlung): In MT5 **F3** drücken (Globale Variablen) und `Gold1315_peak_131500` löschen.

**Bitte die Signal-Werte nicht „optimieren“.** Der MT5-Optimierer findet immer eine Einstellung, die in der Vergangenheit toll aussieht. In der Zukunft hilft das meistens nicht. Die Standardwerte liegen bewusst in der **Mitte** eines Bereichs, in dem alle Nachbarwerte ebenfalls funktioniert haben.

## 8. Wie getestet wurde

- **Daten:** XAUUSD-Minutenkerzen 2009–2026 (HistData-Format, Hugging-Face-Datensatz `fokan/xauusd-2009-2026`). Es ist der Bid-Kurs, der Spread wird als Kosten abgezogen.
- **Zeitzone der Daten:** Die Zeitzone wurde an den US-Arbeitsmarktdaten erkannt (immer 08:30 Uhr New York, dort springt Gold). Die Daten liegen in New Yorker Zeit, also deutsche Zeit minus 6 Stunden. In den Wochen, in denen die USA und Europa die Uhr nicht gleichzeitig umstellen, folgt der Datensatz je nach Jahr der US- oder der EU-Regel. Das wird pro Jahr automatisch erkannt. Bei der Regelsuche und in der Jahrestabelle sind diese Wochen zur Sicherheit weggelassen (571 Trades). Die Zeitraum-Tabelle und die Kontokurve enthalten sie (618 Trades). Die Ergebnisse sind fast gleich.
- **Vorsichtige Annahmen:** Erreicht der Kurs in derselben Minute Stop-Loss und Ziel, zählt der Stop-Loss. Kosten 0,35 USD + 0,005 % vom Preis pro Trade (bei 4.000 USD Goldpreis also 0,55 USD).
- **Auswahl ohne Selbstbetrug:** Regeln mit 2009–2019 ausgesucht, mit 2020–2026 geprüft. 36 Nachbar-Einstellungen geprüft: 36 von 36 waren 2009–2019 positiv, 35 von 36 auch 2020–2026.
- **Verworfen:** Immer kaufen, gegen die Bewegung handeln, Break-Even, Nachzieh-Stop, Take-Profit und der Asien-Ausbruch als Filter. Diese Varianten waren schlechter oder nicht stabil.
- **Selbst nachrechnen** (Linux/macOS mit Python 3, pandas, numpy):
  ```bash
  cd TradingBot/backtest
  ./download_data.sh                                        # lädt ~390 MB Kursdaten nach data/
  XAU_DATA=data/xau_m1_de.pkl python3 step1_rule_search.py
  XAU_DATA=data/xau_m1_de.pkl python3 step2_filters_and_exits.py
  XAU_DATA=data/xau_m1_de.pkl python3 step3_robustness.py
  XAU_DATA=data/xau_m1_de.pkl python3 step4_final_report.py
  python3 test_time_logic.py && python3 test_backtester.py  # Tests
  ```

**Noch nicht geprüft:**
- Der MQL5-Code wurde in der Cloud nicht im echten MetaEditor kompiliert. Die Zeitlogik ist per Test geprüft, der übrige Code nur durch sorgfältiges Durchlesen. Schritt 3.4 (F7) ist deshalb der erste echte Kompiliertest.
- Der Python-Backtest nutzt Minutenkerzen. Der MT5-Tester mit echten Ticks und den Spreads deines Brokers ist genauer und kann etwas andere Zahlen liefern.

## Dateien

| Datei | Inhalt |
|---|---|
| `MQL5/Experts/Gold1315/Gold1315.mq5` | Der Bot (kommt in MT5 nach `MQL5\Experts\Gold1315\`) |
| `backtest/download_data.sh`, `prepare_data.py` | Kursdaten laden, Zeitzone erkennen, in deutsche Zeit umrechnen |
| `backtest/backtester.py` | Backtest-Rechner (ein Einstieg pro Tag, Stop-Loss, Ziel, Zeitausstieg) |
| `backtest/step1…step4_*.py` | Die vier Untersuchungsschritte aus Abschnitt 8 |
| `backtest/test_time_logic.py` | Prüft die Zeitzonen-Logik des Bots gegen die Zeitzonen-Datenbank |
| `backtest/test_backtester.py` | Prüft den Backtest-Rechner mit konstruierten Kursverläufen |
