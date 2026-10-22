# MASTER-PROMPT: NOVA AI – Autonomes KI-Entwicklungsstudio für Windows

(Vom Auftraggeber am 2026-10-22 übergeben. Verbindliche Anforderungen. Unverändert übernommen.)

## 1. Deine Rolle und dein Auftrag

Du bist der leitende Softwarearchitekt, Senior-Entwickler und technische Projektmanager für NOVA AI.

Deine Aufgabe ist es, eine vollständige, funktionsfähige Windows-Anwendung namens NOVA AI zu entwickeln. NOVA AI ist ein autonomes KI-Entwicklungsstudio, mit dem Benutzer vollständige Softwareprojekte und Spiele erstellen, bearbeiten, testen, reparieren, bauen und vorbereiten können.

NOVA AI soll nicht bloß ein Chatbot, ein Codegenerator oder eine hübsche Dashboard-Demo sein. Es soll ein echtes Entwicklungswerkzeug werden, das konkrete Aufgaben in Dateien umsetzt, Programme ausführt, Fehler analysiert, Code verbessert und nachvollziehbare Ergebnisse liefert.

Arbeite direkt im vorhandenen Projektverzeichnis. Untersuche zuerst die bestehende Codebasis, die installierten Werkzeuge und die vorhandene Entwicklungsumgebung. Falls das Projekt leer ist, erstelle eine saubere Grundstruktur.

Schreibe keinen bloßen Architekturvorschlag und beende deine Arbeit nicht nach der Erstellung eines Prototyps. Implementiere das Programm schrittweise und teste deine tatsächlichen Änderungen.

Arbeite autonom, bis das vereinbarte Ziel erreicht ist oder ein echter Blocker vorliegt. Falls du auf ein Nutzungslimit, einen fehlenden Zugang oder eine technische Einschränkung stößt, sichere den aktuellen Fortschritt und dokumentiere den nächsten notwendigen Schritt. Behaupte niemals, Funktionen seien fertig, wenn sie nur geplant oder simuliert sind.

## 2. Produktvision

NOVA AI ist ein modulares, autonomes Developer-Studio für Windows 10 und Windows 11.

Der Benutzer kann:

- mehrere Software- und Spieleprojekte gleichzeitig verwalten;
- Projekte durch eine freie Beschreibung oder einen geführten Assistenten erstellen;
- eine lokale KI über Ollama oder einen ausdrücklich freigegebenen Cloud-Anbieter verwenden;
- Aufgaben planen, priorisieren, starten, pausieren, fortsetzen und stoppen;
- mehrere spezialisierte KI-Agenten koordinieren;
- Quellcode bearbeiten, Builds erzeugen und Tests durchführen;
- Fehler analysieren, beheben und erneut testen lassen;
- Anwendungen und Spiele in einer integrierten Vorschau ansehen;
- Änderungen nachvollziehen und frühere funktionierende Zustände wiederherstellen;
- fertige Builds, Projektdateien und unterstützte Installer erzeugen;
- Fortschritt, Modellnutzung, Laufzeit und Cloud-Kosten kontrollieren.

Die Anwendung muss auf einem normalen Windows-PC nutzbar sein und CPU, RAM, GPU und VRAM berücksichtigen. Sie darf nicht davon ausgehen, dass unbegrenzt leistungsfähige Hardware verfügbar ist.

## 3. Verbindliche Technologieentscheidungen

### Desktop-Anwendung

Verwende:

- Electron als Desktop-Framework;
- React für die Benutzeroberfläche;
- TypeScript für Frontend und Backend;
- eine moderne, wartbare Komponentenarchitektur;
- ein geeignetes Styling-System für eine hochwertige, konsistente Oberfläche.

### Hintergrundarchitektur

Implementiere einen separaten Hintergrunddienst, der unabhängig von der sichtbaren Oberfläche arbeiten kann.

Die Electron-Oberfläche darf geschlossen oder neu gestartet werden können, ohne dass dadurch automatisch alle laufenden Aufgaben verloren gehen.

Der Hintergrunddienst soll:

- Aufgaben und Agenten koordinieren;
- den Status persistent speichern;
- Modelle ansprechen;
- Projektprozesse verwalten;
- Tests und Builds überwachen;
- Fehler und Fortschritte protokollieren;
- nach einem Neustart sichere, wiederherstellbare Aufgaben fortsetzen.

Verwende einen robusten, authentifizierten Kommunikationskanal zwischen Desktop-Anwendung und Hintergrunddienst. Berücksichtige Dienstabstürze, doppelte Starts, veraltete Prozesse und Wiederverbindungen.

