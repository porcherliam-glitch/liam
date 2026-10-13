# Unity-Harness für „Chroniken von Aetherfall“

Kompiliert und testet den Unity-C#-Code des Repos **ohne Unity** – nur mit dem .NET-8-SDK und
`python3`. Gedacht als schnelle Prüfung nach jeder Code-Änderung (Phase 0.4 / Phase 1 ff.).
Der Harness ändert nichts im Repo; alles Erzeugte liegt unter `.cache/` und `.work/`.

## Bedienung

```bash
./run_checks.sh                       # prüft /home/user/liam
./run_checks.sh --project <pfad>      # anderes Unity-Projekt
./run_checks.sh --selftest            # Harness selbst prüfen (selftest/clean + selftest/faulty)
./run_checks.sh --help                # alle Optionen
```

| Option | Wirkung |
|---|---|
| `--passes editor,player-win` | Kompilier-Durchläufe (Standard). Zusätzlich möglich: `player-osx`, `player-win-dev` |
| `--define X` / `--dev-defines "A;B"` | weitere Defines bzw. Dev-Defines (Standard: `AETHERFALL_DEV;AETHERFALL_CHEATS;AETHERFALL_TELEMETRY`) |
| `--filter "FullyQualifiedName~EventBus"` | nur ausgewählte Tests ausführen |
| `--no-tests`, `--no-compat`, `--no-lint`, `--no-analyzers` | Teile abschalten |
| `--no-patch` | ohne Unity-6-Patches, nur Whitelist-Filter (zum Vergleich) |
| `--without-packages L` | Unity-Pakete als **fehlend** simulieren, kommagetrennt (z. B. `com.unity.cinemachine`); `stubs` = alle Pakete aus `packages/packages.json` (Stubs und NuGet-DLLs) |
| `--no-package-matrix` | keinen zweiten Lauf „ohne Pakete“ anhängen (siehe unten) |
| `--no-editor` | ohne UnityEditor-Referenz: „Editor-Code nicht kompilierbar – nur Review“ |
| `--verbose` | alle Warnungen, Stacktraces, Info-Hinweise |
| `--clean` | Caches löschen und neu aufbauen |

**Standardablauf:** Hauptlauf **mit** den Paket-Stubs (Input System, Cinemachine – wie nach dem Setup in Unity), danach
automatisch ein zweiter Lauf **ohne** diese Pakete (`--without-packages stubs`, Arbeitsordner `.work/<projekt>-ohne-pakete`).
Er simuliert das erste Öffnen aus der Vorlage „Universal 3D“: Assemblies, die ein fehlendes Paket brauchen, müssen per
`versionDefines` + `defineConstraints` wegfallen, alles andere (inkl. der übrigen Tests) muss grün bleiben. Die Zusammenfassung
listet „Wegen defineConstraints nicht kompiliert: …“. Der Exit-Code ist der schlechtere der beiden Läufe.

**Exit-Code:** `0` = alles grün · `1` = Fehler im Code (Compiler, Tests, Regel-Lint, asmdef-Struktur) ·
`2` = Problem des Harness (Restore, MSBuild, fehlende Ergebnisse).
Die Zusammenfassung steht am Ende der Ausgabe und in `.work/<projekt>/summary.txt` (`summary.json` maschinenlesbar).
Erster Lauf ca. 1 min (NuGet), danach ca. 20–40 s.

### Was geprüft wird

| Teil | Inhalt |
|---|---|
| (a) Runtime | jede asmdef unter `Assets/_Project/Scripts/**` (ohne `Editor/`) als **netstandard2.1, C# 9**. Durchlauf **Editor** (macOS-Editor: `UNITY_EDITOR`, `DEVELOPMENT_BUILD`, `UNITY_ASSERTIONS`, Dev-Defines, UnityEditor.dll sichtbar wie in Unity) und **Player Windows Release** (ohne `UNITY_EDITOR`/`DEVELOPMENT_BUILD`/Dev-Defines, ohne UnityEditor.dll) – findet z. B. `using UnityEditor` ohne `#if`. |
| (b) Editor | asmdefs unter `Scripts/Editor/**` (bzw. `includePlatforms: ["Editor"]`) gegen UnityEditor.dll. |
| (c) Tests | Test-asmdefs unter `Assets/_Project/Tests/**`: Build als **net8.0 + NUnit 3.14** und Lauf mit `dotnet test`; zusätzlich **Unity-Kompat.-Build** als netstandard2.1 + NUnit 3.5 (Basis von Unitys `com.unity.ext.nunit`) – fängt .NET-8-only-APIs (`ArgumentNullException.ThrowIfNull`) und neuere NUnit-APIs (`Assert.Multiple`). |
| (d) Regel-Lint | heuristische Prüfung der §32-/Architektur-Regeln (siehe unten). |
| Struktur | asmdef-Probleme: GUID-Referenzen, doppelte Namen, fehlende Referenzziele, Skripte ohne asmdef. |

