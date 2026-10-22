# Prüfbefunde der unabhängigen Code-Prüfung

Stand: 22.10.2026. Sechs unabhängige Prüfer haben den Code am 22.10.2026 durchgesehen (Bereiche R1–R6). Jeder Befund wurde
vom Prüfer am Code nachvollzogen, die meisten mit einem Wegwerf-Test. Die Behebung der offenen Befunde wurde auf Wunsch des
Auftraggebers angehalten; der ausgelieferte Stand entspricht Commit 54c221f (Windows-CI grün).

Offen: 0 kritisch, 7 hoch, 18 mittel, 21 niedrig.

## Übersicht

| ID | Schwere | Bereich | Befund | Status |
|---|---|---|---|---|
| R2-1 | hoch | Sicherheit Agenten-Befehle | Netzwerk-Freigabe für einen Host überdeckt die Befehls-/Taint-Prüfung; „Immer erlauben“ für einen Host erlaubt danach beliebige Befehlszeilen mit diesem Host | behoben |
| R3-1 | hoch | Datensicherheit | Wiederherstellung nach einer früheren Wiederherstellung spielt rückgängig gemachte NOVA-Änderungen wieder ein | offen |
| R3-2 | hoch | Datensicherheit | Benutzeränderungen aus externen Editoren während eines Agentenbefehls werden NOVA zugeschrieben – Wiederherstellung löscht/überschreibt sie, Auto-Commit committet sie | offen |
| R4-1 | hoch | Agenten und Modelle | Tester-Aufgabe wird 'Geprüft ✓', ohne dass die Tests je liefen (jede andere Prüfart genügt) | offen |
| R4-2 | hoch | Agenten und Modelle | Reines LLM-Review ohne jede echte Prüfung ergibt 'Geprüft ✓, alle Prüfungen bestanden' (inkl. leerem Diff / fehlgeschlagenem git_diff) | offen |
| R4-3 | hoch | Agenten und Modelle | Coder darf ohne jede Änderung sofort 'finish' melden – Aufgabe wird als erledigt und geprüft angezeigt | offen |
| R4-4 | hoch | Agenten und Modelle | Ollama-Aufrufe brechen nach 300 s hart ab (undici headersTimeout) – modelTimeoutSec wird stillschweigend ignoriert | offen |
| R6-1 | hoch | Windows/Installer | Installations- und Datenordner werden nicht getrennt: Update/Deinstallation löscht alles im Installationsordner (Datenbank, Sicherungen, Projekte) | offen |
| R1-1 | mittel | Sicherheit Oberfläche/Kommunikation | Freigabe-Texte: Unicode-Steuerzeichen (RLO/LRI/Zero-Width) werden ungefiltert angezeigt – Befehl/Pfad in der Freigabe lässt sich optisch fälschen | teilweise behoben (unsichtbare Zeichen in Befehlen werden gesperrt; Anzeige in Freigabekarten offen) |
| R2-2 | mittel | Sicherheit Agenten-Befehle | Standard-Allowlist erlaubt ohne Rückfrage Lesen/Schreiben außerhalb des Projekts und Auslesen von .env (git diff --no-index/--output, --prefix, --outDir, -o) | behoben |
| R3-3 | mittel | Datensicherheit | Fehlgeschlagene Datenbank-Wiederherstellung wird nach einem Fehlstart still verworfen (Benutzer glaubt, sie sei eingespielt) | offen |
| R3-4 | mittel | Datensicherheit | Nach einer Datenbank-Wiederherstellung werden Aufgaben, die zum Sicherungszeitpunkt liefen, mit veraltetem Agentenstand automatisch fortgesetzt | offen |
| R3-5 | mittel | Datensicherheit | Dateistände des Änderungsjournals werden praktisch nie gelöscht – Datenordner wächst unbegrenzt; Einstellung 'Ältere Dateiversionen behalten' wirkungslos | offen |
| R3-6 | mittel | Datensicherheit | Keine Wiederherstellung/Diagnose aus der App, wenn die Datenbank beschädigt ist und der Dienst nicht startet | offen |
| R3-7 | mittel | Datensicherheit | Wartung (Tagessicherung, Aufräumen, VACUUM) blockiert den Dienst direkt nach dem Start und alle 24 h vollständig | offen |
| R4-10 | mittel | Agenten und Modelle | VRAM-Prüfung zählt Speicher anderer geladener Ollama-Modelle als belegt – falsche VRAM_INSUFFICIENT-Blockaden bei mehreren Modellen | offen |
| R4-11 | mittel | Agenten und Modelle | Modell-Download prüft nur 1 GB freien Speicher statt der Modellgröße (9-GB-Download kann das Laufwerk füllen) | offen |
| R4-5 | mittel | Agenten und Modelle | Abgelehnte Cloud-Datenfreigabe: Aufgabe pendelt jede Minute zwischen blockiert und gestartet, mit neuer Windows-Benachrichtigung | offen |
| R4-6 | mittel | Agenten und Modelle | Kontextverwaltung kann 16k-Ollama-Fenster nicht einhalten (geschützte letzte 6 Nachrichten, 16 000 Zeichen pro Werkzeugergebnis) | offen |
| R4-7 | mittel | Agenten und Modelle | Keine Wiederholungserkennung im Agentenlauf – identische Aufrufe verbrennen das ganze Schrittbudget, Meldung sagt 'Aufgabe zu groß' | offen |
| R4-8 | mittel | Agenten und Modelle | Parallele Aufgaben ohne geplante Dateien laufen im selben Projekt gleichzeitig – Prüfungen messen fremde Halbfertig-Änderungen | offen |
| R4-9 | mittel | Agenten und Modelle | Umgebungsfehler der Prüfung (Installation wartet auf Freigabe, Werkzeug fehlt, Unity offen) lösen Code-Reparaturversuche aus; Freigabe setzt nichts fort | offen |
| R5-1 | mittel | Oberfläche | Kosten › 'Budget pro Projekt' listet nur Projekte mit bezahlter Nutzung – Leerzustand behauptet 'Noch keine Projekte' (Integrator-Beobachtung 1) | offen |
| R5-2 | mittel | Oberfläche | Studio: ungespeicherte Editor-Änderungen gehen beim Beenden (Tray, Installer, Windows-Shutdown) ohne Rückfrage verloren (Integrator-Beobachtung 4) | offen |
| R5-3 | mittel | Oberfläche | Fehler aus Benutzeraktionen verlieren 'Was ist zu tun?', Schweregrad und Projekt-Sicherheit – Toast zeigt nur die Meldung | offen |
| R6-2 | mittel | Windows/Installer | Dienst-Stopp und Autostart-Entfernung hängen an .onInit/un.onInit: wirken schon vor der Bestätigung (Abbrechen hat Nebenwirkungen), und bei stiller Deinstallation tötet electron-builder den Dienst hart, bevor --stop-daemon läuft | offen |
| R6-3 | mittel | Windows/Installer | GPU-Abfrage startet dauerhaft alle 10 s powershell.exe (bzw. alle 3 s nvidia-smi) – auch im Leerlauf und bei geschlossener Oberfläche | offen |
| R1-2 | niedrig | Sicherheit Oberfläche/Kommunikation | Live-Vorschau: [::1]-Adressen werden von der CSP blockiert (ungültige Quelle), https-Loopback mit irreführendem Text abgelehnt | offen |
| R2-3 | niedrig | Sicherheit Agenten-Befehle | Taint-Regel greift nicht bei Aufrufen ohne Dateiendung (node evil, tools\run) – mit approveUnknownCommands=false laufen von NOVA geschriebene Skripte ohne Rückfrage | behoben |
| R2-4 | niedrig | Sicherheit Agenten-Befehle | Redaktion erkennt verbreitete Variablennamen wie *_PASS und PRIVATE_KEY= nicht (Logs, gespeicherte Ausgaben, Cloud-Prompts) | behoben |
| R3-10 | niedrig | Datensicherheit | Dateiänderungen eines Agentenbefehls gehen bei Absturz/erzwungenem Beenden verloren (Vorher-Stand nur im Speicher) | offen |
| R3-11 | niedrig | Datensicherheit | Ein einmaliger Wartungsfehler setzt den Dienststatus bis zum Neustart dauerhaft auf 'Fehler' | offen |
| R3-12 | niedrig | Datensicherheit | Kein Schutz bei Downgrade: neuere Datenbank-Schemaversion wird beim Start nicht abgelehnt | offen |
| R3-13 | niedrig | Datensicherheit | Veraltete-Sperre-Heuristik kann eine aktive index.lock des Benutzers löschen | offen |
| R3-14 | niedrig | Datensicherheit | Datenbank-Wiederherstellung: Dialog verspricht Anhalten laufender Aufgaben, Dienst lehnt aber ab | offen |
| R3-8 | niedrig | Datensicherheit | atomicWriteFile lässt bei vollem Datenträger eine halbe Temp-Datei im Projektordner zurück | offen |
| R3-9 | niedrig | Datensicherheit | Nicht-atomarer In-Place-Fallback: Abbruch hinterlässt halb geschriebene Datei, die NOVA dann nicht mehr zurücksetzt | offen |
| R4-12 | niedrig | Agenten und Modelle | 'Keine Tests gefunden' mit Exit-Code ≠ 0 (pytest 5, vitest/jest 1) gilt als fehlgeschlagen statt übersprungen | offen |
| R4-13 | niedrig | Agenten und Modelle | 'Fortsetzen' nach AGENT_STEP_LIMIT startet einen komplett neuen Lauf – Fortsetzungslogik im Runner ist toter Code | offen |
| R5-4 | niedrig | Oberfläche | RelativeTime zeigt 'gleich' (= demnächst) für gerade gemessene Zeitpunkte – Ressourcen-Karte und 'Zuletzt geprüft' sind dauerhaft falsch beschriftet | offen |
| R5-5 | niedrig | Oberfläche | Blocker-Aktion für PRICE_UNKNOWN / PAID_NOT_APPROVED führt zur Kosten-Seite, die Lösung liegt aber unter 'Modelle' | offen |
| R5-6 | niedrig | Oberfläche | Kosten-Seite aktualisiert Tokens, Laufzeit und Verbrauchstabellen bei lokaler Modellnutzung nicht | offen |
| R5-7 | niedrig | Oberfläche | Übersicht: Zahlen inkonsistent – 'Aktuelle Fehler' auf 20 gekappt, 'warten auf einen Platz' zählt alle wartenden Aufgaben, 'Offene Aufgaben' ≠ Filter 'Offen' | offen |
| R5-8 | niedrig | Oberfläche | Status-Wortwahl widersprüchlich: Projekt 'Arbeitet' (grün) erscheint auf der Übersicht unter 'Pausiert und wartend', 'Laufend (0)' (Integrator-Beobachtung 2 – Ursache) | offen |
| R6-4 | niedrig | Windows/Installer | where.exe-Ausgabe wird als UTF-8 gelesen, kommt aber in der OEM-Codepage: Pfade mit Umlauten (C:\Users\Jürgen\…) werden verstümmelt, Werkzeuge gelten als fehlend | offen |
| R6-5 | niedrig | Windows/Installer | Hängender Hintergrunddienst: Oberfläche bleibt endlos in „Getrennt – neuer Versuch …“, nie Fehlerzustand oder Diagnoseangebot | offen |
| R6-6 | niedrig | Windows/Installer | Beenden während der Dienst noch startet: daemon.shutdown wird nie gesendet, der Dienst läuft danach entgegen keepRunningWhenUiClosed=false kopflos weiter | offen |
| R6-7 | niedrig | Windows/Installer | „Mit Windows starten“ im Start ohne Installation (NOVA-STARTEN.cmd) nicht möglich, Meldung schickt den Nutzer fälschlich in die Windows-Einstellungen | offen |
| R6-8 | niedrig | Windows/Installer | README/TASKS für Einsteiger teils falsch: Node-Mindestversion, veraltete TASKS.md als 'ehrlicher Stand', unvollständige Anleitung 'alles entfernen' | offen |
| R6-9 | niedrig | Windows/Installer | Kein Schutz beim Start einer älteren Version gegen eine neuere Datenbank (Downgrade per älterer setup.exe) | offen |

