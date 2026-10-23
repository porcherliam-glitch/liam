using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace DeadZone.EditorTools
{
    /// <summary>Builds a standalone game (Windows or macOS) into a folder on the desktop.</summary>
    public static class BuildTool
    {
        [MenuItem("Dead Zone/Windows-Spiel bauen", priority = 20)]
        public static void BuildWindowsMenu()
        {
            string dir = ProjectSetup.DesktopFolder("Dead Zone Spiel");
            if (Build(BuildTarget.StandaloneWindows64, dir, "DeadZone.exe")) EditorUtility.RevealInFinder(Path.Combine(dir, "DeadZone.exe"));
        }

        [MenuItem("Dead Zone/Mac-Spiel bauen", priority = 21)]
        public static void BuildMacMenu()
        {
            string dir = ProjectSetup.DesktopFolder("Dead Zone Spiel Mac");
            if (Build(BuildTarget.StandaloneOSX, dir, "DeadZone.app")) EditorUtility.RevealInFinder(Path.Combine(dir, "DeadZone.app"));
        }

        /// <summary>Batchmode: -executeMethod DeadZone.EditorTools.BuildTool.RunBatch [-buildFolder &lt;dir&gt;] [-dzTarget mac]</summary>
        public static void RunBatch()
        {
            var args = Environment.GetCommandLineArgs();
            string dir = null, target = "win";
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-buildFolder") dir = args[i + 1];
                if (args[i] == "-dzTarget") target = args[i + 1];
            }
            bool mac = target == "mac" || target == "osx";
            dir = dir ?? ProjectSetup.DesktopFolder(mac ? "Dead Zone Spiel Mac" : "Dead Zone Spiel");
            bool ok = Build(mac ? BuildTarget.StandaloneOSX : BuildTarget.StandaloneWindows64, dir, mac ? "DeadZone.app" : "DeadZone.exe");
            EditorApplication.Exit(ok ? 0 : 1);
        }

        public static bool Build(BuildTarget target, string dir, string file)
        {
            if (!ProjectSetup.Setup(false)) { Debug.LogError("[DZ] Build abgebrochen: Projekt-Einrichtung wurde abgebrochen."); return false; }
            Directory.CreateDirectory(dir);
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ProjectSetup.ScenePath },
                locationPathName = Path.Combine(dir, file),
                target = target,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            bool ok = report.summary.result == BuildResult.Succeeded;
            Debug.Log("[DZ] Build " + (ok ? "erfolgreich: " : "fehlgeschlagen: ") + opts.locationPathName + " (" + report.summary.totalErrors + " Fehler)");
            return ok;
        }
    }
}
