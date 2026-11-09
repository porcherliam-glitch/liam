# Gold1315 – MT5-Trading-Bot für Gold (XAUUSD)

Ein Expert Advisor (EA) für MetaTrader 5. Er entscheidet **nur einmal am Tag, um 13:15 Uhr deutscher Zeit**, ob er Gold kauft, verkauft oder nichts tut. Spätestens um **22:45 Uhr** schließt er den Trade.

## Kurzfassung (ehrlich)

| Frage | Antwort |
|---|---|
| Funktioniert die Regel? | In **20 Jahren Gold-Daten** aus zwei Quellen positiv, auch in **zwei Zeiträumen, die bei der Entwicklung nie angesehen wurden** (2006–2009 und 2026). Bewiesen ist sie damit nicht: Die Rechnung lässt etwa 5–7 % Wahrscheinlichkeit, dass der wahre Vorteil null oder negativ ist. |
| Wie viel bringt sie? | **Wenig.** Mit dem Standard (0,35 % Grundrisiko) etwa **+0,9 % pro Jahr**, größter Rückgang 8 %. Mit 1 % Grundrisiko etwa +2,6 % pro Jahr, aber bis zu 22 % Rückgang. 13 von 21 Jahren waren im Plus. |
| Setzt der Bot die Regel richtig um? | Ein Nachbau des Bots in Python, Funktion für Funktion, hat über 20 Jahre an **99,5 % der Tage** genau so entschieden wie der Backtest. Den echten MetaEditor konnte ich in der Cloud nicht starten, also bitte selbst kompilieren (Abschnitt 3). |
| Was ist das größte Risiko? | Eine **falsch eingestellte Broker-Zeitzone**. Damit wird aus Gewinn Verlust (Abschnitt 5). Danach kommen hohe Handelskosten. |
| Nur Gold? | **Ja.** Auf 23 anderen Märkten (Devisen, Silber, Öl, DAX, S&P 500 …) funktioniert die Regel nicht. |

> Zuerst im Strategietester, dann auf einem **Demokonto** oder im **Signal-Modus** testen. Nur Geld einsetzen, dessen Verlust du verkraften kannst. Das hier ist keine Anlageberatung.

**Version 1.20** (aktuell):
- **Größe nach Signalstärke:** Ein stärkeres Signal bekommt bis zu doppelt so viel Risiko.
- **Eigene Berechnung der Tagesschwankung:** Der Bot rechnet sie über deutsche Handelstage und ist damit unabhängig davon, wie ein Broker seine Tageskerzen schneidet.

Aus Version 1.10:
- Signal-Modus ohne Orders
- Handy-Nachrichten
- Protokoll-Datei
- Live-Kontrolle gegen den Backtest

---

## 1. Was der Bot macht

Um 13:15 Uhr schaut er auf zwei Dinge:

1. **Wie weit ist Gold seit 00:00 Uhr gelaufen?** Gemessen wird in „ATR“, der durchschnittlichen Tagesschwankung der letzten 14 Handelstage.
2. **Ist der Markt gerade ruhig?** Die Schwankung der letzten 14 Tage (ATR14) darf nicht größer sein als die der letzten 100 Tage (ATR100).

| Bedingung um 13:15 | Aktion |
|---|---|
| Gold ist seit 00:00 um mehr als 0,4 ATR **gestiegen** und der Markt ist ruhig | **Kaufen** |
| Gold ist seit 00:00 um mehr als 0,4 ATR **gefallen** und der Markt ist ruhig | **Verkaufen** |
| sonst | nichts tun |

- **Stop-Loss:** 0,75 ATR vom Einstieg (im November 2026 etwa 60 USD pro Unze)
- **Take-Profit:** keiner. Der Gewinn läuft bis 22:45 Uhr.
- **Ausstieg:** 22:45 Uhr deutsche Zeit, also vor der täglichen Handelspause um 23:00 Uhr.
- **Größe:** Grundrisiko × Signalstärke. Bei einer Bewegung von 0,4 ATR gilt das 1-fache, bei 0,6 ATR das 1,5-fache, ab 0,8 ATR das 2-fache. Im Schnitt ist es das 1,5-fache des Grundrisikos.
- **Häufigkeit:** etwa 35–40 Trades pro Jahr, also nur an etwa jedem siebten Handelstag

