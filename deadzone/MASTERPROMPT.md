# MASTERPROMPT – FULL ZOMBIE EXTRACTION SHOOTER IN HTML

(Verbindliche Vorgabe des Auftraggebers, Stand 2026-10-15. Wortlaut unverändert.)

## 1. Deine Aufgabe

Du bist ein professionelles Game-Development-Team aus Senior Game Developern, Gameplay-Programmierern, Game Designern, KI-Entwicklern, UI/UX-Designern und Technical Artists.

Entwickle ein vollständiges, umfangreiches und spielbares Zombie-Extraction-Shooter-Spiel. Das Spiel soll sich von der Spielmechanik an Escape-from-Tarkov-Extraction-Games, Survival-Shootern und modernen Zombie-Spielen orientieren, aber ein eigenes Universum, eigene Karten, eigene Waffen, eigene Gegner und ein eigenes Design besitzen.

WICHTIG: Das finale Hauptprodukt MUSS eine einzige vollständige HTML-Datei namens index.html sein.

Die Datei muss HTML, CSS und JavaScript enthalten. Verwende Canvas 2D für die Spielwelt und JavaScript für die gesamte Spiellogik.

Das Spiel muss offline lokal im Browser funktionieren. Es darf kein Backend, keinen Server, keine Installation und keine externen Dateien benötigen. Nach Abschluss muss das Spiel durch Öffnen von index.html spielbar sein.

Verwende keine externen JavaScript-Bibliotheken, CDNs, externen Assets oder APIs. Erstelle Grafiken bei Bedarf direkt mit Canvas, CSS, Formen, Partikeleffekten und prozedural generierten Texturen.

Erstelle kein bloßes Konzept, keinen Prototyp mit Platzhaltern und keine statische Menü-Demo. Entwickle ein echtes Spiel mit funktionierenden Spielmechaniken.

## 2. Spielkonzept

Arbeitstitel: DEAD ZONE: EXTRACTION

Der Spieler lebt in einer von Zombies überrannten Welt. Er besitzt eine befestigte Basis und startet von dort aus gefährliche Expeditionen in verlassene Städte, Industrieanlagen, Militärgebiete, Wälder und Forschungsstationen.

Das Hauptziel jeder Expedition ist:

1. Die Karte betreten.
2. Waffen, Munition, Medizin und wertvolle Gegenstände finden.
3. Zombies bekämpfen oder ihnen ausweichen.
4. Gebäude durchsuchen und seltene Beute finden.
5. Missionsziele erfüllen.
6. Einen Extraktionspunkt erreichen.
7. Mit der Beute lebend zur Basis zurückkehren.
8. Ausrüstung verbessern und schwierigere Missionen starten.

Das zentrale Spielprinzip ist Risiko gegen Belohnung.

Wenn der Spieler erfolgreich extrahiert, behält er die gesicherte Beute. Wenn er stirbt, verliert er die während des Raids mitgeführte Beute und seine mitgebrachte Ausrüstung entsprechend den festgelegten Verlustregeln.

Das Spiel muss einen klaren Fortschritt zwischen Basis, Raid und Rückkehr bieten.

## 3. Perspektive und Steuerung

Entwickle das Spiel als hochwertigen Top-down-Shooter mit frei begehbarer 2D-Spielwelt.

Die Spielfigur wird von oben dargestellt. Die Kamera folgt dem Spieler und die Welt scrollt in alle Richtungen.

Desktop-Steuerung:

* WASD: Bewegung.
* Maus: Zielen.
* Linke Maustaste: Schießen.
* R: Nachladen.
* E: Interagieren, Türen öffnen und Loot einsammeln.
* Shift: Sprinten.
* C: Ducken beziehungsweise leiser bewegen.
* F: Taschenlampe.
* Tab: Inventar.
* M: Karte.
* G: Granate werfen, sofern vorhanden.
* 1–5: Waffenplätze wechseln.
* Escape: Pausemenü.

Implementiere außerdem eine optionale mobile Steuerung mit virtuellem linken Bewegungsstick, rechtem Ziel- und Schießbereich sowie Interaktionstasten.

Die Benutzeroberfläche muss sich automatisch an verschiedene Bildschirmgrößen anpassen. Mobile Geräte sollen im Querformat optimal spielbar sein.

## 4. Die Spielwelt

Erstelle mindestens vier umfangreiche, unterschiedliche Karten:

Karte A: Verlassene Stadt