## Einzelheiten der offenen Befunde

### R3-1 (hoch): Wiederherstellung nach einer früheren Wiederherstellung spielt rückgängig gemachte NOVA-Änderungen wieder ein

- Datei: `src/daemon/changes/journal.ts`, Zeile 702
- Fehlerbild: User undoes the last task (restore its pre_task checkpoint), then also wants to undo the task before it and restores the older pre_task checkpoint → instead of the old working state the project gets the content of the task that was just undone, plus a misleading conflict message blaming a user change. Clicking 'Wiederherstellen' twice on the same checkpoint toggles the project back to NOVA's changes.
- Lösungsvorschlag: Revert per file to the state at the cursor instead of replaying rows: for each path_key with NOVA rows id > afterId, require current == afterHash of the newest row (any NOVA source) and no actor='user' row in between, then write the beforeHash of the OLDEST row > afterId (or delete if it was a create) and mark all those rows reverted. Restore rows are then handled naturally (restoring the pre_restore checkpoint still undoes a restore). Add regression tests for 'restore twice' and 'step-wise restore'.

### R3-2 (hoch): Benutzeränderungen aus externen Editoren während eines Agentenbefehls werden NOVA zugeschrieben – Wiederherstellung löscht/überschreibt sie, Auto-Commit committet sie

- Datei: `src/daemon/changes/journal.ts`, Zeile 579
- Fehlerbild: Agent runs 'npm test' for two minutes; meanwhile the user creates docs/ideen.md and edits README.md (git-clean) in VS Code. Later the user restores the task's pre_task checkpoint: ideen.md is deleted from the project and README.md is reset to HEAD – the user's own work is gone from the folder (only an anonymous blob in %LOCALAPPDATA% remains), and NOVA claimed it only reverts its own changes. With autoCommit the user's edits were already committed under NOVA's name.
- Lösungsvorschlag: Treat command-recorded changes as 'origin uncertain': store a flag (e.g. source 'command' already) and have revert()/preview list them separately and skip them unless the user explicitly confirms per file; never auto-commit command-detected paths that are outside the task's plannedFiles / agent-tool files without confirmation; at minimum mark command creates/modifies made while the FileWatcher saw external saves as not revertible, and document the honest limit in the restore dialog.

### R4-1 (hoch): Tester-Aufgabe wird 'Geprüft ✓', ohne dass die Tests je liefen (jede andere Prüfart genügt)