**Warum das funktionieren kann:** Wenn Gold in einer ruhigen Marktphase schon bis zum Mittag klar in eine Richtung läuft, geht die Bewegung am Nachmittag etwas häufiger weiter als zurück. Am Nachmittag kommen die US-Wirtschaftsdaten (14:30 Uhr) und die US-Börseneröffnung (15:30 Uhr). Je stärker die Bewegung bis 13:15 Uhr, desto besser war im Test das Ergebnis:

| Bewegung bis 13:15 Uhr | Ø pro Trade (HistData) | Ø pro Trade (OANDA) |
|---|---|---|
| 0,4 – 0,5 ATR | −0,03 R | −0,02 R |
| 0,5 – 0,6 ATR | +0,04 R | +0,05 R |
| über 0,6 ATR | +0,11 R | +0,09 R |

*R = der Betrag, den ein Trade bis zum Stop-Loss riskiert.*

## 2. Wie gut ist der Bot?

### 2.1 Die Regel auf vier Zeiträumen und zwei Datenquellen

Die Regel wurde nur mit **HistData 2009–2019** ausgesucht. Alles andere hat die Auswahl nie beeinflusst. Die Prüfregeln für Schritt 7 wurden **vor der ersten Auswertung festgelegt und committet** (Git-Commit „Prüfprotokoll Schritt 7 festgelegt“).

| Zeitraum | Daten | Trades | Gewinn-Trades | Ø pro Trade | Profit-Faktor |
|---|---|---|---|---|---|
| **2006–2009, nie angesehen** (inkl. Finanzkrise) | OANDA | 75 | 53 % | +0,09 R | **1,40** |
| 2009–2019 (Auswahl) | HistData | 402 | 49 % | +0,03 R | 1,10 |
| 2009–2019 | OANDA | 429 | 48 % | +0,01 R | 1,02 |
| 2020–2026 | HistData | 216 | 54 % | +0,07 R | 1,28 |
| 2020–2026 | OANDA | 216 | 53 % | +0,09 R | 1,31 |
| **2026, nie angesehen** (Jan–Nov) | OANDA | 38 | 61 % | +0,11 R | **1,66** |

### 2.2 Was du realistisch erwarten kannst

Nachbau des Bots mit 20 Jahren OANDA-Daten (2006–2026), Kosten 0,35 USD + 0,005 % vom Preis pro Trade, Gewinne mitverzinst:

| Grundrisiko | Ertrag pro Jahr | größter Rückgang | schlechtestes Jahr | bestes Jahr | 2026 bis Nov. |
|---|---|---|---|---|---|
| 0,25 % | +0,7 % | 5,9 % | −1,7 % | +4,6 % | +2,0 % |
| **0,35 % (Standard)** | **+0,9 %** | **8,3 %** | **−2,5 %** | **+6,4 %** | **+2,7 %** |
| 0,5 % | +1,4 % | 11,7 % | −3,5 % | +9,3 % | +3,9 % |
| 0,75 % | +2,0 % | 17,2 % | −5,3 % | +14,2 % | +6,0 % |
| 1,0 % | +2,6 % | 22,5 % | −7,0 % | +19,4 % | +8,1 % |

Mehr Risiko bringt mehr Ertrag, aber der Rückgang wächst im selben Verhältnis. **Ein Wert über 1 % ist nicht sinnvoll.** Der Bot erlaubt höchstens 5 % pro Trade, inklusive Signalstärke.

### 2.3 Was dafür spricht