* Wohnhäuser und mehrstöckige Gebäude.
* Geschäfte, Supermarkt und Apotheke.
* Straßen, Autos, Hinterhöfe und Barrikaden.
* Kleine Beutestellen und versteckte Räume.
* Viele normale und schnelle Zombies.

Karte B: Militärbasis

* Kasernen, Lagerhallen und Kontrollpunkte.
* Militärkisten mit seltenen Waffen.
* Gepanzerte Zombies.
* Hochwertige Munition und taktische Ausrüstung.
* Stark bewachte Hochrisikobereiche.

Karte C: Industriegebiet

* Fabrikhallen, Werkstätten und Lager.
* Metall, Elektronik und Werkzeug.
* Dunkle Räume und enge Korridore.
* Giftige Bereiche und gefährliche Spezialzombies.

Karte D: Forschungsanlage

* Labore, Sicherheitsräume und unterirdische Bereiche.
* Medizinische Vorräte und seltene Materialien.
* Besonders gefährliche Zombievarianten.
* Hochwertige experimentelle Ausrüstung.
* Ein anspruchsvoller Bossbereich.

Jede Karte benötigt eigene Farben, Gebäudeformen, Loot-Verteilungen, Gegnerdichte, Extraktionspunkte und Schwierigkeitsgrade.

Generiere die Karten aus einem Seed, damit ihre Struktur bei Bedarf reproduzierbar ist. Platziere Hindernisse so, dass Wege begehbar bleiben und keine wichtigen Punkte unerreichbar sind.

Implementiere Gebäudekollisionen, Mauern, Deckung, Türen, Hindernisse und klar erkennbare begehbare Flächen.

Die Karten sollen groß genug sein, dass der Spieler erkunden und Entscheidungen treffen muss.

## 5. Waffen und Kampfsystem

Implementiere ein funktionierendes Waffen- und Schadenssystem.

Waffenkategorien:

* Pistolen.
* Maschinenpistolen.
* Sturmgewehre.
* Schrotflinten.
* Präzisionsgewehre.
* Leichte Maschinengewehre.
* Nahkampfwaffen.
* Granaten.

Jede Waffe benötigt eigene Werte:

* Schaden.
* Feuerrate.
* Magazingröße.
* Nachladezeit.
* Reichweite.
* Streuung.
* Rückstoß.
* Munitionsart.
* Geräuschpegel.
* Seltenheit.
* Zustand beziehungsweise Haltbarkeit, sofern sinnvoll.

Implementiere echtes Projektil- oder Trefferzonenverhalten innerhalb der 2D-Spielwelt. Kugeln dürfen nicht einfach unbegrenzt durch massive Wände fliegen.

Das Schießen muss sichtbare Mündungsblitze, Projektile oder Trefferindikatoren, Einschlagpartikel und passende Soundeffekte mit synthetisch erzeugtem Audio bieten.

Beim Nachladen wird die passende Munition aus dem Inventar verbraucht. Ist keine Munition vorhanden, kann nicht nachgeladen werden.

Implementiere unterschiedliche Munitionsarten mit nachvollziehbaren Vor- und Nachteilen.

Waffen müssen lootbar, ausrüstbar, austauschbar und verkaufbar sein.

## 6. Zombie-KI

Erstelle eine funktionierende Gegner-KI mit Zuständen und Wahrnehmung.

Gegnertypen

1. Normaler Zombie: langsam, häufig und relativ schwach.
2. Runner: schnell und aggressiv.
3. Brute: langsam, schwer gepanzert und widerstandsfähig.
4. Screamer: ruft weitere Zombies herbei.
5. Toxic Zombie: gefährliche Angriffe mit Giftbereich.
6. Armored Zombie: schützt sich durch Panzerung.
7. Stalker: versucht, den Spieler zu überraschen.
8. Boss-Zombie: großer Gegner mit mehreren Angriffsphasen.

Die Zombies müssen:

* Den Spieler über Sichtweite und Geräusche entdecken.
* Hindernisse bei der Bewegung berücksichtigen.
* Den Spieler verfolgen.
* Angreifen, wenn sie nahe genug sind.
* Auf Schüsse und andere laute Aktionen reagieren.
* Bei Sichtverlust den letzten bekannten Aufenthaltsort untersuchen.
* Bei Bedarf Gruppen bilden.
* Aufeinanderfolgende Angriffe mit nachvollziehbaren Animationen ausführen.
* Unterschiedliche Geschwindigkeiten, Lebenspunkte und Schadenswerte besitzen.

Ein Schuss soll abhängig von Lautstärke und Umgebung weitere Zombies anlocken können.

Verhindere, dass die KI in Endlosschleifen gerät oder durch Wände läuft.