Schlägt eine Assembly fehl, werden davon abhängige Assemblies nicht gebaut und als **Folgefehler** gezählt.
Referenziert ein Test-asmdef eine fehlgeschlagene Assembly, deren Namespace in den Tests gar nicht vorkommt
(z. B. ein Editor-Werkzeug, das ein fehlendes Paket nutzt), baut `scripts/degrade_tests.py` eine Kopie ohne
diese Referenz – die übrigen Tests laufen trotzdem („ohne Referenz auf …“ in der Zusammenfassung).

Unity-Verhalten, das nachgebildet wird: eine Assembly je asmdef mit denselben Referenzen
(per Name; `GUID:` nur über `.meta`), `includePlatforms`/`excludePlatforms`, `defineConstraints`
(Unity-Semantik inkl. `||` und `!`), `noEngineReferences`, `allowUnsafeCode`, `precompiledReferences`
(`nunit.framework.dll` → NUnit, `Newtonsoft.Json.dll` → Newtonsoft.Json 13.0.2), Skripte ohne asmdef →
`Assembly-CSharp(-Editor)`, Unity-Defines `UNITY_6000_3_OR_NEWER` … `UNITY_5_3_OR_NEWER`, `NET_STANDARD_2_1`,
`ENABLE_INPUT_SYSTEM`, Projekt-Defines aus `ProjectSettings.asset` (Standalone) und `Assets/csc.rsp`,
Unitys Warnungsunterdrückung (`/nowarn:0169,0649,0282,1701,1702`). `InternalsVisibleTo` funktioniert,
weil die Assembly-Namen gleich bleiben.