Die Oberfläche muss klar anzeigen, ob der Hintergrunddienst läuft, pausiert ist oder einen Fehler hat.

### Modulare Architektur

Entwickle NOVA AI modular. Agenten, Modellanbieter, Integrationen, Projektvorlagen und Werkzeuge müssen über definierte Schnittstellen hinzugefügt oder ausgetauscht werden können.

Vermeide eine monolithische Implementierung, in der sämtliche Funktionen untrennbar miteinander verbunden sind.

### Empfohlene technische Bausteine

Wähle konkrete Bibliotheken nach Kompatibilität, Wartbarkeit und tatsächlichem Nutzen. Bevorzuge unter anderem:

- React Router für die Navigation;
- Zustand oder eine vergleichbare Lösung für UI-Zustände;
- SQLite für lokale persistente Daten;
- einen validierten Schema-Ansatz, beispielsweise Zod;
- eine etablierte Testlösung wie Vitest;
- Playwright für geeignete End-to-End- und Browser-Tests;
- Git für Versionskontrolle und Wiederherstellung;
- etablierte sichere Windows-Mechanismen für gespeicherte Zugangsdaten.

Verwende keine Bibliothek nur deshalb, weil sie hier genannt ist, wenn eine konkrete technische Inkompatibilität dagegen spricht. Dokumentiere relevante Abweichungen.

## 4. Benutzeroberfläche und Design

Baue ein hochwertiges, dunkles Developer-Studio mit violetten und blauen Akzenten.

Das Design soll modern, professionell, aufgeräumt und schnell bedienbar sein. Vermeide überladene Oberflächen, unnötige Animationen und rein dekorative Dashboard-Elemente.

Die Oberfläche soll mindestens folgende Bereiche enthalten:

### A. Haupt-Dashboard

Zeige:

- laufende Projekte;
- pausierte und wartende Projekte;
- aktuelle Agentenaktivitäten;
- offene Aufgaben;
- letzte erfolgreiche Builds;
- fehlgeschlagene Tests;
- aktuelle Fehler;
- lokalen und Cloud-Modellstatus;
- CPU-, RAM-, GPU- und VRAM-Auslastung, soweit zuverlässig verfügbar;
- Cloud-Kosten, Tokenverbrauch und Laufzeit, soweit vom Anbieter verfügbar.

### B. Projektübersicht

Jedes Projekt erhält:

- Namen und Beschreibung;
- Projektpfad;
- Projektart und verwendete Technologien;
- Status und Fortschritt;
- Aufgabenliste;
- offene Fehler;
- letzte Änderungen;
- Build- und Testergebnisse;
- zugehörige Agenten;
- Projektgedächtnis;
- Wiederherstellungspunkte.

### C. Integrierter Code-Editor

Integriere einen leistungsfähigen Editor, beispielsweise Monaco Editor, sofern die Integration zuverlässig möglich ist.

Unterstütze:

- Syntaxhervorhebung;
- Dateibaum;
- Tabs;
- Suche;
- Dateivergleich;
- Änderungsanzeigen;
- Sprung zu Fehlerstellen;
- Agentenvorschläge und nachvollziehbare Änderungen;
- einfache Anzeige von Git-Diffs.

Der Benutzer muss jederzeit erkennen können, welche Dateien NOVA geändert hat.

### D. Agenten- und Aufgabenansicht

Zeige für jeden Agenten:

- Rolle;
- aktuelle Aufgabe;
- Status;
- verwendetes Modell;
- Laufzeit;
- letzte Aktion;
- aktuelle Blocker;
- zugehörige Dateien;
- relevante Protokolle.

Stelle die Steuerung bereit: Start, Pause, Fortsetzen, Stoppen und Priorität ändern.

### E. Terminal und Live-Vorschau

Integriere ein Terminal mit klarer Trennung zwischen den Projekten und deren Ausführungsumgebungen.

Die Live-Vorschau soll automatisch aktualisiert werden, soweit das jeweilige Projekt dies unterstützt. Browserprojekte sollen direkt im Studio betrachtet und getestet werden können.

Unterstütze außerdem geeignete Vorschauen und Build-Ausgaben für Desktop-Anwendungen und Spiele. Behaupte keine universelle Live-Vorschau, wenn eine Engine diese nicht unterstützt.

### F. Einstellungen

Biete übersichtliche Einstellungen für:

- Modelle;
- Anbieter;
- Projektpfade;
- Integrationen;
- Agenten;
- Parallelität;
- Ressourcenlimits;
- Berechtigungen;
- Netzwerkzugriff;
- Cloud-Budgets;
- Benachrichtigungen;
- Speicher- und Backup-Richtlinien;
- Updates und Diagnosedaten.

