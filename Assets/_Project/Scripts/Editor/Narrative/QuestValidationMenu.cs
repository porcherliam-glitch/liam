using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Quests;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Menu "Aetherfall > Quests pruefen" (German menu text): validates every <see cref="QuestDefinition"/> of the project with
    /// the rules of GDD 02 10.2 (<see cref="QuestValidator"/>), writes a summary and every finding to the Console and opens the
    /// result window. <see cref="RunBatch"/> is the batch mode entry point for Claude and CI:
    /// <c>Unity -batchmode -nographics -projectPath . -executeMethod Aetherfall.EditorTools.Narrative.QuestValidationMenu.RunBatch -logFile Logs/quests.log</c>
    /// (exit code 1 if there is an error).
    /// </summary>
    public static class QuestValidationMenu
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Quests prüfen";

        /// <summary>Runs the validation and shows the window.</summary>
        [MenuItem(MenuPath, false, 30)]
        public static void ValidateAll()
        {
            QuestValidationResult result = Run();
            LogResult(result);
            QuestValidationWindow.ShowResult(result);
        }

        /// <summary>Batch mode entry point: validates, logs and exits Unity with 0 (no errors) or 1 (errors).</summary>
        public static void RunBatch()
        {
            int exitCode = 1;
            try
            {
                QuestValidationResult result = Run();
                LogResult(result);
                exitCode = result.Report.HasErrors ? 1 : 0;
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }

            if (Application.isBatchMode)
            {
                EditorApplication.Exit(exitCode);
            }
        }

        /// <summary>Validates all quest assets of the project.</summary>
        public static QuestValidationResult Run()
        {
            List<KeyValuePair<string, QuestDefinition>> assets = QuestAssetScanner.FindQuests();
            QuestValidationLookup lookup = QuestAssetScanner.BuildLookup(out bool flagCheckSkipped);
            var specs = new List<QuestSpec>(assets.Count);
            var paths = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 0; i < assets.Count; i++)
            {
                QuestSpec spec = assets[i].Value.CreateSpec();
                specs.Add(spec);
                if (!paths.ContainsKey(spec.Id))
                {
                    paths.Add(spec.Id, assets[i].Key);
                }
            }

            ValidationReport report = new QuestValidator(lookup).Validate(specs);
            var result = new QuestValidationResult(report, paths, specs.Count, flagCheckSkipped);
            result.Specs.AddRange(specs);
            return result;
        }

        private static void LogResult(QuestValidationResult result)
        {
            IReadOnlyList<ValidationIssue> issues = result.Report.Issues;
            for (int i = 0; i < issues.Count; i++)
            {
                string line = "[Quests prüfen] " + issues[i];
                string path = result.AssetPathOf(issues[i]);
                UnityEngine.Object context = path.Length > 0 ? AssetDatabase.LoadMainAssetAtPath(path) : null;
                switch (issues[i].Severity)
                {
                    case ValidationSeverity.Error:
                        Debug.LogError(line, context);
                        break;
                    case ValidationSeverity.Warning:
                        Debug.LogWarning(line, context);
                        break;
                    default:
                        Debug.Log(line, context);
                        break;
                }
            }

            string summary = "[Quests prüfen] " + result.Summary;
            if (result.Report.HasErrors)
            {
                Debug.LogError(summary);
            }
            else
            {
                Debug.Log(summary);
            }
        }
    }
}
