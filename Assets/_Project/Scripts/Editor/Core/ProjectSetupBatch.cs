using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using Debug = UnityEngine.Debug;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Batch-mode entry point of the project setup (same steps as the "Alles ausführen" button of
    /// <see cref="ProjectSetupWindow"/>): b) settings, c) folders, d) template cleanup, e) boot content, f) checks and
    /// then a) packages. Every confirmation is accepted (<see cref="SetupDialogs"/>).
    /// </summary>
    /// <remarks>
    /// Call: <c>Unity.exe -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.Core.ProjectSetupBatch.RunBatch -logFile Logs\setup.log</c>
    /// (without <c>-quit</c>; the method exits Unity itself). The package requests are waited for synchronously, which is
    /// fine in batch mode. Unity resolves and compiles the new packages on the next start, so run the setup a second
    /// time afterwards: on a finished project every step changes nothing. Exit code 0 = no errors, 1 = errors.
    /// </remarks>
    public static class ProjectSetupBatch
    {
        private const double PackageTimeoutSeconds = 15.0 * 60.0;

        /// <summary>Runs all setup steps and exits Unity.</summary>
        public static void RunBatch()
        {
            var log = new SetupLog();
            int errors = 0;
            try
            {
                log.Info("=== Projekt-Setup im Batchmode ===");
                SetupStep[] order =
                {
                    new ProjectSettingsSetupStep(), new FolderSetupStep(), new TemplateCleanupStep(), new BootContentSetupStep(), new ProjectChecksStep()
                };
                for (int i = 0; i < order.Length; i++)
                {
                    errors += RunStep(order[i], log);
                }

                errors += RunPackages(log);
                AssetDatabase.SaveAssets();
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                errors++;
            }

            log.Info("=== Projekt-Setup beendet, " + errors + " Fehler ===");
            EditorApplication.Exit(errors == 0 ? 0 : 1);
        }

        private static int RunStep(SetupStep step, SetupLog log)
        {
            log.Info("— Schritt " + step.Letter + ") " + step.Title + " —");
            try
            {
                step.Refresh();
                step.Run(log);
                step.Refresh();

                // The checks step writes its own results; the other steps only log what they changed.
                for (int i = 0; !(step is ProjectChecksStep) && i < step.Items.Count; i++)
                {
                    SetupCheckItem item = step.Items[i];
                    log.Info(step.Letter + ") " + SetupStatuses.Symbol(item.Status) + " " + item.Label + (item.Detail.Length > 0 ? " – " + item.Detail : string.Empty));
                }

                return 0;
            }
            catch (Exception exception)
            {
                log.Error("Schritt " + step.Letter + ") abgebrochen: " + exception.GetType().Name + ": " + exception.Message);
                Debug.LogException(exception);
                return 1;
            }
        }

        private static int RunPackages(SetupLog log)
        {
            log.Info("— Schritt a) Pakete installieren —");
            ListRequest list = Client.List(true, true);
            if (!Wait(list) || list.Status != StatusCode.Success)
            {
                log.Error("a) Paketliste konnte nicht gelesen werden: " + (list.Error != null ? list.Error.message : "Zeitüberschreitung"));
                return 1;
            }

            var installed = new List<InstalledPackage>();
            foreach (UnityEditor.PackageManager.PackageInfo info in list.Result)
            {
                installed.Add(new InstalledPackage(info.name, info.version, info.isDirectDependency));
            }

            PackagePlan plan = PackagePlanner.CreatePlan(installed, PackageCatalog.CreateRequiredPackages(), PackageCatalog.CreateRemovablePackages(), true);
            for (int i = 0; i < plan.Notes.Count; i++)
            {
                log.Info("a) " + plan.Notes[i]);
            }

            var toAdd = new List<string>(plan.PackagesToAdd);
            var toRemove = new List<string>(plan.PackagesToRemove);
            if (toAdd.Count == 0 && toRemove.Count == 0)
            {
                log.Info("a) Alle Pakete sind bereits eingerichtet. Nichts zu tun.");
                return 0;
            }

            log.Info("a) Installiere: " + string.Join(", ", toAdd) + " · Entferne: " + string.Join(", ", toRemove));
            AddAndRemoveRequest change = Client.AddAndRemove(toAdd.Count > 0 ? toAdd.ToArray() : null, toRemove.Count > 0 ? toRemove.ToArray() : null);
            if (!Wait(change) || change.Status != StatusCode.Success)
            {
                log.Error("a) Paketänderung fehlgeschlagen: " + (change.Error != null ? change.Error.message : "Zeitüberschreitung"));
                return 1;
            }

            log.Info("a) Package Manager fertig. Unity kompiliert die neuen Pakete beim nächsten Start; Setup danach noch einmal ausführen.");
            return 0;
        }

        private static bool Wait(Request request)
        {
            Stopwatch watch = Stopwatch.StartNew();
            while (!request.IsCompleted)
            {
                if (watch.Elapsed.TotalSeconds > PackageTimeoutSeconds)
                {
                    return false;
                }

                Thread.Sleep(100);
            }

            return true;
        }
    }
}