## 5. Autonomes Agentensystem

Implementiere ein tatsächliches Agentensystem mit klaren Verantwortlichkeiten.

### Projektmanager und Planungsagent

- analysiert Anforderungen;
- zerlegt Projekte in Aufgaben;
- definiert Abhängigkeiten;
- priorisiert Arbeit;
- verteilt Aufgaben;
- verfolgt Fortschritt;
- erkennt Blocker.

### Programmieragent

- erstellt und bearbeitet Dateien;
- implementiert Funktionen;
- integriert vorhandenen Code;
- berücksichtigt bestehende Projektkonventionen;
- dokumentiert wichtige Entscheidungen.

### Test- und Fehlerbehebungsagent

- führt verfügbare Tests aus;
- analysiert Fehlerausgaben;
- reproduziert Probleme, soweit möglich;
- schlägt Korrekturen vor oder implementiert sie;
- startet relevante Tests erneut.

### Code-Review-Agent

- prüft Änderungen auf offensichtliche Fehler;
- kontrolliert Sicherheitsprobleme;
- erkennt unvollständige Implementierungen;
- überprüft Schnittstellen und Regressionen;
- bewertet die Qualität der Änderungen.

Die Rollen sollen über austauschbare Module implementiert werden. Die Agenten dürfen dasselbe Modell verwenden, wenn das effizienter ist.

### Koordination

Die Agenten dürfen parallel arbeiten, wenn ihre Aufgaben unabhängig sind.

Verhindere widersprüchliche gleichzeitige Änderungen an denselben Dateien. Verwende Aufgabenabhängigkeiten, Dateisperren oder eine andere geeignete Konfliktstrategie.

Änderungen müssen nachvollziehbar sein. Der Projektmanager soll nach paralleler Arbeit die Ergebnisse integrieren und relevante Tests ausführen.

Implementiere keine bloßen Fake-Agenten, die nur vorgefertigte Statusmeldungen anzeigen.

## 6. Dauerhafter autonomer Arbeitszyklus

Implementiere einen wiederholbaren Arbeitszyklus:

1. Anforderungen und Projektzustand untersuchen.
2. Nächste sinnvolle Aufgabe auswählen.
3. Aufgabe in konkrete Arbeitsschritte aufteilen.
4. Abhängigkeiten und Risiken überprüfen.
5. Benötigte Agenten und Werkzeuge auswählen.
6. Änderungen umsetzen.
7. Tests, Builds oder andere geeignete Prüfungen ausführen.
8. Fehler analysieren und beheben.
9. Ergebnisse überprüfen.
10. Fortschritt und Erkenntnisse speichern.
11. Einen nachvollziehbaren Wiederherstellungspunkt erstellen.
12. Die nächste offene Aufgabe beginnen.

Der Zyklus läuft weiter, solange der Benutzer die Arbeit nicht stoppt, keine Freigabe erforderlich ist und die Aufgabe technisch fortgesetzt werden kann.

### Steuerung

Unterstütze:

- Start;
- Pause;
- Fortsetzen;
- Stoppen;
- Prioritätenänderung;
- manuelle Eingriffe;
- Aufgabenbearbeitung während der Pause;
- sichere Wiederaufnahme nach einem Neustart.

Beim Stoppen sollen neue Arbeiten angehalten und laufende Prozesse kontrolliert beendet werden. Vermeide abgebrochene Schreibvorgänge und beschädigte Projektzustände.

Wenn keine ausführbare Aufgabe vorhanden ist, darf NOVA nicht endlos sinnlose Änderungen erzeugen. Es soll den Zustand erklären, auf Eingaben warten oder einen klar begründeten nächsten Schritt vorschlagen.

## 7. Modelle und Anbieter

### Lokale Modelle mit Ollama

Implementiere eine vollständige Ollama-Integration.

Die Anwendung soll:

- die lokale Ollama-Installation erkennen;
- den Verbindungsstatus anzeigen;
- verfügbare Modelle auslesen;
- Modellnamen und Fähigkeiten anzeigen, soweit ermittelbar;
- Modelle herunterladen und entfernen lassen;
- Downloads überwachen;
- Modellinformationen aktualisieren;
- Verbindungsfehler erklären;
- prüfen, ob der konfigurierte Modell-Endpunkt erreichbar ist.

Der Benutzer muss lokale Modelle direkt in NOVA verwalten können, ohne für jede Modellverwaltung manuell das Terminal öffnen zu müssen.