- Datei: `src/daemon/tasks/work-cycle.ts`, Zeile 941
- Fehlerbild: A 7B tester model runs `run_checks {kind:'lint'}` (or 'build', 'runtime', 'typecheck'), then reports 'Alle Tests bestanden'. The test suite exists and is runnable but is never executed; the task is shown as 'Geprüft ✓ – Alle passenden Prüfungen waren erfolgreich', a 'task done – alle Prüfungen bestanden' toast is sent, the post_task checkpoint is marked verified and auto-committed. Same with a 'runtime' check that 'passes' merely because the process stayed alive 10 s.
- Lösungsvorschlag: In finishTester require a 'test' (or 'e2e') CheckRun of this run when project.config.commands.test exists; if the agent ran none, run checks.run(test) itself in addition to the agent's other kinds. Only treat other kinds as sufficient when no test command exists, and then never as 'passed' for a test task (use 'unavailable' plus the extra entries). Optionally tighten tester.checkFinish to require run_checks with kind test when a test command is configured.

### R4-2 (hoch): Reines LLM-Review ohne jede echte Prüfung ergibt 'Geprüft ✓, alle Prüfungen bestanden' (inkl. leerem Diff / fehlgeschlagenem git_diff)

- Datei: `src/daemon/tasks/verification.ts`, Zeile 119
- Fehlerbild: Unity project without detected Unity, Godot/Unreal project, 'empty' template, opened folder of unknown kind or any project without test/build command: every coder task ends as 'Geprüft ✓' after the same local model 'reviews' its own work. checkpoints.afterTask (checkpoint-service.ts:357) auto-commits it and marks the checkpoint verification='passed', so latestVerified() later recommends this unverified state as 'der letzte geprüfte Stand' in REPEATED_FAILURE / integration error reports.
- Lösungsvorschlag: Do not let a model verdict alone produce 'passed': compute the status from executed CheckRuns only (Review failed may still fail the verification, but Review passed with no passed CheckRun → 'unavailable', UI 'nicht geprüft (nur Review)'). Apply the same to planned review tasks (finishReviewTask). In reviewer.checkFinish count only successful git_diff/read_file results (track successful tool names separately from markUsed on errors), and change the blockedHint so an empty diff is not approved by default.

### R4-3 (hoch): Coder darf ohne jede Änderung sofort 'finish' melden – Aufgabe wird als erledigt und geprüft angezeigt

- Datei: `src/daemon/agents/roles/coder.ts`, Zeile 78
- Fehlerbild: Small local models frequently answer a coding task with an immediate finish call claiming success. In a project with an existing passing test suite (e.g. the web-game template), the task 'Highscore speichern' ends 'Erledigt – Geprüft ✓, alle Prüfungen bestanden' although no file was touched; with reviewChanges the same weak model sees 'Keine Änderungen' and (per its prompt) approves. The user believes the feature exists.
- Lösungsvorschlag: Add a coder checkFinish: for status 'done' on code/fix/build tasks require at least one successful write/edit/delete tool result (or run_command that changed files per the journal); otherwise answer the model 'You have not changed any file …' or require status 'blocked'/an explicit 'no change needed' flag. In the work cycle, mark a done coder task without changed files as verification 'unavailable' with a German note ('Keine Dateien geändert') instead of 'passed'.

### R4-4 (hoch): Ollama-Aufrufe brechen nach 300 s hart ab (undici headersTimeout) – modelTimeoutSec wird stillschweigend ignoriert

- Datei: `src/daemon/providers/http.ts`, Zeile 324
- Fehlerbild: A 14B model partly offloaded to CPU, a laptop GPU, a cold model load, or the second of the two default parallel agents waiting in Ollama's queue (OLLAMA_NUM_PARALLEL=1) behind the first: any step that needs > 5 min until the answer (e.g. a 4096-token write_file at < 14 tok/s) can never succeed. After ~20 min of retries the task fails with a misleading 'Verbindung unterbrochen' message; raising 'Zeitlimit für Modellaufrufe' in the settings has no effect. Same for local OpenAI-compatible servers (LM Studio).
- Lösungsvorschlag: Use streaming for Ollama /api/chat (stream:true, assemble NDJSON chunks; idle timeout via requestNdjson) or pass a custom fetch/dispatcher without headers/body timeouts (node:http request instead of fetch, since undici is not a separate dependency). Keep modelTimeoutSec as the only overall limit and add a test with a >300 s fake (fake timers or an injected dispatcher).

### R6-1 (hoch): Installations- und Datenordner werden nicht getrennt: Update/Deinstallation löscht alles im Installationsordner (Datenbank, Sicherungen, Projekte)

- Datei: `build/installer.nsh`, Zeile 1
- Fehlerbild: (a) Nutzer ändert beim Installieren den Ordner auf '...\AppData\Local' → App landet in '%LOCALAPPDATA%\NOVA AI' zusammen mit nova.db, backups\, snapshots\. Beim nächsten Update (neue setup.exe) verschiebt der alte Uninstaller nova.db und alle Sicherungen in den Temp-Ordner und löscht sie; NOVA startet danach leer, alle Projekte/Aufgaben/Kosten/Sicherungen sind weg. Bei Deinstallation dasselbe per RMDir /r. (b) Nutzer installiert nach 'C:\Users\X\NOVA AI' und legt dort (naheliegend) 'C:\Users\X\NOVA AI\Projekte\MeinSpiel' an → das nächste Update/die Deinstallation löscht alle Projektdateien ohne Rückfrage.
- Lösungsvorschlag: 1) build/installer.nsh: eigene !macro customRemoveFiles, die nur die bekannten App-Dateien entfernt (NOVA AI.exe, Uninstall NOVA AI.exe, resources\, locales\, *.dll, *.pak, *.bin, *.dat, LICENSE*, vk_swiftshader_icd.json …), oder zumindest abbrechen, wenn $INSTDIR fremde Dateien (nova.db, .git, daemon.token …) enthält. 2) Den Zielordner nach der Ordnerseite prüfen (customPageAfterChangeDir bzw. Leave-Funktion): $INSTDIR darf nicht '$LOCALAPPDATA\NOVA AI' sein und muss leer sein oder eine NOVA-Installation enthalten; sonst deutsche Meldung und zurück. 3) Daemon: in root-safety.ts dirname(process.execPath) (wenn gepackt) als verbotenen Ordner aufnehmen (gleich/innen/Vorfahre), und beim Start warnen/abbrechen, wenn dataDir == Installationsordner.

### R1-1 (mittel): Freigabe-Texte: Unicode-Steuerzeichen (RLO/LRI/Zero-Width) werden ungefiltert angezeigt – Befehl/Pfad in der Freigabe lässt sich optisch fälschen

