using System;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Builds the playable Windows version of the mini slice (Windows x64, Mono, scenes Boot → Eichental → Gruft; the test
    /// ground stays out) into a folder outside the repository, by default <c>Desktop\Aetherfall Spiel</c>, and writes a short
    /// German "So spielst du.txt" next to the game. Menu "Aetherfall > Windows-Spiel bauen" or batch
    /// <c>-executeMethod Aetherfall.EditorTools.Core.WindowsBuild.RunBatch [-buildFolder &lt;Ordner&gt;]</c>.
    /// </summary>
    public static class WindowsBuild
    {
        /// <summary>Name of the game executable.</summary>
        public const string ExecutableName = "Aetherfall.exe";

        /// <summary>Scenes of the build in this order (the first one starts).</summary>
        public static readonly string[] Scenes =
        {
            "Assets/_Project/Scenes/Boot/Boot.unity",
            "Assets/_Project/Scenes/World/Eichental.unity",
            "Assets/_Project/Scenes/Dungeons/Gruft.unity"
        };

        /// <summary>Default target folder: "Aetherfall Spiel" on the desktop of the current user.</summary>
        public static string DefaultFolder => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Aetherfall Spiel");

        [MenuItem("Aetherfall/Windows-Spiel bauen", priority = 300)]
        private static void BuildFromMenu()
        {
            BuildReport report = Build(DefaultFolder);
            if (report.summary.result == BuildResult.Succeeded)
            {
                EditorUtility.RevealInFinder(Path.Combine(DefaultFolder, ExecutableName));
            }
        }

        /// <summary>Batch entry point; exit code 0 if the build succeeded.</summary>
        public static void RunBatch()
        {
            string folder = DefaultFolder;
            string[] args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, "-buildFolder");
            if (index >= 0 && index + 1 < args.Length)
            {
                folder = args[index + 1];
            }

            BuildReport report = Build(folder);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        /// <summary>Builds the game into <paramref name="folder"/>.</summary>
        /// <param name="folder">Target folder (created; old game files are replaced).</param>
        /// <returns>The build report.</returns>
        public static BuildReport Build(string folder)
        {
            foreach (string scene in Scenes)
            {
                if (!File.Exists(scene))
                {
                    Debug.LogError("[Windows-Build] Szene fehlt: " + scene + " (Generatoren ausführen).");
                }
            }

            Directory.CreateDirectory(folder);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = true;
            var options = new BuildPlayerOptions
            {
                scenes = Scenes,
                locationPathName = Path.Combine(folder, ExecutableName),
                target = BuildTarget.StandaloneWindows64,
                targetGroup = BuildTargetGroup.Standalone,
                options = BuildOptions.None
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;
            Debug.Log("[Windows-Build] " + summary.result + ": " + options.locationPathName + ", " + (summary.totalSize / (1024f * 1024f)).ToString("0") +
                      " MB, " + summary.totalTime.TotalSeconds.ToString("0") + " s, " + summary.totalErrors + " Fehler, " + summary.totalWarnings + " Warnungen.");
            if (summary.result == BuildResult.Succeeded)
            {
                File.WriteAllText(Path.Combine(folder, "So spielst du.txt"), Guide(), new UTF8Encoding(false));

                // Debug data for crash reports only; not needed to play (keeps the folder simple for the player).
                string backup = Path.Combine(folder, Path.GetFileNameWithoutExtension(ExecutableName) + "_BackUpThisFolder_ButDontShipItWithYourGame");
                if (Directory.Exists(backup))
                {
                    Directory.Delete(backup, true);
                }
            }

            return report;
        }

        private static string Guide()
        {
            return "Chroniken von Aetherfall – Mini-Slice (Version " + PlayerSettings.bundleVersion + ", gebaut " + DateTime.Now.ToString("yyyy-MM-dd HH:mm") +
                   ")\r\n\r\n" +
                   "Starten: Doppelklick auf Aetherfall.exe. Im Hauptmenü \"Neues Spiel\", dann die Klasse wählen:\r\n" +
                   "  Krieger – Schwert und Schild, viel Leben, Nahkampf.\r\n" +
                   "  Magier  – Lehrlingsstab: linke Maus Feuergeschosse (25 m), rechte Maus Feuerball; wenig Leben, viel Mana.\r\n" +
                   "           Zauber auf den Tasten 1–3: Feuerball (explodiert, Brennen), Eislanze (durchbohrt, Frieren),\r\n" +
                   "           Kettenblitz (springt auf 3 Gegner). Die übrigen 6 Zauber lernst du im Skill-Baum (K).\r\n" +
                   "Beenden: Esc, dann \"Spiel beenden\" gedrückt halten (oder Alt+F4).\r\n" +
                   "Dauer: etwa 45–60 Minuten (3 Quests: Asche über Eichental, Die Wölfe vom Nordhang, Die vergessene Gruft).\r\n\r\n" +
                   "Tasten:\r\n" +
                   "  W A S D        laufen          Maus           umsehen\r\n" +
                   "  Umschalt       sprinten        C              schleichen\r\n" +
                   "  Leertaste      springen        E              sprechen, benutzen\r\n" +
                   "  Linke Maus     leichter Angriff  Rechte Maus  schwerer Angriff\r\n" +
                   "  Q (halten)     blocken         Strg           ausweichen\r\n" +
                   "  T              Gegner anvisieren\r\n" +
                   "  F              Bogen ziehen / wegstecken. Mit Bogen: rechte Maus zielen, linke Maus halten = spannen,\r\n" +
                   "                 loslassen = schießen; linke Maus ohne Zielen = schneller Hüftschuss;\r\n" +
                   "                 Mausrad = Pfeilart wechseln (Holzpfeil, Feuerpfeil). Jeder 2. Holzpfeil bleibt liegen (E)\r\n" +
                   "  5 / 6          Heiltrank / Manatrank trinken (knapp 1 s, ein harter Treffer bricht ab)\r\n" +
                   "  1 2 3 4        Fähigkeiten der aktiven Leiste (unten rechts, Name über dem Feld, Zahl = Sekunden warten)\r\n" +
                   "  4              Aether-Stoß (ab dem Riss im Prolog; 15 Mana, 8 s warten)\r\n" +
                   "  X              zweite Fähigkeitenleiste (2 × 4 Plätze)\r\n" +
                   "  Tab            Inventar        J              Questlog\r\n" +
                   "  K              Skill-Baum: je Stufe 1 Skillpunkt. Enter lernt, F nimmt zurück (solange die Seite offen ist),\r\n" +
                   "                 Z / C legt eine gelernte Fähigkeit auf einen anderen Platz der Leiste\r\n" +
                   "  F5 / F9        schnell speichern / laden\r\n" +
                   "  Esc            Pause und Menü\r\n" +
                   "  Im Gespräch: 1–9 oder Maus wählen, E oder Leertaste weiter.\r\n" +
                   "  Zwischensequenz überspringen: Leertaste (Gamepad: A) 1 Sekunde gedrückt halten.\r\n\r\n" +
                   "Händler: Tobold (Schmied) und Ulf (Wirt) in Lindenhain – im Gespräch nach den Waren fragen.\r\n" +
                   "Waffen: Tobold verkauft Streitkolben (3 wuchtige Schläge, Schild erlaubt), Jagdbögen und Pfeile.\r\n" +
                   "Krieger-Techniken (Skill-Baum): Wirbelklinge, Schildschlag (nur mit Schild), Spott, Kriegsschrei, Fußfeger –" +
                   " sie kosten Ausdauer statt Mana.\r\n" +
                   "Bogen: In \"Die Wölfe vom Nordhang\" leiht dir Hollmann seinen Jagdbogen und 30 Pfeile – triff die Strohziele.\r\n" +
                   "Feuer: Drei Feuertreffer setzen ein Ziel in Brand (2 % Leben je Sekunde, er flieht). Die Ölfässer an Tobolds Schmiede\r\n" +
                   "  explodieren bei Feuer (3 m) und reißen das nächste Fass mit; ein Schlag zerbricht sie zu einer Ölpfütze.\r\n" +
                   "  Unten links steht, was dich gerade plagt (Brennen, Betäubt) und wie viel Aether-Verderbnis du trägst.\r\n" +
                   "Würfeln: Ulf fragen \"Würfeln wir eine Runde?\" (Krähenwurf, die Regeln stehen im Fenster).\r\n" +
                   "Begleiterin: Nach \"Die Wölfe vom Nordhang\" wartet Ser Maren am Wachposten von Lindenhain und kommt mit.\r\n\r\n" +
                   "Gamepad (Xbox): A springen und benutzen, X/Y angreifen, B ausweichen, LB blocken, LT/RT mit Bogen zielen/schießen, Start Pause.\r\n\r\n" +
                   "Spielstände und Protokoll: %USERPROFILE%\\AppData\\LocalLow\\" + PlayerSettings.companyName + "\\" + PlayerSettings.productName + "\\\r\n" +
                   "Bei Problemen die Datei Player.log aus diesem Ordner an Claude schicken.\r\n";
        }
    }
}