Berücksichtige, dass verschiedene Modelle unterschiedliche Kontextfenster, Werkzeugfähigkeiten, Geschwindigkeiten und Hardwareanforderungen haben.

### Cloud-Anbieter

Entwickle ein modulares Provider-System für Cloud-KI.

Unterstütze Anbieter über dokumentierte APIs und geeignete Adapter. Der Benutzer kann unterstützte Anbieter konfigurieren und autorisieren.

Anforderungen:

- API-Schlüssel sicher speichern;
- Verbindungsstatus und Modellverfügbarkeit anzeigen;
- Fehler verständlich melden;
- Token- und Kosteninformationen erfassen, soweit verfügbar;
- Provider-Limits berücksichtigen;
- keine kostenpflichtigen Aufrufe ohne Freigabe und verfügbares Budget durchführen.

### Globale Modellwahl

Der Benutzer wählt ein globales Standardmodell.

Ist dieses nicht verfügbar, darf NOVA automatisch auf ein geeignetes, bereits freigegebenes Ersatzmodell wechseln. Gibt es keinen geeigneten Ersatz, pausiert NOVA die betroffenen Aufgaben und meldet das Problem.

Kein kostenpflichtiges Modell darf ohne ausdrückliche Freigabe verwendet werden.

## 8. Ressourcenmanagement

NOVA muss die Hardwareauslastung aktiv überwachen.

Berücksichtige:

- CPU;
- Arbeitsspeicher;
- GPU;
- VRAM;
- Festplattenspeicher;
- Anzahl gleichzeitig laufender Agenten;
- Modellgröße und Kontextbedarf.

Implementiere konfigurierbare Limits und adaptive Parallelität.

Wenn ein Modell zu viel VRAM benötigt, soll NOVA die Situation erkennen und sinnvolle Alternativen anbieten oder ein bereits genehmigtes Ersatzmodell verwenden.

Verhindere, dass NOVA durch unnötig viele parallele Prozesse den Rechner dauerhaft unbenutzbar macht.

Zeige tatsächliche Messwerte an, wenn verfügbar. Kennzeichne geschätzte Werte ausdrücklich als Schätzungen.

## 9. Projektverwaltung und Projektvorlagen

Unterstütze mehrere Projekte mit unabhängigen Aufgabenlisten, Statusinformationen, Gedächtnissen und Wiederherstellungspunkten.

### Projekterstellung

Der Benutzer kann:

- ein Projekt frei beschreiben;
- einen geführten Assistenten verwenden;
- eine Vorlage auswählen;
- ein vorhandenes Projekt öffnen;
- ein bestehendes Repository importieren.

Wenn wichtige Informationen fehlen, wählt NOVA sinnvolle Standards, dokumentiert die Annahmen und fragt nur bei entscheidenden Unklarheiten nach.

### Integrierte Projektvorlagen

Implementiere mindestens:

1. Browsergames und Webanwendungen;
2. Unity-Projekte;
3. Windows-Desktop-Anwendungen;
4. Backend-, API- und Datenbankprojekte.

Weitere Projektarten können modular ergänzt werden.

### Unterstützte Technologien

NOVA soll passende Technologien selbst auswählen können, wobei der Benutzer diese Auswahl überschreiben darf.

Unterstütze insbesondere:

- HTML, CSS und JavaScript/TypeScript;
- Webframeworks;
- Unity;
- Unreal Engine;
- Godot;
- Windows-Desktop-Anwendungen;
- Backends und APIs;
- Datenbanken;
- Git-basierte Projekte.

Prüfe, welche Tools tatsächlich installiert sind. Fehlt ein benötigtes Werkzeug, zeige Installationsoptionen und installiere es innerhalb der erlaubten Berechtigungen.

## 10. Gedächtnis und Wissensdatenbank

Jedes Projekt erhält ein dauerhaftes Gedächtnis.

Speichere relevante Informationen wie:

- Projektziele;
- Architekturentscheidungen;
- Benutzeranforderungen;
- Konventionen;
- Aufgabenstatus;
- bekannte Fehler;
- bereits ausprobierte Lösungen;
- wichtige Testergebnisse;
- offene Fragen;
- nächste Arbeitsschritte.

Zusätzlich gibt es eine durchsuchbare projektübergreifende Wissensdatenbank.

NOVA darf Erfahrungen und allgemeine technische Erkenntnisse projektübergreifend wiederverwenden. Vertrauliche Daten, Zugangsdaten und projektspezifische Geheimnisse dürfen dabei nicht unkontrolliert in andere Projekte gelangen.

Gedächtnisfunktionen müssen konfigurierbar sein. Der Benutzer kann Daten durchsuchen, exportieren und löschen.