- Datei: `src/renderer/src/components/common/ApprovalCard.tsx`, Zeile 100
- Fehlerbild: A prompt-injected model (instructions hidden in a README of an imported project) runs `copy build\out.txt "C:\Users\Max\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\report\u202Efdp.bat"`. The card shows the file as `…\Startup\report"tab.pdf`-like text (classic RLO extension spoof), the user believes a harmless PDF is copied and clicks „Einmal erlauben“ (or „Immer erlauben“) – a .bat lands in the Autostart folder. The kind badge still says „außerhalb des Projekts“, but the decisive detail (what file/extension, which path) is falsified, so the approval no longer 'erklärt, welche Aktion ausgeführt werden soll'. Same applies to file paths in delete/outside_project approvals and to any agent text shown in approvals.
- Lösungsvorschlag: 1) Renderer: in CodeBlock (at least for approvals, change lists, file paths) replace Unicode format/bidi/invisible characters (\p{Cf}, U+2028/2029) by visible markers such as ⟦U+202E⟧ and wrap the block in `unicode-bidi: isolate; direction: ltr`. 2) Daemon: treat \p{Cf} like control characters in CommandPolicy (never auto-allow; add an explicit German reason „Der Befehl enthält unsichtbare Steuerzeichen“) and in PathGuard input validation for agent paths; ApprovalService could store an escaped display copy of action/details.

### R3-3 (mittel): Fehlgeschlagene Datenbank-Wiederherstellung wird nach einem Fehlstart still verworfen (Benutzer glaubt, sie sei eingespielt)

- Datei: `src/daemon/app.ts`, Zeile 78
- Fehlerbild: User clicks 'Einspielen und neu starten'; the restart hits a locked file. The supervisor shows a generic start error once, the next start comes up with the current (not restored) data and the earlier toast 'Die Sicherung … wird eingespielt' was the last word – the user keeps working believing the old state was restored.
- Lösungsvorschlag: Copy the backup to nova.db.restore-tmp, fsync, then renameWithRetry over nova.db (after the safety copy); on failure keep a marker (e.g. restore-failed.json with the reason) instead of silently deleting it, and after the DB is open report errors.report(RESTORE_FAILED, …) or a success notification ('Sicherung vom … wurde eingespielt'). Retry transient EBUSY with renameWithRetry-style backoff.

### R3-4 (mittel): Nach einer Datenbank-Wiederherstellung werden Aufgaben, die zum Sicherungszeitpunkt liefen, mit veraltetem Agentenstand automatisch fortgesetzt

- Datei: `src/daemon/tasks/work-cycle.ts`, Zeile 2066
- Fehlerbild: User restores yesterday's backup because settings/tasks got messed up. After the restart a coder task that was mid-run yesterday resumes automatically, re-applies edits/commands from its old plan on top of today's files (edit_file mismatches, duplicate work, commands re-run), without any approval or hint.
- Lösungsvorschlag: When a restore was applied (restoredFrom != null), skip auto-resume: set every running/interrupted/waiting task to paused with blocker 'Nach Datenbank-Wiederherstellung – bitte prüfen' (or queue a fresh run), and show a notice that NOVA's file changes after the backup date are no longer tracked.

### R3-5 (mittel): Dateistände des Änderungsjournals werden praktisch nie gelöscht – Datenordner wächst unbegrenzt; Einstellung 'Ältere Dateiversionen behalten' wirkungslos

- Datei: `src/daemon/changes/journal.ts`, Zeile 781
- Fehlerbild: An agent iterating on a 1 MB file 100× per day for a few months leaves several GB in %LOCALAPPDATA%\NOVA AI\snapshots (and an ever-growing changes table) on a normal PC; eventually DISK_FULL blocks writes although the user set a 60-day retention.
- Lösungsvorschlag: Add ChangeJournal.prune(cutoff): delete committed change rows older than the oldest retained checkpoint cursor of their project (and older than snapshotRetentionDays), then prune blobs; run it in maintenance before pruneSnapshots. Show snapshot size in the backup settings.

### R3-6 (mittel): Keine Wiederherstellung/Diagnose aus der App, wenn die Datenbank beschädigt ist und der Dienst nicht startet

- Datei: `src/main/texts.ts`, Zeile 30
- Fehlerbild: After a power loss nova.db is corrupt ('database disk image is malformed'). The non-technical user sees a start error and a hint to a hidden AppData folder; NOVA offers no button to pick one of its own validated backups or to create a diagnostics bundle – the app is unusable until someone copies files by hand.
- Lösungsvorschlag: In Electron main, when the crash report suggests restore_backup, offer a dialog listing <dataDir>/backups/nova-*.db (newest first) and run '--restore-db <file>' (with validateDatabaseFile-equivalent checks: header, quick_check, schema_version ≤ latest) then restart; add a 'Diagnose erstellen' button that runs '--diagnostics-only' and opens the folder.

### R3-7 (mittel): Wartung (Tagessicherung, Aufräumen, VACUUM) blockiert den Dienst direkt nach dem Start und alle 24 h vollständig

- Datei: `src/daemon/app.ts`, Zeile 351
- Fehlerbild: On a PC used for some weeks (large agent_steps history, tens of thousands of snapshot blobs, Defender scanning) the first start of the day keeps /health, all RPCs and SSE unanswered for several seconds; the UI shows 'Startet'/'Getrennt' and every click hangs; the same freeze recurs every 24 h while agents run (their tool calls and timers stall too).
- Lösungsvorschlag: Start maintenance with setTimeout(…, 30 s) and insert real yields between steps (await new Promise(r => setImmediate(r))); make blob pruning incremental/async (fs.promises, batches) and run VACUUM only when idle (no active runs).

### R4-10 (mittel): VRAM-Prüfung zählt Speicher anderer geladener Ollama-Modelle als belegt – falsche VRAM_INSUFFICIENT-Blockaden bei mehreren Modellen

- Datei: `src/daemon/providers/ollama-service.ts`, Zeile 454
- Fehlerbild: 16 GB GPU, planner override = qwen2.5:14b, coder = qwen2.5-coder:7b, two parallel agents (default). While the 7B coder model is loaded (~6 GB incl. KV), the planner's 14B model computes ~13 GB required vs ~9 GB 'free' → 'Passt nicht in den Grafikspeicher' → planner task blocked with an error report although Ollama would simply swap the models. Also after the user used another model in Ollama within the last 5 min (keep_alive).
- Lösungsvorschlag: Add the VRAM of other loaded, idle Ollama models (snap.ollamaLoaded) to 'available' (Ollama unloads them), or treat fits===false as a warning when the shortfall is covered by evictable models; only hard-block when total VRAM is insufficient.

### R4-11 (mittel): Modell-Download prüft nur 1 GB freien Speicher statt der Modellgröße (9-GB-Download kann das Laufwerk füllen)