- **Positiv in beiden unberührten Zeiträumen:** 113 Trades mit Ø +0,10 R.
- **Stabil:** Alle 36 benachbarten Einstellungen waren 2009–2019 positiv, 35 von 36 auch 2020–2026. Einstieg um 13:00, 13:30, 12:15 oder 14:15 ist ebenfalls positiv.
- **Kein Bullenmarkt-Trick:** Gold ist 2020–2025 stark gestiegen, trotzdem waren die **Verkäufe** in beiden Zeiträumen besser als die Käufe. Nur kaufen bringt zwischen 13:15 und 22:45 etwa ±0.
- **Heute weniger kostenempfindlich:** Bei einem Goldpreis um 4.000 USD sind die Handelskosten im Verhältnis zum Stop viel kleiner als 2010–2019.

### 2.4 Was dagegen spricht

- **Statistisch nicht bewiesen:** Über alle Trades liegt die Wahrscheinlichkeit, dass der wahre Vorteil null oder negativ ist, bei etwa 7 %, auf den unberührten Daten bei 5 %. Dazu kommt: Bei der Suche wurden viele Regeln ausprobiert, das erhöht das Risiko eines Zufallstreffers.
- **2009–2019 fast null** in den OANDA-Daten (Profit-Faktor 1,02). Das Ergebnis hängt also etwas vom Datenanbieter ab.
- **Nur Gold:** Exakt dieselbe Regel auf 23 anderen Märkten ergibt insgesamt **kein Plus**. Ein vorher festgelegtes Portfolio aus den Märkten, die 2009–2019 positiv waren, hätte 2020–2025 verloren (−11,6 R).
- **Abgelehnte Verbesserungen** (vorher festgelegte Prüfung):
  - 24 Stunden halten
  - Trendfolge um 13:15
  - Trendfolge plus Grundregel
  - jährliches Neu-Optimieren (+18,3 R statt +21,6 R mit festen Werten)
  - Break-Even, Nachzieh-Stop und Take-Profit

  Übernommen wurde nur die Größe nach Signalstärke, weil sie die vorher festgelegte Regel erfüllt hat. Ehrlich gesagt hilft sie vor allem ab 2020. Vor 2020 ist sie pro Trade etwa gleich gut, im Verhältnis zum größten Rückgang sogar leicht schlechter. Über 2006–2026 bringt sie bei gleichem Rückgang etwa 5–7 % mehr Ertrag.

## 3. Installation (Windows, MetaTrader 5)

1. **MetaTrader 5** vom Broker installieren und ein **Demokonto** eröffnen (kostenlos), siehe Abschnitt 6 zur Kontogröße.
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
   - Einzahlung: 100.000 USD (damit die kleinste Lotgröße nicht stört)
3. Unter **Eingaben** die Broker-Zeitzone prüfen (Abschnitt 5) und dann **Start** klicken.
4. Im Reiter **Journal** steht jeden Tag eine Zeile wie
   `13:15 Uhr: Bewegung seit 00:00 = +0.52 ATR (Grenze 0.40), ATR14/ATR100 = 0.87 (Grenze 1.00) -> KAUFEN`.
   Am Ende steht dort eine Zeile `Gold1315 Testergebnis: Bisher N Trades … = +x R (normal laut Backtest: … bis … R)`.
5. Im Reiter **Backtest** stehen Gewinn, Profit-Faktor und Rückgang.

**Erwartung für 2020 bis heute** (Nachbau mit OANDA-Daten): etwa 37 Trades pro Jahr, 55 % Gewinn-Trades und ein Profit-Faktor um 1,45. Durch die Signalstärke ist der Profit-Faktor in Geld höher als in R (1,34). Rechne mit Abweichungen durch die Spreads deines Brokers.
- Weicht es stark ab, ist meist die **Zeitzone** falsch eingestellt (Abschnitt 5) oder der Broker hat höhere Kosten.
- Steht im Journal „Noch nicht genug Kursdaten“, fehlen dem Tester die Stundenkerzen vor dem Startdatum. Den Start dann ein halbes Jahr früher wählen und nur die Zeit ab 2020 bewerten.

## 5. Zeitzone des Brokers (wichtigste Einstellung)

Der Bot rechnet die Serverzeit des Brokers in deutsche Zeit um. **Live** misst er die Zeitzone automatisch. **Im Strategietester** geht das nicht, dort gelten die Eingaben.