## 7. Inventar und Loot

Entwickle ein vollständiges Inventarsystem.

Jeder Gegenstand besitzt:

* Namen.
* Kategorie.
* Seltenheit.
* Verkaufswert.
* Gewicht.
* Stapelgröße.
* Beschreibung.
* Optional Haltbarkeit und Zustand.

Kategorien:

* Waffen.
* Munition.
* Medizin.
* Nahrung.
* Wasser.
* Baumaterialien.
* Elektronik.
* Werkzeuge.
* Rüstung.
* Schlüssel und Missionsgegenstände.
* Seltene Sammlerstücke.

Implementiere:

* Rasterinventar.
* Ausrüstungsplätze.
* Rucksack mit begrenztem Platz.
* Gewichtslimit.
* Gegenstände aufnehmen.
* Gegenstände ablegen.
* Gegenstände verschieben.
* Stapel zusammenführen und teilen.
* Gegenstände aus Kisten plündern.
* Gegenstände zwischen Inventar und Lager transferieren.
* Gegenstände verkaufen.
* Gegenstände für Missionen abgeben.

Wertvolle Gegenstände müssen anhand ihrer Seltenheit und ihres Fundortes unterschiedliche Spawn-Wahrscheinlichkeiten haben.

Beute wird zufällig, aber nachvollziehbar generiert. Hochwertiger Loot soll in gefährlicheren Gebieten wahrscheinlicher sein.

Wenn das Inventar voll ist, darf der Spieler nicht unbegrenzt neue Gegenstände aufnehmen.

## 8. Extraction-System

Die Extraktion ist die wichtigste Spielmechanik.

Jede Mission enthält mehrere mögliche Extraktionspunkte. Nicht jeder Punkt muss jederzeit verfügbar sein.

Beispiele:

* Evakuierungszone am Stadtrand.
* Militärischer Helikopterlandeplatz.
* Unterirdischer Versorgungstunnel.
* Bewachtes Tor.
* Notausgang der Forschungsanlage.

Jeder Extraktionspunkt benötigt:

* Erkennbaren Standort.
* Interaktionsradius.
* Sichtbare Aktivierungsbedingungen.
* Countdown, sofern passend.
* Mögliche Gefahren während der Extraktion.
* Erfolgs- und Fehlermeldung.

Manche Extraktionen benötigen einen Schlüssel, Treibstoff oder eine andere Ressource.

Während der Extraktion können Zombies angreifen. Wird der Spieler unterbrochen oder verlässt er die Zone, soll die Extraktion entsprechend den Regeln pausieren oder abgebrochen werden.

Nach erfolgreicher Extraktion:

* Raid beenden.
* Überlebte Ausrüstung sichern.
* Loot ins Basislager übertragen.
* Erfahrung vergeben.
* Missionserfolge speichern.
* Statistiken aktualisieren.
* Ergebnisbildschirm anzeigen.

Bei Tod:

* Raid beenden.
* Verlustregeln anwenden.
* Nicht gesicherte Raid-Beute verlieren.
* Statistiken aktualisieren.
* Rückkehr zur Basis ermöglichen.

Vermeide Situationen, in denen eine Mission ohne erreichbaren Extraktionspunkt beginnt.

## 9. Basis und Langzeitprogression

Die Basis ist das zentrale Menü und die Heimat des Spielers.

Implementiere funktionierende Bereiche:

Lager — Gegenstände und Ressourcen sicher aufbewahren.

Waffenwerkstatt — Waffen reparieren, Ausrüstung verwalten und verfügbare Upgrades herstellen.

Krankenstation — Heilgegenstände herstellen und Verletzungen zwischen Raids behandeln.

Werkstatt — Materialien in nützliche Gegenstände umwandeln.

Funkstation — Neue Missionen, Hinweise und Aufträge freischalten.

Verteidigungsanlage — Basisverbesserungen und langfristige Boni erwerben.

Händler — Loot verkaufen, Munition und medizinische Gegenstände kaufen und Ausrüstung handeln.

Jeder Bereich muss echte Auswirkungen auf das Spiel haben. Baue keine bloßen dekorativen Schaltflächen ein.

Verbesserungen benötigen Ressourcen, Geld oder bestimmte Fortschrittsstufen.

Implementiere ein Wirtschaftssystem mit Geld, Kaufpreisen, Verkaufspreisen, Missionsbelohnungen und Reparaturkosten.

## 10. Missionen und Aufträge

Implementiere ein Missionssystem mit unterschiedlichen Zielen:

* Ressourcen beschaffen.
* Bestimmte Gebäude durchsuchen.
* Zombies eliminieren.
* Einen Boss besiegen.
* Eine Lieferung bergen.
* Einen Schlüssel finden.
* Medizinische Vorräte retten.
* Ein Gebiet untersuchen.
* Einen Generator aktivieren.
* Ein Missionsziel erreichen und extrahieren.

Jede Mission benötigt:

* Titel und Beschreibung.
* Zielort.
* Schwierigkeitsgrad.
* Belohnung.
* Optionale Nebenziele.
* Erfolgskriterien.
* Fehlermöglichkeiten.
* Gespeicherten Fortschritt.

Erstelle eine Missionsauswahl in der Basis. Der Spieler soll vor jedem Raid Karte, Ausrüstung und Auftrag auswählen können.

## 11. Gesundheit, Überleben und Ausrüstung

Implementiere:

* Lebenspunkte.
* Ausdauer.
* Rüstung.
* Heilung.
* Blutungen oder andere vereinfachte Verletzungszustände.
* Nahrung und Wasser als optionale Überlebensmechaniken.
* Sprintkosten.
* Geräuschentwicklung bei Bewegung.
* Temporäre Statuswirkungen.

Medizinische Gegenstände müssen unterschiedliche Effekte und Anwendungszeiten besitzen.

Rüstung reduziert Schaden entsprechend ihrer Schutzklasse und kann eine Haltbarkeit besitzen.

Zeige wichtige Statuswerte in einem übersichtlichen HUD.

Der Schwierigkeitsgrad soll herausfordernd sein, ohne dass zufällige Treffer oder unfaire Gegnerplatzierung den Spieler unnötig bestrafen.

## 12. Grafik und Atmosphäre

Erstelle eine hochwertige 2D-Optik direkt mit HTML Canvas.

Verwende:

* Dunkle, glaubwürdige Farbpaletten.
* Beleuchtete Räume und Schatteneffekte.
* Dynamische Taschenlampe.
* Tag-Nacht-Wechsel.
* Nebel und Partikel.
* Mündungsblitze.
* Einschlagseffekte.
* Trefferanimationen.
* Zombies mit klar unterscheidbaren Silhouetten.
* Gebäude mit unterschiedlichen Dach- und Wandfarben.
* Loot-Objekte mit Seltenheitsfarben.
* Sichtbare Türen, Fenster, Kisten und Deckungen.
* Bildschirmränder und Schadensanzeigen bei Treffern.
* Kamerabewegung mit dezenter Glättung.
* Minimap und Missionsmarker.

Nutze prozedurale Grafiken und Animationen. Spieler, Gegner, Waffen und Loot müssen visuell voneinander unterscheidbar sein.

Erzeuge bei Bedarf Soundeffekte mit Web Audio API. Dazu gehören Schüsse, Nachladen, Schritte, Zombiegeräusche, Alarme, Menüklicks und Extraktionssignale.

Audio muss erst nach einer Nutzerinteraktion starten, damit Browser-Autoplay-Regeln berücksichtigt werden.

## 13. Benutzeroberfläche

Entwickle eine vollständige, moderne und übersichtliche Benutzeroberfläche.

Menüs:

* Hauptmenü.
* Neues Spiel.
* Spiel fortsetzen.
* Basismenü.
* Missionsauswahl.
* Ausrüstungsmenü.
* Inventar.
* Händler.
* Werkstätten.
* Karte.
* Pausemenü.
* Einstellungen.
* Raid-Ergebnis.
* Todesbildschirm.
* Spielstatistiken.

Das Design soll wie ein professionelles taktisches Survival-Spiel wirken: dunkle Oberflächen, klare Typografie, dezente Warnfarben und übersichtliche Informationshierarchie.

Das HUD während eines Raids zeigt:

* Gesundheit.
* Ausdauer.
* Aktuelle Waffe.
* Magazin und Reserve-Munition.
* Inventargewicht.
* Missionsziele.
* Extraktionsstatus.
* Minimap.
* Interaktionshinweise.

Die Benutzeroberfläche darf die Sicht auf wichtige Spielbereiche nicht unnötig verdecken.

Alle Schaltflächen müssen tatsächlich funktionieren. Vermeide Attrappen, tote Menüpunkte und unvollständige Dialoge.

## 14. Speichern und Laden

Nutze LocalStorage für Spielstände und Einstellungen.

Speichere mindestens:

* Spielerfortschritt.
* Geld.
* Basisverbesserungen.
* Lagerbestand.
* Waffen und Gegenstände.
* Freigeschaltete Karten.
* Missionserfolge.
* Spielerstatistiken.
* Einstellungen.
* Aktuellen Spielzustand, soweit sicher wiederherstellbar.

Verwende eine versionierte Speicherstruktur und prüfe geladene Daten auf Fehler.

Ein beschädigter Spielstand soll möglichst abgefangen werden, statt das ganze Spiel unspielbar zu machen.

Implementiere:

* Neues Spiel.
* Automatisches Speichern an sicheren Stellen.
* Manuelles Speichern im sicheren Basismenü.
* Spielstand zurücksetzen mit Bestätigung.
* Versionsprüfung und sinnvolle Standardwerte.

Ein laufender Raid soll nicht einfach durch Neuladen kostenlos abgesichert werden. Definiere klare Regeln, wann ein Raid gespeichert oder nach einem Neustart als fehlgeschlagen behandelt wird.

## 15. Technik und Performance

Das gesamte Spiel muss in einer einzigen Datei namens index.html enthalten sein.

Verwende: HTML5, CSS3, JavaScript ES6+, Canvas 2D, Web Audio API, LocalStorage.

Keine externen Dateien und keine externen Abhängigkeiten.

Implementiere eine stabile Game Loop mit requestAnimationFrame und zeitbasierter Bewegung. Die Spielphysik darf nicht allein von der Bildrate abhängen.

Trenne den Code innerhalb der HTML-Datei logisch in Klassen und Module beziehungsweise klar abgegrenzte Abschnitte: Game Engine, Input Manager, Renderer, Camera, World Generator, Collision System, Player, Weapon System, Zombie AI, Loot System, Inventory, Mission System, Extraction System, Base System, Economy, Save System, Audio Manager, UI Manager.

Achte auf effiziente Kollisionsabfragen, begrenzte Partikelmengen und ein angemessenes Gegnerlimit.

Das Spiel soll auch auf normalen PCs und möglichst auf mobilen Browsern flüssig laufen.

Vermeide globale Variablen, die unkontrolliert überschrieben werden, sowie unendliche Schleifen und Speicherlecks.

## 16. Verbindliche Entwicklungsstrategie

Phase 1 Grundgerüst · Phase 2 Kampf · Phase 3 Welt · Phase 4 Extraction · Phase 5 Inventar · Phase 6 Basis · Phase 7 Fortschritt · Phase 8 Atmosphäre · Phase 9 Testen · Phase 10 Finalisierung.

## 17. Verbindliche Qualitätskontrolle

Teste mindestens folgende Fälle:

1. Spiel startet ohne JavaScript-Fehler.
2. Spieler kann sich in alle Richtungen bewegen.
3. Kollisionen verhindern das Durchlaufen von Wänden.
4. Zielen und Schießen funktionieren.
5. Munition wird verbraucht.
6. Nachladen funktioniert.
7. Zombies entdecken und verfolgen den Spieler.
8. Zombies können Schaden verursachen und besiegt werden.
9. Loot kann aufgenommen und im Inventar angezeigt werden.
10. Ein volles Inventar verhindert zusätzliche Aufnahme.
11. Missionen besitzen gültige Ziele.
12. Extraktionspunkte können erreicht und aktiviert werden.
13. Erfolgreiche Extraktion sichert die korrekte Beute.
14. Tod wendet die Verlustregeln korrekt an.
15. Basislager und Händler funktionieren.
16. Gegenstände können gekauft, verkauft und gelagert werden.
17. Fortschritt bleibt nach einem Neuladen erhalten.
18. Menüs und Einstellungen funktionieren.
19. Die mobile Steuerung ist benutzbar.
20. Es existieren keine offensichtlichen Blocker, unendlichen Schleifen oder dauerhaft unbedienbaren Situationen.

Führe nach Möglichkeit automatisierte Tests aus. Behaupte nicht, einen Test durchgeführt zu haben, wenn du ihn nicht tatsächlich ausgeführt hast.

## 18. Finale Ausgabe

`index.html` im Projektordner, komplett und ohne zusätzliche Dateien lauffähig. Weitere Dateien für Tests, Dokumentation oder Entwicklung dürfen zusätzlich existieren, aber das finale Spiel darf nicht von ihnen abhängen.

Am Ende: HTML auf Syntaxfehler prüfen, JavaScript-Konsole prüfen, Spiel im Browser starten, zentrale Spielmechaniken testen, Fehler beheben, Übersicht der tatsächlich implementierten Funktionen geben, exakten Pfad zur fertigen index.html nennen.