- Datei: `src/daemon/providers/ollama-service.ts`, Zeile 339
- Fehlerbild: C: has 5 GB free (models dir %USERPROFILE%\.ollama\models and NOVA's %APPDATA% data dir on the same drive). The user downloads qwen2.5-coder:14b (≈9 GB): the pull starts, Ollama fills the drive to 0 bytes and fails with 'no space left on device', keeping the partial blob. NOVA's SQLite/logs/journal and project writes on that drive now fail; the UI only showed 'Download fehlgeschlagen'.
- Lösungsvorschlag: When the first progress events report totals, check free space ≥ remaining bytes + minFreeDiskMb and cancel with a German DISK_FULL message otherwise; re-check periodically during the pull. Optionally show the model size (from the library/manifest) before starting.

### R4-5 (mittel): Abgelehnte Cloud-Datenfreigabe: Aufgabe pendelt jede Minute zwischen blockiert und gestartet, mit neuer Windows-Benachrichtigung

- Datei: `src/daemon/providers/model-client.ts`, Zeile 229
- Fehlerbild: User selects a cloud model (only model in the chain) and denies 'Projektdaten an … senden?' for a task. Every ~60 s (recheck timer, plus every approval/settings event) the task is re-queued, the run resumes, fails with NO_MODEL, is blocked again and a new toast 'Aufgabe blockiert – Es ist kein passendes Modell verfügbar' appears – overnight ~1 400 notifications, error-list churn and agent-step spam. The message also hides the real cause (the user's denial).
- Lösungsvorschlag: Make resolve()'s peek treat an unacknowledged denied approval for the project/subject as a rejection (or pass taskId from conditionGone/runner.resolveModel so the same check runs), give APPROVAL_DENIED its own blocker code/message (non-resumable or resumable only on approval/settings change), and dedupe notifyBlocked per task+code.

### R4-6 (mittel): Kontextverwaltung kann 16k-Ollama-Fenster nicht einhalten (geschützte letzte 6 Nachrichten, 16 000 Zeichen pro Werkzeugergebnis)

- Datei: `src/daemon/agents/runner.ts`, Zeile 815
- Fehlerbild: A 7B/14B model reads three medium-sized source files in a row (common at the start of a task). Ollama receives a prompt larger than num_ctx and silently truncates older messages (or shifts the context during generation); the model loses earlier tool results/instructions, repeats reads, or the JSON-protocol instructions drift out → bad output, loops, step limit.
- Lösungsvorschlag: Size the per-result cap from the window (e.g. ≤ 25 % of the window per tool result for small windows), allow compacting tool results inside the tail except the newest one, reserve maxOutputTokens explicitly (limit = window − maxOutputTokens − margin), and calibrate the estimate with the last reported prompt_eval_count/usage.inputTokens.

### R4-7 (mittel): Keine Wiederholungserkennung im Agentenlauf – identische Aufrufe verbrennen das ganze Schrittbudget, Meldung sagt 'Aufgabe zu groß'

- Datei: `src/daemon/agents/runner.ts`, Zeile 300
- Fehlerbild: A weak local model gets stuck re-reading the same file or retrying the same failing edit_file/locked file. With a 14B model at 30–90 s per step this wastes 20–60 min of GPU time per task, then tells the user the task is too big (wrong diagnosis) instead of 'das Modell wiederholt sich'.
- Lösungsvorschlag: Track a hash of (tool, normalized args, result) per run; after e.g. 3 identical consecutive calls send a corrective message ('you already did this, result was …'), after 5 stop with a dedicated code/message (AGENT_LOOP, 'Das Modell wiederholt dieselbe Aktion – ein anderes Modell könnte besser geeignet sein').

### R4-8 (mittel): Parallele Aufgaben ohne geplante Dateien laufen im selben Projekt gleichzeitig – Prüfungen messen fremde Halbfertig-Änderungen

- Datei: `src/daemon/tasks/work-cycle.ts`, Zeile 1346
- Fehlerbild: Task A finishes and runs `npm test` while task B has written half of a refactoring: A's verification fails with B's errors, A is re-run with B's failures as 'fix this' context (may even try to edit B's locked files) and can end in REPEATED_FAILURE; or A passes on a state that includes B's unverified changes and the checkpoint is marked verified.
- Lösungsvorschlag: Treat tasks with unknown file sets as conflicting with every other running task of the same project (or allow parallelism per project only for tasks with disjoint, non-empty plannedFiles), and/or serialize the verification phase per project while no other run of that project is in its agent phase.

### R4-9 (mittel): Umgebungsfehler der Prüfung (Installation wartet auf Freigabe, Werkzeug fehlt, Unity offen) lösen Code-Reparaturversuche aus; Freigabe setzt nichts fort

- Datei: `src/daemon/checks/check-service.ts`, Zeile 302
- Fehlerbild: User turns off 'Netzwerkzugriff für Agenten'. The coder adds a dependency; verification needs `npm install` → approval pending → 'Tests: konnte nicht ausgeführt werden'. NOVA spends 2–3 more coder runs (local GPU time or paid cloud tokens) trying to 'fix' code, then blocks/fails with 'Derselbe Fehler ist 3-mal aufgetreten' or 'Die Prüfungen sind auch nach 3 Versuchen fehlgeschlagen' – while the actual action needed is approving the install.
- Lösungsvorschlag: Classify check errors: approval pending → task waiting_approval (store the approvalId in the continuation and re-run the verification phase on decision); tool missing → blocked TOOL_MISSING; Unity open/project folder missing → blocked with user action. Only real failed CheckRuns (status 'failed') should start coder retries.

### R5-1 (mittel): Kosten › 'Budget pro Projekt' listet nur Projekte mit bezahlter Nutzung – Leerzustand behauptet 'Noch keine Projekte' (Integrator-Beobachtung 1)

- Datei: `src/daemon/providers/budget.ts`, Zeile 496
- Fehlerbild: Nutzer legt 2 Projekte an und setzt für 'Rezept-API' ein Monatslimit von 5 $. Kosten-Seite → 'Budget pro Projekt' zeigt 'Noch keine Projekte'. Das eingetragene Limit und das verbleibende Budget pro Projekt (MASTERPROMPT §15: 'pro Projekt … verbleibendes Budget') sind nirgends auf der Kosten-Seite sichtbar; der Text ist schlicht falsch.
- Lösungsvorschlag: In budget.status() zusätzlich alle aktiven Projekte mit gesetztem config.monthlyBudgetUsd (oder einfach alle aktiven Projekte via s.projects.list()) in projectIds aufnehmen. Im Renderer den Leerzustand korrekt formulieren ('Noch kein Projekt hat kostenpflichtige Modelle verwendet oder eine eigene Grenze') und ggf. Projekte aus useProjectNames ergänzen.

### R5-2 (mittel): Studio: ungespeicherte Editor-Änderungen gehen beim Beenden (Tray, Installer, Windows-Shutdown) ohne Rückfrage verloren (Integrator-Beobachtung 4)

- Datei: `src/renderer/src/pages/studio/useEditorTabs.ts`, Zeile 59
- Fehlerbild: Nutzer bearbeitet im Studio 3 Dateien, speichert nicht, und wählt im Tray 'Oberfläche beenden' (oder startet das Update-Setup / fährt Windows herunter). Die App schließt sofort; alle Änderungen sind weg, ohne Warnung. Ein Editor ohne 'Ungespeicherte Änderungen – speichern?' ist für Einsteiger eine Datenverlust-Falle.
- Lösungsvorschlag: (1) Entwürfe zusätzlich (gedrosselt) in localStorage/IndexedDB je Projekt+Datei+baseHash sichern und beim Öffnen wiederherstellen. (2) Für interaktives Beenden: Renderer meldet unsavedCount per IPC an main; before-quit (Modus 'ui'/'all') zeigt einen nativen Dialog 'X ungespeicherte Dateien – Speichern / Verwerfen / Abbrechen' bzw. ruft vorher ein 'Alle speichern' im Renderer auf. Für os-shutdown/installer mindestens den Entwurf persistieren.

### R5-3 (mittel): Fehler aus Benutzeraktionen verlieren 'Was ist zu tun?', Schweregrad und Projekt-Sicherheit – Toast zeigt nur die Meldung

- Datei: `src/daemon/server/router.ts`, Zeile 61
- Fehlerbild: Ein importiertes Repo gehört einem anderen Windows-Konto; der Änderungen-Tab ruft git.status auf. Der Nutzer sieht nur 'Git verweigert den Zugriff … (dubious ownership)' – die einzige Lösung (der safe.directory-Befehl) wird nicht angezeigt. Ebenso beim Modell-Download auf voller Platte oder wenn kein Prozessplatz frei ist: nur eine rote Kurzmeldung, keine Einordnung Warnung/Blocker, kein 'Ist das Projekt sicher?', kein 'Was ist zu tun?'.
- Lösungsvorschlag: In mapError für NovaError ein `error`-Objekt (NovaErrorInfo-kompatibel: severity, title, whatHappened=message, attempted=[], projectSafe, autoFixable, userAction) mitsenden. Im Renderer toast.fromError/useMutation: bei vorhandenem info den Ton nach severity wählen (warning→Warnung) und userAction als zweite Zeile 'Zu tun: …' bzw. Aktion 'Details' (öffnet ErrorCard im Dialog) anzeigen.

### R6-2 (mittel): Dienst-Stopp und Autostart-Entfernung hängen an .onInit/un.onInit: wirken schon vor der Bestätigung (Abbrechen hat Nebenwirkungen), und bei stiller Deinstallation tötet electron-builder den Dienst hart, bevor --stop-daemon läuft

- Datei: `build/installer.nsh`, Zeile 46
- Fehlerbild: Nutzer öffnet 'Apps & Features → NOVA AI → Deinstallieren', sieht die Willkommensseite und klickt 'Abbrechen': NOVA (Fenster, Tray, Hintergrunddienst mit laufenden Agenten-Aufgaben) ist trotzdem beendet und der Autostart-Eintrag gelöscht – nach dem nächsten Windows-Start setzt NOVA nichts fort, bis der Nutzer es von Hand startet (erst dann stellt AutostartManager.reconcile den Eintrag wieder her). Gleiches beim Starten und Abbrechen der setup.exe (Dienst gestoppt, Fenster erscheint erst nach bis zu ~30 s). Bei 'Uninstall NOVA AI.exe /S' (z. B. per Skript/Softwareverteilung) wird der Dienst hart getötet; laufende Dev-Server/Tests der Projekte laufen nach der Deinstallation weiter.
- Lösungsvorschlag: Statt customInit/customUnInit das von electron-builder vorgesehene '!macro customCheckAppRunning' definieren: es ersetzt CHECK_APP_RUNNING und läuft im Installations- bzw. Deinstallationsabschnitt (nach der Bestätigung, mit Fortschrittsanzeige). Darin zuerst ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --stop-daemon' (DetailPrint sichtbar), danach die bisherige Prozessprüfung (IS_POWERSHELL_AVAILABLE + _CHECK_APP_RUNNING) als Rückfall. Die Autostart-Entfernung nach customUnInstall verschieben (läuft erst nach Bestätigung, ${IfNot} ${isUpdated}).

### R6-3 (mittel): GPU-Abfrage startet dauerhaft alle 10 s powershell.exe (bzw. alle 3 s nvidia-smi) – auch im Leerlauf und bei geschlossener Oberfläche

- Datei: `src/daemon/resources/gpu.ts`, Zeile 41
- Fehlerbild: Laptop mit Intel/AMD-Grafik, NOVA im Autostart, keine Aufgabe aktiv: im Task-Manager tauchen im 10-Sekunden-Takt powershell.exe und WmiPrvSE-Lastspitzen auf; spürbare Grundlast, Lüfter/Akku, obwohl NOVA nichts tut – genau das, was ein Hintergrunddienst auf einem normalen PC vermeiden soll.
- Lösungsvorschlag: GPU-Werte nur bei Bedarf erheben: wenn ein SSE-Abonnent resources.snapshot empfängt (Oberfläche sichtbar) oder unmittelbar bevor der Governor einen neuen Lauf startet (allowedFor/VRAM-Prüfung), sonst Intervall auf z. B. 60–120 s strecken bzw. pausieren. Alternativ einen einzigen langlebigen PowerShell-Prozess mit Schleife (stdin-gesteuert) statt Kaltstarts, und nvidia-smi mit '-l'/'--loop-ms' als Dauerprozess statt Neustarts alle 3 s.

### R1-2 (niedrig): Live-Vorschau: [::1]-Adressen werden von der CSP blockiert (ungültige Quelle), https-Loopback mit irreführendem Text abgelehnt

- Datei: `src/main/security.ts`, Zeile 99
- Fehlerbild: A dev server that prints `http://[::1]:3000/` (Node server bound to ::1, some framework configs) → status 'running', the Studio embeds the iframe, but the user only sees Chromium's blocked-frame page; nothing explains why. With an https dev URL the user is told only local addresses are shown although the address is local.
- Lösungsvorschlag: Make the loopback policy consistent in one place: either drop [::1] from embedding (renderer + isAllowedSubframeUrl + CSP) and show „Im Browser öffnen“ for it, or use the scheme-source `frame-src http:` in the CSP and keep the strict loopback check in will-frame-navigate (which already blocks everything else, verified). For https loopback URLs show a correct German text („HTTPS-Adressen werden im Studio nicht eingebettet – bitte im Browser öffnen“) or prefer the http URL when the dev server prints both (pick the first http match). Update UI-SPEC §5 and security.test.ts accordingly.

### R3-10 (niedrig): Dateiänderungen eines Agentenbefehls gehen bei Absturz/erzwungenem Beenden verloren (Vorher-Stand nur im Speicher)

- Datei: `src/daemon/changes/journal.ts`, Zeile 128
- Fehlerbild: Agent runs a formatter/codemod that rewrites 200 files; Windows logs off (honest limit f). After restart these modifications are not shown as NOVA changes, are not part of task.files, and restoring the pre_task checkpoint silently leaves them in place.
- Lösungsvorschlag: Persist a command-in-progress record (taskId, runId, startedAt, scan stored compactly in run-state) before spawning; on startup, for such records, diff the tree against it and record changes as source 'command' (non-revertible if no before blob) or at least report 'unprotokollierte Änderungen möglich' on the task.

### R3-11 (niedrig): Ein einmaliger Wartungsfehler setzt den Dienststatus bis zum Neustart dauerhaft auf 'Fehler'

- Datei: `src/daemon/app.ts`, Zeile 229
- Fehlerbild: The daily backup fails once because Defender holds the backup file or the governor reports low disk space; after the user frees space everything works, but the top bar keeps showing the background service in error state until NOVA is restarted.
- Lösungsvorschlag: Report maintenance failures via core.errors.report (warning, dedupeKey per step, resolved on the next successful run) instead of lastError; reserve lastError for startup steps that leave the daemon degraded.

### R3-12 (niedrig): Kein Schutz bei Downgrade: neuere Datenbank-Schemaversion wird beim Start nicht abgelehnt

- Datei: `src/daemon/db/migrations.ts`, Zeile 399
- Fehlerbild: User installs an older NOVA setup over a newer one (updates are manual): the old daemon opens the newer DB without a warning and may write rows that violate new constraints or ignore new columns – data inconsistency instead of a clear message.
- Lösungsvorschlag: In migrate()/createCore: if from > LATEST_SCHEMA_VERSION throw a German NovaError ('Die Daten stammen von einer neueren NOVA-Version …') so the crash report tells the user to install the newer version.

### R3-13 (niedrig): Veraltete-Sperre-Heuristik kann eine aktive index.lock des Benutzers löschen

- Datei: `src/daemon/git/git-service.ts`, Zeile 346
- Fehlerbild: User runs 'git commit -a' in a terminal and takes two minutes to write the message while a NOVA task finishes with autoCommit → NOVA removes the lock, commits its files; the user's commit completes the ref update but fails to write the index, leaving a confusing repository state.
- Lösungsvorschlag: Only treat a lock as stale when no git process is running for that repository at all (check running git.exe processes / try exclusive open on Windows), or never delete it automatically and report GIT_ERROR with a user action instead.

### R3-14 (niedrig): Datenbank-Wiederherstellung: Dialog verspricht Anhalten laufender Aufgaben, Dienst lehnt aber ab

- Datei: `src/renderer/src/pages/settings/panels/BackupsPanel.tsx`, Zeile 197
- Fehlerbild: User confirms the restore while an agent works and gets an error toast contradicting the dialog text.
- Lösungsvorschlag: Either pause work (work.pause + wait for runs to settle) before scheduling the restore, or change the dialog text to 'Bitte zuerst die Arbeit anhalten'.

### R3-8 (niedrig): atomicWriteFile lässt bei vollem Datenträger eine halbe Temp-Datei im Projektordner zurück

- Datei: `src/daemon/core/fs-atomic.ts`, Zeile 86
- Fehlerbild: Disk nearly full: an agent write of a large file fails with DISK_FULL, but the partial temp file stays in the user's project (shown by git status / Explorer when hidden files are visible) and keeps occupying exactly the space the user needs to free.
- Lösungsvorschlag: Wrap the write/fsync in try/catch and unlinkSync(tmp) before rethrowing (same as the rename failure path).

### R3-9 (niedrig): Nicht-atomarer In-Place-Fallback: Abbruch hinterlässt halb geschriebene Datei, die NOVA dann nicht mehr zurücksetzt

- Datei: `src/daemon/core/fs-atomic.ts`, Zeile 102
- Fehlerbild: User has a project file open in a program that blocks renames; the agent writes it, the PC loses power during the in-place rewrite → corrupted file, and the restore dialog tells the user that the user changed it and leaves it broken.
- Lösungsvorschlag: Before an in-place rewrite mark the journal row (e.g. state 'inplace') so recovery can restore the before blob when the hash matches neither side; or refuse with FILE_IN_USE instead of rewriting non-atomically for agent writes; replace the synchronous sleep with async backoff.

### R4-12 (niedrig): 'Keine Tests gefunden' mit Exit-Code ≠ 0 (pytest 5, vitest/jest 1) gilt als fehlgeschlagen statt übersprungen

- Datei: `src/daemon/checks/check-service.ts`, Zeile 583
- Fehlerbild: A project whose test command exists but has no tests yet (e.g. `vitest run` configured, tests to be written later): every coder task's verification fails with 'Fehlgeschlagen (Exit-Code 1)', the coder is re-run to 'fix' it and the task ends REPEATED_FAILURE/TESTS_FAILED although nothing is broken.
- Lösungsvorschlag: Recognise the 'no tests' outputs/exit codes (pytest 5; vitest 'No test files found'; jest 'No tests found') and map them to 'skipped' with the existing German message, independent of the exit code.

### R4-13 (niedrig): 'Fortsetzen' nach AGENT_STEP_LIMIT startet einen komplett neuen Lauf – Fortsetzungslogik im Runner ist toter Code

- Datei: `src/daemon/tasks/work-cycle.ts`, Zeile 1876
- Fehlerbild: After 40 steps of real progress the user clicks 'Fortsetzen' as the blocker suggests; the new run knows nothing about the previous conversation, re-inspects everything, may redo or contradict half-finished changes, and burns another full step budget.
- Lösungsvorschlag: Keep the continuation for AGENT_STEP_LIMIT (resumable on explicit user start/resume only, not by auto-unblock) so the WorkCycle passes resumeRunId and the runner grants the new budget; or at least pass a summary of the previous run as extraContext.

### R5-4 (niedrig): RelativeTime zeigt 'gleich' (= demnächst) für gerade gemessene Zeitpunkte – Ressourcen-Karte und 'Zuletzt geprüft' sind dauerhaft falsch beschriftet

- Datei: `src/renderer/src/components/common/RelativeTime.tsx`, Zeile 22
- Fehlerbild: Einsteiger liest bei 'Ressourcen' bzw. 'Zuletzt geprüft' das Wort 'gleich' und versteht 'wird gleich geprüft/kommt gleich' statt 'gerade eben gemessen'.
- Lösungsvorschlag: Effektives 'now' als Math.max(now, Date.now()) übergeben und in formatRelativeTime kleine Zukunftsabweichungen (z. B. < 60 s, Uhrabweichung Daemon/UI) als 'gerade eben' behandeln.

### R5-5 (niedrig): Blocker-Aktion für PRICE_UNKNOWN / PAID_NOT_APPROVED führt zur Kosten-Seite, die Lösung liegt aber unter 'Modelle'

- Datei: `src/renderer/src/lib/labels.ts`, Zeile 617
- Fehlerbild: Eine Aufgabe ist blockiert, weil für das kostenpflichtige Modell kein Preis hinterlegt ist. Der Nutzer klickt den angebotenen Link 'Kosten und Budget' und findet dort keine Möglichkeit, den Preis einzutragen oder den Anbieter freizugeben.
- Lösungsvorschlag: PAID_NOT_APPROVED und PRICE_UNKNOWN auf { label: 'Modelle und Preise', path: '/models' } abbilden; nur BUDGET_EXCEEDED auf /costs.

### R5-6 (niedrig): Kosten-Seite aktualisiert Tokens, Laufzeit und Verbrauchstabellen bei lokaler Modellnutzung nicht

- Datei: `src/renderer/src/pages/costs/CostsPage.tsx`, Zeile 20
- Fehlerbild: Nutzer lässt die Kosten-Seite offen, während ein Agent mit qwen2.5-coder arbeitet: 'Tokens heute', 'Modell-Laufzeit heute', 'Tokens und Laufzeit' und die Tabelle 'Einzelne Aufrufe' bleiben auf dem alten Stand, bis die Seite neu geöffnet wird ('Live'-Anschein, aber veraltete Zahlen).
- Lösungsvorschlag: Im Daemon nach jedem record() (gedrosselt, z. B. max. 1×/2 s) budget.updated senden, oder im Renderer zusätzlich auf run.updated (gefiltert auf beendete Modellaufrufe) bzw. ein Intervall (z. B. 10 s) refetchen.

### R5-7 (niedrig): Übersicht: Zahlen inkonsistent – 'Aktuelle Fehler' auf 20 gekappt, 'warten auf einen Platz' zählt alle wartenden Aufgaben, 'Offene Aufgaben' ≠ Filter 'Offen'

- Datei: `src/daemon/tasks/dashboard.ts`, Zeile 130
- Fehlerbild: Eine Aufgabe ist fehlgeschlagen: Übersicht zeigt 'Offene Aufgaben 0', Klick darauf → Aufgaben-Seite 'Offen 1'. Ein Projekt mit ausgeschalteter Arbeit und 3 Aufgaben: Übersicht meldet '3 warten auf einen Platz', obwohl NOVA sie nie starten wird.
- Lösungsvorschlag: Fehleranzahl separat zählen (COUNT(*) WHERE resolved_at IS NULL) und als Zahl liefern; Untertitel aus work.projects nur für 'eligible' Aufgaben bilden oder neutral 'in der Warteschlange' formulieren; Definition 'offen' in Daemon und Board vereinheitlichen (failed entweder überall mitzählen oder Filter umbenennen).

### R5-8 (niedrig): Status-Wortwahl widersprüchlich: Projekt 'Arbeitet' (grün) erscheint auf der Übersicht unter 'Pausiert und wartend', 'Laufend (0)' (Integrator-Beobachtung 2 – Ursache)

- Datei: `src/renderer/src/pages/DashboardPage.tsx`, Zeile 499
- Fehlerbild: Nach erledigten Aufgaben sieht der Nutzer oben 'Arbeitet', im Projekt 'Arbeitet', auf der Übersicht aber beide Projekte unter 'Pausiert und wartend' und 'Laufend (0)' – er kann nicht erkennen, ob NOVA arbeitet oder hängt.
- Lösungsvorschlag: Drei Gruppen bilden: 'Arbeitet gerade', 'Bereit – wartet auf Aufgaben' (workState running, idle, mit idleReason/suggestion) und 'Pausiert/Gestoppt'. Den Badge 'Arbeitet' bei idle durch 'Bereit' bzw. 'Wartet auf Aufgaben' ersetzen (WORK_STATE + work.projects[].idleReason).

### R6-4 (niedrig): where.exe-Ausgabe wird als UTF-8 gelesen, kommt aber in der OEM-Codepage: Pfade mit Umlauten (C:\Users\Jürgen\…) werden verstümmelt, Werkzeuge gelten als fehlend

- Datei: `src/daemon/core/exec.ts`, Zeile 115
- Fehlerbild: Windows-Konto 'Jürgen', PowerShell 7 aus dem Store (%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe), dotnet per dotnet-install im Benutzerprofil oder Werkzeuge über Scoop/nvm im Profil: where.exe liefert 'C:\Users\J�rgen\…', der Versionsaufruf scheitert mit ENOENT, 'Werkzeuge' zeigt das Programm als nicht installiert und bietet eine winget-Installation von etwas an, das schon da ist.
- Lösungsvorschlag: PATH-Suche in JavaScript implementieren (PATH aus buildChildEnv × PATHEXT, fs.existsSync/lstat) statt where.exe zu parsen, oder where.exe über 'cmd /d /s /c "chcp 65001>nul & where.exe NAME"' bzw. über runPowerShell (Get-Command … | ConvertTo-Json) mit UTF-8 aufrufen.

### R6-5 (niedrig): Hängender Hintergrunddienst: Oberfläche bleibt endlos in „Getrennt – neuer Versuch …“, nie Fehlerzustand oder Diagnoseangebot

- Datei: `src/main/daemon-supervisor.ts`, Zeile 742
- Fehlerbild: Dienst hängt (Fehler im Code, blockierender Aufruf). Die Statusanzeige zeigt dauerhaft 'Getrennt – neuer Versuch …', jede Aktion läuft in 120-s-Timeouts, kein roter Fehlerzustand, kein Hinweis auf Diagnose; nach Neustart der Oberfläche die irreführende Meldung 'Kommunikationskanal von einem fremden Programm belegt'.
- Lösungsvorschlag: In lossCheck die Dauer des transienten 'foreign/timeout'-Zustands begrenzen (z. B. 2 min) und dann state 'error' mit eigenem Text ('Der Hintergrunddienst reagiert nicht …', Diagnose/Neustart-Knopf) setzen. Für 'Dienst neu starten' den Prozess aus daemon.lock (pid + startedAt) über die Prozess-Erstellungszeit verifizieren (wie process-tree.ts planWindowsKill) und dann gezielt beenden.

### R6-6 (niedrig): Beenden während der Dienst noch startet: daemon.shutdown wird nie gesendet, der Dienst läuft danach entgegen keepRunningWhenUiClosed=false kopflos weiter

- Datei: `src/main/daemon-supervisor.ts`, Zeile 312
- Fehlerbild: Autostart nach der Anmeldung (Dienststart dauert durch Defender/erste PowerShell-Abfragen lange), Nutzer hat 'Im Hintergrund weiterarbeiten' ausgeschaltet und wählt im Tray 'Oberfläche beenden': Der Dienst startet trotzdem fertig und arbeitet unsichtbar weiter (setzt Aufgaben fort, ruft ggf. Cloud-Modelle auf), obwohl der Nutzer das abgeschaltet hat.
- Lösungsvorschlag: In requestShutdown bei Zustand 'starting'/'connecting' mit selbst gespawntem Kind kurz (bis zum 10-s-Limit von finalizeQuit) auf 'ours' warten und dann daemon.shutdown senden, oder das selbst gespawnte Kind (this.spawned, noch nicht verbunden) direkt beenden.

### R6-7 (niedrig): „Mit Windows starten“ im Start ohne Installation (NOVA-STARTEN.cmd) nicht möglich, Meldung schickt den Nutzer fälschlich in die Windows-Einstellungen

- Datei: `src/main/autostart.ts`, Zeile 33
- Fehlerbild: Nutzer startet NOVA über NOVA-STARTEN.cmd (vom README angeboten), schaltet 'Mit Windows starten' ein, bekommt die Warnung und sucht in den Windows-Einstellungen vergeblich nach einem NOVA-Eintrag.
- Lösungsvorschlag: Über die Brücke 'supported' melden (z. B. getAutostart → {supported, enabled}) und den Schalter im nicht installierten Modus deaktivieren mit Text 'Nur in der installierten Version verfügbar'; README-Abschnitt 'Ohne Installation starten' entsprechend ergänzen.

### R6-8 (niedrig): README/TASKS für Einsteiger teils falsch: Node-Mindestversion, veraltete TASKS.md als 'ehrlicher Stand', unvollständige Anleitung 'alles entfernen'

- Datei: `README.md`, Zeile 36
- Fehlerbild: Einsteiger mit Node 22.11 folgt dem README und bekommt 'zu alt'; liest TASKS.md und glaubt, Installer/Dienst seien unfertig; nach 'alles entfernen' bleibt ein NOVA-Ordner in AppData\Roaming.
- Lösungsvorschlag: README: 'Node.js 22.13 oder neuer'; TASKS.md auf den aktuellen Stand bringen; im Abschnitt 4 zusätzlich %APPDATA%\NOVA AI nennen.

### R6-9 (niedrig): Kein Schutz beim Start einer älteren Version gegen eine neuere Datenbank (Downgrade per älterer setup.exe)

- Datei: `src/daemon/db/migrations.ts`, Zeile 396
- Fehlerbild: Nutzer installiert nach einem künftigen Update wieder die ältere setup.exe (NSIS verhindert das nicht): die alte Version schreibt in ein neueres Schema (fehlende/umbenannte Spalten → SQL-Fehler oder still inkonsistente Daten).
- Lösungsvorschlag: In migrate()/createCore: wenn from > LATEST_SCHEMA_VERSION → NovaError mit deutscher Meldung ('Die Daten stammen von einer neueren NOVA-Version. Bitte die neuere Version installieren.'), crash.json mit Hinweis; Daten nicht anfassen.