**Warum das so wichtig ist:** Im Nachbau mit 20 Jahren Daten lieferte der Bot bei richtiger Einstellung +31 R. Auf einem Broker mit UTC-Zeit, aber mit den Standard-Einstellungen, waren es −1,5 R. Er hätte zur falschen Uhrzeit entschieden und den Vorteil verloren.

So findest du die richtige Einstellung: In MT5 die **Marktübersicht** öffnen (Strg+M). Die Uhrzeit oben ist die Serverzeit. Vergleiche sie mit der deutschen Uhrzeit:

| Serverzeit im Vergleich zur deutschen Zeit | „Server-Zeit = GMT + x im Winter“ | „Sommerzeit-Regel“ |
|---|---|---|
| immer **1 Stunde später** (die meisten Broker) | **2** (Standard) | **USA** (Standard) |
| genau **gleich** | 1 | Europa |
| immer **1 Stunde früher** | 0 | Europa |
| im Winter 1 Stunde früher, im Sommer 2 Stunden früher | 0 | keine Sommerzeit |

**Live zeigt der Bot oben im Chart die deutsche Uhrzeit an.** Stimmt sie nicht mit deiner Uhr überein, stimmt etwas nicht. Weicht die gemessene Zeitzone von der Einstellung ab, steht im Journal ein Hinweis. Dann die Einstellung anpassen, damit auch der Tester richtig rechnet.

Die Zeitlogik ist mit der offiziellen Zeitzonen-Datenbank geprüft: für jede Stunde von 2009 bis 2030 und alle Zeilen der Tabelle. Das schließt die Wochen im März und im Oktober/November ein, in denen die USA und Europa die Uhr nicht gleichzeitig umstellen.

## 6. Auf dem Demokonto laufen lassen

1. Ein **XAUUSD-Chart** öffnen (beliebiger Zeitrahmen).
2. **Gold1315** aus dem Navigator auf den Chart ziehen. Im Fenster unter *Allgemein* „**Algo Trading erlauben**“ anhaken und **OK** klicken.
3. Oben in der Werkzeugleiste den Knopf **„Algo Trading“** einschalten (grün).
4. Oben links im Chart stehen jetzt die deutsche Uhrzeit, was der Bot heute vorhat und die Live-Kontrolle (6.2).
5. **Der PC und MT5 müssen von 13:15 bis 22:45 Uhr laufen.** Ist MT5 um 13:15 aus, gibt es an dem Tag keinen Trade. Ist MT5 um 22:45 aus, schließt der Bot den Trade beim nächsten Start. Der Stop-Loss liegt aber immer beim Broker und schützt auch bei ausgeschaltetem PC.

**Kontogröße:** Gold ist „schwer“. Im November 2026 (Gold um 4.100 USD, ATR um 82 USD) riskiert schon die kleinste Größe (0,01 Lot) etwa **62 USD** pro Trade. Ist das Konto zu klein, lässt der Bot den Trade aus und schreibt „Lotgroesse zu klein“.

| Grundrisiko | Konto für jedes Signal | Konto für die starken Signale |
|---|---|---|
| 0,35 % (Standard) | ab etwa 18.000 USD | ab etwa 9.000 USD |
| 0,5 % | ab etwa 12.500 USD | ab etwa 6.200 USD |
| 1,0 % | ab etwa 6.200 USD | ab etwa 3.100 USD |

Für ein Demokonto mit 10.000 USD deshalb **Grundrisiko 1 %** einstellen. Das dient nur zum Testen der Technik, nicht als Empfehlung für echtes Geld.

### 6.1 Signal-Modus und Handy-Nachrichten

- **Signal-Modus** (Einstellung *Betriebsart → Nur Signal melden*): Der Bot sendet **keine Orders**. Er meldet nur, was er tun würde, zum Beispiel
  `SIGNAL VERKAUFEN Gold zu ca. 4012.35, Stop-Loss 4074.10, schliessen um 22:45 Uhr (0.03 Lot, Risiko x1.60).` Um 22:45 Uhr kommt eine Erinnerung zum Schließen. So kannst du die Signale auch auf dem echten Konto ohne Risiko beobachten.