Zusätzlich (nicht in Unity, aber regelkonform): **Microsoft.Unity.Analyzers** mit angehobenen Stufen für
Regel 15.2 #8 (`?.`/`??`/`is null` auf Unity-Objekten, `TryGetComponent`), leere Unity-Messages, falsche
Message-Signaturen; das alte **`UnityEngine.Input`** ist nicht referenziert (→ Compilerfehler, Regel 15.2 #7).

### Regel-Lint (heuristisch, `scripts/lint.py`)

Fehler: altes Input-System, `Find*` im Laufzeitcode (außerhalb `#if UNITY_EDITOR`; in DevTools/Dev-Code nur Warnung),
`SendMessage`/`Resources.Load`, `BinaryFormatter`, statischer Zustand ohne
`[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]`-Reset, `record`/`init` neben serialisierten Typen,
verbotene Namespace-Segmente (`Camera`, `Editor`, `Time` …), Schichtverletzungen laut Tabelle 3.3
(wird aus `docs/Technik/01_Architektur.md` gelesen). Warnungen: `Debug.Log` außerhalb der Log-Adapter,
`async void` ohne try/catch, `Camera.main`, `GetInstanceID`, öffentliche Felder in MonoBehaviours/SOs,
Dateiname ≠ Typname, mehrere Typen je Datei (außer `*Events.cs`), fehlende `///`-Doku öffentlicher Typen,
Namespace ≠ Root Namespace, Umlaute in Kommentaren, asmdef ohne `rootNamespace` bzw. mit `autoReferenced`.

## Unity-6-APIs: Shims, Patches, Whitelist

Auf nuget.org gibt es nur **UnityEngine.Modules 2021.3.33** und **UnityEditor 2021.1.14** (`Unity3D.SDK`).
Fehlende Unity-6-APIs werden so behandelt (vollständige Liste: `unity6_whitelist.txt`, Ergebnis des
Patchens: `.cache/unity-refs/patch-manifest.txt`):

| Weg | Wofür | Ort |
|---|---|---|
| **Shim** | eigenständige Typen, C#-Quelltext mit gleicher öffentlicher Oberfläche wie 6000.3: `Awaitable`, `Awaitable<T>`, `AwaitableCompletionSource(<T>)`, `Main/BackgroundThreadAwaitable`, `await AsyncOperation`/`UnityEvent`, `NamedBuildTarget`, `Il2CppCodeGeneration`, `Il2CppStacktraceInformation` | `shims/Unity6Shims.Engine`, `shims/Unity6Shims.Editor` |
| **Patch** | fehlende Member bestehender Typen, z. B. `MonoBehaviour.destroyCancellationToken`, `Application.exitCancellationToken`, `SceneManager.loadedSceneCount`, `Rigidbody.linearVelocity/linearDamping/angularDamping`, `PlayerSettings.*(NamedBuildTarget)`, `ApiCompatibilityLevel.NET_Standard`, `SerializedProperty.boxedValue`, `AssetDatabase.SaveAssetIfDirty`. `tools/RefPatcher` (Mono.Cecil) fügt die in `patches/Unity6Patches` deklarierten Signaturen in Kopien der Referenz-DLLs ein (Rumpf wirft `NotSupportedException`). | `patches/Unity6Patches` |
| **Obsolete** | was 6.3 als `[Obsolete]` markiert (`FindObjectOfType`, `Rigidbody.velocity/drag/angularDrag`, `GraphicsSettings.renderPipelineAsset`, `PlayerSettings.*(BuildTargetGroup)`) → CS0618 wie in 6.3 | `patches/Unity6Patches/*ObsoleteMarkers.cs` |
| **Filter** | alles andere: Fehlercode + Symbol in `unity6_whitelist.txt` → nicht gezählt, aber separat gelistet | `unity6_whitelist.txt` |

Patch/Shim ist dem Filter vorzuziehen: Mit gefiltertem Fehler wird die Assembly trotzdem nicht gebaut,
abhängige Assemblies und Tests fallen als „Folgefehler“ aus (vgl. `--no-patch`). Neue API ergänzen:
Member in eine `[PatchTarget("Assembly", "Typ")]`-Klasse in `patches/Unity6Patches` bzw. Typ in `shims/`
schreiben, Zeile in `unity6_whitelist.txt` ergänzen (Mechanismus `patch`/`shim`), `./run_checks.sh` erkennt
die Änderung und baut die Referenzen neu. Signaturen gegen die Unity-6000.3-C#-Referenzquellen prüfen;
`tools/RefProbe` zeigt, was in den Referenz-DLLs vorhanden ist
(`dotnet run --project tools/RefProbe -- has .cache/unity-refs/engine 'UnityEngine.Application::exitCancellationToken'`).
Die Zusammenfassung listet alle Fundstellen von Shim-/Patch-APIs, weil deren **Verhalten** nur in Unity 6.3 prüfbar ist.

**Unity-Pakete als Stubs** (`packages/`, nur Harness): `packages/packages.json` nennt die Pakete mit Stub (Paket-ID →
Version → Assembly-Name → Stub-Projekt). Jeder Stub (`packages/Unity.InputSystem`, `packages/Unity.Cinemachine`) enthält nur die
öffentlichen Signaturen, die der Aetherfall-Code benutzt – geprüft gegen die Quellen von Input System 1.11/1.14
(`InputActionSetupExtensions` u. a.) bzw. Cinemachine `release/3.1` (`CinemachineCamera`, `CinemachineOrbitalFollow`,
`InputAxis`, `CinemachineRotationComposer`, `CinemachineDeoccluder`, `CinemachineBrain` …). Jeder Member wirft
`NotSupportedException`: Die Stubs sind nur zum **Kompilieren** da, Verhalten ist nur in Unity prüfbar. Ein Paket mit Stub gilt als
installiert (seine `versionDefines` greifen, Assemblies dürfen es per Name referenzieren), außer es steht in `--without-packages`.
Testprojekte bekommen die Stub-DLLs transitiv referenzierter Pakete nur als Laufzeit-Kopie (für den Compiler unsichtbar).
Neue API ergänzen: Signatur in den Stub schreiben (gegen die Paketquelle prüfen), `./run_checks.sh` baut die Stubs neu.
`--selftest` läuft immer mit `--without-packages stubs`, weil `selftest/faulty` das Verhalten **fehlender** Pakete prüft.

**Unity-Pakete per NuGet (echte DLL)**: Pakete, die nur eine vorkompilierte .NET-Bibliothek mitbringen, stehen in
`packages/packages.json` mit einem `nuget`-Eintrag (DLL-Name → NuGet-Paket + Version), z. B.
`com.unity.nuget.newtonsoft-json` 3.2.2 → `Newtonsoft.Json` 13.0.2 (dieselbe Version wie im Unity-Paket). Das Paket gilt als
installiert (sein `versionDefines`, hier `AETHERFALL_NEWTONSOFT`, greift), und jede asmdef, die die DLL in
`precompiledReferences` nennt (bei `overrideReferences: true`), bekommt eine `PackageReference` mit `PrivateAssets="compile"`
(nicht transitiv sichtbar, wie in Unity). Anders als Stubs **funktioniert** die echte DLL in Tests. Mit
`--without-packages stubs` gilt auch ein solches Paket als fehlend (der zweite Lauf prüft, dass dann alles, was es braucht,
per `defineConstraints` ausfällt); eine asmdef, die die DLL trotzdem nennt, wird gemeldet.

**Wichtig für Tests:** Die Referenz-DLLs (`UnityEngine.Modules` von nuget.org) haben bei verwalteten Membern leere Rümpfe
(`throw null`). Schon `new Vector3(…)` wirft deshalb in Tests eine `NullReferenceException`; nur Felder (`v.x`) funktionieren.
Reine Logik, die getestet werden soll, rechnet daher mit eigenen Typen (z. B. `Aetherfall.Player.MotionVector`) bzw. `System.Math`.
Ausnahme Attribute: `tools/RefPatcher` ersetzt in `UnityEngine.CoreModule` die leeren Konstruktoren aller Attribut-Klassen
(z. B. `[Preserve]`, `[Tooltip]`) durch `ret` (Manifestzeile `ATTRCTOR`). Sonst wirft Reflection, die Attribute
instanziiert (etwa Newtonsoft.Json bei `[Preserve]`-DTOs), in Tests eine `NullReferenceException`.

**Test-Stand-ins** (`shims/UnityTestRunnerShims`): `[UnityTest]` → Test wird als „übersprungen – braucht Unity“
gemeldet; `LogAssert.*` → Test übersprungen; `UnityEngine.TestTools.Constraints.Is.Not.AllocatingGCMemory()`
misst mit `GC.GetAllocatedBytesForCurrentThread()` statt mit Unitys Profiler-Recorder.

## Grenzen

- **2021.3-/2021.1-Referenzen ≠ Unity 6.3.** APIs, die es nur in 2021.3 gibt und die 6.3 entfernt hat, sowie
  6.3-Obsolete-Warnungen außerhalb der kuratierten Liste werden nicht erkannt. Die Editor-Referenz ist älter
  (2021.1) – Editor-Code kann Fehler für APIs zeigen, die es seit 2021.2 gibt (→ Patch/Whitelist ergänzen).
- **Unity-Pakete nur als Stubs**: Input System und Cinemachine gibt es als Signatur-Stubs (`packages/`, siehe oben),
  Newtonsoft.Json als echte NuGet-DLL.
  Addressables, Localization, URP, uGUI/TextMeshPro, AI Navigation, Timeline fehlen weiterhin: Code, der sie benutzt,
  erzeugt Compilerfehler (der Bericht markiert sie mit „diese Pakete fehlen im Harness“), abhängige Assemblies fallen als
  Folgefehler aus. Neue Pakete wie oben als Stub ergänzen. Stubs prüfen nur Namen und Typen, nicht das Verhalten.
- **Tests laufen auf .NET 8 (CoreCLR), nicht auf Unitys Mono**, ohne Player-Loop und ohne Unity-Main-Thread.
  Jeder Aufruf in die Engine (z. B. `Time.deltaTime`, `Debug.Log`, `new GameObject`) scheitert mit
  „ECall methods must be packaged…“; der Bericht markiert das als „braucht Unity“. `Awaitable`-Shim:
  `NextFrameAsync`/`FixedUpdateAsync`/`EndOfFrameAsync` sind sofort fertig, `WaitForSecondsAsync` wartet echt,
  doppeltes `await` und `GetResult()` vor Abschluss werfen (in Unity undefiniert).
- PlayMode-Tests mit Szenen, `[UnityTest]`, `LogAssert` und alles mit Serialisierung, Inspector, Assets,
  Szenen, IL2CPP/AOT-Stripping oder Plattform-Builds sind nur in Unity prüfbar.
- Gepatchte Member werfen außerhalb von Unity `NotSupportedException` – sie sind nur zum Kompilieren da.
- `versionDefines` werden gesetzt, wenn das Paket in `Packages/manifest.json` steht oder einen Harness-Stub hat und nicht per
  `--without-packages` ausgeschlossen ist (Versionsausdruck wird nicht ausgewertet). Wie in Unity gelten sie nur für die
  eigene asmdef und zählen für deren `defineConstraints`. Build-Profile-Defines (Unity 6) werden nicht gelesen → `--dev-defines`/`--define`.
- NUnit 3.5 im Kompat.-Build ist nur eine Annäherung an `com.unity.ext.nunit`.
- Der Regel-Lint ist textbasiert (kein Parser) und kann sich irren; jede Meldung nennt die Regel.
- Nicht zwei Läufe gleichzeitig starten (gemeinsamer `.cache/`).

## Aufbau

```
run_checks.sh                 Einstieg: Referenzen → Shims/Patches → Projekte → Build → Tests → Lint → Bericht
unity6_whitelist.txt          Unity-6-APIs (Fehlercode | Symbol | shim/patch/filter | Begründung)
nuget.config                  nur nuget.org
msbuild/                      gemeinsame Compiler-Einstellungen, Unity-Referenzen, Analyzer-Stufen
shims/                        Unity6Shims.Engine, Unity6Shims.Editor, UnityTestRunnerShims (C#)
packages/                     Signatur-Stubs von Unity-Paketen (Unity.InputSystem, Unity.Cinemachine) + packages.json
                              (auch NuGet-Pakete mit echter DLL, z. B. Newtonsoft.Json)
patches/Unity6Patches/        Unity-6-Member-Deklarationen + Obsolete-Markierungen
tools/UnityRefs/              lädt die Referenz-DLLs per NuGet (Restore-only)
tools/RefPatcher/             Mono.Cecil-Werkzeug: Patches in die Referenzen einfügen, Attribut-Konstruktoren entschärfen
tools/RefProbe/               Prüfhilfe: Typen/Member in Referenz-DLLs suchen
scripts/unity_project.py      asmdef-/Skript-Erkennung wie Unity
scripts/gen_projects.py       erzeugt je asmdef und Durchlauf ein .csproj + build.sln (.work/<projekt>/)
scripts/lint.py, csharp_text.py   Regel-Lint
scripts/degrade_tests.py      Tests ohne ungenutzte, fehlgeschlagene Referenzen erneut bauen
scripts/report.py             Logs/TRX/Lint auswerten, Whitelist anwenden, Zusammenfassung, Exit-Code
scripts/selftest_check.py     Erwartungen aus selftest/expectations.json prüfen
selftest/clean, selftest/faulty   Mini-Unity-Projekte (MonoBehaviour, reine Klasse, NUnit-Tests; absichtliche Fehler)
.cache/ .work/                erzeugt (Referenzen, Shims, Projekte, Logs, summary.txt)
```

Die `Directory.Build.*`-/`Directory.Packages.props`-Dateien in `shims/`, `patches/`, `tools/` und `.work/`
sind leere Sperren: Sie verhindern, dass Dateien in übergeordneten Ordnern die Harness-Projekte verändern.
Andere Dateien im Wurzelordner (z. B. `Core/`, `EditMode/`, `UnityStubs/`, das dortige `Directory.Build.props`)
gehören **nicht** zum Harness.