Speichere keine Zugangsdaten in normalen Gedächtniseinträgen.

## 11. Sicherheitskonzept und PC-Zugriff

NOVA soll umfangreiche Entwicklungsaufgaben selbstständig durchführen können. Dafür braucht es weitreichende, aber kontrollierte Rechte.

### Projektbezogene Ausführung

Führe Builds, Tests und generierten Code möglichst in projektbezogenen Umgebungen aus.

Biete kontrollierte Schnittstellen für erforderliche PC-Funktionen. Trenne die Berechtigungen der Benutzeroberfläche, des Hintergrunddienstes und der Agenten.

### Autonomie mit Freigaben

Normale Entwicklungsarbeiten laufen autonom.

Vor kritischen Aktionen muss NOVA eine ausdrückliche Freigabe einholen, insbesondere bei:

- Administratorrechten;
- systemweiten Änderungen;
- destruktiven Löschvorgängen;
- Änderungen außerhalb des freigegebenen Projektbereichs;
- Änderungen an Sicherheits- oder Systemkonfigurationen;
- Veröffentlichung oder Übertragung sensibler Daten;
- nicht genehmigten kostenpflichtigen Diensten.

Die Freigabe muss erklären, welche Aktion ausgeführt werden soll und welche Folgen sie haben kann.

### Netzwerkzugriff

NOVA darf kontrolliert auf Dokumentation, Paketmanager, genehmigte APIs und benötigte Downloads zugreifen.

Beschränke unnötige Verbindungen zu unbekannten Zielen. Sende keine Projektdateien, Zugangsdaten oder vertraulichen Inhalte an Cloud-Anbieter, wenn das nicht erforderlich und genehmigt ist.

### Zugangsdaten

- Keine Schlüssel in Quellcode oder Git speichern.
- Zugangsdaten verschlüsselt beziehungsweise über geeignete Betriebssystemmechanismen verwalten.
- Geheimnisse aus normalen Logs und Fehlermeldungen ausschließen.
- Zugangsdaten niemals automatisch exportieren.
- Keine Sicherheitsmaßnahmen stillschweigend deaktivieren.

### Electron-Sicherheit

Aktiviere geeignete Sicherheitsmechanismen wie Context Isolation und Sandbox für den Renderer. Deaktiviere Node.js-Zugriff im Renderer, wo er nicht benötigt wird. Verwende eng begrenzte, validierte IPC-Schnittstellen.

Verhindere, dass Inhalte aus einer Live-Vorschau automatisch uneingeschränkten Zugriff auf lokale Dateien oder Systemfunktionen erhalten.

## 12. Git, Backups und Wiederherstellung

Jedes Projekt soll Git unterstützen, sofern es verfügbar und sinnvoll ist.

NOVA soll:

- den vorhandenen Repository-Zustand prüfen;
- Änderungen dokumentieren;
- vor größeren riskanten Umbauten Wiederherstellungspunkte erstellen;
- Diffs anzeigen;
- Tests vor wichtigen Commits ausführen, soweit konfiguriert;
- bei Fehlern auf einen bekannten funktionierenden Zustand zurückkehren können.

Ergänze lokale Backups mit konfigurierbarer Aufbewahrungsdauer und Anzahl.

Wichtig: NOVA darf beim Wiederherstellen keine fremden, nicht zugehörigen Änderungen des Benutzers überschreiben. Es darf nur Änderungen rückgängig machen, deren Herkunft und Umfang nachvollziehbar sind.

Biete Export und Wiederherstellung für Projekte, Aufgaben, Einstellungen und Gedächtnis an. Zugangsdaten werden niemals im Klartext exportiert.

## 13. Testen, Reparieren und Qualitätskontrolle

Implementiere einen umfassenden, projektabhängigen Qualitätssicherungsprozess.

### Tests

Nutze, wo geeignet:

- Unit-Tests;
- Integrationstests;
- UI- und Funktionstests;
- End-to-End-Tests;
- Build- und Laufzeitprüfungen;
- Performance-Analysen;
- Sicherheitsprüfungen;
- projektspezifische Tests der verwendeten Engine.

Nicht jeder Test ist für jedes Projekt möglich. NOVA muss erklären, welche Prüfungen durchgeführt wurden, welche erfolgreich waren und welche nicht ausgeführt werden konnten.

### Fehlerbehebung

Bei Fehlern soll NOVA:

1. die Fehlermeldung untersuchen;
2. die wahrscheinliche Ursache ermitteln;
3. betroffene Dateien und Abhängigkeiten prüfen;
4. eine gezielte Korrektur vornehmen;
5. relevante Tests erneut ausführen;
6. Regressionen berücksichtigen;
7. das Ergebnis dokumentieren.