- **Handy-Nachrichten** (kostenlos):
  1. In der **MetaTrader-5-App** auf dem Handy unter *Einstellungen → Nachrichten* die **MetaQuotes-ID** ablesen.
  2. In MT5 auf dem PC unter **Extras → Optionen → Benachrichtigungen** „Push-Benachrichtigungen aktivieren“ anhaken und die ID eintragen.
  3. Beim Bot *Handy-Nachricht senden* einschalten.

  Gemeldet werden Signale, Einstiege, Ausstiege mit Ergebnis, Fehler und der Sicherheits-Stopp.

### 6.2 Live-Kontrolle: Läuft es wie im Backtest?

Der Bot zählt alle eigenen abgeschlossenen Trades, rechnet sie in R um und zeigt im Chart zum Beispiel:
`Bisher 20 Trades, Ergebnis +85.40 USD = +0.9 R (normal laut Backtest: -4.7 bis +6.4 R)`.

**So liest du das:** Auch wenn alles stimmt, schwankt das Ergebnis stark. Nach einem Jahr (etwa 40 Trades) liegt man mit 36 % Wahrscheinlichkeit im Minus. Ein paar Monate Demo sagen deshalb wenig darüber, ob die Strategie Geld verdient. Sie zeigen aber, ob der Bot **technisch richtig** läuft: richtige Uhrzeit, Orders gehen durch, Kosten passen.

| nach so vielen Trades | normaler Bereich (90 %) | Wahrscheinlichkeit für Minus |
|---|---|---|
| 10 (etwa 3 Monate) | −3,5 bis +4,4 R | 44 % |
| 20 (etwa 6 Monate) | −4,7 bis +6,4 R | 41 % |
| 40 (etwa 1 Jahr) | −6,1 bis +9,6 R | 36 % |
| 80 (etwa 2 Jahre) | −7,6 bis +14,7 R | 30 % |
| 160 (etwa 4 Jahre) | −8,6 bis +22,8 R | 23 % |

**Liegt das Ergebnis unter dem normalen Bereich**, zeigt der Bot „ACHTUNG“ an. Dann passt der Broker vermutlich nicht: Spread und Kosten prüfen, die Zeitzone prüfen, und das Protokoll (6.3) an Claude geben.

### 6.3 Protokoll-Datei

Jede Entscheidung und jeder Trade wird in **`Gold1315_journal.csv`** geschrieben (der Strategietester schreibt in `Gold1315_tester_journal.csv`). Der Ordner ist `%APPDATA%\MetaQuotes\Terminal\Common\Files`: diese Zeile in die Adressleiste des Windows-Explorers eingeben. Die Datei lässt sich mit Excel öffnen (Trennzeichen Semikolon). In der Spalte `note` steht bei Trades der Risiko-Faktor (`size x1.60`).

