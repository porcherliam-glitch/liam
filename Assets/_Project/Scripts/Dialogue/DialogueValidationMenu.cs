#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Menu "Aetherfall > Dialoge pruefen" (German menu text): validates every <see cref="DialogueDefinition"/> of the project
    /// with <see cref="DialogueValidator"/> (speakers against all NPC definitions, jumps against all dialogues), writes every
    /// finding to the Console (click = select the asset) and shows a summary. <see cref="RunBatch"/> is the batch mode entry
    /// point: <c>Unity -batchmode -nographics -projectPath . -executeMethod Aetherfall.Dialogue.DialogueValidationMenu.RunBatch
    /// -logFile Logs/dialoge.log</c> (exit code 1 if there is an error).
    /// </summary>
    /// <remarks>
    /// Deviation from architecture 3.1 (editor code only in <c>Scripts/Editor/&lt;Bereich&gt;/</c>): this step may not change the
    /// references of <c>Aetherfall.EditorTools.Narrative</c>, so the menu lives in the dialogue assembly inside
    /// <c>#if UNITY_EDITOR</c>. The integration step moves it to <c>Scripts/Editor/Narrative/</c> (guide 10, section
    /// "Integration").
    /// </remarks>
    public static class DialogueValidationMenu
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Dialoge prüfen";

        private const string Prefix = "[Dialoge prüfen] ";

        /// <summary>Runs the validation, logs the findings and shows the summary.</summary>
        [MenuItem(MenuPath, false, 31)]
        public static void ValidateAll()
        {
            ValidationReport report = Run(out int count, out Dictionary<string, string> paths);
            string summary = LogResult(report, count, paths);
            if (!Application.isBatchMode)
            {
                EditorUtility.DisplayDialog("Dialoge prüfen", summary + "\n\nDie einzelnen Meldungen stehen in der Console (Window > General > Console).", "OK");
            }
        }

        /// <summary>Batch mode entry point: validates, logs and exits Unity with 0 (no errors) or 1 (errors).</summary>
        public static void RunBatch()
        {
            int exitCode = 1;
            try
            {
                ValidationReport report = Run(out int count, out Dictionary<string, string> paths);
                LogResult(report, count, paths);
                exitCode = report.HasErrors ? 1 : 0;
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

        /// <summary>Validates all dialogue assets of the project.</summary>
        /// <param name="count">Number of dialogues.</param>
        /// <param name="paths">Asset path by dialogue id.</param>
        public static ValidationReport Run(out int count, out Dictionary<string, string> paths)
        {
            var specs = new List<DialogueSpec>();
            var npcIds = new List<string>();
            paths = new Dictionary<string, string>(StringComparer.Ordinal);
            string[] guids = AssetDatabase.FindAssets("t:ScriptableObject", new[] { "Assets" });
            for (int i = 0; i < guids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                if (!path.EndsWith(".asset", StringComparison.Ordinal))
                {
                    continue;
                }

                var definition = AssetDatabase.LoadAssetAtPath<GameDefinition>(path);
                if (definition is DialogueDefinition dialogue)
                {
                    DialogueSpec spec = dialogue.CreateSpec();
                    specs.Add(spec);
                    if (!paths.ContainsKey(spec.Id))
                    {
                        paths.Add(spec.Id, path);
                    }
                }
                else if (definition != null && definition.Id.StartsWith(DialogueIds.NpcPrefix, StringComparison.Ordinal))
                {
                    npcIds.Add(definition.Id);
                }
            }

            count = specs.Count;
            var lookup = new DialogueValidationLookup(DialogueCatalog.FromSpecs(specs.ToArray()), npcIds.Count > 0 ? npcIds : null);
            return new DialogueValidator(lookup).Validate(specs);
        }

        private static string LogResult(ValidationReport report, int count, Dictionary<string, string> paths)
        {
            IReadOnlyList<ValidationIssue> issues = report.Issues;
            for (int i = 0; i < issues.Count; i++)
            {
                string line = Prefix + issues[i];
                UnityEngine.Object context = AssetOf(issues[i].Location, paths);
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

            string summary = count + " Dialog(e) geprüft: " + report.ErrorCount + " Fehler, " + report.WarningCount + " Warnung(en).";
            if (report.HasErrors)
            {
                Debug.LogError(Prefix + summary);
            }
            else
            {
                Debug.Log(Prefix + summary);
            }

            return summary;
        }

        private static UnityEngine.Object AssetOf(string location, Dictionary<string, string> paths)
        {
            if (string.IsNullOrEmpty(location))
            {
                return null;
            }

            int separator = location.IndexOf(" / ", StringComparison.Ordinal);
            string id = separator >= 0 ? location.Substring(0, separator) : location;
            return paths.TryGetValue(id, out string path) ? AssetDatabase.LoadMainAssetAtPath(path) : null;
        }
    }
}
#endif