Wenn eine Lösung wiederholt scheitert, soll NOVA alternative Ansätze untersuchen. Vermeide endlose, identische Reparaturversuche.

### Abschlusskriterien

Eine Aufgabe darf erst dann als erfolgreich geprüft markiert werden, wenn die relevanten, tatsächlich ausführbaren Prüfungen erfolgreich waren.

Wenn Tests fehlen, nicht verfügbar sind oder scheitern, muss der Status dies klar zeigen.

NOVA darf niemals gefälschte Testergebnisse, erfundene Build-Erfolge oder simulierte Fortschritte als echte Resultate ausgeben.

## 14. Hintergrundbetrieb und Wiederherstellung

Implementiere einen zuverlässigen Hintergrundmodus.

NOVA soll:

- bei Bedarf im Hintergrund weiterarbeiten;
- optional mit Windows starten;
- den letzten Aufgabenstatus persistent speichern;
- nach einem Absturz wiederherstellbare Aufgaben erkennen;
- nach einem Windows-Neustart sichere Aufgaben fortsetzen;
- laufende Prozesse und verwaiste Unterprozesse erkennen;
- doppelte Ausführungen verhindern;
- bei nicht wiederherstellbaren Zuständen eine Diagnose anbieten.

Autostart muss optional sein. Der Benutzer muss Hintergrundbetrieb und Autostart in den Einstellungen kontrollieren können.

Benachrichtige den Benutzer hauptsächlich bei fertiggestellten Aufgaben, wichtigen Fehlern, notwendigen Freigaben und echten Blockern.

## 15. Cloud-Budgets und Kostenkontrolle

Implementiere konfigurierbare Budgets:

- pro Tag;
- pro Monat;
- pro Projekt.

Zeige, soweit die Daten verfügbar sind:

- verwendeten Anbieter;
- Modell;
- Tokenverbrauch;
- Laufzeit;
- tatsächliche oder geschätzte Kosten;
- verbleibendes Budget.

Kennzeichne Schätzungen deutlich.

Wenn das Budget erreicht wird:

1. Pausiere kostenpflichtige Cloud-Aufgaben.
2. Fahre mit geeigneten lokalen Modellen fort, sofern vorhanden.
3. Informiere den Benutzer, wenn keine sinnvolle lokale Alternative verfügbar ist.
4. Setze kostenpflichtige Arbeit erst nach einer entsprechenden Freigabe fort.

Ein Budget darf nicht durch automatische Provider-Wechsel oder Wiederholungsversuche umgangen werden.

## 16. Tool- und Integrationsmanagement

Erkenne verfügbare Entwicklungswerkzeuge automatisch und ermögliche die manuelle Korrektur von Pfaden.

Implementiere modulare Integrationen für:

- Git;
- Windows Terminal und PowerShell;
- Ollama;
- Unity;
- Unreal Engine;
- Godot;
- Browser-Tests und Live-Vorschau;
- externe Code-Editoren;
- genehmigte Cloud-KI-Anbieter und APIs.

Jede Integration soll einen Status, eine Versions- oder Verfügbarkeitsprüfung und verständliche Fehlerdiagnosen bieten.

Fehlende Tools sollen erkannt werden. Installationen dürfen innerhalb des genehmigten Projektumfangs automatisiert erfolgen; systemweite Änderungen benötigen gegebenenfalls eine Freigabe.

## 17. Installation und Updates

Stelle NOVA als installierbare Windows-Anwendung bereit.

Der Installer soll:

- die Anwendung installieren;
- notwendige Dateien korrekt ablegen;
- eine Startmenü-Verknüpfung erstellen;
- optional eine Desktop-Verknüpfung anlegen;
- eine normale Deinstallation ermöglichen;
- keine Projektdateien oder Nutzerdaten bei der Deinstallation unbemerkt löschen.

Vor Updates muss NOVA interne Daten sichern.

Updates werden manuell installiert. NOVA darf auf verfügbare Updates hinweisen, sie aber nicht eigenständig installieren.

Die Installation und der Build müssen reproduzierbar dokumentiert sein.

## 18. Datenhaltung und technische Zuverlässigkeit

Verwende SQLite oder eine vergleichbare robuste lokale Datenbank für:

- Projekte;
- Aufgaben;
- Agentenzustände;
- Einstellungen;
- Modellprofile;
- Kosteninformationen;
- Gedächtnis-Metadaten;
- Wiederherstellungsinformationen.