## 7. Alle Einstellungen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| **Betrieb** | | |
| Betriebsart | Handeln | „Nur Signal melden“ sendet keine Orders (6.1) |
| Handy-Nachricht senden | aus | Push-Nachricht über die MT5-App (6.1) |
| Hinweisfenster in MT5 | aus | Zusätzlich ein Fenster mit Ton in MT5 |
| Auch melden, wenn kein Signal kommt | aus | Tägliche Nachricht „heute kein Signal“ |
| Protokoll-Datei schreiben | an | `Gold1315_journal.csv` (6.3) |
| **Zeit** | | |
| Einstieg Stunde / Minute | 13 / 15 | Uhrzeit der täglichen Entscheidung (deutsche Zeit) |
| Einstiegsfenster | 5 Min. | Kommt um 13:15 kein Kurs (oder ist der Spread zu hoch), versucht er es bis 13:20 weiter |
| Ausstieg Stunde / Minute | 22 / 45 | Spätester Ausstieg (deutsche Zeit) |
| **Broker-Zeitzone** | | |
| Zeitzone automatisch messen | an | Nur live. Im Tester gelten die zwei Felder darunter |
| Server-Zeit = GMT + x im Winter | 2 | siehe Abschnitt 5 |
| Sommerzeit-Regel | USA | siehe Abschnitt 5 |
| **Signal** | | |
| Mindestbewegung | 0,4 ATR | Wie weit Gold seit 00:00 gelaufen sein muss |
| Ruhe-Filter | 1,0 | Handelt nur, wenn ATR14 / ATR100 ≤ dieser Wert |
| ATR kurz / lang | 14 / 100 Tage | Länge der Schwankungs-Messung (deutsche Handelstage) |
| Kaufen / Verkaufen erlaubt | an / an | Eine Richtung abschalten (nicht getestet) |
| **Risiko** | | |
| Grundrisiko pro Trade | 0,35 % | Verlust beim Stop-Loss in % des Kontos, bei einem Signal von genau 0,4 ATR |
| Größe nach Signalstärke | an | Stärkeres Signal → mehr Risiko (Abschnitt 1) |
| Höchstens so viel mal das Grundrisiko | 2,0 | Obergrenze für die Signalstärke (erlaubt: 1 bis 3) |
| Feste Lotgröße | 0 (aus) | Statt Risiko-% immer dieselbe Lotgröße (dann ohne Signalstärke) |
| Stop-Loss | 0,75 ATR | Abstand des Stop-Loss |
| Take-Profit | 0 (aus) | Optionales Gewinnziel in ATR (nicht empfohlen, siehe Test) |
| Höchster Spread | 0,80 USD | Bei höherem Spread kein Einstieg |
| Sicherheits-Stopp | 20 % | Keine neuen Trades mehr, wenn das Konto 20 % unter seinem Höchststand liegt |
| **Sonstiges** | | |
| Magic Number | 131500 | Kennung, damit der Bot nur seine eigenen Trades anfasst |

**Sicherheits-Stopp zurücksetzen** (zum Beispiel nach einer Ein- oder Auszahlung): In MT5 **F3** drücken (Globale Variablen) und `Gold1315_peak_131500` löschen.

**Bitte die Signal-Werte nicht „optimieren“.** Der MT5-Optimierer findet immer eine Einstellung, die in der Vergangenheit toll aussieht. In der Zukunft hilft das meistens nicht: Das jährliche Neu-Optimieren war im Test schlechter als die festen Werte. Die Standardwerte liegen bewusst in der **Mitte** eines Bereichs, in dem alle Nachbarwerte ebenfalls funktioniert haben.

## 8. Wie getestet wurde

| Schritt | Skript | Ergebnis |
|---|---|---|
| 1 Regelsuche | `step1_rule_search.py` | Nur die Fortsetzung der Tagesbewegung ist in beiden Zeiträumen positiv |
| 2 Filter und Ausstiege | `step2_filters_and_exits.py` | Ruhe-Filter hilft; Break-Even und Nachzieh-Stop nicht |
| 3 Nachbar-Einstellungen | `step3_robustness.py` | 36/36 positiv (2009–19), 35/36 (2020–26) |
| 4 Abschlussbericht | `step4_final_report.py` | Jahre, Kosten, andere Uhrzeiten, Kontokurve |
| 5 Andere Märkte | `step5_other_markets.py` | Funktioniert nur bei Gold → kein Mehr-Märkte-Bot |
| 6 Ehrlichkeits-Prüfungen | `step6_honesty_checks.py` | Kauf/Verkauf, Statistik, Walk-Forward, Feiertage |
| 7 Neue Daten und Kandidaten | `step7_fresh_data_and_candidates.py` | Unberührte Zeiträume positiv; Signalstärke übernommen |
| 8 Bot gegen Backtest | `step8_ea_vs_backtest.py` | 99,5 % gleiche Entscheidungen; falsche Zeitzone kostet den Vorteil |

- **Daten:**
  - **HistData** (`fokan/xauusd-2009-2026`): XAUUSD-Minutenkerzen März 2009 bis Januar 2026, Bid-Kurs, Zeitzone New York.
  - **OANDA** (`bunqi/OANDA_XAUUSD_Gold`): März 2006 bis November 2026, Zeitstempel in UTC.
  - **Andere Märkte:** `vessel888/histdata_fx_1m`, bis März 2025.
- **Zeitzone der HistData-Daten:** Die Zeitzone wurde an den US-Arbeitsmarktdaten erkannt (immer 08:30 Uhr New York, dort springt Gold). In den Wochen, in denen die USA und Europa die Uhr nicht gleichzeitig umstellen, folgt der Datensatz je nach Jahr der US- oder der EU-Regel. Das wird pro Jahr automatisch erkannt.
- **Vorsichtige Annahmen:** Erreicht der Kurs in derselben Minute Stop-Loss und Ziel, zählt der Stop-Loss. Kosten pro Trade: 0,35 USD + 0,005 % vom Preis.
- **Der Bot-Nachbau** (`ea_simulator.py`) ist eine Python-Kopie der Bot-Funktionen. Er rechnet in Serverzeit, mit Stop-Loss beim Broker, Ausführung bei Kurslücken, Lotgrößen und Kontostand.
- **Selbst nachrechnen** (Linux/macOS mit Python 3, pandas, numpy, pyarrow):
  ```bash
  cd TradingBot/backtest
  ./download_data.sh                                        # lädt ~390 MB HistData-Golddaten nach data/
  export XAU_DATA=data/xau_m1_de.pkl
  python3 step1_rule_search.py                              # … bis step4_final_report.py, step6_honesty_checks.py
  # step5 braucht die 24 Märkte aus vessel888/histdata_fx_1m in data/multi (~1,3 GB)
  ./download_oanda.sh                                       # OANDA-Golddaten 2006-heute (~170 MB) für step7 und step8
  python3 step7_fresh_data_and_candidates.py && python3 step8_ea_vs_backtest.py
  python3 test_time_logic.py && python3 test_backtester.py && python3 test_mql5_static.py && python3 test_ea_simulator.py
  ```

**Tests** (alle grün):

| Test | Was er prüft |
|---|---|
| `test_time_logic.py` | Zeitzonen-Logik des Bots gegen die Zeitzonen-Datenbank, jede Stunde 2009–2030, drei Broker-Typen |
| `test_backtester.py` | Backtest-Rechner mit konstruierten Kursverläufen |
| `test_ea_simulator.py` | 10 Verhaltens-Tests des Bot-Nachbaus: Kauf, Verkauf, Stop im Kerzenverlauf und durch Kurslücke, Ausstieg 22:45, schwaches Signal, fehlende 13:15-Kerze, Ruhe-Filter, Lotgröße |
| `test_mql5_static.py` | MQL5-Code: Klammern, ASCII, jede Funktion und Konstante gegen eine geprüfte MQL5-Liste, Ereignis-Funktionen |

**Noch nicht geprüft:**
- **Kein echter Compiler-Lauf:** Der MQL5-Code wurde in der Cloud nicht im echten MetaEditor kompiliert. Schritt 3.4 (F7) ist der erste echte Kompiliertest.
- **Nachbau statt MT5:** Der Bot-Nachbau zeigt, dass die Logik stimmt. Er ersetzt aber nicht den MT5-Strategietester mit echten Ticks und den Spreads deines Brokers.

## Dateien

| Datei | Inhalt |
|---|---|
| `MQL5/Experts/Gold1315/Gold1315.mq5` | Der Bot (kommt in MT5 nach `MQL5\Experts\Gold1315\`) |
| `backtest/download_data.sh`, `prepare_data.py` | HistData-Kursdaten laden, Zeitzone erkennen, in deutsche Zeit umrechnen |
| `backtest/download_oanda.sh` | OANDA-Kursdaten laden (für Schritt 7 und 8) |
| `backtest/backtester.py` | Backtest-Rechner (ein Einstieg pro Tag, Stop-Loss, Ziel, Zeitausstieg) |
| `backtest/ea_simulator.py` | Python-Nachbau des Bots mit simuliertem MT5-Broker |
| `backtest/step1…step8_*.py` | Die acht Untersuchungsschritte aus Abschnitt 8 |
| `backtest/test_*.py` | Die vier Testdateien aus Abschnitt 8 |