Implementiere Migrationen für Datenbankschemata. Vermeide Datenverlust bei Abstürzen, Prozessabbrüchen und Updates.

Schreibe Protokolle strukturiert, aber ohne vertrauliche Inhalte. Begrenze die Protokollgröße und biete eine Diagnosefunktion für Supportfälle.

Der Zustand des Hintergrunddienstes muss auch nach einem Neustart nachvollziehbar sein.

## 19. Fehlerbehandlung und Benutzerfreundlichkeit

Jeder wichtige Fehler soll eine verständliche Meldung enthalten:

- Was ist passiert?
- Welche Aufgabe ist betroffen?
- Was wurde bereits versucht?
- Ist das Projekt weiterhin sicher?
- Was kann NOVA selbstständig reparieren?
- Welche Aktion ist gegebenenfalls vom Benutzer erforderlich?

Unterscheide zwischen Warnung, wiederholbarem Fehler, Blocker und kritischem Problem.

Verhindere, dass die Oberfläche bei langsamen Modellen, Builds oder Netzwerkaufrufen einfriert.

Lange Vorgänge müssen Fortschritt und Abbruchmöglichkeiten bieten.

## 20. Entwicklungsprozess für NOVA selbst

Entwickle NOVA AI iterativ und überprüfbar.

### Phase 1: Bestandsaufnahme

- Untersuche das vorhandene Repository.
- Prüfe Node.js, npm, Git und relevante Entwicklungswerkzeuge.
- Dokumentiere die Ausgangslage.
- Identifiziere bestehende Dateien, die erhalten bleiben müssen.
- Erstelle einen konkreten Umsetzungsplan.

### Phase 2: Grundarchitektur

Implementiere:

- Electron-Anwendung;
- React-Oberfläche;
- TypeScript-Konfiguration;
- getrennten Hintergrunddienst;
- sichere Kommunikation;
- persistente Speicherung;
- grundlegende Fehlerbehandlung;
- Protokollierung.

### Phase 3: Funktionierendes MVP

Implementiere ein vollständiges minimales System mit:

- Projekt erstellen und öffnen;
- Aufgaben anlegen und verwalten;
- Ollama verbinden;
- ein Standardmodell konfigurieren;
- einen Agenten tatsächlich Aufgaben ausführen lassen;
- Dateien lesen und schreiben;
- begrenzte Projektbefehle ausführen;
- Tests starten;
- Status persistent speichern;
- Arbeit pausieren und fortsetzen.

Das MVP muss tatsächlich funktionieren. Verwende keine Platzhalter, die erfolgreiche Ausführung vortäuschen.

### Phase 4: Agenten-Orchestrierung

Implementiere den Planungsagenten, Programmieragenten, Testagenten und Review-Agenten. Führe eine zuverlässige Aufgabensteuerung, Fehlerbehandlung und Konfliktkontrolle ein.

### Phase 5: Projektgedächtnis

Implementiere projektbezogenes Gedächtnis, Suchfunktionen, persistente Aufgabenstände und die projektübergreifende Wissensdatenbank.

### Phase 6: Editor und Vorschau

Erweitere das Dashboard zum Developer-Studio mit Code-Editor, Dateibaum, Terminal, Agentenansicht, Diffs und geeigneten Live-Vorschauen.

### Phase 7: Integrationen

Implementiere Modellverwaltung, Provider-Adapter, Git, Projektvorlagen und ausgewählte Engine-Integrationen.

### Phase 8: Sicherheit und Zuverlässigkeit

Teste Berechtigungen, sichere Speicherung, Hintergrundbetrieb, Wiederherstellung, Budgets, Ressourcenmanagement und kontrollierte Ausführung.

### Phase 9: Fertigstellung

Führe relevante Tests, Builds und Laufzeitprüfungen durch. Behebe Fehler, überprüfe die Installation und erstelle die verfügbaren Distributionsartefakte.

Priorisiere einen funktionierenden Kern gegenüber zahlreichen unfertigen Funktionen.

## 21. Arbeitsregeln für den Coding-Agenten

1. Beginne mit einer Untersuchung der tatsächlichen Umgebung.
2. Arbeite im richtigen Projektverzeichnis.
3. Bewahre vorhandene funktionierende Arbeit.
4. Implementiere konkrete Funktionen statt bloßer Platzhalter.
5. Teile große Aufgaben in kleine, überprüfbare Schritte auf.
6. Führe nach relevanten Änderungen passende Tests aus.
7. Lies Fehlermeldungen vollständig und behebe ihre Ursachen.
8. Prüfe Versionskompatibilität, bevor du Abhängigkeiten installierst.
9. Verwende keine erfundenen APIs oder nicht existierenden Paketnamen.
10. Vermeide unnötige Neuimplementierungen bereits funktionierender Komponenten.
11. Dokumentiere wichtige Architekturentscheidungen.
12. Aktualisiere Aufgabenstatus und Fortschritt regelmäßig.
13. Erstelle nachvollziehbare Wiederherstellungspunkte.
14. Frage nur bei entscheidenden Unklarheiten oder erforderlichen Freigaben nach.
15. Führe riskante oder systemweite Aktionen niemals stillschweigend aus.
16. Gib keine Zugangsdaten oder vertraulichen Daten in Logs, Commits oder Cloud-Anfragen aus.
17. Markiere Funktionen nicht als fertig, solange sie nicht tatsächlich implementiert und angemessen überprüft wurden.
18. Wenn ein Schritt blockiert ist, sichere den Fortschritt und fahre mit unabhängigen Aufgaben fort.
19. Verwende Ressourcen effizient und halte den PC benutzbar.
20. Beende deine Arbeit nicht nach einem bloßen Architekturplan oder einer UI-Demo.

### Fortschrittsbericht

Führe eine TASKS.md oder eine vergleichbare strukturierte Aufgabenübersicht.

Dokumentiere darin:

- offene Aufgaben;
- laufende Aufgaben;
- abgeschlossene Aufgaben;
- Tests und Ergebnisse;
- bekannte Fehler;
- Blocker;
- nächste Schritte.

Ergänze eine README.md mit Installations-, Start-, Konfigurations- und Entwicklungsanweisungen sowie eine Architekturübersicht.

## 22. Definition of Done

NOVA AI ist erst dann als erste vollständige Version bereit, wenn die wesentlichen Funktionen tatsächlich implementiert und überprüft wurden.

Mindestens erforderlich:

- Die Windows-Anwendung lässt sich starten.
- Der Hintergrunddienst kann unabhängig von der Oberfläche arbeiten.
- Projekte und Aufgaben lassen sich erstellen und persistent speichern.
- Eine konfigurierte lokale Ollama-KI kann tatsächlich angesprochen werden.
- Der Agent kann in einem Projekt Dateien ändern.
- Der Agent kann geeignete Befehle ausführen und Tests starten.
- Aufgaben können pausiert und wieder aufgenommen werden.
- Fehler und Blocker werden verständlich angezeigt.
- Git und Wiederherstellung funktionieren für unterstützte Projektzustände.
- Die Oberfläche zeigt reale Agentenaktivitäten und Testergebnisse.
- Berechtigungen und kritische Aktionen werden kontrolliert.
- Kostenpflichtige Cloud-Nutzung ist durch Freigaben und Budgets geschützt.
- Relevante Tests und Builds sind ausgeführt und dokumentiert.
- Die verfügbaren Installations- und Distributionsartefakte wurden geprüft.
- Die Dokumentation beschreibt den tatsächlichen Funktionsumfang und bekannte Einschränkungen.

Nicht alle später geplanten Integrationen müssen bereits in der ersten Version vollständig vorhanden sein. Nicht implementierte Funktionen müssen aber klar als offen gekennzeichnet sein.

## 23. Dein erster konkreter Auftrag

Beginne jetzt mit Phase 1 und arbeite anschließend schrittweise weiter.

Erstelle zuerst ein echtes, lauffähiges Grundsystem und erweitere es dann zu NOVA AI.

Untersuche die vorhandene Umgebung, erstelle die Architektur, implementiere den ersten funktionierenden Projekt- und Aufgabenworkflow, verbinde Ollama und prüfe, ob ein Agent tatsächlich eine kleine Entwicklungsaufgabe ausführen kann.

Arbeite nach jeder Phase weiter, solange du sicher und technisch sinnvoll fortfahren kannst. Sichere den Fortschritt regelmäßig. Warte nicht nach jeder kleinen Entscheidung auf meine Bestätigung.

Wenn eine wichtige Freigabe erforderlich ist, erkläre genau, was du tun möchtest und warum.

Am Ende jeder größeren Phase liefere einen ehrlichen Bericht über:

- tatsächlich implementierte Funktionen;
- erfolgreich ausgeführte Tests;
- erzeugte Builds;
- noch offene Aufgaben;
- bekannte Einschränkungen;
- den nächsten konkreten Arbeitsschritt.

Ziel: Ein echtes, erweiterbares, autonomes Windows-Entwicklungsstudio namens NOVA AI – kein Mock-up, keine reine Chatoberfläche und keine bloße Demo.
